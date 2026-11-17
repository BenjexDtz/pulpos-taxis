import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import Flota from '../src/vistas/Flota.jsx';
import { api, URL_API, errorHttp, respuesta } from './ayudas.jsx';

vi.mock('axios');

const CHOFERES = [
  { id: 1, nombre_completo: 'Juan Pérez', placa_vehiculo: '2456ZBK', estado_activo: true, ultima_lat: '-16.5', ultima_lng: '-68.19', ultima_actualizacion: new Date().toISOString() },
  { id: 2, nombre_completo: 'Ana Quispe', placa_vehiculo: '123ABC', estado_activo: false, ultima_lat: null },
];

const montar = (props = {}) => {
  const cargarChoferes = vi.fn();
  render(<Flota {...api()} choferes={CHOFERES} cargandoChoferes={false} cargarChoferes={cargarChoferes} {...props} />);
  return { cargarChoferes };
};

describe('Flota', () => {
  test('lista los conductores con su estado, GPS y placa por corregir', () => {
    montar();
    expect(screen.getByText('2 conductores · 1 activos')).toBeInTheDocument();
    const [, juan, ana] = screen.getAllByRole('row');
    expect(within(juan).getByText('Activo')).toBeInTheDocument();
    expect(within(juan).getByText('-16.50000, -68.19000')).toBeInTheDocument();
    expect(within(juan).getByText('hace un momento')).toBeInTheDocument();
    expect(within(ana).getByText('Inactivo')).toBeInTheDocument();
    expect(within(ana).getByText('Sin datos GPS')).toBeInTheDocument();
    expect(within(ana).getByText('Placa por corregir')).toBeInTheDocument();
  });

  test('sin conductores muestra el aviso correspondiente', () => {
    const { rerender } = render(<Flota {...api()} choferes={[]} cargandoChoferes cargarChoferes={vi.fn()} />);
    expect(screen.getByText('Cargando...')).toBeInTheDocument();
    rerender(<Flota {...api()} choferes={[]} cargandoChoferes={false} cargarChoferes={vi.fn()} />);
    expect(screen.getByText('Todavía no hay conductores.')).toBeInTheDocument();
  });

  test('el formulario rechaza un nombre con números, una placa mal formada y una contraseña con espacios', async () => {
    montar();
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Juan 2');
    await userEvent.type(screen.getByLabelText('Placa'), '12-ab9');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'con espacio');
    const alertas = screen.getAllByRole('alert').map(a => a.textContent);
    expect(alertas).toEqual(expect.arrayContaining([
      expect.stringMatching(/solo admite letras/), expect.stringMatching(/4 números y 3 letras/), expect.stringMatching(/espacios/),
    ]));
    expect(screen.getByLabelText('Placa')).toHaveValue('12AB9');
    await userEvent.click(screen.getByRole('button', { name: 'Crear credencial' }));
    expect(axios.post).not.toHaveBeenCalled();
  });

  test('registra un conductor válido, limpia el formulario y recarga la lista', async () => {
    axios.post.mockReturnValueOnce(respuesta({ mensaje: '✅ Conductor registrado.' }));
    const { cargarChoferes } = montar();
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Rosa Mamani');
    await userEvent.type(screen.getByLabelText('Placa'), '3456-xyz');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave12345');
    await userEvent.click(screen.getByRole('button', { name: 'Crear credencial' }));
    expect(axios.post).toHaveBeenCalledWith(`${URL_API}/api/admin/choferes`,
      { nombre_completo: 'Rosa Mamani', placa_vehiculo: '3456XYZ', password: 'clave12345' }, expect.anything());
    expect(await screen.findByRole('status')).toHaveTextContent('Conductor registrado.');
    expect(screen.getByLabelText('Nombre completo')).toHaveValue('');
    expect(cargarChoferes).toHaveBeenCalled();
  });

  test('si el servidor rechaza el alta muestra su mensaje', async () => {
    axios.post.mockRejectedValueOnce(errorHttp(409, 'Esa placa ya está registrada.'));
    montar();
    await userEvent.type(screen.getByLabelText('Nombre completo'), 'Rosa Mamani');
    await userEvent.type(screen.getByLabelText('Placa'), '2456ZBK');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'clave12345');
    await userEvent.click(screen.getByRole('button', { name: 'Crear credencial' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Esa placa ya está registrada.');
  });

  test('editar un conductor envía el nombre y la placa normalizada', async () => {
    axios.put.mockReturnValueOnce(respuesta({ mensaje: 'Datos actualizados.' }));
    const { cargarChoferes } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Ana Quispe' }));
    const dialogo = screen.getByRole('dialog', { name: 'Editar conductor' });
    const placa = within(dialogo).getByLabelText('Placa');
    await userEvent.clear(placa);
    await userEvent.type(placa, '1234 abc');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }));
    expect(axios.put).toHaveBeenCalledWith(`${URL_API}/api/admin/choferes/2`,
      { nombre_completo: 'Ana Quispe', placa_vehiculo: '1234ABC' }, expect.anything());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(cargarChoferes).toHaveBeenCalled();
  });

  test('un error al editar se muestra dentro del diálogo; Escape lo cierra', async () => {
    axios.put.mockRejectedValueOnce(errorHttp(400, 'Placa inválida.'));
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Editar a Juan Pérez' }));
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await within(screen.getByRole('dialog')).findByRole('alert')).toHaveTextContent('Placa inválida.');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  test('restablecer la contraseña pide al menos 8 caracteres sin espacios y cierra al terminar', async () => {
    axios.patch.mockReturnValueOnce(respuesta({ mensaje: 'Contraseña actualizada.' }));
    montar();
    await userEvent.click(screen.getByRole('button', { name: 'Restablecer contraseña de Juan Pérez' }));
    const dialogo = screen.getByRole('dialog', { name: 'Restablecer contraseña' });
    const campo = within(dialogo).getByLabelText('Nueva contraseña');
    expect(campo).toHaveAttribute('minlength', '8');
    await userEvent.type(campo, 'a b');
    expect(within(dialogo).getByRole('alert')).toHaveTextContent(/espacios/);
    await userEvent.clear(campo);
    await userEvent.type(campo, 'nueva12345');
    await userEvent.click(within(dialogo).getByRole('button', { name: 'Actualizar' }));
    expect(axios.patch).toHaveBeenCalledWith(`${URL_API}/api/admin/choferes/1/password`, { nueva_password: 'nueva12345' }, expect.anything());
    expect(await within(dialogo).findByRole('status')).toHaveTextContent('Contraseña actualizada.');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument(), { timeout: 3000 });
  });

  test('activar o desactivar cambia el estado y recarga; un error se muestra', async () => {
    axios.patch.mockReturnValueOnce(respuesta({})).mockRejectedValueOnce(errorHttp(500, 'Falló el cambio de estado.'));
    const { cargarChoferes } = montar();
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar a Juan Pérez' }));
    expect(axios.patch).toHaveBeenCalledWith(`${URL_API}/api/admin/choferes/1/estado`, { estado_activo: false }, expect.anything());
    expect(cargarChoferes).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Activar a Ana Quispe' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Falló el cambio de estado.');
  });
});
