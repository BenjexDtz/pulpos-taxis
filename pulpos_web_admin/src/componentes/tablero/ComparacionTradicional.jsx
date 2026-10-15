import { formatoMoneda, formatoNumero, SUPERFICIES } from '../../utilidades.js';

const nombre = (tipo) => (tipo === 'mixto' ? 'Mixto' : SUPERFICIES[tipo]?.nombre ?? tipo);
const conSigno = (x) => `${x > 0 ? '+' : ''}${formatoNumero(x, 1)} %`;

function Cifra({ etiqueta, valor, detalle }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
      <p className="text-theme-xs text-gray-500 dark:text-gray-400">{etiqueta}</p>
      <p className="text-lg font-semibold text-gray-800 dark:text-white/90">{valor}</p>
      {detalle && <p className="text-theme-xs text-gray-500 dark:text-gray-400">{detalle}</p>}
    </div>
  );
}

// Tarifa del sistema frente a lo que el chofer dijo que habría cobrado negociando de palabra
export default function ComparacionTradicional({ datos, moneda }) {
  const total = datos.find(d => d.tipo === 'total');
  if (!total?.viajes) {
    return (
      <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">
        Aún no hay viajes con el monto sin taxímetro. Al terminar un viaje, la app le pregunta al chofer cuánto habría cobrado.
      </p>
    );
  }
  const porTipo = datos.filter(d => d.tipo !== 'total');
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Cifra etiqueta="Viajes comparados" valor={total.viajes} />
        <Cifra etiqueta="Promedio con el sistema" valor={formatoMoneda(total.sistema, moneda)}
          detalle={`sin taxímetro: ${formatoMoneda(total.tradicional, moneda)}`} />
        <Cifra etiqueta="Diferencia media" valor={conSigno(total.diferencia_pct)}
          detalle={`${formatoNumero(total.diferencia_abs_pct, 1)} % en valor absoluto`} />
        <Cifra etiqueta="El sistema cobró menos" valor={`${formatoNumero((total.sistema_menor / total.viajes) * 100, 0)} %`}
          detalle={`${total.sistema_menor} de ${total.viajes} viajes`} />
      </div>
      {porTipo.length > 1 && (
        <table className="mt-4 w-full text-left text-theme-sm">
          <thead>
            <tr className="text-theme-xs text-gray-500 dark:text-gray-400">
              <th className="py-2 font-medium">Superficie</th>
              <th className="py-2 text-right font-medium">Viajes</th>
              <th className="py-2 text-right font-medium">Sistema</th>
              <th className="py-2 text-right font-medium">Sin taxímetro</th>
              <th className="py-2 text-right font-medium">Diferencia</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {porTipo.map(d => (
              <tr key={d.tipo} className="text-gray-700 dark:text-gray-300">
                <td className="py-2">{nombre(d.tipo)}</td>
                <td className="py-2 text-right">{d.viajes}</td>
                <td className="py-2 text-right">{formatoMoneda(d.sistema, moneda)}</td>
                <td className="py-2 text-right">{formatoMoneda(d.tradicional, moneda)}</td>
                <td className="py-2 text-right font-medium">{conSigno(d.diferencia_pct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-4 rounded-lg bg-gray-50 px-3 py-2 text-theme-xs text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
        Diferencia = (sistema − sin taxímetro) / sin taxímetro. El monto sin taxímetro lo declara el chofer y es opcional:
        sirve para comparar, no como prueba.
      </p>
    </div>
  );
}
