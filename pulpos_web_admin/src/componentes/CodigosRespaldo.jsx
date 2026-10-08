import { useState } from 'react';
import { Copy, Download } from 'lucide-react';

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
      <div className="grid grid-cols-2 gap-2 bg-gray-950 border border-gray-800 rounded-xl p-4">
        {codigos.map(c => <code key={c} className="font-radar text-sm text-yellow-300 text-center">{c}</code>)}
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={descargar} className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 py-2 rounded-lg font-radar text-xs transition">
          <Download className="w-3.5 h-3.5" />DESCARGAR .TXT
        </button>
        <button type="button" onClick={copiar} className="flex-1 flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 py-2 rounded-lg font-radar text-xs transition">
          <Copy className="w-3.5 h-3.5" />{copiado ? 'COPIADOS' : 'COPIAR'}
        </button>
      </div>
    </div>
  );
}
