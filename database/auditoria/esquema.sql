-- ═══════════════════════════════════════════════════════════════════════════════
-- Base de datos de auditoría — bitácora de solo inserción con cadena de hashes
-- Cada evento guarda el SHA-256 del anterior: alterar o borrar uno rompe la cadena.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS eventos_id_seq;

CREATE TABLE IF NOT EXISTS eventos (
    id              BIGINT       PRIMARY KEY,
    ocurrido_en     TIMESTAMPTZ  NOT NULL,
    registrado_en   TIMESTAMPTZ  NOT NULL,
    empresa_id      INTEGER,
    actor_tipo      VARCHAR(20)  NOT NULL CHECK (actor_tipo IN ('superadmin', 'admin', 'chofer', 'anonimo', 'sistema')),
    actor_id        INTEGER,
    actor_rol       VARCHAR(30),
    actor_nombre    VARCHAR(120),
    accion          VARCHAR(60)  NOT NULL,
    entidad         VARCHAR(40),
    entidad_id      VARCHAR(40),
    resultado       VARCHAR(12)  NOT NULL CHECK (resultado IN ('exito', 'rechazado', 'error')),
    detalle         VARCHAR(300),
    datos_antes     JSONB,
    datos_despues   JSONB,
    ip              VARCHAR(64),
    user_agent      VARCHAR(300),
    hash_anterior   CHAR(64)     NOT NULL,
    hash            CHAR(64)     NOT NULL UNIQUE
);

CREATE INDEX IF NOT EXISTS eventos_empresa_fecha_idx ON eventos (empresa_id, ocurrido_en DESC);
CREATE INDEX IF NOT EXISTS eventos_accion_idx        ON eventos (accion);

CREATE OR REPLACE FUNCTION auditoria_hash(e eventos) RETURNS CHAR(64)
LANGUAGE sql IMMUTABLE AS $$
    SELECT encode(sha256(convert_to(jsonb_build_array(
        e.id,
        to_char(e.ocurrido_en   AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        to_char(e.registrado_en AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US'),
        e.empresa_id, e.actor_tipo, e.actor_id, e.actor_rol, e.actor_nombre,
        e.accion, e.entidad, e.entidad_id, e.resultado, e.detalle,
        e.datos_antes, e.datos_despues, e.ip, e.user_agent, e.hash_anterior
    )::text, 'UTF8')), 'hex')::char(64)
$$;

-- El id y el encadenamiento los asigna la BD bajo un candado: dos inserciones
-- concurrentes no pueden apuntar al mismo evento anterior.
CREATE OR REPLACE FUNCTION eventos_encadenar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
    previo CHAR(64);
BEGIN
    PERFORM pg_advisory_xact_lock(hashtext('auditoria.eventos'));
    SELECT hash INTO previo FROM eventos ORDER BY id DESC LIMIT 1;
    NEW.id            := nextval('eventos_id_seq');
    NEW.registrado_en := clock_timestamp();
    NEW.ocurrido_en   := COALESCE(NEW.ocurrido_en, NEW.registrado_en);
    NEW.hash_anterior := COALESCE(previo, repeat('0', 64));
    NEW.hash          := auditoria_hash(NEW);
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION eventos_solo_insercion() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'La bitácora de auditoría es de solo inserción (% no permitido)', TG_OP;
END $$;

DROP TRIGGER IF EXISTS eventos_encadenar_trg ON eventos;
CREATE TRIGGER eventos_encadenar_trg BEFORE INSERT ON eventos
    FOR EACH ROW EXECUTE FUNCTION eventos_encadenar();

DROP TRIGGER IF EXISTS eventos_inmutables_trg ON eventos;
CREATE TRIGGER eventos_inmutables_trg BEFORE UPDATE OR DELETE ON eventos
    FOR EACH ROW EXECUTE FUNCTION eventos_solo_insercion();

DROP TRIGGER IF EXISTS eventos_sin_truncate_trg ON eventos;
CREATE TRIGGER eventos_sin_truncate_trg BEFORE TRUNCATE ON eventos
    FOR EACH STATEMENT EXECUTE FUNCTION eventos_solo_insercion();

-- Recorre la cadena completa; devuelve el primer evento cuyo enlace o contenido no cuadra.
CREATE OR REPLACE FUNCTION auditoria_verificar()
RETURNS TABLE (total BIGINT, primer_id_invalido BIGINT, ultimo_hash CHAR(64))
LANGUAGE plpgsql STABLE AS $$
DECLARE
    e      eventos;
    previo CHAR(64) := repeat('0', 64);
    n      BIGINT   := 0;
BEGIN
    FOR e IN SELECT * FROM eventos ORDER BY id LOOP
        n := n + 1;
        IF e.hash_anterior <> previo OR e.hash <> auditoria_hash(e) THEN
            total := n; primer_id_invalido := e.id; ultimo_hash := previo;
            RETURN NEXT; RETURN;
        END IF;
        previo := e.hash;
    END LOOP;
    total := n; primer_id_invalido := NULL; ultimo_hash := previo;
    RETURN NEXT;
END $$;

REVOKE ALL ON eventos FROM PUBLIC;
REVOKE ALL ON SEQUENCE eventos_id_seq FROM PUBLIC;
