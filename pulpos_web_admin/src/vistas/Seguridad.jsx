import { useState, useEffect } from 'react';
import axios from 'axios';
import { KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import CodigosRespaldo from '../componentes/CodigosRespaldo.jsx';
import Mensaje from '../componentes/Mensaje.jsx';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';
import Insignia from '../componentes/ui/Insignia.jsx';
import { botonPrimario, botonSecundario, campo, etiqueta } from '../componentes/ui/estilos.js';

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
    <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
      <Tarjeta icono={ShieldCheck} titulo="Segundo factor" subtitulo={cuenta}>
        <Mensaje tipo={mensaje.tipo} texto={mensaje.texto} className="mb-5" />
        <dl className="grid grid-cols-2 gap-4">
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
            <dt className="text-theme-xs text-gray-500 dark:text-gray-400">Estado</dt>
            <dd className="mt-2">
              {estado ? (estado.mfa_activo ? <Insignia color="exito">Activo · TOTP</Insignia> : <Insignia color="aviso">Inactivo</Insignia>) : '—'}
            </dd>
            {estado?.mfa_activado_en && (
              <dd className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">desde {new Date(estado.mfa_activado_en).toLocaleDateString('es-BO')}</dd>
            )}
          </div>
          <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/[0.03]">
            <dt className="text-theme-xs text-gray-500 dark:text-gray-400">Códigos de respaldo</dt>
            <dd className={`mt-1 text-title-sm font-bold ${pocos ? 'text-warning-600 dark:text-orange-400' : 'text-gray-800 dark:text-white/90'}`}>
              {estado?.respaldo_restantes ?? '—'}
            </dd>
            <dd className="text-theme-xs text-gray-500 dark:text-gray-400">{pocos ? 'Quedan pocos: genera nuevos' : 'disponibles'}</dd>
          </div>
        </dl>
        <p className="mt-5 text-theme-sm text-gray-500 dark:text-gray-400">
          Si pierdes el teléfono y los códigos, pide a la plataforma que restablezca tu segundo factor.
        </p>
      </Tarjeta>

      <Tarjeta icono={KeyRound} titulo="Códigos de respaldo" subtitulo="Para entrar si no tienes el teléfono a mano">
        {nuevos ? (
          <div className="space-y-4">
            <Mensaje tipo="aviso" texto="Los códigos anteriores ya no sirven. Guarda estos: no se volverán a mostrar." />
            <CodigosRespaldo codigos={nuevos} cuenta={cuenta} />
            <button onClick={() => setNuevos(null)} className={botonSecundario}>Listo</button>
          </div>
        ) : (
          <form onSubmit={regenerar} className="space-y-4">
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">
              Generar códigos nuevos anula los anteriores. Confirma con el código de tu app autenticadora.
            </p>
            <div>
              <label htmlFor="codigo-regenerar" className={etiqueta}>Código de la app</label>
              <input id="codigo-regenerar" required value={codigo} onChange={e => setCodigo(e.target.value)} inputMode="numeric" autoComplete="one-time-code"
                maxLength={6} pattern="\d{6}" placeholder="000000" className={`${campo} text-center font-mono tracking-[0.3em]`} />
            </div>
            <button type="submit" disabled={enviando} className={botonPrimario}>
              {enviando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}Regenerar códigos
            </button>
          </form>
        )}
      </Tarjeta>
    </div>
  );
}
