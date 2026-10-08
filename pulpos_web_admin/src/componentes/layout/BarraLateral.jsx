import { NavLink } from 'react-router';
import { Radio, Ellipsis } from 'lucide-react';
import { useBarra } from '../../contexto/contextos.js';

function Marca({ empresa, esSuperadmin, completa }) {
  const nombre = esSuperadmin ? 'Plataforma' : empresa?.nombre ?? '';
  return (
    <div className="flex min-w-0 items-center gap-3">
      {empresa?.logo_url && !esSuperadmin
        ? <img src={empresa.logo_url} alt="" className="h-9 w-9 shrink-0 rounded-lg bg-gray-100 object-contain dark:bg-gray-800" />
        : (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-500 text-white">
            <Radio className="h-5 w-5" />
          </span>
        )}
      {completa && (
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-gray-800 dark:text-white/90">{nombre}</p>
          <p className="text-theme-xs text-gray-500 dark:text-gray-400">Central de operaciones</p>
        </div>
      )}
    </div>
  );
}

export default function BarraLateral({ empresa, esSuperadmin, grupos }) {
  const { expandida, abiertaMovil, sobrevolada, setSobrevolada, setAbiertaMovil } = useBarra();
  const completa = expandida || sobrevolada || abiertaMovil;

  return (
    <aside
      aria-label="Menú principal"
      className={`fixed top-0 left-0 z-50 flex h-screen flex-col border-r border-gray-200 bg-white px-5 transition-all duration-300 ease-in-out xl:translate-x-0 dark:border-gray-800 dark:bg-gray-900
        ${completa ? 'w-[290px]' : 'w-[90px]'} ${abiertaMovil ? 'translate-x-0' : '-translate-x-full'}`}
      onMouseEnter={() => !expandida && setSobrevolada(true)}
      onMouseLeave={() => setSobrevolada(false)}
    >
      <div className={`flex py-7 ${completa ? 'justify-start' : 'xl:justify-center'}`}>
        <Marca empresa={empresa} esSuperadmin={esSuperadmin} completa={completa} />
      </div>

      <nav className="no-scrollbar flex flex-col gap-6 overflow-y-auto pb-6">
        {grupos.map(grupo => (
          <div key={grupo.titulo}>
            <h2 className={`mb-3 flex text-xs leading-5 text-gray-400 uppercase ${completa ? 'justify-start' : 'xl:justify-center'}`}>
              {completa ? grupo.titulo : <Ellipsis className="h-5 w-5" />}
            </h2>
            <ul className="flex flex-col gap-1">
              {grupo.items.map(({ ruta, icono: Icono, etiqueta }) => (
                <li key={ruta}>
                  <NavLink to={ruta} end={ruta === '/'} title={completa ? undefined : etiqueta}
                    onClick={() => setAbiertaMovil(false)}
                    className={({ isActive }) => `group menu-item ${isActive ? 'menu-item-active' : 'menu-item-inactive'} ${completa ? '' : 'xl:justify-center'}`}>
                    {({ isActive }) => (
                      <>
                        <Icono className={`h-5 w-5 shrink-0 ${isActive ? 'text-brand-500 dark:text-brand-400' : 'text-gray-500 group-hover:text-gray-700 dark:text-gray-400 dark:group-hover:text-gray-300'}`} />
                        {completa && <span>{etiqueta}</span>}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
