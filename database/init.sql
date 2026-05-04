-- ═══════════════════════════════════════════════════════════════════════════════
-- Radio Taxis Pulpos — Schema v3
-- Fórmula: T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. CHOFERES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS choferes (
    id                    SERIAL PRIMARY KEY,
    nombre_completo       VARCHAR(100) NOT NULL,
    placa_vehiculo        VARCHAR(20)  UNIQUE NOT NULL,
    password_hash         VARCHAR(255),
    estado_activo         BOOLEAN   DEFAULT TRUE,
    ultima_lat            NUMERIC(10, 7),
    ultima_lng            NUMERIC(10, 7),
    ultima_actualizacion  TIMESTAMP,
    fecha_registro        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── 2. ADMINISTRADORES ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS administradores (
    id             SERIAL PRIMARY KEY,
    nombre         VARCHAR(100) NOT NULL,
    email          VARCHAR(100) UNIQUE NOT NULL,
    password_hash  VARCHAR(255) NOT NULL,
    rol            VARCHAR(30)  NOT NULL DEFAULT 'gerente',
    activo         BOOLEAN   DEFAULT TRUE,
    fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── 3. PARÁMETROS TOPOGRÁFICOS ────────────────────────────────────────────────
--
-- Fórmula completa:
--   T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td
--
-- Cb  = costo_base_km           — ganancia del conductor + depreciación
-- Cl  = consumo_litros_km       — cuántos litros gasta el taxi por km
-- Pc  = precio_combustible_bs   — precio actual del litro de gasolina (Bs)
-- FH  = factor_altitud          — penalización por operar a 4,100 msnm
-- FR  = factor_superficie       — asfalto (1.0) o tierra/barro (2.5)
-- Ct  = costo_minuto_detencion  — cobro por tiempo en tráfico o espera
-- Td  = tiempo detención (min)  — medido por GPS en tiempo real
-- D   = distancia (km)          — medida por GPS en tiempo real
--
CREATE TABLE IF NOT EXISTS parametros_topograficos (
    id                      SERIAL PRIMARY KEY,
    zona_ciudad             VARCHAR(100)  NOT NULL,
    -- Componente económico base
    costo_base_km           NUMERIC(5, 2) NOT NULL,
    -- Componente combustible
    consumo_litros_km       NUMERIC(5, 3) NOT NULL DEFAULT 0.100,
    precio_combustible_bs   NUMERIC(6, 2) NOT NULL DEFAULT 6.96,
    -- Factores topográficos
    factor_altitud          NUMERIC(4, 2) NOT NULL,
    factor_superficie       NUMERIC(4, 2) NOT NULL,
    costo_minuto_detencion  NUMERIC(5, 2) NOT NULL,
    fecha_actualizacion     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ── 4. VIAJES HISTORIAL ───────────────────────────────────────────────────────
-- Guarda la fotografía completa de cada viaje: métricas + parámetros aplicados.
-- Permite auditar cualquier tarifa: "¿por qué este viaje costó X?"
CREATE TABLE IF NOT EXISTS viajes_historial (
    id_servidor                  SERIAL PRIMARY KEY,
    chofer_id                    INTEGER REFERENCES choferes(id),

    -- Métricas del viaje (GPS)
    distancia_km                 NUMERIC(8, 3) NOT NULL,
    tiempo_detencion_min         NUMERIC(8, 2) NOT NULL,
    tarifa_cobrada               NUMERIC(8, 2) NOT NULL,

    -- Evidencia topográfica: parámetros exactos que se usaron
    tipo_superficie              VARCHAR(20)   NOT NULL DEFAULT 'asfalto',
    factor_altitud_aplicado      NUMERIC(4, 2) NOT NULL DEFAULT 1.40,
    factor_superficie_aplicado   NUMERIC(4, 2) NOT NULL DEFAULT 1.00,
    costo_base_aplicado          NUMERIC(5, 2) NOT NULL DEFAULT 2.00,
    costo_minuto_aplicado        NUMERIC(5, 2) NOT NULL DEFAULT 0.50,
    -- Evidencia de combustible
    consumo_litros_aplicado      NUMERIC(5, 3) NOT NULL DEFAULT 0.100,
    precio_combustible_aplicado  NUMERIC(6, 2) NOT NULL DEFAULT 6.96,

    -- Timestamps separados: soporta modo offline (Edge Computing)
    fecha_hora_viaje             TIMESTAMP NOT NULL,
    fecha_sincronizacion         TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ═══════════════════════════════════════════════════════════════════════════════
-- DATOS INICIALES
-- ═══════════════════════════════════════════════════════════════════════════════

INSERT INTO parametros_topograficos (
    zona_ciudad, costo_base_km,
    consumo_litros_km, precio_combustible_bs,
    factor_altitud, factor_superficie, costo_minuto_detencion
) VALUES (
    'El Alto - Topografía Compleja',
    2.00,
    0.100,   -- 10 L/100km: consumo real taxi pequeño en Bolivia
    6.96,    -- Bs/litro sin subvención gubernamental (mayo 2026)
    1.40,    -- +40% por operar a 4,100 msnm
    2.50,    -- tierra/barro cobra 2.5× más que asfalto
    0.50     -- Bs por minuto de detención en tráfico
) ON CONFLICT DO NOTHING;

-- Administrador (contraseña: password)
INSERT INTO administradores (nombre, email, password_hash, rol)
VALUES (
    'Gerencia Central', 'admin@pulpos.bo',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    'gerente'
) ON CONFLICT (email) DO NOTHING;

-- Chofer de demo (contraseña: demo1234)
INSERT INTO choferes (nombre_completo, placa_vehiculo, password_hash, estado_activo)
VALUES (
    'Boris Benjamín Barboza', '1234-PUL',
    '$2b$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi',
    TRUE
) ON CONFLICT (placa_vehiculo) DO NOTHING;

-- Viajes de ejemplo con todos los parámetros
INSERT INTO viajes_historial (
    chofer_id, distancia_km, tiempo_detencion_min, tarifa_cobrada,
    tipo_superficie, factor_altitud_aplicado, factor_superficie_aplicado,
    costo_base_aplicado, costo_minuto_aplicado,
    consumo_litros_aplicado, precio_combustible_aplicado,
    fecha_hora_viaje
)
SELECT
    c.id,
    dist,
    deten,
    -- Tarifa calculada con la nueva fórmula: T = D×(Cb+Cl×Pc)×FH×FR + Ct×Td
    ROUND(
        (dist * (2.00 + 0.100 * 6.96) * 1.40 * fr + deten * 0.50)::numeric, 2
    ),
    sup, 1.40, fr, 2.00, 0.50, 0.100, 6.96,
    NOW() - (random() * interval '7 days')
FROM choferes c,
(VALUES
    (5.200, 12.00, 'asfalto', 1.00),
    (2.100,  0.00, 'asfalto', 1.00),
    (3.500,  8.50, 'tierra',  2.50),
    (1.800,  5.00, 'asfalto', 1.00),
    (4.200, 15.00, 'tierra',  2.50)
) AS v(dist, deten, sup, fr)
WHERE c.placa_vehiculo = '1234-PUL';