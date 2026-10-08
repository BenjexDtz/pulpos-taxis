import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Building2, Plus, Pencil, RefreshCw, ToggleLeft, ToggleRight, X, ShieldCheck, ShieldOff, Users } from 'lucide-react';
import FormEmpresa from '../componentes/FormEmpresa.jsx';
import Mensaje from '../componentes/Mensaje.jsx';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';
import Insignia from '../componentes/ui/Insignia.jsx';
import { botonIcono, botonPeligro, botonPrimario, botonSecundario, filaTabla, td, th } from '../componentes/ui/estilos.js';

export default function Plataforma({ urlServidor, headers, manejarErrorApi, usuarioId }) {
  const [empresas, setEmpresas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState('');
  const [edicion, setEdicion] = useState(null);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState({ tipo: '', texto: '' });
  const [admins, setAdmins] = useState([]);
  const [confirmarReset, setConfirmarReset] = useState(null);
  const [mensajeAdmins, setMensajeAdmins] = useState({ tipo: '', texto: '' });

  const pedirEmpresas = useCallback(
    () => axios.get(`${urlServidor}/api/plataforma/empresas`, { headers: headers() }),
    [urlServidor, headers]
  );

  const pedirAdmins = useCallback(
    () => axios.get(`${urlServidor}/api/plataforma/administradores`, { headers: headers() }),
    [urlServidor, headers]
  );

  useEffect(() => {
    let vigente = true;
    pedirAdmins()
      .then(r => { if (vigente) setAdmins(r.data); })
      .catch(err => { if (vigente) manejarErrorApi(err, setAviso); });
    return () => { vigente = false; };
  }, [pedirAdmins, manejarErrorApi]);

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
    try {
      setEmpresas((await pedirEmpresas()).data);
      setAdmins((await pedirAdmins()).data);
    }
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

  const restablecerMfa = async (admin) => {
    if (confirmarReset !== admin.id) { setConfirmarReset(admin.id); return; }
    setConfirmarReset(null);
    try {
      const res = await axios.post(`${urlServidor}/api/plataforma/administradores/${admin.id}/mfa/restablecer`, {}, { headers: headers() });
      setMensajeAdmins({ tipo: 'exito', texto: res.data.mensaje });
      recargar();
    } catch (err) { manejarErrorApi(err, texto => setMensajeAdmins({ tipo: 'error', texto })); }
  };

  if (edicion) return (
    <Tarjeta icono={Building2} className="max-w-4xl"
      titulo={edicion === 'nueva' ? 'Nueva empresa' : `Editar · ${edicion.nombre}`}
      subtitulo={edicion === 'nueva' ? 'Se crea con sus parámetros iniciales y su gerente.' : `Código: ${edicion.codigo}`}
      acciones={<button aria-label="Cerrar" onClick={() => setEdicion(null)} className={botonIcono}><X className="h-4 w-4" /></button>}>
      <FormEmpresa
        key={edicion === 'nueva' ? 'nueva' : edicion.id}
        inicial={edicion === 'nueva' ? {} : edicion}
        crear={edicion === 'nueva'}
        onGuardar={guardar}
        onCancelar={() => setEdicion(null)}
        guardando={guardando}
        mensaje={mensaje}
      />
    </Tarjeta>
  );

  return (
    <div className="space-y-6">
      <Mensaje texto={aviso} onCerrar={() => setAviso('')} />
      {mensaje.tipo === 'exito' && <Mensaje tipo="exito" texto={mensaje.texto} onCerrar={() => setMensaje({ tipo: '', texto: '' })} />}

      <Tarjeta icono={Building2} titulo="Empresas" cuerpo=""
        subtitulo={`${empresas.length} empresa${empresas.length !== 1 ? 's' : ''} · ${empresas.filter(e => e.activo).length} activas`}
        acciones={
          <>
            <button onClick={recargar} disabled={cargando} className={botonSecundario}>
              <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin' : ''}`} />Recargar
            </button>
            <button onClick={() => abrir('nueva')} className={botonPrimario}><Plus className="h-4 w-4" />Nueva empresa</button>
          </>
        }>
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Empresa', 'Ciudad', 'Moneda', 'Choferes', 'Viajes', 'Estado', 'Acciones'].map(h => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {!cargando && empresas.length === 0 && (
                <tr><td colSpan={7} className="py-12 text-center text-sm text-gray-500 dark:text-gray-400">Sin empresas.</td></tr>
              )}
              {empresas.map(e => (
                <tr key={e.id} className={`${filaTabla} ${!e.activo ? 'opacity-50' : ''}`}>
                  <td className={td}>
                    <div className="flex items-center gap-3">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: e.color_primario }} />
                      <div>
                        <p className="font-medium text-gray-800 dark:text-white/90">{e.nombre}</p>
                        <p className="text-theme-xs text-gray-500 dark:text-gray-400">{e.codigo}</p>
                      </div>
                    </div>
                  </td>
                  <td className={td}>{e.ciudad}, {e.pais}</td>
                  <td className={td}>{e.moneda_codigo} ({e.moneda_simbolo})</td>
                  <td className={td}>{e.total_choferes}</td>
                  <td className={td}>{e.total_viajes}</td>
                  <td className={td}>{e.activo ? <Insignia color="exito">Activa</Insignia> : <Insignia>Inactiva</Insignia>}</td>
                  <td className={td}>
                    <div className="flex items-center gap-2">
                      <button title="Editar" aria-label={`Editar ${e.nombre}`} onClick={() => abrir(e)} className={botonIcono}>
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button title={e.activo ? 'Desactivar' : 'Activar'} aria-label={`${e.activo ? 'Desactivar' : 'Activar'} ${e.nombre}`}
                        onClick={() => cambiarEstado(e)}
                        className={`${botonIcono} ${e.activo ? 'hover:border-error-300 hover:text-error-500' : 'hover:border-success-300 hover:text-success-600'}`}>
                        {e.activo ? <ToggleRight className="h-4 w-4" /> : <ToggleLeft className="h-4 w-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta icono={Users} titulo="Administradores" cuerpo=""
        subtitulo="Si alguien pierde su app autenticadora y sus códigos de respaldo, restablece su segundo factor: lo configurará de nuevo al entrar.">
        {mensajeAdmins.texto && (
          <div className="px-5 pt-4 sm:px-6">
            <Mensaje tipo={mensajeAdmins.tipo} texto={mensajeAdmins.texto} onCerrar={() => setMensajeAdmins({ tipo: '', texto: '' })} />
          </div>
        )}
        <div className="custom-scrollbar overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {['Nombre', 'Empresa', 'Rol', 'Segundo factor', 'Acciones'].map(h => <th key={h} className={th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {admins.map(a => (
                <tr key={a.id} className={`${filaTabla} ${!a.activo ? 'opacity-50' : ''}`}>
                  <td className={td}>
                    <p className="font-medium text-gray-800 dark:text-white/90">{a.nombre}</p>
                    <p className="text-theme-xs text-gray-500 dark:text-gray-400">{a.email}</p>
                  </td>
                  <td className={td}>{a.empresa_nombre ?? 'Plataforma'}</td>
                  <td className={`${td} capitalize`}>{a.rol}</td>
                  <td className={td}>
                    {a.mfa_activo
                      ? <Insignia color="exito"><ShieldCheck className="h-3 w-3" />Activo</Insignia>
                      : <Insignia color="aviso">Pendiente de configurar</Insignia>}
                  </td>
                  <td className={td}>
                    {a.mfa_activo && a.id !== usuarioId && (
                      <button onClick={() => restablecerMfa(a)} onBlur={() => setConfirmarReset(null)}
                        className={confirmarReset === a.id ? `${botonPeligro} px-3 py-2` : `${botonSecundario} px-3 py-2`}>
                        <ShieldOff className="h-4 w-4" />{confirmarReset === a.id ? '¿Confirmar?' : 'Restablecer'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
