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

// ─── Taxímetro v5: modo S de la Directiva 2014/32/UE (Anexo IX, MI-007) con superficie por tramos ───
// Mismo algoritmo que taximetro.dart. Por tramo de la ruta (d km, t s, superficie F del punto final):
//   modo S: max(d × F × Tkm, t × Th)    modo D: d × F × Tkm + t × Th
// con Tkm = Cb + Cl × Pc y Th = 60 × Ct. Importe = B + S × saltos completos. La altitud no es un
// factor aparte: queda dentro de los costos medidos en la ciudad (FH solo lo usan los viajes v4).
// Enteros exactos: tarifas en milicentavos, distancia en mm y tiempo en s; 1 mc = 9e6 unidades
// (mm × mc/km × 9 = s × mc/h × 2500), así ambos componentes se comparan sin redondeos.
const U_POR_CENTAVO = 9_000_000_000n;

const tarifasEnteras = ({ Cb, Cl, Pc, FR, FE, Ct, B, S, modo }) => {
    const km = Cb + Cl * Pc;
    return {
        modo, bajada: Math.round(B * 100), salto: Math.round(S * 100),
        porKm: { asfalto: Math.round(km * 1e5), tierra: Math.round(km * FR * 1e5), empedrado: Math.round(km * FE * 1e5) },
        porHora: Math.round(Ct * 6e6),
    };
};

// Directiva 2014/32/UE, Anexo IX: velocidad de cruce = tarifa por tiempo / tarifa por distancia
const velocidadCruceKmh = (t, superficie = 'asfalto') => t.porHora / t.porKm[superficie];

const crearTaximetro = (t) => {
    const saltoU = BigInt(t.salto) * U_POR_CENTAVO;
    let acumulado = 0n, saltos = 0, segundosPorTiempo = 0;
    return {
        tramo(mm, segundos, superficie) {
            const porDistancia = BigInt(mm) * BigInt(t.porKm[superficie]) * 9n;
            const porTiempo = BigInt(segundos) * BigInt(t.porHora) * 2500n;
            if (porTiempo >= porDistancia) segundosPorTiempo += segundos;
            acumulado += t.modo === 'D' ? porDistancia + porTiempo : (porDistancia > porTiempo ? porDistancia : porTiempo);
            const n = acumulado / saltoU;
            saltos += Number(n);
            acumulado -= n * saltoU;
        },
        importe: () => ({ centavos: t.bajada + saltos * t.salto, segundosPorTiempo }),
    };
};

const coordenada = (x) => Math.round(x * 1e6) / 1e6;

const taximetro = (puntos, t) => {
    const m = crearTaximetro(t);
    for (let i = 1; i < puntos.length; i++) {
        const a = puntos[i - 1], b = puntos[i];
        const mm = Math.round(distanciaKm(coordenada(a.lat), coordenada(a.lng), coordenada(b.lat), coordenada(b.lng)) * 1e6);
        m.tramo(mm, b.segundos - a.segundos, b.superficie);
    }
    return m.importe();
};

// Sin ruta (asistente, vista previa): supone que en movimiento se supera la velocidad de cruce,
// así que en modo S el tiempo solo se cobra detenido; en modo D también el de movimiento.
const tarifaEstimada = ({ km_asfalto = 0, km_tierra = 0, km_empedrado = 0, minutos_detenido = 0, minutos_en_movimiento = 0 }, t) => {
    const m = crearTaximetro({ ...t, modo: 'D' });
    const km = { asfalto: km_asfalto, tierra: km_tierra, empedrado: km_empedrado };
    for (const s of SUPERFICIES) m.tramo(Math.round(km[s] * 1e6), 0, s);
    const minutos = minutos_detenido + (t.modo === 'D' ? minutos_en_movimiento : 0);
    m.tramo(0, Math.round(minutos * 60), 'asfalto');
    return m.importe();
};

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

const MODOS_TARIFA = ['S', 'D'];
// Apps anteriores a la v5 no envían el modo: su tarifa es la fórmula v4
const esTaximetro = (b) => b.modo_tarifa_aplicado !== undefined;

const aplicadosDe = (b, km) => {
    const v = {
        Cb: b.costo_base_aplicado, Cl: b.consumo_litros_aplicado, Pc: b.precio_combustible_aplicado,
        Ct: b.costo_minuto_aplicado,
        FR: km.km_tierra > 0 ? b.factor_superficie_aplicado : (b.factor_superficie_aplicado ?? 1),
        FE: km.km_empedrado > 0 ? b.factor_empedrado_aplicado : (b.factor_empedrado_aplicado ?? 1),
        ...(esTaximetro(b)
            ? { B: b.bajada_bandera_aplicada, S: b.valor_salto_aplicado }
            : { Td: b.tiempo_detencion_min, FH: b.factor_altitud_aplicado }),
    };
    if (!Object.values(v).every(x => typeof x === 'number' && Number.isFinite(x))) return null;
    if (!esTaximetro(b)) return v;
    return MODOS_TARIFA.includes(b.modo_tarifa_aplicado) && v.S > 0 && v.B >= 0 ? { ...v, modo: b.modo_tarifa_aplicado } : null;
};

