-- ============================================================================
-- FASE 2 — Gravação persistida e cron versionado
-- ============================================================================
-- Fecha dois fluxos que terminavam no vazio:
--
--   1. Gravação (auditoria P1 itens 9 a 11). O código escrevia e lia
--      `meetings.recording_egress_id` e `meetings.recording_url` — colunas que
--      NUNCA existiram. O `.update()` falhava em silêncio (o erro não era
--      checado) e `RecordingTab` usava `as any` para o TypeScript não
--      denunciar. Resultado: a gravação "iniciava" e nada persistia.
--
--   2. Agenda (auditoria P1 item 14). `cron-check-meetings` precisava ser
--      agendado à mão no painel; nada disso estava versionado, então um
--      ambiente novo nascia sem briefing pré-reunião e sem lembrete.
--
-- Idempotente.
-- ============================================================================

-- ─── 1. Colunas de gravação ─────────────────────────────────────────────────

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS recording_egress_id  text,
  ADD COLUMN IF NOT EXISTS recording_url        text,
  ADD COLUMN IF NOT EXISTS recording_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS recording_ended_at   timestamptz,
  ADD COLUMN IF NOT EXISTS recording_status     text;

COMMENT ON COLUMN public.meetings.recording_egress_id IS
  'Id do egress do LiveKit enquanto a gravação está em andamento; nulo quando não há gravação ativa.';
COMMENT ON COLUMN public.meetings.recording_status IS
  'null = nunca gravada | recording | processing | ready | failed';

-- Índice para a tela de Gravações, que passa a listar só o que existe de fato.
CREATE INDEX IF NOT EXISTS meetings_com_gravacao_idx
  ON public.meetings (user_id, starts_at DESC)
  WHERE recording_url IS NOT NULL;

-- O egress é localizado pelo id quando o webhook do LiveKit avisa que terminou.
CREATE INDEX IF NOT EXISTS meetings_egress_id_idx
  ON public.meetings (recording_egress_id)
  WHERE recording_egress_id IS NOT NULL;

-- `anon` não ganha acesso a nada disso: a tela de entrada continua limitada às
-- 4 colunas liberadas na Fase 1. Reafirmado aqui porque ADD COLUMN em tabela
-- com privilégio por coluna não concede a coluna nova — mas deixar explícito
-- evita que uma revisão futura "conserte" isso por engano.
REVOKE SELECT ON public.meetings FROM anon;
GRANT  SELECT (id, title, starts_at, meeting_status) ON public.meetings TO anon;

-- ─── 2. Agenda do cron ──────────────────────────────────────────────────────
--
-- Requer pg_cron e pg_net, ambos disponíveis no Supabase. O job chama
-- `cron-check-meetings`, que dispara os briefings pré-reunião e os lembretes.
--
-- A URL e o segredo NÃO ficam no SQL: são lidos de `public.app_config`, uma
-- tabela que só o service_role enxerga. Assim a migration é igual em qualquer
-- ambiente, e o segredo não vira histórico versionado.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.app_config (
  chave      text PRIMARY KEY,
  valor      text NOT NULL,
  atualizado timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_config FROM anon, authenticated;

-- Sem policy para anon/authenticated: só o service_role (que ignora RLS) lê.

CREATE OR REPLACE FUNCTION public.disparar_cron_reunioes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_url    text;
  v_secret text;
BEGIN
  SELECT valor INTO v_url    FROM public.app_config WHERE chave = 'functions_base_url';
  SELECT valor INTO v_secret FROM public.app_config WHERE chave = 'cron_secret';

  IF v_url IS NULL THEN
    RAISE NOTICE 'app_config.functions_base_url não configurada — cron ignorado';
    RETURN;
  END IF;

  PERFORM net.http_post(
    url     := v_url || '/cron-check-meetings',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'x-cron-secret', COALESCE(v_secret, '')
               ),
    body    := '{}'::jsonb
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.disparar_cron_reunioes() FROM PUBLIC, anon, authenticated;

-- Reagenda de forma idempotente: remove o job antigo antes de recriar.
DO $$
BEGIN
  PERFORM cron.unschedule('briefbot-check-meetings');
EXCEPTION WHEN OTHERS THEN
  NULL; -- job ainda não existia
END $$;

SELECT cron.schedule(
  'briefbot-check-meetings',
  '*/5 * * * *',
  $$ SELECT public.disparar_cron_reunioes(); $$
);

-- ============================================================================
-- Passo manual necessário uma única vez por ambiente (não versionável):
--
--   INSERT INTO public.app_config (chave, valor) VALUES
--     ('functions_base_url', 'https://<project-ref>.supabase.co/functions/v1'),
--     ('cron_secret',        '<mesmo valor da env CRON_SECRET das functions>')
--   ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado = now();
--
-- Enquanto não for feito, o job roda e sai sem fazer nada, registrando NOTICE.
-- ============================================================================
