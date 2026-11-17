import { describe, test, expect, vi } from 'vitest';
import { render, screen, within, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import Central from '../src/vistas/Central.jsx';
import MapaFlota from '../src/componentes/MapaFlota.jsx';
import RutaViaje from '../src/componentes/RutaViaje.jsx';
import useLeaflet from '../src/componentes/useLeaflet.js';
import { api, URL_API, errorHttp, leafletFalso, respuesta } from './ayudas.jsx';

vi.mock('axios');

const ahora = () => new Date().toISOString();
const hace = (min) => new Date(Date.now() - min * 60000).toISOString();

const VIAJES = [
  { id: 1, chofer: 'Juan Pérez', placa_vehiculo: '2456ZBK', fecha_hora: ahora(), distancia_km: 3.5, tarifa_total: 18.5, tiempo_detencion_min: 4, tipo_superficie: 'asfalto', verificacion: 'ok' },
  { id: 2, chofer: 'Ana Quispe', placa_vehiculo: '1234ABC', fecha_hora: ahora(), distancia_km: 2, tarifa_total: 11.5, tiempo_detencion_min: 1, tipo_superficie: 'mixto', verificacion: 'diferencia', superficie_respaldo: 'dudosa' },
  { id: 3, chofer: 'Juan Pérez', placa_vehiculo: '2456ZBK', fecha_hora: ahora(), distancia_km: 9, tarifa_total: 50, tiempo_detencion_min: 0, tipo_superficie: 'tierra', verificacion: 'ok', demostracion: true },
];
const CHOFERES = [
  { id: 1, nombre_completo: 'Juan <b>Pérez</b>', placa_vehiculo: '2456ZBK', estado_activo: true, ultima_lat: '-16.5', ultima_lng: '-68.19', ultima_actualizacion: hace(1) },
  { id: 2, nombre_completo: 'Ana Quispe', placa_vehiculo: '1234ABC', estado_activo: true, ultima_lat: '-16.51', ultima_lng: '-68.2', ultima_actualizacion: hace(30) },
  { id: 3, nombre_completo: 'Sin GPS', placa_vehiculo: '9999ZZZ', estado_activo: true, ultima_lat: null, ultima_lng: null },
  { id: 4, nombre_completo: 'Inactivo', placa_vehiculo: '8888YYY', estado_activo: false, ultima_lat: '-16.5', ultima_lng: '-68.1', ultima_actualizacion: hace(1) },
];

describe('useLeaflet', () => {
  function Prueba() { return <p>{useLeaflet() ? 'listo' : 'cargando'}</p>; }

  test('agrega el script de Leaflet una sola vez y avisa cuando cargó', () => {
    render(<><Prueba /><Prueba /></>);
    expect(screen.getAllByText('cargando')).toHaveLength(2);
    const scripts = document.querySelectorAll('script[data-leaflet]');
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toContain('leaflet@1.9.4');
    act(() => { scripts[0].onload(); scripts[0].dispatchEvent(new Event('load')); });
    expect(screen.getAllByText('listo')).toHaveLength(2);
    scripts[0].remove();
  });

  test('si Leaflet ya está cargado no agrega nada', () => {
    leafletFalso();
    render(<Prueba />);
    expect(screen.getByText('listo')).toBeInTheDocument();
    expect(document.querySelector('script[data-leaflet]')).toBeNull();
  });
});

describe('MapaFlota', () => {
  test('dibuja solo a los choferes activos con GPS, con color según la antigüedad', () => {
    const r = leafletFalso();
    render(<MapaFlota choferes={CHOFERES} viajes={VIAJES.slice(0, 2)} empresa={{ ciudad: 'El Alto', altitud_msnm: 4050, moneda_simbolo: 'Bs', centro_lat: '-16.5', centro_lng: '-68.2' }} />);
    expect(r.tiles[0]).toBe('https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    expect(r.mapas[0].setView).toHaveBeenCalledWith([-16.5, -68.2], 14);
    expect(r.marcadores.map(m => m.pos)).toEqual([[-16.5, -68.19], [-16.51, -68.2]]);
    expect(r.marcadores[0].icon.html).toContain('#10b981');
    expect(r.marcadores[1].icon.html).toContain('#f59e0b');
    expect(screen.getByText(/El Alto · 4.?050 msnm/)).toBeInTheDocument();
  });

  test('el popup escapa el nombre y resume los viajes del chofer', () => {
    const r = leafletFalso();
    render(<MapaFlota choferes={CHOFERES.slice(1, 2)} viajes={VIAJES} empresa={{ moneda_simbolo: 'Bs' }} />);
    expect(r.popups[0]).toContain('Viajes hoy: <b>1</b>');
    expect(r.popups[0]).toContain('Bs 11.50');
    const conHtml = leafletFalso();
    render(<MapaFlota choferes={CHOFERES.slice(0, 1)} viajes={[]} empresa={null} />);
    expect(conHtml.popups[0]).toContain('Juan &lt;b&gt;Pérez&lt;/b&gt;');
  });

  test('sin Leaflet muestra que el mapa está cargando', () => {
    render(<MapaFlota choferes={[]} viajes={[]} empresa={null} />);
    expect(screen.getByText('Cargando el mapa...')).toBeInTheDocument();
    document.querySelectorAll('script[data-leaflet]').forEach(s => s.remove());
  });
});

describe('Central', () => {
  test('las cifras del día excluyen los viajes de demostración, que sí se listan', async () => {
    leafletFalso();
    axios.get.mockReturnValue(respuesta(VIAJES));
    const cargarChoferes = vi.fn();
    render(<Central {...api()} choferes={CHOFERES} empresa={{ moneda_simbolo: 'Bs' }} cargarChoferes={cargarChoferes} />);
    expect(await screen.findByText('2 viajes · 1 demo')).toBeInTheDocument();
    const visor = screen.getByRole('region', { name: /^Hoy/ });
    expect(within(visor).getByText('Bs 30,00')).toBeInTheDocument();
    expect(within(visor).getByText('1 con diferencia')).toBeInTheDocument();
    expect(within(visor).getByText('5 min de espera')).toBeInTheDocument();
    expect(within(visor).getByText('3 activas · 4 registradas')).toBeInTheDocument();
    expect(screen.getByText('Demo')).toBeInTheDocument();
    expect(screen.getByText('Superficie dudosa')).toBeInTheDocument();
    expect(cargarChoferes).toHaveBeenCalled();
    expect(axios.get.mock.calls[0][0]).toMatch(new RegExp(`^${URL_API}/api/admin/viajes\\?desde=\\d{4}-\\d{2}-\\d{2}&hasta=`));
  });

  test('sin viajes lo indica y un error del servidor se muestra', async () => {
    leafletFalso();
    axios.get.mockRejectedValueOnce(errorHttp(500, 'Base caída'));
    render(<Central {...api()} choferes={[]} empresa={null} cargarChoferes={vi.fn()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Base caída');
    expect(screen.getByText(/Todavía no llegó ningún viaje/)).toBeInTheDocument();
  });

  test('al hacer clic en un viaje abre su ruta', async () => {
    leafletFalso();
    axios.get.mockImplementation((url) => respuesta(url.includes('/ruta')
      ? { viaje: { ...VIAJES[0], tarifa_calculada: 18.5 }, puntos: [] } : VIAJES));
    render(<Central {...api()} choferes={[]} empresa={{ moneda_simbolo: 'Bs' }} cargarChoferes={vi.fn()} />);
    await userEvent.click(await screen.findByText('Ana Quispe'));
    expect(await screen.findByRole('dialog', { name: 'Ruta del viaje #2' })).toBeInTheDocument();
  });
});

describe('RutaViaje', () => {
  const PUNTOS = [
    { lat: -16.5, lng: -68.19, superficie: 'asfalto', vibracion: 1 },
    { lat: -16.501, lng: -68.19, superficie: 'asfalto', vibracion: 1.2 },
    { lat: -16.502, lng: -68.19, superficie: 'tierra', vibracion: 3 },
    { lat: -16.503, lng: -68.19, superficie: 'tierra', vibracion: null },
  ];
  const VIAJE = {
    chofer: 'Ana Quispe', placa_vehiculo: '1234ABC', fecha_hora: ahora(), distancia_km: 0.33, km_asfalto: 0.22, km_tierra: 0.11,
    distancia_ruta_km: 0.333, tarifa_total: 5, tarifa_calculada: 4.5, verificacion: 'diferencia', verificacion_detalle: 'la tarifa no coincide',
    superficie_respaldo: 'respaldada', vibracion_referencia: 1, vibracion_irregular: 3,
  };

  test('muestra la verificación, las distancias y dibuja tramos por superficie', async () => {
    const r = leafletFalso();
    axios.get.mockReturnValueOnce(respuesta({ viaje: VIAJE, puntos: PUNTOS }));
    render(<RutaViaje id={7} {...api()} moneda="Bs" color="#123456" onCerrar={vi.fn()} />);
    expect(await screen.findByText('Diferencia')).toBeInTheDocument();
    expect(screen.getByText('Detalle: la tarifa no coincide.')).toBeInTheDocument();
    expect(screen.getByText('0,333 km')).toBeInTheDocument();
    expect(screen.getByText('Bs 4,50')).toBeInTheDocument();
    expect(screen.getByText(/Asfalto 1,00 m\/s² · tierra\/empedrado 3,00 m\/s²/)).toBeInTheDocument();
    await waitFor(() => expect(r.lineas.map(l => l.color)).toEqual(['#123456', '#f79009']));
    expect(r.lineas[1].coords).toHaveLength(3);
    expect(r.circulos).toHaveLength(2);
    expect(screen.getByText('4 puntos GPS')).toBeInTheDocument();
  });

  test('puede colorear la ruta por la vibración medida', async () => {
    const r = leafletFalso();
    axios.get.mockReturnValueOnce(respuesta({ viaje: VIAJE, puntos: PUNTOS }));
    render(<RutaViaje id={7} {...api()} moneda="Bs" color="#123456" onCerrar={vi.fn()} />);
    await userEvent.click(await screen.findByRole('button', { name: 'Vibración medida' }));
    const ultimas = r.lineas.slice(-3).map(l => l.color);
    expect(ultimas).toEqual(['#12b76a', '#f04438', '#98a2b3']);
    expect(screen.getByText('Sin lectura (detenido)')).toBeInTheDocument();
  });

  test('sin ruta lo explica, un error se muestra y Cerrar avisa', async () => {
    leafletFalso();
    const onCerrar = vi.fn();
    axios.get.mockReturnValueOnce(respuesta({ viaje: { ...VIAJE, verificacion: 'sin_ruta', superficie_respaldo: null, demostracion: true }, puntos: [] }));
    const { unmount } = render(<RutaViaje id={7} {...api()} moneda="Bs" color="#123" onCerrar={onCerrar} />);
    expect(await screen.findByText(/no tiene ruta registrada/)).toBeInTheDocument();
    expect(screen.getByText('Demostración · ruta simulada')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCerrar).toHaveBeenCalled();
    unmount();
    axios.get.mockRejectedValueOnce(errorHttp(404, 'Viaje no encontrado.'));
    render(<RutaViaje id={8} {...api()} moneda="Bs" color="#123" onCerrar={onCerrar} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Viaje no encontrado.');
  });
});
