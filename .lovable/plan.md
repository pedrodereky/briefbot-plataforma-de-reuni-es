

# Migração para Supabase Vault — Gerenciamento Seguro de API Keys

## Objetivo

Migrar todas as API keys (LiveKit, Deepgram, Resend) do armazenamento em texto plano na tabela `user_settings` para o **Supabase Vault** (`vault.secrets`), com:

1. Coleta exclusiva via **Onboarding Wizard** (sem editor de keys em `/settings`)
2. Tabela `api_keys_registry` mapeando `user_id` → `vault_secret_id` por serviço
3. Edge Functions dedicadas para escrever/ler/deletar/validar
4. Refatoração das 7 edge functions que hoje leem keys de `user_settings` para lerem do vault
5. `/settings` reformulado: cards de status por serviço + botão "Reconfigurar" (que reabre o wizard ou modal seguro), sem inputs de leitura

## Riscos e premissa de segurança

- O frontend **nunca recebe** o valor da key após envio.
- Todas as leituras de secret acontecem em Edge Functions usando o `service_role` para acessar `vault.decrypted_secrets`.
- Nenhum `console.log` de secrets em qualquer função.
- Validação JWT obrigatória em `store-api-key`, `delete-api-key`, `validate-api-key`.

## Arquitetura

### 1. Banco de Dados (migration)

```sql
-- Habilitar extensão
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- Registry
CREATE TABLE public.api_keys_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name text NOT NULL,        -- 'livekit_api_key', 'livekit_api_secret',
                                      -- 'livekit_url', 'deepgram_api_key',
                                      -- 'resend_api_key'
  vault_secret_id uuid NOT NULL,
  label text,
  is_active boolean DEFAULT true,
  last_validated_at timestamptz,
  validation_status text,             -- 'valid' | 'invalid' | 'unknown'
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, service_name)
);

ALTER TABLE public.api_keys_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own keys registry" ON public.api_keys_registry
  FOR SELECT USING (auth.uid() = user_id);
-- INSERT/UPDATE/DELETE feito apenas via edge functions com service_role
```

Helper SECURITY DEFINER para edge functions lerem a key:

```sql
CREATE OR REPLACE FUNCTION public.get_user_secret(_user_id uuid, _service text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, vault AS $$
DECLARE v_secret_id uuid; v_value text;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
    FROM public.api_keys_registry
    WHERE user_id = _user_id AND service_name = _service AND is_active = true;
  IF v_secret_id IS NULL THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_value
    FROM vault.decrypted_secrets WHERE id = v_secret_id;
  RETURN v_value;
END $$;
REVOKE EXECUTE ON FUNCTION public.get_user_secret FROM anon, authenticated;
```

(Apenas edge functions com `service_role` chamarão essa função.)

**Nota sobre `user_settings`**: as colunas `livekit_api_key`, `livekit_api_secret`, `livekit_url`, `deepgram_api_key`, `resend_api_key`, `anthropic_api_key` serão **dropadas** após migração das edge functions. `sender_email`, `sender_name`, `email_enabled`, `slack_*`, prompts e `onboarding_completed_at` permanecem.

### 2. Edge Functions novas

- **`store-api-key`** — body `{ service_name, value }`. Valida JWT com `getClaims`. Faz upsert no vault (`select vault.create_secret(...)` ou update via `vault.secrets`). Atualiza `api_keys_registry` (insert ou update do `vault_secret_id`). Retorna `{ ok: true }`.
- **`delete-api-key`** — body `{ service_name }`. Lê `vault_secret_id` do registry, faz `delete from vault.secrets where id = ...`, deleta linha do registry.
- **`validate-api-key`** — body `{ service_name }`. Lê secret do vault, faz chamada de teste (LiveKit: `RoomServiceClient.listRooms`; Deepgram: `GET /v1/projects`; Resend: `GET /domains`). Atualiza `validation_status` e `last_validated_at`. Retorna `{ status: 'valid'|'invalid'|'error' }`.

### 3. Edge Functions existentes — refatoradas

Substituir leitura de `user_settings.*_api_key` por chamada a `supabase.rpc('get_user_secret', { _user_id, _service })`:

