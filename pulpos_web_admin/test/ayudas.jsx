import { vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { TemaContexto } from '../src/contexto/contextos.js';

export const URL_API = 'http://api.prueba';
export const headers = () => ({ Authorization: 'Bearer t' });

// Igual que manejarErrorApi de App: muestra el texto del servidor
export const manejarErrorApi = vi.fn((err, mostrar) => mostrar(err.response?.data?.error || '⚠️ Error conectando al servidor.'));

export const api = () => ({ urlServidor: URL_API, headers, manejarErrorApi });

export const errorHttp = (status, error) => Object.assign(new Error(error), { response: { status, data: { error } } });

export const respuesta = (data) => Promise.resolve({ data });

export function ConTema({ tema = 'dark', alternar = () => {}, ruta = '/', children }) {
  return (
    <MemoryRouter initialEntries={[ruta]}>
      <TemaContexto.Provider value={{ tema, alternar }}>{children}</TemaContexto.Provider>
    </MemoryRouter>
  );
}

// Leaflet falso: registra lo que se dibuja para poder comprobarlo
export function leafletFalso() {
  const registro = { mapas: [], marcadores: [], lineas: [], circulos: [], popups: [], tiles: [] };
  const capa = (tipo, datos) => {
    const c = { ...datos, addTo: () => c, bindPopup: (html) => { registro.popups.push(html); return c; }, bindTooltip: () => c };
    registro[tipo].push(c);
    return c;
  };
  window.L = {
    map: () => {
      const m = { setView: vi.fn(), removeLayer: vi.fn(), remove: vi.fn(), fitBounds: vi.fn() };
      registro.mapas.push(m);
      return m;
    },
    control: { zoom: () => ({ addTo: () => {} }) },
    tileLayer: (url) => { registro.tiles.push(url); return { addTo: () => {} }; },
    divIcon: (o) => o,
    marker: (pos, o) => capa('marcadores', { pos, ...o }),
    polyline: (coords, o) => capa('lineas', { coords, ...o }),
    circleMarker: (pos, o) => capa('circulos', { pos, ...o }),
    latLngBounds: (p) => p,
  };
  return registro;
}
