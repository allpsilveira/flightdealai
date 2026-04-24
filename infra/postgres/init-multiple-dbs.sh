#!/bin/bash
# Creates multiple databases from the POSTGRES_MULTIPLE_DATABASES env var.
# Usage: POSTGRES_MULTIPLE_DATABASES=db1,db2
set -e

function create_db() {
    local db=$1
    echo "Creating database '$db' if it does not exist"
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
        SELECT 'CREATE DATABASE "$db"'
        WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = '$db')\gexec
        GRANT ALL PRIVILEGES ON DATABASE "$db" TO "$POSTGRES_USER";
EOSQL
    # Enable TimescaleDB only on the app database
    if [ "$db" = "flightdeal" ]; then
        psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
            CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;
EOSQL
        echo "TimescaleDB enabled on '$db'"
    fi
}

if [ -n "$POSTGRES_MULTIPLE_DATABASES" ]; then
    echo "Creating additional databases: $POSTGRES_MULTIPLE_DATABASES"
    for db in $(echo $POSTGRES_MULTIPLE_DATABASES | tr ',' ' '); do
        # Skip the default database (already created by POSTGRES_DB)
        if [ "$db" != "$POSTGRES_USER" ]; then
            create_db $db
        fi
    done
fi
