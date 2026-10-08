const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
const NOMBRES_DIA = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const HORAS = Array.from({ length: 24 }, (_, h) => h);

export default function MapaCalorHoras({ horas }) {
  const celdas = new Map(horas.map(h => [`${h.dia_semana}-${h.hora}`, h.viajes]));
  const maximo = Math.max(1, ...horas.map(h => h.viajes));
  const pico = horas.reduce((a, b) => (b.viajes > (a?.viajes ?? 0) ? b : a), null);

  return (
    <div>
      {pico ? (
        <p className="mb-4 text-theme-sm text-gray-500 dark:text-gray-400">
          Mayor demanda: <span className="font-medium text-gray-800 dark:text-white/90">
            {NOMBRES_DIA[pico.dia_semana - 1]} de {String(pico.hora).padStart(2, '0')}:00 a {String(pico.hora + 1).padStart(2, '0')}:00
          </span> ({pico.viajes} viaje{pico.viajes === 1 ? '' : 's'}).
        </p>
      ) : (
        <p className="mb-4 text-theme-sm text-gray-500 dark:text-gray-400">Sin viajes en el período.</p>
      )}

      <div className="custom-scrollbar overflow-x-auto pb-2">
        <table className="w-full min-w-[460px] table-fixed border-separate border-spacing-[3px]" aria-label="Viajes por día de la semana y hora">
          <thead>
            <tr>
              <th className="w-10" aria-label="Día" />
              {HORAS.map(h => (
                <th key={h} scope="col" className="text-[10px] font-normal text-gray-400">{h % 3 === 0 ? h : ''}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DIAS.map((dia, i) => (
              <tr key={dia}>
                <th scope="row" className="pr-2 text-left text-theme-xs font-normal text-gray-500 dark:text-gray-400">{dia}</th>
                {HORAS.map(h => {
                  const n = celdas.get(`${i + 1}-${h}`) ?? 0;
                  const intensidad = n ? 0.15 + 0.85 * (n / maximo) : 0;
                  return (
                    <td key={h} title={`${NOMBRES_DIA[i]} ${String(h).padStart(2, '0')}:00 · ${n} viaje${n === 1 ? '' : 's'}`}
                      className={`h-6 rounded-[4px] ${n ? '' : 'bg-gray-100 dark:bg-gray-800/60'}`}
                      style={n ? { background: `color-mix(in oklab, var(--marca) ${Math.round(intensidad * 100)}%, transparent)` } : undefined} />
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2 text-theme-xs text-gray-500 dark:text-gray-400">
        <span>Menos</span>
        {[0.15, 0.4, 0.65, 1].map(x => (
          <span key={x} className="h-3 w-5 rounded-[3px]" style={{ background: `color-mix(in oklab, var(--marca) ${x * 100}%, transparent)` }} />
        ))}
        <span>Más</span>
      </div>
    </div>
  );
}
