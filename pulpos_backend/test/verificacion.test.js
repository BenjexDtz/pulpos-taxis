const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { tarifaV4, leerRuta, resumenRuta, verificarViaje, MAX_PUNTOS } = require('../verificacion');
const { distanciaKm } = require('../validacion');

// Recta hacia el este desde El Alto: n tramos de 50 m, los últimos `enTierra` marcados como tierra
const rutaRecta = (n, enTierra = 0) => {
    const paso = 0.05 / distanciaKm(-16.5, -68.19, -16.5, -68.18) * 0.01;
    return Array.from({ length: n + 1 }, (_, i) => [-16.5, -68.19 + i * paso, i * 6, i > n - enTierra ? 1 : 0]);
};

const viajeElAlto = (km_asfalto, km_tierra, extra = {}) => ({
    distancia_km: km_asfalto + km_tierra, km_asfalto, km_tierra, tiempo_detencion_min: 10,
    costo_base_aplicado: 2, consumo_litros_aplicado: 0.1, precio_combustible_aplicado: 6.96,
    factor_altitud_aplicado: 1.4, factor_superficie_aplicado: 2.5, costo_minuto_aplicado: 0.5,
    tarifa_cobrada: Math.round(tarifaV4({ km_asfalto, km_tierra, Cb: 2, Cl: 0.1, Pc: 6.96, FH: 1.4, FR: 2.5, Ct: 0.5, Td: 10 }) * 100) / 100,
    ...extra,
});

describe('tarifaV4', () => {
    test('coincide con calculadora.dart (mixto 3 + 2 km, 10 min)', () => {
        assert.ok(Math.abs(tarifaV4({ km_asfalto: 3, km_tierra: 2, Cb: 2, Cl: 0.1, Pc: 6.96, FH: 1.4, FR: 2.5, Ct: 0.5, Td: 10 }) - 35.1952) < 1e-9);
    });
});

describe('leerRuta', () => {
    test('convierte la superficie y conserva el orden', () => {
        const p = leerRuta([[-16.5, -68.19, 0, 0], [-16.5, -68.189, 5, 1]]);
        assert.deepEqual(p.map(x => x.superficie), ['asfalto', 'tierra']);
        assert.deepEqual(p.map(x => x.segundos), [0, 5]);
    });

    test('rechaza formatos inválidos', () => {
        for (const ruta of [
            null, 'x', {}, [], [[1, 2, 3]], [[-16.5, -68.19, 0, 2]], [[-16.5, -68.19, 1.5, 0]],
            [[91, 0, 0, 0]], [[0, 181, 0, 0]], [['-16.5', -68.19, 0, 0]],
            [[-16.5, -68.19, 10, 0], [-16.5, -68.19, 5, 0]],
            Array.from({ length: MAX_PUNTOS + 1 }, () => [-16.5, -68.19, 0, 0]),
        ]) assert.equal(leerRuta(ruta), null, JSON.stringify(ruta)?.slice(0, 60));
    });
});

describe('resumenRuta', () => {
    test('cada tramo cuenta para la superficie del punto en que termina', () => {
        const r = resumenRuta(leerRuta(rutaRecta(100, 20)));
        assert.ok(Math.abs(r.km - 5) < 1e-6);
        assert.ok(Math.abs(r.km_tierra - 1) < 1e-6);
        assert.ok(Math.abs(r.km_asfalto - 4) < 1e-6);
    });

    test('un solo punto mide 0 km', () => {
        assert.deepEqual(resumenRuta(leerRuta([[-16.5, -68.19, 0, 0]])), { km_asfalto: 0, km_tierra: 0, km: 0 });
    });
});

describe('verificarViaje', () => {
    const km = (a, t) => ({ km_asfalto: a, km_tierra: t });

    test('ok: tarifa y ruta coinciden', () => {
        const v = verificarViaje({ cuerpo: viajeElAlto(4, 1), km: km(4, 1), ruta: leerRuta(rutaRecta(100, 20)) });
        assert.equal(v.estado, 'ok', v.detalle);
        assert.equal(v.detalle, null);
        assert.equal(v.distancia_ruta_km, 5);
        assert.equal(v.tarifa_calculada, viajeElAlto(4, 1).tarifa_cobrada);
    });

    test('tolera la diferencia de radio terrestre con la app (0.1 %)', () => {
        const v = verificarViaje({ cuerpo: viajeElAlto(4.0045, 1.0011), km: km(4.0045, 1.0011), ruta: leerRuta(rutaRecta(100, 20)) });
        assert.equal(v.estado, 'ok', v.detalle);
    });

    test('sin_ruta: app que no envía la ruta, con tarifa correcta', () => {
        assert.equal(verificarViaje({ cuerpo: viajeElAlto(5, 0), km: km(5, 0), ruta: undefined }).estado, 'sin_ruta');
    });

    test('sin_verificar: faltan parámetros aplicados (apps muy antiguas)', () => {
        const cuerpo = viajeElAlto(5, 0);
        delete cuerpo.costo_base_aplicado;
        const v = verificarViaje({ cuerpo, km: km(5, 0), ruta: undefined });
        assert.deepEqual([v.estado, v.tarifa_calculada], ['sin_verificar', null]);
    });

    test('diferencia: la tarifa cobrada no sale de la fórmula', () => {
        const v = verificarViaje({ cuerpo: viajeElAlto(4, 1, { tarifa_cobrada: 50 }), km: km(4, 1), ruta: leerRuta(rutaRecta(100, 20)) });
        assert.equal(v.estado, 'diferencia');
        assert.match(v.detalle, /tarifa cobrada \(50\.00\)/);
    });

    test('diferencia: declara más km de los que mide la ruta', () => {
        const v = verificarViaje({ cuerpo: viajeElAlto(6, 1), km: km(6, 1), ruta: leerRuta(rutaRecta(100, 20)) });
        assert.equal(v.estado, 'diferencia');
        assert.match(v.detalle, /la ruta mide 5\.000 km/);
    });

    test('diferencia: marca como tierra tramos que la ruta registró en asfalto', () => {
        const v = verificarViaje({ cuerpo: viajeElAlto(1, 4), km: km(1, 4), ruta: leerRuta(rutaRecta(100, 20)) });
        assert.equal(v.estado, 'diferencia');
        assert.match(v.detalle, /1\.000 km en tierra/);
    });

    test('diferencia: ruta con formato inválido', () => {
        const v = verificarViaje({ cuerpo: viajeElAlto(5, 0), km: km(5, 0), ruta: null });
        assert.deepEqual([v.estado, v.distancia_ruta_km], ['diferencia', null]);
        assert.match(v.detalle, /formato inválido/);
    });
});
