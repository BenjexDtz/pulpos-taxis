import { Fragment, useEffect, useRef, useState } from 'react';
import { Link, NavLink } from 'react-router';
import { ChevronDown, LogOut, Moon, Radio, ShieldCheck, Sun } from 'lucide-react';
import { useTema } from '../../contexto/contextos.js';

const ROLES = { superadmin: 'Superadministrador', gerente: 'Gerente', supervisor: 'Supervisor' };

const iniciales = (nombre = '') => nombre.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?';

function Marca({ empresa, esSuperadmin }) {
  const nombre = esSuperadmin ? 'Plataforma' : empresa?.nombre ?? '';
  return (
    <Link to="/" className="flex min-w-0 items-center gap-3">
      {empresa?.logo_url && !esSuperadmin
        ? <img src={empresa.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-md bg-gray-100 object-contain dark:bg-white/10" />
        : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-brand-500 text-white">
            <Radio className="h-5 w-5" />
          </span>
        )}
      <span className="min-w-0 leading-tight">
        <span className="block truncate font-semibold text-gray-900 dark:text-white">{nombre}</span>
        <span className="block text-[11px] tracking-[0.18em] text-gray-500 uppercase dark:text-gray-400">Central de radio taxis</span>
      </span>
    </Link>
  );
}

// Los grupos de secciones se separan con una línea vertical.
function Pestanas({ secciones, className = '' }) {
  return (
    <nav aria-label="Secciones" className={className}>
      {secciones.map((grupo, i) => (
        <Fragment key={grupo[0].ruta}>
          {i > 0 && <span className="mx-2 h-5 w-px shrink-0 bg-gray-200 dark:bg-white/15" aria-hidden="true" />}
          {grupo.map(({ ruta, etiqueta }) => (
            <NavLink key={ruta} to={ruta} end={ruta === '/'}
              className={({ isActive }) => `relative flex h-12 shrink-0 items-center px-3 text-sm font-medium transition-colors ${isActive
                ? 'text-gray-900 after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:bg-brand-500 dark:text-white'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white'}`}>
              {etiqueta}
            </NavLink>
          ))}
        </Fragment>
      ))}
    </nav>
  );
}

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
        className="flex items-center gap-2.5 text-gray-500 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white">
        <span className="flex h-9 w-9 items-center justify-center rounded-md bg-gray-100 text-sm font-semibold text-gray-800 dark:bg-white/10 dark:text-white">
          {iniciales(sesion?.nombre)}
        </span>
        <span className="hidden text-left leading-tight md:block">
          <span className="block text-sm font-medium text-gray-900 dark:text-white">{sesion?.nombre}</span>
          <span className="block text-xs text-gray-500 dark:text-gray-400">{ROLES[sesion?.rol] ?? sesion?.rol}</span>
        </span>
        <ChevronDown className={`h-4 w-4 transition-transform ${abierto ? 'rotate-180' : ''}`} />
      </button>

      {abierto && (
        <div role="menu" className="absolute right-0 mt-3 w-64 rounded-md border border-gray-200 bg-white p-2 shadow-theme-lg dark:border-gray-800 dark:bg-gray-900">
          <div className="border-b border-gray-200 px-3 pt-1 pb-3 dark:border-gray-800">
            <p className="text-theme-sm font-medium text-gray-700 dark:text-gray-300">{sesion?.nombre}</p>
            <p className="text-theme-xs text-gray-500 dark:text-gray-400">
              {ROLES[sesion?.rol] ?? sesion?.rol}{empresa?.nombre ? ` · ${empresa.nombre}` : ''}
            </p>
          </div>
          <ul className="flex flex-col gap-1 pt-2">
            <li>
              <Link to="/seguridad" role="menuitem" onClick={() => setAbierto(false)}
                className="flex items-center gap-3 rounded px-3 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300">
                <ShieldCheck className="h-5 w-5 text-gray-500" />Seguridad de la cuenta
              </Link>
            </li>
            <li>
              <button role="menuitem" onClick={onSalir}
                className="flex w-full items-center gap-3 rounded px-3 py-2 text-theme-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-gray-300">
                <LogOut className="h-5 w-5 text-gray-500" />Cerrar sesión
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
}

export default function Cabecera({ empresa, esSuperadmin, secciones, sesion, onSalir }) {
  const { tema, alternar: alternarTema } = useTema();
  const [conexion, setConexion] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setConexion(true), off = () => setConexion(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  return (
    <header className="sticky top-0 z-40 border-t-4 border-b border-t-brand-500 border-b-gray-200 bg-white dark:border-b-white/10 dark:bg-gray-900">
      <div className="mx-auto flex h-16 max-w-screen-2xl items-center justify-between gap-4 px-4 md:px-6">
        <Marca empresa={empresa} esSuperadmin={esSuperadmin} />
        <Pestanas secciones={secciones} className="hidden h-16 flex-1 items-center justify-center xl:flex [&>a]:h-16" />
        <div className="flex shrink-0 items-center gap-3">
          <span className="hidden items-center gap-2 text-xs text-gray-500 md:flex dark:text-gray-400" role="status">
            <span className={`h-2 w-2 rounded-full ${conexion ? 'bg-success-500' : 'bg-error-500'}`} />
            {conexion ? 'En línea' : 'Sin conexión'}
          </span>
          <button onClick={alternarTema} aria-label={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            className="flex h-9 w-9 items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-white">
            {tema === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
          <MenuUsuario sesion={sesion} empresa={empresa} onSalir={onSalir} />
        </div>
      </div>
      <Pestanas secciones={secciones} className="no-scrollbar flex items-center overflow-x-auto border-t border-gray-200 px-2 xl:hidden dark:border-white/10" />
    </header>
  );
}
