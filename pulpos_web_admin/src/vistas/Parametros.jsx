import { useState } from 'react';
import axios from 'axios';
import { Calculator, Fuel, Gauge, MapPin, RefreshCw, Save, Settings } from 'lucide-react';
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

  const valor = (clave, porDefecto = 0) => parseFloat(formParams?.[clave] || porDefecto);
  const tarifaKm = () => (valor('costo_base_km') + valor('consumo_litros_km') * valor('precio_combustible_bs')) * valor('factor_altitud');
  const tarifaHora = () => valor('costo_minuto_detencion') * 60;
  const modoD = formParams?.modo_tarifa === 'D';
  // Directiva 2014/32/UE, Anexo IX: velocidad de cruce = tarifa por tiempo / tarifa por distancia
  const velocidadCruce = (F = 1) => {
    const v = tarifaHora() / (tarifaKm() * F);
    return Number.isFinite(v) ? formatoNumero(v, 1) : '—';
  };

  // Taxímetro sin ruta (como tarifaEstimada del servidor): 5 km sobre la velocidad de cruce y 10 min
  // detenido; en modo D también se cobran los 15 min en movimiento. B + saltos completos de S.
  const previewTarifa = (kmTierra, kmEmpedrado = 0) => {
    if (!formParams) return '0.00';
    const kmPonderados = 5 - kmTierra - kmEmpedrado + kmTierra * valor('factor_superficie', 1) + kmEmpedrado * valor('factor_empedrado', 1);
    const minutos = 10 + (modoD ? 15 : 0);
    const S = valor('valor_salto_bs');
    const exacto = kmPonderados * tarifaKm() + minutos * valor('costo_minuto_detencion');
    const saltos = S > 0 ? Math.floor(exacto / S + 1e-9) : 0;
    return (valor('bajada_bandera_bs') + saltos * S).toFixed(2);
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
            {campoParam('factor_superficie', { etiqueta: 'FR · factor tierra / barro', ayuda: 'Multiplicador para calles de tierra.', step: '0.1', min: 1, max: 5 })}
            {campoParam('factor_empedrado', { etiqueta: 'FE · factor empedrado / adoquín', ayuda: 'Multiplicador para calles empedradas.', step: '0.1', min: 1, max: 5 })}
            {campoParam('costo_minuto_detencion', { etiqueta: `Ct · costo por minuto (${m})`, ayuda: 'Cobro por espera o tráfico lento; × 60 es la tarifa por hora.', step: '0.01', min: 0.1, max: 5 })}
          </div>
          <div className="mt-5 flex items-center justify-between rounded-lg bg-gray-50 px-4 py-3 dark:bg-white/[0.03]">
            <span className="text-theme-sm text-gray-500 dark:text-gray-400">Cb + Cl × Pc · costo variable total</span>
            <span className="font-semibold text-gray-800 dark:text-white/90">{m} {previewCostoVariableKm()}/km</span>
          </div>
        </Tarjeta>

        <Tarjeta icono={Gauge} titulo="Taxímetro" subtitulo="Modo de cálculo de la Directiva 2014/32/UE (Anexo IX, taxímetros)">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {campoParam('bajada_bandera_bs', { etiqueta: `B · bajada de bandera (${m})`, ayuda: 'Importe con el que empieza todo viaje.', step: '0.10', min: 0, max: 50 })}
            {campoParam('valor_salto_bs', { etiqueta: `S · valor del salto (${m})`, ayuda: 'El importe avanza de S en S; conviene la moneda más chica de uso común.', step: '0.10', min: 0.01, max: 5 })}
            <div className="sm:col-span-2">
              <label htmlFor="param-modo_tarifa" className={etiqueta}>Modo de cálculo</label>
              <select id="param-modo_tarifa" className={campo} value={formParams.modo_tarifa ?? 'S'}
                onChange={e => setFormParams({ ...formParams, modo_tarifa: e.target.value })}>
                <option value="S">S · en cada tramo, el tiempo o la distancia (lo que sea mayor)</option>
                <option value="D">D · el tiempo y la distancia a la vez</option>
              </select>
              <p className={ayuda}>El modo S es el habitual: detenido o muy lento cobra el tiempo; en marcha, la distancia.</p>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-3 rounded-lg bg-gray-50 px-4 py-3 text-theme-sm sm:grid-cols-2 dark:bg-white/[0.03]">
            <div className="flex justify-between gap-3"><dt className="text-gray-500 dark:text-gray-400">Tkm · por km en asfalto</dt><dd className="font-semibold text-gray-800 dark:text-white/90">{m} {formatoNumero(tarifaKm(), 3)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-gray-500 dark:text-gray-400">Th · por hora</dt><dd className="font-semibold text-gray-800 dark:text-white/90">{m} {formatoNumero(tarifaHora(), 2)}</dd></div>
            <div className="flex justify-between gap-3 sm:col-span-2">
              <dt className="text-gray-500 dark:text-gray-400">Velocidad de cruce Th / (Tkm × F)</dt>
              <dd className="text-right font-semibold text-gray-800 dark:text-white/90">
                asfalto {velocidadCruce()} · tierra {velocidadCruce(valor('factor_superficie', 1))} · empedrado {velocidadCruce(valor('factor_empedrado', 1))} km/h
              </dd>
            </div>
          </dl>
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
            T = B + S × ⌊ Σ {modoD ? '(d × F × Tkm + t × Th)' : 'max(d × F × Tkm, t × Th)'} / S ⌋
          </p>
          <dl className="mt-4 space-y-1.5 text-theme-xs text-gray-500 dark:text-gray-400">
            <div><dt className="inline font-medium text-gray-700 dark:text-gray-300">Σ</dt> <dd className="inline">sobre cada tramo GPS del viaje</dd></div>
            <div><dt className="inline font-medium text-gray-700 dark:text-gray-300">d, t</dt> <dd className="inline">km y horas del tramo</dd></div>
            <div><dt className="inline font-medium text-gray-700 dark:text-gray-300">F</dt> <dd className="inline">1 en asfalto, FR en tierra, FE en empedrado; el chofer marca cada tramo en la app</dd></div>
            <div><dt className="inline font-medium text-gray-700 dark:text-gray-300">Tkm</dt> <dd className="inline">(Cb + Cl × Pc) × FH</dd></div>
            <div><dt className="inline font-medium text-gray-700 dark:text-gray-300">Th</dt> <dd className="inline">60 × Ct</dd></div>
          </dl>
        </Tarjeta>

        <Tarjeta icono={Calculator} titulo="Vista previa"
          subtitulo={`Viaje de 5 km${modoD ? ' en 15 min' : ''} con 10 min detenido; en marcha, sobre la velocidad de cruce`}>
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
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">2 km asfalto + 1 km tierra + 2 km empedrado</p>
              </div>
              <span className="text-xl font-bold text-gray-800 dark:text-white/90">{formatoMoneda(previewTarifa(1, 2), m)}</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-theme-sm font-medium text-gray-800 dark:text-white/90">Empedrado</p>
                <p className="text-theme-xs text-gray-500 dark:text-gray-400">FE = {formatoNumero(formParams.factor_empedrado || 1, 1)}</p>
              </div>
              <span className="text-xl font-bold text-gray-800 dark:text-white/90">{formatoMoneda(previewTarifa(0, 5), m)}</span>
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
