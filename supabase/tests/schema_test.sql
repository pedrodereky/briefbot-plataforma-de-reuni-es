-- ============================================================================
-- Suíte de testes do schema
-- ============================================================================
-- Roda com scripts/test-migrations.sh, que sobe um PostgreSQL efêmero, aplica
-- supabase/migrations/*.sql em ordem e executa este arquivo.
--
-- Cada checagem que falhar aborta com exceção — psql sai com código != 0.
-- ============================================================================

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.check(_nome text, _condicao boolean)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF _condicao IS NOT TRUE THEN
    RAISE EXCEPTION 'FALHOU: %', _nome;
  END IF;
  RAISE NOTICE 'ok  %', _nome;
END $$;

DO $$
DECLARE
  v_dono    uuid := '11111111-1111-1111-1111-111111111111';
  v_viva    uuid := '22222222-2222-2222-2222-222222222222';
  v_fim     uuid := '33333333-3333-3333-3333-333333333333';
  v_token   text;
  v_secret  uuid;
  v_org_dono uuid;
BEGIN
  -- ── Trigger de novo usuário ───────────────────────────────────────────────
  INSERT INTO auth.users (id, email) VALUES (v_dono, 'dono@exemplo.com');
  PERFORM pg_temp.check('trigger cria user_settings para novo usuário',
    (SELECT count(*) = 1 FROM public.user_settings WHERE user_id = v_dono));

  SELECT org_id INTO v_org_dono FROM public.organization_members WHERE user_id = v_dono;

  -- ── Roundtrip do Vault ────────────────────────────────────────────────────
  v_secret := public.store_user_secret(v_dono, 'deepgram_api_key', 'chave-original');
  PERFORM pg_temp.check('store_user_secret grava no vault', v_secret IS NOT NULL);
  PERFORM pg_temp.check('get_user_secret devolve o valor gravado',
    public.get_user_secret(v_dono, 'deepgram_api_key') = 'chave-original');

  PERFORM public.store_user_secret(v_dono, 'deepgram_api_key', 'chave-nova');
  PERFORM pg_temp.check('store repetido atualiza em vez de duplicar',
    (SELECT count(*) = 1 FROM public.api_keys_registry WHERE user_id = v_dono)
    AND public.get_user_secret(v_dono, 'deepgram_api_key') = 'chave-nova');

  PERFORM public.set_secret_validation(v_dono, 'deepgram_api_key', 'valid');
  PERFORM pg_temp.check('set_secret_validation marca status e data',
    (SELECT validation_status = 'valid' AND last_validated_at IS NOT NULL
       FROM public.api_keys_registry WHERE user_id = v_dono));

  PERFORM public.delete_user_secret(v_dono, 'deepgram_api_key');
  PERFORM pg_temp.check('delete_user_secret limpa registry e vault',
    (SELECT count(*) = 0 FROM public.api_keys_registry)
    AND (SELECT count(*) = 0 FROM vault.secrets));

  -- ── Reuniões e join_token ─────────────────────────────────────────────────
  INSERT INTO public.meetings (id, user_id, org_id, calendar_event_id, title, starts_at, meeting_status)
       VALUES (v_viva, v_dono, v_org_dono, 'cal-1', 'Reunião ao vivo', now(), 'live');
  INSERT INTO public.meetings (id, user_id, org_id, calendar_event_id, title, starts_at, meeting_status)
       VALUES (v_fim,  v_dono, v_org_dono, 'cal-2', 'Reunião encerrada', now(), 'ended');

  SELECT join_token INTO v_token FROM public.meetings WHERE id = v_viva;

  PERFORM pg_temp.check('join_token gerado automaticamente no INSERT',
    v_token IS NOT NULL AND length(v_token) >= 30);
  PERFORM pg_temp.check('join_token não repete entre reuniões',
    (SELECT count(DISTINCT join_token) = 2 FROM public.meetings));
  PERFORM pg_temp.check('join_token_expires_at preenchido no futuro',
    (SELECT join_token_expires_at > now() FROM public.meetings WHERE id = v_viva));

  PERFORM pg_temp.check('verify_join_token aceita token correto',
    (SELECT count(*) = 1 FROM public.verify_join_token(v_viva, v_token)));
  PERFORM pg_temp.check('verify_join_token recusa token errado',
    (SELECT count(*) = 0 FROM public.verify_join_token(v_viva, 'token-invalido')));
  PERFORM pg_temp.check('verify_join_token recusa token nulo',
    (SELECT count(*) = 0 FROM public.verify_join_token(v_viva, NULL)));
  PERFORM pg_temp.check('verify_join_token recusa token de outra reunião',
    (SELECT count(*) = 0 FROM public.verify_join_token(v_fim, v_token)));

  UPDATE public.meetings SET join_token_expires_at = now() - interval '1 hour' WHERE id = v_viva;
  PERFORM pg_temp.check('verify_join_token recusa token expirado',
    (SELECT count(*) = 0 FROM public.verify_join_token(v_viva, v_token)));
  UPDATE public.meetings SET join_token_expires_at = now() + interval '1 day' WHERE id = v_viva;

  -- ── Integridade referencial ───────────────────────────────────────────────
  INSERT INTO public.meeting_transcripts (meeting_id, text) VALUES (v_viva, 'fala ao vivo');
  INSERT INTO public.meeting_transcripts (meeting_id, text) VALUES (v_fim,  'fala encerrada');
  PERFORM pg_temp.check('check_auth_trigger_exists enxerga o trigger instalado',
    public.check_auth_trigger_exists());

  -- ── Realtime e RLS ────────────────────────────────────────────────────────
  PERFORM pg_temp.check('realtime publica as 4 tabelas esperadas',
    (SELECT count(*) = 4 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public'));
  PERFORM pg_temp.check('RLS habilitada em toda tabela de public',
    (SELECT bool_and(relrowsecurity) FROM pg_class
      WHERE relnamespace = 'public'::regnamespace AND relkind = 'r'));

  -- ── Privilégios: nenhuma SECURITY DEFINER alcançável por anon ─────────────
  -- Regressão que este teste existe para impedir: `REVOKE ... FROM anon` é
  -- no-op, porque o EXECUTE vem de PUBLIC. Sem revogar de PUBLIC, um anônimo
  -- lê segredo do Vault via POST /rest/v1/rpc/get_user_secret.
  -- A exceção deliberada são as duas da tela de convite: get_join_meeting só
  -- responde com o join_token certo, e meeting_is_live devolve um booleano
  -- sobre um id que o anônimo já precisa conhecer.
  PERFORM pg_temp.check('só a tela de convite tem SECURITY DEFINER executável por anon',
    (SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), '{}')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('anon', p.oid, 'EXECUTE'))
    = ARRAY['get_join_meeting', 'meeting_is_live']);
  -- `authenticated` tem uma lista curta e deliberada. As três primeiras são
  -- chamadas DENTRO de policies de RLS — a expressão da policy roda com os
  -- privilégios de quem consulta, então sem EXECUTE ninguém lê nada. E as três
  -- só revelam dados do próprio chamador: em que organizações ele está, se
  -- administra uma, e qual é a dele. Qualquer função nova fora desta lista
  -- reprova aqui, que é o ponto.
  PERFORM pg_temp.check('só a lista deliberada é executável por authenticated',
    (SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), '{}')
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE'))
    = ARRAY['get_join_meeting', 'meeting_is_live', 'org_atual', 'orgs_do_usuario', 'pode_administrar']);

  PERFORM pg_temp.check('as que leem dado de terceiro seguem fora do alcance',
    (SELECT count(*) = 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef
        AND p.proname IN ('get_user_secret', 'store_user_secret', 'delete_user_secret',
                          'dono_da_org', 'install_auth_trigger', 'handle_new_user')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')));  PERFORM pg_temp.check('service_role mantém EXECUTE nas SECURITY DEFINER',
    (SELECT bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.prosecdef));

  -- ── Privilégios de coluna: anon não enxerga join_token ────────────────────
  PERFORM pg_temp.check('anon NÃO tem SELECT em meetings.join_token',
    NOT has_column_privilege('anon', 'public.meetings', 'join_token', 'SELECT'));
  PERFORM pg_temp.check('anon NÃO tem SELECT em meetings.user_id',
    NOT has_column_privilege('anon', 'public.meetings', 'user_id', 'SELECT'));
  PERFORM pg_temp.check('anon NÃO tem SELECT em meetings.livekit_room_name',
    NOT has_column_privilege('anon', 'public.meetings', 'livekit_room_name', 'SELECT'));
  -- Desde 20261114120000 o anônimo não lê `meetings` diretamente: a tela de
  -- convite usa get_join_meeting, que exige o token.
  PERFORM pg_temp.check('anon NÃO lê nenhuma coluna de meetings',
    NOT has_table_privilege('anon', 'public.meetings', 'SELECT')
    AND NOT has_column_privilege('anon', 'public.meetings', 'id', 'SELECT')
    AND NOT has_column_privilege('anon', 'public.meetings', 'title', 'SELECT'));
  PERFORM pg_temp.check('nenhuma policy de SELECT para anon em meetings',
    NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE schemaname = 'public' AND tablename = 'meetings'
                   AND 'anon' = ANY (roles) AND cmd IN ('SELECT', 'ALL')));
  PERFORM pg_temp.check('get_join_meeting devolve a reunião com o token certo',
    (SELECT count(*) = 1 FROM public.get_join_meeting(v_viva, v_token)));
  PERFORM pg_temp.check('get_join_meeting não devolve nada com token errado',
    (SELECT count(*) = 0 FROM public.get_join_meeting(v_viva, 'token-errado')));
  PERFORM pg_temp.check('get_join_meeting não devolve nada sem token',
    (SELECT count(*) = 0 FROM public.get_join_meeting(v_viva, NULL)));

  -- ── Gravação (Fase 2) ─────────────────────────────────────────────────────
  -- O código escrevia nestas colunas antes de elas existirem, e o erro do
  -- .update() não era checado — a gravação falhava em silêncio.
  PERFORM pg_temp.check('meetings tem as colunas de gravação',
    (SELECT count(*) = 5 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'meetings'
        AND column_name IN ('recording_egress_id', 'recording_url',
                            'recording_started_at', 'recording_ended_at',
                            'recording_status')));

  PERFORM pg_temp.check('anon NÃO enxerga recording_url',
    NOT has_column_privilege('anon', 'public.meetings', 'recording_url', 'SELECT'));

  UPDATE public.meetings
     SET recording_url = 'https://exemplo/gravacao.mp4', recording_status = 'ready'
   WHERE id = v_viva;
  PERFORM pg_temp.check('gravação persiste na reunião',
    (SELECT recording_url IS NOT NULL FROM public.meetings WHERE id = v_viva));

  PERFORM pg_temp.check('índice parcial de gravações existe',
    EXISTS (SELECT 1 FROM pg_indexes
             WHERE schemaname = 'public' AND indexname = 'meetings_com_gravacao_idx'));

  UPDATE public.meetings SET recording_url = NULL, recording_status = NULL WHERE id = v_viva;

  -- ── Cron versionado (Fase 2) ──────────────────────────────────────────────
  PERFORM pg_temp.check('job do cron agendado a cada 5 minutos',
    (SELECT schedule = '*/5 * * * *' FROM cron.job WHERE jobname = 'briefbot-check-meetings'));

  PERFORM pg_temp.check('app_config inacessível a anon e authenticated',
    NOT has_table_privilege('anon', 'public.app_config', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.app_config', 'SELECT'));

  -- Sem configuração, o disparo não deve estourar nem chamar nada.
  PERFORM public.disparar_cron_reunioes();
  PERFORM pg_temp.check('cron sem app_config não dispara chamada',
    (SELECT count(*) = 0 FROM net.chamadas));

  INSERT INTO public.app_config (chave, valor) VALUES
    ('functions_base_url', 'https://exemplo.supabase.co/functions/v1'),
    ('cron_secret',        'segredo-de-teste')
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor;

  PERFORM public.disparar_cron_reunioes();
  PERFORM pg_temp.check('cron configurado chama cron-check-meetings',
    (SELECT count(*) = 1 FROM net.chamadas
      WHERE url = 'https://exemplo.supabase.co/functions/v1/cron-check-meetings'));
  PERFORM pg_temp.check('cron envia o header x-cron-secret',
    (SELECT headers ->> 'x-cron-secret' = 'segredo-de-teste'
       FROM net.chamadas ORDER BY id DESC LIMIT 1));

  RAISE NOTICE '--- bloco principal concluído ---';
END $$;

-- ── Organizações e equipe ───────────────────────────────────────────────────
DO $$
DECLARE
  v_dono     uuid := '11111111-1111-1111-1111-111111111111';  -- criado acima
  v_colega   uuid := '44444444-4444-4444-4444-444444444444';
  v_estranho uuid := '55555555-5555-5555-5555-555555555555';
  v_org_a    uuid;
  v_org_b    uuid;
  v_reuniao  uuid;
BEGIN
  -- O trigger deve ter dado uma organização ao primeiro usuário, como dono.
  SELECT org_id INTO v_org_a FROM public.organization_members WHERE user_id = v_dono;
  PERFORM pg_temp.check('trigger cria organização para novo usuário', v_org_a IS NOT NULL);
  PERFORM pg_temp.check('quem cadastra vira dono',
    (SELECT papel FROM public.organization_members WHERE user_id = v_dono) = 'owner');

  -- Convidado por um admin: entra NA organização existente, não numa nova.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES (v_colega, 'colega@exemplo.com',
               jsonb_build_object('org_id', v_org_a::text, 'papel', 'member'));
  PERFORM pg_temp.check('convidado entra na organização indicada',
    (SELECT org_id FROM public.organization_members WHERE user_id = v_colega) = v_org_a);
  PERFORM pg_temp.check('convidado não ganha organização própria',
    (SELECT count(*) = 1 FROM public.organization_members WHERE user_id = v_colega));
  PERFORM pg_temp.check('papel pedido é respeitado',
    (SELECT papel FROM public.organization_members WHERE user_id = v_colega) = 'member');

  -- Um estranho, com organização própria.
  INSERT INTO auth.users (id, email) VALUES (v_estranho, 'estranho@outra.com');
  SELECT org_id INTO v_org_b FROM public.organization_members WHERE user_id = v_estranho;
  PERFORM pg_temp.check('estranho fica em outra organização', v_org_b <> v_org_a);

  -- Convite não promove a dono, mesmo pedindo.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ('66666666-6666-6666-6666-666666666666', 'espertinho@exemplo.com',
               jsonb_build_object('org_id', v_org_a::text, 'papel', 'owner'));
  PERFORM pg_temp.check('convite nunca concede o papel de dono',
    (SELECT papel FROM public.organization_members
      WHERE user_id = '66666666-6666-6666-6666-666666666666') = 'member');

  -- Metadado malformado não pode impedir o cadastro.
  INSERT INTO auth.users (id, email, raw_user_meta_data)
       VALUES ('77777777-7777-7777-7777-777777777777', 'torto@exemplo.com',
               jsonb_build_object('org_id', 'nao-e-uuid'));
  PERFORM pg_temp.check('org_id inválido cai em organização própria',
    (SELECT count(*) = 1 FROM public.organization_members
      WHERE user_id = '77777777-7777-7777-7777-777777777777'));

  -- Reunião da organização A, criada pelo dono.
  INSERT INTO public.meetings (id, user_id, org_id, calendar_event_id, title, starts_at)
       VALUES (extensions.gen_random_uuid(), v_dono, v_org_a, 'evt-equipe',
               'Reunião da equipe', now() + interval '1 day')
    RETURNING id INTO v_reuniao;

  PERFORM pg_temp.check('dono_da_org devolve o dono', public.dono_da_org(v_org_a) = v_dono);
  PERFORM pg_temp.check('só um dono por organização',
    (SELECT count(*) = 1 FROM public.organization_members
      WHERE org_id = v_org_a AND papel = 'owner'));
END $$;

-- Isolamento e compartilhamento, com RLS de verdade ligada.
SET ROLE authenticated;

SET request.jwt.claim.sub = '44444444-4444-4444-4444-444444444444';   -- colega
SELECT pg_temp.check('colega da mesma organização VÊ a reunião',
  (SELECT count(*) = 1 FROM public.meetings WHERE calendar_event_id = 'evt-equipe'));

SET request.jwt.claim.sub = '55555555-5555-5555-5555-555555555555';   -- estranho
SELECT pg_temp.check('estranho de outra organização NÃO vê a reunião',
  (SELECT count(*) = 0 FROM public.meetings WHERE calendar_event_id = 'evt-equipe'));

SELECT pg_temp.check('estranho não enxerga a equipe alheia',
  (SELECT count(*) = 1 FROM public.organization_members));

RESET ROLE;

-- Quem é autenticado não pode descobrir o dono de uma organização qualquer.
SET ROLE authenticated;
DO $$
BEGIN
  PERFORM public.dono_da_org('00000000-0000-0000-0000-000000000000');
  RAISE EXCEPTION 'FALHOU: authenticated executou dono_da_org';
EXCEPTION
  WHEN insufficient_privilege THEN
    RAISE NOTICE 'ok  authenticated NÃO executa dono_da_org';
END $$;
RESET ROLE;


-- ── Comportamento efetivo do papel anon (fora do bloco, para poder SET ROLE) ─
-- O token é lido antes, como superusuário: o anônimo não enxerga a coluna.
SELECT join_token AS token_viva FROM public.meetings
 WHERE id = '22222222-2222-2222-2222-222222222222' \gset

SET ROLE anon;

SELECT pg_temp.check('anon NÃO lê meetings diretamente',
  NOT has_table_privilege('public.meetings', 'SELECT'));

SELECT pg_temp.check('anon obtém a reunião com o token do convite',
  (SELECT count(*) = 1 FROM public.get_join_meeting(
     '22222222-2222-2222-2222-222222222222', :'token_viva')));

SELECT pg_temp.check('anon NÃO obtém a reunião sem o token',
  (SELECT count(*) = 0 FROM public.get_join_meeting(
     '22222222-2222-2222-2222-222222222222', NULL)));

SELECT pg_temp.check('anon lê transcrição de reunião ao vivo',
  (SELECT count(*) = 1 FROM public.meeting_transcripts
    WHERE meeting_id = '22222222-2222-2222-2222-222222222222'));

SELECT pg_temp.check('anon NÃO lê transcrição de reunião encerrada',
  (SELECT count(*) = 0 FROM public.meeting_transcripts
    WHERE meeting_id = '33333333-3333-3333-3333-333333333333'));

RESET ROLE;

\echo ''
\echo '================================'
\echo ' TODOS OS TESTES DO SCHEMA OK'
\echo '================================'
