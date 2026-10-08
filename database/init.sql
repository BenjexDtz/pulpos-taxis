-- ═══════════════════════════════════════════════════════════════════════════════
-- Radio Taxis — Schema v4 (multiempresa)
-- Fórmula: T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. EMPRESAS ───────────────────────────────────────────────────────────────
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

-- ── 2. CHOFERES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS choferes (
    id                    SERIAL PRIMARY KEY,
    empresa_id            INTEGER NOT NULL REFERENCES empresas(id),
    nombre_completo       VARCHAR(100) NOT NULL,
    placa_vehiculo        VARCHAR(20)  NOT NULL,
    password_hash         VARCHAR(255),
    estado_activo         BOOLEAN   DEFAULT TRUE,
    ultima_lat            NUMERIC(10, 7),
    ultima_lng            NUMERIC(10, 7),
    ultima_actualizacion  TIMESTAMP,
    fecha_registro        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT choferes_empresa_placa_key UNIQUE (empresa_id, placa_vehiculo),
    CONSTRAINT choferes_id_empresa_key    UNIQUE (id, empresa_id)
);

-- ── 3. ADMINISTRADORES ────────────────────────────────────────────────────────
-- superadmin: administra la plataforma (sin empresa). gerente/supervisor: una empresa.
CREATE TABLE IF NOT EXISTS administradores (
    id             SERIAL PRIMARY KEY,
    empresa_id     INTEGER REFERENCES empresas(id),
    nombre         VARCHAR(100) NOT NULL,
    email          VARCHAR(100) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    rol            VARCHAR(30)  NOT NULL DEFAULT 'gerente'
                   CHECK (rol IN ('superadmin', 'gerente', 'supervisor')),
    activo         BOOLEAN   DEFAULT TRUE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    -- Segundo factor (TOTP). El secreto se guarda cifrado con AES-256-GCM.
    mfa_activo          BOOLEAN NOT NULL DEFAULT FALSE,
    mfa_secreto         TEXT,
    mfa_ultimo_paso     BIGINT,
    mfa_activado_en     TIMESTAMP,
    mfa_fallos          INTEGER NOT NULL DEFAULT 0,
    mfa_bloqueado_hasta TIMESTAMP,
    CONSTRAINT administradores_rol_empresa_check CHECK ((rol = 'superadmin') = (empresa_id IS NULL)),
    CONSTRAINT administradores_mfa_check CHECK (NOT mfa_activo OR mfa_secreto IS NOT NULL)
);

-- Códigos de un solo uso para entrar si se pierde la app autenticadora (solo el hash SHA-256).
CREATE TABLE IF NOT EXISTS mfa_codigos_respaldo (
    id               SERIAL PRIMARY KEY,
    administrador_id INTEGER  NOT NULL REFERENCES administradores(id) ON DELETE CASCADE,
    codigo_hash      CHAR(64) NOT NULL,
    usado_en         TIMESTAMP,
    CONSTRAINT mfa_codigos_respaldo_unico UNIQUE (administrador_id, codigo_hash)
);

