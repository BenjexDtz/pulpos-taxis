import { describe, test, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Users } from 'lucide-react';
import Mensaje from '../src/componentes/Mensaje.jsx';
import Insignia from '../src/componentes/ui/Insignia.jsx';
import Tarjeta from '../src/componentes/ui/Tarjeta.jsx';
import Entrada from '../src/componentes/ui/Entrada.jsx';
import { campoEnLinea, botonPrimario } from '../src/componentes/ui/estilos.js';
import Visor from '../src/componentes/tablero/Visor.jsx';
import ProveedorTema from '../src/contexto/ProveedorTema.jsx';
import { useTema } from '../src/contexto/contextos.js';

describe('Mensaje', () => {
  test('no se muestra sin texto', () => {
    const { container } = render(<Mensaje texto="" />);
    expect(container).toBeEmptyDOMElement();
  });

  test('un error es una alerta y se le quitan los emojis del servidor', () => {
    render(<Mensaje texto="❌ Credenciales incorrectas" />);
    expect(screen.getByRole('alert')).toHaveTextContent(/^Credenciales incorrectas$/);
  });

  test('un éxito es un estado y se puede cerrar', async () => {
    const onCerrar = vi.fn();
    render(<Mensaje tipo="exito" texto="✅ Guardado" onCerrar={onCerrar} />);
    expect(screen.getByRole('status')).toHaveTextContent('Guardado');
    await userEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onCerrar).toHaveBeenCalledOnce();
  });
});

describe('Insignia, Tarjeta y estilos', () => {
  test('Insignia usa el color pedido o el neutro si no existe', () => {
    render(<><Insignia color="exito">Activo</Insignia><Insignia color="raro">Otro</Insignia></>);
    expect(screen.getByText('Activo').className).toMatch(/success/);
    expect(screen.getByText('Otro').className).toMatch(/gray-100/);
  });

  test('Tarjeta muestra título, subtítulo y acciones solo si los recibe', () => {
    const { rerender } = render(<Tarjeta icono={Users} titulo="Conductores" subtitulo="3 activos" acciones={<button>Recargar</button>}>cuerpo</Tarjeta>);
    expect(screen.getByRole('heading', { name: 'Conductores' })).toBeInTheDocument();
    expect(screen.getByText('3 activos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recargar' })).toBeInTheDocument();
    rerender(<Tarjeta>solo cuerpo</Tarjeta>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('solo cuerpo')).toBeInTheDocument();
  });

  test('las clases en línea no ocupan todo el ancho en pantallas grandes', () => {
    expect(campoEnLinea).toContain('sm:w-auto');
    expect(botonPrimario).toContain('disabled:opacity-50');
  });

  test('Visor muestra cada cifra con su variación', () => {
    render(<Visor titulo="Hoy" nota="cada 15 s" cifras={[
      { etiqueta: 'Viajes', valor: '12', cambio: 25, detalle: 'todos cuadran' },
      { etiqueta: 'Km', valor: '40', cambio: -10 },
      { etiqueta: 'Espera', valor: '5 min', cambio: null },
    ]} />);
    expect(screen.getByRole('region', { name: 'Hoy' })).toHaveTextContent('cada 15 s');
    expect(screen.getByText(/▲ 25.0%/)).toBeInTheDocument();
    expect(screen.getByText(/▼ 10.0%/)).toBeInTheDocument();
    expect(screen.getByText('todos cuadran')).toBeInTheDocument();
  });
});

describe('Entrada', () => {
  function Campo({ esperar, validar }) {
    const [v, setV] = useState('');
    return (
      <form aria-label="f">
        <label htmlFor="c">Placa</label>
        <Entrada id="c" value={v} onChange={e => setV(e.target.value)} error={validar(v)} esperar={esperar?.(v)} />
      </form>
    );
  }
  const validar = (v) => (v && !/^\d{4}[A-Z]{3}$/.test(v) ? 'Placa inválida' : null);

  test('muestra el error, marca el campo inválido y bloquea el envío del formulario', async () => {
    render(<Campo validar={validar} />);
    const campo = screen.getByLabelText('Placa');
    await userEvent.type(campo, 'XX');
    expect(screen.getByRole('alert')).toHaveTextContent('Placa inválida');
    expect(campo).toHaveAttribute('aria-invalid', 'true');
    expect(campo.validationMessage).toBe('Placa inválida');
    expect(screen.getByRole('form').checkValidity()).toBe(false);
  });

  test('con "esperar" no avisa mientras se escribe, sino al salir del campo', async () => {
    render(<Campo validar={validar} esperar={() => true} />);
    const campo = screen.getByLabelText('Placa');
    await userEvent.type(campo, '12');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    await userEvent.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('Placa inválida');
  });
});

describe('ProveedorTema', () => {
  function Boton() {
    const { tema, alternar } = useTema();
    return <button onClick={alternar}>{tema}</button>;
  }

  test('arranca en oscuro, alterna y recuerda la elección', async () => {
    render(<ProveedorTema><Boton /></ProveedorTema>);
    expect(screen.getByRole('button')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
    await userEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toHaveTextContent('light');
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('tema')).toBe('light');
  });

  test('respeta el tema claro guardado', () => {
    localStorage.setItem('tema', 'light');
    render(<ProveedorTema><Boton /></ProveedorTema>);
    expect(screen.getByRole('button')).toHaveTextContent('light');
  });
});
