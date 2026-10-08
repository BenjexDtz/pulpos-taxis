import { useState } from 'react';
import axios from 'axios';
import { AlertCircle, Lock, Radio, RefreshCw, User } from 'lucide-react';
import SegundoFactor from './SegundoFactor.jsx';

export default function Login({ urlServidor, onSesion }) {
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');
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
  <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
    <style>{`@import url('https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=Rajdhani:wght@400;600;700&display=swap'); body{background:#030712;} .font-radar{font-family:'Share Tech Mono',monospace;}`}</style>
    <div className="w-full max-w-md">
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full border-2 border-green-500 mb-4 relative" style={{ boxShadow: '0 0 30px #10b98140' }}>
          <Radio className="w-9 h-9 text-green-400" />
          <span className="absolute top-0 right-0 flex h-3 w-3"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" /></span>
        </div>
        <h1 className="text-4xl font-bold text-white tracking-widest" style={{ fontFamily: 'Rajdhani' }}>RADIO TAXIS</h1>
        <p className="font-radar text-green-500 text-xs tracking-[0.4em] mt-1">CENTRAL DE OPERACIONES</p>
        <p className="text-gray-600 text-xs mt-2 font-radar">Plataforma de tarificación</p>
      </div>
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8" style={{ boxShadow: '0 0 60px #10b98108' }}>
        {mfaPendiente ? (
          <SegundoFactor urlServidor={urlServidor} pendiente={mfaPendiente} cuenta={usuario}
            onSesion={onSesion} onCancelar={() => { setMfaPendiente(null); setErrorLogin(''); }} />
        ) : <>
        {errorLogin && <div className="flex items-center space-x-2 bg-red-950 border border-red-800 text-red-400 p-3 rounded-lg mb-6 font-radar text-sm"><AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{errorLogin}</span></div>}
        <form onSubmit={iniciarSesion} className="space-y-5">
          <div>
            <label className="font-radar text-xs text-gray-500 tracking-widest block mb-2">CORREO</label>
            <div className="relative"><User className="w-4 h-4 absolute left-4 top-3.5 text-gray-600" />
              <input type="email" value={usuario} onChange={e => setUsuario(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white pl-11 pr-4 py-3 rounded-xl font-radar text-sm focus:outline-none focus:border-green-500 transition placeholder-gray-700" placeholder="gerencia@empresa.bo" /></div>
          </div>
          <div>
            <label className="font-radar text-xs text-gray-500 tracking-widest block mb-2">CONTRASEÑA</label>
            <div className="relative"><Lock className="w-4 h-4 absolute left-4 top-3.5 text-gray-600" />
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full bg-gray-800 border border-gray-700 text-white pl-11 pr-4 py-3 rounded-xl font-radar text-sm focus:outline-none focus:border-green-500 transition placeholder-gray-700" placeholder="••••••••" /></div>
          </div>
          <button type="submit" disabled={loginLoading} className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition tracking-widest text-sm flex items-center justify-center space-x-2" style={{ fontFamily: 'Rajdhani', boxShadow: loginLoading ? 'none' : '0 0 20px #10b98140' }}>
            {loginLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
            <span>{loginLoading ? 'VERIFICANDO...' : 'ACCEDER AL SISTEMA'}</span>
          </button>
        </form>
        </>}
      </div>
    </div>
  </div>
  );
}