const tarifaCalculada = (cuerpo, km, ruta, aplicados) => {
    if (!esTaximetro(cuerpo)) return redondear(tarifaV4({ ...km, ...aplicados }));
    return ruta ? taximetro(ruta, tarifasEnteras(aplicados)).centavos / 100 : null;
};

const CAMPOS_VERSION = [
    ['costo_base_aplicado', 'costo_base_km', 'Cb'],
    ['consumo_litros_aplicado', 'consumo_litros_km', 'Cl'],
    ['precio_combustible_aplicado', 'precio_combustible_bs', 'Pc'],
    ['costo_minuto_aplicado', 'costo_minuto_detencion', 'Ct'],
    ['factor_superficie_aplicado', 'factor_superficie', 'FR'],
    ['factor_empedrado_aplicado', 'factor_empedrado', 'FE'],
];
const CAMPOS_V5 = [
    ['bajada_bandera_aplicada', 'bajada_bandera_bs', 'B'],
    ['valor_salto_aplicado', 'valor_salto_bs', 'S'],
    ['modo_tarifa_aplicado', 'modo_tarifa', 'modo'],
];
const CAMPOS_V4 = [['factor_altitud_aplicado', 'factor_altitud', 'FH']];

const mismoValor = (enviado, guardado) => typeof enviado === 'string'
    ? enviado === String(guardado).trim()
    : Math.abs(enviado - Number(guardado)) < 1e-9;

// versiones: historial de la empresa, la vigente primero. Solo se comparan los valores que la app envió
const parametrosFueraDeVersion = (cuerpo, versiones) => {
    if (!versiones?.length) return null;
    const campos = [...CAMPOS_VERSION, ...(esTaximetro(cuerpo) ? CAMPOS_V5 : CAMPOS_V4)]
        .filter(([c]) => typeof cuerpo[c] === 'number' || (c === 'modo_tarifa_aplicado' && typeof cuerpo[c] === 'string'));
    if (!campos.length) return null;
    const coincide = (v) => campos.every(([c, col]) => mismoValor(cuerpo[c], v[col]));
    if (versiones.some(coincide)) return null;
    const distintos = campos.filter(([c, col]) => !mismoValor(cuerpo[c], versiones[0][col]))
        .map(([c, col, nombre]) => `${nombre} ${cuerpo[c]} (vigente ${String(versiones[0][col]).trim()})`);
    return `los parámetros aplicados no corresponden a ninguna tarifa de la empresa: ${distintos.join(', ')}`;
};

// ruta: undefined si la app no la envió, null si llegó con formato inválido
const verificarViaje = ({ cuerpo, km, ruta, versiones, ahora = Date.now() }) => {
    const problemas = [];
    const fuera = parametrosFueraDeVersion(cuerpo, versiones);
    if (fuera) problemas.push(fuera);
    // Un reloj del teléfono adelantado no bloquea el viaje, pero queda anotado
    if (Date.parse(cuerpo.fecha_hora_viaje) > ahora + 24 * 3600 * 1000)
        problemas.push(`la fecha del viaje (${cuerpo.fecha_hora_viaje}) está en el futuro`);
    const aplicados = aplicadosDe(cuerpo, km);
    let tarifa_calculada = null;
    if (aplicados && typeof cuerpo.tarifa_cobrada === 'number') {
        tarifa_calculada = tarifaCalculada(cuerpo, km, ruta, aplicados);
        if (tarifa_calculada !== null && Math.abs(tarifa_calculada - cuerpo.tarifa_cobrada) > TOLERANCIA_TARIFA)
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

    // Un viaje v5 sin ruta no se puede recalcular: el taxímetro depende de cada tramo
    const estado = problemas.length ? 'diferencia'
        : ruta === undefined && aplicados && esTaximetro(cuerpo) ? 'sin_ruta'
        : tarifa_calculada === null ? 'sin_verificar'
        : ruta === undefined ? 'sin_ruta' : 'ok';
    return { estado, detalle: problemas.join('; ') || null, tarifa_calculada, distancia_ruta_km, ...superficie };
};

module.exports = {
    tarifaV4, tarifasEnteras, velocidadCruceKmh, crearTaximetro, taximetro, tarifaEstimada, MODOS_TARIFA,
    leerRuta, resumenRuta, evaluarSuperficie, verificarViaje, parametrosFueraDeVersion, MAX_PUNTOS, MIN_LECTURAS,
};
