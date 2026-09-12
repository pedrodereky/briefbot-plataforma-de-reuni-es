-- ============================================================================
-- Verificação pós-aplicação das migrations — SOMENTE LEITURA
-- ============================================================================
-- Diferente de schema_test.sql, que precisa de um banco vazio e INSERE dados,
-- este arquivo não escreve nada: pode ser colado no SQL Editor de um ambiente
-- em produção com segurança, quantas vezes quiser.
--
-- Uso: cole no SQL Editor do Supabase/Lovable Cloud depois de aplicar as
-- migrations. Cada linha mostra ✅ ou ❌ e um detalhe que ajuda a agir.
--
-- O ❌ esperado logo após aplicar é apenas o último — `app_config` vazia, que
-- depende de um passo manual por ambiente (ver supabase/migrations/README.md).
-- Qualquer outro ❌ significa que algo não aplicou.
--
-- Nota sobre a linha 3: `disparar_cron_reunioes` fica DE FORA da checagem de
-- `service_role` de propósito. Quem a chama é o pg_cron, rodando como
-- `postgres` — ela não deve mesmo ter grant para `service_role`.
-- ============================================================================

SELECT
  checagem,
  CASE WHEN ok THEN '✅ ok' ELSE '❌ FALHOU' END AS resultado,
  detalhe
FROM (
  SELECT 1 AS ord,
    'Nenhuma função SECURITY DEFINER executável por anon' AS checagem,
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname = 'public' AND p.prosecdef
                   AND has_function_privilege('anon', p.oid, 'EXECUTE')) AS ok,
    COALESCE((SELECT string_agg(p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname='public' AND p.prosecdef
                 AND has_function_privilege('anon', p.oid, 'EXECUTE')), 'nenhuma') AS detalhe

  UNION ALL SELECT 2,
    'Nenhuma função SECURITY DEFINER executável por authenticated',
    NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                 WHERE n.nspname='public' AND p.prosecdef
                   AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
    COALESCE((SELECT string_agg(p.proname, ', ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               WHERE n.nspname='public' AND p.prosecdef
                 AND has_function_privilege('authenticated', p.oid, 'EXECUTE')), 'nenhuma')

  -- disparar_cron_reunioes fica de fora de propósito: quem a chama é o
  -- pg_cron (como postgres), não uma edge function. Ela não deve ter grant.
  UNION ALL SELECT 3,
    'service_role mantém EXECUTE nas RPCs que as edge functions usam',
    (SELECT COALESCE(bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')), true)
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef
        AND p.proname <> 'disparar_cron_reunioes'),
    (SELECT count(*)::text || ' funções verificadas'
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname='public' AND p.prosecdef
        AND p.proname <> 'disparar_cron_reunioes')

  UNION ALL SELECT 4,
    'anon NÃO lê meetings.join_token',
    NOT has_column_privilege('anon', 'public.meetings', 'join_token', 'SELECT'),
    'coluna do segredo de convite'

  UNION ALL SELECT 5,
    'anon NÃO lê meetings.user_id nem livekit_room_name',
    NOT has_column_privilege('anon', 'public.meetings', 'user_id', 'SELECT')
      AND NOT has_column_privilege('anon', 'public.meetings', 'livekit_room_name', 'SELECT'),
    'privilégio por coluna'

  UNION ALL SELECT 6,
    'anon mantém as 4 colunas da tela de entrada',
    has_column_privilege('anon','public.meetings','id','SELECT')
      AND has_column_privilege('anon','public.meetings','title','SELECT')
      AND has_column_privilege('anon','public.meetings','starts_at','SELECT')
      AND has_column_privilege('anon','public.meetings','meeting_status','SELECT'),
    'id, title, starts_at, meeting_status'

  UNION ALL SELECT 7,
    'Toda reunião tem join_token',
    NOT EXISTS (SELECT 1 FROM public.meetings WHERE join_token IS NULL),
    (SELECT count(*)::text || ' reuniões no total' FROM public.meetings)

  UNION ALL SELECT 8,
    'Colunas de gravação criadas',
    (SELECT count(*) = 5 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='meetings' AND column_name LIKE 'recording%'),
    'recording_url, recording_status, recording_egress_id, recording_started_at, recording_ended_at'

  UNION ALL SELECT 9,
    'Trigger de novo usuário instalado',
    public.check_auth_trigger_exists(),
    'on_auth_user_created em auth.users'

  UNION ALL SELECT 10,
    'Todo usuário tem linha em user_settings',
    NOT EXISTS (SELECT 1 FROM auth.users u
                 WHERE NOT EXISTS (SELECT 1 FROM public.user_settings s WHERE s.user_id = u.id)),
    (SELECT count(*)::text || ' usuários' FROM auth.users)

  UNION ALL SELECT 11,
    'Realtime publica as 4 tabelas',
    (SELECT count(*) = 4 FROM pg_publication_tables
      WHERE pubname='supabase_realtime' AND schemaname='public'
        AND tablename IN ('meetings','meeting_transcripts','briefings','action_items')),
    'meetings, meeting_transcripts, briefings, action_items'

  UNION ALL SELECT 12,
    'RLS habilitada em todas as tabelas de public',
    (SELECT bool_and(relrowsecurity) FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind='r'),
    (SELECT count(*)::text || ' tabelas' FROM pg_class
      WHERE relnamespace='public'::regnamespace AND relkind='r')

  UNION ALL SELECT 13,
    'Job do cron agendado',
    EXISTS (SELECT 1 FROM cron.job WHERE jobname='briefbot-check-meetings'),
    COALESCE((SELECT schedule FROM cron.job WHERE jobname='briefbot-check-meetings'), 'ausente')

  UNION ALL SELECT 14,
    'app_config preenchida (PASSO MANUAL — ver abaixo)',
    (SELECT count(*) = 2 FROM public.app_config
      WHERE chave IN ('functions_base_url','cron_secret')),
    COALESCE((SELECT string_agg(chave, ', ' ORDER BY chave) FROM public.app_config), 'VAZIA — o cron roda e não faz nada')
) t
ORDER BY ord;
