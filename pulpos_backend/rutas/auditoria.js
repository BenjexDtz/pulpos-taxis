const express = require('express');
const auditoria = require('../auditoria');
const { verificarToken, soloAdmin, soloSuperadmin } = require('../middlewares/autenticacion');
const { auditar } = require('../utilidades');
const { validarRangoDias } = require('../validacion');

const router = express.Router();

const consultarAuditoria = async (req, res, empresaId) => {
    const error = validarRangoDias(req.query);
    if (error) return res.status(400).json({ error });
    const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
    const accion = typeof req.query.accion === 'string' ? req.query.accion.trim().slice(0, 60) : '';
    try {
        const eventos = await auditoria.consultar({
            empresaId, desde: req.query.desde || null, hasta: req.query.hasta || null, accion, pagina,
        });
        await auditar(req, { accion: 'auditoria.consultar', resultado: 'exito', detalle: `página ${pagina}${accion ? `, acción ${accion}` : ''}` });
        res.json(eventos);
    } catch {
        res.status(503).json({ error: '⚠️ La base de auditoría no está disponible.' });
    }
};

router.get('/api/admin/auditoria', verificarToken, soloAdmin, (req, res) =>
    consultarAuditoria(req, res, req.empresa.id));

router.get('/api/plataforma/auditoria', verificarToken, soloSuperadmin, (req, res) => {
    const id = req.query.empresa_id;
    if (id !== undefined && id !== '' && !/^\d+$/.test(id)) return res.status(400).json({ error: '⚠️ empresa_id inválido.' });
    return consultarAuditoria(req, res, id ? Number(id) : undefined);
});

router.get('/api/plataforma/auditoria/verificar', verificarToken, soloSuperadmin, async (req, res) => {
    try {
        const resultado = await auditoria.verificar();
        await auditar(req, {
            accion: 'auditoria.verificar', resultado: resultado.integra ? 'exito' : 'error',
            detalle: resultado.integra ? `Cadena íntegra (${resultado.total_eventos} eventos)` : `Cadena alterada desde el evento ${resultado.primer_evento_invalido ?? '—'}`,
        });
        res.json(resultado);
    } catch {
        res.status(503).json({ error: '⚠️ La base de auditoría no está disponible.' });
    }
});

module.exports = router;
