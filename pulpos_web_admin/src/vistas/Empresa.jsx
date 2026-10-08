import { useState } from 'react';
import axios from 'axios';
import { Building2 } from 'lucide-react';
import FormEmpresa from '../componentes/FormEmpresa.jsx';

export default function Empresa({ empresa, setEmpresa, urlServidor, headers, manejarErrorApi }) {
  const [guardandoEmpresa, setGuardandoEmpresa] = useState(false);
  const [mensajeEmpresa, setMensajeEmpresa] = useState({ tipo: '', texto: '' });

  const guardarEmpresa = async (datos) => {
    setGuardandoEmpresa(true); setMensajeEmpresa({ tipo: '', texto: '' });
    try {
      const res = await axios.put(`${urlServidor}/api/admin/empresa`, datos, { headers: headers() });
      setEmpresa(res.data.empresa);
      setMensajeEmpresa({ tipo: 'exito', texto: res.data.mensaje });
    } catch (err) {
      manejarErrorApi(err, texto => setMensajeEmpresa({ tipo: 'error', texto }));
    } finally { setGuardandoEmpresa(false); }
  };

  return (
    <div className="max-w-3xl bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center space-x-3">
        <Building2 className="w-5 h-5 text-yellow-400" />
        <div>
          <h2 className="font-bold text-white tracking-wider">DATOS DE LA EMPRESA</h2>
          <p className="font-radar text-xs text-gray-600">Código para los choferes: <span className="text-yellow-400">{empresa?.codigo}</span></p>
        </div>
      </div>
      <div className="p-6">
        {empresa
          ? <FormEmpresa key={empresa.id} inicial={empresa} onGuardar={guardarEmpresa} guardando={guardandoEmpresa} mensaje={mensajeEmpresa} />
          : <div className="text-center py-10 text-gray-700 font-radar text-sm">Cargando...</div>}
      </div>
    </div>
  );
}
