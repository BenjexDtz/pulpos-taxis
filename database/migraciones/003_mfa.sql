-- Autenticación multifactor (TOTP) para el panel.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 003_mfa.sql
-- Tras aplicarla, cada administrador configura su app autenticadora en el siguiente inicio de sesión.

ALTER TABLE administradores
    ADD COLUMN IF NOT EXISTS mfa_activo          BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS mfa_secreto         TEXT,
    ADD COLUMN IF NOT EXISTS mfa_ultimo_paso     BIGINT,
    ADD COLUMN IF NOT EXISTS mfa_activado_en     TIMESTAMP,
    ADD COLUMN IF NOT EXISTS mfa_fallos          INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS mfa_bloqueado_hasta TIMESTAMP;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'administradores_mfa_check' AND conrelid = 'administradores'::regclass) THEN
        ALTER TABLE administradores ADD CONSTRAINT administradores_mfa_check CHECK (NOT mfa_activo OR mfa_secreto IS NOT NULL);
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS mfa_codigos_respaldo (
    id               SERIAL PRIMARY KEY,
    administrador_id INTEGER  NOT NULL REFERENCES administradores(id) ON DELETE CASCADE,
    codigo_hash      CHAR(64) NOT NULL,
    usado_en         TIMESTAMP,
    CONSTRAINT mfa_codigos_respaldo_unico UNIQUE (administrador_id, codigo_hash)
);
