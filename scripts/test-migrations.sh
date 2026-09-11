#!/usr/bin/env bash
#
# Sobe um PostgreSQL efêmero, aplica supabase/migrations/*.sql em ordem e roda
# supabase/tests/schema_test.sql contra o resultado.
#
# Uso:  ./scripts/test-migrations.sh
# Requer: postgresql (initdb, pg_ctl, psql) no PATH ou em /usr/lib/postgresql/*/bin
#
# Por que stubs: `auth`, `vault` e os papéis anon/authenticated/service_role são
# fornecidos pela plataforma Supabase. Aqui eles são recriados com o mínimo
# necessário para que as migrations rodem e o comportamento de privilégio seja
# fiel ao de produção.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PORT="${PGPORT_TEST:-55432}"
PGDATA_DIR="${PGDATA_TEST:-/var/tmp/briefbot-pgtest-$$}"
SOCKET_DIR="/tmp"

for d in /usr/lib/postgresql/*/bin; do [ -d "$d" ] && export PATH="$d:$PATH"; done
command -v initdb >/dev/null || { echo "ERRO: PostgreSQL não encontrado no PATH"; exit 1; }

RUN_AS=""
if [ "$(id -u)" = "0" ]; then RUN_AS="postgres"; fi

run() {
  if [ -n "$RUN_AS" ]; then su "$RUN_AS" -c "PATH=$PATH $1"; else bash -c "$1"; fi
}

cleanup() {
  run "pg_ctl -D $PGDATA_DIR stop -m immediate" >/dev/null 2>&1 || true
  rm -rf "$PGDATA_DIR"
}
trap cleanup EXIT

rm -rf "$PGDATA_DIR"; mkdir -p "$PGDATA_DIR"
[ -n "$RUN_AS" ] && chown "$RUN_AS" "$PGDATA_DIR"

echo "▸ iniciando PostgreSQL efêmero na porta $PORT"
run "initdb -D $PGDATA_DIR -A trust" >/dev/null
run "pg_ctl -D $PGDATA_DIR -l $PGDATA_DIR/log -o '-k $SOCKET_DIR -p $PORT' -w start" >/dev/null

PSQL="psql -h $SOCKET_DIR -p $PORT -U postgres -v ON_ERROR_STOP=1 -q"
$PSQL -c "CREATE DATABASE briefbot;" >/dev/null

echo "▸ criando stubs da plataforma (auth, vault, papéis)"
$PSQL -d briefbot >/dev/null <<'STUBS'
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon')          THEN CREATE ROLE anon;          END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role')  THEN CREATE ROLE service_role;  END IF;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS vault;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
GRANT USAGE ON SCHEMA public, extensions TO anon, authenticated, service_role;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(), email text);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
  $f$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
CREATE TABLE IF NOT EXISTS vault.secrets (
  id uuid PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  name text, description text, secret text);
CREATE OR REPLACE VIEW vault.decrypted_secrets AS
  SELECT id, name, secret AS decrypted_secret FROM vault.secrets;
CREATE OR REPLACE FUNCTION vault.create_secret(p_secret text, p_name text, p_description text DEFAULT '')
RETURNS uuid LANGUAGE plpgsql AS $f$
DECLARE v uuid; BEGIN
  INSERT INTO vault.secrets(name, description, secret)
       VALUES (p_name, p_description, p_secret) RETURNING id INTO v;
  RETURN v; END $f$;
STUBS

echo "▸ aplicando migrations"
FIRST=1
for migration in "$REPO_ROOT"/supabase/migrations/*.sql; do
  # supabase_vault não existe fora da plataforma; pgcrypto já veio nos stubs.
  sed '/CREATE EXTENSION IF NOT EXISTS supabase_vault/d; /CREATE EXTENSION IF NOT EXISTS pgcrypto/d' \
    "$migration" > "$PGDATA_DIR/current.sql"

  # Reproduz o estado pré-Fase-1: o Supabase concede grants amplos a anon e
  # authenticated. Sem isso, o REVOKE da Fase 1 não estaria sendo testado.
  if [ $FIRST -eq 0 ]; then
    $PSQL -d briefbot -c \
      "GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;" >/dev/null
  fi
  FIRST=0

  $PSQL -d briefbot -f "$PGDATA_DIR/current.sql" >/dev/null 2>&1
  echo "  ✓ $(basename "$migration")"
done

echo "▸ reaplicando todas as migrations (idempotência)"
for migration in "$REPO_ROOT"/supabase/migrations/*.sql; do
  sed '/CREATE EXTENSION IF NOT EXISTS supabase_vault/d; /CREATE EXTENSION IF NOT EXISTS pgcrypto/d' \
    "$migration" > "$PGDATA_DIR/current.sql"
  $PSQL -d briefbot -f "$PGDATA_DIR/current.sql" >/dev/null 2>&1 \
    || { echo "  ✗ $(basename "$migration") não é idempotente"; exit 1; }
done
echo "  ✓ todas reaplicam sem erro"

echo "▸ rodando supabase/tests/schema_test.sql"
PGOPTIONS='--client-min-messages=notice' \
psql -h "$SOCKET_DIR" -p "$PORT" -U postgres -d briefbot -v ON_ERROR_STOP=1 \
     -f "$REPO_ROOT/supabase/tests/schema_test.sql" 2>&1 \
  | sed -e 's/^psql:.*NOTICE:  //' -e 's/^NOTICE:  //' \
  | grep -E '^(ok |FALHOU|ERROR|=| TODOS|--- b)'
