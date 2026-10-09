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

// YYYY-MM-DD en la hora del navegador (toISOString usaría UTC y cambiaría de día por la noche).
export const fechaLocal = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const formatoMoneda = (valor, simbolo = 'Bs') =>
  `${simbolo} ${Number(valor ?? 0).toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatoNumero = (valor, decimales = 0) =>
  Number(valor ?? 0).toLocaleString('es-BO', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });

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

// Variación porcentual frente al período anterior; null si antes no hubo nada con qué comparar.
export const variacion = (actual, anterior) => {
  const a = Number(actual), b = Number(anterior);
  if (!b) return null;
  return ((a - b) / b) * 100;
};

// Resultado de la verificación que hace el servidor al recibir cada viaje
export const VERIFICACION = {
  ok: { texto: 'Verificado', color: 'exito', ayuda: 'La tarifa sale de la fórmula y la ruta GPS coincide con los km cobrados.' },
  sin_ruta: { texto: 'Sin ruta', color: 'neutro', ayuda: 'La tarifa sale de la fórmula, pero la app no envió la ruta (versión anterior).' },
  diferencia: { texto: 'Diferencia', color: 'error', ayuda: 'La tarifa o los km no coinciden con lo que registró el GPS.' },
  sin_verificar: { texto: 'Sin verificar', color: 'neutro', ayuda: 'Viaje anterior a la verificación o sin los parámetros aplicados.' },
};
