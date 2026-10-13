const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { tarifaV4, leerRuta, resumenRuta, evaluarSuperficie, verificarViaje, MAX_PUNTOS } = require('../verificacion');
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

    test('coincide con calculadora.dart (2 asfalto + 1 tierra + 2 empedrado, 10 min)', () => {
        // (2 + 1 × 2.5 + 2 × 1.8) × 2.696 × 1.4 + 5
        const t = tarifaV4({ km_asfalto: 2, km_tierra: 1, km_empedrado: 2, Cb: 2, Cl: 0.1, Pc: 6.96, FH: 1.4, FR: 2.5, FE: 1.8, Ct: 0.5, Td: 10 });
        assert.ok(Math.abs(t - 35.57264) < 1e-9);
    });
});

describe('leerRuta', () => {
    test('convierte la superficie y conserva el orden', () => {
        const p = leerRuta([[-16.5, -68.19, 0, 0], [-16.5, -68.189, 5, 1]]);
        assert.deepEqual(p.map(x => x.superficie), ['asfalto', 'tierra']);
        assert.equal(leerRuta([[-16.5, -68.19, 0, 2]])[0].superficie, 'empedrado');
        assert.deepEqual(leerRuta([[-16.5, -68.19, 0, 0], [-16.5, -68.19, 1, 0, 0.8], [-16.5, -68.19, 2, 0, null]])
            .map(x => x.vibracion), [null, 0.8, null]);
        assert.deepEqual(p.map(x => x.segundos), [0, 5]);
    });

    test('rechaza formatos inválidos', () => {
        for (const ruta of [
            null, 'x', {}, [], [[1, 2, 3]], [[-16.5, -68.19, 0, 3]], [[-16.5, -68.19, 0, 0.5]], [[-16.5, -68.19, 1.5, 0]],
            [[91, 0, 0, 0]], [[0, 181, 0, 0]], [['-16.5', -68.19, 0, 0]],
            [[-16.5, -68.19, 10, 0], [-16.5, -68.19, 5, 0]],
            [[-16.5, -68.19, 0, 0, -1]], [[-16.5, -68.19, 0, 0, 51]], [[-16.5, -68.19, 0, 0, '1']], [[-16.5, -68.19, 0, 0, 1, 1]],
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
        assert.deepEqual(resumenRuta(leerRuta([[-16.5, -68.19, 0, 0]])), { km_asfalto: 0, km_tierra: 0, km_empedrado: 0, km: 0 });
    });
});

describe('evaluarSuperficie', () => {
    // n puntos de asfalto y luego m del tipo indicado, con la vibración dada en cada tramo
    const ruta = (n, vAsfalto, m, superficie, vIrregular) => [
        { superficie: 'asfalto', vibracion: null },
        ...Array.from({ length: n }, () => ({ superficie: 'asfalto', vibracion: vAsfalto })),
        ...Array.from({ length: m }, () => ({ superficie, vibracion: vIrregular })),
    ];

    test('solo asfalto: informa la referencia pero no evalúa nada', () => {
        assert.deepEqual(evaluarSuperficie(ruta(20, 0.5, 0), null),
            { vibracion_referencia: 0.5, vibracion_irregular: null, superficie_respaldo: null });
    });

    test('tierra o empedrado que vibran al menos 1,5 veces el asfalto: respaldada', () => {
        for (const s of ['tierra', 'empedrado'])
            assert.equal(evaluarSuperficie(ruta(15, 0.6, 15, s, 0.9), null).superficie_respaldo, 'respaldada');
    });

    test('marcado irregular pero tan liso como el asfalto: dudosa', () => {
        const e = evaluarSuperficie(ruta(15, 0.6, 15, 'tierra', 0.7), null);
        assert.deepEqual(e, { vibracion_referencia: 0.6, vibracion_irregular: 0.7, superficie_respaldo: 'dudosa' });
    });

    test('con poco asfalto en el viaje usa la referencia que aprendió la app', () => {
        assert.equal(evaluarSuperficie(ruta(3, 2, 15, 'tierra', 1.2), 0.5).superficie_respaldo, 'respaldada');
        assert.equal(evaluarSuperficie(ruta(3, 2, 15, 'tierra', 0.6), 0.5).superficie_respaldo, 'dudosa');
    });

    test('sin lecturas suficientes o sin referencia: sin_datos', () => {
        assert.equal(evaluarSuperficie(ruta(15, 0.5, 5, 'tierra', 2), null).superficie_respaldo, 'sin_datos');
        assert.equal(evaluarSuperficie(ruta(3, 0.5, 15, 'tierra', 2), null).superficie_respaldo, 'sin_datos');
        assert.equal(evaluarSuperficie(ruta(0, null, 15, 'empedrado', null), 0.5).superficie_respaldo, 'sin_datos');
    });
});

describe('verificarViaje', () => {
    const km = (a, t, e = 0) => ({ km_asfalto: a, km_tierra: t, km_empedrado: e });

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

    test('empedrado: verifica sus km con la ruta y aplica FE', () => {
        const ruta = leerRuta(rutaRecta(100, 20).map((p, i) => i > 60 && i <= 80 ? [...p.slice(0, 3), 2] : p));
        const cuerpo = (e) => {
            const tarifa = tarifaV4({ km_asfalto: 4 - e, km_tierra: 1, km_empedrado: e, Cb: 2, Cl: 0.1, Pc: 6.96, FH: 1.4, FR: 2.5, FE: 1.8, Ct: 0.5, Td: 10 });
            return viajeElAlto(4 - e, 1, { distancia_km: 5, km_empedrado: e, factor_empedrado_aplicado: 1.8, tarifa_cobrada: Math.round(tarifa * 100) / 100 });
        };
        assert.equal(verificarViaje({ cuerpo: cuerpo(1), km: km(3, 1, 1), ruta }).estado, 'ok');
        const v = verificarViaje({ cuerpo: cuerpo(2), km: km(2, 1, 2), ruta });
        assert.equal(v.estado, 'diferencia');
        assert.match(v.detalle, /1\.000 km en empedrado y el viaje declara 2\.000 km/);
    });

    test('diferencia: ruta con formato inválido', () => {
        const v = verificarViaje({ cuerpo: viajeElAlto(5, 0), km: km(5, 0), ruta: null });
        assert.deepEqual([v.estado, v.distancia_ruta_km], ['diferencia', null]);
        assert.match(v.detalle, /formato inválido/);
    });
});
