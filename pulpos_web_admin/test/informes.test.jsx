import { describe, test, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import axios from 'axios';
import Informes from '../src/vistas/Informes.jsx';
import GraficoRecaudacion from '../src/componentes/tablero/GraficoRecaudacion.jsx';
import GraficoSuperficie from '../src/componentes/tablero/GraficoSuperficie.jsx';
import RankingChoferes from '../src/componentes/tablero/RankingChoferes.jsx';
import MapaCalorHoras from '../src/componentes/tablero/MapaCalorHoras.jsx';
import ComparacionTradicional from '../src/componentes/tablero/ComparacionTradicional.jsx';
import { fechaLocal } from '../src/utilidades.js';
import { api, URL_API, errorHttp, leafletFalso, respuesta } from './ayudas.jsx';

vi.mock('axios');

const ESTADISTICAS = {
  resumen: { recaudado: 300, viajes: 20, km: 80, espera_min: 45 },
  anterior: { recaudado: 200, viajes: 25, km: 80, espera_min: 0 },
  por_dia: [{ dia: '2026-11-16', viajes: 8, recaudado: 120, km: 30 }, { dia: '2026-11-17', viajes: 12, recaudado: 180, km: 50 }],
  superficie: [{ tipo: 'asfalto', km: 60, viajes: 15, recorrido: 150 }, { tipo: 'tierra', km: 20, viajes: 5, recorrido: 50 }],
  choferes: [{ id: 1, nombre: 'Juan Pérez', placa: '2456ZBK', viajes: 12, km: 50, recaudado: 180 }, { id: 2, nombre: 'Ana Quispe', placa: '1234ABC', viajes: 8, km: 30, recaudado: 90 }],
  horas: [{ dia_semana: 1, hora: 8, viajes: 5 }, { dia_semana: 5, hora: 19, viajes: 9 }],
  comparacion: [],
};
const VIAJES = [
  { id: 1, chofer: 'Juan Pérez', placa_vehiculo: '2456ZBK', distancia_km: 3.5, tiempo_detencion_min: 4.7, tipo_superficie: 'asfalto', tarifa_total: 18.5, verificacion: 'ok', fecha_hora: '2026-11-17T12:00:00' },
  { id: 2, chofer: 'Ana Quispe', placa_vehiculo: '1234ABC', distancia_km: 2, km_asfalto: 1.5, km_tierra: 0.5, tiempo_detencion_min: 1, tipo_superficie: 'mixto', tarifa_total: 11.5, verificacion: 'diferencia', superficie_respaldo: 'dudosa', fecha_hora: '2026-11-17T13:00:00' },
  { id: 3, chofer: 'Juan Pérez', placa_vehiculo: '2456ZBK', distancia_km: 1, tiempo_detencion_min: 0, tipo_superficie: 'tierra', tarifa_total: 7, verificacion: 'ok', demostracion: true, fecha_hora: '2026-11-17T14:00:00' },
];
const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fechaLocal(d); };

function Vista({ viajes = VIAJES, cargarReporte = vi.fn(), errorDashboard = null }) {
  const [desde, setDesde] = useState(haceDias(29));
  const [hasta, setHasta] = useState(haceDias(0));
  return (
    <Informes {...api()} viajes={viajes} empresa={{ moneda_simbolo: 'Bs', codigo: 'pulpos', color_primario: '#123456' }}
      params={{ factor_superficie: 1.5, factor_empedrado: 1.2 }} cargando={false} errorDashboard={errorDashboard} cargarReporte={cargarReporte}
      fechaDesde={desde} setFechaDesde={setDesde} fechaHasta={hasta} setFechaHasta={setHasta} />
  );
}

