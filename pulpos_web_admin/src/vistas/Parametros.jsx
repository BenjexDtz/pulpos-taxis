import { useState } from 'react';
import axios from 'axios';
import { Fuel, MapPin, RefreshCw, Save, Settings } from 'lucide-react';

export default function Parametros({ params, setParams, formParams, setFormParams, empresa, urlServidor, headers }) {
  const [guardandoParams, setGuardandoParams] = useState(false);
  const [mensajeParams, setMensajeParams] = useState({ tipo: '', texto: '' });
  const m = empresa?.moneda_simbolo ?? 'Bs';

const guardarParametros = async (e) => {
  e.preventDefault(); setGuardandoParams(true); setMensajeParams({ tipo: '', texto: '' });
  try {
    const res = await axios.put(`${urlServidor}/api/admin/parametros`, formParams, { headers: headers() });
    setMensajeParams({ tipo: 'exito', texto: res.data.mensaje });
    setParams(res.data.parametros);
    setTimeout(() => setMensajeParams({ tipo: '', texto: '' }), 5000);
  } catch (err) {
    setMensajeParams({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar.' });
  } finally { setGuardandoParams(false); }
};

// T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td
const previewTarifa = (fr) => {
  if (!formParams) return '0.00';
  const Cb = parseFloat(formParams.costo_base_km || 0);
  const Cl = parseFloat(formParams.consumo_litros_km || 0);
  const Pc = parseFloat(formParams.precio_combustible_bs || 0);
  const FH = parseFloat(formParams.factor_altitud || 0);
  const Ct = parseFloat(formParams.costo_minuto_detencion || 0);
  return (5 * (Cb + Cl * Pc) * FH * fr + 10 * Ct).toFixed(2);
};

const previewCostoCombustibleKm = () => {
  if (!formParams) return '0.000';
  const Cl = parseFloat(formParams.consumo_litros_km || 0);
  const Pc = parseFloat(formParams.precio_combustible_bs || 0);
  return (Cl * Pc).toFixed(3);
};

const previewCostoVariableKm = () => {
  if (!formParams) return '0.000';
  const Cb = parseFloat(formParams.costo_base_km || 0);
  const Cl = parseFloat(formParams.consumo_litros_km || 0);
  const Pc = parseFloat(formParams.precio_combustible_bs || 0);
  return (Cb + Cl * Pc).toFixed(3);
};

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="font-bold text-white text-2xl tracking-wider flex items-center space-x-2">
          <Settings className="w-6 h-6 text-yellow-400" />
          <span>PARÁMETROS TOPOGRÁFICOS</span>
        </h2>
        <p className="font-radar text-xs text-gray-600 mt-1">
          Los conductores descargan estos valores automáticamente al abrir la app.
        </p>
        {/* Fórmula completa como referencia */}
        <div className="mt-3 bg-gray-900 border border-gray-800 rounded-xl px-4 py-3 font-radar text-xs">
          <span className="text-gray-600">FÓRMULA ACTIVA: </span>
          <span className="text-yellow-400">T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td</span>
        </div>
      </div>

      {!formParams ? (
        <div className="text-center py-10 text-gray-700 font-radar text-sm">Cargando parámetros...</div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800">
            <p className="font-radar text-xs text-gray-600 tracking-widest">
              ZONA: <span className="text-yellow-400">{params?.zona_ciudad}</span>
            </p>
          </div>
          <div className="p-6">
            {mensajeParams.texto && (
              <div className={`mb-6 p-4 rounded-xl font-radar text-sm border ${mensajeParams.tipo === 'exito' ? 'bg-green-950 text-green-400 border-green-800' : 'bg-red-950 text-red-400 border-red-800'}`}>
                {mensajeParams.texto}
              </div>
            )}
            <form onSubmit={guardarParametros} className="space-y-5">

              {/* Zona */}
              <div>
                <label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">ZONA / DESCRIPCIÓN</label>
                <input type="text" required
                  className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition"
                  value={formParams.zona_ciudad}
                  onChange={e => setFormParams({ ...formParams, zona_ciudad: e.target.value })} />
              </div>

              {/* ── SECCIÓN COMBUSTIBLE (Cl y Pc) — NUEVA ── */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <Fuel className="w-4 h-4 text-orange-400" />
                  <span className="font-radar text-xs text-orange-400 tracking-widest">COMPONENTE COMBUSTIBLE</span>
                </div>
                <div className="grid grid-cols-2 gap-5 bg-gray-800 border border-gray-700 rounded-xl p-4">
                  <div>
                    <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">
                      Cl — CONSUMO DEL VEHÍCULO (L/km)
                    </label>
                    <p className="font-radar text-xs text-gray-700 mb-2">
                      Litros que gasta el taxi por kilómetro
                    </p>
                    <input type="number" step="0.001" min="0.05" max="0.5" required
                      className="w-full bg-gray-900 border border-gray-600 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-orange-500 transition"
                      value={formParams.consumo_litros_km}
                      onChange={e => setFormParams({ ...formParams, consumo_litros_km: e.target.value })} />
                    <p className="font-radar text-xs text-gray-700 mt-1">
                      Ej: 0.100 = 10L/100km
                    </p>
                  </div>
                  <div>
                    <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">
                      Pc — PRECIO COMBUSTIBLE ({m}/litro)
                    </label>
                    <p className="font-radar text-xs text-gray-700 mb-2">
                      Precio actual sin subvención gubernamental
                    </p>
                    <input type="number" step="0.01" min="1" max="30" required
                      className="w-full bg-gray-900 border border-gray-600 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-orange-500 transition"
                      value={formParams.precio_combustible_bs}
                      onChange={e => setFormParams({ ...formParams, precio_combustible_bs: e.target.value })} />
                    <p className="font-radar text-xs text-gray-700 mt-1">
                      Precio vigente del litro en tu ciudad
                    </p>
                  </div>
                  {/* Resultado calculado en tiempo real */}
                  <div className="col-span-2 bg-gray-900 border border-orange-900 rounded-lg px-4 py-2 flex items-center justify-between">
                    <span className="font-radar text-xs text-gray-600">Cl × Pc = costo gasolina/km</span>
                    <span className="font-radar text-sm text-orange-400 font-bold">
                      {m} {previewCostoCombustibleKm()}/km
                    </span>
                  </div>
                </div>
              </div>

              {/* ── SECCIÓN TOPOGRÁFICA (Cb, FH, FR, Ct) ── */}
              <div>
                <div className="flex items-center space-x-2 mb-3">
                  <MapPin className="w-4 h-4 text-yellow-400" />
                  <span className="font-radar text-xs text-yellow-400 tracking-widest">FACTORES TOPOGRÁFICOS Y ECONÓMICOS</span>
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <div>
                    <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">
                      Cb — COSTO BASE / KM ({m})
                    </label>
                    <p className="font-radar text-xs text-gray-700 mb-2">
                      Ganancia del conductor + depreciación
                    </p>
                    <input type="number" step="0.01" min="0.5" max="10" required
                      className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition"
                      value={formParams.costo_base_km}
                      onChange={e => setFormParams({ ...formParams, costo_base_km: e.target.value })} />
                  </div>
                  <div>
                    <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">
                      FH — FACTOR ALTITUD
                    </label>
                    <p className="font-radar text-xs text-gray-700 mb-2">
                      Penalización por la altitud{empresa?.altitud_msnm ? ` (${empresa.altitud_msnm.toLocaleString('es-BO')} msnm)` : ''}
                    </p>
                    <input type="number" step="0.01" min="1" max="3" required
                      className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition"
                      value={formParams.factor_altitud}
                      onChange={e => setFormParams({ ...formParams, factor_altitud: e.target.value })} />
                  </div>
                  <div>
                    <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">
                      FR — FACTOR TIERRA / BARRO
                    </label>
                    <p className="font-radar text-xs text-gray-700 mb-2">
                      Multiplicador para rutas en tierra
                    </p>
                    <input type="number" step="0.1" min="1" max="5" required
                      className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition"
                      value={formParams.factor_superficie}
                      onChange={e => setFormParams({ ...formParams, factor_superficie: e.target.value })} />
                  </div>
                  <div>
                    <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">
                      Ct — COSTO / MIN DETENCIÓN ({m})
                    </label>
                    <p className="font-radar text-xs text-gray-700 mb-2">
                      Cobro por tiempo en espera o tráfico
                    </p>
                    <input type="number" step="0.01" min="0.1" max="5" required
                      className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition"
                      value={formParams.costo_minuto_detencion}
                      onChange={e => setFormParams({ ...formParams, costo_minuto_detencion: e.target.value })} />
                  </div>

                  {/* Costo variable total por km */}
                  <div className="col-span-2 bg-gray-900 border border-yellow-900 rounded-lg px-4 py-2 flex items-center justify-between">
                    <span className="font-radar text-xs text-gray-600">Cb + Cl×Pc = costo variable total/km</span>
                    <span className="font-radar text-sm text-yellow-400 font-bold">
                      {m} {previewCostoVariableKm()}/km
                    </span>
                  </div>
                </div>
              </div>

              {/* ── PREVIEW DE TARIFA ── */}
              {/* T = D × (Cb + Cl × Pc) × FH × FR + Ct × Td */}
              <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 font-radar text-xs space-y-3">
                <p className="text-gray-500 tracking-widest">
                  PREVIEW — 5 km · 10 min espera · con parámetros actuales:
                </p>

                {/* Asfalto FR=1.0 */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-gray-600">5 × (Cb+Cl×Pc) × FH × </span>
                    <span className="text-green-500">1.0</span>
                    <span className="text-gray-600"> + 10×Ct</span>
                  </div>
                  <div className="text-right">
                    <span className="text-green-400 text-base font-bold">{m} {previewTarifa(1.0)}</span>
                    <span className="text-gray-600 text-xs ml-2">asfalto</span>
                  </div>
                </div>

                {/* Tierra FR variable */}
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-gray-600">5 × (Cb+Cl×Pc) × FH × </span>
                    <span className="text-orange-500">{parseFloat(formParams.factor_superficie || 1).toFixed(1)}</span>
                    <span className="text-gray-600"> + 10×Ct</span>
                  </div>
                  <div className="text-right">
                    <span className="text-orange-400 text-base font-bold">
                      {m} {previewTarifa(parseFloat(formParams.factor_superficie || 1))}
                    </span>
                    <span className="text-gray-600 text-xs ml-2">tierra/complejo</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <button type="submit" disabled={guardandoParams}
                  className="flex items-center space-x-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition tracking-wider text-sm">
                  {guardandoParams ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  <span>{guardandoParams ? 'GUARDANDO...' : 'GUARDAR PARÁMETROS'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
