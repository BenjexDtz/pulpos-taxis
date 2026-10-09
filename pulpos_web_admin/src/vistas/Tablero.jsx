import { useEffect, useState } from 'react';
import axios from 'axios';
import { Activity, Car, Clock, Coins, Download, Flame, Layers, MapPinned, RefreshCw, Route, Search, Trophy, TrendingUp } from 'lucide-react';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';
import Insignia from '../componentes/ui/Insignia.jsx';
import Mensaje from '../componentes/Mensaje.jsx';
import RutaViaje from '../componentes/RutaViaje.jsx';
import TarjetaMetrica from '../componentes/tablero/TarjetaMetrica.jsx';
import GraficoRecaudacion from '../componentes/tablero/GraficoRecaudacion.jsx';
import GraficoSuperficie from '../componentes/tablero/GraficoSuperficie.jsx';
import RankingChoferes from '../componentes/tablero/RankingChoferes.jsx';
import MapaCalorHoras from '../componentes/tablero/MapaCalorHoras.jsx';
import { botonIcono, botonSecundario, campo, campoEnLinea, filaTabla, td, th } from '../componentes/ui/estilos.js';
import { consultaFechas, fechaLocal, formatoMoneda, formatoNumero, resumenFlota, variacion, VERIFICACION } from '../utilidades.js';

const PERIODOS = [[7, '7 días'], [30, '30 días'], [90, '90 días'], [365, '1 año']];
const COLOR_TIERRA = '#f79009';

const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fechaLocal(d); };

