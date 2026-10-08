const esDiaValido = (s) =>
    typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    !isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s);

const validarRangoDias = ({ desde, hasta }) => {
    for (const dia of [desde, hasta])
        if (dia !== undefined && dia !== '' && !esDiaValido(dia))
            return '⚠️ Fecha inválida: usa el formato YYYY-MM-DD.';
    if (desde && hasta && desde > hasta)
        return '⚠️ La fecha "desde" es posterior a "hasta".';
    return null;
};

const filtroFechas = ({ desde, hasta }, params) => {
    const error = validarRangoDias({ desde, hasta });
    if (error) return { error };
    const condiciones = [];
    if (desde) { params.push(desde); condiciones.push(`v.fecha_hora_viaje >= $${params.length}::date`); }
    if (hasta) { params.push(hasta); condiciones.push(`v.fecha_hora_viaje < $${params.length}::date + 1`); }
    return { condiciones };
};

const numeroEnRango = (crudo, min, max) => {
    const n = (typeof crudo === 'number' || (typeof crudo === 'string' && crudo.trim() !== ''))
        ? Number(crudo) : NaN;
    return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

const textoOpcional = (crudo, max) => {
    if (crudo === undefined || crudo === null || crudo === '') return { valor: null };
    if (typeof crudo !== 'string' || crudo.trim().length > max) return { error: true };
    return { valor: crudo.trim() || null };
};

const zonaHorariaValida = (zona) => {
    try { new Intl.DateTimeFormat('es', { timeZone: zona }); return true; } catch { return false; }
};

// Mismos límites que los inputs del panel
const RANGOS_PARAMETROS = {
    costo_base_km:          [0.5, 10],
    consumo_litros_km:      [0.05, 0.5],
    precio_combustible_bs:  [1, 30],
    factor_altitud:         [1, 3],
    factor_superficie:      [1, 5],
    costo_minuto_detencion: [0.1, 5],
};

const PARAMETROS_INICIALES = {
    costo_base_km: 2.00, consumo_litros_km: 0.100, precio_combustible_bs: 6.96,
    factor_altitud: 1.00, factor_superficie: 2.00, costo_minuto_detencion: 0.50,
};

const CAMPOS_EMPRESA = [
    'nombre', 'nit', 'telefono', 'email', 'direccion', 'ciudad', 'pais', 'zona_horaria',
    'moneda_codigo', 'moneda_simbolo', 'centro_lat', 'centro_lng', 'radio_operacion_km',
    'altitud_msnm', 'color_primario', 'logo_url',
];

const validarEmpresa = (b) => {
    const v = {};
    const texto = (campo, min, max) => {
        const s = typeof b[campo] === 'string' ? b[campo].trim() : '';
        if (s.length < min || s.length > max) return false;
        v[campo] = s;
        return true;
    };
    if (!texto('nombre', 2, 120)) return { error: '⚠️ El nombre es obligatorio (2 a 120 caracteres).' };
    if (!texto('ciudad', 2, 80)) return { error: '⚠️ La ciudad es obligatoria.' };
    for (const [campo, max] of [['nit', 30], ['telefono', 30], ['direccion', 200]]) {
        const t = textoOpcional(b[campo], max);
        if (t.error) return { error: `⚠️ ${campo} no es válido (máx. ${max} caracteres).` };
        v[campo] = t.valor;
    }
    const email = textoOpcional(b.email, 100);
    if (email.error || (email.valor && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.valor)))
        return { error: '⚠️ El email de la empresa no es válido.' };
    v.email = email.valor;

    v.pais = typeof b.pais === 'string' && b.pais.trim() ? b.pais.trim().slice(0, 60) : 'Bolivia';
    v.zona_horaria = typeof b.zona_horaria === 'string' && b.zona_horaria.trim() ? b.zona_horaria.trim() : 'America/La_Paz';
    if (!zonaHorariaValida(v.zona_horaria)) return { error: '⚠️ Zona horaria no válida (ej. America/La_Paz).' };

    v.moneda_codigo = typeof b.moneda_codigo === 'string' && b.moneda_codigo.trim() ? b.moneda_codigo.trim().toUpperCase() : 'BOB';
    if (!/^[A-Z]{3}$/.test(v.moneda_codigo)) return { error: '⚠️ Código de moneda de 3 letras (ej. BOB).' };
    v.moneda_simbolo = typeof b.moneda_simbolo === 'string' && b.moneda_simbolo.trim() ? b.moneda_simbolo.trim() : 'Bs';
    if (v.moneda_simbolo.length > 5) return { error: '⚠️ Símbolo de moneda de hasta 5 caracteres.' };

    v.centro_lat = numeroEnRango(b.centro_lat, -90, 90);
    v.centro_lng = numeroEnRango(b.centro_lng, -180, 180);
    if (v.centro_lat === null || v.centro_lng === null)
        return { error: '⚠️ Latitud y longitud del centro de operación son obligatorias.' };
    v.radio_operacion_km = numeroEnRango(b.radio_operacion_km ?? 50, 1, 500);
    if (v.radio_operacion_km === null) return { error: '⚠️ El radio de operación debe estar entre 1 y 500 km.' };

    if (b.altitud_msnm === undefined || b.altitud_msnm === null || b.altitud_msnm === '') v.altitud_msnm = null;
    else {
        v.altitud_msnm = numeroEnRango(b.altitud_msnm, -500, 6000);
        if (v.altitud_msnm === null || !Number.isInteger(v.altitud_msnm))
            return { error: '⚠️ La altitud debe ser un número entero de metros.' };
    }

    v.color_primario = typeof b.color_primario === 'string' && b.color_primario ? b.color_primario : '#10b981';
    if (!/^#[0-9a-fA-F]{6}$/.test(v.color_primario)) return { error: '⚠️ Color en formato #RRGGBB.' };

    const logo = textoOpcional(b.logo_url, 300);
    if (logo.error || (logo.valor && !/^https:\/\/\S+$/.test(logo.valor)))
        return { error: '⚠️ El logo debe ser una URL https.' };
    v.logo_url = logo.valor;
    return { valores: v };
};

const distanciaKm = (lat1, lng1, lat2, lng2) => {
    const rad = (x) => x * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 +
              Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(a));
};

const conCostos = (p) => {
    const combustible = parseFloat(p.consumo_litros_km) * parseFloat(p.precio_combustible_bs);
    return {
        ...p,
        costo_combustible_km: parseFloat(combustible.toFixed(3)),
        costo_variable_km: parseFloat((parseFloat(p.costo_base_km) + combustible).toFixed(3)),
    };
};

module.exports = {
    validarRangoDias, filtroFechas, numeroEnRango, validarEmpresa, distanciaKm, conCostos,
    RANGOS_PARAMETROS, PARAMETROS_INICIALES, CAMPOS_EMPRESA,
};