-- ── 4. PARÁMETROS TOPOGRÁFICOS ────────────────────────────────────────────────
--
-- Fórmula completa:
--   T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td
--
-- Cb  = costo_base_km           — ganancia del conductor + depreciación
-- Cl  = consumo_litros_km       — cuántos litros gasta el taxi por km
-- Pc  = precio_combustible_bs   — precio actual del litro de combustible
-- FH  = factor_altitud          — penalización por la altitud de operación
-- FR  = factor_superficie       — asfalto (1.0) o tierra/barro (2.5)
-- Ct  = costo_minuto_detencion  — cobro por tiempo en tráfico o espera
-- Td  = tiempo detención (min)  — medido por GPS en tiempo real
-- D   = distancia (km)          — medida por GPS en tiempo real
--
CREATE TABLE IF NOT EXISTS parametros_topograficos (
    id                      SERIAL PRIMARY KEY,
    empresa_id              INTEGER NOT NULL UNIQUE REFERENCES empresas(id),
    zona_ciudad             VARCHAR(100)  NOT NULL,
    costo_base_km           NUMERIC(5, 2) NOT NULL,
    consumo_litros_km       NUMERIC(5, 3) NOT NULL DEFAULT 0.100,
    precio_combustible_bs   NUMERIC(6, 2) NOT NULL DEFAULT 6.96,
    factor_altitud          NUMERIC(4, 2) NOT NULL,
    factor_superficie       NUMERIC(4, 2) NOT NULL,
    costo_minuto_detencion  NUMERIC(5, 2) NOT NULL,
    fecha_actualizacion     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── 5. VIAJES HISTORIAL ───────────────────────────────────────────────────────
-- Guarda la fotografía completa de cada viaje: métricas + parámetros aplicados.
-- Permite auditar cualquier tarifa: "¿por qué este viaje costó X?"
CREATE TABLE IF NOT EXISTS viajes_historial (
    id_servidor                  SERIAL PRIMARY KEY,
    empresa_id                   INTEGER NOT NULL REFERENCES empresas(id),
    chofer_id                    INTEGER NOT NULL,

    distancia_km                 NUMERIC(8, 3) NOT NULL,
    tiempo_detencion_min         NUMERIC(8, 2) NOT NULL,
    tarifa_cobrada               NUMERIC(8, 2) NOT NULL,

    tipo_superficie              VARCHAR(20)   NOT NULL DEFAULT 'asfalto',
    factor_altitud_aplicado      NUMERIC(4, 2) NOT NULL DEFAULT 1.40,
    factor_superficie_aplicado   NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
    costo_base_aplicado          NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
    costo_minuto_aplicado        NUMERIC(5, 2) NOT NULL DEFAULT 0.50,
    consumo_litros_aplicado      NUMERIC(5, 3) NOT NULL DEFAULT 0.100,
    precio_combustible_aplicado  NUMERIC(6, 2) NOT NULL DEFAULT 6.96,

    fecha_hora_viaje             TIMESTAMP NOT NULL,
    fecha_sincronizacion         TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    uuid                         UUID,

    CONSTRAINT viajes_chofer_uuid_key UNIQUE (chofer_id, uuid),
    CONSTRAINT viajes_chofer_misma_empresa_fk
        FOREIGN KEY (chofer_id, empresa_id) REFERENCES choferes(id, empresa_id)
);

CREATE INDEX IF NOT EXISTS viajes_empresa_fecha_idx ON viajes_historial (empresa_id, fecha_hora_viaje DESC);
CREATE INDEX IF NOT EXISTS choferes_empresa_idx     ON choferes (empresa_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS INICIALES
-- Contraseñas de demo: superadmin y gerentes "password", choferes "123"
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO empresas (codigo, nombre, ciudad, centro_lat, centro_lng, radio_operacion_km, altitud_msnm, color_primario, telefono)
VALUES
    ('pulpos',   'Radio Taxis Pulpos',   'El Alto', -16.5000000, -68.1900000, 40, 4100, '#10b981', '2-2800000'),
    ('illimani', 'Radio Taxis Illimani', 'La Paz',  -16.4955000, -68.1336000, 30, 3640, '#3b82f6', '2-2400000')
ON CONFLICT (codigo) DO NOTHING;

INSERT INTO parametros_topograficos (
    empresa_id, zona_ciudad, costo_base_km, consumo_litros_km, precio_combustible_bs,
    factor_altitud, factor_superficie, costo_minuto_detencion
)
SELECT e.id, v.zona, v.cb, v.cl, v.pc, v.fh, v.fr, v.ct
FROM (VALUES
    ('pulpos',   'El Alto - Topografía Compleja', 2.00, 0.100, 6.96, 1.40, 2.50, 0.50),
    ('illimani', 'La Paz - Laderas',              2.50, 0.110, 6.96, 1.30, 2.00, 0.60)
) AS v(codigo, zona, cb, cl, pc, fh, fr, ct)
JOIN empresas e ON e.codigo = v.codigo
ON CONFLICT (empresa_id) DO NOTHING;

INSERT INTO administradores (empresa_id, nombre, email, password_hash, rol)
VALUES (NULL, 'Plataforma', 'superadmin@plataforma.bo',
        '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'superadmin')
ON CONFLICT (email) DO NOTHING;

INSERT INTO administradores (empresa_id, nombre, email, password_hash, rol)
SELECT e.id, v.nombre, v.email, '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'gerente'
FROM (VALUES
    ('pulpos',   'Gerencia Central',  'admin@pulpos.bo'),
    ('illimani', 'Gerencia Illimani', 'admin@illimani.bo')
) AS v(codigo, nombre, email)
JOIN empresas e ON e.codigo = v.codigo
ON CONFLICT (email) DO NOTHING;

INSERT INTO choferes (empresa_id, nombre_completo, placa_vehiculo, password_hash, estado_activo)
SELECT e.id, v.nombre, v.placa, '$2b$10$aJCtorlTfrhbfijHttiQ2O83wcfgf8iTdQKpz1x.ap4wRnox8DB82', TRUE
FROM (VALUES
    ('pulpos',   'Boris Benjamín Barboza', '1234-KKK'),
    ('illimani', 'Carla Mamani Quispe',    '5678-ILL')
) AS v(codigo, nombre, placa)
JOIN empresas e ON e.codigo = v.codigo
ON CONFLICT (empresa_id, placa_vehiculo) DO NOTHING;

INSERT INTO viajes_historial (
    empresa_id, chofer_id, distancia_km, tiempo_detencion_min, tarifa_cobrada,
    tipo_superficie, factor_altitud_aplicado, factor_superficie_aplicado,
    costo_base_aplicado, costo_minuto_aplicado,
    consumo_litros_aplicado, precio_combustible_aplicado,
    fecha_hora_viaje
)
SELECT
    c.empresa_id,
    c.id,
    v.dist,
    v.deten,
    ROUND((v.dist * (p.costo_base_km + p.consumo_litros_km * p.precio_combustible_bs)
           * p.factor_altitud * fr.valor + v.deten * p.costo_minuto_detencion)::numeric, 2),
    v.sup, p.factor_altitud, fr.valor, p.costo_base_km, p.costo_minuto_detencion,
    p.consumo_litros_km, p.precio_combustible_bs,
    NOW() - (random() * interval '7 days')
FROM choferes c
JOIN parametros_topograficos p ON p.empresa_id = c.empresa_id
CROSS JOIN (VALUES
    (5.200, 12.00, 'asfalto'),
    (2.100,  0.00, 'asfalto'),
    (3.500,  8.50, 'tierra'),
    (1.800,  5.00, 'asfalto'),
    (4.200, 15.00, 'tierra')
) AS v(dist, deten, sup)
CROSS JOIN LATERAL (SELECT CASE WHEN v.sup = 'tierra' THEN p.factor_superficie ELSE 1.00 END AS valor) fr
WHERE c.placa_vehiculo IN ('1234-KKK', '5678-ILL')
  AND NOT EXISTS (SELECT 1 FROM viajes_historial vh WHERE vh.chofer_id = c.id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUDITORÍA (la bitácora vive en otra base: database/auditoria/)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Copia periódica del hash de la bitácora: impide reescribir su historia sin que se note
CREATE TABLE IF NOT EXISTS auditoria_anclas (
    id          SERIAL PRIMARY KEY,
    evento_id   BIGINT   NOT NULL UNIQUE,
    hash        CHAR(64) NOT NULL,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Eventos que no se pudieron escribir en la base de auditoría; se reenvían después
CREATE TABLE IF NOT EXISTS auditoria_pendiente (
    id          SERIAL PRIMARY KEY,
    evento      JSONB    NOT NULL,
    intentos    INTEGER  NOT NULL DEFAULT 0,
    creado_en   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
