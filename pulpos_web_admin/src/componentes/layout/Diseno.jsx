import Cabecera from './Cabecera.jsx';

export default function Diseno({ empresa, esSuperadmin, secciones, titulo, sesion, onSalir, children }) {
  return (
    <div className="min-h-screen">
      <Cabecera empresa={empresa} esSuperadmin={esSuperadmin} secciones={secciones} sesion={sesion} onSalir={onSalir} />
      <main className="mx-auto max-w-screen-2xl p-4 md:p-6">
        {titulo && <h1 className="mb-5 text-xl font-semibold text-gray-800 dark:text-white/90">{titulo}</h1>}
        {children}
      </main>
    </div>
  );
}
