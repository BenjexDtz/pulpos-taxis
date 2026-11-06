import { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, Pencil, RefreshCw, Save, ShieldCheck, ShieldOff, ToggleLeft, ToggleRight, UserPlus, Users, X } from 'lucide-react';
import Mensaje from '../componentes/Mensaje.jsx';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';
import Insignia from '../componentes/ui/Insignia.jsx';
import Entrada from '../componentes/ui/Entrada.jsx';
import { ayuda, botonIcono, botonPrimario, botonSecundario, etiqueta, filaTabla, tarjeta, td, th } from '../componentes/ui/estilos.js';
import { haceTiempo } from '../utilidades.js';
import { errorNombrePersona, errorPassword, errorPlaca, incompleto, normalizarPlaca, placaValida } from '../validaciones.js';

export default function Flota({ choferes, cargandoChoferes, cargarChoferes, urlServidor, headers, manejarErrorApi }) {
  const [formChofer, setFormChofer] = useState({ nombre: '', placa: '', password: '' });
  const [mensajeChofer, setMensajeChofer] = useState({ tipo: '', texto: '' });
  const [guardandoChofer, setGuardandoChofer] = useState(false);

  const [modalReset, setModalReset] = useState(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [mensajeReset, setMensajeReset] = useState({ tipo: '', texto: '' });
  const [guardandoReset, setGuardandoReset] = useState(false);

  const [edicion, setEdicion] = useState(null);
  const [mensajeEdicion, setMensajeEdicion] = useState({ tipo: '', texto: '' });
  const [guardandoEdicion, setGuardandoEdicion] = useState(false);

  useEffect(() => {
    if (!modalReset && !edicion) return;
    const alPulsar = (e) => { if (e.key === 'Escape') { setModalReset(null); setEdicion(null); } };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [modalReset, edicion]);

  const abrirEdicion = (chofer) => {
    setMensajeEdicion({ tipo: '', texto: '' });
    setEdicion({ id: chofer.id, nombre: chofer.nombre_completo, placa: chofer.placa_vehiculo, nombreOriginal: chofer.nombre_completo });
  };

  const guardarEdicion = async (e) => {
    e.preventDefault(); setGuardandoEdicion(true); setMensajeEdicion({ tipo: '', texto: '' });
    try {
      const res = await axios.put(`${urlServidor}/api/admin/choferes/${edicion.id}`,
        { nombre_completo: edicion.nombre, placa_vehiculo: edicion.placa }, { headers: headers() });
      setEdicion(null);
      setMensajeChofer({ tipo: 'exito', texto: res.data.mensaje });
      cargarChoferes();
      setTimeout(() => setMensajeChofer({ tipo: '', texto: '' }), 4000);
    } catch (err) {
      manejarErrorApi(err, texto => setMensajeEdicion({ tipo: 'error', texto }));
    } finally { setGuardandoEdicion(false); }
  };

  const registrarNuevoChofer = async (e) => {
    e.preventDefault(); setGuardandoChofer(true); setMensajeChofer({ tipo: '', texto: '' });
    try {
      const res = await axios.post(`${urlServidor}/api/admin/choferes`,
        { nombre_completo: formChofer.nombre, placa_vehiculo: formChofer.placa, password: formChofer.password },
        { headers: headers() });
      setMensajeChofer({ tipo: 'exito', texto: res.data.mensaje });
      setFormChofer({ nombre: '', placa: '', password: '' });
      cargarChoferes();
      setTimeout(() => setMensajeChofer({ tipo: '', texto: '' }), 4000);
    } catch (err) {
      setMensajeChofer({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar.' });
    } finally { setGuardandoChofer(false); }
  };

  const toggleEstadoChofer = async (chofer) => {
    try {
      await axios.patch(`${urlServidor}/api/admin/choferes/${chofer.id}/estado`,
        { estado_activo: !chofer.estado_activo }, { headers: headers() });
      cargarChoferes();
    } catch (err) {
      manejarErrorApi(err, texto => setMensajeChofer({ tipo: 'error', texto }));
    }
  };

  const resetearPassword = async (e) => {
    e.preventDefault(); setGuardandoReset(true); setMensajeReset({ tipo: '', texto: '' });
    try {
      const res = await axios.patch(`${urlServidor}/api/admin/choferes/${modalReset.id}/password`,
        { nueva_password: nuevaPassword }, { headers: headers() });
      setMensajeReset({ tipo: 'exito', texto: res.data.mensaje });
      setTimeout(() => { setModalReset(null); setNuevaPassword(''); setMensajeReset({ tipo: '', texto: '' }); }, 2000);
    } catch (err) {
      setMensajeReset({ tipo: 'error', texto: err.response?.data?.error || 'Error.' });
    } finally { setGuardandoReset(false); }
  };

  return (
    <>
      {edicion && (
        <div role="dialog" aria-modal="true" aria-labelledby="titulo-edicion"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-[2px]" onClick={() => setEdicion(null)}>
          <div className={`${tarjeta} max-h-[92dvh] w-full max-w-md overflow-y-auto bg-white p-6 shadow-theme-xl dark:!bg-gray-900`} onClick={e => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="titulo-edicion" className="text-lg font-semibold text-gray-800 dark:text-white/90">Editar conductor</h3>
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">{edicion.nombreOriginal}</p>
              </div>
              <button aria-label="Cerrar" onClick={() => setEdicion(null)} className={botonIcono}><X className="h-4 w-4" /></button>
            </div>
            <Mensaje tipo={mensajeEdicion.tipo} texto={mensajeEdicion.texto} className="mb-4" />
            <form onSubmit={guardarEdicion} className="space-y-5">
              <div>
                <label htmlFor="editar-nombre" className={etiqueta}>Nombre completo</label>
                <Entrada id="editar-nombre" type="text" required minLength={3} maxLength={100} autoFocus
                  error={errorNombrePersona(edicion.nombre)} value={edicion.nombre}
                  onChange={e => setEdicion({ ...edicion, nombre: e.target.value })} />
              </div>
              <div>
                <label htmlFor="editar-placa" className={etiqueta}>Placa</label>
                <Entrada id="editar-placa" type="text" required maxLength={9} className="uppercase" placeholder="2456ZBK"
                  error={errorPlaca(edicion.placa)} esperar={incompleto.placa(edicion.placa)} value={edicion.placa}
                  onChange={e => setEdicion({ ...edicion, placa: normalizarPlaca(e.target.value) })} />
                <p className={ayuda}>El chofer entrará a la app con la placa nueva. Sus viajes se conservan y el cambio queda en la auditoría.</p>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setEdicion(null)} className={botonSecundario}>Cancelar</button>
                <button type="submit" disabled={guardandoEdicion} className={botonPrimario}>
                  {guardandoEdicion ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {guardandoEdicion ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {modalReset && (
        <div role="dialog" aria-modal="true" aria-labelledby="titulo-reset"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-[2px]" onClick={() => setModalReset(null)}>
          <div className={`${tarjeta} max-h-[92dvh] w-full max-w-md overflow-y-auto bg-white p-6 shadow-theme-xl dark:!bg-gray-900`} onClick={e => e.stopPropagation()}>
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h3 id="titulo-reset" className="text-lg font-semibold text-gray-800 dark:text-white/90">Restablecer contraseña</h3>
                <p className="text-theme-sm text-gray-500 dark:text-gray-400">{modalReset.nombre}</p>
              </div>
              <button aria-label="Cerrar" onClick={() => setModalReset(null)} className={botonIcono}><X className="h-4 w-4" /></button>
            </div>
            <Mensaje tipo={mensajeReset.tipo} texto={mensajeReset.texto} className="mb-4" />
            <form onSubmit={resetearPassword} className="space-y-5">
              <div>
                <label htmlFor="nueva-password" className={etiqueta}>Nueva contraseña</label>
                <Entrada id="nueva-password" type="password" required minLength={8} autoFocus error={errorPassword(nuevaPassword)}
                  placeholder="Mínimo 8 caracteres, sin espacios" value={nuevaPassword} onChange={e => setNuevaPassword(e.target.value)} />
                <p className={ayuda}>El chofer la usará en la app junto con el código de la empresa y su placa.</p>
              </div>
              <div className="flex justify-end gap-3">
                <button type="button" onClick={() => setModalReset(null)} className={botonSecundario}>Cancelar</button>
                <button type="submit" disabled={guardandoReset} className={botonPrimario}>
                  {guardandoReset ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
                  {guardandoReset ? 'Guardando...' : 'Actualizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Tarjeta icono={UserPlus} titulo="Registrar conductor" subtitulo="Credenciales para la app móvil" className="lg:col-span-1 self-start">
          <Mensaje tipo={mensajeChofer.tipo} texto={mensajeChofer.texto} className="mb-5" />
          <form onSubmit={registrarNuevoChofer} className="space-y-5">
            <div>
              <label htmlFor="chofer-nombre" className={etiqueta}>Nombre completo</label>
              <Entrada id="chofer-nombre" type="text" required minLength={3} maxLength={100} placeholder="Ej. Juan Pérez Mamani"
                error={errorNombrePersona(formChofer.nombre)}
                value={formChofer.nombre} onChange={e => setFormChofer({ ...formChofer, nombre: e.target.value })} />
            </div>
            <div>
              <label htmlFor="chofer-placa" className={etiqueta}>Placa</label>
              <Entrada id="chofer-placa" type="text" required maxLength={9} className="uppercase" placeholder="2456ZBK"
                error={errorPlaca(formChofer.placa)} esperar={incompleto.placa(formChofer.placa)}
                value={formChofer.placa} onChange={e => setFormChofer({ ...formChofer, placa: normalizarPlaca(e.target.value) })} />
              <p className={ayuda}>4 números y 3 letras, todo junto.</p>
            </div>
            <div>
              <label htmlFor="chofer-password" className={etiqueta}>Contraseña</label>
              <Entrada id="chofer-password" type="password" required minLength={8} placeholder="Mínimo 8 caracteres, sin espacios"
                error={errorPassword(formChofer.password)}
                value={formChofer.password} onChange={e => setFormChofer({ ...formChofer, password: e.target.value })} />
            </div>
            <button type="submit" disabled={guardandoChofer} className={`${botonPrimario} w-full`}>
              {guardandoChofer ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {guardandoChofer ? 'Guardando...' : 'Crear credencial'}
            </button>
          </form>
        </Tarjeta>

        <Tarjeta icono={Users} titulo="Conductores registrados" cuerpo="" className="lg:col-span-2"
          subtitulo={`${choferes.length} conductor${choferes.length !== 1 ? 'es' : ''} · ${choferes.filter(c => c.estado_activo).length} activos`}
          acciones={
            <button onClick={cargarChoferes} disabled={cargandoChoferes} className={botonSecundario}>
              <RefreshCw className={`h-4 w-4 ${cargandoChoferes ? 'animate-spin' : ''}`} />Recargar
            </button>
          }>
          <div className="custom-scrollbar overflow-x-auto">
            <table className="tabla-apilada w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800">
                  {['Conductor', 'Última posición', 'Estado', 'Acciones'].map(h => <th key={h} className={th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {cargandoChoferes && choferes.length === 0 && (
                  <tr><td colSpan={4} className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">Cargando...</td></tr>
                )}
                {!cargandoChoferes && choferes.length === 0 && (
                  <tr><td colSpan={4} className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">Todavía no hay conductores.</td></tr>
                )}
                {choferes.map(chofer => {
                  const tieneGPS = chofer.ultima_lat != null;
                  const minutos = chofer.ultima_actualizacion ? Math.floor((new Date() - new Date(chofer.ultima_actualizacion)) / 60000) : null;
                  const enVivo = minutos !== null && minutos < 5;
                  return (
                    <tr key={chofer.id} className={`${filaTabla} ${!chofer.estado_activo ? 'opacity-50' : ''}`}>
                      <td data-titulo="Conductor" className={td}>
                        <p className="font-medium text-gray-800 dark:text-white/90">{chofer.nombre_completo}</p>
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400">{chofer.placa_vehiculo} · #{chofer.id}</p>
                        {!placaValida(chofer.placa_vehiculo) && (
                          <span title="No tiene 4 números y 3 letras: corrígela con el botón Editar">
                            <Insignia color="aviso" className="mt-1">Placa por corregir</Insignia>
                          </span>
                        )}
                      </td>
                      <td data-titulo="Última posición" className={td}>
                        {tieneGPS ? (
                          <>
                            <p className="font-mono text-theme-xs">{parseFloat(chofer.ultima_lat).toFixed(5)}, {parseFloat(chofer.ultima_lng).toFixed(5)}</p>
                            <p className="flex items-center gap-1.5 text-theme-xs">
                              <span className={`h-2 w-2 rounded-full ${enVivo ? 'bg-success-500' : 'bg-warning-500'}`} />{haceTiempo(minutos)}
                            </p>
                          </>
                        ) : <span className="text-theme-xs">Sin datos GPS</span>}
                      </td>
                      <td data-titulo="Estado" className={td}>
                        {chofer.estado_activo
                          ? <Insignia color="exito"><ShieldCheck className="h-3 w-3" />Activo</Insignia>
                          : <Insignia color="neutro"><ShieldOff className="h-3 w-3" />Inactivo</Insignia>}
                      </td>
                      <td data-titulo="Acciones" className={td}>
                        <div className="flex items-center gap-2">
                          <button title="Editar nombre y placa" aria-label={`Editar a ${chofer.nombre_completo}`}
                            onClick={() => abrirEdicion(chofer)} className={botonIcono}><Pencil className="h-4 w-4" /></button>
                          <button title="Restablecer contraseña" aria-label={`Restablecer contraseña de ${chofer.nombre_completo}`}
                            onClick={() => { setModalReset({ id: chofer.id, nombre: chofer.nombre_completo }); setNuevaPassword(''); setMensajeReset({ tipo: '', texto: '' }); }}
                            className={botonIcono}><KeyRound className="h-4 w-4" /></button>
                          <button title={chofer.estado_activo ? 'Desactivar' : 'Activar'} aria-label={`${chofer.estado_activo ? 'Desactivar' : 'Activar'} a ${chofer.nombre_completo}`}
                            onClick={() => toggleEstadoChofer(chofer)}
                            className={`${botonIcono} ${chofer.estado_activo ? 'hover:border-error-300 hover:text-error-500' : 'hover:border-success-300 hover:text-success-600'}`}>
                            {chofer.estado_activo ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Tarjeta>
      </div>
    </>
  );
}
