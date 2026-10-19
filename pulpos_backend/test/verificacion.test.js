const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const {
    tarifaV4, tarifasEnteras, velocidadCruceKmh, crearTaximetro, taximetro, tarifaEstimada,
    leerRuta, resumenRuta, evaluarSuperficie, verificarViaje, MAX_PUNTOS,
} = require('../verificacion');
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

describe('Taxímetro v5 (modo S, Directiva 2014/32/UE)', () => {
    // Ejemplo de referencia: B 5,00; 3,00/km; 30,00/h; saltos de 0,50; la tierra con F = 1,25
    const t = { modo: 'S', bajada: 500, salto: 50, porKm: { asfalto: 300000, tierra: 375000, empedrado: 300000 }, porHora: 3000000 };
    const recorrer = (tarifa, superficie) => {
        const m = crearTaximetro(tarifa);
        for (let i = 0; i < 10; i++) m.tramo(200000, 24, 'asfalto');  // 2 km a 30 km/h
        for (let i = 0; i < 10; i++) m.tramo(100000, 24, superficie); // 1 km a 15 km/h
        m.tramo(0, 180, 'asfalto');                                    // 3 min detenido
        return m.importe();
    };

    test('ejemplo de referencia: 16,00 con tierra y 15,50 todo en asfalto', () => {
        assert.deepEqual(recorrer(t, 'tierra'), { centavos: 1600, segundosPorTiempo: 180 });
        assert.equal(recorrer(t, 'asfalto').centavos, 1550);
    });

    test('la velocidad de cruce baja con F > 1', () => {
        assert.equal(velocidadCruceKmh(t), 10);
        assert.equal(velocidadCruceKmh(t, 'tierra'), 8);
    });

    test('modo S: sobre la velocidad de cruce solo cuenta la distancia; debajo, solo el tiempo', () => {
        const rapido = crearTaximetro(t);
        rapido.tramo(1000000, 180, 'asfalto'); // 1 km en 3 min = 20 km/h
        assert.deepEqual(rapido.importe(), { centavos: 800, segundosPorTiempo: 0 });
        const lento = crearTaximetro(t);
        lento.tramo(100000, 360, 'asfalto');   // 100 m en 6 min = 1 km/h
        assert.deepEqual(lento.importe(), { centavos: 800, segundosPorTiempo: 360 });
    });

    test('modo D suma ambos componentes', () => {
        const m = crearTaximetro({ ...t, modo: 'D' });
        m.tramo(1000000, 180, 'asfalto');
        assert.equal(m.importe().centavos, 500 + 300 + 150);
    });

    test('detenido, la superficie no cambia el importe', () => {
        for (const s of ['asfalto', 'tierra', 'empedrado']) {
            const m = crearTaximetro(t);
            m.tramo(0, 600, s);
            assert.equal(m.importe().centavos, 1000);
        }
    });

    test('dos horas de tramos de 1 s no pierden precisión', () => {
        const m = crearTaximetro(t);
        for (let i = 0; i < 7200; i++) m.tramo(10000, 1, 'asfalto'); // 72 km a 36 km/h
        assert.equal(m.importe().centavos, 500 + 72 * 300);
    });

    // Mismo caso en test/taximetro_test.dart: la app y el servidor deben dar el mismo importe
    const rutaCompartida = () => {
        const p = Array.from({ length: 21 }, (_, i) => [-16.5, -68.19 + i * 0.0005, i * 6, i > 15 ? 1 : 0]);
        return leerRuta([...p, [...p[20].slice(0, 2), 240, 1]]);
    };
    const pulpos = { Cb: 2, Cl: 0.1, Pc: 6.96, FH: 1.4, FR: 2.5, FE: 2, Ct: 0.5, B: 2, S: 0.5 };

    test('caso compartido con la app', () => {
        assert.deepEqual(taximetro(rutaCompartida(), tarifasEnteras({ ...pulpos, modo: 'S' })), { centavos: 850, segundosPorTiempo: 120 });
        assert.equal(taximetro(rutaCompartida(), tarifasEnteras({ ...pulpos, modo: 'D' })).centavos, 950);
    });

    test('tarifaEstimada: distancia en movimiento y tiempo detenido', () => {
        const tp = tarifasEnteras({ ...pulpos, modo: 'S' });
        // 2 + ⌊(5 × 3.7744 + 10 × 0.5) / 0.5⌋ × 0.5
        assert.equal(tarifaEstimada({ km_asfalto: 5, minutos_detenido: 10, minutos_en_movimiento: 20 }, tp).centavos, 2550);
        assert.equal(tarifaEstimada({ km_asfalto: 5, minutos_detenido: 10, minutos_en_movimiento: 20 }, { ...tp, modo: 'D' }).centavos, 3550);
    });

    const viajeV5 = (extra = {}) => {
        const r = resumenRuta(rutaCompartida());
        return {
            distancia_km: r.km, km_asfalto: r.km_asfalto, km_tierra: r.km_tierra, tiempo_detencion_min: 2,
            costo_base_aplicado: 2, consumo_litros_aplicado: 0.1, precio_combustible_aplicado: 6.96,
            factor_altitud_aplicado: 1.4, factor_superficie_aplicado: 2.5, factor_empedrado_aplicado: 2, costo_minuto_aplicado: 0.5,
            modo_tarifa_aplicado: 'S', bajada_bandera_aplicada: 2, valor_salto_aplicado: 0.5, tarifa_cobrada: 8.5, ...extra,
        };
    };
    const kmV5 = () => { const r = resumenRuta(rutaCompartida()); return { km_asfalto: r.km_asfalto, km_tierra: r.km_tierra, km_empedrado: 0 }; };

    test('verificarViaje recalcula un viaje v5 con su ruta', () => {
        const v = verificarViaje({ cuerpo: viajeV5(), km: kmV5(), ruta: rutaCompartida() });
        assert.deepEqual([v.estado, v.tarifa_calculada], ['ok', 8.5]);
        const caro = verificarViaje({ cuerpo: viajeV5({ tarifa_cobrada: 9 }), km: kmV5(), ruta: rutaCompartida() });
        assert.equal(caro.estado, 'diferencia');
        assert.match(caro.detalle, /\(9\.00\) no coincide con la fórmula \(8\.50\)/);
    });

    test('viaje v5 sin ruta queda sin_ruta; con modo o salto inválidos, sin verificar', () => {
        assert.deepEqual(Object.values(verificarViaje({ cuerpo: viajeV5(), km: kmV5() })).slice(0, 3), ['sin_ruta', null, null]);
        for (const extra of [{ modo_tarifa_aplicado: 'X' }, { valor_salto_aplicado: 0 }, { bajada_bandera_aplicada: undefined }])
            assert.equal(verificarViaje({ cuerpo: viajeV5(extra), km: kmV5(), ruta: rutaCompartida() }).estado, 'sin_verificar');
    });
});
