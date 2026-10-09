import { useState } from 'react';
import axios from 'axios';
import { Calculator, Fuel, MapPin, RefreshCw, Save, Settings } from 'lucide-react';
import Mensaje from '../componentes/Mensaje.jsx';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';
import { ayuda, botonPrimario, campo, etiqueta } from '../componentes/ui/estilos.js';
import { formatoMoneda, formatoNumero } from '../utilidades.js';

export default function Parametros({ setParams, formParams, setFormParams, empresa, urlServidor, headers }) {
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

  // T = (Da + Dt × FR) × (Cb + Cl × Pc) × FH + Ct × Td, con un viaje de 5 km y 10 min de espera
  const previewTarifa = (kmTierra) => {
    if (!formParams) return '0.00';
    const Cb = parseFloat(formParams.costo_base_km || 0);
    const Cl = parseFloat(formParams.consumo_litros_km || 0);
    const Pc = parseFloat(formParams.precio_combustible_bs || 0);
    const FH = parseFloat(formParams.factor_altitud || 0);
    const FR = parseFloat(formParams.factor_superficie || 1);
    const Ct = parseFloat(formParams.costo_minuto_detencion || 0);
    return ((5 - kmTierra + kmTierra * FR) * (Cb + Cl * Pc) * FH + 10 * Ct).toFixed(2);
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

  const campoParam = (clave, { etiqueta: texto, ayuda: textoAyuda, step, min, max }) => (
    <div>
      <label htmlFor={`param-${clave}`} className={etiqueta}>{texto}</label>
      <input id={`param-${clave}`} type="number" step={step} min={min} max={max} required className={campo}
        value={formParams[clave]} onChange={e => setFormParams({ ...formParams, [clave]: e.target.value })} />
      <p className={ayuda}>{textoAyuda} <span className="whitespace-nowrap">(entre {min} y {max})</span></p>
    </div>
  );

  if (!formParams) return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Cargando parámetros...</p>;

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <form onSubmit={guardarParametros} className="space-y-6 xl:col-span-2">
        <Mensaje tipo={mensajeParams.tipo} texto={mensajeParams.texto} />

        <Tarjeta icono={MapPin} titulo="Zona" subtitulo="Los conductores descargan estos valores al abrir la app.">
          <label htmlFor="param-zona" className={etiqueta}>Zona / descripción</label>
          <input id="param-zona" type="text" required maxLength={100} className={campo}
            value={formParams.zona_ciudad} onChange={e => setFormParams({ ...formParams, zona_ciudad: e.target.value })} />
        </Tarjeta>

        <Tarjeta icono={Fuel} titulo="Componente combustible" subtitulo="Cl × Pc: lo que cuesta la gasolina por kilómetro">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {campoParam('consumo_litros_km', { etiqueta: 'Cl · consumo del vehículo (L/km)', ayuda: '0,100 = 10 L cada 100 km.', step: '0.001', min: 0.05, max: 0.5 })}
            {campoParam('precio_combustible_bs', { etiqueta: `Pc · precio del combustible (${m}/L)`, ayuda: 'Precio vigente del litro.', step: '0.01', min: 1, max: 30 })}
          </div>
          <div className="mt-5 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">Cl × Pc</span>
            <span className="font-semibold text-gray-800 dark:text-white/90">{m} {previewCostoCombustibleKm()}/km</span>
          </div>
        </Tarjeta>

        <Tarjeta icono={Settings} titulo="Factores topográficos y económicos">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {campoParam('costo_base_km', { etiqueta: `Cb · costo base por km (${m})`, ayuda: 'Ganancia del conductor + depreciación.', step: '0.01', min: 0.5, max: 10 })}
            {campoParam('factor_altitud', {
              etiqueta: 'FH · factor de altitud',
              ayuda: `Penalización por la altitud${empresa?.altitud_msnm ? ` (${empresa.altitud_msnm.toLocaleString('es-BO')} msnm)` : ''}.`,
              step: '0.01', min: 1, max: 3,
            })}
            {campoParam('factor_superficie', { etiqueta: 'FR · factor tierra / barro', ayuda: 'Multiplicador para rutas sin asfalto.', step: '0.1', min: 1, max: 5 })}
            {campoParam('costo_minuto_detencion', { etiqueta: `Ct · costo por minuto de espera (${m})`, ayuda: 'Cobro por espera o tráfico.', step: '0.01', min: 0.1, max: 5 })}
          </div>
          <div className="mt-5 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">Cb + Cl × Pc · costo variable total</span>
            <span className="font-semibold text-gray-800 dark:text-white/90">{m} {previewCostoVariableKm()}/km</span>
          </div>
        </Tarjeta>

        <div className="flex justify-end">
          <button type="submit" disabled={guardandoParams} className={botonPrimario}>
            {guardandoParams ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {guardandoParams ? 'Guardando...' : 'Guardar parámetros'}
          </button>
        </div>
      </form>

      <div className="space-y-6 xl:sticky xl:top-28 xl:self-start">
        <Tarjeta icono={Calculator} titulo="Fórmula tarifaria">
          <p className="rounded-lg bg-brand-50 px-4 py-3 text-center font-mono text-theme-sm font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            T = (Da + Dt × FR) × (Cb + Cl × Pc) × FH + Ct × Td
          </p>
          <dl className="mt-4 space-y-1.5 text-theme-xs text-gray-500 dark:text-gray-400">
            <div><dt className="inline font-medium text-gray-700 dark:text-gray-300">Da</dt> <dd className="inline">km recorridos en asfalto</dd></div>
            <div><dt className="inline font-medium text-gray-700 dark:text-gray-300">Dt</dt> <dd className="inline">km recorridos en tierra; el chofer marca cada tramo en la app</dd></div>
            <div><dt className="inline font-medium text-gray-700 dark:text-gray-300">Td</dt> <dd className="inline">minutos detenido o en tráfico</dd></div>
          </dl>
        </Tarjeta>

        <Tarjeta icono={Calculator} titulo="Vista previa" subtitulo="Viaje de 5 km con 10 min de espera">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">Asfalto</p>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">FR = 1,0</p>
              </div>
              <span className="text-xl font-bold text-gray-800 dark:text-white/90">{formatoMoneda(previewTarifa(0), m)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">Mixto</p>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">3 km asfalto + 2 km tierra</p>
              </div>
              <span className="text-xl font-bold text-gray-800 dark:text-white/90">{formatoMoneda(previewTarifa(2), m)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">Tierra / barro</p>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">FR = {formatoNumero(formParams.factor_superficie || 1, 1)}</p>
              </div>
              <span className="text-xl font-bold text-warning-600 dark:text-orange-400">{formatoMoneda(previewTarifa(5), m)}</span>
            </div>
            <p className="border-t border-gray-100 pt-3 text-theme-xs text-gray-500 dark:border-gray-800 dark:text-gray-400">
              Se recalcula mientras editas; los choferes la reciben al guardar.
            </p>
          </div>
        </Tarjeta>
      </div>
    </div>
  );
}
