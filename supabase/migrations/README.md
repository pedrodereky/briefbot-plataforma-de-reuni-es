# Migrations

Fonte da verdade do schema. Antes da Fase 0 este diretório **não existia** — o
banco só existia no projeto hospedado, sem histórico, sem rollback e sem como
recriar um ambiente.

## Estado atual

`20260911120000_baseline_schema.sql` é um **baseline reconstruído**, não um
dump. Ele foi derivado de:

- `src/integrations/supabase/types.ts` (tipos gerados pelo Supabase) — nomes de
  tabela, colunas e nulabilidade;
- `.lovable/plan.md` — desenho do Vault, das RPCs e do `api_keys_registry`;
- as chamadas reais das 17 edge functions e do frontend — assinaturas de RPC,
  índices e políticas que o código pressupõe.

O que **não** dá para derivar dessas fontes, e portanto é a melhor inferência a
partir do uso no código: valores DEFAULT, nomes de constraint, e o texto exato
das policies de RLS.

## Reconciliação obrigatória (antes de tratar como definitivo)

Com a CLI autenticada e a senha do banco em mãos:

```bash
supabase link --project-ref ardhtavnpywjhzscoajt
supabase db pull --schema public   # gera uma migration com o schema REAL
git diff                            # compare com o baseline
```

Se o `db pull` divergir, o schema real vence: ajuste o baseline e registre a
diferença no commit. Depois disso, toda mudança de schema passa a ser um novo
arquivo aqui — nunca uma edição no SQL Editor do painel.

## Como rodar os testes

Há dois, com propósitos diferentes.

**Antes de aplicar — banco descartável:**

```bash
./scripts/test-migrations.sh
```

Sobe um PostgreSQL efêmero, aplica todas as migrations em ordem, reaplica para
provar idempotência e roda `supabase/tests/schema_test.sql` (37 checagens). O
mesmo script roda no CI a cada push. **Não aponte para um banco real:** esse
arquivo insere dados de teste.

**Depois de aplicar — banco real:**

Cole `supabase/tests/verificar_producao.sql` no SQL Editor. É **somente
leitura** e pode rodar em produção quantas vezes quiser. Devolve 14 linhas com
✅ ou ❌, cobrindo a correção de privilégio, os limites do papel `anon`, o
backfill do `join_token`, as colunas de gravação, o trigger, o realtime, a RLS
e o cron.

O único ❌ esperado logo após aplicar é o do `app_config`, que depende do passo
manual abaixo. Qualquer outro ❌ indica que algo não aplicou.

## Garantias já verificadas

O baseline foi aplicado contra um PostgreSQL 16 real (com stubs para `auth`,
`vault` e os papéis `anon`/`authenticated`/`service_role`) e:

- aplica sem erro;
- é **idempotente** — a segunda aplicação não falha nem duplica nada;
- passa em 9 verificações funcionais: trigger de novo usuário cria
  `user_settings`; roundtrip completo `store` → `get` → `set_validation` →
  `delete` do Vault; `store` repetido atualiza em vez de duplicar; `DELETE` de
  reunião cascateia para transcrições; `check_auth_trigger_exists()` retorna
  verdadeiro; publicação de realtime cobre as 4 tabelas; RLS ligada em todas as
  tabelas de `public`.

## `20260911130000_fase1_join_token_e_rls.sql`

Fecha o acesso anônimo:

- `join_token` + `join_token_expires_at` em `meetings`, com trigger, default e
  backfill das reuniões existentes;
- `verify_join_token()` para as edge functions conferirem o convite;
- `anon` perde o `SELECT` amplo em `meetings` e passa a enxergar só
  `id, title, starts_at, meeting_status` (privilégio de coluna) — `join_token`,
  `user_id` e `livekit_room_name` ficam inacessíveis;
- leitura anônima de transcrição restrita a reuniões ao vivo;
- **correção crítica**: `REVOKE EXECUTE ... FROM PUBLIC` em todas as funções
  `SECURITY DEFINER`. O padrão anterior (`FROM anon, authenticated`) era no-op,
  e deixava `get_user_secret` chamável anonimamente via PostgREST — ou seja,
  qualquer um lia as chaves decriptadas do Vault de qualquer usuário.

## `20260911140000_fase2_gravacao_e_cron.sql`

- Cria as colunas `recording_*` em `meetings`. O código já escrevia em
  `recording_egress_id` e `recording_url` **antes de elas existirem**: o
  `.update()` falhava calado e `RecordingTab` usava `as any` para compilar.
- Versiona o job `briefbot-check-meetings` no `pg_cron`, que antes só existia
  se alguém tivesse clicado no painel.
- Cria `public.app_config`, inacessível a `anon` e `authenticated`, de onde o
  job lê a URL das functions e o `cron_secret` — assim a migration é idêntica
  em todo ambiente e nenhum segredo vira histórico versionado.

## Pendências deliberadas

Um anônimo com o id de uma reunião **ao vivo** ainda lê a transcrição dela. A
policy foi estreitada (antes era todo o histórico), mas fechar de vez exige
sessão autenticada para convidado — um JWT curto emitido contra o `join_token`,
maior do que coube na Fase 1.

`pg_cron` ainda não está versionado aqui — é a Fase 2 (item 14).
