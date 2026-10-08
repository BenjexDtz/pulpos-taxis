import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ArrowLeft, Check, Copy, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import CodigosRespaldo from './CodigosRespaldo.jsx';
import Mensaje from './Mensaje.jsx';

const estiloCodigo = 'w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-xl font-radar text-center text-xl tracking-[0.4em] focus:outline-none focus:border-green-500 transition placeholder-gray-700';

const errorDe = (err) => err.response?.data?.error || '⚠️ Error conectando al servidor.';

// Segundo paso del login: configurar la app autenticadora o ingresar el código.
export default function SegundoFactor({ urlServidor, pendiente, cuenta, onSesion, onCancelar }) {
  const { etapa, token_mfa } = pendiente;
  const auth = { headers: { Authorization: `Bearer ${token_mfa}` } };
  const [qr, setQr] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [usarRespaldo, setUsarRespaldo] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sesion, setSesion] = useState(null);
  const [claveCopiada, setClaveCopiada] = useState(false);

  const copiarClave = async () => {
    try { await navigator.clipboard.writeText(qr.secreto); setClaveCopiada(true); } catch { setClaveCopiada(false); }
  };

  // StrictMode monta dos veces: reutilizar la petición evita generar dos secretos.
  const peticionQr = useRef(null);
  useEffect(() => {
    if (etapa !== 'configurar') return;
    let vigente = true;
    if (peticionQr.current?.token !== token_mfa) peticionQr.current = {
      token: token_mfa,
      promesa: axios.post(`${urlServidor}/api/admin/mfa/configurar`, {}, { headers: { Authorization: `Bearer ${token_mfa}` } }),
    };
    peticionQr.current.promesa
      .then(r => { if (vigente) setQr(r.data); })
      .catch(err => { if (vigente) setError(errorDe(err)); });
    return () => { vigente = false; };
  }, [etapa, token_mfa, urlServidor]);

  const enviar = async (e) => {
    e.preventDefault(); setError(''); setEnviando(true);
    try {
      const ruta = etapa === 'configurar' ? 'activar' : 'verificar';
      const r = await axios.post(`${urlServidor}/api/admin/mfa/${ruta}`, { codigo }, auth);
      if (r.data.codigos_respaldo) setSesion(r.data);
      else onSesion(r.data.token, r.data.respaldo_restantes !== undefined
        ? `Entraste con un código de respaldo. Te quedan ${r.data.respaldo_restantes}.` : '');
    } catch (err) {
      setError(errorDe(err)); setCodigo('');
    } finally { setEnviando(false); }
  };

  if (sesion) return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <ShieldCheck className="w-6 h-6 text-green-400 flex-shrink-0" />
        <div>
          <h2 className="text-white font-bold text-lg">Segundo factor activado</h2>
          <p className="text-gray-400 text-sm">Guarda estos códigos en un lugar seguro. Te permiten entrar si pierdes el teléfono. <b className="text-yellow-400">No se volverán a mostrar.</b></p>
        </div>
      </div>
      <CodigosRespaldo codigos={sesion.codigos_respaldo} cuenta={cuenta} />
      <button onClick={() => onSesion(sesion.token, '')} className="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 rounded-xl transition tracking-widest text-sm" style={{ fontFamily: 'Rajdhani' }}>
        YA LOS GUARDÉ · ENTRAR
      </button>
    </div>
  );

  const placeholder = usarRespaldo ? 'XXXX-XXXX' : '000000';
  return (
    <form onSubmit={enviar} className="space-y-5">
      <div className="flex items-start gap-3">
        <Smartphone className="w-6 h-6 text-green-400 flex-shrink-0" />
        <div>
          <h2 className="text-white font-bold text-lg">{etapa === 'configurar' ? 'Configura tu segundo factor' : 'Verificación en dos pasos'}</h2>
          <p className="text-gray-400 text-sm">
            {etapa === 'configurar'
              ? 'Escanea el código con Google Authenticator, Microsoft Authenticator u otra app TOTP e ingresa el código de 6 dígitos.'
              : usarRespaldo ? 'Ingresa uno de tus códigos de respaldo. Cada uno sirve una sola vez.' : 'Ingresa el código de 6 dígitos de tu app autenticadora.'}
          </p>
        </div>
      </div>

      <Mensaje texto={error} />

      {etapa === 'configurar' && (
        <div className="flex flex-col items-center gap-3">
          {qr
            ? <img src={qr.qr} alt="Código QR para la app autenticadora" className="w-40 h-40 rounded-lg bg-white p-2" />
            : <div className="w-40 h-40 rounded-lg bg-gray-800 flex items-center justify-center"><RefreshCw className="w-6 h-6 text-gray-500 animate-spin" /></div>}
          {qr && (
            <div className="w-full">
              <p className="font-radar text-xs text-gray-500 text-center mb-1">¿No puedes escanear? Ingresa esta clave en la app:</p>
              <div className="flex items-center gap-2 bg-gray-950 border border-gray-800 rounded-lg px-3 py-2">
                <code className="flex-1 font-radar text-xs text-yellow-300 break-all">{qr.secreto.match(/.{1,4}/g).join(' ')}</code>
                <button type="button" onClick={copiarClave}
                  className="flex items-center gap-1 shrink-0 font-radar text-xs text-gray-400 hover:text-white transition">
                  {claveCopiada ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {claveCopiada ? 'COPIADA' : 'COPIAR'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <input autoFocus required value={codigo} onChange={e => setCodigo(e.target.value)}
        inputMode={usarRespaldo ? 'text' : 'numeric'} autoComplete="one-time-code"
        maxLength={usarRespaldo ? 9 : 6} pattern={usarRespaldo ? '[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}' : '\\d{6}'}
        className={estiloCodigo} placeholder={placeholder} />

      <button type="submit" disabled={enviando || (etapa === 'configurar' && !qr)} className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition tracking-widest text-sm flex items-center justify-center space-x-2" style={{ fontFamily: 'Rajdhani' }}>
        {enviando && <RefreshCw className="w-4 h-4 animate-spin" />}
        <span>{etapa === 'configurar' ? 'ACTIVAR Y ENTRAR' : 'VERIFICAR'}</span>
      </button>

      <div className="flex justify-between">
        <button type="button" onClick={onCancelar} className="flex items-center gap-1 font-radar text-xs text-gray-500 hover:text-gray-300">
          <ArrowLeft className="w-3.5 h-3.5" />VOLVER
        </button>
        {etapa === 'verificar' && (
          <button type="button" onClick={() => { setUsarRespaldo(!usarRespaldo); setCodigo(''); setError(''); }} className="font-radar text-xs text-gray-500 hover:text-gray-300">
            {usarRespaldo ? 'USAR LA APP' : 'USAR CÓDIGO DE RESPALDO'}
          </button>
        )}
      </div>
    </form>
  );
}
