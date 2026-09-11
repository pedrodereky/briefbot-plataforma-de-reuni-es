-- ============================================================================
-- BASELINE DO SCHEMA — BriefBot
-- ============================================================================
-- ATENÇÃO: esta migration foi RECONSTRUÍDA a partir de
--   * src/integrations/supabase/types.ts (tipos gerados pelo Supabase)
--   * .lovable/plan.md (design do Vault e das RPCs)
--   * as chamadas reais feitas pelas 17 edge functions e pelo frontend
-- e NÃO a partir de um `supabase db pull`, que não foi possível executar sem
-- credenciais do banco.
--
-- Ela é IDEMPOTENTE e NÃO DESTRUTIVA (IF NOT EXISTS / CREATE OR REPLACE /
-- DROP POLICY IF EXISTS antes de recriar), portanto pode ser aplicada com
-- segurança sobre o banco existente. Ainda assim, antes de tratá-la como
-- fonte da verdade definitiva, rode a reconciliação descrita em
-- supabase/migrations/README.md.
-- ============================================================================

-- ─── Extensões ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS supabase_vault WITH SCHEMA vault;

-- ─── Tabela: meetings ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meetings (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  calendar_event_id  text NOT NULL,
  title              text NOT NULL,
  description        text,
  starts_at          timestamptz NOT NULL,
  ends_at            timestamptz,
  attendees          jsonb DEFAULT '[]'::jsonb,
  organizer          text,
  briefing_sent      boolean DEFAULT false,
  summary_sent       boolean DEFAULT false,
  livekit_room_name  text,
  meeting_status     text DEFAULT 'scheduled',
  created_at         timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meetings_user_id_idx        ON public.meetings (user_id);
CREATE INDEX IF NOT EXISTS meetings_starts_at_idx      ON public.meetings (starts_at);
CREATE INDEX IF NOT EXISTS meetings_status_idx         ON public.meetings (meeting_status);
CREATE UNIQUE INDEX IF NOT EXISTS meetings_room_name_idx
  ON public.meetings (livekit_room_name) WHERE livekit_room_name IS NOT NULL;

-- ─── Tabela: briefings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.briefings (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  type        text NOT NULL,              -- 'pre' | 'post'
  content_md  text NOT NULL,
  sent_at     timestamptz,
  channels    text[],
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS briefings_meeting_id_idx ON public.briefings (meeting_id);

-- ─── Tabela: action_items ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.action_items (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id  uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  owner       text NOT NULL,
  task        text NOT NULL,
  due_date    date,
  done        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS action_items_meeting_id_idx ON public.action_items (meeting_id);

-- ─── Tabela: meeting_transcripts ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.meeting_transcripts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        uuid NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
  participant_id    text,
  participant_name  text,
  text              text NOT NULL,
  is_final          boolean DEFAULT true,
  timestamp         timestamptz DEFAULT now(),
  created_at        timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS meeting_transcripts_meeting_id_idx
  ON public.meeting_transcripts (meeting_id, timestamp);

-- ─── Tabela: contacts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             text NOT NULL,
  email            text NOT NULL,
  role             text,
  company          text,
  notes            text,
  meeting_count    integer DEFAULT 0,
  last_meeting_at  timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS contacts_user_email_idx ON public.contacts (user_id, email);

-- ─── Tabela: user_settings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.user_settings (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                  uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  slack_webhook_url        text,
  slack_enabled            boolean DEFAULT false,
  email_enabled            boolean DEFAULT true,
  sender_email             text,
  sender_name              text,
  reminder_minutes_before  integer DEFAULT 15,
  custom_pre_prompt        text,
  custom_post_prompt       text,
  onboarding_completed_at  timestamptz,
  created_at               timestamptz DEFAULT now()
);

-- ─── Tabela: api_keys_registry (Vault) ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.api_keys_registry (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  service_name       text NOT NULL,   -- livekit_api_key | livekit_api_secret |
                                      -- livekit_url | deepgram_api_key | resend_api_key
  vault_secret_id    uuid NOT NULL,
  label              text,
  is_active          boolean NOT NULL DEFAULT true,
  last_validated_at  timestamptz,
  validation_status  text,            -- 'valid' | 'invalid' | 'unknown'
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, service_name)
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE public.meetings            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.briefings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.action_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_transcripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_keys_registry   ENABLE ROW LEVEL SECURITY;

-- meetings — dono tem acesso total
DROP POLICY IF EXISTS "Users manage own meetings" ON public.meetings;
CREATE POLICY "Users manage own meetings" ON public.meetings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- meetings — convidado anônimo precisa ler para a rota /join/:id
--
-- ⚠️  RISCO CONHECIDO (auditoria P0 item 3): esta policy expõe TODA reunião a
--     qualquer requisição anônima que conheça (ou adivinhe) um id. É a
--     reprodução fiel do estado atual, exigida pelo checklist do README.
--     A Fase 1 substitui isto por acesso via `join_token` com expiração.
DROP POLICY IF EXISTS "Guests read meetings for join page" ON public.meetings;
CREATE POLICY "Guests read meetings for join page" ON public.meetings
  FOR SELECT TO anon
  USING (true);

-- briefings / action_items — acesso pelo dono da reunião
DROP POLICY IF EXISTS "Users manage briefings of own meetings" ON public.briefings;
CREATE POLICY "Users manage briefings of own meetings" ON public.briefings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = briefings.meeting_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = briefings.meeting_id AND m.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage action items of own meetings" ON public.action_items;
CREATE POLICY "Users manage action items of own meetings" ON public.action_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = action_items.meeting_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = action_items.meeting_id AND m.user_id = auth.uid()));

-- meeting_transcripts — dono lê/gerencia; convidado anônimo insere e lê
DROP POLICY IF EXISTS "Users manage transcripts of own meetings" ON public.meeting_transcripts;
CREATE POLICY "Users manage transcripts of own meetings" ON public.meeting_transcripts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = meeting_transcripts.meeting_id AND m.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = meeting_transcripts.meeting_id AND m.user_id = auth.uid()));

