const { distanciaKm } = require('./validacion');

const MAX_PUNTOS = 20000;
const SUPERFICIES = ['asfalto', 'tierra'];
const TOLERANCIA_TARIFA = 0.02;

const redondear = (x, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

// Misma fórmula que calculadora.dart: T = (Da + Dt × FR) × (Cb + Cl × Pc) × FH + Ct × Td
const tarifaV4 = ({ km_asfalto, km_tierra, Cb, Cl, Pc, FH, FR, Ct, Td }) =>
    (km_asfalto + km_tierra * FR) * (Cb + Cl * Pc) * FH + Ct * Td;

// La app envía [[lat, lng, segundos desde el inicio, superficie]] con superficie 0 = asfalto, 1 = tierra
const leerRuta = (ruta) => {
    if (!Array.isArray(ruta) || ruta.length < 1 || ruta.length > MAX_PUNTOS) return null;
    const puntos = [];
    let segundosPrevios = 0;
    for (const p of ruta) {
        if (!Array.isArray(p) || p.length !== 4) return null;
        const [lat, lng, segundos, superficie] = p;
        if (![lat, lng].every(Number.isFinite) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
        if (!Number.isInteger(segundos) || segundos < segundosPrevios || ![0, 1].includes(superficie)) return null;
        segundosPrevios = segundos;
        puntos.push({ lat, lng, segundos, superficie: SUPERFICIES[superficie] });
    }
    return puntos;
};

// Cada tramo cuenta para la superficie del punto en que termina, como en la app
const resumenRuta = (puntos) => {
    const km = { asfalto: 0, tierra: 0 };
    for (let i = 1; i < puntos.length; i++)
        km[puntos[i].superficie] += distanciaKm(puntos[i - 1].lat, puntos[i - 1].lng, puntos[i].lat, puntos[i].lng);
    return { km_asfalto: km.asfalto, km_tierra: km.tierra, km: km.asfalto + km.tierra };
};

// La app mide con otro radio terrestre y descarta lecturas imprecisas: se tolera 1 % o 20 m
const kmCoinciden = (a, b) => Math.abs(a - b) <= Math.max(0.02, 0.01 * Math.max(a, b));

const aplicadosDe = (b, km) => {
    const v = {
        Cb: b.costo_base_aplicado, Cl: b.consumo_litros_aplicado, Pc: b.precio_combustible_aplicado,
        FH: b.factor_altitud_aplicado, Ct: b.costo_minuto_aplicado, Td: b.tiempo_detencion_min,
        FR: km.km_tierra > 0 ? b.factor_superficie_aplicado : (b.factor_superficie_aplicado ?? 1),
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
    if (ruta === null) problemas.push('la ruta llegó con formato inválido');
    else if (ruta !== undefined) {
        const r = resumenRuta(ruta);
        distancia_ruta_km = redondear(r.km, 3);
        if (!kmCoinciden(r.km, km.km_asfalto + km.km_tierra))
            problemas.push(`la ruta mide ${r.km.toFixed(3)} km y el viaje declara ${(km.km_asfalto + km.km_tierra).toFixed(3)} km`);
        else if (!kmCoinciden(r.km_tierra, km.km_tierra))
            problemas.push(`la ruta tiene ${r.km_tierra.toFixed(3)} km en tierra y el viaje declara ${km.km_tierra.toFixed(3)} km`);
    }

    const estado = problemas.length ? 'diferencia'
        : tarifa_calculada === null ? 'sin_verificar'
        : ruta === undefined ? 'sin_ruta' : 'ok';
    return { estado, detalle: problemas.join('; ') || null, tarifa_calculada, distancia_ruta_km };
};

module.exports = { tarifaV4, leerRuta, resumenRuta, verificarViaje, MAX_PUNTOS };
