-- ============================================================================
-- FASE 1 — Token de convite e redução da superfície anônima
-- ============================================================================
-- Fecha parte do item P0-3 da auditoria: hoje qualquer requisição anônima que
-- conheça (ou adivinhe) o UUID de uma reunião lê a linha inteira e entra na
-- sala. Esta migration:
--   1. dá a cada reunião um segredo de convite com validade;
--   2. reduz o que o papel `anon` enxerga em `meetings` de TODAS as colunas
--      para as 4 necessárias à tela de entrada;
--   3. limita a leitura anônima de transcrições às reuniões ao vivo.
-- Idempotente.
-- ============================================================================

-- ─── 1. Segredo de convite ──────────────────────────────────────────────────

ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS join_token            text,
  ADD COLUMN IF NOT EXISTS join_token_expires_at timestamptz;

-- 24 bytes de entropia em base64url: inviável de adivinhar, curto na URL.
CREATE OR REPLACE FUNCTION public.generate_join_token()
RETURNS text
LANGUAGE sql
VOLATILE
SET search_path = public, extensions
AS $$
  SELECT translate(encode(gen_random_bytes(24), 'base64'), '+/=', '-_');
$$;

-- Preenche reuniões já existentes. Validade: 7 dias após o término
-- (ou após o início, quando não há término informado).
UPDATE public.meetings
   SET join_token            = public.generate_join_token(),
       join_token_expires_at = COALESCE(ends_at, starts_at) + interval '7 days'
 WHERE join_token IS NULL;

ALTER TABLE public.meetings ALTER COLUMN join_token SET DEFAULT public.generate_join_token();

-- Toda reunião nova nasce com token, mesmo que o INSERT não cite a coluna.
CREATE OR REPLACE FUNCTION public.set_join_token()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.join_token IS NULL THEN
    NEW.join_token := public.generate_join_token();
  END IF;
  IF NEW.join_token_expires_at IS NULL THEN
    NEW.join_token_expires_at := COALESCE(NEW.ends_at, NEW.starts_at) + interval '7 days';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS meetings_set_join_token ON public.meetings;
CREATE TRIGGER meetings_set_join_token
  BEFORE INSERT ON public.meetings
  FOR EACH ROW EXECUTE FUNCTION public.set_join_token();

ALTER TABLE public.meetings ALTER COLUMN join_token SET NOT NULL;

CREATE INDEX IF NOT EXISTS meetings_join_token_idx ON public.meetings (join_token);

-- ─── 2. `anon` deixa de ler a linha inteira de `meetings` ───────────────────
--
-- RLS decide QUAIS linhas; privilégio de coluna decide QUAIS campos. A policy
-- anônima continua ampla (a tela de entrada precisa resolver o id antes de
-- ter qualquer credencial), mas agora o que vaza são 4 campos inócuos em vez
-- de `attendees`, `description`, `user_id`, `livekit_room_name` e — crucial —
-- o próprio `join_token`.

REVOKE SELECT ON public.meetings FROM anon;
GRANT  SELECT (id, title, starts_at, meeting_status) ON public.meetings TO anon;

-- Reuniões encerradas somem para o anônimo: link velho não revela mais nada.
DROP POLICY IF EXISTS "Guests read meetings for join page" ON public.meetings;
CREATE POLICY "Guests read meetings for join page" ON public.meetings
  FOR SELECT TO anon
  USING (meeting_status IS DISTINCT FROM 'ended');

-- ─── 3. Transcrições anônimas restritas a reuniões ao vivo ──────────────────
--
-- Antes: `USING (true)` — qualquer anônimo lia a transcrição de qualquer
-- reunião já realizada. Agora a janela é só o que está acontecendo agora, que
-- é o que a sala do convidado realmente precisa.
--
-- ⚠️ Isto REDUZ a exposição, não a elimina: um anônimo com o id de uma reunião
--    ao vivo ainda lê a transcrição dela. Fechar de vez exige sessão
--    autenticada para convidado (JWT de curta duração emitido contra o
--    join_token), que está fora do escopo desta fase.

DROP POLICY IF EXISTS "Guests read transcripts" ON public.meeting_transcripts;
CREATE POLICY "Guests read transcripts" ON public.meeting_transcripts
  FOR SELECT TO anon
  USING (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = meeting_transcripts.meeting_id
                    AND m.meeting_status = 'live'));

DROP POLICY IF EXISTS "Guests insert transcripts" ON public.meeting_transcripts;
CREATE POLICY "Guests insert transcripts" ON public.meeting_transcripts
  FOR INSERT TO anon
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m
                       WHERE m.id = meeting_transcripts.meeting_id
                         AND m.meeting_status = 'live'));

-- ─── 4. Validação do convite (usada pelas edge functions) ───────────────────
--
-- SECURITY DEFINER para conseguir ler `join_token`, que o `anon` não enxerga
-- mais. Recebe o token, devolve a reunião só se conferir e não tiver expirado.

CREATE OR REPLACE FUNCTION public.verify_join_token(_meeting_id uuid, _token text)
RETURNS TABLE (meeting_id uuid, user_id uuid, title text, meeting_status text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.user_id, m.title, m.meeting_status
    FROM public.meetings m
   WHERE m.id = _meeting_id
     AND _token IS NOT NULL
     AND m.join_token = _token
     AND (m.join_token_expires_at IS NULL OR m.join_token_expires_at > now());
$$;

REVOKE EXECUTE ON FUNCTION public.verify_join_token(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.verify_join_token(uuid, text) TO service_role;


-- ============================================================================
-- 5. CORREÇÃO CRÍTICA — EXECUTE de PUBLIC nas funções SECURITY DEFINER
-- ============================================================================
-- Descoberta ao testar a Fase 1 contra um PostgreSQL real.
--
-- Todo `REVOKE EXECUTE ... FROM anon, authenticated` escrito até aqui (e no
-- .lovable/plan.md, de onde o padrão veio) é NO-OP: o PostgreSQL concede
-- EXECUTE a PUBLIC por padrão na criação da função, e PUBLIC abrange `anon`.
-- Revogar do papel sem revogar de PUBLIC não tira nada.
--
-- Consequência no banco em produção: o PostgREST expõe funções de `public`
-- como RPC, então uma requisição ANÔNIMA a
--     POST /rest/v1/rpc/get_user_secret
--     {"_user_id": "<uuid de qualquer usuário>", "_service": "livekit_api_secret"}
-- devolve o segredo já decriptado do Vault. Vale para as chaves de LiveKit,
-- Deepgram e Resend de qualquer conta.
--
-- Este bloco é idempotente e reaplica a revogação correta sobre TODAS as
-- funções SECURITY DEFINER de `public`, inclusive as que já existiam antes
-- deste repositório ter migrations.

DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS assinatura
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.assinatura);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn.assinatura);
  END LOOP;
END $$;
