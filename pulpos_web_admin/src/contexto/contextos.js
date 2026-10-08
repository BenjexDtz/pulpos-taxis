import { createContext, useContext } from 'react';

export const TemaContexto = createContext(null);
export const BarraContexto = createContext(null);

export const useTema = () => useContext(TemaContexto);
export const useBarra = () => useContext(BarraContexto);
