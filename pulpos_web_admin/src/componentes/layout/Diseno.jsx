import Cabecera from './Cabecera.jsx';
import { contenedor } from '../ui/estilos.js';

export default function Diseno({ empresa, esSuperadmin, secciones, titulo, sesion, onSalir, children }) {
  return (
    <div className="min-h-screen">
      <Cabecera empresa={empresa} esSuperadmin={esSuperadmin} secciones={secciones} sesion={sesion} onSalir={onSalir} />
      <main className={`${contenedor} p-4 md:p-6`}>
        {titulo && <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90">{titulo}</h1>}
        {children}
      </main>
    </div>
  );
}
