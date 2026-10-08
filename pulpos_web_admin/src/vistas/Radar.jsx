import { Map, RefreshCw } from 'lucide-react';
import MapaFlota from '../componentes/MapaFlota.jsx';
import { resumenFlota } from '../utilidades.js';

export default function Radar({ choferes, viajes, params, empresa, cargandoChoferes, cargarChoferes, cargarReporte }) {
  const m = empresa?.moneda_simbolo ?? 'Bs';
  const { activosCount, conGPSVivo } = resumenFlota(choferes);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-white text-2xl tracking-wider flex items-center space-x-2"><Map className="w-6 h-6 text-green-400" /><span>RADAR DE FLOTA · GPS EN VIVO</span></h2>
          <p className="font-radar text-xs text-gray-600 mt-1">Actualización cada 15s · <span className="text-green-400">{conGPSVivo} unidades con señal activa</span></p>
        </div>
        <button onClick={() => { cargarChoferes(); cargarReporte(); }} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition font-radar text-xs font-bold">
          <RefreshCw className={`w-3.5 h-3.5 ${cargandoChoferes ? 'animate-spin' : ''}`} />ACTUALIZAR
        </button>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden" style={{ height: '540px' }}>
          <MapaFlota choferes={choferes} viajes={viajes} empresa={empresa} />
        </div>
        <div className="space-y-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <p className="font-radar text-xs text-gray-600 tracking-widest mb-3">ESTADO DE FLOTA</p>
            <div className="space-y-2">
              <div className="flex justify-between"><span className="text-gray-400 text-sm">GPS activo ahora</span><span className="font-radar text-green-400 font-bold">{conGPSVivo}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 text-sm">Activos sin GPS</span><span className="font-radar text-yellow-500 font-bold">{activosCount - conGPSVivo}</span></div>
              <div className="flex justify-between"><span className="text-gray-400 text-sm">Inactivos</span><span className="font-radar text-gray-600 font-bold">{choferes.length - activosCount}</span></div>
              <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
                <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${choferes.length ? (conGPSVivo / choferes.length * 100) : 0}%` }} />
              </div>
            </div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-800"><p className="font-radar text-xs text-gray-600 tracking-widest">UNIDADES ACTIVAS</p></div>
            <div className="divide-y divide-gray-800 max-h-72 overflow-y-auto">
              {choferes.filter(c => c.estado_activo).length === 0 && <div className="py-6 text-center font-radar text-xs text-gray-700">SIN UNIDADES</div>}
              {choferes.filter(c => c.estado_activo).map(chofer => {
                const tieneGPS = chofer.ultima_lat != null;
                const ultima = chofer.ultima_actualizacion ? new Date(chofer.ultima_actualizacion) : null;
                const minutos = ultima ? Math.floor((new Date() - ultima) / 60000) : null;
                const enVivo = minutos !== null && minutos < 5;
                return (
                  <div key={chofer.id} className="px-4 py-3 hover:bg-gray-800 transition">
                    <div className="flex items-center space-x-2">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${enVivo ? 'bg-green-500' : tieneGPS ? 'bg-yellow-500' : 'bg-gray-600'}`} style={enVivo ? { boxShadow: '0 0 6px #10b981' } : {}} />
                      <div className="flex-1 min-w-0">
                        <div className="text-white text-sm font-semibold truncate">{chofer.nombre_completo}</div>
                        <div className="font-radar text-xs text-gray-600">{chofer.placa_vehiculo} · {enVivo ? <span className="text-green-500">GPS vivo</span> : tieneGPS ? <span className="text-yellow-600">hace {minutos}min</span> : <span className="text-gray-700">sin GPS aún</span>}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {params && (
            <div className="bg-gray-900 border border-green-900 rounded-xl p-4">
              <p className="font-radar text-xs text-green-700 tracking-widest mb-2">PARÁMETROS ACTIVOS</p>
              <div className="space-y-1">
                {[
                  ['FH Altitud', `${params.factor_altitud}×`],
                  ['FR Tierra', `${params.factor_superficie}×`],
                  ['Cb/km', `${m} ${params.costo_base_km}`],
                  ['Cl', `${params.consumo_litros_km} L/km`],
                  ['Pc', `${m} ${params.precio_combustible_bs}/L`],
                  ['Cl×Pc/km', `${m} ${params.costo_combustible_km}`],
                  ['Ct/min', `${m} ${params.costo_minuto_detencion}`],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <span className="font-radar text-xs text-gray-600">{k}</span>
                    <span className="font-radar text-xs text-green-400">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
