# Publicação das edge functions

Roteiro para publicar as 17 edge functions. Serve tanto para seguir passo a
passo quanto para copiar como pedido a quem executa o deploy — o bloco no fim
está pronto para colar.

Duas coisas aqui não são óbvias e derrubam o deploy quando passam despercebidas:
a pasta `_shared/` e a configuração de `verify_jwt`. Ambas estão detalhadas
abaixo.

---

## Ordem em relação ao banco

As migrations e o código das functions formam um par. Aplicar um sem o outro
deixa o app num estado inconsistente:

| Estado | Efeito |
|---|---|
| SQL aplicado, código antigo no ar | A entrada de convidado (`/join/:id`) falha: o banco passou a exigir `join_token` e o código antigo não envia |
| Código novo no ar, SQL não aplicado | As functions chamam `verify_join_token`, que ainda não existe |

O caminho recomendado é aplicar as migrations e publicar as functions na mesma
janela. Se o SQL já foi aplicado, o deploy do código é urgente.

---

## O que publicar

Todas as 17 functions — nenhuma ficou sem alteração.

### A pasta `_shared/`

`supabase/functions/_shared/` é um diretório **novo**, com quatro arquivos:

- `auth.ts` — autorização (dono da reunião, service key, convidado por token)
- `http.ts` — CORS e helpers de resposta
- `sanitize.ts` — higienização de entrada e comparação em tempo constante
- `action-items.ts` — interpretação dos action items da IA

**Toda function importa dela.** Num deploy feito função a função, se essa pasta
não subir junto, as 17 falham em tempo de execução por import quebrado — um
estado pior do que o anterior ao deploy.

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

Configurar antes ou junto do deploy.

### Novas

| Variável | Efeito se não definida |
|---|---|
| `ALLOWED_ORIGINS` | CORS segue liberado para qualquer origem. O app funciona, mas sem a proteção. Aceita várias origens separadas por vírgula |
| `CRON_SECRET` | O cron continua funcionando pela service key. Precisa ser **igual** ao valor gravado em `public.app_config` |

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

1. **Abrir um link de convite novo e entrar como convidado.** É o fluxo que
   quebra quando o código está dessincronizado do banco, e o que prova que
   voltou.
2. **Logs de `livekit-webhook`:** não deve haver mais erro de assinatura
   inválida.
3. **Entrar numa reunião e ver o status virar `live` sozinho** — confirma que o
   webhook está chegando e sendo verificado com as chaves certas.
4. Se `ALLOWED_ORIGINS` foi configurada, confirmar nos logs que o aviso
   "ALLOWED_ORIGINS não configurada" parou de aparecer.

---

## Texto pronto para pedir o deploy

```
Preciso publicar as edge functions da branch:

    claude/verificacao-incompletude-estrategia-s47sde

CONTEXTO — POR QUE É URGENTE
As migrations desta branch JÁ FORAM APLICADAS no banco de produção. O
código publicado hoje é o anterior, e as duas partes estão fora de
sincronia: a entrada de convidado (/join/:id) está quebrada agora,
porque o banco passou a exigir um token de convite que o código antigo
não envia.

O QUE PUBLICAR
As 17 edge functions, TODAS — nenhuma ficou sem alteração.

ATENÇÃO à pasta nova supabase/functions/_shared/ (4 arquivos:
auth.ts, http.ts, sanitize.ts, action-items.ts). Toda function importa
dela. Se o deploy for feito função a função e essa pasta não subir
junto, todas falham em tempo de execução por import quebrado.

CONFIGURAÇÃO DE JWT — NÃO DEIXAR NO PADRÃO
supabase/config.toml agora declara verify_jwt por função. Cinco
PRECISAM continuar aceitando requisição sem JWT:

    livekit-webhook       (a assinatura do LiveKit viaja no header
                           Authorization; com verify_jwt=true o gateway
                           rejeita antes da função rodar)
    livekit-token         (convidado sem conta entra pela /join)
    deepgram-token        (transcrição do convidado)
    cron-check-meetings   (chamada server-to-server pelo pg_cron)
    send-reminder         (idem)

Se a ferramenta de deploy não ler o config.toml automaticamente, use
--no-verify-jwt nessas cinco. As outras 12 ficam com verify_jwt=true.

VARIÁVEIS DE AMBIENTE NOVAS
Configurar ANTES ou JUNTO do deploy:

    ALLOWED_ORIGINS   Origem(ns) do app, separadas por vírgula.
                      Ex.: https://briefbot.lovable.app
                      Sem ela o CORS continua liberado para qualquer
                      origem (funciona, mas sem proteção).

    CRON_SECRET       String aleatória. Precisa ser IGUAL ao valor
                      gravado em public.app_config no banco.

Opcionais, só se for usar gravação de reunião:

    RECORDING_S3_BUCKET, RECORDING_S3_REGION,
    RECORDING_S3_ACCESS_KEY, RECORDING_S3_SECRET
    RECORDING_S3_ENDPOINT (para S3-compatível)

    Sem elas a gravação é recusada com mensagem explícita, em vez de
    gravar para lugar nenhum. O resto do app funciona normalmente.

As já existentes (LOVABLE_API_KEY, SUPABASE_*) não mudam.

COMO CONFERIR DEPOIS
1. Abrir um link de convite novo e entrar como convidado — é o fluxo
   que está quebrado agora e o que prova que voltou.
2. Nos logs de livekit-webhook, confirmar que não há mais erro de
   assinatura inválida.
3. Entrar em uma reunião e ver o status mudar para "live" sozinho.
```
