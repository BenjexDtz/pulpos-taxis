const crypto = require('node:crypto');
const QRCode = require('qrcode');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIODO = 30;
const DIGITOS = 6;
const VENTANA = 1;
const TOTAL_RESPALDO = 10;
const ALFABETO_RESPALDO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const aBase32 = (buf) => {
    let bits = '', salida = '';
    for (const b of buf) bits += b.toString(2).padStart(8, '0');
    for (let i = 0; i < bits.length; i += 5) salida += BASE32[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)];
    return salida;
};

const deBase32 = (texto) => {
    let bits = '';
    for (const c of texto.replace(/[=\s]/g, '').toUpperCase()) {
        const v = BASE32.indexOf(c);
        if (v < 0) throw new Error('Base32 inválido');
        bits += v.toString(2).padStart(5, '0');
    }
    const bytes = [];
    for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
    return Buffer.from(bytes);
};

const generarSecreto = () => aBase32(crypto.randomBytes(20));

const pasoActual = (ahora = Date.now()) => Math.floor(ahora / 1000 / PERIODO);

// RFC 4226 (HOTP) sobre el contador de tiempo de RFC 6238.
const codigoEnPaso = (secreto, paso) => {
    const contador = Buffer.alloc(8);
    contador.writeBigUInt64BE(BigInt(paso));
    const hmac = crypto.createHmac('sha1', deBase32(secreto)).update(contador).digest();
    const inicio = hmac[hmac.length - 1] & 0x0f;
    const numero = hmac.readUInt32BE(inicio) & 0x7fffffff;
    return String(numero % 10 ** DIGITOS).padStart(DIGITOS, '0');
};

const iguales = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

// Devuelve el paso que coincide (para impedir reutilizar el código) o null.
const verificarTotp = (secreto, codigo, ahora = Date.now()) => {
    if (typeof codigo !== 'string' || !/^\d{6}$/.test(codigo)) return null;
    const actual = pasoActual(ahora);
    for (let d = -VENTANA; d <= VENTANA; d++)
        if (iguales(codigoEnPaso(secreto, actual + d), codigo)) return actual + d;
    return null;
};

const uriOtpauth = (emisor, cuenta, secreto) => {
    const etiqueta = encodeURIComponent(`${emisor}:${cuenta}`);
    const q = new URLSearchParams({ secret: secreto, issuer: emisor, algorithm: 'SHA1', digits: DIGITOS, period: PERIODO });
    return `otpauth://totp/${etiqueta}?${q}`;
};

const qrDe = (uri) => QRCode.toDataURL(uri, { margin: 1, width: 220 });

const clave = () => crypto.createHash('sha256')
    .update(process.env.MFA_CLAVE || `mfa:${process.env.JWT_SECRET}`).digest();

// AES-256-GCM: "iv.tag.cifrado" en base64url.
const cifrar = (texto) => {
    const iv = crypto.randomBytes(12);
    const c = crypto.createCipheriv('aes-256-gcm', clave(), iv);
    const cifrado = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
    return [iv, c.getAuthTag(), cifrado].map(b => b.toString('base64url')).join('.');
};

const descifrar = (guardado) => {
    const [iv, tag, cifrado] = guardado.split('.').map(p => Buffer.from(p, 'base64url'));
    const d = crypto.createDecipheriv('aes-256-gcm', clave(), iv);
    d.setAuthTag(tag);
    return Buffer.concat([d.update(cifrado), d.final()]).toString('utf8');
};

const normalizarRespaldo = (codigo) =>
    typeof codigo === 'string' ? codigo.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';

const hashRespaldo = (codigo) => crypto.createHash('sha256').update(normalizarRespaldo(codigo)).digest('hex');

const generarCodigosRespaldo = () => Array.from({ length: TOTAL_RESPALDO }, () => {
    const c = Array.from(crypto.randomBytes(8), b => ALFABETO_RESPALDO[b % ALFABETO_RESPALDO.length]).join('');
    return `${c.slice(0, 4)}-${c.slice(4)}`;
});

const esCodigoRespaldo = (codigo) => normalizarRespaldo(codigo).length === 8;

module.exports = {
    generarSecreto, codigoEnPaso, pasoActual, verificarTotp, uriOtpauth, qrDe,
    cifrar, descifrar, hashRespaldo, generarCodigosRespaldo, esCodigoRespaldo,
};
