import { useState } from 'react';
import { RefreshCw, Save, Building2, MapPin, Coins, UserCog } from 'lucide-react';
import Mensaje from './Mensaje.jsx';
import { ayuda as estiloAyuda, botonPrimario, botonSecundario, campo, etiqueta } from './ui/estilos.js';

const VACIA = {
  codigo: '', nombre: '', nit: '', telefono: '', email: '', direccion: '',
  ciudad: '', pais: 'Bolivia', zona_horaria: 'America/La_Paz',
  moneda_codigo: 'BOB', moneda_simbolo: 'Bs',
  centro_lat: '', centro_lng: '', radio_operacion_km: 50, altitud_msnm: '',
  color_primario: '#10b981', logo_url: '',
  gerente: { nombre: '', email: '', password: '' },
};

const ZONAS = [
  'America/La_Paz', 'America/Lima', 'America/Bogota', 'America/Guayaquil', 'America/Santiago',
  'America/Argentina/Buenos_Aires', 'America/Asuncion', 'America/Montevideo', 'America/Caracas',
  'America/Mexico_City',
];

const estiloInput = campo;

function Campo({ label, ayuda, ancho, children }) {
  return (
    <div className={ancho}>
      <label className={etiqueta}>{label}</label>
      {children}
      {ayuda && <p className={estiloAyuda}>{ayuda}</p>}
    </div>
  );
}

