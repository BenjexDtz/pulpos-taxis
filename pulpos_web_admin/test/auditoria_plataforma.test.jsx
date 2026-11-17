import { describe, test, expect, vi } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axios from 'axios';
import Auditoria from '../src/vistas/Auditoria.jsx';
import Plataforma from '../src/vistas/Plataforma.jsx';
import FormEmpresa from '../src/componentes/FormEmpresa.jsx';
import { api, URL_API, errorHttp, respuesta } from './ayudas.jsx';

vi.mock('axios');

const EVENTOS = [
  {
    id: 41, ocurrido_en: '2026-11-17T12:00:00Z', empresa_id: 1, actor_tipo: 'admin', actor_rol: 'gerente', actor_nombre: 'Gerencia Pulpos',
    accion: 'parametros.actualizar', entidad: 'parametros_topograficos', entidad_id: '3', resultado: 'exito', ip: '200.1.1.1', hash: 'abc123',
    datos_antes: { valor_salto_bs: 0.1, zona_ciudad: 'El Alto', activo: true }, datos_despues: { valor_salto_bs: 0.5, zona_ciudad: 'El Alto', activo: false },
  },
  { id: 40, ocurrido_en: '2026-11-17T11:00:00Z', empresa_id: null, actor_tipo: 'anonimo', accion: 'sesion.login_admin', resultado: 'rechazado', detalle: 'Credenciales incorrectas', hash: 'def' },
  { id: 39, ocurrido_en: '2026-11-17T10:00:00Z', empresa_id: 2, actor_tipo: 'chofer', accion: 'viaje.sincronizar', resultado: 'exito', datos_despues: { id_servidor: 9 }, hash: 'ghi' },
];

