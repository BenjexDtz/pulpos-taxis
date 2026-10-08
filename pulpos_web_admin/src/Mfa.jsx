import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ShieldCheck, KeyRound, RefreshCw, Download, Copy, ArrowLeft, AlertCircle, Smartphone } from 'lucide-react';

const estiloCodigo = 'w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-xl font-radar text-center text-xl tracking-[0.4em] focus:outline-none focus:border-green-500 transition placeholder-gray-700';

const errorDe = (err) => err.response?.data?.error || '⚠️ Error conectando al servidor.';

function CodigosRespaldo({ codigos, cuenta }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Códigos de respaldo · ${cuenta}\nCada código sirve una sola vez.\n\n${codigos.join('\n')}\n`;
  const descargar = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
    a.download = 'codigos_respaldo.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setCopiado(false); }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 bg-gray-950 border border-gray-800 rounded-xl p-4">
        {codigos.map(c => <code key={c} className="font-radar text-sm text-yellow-300 text-center">{c}</code>)}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={descargar} className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 py-2 rounded-lg font-radar text-xs transition">
          <Download className="w-3.5 h-3.5" />DESCARGAR .TXT
        </button>
        <button type="button" onClick={copiar} className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 py-2 rounded-lg font-radar text-xs transition">
          <Copy className="w-3.5 h-3.5" />{copiado ? 'COPIADOS' : 'COPIAR'}
        </button>
      </div>
    </div>
  );
}

// Segundo paso del login: configurar la app autenticadora o ingresar el código.
export function SegundoFactor({ urlServidor, pendiente, cuenta, onSesion, onCancelar }) {
  const { etapa, token_mfa } = pendiente;
  const auth = { headers: { Authorization: `Bearer ${token_mfa}` } };
  const [qr, setQr] = useState(null);
  const [codigo, setCodigo] = useState('');
  const [usarRespaldo, setUsarRespaldo] = useState(false);
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [sesion, setSesion] = useState(null);

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

      {error && <div className="flex items-center space-x-2 bg-red-950 border border-red-800 text-red-400 p-3 rounded-lg font-radar text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span></div>}

      {etapa === 'configurar' && (
        <div className="flex flex-col items-center gap-3">
          {qr
            ? <img src={qr.qr} alt="Código QR para la app autenticadora" className="w-48 h-48 rounded-lg bg-white p-2" />
            : <div className="w-48 h-48 rounded-lg bg-gray-800 flex items-center justify-center"><RefreshCw className="w-6 h-6 text-gray-500 animate-spin" /></div>}
          {qr && (
            <details className="w-full text-center">
              <summary className="font-radar text-xs text-gray-500 cursor-pointer hover:text-gray-300">¿No puedes escanear? Ingresa la clave a mano</summary>
              <code className="block mt-2 font-radar text-xs text-yellow-300 break-all">{qr.secreto.match(/.{1,4}/g).join(' ')}</code>
            </details>
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

// Vista "Seguridad": estado del segundo factor y regeneración de códigos.
export function SeguridadCuenta({ urlServidor, headers, manejarErrorApi, cuenta }) {
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
        {mensaje.texto && <div className={`p-3 rounded-lg text-sm font-radar ${mensaje.tipo === 'exito' ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>{mensaje.texto}</div>}

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
