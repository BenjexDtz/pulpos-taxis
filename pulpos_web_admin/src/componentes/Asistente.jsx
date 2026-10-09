import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Bot, SendHorizontal, Trash2, X } from 'lucide-react';
import { campo, botonPrimario, botonIcono } from './ui/estilos.js';

const MAX_HISTORIAL = 12;
const MAX_CARACTERES = 1000;

const SUGERENCIAS = [
  '¿Cuánto se recaudó esta semana?',
  '¿Qué chofer hizo más viajes este mes?',
  '¿Quiénes no trabajan hace 7 días?',
  '¿Cuánto cuesta un viaje de 5 km con 3 minutos de espera?',
];

// Sobre el mapa de Leaflet, cuyos controles usan z-index 1000.
const CAPA = 'z-[1100]';

export default function Asistente({ urlServidor, headers, manejarErrorApi }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([]);
  const [texto, setTexto] = useState('');
  const [pensando, setPensando] = useState(false);
  const [error, setError] = useState(null);
  const finRef = useRef(null);

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [mensajes, pensando, abierto]);

  const enviar = async (pregunta) => {
    const limpia = pregunta.trim();
    if (!limpia || pensando) return;
    const historial = [...mensajes, { rol: 'usuario', texto: limpia }];
    setMensajes(historial);
    setTexto(''); setError(null); setPensando(true);
    try {
      const res = await axios.post(`${urlServidor}/api/admin/asistente`,
        { mensajes: historial.slice(-MAX_HISTORIAL) }, { headers: headers() });
      setMensajes([...historial, { rol: 'asistente', texto: res.data.respuesta }]);
    } catch (err) {
      setMensajes(mensajes);
      setTexto(limpia);
      manejarErrorApi(err, setError);
    } finally { setPensando(false); }
  };

  if (!abierto) {
    return (
      <button type="button" onClick={() => setAbierto(true)} aria-label="Abrir asistente"
        className={`fixed right-5 bottom-5 ${CAPA} flex h-14 w-14 items-center justify-center rounded-full bg-brand-500 text-white shadow-theme-lg transition hover:bg-brand-600`}>
        <Bot className="h-6 w-6" />
      </button>
    );
  }

  return (
    <section aria-label="Asistente"
      className={`fixed right-4 bottom-4 left-4 ${CAPA} flex h-[min(600px,calc(100vh-2rem))] flex-col rounded-2xl border border-gray-200 bg-white shadow-theme-xl sm:left-auto sm:w-[400px] dark:border-gray-800 dark:bg-gray-900`}>
      <header className="flex items-center gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-50 text-brand-500 dark:bg-brand-500/15">
          <Bot className="h-5 w-5" />
        </span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-800 dark:text-white/90">Asistente</p>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">Responde con los datos de tu empresa</p>
        </div>
        {mensajes.length > 0 && (
          <button type="button" className={botonIcono} onClick={() => { setMensajes([]); setError(null); }}
            aria-label="Nueva conversación" title="Nueva conversación" disabled={pensando}>
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        <button type="button" className={botonIcono} onClick={() => setAbierto(false)} aria-label="Cerrar asistente">
          <X className="h-4 w-4" />
        </button>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4" aria-live="polite">
        {mensajes.length === 0 && (
          <div className="space-y-2">
            <p className="text-theme-sm text-gray-500 dark:text-gray-400">Pregúntame por viajes, recaudación, choferes o tarifas. Por ejemplo:</p>
            {SUGERENCIAS.map(s => (
              <button key={s} type="button" onClick={() => enviar(s)}
                className="block w-full rounded-lg border border-gray-200 px-3 py-2 text-start text-theme-sm text-gray-700 transition hover:border-brand-300 hover:bg-brand-50 dark:border-gray-800 dark:text-gray-300 dark:hover:bg-brand-500/10">
                {s}
              </button>
            ))}
          </div>
        )}
        {mensajes.map((m, i) => (
          <div key={i} className={`flex ${m.rol === 'usuario' ? 'justify-end' : 'justify-start'}`}>
            <p className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm whitespace-pre-wrap ${m.rol === 'usuario'
              ? 'rounded-br-sm bg-brand-500 text-white'
              : 'rounded-bl-sm bg-gray-100 text-gray-800 dark:bg-white/5 dark:text-white/90'}`}>
              {m.texto}
            </p>
          </div>
        ))}
        {pensando && <p className="text-theme-sm text-gray-500 dark:text-gray-400">Consultando los datos…</p>}
        {error && <p role="alert" className="text-theme-sm text-error-600 dark:text-error-400">{error}</p>}
        <div ref={finRef} />
      </div>

      <form className="flex gap-2 border-t border-gray-200 p-3 dark:border-gray-800"
        onSubmit={(e) => { e.preventDefault(); enviar(texto); }}>
        <input className={campo} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={MAX_CARACTERES}
          placeholder="Escribe tu pregunta…" aria-label="Pregunta" disabled={pensando} autoFocus />
        <button type="submit" className={`${botonPrimario} shrink-0 px-3`} disabled={pensando || !texto.trim()} aria-label="Enviar">
          <SendHorizontal className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
