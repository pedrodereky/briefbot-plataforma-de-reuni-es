-- ============================================================================
-- ORGANIZAÇÕES E EQUIPE
--
-- Até aqui o modelo era estritamente um usuário por conta: toda policy dizia
-- `auth.uid() = user_id`. Esta migration passa o acesso a ser por ORGANIZAÇÃO,
-- para que um time compartilhe reuniões, atas, action items e contatos.
--
-- O que NÃO muda:
--   • as policies de convidado anônimo (rota /join), endurecidas na Fase 1 por
--     join_token — nenhuma delas é tocada aqui;
--   • user_settings, que continua por usuário: tema, prompts e preferências são
--     pessoais, não da empresa;
--   • api_keys_registry, que continua por usuário. As chaves da empresa passam
--     a ser resolvidas pelo DONO da organização (ver `dono_da_org` no fim), e
--     isso é aplicado nas edge functions, não aqui.
--
-- A coluna `user_id` das tabelas permanece: ela deixa de controlar acesso e
-- passa a registrar QUEM criou. Perder essa informação seria perder o histórico.
-- ============================================================================

-- ─── Tabelas ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.organization_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id)           ON DELETE CASCADE,
  -- owner  : criou a organização; não pode ser removido nem rebaixado
  -- admin  : administra a equipe
  -- member : usa o produto
  papel       text NOT NULL DEFAULT 'member'
              CHECK (papel IN ('owner', 'admin', 'member')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, user_id)
);

CREATE INDEX IF NOT EXISTS organization_members_user_idx ON public.organization_members (user_id);
CREATE INDEX IF NOT EXISTS organization_members_org_idx  ON public.organization_members (org_id);

-- Um único dono por organização: sem isto, dois "owner" podem se remover
-- mutuamente e a organização fica órfã.
CREATE UNIQUE INDEX IF NOT EXISTS organization_members_um_dono_idx
  ON public.organization_members (org_id) WHERE papel = 'owner';

-- ─── Funções de apoio ───────────────────────────────────────────────────────
--
-- SECURITY DEFINER de propósito: elas são usadas DENTRO das policies de
-- organization_members. Se lessem a tabela com RLS ligada, a policy chamaria a
-- função que consulta a tabela que dispara a policy — recursão infinita, que é
-- o erro clássico deste modelo.

CREATE OR REPLACE FUNCTION public.orgs_do_usuario()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT org_id FROM public.organization_members WHERE user_id = auth.uid();
$$;

COMMENT ON FUNCTION public.orgs_do_usuario() IS
  'Organizações de quem está chamando. Só enxerga a própria filiação.';

