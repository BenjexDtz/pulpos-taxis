const COLORES = {
  marca: 'bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-400',
  exito: 'bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-500',
  error: 'bg-error-50 text-error-600 dark:bg-error-500/15 dark:text-error-500',
  aviso: 'bg-warning-50 text-warning-600 dark:bg-warning-500/15 dark:text-orange-400',
  neutro: 'bg-gray-100 text-gray-700 dark:bg-white/5 dark:text-white/80',
};

export default function Insignia({ color = 'neutro', children, className = '' }) {
  return (
    <span className={`inline-flex items-center justify-center gap-1 rounded-full px-2.5 py-0.5 text-theme-xs font-medium ${COLORES[color] ?? COLORES.neutro} ${className}`}>
      {children}
    </span>
  );
}
