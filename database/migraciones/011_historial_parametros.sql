-- Historial de parámetros: el servidor marca como diferencia un viaje cobrado con parámetros
-- que la empresa nunca tuvo (por ejemplo, una app modificada).
-- Ejecutar en una sola transacción:  psql -1 -U <usuario> -d <base> -f 011_historial_parametros.sql
-- La versión actual de cada empresa queda como la primera; las anteriores no se conocen, así que
-- un viaje antiguo aún sin sincronizar, cobrado con otra tarifa, quedará como diferencia.

-- Cada versión de la tarifa de una empresa: el servidor comprueba que un viaje se cobró con
-- una de ellas. La guarda un trigger, así también queda un cambio hecho fuera del panel.
CREATE TABLE IF NOT EXISTS parametros_historial (
    id                      SERIAL PRIMARY KEY,
    empresa_id              INTEGER NOT NULL REFERENCES empresas(id),
    costo_base_km           NUMERIC(5, 2) NOT NULL,
    consumo_litros_km       NUMERIC(5, 3) NOT NULL,
    precio_combustible_bs   NUMERIC(6, 2) NOT NULL,
    factor_altitud          NUMERIC(4, 2) NOT NULL,
    factor_superficie       NUMERIC(4, 2) NOT NULL,
    factor_empedrado        NUMERIC(4, 2) NOT NULL,
    costo_minuto_detencion  NUMERIC(5, 2) NOT NULL,
    bajada_bandera_bs       NUMERIC(5, 2) NOT NULL,
    valor_salto_bs          NUMERIC(4, 2) NOT NULL,
    modo_tarifa             CHAR(1)       NOT NULL,
    vigente_desde           TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS parametros_historial_empresa_idx ON parametros_historial (empresa_id, vigente_desde DESC);

CREATE OR REPLACE FUNCTION parametros_guardar_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND
       (OLD.costo_base_km, OLD.consumo_litros_km, OLD.precio_combustible_bs, OLD.factor_altitud,
        OLD.factor_superficie, OLD.factor_empedrado, OLD.costo_minuto_detencion,
        OLD.bajada_bandera_bs, OLD.valor_salto_bs, OLD.modo_tarifa) IS NOT DISTINCT FROM
       (NEW.costo_base_km, NEW.consumo_litros_km, NEW.precio_combustible_bs, NEW.factor_altitud,
        NEW.factor_superficie, NEW.factor_empedrado, NEW.costo_minuto_detencion,
        NEW.bajada_bandera_bs, NEW.valor_salto_bs, NEW.modo_tarifa) THEN
        RETURN NULL;
    END IF;
    INSERT INTO parametros_historial (
        empresa_id, costo_base_km, consumo_litros_km, precio_combustible_bs, factor_altitud,
        factor_superficie, factor_empedrado, costo_minuto_detencion, bajada_bandera_bs, valor_salto_bs, modo_tarifa)
    VALUES (
        NEW.empresa_id, NEW.costo_base_km, NEW.consumo_litros_km, NEW.precio_combustible_bs, NEW.factor_altitud,
        NEW.factor_superficie, NEW.factor_empedrado, NEW.costo_minuto_detencion, NEW.bajada_bandera_bs,
        NEW.valor_salto_bs, NEW.modo_tarifa);
    RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS parametros_versionar ON parametros_topograficos;
CREATE TRIGGER parametros_versionar AFTER INSERT OR UPDATE ON parametros_topograficos
    FOR EACH ROW EXECUTE FUNCTION parametros_guardar_version();

INSERT INTO parametros_historial (
    empresa_id, costo_base_km, consumo_litros_km, precio_combustible_bs, factor_altitud,
    factor_superficie, factor_empedrado, costo_minuto_detencion, bajada_bandera_bs, valor_salto_bs,
    modo_tarifa, vigente_desde)
SELECT p.empresa_id, p.costo_base_km, p.consumo_litros_km, p.precio_combustible_bs, p.factor_altitud,
       p.factor_superficie, p.factor_empedrado, p.costo_minuto_detencion, p.bajada_bandera_bs, p.valor_salto_bs,
       p.modo_tarifa, coalesce(p.fecha_actualizacion, now())
FROM parametros_topograficos p
WHERE NOT EXISTS (SELECT 1 FROM parametros_historial h WHERE h.empresa_id = p.empresa_id);
