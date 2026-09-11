# Auditoria de Incompletude — BriefBot

Data: 2026-09-11 · Base: `claude/verificacao-incompletude-estrategia-s47sde`

## Sumário executivo

O produto está **funcionalmente amplo e operacionalmente frágil**. Todas as 17 edge
functions estão escritas e ligadas ao frontend, o app compila (`tsc --noEmit` limpo) e
o build passa. As lacunas não estão em telas faltando — estão em **autorização**,
**schema não versionado** e **fluxos que terminam no vazio** (gravação, webhook,
calendário).

| Dimensão | Estado |
|---|---|
| Typecheck | ✅ limpo |
| Build | ✅ 12s (1.87 MB, sem code splitting) |
| Lint | ❌ 53 erros, 9 warnings |
| Testes unitários | ❌ 1 teste trivial (`expect(true).toBe(true)`) |
| Testes e2e | ❌ 0 specs; config Playwright quebrada |
| CI | ❌ inexistente |
| Migrations | ❌ diretório não existe |
| Autorização nas edge functions | ❌ 10 de 17 sem verificação de chamador |

---

## P0 — Crítico (segurança / perda de dados / custo)

### 1. Chave Deepgram entregue crua ao navegador
`supabase/functions/deepgram-token/index.ts:44` retorna `{ key: deepgramApiKey }` ao
cliente, e `src/hooks/useTranscription.ts:41` abre o WebSocket com ela.

Isso **viola a premissa explícita do próprio plano** do projeto
(`.lovable/plan.md`: *"O frontend nunca recebe o valor da key após envio"*). Qualquer
usuário autenticado extrai a chave Deepgram do dono da conta pelo DevTools e a usa
fora da plataforma. Pior: quando não há header de auth, a função cai no fallback
`Deno.env.get("DEEPGRAM_API_KEY")` — a chave **de plataforma** — e a devolve do mesmo
jeito.

### 2. IDOR em massa: 10 funções agem com `service_role` sem saber quem chamou
`end-meeting`, `manage-recording`, `detect-action-items`, `generate-insights`,
`generate-summary`, `generate-briefing`, `send-invite`, `send-slack`,
`send-reminder`, `cron-check-meetings` recebem `meeting_id` no body, carregam a
reunião com a service key e executam — **sem validar o JWT nem comparar
`meeting.user_id` com o chamador**.

Consequências concretas com apenas um UUID de reunião:
- encerrar reunião alheia ao vivo (`end-meeting`);
- iniciar/parar gravação na conta LiveKit de terceiro — **custo direto** (`manage-recording`);
- queimar créditos de IA em loop (`generate-*`, `detect-action-items`);
- **enviar e-mail em nome do domínio verificado do usuário** (`send-invite`) — vetor de phishing;
- postar no Slack da empresa alheia (`send-slack`).

### 3. Entrada de convidado sem nenhum controle de acesso
`livekit-token` gera token para qualquer `{ meeting_id, guest_name }`: sem token de
convite, sem checar `meeting_status` (dá para entrar em reunião já encerrada ou
futura), sem conferir a lista de `attendees`, sem TTL de link, sem sanitizar
`guest_name` (renderizado em `ParticipantList`/`TranscriptPanel`). O link `/join/:id`
é um passe permanente.

### 4. `config.toml` sem `verify_jwt` — e o webhook depende disso
`supabase/config.toml` tem **apenas** `project_id`. O README afirma haver
"per-function overrides"; não há nenhum.

`livekit-webhook` usa o header `Authorization` para a **assinatura do LiveKit**
(`receiver.receive(body, authHeader)`). Sem `verify_jwt = false` declarado, o gateway
do Supabase rejeita a requisição antes da função rodar — o webhook nunca executa.

### 5. Webhook valida assinatura com a chave errada
Mesmo resolvido o item 4, `livekit-webhook:16-21` instancia o `WebhookReceiver` com
`LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET` **de ambiente**, enquanto todo o resto do
sistema usa chaves **por usuário no Vault** (`get_user_secret`). Para qualquer cliente
que fez o onboarding com as próprias credenciais, a verificação falha sempre.

Impacto: `meeting_status` nunca vira `live`/`ended` por evento; resumo automático de
sala finalizada nunca dispara; a página de Gravações (que filtra por `ended`) fica
vazia. O fluxo só funciona quando o host clica manualmente em "encerrar".

