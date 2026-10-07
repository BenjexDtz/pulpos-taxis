-- Tablas de la base principal que acompañan a la bitácora de auditoría.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 002_auditoria.sql

CREATE TABLE IF NOT EXISTS auditoria_anclas (
    id          SERIAL PRIMARY KEY,
    evento_id   BIGINT   NOT NULL UNIQUE,
    hash        CHAR(64) NOT NULL,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS auditoria_pendiente (
    id          SERIAL PRIMARY KEY,
    evento      JSONB    NOT NULL,
    intentos    INTEGER  NOT NULL DEFAULT 0,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
