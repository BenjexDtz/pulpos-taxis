import { Fragment, useState, useEffect } from 'react';
import axios from 'axios';
import {
  ScrollText, Search, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, Fingerprint, RefreshCw,
} from 'lucide-react';

const ACCIONES = {
  'sesion.login_admin': 'Inicio de sesión (panel)',
  'sesion.login_chofer': 'Inicio de sesión (app)',
  'sesion.bloqueo_intentos': 'Bloqueo por intentos',
  'sesion.password_correcta': 'Contraseña correcta (falta 2.º factor)',
  'sesion.mfa_fallido': 'Código de 2.º factor incorrecto',
  'sesion.mfa_bloqueado': 'Cuenta bloqueada (2.º factor)',
  'mfa.configurar': 'Configuración de 2.º factor',
  'mfa.activar': 'Activación de 2.º factor',
  'mfa.respaldo_regenerar': 'Códigos de respaldo regenerados',
  'mfa.restablecer': '2.º factor restablecido',
  'acceso.denegado': 'Acceso denegado',
  'acceso.token_invalido': 'Token inválido',
  'chofer.crear': 'Alta de chofer',
  'chofer.estado': 'Estado de chofer',
  'chofer.password': 'Cambio de contraseña',
  'parametros.actualizar': 'Parámetros tarifarios',
  'empresa.crear': 'Alta de empresa',
  'empresa.actualizar': 'Datos de empresa',
  'empresa.estado': 'Estado de empresa',
  'viaje.sincronizar': 'Viaje sincronizado',
  'viajes.exportar': 'Exportación CSV',
  'posicion.actualizar': 'Posición GPS',
  'auditoria.consultar': 'Consulta de auditoría',
  'auditoria.verificar': 'Verificación de integridad',
};

const GRUPOS = [
  ['', 'Todas las acciones'], ['sesion.', 'Sesiones'], ['mfa.', 'Segundo factor'], ['acceso.', 'Accesos rechazados'],
  ['chofer.', 'Choferes'], ['parametros.', 'Parámetros'], ['empresa.', 'Empresa'],
  ['viaje', 'Viajes y exportaciones'], ['posicion.', 'Posiciones GPS'], ['auditoria.', 'Auditoría'],
];

const COLOR_RESULTADO = {
  exito: 'bg-green-950 text-green-400 border-green-800',
  rechazado: 'bg-yellow-950 text-yellow-400 border-yellow-800',
  error: 'bg-red-950 text-red-400 border-red-800',
};

const ACTOR = { superadmin: 'Plataforma', admin: 'Admin', chofer: 'Chofer', anonimo: 'Anónimo', sistema: 'Sistema' };

const estiloCampo = 'bg-gray-800 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg font-radar text-xs focus:outline-none focus:border-blue-500';

function Json({ titulo, datos }) {
  return (
    <div className="flex-1 min-w-0">
      <p className="font-radar text-xs text-gray-500 mb-1">{titulo}</p>
      <pre className="bg-gray-950 border border-gray-800 rounded-lg p-3 text-xs text-gray-300 overflow-x-auto max-h-64">
        {datos ? JSON.stringify(datos, null, 2) : '—'}
      </pre>
    </div>
  );
}