describe('Informes', () => {
  test('pide las estadísticas del período y muestra las cifras con su variación', async () => {
    axios.get.mockReturnValue(respuesta(ESTADISTICAS));
    const cargarReporte = vi.fn();
    render(<Vista cargarReporte={cargarReporte} />);
    const visor = await screen.findByRole('region', { name: /^Período/ });
    await waitFor(() => expect(within(visor).getByText('Bs 300,00')).toBeInTheDocument());
    expect(within(visor).getByText(/▲ 50.0%/)).toBeInTheDocument();
    expect(within(visor).getByText(/▼ 20.0%/)).toBeInTheDocument();
    expect(within(visor).getByText('antes Bs 200,00')).toBeInTheDocument();
    expect(within(visor).getByText('promedio Bs 15,00')).toBeInTheDocument();
    expect(axios.get.mock.calls[0][0]).toBe(`${URL_API}/api/admin/estadisticas?desde=${haceDias(29)}&hasta=${haceDias(0)}`);
    expect(cargarReporte).toHaveBeenCalled();
    expect(screen.getByRole('button', { name: '30 días' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('elegir otro período vuelve a pedir las estadísticas', async () => {
    axios.get.mockReturnValue(respuesta(ESTADISTICAS));
    render(<Vista />);
    await userEvent.click(screen.getByRole('button', { name: '7 días' }));
    await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
      `${URL_API}/api/admin/estadisticas?desde=${haceDias(6)}&hasta=${haceDias(0)}`, expect.anything()));
    expect(screen.getByRole('button', { name: '7 días' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('el historial se filtra por conductor o placa y por diferencias', async () => {
    axios.get.mockReturnValue(respuesta(ESTADISTICAS));
    render(<Vista />);
    expect(screen.getByText('3 de 3 viajes del período')).toBeInTheDocument();
    expect(screen.getByText('1,50 asfalto · 0,50 tierra')).toBeInTheDocument();
    expect(screen.getByText('4 min')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Buscar conductor o placa'), '1234-abc');
    expect(screen.getByText('1 de 3 viajes del período')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Buscar conductor o placa'));
    await userEvent.click(screen.getByLabelText(/Solo con diferencia \(1\)/));
    expect(screen.getByText('1 de 3 viajes del período')).toBeInTheDocument();
    expect(screen.getAllByText('Superficie dudosa').length).toBeGreaterThan(0);
  });

  test('exporta el CSV con el nombre de la empresa y muestra el error si falla', async () => {
    axios.get.mockReturnValue(respuesta(ESTADISTICAS));
    URL.createObjectURL = vi.fn(() => 'blob:csv');
    URL.revokeObjectURL = vi.fn();
    let descargado;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { descargado = this.download; });
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce({ ok: true, blob: () => Promise.resolve(new Blob(['a,b'])) })
      .mockResolvedValueOnce({ ok: false, json: () => Promise.resolve({ error: 'Sin datos.' }) });
    render(<Vista />);
    await userEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await waitFor(() => expect(descargado).toBe(`pulpos_viajes_${fechaLocal()}.csv`));
    expect(fetch.mock.calls[0][0]).toMatch(/\/api\/admin\/viajes\/exportar\?desde=/);
    await userEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sin datos.');
  });

  test('un error de estadísticas se muestra y sin viajes lo indica', async () => {
    axios.get.mockRejectedValue(errorHttp(500, 'No se pudieron calcular.'));
    render(<Vista viajes={[]} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron calcular.');
    expect(screen.getByText('Sin viajes en el período.', { selector: 'td' })).toBeInTheDocument();
  });

  test('el botón del mapa abre la ruta del viaje', async () => {
    leafletFalso();
    axios.get.mockImplementation((url) => respuesta(url.includes('/ruta') ? { viaje: VIAJES[0], puntos: [] } : ESTADISTICAS));
    render(<Vista />);
    await userEvent.click(screen.getByRole('button', { name: 'Ver ruta del viaje 1' }));
    expect(await screen.findByRole('dialog', { name: 'Ruta del viaje #1' })).toBeInTheDocument();
  });
});

describe('Tablero', () => {
  test('ranking: ordena por recaudación con barras proporcionales', () => {
    render(<RankingChoferes choferes={ESTADISTICAS.choferes} moneda="Bs" />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('1Juan Pérez2456ZBK · 12 viajes · 50.0 kmBs 180,00');
    expect(items[1].querySelector('[style]').style.width).toBe('50%');
  });

  test('ranking vacío', () => {
    render(<RankingChoferes choferes={[]} moneda="Bs" />);
    expect(screen.getByText('Sin viajes en el período.')).toBeInTheDocument();
  });

  test('horas pico: señala la franja de mayor demanda y colorea sus celdas', () => {
    render(<MapaCalorHoras horas={ESTADISTICAS.horas} />);
    expect(screen.getByText('viernes de 19:00 a 20:00')).toBeInTheDocument();
    expect(screen.getByTitle('viernes 19:00 · 9 viajes').getAttribute('style')).toContain('100%');
    expect(screen.getByTitle('lunes 08:00 · 5 viajes').getAttribute('style')).toMatch(/var\(--marca\) 62%/);
    expect(screen.getByTitle('martes 08:00 · 0 viajes')).not.toHaveAttribute('style');
  });

  test('horas pico sin viajes', () => {
    render(<MapaCalorHoras horas={[]} />);
    expect(screen.getByText('Sin viajes en el período.')).toBeInTheDocument();
  });

  test('superficies: total de km y parte del cobro por recorrido', () => {
    render(<GraficoSuperficie datos={ESTADISTICAS.superficie} color="#123" moneda="Bs" factorTierra={1.5} factorEmpedrado={1.2} />);
    expect(screen.getByText('80,0')).toBeInTheDocument();
    expect(screen.getByText('75%')).toBeInTheDocument();
    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(screen.getByText(/× FR = 1.50/)).toHaveTextContent('× FE = 1.20');
  });

  test('superficies sin km', () => {
    render(<GraficoSuperficie datos={[]} color="#123" moneda="Bs" />);
    expect(screen.getByText('Sin viajes en el período.')).toBeInTheDocument();
  });

  test('recaudación: se renderiza por día y agrupa por mes en rangos largos', () => {
    const { container, rerender } = render(<GraficoRecaudacion datos={ESTADISTICAS.por_dia} color="#123" moneda="Bs" />);
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
    const largo = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(2026, 6, 1 + i);
      return { dia: fechaLocal(d), viajes: 1, recaudado: 10, km: 2 };
    });
    rerender(<GraficoRecaudacion datos={largo} color="#123" moneda="Bs" />);
    expect(container.querySelector('.recharts-responsive-container')).toBeInTheDocument();
  });

  test('comparación con la negociación de palabra', () => {
    const datos = [
      { tipo: 'total', viajes: 10, sistema: 15, tradicional: 14, diferencia_pct: 7.1, diferencia_abs_pct: 12.3, sistema_menor: 4 },
      { tipo: 'asfalto', viajes: 6, sistema: 14, tradicional: 13, diferencia_pct: 7.7 },
      { tipo: 'mixto', viajes: 4, sistema: 17, tradicional: 18, diferencia_pct: -5.6 },
    ];
    render(<ComparacionTradicional datos={datos} moneda="Bs" />);
    expect(screen.getByText('+7,1 %')).toBeInTheDocument();
    expect(screen.getByText('40 %')).toBeInTheDocument();
    expect(screen.getByText('4 de 10 viajes')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Mixto' })).toBeInTheDocument();
    expect(screen.getByText('-5,6 %')).toBeInTheDocument();
  });

  test('comparación sin datos explica de dónde salen', () => {
    render(<ComparacionTradicional datos={[]} moneda="Bs" />);
    expect(screen.getByText(/Aún no hay viajes con el monto sin taxímetro/)).toBeInTheDocument();
  });
});
