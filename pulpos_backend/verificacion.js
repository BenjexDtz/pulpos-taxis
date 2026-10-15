const { distanciaKm, numeroEnRango, SUPERFICIES } = require('./validacion');

const MAX_PUNTOS = 20000;
const TOLERANCIA_TARIFA = 0.02;
const MAX_VIBRACION = 50;
// Lecturas mínimas para comparar y cuánto más debe vibrar lo marcado como irregular
const MIN_LECTURAS = 10;
const RAZON_IRREGULAR = 1.5;

const redondear = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// Misma fórmula que calculadora.dart: T = (Da + Dt × FR + De × FE) × (Cb + Cl × Pc) × FH + Ct × Td
const tarifaV4 = ({ km_asfalto, km_tierra, km_empedrado = 0, Cb, Cl, Pc, FH, FR, FE = 1, Ct, Td }) =>
    (km_asfalto + km_tierra * FR + km_empedrado * FE) * (Cb + Cl * Pc) * FH + Ct * Td;

// La app envía [[lat, lng, segundos desde el inicio, superficie, vibración?]] con superficie
// 0 = asfalto, 1 = tierra, 2 = empedrado y la vibración en m/s² (RMS) solo si la midió
const leerRuta = (ruta) => {
    if (!Array.isArray(ruta) || ruta.length < 1 || ruta.length > MAX_PUNTOS) return null;
    const puntos = [];
    let segundosPrevios = 0;
    for (const p of ruta) {
        if (!Array.isArray(p) || p.length < 4 || p.length > 5) return null;
        const [lat, lng, segundos, superficie, vibracion = null] = p;
        if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        if (!Number.isInteger(segundos) || segundos < segundosPrevios || !Number.isInteger(superficie) || !SUPERFICIES[superficie]) return null;
        if (vibracion !== null && !(Number.isFinite(vibracion) && vibracion >= 0 && vibracion <= MAX_VIBRACION)) return null;
        segundosPrevios = segundos;
        puntos.push({ lat, lng, segundos, superficie: SUPERFICIES[superficie], vibracion });
    }
    return puntos;
};

// Cada tramo cuenta para la superficie del punto en que termina, como en la app
const resumenRuta = (puntos) => {
    const km = Object.fromEntries(SUPERFICIES.map(s => [s, 0]));
    for (let i = 1; i < puntos.length; i++)
        km[puntos[i].superficie] += distanciaKm(puntos[i - 1].lat, puntos[i - 1].lng, puntos[i].lat, puntos[i].lng);
    return {
        km_asfalto: km.asfalto, km_tierra: km.tierra, km_empedrado: km.empedrado,
        km: km.asfalto + km.tierra + km.empedrado,
    };
};

const media = (xs) => xs.reduce((a, x) => a + x, 0) / xs.length;

// ¿Los tramos marcados como tierra o empedrado vibraron más que el asfalto? La referencia es el
// asfalto del mismo viaje o, si hubo poco, la que la app aprendió para ese teléfono y vehículo.
// No cambia la tarifa ni la verificación: es un indicio para que la gerencia revise.
const evaluarSuperficie = (puntos, referenciaApp) => {
    const tramos = puntos.slice(1);
    const lecturas = (irregular) => tramos
        .filter(p => p.vibracion !== null && (p.superficie !== 'asfalto') === irregular)
        .map(p => p.vibracion);
    const asfalto = lecturas(false);
    const irregular = lecturas(true);
    const referencia = asfalto.length >= MIN_LECTURAS ? media(asfalto) : referenciaApp;
    const resultado = {
        vibracion_referencia: referencia == null ? null : redondear(referencia),
        vibracion_irregular: irregular.length ? redondear(media(irregular)) : null,
        superficie_respaldo: null,
    };
    if (!tramos.some(p => p.superficie !== 'asfalto')) return resultado;
    if (irregular.length < MIN_LECTURAS || !referencia) return { ...resultado, superficie_respaldo: 'sin_datos' };
    const respaldada = media(irregular) >= RAZON_IRREGULAR * referencia;
    return { ...resultado, superficie_respaldo: respaldada ? 'respaldada' : 'dudosa' };
};

// La app mide con otro radio terrestre y descarta lecturas imprecisas: se tolera 1 % o 20 m
const kmCoinciden = (a, b) => Math.abs(a - b) <= Math.max(0.02, 0.01 * Math.max(a, b));

const aplicadosDe = (b, km) => {
    const v = {
        Cb: b.costo_base_aplicado, Cl: b.consumo_litros_aplicado, Pc: b.precio_combustible_aplicado,
        FH: b.factor_altitud_aplicado, Ct: b.costo_minuto_aplicado, Td: b.tiempo_detencion_min,
        FR: km.km_tierra > 0 ? b.factor_superficie_aplicado : (b.factor_superficie_aplicado ?? 1),
        FE: km.km_empedrado > 0 ? b.factor_empedrado_aplicado : (b.factor_empedrado_aplicado ?? 1),
    };
    return Object.values(v).every(x => typeof x === 'number' && Number.isFinite(x)) ? v : null;
};

// ruta: undefined si la app no la envió, null si llegó con formato inválido
const verificarViaje = ({ cuerpo, km, ruta }) => {
    const problemas = [];
    const aplicados = aplicadosDe(cuerpo, km);
    let tarifa_calculada = null;
    if (aplicados && typeof cuerpo.tarifa_cobrada === 'number') {
        tarifa_calculada = redondear(tarifaV4({ ...km, ...aplicados }));
        if (Math.abs(tarifa_calculada - cuerpo.tarifa_cobrada) > TOLERANCIA_TARIFA)
            problemas.push(`la tarifa cobrada (${cuerpo.tarifa_cobrada.toFixed(2)}) no coincide con la fórmula (${tarifa_calculada.toFixed(2)})`);
    }

    let distancia_ruta_km = null;
    let superficie = { vibracion_referencia: null, vibracion_irregular: null, superficie_respaldo: null };
    if (ruta === null) problemas.push('la ruta llegó con formato inválido');
    else if (ruta !== undefined) {
        superficie = evaluarSuperficie(ruta, numeroEnRango(cuerpo.vibracion_referencia, 0.05, 5));
        const r = resumenRuta(ruta);
        distancia_ruta_km = redondear(r.km, 3);
        const declarados = km.km_asfalto + km.km_tierra + km.km_empedrado;
        if (!kmCoinciden(r.km, declarados))
            problemas.push(`la ruta mide ${r.km.toFixed(3)} km y el viaje declara ${declarados.toFixed(3)} km`);
        else for (const s of ['tierra', 'empedrado'])
            if (!kmCoinciden(r[`km_${s}`], km[`km_${s}`]))
                problemas.push(`la ruta tiene ${r[`km_${s}`].toFixed(3)} km en ${s} y el viaje declara ${km[`km_${s}`].toFixed(3)} km`);
    }

    const estado = problemas.length ? 'diferencia'
        : tarifa_calculada === null ? 'sin_verificar'
        : ruta === undefined ? 'sin_ruta' : 'ok';
    return { estado, detalle: problemas.join('; ') || null, tarifa_calculada, distancia_ruta_km, ...superficie };
};

module.exports = { tarifaV4, leerRuta, resumenRuta, evaluarSuperficie, verificarViaje, MAX_PUNTOS, MIN_LECTURAS };
