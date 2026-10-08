import { useState } from 'react';
import { Activity, Car, Clock, DollarSign, Download, RefreshCw, Search, TrendingUp } from 'lucide-react';
import TarjetaDato from '../componentes/TarjetaDato.jsx';
import { consultaFechas, resumenFlota } from '../utilidades.js';

export default function Tablero({
  viajes, choferes, empresa, cargando, errorDashboard, fechaDesde, setFechaDesde, fechaHasta, setFechaHasta,
  cargarReporte, urlServidor, headers,
}) {
  const [filtroChofer, setFiltroChofer] = useState('');
  const [errorCsv, setErrorCsv] = useState(null);
  const m = empresa?.moneda_simbolo ?? 'Bs';

  const exportarCSV = () => {
    const url = `${urlServidor}/api/admin/viajes/exportar${consultaFechas(fechaDesde, fechaHasta)}`;
    setErrorCsv(null);
    fetch(url, { headers: headers() })
      .then(async r => {
        if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '⚠️ No se pudo exportar el CSV.');
        return r.blob();
      })
      .then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `${empresa?.codigo ?? 'empresa'}_viajes_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
      })
      .catch(err => setErrorCsv(err.message));
  };

  const viajesFiltrados = viajes.filter(v =>
    v.chofer?.toLowerCase().includes(filtroChofer.toLowerCase()) ||
    v.placa_vehiculo?.toLowerCase().includes(filtroChofer.toLowerCase())
  );
  const totalRecaudado = viajesFiltrados.reduce((s, v) => s + parseFloat(v.tarifa_total || 0), 0);
  const kmTotal = viajesFiltrados.reduce((s, v) => s + parseFloat(v.distancia_km || 0), 0);
  const { activosCount, conGPSVivo } = resumenFlota(choferes);
  const errorTabla = errorDashboard || errorCsv;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <TarjetaDato icon={DollarSign} label="RECAUDACIÓN" value={`${m} ${totalRecaudado.toFixed(2)}`} sub="viajes filtrados" color="green" />
        <TarjetaDato icon={Activity} label="VIAJES" value={viajesFiltrados.length} sub={`de ${viajes.length} total`} color="blue" />
        <TarjetaDato icon={Car} label="FLOTA ACTIVA" value={activosCount} sub={`${conGPSVivo} con GPS en vivo`} color="yellow" pulse />
        <TarjetaDato icon={TrendingUp} label="KM RECORRIDOS" value={kmTotal.toFixed(1)} sub="kilómetros acumulados" color="purple" />
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex flex-wrap items-center gap-3 bg-gray-900">
          <div className="flex items-center space-x-2 mr-auto">
            <Clock className="w-4 h-4 text-gray-500" />
            <h2 className="font-bold text-gray-200 tracking-wider">HISTORIAL DE VIAJES</h2>
          </div>
          <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg font-radar text-xs focus:outline-none focus:border-blue-500" />
          <span className="text-gray-600 font-radar text-xs">→</span>
          <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
            className="bg-gray-800 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg font-radar text-xs focus:outline-none focus:border-blue-500" />
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-600" />
            <input type="text" placeholder="Conductor o placa..."
              className="bg-gray-800 border border-gray-700 text-white pl-9 pr-4 py-2 rounded-lg font-radar text-xs focus:outline-none focus:border-blue-500 transition w-44 placeholder-gray-700"
              value={filtroChofer} onChange={e => setFiltroChofer(e.target.value)} />
          </div>
          <button onClick={exportarCSV}
            className="flex items-center gap-2 bg-green-950 hover:bg-green-900 border border-green-800 text-green-400 px-3 py-2 rounded-lg transition font-radar text-xs">
            <Download className="w-3.5 h-3.5" />CSV
          </button>
          <button onClick={cargarReporte} disabled={cargando}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition font-radar text-xs disabled:opacity-50">
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />SYNC
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead><tr className="border-b border-gray-800">{['CONDUCTOR / UNIDAD', 'DISTANCIA', 'ESPERA', 'TARIFA', 'FECHA'].map(h => <th key={h} className="px-5 py-3 text-left font-radar text-xs text-gray-600 tracking-widest">{h}</th>)}</tr></thead>
            <tbody>
              {errorTabla && <tr><td colSpan={5} className="text-center py-10 text-red-500 font-radar text-sm">{errorTabla}</td></tr>}
              {!errorTabla && viajesFiltrados.length === 0 && !cargando && <tr><td colSpan={5} className="text-center py-10 text-gray-700 font-radar text-sm">SIN REGISTROS</td></tr>}
              {viajesFiltrados.map(viaje => (
                <tr key={viaje.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                  <td className="px-5 py-4"><div className="font-semibold text-white">{viaje.chofer}</div><div className="font-radar text-xs text-green-500 mt-0.5">{viaje.placa_vehiculo}</div></td>
                  <td className="px-5 py-4 font-radar text-blue-400">{parseFloat(viaje.distancia_km).toFixed(2)} km</td>
                  <td className="px-5 py-4 font-radar text-yellow-500">{Math.floor(viaje.tiempo_detencion_min)} min</td>
                  <td className="px-5 py-4 font-radar text-green-400 font-bold text-base">{m} {parseFloat(viaje.tarifa_total).toFixed(2)}</td>
                  <td className="px-5 py-4 font-radar text-xs text-gray-600">{new Date(viaje.fecha_hora).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
