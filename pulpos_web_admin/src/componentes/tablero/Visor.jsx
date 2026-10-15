// Cifras en el estilo del visor de un taxímetro.
export default function Visor({ titulo, nota, cifras }) {
  return (
    <section aria-label={titulo} className="overflow-hidden rounded-2xl bg-white ring-1 ring-gray-200 dark:bg-gray-900 dark:ring-white/10">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 px-5 py-2 dark:border-white/10">
        <h2 className="text-[11px] font-semibold tracking-[0.2em] text-gray-500 uppercase dark:text-gray-400">{titulo}</h2>
        {nota && <p className="text-[11px] text-gray-400 dark:text-gray-500">{nota}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-px bg-gray-200 md:grid-cols-4 dark:bg-white/10">
        {cifras.map(({ etiqueta, valor, detalle, cambio }) => (
          <div key={etiqueta} className="flex flex-col bg-white px-5 py-4 dark:bg-gray-900">
            <dt className="text-xs text-gray-500 dark:text-gray-400">{etiqueta}</dt>
            <dd className="mt-1 truncate font-mono text-2xl font-semibold text-brand-700 tabular-nums md:text-3xl dark:text-brand-300">{valor}</dd>
            <dd className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-gray-500">
              {cambio !== null && cambio !== undefined && (
                <span className={cambio >= 0 ? 'text-success-600 dark:text-success-500' : 'text-error-600 dark:text-error-500'}>
                  {cambio >= 0 ? '▲' : '▼'} {Math.abs(cambio).toFixed(1)}%
                </span>
              )}
              {detalle}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
