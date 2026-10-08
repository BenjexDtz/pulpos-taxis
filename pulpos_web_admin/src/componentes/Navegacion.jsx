import { useState, useEffect } from 'react';
import { Radio, Wifi, WifiOff } from 'lucide-react';

export default function Navegacion({ empresa, esSuperadmin, items, vista, onIr, onSalir }) {
  const [conexion, setConexion] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setConexion(true), off = () => setConexion(false);
    window.addEventListener('online', on); window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const colorMarca = empresa?.color_primario ?? '#10b981';

  return (
    <nav className="bg-gray-900 border-b border-gray-800 sticky top-0 z-40">
      <div className="max-w-screen-2xl mx-auto px-4 lg:px-8 py-3 flex justify-between items-center">
        <div className="flex items-center space-x-3">
          {empresa?.logo_url
            ? <img src={empresa.logo_url} alt="" className="w-8 h-8 rounded-lg object-contain bg-gray-800" />
            : <div className="relative">
                <Radio className="w-7 h-7" style={{ color: colorMarca }} />
                <span className="absolute -top-0.5 -right-0.5 flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" /><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" /></span>
              </div>}
          <div className="flex items-baseline gap-2 min-w-0 max-w-[24rem]">
            <span className="truncate text-white font-bold text-xl tracking-widest">{esSuperadmin ? 'PLATAFORMA' : (empresa?.nombre ?? '').toUpperCase()}</span>
            <span className="shrink-0 font-bold text-xl tracking-widest" style={{ color: colorMarca }}>ADMIN</span>
          </div>
        </div>
        <div className="flex items-center space-x-1 bg-gray-800 p-1 rounded-xl">
          {items.map(item => (
            <button key={item.id} onClick={() => onIr(item.id)}
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-xs font-bold tracking-widest transition ${vista === item.id ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
              <item.icon className="w-4 h-4" /><span className="hidden md:inline">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center space-x-4">
          <div className="hidden md:flex items-center space-x-2">
            {conexion ? <Wifi className="w-4 h-4 text-green-500" /> : <WifiOff className="w-4 h-4 text-red-500" />}
            <span className="font-radar text-xs text-gray-500">{conexion ? 'EN LÍNEA' : 'SIN SEÑAL'}</span>
          </div>
          <button onClick={onSalir} className="font-radar text-xs text-gray-600 hover:text-red-400 transition uppercase tracking-widest">SALIR</button>
        </div>
      </div>
    </nav>
  );
}
