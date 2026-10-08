const { test } = require('node:test');
const assert = require('node:assert/strict');

process.env.JWT_SECRET = 'secreto_de_prueba';
const mfa = require('../mfa');

// "12345678901234567890" en Base32 (secreto de los vectores de RFC 6238, SHA-1).
const SECRETO_RFC = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

test('TOTP coincide con los vectores de prueba de RFC 6238', () => {
    for (const [segundos, esperado] of [[59, '287082'], [1111111109, '081804'], [1234567890, '005924'], [2000000000, '279037']])
        assert.equal(mfa.codigoEnPaso(SECRETO_RFC, mfa.pasoActual(segundos * 1000)), esperado, `t=${segundos}`);
});

test('acepta el código del paso anterior y siguiente, no los más lejanos', () => {
    const ahora = 1_800_000_000_000;
    const paso = mfa.pasoActual(ahora);
    const s = mfa.generarSecreto();
    for (const d of [-1, 0, 1]) assert.equal(mfa.verificarTotp(s, mfa.codigoEnPaso(s, paso + d), ahora), paso + d);
    for (const d of [-3, 3]) {
        const codigo = mfa.codigoEnPaso(s, paso + d);
        const cercanos = [-1, 0, 1].map(x => mfa.codigoEnPaso(s, paso + x));
        if (!cercanos.includes(codigo)) assert.equal(mfa.verificarTotp(s, codigo, ahora), null);
    }
    for (const malo of ['', '12345', '1234567', 'abcdef', null, 123456]) assert.equal(mfa.verificarTotp(s, malo, ahora), null);
});

test('el secreto tiene 160 bits y se cifra con AES-GCM: alterarlo se detecta', () => {
    const s = mfa.generarSecreto();
    assert.match(s, /^[A-Z2-7]{32}$/);
    const c1 = mfa.cifrar(s), c2 = mfa.cifrar(s);
    assert.notEqual(c1, c2);
    assert.ok(!c1.includes(s));
    assert.equal(mfa.descifrar(c1), s);
    const [iv, tag, dato] = c1.split('.');
    const alterado = [iv, tag, (dato[0] === 'A' ? 'B' : 'A') + dato.slice(1)].join('.');
    assert.throws(() => mfa.descifrar(alterado));
});

test('códigos de respaldo: 10 distintos, formato XXXX-XXXX y hash insensible a guiones y mayúsculas', () => {
    const codigos = mfa.generarCodigosRespaldo();
    assert.equal(new Set(codigos).size, 10);
    for (const c of codigos) assert.match(c, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    const c = codigos[0];
    assert.equal(mfa.hashRespaldo(c.toLowerCase().replace('-', ' ')), mfa.hashRespaldo(c));
    assert.match(mfa.hashRespaldo(c), /^[0-9a-f]{64}$/);
    assert.ok(mfa.esCodigoRespaldo(c) && !mfa.esCodigoRespaldo('123456'));
});

test('la URI otpauth lleva emisor, cuenta y secreto; el QR es una imagen PNG', async () => {
    const uri = mfa.uriOtpauth('Radio Taxis Pulpos', 'admin@pulpos.bo', SECRETO_RFC);
    assert.match(uri, /^otpauth:\/\/totp\/Radio%20Taxis%20Pulpos%3Aadmin%40pulpos\.bo\?/);
    const q = new URL(uri).searchParams;
    assert.deepEqual([q.get('secret'), q.get('issuer'), q.get('digits'), q.get('period')], [SECRETO_RFC, 'Radio Taxis Pulpos', '6', '30']);
    assert.match(await mfa.qrDe(uri), /^data:image\/png;base64,/);
});
