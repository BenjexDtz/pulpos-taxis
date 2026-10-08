import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';
import { escaparHtml, haceTiempo } from '../utilidades.js';

// ─── LEAFLET ──────────────────────────────────────────────────────────────────
function useLeaflet() {
  const [ready, setReady] = useState(() => Boolean(window.L));
  useEffect(() => {
    if (window.L) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);
  return ready;
}

export default function MapaFlota({ choferes, viajes, empresa }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const leafletReady = useLeaflet();

  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstanceRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: false });
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
      className: 'mapa-oscuro',
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [leafletReady]);

  const centroLat = Number(empresa?.centro_lat ?? -16.5);
  const centroLng = Number(empresa?.centro_lng ?? -68.19);
  useEffect(() => {
    if (leafletReady && mapInstanceRef.current) mapInstanceRef.current.setView([centroLat, centroLng], 14);
  }, [leafletReady, centroLat, centroLng]);

  useEffect(() => {
    if (!leafletReady || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    choferes
      .filter(c => c.estado_activo && c.ultima_lat != null && c.ultima_lng != null)
      .forEach(chofer => {
        const pos = [parseFloat(chofer.ultima_lat), parseFloat(chofer.ultima_lng)];
        const trips = viajes.filter(v => v.chofer === chofer.nombre_completo).length;
        const total = viajes.filter(v => v.chofer === chofer.nombre_completo)
          .reduce((s, v) => s + parseFloat(v.tarifa_total || 0), 0);
        const ultima = chofer.ultima_actualizacion ? new Date(chofer.ultima_actualizacion) : null;
        const minutos = ultima ? Math.floor((new Date() - ultima) / 60000) : null;
        const enVivo = minutos !== null && minutos < 5;
        const color = enVivo ? '#10b981' : '#f59e0b';

        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${color};border:2px solid ${enVivo ? '#34d399' : '#fcd34d'};border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px ${color}60;cursor:pointer;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>`,
          iconSize: [30, 30], iconAnchor: [15, 15]
        });

        const marker = L.marker(pos, { icon }).addTo(map).bindPopup(`
          <div style="font-family:monospace;min-width:200px;font-size:12px;">
            <div style="font-weight:bold;color:${color};margin-bottom:4px;">${escaparHtml(chofer.nombre_completo)}</div>
            <div style="color:#888;">🚗 ${escaparHtml(chofer.placa_vehiculo)}</div>
            <hr style="border-color:#eee;margin:6px 0;"/>
            <div>Viajes: <b>${trips}</b></div>
            <div>Recaudado: <b style="color:#16a34a;">${escaparHtml(empresa?.moneda_simbolo ?? 'Bs')} ${total.toFixed(2)}</b></div>
            ${minutos !== null ? `<div style="color:${enVivo ? '#16a34a' : '#d97706'};margin-top:4px;">⏱ ${haceTiempo(minutos)}</div>` : ''}
            <div style="color:#999;font-size:10px;margin-top:4px;">📍 ${parseFloat(chofer.ultima_lat).toFixed(5)}, ${parseFloat(chofer.ultima_lng).toFixed(5)}</div>
          </div>
        `);
        markersRef.current.push(marker);
      });
  }, [leafletReady, choferes, viajes, empresa]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      {!leafletReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center gap-3 text-gray-500 dark:text-gray-400">
            <RefreshCw className="h-5 w-5 animate-spin" />
            <span className="text-sm">Cargando el mapa...</span>
          </div>
        </div>
      )}
      <div className="absolute top-3 left-3 z-[1000] space-y-1.5 rounded-xl border border-gray-200 bg-white/95 px-3 py-2.5 text-theme-xs shadow-theme-sm dark:border-gray-800 dark:bg-gray-900/95">
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <span className="h-3 w-3 rounded-full bg-success-500" />GPS activo (últimos 5 min)
        </div>
        <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
          <span className="h-3 w-3 rounded-full bg-warning-500" />Sin actualizar (+5 min)
        </div>
        {empresa && <div className="pt-0.5 text-gray-500 dark:text-gray-400">{empresa.ciudad}{empresa.altitud_msnm ? ` · ${empresa.altitud_msnm.toLocaleString('es-BO')} msnm` : ''}</div>}
      </div>
    </div>
  );
}