function Seccion({ icon: Icon, titulo, children }) {
  return (
    <fieldset className="border-t border-gray-100 pt-6 first-of-type:border-t-0 first-of-type:pt-0 dark:border-gray-800">
      <legend className="mb-4 flex items-center gap-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
        <Icon className="h-4 w-4 text-brand-500" />{titulo}
      </legend>
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export default function FormEmpresa({ inicial, crear = false, onGuardar, onCancelar, guardando, mensaje }) {
  const [f, setF] = useState(() => {
    const base = { ...VACIA, ...inicial };
    for (const k of Object.keys(base)) if (base[k] === null) base[k] = '';
    return base;
  });
  const cambiar = (campo) => (e) => setF({ ...f, [campo]: e.target.value });
  const cambiarGerente = (campo) => (e) => setF({ ...f, gerente: { ...f.gerente, [campo]: e.target.value } });

  const enviar = (e) => {
    e.preventDefault();
    const datos = { ...f };
    if (!crear) { delete datos.codigo; delete datos.gerente; }
    onGuardar(datos);
  };

  return (
    <form onSubmit={enviar} className="space-y-6">
      <Mensaje tipo={mensaje?.tipo} texto={mensaje?.texto} />

      <Seccion icon={Building2} titulo="Identidad">
        {crear && (
          <Campo label="Código" ayuda="Lo escriben los choferes al iniciar sesión. Minúsculas, números y guiones.">
            <input required pattern="[a-z0-9\-]{3,30}" className={estiloInput} placeholder="taxis-sur"
              value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value.toLowerCase() })} />
          </Campo>
        )}
        <Campo label="Nombre comercial" ancho={crear ? '' : 'sm:col-span-2'}>
          <input required minLength={2} maxLength={120} className={estiloInput} value={f.nombre} onChange={cambiar('nombre')} />
        </Campo>
        <Campo label="NIT"><input maxLength={30} className={estiloInput} value={f.nit} onChange={cambiar('nit')} /></Campo>
        <Campo label="Teléfono"><input maxLength={30} className={estiloInput} value={f.telefono} onChange={cambiar('telefono')} /></Campo>
        <Campo label="Email"><input type="email" maxLength={100} className={estiloInput} value={f.email} onChange={cambiar('email')} /></Campo>
        <Campo label="Dirección"><input maxLength={200} className={estiloInput} value={f.direccion} onChange={cambiar('direccion')} /></Campo>
        <Campo label="Logo (URL https)">
          <input type="url" pattern="https://.*" maxLength={300} className={estiloInput} placeholder="https://..." value={f.logo_url} onChange={cambiar('logo_url')} />
        </Campo>
        <Campo label="Color de marca">
          <div className="flex items-center gap-3">
            <input type="color" aria-label="Color de marca" className="h-11 w-14 cursor-pointer rounded-lg border border-gray-300 bg-transparent p-1 dark:border-gray-700" value={f.color_primario} onChange={cambiar('color_primario')} />
            <span className="font-mono text-sm text-gray-500 dark:text-gray-400">{f.color_primario}</span>
          </div>
        </Campo>
      </Seccion>

      <Seccion icon={MapPin} titulo="Zona de operación">
        <Campo label="Ciudad"><input required maxLength={80} className={estiloInput} value={f.ciudad} onChange={cambiar('ciudad')} /></Campo>
        <Campo label="País"><input maxLength={60} className={estiloInput} value={f.pais} onChange={cambiar('pais')} /></Campo>
        <Campo label="Latitud del centro" ayuda="Ej. -16.5000000">
          <input required type="number" step="0.0000001" min="-90" max="90" className={estiloInput} value={f.centro_lat} onChange={cambiar('centro_lat')} />
        </Campo>
        <Campo label="Longitud del centro" ayuda="Ej. -68.1900000">
          <input required type="number" step="0.0000001" min="-180" max="180" className={estiloInput} value={f.centro_lng} onChange={cambiar('centro_lng')} />
        </Campo>
        <Campo label="Radio de operación (km)" ayuda="Posiciones GPS fuera de este radio se rechazan.">
          <input required type="number" step="0.1" min="1" max="500" className={estiloInput} value={f.radio_operacion_km} onChange={cambiar('radio_operacion_km')} />
        </Campo>
        <Campo label="Altitud (msnm)">
          <input type="number" step="1" min="-500" max="6000" className={estiloInput} value={f.altitud_msnm} onChange={cambiar('altitud_msnm')} />
        </Campo>
        <Campo label="Zona horaria">
          <input required list="zonas-horarias" className={estiloInput} value={f.zona_horaria} onChange={cambiar('zona_horaria')} />
          <datalist id="zonas-horarias">{ZONAS.map(z => <option key={z} value={z} />)}</datalist>
        </Campo>
      </Seccion>

      <Seccion icon={Coins} titulo="Moneda">
        <Campo label="Código ISO" ayuda="BOB, PEN, COP, CLP...">
          <input required pattern="[A-Za-z]{3}" maxLength={3} className={`${estiloInput} uppercase`} value={f.moneda_codigo} onChange={cambiar('moneda_codigo')} />
        </Campo>
        <Campo label="Símbolo" ayuda="Bs, S/, $...">
          <input required maxLength={5} className={estiloInput} value={f.moneda_simbolo} onChange={cambiar('moneda_simbolo')} />
        </Campo>
      </Seccion>

      {crear && (
        <Seccion icon={UserCog} titulo="Gerente inicial">
          <Campo label="Nombre"><input required className={estiloInput} value={f.gerente.nombre} onChange={cambiarGerente('nombre')} /></Campo>
          <Campo label="Email (usuario del panel)"><input required type="email" className={estiloInput} value={f.gerente.email} onChange={cambiarGerente('email')} /></Campo>
          <Campo label="Contraseña" ayuda="Mínimo 8 caracteres.">
            <input required type="password" minLength={8} className={estiloInput} value={f.gerente.password} onChange={cambiarGerente('password')} />
          </Campo>
        </Seccion>
      )}

      <div className="flex justify-end gap-3 border-t border-gray-100 pt-6 dark:border-gray-800">
        {onCancelar && <button type="button" onClick={onCancelar} className={botonSecundario}>Cancelar</button>}
        <button type="submit" disabled={guardando} className={botonPrimario}>
          {guardando ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {guardando ? 'Guardando...' : crear ? 'Crear empresa' : 'Guardar datos'}
        </button>
      </div>
    </form>
  );
}
