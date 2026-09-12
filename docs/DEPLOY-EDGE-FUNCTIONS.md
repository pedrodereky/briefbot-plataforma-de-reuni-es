# Publicação das edge functions

Roteiro para publicar as 17 edge functions. Serve tanto para seguir passo a
passo quanto para copiar como pedido a quem executa o deploy — o bloco no fim
está pronto para colar.

**A origem é a `main`.** A primeira versão deste documento apontava para uma
branch de trabalho, e o deploy foi recusado porque a ferramenta da Lovable
publica a partir da `main` e não enxergava aquela branch. O código já está
mesclado; não há mais branch a citar.

Duas coisas aqui não são óbvias e derrubam o deploy quando passam despercebidas:
a pasta `_shared/` e a configuração de `verify_jwt`. Ambas estão detalhadas
abaixo.

---

## Como saber se este deploy está pendente

O sintoma mais visível é o aviso **"Configuração de autenticação — Não foi
possível validar o trigger de auth"**, que aparece uma vez por sessão.

Vale ler a mensagem com atenção, porque o código tem duas diferentes:

| Mensagem | O que significa |
|---|---|
| "Não foi possível **validar** o trigger de auth" | A chamada à function falhou. Ela não chegou a olhar o banco |
| "Trigger de auth **ausente**" | A chamada funcionou e reportou o trigger faltando |

A primeira é sobre deploy, não sobre banco. Para confirmar que o banco está
bem, no SQL Editor:

```sql
select tgname, tgenabled
  from pg_trigger
 where tgname = 'on_auth_user_created'
   and not tgisinternal;
```

Uma linha com `tgenabled = O` (a letra O, de *origin*) significa gatilho
instalado e ativo — e então o aviso é só sintoma do deploy pendente.

**Não é só o aviso.** As chamadas de edge function são o mesmo caminho para
gerar briefing, gerar ata, pegar token do LiveKit e testar as chaves de API em
Configurações. Se uma delas falha por deploy desatualizado, todas falham.

Duas causas produzem exatamente esse sintoma, e só o console do navegador
(F12) as separa:

| No console | Causa |
|---|---|
| "blocked by CORS policy", "Access-Control-Allow-Origin" | `ALLOWED_ORIGINS` sem a origem de onde o app foi aberto |
| 500, "worker boot error", "module not found" | Functions não republicadas — provavelmente sem a pasta `_shared/` |
| 401 / 403 | JWT; menos provável |

---

## Ordem em relação ao banco

As migrations e o código das functions formam um par. Aplicar um sem o outro
deixa o app num estado inconsistente:

| Estado | Efeito |
|---|---|
| SQL aplicado, código antigo no ar | A entrada de convidado (`/join/:id`) falha: o banco passou a exigir `join_token` e o código antigo não envia |
| Código novo no ar, SQL não aplicado | As functions chamam `verify_join_token`, que ainda não existe |

As migrations já foram aplicadas em produção. Falta o par do outro lado.

---

## O que publicar

Todas as 17 functions:

```
cron-check-meetings    deepgram-token        delete-api-key
detect-action-items    end-meeting           ensure-auth-trigger
generate-briefing      generate-insights     generate-summary
livekit-token          livekit-webhook       manage-recording
send-invite            send-reminder         send-slack
store-api-key          validate-api-key
```

### A pasta `_shared/`

`supabase/functions/_shared/` tem quatro arquivos:

- `auth.ts` — autorização (dono da reunião, service key, convidado por token)
- `http.ts` — CORS e helpers de resposta
- `sanitize.ts` — higienização de entrada e comparação em tempo constante
- `action-items.ts` — interpretação dos action items da IA

**Toda function importa dela.** Num deploy feito função a função, se essa pasta
não subir junto, as 17 falham em tempo de execução por import quebrado — um
estado pior do que o anterior ao deploy, e a causa mais provável do sintoma
descrito acima.

### `verify_jwt` por função

`supabase/config.toml` declara `verify_jwt` para cada function. Cinco **precisam
continuar aceitando requisição sem JWT**:

| Function | Por quê |
|---|---|
| `livekit-webhook` | A assinatura do LiveKit viaja no header `Authorization`. Com `verify_jwt = true` o gateway rejeita antes da função rodar — foi uma das causas de o webhook nunca ter funcionado |
| `livekit-token` | Convidado sem conta entra pela rota `/join`. A autorização acontece dentro da função, pelo `join_token` |
| `deepgram-token` | Transcrição do convidado, mesma lógica |
| `cron-check-meetings` | Chamada server-to-server pelo `pg_cron`, autenticada por `x-cron-secret` |
| `send-reminder` | Idem |

As outras 12 ficam com `verify_jwt = true`.

Se a ferramenta de deploy não ler o `config.toml` automaticamente, use
`--no-verify-jwt` nessas cinco. **Este erro é silencioso:** o deploy conclui com
sucesso e as funções simplesmente param de ser alcançadas.

---

## Variáveis de ambiente

### `ALLOWED_ORIGINS` — revisar, não só definir

Precisa listar **todas** as origens de onde o app é aberto, separadas por
vírgula — inclusive as URLs de preview da Lovable, que são domínios diferentes
do de produção:

```
https://briefbot.lovable.app,https://id-preview--<PROJECT_ID>.lovable.app,https://<PROJECT_ID>.lovableproject.com
```

Uma origem fora da lista tem o mesmo efeito de uma function quebrada: o
`corsHeaders` devolve uma origem diferente de propósito e o navegador bloqueia
a resposta no cliente. Configurar a variável com a lista incompleta é pior do
que não configurar.

