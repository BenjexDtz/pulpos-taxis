-- Migración v3 → v4 (multiempresa). Todos los datos existentes pasan a la empresa "pulpos".
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 001_multiempresa.sql

CREATE TABLE IF NOT EXISTS empresas (
    id                  SERIAL PRIMARY KEY,
    codigo              VARCHAR(30)   UNIQUE NOT NULL CHECK (codigo ~ '^[a-z0-9-]{3,30}$'),
    nombre              VARCHAR(120)  NOT NULL,
    nit                 VARCHAR(30),
    telefono            VARCHAR(30),
    email               VARCHAR(100),
    direccion           VARCHAR(200),
    ciudad              VARCHAR(80)   NOT NULL,
    pais                VARCHAR(60)   NOT NULL DEFAULT 'Bolivia',
    zona_horaria        VARCHAR(50)   NOT NULL DEFAULT 'America/La_Paz',
    moneda_codigo       CHAR(3)       NOT NULL DEFAULT 'BOB',
    moneda_simbolo      VARCHAR(5)    NOT NULL DEFAULT 'Bs',
    centro_lat          NUMERIC(10, 7) NOT NULL CHECK (centro_lat BETWEEN -90 AND 90),
    centro_lng          NUMERIC(10, 7) NOT NULL CHECK (centro_lng BETWEEN -180 AND 180),
    radio_operacion_km  NUMERIC(6, 1) NOT NULL DEFAULT 50 CHECK (radio_operacion_km > 0),
    altitud_msnm        INTEGER,
    color_primario      VARCHAR(7)    NOT NULL DEFAULT '#10b981' CHECK (color_primario ~ '^#[0-9a-fA-F]{6}$'),
    logo_url            VARCHAR(300),
    activo              BOOLEAN       NOT NULL DEFAULT TRUE,
    fecha_registro      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO empresas (codigo, nombre, ciudad, centro_lat, centro_lng, radio_operacion_km, altitud_msnm, color_primario)
VALUES ('pulpos', 'Radio Taxis Pulpos', 'El Alto', -16.5, -68.19, 40, 4100, '#10b981')
ON CONFLICT (codigo) DO NOTHING;

-- choferes
ALTER TABLE choferes ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
UPDATE choferes SET empresa_id = (SELECT id FROM empresas WHERE codigo = 'pulpos') WHERE empresa_id IS NULL;
ALTER TABLE choferes ALTER COLUMN empresa_id SET NOT NULL;

DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT con.conname FROM pg_constraint con
        WHERE con.conrelid = 'choferes'::regclass AND con.contype = 'u'
          AND con.conkey = ARRAY[(SELECT attnum FROM pg_attribute
                                  WHERE attrelid = 'choferes'::regclass AND attname = 'placa_vehiculo')]
    LOOP
        EXECUTE format('ALTER TABLE choferes DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'choferes_empresa_placa_key' AND conrelid = 'choferes'::regclass) THEN
        ALTER TABLE choferes ADD CONSTRAINT choferes_empresa_placa_key UNIQUE (empresa_id, placa_vehiculo);
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'choferes_id_empresa_key' AND conrelid = 'choferes'::regclass) THEN
        ALTER TABLE choferes ADD CONSTRAINT choferes_id_empresa_key UNIQUE (id, empresa_id);
    END IF;
END $$;

-- administradores
ALTER TABLE administradores ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
UPDATE administradores SET empresa_id = (SELECT id FROM empresas WHERE codigo = 'pulpos')
WHERE empresa_id IS NULL AND rol <> 'superadmin';
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'administradores_rol_check' AND conrelid = 'administradores'::regclass) THEN
        ALTER TABLE administradores ADD CONSTRAINT administradores_rol_check CHECK (rol IN ('superadmin', 'gerente', 'supervisor'));
    END IF;
END $$;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'administradores_rol_empresa_check' AND conrelid = 'administradores'::regclass) THEN
        ALTER TABLE administradores ADD CONSTRAINT administradores_rol_empresa_check CHECK ((rol = 'superadmin') = (empresa_id IS NULL));
    END IF;
END $$;

INSERT INTO administradores (empresa_id, nombre, email, password_hash, rol)
VALUES (NULL, 'Plataforma', 'superadmin@plataforma.bo',
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'superadmin')
ON CONFLICT (email) DO NOTHING;

-- parámetros (una fila por empresa)
ALTER TABLE parametros_topograficos ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
UPDATE parametros_topograficos SET empresa_id = (SELECT id FROM empresas WHERE codigo = 'pulpos')
WHERE empresa_id IS NULL;
ALTER TABLE parametros_topograficos ALTER COLUMN empresa_id SET NOT NULL;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parametros_topograficos_empresa_id_key' AND conrelid = 'parametros_topograficos'::regclass) THEN
        ALTER TABLE parametros_topograficos ADD CONSTRAINT parametros_topograficos_empresa_id_key UNIQUE (empresa_id);
    END IF;
END $$;

-- viajes
ALTER TABLE viajes_historial ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id);
UPDATE viajes_historial v SET empresa_id = c.empresa_id
FROM choferes c WHERE v.chofer_id = c.id AND v.empresa_id IS NULL;
ALTER TABLE viajes_historial ALTER COLUMN empresa_id SET NOT NULL;
ALTER TABLE viajes_historial ALTER COLUMN chofer_id SET NOT NULL;
ALTER TABLE viajes_historial DROP CONSTRAINT IF EXISTS viajes_historial_chofer_id_fkey;
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'viajes_chofer_misma_empresa_fk' AND conrelid = 'viajes_historial'::regclass) THEN
        ALTER TABLE viajes_historial ADD CONSTRAINT viajes_chofer_misma_empresa_fk FOREIGN KEY (chofer_id, empresa_id) REFERENCES choferes(id, empresa_id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS viajes_empresa_fecha_idx ON viajes_historial (empresa_id, fecha_hora_viaje DESC);
CREATE INDEX IF NOT EXISTS choferes_empresa_idx     ON choferes (empresa_id);
