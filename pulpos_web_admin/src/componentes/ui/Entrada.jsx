import { useEffect, useRef, useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { campo } from './estilos.js';

// setCustomValidity hace que el navegador no deje enviar el formulario y muestre el mensaje en el campo.
export default function Entrada({ error, esperar = false, className = '', onBlur, ...props }) {
  const ref = useRef(null);
  const [tocado, setTocado] = useState(false);

  useEffect(() => { ref.current?.setCustomValidity(error ?? ''); }, [error]);

  const visible = error && (!esperar || tocado);
  return (
    <>
      <input ref={ref} aria-invalid={Boolean(visible)} {...props}
        onBlur={e => { setTocado(true); onBlur?.(e); }}
        className={`${campo} ${visible ? '!border-error-500 focus:!ring-error-500/20' : ''} ${className}`} />
      {visible && (
        <p role="alert" className="mt-1.5 flex items-start gap-1.5 text-theme-xs text-error-600 dark:text-error-400">
          <CircleAlert className="mt-px h-3.5 w-3.5 shrink-0" />{error}
        </p>
      )}
    </>
  );
}
