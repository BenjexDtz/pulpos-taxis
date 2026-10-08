import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { ArrowLeft, Check, Copy, RefreshCw, ShieldCheck, Smartphone } from 'lucide-react';
import CodigosRespaldo from './CodigosRespaldo.jsx';
import Mensaje from './Mensaje.jsx';
import { botonPrimario, campo, etiqueta } from './ui/estilos.js';

const estiloCodigo = `${campo} h-12 text-center font-mono text-xl tracking-[0.4em]`;

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
    <div className="space-y-6">
      <div>
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500">
          <ShieldCheck className="h-6 w-6" />
        </span>
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90">Segundo factor activado</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Guarda estos códigos en un lugar seguro: te permiten entrar si pierdes el teléfono.
          <span className="font-medium text-warning-600 dark:text-orange-400"> No se volverán a mostrar.</span>
        </p>
      </div>
      <CodigosRespaldo codigos={sesion.codigos_respaldo} cuenta={cuenta} />
      <button onClick={() => onSesion(sesion.token, '')} className={`${botonPrimario} w-full py-3`}>Ya los guardé · Entrar</button>
    </div>
  );

  const placeholder = usarRespaldo ? 'XXXX-XXXX' : '000000';
  return (
    <form onSubmit={enviar} className="space-y-6">
      <div>
        <span className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
          <Smartphone className="h-6 w-6" />
        </span>
        <h1 className="mb-2 text-title-sm font-semibold text-gray-800 dark:text-white/90">
          {etapa === 'configurar' ? 'Configura tu segundo factor' : 'Verificación en dos pasos'}
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {etapa === 'configurar'
            ? 'Escanea el código con Google Authenticator, Microsoft Authenticator u otra app TOTP e ingresa el código de 6 dígitos.'
            : usarRespaldo ? 'Ingresa uno de tus códigos de respaldo. Cada uno sirve una sola vez.' : 'Ingresa el código de 6 dígitos de tu app autenticadora.'}
        </p>
      </div>

      <Mensaje texto={error} />

      {etapa === 'configurar' && (
        <div className="flex flex-col items-center gap-3">
          {qr
            ? <img src={qr.qr} alt="Código QR para la app autenticadora" className="h-44 w-44 rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-700" />
            : <div className="flex h-44 w-44 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800"><RefreshCw className="h-6 w-6 animate-spin text-gray-400" /></div>}
          {qr && (
            <div className="w-full">
              <p className="mb-1.5 text-center text-theme-xs text-gray-500 dark:text-gray-400">¿No puedes escanear? Ingresa esta clave en la app:</p>
              <div className="flex items-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]">
                <code className="flex-1 break-all font-mono text-theme-xs text-gray-800 dark:text-white/90">{qr.secreto.match(/.{1,4}/g).join(' ')}</code>
                <button type="button" onClick={copiarClave}
                  className="flex shrink-0 items-center gap-1 text-theme-xs font-medium text-brand-600 transition hover:text-brand-700 dark:text-brand-400">
                  {claveCopiada ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {claveCopiada ? 'Copiada' : 'Copiar'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label htmlFor="codigo-mfa" className={etiqueta}>{usarRespaldo ? 'Código de respaldo' : 'Código de la app'}</label>
        <input id="codigo-mfa" autoFocus required value={codigo} onChange={e => setCodigo(e.target.value)}
          inputMode={usarRespaldo ? 'text' : 'numeric'} autoComplete="one-time-code"
          maxLength={usarRespaldo ? 9 : 6} pattern={usarRespaldo ? '[A-Za-z0-9]{4}-?[A-Za-z0-9]{4}' : '\\d{6}'}
          className={estiloCodigo} placeholder={placeholder} />
      </div>

      <button type="submit" disabled={enviando || (etapa === 'configurar' && !qr)} className={`${botonPrimario} w-full py-3`}>
        {enviando && <RefreshCw className="h-4 w-4 animate-spin" />}
        {etapa === 'configurar' ? 'Activar y entrar' : 'Verificar'}
      </button>

      <div className="flex justify-between text-sm">
        <button type="button" onClick={onCancelar} className="flex items-center gap-1 text-gray-500 transition hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
          <ArrowLeft className="h-4 w-4" />Volver
        </button>
        {etapa === 'verificar' && (
          <button type="button" onClick={() => { setUsarRespaldo(!usarRespaldo); setCodigo(''); setError(''); }}
            className="text-brand-600 transition hover:text-brand-700 dark:text-brand-400">
            {usarRespaldo ? 'Usar la app' : 'Usar un código de respaldo'}
          </button>
        )}
      </div>
    </form>
  );
}
