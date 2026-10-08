const app = require('./app');
const auditoria = require('./auditoria');
const { filtroFechas, validarEmpresa, distanciaKm } = require('./validacion');

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, '0.0.0.0', () =>
        console.log(`🚀 Servidor corriendo en puerto ${PORT}`)
    );
    if (!auditoria.configurada)
        console.warn('⚠️ AUDIT_DB_NAME no está definido: los eventos de auditoría quedan en cola en la base principal.');
    setInterval(() => auditoria.reenviarPendientes().catch(() => {}), 30_000).unref();
}

module.exports = { app, filtroFechas, validarEmpresa, distanciaKm };