### 6. CORS `*` em todas as 17 funções
Inclusive nas que aceitam `Authorization`. Combinado com o item 2, qualquer página na
internet chama essas funções.

### 7. `.env` versionado
O arquivo está no repositório e **não** está no `.gitignore`. Hoje contém só a chave
publishable, mas o padrão convida ao acidente.

---

## P1 — Funcionalidade incompleta

### 8. `supabase/migrations/` não existe
O README declara migrations como "fonte da verdade do schema" e, no procedimento de
fix manual, manda abrir `supabase/migrations/*_auth_user_settings_sync.sql` — **o
diretório inteiro está ausente**.

Consequências: o backend não é reproduzível a partir do repo; não há rollback, nem
review de mudança de schema, nem ambiente de staging possível. O `plan.md` contém o
SQL do Vault em bloco de código — documentação, não migration executável.

### 9. Gravação quebrada por drift de schema
`manage-recording` escreve `recording_egress_id` (linha 98) e `recording_url`
(linha 149); `RecordingTab` lê ambos. **Nenhuma das duas colunas existe** em
`meetings` segundo `src/integrations/supabase/types.ts:212-260`.

O `.update()` não tem o erro checado → falha silenciosa. `RecordingTab` usa
`data as any` (linha 16) exatamente para o TypeScript não denunciar. A gravação
"inicia", nada persiste, e a aba mostra para sempre "a gravação está sendo
processada".

### 10. Egress sem destino de armazenamento
`startRoomCompositeEgress(roomName, { file: { fileType: 0, filepath } })` não define
destino (S3/GCS/Azure). Sem isso o arquivo não é entregue a lugar nenhum
persistente. O fallback procura um bucket `recordings` no Supabase Storage onde
**nada jamais escreve**. O loop de gravação não fecha nem com o schema corrigido.

### 11. "Gravações" lista reuniões, não gravações
`RecordingsPage` consulta `meetings` com `meeting_status = 'ended'`. Toda reunião
encerrada aparece como se fosse gravação, mesmo sem nunca ter sido gravada.

### 12. Transcrição cobre só o microfone local
`useTranscription` transcreve o `MediaStream` do próprio participante. Não há
transcrição server-side da sala nem diarização: se um participante não abre a aba com
transcrição ativa, a fala dele **não existe** na ata. O resumo e os action items são
gerados sobre um registro estruturalmente incompleto.

Somam-se: `mimeType: 'audio/webm;codecs=opus'` fixo (quebra em Safari/iOS), sem
KeepAlive (Deepgram derruba conexão ociosa), sem reconexão, e o `insert` de cada
trecho final não tem retorno checado — perda silenciosa de transcrição.

### 13. Calendário sem calendário
`calendar_event_id` é preenchido com `crypto.randomUUID()`
(`CreateMeetingDialog.tsx:168`, `useCreateInstantMeeting.ts:25`). Não há integração
Google/Outlook, nem export `.ics`, nem detecção de conflito de horário — apesar do
nome do campo, da página `/calendar` e do cron de lembretes.

### 14. Cron não é versionado
O checklist do README pede "Cron `cron-check-meetings` agendado (~5 min)", mas não há
migration de `pg_cron`. Todo briefing pré-reunião e todo lembrete dependem de alguém
ter clicado no painel certo — sem registro no repositório.

### 15. Placeholder da Lovable em produção
`src/pages/Index.tsx` ainda é o blank page da Lovable ("Your app will live here!").
Está órfão (não roteado), mas é lixo que sugere projeto não finalizado.

---

## P2 — Qualidade de engenharia

### 16. Rede de segurança inexistente
- `src/test/example.test.ts` é o único teste: `expect(true).toBe(true)`.
- `playwright.config.ts` importa `lovable-agent-playwright-config`, que **não está em
  `package.json`** — o config não carrega. Zero specs e2e.
- Nenhum teste cobre `parseActionItems` (regex frágil de `[X] → [Y] → [Z]`), o parsing
  de datas, os hooks de realtime ou as edge functions.

### 17. Sem CI
Não existe `.github/`. Lint, typecheck, teste e build não rodam em nenhum push. Os 53
erros de lint são a prova de que nada trava.

### 18. Lint: 53 erros + 9 warnings
Maioria `no-explicit-any`, mas os 9 `react-hooks/exhaustive-deps` são risco real de
stale closure — notadamente `MeetingDetailPage.tsx:457` (`doGenerate`, `generating`
fora do array), que pode disparar geração de IA duplicada.

