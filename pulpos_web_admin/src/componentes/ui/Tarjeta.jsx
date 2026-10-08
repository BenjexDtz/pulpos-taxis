import { tarjeta, tituloSeccion, subtitulo as estiloSubtitulo } from './estilos.js';

export default function Tarjeta({ titulo, subtitulo, icono: Icono, acciones, children, className = '', cuerpo = 'p-5 sm:p-6' }) {
  const conCabecera = titulo || acciones;
  return (
    <section className={`${tarjeta} ${className}`}>
      {conCabecera && (
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-5 py-4 sm:px-6 dark:border-gray-800">
          <div className="flex min-w-0 items-center gap-3">
            {Icono && (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400">
                <Icono className="h-5 w-5" />
              </span>
            )}
            <div className="min-w-0">
              <h2 className={tituloSeccion}>{titulo}</h2>
              {subtitulo && <p className={estiloSubtitulo}>{subtitulo}</p>}
            </div>
          </div>
          {acciones && <div className="flex flex-wrap items-center gap-2">{acciones}</div>}
        </header>
      )}
      <div className={cuerpo}>{children}</div>
    </section>
  );
}
