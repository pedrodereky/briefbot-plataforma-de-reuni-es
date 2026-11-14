-- ============================================================================
-- Fecha a listagem anônima de reuniões
-- ============================================================================
-- Problema: a policy "Guests read meetings for join page" (Fase 1) deixava o
-- papel `anon` ler id, título, início e status de TODA reunião não encerrada,
-- de todos os usuários. Bastava a chave pública do site para listar os ids das
-- reuniões ativas e, com eles, ler as transcrições ao vivo ("Guests read
-- transcripts") e inserir trechos nelas.
--
-- Correção:
--   1. `anon` deixa de ler `meetings` diretamente;
--   2. a tela de convite passa a usar a RPC `get_join_meeting`, que só devolve
--      os 4 campos quando o join_token do link confere e não expirou;
--   3. as policies anônimas de transcrição passam a usar `meeting_is_live`
--      (SECURITY DEFINER), já que `anon` não enxerga mais `meetings`.
--
-- Resultado: sem o link de convite não há como descobrir o id de uma reunião.
-- Quem tem o id (convidados) continua lendo a transcrição enquanto a reunião
-- está ao vivo, como antes. Idempotente.
-- ============================================================================

-- ─── 1. Sem leitura anônima direta de `meetings` ────────────────────────────

DROP POLICY IF EXISTS "Guests read meetings for join page" ON public.meetings;
-- Em produção a mesma regra existia com outro nome, criada fora destas migrations.
DROP POLICY IF EXISTS "Public can view meeting by id" ON public.meetings;
REVOKE SELECT ON public.meetings FROM anon;

-- ─── 2. Dados da tela de convite, só com token válido ───────────────────────

CREATE OR REPLACE FUNCTION public.get_join_meeting(_meeting_id uuid, _token text)
RETURNS TABLE (id uuid, title text, starts_at timestamptz, meeting_status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.title, m.starts_at, m.meeting_status
    FROM public.meetings m
   WHERE m.id = _meeting_id
     AND _token IS NOT NULL
     AND m.join_token = _token
     AND (m.join_token_expires_at IS NULL OR m.join_token_expires_at > now());
$$;

REVOKE EXECUTE ON FUNCTION public.get_join_meeting(uuid, text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_join_meeting(uuid, text) TO anon, authenticated;

-- ─── 3. Transcrições anônimas: mesma regra, sem depender de ler `meetings` ──

CREATE OR REPLACE FUNCTION public.meeting_is_live(_meeting_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = _meeting_id AND m.meeting_status = 'live');
$$;

REVOKE EXECUTE ON FUNCTION public.meeting_is_live(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.meeting_is_live(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Guests read transcripts" ON public.meeting_transcripts;
CREATE POLICY "Guests read transcripts" ON public.meeting_transcripts
  FOR SELECT TO anon
  USING (public.meeting_is_live(meeting_id));

DROP POLICY IF EXISTS "Guests insert transcripts" ON public.meeting_transcripts;
CREATE POLICY "Guests insert transcripts" ON public.meeting_transcripts
  FOR INSERT TO anon
  WITH CHECK (public.meeting_is_live(meeting_id));