describe('Auditoría', () => {
  test('lista los eventos con nombres legibles y el resultado', async () => {
    axios.get.mockReturnValue(respuesta(EVENTOS));
    render(<Auditoria {...api()} />);
    expect(await screen.findByText('Parámetros tarifarios')).toBeInTheDocument();
    expect(screen.getByText('Inicio de sesión (panel)')).toBeInTheDocument();
    expect(screen.getByText('Rechazado')).toBeInTheDocument();
    expect(screen.getByText('Admin · gerente')).toBeInTheDocument();
    expect(axios.get).toHaveBeenCalledWith(`${URL_API}/api/admin/auditoria?pagina=1`, expect.anything());
    expect(screen.getByRole('button', { name: /Siguiente/ })).toBeDisabled();
  });

  test('al abrir un evento muestra solo los campos que cambiaron', async () => {
    axios.get.mockReturnValue(respuesta(EVENTOS));
    render(<Auditoria {...api()} />);
    await userEvent.click(await screen.findByText('Parámetros tarifarios'));
    const fila = screen.getByText('Salto (S)').closest('div');
    expect(within(fila).getByText('0.1')).toBeInTheDocument();
    expect(within(fila).getByText('0.5')).toBeInTheDocument();
    expect(screen.getByText('Activa').closest('div')).toHaveTextContent('ActivaSíNo');
    expect(screen.queryByText('Zona')).not.toBeInTheDocument();
    expect(screen.getByText(/SHA-256: abc123/)).toBeInTheDocument();
    await userEvent.click(screen.getByText('Viaje sincronizado'));
    expect(screen.queryByText('Salto (S)')).not.toBeInTheDocument();
    expect(screen.getByText('Después')).toBeInTheDocument();
  });

  test('buscar envía los filtros elegidos', async () => {
    axios.get.mockReturnValue(respuesta([]));
    render(<Auditoria {...api()} />);
    expect(await screen.findByText('Sin eventos.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Tipo de acción'), 'chofer.');
    await userEvent.type(screen.getByLabelText('Desde'), '2026-11-01');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(
      `${URL_API}/api/admin/auditoria?desde=2026-11-01&accion=chofer.&pagina=1`, expect.anything()));
  });

  test('con 100 eventos permite pasar de página', async () => {
    const pagina = Array.from({ length: 100 }, (_, i) => ({ ...EVENTOS[1], id: 200 - i }));
    axios.get.mockReturnValue(respuesta(pagina));
    render(<Auditoria {...api()} />);
    await userEvent.click(await screen.findByRole('button', { name: /Siguiente/ }));
    await waitFor(() => expect(axios.get).toHaveBeenLastCalledWith(`${URL_API}/api/admin/auditoria?pagina=2`, expect.anything()));
    expect(await screen.findByText('Página 2')).toBeInTheDocument();
  });

  test('plataforma: filtra por empresa y verifica la integridad', async () => {
    axios.get.mockImplementation((url) => {
      if (url.endsWith('/empresas')) return respuesta([{ id: 1, nombre: 'Pulpos' }, { id: 2, nombre: 'Illimani' }]);
      if (url.endsWith('/verificar')) return respuesta({ integra: false, primer_evento_invalido: 17, anclas: { total: 2, faltantes: [50], alteradas: [] } });
      return respuesta(EVENTOS);
    });
    render(<Auditoria {...api()} plataforma />);
    expect(await screen.findByRole('option', { name: 'Illimani' })).toBeInTheDocument();
    expect(await screen.findByRole('cell', { name: 'Pulpos' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Plataforma' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Verificar integridad' }));
    expect(await screen.findByText(/desde el evento #17/)).toHaveTextContent('faltan eventos anclados: 50');
  });

  test('plataforma: una bitácora íntegra se informa como tal', async () => {
    axios.get.mockImplementation((url) => respuesta(url.endsWith('/verificar')
      ? { integra: true, total_eventos: 110, anclas: { total: 1, faltantes: [], alteradas: [] }, pendientes_de_envio: 0 } : []));
    render(<Auditoria {...api()} plataforma />);
    await userEvent.click(screen.getByRole('button', { name: 'Verificar integridad' }));
    expect(await screen.findByText(/110 eventos y 1 ancla verificados/)).toBeInTheDocument();
  });

  test('un error del servidor se muestra', async () => {
    axios.get.mockRejectedValue(errorHttp(500, 'Base de auditoría no configurada'));
    render(<Auditoria {...api()} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Base de auditoría no configurada');
  });
});

describe('FormEmpresa', () => {
  test('al crear exige código y gerente, y valida los campos', async () => {
    const onGuardar = vi.fn();
    render(<FormEmpresa inicial={{}} crear onGuardar={onGuardar} onCancelar={vi.fn()} />);
    const codigo = screen.getByPlaceholderText('taxis-sur');
    await userEvent.type(codigo, 'Taxis-SUR');
    expect(codigo).toHaveValue('taxis-sur');
    expect(screen.getByText('Gerente inicial')).toBeInTheDocument();
    const [nombre] = screen.getAllByRole('textbox').filter(e => e.getAttribute('minlength') === '2');
    await userEvent.type(nombre, '1234');
    expect(screen.getByRole('alert')).toHaveTextContent(/alguna letra/);
    expect(screen.getByRole('button', { name: 'Crear empresa' }).closest('form').checkValidity()).toBe(false);
  });

  test('al editar no envía el código ni el gerente y convierte nulos en vacíos', async () => {
    const onGuardar = vi.fn();
    render(<FormEmpresa inicial={{ id: 1, codigo: 'pulpos', nombre: 'Pulpos', nit: null, ciudad: 'El Alto', centro_lat: -16.5, centro_lng: -68.19 }}
      onGuardar={onGuardar} onCancelar={vi.fn()} mensaje={{ tipo: 'error', texto: 'Ese NIT ya existe.' }} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Ese NIT ya existe.');
    expect(screen.queryByPlaceholderText('taxis-sur')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    const datos = onGuardar.mock.calls[0][0];
    expect(datos).not.toHaveProperty('codigo');
    expect(datos).not.toHaveProperty('gerente');
    expect(datos).toMatchObject({ nombre: 'Pulpos', nit: '', pais: 'Bolivia', moneda_codigo: 'BOB' });
  });

  test('NIT y teléfono avisan al salir del campo si quedan incompletos', async () => {
    render(<FormEmpresa inicial={{}} onGuardar={vi.fn()} guardando />);
    const nit = screen.getAllByRole('textbox').find(e => e.getAttribute('inputmode') === 'numeric');
    await userEvent.type(nit, '12');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole('alert')).toHaveTextContent(/NIT/);
    expect(screen.getByRole('button', { name: 'Guardando...' })).toBeDisabled();
  });
});

describe('Plataforma', () => {
  const EMPRESAS = [
    { id: 1, nombre: 'Pulpos', codigo: 'pulpos', ciudad: 'El Alto', pais: 'Bolivia', moneda_codigo: 'BOB', moneda_simbolo: 'Bs', total_choferes: 4, total_viajes: 20, activo: true, color_primario: '#10b981', centro_lat: -16.5, centro_lng: -68.19 },
    { id: 2, nombre: 'Illimani', codigo: 'illimani', ciudad: 'La Paz', pais: 'Bolivia', moneda_codigo: 'BOB', moneda_simbolo: 'Bs', total_choferes: 1, total_viajes: 0, activo: false },
  ];
  const ADMINS = [
    { id: 1, nombre: 'Super', email: 's@p.bo', rol: 'superadmin', mfa_activo: true, activo: true },
    { id: 2, nombre: 'Gerencia Pulpos', email: 'g@p.bo', empresa_nombre: 'Pulpos', rol: 'gerente', mfa_activo: true, activo: true },
    { id: 3, nombre: 'Nuevo', email: 'n@p.bo', rol: 'gerente', mfa_activo: false, activo: true },
  ];
  const montar = () => {
    axios.get.mockImplementation((url) => respuesta(url.endsWith('/empresas') ? EMPRESAS : ADMINS));
    render(<Plataforma {...api()} usuarioId={1} />);
  };

  test('lista empresas y administradores; no deja restablecer el propio factor', async () => {
    montar();
    expect(await screen.findByText('2 empresas · 1 activas')).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
    expect(await screen.findByText('Pendiente de configurar')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Restablecer' })).toHaveLength(1);
  });

  test('restablecer el segundo factor pide confirmación', async () => {
    axios.post.mockReturnValueOnce(respuesta({ mensaje: 'Segundo factor restablecido.' }));
    montar();
    const boton = await screen.findByRole('button', { name: 'Restablecer' });
    await userEvent.click(boton);
    expect(axios.post).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: '¿Confirmar?' }));
    expect(axios.post).toHaveBeenCalledWith(`${URL_API}/api/plataforma/administradores/2/mfa/restablecer`, {}, expect.anything());
    expect(await screen.findByText('Segundo factor restablecido.')).toBeInTheDocument();
  });

  test('crear una empresa abre el formulario y vuelve a la lista al guardar', async () => {
    axios.post.mockReturnValueOnce(respuesta({ mensaje: 'Empresa creada.' }));
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Nueva empresa' }));
    expect(screen.getByRole('heading', { name: 'Nueva empresa' })).toBeInTheDocument();
    const form = screen.getByRole('button', { name: 'Crear empresa' }).closest('form');
    form.noValidate = true;
    await userEvent.click(screen.getByRole('button', { name: 'Crear empresa' }));
    expect(axios.post).toHaveBeenCalledWith(`${URL_API}/api/plataforma/empresas`, expect.objectContaining({ gerente: expect.any(Object) }), expect.anything());
    expect(await screen.findByText('Empresa creada.')).toBeInTheDocument();
  });

  test('editar una empresa usa PUT y un rechazo se muestra en el formulario', async () => {
    axios.put.mockRejectedValueOnce(errorHttp(400, 'Color inválido.'));
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Editar Pulpos' }));
    expect(screen.getByText('Código: pulpos')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Guardar datos' }));
    expect(axios.put).toHaveBeenCalledWith(`${URL_API}/api/plataforma/empresas/1`, expect.not.objectContaining({ codigo: expect.anything() }), expect.anything());
    expect(await screen.findByRole('alert')).toHaveTextContent('Color inválido.');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(screen.getByText('2 empresas · 1 activas')).toBeInTheDocument();
  });

  test('activar una empresa la cambia y recarga; un error se avisa', async () => {
    axios.patch.mockReturnValueOnce(respuesta({})).mockRejectedValueOnce(errorHttp(500, 'No se pudo.'));
    montar();
    await userEvent.click(await screen.findByRole('button', { name: 'Activar Illimani' }));
    expect(axios.patch).toHaveBeenCalledWith(`${URL_API}/api/plataforma/empresas/2/estado`, { activo: true }, expect.anything());
    await userEvent.click(screen.getByRole('button', { name: 'Desactivar Pulpos' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo.');
  });
});
