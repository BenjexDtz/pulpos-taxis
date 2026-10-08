import { useState } from 'react';
import axios from 'axios';
import { Eye, EyeOff, Moon, Radio, RefreshCw, Sun } from 'lucide-react';
import SegundoFactor from './SegundoFactor.jsx';
import Mensaje from './Mensaje.jsx';
import { botonPrimario, campo, etiqueta } from './ui/estilos.js';
import { useTema } from '../contexto/contextos.js';

function PanelMarca() {
  return (
    <div className="relative hidden w-full items-center overflow-hidden bg-brand-950 lg:grid lg:min-h-screen lg:w-1/2 dark:bg-white/5">
      <img src="/imagenes/cuadricula.svg" alt="" className="absolute top-0 right-0 w-full max-w-[250px] xl:max-w-[450px]" />
      <img src="/imagenes/cuadricula.svg" alt="" className="absolute bottom-0 left-0 w-full max-w-[250px] rotate-180 xl:max-w-[450px]" />
      <div className="relative flex flex-col items-center px-10 text-center">
        <span className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-theme-lg">
          <Radio className="h-8 w-8" />
        </span>
        <h2 className="mb-3 text-title-sm font-semibold text-white">Central de operaciones</h2>
        <p className="max-w-xs text-gray-400 dark:text-white/60">
          Tarificación de radio taxis con parámetros topográficos, flota en tiempo real y auditoría.
        </p>
      </div>
    </div>
  );
}

export default function Login({ urlServidor, onSesion }) {
  const { tema, alternar } = useTema();
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
  const [verPassword, setVerPassword] = useState(false);
  const [errorLogin, setErrorLogin] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [mfaPendiente, setMfaPendiente] = useState(null);

  const iniciarSesion = async (e) => {
    e.preventDefault(); setErrorLogin(''); setLoginLoading(true);
    try {
      const res = await axios.post(`${urlServidor}/api/admin/login`, { usuario, password });
      setMfaPendiente({ etapa: res.data.mfa, token_mfa: res.data.token_mfa });
      setPassword('');
    } catch (err) { setErrorLogin(err.response?.data?.error || '⚠️ Error conectando al servidor.'); }
    finally { setLoginLoading(false); }
  };

  return (
    <div className="relative bg-white dark:bg-gray-900">
      <div className="flex min-h-screen w-full flex-col lg:flex-row">
        <div className="flex flex-1 flex-col justify-center px-6 py-10 sm:px-10">
          <div className="mx-auto w-full max-w-md">
            {mfaPendiente ? (
              <SegundoFactor urlServidor={urlServidor} pendiente={mfaPendiente} cuenta={usuario}
                onSesion={onSesion} onCancelar={() => { setMfaPendiente(null); setErrorLogin(''); }} />
            ) : (
              <>
                <div className="mb-8">
                  <span className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-white lg:hidden">
                    <Radio className="h-6 w-6" />
                  </span>
                  <h1 className="mb-2 text-title-sm font-semibold text-gray-800 sm:text-title-md dark:text-white/90">Iniciar sesión</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400">Ingresa con el correo y la contraseña de tu cuenta del panel.</p>
                </div>
                <Mensaje texto={errorLogin} className="mb-6" />
                <form onSubmit={iniciarSesion} className="space-y-6">
                  <div>
                    <label htmlFor="correo" className={etiqueta}>Correo <span className="text-error-500">*</span></label>
                    <input id="correo" type="email" required autoComplete="username" value={usuario}
                      onChange={e => setUsuario(e.target.value)} className={campo} placeholder="gerencia@empresa.bo" />
                  </div>
                  <div>
                    <label htmlFor="contrasena" className={etiqueta}>Contraseña <span className="text-error-500">*</span></label>
                    <div className="relative">
                      <input id="contrasena" type={verPassword ? 'text' : 'password'} required autoComplete="current-password"
                        value={password} onChange={e => setPassword(e.target.value)} className={`${campo} pr-12`} placeholder="••••••••" />
                      <button type="button" onClick={() => setVerPassword(!verPassword)}
                        aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                        className="absolute top-1/2 right-4 -translate-y-1/2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300">
                        {verPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                      </button>
                    </div>
                  </div>
                  <button type="submit" disabled={loginLoading} className={`${botonPrimario} w-full py-3`}>
                    {loginLoading && <RefreshCw className="h-4 w-4 animate-spin" />}
                    {loginLoading ? 'Verificando...' : 'Ingresar'}
                  </button>
                </form>
                <p className="mt-6 text-theme-xs text-gray-500 dark:text-gray-400">
                  Después de la contraseña se pide el código de tu app autenticadora (segundo factor).
                </p>
              </>
            )}
          </div>
        </div>
        <PanelMarca />
      </div>

      <button onClick={alternar} aria-label={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="fixed right-6 bottom-6 z-50 flex h-12 w-12 items-center justify-center rounded-full bg-brand-500 text-white shadow-theme-lg transition hover:bg-brand-600">
        {tema === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
    </div>
  );
}
