import { useBarra } from '../../contexto/contextos.js';
import BarraLateral from './BarraLateral.jsx';
import Cabecera from './Cabecera.jsx';

export default function Diseno({ empresa, esSuperadmin, grupos, titulo, sesion, onSalir, children }) {
  const { expandida, abiertaMovil, setAbiertaMovil } = useBarra();

  return (
    <div className="min-h-screen xl:flex">
      <BarraLateral empresa={empresa} esSuperadmin={esSuperadmin} grupos={grupos} />
      {abiertaMovil && (
        <div className="fixed inset-0 z-40 bg-gray-900/50 xl:hidden" onClick={() => setAbiertaMovil(false)} aria-hidden="true" />
      )}
      <div className={`min-w-0 flex-1 transition-[margin] duration-300 ease-in-out ${expandida ? 'xl:ml-[290px]' : 'xl:ml-[90px]'}`}>
        <Cabecera titulo={titulo} sesion={sesion} empresa={empresa} onSalir={onSalir} />
        <main className="mx-auto max-w-screen-2xl p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
