#!/bin/sh
# First start of an empty data volume only (docker-entrypoint-initdb.d). Two roles:
# - slotly_owner owns the database and the schema: migrations run as it (DDL);
# - slotly_app only reads and writes rows: the API runs as it. An SQL injection in the API
#   could not drop or alter a table (ADR-019).
# Passwords come from the environment and reach SQL as psql variables (:'name'), quoted by
# psql, never spliced into the statement text.
set -eu

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v owner_password="$SLOTLY_OWNER_PASSWORD" -v app_password="$SLOTLY_APP_PASSWORD" <<'SQL'
CREATE ROLE slotly_owner LOGIN PASSWORD :'owner_password';
CREATE ROLE slotly_app LOGIN PASSWORD :'app_password';
CREATE DATABASE slotly OWNER slotly_owner;
REVOKE ALL ON DATABASE slotly FROM PUBLIC;
GRANT CONNECT ON DATABASE slotly TO slotly_app;
SQL

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname slotly <<'SQL'
-- PostgreSQL 15+: the public schema belongs to the database owner, nobody else may create in it
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO slotly_app;
-- Tables and sequences the owner creates later (migrations) are usable by the app, rows only
ALTER DEFAULT PRIVILEGES FOR ROLE slotly_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO slotly_app;
ALTER DEFAULT PRIVILEGES FOR ROLE slotly_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO slotly_app;
SQL
