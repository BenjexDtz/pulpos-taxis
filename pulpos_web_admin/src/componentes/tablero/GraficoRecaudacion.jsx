import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatoMoneda } from '../../utilidades.js';

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS_PARA_AGRUPAR = 92;

const etiquetaDia = (dia) => { const [, m, d] = dia.split('-'); return `${d}/${m}`; };
const etiquetaMes = (mes) => { const [a, m] = mes.split('-'); return `${MESES[m - 1]} ${a.slice(2)}`; };

// En rangos largos una barra por día queda ilegible: se suman por mes.
const porMes = (datos) => {
  const meses = new Map();
  for (const d of datos) {
    const mes = d.dia.slice(0, 7);
    const m = meses.get(mes) ?? { dia: mes, viajes: 0, recaudado: 0, km: 0 };
    m.viajes += d.viajes; m.recaudado += d.recaudado; m.km += d.km;
    meses.set(mes, m);
  }
  return [...meses.values()];
};

function Detalle({ active, payload, moneda, mensual }) {
  if (!active || !payload?.length) return null;
  const { dia, recaudado, viajes, km } = payload[0].payload;
  const fecha = mensual
    ? new Date(`${dia}-15T12:00:00`).toLocaleDateString('es-BO', { month: 'long', year: 'numeric' })
    : new Date(`${dia}T12:00:00`).toLocaleDateString('es-BO', { weekday: 'short', day: 'numeric', month: 'short' });
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-theme-xs shadow-theme-sm dark:border-gray-800 dark:bg-gray-900">
      <p className="mb-1 font-medium text-gray-800 first-letter:uppercase dark:text-white/90">{fecha}</p>
      <p className="text-gray-700 dark:text-gray-300">{formatoMoneda(recaudado, moneda)}</p>
      <p className="text-gray-500 dark:text-gray-400">{viajes} viaje{viajes === 1 ? '' : 's'} · {km.toFixed(1)} km</p>
    </div>
  );
}

export default function GraficoRecaudacion({ datos: diarios, color, moneda }) {
  const mensual = diarios.length > DIAS_PARA_AGRUPAR;
  const datos = mensual ? porMes(diarios) : diarios;
  // Con muchos días se muestran menos etiquetas para que no se encimen.
  const salto = !mensual && datos.length > 45 ? Math.ceil(datos.length / 15) - 1 : !mensual && datos.length > 16 ? 1 : 0;
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={datos} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="dia" tickFormatter={mensual ? etiquetaMes : etiquetaDia} interval={salto} axisLine={false} tickLine={false} fontSize={12} />
          <YAxis axisLine={false} tickLine={false} fontSize={12} width={48} />
          <Tooltip content={<Detalle moneda={moneda} mensual={mensual} />} cursor={{ fill: 'currentColor', opacity: 0.06 }} />
          <Bar dataKey="recaudado" fill={color} radius={[5, 5, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
