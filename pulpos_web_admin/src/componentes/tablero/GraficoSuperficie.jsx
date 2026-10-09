import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { formatoMoneda, formatoNumero } from '../../utilidades.js';

const NOMBRES = { asfalto: 'Asfalto', tierra: 'Tierra' };

function Detalle({ active, payload, moneda }) {
  if (!active || !payload?.length) return null;
  const { tipo, viajes, km, recorrido } = payload[0].payload;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-theme-xs shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="font-medium text-gray-800 dark:text-white/90">{NOMBRES[tipo] ?? tipo}</p>
      <p className="text-gray-500 dark:text-gray-400">{formatoNumero(km, 1)} km en {viajes} viajes · {formatoMoneda(recorrido, moneda)}</p>
    </div>
  );
}

export default function GraficoSuperficie({ datos, colores, moneda, factorTierra }) {
  const totalKm = datos.reduce((s, d) => s + d.km, 0);
  const totalRecorrido = datos.reduce((s, d) => s + d.recorrido, 0);
  const colorDe = (tipo) => (tipo === 'tierra' ? colores.tierra : colores.asfalto);

  if (!totalKm) return <p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Sin viajes en el período.</p>;

  return (
    <div>
      <div className="relative h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={datos} dataKey="km" nameKey="tipo" innerRadius="68%" outerRadius="95%" paddingAngle={2} stroke="none">
              {datos.map(d => <Cell key={d.tipo} fill={colorDe(d.tipo)} />)}
            </Pie>
            <Tooltip content={<Detalle moneda={moneda} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-gray-800 dark:text-white/90">{formatoNumero(totalKm, 1)}</span>
          <span className="text-theme-xs text-gray-500 dark:text-gray-400">km</span>
        </div>
      </div>
      <ul className="mt-4 space-y-3">
        {datos.map(d => {
          const parte = totalRecorrido ? (d.recorrido / totalRecorrido) * 100 : 0;
          return (
            <li key={d.tipo} className="flex items-center justify-between gap-3 text-theme-sm">
              <span className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorDe(d.tipo) }} />
                {NOMBRES[d.tipo] ?? d.tipo}
              </span>
              <span className="text-right text-gray-500 dark:text-gray-400">
                {formatoNumero(d.km, 1)} km · <span className="font-medium text-gray-800 dark:text-white/90">{parte.toFixed(0)}%</span> del cobro por recorrido
              </span>
            </li>
          );
        })}
      </ul>
      {factorTierra && (
        <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-theme-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
          Cada km en tierra se cobra × FR = {Number(factorTierra).toFixed(2)}; un viaje mixto suma en las dos superficies.
        </p>
      )}
    </div>
  );
}