CREATE OR REPLACE FUNCTION public.pode_administrar(p_org uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
     WHERE org_id = p_org AND user_id = auth.uid() AND papel IN ('owner', 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.dono_da_org(p_org uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT user_id FROM public.organization_members
   WHERE org_id = p_org AND papel = 'owner' LIMIT 1;
$$;

COMMENT ON FUNCTION public.dono_da_org(uuid) IS
  'Dono da organização. As edge functions usam para resolver as chaves de API '
  'da empresa, em vez das de quem criou a reunião.';

-- As duas primeiras são chamadas dentro de policies, então quem consulta
-- precisa poder executá-las — e ambas só revelam dados do próprio chamador.
-- `dono_da_org` devolve o id de OUTRO usuário: fica restrita ao service_role.
REVOKE EXECUTE ON FUNCTION public.orgs_do_usuario()      FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.pode_administrar(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.dono_da_org(uuid)      FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.orgs_do_usuario()      TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.pode_administrar(uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.dono_da_org(uuid)      TO service_role;

-- ─── Colunas de organização ─────────────────────────────────────────────────

ALTER TABLE public.meetings ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS org_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE;

-- ─── Migração dos dados existentes ──────────────────────────────────────────
--
-- Cada usuário que já existe vira dono de uma organização própria, com os
-- dados dele dentro. Ninguém perde acesso a nada: o que era "meu" continua
-- meu, só que agora por outro caminho.

DO $$
DECLARE
  u record;
  nova_org uuid;
BEGIN
  FOR u IN
    SELECT au.id,
           COALESCE(
             NULLIF(au.raw_user_meta_data->>'full_name', ''),
             split_part(au.email, '@', 1),
             'Minha organização'
           ) AS nome
      FROM auth.users au
     WHERE NOT EXISTS (
       SELECT 1 FROM public.organization_members m WHERE m.user_id = au.id
     )
  LOOP
    INSERT INTO public.organizations (nome) VALUES (u.nome) RETURNING id INTO nova_org;
    INSERT INTO public.organization_members (org_id, user_id, papel)
         VALUES (nova_org, u.id, 'owner');

    UPDATE public.meetings SET org_id = nova_org WHERE user_id = u.id AND org_id IS NULL;
    UPDATE public.contacts SET org_id = nova_org WHERE user_id = u.id AND org_id IS NULL;
  END LOOP;
END $$;

-- Linhas órfãs (usuário apagado) não têm organização a que pertencer.
DELETE FROM public.meetings WHERE org_id IS NULL;
DELETE FROM public.contacts WHERE org_id IS NULL;

ALTER TABLE public.meetings ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE public.contacts ALTER COLUMN org_id SET NOT NULL;

-- Rede de segurança: `org_id` se preenche sozinho com a organização de quem
-- está inserindo. Sem isto, todo INSERT existente — no app e em qualquer
-- function futura — quebraria por NOT NULL, e a migração viraria uma caçada a
-- pontos de inserção. A policy WITH CHECK continua valendo por cima.
CREATE OR REPLACE FUNCTION public.org_atual()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT org_id FROM public.organization_members
   WHERE user_id = auth.uid()
   ORDER BY created_at
   LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION public.org_atual() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.org_atual() TO authenticated, service_role;

ALTER TABLE public.meetings ALTER COLUMN org_id SET DEFAULT public.org_atual();
ALTER TABLE public.contacts ALTER COLUMN org_id SET DEFAULT public.org_atual();

CREATE INDEX IF NOT EXISTS meetings_org_id_idx ON public.meetings (org_id);
CREATE INDEX IF NOT EXISTS contacts_org_id_idx ON public.contacts (org_id);

-- Contato é único por ORGANIZAÇÃO agora, não por pessoa: senão cada membro
-- teria a própria cópia de "joao@cliente.com" e a contagem de reuniões
-- rachava entre elas.
DROP INDEX IF EXISTS public.contacts_user_email_idx;
CREATE UNIQUE INDEX IF NOT EXISTS contacts_org_email_idx ON public.contacts (org_id, email);

-- ─── Privilégios de tabela ──────────────────────────────────────────────────
--
-- Explícito em vez de herdado: o membro LÊ a organização e a equipe, e só o
-- nome da organização é editável por ele (a policy decide quem). Entrar, sair,
-- promover e rebaixar passam sempre pelo service_role, na edge function — sem
-- INSERT nem DELETE aqui, um membro não se promove pelo cliente.
GRANT SELECT          ON public.organizations        TO authenticated;
GRANT UPDATE (nome)   ON public.organizations        TO authenticated;
GRANT SELECT          ON public.organization_members TO authenticated;
GRANT ALL             ON public.organizations        TO service_role;
GRANT ALL             ON public.organization_members TO service_role;

-- ─── RLS das tabelas novas ──────────────────────────────────────────────────

ALTER TABLE public.organizations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Membros leem a própria organização" ON public.organizations;
CREATE POLICY "Membros leem a própria organização" ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.orgs_do_usuario()));

DROP POLICY IF EXISTS "Admin renomeia a organização" ON public.organizations;
CREATE POLICY "Admin renomeia a organização" ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.pode_administrar(id))
  WITH CHECK (public.pode_administrar(id));

DROP POLICY IF EXISTS "Membros veem a equipe" ON public.organization_members;
CREATE POLICY "Membros veem a equipe" ON public.organization_members
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT public.orgs_do_usuario()));

-- Escrita na filiação passa SEMPRE pela edge function com service_role. Um
-- membro autenticado não promove a si mesmo nem convida ninguém pelo cliente.
DROP POLICY IF EXISTS "Filiação é gerida pelo servidor" ON public.organization_members;

-- ─── RLS das tabelas de dados: de dono para organização ─────────────────────
--
-- Só as policies de `authenticated` mudam. As de `anon` (convidado da rota
-- /join, com join_token) ficam exatamente como a Fase 1 as deixou.

DROP POLICY IF EXISTS "Users manage own meetings" ON public.meetings;
DROP POLICY IF EXISTS "Organização gerencia suas reuniões" ON public.meetings;
CREATE POLICY "Organização gerencia suas reuniões" ON public.meetings
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.orgs_do_usuario()))
  WITH CHECK (org_id IN (SELECT public.orgs_do_usuario()));