export default function Auditoria({ urlServidor, headers, manejarErrorApi, plataforma = false }) {
  const [filtros, setFiltros] = useState({ desde: '', hasta: '', accion: '', empresa_id: '' });
  const [consulta, setConsulta] = useState({ ...filtros, pagina: 1 });
  const [eventos, setEventos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState('');
  const [abierto, setAbierto] = useState(null);
  const [empresas, setEmpresas] = useState([]);
  const [verificacion, setVerificacion] = useState(null);
  const [verificando, setVerificando] = useState(false);

  useEffect(() => {
    let vigente = true;
    const q = new URLSearchParams(Object.entries(consulta).filter(([, v]) => v !== '' && v !== null));
    axios.get(`${urlServidor}/api/${plataforma ? 'plataforma' : 'admin'}/auditoria?${q}`, { headers: headers() })
      .then(r => { if (vigente) { setEventos(r.data); setError(''); } })
      .catch(err => { if (vigente) manejarErrorApi(err, setError); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [consulta, urlServidor, headers, manejarErrorApi, plataforma]);

  useEffect(() => {
    if (!plataforma) return;
    let vigente = true;
    axios.get(`${urlServidor}/api/plataforma/empresas`, { headers: headers() })
      .then(r => { if (vigente) setEmpresas(r.data); })
      .catch(() => {});
    return () => { vigente = false; };
  }, [plataforma, urlServidor, headers]);

  const buscar = (e) => {
    e.preventDefault();
    setCargando(true); setAbierto(null);
    setConsulta({ ...filtros, pagina: 1 });
  };

  const irPagina = (pagina) => {
    setCargando(true); setAbierto(null);
    setConsulta({ ...consulta, pagina });
  };

  const verificar = async () => {
    setVerificando(true);
    try {
      setVerificacion((await axios.get(`${urlServidor}/api/plataforma/auditoria/verificar`, { headers: headers() })).data);
    } catch (err) {
      manejarErrorApi(err, setError);
    } finally { setVerificando(false); }
  };

  const nombreEmpresa = (id) => empresas.find(e => e.id === id)?.nombre ?? (id ? `#${id}` : 'Plataforma');

  return (
    <div className="space-y-4">
      {plataforma && (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 flex flex-wrap items-center gap-4">
          <Fingerprint className="w-6 h-6 text-yellow-400" />
          <div className="mr-auto">
            <h3 className="font-bold text-white tracking-wider">INTEGRIDAD DE LA BITÁCORA</h3>
            <p className="font-radar text-xs text-gray-600">Recalcula la cadena SHA-256 y la compara con las anclas de la base principal.</p>
          </div>
          {verificacion && (
            verificacion.integra
              ? <div className="flex items-center gap-2 font-radar text-sm text-green-400"><ShieldCheck className="w-5 h-5" />ÍNTEGRA · {verificacion.total_eventos} eventos · {verificacion.anclas.total} anclas{verificacion.pendientes_de_envio ? ` · ${verificacion.pendientes_de_envio} en cola` : ''}</div>
              : <div className="flex items-center gap-2 font-radar text-sm text-red-400"><ShieldAlert className="w-5 h-5" />
                  ALTERADA
                  {verificacion.primer_evento_invalido && ` desde el evento #${verificacion.primer_evento_invalido}`}
                  {verificacion.anclas.faltantes.length > 0 && ` · faltan eventos anclados: ${verificacion.anclas.faltantes.join(', ')}`}
                  {verificacion.anclas.alteradas.length > 0 && ` · anclas que no coinciden: ${verificacion.anclas.alteradas.join(', ')}`}
                </div>
          )}
          <button onClick={verificar} disabled={verificando} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-60 text-white px-4 py-2 rounded-lg transition font-radar text-xs font-bold">
            <RefreshCw className={`w-3.5 h-3.5 ${verificando ? 'animate-spin' : ''}`} />VERIFICAR INTEGRIDAD
          </button>
        </div>
      )}

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <form onSubmit={buscar} className="px-6 py-4 border-b border-gray-800 flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-2 mr-auto">
            <ScrollText className="w-5 h-5 text-purple-400" />
            <h2 className="font-bold text-gray-200 tracking-wider">BITÁCORA DE AUDITORÍA</h2>
          </div>
          {plataforma && (
            <select className={estiloCampo} value={filtros.empresa_id} onChange={e => setFiltros({ ...filtros, empresa_id: e.target.value })}>
              <option value="">Todas las empresas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
          <select className={estiloCampo} value={filtros.accion} onChange={e => setFiltros({ ...filtros, accion: e.target.value })}>
            {GRUPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <input type="date" className={estiloCampo} value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} />
          <span className="text-gray-600 font-radar text-xs">→</span>
          <input type="date" className={estiloCampo} value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} />
          <button type="submit" className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition font-radar text-xs">
            <Search className="w-3.5 h-3.5" />BUSCAR
          </button>
        </form>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {['#', 'FECHA', ...(plataforma ? ['EMPRESA'] : []), 'ACTOR', 'ACCIÓN', 'OBJETO', 'RESULTADO', 'IP'].map(h =>
                  <th key={h} className="px-4 py-3 text-left font-radar text-xs text-gray-600 tracking-widest">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {error && <tr><td colSpan={8} className="text-center py-10 text-red-500 font-radar text-sm">{error}</td></tr>}
              {!error && !cargando && eventos.length === 0 && <tr><td colSpan={8} className="text-center py-10 text-gray-700 font-radar text-sm">SIN EVENTOS</td></tr>}
              {eventos.map(ev => (
                <Fragment key={ev.id}>
                  <tr onClick={() => setAbierto(abierto === ev.id ? null : ev.id)}
                    className="border-b border-gray-800 hover:bg-gray-800 transition cursor-pointer">
                    <td className="px-4 py-3 font-radar text-xs text-gray-600">{ev.id}</td>
                    <td className="px-4 py-3 font-radar text-xs text-gray-400 whitespace-nowrap">
                      {new Date(ev.ocurrido_en).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    {plataforma && <td className="px-4 py-3 text-xs text-gray-300">{nombreEmpresa(ev.empresa_id)}</td>}
                    <td className="px-4 py-3">
                      <div className="text-sm text-white">{ev.actor_nombre ?? '—'}</div>
                      <div className="font-radar text-xs text-gray-600">{ACTOR[ev.actor_tipo] ?? ev.actor_tipo}{ev.actor_rol && ev.actor_tipo !== 'superadmin' ? ` · ${ev.actor_rol}` : ''}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm text-gray-200">{ACCIONES[ev.accion] ?? ev.accion}</div>
                      {ev.detalle && <div className="font-radar text-xs text-gray-600 truncate max-w-xs">{ev.detalle}</div>}
                    </td>
                    <td className="px-4 py-3 font-radar text-xs text-gray-500">{ev.entidad ? `${ev.entidad}${ev.entidad_id ? ` #${ev.entidad_id}` : ''}` : '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`font-radar text-xs px-2 py-0.5 rounded border ${COLOR_RESULTADO[ev.resultado] ?? ''}`}>{ev.resultado.toUpperCase()}</span>
                    </td>
                    <td className="px-4 py-3 font-radar text-xs text-gray-600">{ev.ip ?? '—'}</td>
                  </tr>
                  {abierto === ev.id && (
                    <tr className="border-b border-gray-800 bg-gray-900">
                      <td colSpan={8} className="px-6 py-4 space-y-3">
                        <div className="flex flex-col lg:flex-row gap-4">
                          <Json titulo="ANTES" datos={ev.datos_antes} />
                          <Json titulo="DESPUÉS" datos={ev.datos_despues} />
                        </div>
                        <p className="font-radar text-xs text-gray-600 break-all">SHA-256: {ev.hash}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="px-6 py-3 border-t border-gray-800 flex items-center justify-between font-radar text-xs text-gray-500">
          <span>Página {consulta.pagina}{cargando ? ' · cargando...' : ''}</span>
          <div className="flex gap-2">
            <button disabled={consulta.pagina === 1 || cargando} onClick={() => irPagina(consulta.pagina - 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 disabled:opacity-40">
              <ChevronLeft className="w-3.5 h-3.5" />ANTERIOR
            </button>
            <button disabled={eventos.length < 100 || cargando} onClick={() => irPagina(consulta.pagina + 1)}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-gray-700 hover:bg-gray-800 disabled:opacity-40">
              SIGUIENTE<ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
