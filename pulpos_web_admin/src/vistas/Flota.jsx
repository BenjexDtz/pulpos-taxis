import { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff, ToggleLeft, ToggleRight, UserPlus, Users, X } from 'lucide-react';
import Mensaje from '../componentes/Mensaje.jsx';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';
import Insignia from '../componentes/ui/Insignia.jsx';
import { ayuda, botonIcono, botonPrimario, botonSecundario, campo, etiqueta, filaTabla, tarjeta, td, th } from '../componentes/ui/estilos.js';
import { haceTiempo } from '../utilidades.js';

export default function Flota({ choferes, cargandoChoferes, cargarChoferes, urlServidor, headers, manejarErrorApi }) {
  const [formChofer, setFormChofer] = useState({ nombre: '', placa: '', password: '' });
  const [mensajeChofer, setMensajeChofer] = useState({ tipo: '', texto: '' });
  const [guardandoChofer, setGuardandoChofer] = useState(false);

  const [modalReset, setModalReset] = useState(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [mensajeReset, setMensajeReset] = useState({ tipo: '', texto: '' });
  const [guardandoReset, setGuardandoReset] = useState(false);

  useEffect(() => {
    if (!modalReset) return;
    const alPulsar = (e) => { if (e.key === 'Escape') setModalReset(null); };
    window.addEventListener('keydown', alPulsar);
    return () => window.removeEventListener('keydown', alPulsar);
  }, [modalReset]);

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
      {modalReset && (
        <div role="dialog" aria-modal="true" aria-labelledby="titulo-reset"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-[2px]" onClick={() => setModalReset(null)}>
          <div className={`${tarjeta} w-full max-w-md bg-white p-6 shadow-theme-xl dark:bg-gray-900`} onClick={e => e.stopPropagation()}>
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
                <input id="nueva-password" type="password" required minLength={4} autoFocus className={campo}
                  placeholder="Mínimo 4 caracteres" value={nuevaPassword} onChange={e => setNuevaPassword(e.target.value)} />
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

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Tarjeta icono={UserPlus} titulo="Registrar conductor" subtitulo="Credenciales para la app móvil" className="xl:col-span-1 self-start">
          <Mensaje tipo={mensajeChofer.tipo} texto={mensajeChofer.texto} className="mb-5" />
          <form onSubmit={registrarNuevoChofer} className="space-y-5">
            <div>
              <label htmlFor="chofer-nombre" className={etiqueta}>Nombre completo</label>
              <input id="chofer-nombre" type="text" required className={campo} placeholder="Ej. Juan Pérez Mamani"
                value={formChofer.nombre} onChange={e => setFormChofer({ ...formChofer, nombre: e.target.value })} />
            </div>
            <div>
              <label htmlFor="chofer-placa" className={etiqueta}>Placa</label>
              <input id="chofer-placa" type="text" required className={`${campo} uppercase`} placeholder="1234-XYZ"
                value={formChofer.placa} onChange={e => setFormChofer({ ...formChofer, placa: e.target.value.toUpperCase() })} />
            </div>
            <div>
              <label htmlFor="chofer-password" className={etiqueta}>Contraseña</label>
              <input id="chofer-password" type="password" required minLength={4} className={campo} placeholder="Mínimo 4 caracteres"
                value={formChofer.password} onChange={e => setFormChofer({ ...formChofer, password: e.target.value })} />
            </div>
            <button type="submit" disabled={guardandoChofer} className={`${botonPrimario} w-full`}>
              {guardandoChofer ? <RefreshCw className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              {guardandoChofer ? 'Guardando...' : 'Crear credencial'}
            </button>
          </form>
        </Tarjeta>

        <Tarjeta icono={Users} titulo="Conductores registrados" cuerpo="" className="xl:col-span-2"
          subtitulo={`${choferes.length} conductor${choferes.length !== 1 ? 'es' : ''} · ${choferes.filter(c => c.estado_activo).length} activos`}
          acciones={
            <button onClick={cargarChoferes} disabled={cargandoChoferes} className={botonSecundario}>
              <RefreshCw className={`h-4 w-4 ${cargandoChoferes ? 'animate-spin' : ''}`} />Recargar
            </button>
          }>
          <div className="custom-scrollbar overflow-x-auto">
            <table className="w-full">
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
                      <td className={td}>
                        <p className="font-medium text-gray-800 dark:text-white/90">{chofer.nombre_completo}</p>
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400">{chofer.placa_vehiculo} · #{chofer.id}</p>
                      </td>
                      <td className={td}>
                        {tieneGPS ? (
                          <>
                            <p className="font-mono text-theme-xs">{parseFloat(chofer.ultima_lat).toFixed(5)}, {parseFloat(chofer.ultima_lng).toFixed(5)}</p>
                            <p className="flex items-center gap-1.5 text-theme-xs">
                              <span className={`h-2 w-2 rounded-full ${enVivo ? 'bg-success-500' : 'bg-warning-500'}`} />{haceTiempo(minutos)}
                            </p>
                          </>
                        ) : <span className="text-theme-xs">Sin datos GPS</span>}
                      </td>
                      <td className={td}>
                        {chofer.estado_activo
                          ? <Insignia color="exito"><ShieldCheck className="h-3 w-3" />Activo</Insignia>
                          : <Insignia color="neutro"><ShieldOff className="h-3 w-3" />Inactivo</Insignia>}
                      </td>
                      <td className={td}>
                        <div className="flex items-center gap-2">
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
