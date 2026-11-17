import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import Empresa from '../src/vistas/Empresa.jsx';
import Seguridad from '../src/vistas/Seguridad.jsx';
import Asistente from '../src/componentes/Asistente.jsx';
import { api, URL_API, errorHttp, respuesta } from './ayudas.jsx';

vi.mock('axios');

describe('Empresa', () => {
  test('muestra los datos de la empresa y un guion en los vacíos', () => {
    render(<Empresa empresa={{
      nombre: 'Radio Taxi Pulpos', codigo: 'pulpos', nit: '123456', telefono: null, email: 'a@b.bo', direccion: '',
      ciudad: 'El Alto', pais: 'Bolivia', radio_operacion_km: '25.0', altitud_msnm: 4050, zona_horaria: 'America/La_Paz',
      moneda_codigo: 'BOB', moneda_simbolo: 'Bs',
    }} />);
    expect(screen.getByRole('heading', { name: 'Radio Taxi Pulpos' })).toBeInTheDocument();
    expect(screen.getByText('pulpos')).toBeInTheDocument();
    expect(screen.getByText('El Alto, Bolivia')).toBeInTheDocument();
    expect(screen.getByText('25 km')).toBeInTheDocument();
    expect(screen.getByText('4050 msnm')).toBeInTheDocument();
    expect(screen.getByText('BOB (Bs)')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
  });

  test('mientras no llegan los datos muestra que está cargando', () => {
    render(<Empresa empresa={null} />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
  });
});

describe('Seguridad', () => {
  test('muestra el estado del segundo factor y avisa si quedan pocos códigos', async () => {
    axios.get.mockReturnValue(respuesta({ mfa_activo: true, mfa_activado_en: '2026-11-01T12:00:00Z', respaldo_restantes: 2 }));
    render(<Seguridad {...api()} cuenta="admin@pulpos.bo" />);
    expect(await screen.findByText('Activo · TOTP')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Quedan pocos: genera nuevos')).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith(`${URL_API}/api/admin/mfa`, expect.anything());
  });

  test('regenera los códigos con el código de la app y los muestra una sola vez', async () => {
    axios.get.mockReturnValue(respuesta({ mfa_activo: true, respaldo_restantes: 10 }));
    axios.post.mockReturnValueOnce(respuesta({ mensaje: 'Códigos regenerados.', codigos_respaldo: ['ZZZZ-9999'] }));
    render(<Seguridad {...api()} cuenta="admin@pulpos.bo" />);
    await userEvent.type(screen.getByLabelText('Código de la app'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Regenerar códigos' }));
    expect(axios.post).toHaveBeenCalledWith(`${URL_API}/api/admin/mfa/respaldo`, { codigo: '123456' }, expect.anything());
    expect(await screen.findByText('ZZZZ-9999')).toBeInTheDocument();
    expect(screen.getByText(/Los códigos anteriores ya no sirven/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Listo' }));
    expect(screen.queryByText('ZZZZ-9999')).not.toBeInTheDocument();
  });

  test('un código incorrecto muestra el error', async () => {
    axios.get.mockReturnValue(respuesta({ mfa_activo: false }));
    axios.post.mockRejectedValueOnce(errorHttp(401, 'Código incorrecto.'));
    render(<Seguridad {...api()} />);
    expect(await screen.findByText('Inactivo')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Código de la app'), '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Regenerar códigos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código incorrecto.');
  });
});

describe('Asistente', () => {
  test('se abre, responde una sugerencia y envía el historial', async () => {
    axios.post.mockReturnValueOnce(respuesta({ respuesta: 'Esta semana: Bs 1.250,00.' }));
    render(<Asistente {...api()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    await userEvent.click(screen.getByRole('button', { name: '¿Cuánto se recaudó esta semana?' }));
    expect(await screen.findByText('Esta semana: Bs 1.250,00.')).toBeInTheDocument();
    expect(axios.post).toHaveBeenCalledWith(`${URL_API}/api/admin/asistente`,
      { mensajes: [{ rol: 'usuario', texto: '¿Cuánto se recaudó esta semana?' }] }, expect.anything());
  });

  test('no envía preguntas vacías y al fallar devuelve la pregunta al campo', async () => {
    axios.post.mockRejectedValueOnce(errorHttp(503, 'Se alcanzó el límite gratuito del modelo.'));
    render(<Asistente {...api()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    expect(screen.getByRole('button', { name: 'Enviar' })).toBeDisabled();
    await userEvent.type(screen.getByLabelText('Pregunta'), '¿Quién lidera?{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Se alcanzó el límite gratuito del modelo.');
    expect(screen.getByLabelText('Pregunta')).toHaveValue('¿Quién lidera?');
  });

  test('"Nueva conversación" limpia y el botón de cierre lo esconde', async () => {
    axios.post.mockReturnValueOnce(respuesta({ respuesta: 'Hola' }));
    render(<Asistente {...api()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Abrir asistente' }));
    await userEvent.type(screen.getByLabelText('Pregunta'), 'hola{Enter}');
    await screen.findByText('Hola');
    await userEvent.click(screen.getByRole('button', { name: 'Nueva conversación' }));
    expect(screen.queryByText('Hola')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar asistente' }));
    expect(screen.getByRole('button', { name: 'Abrir asistente' })).toBeInTheDocument();
  });
});
