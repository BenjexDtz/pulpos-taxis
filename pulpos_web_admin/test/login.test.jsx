import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import Login from '../src/componentes/Login.jsx';
import SegundoFactor from '../src/componentes/SegundoFactor.jsx';
import CodigosRespaldo from '../src/componentes/CodigosRespaldo.jsx';
import { ConTema, URL_API, errorHttp, respuesta } from './ayudas.jsx';

vi.mock('axios');

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: vi.fn(() => Promise.resolve()) }, configurable: true });
});

const ingresar = async (correo = 'admin@pulpos.bo', clave = 'password') => {
  await userEvent.type(screen.getByLabelText(/Correo/), correo);
  await userEvent.type(screen.getByLabelText(/Contraseña/), clave);
  await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
};

describe('Login', () => {
  test('envía las credenciales y pasa al segundo factor', async () => {
    axios.post.mockReturnValueOnce(respuesta({ mfa: 'verificar', token_mfa: 'tm' }));
    render(<ConTema><Login urlServidor={URL_API} onSesion={vi.fn()} /></ConTema>);
    await ingresar();
    expect(axios.post).toHaveBeenCalledWith(`${URL_API}/api/admin/login`, { usuario: 'admin@pulpos.bo', password: 'password' });
    expect(await screen.findByRole('heading', { name: 'Verificación en dos pasos' })).toBeInTheDocument();
  });

  test('muestra el error del servidor y deja reintentar', async () => {
    axios.post.mockRejectedValueOnce(errorHttp(401, '❌ Credenciales incorrectas.'));
    render(<ConTema><Login urlServidor={URL_API} onSesion={vi.fn()} /></ConTema>);
    await ingresar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales incorrectas.');
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
  });

  test('sin conexión avisa con un mensaje propio', async () => {
    axios.post.mockRejectedValueOnce(new Error('Network Error'));
    render(<ConTema><Login urlServidor={URL_API} onSesion={vi.fn()} /></ConTema>);
    await ingresar();
    expect(await screen.findByRole('alert')).toHaveTextContent('Error conectando al servidor.');
  });

  test('el ojo muestra y oculta la contraseña, y el botón cambia el tema', async () => {
    const alternar = vi.fn();
    render(<ConTema alternar={alternar}><Login urlServidor={URL_API} onSesion={vi.fn()} /></ConTema>);
    const clave = screen.getByLabelText(/Contraseña/);
    expect(clave).toHaveAttribute('type', 'password');
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar contraseña' }));
    expect(clave).toHaveAttribute('type', 'text');
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a modo claro' }));
    expect(alternar).toHaveBeenCalled();
  });
});

describe('SegundoFactor', () => {
  test('verificar: envía el código y entra con el token', async () => {
    const onSesion = vi.fn();
    axios.post.mockReturnValueOnce(respuesta({ token: 'jwt' }));
    render(<SegundoFactor urlServidor={URL_API} pendiente={{ etapa: 'verificar', token_mfa: 'tm' }} cuenta="a@b.bo" onSesion={onSesion} onCancelar={vi.fn()} />);
    await userEvent.type(screen.getByLabelText('Código de la app'), '123456');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(axios.post).toHaveBeenCalledWith(`${URL_API}/api/admin/mfa/verificar`, { codigo: '123456' }, { headers: { Authorization: 'Bearer tm' } });
    expect(onSesion).toHaveBeenCalledWith('jwt', '');
  });

  test('con código de respaldo avisa cuántos quedan', async () => {
    const onSesion = vi.fn();
    axios.post.mockReturnValueOnce(respuesta({ token: 'jwt', respaldo_restantes: 4 }));
    render(<SegundoFactor urlServidor={URL_API} pendiente={{ etapa: 'verificar', token_mfa: 'tm' }} onSesion={onSesion} onCancelar={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Usar un código de respaldo' }));
    const campo = screen.getByLabelText('Código de respaldo');
    expect(campo).toHaveAttribute('maxlength', '9');
    await userEvent.type(campo, 'ABCD-EFGH');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(onSesion).toHaveBeenCalledWith('jwt', 'Entraste con un código de respaldo. Te quedan 4.');
  });

  test('un código incorrecto muestra el error y vacía el campo', async () => {
    axios.post.mockRejectedValueOnce(errorHttp(401, '❌ Código incorrecto.'));
    render(<SegundoFactor urlServidor={URL_API} pendiente={{ etapa: 'verificar', token_mfa: 'tm' }} onSesion={vi.fn()} onCancelar={vi.fn()} />);
    const campo = screen.getByLabelText('Código de la app');
    await userEvent.type(campo, '000000');
    await userEvent.click(screen.getByRole('button', { name: 'Verificar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Código incorrecto.');
    expect(campo).toHaveValue('');
  });

  test('configurar: muestra el QR y la clave, activa y entrega los códigos de respaldo', async () => {
    const onSesion = vi.fn();
    axios.post
      .mockReturnValueOnce(respuesta({ qr: 'data:image/png;base64,AAA', secreto: 'ABCDEFGHIJKLMNOP' }))
      .mockReturnValueOnce(respuesta({ token: 'jwt', codigos_respaldo: ['AAAA-1111', 'BBBB-2222'] }));
    render(<SegundoFactor urlServidor={URL_API} pendiente={{ etapa: 'configurar', token_mfa: 'tm' }} cuenta="a@b.bo" onSesion={onSesion} onCancelar={vi.fn()} />);
    expect(await screen.findByAltText('Código QR para la app autenticadora')).toHaveAttribute('src', 'data:image/png;base64,AAA');
    expect(screen.getByText('ABCD EFGH IJKL MNOP')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('ABCDEFGHIJKLMNOP');
    expect(await screen.findByRole('button', { name: 'Copiada' })).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Código de la app'), '654321');
    await userEvent.click(screen.getByRole('button', { name: 'Activar y entrar' }));
    expect(axios.post).toHaveBeenLastCalledWith(`${URL_API}/api/admin/mfa/activar`, { codigo: '654321' }, expect.anything());
    expect(await screen.findByText('AAAA-1111')).toBeInTheDocument();
    expect(onSesion).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Ya los guardé · Entrar' }));
    expect(onSesion).toHaveBeenCalledWith('jwt', '');
  });

  test('si falla la configuración lo informa y "Volver" cancela', async () => {
    const onCancelar = vi.fn();
    axios.post.mockRejectedValueOnce(errorHttp(401, 'Token vencido'));
    render(<SegundoFactor urlServidor={URL_API} pendiente={{ etapa: 'configurar', token_mfa: 'tm' }} onSesion={vi.fn()} onCancelar={onCancelar} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Token vencido');
    expect(screen.getByRole('button', { name: 'Activar y entrar' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Volver' }));
    expect(onCancelar).toHaveBeenCalled();
  });
});

describe('CodigosRespaldo', () => {
  test('copia y descarga los códigos con la cuenta', async () => {
    const crear = vi.fn(() => 'blob:x');
    URL.createObjectURL = crear;
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<CodigosRespaldo codigos={['AAAA-1111', 'BBBB-2222']} cuenta="a@b.bo" />);
    await userEvent.click(screen.getByRole('button', { name: 'Copiar' }));
    expect(navigator.clipboard.writeText.mock.calls[0][0]).toMatch(/a@b\.bo[\s\S]*AAAA-1111\nBBBB-2222/);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copiados' })).toBeInTheDocument());
    await userEvent.click(screen.getByRole('button', { name: 'Descargar .txt' }));
    expect(crear).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalled();
  });
});
