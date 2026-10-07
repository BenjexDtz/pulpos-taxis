#!/bin/sh
set -e
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /auditoria/esquema.sql
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v clave_auditor="$AUDIT_APP_PASSWORD" -f /auditoria/rol_app.sql