Sem a variável, o CORS segue liberado para qualquer origem — o app funciona,
mas sem a proteção, e cada requisição registra um aviso no log.

### `CRON_SECRET`

String aleatória, **igual** ao valor gravado em `public.app_config`. Sem ela o
cron continua funcionando pela service key.

### Opcionais — só para gravação de reunião

`RECORDING_S3_BUCKET`, `RECORDING_S3_REGION`, `RECORDING_S3_ACCESS_KEY`,
`RECORDING_S3_SECRET` e, para S3-compatível, `RECORDING_S3_ENDPOINT`.

Sem elas a gravação é recusada com mensagem explícita, em vez de gravar para
lugar nenhum. O resto do app funciona normalmente.

### Inalteradas

`LOVABLE_API_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `APP_URL`.

---

## Conferência depois do deploy

1. **Recarregar o app.** O aviso "Configuração de autenticação" deve sumir.
2. **Configurações → API Keys → "Testar conexão".** Deve responder, não falhar.
   É o teste mais rápido de que as functions voltaram.
3. **Abrir um link de convite novo e entrar como convidado.** É o fluxo que
   depende do `join_token` e prova que banco e código estão em sincronia.
4. **Entrar numa reunião e ver o status virar `live` sozinho** — confirma que o
   webhook do LiveKit chega e é verificado com as chaves certas.
5. Se `ALLOWED_ORIGINS` foi configurada, confirmar nos logs que o aviso
   "ALLOWED_ORIGINS não configurada" parou de aparecer.

---

## Texto pronto para pedir o deploy

```
Preciso publicar as edge functions do BriefBot a partir da branch main.

CONTEXTO — SINTOMA ATUAL
O app em produção mostra o aviso "Configuração de autenticação — Não foi
possível validar o trigger de auth" a cada sessão. Já verifiquei no banco:
o trigger on_auth_user_created existe e está ativo (tgenabled = O). O que
falha é a CHAMADA à function ensure-auth-trigger, que não responde com
sucesso. Isso indica que as functions publicadas estão desatualizadas em
relação ao código da main — provavelmente nunca subiram depois que a pasta
_shared/ foi criada.

Se for esse o caso, NÃO é só esse aviso: todas as chamadas de edge function
estão quebradas (gerar briefing, gerar ata, token do LiveKit, teste das
chaves de API).

O QUE PUBLICAR
As 17 edge functions, TODAS:

  cron-check-meetings    deepgram-token        delete-api-key
  detect-action-items    end-meeting           ensure-auth-trigger
  generate-briefing      generate-insights     generate-summary
  livekit-token          livekit-webhook       manage-recording
  send-invite            send-reminder         send-slack
  store-api-key          validate-api-key

ATENÇÃO à pasta supabase/functions/_shared/, com 4 arquivos:

  auth.ts           autorização (dono da reunião, service key, convidado)
  http.ts           CORS e helpers de resposta
  sanitize.ts       higienização de entrada e comparação em tempo constante
  action-items.ts   interpretação dos action items da IA

TODA function importa dela. Num deploy feito função a função, se essa pasta
não subir junto, as 17 falham em tempo de execução por import quebrado.
Esta é a causa mais provável do problema atual.

CONFIGURAÇÃO DE JWT — NÃO DEIXAR NO PADRÃO
supabase/config.toml declara verify_jwt por função. Cinco PRECISAM continuar
aceitando requisição sem JWT:

  livekit-webhook       a assinatura do LiveKit viaja no header
                        Authorization; com verify_jwt=true o gateway rejeita
                        antes da função rodar
  livekit-token         convidado sem conta entra pela rota /join
  deepgram-token        transcrição do convidado
  cron-check-meetings   chamada server-to-server pelo pg_cron
  send-reminder         idem

Se a ferramenta de deploy não ler o config.toml automaticamente, use
--no-verify-jwt nessas cinco. As outras 12 ficam com verify_jwt=true.
Este erro é silencioso: o deploy conclui com sucesso e as funções
simplesmente param de ser alcançadas.

VARIÁVEL ALLOWED_ORIGINS — REVISAR
Se ela já estiver configurada, precisa incluir TODAS as origens de onde o
app é aberto, inclusive as URLs de preview da Lovable. Origem fora da lista
faz o navegador bloquear a resposta, com o mesmo efeito de uma function
quebrada. Exemplo:

  https://briefbot.lovable.app,https://id-preview--<PROJECT_ID>.lovable.app,https://<PROJECT_ID>.lovableproject.com

Se não estiver configurada, o CORS segue liberado para qualquer origem: o
app funciona, mas sem essa proteção.

OUTRAS VARIÁVEIS
  CRON_SECRET   precisa ser IGUAL ao valor gravado em public.app_config

  Opcionais, só para gravação de reunião:
  RECORDING_S3_BUCKET, RECORDING_S3_REGION, RECORDING_S3_ACCESS_KEY,
  RECORDING_S3_SECRET e RECORDING_S3_ENDPOINT (para S3-compatível).
  Sem elas a gravação é recusada com mensagem explícita, em vez de gravar
  para lugar nenhum. O resto do app funciona normalmente.

  Inalteradas: LOVABLE_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY, APP_URL.

COMO CONFERIR DEPOIS
1. Recarregar o app: o aviso "Configuração de autenticação" deve sumir.
2. Configurações → API Keys → "Testar conexão": deve responder, não falhar.
3. Abrir um link de convite novo e entrar como convidado — é o fluxo que
   depende do join_token e prova que banco e código estão em sincronia.
4. Entrar numa reunião e ver o status virar "live" sozinho — confirma que o
   webhook do LiveKit chega e é verificado.
```
