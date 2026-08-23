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
2. Cole e execute o conteúdo do arquivo:
   👉 [`supabase/migrations/`](./supabase/migrations/) — procure pelo arquivo `*_auth_user_settings_sync.sql` (o mais recente com esse sufixo).
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

---

## Checklist pós-remix

Itens essenciais para o app funcionar 100% (ver KB do projeto para detalhes):

- [ ] Trigger `on_auth_user_created` em `auth.users` instalado (ver auto-reparo acima)
- [ ] RLS `anon INSERT/SELECT` em `meeting_transcripts` (convidados sem auth)
- [ ] RLS `anon SELECT` em `meetings` (rota `/join/:id`)
- [ ] Realtime habilitado em `meetings` e `meeting_transcripts`
- [ ] 13 edge functions deployadas (incluindo `ensure-auth-trigger`)
- [ ] Auth email/senha habilitado
- [ ] Cron `cron-check-meetings` agendado (~5 min)
- [ ] Onboarding executado com LiveKit + Deepgram + Resend

---

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
├── functions/         # 14 edge functions
├── migrations/        # Migrations versionadas (fonte da verdade do schema)
└── config.toml        # Configuração do projeto + per-function overrides
```
