#!/usr/bin/env bash
# 用本機 Postgres 16 跑 migration ＋ 煙霧測試（不需要 Docker／Supabase CLI）
# 需要：psql 可連到一個可建立資料庫的 Postgres（預設 localhost:5432、使用者 postgres）
set -euo pipefail
cd "$(dirname "$0")/.."
PSQL="psql -v ON_ERROR_STOP=1 -q ${PGHOST:+-h $PGHOST} -p ${PGPORT:-5432} -U ${PGUSER:-postgres}"
DB=${TEST_DB:-bookhaus_test}
$PSQL -d postgres -c "drop database if exists $DB" -c "create database $DB"
$PSQL -d "$DB" -f tests/local_stub.sql
for f in migrations/*.sql; do $PSQL -d "$DB" -f "$f"; done
$PSQL -d "$DB" -f seed.sql
for t in tests/smoke_test.sql tests/smoke_m2.sql tests/smoke_m3.sql; do
  out=$($PSQL -d "$DB" -At -f "$t" 2>&1) || { echo "$out"; exit 1; }
  echo "$out" | grep -E "ok \(expected|PASSED"
done