### 19. Bundle monolítico de 1.87 MB (523 kB gzip)
Sem code splitting: LiveKit, Recharts e react-markdown entram no chunk inicial. A tela
de **login** baixa a stack de videoconferência inteira.

### 20. Tipos duplicados e já divergentes
`src/types/database.ts` (manual) convive com `src/integrations/supabase/types.ts`
(gerado). O manual já está defasado — não tem `meeting_status` nem
`livekit_room_name`.

### 21. Observabilidade zero
Sem Error Boundary no React, sem Sentry, sem correlação de log entre frontend e edge
functions. `console.error` solto, sem `request_id`. Diagnosticar uma reunião que deu
errado em produção é impossível hoje.

### 22. Acentuação perdida na UI
~30 ocorrências de texto sem acento em telas de usuário ("Gravacoes", "Buscar na
transcricao", "Responsavel", "Proximos passos"). Produto em pt-BR com aparência de
rascunho.

---

## Estratégia de melhoria

Ordem pensada para que cada fase destrave a seguinte. Fase 0 e 1 não são negociáveis
antes de qualquer cliente real.

### Fase 0 — Fundação ✅ CONCLUÍDA

| # | Ação | Entregue |
|---|---|---|
| 8 | `supabase/migrations/` criado com baseline reconstruído do schema | ✅ aplica, é idempotente e passa em 9 testes funcionais contra PostgreSQL 16 real — ver `supabase/migrations/README.md` |
| 4 | `verify_jwt` declarado para as 17 funções em `config.toml` | ✅ 12 com `true`, 5 com `false` justificado item a item |
| 17 | CI no GitHub Actions: lint → typecheck → testes → build | ✅ `.github/workflows/ci.yml`, pipeline inteiro verde localmente |
| 7 | `.env.example` + `.gitignore` para `.env.local` | ✅ com desvio documentado abaixo |

**Desvios do plano original, e por quê:**

- **`.env` continua versionado.** O plano previa removê-lo do git. Ao
  implementar, verifiquei que `src/integrations/supabase/client.ts` lê
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` em tempo de build:
  desversionar sem confirmar que a Lovable injeta essas variáveis produziria um
  bundle com `undefined` e app quebrado em produção. O arquivo contém apenas
  valores publishable (seguros por design). A proteção efetiva ficou em
  ignorar `.env.local`, que o Vite carrega por cima e é onde valor sensível
  deve morar. Desversionar é uma linha — falta confirmar o comportamento da
  plataforma.

- **`verify_jwt = false` em 5 funções, não em 1.** O plano supunha que só o
  webhook precisava. Ao implementar, descobri que o projeto usa o formato novo
  de chave (`sb_publishable_`) e que `client.ts` **remove o header
  `Authorization`** para esse formato — logo convidados chegam sem header
  nenhum, e `verify_jwt = true` em `livekit-token`/`deepgram-token` mataria a
  rota `/join/:id` inteira. `cron-check-meetings`/`send-reminder` são
  server-to-server com service key opaca, mesmo problema. Cada `false` está
  justificado no arquivo e amarrado ao item da Fase 1 que o fecha.

- **Lint virou gate por supressão, não por correção.** Os 53 erros
  preexistentes foram congelados em `eslint-suppressions.json` (recurso nativo
  do ESLint 9). `npx eslint .` retorna 0 hoje e **falha em qualquer erro
  novo** — verificado introduzindo um `any` de teste. A dívida segue visível e
  some na Fase 3 com `--prune-suppressions`, sem precisar antecipar o item 18
  para dentro da Fase 0.

### Fase 1 — Segurança · ~3 dias

| # | Ação | Critério de aceite |
|---|---|---|
| 2 | Helper `requireMeetingOwner(req, meeting_id)` compartilhado em `supabase/functions/_shared/auth.ts`: valida JWT via `getClaims` e compara `meeting.user_id`. Aplicar nas 9 funções de usuário | Teste: usuário A recebe 403 ao chamar cada função com `meeting_id` de B |
| 2 | `cron-check-meetings` e `send-reminder` autenticados por segredo dedicado (`CRON_SECRET`) em header, não pela service key no body | Chamada sem o segredo → 401 |
| 1 | Eliminar a entrega da chave Deepgram: trocar por token temporário de projeto (`POST /v1/projects/{id}/keys` com TTL curto e escopo `usage:write`), ou proxiar o áudio por uma função WebSocket | DevTools do cliente nunca expõe a chave de longa duração |
| 3 | Token de convite: coluna `join_token` (+ `expires_at`) em `meetings`; `/join/:id?t=...` obrigatório; `livekit-token` recusa se o token não bater, se `meeting_status = 'ended'` ou fora da janela | Link antigo/sem token → 403 |
| 3 | Sanitizar e limitar `guest_name` (trim, 60 chars, sem control chars) | Fuzz de nome não quebra a UI |
| 6 | CORS restrito à origem do app via env `ALLOWED_ORIGIN` | `curl` de outra origem é bloqueado no preflight |

### Fase 2 — Fechar os fluxos truncados · ~5 dias

| # | Ação | Critério de aceite |
|---|---|---|
| 5 | `livekit-webhook` resolve a chave do Vault: identificar a reunião pelo `room name` **antes** de validar, e então verificar a assinatura com as credenciais daquele `user_id` | Evento real do LiveKit Cloud muda `meeting_status` para `live` |
| 9 | Migration adicionando `recording_url text` e `recording_egress_id text` a `meetings`; regenerar types; remover o `as any` de `RecordingTab`; checar erro do `.update()` | `tsc` passa sem cast e o update falha alto, não em silêncio |
| 10 | Definir destino de egress (bucket S3 ou Supabase Storage via `s3Upload`) e capturar a URL final no evento `egress_ended` do webhook, não no `stopEgress` | Reunião gravada → vídeo reproduz na aba Gravação |
| 11 | `RecordingsPage` filtra por `recording_url IS NOT NULL` | Reunião encerrada sem gravação não aparece |
| 12 | Transcrição robusta: negociar `mimeType` suportado com fallback (`audio/mp4` no Safari), KeepAlive a cada 8s, reconexão com backoff, tratar erro do insert. Médio prazo: avaliar egress de áudio + transcrição batch server-side para cobrir quem não tem a aba aberta | Reunião de 30 min no Safari produz transcrição contínua |
| 14 | Migration com `cron.schedule` do `pg_cron` para `cron-check-meetings` | Cron existe após `db reset`, sem passo manual |
| 15 | Deletar `src/pages/Index.tsx` | — |

### Fase 3 — Confiabilidade · ~4 dias

| # | Ação | Critério de aceite |
|---|---|---|
| 16 | Testes unitários onde a lógica dói: `parseActionItems` (incluindo datas inválidas e "Sem prazo"), `calendar-utils`, `useRequiredKeys`, montagem do markdown de export. Meta inicial: 60% nos módulos de `lib/` e `hooks/` | `vitest run` com cobertura no CI |
| 16 | Adicionar `lovable-agent-playwright-config` ao `package.json` (ou substituir por config Playwright padrão) + 3 specs: login→dashboard, criar reunião, entrar como convidado | `npx playwright test` verde no CI |
| 21 | Error Boundary no React + Sentry (front e edge functions) + `request_id` propagado do cliente às funções | Erro em produção rastreável ponta a ponta |
| 18 | Zerar os 53 erros de lint; tipar os `any` com os tipos gerados; corrigir os `exhaustive-deps` (prioridade: `MeetingDetailPage.tsx:457`) | `eslint .` sem saída |
| 20 | Remover `src/types/database.ts`; usar só `Tables<'...'>` do arquivo gerado | Nenhum import do arquivo manual |

### Fase 4 — Polimento e produto · ~3 dias

| # | Ação | Critério de aceite |
|---|---|---|
| 19 | `React.lazy` nas rotas + `manualChunks` separando LiveKit, Recharts e markdown | Chunk inicial < 300 kB gzip |
| 22 | Varredura de acentuação em todos os textos de UI | Nenhuma ocorrência das 30 strings sem acento |
| 13 | Decidir o calendário: (a) export `.ics` + detecção de conflito — barato, cobre 80%; ou (b) OAuth Google Calendar com sync bidirecional — caro. **Recomendo (a) agora**, (b) só com demanda validada | Convite de reunião abre no calendário nativo do participante |

---

## Recomendação

Fases 0 e 1 (~1 semana) são pré-requisito para expor o produto a qualquer usuário
externo: o item 2 sozinho permite que um estranho gaste dinheiro na conta LiveKit de
um cliente e dispare e-mail com o domínio dele. A Fase 2 é o que transforma "as telas
existem" em "o produto entrega" — hoje gravação e sincronização de status estão
quebradas de ponta a ponta, não parcialmente.
