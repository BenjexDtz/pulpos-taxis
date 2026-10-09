const express = require('express');
const { rateLimit } = require('express-rate-limit');
const pool = require('../db');
const asistente = require('../asistente');
const { verificarToken, soloAdmin } = require('../middlewares/autenticacion');
const { auditar } = require('../utilidades');

const router = express.Router();

const MAX_MENSAJES = 12;
const MAX_CARACTERES = 1000;

// Protege la cuota gratuita del proveedor: el límite es por administrador, no por IP.
const limiteAsistente = rateLimit({
    windowMs: 10 * 60 * 1000,
    limit: 20,
    keyGenerator: (req) => `admin:${req.usuario.id}`,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res, next, opciones) =>
        res.status(opciones.statusCode).json({ error: '⏳ Demasiadas preguntas seguidas. Espera unos minutos.' }),
});

const validarMensajes = (mensajes) => {
    if (!Array.isArray(mensajes) || !mensajes.length || mensajes.length > MAX_MENSAJES)
        return { error: `⚠️ Envía de 1 a ${MAX_MENSAJES} mensajes.` };
    const limpios = [];
    for (const m of mensajes) {
        const texto = typeof m?.texto === 'string' ? m.texto.trim() : '';
        if (!['usuario', 'asistente'].includes(m?.rol) || !texto || texto.length > MAX_CARACTERES)
            return { error: `⚠️ Cada mensaje necesita rol válido y texto de 1 a ${MAX_CARACTERES} caracteres.` };
        limpios.push({ role: m.rol === 'usuario' ? 'user' : 'assistant', content: texto });
    }
    if (limpios.at(-1).role !== 'user') return { error: '⚠️ El último mensaje debe ser una pregunta.' };
    return { mensajes: limpios };
};

router.post('/api/admin/asistente', verificarToken, soloAdmin, limiteAsistente, async (req, res) => {
    if (!asistente.configurado())
        return res.status(503).json({ error: '⚠️ El asistente no está configurado en el servidor (falta LLM_API_KEY).' });
    const v = validarMensajes(req.body.mensajes);
    if (v.error) return res.status(400).json({ error: v.error });

    const e = await pool.query(`SELECT nombre, ciudad, zona_horaria FROM empresas WHERE id = $1`, [req.empresa.id]);
    if (!e.rows.length) return res.status(404).json({ error: 'Empresa no encontrada.' });
    const hoy = asistente.hoyEn(e.rows[0].zona_horaria);
    const contexto = { empresaId: req.empresa.id, hoy };
    const mensajes = [
        { role: 'system', content: asistente.promptSistema({ ...e.rows[0], moneda: req.empresa.moneda_simbolo, hoy }) },
        ...v.mensajes,
    ];

    const pregunta = v.mensajes.at(-1).content;
    const usadas = [];
    contexto.alEjecutar = (nombre) => usadas.push(nombre);
    const registrar = (resultado, extra = '') => auditar(req, {
        accion: 'asistente.consulta', entidad: 'asistente', resultado,
        detalle: `${pregunta.slice(0, 200)} [${usadas.join(', ') || 'sin datos'}]${extra}`,
    });

    try {
        const { respuesta } = await asistente.responder(mensajes, contexto);
        if (respuesta) {
            await registrar('exito');
            return res.json({ respuesta, consultas: usadas });
        }
        await registrar('error', ' sin respuesta final');
        return res.status(502).json({ error: '⚠️ El asistente no llegó a una respuesta. Reformula la pregunta.' });
    } catch (err) {
        if (err.estadoModelo === undefined) throw err;
        console.error('❌ Asistente:', err.message, err.detalle ?? '');
        await registrar('error', ` (modelo: ${err.estadoModelo})`);
        if (err.estadoModelo === 429)
            return res.status(503).json({ error: '⏳ Se alcanzó el límite gratuito del modelo. Intenta en un minuto.' });
        return res.status(502).json({ error: '⚠️ El asistente no está disponible en este momento.' });
    }
});

module.exports = router;
