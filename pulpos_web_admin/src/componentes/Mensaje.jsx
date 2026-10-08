import { CircleAlert, CircleCheck, TriangleAlert, X } from 'lucide-react';

const ESTILOS = {
  exito: ['bg-green-950 text-green-400 border-green-800', CircleCheck],
  error: ['bg-red-950 text-red-400 border-red-800', CircleAlert],
  aviso: ['bg-yellow-950 text-yellow-300 border-yellow-800', TriangleAlert],
};

// El backend antepone emojis (✅ ❌ ⚠️ 🚫 ⏳); el ícono ya lo pone este componente.
const sinEmoji = (texto) => String(texto ?? '').replace(/^[\p{Extended_Pictographic}️\s]+/u, '');

export default function Mensaje({ tipo = 'error', texto, onCerrar, className = '' }) {
  if (!texto) return null;
  const [estilo, Icono] = ESTILOS[tipo] ?? ESTILOS.error;
  return (
    <div role={tipo === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 border rounded-xl px-4 py-3 font-radar text-sm ${estilo} ${className}`}>
      <Icono className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <span className="flex-1">{sinEmoji(texto)}</span>
      {onCerrar && (
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="opacity-60 hover:opacity-100 transition">
          <X className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
