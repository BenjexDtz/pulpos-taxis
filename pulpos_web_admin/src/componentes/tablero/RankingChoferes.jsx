import { formatoMoneda } from '../../utilidades.js';

export default function RankingChoferes({ choferes, moneda }) {
  if (!choferes.length) return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Sin viajes en el período.</p>;
  const maximo = choferes[0].recaudado || 1;
  return (
    <ol className="space-y-5">
      {choferes.map((c, i) => (
        <li key={c.id}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-100 text-theme-xs font-semibold text-gray-700 dark:bg-gray-800 dark:text-gray-300">
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{c.nombre}</p>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">{c.placa} · {c.viajes} viajes · {c.km.toFixed(1)} km</p>
              </div>
            </div>
            <span className="shrink-0 text-theme-sm font-semibold text-gray-800 dark:text-white/90">{formatoMoneda(c.recaudado, moneda)}</span>
          </div>
          <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
            <div className="h-2 rounded-full bg-brand-500" style={{ width: `${(c.recaudado / maximo) * 100}%` }} />
          </div>
        </li>
      ))}
    </ol>
  );
}
