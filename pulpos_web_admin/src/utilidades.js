export const leerToken = (token) => {
  try { return JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))); }
  catch { return null; }
};

export const consultaFechas = (desde, hasta) => {
  const q = new URLSearchParams();
  if (desde) q.set('desde', desde);
  if (hasta) q.set('hasta', hasta);
  const s = q.toString();
  return s ? `?${s}` : '';
};

export const escaparHtml = (texto) => String(texto ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

const MINUTOS_GPS_VIVO = 5;

export const minutosDesde = (fecha) => fecha ? Math.floor((new Date() - new Date(fecha)) / 60000) : null;

export const haceTiempo = (minutos) => {
  if (minutos === null) return '';
  if (minutos < 1) return 'hace un momento';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  if (horas < 24) return `hace ${horas} h`;
  const dias = Math.floor(horas / 24);
  return `hace ${dias} día${dias === 1 ? '' : 's'}`;
};

export const resumenFlota = (choferes) => {
  const activos = choferes.filter(c => c.estado_activo);
  const conGPSVivo = activos.filter(c => {
    const minutos = minutosDesde(c.ultima_actualizacion);
    return minutos !== null && minutos < MINUTOS_GPS_VIVO;
  }).length;
  return { activosCount: activos.length, conGPSVivo };
};
