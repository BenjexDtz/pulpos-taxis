import { Building2, Coins, Info, MapPin } from 'lucide-react';
import Tarjeta from '../componentes/ui/Tarjeta.jsx';

function Dato({ titulo, children }) {
  return (
    <div className="min-w-0">
      <dt className="text-theme-xs text-gray-500 dark:text-gray-400">{titulo}</dt>
      <dd className="mt-0.5 break-words text-theme-sm font-medium text-gray-800 dark:text-white/90">{children || '—'}</dd>
    </div>
  );
}

function Grupo({ icono: Icono, titulo, children }) {
  return (
    <section className="border-t border-gray-100 pt-5 first:border-t-0 first:pt-0 dark:border-gray-800">
      <h3 className="mb-4 flex items-center gap-2 text-theme-sm font-semibold text-gray-800 dark:text-white/90">
        <Icono className="h-4 w-4 text-brand-500" />{titulo}
      </h3>
      <dl className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3">{children}</dl>
    </section>
  );
}

export default function Empresa({ empresa }) {
  if (!empresa) return <p className="py-10 text-center text-sm text-gray-500 dark:text-gray-400">Cargando...</p>;
  return (
    <Tarjeta icono={Building2} titulo={empresa.nombre} className="max-w-4xl"
      subtitulo={<>Código para los choferes: <span className="font-medium text-brand-600 dark:text-brand-400">{empresa.codigo}</span></>}>
      <div className="space-y-5">
        <p className="flex items-start gap-2 rounded-lg bg-gray-50 px-4 py-3 text-theme-sm text-gray-600 dark:bg-white/[0.03] dark:text-gray-400">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          Estos datos los administra la plataforma. Si hay que corregir algo, solicítalo al administrador de la plataforma.
        </p>
        <Grupo icono={Building2} titulo="Identidad">
          <Dato titulo="NIT">{empresa.nit}</Dato>
          <Dato titulo="Teléfono">{empresa.telefono}</Dato>
          <Dato titulo="Email">{empresa.email}</Dato>
          <Dato titulo="Dirección">{empresa.direccion}</Dato>
        </Grupo>
        <Grupo icono={MapPin} titulo="Zona de operación">
          <Dato titulo="Ciudad">{empresa.ciudad}, {empresa.pais}</Dato>
          <Dato titulo="Radio de operación">{Number(empresa.radio_operacion_km)} km</Dato>
          <Dato titulo="Altitud">{empresa.altitud_msnm != null ? `${empresa.altitud_msnm} msnm` : null}</Dato>
          <Dato titulo="Zona horaria">{empresa.zona_horaria}</Dato>
        </Grupo>
        <Grupo icono={Coins} titulo="Moneda">
          <Dato titulo="Moneda">{empresa.moneda_codigo} ({empresa.moneda_simbolo})</Dato>
        </Grupo>
      </div>
    </Tarjeta>
  );
}