export default function Tablero({
  viajes, choferes, empresa, params, cargando, errorDashboard, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta,
  cargarReporte, cargarChoferes, urlServidor, headers, manejarErrorApi,
}) {
  const [filtroChofer, setFiltroChofer] = useState('');
  const [soloDiferencias, setSoloDiferencias] = useState(false);
  const [rutaAbierta, setRutaAbierta] = useState(null);
  const [errorCsv, setErrorCsv] = useState(null);
  const [estadisticas, setEstadisticas] = useState(null);
  const [errorEstadisticas, setErrorEstadisticas] = useState('');
  const m = empresa?.moneda_simbolo ?? 'Bs';
  const color = empresa?.color_primario ?? '#465fff';

  useEffect(() => {
    let vigente = true;
    axios.get(`${urlServidor}/api/admin/estadisticas${consultaFechas(fechaDesde, fechaHasta)}`, { headers: headers() })
      .then(r => { if (vigente) { setEstadisticas(r.data); setErrorEstadisticas(''); } })
      .catch(err => { if (vigente) manejarErrorApi(err, setErrorEstadisticas); });
    return () => { vigente = false; };
  }, [urlServidor, headers, manejarErrorApi, fechaDesde, fechaHasta]);

  useEffect(() => { cargarReporte(); }, [cargarReporte]);
  useEffect(() => { cargarChoferes(); }, [cargarChoferes]);

  const elegirPeriodo = (dias) => { setFechaDesde(haceDias(dias - 1)); setFechaHasta(haceDias(0)); };
  const periodoActivo = PERIODOS.find(([dias]) => fechaDesde === haceDias(dias - 1) && fechaHasta === haceDias(0))?.[0];

  const exportarCSV = () => {
    setErrorCsv(null);
    fetch(`${urlServidor}/api/admin/viajes/exportar${consultaFechas(fechaDesde, fechaHasta)}`, { headers: headers() })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '⚠️ No se pudo exportar el CSV.');
        return r.blob();
      })
      .then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${empresa?.codigo ?? 'empresa'}_viajes_${fechaLocal()}.csv`;
        link.click();
        URL.revokeObjectURL(link.href);
      })
      .catch(err => setErrorCsv(err.message));
  };

  const texto = filtroChofer.toLowerCase();
  const viajesFiltrados = viajes.filter(v =>
    (v.chofer?.toLowerCase().includes(texto) || v.placa_vehiculo?.toLowerCase().includes(texto)) &&
    (!soloDiferencias || v.verificacion === 'diferencia'));
  const conDiferencia = viajes.filter(v => v.verificacion === 'diferencia').length;
  const { activosCount, conGPSVivo } = resumenFlota(choferes);
  const r = estadisticas?.resumen;
  const a = estadisticas?.anterior;

  return (
    <div className="space-y-6">
      {rutaAbierta && (
        <RutaViaje id={rutaAbierta} urlServidor={urlServidor} headers={headers} manejarErrorApi={manejarErrorApi}
          moneda={m} color={color} onCerrar={() => setRutaAbierta(null)} />
      )}
      {/* Período */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-lg bg-gray-100 p-0.5 dark:bg-gray-900" role="group" aria-label="Período">
          {PERIODOS.map(([dias, nombre]) => (
            <button key={dias} onClick={() => elegirPeriodo(dias)} aria-pressed={periodoActivo === dias}
              className={`rounded-md px-3 py-2 text-theme-sm font-medium transition ${periodoActivo === dias
                ? 'bg-white text-gray-900 shadow-theme-xs dark:bg-gray-800 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}>
              {nombre}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input type="date" aria-label="Desde" value={fechaDesde} max={fechaHasta} onChange={e => setFechaDesde(e.target.value)} className={campoEnLinea} />
          <span className="text-gray-400">→</span>
          <input type="date" aria-label="Hasta" value={fechaHasta} min={fechaDesde} onChange={e => setFechaHasta(e.target.value)} className={campoEnLinea} />
        </div>
      </div>

      <Mensaje texto={errorEstadisticas} />

      {/* Indicadores */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 md:gap-6">
        <TarjetaMetrica icono={Coins} etiqueta="Recaudación" valor={formatoMoneda(r?.recaudado, m)}
          cambio={r && variacion(r.recaudado, a?.recaudado)}
          detalle={a?.viajes ? `Período anterior: ${formatoMoneda(a.recaudado, m)}` : 'Sin viajes en el período anterior'} />
        <TarjetaMetrica icono={Activity} etiqueta="Viajes" valor={formatoNumero(r?.viajes)}
          cambio={r && variacion(r.viajes, a?.viajes)}
          detalle={r?.viajes ? `Tarifa promedio ${formatoMoneda(r.recaudado / r.viajes, m)}` : null} />
        <TarjetaMetrica icono={Route} etiqueta="Kilómetros recorridos" valor={formatoNumero(r?.km, 1)}
          cambio={r && variacion(r.km, a?.km)} detalle={r ? `${formatoNumero(r.espera_min)} min de espera cobrados` : null} />
        <TarjetaMetrica icono={Car} etiqueta="Flota activa" valor={activosCount}
          detalle={`${conGPSVivo} con GPS en vivo · ${choferes.length} registrados`} />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-12 gap-4 md:gap-6">
        <Tarjeta className="col-span-12 xl:col-span-8" icono={TrendingUp} titulo="Recaudación"
          subtitulo={estadisticas
            ? `${estadisticas.por_dia.length > 92 ? 'Por mes' : 'Por día'} · total ${formatoMoneda(r?.recaudado, m)}`
            : 'Cargando...'}>
          <GraficoRecaudacion datos={estadisticas?.por_dia ?? []} color={color} moneda={m} />
        </Tarjeta>
        <Tarjeta className="col-span-12 xl:col-span-4" icono={Layers} titulo="Asfalto vs tierra" subtitulo="Km recorridos por superficie">
          <GraficoSuperficie datos={estadisticas?.superficie ?? []} colores={{ asfalto: color, tierra: COLOR_TIERRA }}
            moneda={m} factorTierra={params?.factor_superficie} />
        </Tarjeta>
        <Tarjeta className="col-span-12 xl:col-span-5" icono={Trophy} titulo="Ranking de choferes" subtitulo="Los que más recaudaron en el período">
          <RankingChoferes choferes={estadisticas?.choferes ?? []} moneda={m} />
        </Tarjeta>
        <Tarjeta className="col-span-12 xl:col-span-7" icono={Flame} titulo="Horas pico" subtitulo="Viajes por día de la semana y hora">
          <MapaCalorHoras horas={estadisticas?.horas ?? []} />
        </Tarjeta>
      </div>

      {/* Historial */}
      <Tarjeta icono={Clock} titulo="Historial de viajes" subtitulo={`${viajesFiltrados.length} de ${viajes.length} viajes del período`} cuerpo=""
        acciones={
          <>
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="search" placeholder="Conductor o placa..." aria-label="Buscar conductor o placa"
                value={filtroChofer} onChange={e => setFiltroChofer(e.target.value)} className={`${campo} w-56 pl-9`} />
            </div>
            <label className="flex items-center gap-2 text-theme-sm text-gray-600 dark:text-gray-400">
              <input type="checkbox" checked={soloDiferencias} onChange={e => setSoloDiferencias(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 accent-brand-500" />
              Solo con diferencia{conDiferencia > 0 && ` (${conDiferencia})`}
            </label>
            <button onClick={exportarCSV} className={botonSecundario}><Download className="h-4 w-4" />CSV</button>
            <button onClick={cargarReporte} disabled={cargando} className={botonSecundario}>
              <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />Actualizar
            </button>
          </>
        }>
        {(errorDashboard || errorCsv) && <div className="px-5 pt-4 sm:px-6"><Mensaje texto={errorDashboard || errorCsv} /></div>}
        <div className="custom-scrollbar max-h-[480px] overflow-auto">
          <table className="w-full">
            <thead className="sticky top-0 bg-white dark:bg-gray-900">
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Conductor / unidad', 'Distancia', 'Espera', 'Superficie', 'Tarifa', 'Verificación', 'Fecha'].map(h => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {!cargando && viajesFiltrados.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">Sin viajes en el período.</td></tr>
              )}
              {viajesFiltrados.map(v => (
                <tr key={v.id} className={filaTabla}>
                  <td className={td}>
                    <p className="font-medium text-gray-800 dark:text-white/90">{v.chofer}</p>
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">{v.placa_vehiculo}</p>
                  </td>
                  <td className={td}>
                    {formatoNumero(v.distancia_km, 2)} km
                    {v.tipo_superficie === 'mixto' && (
                      <p className="text-theme-xs text-gray-500 dark:text-gray-400">
                        {formatoNumero(v.km_asfalto, 2)} asfalto · {formatoNumero(v.km_tierra, 2)} tierra
                      </p>
                    )}
                  </td>
                  <td className={td}>{Math.floor(v.tiempo_detencion_min)} min</td>
                  <td className={td}>
                    <Insignia color={v.tipo_superficie === 'asfalto' ? 'neutro' : 'aviso'}>
                      {{ tierra: 'Tierra', mixto: 'Mixto' }[v.tipo_superficie] ?? 'Asfalto'}
                    </Insignia>
                  </td>
                  <td className={`${td} font-semibold text-gray-800 dark:text-white/90`}>{formatoMoneda(v.tarifa_total, m)}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <span title={v.verificacion_detalle || VERIFICACION[v.verificacion]?.ayuda}>
                        <Insignia color={VERIFICACION[v.verificacion]?.color}>{VERIFICACION[v.verificacion]?.texto ?? 'Sin verificar'}</Insignia>
                      </span>
                      <button onClick={() => setRutaAbierta(v.id)} className={`${botonIcono} h-8 w-8`}
                        aria-label={`Ver ruta del viaje ${v.id}`} title={v.tiene_ruta ? 'Ver ruta en el mapa' : 'Ver detalle (sin ruta GPS)'}>
                        <MapPinned className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                  <td className={td}>{new Date(v.fecha_hora).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
