-- Usuario con el que el backend escribe en la bitácora: solo INSERT y SELECT.
-- Uso: psql -v clave_auditor='...' -d pulpos_auditoria -f rol_app.sql

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auditor_app') THEN
        CREATE ROLE auditor_app LOGIN;
    END IF;
END $$;

ALTER ROLE auditor_app WITH LOGIN NOSUPERUSER NOBYPASSRLS PASSWORD :'clave_auditor';

GRANT USAGE ON SCHEMA public TO auditor_app;
GRANT SELECT, INSERT ON eventos TO auditor_app;
GRANT EXECUTE ON FUNCTION auditoria_verificar() TO auditor_app;
