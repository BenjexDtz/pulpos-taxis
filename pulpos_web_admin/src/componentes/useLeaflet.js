import { useEffect, useState } from 'react';

// Leaflet se carga en runtime desde unpkg: solo baja con las vistas que muestran mapas
export default function useLeaflet() {
  const [ready, setReady] = useState(() => Boolean(window.L));
  useEffect(() => {
    if (window.L) return;
    const existente = document.querySelector('script[data-leaflet]');
    if (existente) {
      existente.addEventListener('load', () => setReady(true));
      return;
    }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.dataset.leaflet = '';
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);
  return ready;
}
