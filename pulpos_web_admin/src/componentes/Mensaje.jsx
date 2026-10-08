import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react';

const ESTILOS = {
  exito: ['border-success-500 bg-success-50 text-success-700 dark:border-success-500/30 dark:bg-success-500/15 dark:text-success-500', CircleCheck],
  error: ['border-error-500 bg-error-50 text-error-700 dark:border-error-500/30 dark:bg-error-500/15 dark:text-error-400', CircleAlert],
  aviso: ['border-warning-500 bg-warning-50 text-warning-700 dark:border-warning-500/30 dark:bg-warning-500/15 dark:text-orange-400', TriangleAlert],
};

// El backend antepone emojis (✅ ❌ ⚠️ 🚫 ⏳); el ícono ya lo pone este componente.
const sinEmoji = (texto) => String(texto ?? '').replace(/^[\p{Extended_Pictographic}️\s]+/u, '');

export default function Mensaje({ tipo = 'error', texto, onCerrar, className = '' }) {
  if (!texto) return null;
  const [estilo, Icono] = ESTILOS[tipo] ?? ESTILOS.error;
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-xl border p-4 text-sm ${estilo} ${className}`}>
      <Icono className="mt-0.5 h-5 w-5 shrink-0" />
      <span className="flex-1 text-gray-700 dark:text-gray-300">{sinEmoji(texto)}</span>
      {onCerrar && (
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="opacity-60 transition hover:opacity-100">
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
