import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ChevronDown, LogOut, Menu, Moon, ShieldCheck, Sun, Wifi, WifiOff, X } from 'lucide-react';
import { useBarra, useTema } from '../../contexto/contextos.js';

const ROLES = { superadmin: 'Superadministrador', gerente: 'Gerente', supervisor: 'Supervisor' };

const iniciales = (nombre = '') => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

function MenuUsuario({ sesion, empresa, onSalir }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!abierto) return;
    const fuera = (e) => { if (!ref.current?.contains(e.target)) setAbierto(false); };
    const escape = (e) => { if (e.key === 'Escape') setAbierto(false); };
    document.addEventListener('mousedown', fuera);
    document.addEventListener('keydown', escape);
    return () => { document.removeEventListener('mousedown', fuera); document.removeEventListener('keydown', escape); };
  }, [abierto]);

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-haspopup="menu"
        className="flex items-center gap-3 text-gray-700 dark:text-gray-400">
        <span className="flex h-11 w-11 items-center justify-center rounded-full bg-brand-500 text-sm font-semibold text-white">
          {iniciales(sesion?.nombre)}
        </span>
        <span className="hidden text-left sm:block">
          <span className="block text-theme-sm font-medium text-gray-700 dark:text-gray-300">{sesion?.nombre}</span>
          <span className="block text-theme-xs text-gray-500 dark:text-gray-400">{ROLES[sesion?.rol] ?? sesion?.rol}</span>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 mt-4 w-64 rounded-2xl border border-gray-200 bg-white p-3 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-3 pb-3 dark:border-gray-800">
            <p className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">{sesion?.nombre}</p>
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">
              {ROLES[sesion?.rol] ?? sesion?.rol}{empresa?.nombre ? ` · ${empresa.nombre}` : ''}
            </p>
          </div>
          <ul className="flex flex-col gap-1 pt-3">
            <li>
              <Link to="/seguridad" role="menuitem" onClick={() => setAbierto(false)}
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300">
                <ShieldCheck className="h-5 w-5 text-gray-500" />Seguridad de la cuenta
              </Link>
            </li>
            <li>
              <button role="menuitem" onClick={onSalir}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300">
                <LogOut className="h-5 w-5 text-gray-500" />Cerrar sesión
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Cabecera({ titulo, sesion, empresa, onSalir }) {
  const { alternar, abiertaMovil } = useBarra();
  const { tema, alternar: alternarTema } = useTema();
  const [conexion, setConexion] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setConexion(true), off = () => setConexion(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <header className="sticky top-0 z-40 flex w-full border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-3 xl:px-6 xl:py-4">
        <div className="flex min-w-0 items-center gap-3">
          <button onClick={alternar} aria-label={abiertaMovil ? 'Cerrar menú' : 'Mostrar u ocultar el menú'}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-100 lg:h-11 lg:w-11 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5">
            {abiertaMovil ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <h1 className="truncate text-lg font-semibold text-gray-800 sm:text-xl dark:text-white/90">{titulo}</h1>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <span className={`hidden items-center gap-1.5 rounded-full px-3 py-1 text-theme-xs font-medium md:inline-flex ${conexion
            ? 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500'
            : 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500'}`}>
            {conexion ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
            {conexion ? 'En línea' : 'Sin conexión'}
          </span>
          <button onClick={alternarTema} aria-label={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:bg-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white">
            {tema === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <MenuUsuario sesion={sesion} empresa={empresa} onSalir={onSalir} />
        </div>
      </div>
    </header>
  );
}
