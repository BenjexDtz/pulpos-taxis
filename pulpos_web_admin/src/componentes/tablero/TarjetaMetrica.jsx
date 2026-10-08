import { ArrowDown, ArrowUp } from 'lucide-react';
import Insignia from '../ui/Insignia.jsx';
import { tarjeta } from '../ui/estilos.js';

export default function TarjetaMetrica({ icono: Icono, etiqueta, valor, cambio, detalle }) {
  const sube = cambio !== null && cambio !== undefined && cambio >= 0;
  return (
    <div className={`${tarjeta} p-5 md:p-6`}>
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gray-100 dark:bg-gray-800">
        <Icono className="h-6 w-6 text-gray-800 dark:text-white/90" />
      </div>
      <div className="mt-5 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <span className="text-sm text-gray-500 dark:text-gray-400">{etiqueta}</span>
          <h4 className="mt-2 truncate text-title-sm font-bold text-gray-800 dark:text-white/90">{valor}</h4>
        </div>
        {cambio !== null && cambio !== undefined && (
          <Insignia color={sube ? 'exito' : 'error'} className="shrink-0">
            {sube ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {Math.abs(cambio).toFixed(1)}%
          </Insignia>
        )}
      </div>
      {detalle && <p className="mt-2 text-theme-xs text-gray-500 dark:text-gray-400">{detalle}</p>}
    </div>
  );
}
