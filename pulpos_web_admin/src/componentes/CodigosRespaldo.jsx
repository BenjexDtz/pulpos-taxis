import { useState } from 'react';
import { Check, Copy, Download } from 'lucide-react';
import { botonSecundario } from './ui/estilos.js';

export default function CodigosRespaldo({ codigos, cuenta }) {
  const [copiado, setCopiado] = useState(false);
  const texto = `Códigos de respaldo · ${cuenta}\nCada código sirve una sola vez.\n\n${codigos.join('\n')}\n`;
  const descargar = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([texto], { type: 'text/plain' }));
    a.download = 'codigos_respaldo.txt';
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); setCopiado(true); } catch { setCopiado(false); }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 rounded-xl border border-gray-200 bg-gray-50 p-4 dark:border-gray-800 dark:bg-white/[0.03]">
        {codigos.map(c => <code key={c} className="text-center font-mono text-sm font-medium text-gray-800 dark:text-white/90">{c}</code>)}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={descargar} className={`${botonSecundario} flex-1`}>
          <Download className="h-4 w-4" />Descargar .txt
        </button>
        <button type="button" onClick={copiar} className={`${botonSecundario} flex-1`}>
          {copiado ? <Check className="h-4 w-4 text-success-500" /> : <Copy className="h-4 w-4" />}{copiado ? 'Copiados' : 'Copiar'}
        </button>
      </div>
    </div>
  );
}
