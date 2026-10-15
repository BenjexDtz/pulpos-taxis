import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import MapaFlota from '../componentes/MapaFlota.jsx';
import Mensaje from '../componentes/Mensaje.jsx';
import RutaViaje from '../componentes/RutaViaje.jsx';
import Visor from '../componentes/tablero/Visor.jsx';
import { tarjeta } from '../componentes/ui/estilos.js';
import {
  consultaFechas, fechaLocal, formatoMoneda, formatoNumero, RESPALDO_SUPERFICIE, resumenFlota, SUPERFICIES, VERIFICACION,
} from '../utilidades.js';

const CADA_MS = 15000;

const PUNTO = { exito: 'bg-success-500', error: 'bg-error-500', aviso: 'bg-warning-500', neutro: 'bg-gray-400' };

const hora = (fecha) => new Date(fecha).toLocaleTimeString('es-BO', { hour: '2-digit', minute: '2-digit' });

function Entrada({ viaje: v, moneda, onAbrir }) {
  const verificacion = VERIFICACION[v.verificacion] ?? VERIFICACION.sin_verificar;
  const superficie = v.tipo_superficie === 'mixto' ? 'Mixto' : SUPERFICIES[v.tipo_superficie]?.nombre ?? 'Asfalto';
  const dudosa = v.superficie_respaldo === 'dudosa';
  return (
    <li>
      <button onClick={() => onAbrir(v.id)} title={v.verificacion_detalle || verificacion.ayuda}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 dark:hover:bg-white/[0.03]">
        <span className="pt-0.5 font-mono text-theme-sm text-gray-500 tabular-nums dark:text-gray-400">{hora(v.fecha_hora)}</span>
        <span className="min-w-0">
          <span className="block truncate text-theme-sm font-medium text-gray-800 dark:text-white/90">{v.chofer}</span>
          <span className="block truncate text-theme-xs text-gray-500 dark:text-gray-400">
            <span className="font-mono">{v.placa_vehiculo}</span> · {formatoNumero(v.distancia_km, 2)} km · {superficie}
          </span>
        </span>
        <span className="text-right">
          <span className="block font-mono text-theme-sm font-semibold text-gray-800 tabular-nums dark:text-white/90">
            {formatoMoneda(v.tarifa_total, moneda)}
          </span>
          <span className="inline-flex items-center gap-1.5 text-theme-xs text-gray-500 dark:text-gray-400">
            <span className={`h-1.5 w-1.5 rounded-full ${PUNTO[dudosa ? 'aviso' : verificacion.color]}`} />
            {dudosa ? RESPALDO_SUPERFICIE.dudosa.texto : verificacion.texto}
          </span>
        </span>
      </button>
    </li>
  );
}

export default function Central({ choferes, empresa, cargarChoferes, urlServidor, headers, manejarErrorApi }) {
  const [viajes, setViajes] = useState([]);
  const [error, setError] = useState('');
  const [actualizado, setActualizado] = useState(null);
  const [rutaAbierta, setRutaAbierta] = useState(null);
  const m = empresa?.moneda_simbolo ?? 'Bs';

  const cargarViajes = useCallback(async () => {
    const hoy = fechaLocal();
    try {
      const res = await axios.get(`${urlServidor}/api/admin/viajes${consultaFechas(hoy, hoy)}`, { headers: headers() });
      setViajes(res.data); setError(''); setActualizado(new Date());
    } catch (err) {
      manejarErrorApi(err, setError);
    }
  }, [urlServidor, headers, manejarErrorApi]);

  useEffect(() => {
    const cargar = () => { cargarChoferes(); cargarViajes(); };
    cargar();
    const iv = setInterval(cargar, CADA_MS);
    return () => clearInterval(iv);
  }, [cargarChoferes, cargarViajes]);

  const { activosCount, conGPSVivo } = resumenFlota(choferes);
  const recaudado = viajes.reduce((s, v) => s + Number(v.tarifa_total || 0), 0);
  const km = viajes.reduce((s, v) => s + Number(v.distancia_km || 0), 0);
  const espera = viajes.reduce((s, v) => s + Number(v.tiempo_detencion_min || 0), 0);
  const conDiferencia = viajes.filter(v => v.verificacion === 'diferencia').length;

  return (
    <div className="space-y-5">
      {rutaAbierta && (
        <RutaViaje id={rutaAbierta} urlServidor={urlServidor} headers={headers} manejarErrorApi={manejarErrorApi}
          moneda={m} color={empresa?.color_primario ?? '#465fff'} onCerrar={() => setRutaAbierta(null)} />
      )}

      <Visor titulo={`Hoy · ${new Date().toLocaleDateString('es-BO', { weekday: 'long', day: 'numeric', month: 'long' })}`}
        nota={actualizado && `Actualizado ${hora(actualizado)} · cada 15 s`}
        cifras={[
          { etiqueta: 'Recaudado', valor: formatoMoneda(recaudado, m),
            detalle: viajes.length ? `promedio ${formatoMoneda(recaudado / viajes.length, m)}` : 'sin viajes aún' },
          { etiqueta: 'Viajes', valor: formatoNumero(viajes.length),
            detalle: conDiferencia ? `${conDiferencia} con diferencia` : 'todos cuadran' },
          { etiqueta: 'Kilómetros', valor: formatoNumero(km, 1), detalle: `${formatoNumero(espera)} min de espera` },
          { etiqueta: 'Unidades en línea', valor: formatoNumero(conGPSVivo),
            detalle: `${activosCount} activas · ${choferes.length} registradas` },
        ]} />

      <Mensaje texto={error} />

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className={`${tarjeta} isolate h-[420px] overflow-hidden xl:h-[600px]`}>
          <MapaFlota choferes={choferes} viajes={viajes} empresa={empresa} />
        </div>

        <section className={`${tarjeta} flex flex-col overflow-hidden xl:h-[600px]`} aria-labelledby="titulo-bitacora">
          <header className="flex items-baseline justify-between gap-3 border-b border-gray-200 px-4 py-3 dark:border-gray-800">
            <h2 id="titulo-bitacora" className="text-sm font-semibold tracking-wide text-gray-800 uppercase dark:text-white/90">Bitácora de hoy</h2>
            <span className="font-mono text-theme-xs text-gray-500 dark:text-gray-400">{viajes.length} viajes</span>
          </header>
          {viajes.length === 0 ? (
            <p className="px-6 py-12 text-center text-theme-sm text-gray-500 dark:text-gray-400">
              Todavía no llegó ningún viaje. Aparecen aquí apenas la app de cada chofer los sincroniza.
            </p>
          ) : (
            <ul className="custom-scrollbar max-h-[480px] flex-1 divide-y divide-gray-100 overflow-y-auto xl:max-h-none dark:divide-gray-800">
              {viajes.map(v => <Entrada key={v.id} viaje={v} moneda={m} onAbrir={setRutaAbierta} />)}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
