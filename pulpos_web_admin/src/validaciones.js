// Mismas reglas que validacion.js del servidor (el servidor decide; aquí se avisa mientras se escribe).
// Devuelven el mensaje de error o null; un campo vacío lo controla el atributo required.

const SOLO_LETRAS = /^\p{L}[\p{L} .'’-]*$/u;
const NOMBRE_CON_NUMEROS = /^(?=.*\p{L})[\p{L}\d .,'’&()-]+$/u;

export const normalizarPlaca = (s = '') => s.toUpperCase().replace(/[\s-]/g, '');

export const placaValida = (s) => /^\d{4}[A-Z]{3}$/.test(normalizarPlaca(s));

export const errorNombrePersona = (s = '') =>
  !s.trim() || SOLO_LETRAS.test(s.trim()) ? null : 'El nombre solo admite letras, sin números ni símbolos.';

export const errorPlaca = (s = '') =>
  !s.trim() || placaValida(s) ? null : 'La placa debe tener 4 números y 3 letras, por ejemplo 2456ZBK.';

export const errorPassword = (s = '') => {
  if (/\s/.test(s)) return 'La contraseña no puede tener espacios.';
  return new TextEncoder().encode(s).length > 72 ? 'La contraseña no puede pasar de 72 caracteres.' : null;
};

export const errorLugar = (s = '', nombre = 'Este campo') =>
  !s.trim() || SOLO_LETRAS.test(s.trim()) ? null : `${nombre} solo admite letras.`;

export const errorNombreComercial = (s = '') =>
  !s.trim() || NOMBRE_CON_NUMEROS.test(s.trim()) ? null : 'Solo admite letras, números y . , & - ( ); debe llevar alguna letra.';

export const errorZonaTarifa = (s = '') =>
  !s.trim() || NOMBRE_CON_NUMEROS.test(s.trim()) ? null : 'La zona solo admite letras, números y . , - ( ).';

export const errorNit = (s = '') =>
  !s.trim() || /^\d{5,20}$/.test(s.trim()) ? null : 'El NIT solo admite números (5 a 20 dígitos).';

export const errorTelefono = (s = '') =>
  !s.trim() || /^\+?\d[\d -]{5,18}\d$/.test(s.trim()) ? null : 'El teléfono solo admite números, espacios, guiones y un + inicial (7 a 20 caracteres).';

export const errorSimboloMoneda = (s = '') =>
  !s.trim() || /^[^\d\s]{1,5}$/.test(s.trim()) ? null : 'Hasta 5 caracteres, sin números ni espacios.';

// Mientras se escribe un valor correcto pero incompleto no se avisa: el aviso sale al salir del campo o al guardar.
export const incompleto = {
  placa: (s = '') => /^\d{0,4}$|^\d{4}[A-Z]{0,2}$/.test(normalizarPlaca(s)),
  nit: (s = '') => /^\d{0,4}$/.test(s.trim()),
  telefono: (s = '') => /^\+?[\d -]{0,6}$/.test(s.trim()),
};
