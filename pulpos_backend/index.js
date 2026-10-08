const app = require('./app');
const auditoria = require('./auditoria');
const { filtroFechas, validarEmpresa, distanciaKm } = require('./validacion');

const CLAVES_DE_EJEMPLO = ['cambia_esto_por_una_clave_segura', 'se_modificara_en_produccion'];

if (require.main === module) {
    const clave = process.env.JWT_SECRET ?? '';
    if (!clave) {
        console.error('❌ Falta JWT_SECRET: sin ella no se pueden firmar sesiones. Defínela en el .env.');
        process.exit(1);
    }
    if (clave.length < 32 || CLAVES_DE_EJEMPLO.includes(clave))
        console.warn('⚠️ JWT_SECRET es corta o es la de ejemplo: cualquiera que la conozca puede falsificar sesiones. Usa 32 caracteres aleatorios o más.');

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () =>
        console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
    );
    if (!auditoria.configurada)
        console.warn('⚠️ AUDIT_DB_NAME no está definido: los eventos de auditoría quedan en cola en la base principal.');
    setInterval(() => auditoria.reenviarPendientes().catch(() => {}), 30_000).unref();
}

module.exports = { app, filtroFechas, validarEmpresa, distanciaKm };
