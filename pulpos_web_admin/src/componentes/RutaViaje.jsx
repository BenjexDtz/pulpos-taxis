import { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { RefreshCw, X } from 'lucide-react';
import Insignia from './ui/Insignia.jsx';
import Mensaje from './Mensaje.jsx';
import useLeaflet from './useLeaflet.js';
import { botonIcono, tarjeta } from './ui/estilos.js';
import {
  COLOR_SIN_VIBRACION, colorSuperficie, desgloseKm, formatoMoneda, formatoNumero, NIVELES_VIBRACION,
  RESPALDO_SUPERFICIE, SUPERFICIES, VERIFICACION,
} from '../utilidades.js';

// Puntos seguidos del mismo color forman una sola línea; cada tramo toma el color del punto final
const tramos = (puntos, colorDe) => {
  const lista = [];
  for (let i = 1; i < puntos.length; i++) {
    const { lat, lng } = puntos[i];
    const color = colorDe(puntos[i]);
    const ultimo = lista.at(-1);
    if (ultimo?.color === color) ultimo.coords.push([lat, lng]);
    else lista.push({ color, coords: [[puntos[i - 1].lat, puntos[i - 1].lng], [lat, lng]] });
  }
  return lista;
};

const colorVibracion = (vibracion, referencia) => vibracion == null || !referencia
  ? COLOR_SIN_VIBRACION
  : NIVELES_VIBRACION.find(n => vibracion / referencia < n.hasta).color;

function Dato({ etiqueta, valor, detalle }) {
  return (
    <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">
      <p className="text-theme-xs text-gray-500 dark:text-gray-400">{etiqueta}</p>
      <p className="font-semibold text-gray-800 dark:text-white/90">{valor}</p>
      {detalle && <p className="text-theme-xs text-gray-500 dark:text-gray-400">{detalle}</p>}
    </div>
  );
}

function Leyenda({ elementos }) {
  return elementos.map(([texto, color]) => (
    <span key={texto} className="flex items-center gap-2">
      <span className="h-1.5 w-5 rounded" style={{ background: color }} />{texto}
    </span>
  ));
}

export default function RutaViaje({ id, urlServidor, headers, manejarErrorApi, moneda, color, onCerrar }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState('');
  const [verVibracion, setVerVibracion] = useState(false);
  const mapRef = useRef(null);
  const leafletReady = useLeaflet();

  useEffect(() => {
    let vigente = true;
    axios.get(`${urlServidor}/api/admin/viajes/${id}/ruta`, { headers: headers() })
      .then(r => { if (vigente) setDatos(r.data); })
      .catch(err => { if (vigente) manejarErrorApi(err, setError); });
    return () => { vigente = false; };
  }, [id, urlServidor, headers, manejarErrorApi]);

  useEffect(() => {
    if (!leafletReady || !mapRef.current || !datos?.puntos.length) return;
    const L = window.L;
    const mapa = L.map(mapRef.current);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);
    const referencia = Number(datos.viaje.vibracion_referencia);
    const colorDe = verVibracion
      ? (p) => colorVibracion(p.vibracion, referencia)
      : (p) => colorSuperficie(p.superficie, color);
    for (const t of tramos(datos.puntos, colorDe))
      L.polyline(t.coords, { color: t.color, weight: 5, opacity: 0.9 }).addTo(mapa);
    const inicio = datos.puntos[0];
    const fin = datos.puntos.at(-1);
    L.circleMarker([inicio.lat, inicio.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#16a34a', fillOpacity: 1 })
      .addTo(mapa).bindTooltip('Inicio');
    L.circleMarker([fin.lat, fin.lng], { radius: 7, color: '#fff', weight: 2, fillColor: '#dc2626', fillOpacity: 1 })
      .addTo(mapa).bindTooltip('Fin');
    mapa.fitBounds(L.latLngBounds(datos.puntos.map(p => [p.lat, p.lng])), { padding: [24, 24], maxZoom: 17 });
    return () => mapa.remove();
  }, [leafletReady, datos, color, verVibracion]);

  const v = datos?.viaje;
  const estado = VERIFICACION[v?.verificacion] ?? VERIFICACION.sin_verificar;
  const respaldo = RESPALDO_SUPERFICIE[v?.superficie_respaldo];
  const hayVibracion = v?.vibracion_referencia != null && datos.puntos.some(p => p.vibracion != null);

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="titulo-ruta"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/50 p-4 backdrop-blur-[2px]" onClick={onCerrar}>
      <div className={`${tarjeta} max-h-[92vh] w-full max-w-3xl overflow-y-auto bg-white p-6 shadow-theme-xl dark:bg-gray-900`} onClick={e => e.stopPropagation()}>
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h3 id="titulo-ruta" className="text-lg font-semibold text-gray-800 dark:text-white/90">Ruta del viaje #{id}</h3>
            {v && (
              <p className="text-theme-sm text-gray-500 dark:text-gray-400">
                {v.chofer} · {v.placa_vehiculo} · {new Date(v.fecha_hora).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' })}
              </p>
            )}
          </div>
          <button aria-label="Cerrar" onClick={onCerrar} className={botonIcono}><X className="h-4 w-4" /></button>
        </div>

        <Mensaje texto={error} className="mb-4" />
        {!datos && !error && (
          <div className="flex items-center gap-3 py-16 text-gray-500 dark:text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin" /><span className="text-sm">Cargando la ruta...</span>
          </div>
        )}

        {v && (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Insignia color={estado.color}>{estado.texto}</Insignia>
              <span className="text-theme-sm text-gray-500 dark:text-gray-400">{estado.ayuda}</span>
            </div>
            {v.verificacion === 'diferencia' && v.verificacion_detalle && (
              <Mensaje tipo="aviso" texto={`Detalle: ${v.verificacion_detalle}.`} className="mb-4" />
            )}
            <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Dato etiqueta="Distancia cobrada" valor={`${formatoNumero(v.distancia_km, 3)} km`}
                detalle={desgloseKm(v)} />
              <Dato etiqueta="Medida por el servidor" valor={v.distancia_ruta_km != null ? `${formatoNumero(v.distancia_ruta_km, 3)} km` : '—'}
                detalle="Haversine sobre la ruta GPS" />
              <Dato etiqueta="Tarifa cobrada" valor={formatoMoneda(v.tarifa_total, moneda)} />
              <Dato etiqueta="Tarifa según la fórmula" valor={v.tarifa_calculada != null ? formatoMoneda(v.tarifa_calculada, moneda) : '—'}
                detalle="Con los parámetros aplicados" />
            </div>
            {respaldo && (
              <div className="mb-4 flex flex-wrap items-center gap-3">
                <Insignia color={respaldo.color}>{respaldo.texto}</Insignia>
                <span className="text-theme-sm text-gray-500 dark:text-gray-400">
                  {respaldo.ayuda}
                  {v.vibracion_irregular != null && v.vibracion_referencia != null &&
                    ` Asfalto ${formatoNumero(v.vibracion_referencia, 2)} m/s² · tierra/empedrado ${formatoNumero(v.vibracion_irregular, 2)} m/s².`}
                </span>
              </div>
            )}
            {datos.puntos.length > 0 ? (
              <>
                {hayVibracion && (
                  <div className="mb-3 inline-flex rounded-lg bg-gray-100 p-0.5 text-theme-xs dark:bg-gray-800" role="group" aria-label="Colorear la ruta por">
                    {[[false, 'Superficie marcada'], [true, 'Vibración medida']].map(([valor, texto]) => (
                      <button key={texto} type="button" onClick={() => setVerVibracion(valor)} aria-pressed={verVibracion === valor}
                        className={`rounded-md px-3 py-1.5 font-medium ${verVibracion === valor
                          ? 'bg-white text-gray-800 shadow-theme-xs dark:bg-gray-900 dark:text-white'
                          : 'text-gray-500 dark:text-gray-400'}`}>
                        {texto}
                      </button>
                    ))}
                  </div>
                )}
                <div ref={mapRef} className="h-80 w-full overflow-hidden rounded-xl" />
                <div className="mt-3 flex flex-wrap gap-4 text-theme-xs text-gray-600 dark:text-gray-400">
                  <Leyenda elementos={verVibracion
                    ? [...NIVELES_VIBRACION.map(n => [n.texto, n.color]), ['Sin lectura (detenido)', COLOR_SIN_VIBRACION]]
                    : Object.entries(SUPERFICIES).map(([tipo, { nombre }]) => [nombre, colorSuperficie(tipo, color)])} />
                  <span>{datos.puntos.length} puntos GPS</span>
                </div>
              </>
            ) : (
              <p className="rounded-lg bg-gray-50 px-4 py-8 text-center text-sm text-gray-500 dark:bg-white/[0.03] dark:text-gray-400">
                Este viaje no tiene ruta registrada: se sincronizó desde una versión anterior de la app.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
