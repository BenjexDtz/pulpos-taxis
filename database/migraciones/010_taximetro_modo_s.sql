-- Taxímetro v5: modo S de la Directiva 2014/32/UE (Anexo IX, MI-007) con la superficie por tramos.
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 010_taximetro_modo_s.sql
-- Las empresas quedan sin bajada de bandera y con saltos de 0,10: ajustarlos en Parámetros.
-- Los viajes previos quedan con modo NULL (se cobraron con la fórmula v4).
-- El taxímetro no usa el factor de altitud: factor_altitud queda solo para las apps v4 y los
-- viajes v5 se guardan con factor_altitud_aplicado = 1.

ALTER TABLE parametros_topograficos
    ADD COLUMN IF NOT EXISTS bajada_bandera_bs NUMERIC(5, 2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS valor_salto_bs    NUMERIC(4, 2) NOT NULL DEFAULT 0.10,
    ADD COLUMN IF NOT EXISTS modo_tarifa       CHAR(1)       NOT NULL DEFAULT 'S',
    ALTER COLUMN factor_altitud SET DEFAULT 1.00;

ALTER TABLE parametros_topograficos
    DROP CONSTRAINT IF EXISTS parametros_modo_tarifa_check,
    ADD CONSTRAINT parametros_modo_tarifa_check CHECK (modo_tarifa IN ('S', 'D')),
    DROP CONSTRAINT IF EXISTS parametros_salto_check,
    ADD CONSTRAINT parametros_salto_check CHECK (valor_salto_bs > 0 AND bajada_bandera_bs >= 0);

ALTER TABLE viajes_historial
    ADD COLUMN IF NOT EXISTS modo_tarifa_aplicado    CHAR(1),
    ADD COLUMN IF NOT EXISTS bajada_bandera_aplicada NUMERIC(5, 2),
    ADD COLUMN IF NOT EXISTS valor_salto_aplicado    NUMERIC(4, 2),
    ALTER COLUMN factor_altitud_aplicado SET DEFAULT 1.00;

ALTER TABLE viajes_historial
    DROP CONSTRAINT IF EXISTS viajes_modo_tarifa_check,
    ADD CONSTRAINT viajes_modo_tarifa_check CHECK (modo_tarifa_aplicado IN ('S', 'D'));
