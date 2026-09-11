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

## Pendências deliberadas

Duas policies reproduzem, **de propósito**, uma fragilidade conhecida:
`anon SELECT` em `meetings` e em `meeting_transcripts` liberam qualquer
requisição anônima que conheça um id. Isso é o estado atual exigido pela rota
`/join/:id` e está marcado com `⚠️` no SQL. A Fase 1 (item 3) troca por acesso
via `join_token` com expiração.

`pg_cron` ainda não está versionado aqui — é a Fase 2 (item 14).
