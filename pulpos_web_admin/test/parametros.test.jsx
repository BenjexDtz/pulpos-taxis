import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import axios from 'axios';
import Parametros from '../src/vistas/Parametros.jsx';
import { api, URL_API, errorHttp, respuesta } from './ayudas.jsx';

vi.mock('axios');

const BASE = {
  zona_ciudad: 'El Alto', costo_base_km: '2', consumo_litros_km: '0.1', precio_combustible_bs: '6.96',
  factor_superficie: '1.5', factor_empedrado: '1.2', costo_minuto_detencion: '0.5',
  bajada_bandera_bs: '2', valor_salto_bs: '0.5', modo_tarifa: 'S',
};

function Vista({ inicial = BASE, setParams = vi.fn() }) {
  const [form, setForm] = useState(inicial);
  return <Parametros {...api()} formParams={form} setFormParams={setForm} setParams={setParams} empresa={{ moneda_simbolo: 'Bs' }} />;
}

describe('Parámetros', () => {
  test('sin parámetros todavía muestra que está cargando', () => {
    render(<Parametros {...api()} formParams={null} setFormParams={vi.fn()} setParams={vi.fn()} />);
    expect(screen.getByText('Cargando parámetros...')).toBeInTheDocument();
  });

  test('calcula Cl × Pc, el costo por km, la tarifa por hora y la velocidad de cruce', () => {
    render(<Vista />);
    expect(screen.getByText('Bs 0.696/km')).toBeInTheDocument();
    expect(screen.getByText('Bs 2.696/km')).toBeInTheDocument();
    expect(screen.getByText('Bs 2,696')).toBeInTheDocument();
    expect(screen.getByText('Bs 30,00')).toBeInTheDocument();
    expect(screen.getByText(/asfalto 11,1 · tierra 7,4 · empedrado 9,3 km\/h/)).toBeInTheDocument();
  });

  test('la vista previa aplica B + saltos completos de S, y el modo D suma el tiempo en marcha', async () => {
    render(<Vista />);
    // asfalto: 5 × 2,696 + 10 × 0,5 = 18,48 → 36 saltos de 0,50 = 18,00 + B 2 = 20,00
    expect(screen.getByText('Bs 20,00')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Modo de cálculo'), 'D');
    // + 15 min × 0,5 = 25,98 → 51 saltos = 25,50 + 2 = 27,50
    expect(screen.getByText('Bs 27,50')).toBeInTheDocument();
    expect(screen.getByText(/max|d × F × Tkm \+ t × Th/)).toHaveTextContent('(d × F × Tkm + t × Th)');
  });

  test('editar un campo recalcula la vista previa al instante', async () => {
    render(<Vista />);
    const cb = screen.getByLabelText('Cb · costo base por km (Bs)');
    await userEvent.clear(cb);
    await userEvent.type(cb, '3');
    expect(screen.getByText('Bs 3.696/km')).toBeInTheDocument();
  });

  test('una zona con símbolos no permitidos se marca como inválida', async () => {
    render(<Vista />);
    const zona = screen.getByLabelText('Zona / descripción');
    await userEvent.clear(zona);
    await userEvent.type(zona, 'Zona#1');
    expect(screen.getByRole('alert')).toHaveTextContent(/zona solo admite/);
    expect(zona.validationMessage).not.toBe('');
  });

  test('guardar envía los parámetros y actualiza los vigentes', async () => {
    const setParams = vi.fn();
    axios.put.mockReturnValueOnce(respuesta({ mensaje: '✅ Parámetros guardados.', parametros: { id: 9 } }));
    render(<Vista setParams={setParams} />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar parámetros' }));
    expect(axios.put).toHaveBeenCalledWith(`${URL_API}/api/admin/parametros`, BASE, expect.anything());
    expect(await screen.findByRole('status')).toHaveTextContent('Parámetros guardados.');
    expect(setParams).toHaveBeenCalledWith({ id: 9 });
  });

  test('si el servidor rechaza los valores muestra su mensaje', async () => {
    axios.put.mockRejectedValueOnce(errorHttp(400, 'El salto debe estar entre 0,01 y 5.'));
    render(<Vista />);
    await userEvent.click(screen.getByRole('button', { name: 'Guardar parámetros' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('El salto debe estar entre 0,01 y 5.');
  });
});
