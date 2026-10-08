import { useState } from 'react';
import axios from 'axios';
import { Building2 } from 'lucide-react';
import FormEmpresa from '../componentes/FormEmpresa.jsx';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';

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
    <Tarjeta icono={Building2} titulo={empresa?.nombre ?? 'Datos de la empresa'} className="max-w-4xl"
      subtitulo={<>Código para los choferes: <span className="font-medium text-brand-600 dark:text-brand-400">{empresa?.codigo}</span></>}>
      {empresa
        ? <FormEmpresa key={empresa.id} inicial={empresa} onGuardar={guardarEmpresa} guardando={guardandoEmpresa} mensaje={mensajeEmpresa} />
        : <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Cargando...</p>}
    </Tarjeta>
  );
}
