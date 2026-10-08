import { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, RefreshCw, ShieldCheck, ShieldOff, ToggleLeft, ToggleRight, UserPlus, Users, X } from 'lucide-react';
import Mensaje from '../componentes/Mensaje.jsx';
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
      {/* MODAL RESET */}
      {modalReset && (
        <div role="dialog" aria-modal="true" className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setModalReset(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div><h3 className="font-bold text-white text-lg">Resetear Contraseña</h3><p className="text-yellow-500 font-radar text-sm">{modalReset.nombre}</p></div>
              <button aria-label="Cerrar" onClick={() => setModalReset(null)} className="text-gray-600 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <Mensaje tipo={mensajeReset.tipo} texto={mensajeReset.texto} className="mb-4" />
            <form onSubmit={resetearPassword} className="space-y-4">
              <input type="password" required minLength={4} className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition placeholder-gray-700" placeholder="Nueva contraseña (mín. 4 caracteres)" value={nuevaPassword} onChange={e => setNuevaPassword(e.target.value)} />
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setModalReset(null)} className="px-4 py-2 border border-gray-700 text-gray-400 hover:text-white rounded-lg transition text-sm font-semibold">Cancelar</button>
                <button type="submit" disabled={guardandoReset} className="px-5 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold transition text-sm flex items-center space-x-2 disabled:opacity-60">
                  {guardandoReset ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>{guardandoReset ? 'Guardando...' : 'Actualizar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="space-y-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden max-w-2xl">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center space-x-3">
            <UserPlus className="w-5 h-5 text-blue-400" />
            <div><h2 className="font-bold text-white tracking-wider">REGISTRAR CONDUCTOR</h2><p className="text-gray-600 text-xs font-radar">Credenciales para la app móvil</p></div>
          </div>
          <div className="p-6">
            <Mensaje tipo={mensajeChofer.tipo} texto={mensajeChofer.texto} className="mb-5" />
            <form onSubmit={registrarNuevoChofer} className="space-y-4">
              <div><label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">NOMBRE COMPLETO</label>
                <input type="text" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-700" placeholder="Ej. Juan Pérez Mamani" value={formChofer.nombre} onChange={e => setFormChofer({ ...formChofer, nombre: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">PLACA</label>
                  <input type="text" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-700 uppercase" placeholder="1234-XYZ" value={formChofer.placa} onChange={e => setFormChofer({ ...formChofer, placa: e.target.value.toUpperCase() })} />
                </div>
                <div><label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">CONTRASEÑA</label>
                  <input type="password" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-700" placeholder="••••••••" value={formChofer.password} onChange={e => setFormChofer({ ...formChofer, password: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end pt-2">
                <button type="submit" disabled={guardandoChofer} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition tracking-wider text-sm">
                  {guardandoChofer ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                  <span>{guardandoChofer ? 'GUARDANDO...' : 'CREAR CREDENCIAL'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
            <div className="flex items-center space-x-3"><Users className="w-5 h-5 text-purple-400" /><div><h2 className="font-bold text-white tracking-wider">CONDUCTORES REGISTRADOS</h2><p className="font-radar text-xs text-gray-600">{choferes.length} conductor{choferes.length !== 1 ? 'es' : ''}</p></div></div>
            <button onClick={cargarChoferes} disabled={cargandoChoferes} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-3 py-2 rounded-lg transition font-radar text-xs">
              <RefreshCw className={`w-3.5 h-3.5 ${cargandoChoferes ? 'animate-spin' : ''}`} />RECARGAR
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="border-b border-gray-800">{['ID', 'NOMBRE', 'PLACA', 'ÚLTIMA POSICIÓN', 'ESTADO', 'ACCIONES'].map(h => <th key={h} className="px-5 py-3 text-left font-radar text-xs text-gray-600 tracking-widest">{h}</th>)}</tr></thead>
              <tbody>
                {cargandoChoferes && <tr><td colSpan={6} className="text-center py-10 text-gray-700 font-radar text-sm">CARGANDO...</td></tr>}
                {!cargandoChoferes && choferes.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-700 font-radar text-sm">SIN CONDUCTORES</td></tr>}
                {choferes.map(chofer => {
                  const tieneGPS = chofer.ultima_lat != null;
                  const minutos = chofer.ultima_actualizacion ? Math.floor((new Date() - new Date(chofer.ultima_actualizacion)) / 60000) : null;
                  const enVivo = minutos !== null && minutos < 5;
                  return (
                    <tr key={chofer.id} className={`border-b border-gray-800 hover:bg-gray-800 transition ${!chofer.estado_activo ? 'opacity-40' : ''}`}>
                      <td className="px-5 py-4 font-radar text-xs text-gray-600">#{chofer.id}</td>
                      <td className="px-5 py-4 font-semibold text-white">{chofer.nombre_completo}</td>
                      <td className="px-5 py-4"><span className="font-radar text-xs bg-blue-950 text-blue-400 border border-blue-800 px-2.5 py-1 rounded-lg">{chofer.placa_vehiculo}</span></td>
                      <td className="px-5 py-4 font-radar text-xs">
                        {tieneGPS ? <div><div className={enVivo ? 'text-green-400' : 'text-yellow-600'}>{parseFloat(chofer.ultima_lat).toFixed(5)}, {parseFloat(chofer.ultima_lng).toFixed(5)}</div><div className="text-gray-700 mt-0.5">{enVivo ? '🟢' : '🟡'} {haceTiempo(minutos)}</div></div> : <span className="text-gray-700">Sin datos GPS</span>}
                      </td>
                      <td className="px-5 py-4">
                        {chofer.estado_activo ? <span className="flex items-center space-x-1.5 font-radar text-xs text-green-400"><ShieldCheck className="w-3.5 h-3.5" /><span>ACTIVO</span></span> : <span className="flex items-center space-x-1.5 font-radar text-xs text-gray-600"><ShieldOff className="w-3.5 h-3.5" /><span>INACTIVO</span></span>}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button title="Restablecer contraseña" aria-label={`Restablecer contraseña de ${chofer.nombre_completo}`} onClick={() => { setModalReset({ id: chofer.id, nombre: chofer.nombre_completo }); setNuevaPassword(''); setMensajeReset({ tipo: '', texto: '' }); }} className="p-2 rounded-lg bg-yellow-950 text-yellow-500 hover:bg-yellow-900 border border-yellow-800 transition"><KeyRound className="w-3.5 h-3.5" /></button>
                          <button title={chofer.estado_activo ? 'Desactivar' : 'Activar'} aria-label={`${chofer.estado_activo ? 'Desactivar' : 'Activar'} a ${chofer.nombre_completo}`} onClick={() => toggleEstadoChofer(chofer)} className={`p-2 rounded-lg border transition ${chofer.estado_activo ? 'bg-red-950 text-red-500 hover:bg-red-900 border-red-800' : 'bg-green-950 text-green-500 hover:bg-green-900 border-green-800'}`}>
                            {chofer.estado_activo ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
