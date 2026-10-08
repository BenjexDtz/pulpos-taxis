import { useState } from 'react';
import { RefreshCw, Save, Building2, MapPin, Coins, UserCog } from 'lucide-react';
import Mensaje from './Mensaje.jsx';

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

const estiloInput = 'w-full bg-gray-800 border border-gray-700 text-white px-4 py-2.5 rounded-xl font-radar text-sm focus:outline-none focus:border-yellow-500 transition placeholder-gray-700';

function Campo({ label, ayuda, ancho, children }) {
  return (
    <div className={ancho}>
      <label className="font-radar text-xs text-gray-600 tracking-widest block mb-2">{label}</label>
      {children}
      {ayuda && <p className="font-radar text-xs text-gray-700 mt-1">{ayuda}</p>}
    </div>
  );
}

function Seccion({ icon: Icon, titulo, children }) {
  return (
    <div>
      <div className="flex items-center space-x-2 mb-3">
        <Icon className="w-4 h-4 text-yellow-400" />
        <span className="font-radar text-xs text-yellow-400 tracking-widest">{titulo}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </div>
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

      <Seccion icon={Building2} titulo="IDENTIDAD">
        {crear && (
          <Campo label="CÓDIGO" ayuda="Lo escriben los choferes al iniciar sesión. Minúsculas, números y guiones.">
            <input required pattern="[a-z0-9\-]{3,30}" className={estiloInput} placeholder="taxis-sur"
              value={f.codigo} onChange={e => setF({ ...f, codigo: e.target.value.toLowerCase() })} />
          </Campo>
        )}
        <Campo label="NOMBRE COMERCIAL" ancho={crear ? '' : 'sm:col-span-2'}>
          <input required minLength={2} maxLength={120} className={estiloInput} value={f.nombre} onChange={cambiar('nombre')} />
        </Campo>
        <Campo label="NIT"><input maxLength={30} className={estiloInput} value={f.nit} onChange={cambiar('nit')} /></Campo>
        <Campo label="TELÉFONO"><input maxLength={30} className={estiloInput} value={f.telefono} onChange={cambiar('telefono')} /></Campo>
        <Campo label="EMAIL"><input type="email" maxLength={100} className={estiloInput} value={f.email} onChange={cambiar('email')} /></Campo>
        <Campo label="DIRECCIÓN"><input maxLength={200} className={estiloInput} value={f.direccion} onChange={cambiar('direccion')} /></Campo>
        <Campo label="LOGO (URL https)">
          <input type="url" pattern="https://.*" maxLength={300} className={estiloInput} placeholder="https://..." value={f.logo_url} onChange={cambiar('logo_url')} />
        </Campo>
        <Campo label="COLOR DE MARCA">
          <div className="flex items-center gap-3">
            <input type="color" className="h-10 w-14 bg-transparent border border-gray-700 rounded-lg cursor-pointer" value={f.color_primario} onChange={cambiar('color_primario')} />
            <span className="font-radar text-sm text-gray-400">{f.color_primario}</span>
          </div>
        </Campo>
      </Seccion>

      <Seccion icon={MapPin} titulo="ZONA DE OPERACIÓN">
        <Campo label="CIUDAD"><input required maxLength={80} className={estiloInput} value={f.ciudad} onChange={cambiar('ciudad')} /></Campo>
        <Campo label="PAÍS"><input maxLength={60} className={estiloInput} value={f.pais} onChange={cambiar('pais')} /></Campo>
        <Campo label="LATITUD DEL CENTRO" ayuda="Ej. -16.5000000">
          <input required type="number" step="0.0000001" min="-90" max="90" className={estiloInput} value={f.centro_lat} onChange={cambiar('centro_lat')} />
        </Campo>
        <Campo label="LONGITUD DEL CENTRO" ayuda="Ej. -68.1900000">
          <input required type="number" step="0.0000001" min="-180" max="180" className={estiloInput} value={f.centro_lng} onChange={cambiar('centro_lng')} />
        </Campo>
        <Campo label="RADIO DE OPERACIÓN (km)" ayuda="Posiciones GPS fuera de este radio se rechazan.">
          <input required type="number" step="0.1" min="1" max="500" className={estiloInput} value={f.radio_operacion_km} onChange={cambiar('radio_operacion_km')} />
        </Campo>
        <Campo label="ALTITUD (msnm)">
          <input type="number" step="1" min="-500" max="6000" className={estiloInput} value={f.altitud_msnm} onChange={cambiar('altitud_msnm')} />
        </Campo>
        <Campo label="ZONA HORARIA">
          <input required list="zonas-horarias" className={estiloInput} value={f.zona_horaria} onChange={cambiar('zona_horaria')} />
          <datalist id="zonas-horarias">{ZONAS.map(z => <option key={z} value={z} />)}</datalist>
        </Campo>
      </Seccion>

      <Seccion icon={Coins} titulo="MONEDA">
        <Campo label="CÓDIGO ISO" ayuda="BOB, PEN, COP, CLP...">
          <input required pattern="[A-Za-z]{3}" maxLength={3} className={`${estiloInput} uppercase`} value={f.moneda_codigo} onChange={cambiar('moneda_codigo')} />
        </Campo>
        <Campo label="SÍMBOLO" ayuda="Bs, S/, $...">
          <input required maxLength={5} className={estiloInput} value={f.moneda_simbolo} onChange={cambiar('moneda_simbolo')} />
        </Campo>
      </Seccion>

      {crear && (
        <Seccion icon={UserCog} titulo="GERENTE INICIAL">
          <Campo label="NOMBRE"><input required className={estiloInput} value={f.gerente.nombre} onChange={cambiarGerente('nombre')} /></Campo>
          <Campo label="EMAIL (USUARIO DEL PANEL)"><input required type="email" className={estiloInput} value={f.gerente.email} onChange={cambiarGerente('email')} /></Campo>
          <Campo label="CONTRASEÑA" ayuda="Mínimo 8 caracteres.">
            <input required type="password" minLength={8} className={estiloInput} value={f.gerente.password} onChange={cambiarGerente('password')} />
          </Campo>
        </Seccion>
      )}

      <div className="flex justify-end gap-3 pt-2">
        {onCancelar && (
          <button type="button" onClick={onCancelar} className="px-5 py-2.5 border border-gray-700 text-gray-400 hover:text-white rounded-xl transition text-sm font-semibold">
            Cancelar
          </button>
        )}
        <button type="submit" disabled={guardando}
          className="flex items-center space-x-2 bg-yellow-600 hover:bg-yellow-500 disabled:opacity-60 text-white font-bold px-6 py-2.5 rounded-xl transition tracking-wider text-sm">
          {guardando ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{guardando ? 'GUARDANDO...' : crear ? 'CREAR EMPRESA' : 'GUARDAR DATOS'}</span>
        </button>
      </div>
    </form>
  );
}
