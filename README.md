# BriefBot

Plataforma de reuniões inteligentes com videoconferência (LiveKit), transcrição em tempo real (Deepgram), IA para briefings/resumos/action items (Lovable AI Gateway / Gemini), notificações por email (Resend) e Slack, e gravação (LiveKit Egress).

## Stack

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, shadcn/ui
- **Backend:** Lovable Cloud (Supabase) — Postgres + Auth + Edge Functions + Realtime
- **Vídeo:** LiveKit (WebRTC + Egress para gravação)
- **Transcrição:** Deepgram (Nova-2, pt-BR, streaming)
- **IA:** Lovable AI Gateway (`google/gemini-3-flash-preview`)
- **Email:** Resend
- **UI:** pt-BR · Tema Tivora (cream + verde + rosa, Inter + Playfair Display)

---

### Auto-reparo (esperado)

O app tenta se auto-reparar **na primeira execução** chamando a Edge Function `ensure-auth-trigger`, que:

1. Verifica via RPC `public.check_auth_trigger_exists()` se o trigger está instalado.
2. Se faltar, chama a RPC `public.install_auth_trigger()` (`SECURITY DEFINER`) que reinstala função + trigger.
3. Loga o resultado no console e só mostra um toast discreto em caso de falha.

A flag `sessionStorage['auth_trigger_checked']` evita re-execuções no mesmo session.

### Fix manual (caso o auto-reparo falhe)

Se você ver no console `[Auth Setup] Trigger check failed:` ou um toast de aviso:

1. Abra **Lovable Cloud → SQL Editor** (executando como role `postgres`).
2. Cole e execute o conteúdo de
   👉 [`supabase/migrations/20260911120000_baseline_schema.sql`](./supabase/migrations/20260911120000_baseline_schema.sql)
   (ou apenas o bloco "TRIGGER DE CRIAÇÃO DE USUÁRIO" dele).
3. Cadastre um usuário novo de teste e confirme que aparece linha em `public.user_settings`.

A migration é **idempotente** — pode rodar quantas vezes precisar.

---

## Variáveis e secrets necessárias após remix

Configuradas pelo próprio app no fluxo de **Onboarding** (`/onboarding`):

| Secret | Onde obter | Onde usado |
|---|---|---|
| `LiveKit API Key/Secret/URL` | https://cloud.livekit.io | Sala de reunião e gravação |
| `Deepgram API Key` | https://console.deepgram.com | Transcrição em tempo real |
| `Resend API Key` + sender email/name | https://resend.com | Convites e lembretes |

Secrets de plataforma (já presentes em qualquer projeto Lovable Cloud):
- `LOVABLE_API_KEY` — IA (Gemini) via gateway, sem custo extra
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` — backend

Variáveis de ambiente das edge functions introduzidas na Fase 1 de segurança:

| Variável | Obrigatória | Efeito se não definida |
|---|---|---|
| `ALLOWED_ORIGINS` | recomendada | CORS continua liberado para qualquer origem (`*`), com aviso no log. Defina com a origem do app, separando por vírgula. |
| `CRON_SECRET` | recomendada | `cron-check-meetings` e `send-reminder` seguem aceitando a service key. Com ela definida, passam a aceitar também o header `x-cron-secret`. |
| `APP_URL` | recomendada | Links de convite nos e-mails caem no domínio padrão. |
| `RECORDING_S3_BUCKET` / `_REGION` / `_ACCESS_KEY` / `_SECRET` | obrigatória para gravar | Sem elas `manage-recording` recusa iniciar a gravação (503) em vez de gravar para lugar nenhum. |
| `RECORDING_S3_ENDPOINT` | opcional | Para S3-compatível (Storage do Supabase, MinIO). Ativa path style automaticamente. |

### Gravação

O Egress do LiveKit não armazena arquivo: ele entrega a um destino que você
configura. Sem as variáveis `RECORDING_S3_*` a gravação é recusada de forma
explícita — antes o egress subia sem destino, o arquivo não existia depois e a
aba de gravação ficava eternamente em "processando".

A URL final é gravada pelo **webhook**, no evento `egress_ended`, e não no
retorno de `stopEgress()` — naquele instante o arquivo ainda está sendo
processado. O ciclo de estados é
`recording` → `processing` → `ready` (ou `failed`).

### Agenda (cron)

`supabase/migrations/20260911140000_fase2_gravacao_e_cron.sql` versiona o job
`briefbot-check-meetings`, que roda a cada 5 minutos via `pg_cron`. Um passo
manual é necessário uma vez por ambiente, porque URL e segredo não podem ir
para o repositório:

```sql
INSERT INTO public.app_config (chave, valor) VALUES
  ('functions_base_url', 'https://<project-ref>.supabase.co/functions/v1'),
  ('cron_secret',        '<mesmo valor da env CRON_SECRET das functions>')
ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado = now();
```

Enquanto não for feito, o job roda e sai sem chamar nada, registrando um NOTICE.

### Link de convite

Entrar em uma reunião exige o token que vai na URL: `/join/:id?t=<token>`.
O token é gerado automaticamente para toda reunião, expira 7 dias após o fim e
é conferido no servidor. Um link sem `?t=` — ou com token vencido — é recusado,
e o id sozinho não dá acesso a nada.

---

## Checklist pós-remix

Itens essenciais para o app funcionar 100% (ver KB do projeto para detalhes):

- [ ] Trigger `on_auth_user_created` em `auth.users` instalado (ver auto-reparo acima)
- [ ] Migrations aplicadas (`supabase/migrations/`) — inclui a correção de
      privilégio das funções `SECURITY DEFINER`, sem a qual as chaves do Vault
      ficam legíveis por requisição anônima
- [ ] `ALLOWED_ORIGINS` configurada nas edge functions
- [ ] Realtime habilitado em `meetings` e `meeting_transcripts`
- [ ] `RECORDING_S3_*` configuradas, se for usar gravação
- [ ] 17 edge functions deployadas (incluindo `ensure-auth-trigger`)
- [ ] Auth email/senha habilitado
- [ ] `public.app_config` preenchida (ativa o cron versionado — ver acima)
- [ ] Onboarding executado com LiveKit + Deepgram + Resend

---

## Auditoria e plano de evolução

O estado de completude do projeto está mapeado em
[`docs/AUDITORIA.md`](./docs/AUDITORIA.md): lacunas classificadas por
severidade e plano de execução em 5 fases. **A Fase 0 (fundação) está
concluída**; as Fases 1 e 2 contêm itens de segurança que devem ser fechados
antes de expor o produto a usuários externos.

## Estrutura do projeto

```
src/
├── pages/             # Rotas (Dashboard, Meetings, Room, Join, Settings…)
├── components/        # UI (shadcn/ui + componentes do projeto)
├── hooks/             # Hooks de domínio (useLiveKit, useTranscription, useEnsureAuthTrigger…)
├── contexts/          # AuthProvider
├── integrations/      # Supabase client + types (auto-gerado, não editar)
└── lib/               # Utils

supabase/
├── functions/         # 17 edge functions
├── migrations/        # Migrations versionadas (fonte da verdade do schema)
└── config.toml        # Configuração do projeto + per-function overrides
```
