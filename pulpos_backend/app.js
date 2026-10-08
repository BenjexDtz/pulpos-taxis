require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY || 'loopback');

app.use(helmet());

const origenesPermitidos = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:8080')
    .split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({ origin: origenesPermitidos }));

app.use(express.json());
app.use((req, res, next) => { req.body ??= {}; next(); });

app.get('/', (req, res) => res.json({ mensaje: '📡 Central de radio taxis en línea' }));

app.use(require('./rutas/autenticacion'));
app.use(require('./rutas/mfa'));
app.use(require('./rutas/empresa'));
app.use(require('./rutas/movil'));
app.use(require('./rutas/viajes'));
app.use(require('./rutas/estadisticas'));
app.use(require('./rutas/choferes'));
app.use(require('./rutas/auditoria'));
app.use(require('./rutas/plataforma'));

app.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada.' }));

app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed')
        return res.status(400).json({ error: 'JSON inválido.' });
    if (err.status >= 400 && err.status < 500)
        return res.status(err.status).json({ error: 'Petición inválida.' });

    console.error('❌ Error no controlado:', err);
    res.status(500).json({ error: 'Error interno.' });
});

module.exports = app;
