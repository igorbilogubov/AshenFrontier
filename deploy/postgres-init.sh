#!/bin/sh
set -eu
# Password stays a psql variable and never appears in generated SQL or log output.
case "$ASHEN_DB_PASSWORD" in
  ''|*[!a-fA-F0-9]*) echo 'ASHEN_DB_PASSWORD must be random hexadecimal text' >&2; exit 1 ;;
esac
if [ "${#ASHEN_DB_PASSWORD}" -lt 32 ]; then
  echo 'ASHEN_DB_PASSWORD must contain at least 32 random hex characters' >&2; exit 1
fi
psql -v ON_ERROR_STOP=1 -v app_password="$ASHEN_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE ashen_game LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
ALTER DATABASE ashen_frontier OWNER TO ashen_game;
GRANT USAGE, CREATE ON SCHEMA public TO ashen_game;
SQL
