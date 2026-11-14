DROP POLICY IF EXISTS "Guests read meetings for join page" ON public.meetings;
REVOKE SELECT ON public.meetings FROM anon;

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