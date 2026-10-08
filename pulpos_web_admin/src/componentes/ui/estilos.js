// Clases de TailAdmin reutilizadas por todo el panel.

export const tarjeta = 'rounded-2xl border border-gray-200 bg-white dark:border-gray-800 dark:bg-white/[0.03]';

export const etiqueta = 'mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-400';

export const ayuda = 'mt-1.5 text-theme-xs text-gray-500 dark:text-gray-400';

export const campo = 'h-11 w-full rounded-lg border border-gray-300 bg-transparent px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-400 focus:border-brand-300 focus:ring-3 focus:ring-brand-500/20 focus:outline-hidden dark:border-gray-700 dark:bg-gray-900 dark:text-white/90 dark:placeholder:text-white/30 dark:focus:border-brand-800';

// Para filtros en una fila: mismo aspecto sin ocupar todo el ancho.
export const campoEnLinea = campo.replace('w-full ', 'w-auto ');

const boton = 'inline-flex items-center justify-center gap-2 rounded-lg text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50';

export const botonPrimario = `${boton} bg-brand-500 px-4 py-2.5 text-white shadow-theme-xs hover:bg-brand-600`;

export const botonSecundario = `${boton} border border-gray-300 bg-white px-4 py-2.5 text-gray-700 shadow-theme-xs hover:bg-gray-50 hover:text-gray-800 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-white/[0.03] dark:hover:text-gray-200`;

export const botonPeligro = `${boton} bg-error-500 px-4 py-2.5 text-white shadow-theme-xs hover:bg-error-600`;

export const botonIcono = 'inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-500 transition hover:bg-gray-100 hover:text-gray-700 dark:border-gray-800 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white';

export const th = 'px-5 py-3 text-start text-theme-xs font-medium text-gray-500 dark:text-gray-400';

export const td = 'px-5 py-4 text-theme-sm text-gray-600 dark:text-gray-400';

export const filaTabla = 'border-b border-gray-100 last:border-b-0 dark:border-gray-800';

export const tituloSeccion = 'text-lg font-semibold text-gray-800 dark:text-white/90';

export const subtitulo = 'text-theme-sm text-gray-500 dark:text-gray-400';