-- ⚠️  Mesmo risco da policy anônima acima — endurecida na Fase 1.
DROP POLICY IF EXISTS "Guests insert transcripts" ON public.meeting_transcripts;
CREATE POLICY "Guests insert transcripts" ON public.meeting_transcripts
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m
                       WHERE m.id = meeting_transcripts.meeting_id));

DROP POLICY IF EXISTS "Guests read transcripts" ON public.meeting_transcripts;
CREATE POLICY "Guests read transcripts" ON public.meeting_transcripts
  FOR SELECT TO anon
  USING (true);

-- contacts / user_settings — só o dono
DROP POLICY IF EXISTS "Users manage own contacts" ON public.contacts;
CREATE POLICY "Users manage own contacts" ON public.contacts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own settings" ON public.user_settings;
CREATE POLICY "Users manage own settings" ON public.user_settings
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- api_keys_registry — leitura própria apenas; escrita só via edge function
-- com service_role (que ignora RLS). O frontend nunca escreve aqui.
DROP POLICY IF EXISTS "Users view own keys registry" ON public.api_keys_registry;
CREATE POLICY "Users view own keys registry" ON public.api_keys_registry
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ============================================================================
-- RPCs DO VAULT  (chamadas exclusivamente por edge functions com service_role)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_user_secret(_user_id uuid, _service text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_value     text;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
    FROM public.api_keys_registry
   WHERE user_id = _user_id AND service_name = _service AND is_active = true;

  IF v_secret_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO v_value
    FROM vault.decrypted_secrets
   WHERE id = v_secret_id;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.store_user_secret(_user_id uuid, _service text, _value text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
  v_name      text := _service || '__' || _user_id::text;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
    FROM public.api_keys_registry
   WHERE user_id = _user_id AND service_name = _service;

  IF v_secret_id IS NULL THEN
    SELECT vault.create_secret(_value, v_name, 'BriefBot user API key') INTO v_secret_id;
  ELSE
    UPDATE vault.secrets SET secret = _value WHERE id = v_secret_id;
  END IF;

  INSERT INTO public.api_keys_registry (user_id, service_name, vault_secret_id,
                                        is_active, validation_status, updated_at)
       VALUES (_user_id, _service, v_secret_id, true, 'unknown', now())
  ON CONFLICT (user_id, service_name) DO UPDATE
          SET vault_secret_id   = EXCLUDED.vault_secret_id,
              is_active         = true,
              validation_status = 'unknown',
              updated_at        = now();

  RETURN v_secret_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_user_secret(_user_id uuid, _service text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault
AS $$
DECLARE
  v_secret_id uuid;
BEGIN
  SELECT vault_secret_id INTO v_secret_id
    FROM public.api_keys_registry
   WHERE user_id = _user_id AND service_name = _service;

  IF v_secret_id IS NULL THEN
    RETURN false;
  END IF;

  DELETE FROM public.api_keys_registry
   WHERE user_id = _user_id AND service_name = _service;

  DELETE FROM vault.secrets WHERE id = v_secret_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_secret_validation(_user_id uuid, _service text, _status text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.api_keys_registry
     SET validation_status = _status,
         last_validated_at = now(),
         updated_at        = now()
   WHERE user_id = _user_id AND service_name = _service;
END;
$$;

-- Nenhuma dessas RPCs pode ser chamada do frontend.
REVOKE EXECUTE ON FUNCTION public.get_user_secret(uuid, text)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.store_user_secret(uuid, text, text)    FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_user_secret(uuid, text)         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_secret_validation(uuid, text, text) FROM anon, authenticated;

-- ============================================================================
-- TRIGGER DE CRIAÇÃO DE USUÁRIO  (+ RPCs de auto-reparo)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_settings (user_id)
       VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_auth_trigger_exists()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'on_auth_user_created'
       AND tgrelid = 'auth.users'::regclass
       AND NOT tgisinternal
  );
$$;

CREATE OR REPLACE FUNCTION public.install_auth_trigger()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
  CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.install_auth_trigger() FROM anon, authenticated;

-- Instala o trigger já nesta migration (o auto-reparo em runtime vira fallback).
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill: usuários criados antes do trigger existir.
INSERT INTO public.user_settings (user_id)
     SELECT u.id FROM auth.users u
      WHERE NOT EXISTS (SELECT 1 FROM public.user_settings s WHERE s.user_id = u.id)
ON CONFLICT (user_id) DO NOTHING;

-- ============================================================================
-- REALTIME
-- ============================================================================
-- meetings e meeting_transcripts alimentam useRealtimeMeetingStatus,
-- useRealtimeTranscripts, useRealtimeBriefings e useRealtimeActionDetection.

ALTER TABLE public.meetings            REPLICA IDENTITY FULL;
ALTER TABLE public.meeting_transcripts REPLICA IDENTITY FULL;
ALTER TABLE public.briefings           REPLICA IDENTITY FULL;
ALTER TABLE public.action_items        REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['meetings', 'meeting_transcripts', 'briefings', 'action_items'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
