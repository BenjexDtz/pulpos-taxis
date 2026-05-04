import { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import {
  Activity, Car, DollarSign, RefreshCw, Lock, User, Users,
  UserPlus, LayoutDashboard, Search, KeyRound, ToggleLeft,
  ToggleRight, ShieldCheck, ShieldOff, Map, Radio, Wifi, WifiOff,
  TrendingUp, Clock, AlertCircle, X, MapPin, Download, Settings,
  Save, ChevronDown
} from 'lucide-react';

// ─── LEAFLET ──────────────────────────────────────────────────────────────────
function useLeaflet() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (window.L) { setReady(true); return; }
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => setReady(true);
    document.head.appendChild(script);
  }, []);
  return ready;
}

const EL_ALTO_CENTER = [-16.5, -68.19];

// ─── FLEET MAP ────────────────────────────────────────────────────────────────
function FleetMap({ choferes, viajes }) {
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersRef = useRef([]);
  const leafletReady = useLeaflet();

  useEffect(() => {
    if (!leafletReady || !mapRef.current || mapInstanceRef.current) return;
    const L = window.L;
    const map = L.map(mapRef.current, { zoomControl: false }).setView(EL_ALTO_CENTER, 14);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '©OpenStreetMap ©CARTO', maxZoom: 19
    }).addTo(map);
    mapInstanceRef.current = map;
    return () => { if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null; } };
  }, [leafletReady]);

  useEffect(() => {
    if (!leafletReady || !mapInstanceRef.current) return;
    const L = window.L;
    const map = mapInstanceRef.current;
    markersRef.current.forEach(m => map.removeLayer(m));
    markersRef.current = [];

    choferes
      .filter(c => c.estado_activo && c.ultima_lat != null && c.ultima_lng != null)
      .forEach(chofer => {
        const pos = [parseFloat(chofer.ultima_lat), parseFloat(chofer.ultima_lng)];
        const trips = viajes.filter(v => v.chofer === chofer.nombre_completo).length;
        const total = viajes.filter(v => v.chofer === chofer.nombre_completo)
          .reduce((s, v) => s + parseFloat(v.tarifa_total || 0), 0);
        const ultima = chofer.ultima_actualizacion ? new Date(chofer.ultima_actualizacion) : null;
        const minutos = ultima ? Math.floor((new Date() - ultima) / 60000) : null;
        const enVivo = minutos !== null && minutos < 5;
        const color = enVivo ? '#10b981' : '#f59e0b';

        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${color};border:2px solid ${enVivo ? '#34d399' : '#fcd34d'};border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 14px ${color}60;cursor:pointer;">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white"><rect x="1" y="3" width="15" height="13" rx="2"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>`,
          iconSize: [30, 30], iconAnchor: [15, 15]
        });

        const marker = L.marker(pos, { icon }).addTo(map).bindPopup(`
          <div style="font-family:monospace;min-width:200px;font-size:12px;">
            <div style="font-weight:bold;color:${color};margin-bottom:4px;">${chofer.nombre_completo}</div>
            <div style="color:#888;">🚗 ${chofer.placa_vehiculo}</div>
            <hr style="border-color:#eee;margin:6px 0;"/>
            <div>Viajes: <b>${trips}</b></div>
            <div>Recaudado: <b style="color:#16a34a;">Bs ${total.toFixed(2)}</b></div>
            ${minutos !== null ? `<div style="color:${enVivo ? '#16a34a' : '#d97706'};margin-top:4px;">⏱ Hace ${minutos} min</div>` : ''}
            <div style="color:#999;font-size:10px;margin-top:4px;">📍 ${parseFloat(chofer.ultima_lat).toFixed(5)}, ${parseFloat(chofer.ultima_lng).toFixed(5)}</div>
          </div>
        `);
        markersRef.current.push(marker);
      });
  }, [leafletReady, choferes, viajes]);

  return (
    <div className="relative h-full w-full">
      <div ref={mapRef} style={{ height: '100%', width: '100%' }} />
      {!leafletReady && (
        <div className="absolute inset-0 bg-gray-900 flex items-center justify-center">
          <div className="flex items-center space-x-3 text-green-400">
            <RefreshCw className="w-5 h-5 animate-spin" />
            <span className="font-mono text-sm">Inicializando radar...</span>
          </div>
        </div>
      )}
      <div className="absolute top-3 left-3 bg-gray-900 bg-opacity-90 border border-gray-700 rounded-lg px-3 py-2 text-xs font-mono z-[1000] space-y-1">
        <div className="flex items-center space-x-2 text-green-400">
          <div className="w-3 h-3 rounded-full bg-green-500" style={{ boxShadow: '0 0 6px #10b981' }} />
          <span>GPS activo (últimos 5 min)</span>
        </div>
        <div className="flex items-center space-x-2 text-yellow-400">
          <div className="w-3 h-3 rounded-full bg-yellow-500" />
          <span>Sin actualizar (+5 min)</span>
        </div>
        <div className="text-gray-600 pt-0.5">El Alto · 4,100 msnm</div>
      </div>
    </div>
  );
}

// ─── STAT CARD ────────────────────────────────────────────────────────────────
function StatCard({ icon: Icon, label, value, sub, color = 'blue', pulse = false }) {
  const colors = { blue: 'border-blue-500 text-blue-400', green: 'border-green-500 text-green-400', yellow: 'border-yellow-500 text-yellow-400', purple: 'border-purple-500 text-purple-400' };
  return (
    <div className={`bg-gray-900 border-l-4 ${colors[color]} rounded-xl p-5 relative overflow-hidden`}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-gray-500 text-xs font-mono uppercase tracking-widest mb-1">{label}</p>
          <p className="text-3xl font-black text-white">{value}</p>
          {sub && <p className="text-gray-500 text-xs mt-1">{sub}</p>}
        </div>
        <div className={`p-3 rounded-xl bg-gray-800 ${colors[color]}`}><Icon className="w-5 h-5" /></div>
      </div>
      {pulse && <div className="absolute top-3 right-14"><span className="flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span></div>}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  const [token, setToken] = useState(localStorage.getItem('admin_token') || null);
  const [vistaActiva, setVistaActiva] = useState('dashboard');
  const urlServidor = import.meta.env.VITE_API_URL || 'http://127.0.0.1:3000';

  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [errorLogin, setErrorLogin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [viajes, setViajes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [errorDashboard, setErrorDashboard] = useState(null);
  const [filtroChofer, setFiltroChofer] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');

  const [choferes, setChoferes] = useState([]);
  const [cargandoChoferes, setCargandoChoferes] = useState(false);

  const [formChofer, setFormChofer] = useState({ nombre: '', placa: '', password: '' });
  const [mensajeChofer, setMensajeChofer] = useState({ tipo: '', texto: '' });
  const [guardandoChofer, setGuardandoChofer] = useState(false);

  const [modalReset, setModalReset] = useState(null);
  const [nuevaPassword, setNuevaPassword] = useState('');
  const [mensajeReset, setMensajeReset] = useState({ tipo: '', texto: '' });
  const [guardandoReset, setGuardandoReset] = useState(false);

  // Parámetros topográficos
  const [params, setParams] = useState(null);
  const [formParams, setFormParams] = useState(null);
  const [guardandoParams, setGuardandoParams] = useState(false);
  const [mensajeParams, setMensajeParams] = useState({ tipo: '', texto: '' });

  const [conexion, setConexion] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setConexion(true), off = () => setConexion(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const headers = useCallback(() => ({ Authorization: `Bearer ${token}` }), [token]);

  const cerrarSesion = () => {
    localStorage.removeItem('admin_token');
    setToken(null); setViajes([]); setChoferes([]); setVistaActiva('dashboard');
  };

  const iniciarSesion = async (e) => {
    e.preventDefault(); setErrorLogin(''); setLoginLoading(true);
    try {
      const res = await axios.post(`${urlServidor}/api/admin/login`, { usuario, password });
      localStorage.setItem('admin_token', res.data.token);
      setToken(res.data.token);
    } catch { setErrorLogin('Credenciales incorrectas.'); }
    finally { setLoginLoading(false); }
  };

  const cargarReporte = useCallback(async () => {
    if (!token) return;
    setCargando(true); setErrorDashboard(null);
    try {
      const params_q = fechaDesde && fechaHasta ? `?desde=${fechaDesde}&hasta=${fechaHasta}` : '';
      const res = await axios.get(`${urlServidor}/api/admin/viajes${params_q}`, { headers: headers() });
      setViajes(res.data);
    } catch (err) {
      if (err.response?.status === 401 || err.response?.status === 403) cerrarSesion();
      else setErrorDashboard('⚠️ Error conectando al servidor.');
    } finally { setCargando(false); }
  }, [token, urlServidor, headers, fechaDesde, fechaHasta]);

  const cargarChoferes = useCallback(async () => {
    setCargandoChoferes(true);
    try {
      const res = await axios.get(`${urlServidor}/api/admin/choferes`, { headers: headers() });
      setChoferes(res.data);
    } catch { } finally { setCargandoChoferes(false); }
  }, [token, urlServidor, headers]);

  const cargarParametros = useCallback(async () => {
    try {
      const res = await axios.get(`${urlServidor}/api/parametros`);
      setParams(res.data);
      setFormParams(res.data);
    } catch { }
  }, [urlServidor]);

  useEffect(() => {
    if (!token) return;
    cargarReporte(); cargarChoferes(); cargarParametros();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    if (vistaActiva === 'dashboard') cargarReporte();
    if (vistaActiva === 'mapa') { cargarReporte(); cargarChoferes(); }
    if (vistaActiva === 'conductores') { cargarReporte(); cargarChoferes(); }
    if (vistaActiva === 'parametros') cargarParametros();
  }, [vistaActiva]);

  useEffect(() => {
    if (vistaActiva !== 'mapa' || !token) return;
    const iv = setInterval(() => cargarChoferes(), 15000);
    return () => clearInterval(iv);
  }, [vistaActiva, token, cargarChoferes]);

  const exportarCSV = () => {
    const params_q = fechaDesde && fechaHasta ? `?desde=${fechaDesde}&hasta=${fechaHasta}` : '';
    const url = `${urlServidor}/api/admin/viajes/exportar${params_q}`;
    const a = document.createElement('a');
    a.href = url;
    a.setAttribute('Authorization', `Bearer ${token}`);
    // Usamos fetch para incluir el header
    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.blob())
      .then(blob => {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `pulpos_viajes_${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
      });
  };

  const registrarNuevoChofer = async (e) => {
    e.preventDefault(); setGuardandoChofer(true); setMensajeChofer({ tipo: '', texto: '' });
    try {
      const res = await axios.post(`${urlServidor}/api/admin/choferes`,
        { nombre_completo: formChofer.nombre, placa_vehiculo: formChofer.placa, password: formChofer.password },
        { headers: headers() });
      setMensajeChofer({ tipo: 'exito', texto: res.data.mensaje });
      setFormChofer({ nombre: '', placa: '', password: '' });
      cargarChoferes();
      setTimeout(() => setMensajeChofer({ tipo: '', texto: '' }), 4000);
    } catch (err) {
      setMensajeChofer({ tipo: 'error', texto: err.response?.data?.error || 'Error al registrar.' });
    } finally { setGuardandoChofer(false); }
  };

  const toggleEstadoChofer = async (chofer) => {
    try {
      await axios.patch(`${urlServidor}/api/admin/choferes/${chofer.id}/estado`,
        { estado_activo: !chofer.estado_activo }, { headers: headers() });
      cargarChoferes();
    } catch { }
  };

  const resetearPassword = async (e) => {
    e.preventDefault(); setGuardandoReset(true); setMensajeReset({ tipo: '', texto: '' });
    try {
      const res = await axios.patch(`${urlServidor}/api/admin/choferes/${modalReset.id}/password`,
        { nueva_password: nuevaPassword }, { headers: headers() });
      setMensajeReset({ tipo: 'exito', texto: res.data.mensaje });
      setTimeout(() => { setModalReset(null); setNuevaPassword(''); setMensajeReset({ tipo: '', texto: '' }); }, 2000);
    } catch (err) {
      setMensajeReset({ tipo: 'error', texto: err.response?.data?.error || 'Error.' });
    } finally { setGuardandoReset(false); }
  };

  const guardarParametros = async (e) => {
    e.preventDefault(); setGuardandoParams(true); setMensajeParams({ tipo: '', texto: '' });
    try {
      const res = await axios.put(`${urlServidor}/api/admin/parametros/${params.id}`, formParams, { headers: headers() });
      setMensajeParams({ tipo: 'exito', texto: res.data.mensaje });
      setParams(res.data.parametros);
      setTimeout(() => setMensajeParams({ tipo: '', texto: '' }), 5000);
    } catch (err) {
      setMensajeParams({ tipo: 'error', texto: err.response?.data?.error || 'Error al guardar.' });
    } finally { setGuardandoParams(false); }
  };

  // Computed
  const viajesFiltrados = viajes.filter(v =>
    v.chofer?.toLowerCase().includes(filtroChofer.toLowerCase()) ||
    v.placa_vehiculo?.toLowerCase().includes(filtroChofer.toLowerCase())
  );
  const totalRecaudado = viajesFiltrados.reduce((s, v) => s + parseFloat(v.tarifa_total || 0), 0);
  const kmTotal = viajesFiltrados.reduce((s, v) => s + parseFloat(v.distancia_km || 0), 0);
  const activosCount = choferes.filter(c => c.estado_activo).length;
  const conGPSVivo = choferes.filter(c => {
    if (!c.estado_activo || !c.ultima_actualizacion) return false;
    return (new Date() - new Date(c.ultima_actualizacion)) < 5 * 60 * 1000;
  }).length;

  // ── LOGIN ──────────────────────────────────────────────────────────────────
  if (!token) return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap'); body{background:#030712;} .font-radar{font-family:'Share Tech Mono',monospace;}`}</style>
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border-2 border-green-500 mb-4 relative" style={{ boxShadow: '0 0 30px #10b98140' }}>
            <Radio className="w-9 h-9 text-green-400" />
            <span className="absolute top-0 right-0 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" /></span>
          </div>
          <h1 className="text-4xl font-bold text-white tracking-widest" style={{ fontFamily: 'Rajdhani' }}>PULPOS</h1>
          <p className="font-radar text-green-500 text-xs tracking-[0.4em] mt-1">CENTRAL DE OPERACIONES</p>
          <p className="text-gray-600 text-xs mt-2 font-radar">El Alto · Bolivia · 4,100 msnm</p>
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8" style={{ boxShadow: '0 0 60px #10b98108' }}>
          {errorLogin && <div className="flex items-center space-x-2 bg-red-950 border border-red-800 text-red-400 p-3 rounded-lg mb-6 font-radar text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{errorLogin}</span></div>}
          <form onSubmit={iniciarSesion} className="space-y-5">
            <div>
              <label className="font-radar text-xs text-gray-500 tracking-widest block mb-2">USUARIO</label>
              <div className="relative"><User className="w-4 h-4 absolute left-4 top-3.5 text-gray-600" />
                <input type="text" value={usuario} onChange={e => setUsuario(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white pl-11 pr-4 py-3 rounded-xl font-radar text-sm focus:outline-none focus:border-green-500 transition placeholder-gray-700" placeholder="admin" /></div>
            </div>
            <div>
              <label className="font-radar text-xs text-gray-500 tracking-widest block mb-2">CONTRASEÑA</label>
              <div className="relative"><Lock className="w-4 h-4 absolute left-4 top-3.5 text-gray-600" />
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white pl-11 pr-4 py-3 rounded-xl font-radar text-sm focus:outline-none focus:border-green-500 transition placeholder-gray-700" placeholder="••••••••" /></div>
            </div>
            <button type="submit" disabled={loginLoading} className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition tracking-widest text-sm flex items-center justify-center space-x-2" style={{ fontFamily: 'Rajdhani', boxShadow: loginLoading ? 'none' : '0 0 20px #10b98140' }}>
              {loginLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
              <span>{loginLoading ? 'VERIFICANDO...' : 'ACCEDER AL SISTEMA'}</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );

  const navItems = [
    { id: 'dashboard', icon: LayoutDashboard, label: 'TABLERO' },
    { id: 'mapa', icon: Map, label: 'RADAR' },
    { id: 'conductores', icon: Users, label: 'FLOTA' },
    { id: 'parametros', icon: Settings, label: 'PARÁMETROS' },
  ];

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100" style={{ fontFamily: 'Rajdhani, sans-serif' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;500;600;700&display=swap'); .font-radar{font-family:'Share Tech Mono',monospace;} body{background:#030712;} ::-webkit-scrollbar{width:4px;} ::-webkit-scrollbar-track{background:#111;} ::-webkit-scrollbar-thumb{background:#374151;border-radius:4px;}`}</style>

      {/* MODAL RESET */}
      {modalReset && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4" onClick={() => setModalReset(null)}>
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-5">
              <div><h3 className="font-bold text-white text-lg">Resetear Contraseña</h3><p className="text-yellow-500 font-radar text-sm">{modalReset.nombre}</p></div>
              <button onClick={() => setModalReset(null)} className="text-gray-600 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            {mensajeReset.texto && <div className={`mb-4 p-3 rounded-lg text-sm font-radar ${mensajeReset.tipo === 'exito' ? 'bg-green-950 text-green-400 border border-green-800' : 'bg-red-950 text-red-400 border border-red-800'}`}>{mensajeReset.texto}</div>}
            <form onSubmit={resetearPassword} className="space-y-4">
              <input type="password" required minLength={4} className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-3 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition placeholder-gray-700" placeholder="Nueva contraseña (mín. 4 caracteres)" value={nuevaPassword} onChange={e => setNuevaPassword(e.target.value)} />
              <div className="flex justify-end space-x-3">
                <button type="button" onClick={() => setModalReset(null)} className="px-4 py-2 border border-gray-700 text-gray-400 hover:text-white rounded-lg transition text-sm font-semibold">Cancelar</button>
                <button type="submit" disabled={guardandoReset} className="px-5 py-2 bg-yellow-600 hover:bg-yellow-500 text-white rounded-lg font-bold transition text-sm flex items-center space-x-2 disabled:opacity-60">
                  {guardandoReset ? <RefreshCw className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  <span>{guardandoReset ? 'Guardando...' : 'Actualizar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NAVBAR */}
      <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
        <div className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-3 flex justify-between items-center">
          <div className="flex items-center space-x-3">
            <div className="relative">
              <Radio className="w-7 h-7 text-green-400" />
              <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>
            </div>
            <div><span className="text-white font-bold text-xl tracking-widest">PULPOS</span><span className="text-green-500 font-bold text-xl tracking-widest"> ADMIN</span></div>
          </div>
          <div className="flex items-center space-x-1 bg-gray-800 p-1 rounded-xl">
            {navItems.map(item => (
              <button key={item.id} onClick={() => setVistaActiva(item.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-bold tracking-widest transition ${vistaActiva === item.id ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
                <item.icon className="w-4 h-4" /><span className="hidden md:inline">{item.label}</span>
              </button>
            ))}
          </div>
          <div className="flex items-center space-x-4">
            <div className="hidden md:flex items-center space-x-2">
              {conexion ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
              <span className="font-radar text-xs text-gray-500">{conexion ? 'EN LÍNEA' : 'SIN SEÑAL'}</span>
            </div>
            <button onClick={cerrarSesion} className="font-radar text-xs text-gray-600 hover:text-red-400 transition uppercase tracking-widest">SALIR</button>
          </div>
        </div>
      </nav>

      <main className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-6">

        {/* ── DASHBOARD ── */}
        {vistaActiva === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={DollarSign} label="RECAUDACIÓN" value={`Bs ${totalRecaudado.toFixed(2)}`} sub="viajes filtrados" color="green" />
              <StatCard icon={Activity} label="VIAJES" value={viajesFiltrados.length} sub={`de ${viajes.length} total`} color="blue" />
              <StatCard icon={Car} label="FLOTA ACTIVA" value={activosCount} sub={`${conGPSVivo} con GPS en vivo`} color="yellow" pulse />
              <StatCard icon={TrendingUp} label="KM RECORRIDOS" value={kmTotal.toFixed(1)} sub="kilómetros acumulados" color="purple" />
            </div>

            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 flex flex-wrap items-center gap-3 bg-gray-900">
                <div className="flex items-center space-x-2 mr-auto">
                  <Clock className="w-4 h-4 text-gray-500" />
                  <h2 className="font-bold text-gray-200 tracking-wider">HISTORIAL DE VIAJES</h2>
                </div>
                {/* Filtro fecha */}
                <input type="date" value={fechaDesde} onChange={e => setFechaDesde(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg font-radar text-xs focus:outline-none focus:border-blue-500" />
                <span className="text-gray-600 font-radar text-xs">→</span>
                <input type="date" value={fechaHasta} onChange={e => setFechaHasta(e.target.value)}
                  className="bg-gray-800 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg font-radar text-xs focus:outline-none focus:border-blue-500" />
                {/* Buscar */}
                <div className="relative">
                  <Search className="w-4 h-4 absolute left-3 top-2.5 text-gray-600" />
                  <input type="text" placeholder="Conductor o placa..."
                    className="bg-gray-800 border border-gray-700 text-white pl-9 pr-4 py-2 rounded-lg font-radar text-xs focus:outline-none focus:border-blue-500 transition w-44 placeholder-gray-700"
                    value={filtroChofer} onChange={e => setFiltroChofer(e.target.value)} />
                </div>
                {/* Exportar CSV */}
                <button onClick={exportarCSV}
                  className="flex items-center gap-2 bg-green-950 hover:bg-green-900 border border-green-800 text-green-400 px-3 py-2 rounded-lg transition font-radar text-xs">
                  <Download className="w-3.5 h-3.5" />CSV
                </button>
                <button onClick={cargarReporte} disabled={cargando}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg transition font-radar text-xs disabled:opacity-50">
                  <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />SYNC
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-800">{['CONDUCTOR / UNIDAD', 'DISTANCIA', 'ESPERA', 'TARIFA', 'FECHA'].map(h => <th key={h} className="px-5 py-3 text-left font-radar text-xs text-gray-600 tracking-widest">{h}</th>)}</tr></thead>
                  <tbody>
                    {errorDashboard && <tr><td colSpan={5} className="text-center py-10 text-red-500 font-radar text-sm">{errorDashboard}</td></tr>}
                    {!errorDashboard && viajesFiltrados.length === 0 && !cargando && <tr><td colSpan={5} className="text-center py-10 text-gray-700 font-radar text-sm">SIN REGISTROS</td></tr>}
                    {viajesFiltrados.map(viaje => (
                      <tr key={viaje.id} className="border-b border-gray-800 hover:bg-gray-800 transition">
                        <td className="px-5 py-4"><div className="font-semibold text-white">{viaje.chofer}</div><div className="font-radar text-xs text-green-500 mt-0.5">{viaje.placa_vehiculo}</div></td>
                        <td className="px-5 py-4 font-radar text-blue-400">{parseFloat(viaje.distancia_km).toFixed(2)} km</td>
                        <td className="px-5 py-4 font-radar text-yellow-500">{Math.floor(viaje.tiempo_detencion_min)} min</td>
                        <td className="px-5 py-4 font-radar text-green-400 font-bold text-base">Bs {parseFloat(viaje.tarifa_total).toFixed(2)}</td>
                        <td className="px-5 py-4 font-radar text-xs text-gray-600">{new Date(viaje.fecha_hora).toLocaleString('es-BO', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── RADAR ── */}
        {vistaActiva === 'mapa' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-bold text-white text-2xl tracking-wider flex items-center space-x-2"><Map className="w-6 h-6 text-green-400" /><span>RADAR DE FLOTA · GPS EN VIVO</span></h2>
                <p className="font-radar text-xs text-gray-600 mt-1">Actualización cada 15s · <span className="text-green-400">{conGPSVivo} unidades con señal activa</span></p>
              </div>
              <button onClick={() => { cargarChoferes(); cargarReporte(); }} className="flex items-center gap-2 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg transition font-radar text-xs font-bold">
                <RefreshCw className={`w-3.5 h-3.5 ${cargandoChoferes ? 'animate-spin' : ''}`} />ACTUALIZAR
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className="lg:col-span-3 bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden" style={{ height: '540px' }}>
                <FleetMap choferes={choferes} viajes={viajes} />
              </div>
              <div className="space-y-3">
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <p className="font-radar text-xs text-gray-600 tracking-widest mb-3">ESTADO DE FLOTA</p>
                  <div className="space-y-2">
                    <div className="flex justify-between"><span className="text-gray-400 text-sm">GPS activo ahora</span><span className="font-radar text-green-400 font-bold">{conGPSVivo}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 text-sm">Activos sin GPS</span><span className="font-radar text-yellow-500 font-bold">{activosCount - conGPSVivo}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400 text-sm">Inactivos</span><span className="font-radar text-gray-600 font-bold">{choferes.length - activosCount}</span></div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5 mt-2">
                      <div className="bg-green-500 h-1.5 rounded-full transition-all" style={{ width: `${choferes.length ? (conGPSVivo / choferes.length * 100) : 0}%` }} />
                    </div>
                  </div>
                </div>
                <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-800"><p className="font-radar text-xs text-gray-600 tracking-widest">UNIDADES ACTIVAS</p></div>
                  <div className="divide-y divide-gray-800 max-h-72 overflow-y-auto">
                    {choferes.filter(c => c.estado_activo).length === 0 && <div className="py-6 text-center font-radar text-xs text-gray-700">SIN UNIDADES</div>}
                    {choferes.filter(c => c.estado_activo).map(chofer => {
                      const tieneGPS = chofer.ultima_lat != null;
                      const ultima = chofer.ultima_actualizacion ? new Date(chofer.ultima_actualizacion) : null;
                      const minutos = ultima ? Math.floor((new Date() - ultima) / 60000) : null;
                      const enVivo = minutos !== null && minutos < 5;
                      return (
                        <div key={chofer.id} className="px-4 py-3 hover:bg-gray-800 transition">
                          <div className="flex items-center space-x-2">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${enVivo ? 'bg-green-500' : tieneGPS ? 'bg-yellow-500' : 'bg-gray-600'}`} style={enVivo ? { boxShadow: '0 0 6px #10b981' } : {}} />
                            <div className="flex-1 min-w-0">
                              <div className="text-white text-sm font-semibold truncate">{chofer.nombre_completo}</div>
                              <div className="font-radar text-xs text-gray-600">{chofer.placa_vehiculo} · {enVivo ? <span className="text-green-500">GPS vivo</span> : tieneGPS ? <span className="text-yellow-600">hace {minutos}min</span> : <span className="text-gray-700">sin GPS aún</span>}</div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {params && (
                  <div className="bg-gray-900 border border-green-900 rounded-xl p-4">
                    <p className="font-radar text-xs text-green-700 tracking-widest mb-2">PARÁMETROS ACTIVOS</p>
                    <div className="space-y-1">
                      {[['FH Altitud', `${params.factor_altitud}×`], ['FR Tierra', `${params.factor_superficie}×`], ['Cb/km', `Bs ${params.costo_base_km}`], ['Ct/min', `Bs ${params.costo_minuto_detencion}`]].map(([k, v]) => (
                        <div key={k} className="flex justify-between"><span className="font-radar text-xs text-gray-600">{k}</span><span className="font-radar text-xs text-green-400">{v}</span></div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── FLOTA ── */}
        {vistaActiva === 'conductores' && (
          <div className="space-y-6">
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden max-w-2xl">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center space-x-3">
                <UserPlus className="w-5 h-5 text-blue-400" />
                <div><h2 className="font-bold text-white tracking-wider">REGISTRAR CONDUCTOR</h2><p className="text-gray-600 text-xs font-radar">Credenciales para la app móvil</p></div>
              </div>
              <div className="p-6">
                {mensajeChofer.texto && <div className={`mb-5 p-4 rounded-xl font-radar text-sm border ${mensajeChofer.tipo === 'exito' ? 'bg-green-950 text-green-400 border-green-800' : 'bg-red-950 text-red-400 border-red-800'}`}>{mensajeChofer.texto}</div>}
                <form onSubmit={registrarNuevoChofer} className="space-y-4">
                  <div><label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">NOMBRE COMPLETO</label>
                    <input type="text" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-700" placeholder="Ej. Juan Pérez Mamani" value={formChofer.nombre} onChange={e => setFormChofer({ ...formChofer, nombre: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div><label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">PLACA</label>
                      <input type="text" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-700 uppercase" placeholder="1234-XYZ" value={formChofer.placa} onChange={e => setFormChofer({ ...formChofer, placa: e.target.value.toUpperCase() })} />
                    </div>
                    <div><label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">CONTRASEÑA</label>
                      <input type="password" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-blue-500 transition placeholder-gray-700" placeholder="••••••••" value={formChofer.password} onChange={e => setFormChofer({ ...formChofer, password: e.target.value })} />
                    </div>
                  </div>
                  <div className="flex justify-end pt-2">
                    <button type="submit" disabled={guardandoChofer} className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition tracking-wider text-sm">
                      {guardandoChofer ? <RefreshCw className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      <span>{guardandoChofer ? 'GUARDANDO...' : 'CREAR CREDENCIAL'}</span>
                    </button>
                  </div>
                </form>
              </div>
            </div>
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
                <div className="flex items-center space-x-3"><Users className="w-5 h-5 text-purple-400" /><div><h2 className="font-bold text-white tracking-wider">CONDUCTORES REGISTRADOS</h2><p className="font-radar text-xs text-gray-600">{choferes.length} conductor{choferes.length !== 1 ? 'es' : ''}</p></div></div>
                <button onClick={cargarChoferes} disabled={cargandoChoferes} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-3 py-2 rounded-lg transition font-radar text-xs">
                  <RefreshCw className={`w-3.5 h-3.5 ${cargandoChoferes ? 'animate-spin' : ''}`} />RECARGAR
                </button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead><tr className="border-b border-gray-800">{['ID', 'NOMBRE', 'PLACA', 'ÚLTIMA POSICIÓN', 'ESTADO', 'ACCIONES'].map(h => <th key={h} className="px-5 py-3 text-left font-radar text-xs text-gray-600 tracking-widest">{h}</th>)}</tr></thead>
                  <tbody>
                    {cargandoChoferes && <tr><td colSpan={6} className="text-center py-10 text-gray-700 font-radar text-sm">CARGANDO...</td></tr>}
                    {!cargandoChoferes && choferes.length === 0 && <tr><td colSpan={6} className="text-center py-10 text-gray-700 font-radar text-sm">SIN CONDUCTORES</td></tr>}
                    {choferes.map(chofer => {
                      const tieneGPS = chofer.ultima_lat != null;
                      const minutos = chofer.ultima_actualizacion ? Math.floor((new Date() - new Date(chofer.ultima_actualizacion)) / 60000) : null;
                      const enVivo = minutos !== null && minutos < 5;
                      return (
                        <tr key={chofer.id} className={`border-b border-gray-800 hover:bg-gray-800 transition ${!chofer.estado_activo ? 'opacity-40' : ''}`}>
                          <td className="px-5 py-4 font-radar text-xs text-gray-600">#{chofer.id}</td>
                          <td className="px-5 py-4 font-semibold text-white">{chofer.nombre_completo}</td>
                          <td className="px-5 py-4"><span className="font-radar text-xs bg-blue-950 text-blue-400 border border-blue-800 px-2.5 py-1 rounded-lg">{chofer.placa_vehiculo}</span></td>
                          <td className="px-5 py-4 font-radar text-xs">
                            {tieneGPS ? <div><div className={enVivo ? 'text-green-400' : 'text-yellow-600'}>{parseFloat(chofer.ultima_lat).toFixed(5)}, {parseFloat(chofer.ultima_lng).toFixed(5)}</div><div className="text-gray-700 mt-0.5">{enVivo ? `🟢 hace ${minutos} min` : `🟡 hace ${minutos} min`}</div></div> : <span className="text-gray-700">Sin datos GPS</span>}
                          </td>
                          <td className="px-5 py-4">
                            {chofer.estado_activo ? <span className="flex items-center space-x-1.5 font-radar text-xs text-green-400"><ShieldCheck className="w-3.5 h-3.5" /><span>ACTIVO</span></span> : <span className="flex items-center space-x-1.5 font-radar text-xs text-gray-600"><ShieldOff className="w-3.5 h-3.5" /><span>INACTIVO</span></span>}
                          </td>
                          <td className="px-5 py-4">
                            <div className="flex items-center gap-2">
                              <button onClick={() => { setModalReset({ id: chofer.id, nombre: chofer.nombre_completo }); setNuevaPassword(''); setMensajeReset({ tipo: '', texto: '' }); }} className="p-2 rounded-lg bg-yellow-950 text-yellow-500 hover:bg-yellow-900 border border-yellow-800 transition"><KeyRound className="w-3.5 h-3.5" /></button>
                              <button onClick={() => toggleEstadoChofer(chofer)} className={`p-2 rounded-lg border transition ${chofer.estado_activo ? 'bg-red-950 text-red-500 hover:bg-red-900 border-red-800' : 'bg-green-950 text-green-500 hover:bg-green-900 border-green-800'}`}>
                                {chofer.estado_activo ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ── PARÁMETROS TOPOGRÁFICOS ── */}
        {vistaActiva === 'parametros' && (
          <div className="max-w-2xl space-y-6">
            <div>
              <h2 className="font-bold text-white text-2xl tracking-wider flex items-center space-x-2"><Settings className="w-6 h-6 text-yellow-400" /><span>PARÁMETROS TOPOGRÁFICOS</span></h2>
              <p className="font-radar text-xs text-gray-600 mt-1">Los conductores descargan estos valores automáticamente al abrir la app. El cálculo es: T = D × Cb × FH × FR + Ct × Td</p>
            </div>

            {!formParams ? (
              <div className="text-center py-10 text-gray-700 font-radar text-sm">Cargando parámetros...</div>
            ) : (
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-800">
                  <p className="font-radar text-xs text-gray-600 tracking-widest">ZONA: <span className="text-yellow-400">{params?.zona_ciudad}</span></p>
                </div>
                <div className="p-6">
                  {mensajeParams.texto && (
                    <div className={`mb-6 p-4 rounded-xl font-radar text-sm border ${mensajeParams.tipo === 'exito' ? 'bg-green-950 text-green-400 border-green-800' : 'bg-red-950 text-red-400 border-red-800'}`}>{mensajeParams.texto}</div>
                  )}
                  <form onSubmit={guardarParametros} className="space-y-5">
                    <div>
                      <label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">ZONA / DESCRIPCIÓN</label>
                      <input type="text" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition" value={formParams.zona_ciudad} onChange={e => setFormParams({ ...formParams, zona_ciudad: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-5">
                      <div>
                        <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">Cb — COSTO BASE / KM (Bs)</label>
                        <p className="font-radar text-xs text-gray-700 mb-2">Tarifa base por kilómetro recorrido</p>
                        <input type="number" step="0.01" min="0.5" max="10" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition" value={formParams.costo_base_km} onChange={e => setFormParams({ ...formParams, costo_base_km: e.target.value })} />
                      </div>
                      <div>
                        <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">FH — FACTOR ALTITUD</label>
                        <p className="font-radar text-xs text-gray-700 mb-2">Penalización por operar a 4,100 msnm</p>
                        <input type="number" step="0.01" min="1" max="3" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition" value={formParams.factor_altitud} onChange={e => setFormParams({ ...formParams, factor_altitud: e.target.value })} />
                      </div>
                      <div>
                        <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">FR — FACTOR TIERRA / BARRO</label>
                        <p className="font-radar text-xs text-gray-700 mb-2">Multiplicador para rutas en tierra</p>
                        <input type="number" step="0.1" min="1" max="5" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition" value={formParams.factor_superficie} onChange={e => setFormParams({ ...formParams, factor_superficie: e.target.value })} />
                      </div>
                      <div>
                        <label className="font-radar text-xs text-gray-600 tracking-widest block mb-1">Ct — COSTO / MIN DETENCIÓN (Bs)</label>
                        <p className="font-radar text-xs text-gray-700 mb-2">Cobro por tiempo en espera o tráfico</p>
                        <input type="number" step="0.01" min="0.1" max="5" required className="w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition" value={formParams.costo_minuto_detencion} onChange={e => setFormParams({ ...formParams, costo_minuto_detencion: e.target.value })} />
                      </div>
                    </div>

                    {/* Preview de la fórmula */}
                    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 font-radar text-xs">
                      <p className="text-gray-500 mb-2 tracking-widest">PREVIEW — 5 km asfalto, 10 min espera:</p>
                      <p className="text-green-400 text-base font-bold">
                        Bs {(5 * parseFloat(formParams.costo_base_km || 0) * parseFloat(formParams.factor_altitud || 0) * 1.0 + 10 * parseFloat(formParams.costo_minuto_detencion || 0)).toFixed(2)}
                        <span className="text-gray-600 text-xs ml-2 font-normal">asfalto</span>
                      </p>
                      <p className="text-orange-400 text-base font-bold mt-1">
                        Bs {(5 * parseFloat(formParams.costo_base_km || 0) * parseFloat(formParams.factor_altitud || 0) * parseFloat(formParams.factor_superficie || 0) + 10 * parseFloat(formParams.costo_minuto_detencion || 0)).toFixed(2)}
                        <span className="text-gray-600 text-xs ml-2 font-normal">tierra/complejo</span>
                      </p>
                    </div>

                    <div className="flex justify-end pt-2">
                      <button type="submit" disabled={guardandoParams} className="flex items-center space-x-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition tracking-wider text-sm">
                        {guardandoParams ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                        <span>{guardandoParams ? 'GUARDANDO...' : 'GUARDAR PARÁMETROS'}</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

      </main>
    </div>
  );
}