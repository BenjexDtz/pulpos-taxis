import { describe, test, expect, vi } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import axios from 'axios';
import App from '../src/App.jsx';
import Cabecera from '../src/componentes/layout/Cabecera.jsx';
import Diseno from '../src/componentes/layout/Diseno.jsx';
import ProveedorTema from '../src/contexto/ProveedorTema.jsx';
import { ConTema, errorHttp, leafletFalso, respuesta } from './ayudas.jsx';

vi.mock('axios');

const jwt = (carga) => `x.${btoa(JSON.stringify(carga)).replace(/=+$/, '')}.y`;
const GERENTE = jwt({ id: 2, rol: 'gerente', nombre: 'Gerencia Pulpos' });
const SUPER = jwt({ id: 1, rol: 'superadmin', nombre: 'Plataforma Admin' });
const EMPRESA = { nombre: 'Radio Taxi Pulpos', codigo: 'pulpos', color_primario: '#ff0000', moneda_simbolo: 'Bs', logo_url: 'https://x/logo.png' };
const SECCIONES = [[{ ruta: '/', etiqueta: 'Central' }, { ruta: '/informes', etiqueta: 'Informes' }], [{ ruta: '/auditoria', etiqueta: 'Auditoría' }]];

const apiFalsa = () => axios.get.mockImplementation((url) => {
  if (url.endsWith('/api/config')) return respuesta({ empresa: EMPRESA, parametros: { zona_ciudad: 'El Alto' } });
  if (url.endsWith('/api/admin/choferes')) return respuesta([{ id: 1, nombre_completo: 'Juan Pérez', placa_vehiculo: '2456ZBK', estado_activo: true }]);
  if (url.endsWith('/api/plataforma/empresas')) return respuesta([]);
  return respuesta([]);
});

const montar = (ruta = '/') => render(<MemoryRouter initialEntries={[ruta]}><ProveedorTema><App /></ProveedorTema></MemoryRouter>);

describe('App', () => {
  test('sin sesión muestra el login', () => {
    montar();
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });

  test('un gerente entra a la central con el nombre y el color de su empresa', async () => {
    leafletFalso();
    apiFalsa();
    localStorage.setItem('admin_token', GERENTE);
    montar();
    expect(await screen.findByText(/Bitácora de hoy/i)).toBeInTheDocument();
    await waitFor(() => expect(document.title).toBe('Radio Taxi Pulpos'));
    expect(document.documentElement.style.getPropertyValue('--marca')).toBe('#ff0000');
    expect(screen.getByRole('button', { name: 'Abrir asistente' })).toBeInTheDocument();
  });

  test('en Flota carga los choferes y pone el título de la sección', async () => {
    apiFalsa();
    localStorage.setItem('admin_token', GERENTE);
    montar('/flota');
    expect(await screen.findByRole('heading', { level: 1, name: 'Flota' })).toBeInTheDocument();
    expect(await screen.findByText('Juan Pérez')).toBeInTheDocument();
  });

  test('el superadministrador va a la plataforma y no ve el asistente', async () => {
    apiFalsa();
    localStorage.setItem('admin_token', SUPER);
    montar('/informes');
    expect(await screen.findByRole('heading', { level: 1, name: 'Empresas de la plataforma' })).toBeInTheDocument();
    expect(document.title).toBe('Plataforma · Central de Operaciones');
    expect(screen.queryByRole('button', { name: 'Abrir asistente' })).not.toBeInTheDocument();
  });

  test('una respuesta 401 cierra la sesión y vuelve al login', async () => {
    axios.get.mockRejectedValue(errorHttp(401, 'Token vencido'));
    localStorage.setItem('admin_token', GERENTE);
    montar('/parametros');
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  test('otro error de la API se muestra como aviso que se puede cerrar', async () => {
    axios.get.mockRejectedValue(errorHttp(500, 'Servidor ocupado'));
    localStorage.setItem('admin_token', GERENTE);
    montar('/empresa');
    const aviso = await screen.findByText('Servidor ocupado');
    expect(aviso).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Cerrar' })[0]);
    expect(screen.queryByText('Servidor ocupado')).not.toBeInTheDocument();
  });

  test('cerrar sesión desde el menú borra el token', async () => {
    apiFalsa();
    localStorage.setItem('admin_token', GERENTE);
    montar('/empresa');
    await userEvent.click(await screen.findByRole('button', { name: /GP/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(localStorage.getItem('admin_token')).toBeNull();
  });

  test('main.jsx monta la aplicación en #root', async () => {
    document.body.innerHTML = '<div id="root"></div>';
    await act(async () => { await import('../src/main.jsx'); });
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
  });
});

describe('Cabecera y Diseno', () => {
  test('muestra la marca, las pestañas, la conexión y el menú del usuario', async () => {
    const onSalir = vi.fn();
    render(<ConTema ruta="/informes"><Cabecera empresa={EMPRESA} secciones={SECCIONES} sesion={{ nombre: 'Gerencia Pulpos', rol: 'gerente' }} onSalir={onSalir} /></ConTema>);
    expect(screen.getByText('Radio Taxi Pulpos')).toBeInTheDocument();
    expect(document.querySelector('img[src="https://x/logo.png"]')).toBeInTheDocument();
    const activas = screen.getAllByRole('link', { name: 'Informes' });
    expect(activas[0]).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByRole('link', { name: 'Central' })[0]).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('status')).toHaveTextContent('En línea');
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByRole('status')).toHaveTextContent('Sin conexión');

    await userEvent.click(screen.getByRole('button', { name: /GP/ }));
    expect(screen.getByRole('menu')).toHaveTextContent('Gerente · Radio Taxi Pulpos');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /GP/ }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    expect(onSalir).toHaveBeenCalled();
  });

  test('el superadministrador ve "Plataforma" y el botón cambia el tema', async () => {
    const alternar = vi.fn();
    render(<ConTema tema="light" alternar={alternar}><Cabecera esSuperadmin secciones={SECCIONES} sesion={{ nombre: 'Ana', rol: 'superadmin' }} /></ConTema>);
    expect(screen.getByText('Plataforma')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Cambiar a modo oscuro' }));
    expect(alternar).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^A/ }));
    expect(screen.getByRole('menu')).toHaveTextContent('Superadministrador');
    await userEvent.click(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  test('Diseno pone el título de la sección y el contenido', () => {
    render(<ConTema><Diseno secciones={SECCIONES} titulo="Flota" sesion={{ nombre: 'X' }}><p>contenido</p></Diseno></ConTema>);
    expect(screen.getByRole('heading', { level: 1, name: 'Flota' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveTextContent('contenido');
  });
});
