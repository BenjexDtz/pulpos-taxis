const { rateLimit } = require('express-rate-limit');
const { auditar } = require('../utilidades');

const limiteLogin = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: async (req, res, next, opciones) => {
        await auditar(req, { accion: 'sesion.bloqueo_intentos', resultado: 'rechazado', detalle: req.originalUrl });
        res.status(opciones.statusCode).json({ error: '⏳ Demasiados intentos fallidos. Espera 15 minutos.' });
    },
});

module.exports = limiteLogin;
