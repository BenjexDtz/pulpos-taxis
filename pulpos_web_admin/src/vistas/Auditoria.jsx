import { Fragment, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import {
  ScrollText, Search, ChevronLeft, ChevronRight, ShieldCheck, ShieldAlert, Fingerprint, RefreshCw,
} from 'lucide-react';
import Mensaje from '../componentes/Mensaje.jsx';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';
import Insignia from '../componentes/ui/Insignia.jsx';
import { botonPrimario, botonSecundario, campoEnLinea, filaTabla, td, th } from '../componentes/ui/estilos.js';

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

const COLOR_RESULTADO = { exito: 'exito', rechazado: 'aviso', error: 'error' };
const RESULTADOS = { exito: 'Éxito', rechazado: 'Rechazado', error: 'Error' };

const ACTOR = { superadmin: 'Plataforma', admin: 'Admin', chofer: 'Chofer', anonimo: 'Anónimo', sistema: 'Sistema' };

function Json({ titulo, datos }) {
  return (
    <div className="min-w-0 flex-1">
      <p className="mb-1 text-theme-xs font-medium text-gray-500 dark:text-gray-400">{titulo}</p>
      <pre className="custom-scrollbar max-h-64 overflow-auto rounded-lg border border-gray-200 bg-white p-3 text-theme-xs text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-300">
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

  // StrictMode monta dos veces: sin esto cada apertura quedaría registrada dos veces en la bitácora.
  const peticion = useRef(null);
  useEffect(() => {
    let vigente = true;
    if (peticion.current?.consulta !== consulta) {
      const q = new URLSearchParams(Object.entries(consulta).filter(([, v]) => v !== '' && v !== null));
      peticion.current = {
        consulta,
        promesa: axios.get(`${urlServidor}/api/${plataforma ? 'plataforma' : 'admin'}/auditoria?${q}`, { headers: headers() }),
      };
    }
    peticion.current.promesa
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
    <div className="space-y-6">
      {plataforma && (
        <Tarjeta icono={Fingerprint} titulo="Integridad de la bitácora"
          subtitulo="Recalcula la cadena SHA-256 y la compara con las anclas guardadas en la base principal."
          acciones={
            <button onClick={verificar} disabled={verificando} className={botonPrimario}>
              <RefreshCw className={`h-4 w-4 ${verificando ? 'animate-spin' : ''}`} />Verificar integridad
            </button>
          }>
          {!verificacion && <p className="text-theme-sm text-gray-500 dark:text-gray-400">Todavía no se verificó en esta sesión.</p>}
          {verificacion && (verificacion.integra
            ? (
              <div className="flex items-center gap-3 text-success-600 dark:text-success-500">
                <ShieldCheck className="h-6 w-6" />
                <p className="text-theme-sm">
                  <span className="font-semibold">Íntegra.</span> {verificacion.total_eventos} evento{verificacion.total_eventos === 1 ? '' : 's'} y {verificacion.anclas.total} ancla{verificacion.anclas.total === 1 ? '' : 's'} verificados
                  {verificacion.pendientes_de_envio ? `; ${verificacion.pendientes_de_envio} eventos en cola de envío.` : '.'}
                </p>
              </div>
            ) : (
              <div className="flex items-start gap-3 text-error-600 dark:text-error-400">
                <ShieldAlert className="h-6 w-6 shrink-0" />
                <p className="text-theme-sm">
                  <span className="font-semibold">Alterada</span>
                  {verificacion.primer_evento_invalido && ` desde el evento #${verificacion.primer_evento_invalido}`}
                  {verificacion.anclas.faltantes.length > 0 && ` · faltan eventos anclados: ${verificacion.anclas.faltantes.join(', ')}`}
                  {verificacion.anclas.alteradas.length > 0 && ` · anclas que no coinciden: ${verificacion.anclas.alteradas.join(', ')}`}
                </p>
              </div>
            ))}
        </Tarjeta>
      )}

      <Tarjeta icono={ScrollText} titulo="Bitácora de auditoría" subtitulo="Haz clic en un evento para ver el estado antes y después." cuerpo="">
        <form onSubmit={buscar} className="flex flex-wrap items-end gap-3 border-b border-gray-100 px-5 py-4 sm:px-6 dark:border-gray-800">
          {plataforma && (
            <select aria-label="Empresa" className={campoEnLinea} value={filtros.empresa_id} onChange={e => setFiltros({ ...filtros, empresa_id: e.target.value })}>
              <option value="">Todas las empresas</option>
              {empresas.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
            </select>
          )}
          <select aria-label="Tipo de acción" className={campoEnLinea} value={filtros.accion} onChange={e => setFiltros({ ...filtros, accion: e.target.value })}>
            {GRUPOS.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
          </select>
          <input type="date" aria-label="Desde" className={campoEnLinea} value={filtros.desde} onChange={e => setFiltros({ ...filtros, desde: e.target.value })} />
          <span className="self-center text-gray-400">→</span>
          <input type="date" aria-label="Hasta" className={campoEnLinea} value={filtros.hasta} onChange={e => setFiltros({ ...filtros, hasta: e.target.value })} />
          <button type="submit" className={botonSecundario}><Search className="h-4 w-4" />Buscar</button>
        </form>

        {error && <div className="px-5 pt-4 sm:px-6"><Mensaje texto={error} /></div>}

        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['#', 'Fecha', ...(plataforma ? ['Empresa'] : []), 'Actor', 'Acción', 'Objeto', 'Resultado', 'IP'].map(h =>
                  <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {!error && !cargando && eventos.length === 0 && (
                <tr><td colSpan={8} className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">Sin eventos.</td></tr>
              )}
              {eventos.map(ev => (
                <Fragment key={ev.id}>
                  <tr onClick={() => setAbierto(abierto === ev.id ? null : ev.id)} aria-expanded={abierto === ev.id}
                    className={`${filaTabla} cursor-pointer transition hover:bg-gray-50 dark:hover:bg-white/[0.02]`}>
                    <td className={`${td} text-theme-xs`}>{ev.id}</td>
                    <td className={`${td} whitespace-nowrap text-theme-xs`}>
                      {new Date(ev.ocurrido_en).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    {plataforma && <td className={td}>{nombreEmpresa(ev.empresa_id)}</td>}
                    <td className={td}>
                      <p className="font-medium text-gray-800 dark:text-white/90">{ev.actor_nombre ?? '—'}</p>
                      <p className="text-theme-xs">{ACTOR[ev.actor_tipo] ?? ev.actor_tipo}{ev.actor_rol && ev.actor_tipo !== 'superadmin' ? ` · ${ev.actor_rol}` : ''}</p>
                    </td>
                    <td className={td}>
                      <p className="text-gray-800 dark:text-white/90">{ACCIONES[ev.accion] ?? ev.accion}</p>
                      {ev.detalle && <p className="max-w-xs truncate text-theme-xs">{ev.detalle}</p>}
                    </td>
                    <td className={`${td} text-theme-xs`}>{ev.entidad ? `${ev.entidad}${ev.entidad_id ? ` #${ev.entidad_id}` : ''}` : '—'}</td>
                    <td className={td}><Insignia color={COLOR_RESULTADO[ev.resultado] ?? 'neutro'}>{RESULTADOS[ev.resultado] ?? ev.resultado}</Insignia></td>
                    <td className={`${td} font-mono text-theme-xs`}>{ev.ip ?? '—'}</td>
                  </tr>
                  {abierto === ev.id && (
                    <tr className="border-b border-gray-100 bg-gray-50 dark:border-gray-800 dark:bg-white/[0.02]">
                      <td colSpan={8} className="space-y-3 px-6 py-4">
                        <div className="flex flex-col gap-4 lg:flex-row">
                          <Json titulo="Antes" datos={ev.datos_antes} />
                          <Json titulo="Después" datos={ev.datos_despues} />
                        </div>
                        <p className="break-all font-mono text-theme-xs text-gray-500 dark:text-gray-400">SHA-256: {ev.hash}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3 text-theme-sm text-gray-500 sm:px-6 dark:border-gray-800 dark:text-gray-400">
          <span>Página {consulta.pagina}{cargando ? ' · cargando...' : ''}</span>
          <div className="flex gap-2">
            <button disabled={consulta.pagina === 1 || cargando} onClick={() => irPagina(consulta.pagina - 1)} className={`${botonSecundario} px-3 py-2`}>
              <ChevronLeft className="h-4 w-4" />Anterior
            </button>
            <button disabled={eventos.length < 100 || cargando} onClick={() => irPagina(consulta.pagina + 1)} className={`${botonSecundario} px-3 py-2`}>
              Siguiente<ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </Tarjeta>
    </div>
  );
}
