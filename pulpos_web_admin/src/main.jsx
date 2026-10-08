import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import './index.css';
import App from './App.jsx';
import ProveedorTema from './contexto/ProveedorTema.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ProveedorTema>
        <App />
      </ProveedorTema>
    </BrowserRouter>
  </StrictMode>,
);
