import { useEffect, useState } from 'react';
import { BarraContexto } from './contextos.js';

const ANCHO_ESCRITORIO = 1280;

export default function ProveedorBarra({ children }) {
  const [expandida, setExpandida] = useState(true);
  const [abiertaMovil, setAbiertaMovil] = useState(false);
  const [sobrevolada, setSobrevolada] = useState(false);
  const [esMovil, setEsMovil] = useState(() => window.innerWidth < ANCHO_ESCRITORIO);

  useEffect(() => {
    const alCambiar = () => {
      const movil = window.innerWidth < ANCHO_ESCRITORIO;
      setEsMovil(movil);
      if (!movil) setAbiertaMovil(false);
    };
    window.addEventListener('resize', alCambiar);
    return () => window.removeEventListener('resize', alCambiar);
  }, []);

  const alternar = () => (esMovil ? setAbiertaMovil(a => !a) : setExpandida(e => !e));

  const valor = {
    expandida: !esMovil && expandida,
    abiertaMovil,
    sobrevolada,
    setSobrevolada,
    setAbiertaMovil,
    alternar,
  };
  return <BarraContexto.Provider value={valor}>{children}</BarraContexto.Provider>;
}
