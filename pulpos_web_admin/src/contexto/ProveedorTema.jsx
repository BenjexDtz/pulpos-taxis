import { useEffect, useState } from 'react';
import { TemaContexto } from './contextos.js';

const leerTema = () => {
  try { return localStorage.getItem('tema') === 'light' ? 'light' : 'dark'; } catch { return 'dark'; }
};

export default function ProveedorTema({ children }) {
  const [tema, setTema] = useState(leerTema);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', tema === 'dark');
    document.documentElement.style.colorScheme = tema;
    try { localStorage.setItem('tema', tema); } catch { /* sin almacenamiento: el tema dura la sesión */ }
  }, [tema]);

  const alternar = () => setTema(t => (t === 'dark' ? 'light' : 'dark'));

  return <TemaContexto.Provider value={{ tema, alternar }}>{children}</TemaContexto.Provider>;
}
