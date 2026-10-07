import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Building2, Plus, Pencil, RefreshCw, ToggleLeft, ToggleRight, X } from 'lucide-react';
import FormEmpresa from './FormEmpresa.jsx';

export default function Plataforma({ urlServidor, headers, manejarErrorApi }) {
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState('');
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });

  const pedirEmpresas = useCallback(
    () => axios.get(`${urlServidor}/api/plataforma/empresas`, { headers: headers() }),
    [urlServidor, headers]
  );

  useEffect(() => {
    let vigente = true;
    pedirEmpresas()
      .then(r => { if (vigente) setEmpresas(r.data); })
      .catch(err => { if (vigente) manejarErrorApi(err, setAviso); })
      .finally(() => { if (vigente) setCargando(false); });
    return () => { vigente = false; };
  }, [pedirEmpresas, manejarErrorApi]);

  const recargar = async () => {
    setCargando(true);
    try { setEmpresas((await pedirEmpresas()).data); }
    catch (err) { manejarErrorApi(err, setAviso); }
    finally { setCargando(false); }
  };

  const abrir = (empresa) => { setMensaje({ tipo: '', texto: '' }); setEdicion(empresa); };

  const guardar = async (datos) => {
    setGuardando(true); setMensaje({ tipo: '', texto: '' });
    try {
      const res = edicion === 'nueva'
        ? await axios.post(`${urlServidor}/api/plataforma/empresas`, datos, { headers: headers() })
        : await axios.put(`${urlServidor}/api/plataforma/empresas/${edicion.id}`, datos, { headers: headers() });
      setEdicion(null);
      setAviso('');
      setMensaje({ tipo: 'exito', texto: res.data.mensaje });
      recargar();
    } catch (err) {
      manejarErrorApi(err, texto => setMensaje({ tipo: 'error', texto }));
    } finally { setGuardando(false); }
  };

  const cambiarEstado = async (empresa) => {
    try {
      await axios.patch(`${urlServidor}/api/plataforma/empresas/${empresa.id}/estado`,
        { activo: !empresa.activo }, { headers: headers() });
      recargar();
    } catch (err) { manejarErrorApi(err, setAviso); }
  };

  if (edicion) return (
    <div className="max-w-3xl bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-800 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Building2 className="w-5 h-5 text-yellow-400" />
          <h2 className="font-bold text-white tracking-wider">
            {edicion === 'nueva' ? 'NUEVA EMPRESA' : `EDITAR · ${edicion.nombre.toUpperCase()}`}
          </h2>
        </div>
        <button onClick={() => setEdicion(null)} className="text-gray-600 hover:text-white"><X className="w-5 h-5" /></button>
      </div>
      <div className="p-6">
        <FormEmpresa
          key={edicion === 'nueva' ? 'nueva' : edicion.id}
          inicial={edicion === 'nueva' ? {} : edicion}
          crear={edicion === 'nueva'}
          onGuardar={guardar}
          onCancelar={() => setEdicion(null)}
          guardando={guardando}
          mensaje={mensaje}
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {aviso && <div className="p-3 rounded-xl font-radar text-sm bg-red-950 text-red-400 border border-red-800">{aviso}</div>}
      {mensaje.tipo === 'exito' && <div className="p-3 rounded-xl font-radar text-sm bg-green-950 text-green-400 border border-green-800">{mensaje.texto}</div>}

      <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-800 flex flex-wrap items-center gap-3">
          <div className="flex items-center space-x-3 mr-auto">
            <Building2 className="w-5 h-5 text-yellow-400" />
            <div>
              <h2 className="font-bold text-white tracking-wider">EMPRESAS DE LA PLATAFORMA</h2>
              <p className="font-radar text-xs text-gray-600">{empresas.length} empresa{empresas.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={recargar} disabled={cargando} className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-400 px-3 py-2 rounded-lg transition font-radar text-xs">
            <RefreshCw className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`} />RECARGAR
          </button>
          <button onClick={() => abrir('nueva')} className="flex items-center gap-2 bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded-lg transition font-radar text-xs font-bold">
            <Plus className="w-3.5 h-3.5" />NUEVA EMPRESA
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                {['EMPRESA', 'CIUDAD', 'MONEDA', 'CHOFERES', 'VIAJES', 'ESTADO', 'ACCIONES'].map(h =>
                  <th key={h} className="px-5 py-3 text-left font-radar text-xs text-gray-600 tracking-widest">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {!cargando && empresas.length === 0 && (
                <tr><td colSpan={7} className="text-center py-10 text-gray-700 font-radar text-sm">SIN EMPRESAS</td></tr>
              )}
              {empresas.map(e => (
                <tr key={e.id} className={`border-b border-gray-800 hover:bg-gray-800 transition ${!e.activo ? 'opacity-40' : ''}`}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: e.color_primario }} />
                      <div>
                        <div className="font-semibold text-white">{e.nombre}</div>
                        <div className="font-radar text-xs text-gray-500">{e.codigo}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-300 text-sm">{e.ciudad}, {e.pais}</td>
                  <td className="px-5 py-4 font-radar text-xs text-gray-400">{e.moneda_codigo} ({e.moneda_simbolo})</td>
                  <td className="px-5 py-4 font-radar text-blue-400">{e.total_choferes}</td>
                  <td className="px-5 py-4 font-radar text-green-400">{e.total_viajes}</td>
                  <td className="px-5 py-4 font-radar text-xs">{e.activo ? <span className="text-green-400">ACTIVA</span> : <span className="text-gray-500">INACTIVA</span>}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <button title="Editar" onClick={() => abrir(e)} className="p-2 rounded-lg bg-yellow-950 text-yellow-500 hover:bg-yellow-900 border border-yellow-800 transition">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button title={e.activo ? 'Desactivar' : 'Activar'} onClick={() => cambiarEstado(e)}
                        className={`p-2 rounded-lg border transition ${e.activo ? 'bg-red-950 text-red-500 hover:bg-red-900 border-red-800' : 'bg-green-950 text-green-500 hover:bg-green-900 border-green-800'}`}>
                        {e.activo ? <ToggleRight className="w-3.5 h-3.5" /> : <ToggleLeft className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
