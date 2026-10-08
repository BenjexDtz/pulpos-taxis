import { useState, useEffect, useEffectEvent, useCallback } from 'react';
import axios from 'axios';
import {
  AlertCircle, X, LayoutDashboard, Map, Users, Settings, Building2, ScrollText, ShieldCheck,
} from 'lucide-react';
import Login from './componentes/Login.jsx';
import Navegacion from './componentes/Navegacion.jsx';
import Tablero from './vistas/Tablero.jsx';
import Radar from './vistas/Radar.jsx';
import Flota from './vistas/Flota.jsx';
import Parametros from './vistas/Parametros.jsx';
import Empresa from './vistas/Empresa.jsx';
import Plataforma from './vistas/Plataforma.jsx';
import Auditoria from './vistas/Auditoria.jsx';
import Seguridad from './vistas/Seguridad.jsx';
import { leerToken, consultaFechas } from './utilidades.js';

const urlServidor = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';

const MENU_PLATAFORMA = [
  { id: 'plataforma', icon: Building2, label: 'EMPRESAS' },
  { id: 'auditoria', icon: ScrollText, label: 'AUDITORÍA' },
  { id: 'seguridad', icon: ShieldCheck, label: 'SEGURIDAD' },
];

const MENU_EMPRESA = [
  { id: 'dashboard', icon: LayoutDashboard, label: 'TABLERO' },
  { id: 'mapa', icon: Map, label: 'RADAR' },
  { id: 'conductores', icon: Users, label: 'FLOTA' },
  { id: 'parametros', icon: Settings, label: 'PARÁMETROS' },
  { id: 'empresa', icon: Building2, label: 'EMPRESA' },
  { id: 'auditoria', icon: ScrollText, label: 'AUDITORÍA' },
  { id: 'seguridad', icon: ShieldCheck, label: 'SEGURIDAD' },
];

export default function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || null);
  const [vistaActiva, setVistaActiva] = useState('dashboard');

  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [errorDashboard, setErrorDashboard] = useState(null);
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [choferes, setChoferes] = useState([]);
  const [cargandoChoferes, setCargandoChoferes] = useState(false);

  const [empresa, setEmpresa] = useState(null);
  const [params, setParams] = useState(null);
  const [formParams, setFormParams] = useState(null);

  const [aviso, setAviso] = useState('');

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const sesion = leerToken(token ?? '');
  const esSuperadmin = sesion?.rol === 'superadmin';

  useEffect(() => {
    document.title = esSuperadmin ? 'Plataforma · Central de Operaciones' : empresa?.nombre ?? 'Central de Operaciones';
  }, [esSuperadmin, empresa]);

  const cerrarSesion = useCallback(() => {
    localStorage.removeItem('admin_token');
    setToken(null); setViajes([]); setChoferes([]); setVistaActiva('dashboard'); setAviso('');
    setEmpresa(null); setParams(null); setFormParams(null);
  }, []);

  const manejarErrorApi = useCallback((err, mostrar) => {
    if (err.response?.status === 401 || err.response?.status === 403) cerrarSesion();
    else mostrar(err.response?.data?.error || '⚠️ Error conectando al servidor.');
  }, [cerrarSesion]);

  const entrar = (nuevoToken, avisoInicial) => {
    localStorage.setItem('admin_token', nuevoToken);
    setAviso(avisoInicial);
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
      manejarErrorApi(err, setAviso);
    } finally { setCargandoChoferes(false); }
  }, [headers, manejarErrorApi]);

  const cargarConfig = useCallback(async () => {
    try {
      const res = await axios.get(`${urlServidor}/api/config`, { headers: headers() });
      setEmpresa(res.data.empresa);
      setParams(res.data.parametros);
      setFormParams(res.data.parametros);
    } catch (err) {
      manejarErrorApi(err, setAviso);
    }
  }, [headers, manejarErrorApi]);

  const cargarTodo = useEffectEvent(() => {
    if (esSuperadmin) return;
    cargarReporte(); cargarChoferes(); cargarConfig();
  });
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (token) cargarTodo();
  }, [token]);

  const irA = (vista) => {
    setVistaActiva(vista);
    if (esSuperadmin || vista === 'auditoria' || vista === 'seguridad') return;
    if (vista === 'parametros' || vista === 'empresa') { cargarConfig(); return; }
    cargarReporte(); cargarChoferes();
  };

  useEffect(() => {
    if (vistaActiva !== 'mapa' || !token) return;
    const iv = setInterval(() => cargarChoferes(), 15000);
    return () => clearInterval(iv);
  }, [vistaActiva, token, cargarChoferes]);

  if (!token) return <Login urlServidor={urlServidor} onSesion={entrar} />;

  const vista = esSuperadmin && !['auditoria', 'seguridad'].includes(vistaActiva) ? 'plataforma' : vistaActiva;
  const api = { urlServidor, headers, manejarErrorApi };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap'); .font-radar{font-family:'Share Tech Mono',monospace;} body{background:#030712;} ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:#111;} ::-webkit-scrollbar-thumb{background:#374151;border-radius:4px;}`}</style>

      <Navegacion empresa={empresa} esSuperadmin={esSuperadmin} items={esSuperadmin ? MENU_PLATAFORMA : MENU_EMPRESA}
        vista={vista} onIr={irA} onSalir={cerrarSesion} />

      <main className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-6">
        {aviso && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-red-950 border border-red-800 text-red-400 px-4 py-3 rounded-xl font-radar text-sm">
            <span className="flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{aviso}</span>
            <button onClick={() => setAviso('')} className="text-red-500 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
        )}

        {vista === 'plataforma' && <Plataforma {...api} usuarioId={sesion?.id} />}
        {vista === 'seguridad' && <Seguridad {...api} cuenta={sesion?.nombre} />}
        {vista === 'auditoria' && <Auditoria {...api} plataforma={esSuperadmin} />}
        {vista === 'empresa' && <Empresa {...api} empresa={empresa} setEmpresa={setEmpresa} />}
        {vista === 'dashboard' && (
          <Tablero {...api} viajes={viajes} choferes={choferes} empresa={empresa} cargando={cargando}
            errorDashboard={errorDashboard} cargarReporte={cargarReporte}
            fechaDesde={fechaDesde} setFechaDesde={setFechaDesde} fechaHasta={fechaHasta} setFechaHasta={setFechaHasta} />
        )}
        {vista === 'mapa' && (
          <Radar choferes={choferes} viajes={viajes} params={params} empresa={empresa}
            cargandoChoferes={cargandoChoferes} cargarChoferes={cargarChoferes} cargarReporte={cargarReporte} />
        )}
        {vista === 'conductores' && (
          <Flota {...api} choferes={choferes} cargandoChoferes={cargandoChoferes} cargarChoferes={cargarChoferes} />
        )}
        {vista === 'parametros' && (
          <Parametros {...api} params={params} setParams={setParams} formParams={formParams} setFormParams={setFormParams} empresa={empresa} />
        )}
      </main>
    </div>
  );
}
