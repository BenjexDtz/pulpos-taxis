import { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router';
import axios from 'axios';
import Login from './componentes/Login.jsx';
import Mensaje from './componentes/Mensaje.jsx';
import Diseno from './componentes/layout/Diseno.jsx';
import { leerToken, consultaFechas, fechaLocal } from './utilidades.js';

// Cada vista se descarga al entrar a ella: los gráficos no pesan en el login.
const Central = lazy(() => import('./vistas/Central.jsx'));
const Informes = lazy(() => import('./vistas/Informes.jsx'));
const Flota = lazy(() => import('./vistas/Flota.jsx'));
const Parametros = lazy(() => import('./vistas/Parametros.jsx'));
const Empresa = lazy(() => import('./vistas/Empresa.jsx'));
const Plataforma = lazy(() => import('./vistas/Plataforma.jsx'));
const Auditoria = lazy(() => import('./vistas/Auditoria.jsx'));
const Seguridad = lazy(() => import('./vistas/Seguridad.jsx'));
const Asistente = lazy(() => import('./componentes/Asistente.jsx'));

const urlServidor = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';
const MARCA_PLATAFORMA = '#465fff';

// Grupos de pestañas: operación diaria y configuración. Seguridad está en el menú del usuario.
const SECCIONES_PLATAFORMA = [
  [{ ruta: '/plataforma', etiqueta: 'Empresas' }, { ruta: '/auditoria', etiqueta: 'Auditoría' }],
];

const SECCIONES_EMPRESA = [
  [{ ruta: '/', etiqueta: 'Central' }, { ruta: '/informes', etiqueta: 'Informes' }, { ruta: '/flota', etiqueta: 'Flota' }],
  [{ ruta: '/parametros', etiqueta: 'Parámetros' }, { ruta: '/empresa', etiqueta: 'Empresa' }, { ruta: '/auditoria', etiqueta: 'Auditoría' }],
];

// La central no lleva título: el visor ya dice qué se está viendo.
const TITULOS = {
  '/informes': 'Informes del período', '/flota': 'Flota', '/parametros': 'Parámetros tarifarios',
  '/empresa': 'Datos de la empresa', '/auditoria': 'Auditoría', '/seguridad': 'Seguridad de la cuenta',
  '/plataforma': 'Empresas de la plataforma',
};

const haceDias = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return fechaLocal(d); };

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || null);
  const { pathname } = useLocation();

  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [errorDashboard, setErrorDashboard] = useState(null);
  const [fechaDesde, setFechaDesde] = useState(() => haceDias(29));
  const [fechaHasta, setFechaHasta] = useState(() => haceDias(0));

  const [choferes, setChoferes] = useState([]);
  const [cargandoChoferes, setCargandoChoferes] = useState(false);

  const [empresa, setEmpresa] = useState(null);
  const [params, setParams] = useState(null);
  const [formParams, setFormParams] = useState(null);

  const [aviso, setAviso] = useState(null);

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const sesion = leerToken(token ?? '');
  const esSuperadmin = sesion?.rol === 'superadmin';

  useEffect(() => {
    document.title = esSuperadmin ? 'Plataforma · Central de Operaciones' : empresa?.nombre ?? 'Central de Operaciones';
  }, [esSuperadmin, empresa]);

  useEffect(() => {
    const marca = esSuperadmin || !token ? MARCA_PLATAFORMA : empresa?.color_primario ?? MARCA_PLATAFORMA;
    document.documentElement.style.setProperty('--marca', marca);
  }, [esSuperadmin, token, empresa]);

  const cerrarSesion = useCallback(() => {
    localStorage.removeItem('admin_token');
    setToken(null); setViajes([]); setChoferes([]); setAviso(null);
    setEmpresa(null); setParams(null); setFormParams(null);
  }, []);

  const manejarErrorApi = useCallback((err, mostrar) => {
    if (err.response?.status === 401 || err.response?.status === 403) cerrarSesion();
    else mostrar(err.response?.data?.error || '⚠️ Error conectando al servidor.');
  }, [cerrarSesion]);

  const mostrarError = useCallback((texto) => setAviso({ tipo: 'error', texto }), []);

  const entrar = (nuevoToken, avisoInicial) => {
    localStorage.setItem('admin_token', nuevoToken);
    setAviso(avisoInicial ? { tipo: 'aviso', texto: avisoInicial } : null);
    setToken(nuevoToken);
  };

  const cargarReporte = useCallback(async () => {
    if (!token) return;
    setCargando(true); setErrorDashboard(null);
    try {
      const res = await axios.get(`${urlServidor}/api/admin/viajes${consultaFechas(fechaDesde, fechaHasta)}`, { headers: headers() });
      setViajes(res.data);
    } catch (err) {
      manejarErrorApi(err, setErrorDashboard);
    } finally { setCargando(false); }
  }, [token, headers, fechaDesde, fechaHasta, manejarErrorApi]);

  const cargarChoferes = useCallback(async () => {
    setCargandoChoferes(true);
    try {
      const res = await axios.get(`${urlServidor}/api/admin/choferes`, { headers: headers() });
      setChoferes(res.data);
    } catch (err) {
      manejarErrorApi(err, mostrarError);
    } finally { setCargandoChoferes(false); }
  }, [headers, manejarErrorApi, mostrarError]);

  const cargarConfig = useCallback(async () => {
    try {
      const res = await axios.get(`${urlServidor}/api/config`, { headers: headers() });
      setEmpresa(res.data.empresa);
      setParams(res.data.parametros);
      setFormParams(res.data.parametros);
    } catch (err) {
      manejarErrorApi(err, mostrarError);
    }
  }, [headers, manejarErrorApi, mostrarError]);

  // Cada vista carga lo que muestra al entrar; la configuración trae nombre, color y moneda de la empresa.
  useEffect(() => {
    if (!token || esSuperadmin) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (pathname === '/parametros' || pathname === '/empresa' || !empresa) cargarConfig();
    if (pathname === '/flota') cargarChoferes();
    /* eslint-enable react-hooks/set-state-in-effect */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, token, esSuperadmin]);

  if (!token) return <Login urlServidor={urlServidor} onSesion={entrar} />;

  const api = { urlServidor, headers, manejarErrorApi };

  return (
    <Diseno empresa={empresa} esSuperadmin={esSuperadmin} secciones={esSuperadmin ? SECCIONES_PLATAFORMA : SECCIONES_EMPRESA}
      titulo={TITULOS[pathname] ?? ''} sesion={sesion} onSalir={cerrarSesion}>
      {aviso && <Mensaje tipo={aviso.tipo} texto={aviso.texto} onCerrar={() => setAviso(null)} className="mb-6" />}

      <Suspense fallback={<p className="py-16 text-center text-sm text-gray-500 dark:text-gray-400">Cargando...</p>}>
      <Routes>
        <Route path="/seguridad" element={<Seguridad {...api} cuenta={sesion?.nombre} />} />
        <Route path="/auditoria" element={<Auditoria {...api} plataforma={esSuperadmin} />} />
        {esSuperadmin ? (
          <>
            <Route path="/plataforma" element={<Plataforma {...api} usuarioId={sesion?.id} />} />
            <Route path="*" element={<Navigate to="/plataforma" replace />} />
          </>
        ) : (
          <>
            <Route path="/" element={
              <Central {...api} choferes={choferes} empresa={empresa} cargarChoferes={cargarChoferes} />
            } />
            <Route path="/informes" element={
              <Informes {...api} viajes={viajes} empresa={empresa} params={params} cargando={cargando}
                errorDashboard={errorDashboard} cargarReporte={cargarReporte}
                fechaDesde={fechaDesde} setFechaDesde={setFechaDesde} fechaHasta={fechaHasta} setFechaHasta={setFechaHasta} />
            } />
            <Route path="/flota" element={
              <Flota {...api} choferes={choferes} cargandoChoferes={cargandoChoferes} cargarChoferes={cargarChoferes} />
            } />
            <Route path="/parametros" element={
              <Parametros {...api} setParams={setParams} formParams={formParams} setFormParams={setFormParams} empresa={empresa} />
            } />
            <Route path="/empresa" element={<Empresa {...api} empresa={empresa} setEmpresa={setEmpresa} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </>
        )}
      </Routes>
      </Suspense>
      {!esSuperadmin && <Suspense fallback={null}><Asistente {...api} /></Suspense>}
    </Diseno>
  );
}