DROP POLICY IF EXISTS "Users manage own contacts" ON public.contacts;
DROP POLICY IF EXISTS "Organização gerencia seus contatos" ON public.contacts;
CREATE POLICY "Organização gerencia seus contatos" ON public.contacts
  FOR ALL TO authenticated
  USING (org_id IN (SELECT public.orgs_do_usuario()))
  WITH CHECK (org_id IN (SELECT public.orgs_do_usuario()));

DROP POLICY IF EXISTS "Users manage briefings of own meetings" ON public.briefings;
DROP POLICY IF EXISTS "Organização gerencia briefings" ON public.briefings;
CREATE POLICY "Organização gerencia briefings" ON public.briefings
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = briefings.meeting_id
                    AND m.org_id IN (SELECT public.orgs_do_usuario())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = briefings.meeting_id
                    AND m.org_id IN (SELECT public.orgs_do_usuario())));

DROP POLICY IF EXISTS "Users manage action items of own meetings" ON public.action_items;
DROP POLICY IF EXISTS "Organização gerencia action items" ON public.action_items;
CREATE POLICY "Organização gerencia action items" ON public.action_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = action_items.meeting_id
                    AND m.org_id IN (SELECT public.orgs_do_usuario())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = action_items.meeting_id
                    AND m.org_id IN (SELECT public.orgs_do_usuario())));

DROP POLICY IF EXISTS "Users manage transcripts of own meetings" ON public.meeting_transcripts;
DROP POLICY IF EXISTS "Organização gerencia transcrições" ON public.meeting_transcripts;
CREATE POLICY "Organização gerencia transcrições" ON public.meeting_transcripts
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = meeting_transcripts.meeting_id
                    AND m.org_id IN (SELECT public.orgs_do_usuario())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meetings m
                  WHERE m.id = meeting_transcripts.meeting_id
                    AND m.org_id IN (SELECT public.orgs_do_usuario())));

-- ─── Novo usuário entra numa organização ────────────────────────────────────
--
-- Cadastro normal pelo site: cria a própria organização e vira dono dela.
-- Criado por um admin (edge function manage-team): a org vem em
-- raw_user_meta_data.org_id, e ele entra NESSA, com o papel pedido.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  org_convidada uuid;
  papel_pedido  text;
  nova_org      uuid;
BEGIN
  INSERT INTO public.user_settings (user_id)
       VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;

  BEGIN
    org_convidada := NULLIF(NEW.raw_user_meta_data->>'org_id', '')::uuid;
  EXCEPTION WHEN others THEN
    -- Metadado malformado não pode impedir o cadastro: cai no caminho de
    -- criar organização própria.
    org_convidada := NULL;
  END;

  papel_pedido := COALESCE(NULLIF(NEW.raw_user_meta_data->>'papel', ''), 'member');
  IF papel_pedido NOT IN ('admin', 'member') THEN
    papel_pedido := 'member';   -- 'owner' nunca vem por convite
  END IF;

  IF org_convidada IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.organizations o WHERE o.id = org_convidada) THEN
    INSERT INTO public.organization_members (org_id, user_id, papel)
         VALUES (org_convidada, NEW.id, papel_pedido)
    ON CONFLICT (org_id, user_id) DO NOTHING;
  ELSE
    INSERT INTO public.organizations (nome)
         VALUES (COALESCE(
           NULLIF(NEW.raw_user_meta_data->>'full_name', ''),
           split_part(NEW.email, '@', 1),
           'Minha organização'))
      RETURNING id INTO nova_org;
    INSERT INTO public.organization_members (org_id, user_id, papel)
         VALUES (nova_org, NEW.id, 'owner');
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- A lição da auditoria: EXECUTE nasce concedido a PUBLIC, então revogar só de
-- anon/authenticated não faz nada. Esta varredura fecha qualquer função
-- SECURITY DEFINER criada aqui que tenha escapado.
DO $$
DECLARE fn record;
BEGIN
  FOR fn IN SELECT p.oid::regprocedure AS assinatura
              FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
             WHERE n.nspname = 'public' AND p.prosecdef
               AND p.proname IN ('handle_new_user', 'dono_da_org')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn.assinatura);
  END LOOP;
END $$;