- `livekit-token` — lê `livekit_api_key`, `livekit_api_secret`, `livekit_url`
- `deepgram-token` — lê `deepgram_api_key`
- `manage-recording` — lê 3 keys LiveKit
- `end-meeting` — lê 3 keys LiveKit
- `send-invite` — lê `resend_api_key` (mantém `sender_email`/`sender_name` em `user_settings`)
- `send-reminder` — idem
- `livekit-webhook` — sem alteração (usa env vars globais)

### 4. Onboarding Wizard — refatorado

`OnboardingPage.tsx`: cada step (LiveKit, Deepgram, Resend) chama `supabase.functions.invoke('store-api-key', { body: { service_name, value } })` em vez de upsert direto em `user_settings`. Após sucesso, **limpa o state** do input imediatamente (o valor não persiste em memória após confirmação). O carregamento inicial **não pré-preenche** os campos com keys (nunca lemos de volta); em vez disso, busca `api_keys_registry` para mostrar badge "Configurada"/"Não configurada" ao lado do título de cada step.

`sender_email`, `sender_name`, `email_enabled` continuam em `user_settings` (não são secrets).

### 5. Settings — nova aba "Chaves de API"

Substitui inputs editáveis por **cards de status por serviço**:

```text
┌───────────────────────────────────────────────┐
│ 🎥 LiveKit                       [● Ativa]    │
│ Vídeo e áudio das reuniões                    │
│ Atualizada em 10/04/2026                      │
│ [Testar conexão] [Reconfigurar] [Remover]     │
└───────────────────────────────────────────────┘
```

- Status: verde "Ativa" / cinza "Não configurada" / vermelho "Inválida" (de `validation_status`)
- "Testar conexão" → invoca `validate-api-key`
- "Reconfigurar" → abre modal com input password + toggle Eye/EyeOff; ao salvar, invoca `store-api-key` e limpa o state
- "Remover" → AlertDialog de confirmação, invoca `delete-api-key`
- Modal full-screen no mobile (<768px); cards empilham 100% width

Demais abas (Integrações, Prompts, Conta) permanecem inalteradas, exceto que `IntegrationsSection` perde referência a `resend_api_key` no toggle de email (passa a checar via registry).

### 6. Detecção de "configurações pendentes"

`AppHooks` ou um novo hook `useRequiredKeys` consulta `api_keys_registry` e expõe quais serviços faltam. Em telas que dependem (criação de reunião → LiveKit obrigatório), exibir banner: *"Configure sua chave de LiveKit nas configurações para usar este recurso."*

## Detalhes técnicos

- **Vault API**: `select vault.create_secret(secret_value, name, description)` retorna `uuid`. Update: `update vault.secrets set secret = $1 where id = $2`. Delete: `delete from vault.secrets where id = $1`. Tudo via `service_role` em edge functions (nunca do frontend).
- **Naming dos secrets no vault**: `{service_name}__{user_id}` (único, evita colisão).
- **Validação de input** (zod nas edge functions) para `service_name` (whitelist) e `value` (string não vazia, max 4KB).
- **CORS**: padrão do projeto, headers em todas as respostas inclusive erros.
- **Sem `console.log` de `value` ou `secret`** em nenhum ponto. Logs apenas com `service_name` e `user_id`.

## Plano de execução (default mode)

1. Migration: criar extensão vault, tabela `api_keys_registry`, função `get_user_secret`, RLS.
2. Criar edge functions `store-api-key`, `delete-api-key`, `validate-api-key`.
3. Refatorar `livekit-token`, `deepgram-token`, `manage-recording`, `end-meeting`, `send-invite`, `send-reminder` para usar `get_user_secret`.
4. Refatorar `OnboardingPage` para invocar `store-api-key` e mostrar status do registry (sem pré-preencher valores).
5. Refatorar `SettingsPage` → `ApiKeysSection`: cards de status, modal de reconfigurar, botões testar/remover.
6. Atualizar `IntegrationsSection` (toggle email) e adicionar banner "configurar chave" nos pontos de uso.
7. Migration final: `ALTER TABLE user_settings DROP COLUMN livekit_api_key, livekit_api_secret, livekit_url, deepgram_api_key, resend_api_key, anthropic_api_key`.
8. QA: validar fluxo completo (onboarding → criar reunião → guest join → encerrar com sumário).

