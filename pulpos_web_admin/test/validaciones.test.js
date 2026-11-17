import { describe, test, expect } from 'vitest';
import {
  normalizarPlaca, placaValida, errorNombrePersona, errorPlaca, errorPassword, errorLugar, errorNombreComercial,
  errorZonaTarifa, errorNit, errorTelefono, errorSimboloMoneda, incompleto,
} from '../src/validaciones.js';

describe('validaciones del panel (mismas reglas que el servidor)', () => {
  test('placa: normaliza y exige 4 números y 3 letras', () => {
    expect(normalizarPlaca('2456-zbk ')).toBe('2456ZBK');
    expect(placaValida('2456 zbk')).toBe(true);
    expect(placaValida('ABC1234')).toBe(false);
    expect(errorPlaca('')).toBeNull();
    expect(errorPlaca('12AB')).toMatch(/4 números y 3 letras/);
  });

  test('nombre de persona: solo letras, con tildes y apóstrofo', () => {
    expect(errorNombrePersona('José Ñuñez O’Higgins')).toBeNull();
    expect(errorNombrePersona('Juan 2')).toMatch(/solo admite letras/);
  });

  test('contraseña: sin espacios y hasta 72 bytes', () => {
    expect(errorPassword('clave segura')).toMatch(/espacios/);
    expect(errorPassword('ñ'.repeat(37))).toMatch(/72/);
    expect(errorPassword('clave1234')).toBeNull();
  });

  test('lugar, nombre comercial y zona', () => {
    expect(errorLugar('La Paz')).toBeNull();
    expect(errorLugar('El Alto 2', 'La ciudad')).toBe('La ciudad solo admite letras.');
    expect(errorNombreComercial('Radio Taxi 24 & Cía.')).toBeNull();
    expect(errorNombreComercial('1234')).toMatch(/alguna letra/);
    expect(errorZonaTarifa('Zona Sur (2)')).toBeNull();
    expect(errorZonaTarifa('Zona#1')).toMatch(/zona/);
  });

  test('NIT, teléfono y símbolo de moneda', () => {
    expect(errorNit('1234567')).toBeNull();
    expect(errorNit('12a')).toMatch(/NIT/);
    expect(errorTelefono('+591 2 2412345')).toBeNull();
    expect(errorTelefono('abc')).toMatch(/teléfono/);
    expect(errorSimboloMoneda('S/')).toBeNull();
    expect(errorSimboloMoneda('B 1')).toMatch(/sin números/);
  });

  test('incompleto: no avisa mientras el valor puede completarse', () => {
    expect(incompleto.placa('245')).toBe(true);
    expect(incompleto.placa('2456ZB')).toBe(true);
    expect(incompleto.placa('2456Z1')).toBe(false);
    expect(incompleto.nit('12')).toBe(true);
    expect(incompleto.telefono('+591')).toBe(true);
  });
});
