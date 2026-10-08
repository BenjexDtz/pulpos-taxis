import { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import CodigosRespaldo from '../componentes/CodigosRespaldo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';

// Vista "Seguridad": estado del segundo factor y regeneración de códigos.
export default function Seguridad({ urlServidor, headers, manejarErrorApi, cuenta }) {
  const [estado, setEstado] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [nuevos, setNuevos] = useState(null);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vigente = true;
    axios.get(`${urlServidor}/api/admin/mfa`, { headers: headers() })
      .then(r => { if (vigente) setEstado(r.data); })
      .catch(err => { if (vigente) manejarErrorApi(err, texto => setMensaje({ tipo: 'error', texto })); });
    return () => { vigente = false; };
  }, [urlServidor, headers, manejarErrorApi, nuevos]);

  const regenerar = async (e) => {
    e.preventDefault(); setEnviando(true); setMensaje({ tipo: '', texto: '' });
    try {
      const r = await axios.post(`${urlServidor}/api/admin/mfa/respaldo`, { codigo }, { headers: headers() });
      setNuevos(r.data.codigos_respaldo);
      setMensaje({ tipo: 'exito', texto: r.data.mensaje });
    } catch (err) {
      manejarErrorApi(err, texto => setMensaje({ tipo: 'error', texto }));
    } finally { setEnviando(false); setCodigo(''); }
  };

  const pocos = estado?.respaldo_restantes !== undefined && estado.respaldo_restantes <= 3;
  return (
    <div className="max-w-xl bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center space-x-3">
        <ShieldCheck className="w-5 h-5 text-green-400" />
        <div>
          <h2 className="font-bold text-white tracking-wider">SEGURIDAD DE LA CUENTA</h2>
          <p className="font-radar text-xs text-gray-600">{cuenta}</p>
        </div>
      </div>
      <div className="p-6 space-y-6">
        <Mensaje tipo={mensaje.tipo} texto={mensaje.texto} />

        <dl className="grid grid-cols-2 gap-4">
          <div className="bg-gray-800 rounded-xl p-4">
            <dt className="font-radar text-xs text-gray-500">SEGUNDO FACTOR</dt>
            <dd className="text-green-400 font-bold mt-1">{estado ? (estado.mfa_activo ? 'ACTIVO (TOTP)' : 'INACTIVO') : '—'}</dd>
            {estado?.mfa_activado_en && <dd className="font-radar text-xs text-gray-500 mt-1">desde {new Date(estado.mfa_activado_en).toLocaleDateString()}</dd>}
          </div>
          <div className="bg-gray-800 rounded-xl p-4">
            <dt className="font-radar text-xs text-gray-500">CÓDIGOS DE RESPALDO</dt>
            <dd className={`font-bold mt-1 ${pocos ? 'text-yellow-400' : 'text-white'}`}>{estado?.respaldo_restantes ?? '—'} disponibles</dd>
            {pocos && <dd className="font-radar text-xs text-yellow-500 mt-1">Quedan pocos: genera nuevos</dd>}
          </div>
        </dl>

        {nuevos ? (
          <div className="space-y-3">
            <p className="text-gray-400 text-sm">Los códigos anteriores ya no sirven. Guarda estos: <b className="text-yellow-400">no se volverán a mostrar.</b></p>
            <CodigosRespaldo codigos={nuevos} cuenta={cuenta} />
            <button onClick={() => setNuevos(null)} className="font-radar text-xs text-gray-500 hover:text-gray-300">LISTO</button>
          </div>
        ) : (
          <form onSubmit={regenerar} className="space-y-3">
            <p className="text-gray-400 text-sm">Generar códigos nuevos anula los anteriores. Confirma con el código de tu app autenticadora.</p>
            <div className="flex gap-3">
              <input required value={codigo} onChange={e => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} pattern="\d{6}" placeholder="000000"
                className="flex-1 bg-gray-800 border border-gray-700 text-white px-4 py-2 rounded-xl font-radar tracking-[0.3em] text-center focus:outline-none focus:border-green-500 transition placeholder-gray-700" />
              <button type="submit" disabled={enviando} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold text-sm transition">
                {enviando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}REGENERAR
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
