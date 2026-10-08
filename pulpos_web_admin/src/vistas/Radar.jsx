import { RefreshCw, Settings, Signal, Users } from 'lucide-react';
import MapaFlota from '../componentes/MapaFlota.jsx';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';
import { botonPrimario, tarjeta } from '../componentes/ui/estilos.js';
import { resumenFlota, haceTiempo, minutosDesde } from '../utilidades.js';

function Estado({ color, etiqueta, valor }) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2 text-theme-sm text-gray-500 dark:text-gray-400">
        <span className={`h-2.5 w-2.5 rounded-full ${color}`} />{etiqueta}
      </span>
      <span className="text-theme-sm font-semibold text-gray-800 dark:text-white/90">{valor}</span>
    </div>
  );
}

export default function Radar({ choferes, viajes, params, empresa, cargandoChoferes, cargarChoferes, cargarReporte }) {
  const m = empresa?.moneda_simbolo ?? 'Bs';
  const { activosCount, conGPSVivo } = resumenFlota(choferes);
  const activos = choferes.filter(c => c.estado_activo);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-theme-sm text-gray-500 dark:text-gray-400">
          Se actualiza cada 15 s · <span className="font-medium text-success-600 dark:text-success-500">{conGPSVivo} unidades con señal activa</span>
        </p>
        <button onClick={() => { cargarChoferes(); cargarReporte(); }} className={botonPrimario}>
          <RefreshCw className={`h-4 w-4 ${cargandoChoferes ? 'animate-spin' : ''}`} />Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className={`${tarjeta} isolate overflow-hidden`} style={{ height: '560px' }}>
          <MapaFlota choferes={choferes} viajes={viajes} empresa={empresa} />
        </div>

        <div className="space-y-6">
          <Tarjeta icono={Signal} titulo="Estado de la flota">
            <div className="space-y-3">
              <Estado color="bg-success-500" etiqueta="GPS activo ahora" valor={conGPSVivo} />
              <Estado color="bg-warning-500" etiqueta="Activos sin GPS reciente" valor={activosCount - conGPSVivo} />
              <Estado color="bg-gray-400" etiqueta="Inactivos" valor={choferes.length - activosCount} />
              <div className="h-2 w-full rounded-full bg-gray-100 dark:bg-gray-800">
                <div className="h-2 rounded-full bg-success-500 transition-all" style={{ width: `${choferes.length ? (conGPSVivo / choferes.length) * 100 : 0}%` }} />
              </div>
            </div>
          </Tarjeta>

          <Tarjeta icono={Users} titulo="Unidades activas" subtitulo={`${activos.length} en servicio`} cuerpo="">
            <ul className="custom-scrollbar max-h-72 divide-y divide-gray-100 overflow-y-auto dark:divide-gray-800">
              {activos.length === 0 && <li className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">Sin unidades activas.</li>}
              {activos.map(chofer => {
                const tieneGPS = chofer.ultima_lat != null;
                const minutos = minutosDesde(chofer.ultima_actualizacion);
                const enVivo = minutos !== null && minutos < 5;
                return (
                  <li key={chofer.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${enVivo ? 'bg-success-500' : tieneGPS ? 'bg-warning-500' : 'bg-gray-300 dark:bg-gray-600'}`} />
                    <div className="min-w-0">
                      <p className="truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{chofer.nombre_completo}</p>
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                        {chofer.placa_vehiculo} · {enVivo ? 'GPS en vivo' : tieneGPS ? haceTiempo(minutos) : 'sin GPS aún'}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Tarjeta>

          {params && (
            <Tarjeta icono={Settings} titulo="Parámetros activos">
              <dl className="space-y-2">
                {[
                  ['FH · altitud', `${params.factor_altitud}×`],
                  ['FR · tierra', `${params.factor_superficie}×`],
                  ['Cb · costo base', `${m} ${params.costo_base_km}/km`],
                  ['Cl · consumo', `${params.consumo_litros_km} L/km`],
                  ['Pc · combustible', `${m} ${params.precio_combustible_bs}/L`],
                  ['Cl × Pc', `${m} ${params.costo_combustible_km}/km`],
                  ['Ct · espera', `${m} ${params.costo_minuto_detencion}/min`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 text-theme-sm">
                    <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
                    <dd className="font-medium text-gray-800 dark:text-white/90">{v}</dd>
                  </div>
                ))}
              </dl>
            </Tarjeta>
          )}
        </div>
      </div>
    </div>
  );
}
