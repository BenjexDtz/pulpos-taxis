import { describe, test, expect, vi, afterEach } from 'vitest';
import {
  leerToken, consultaFechas, escaparHtml, colorSuperficie, fechaLocal, formatoMoneda, formatoNumero, desgloseKm,
  cambiosEntre, minutosDesde, haceTiempo, resumenFlota, variacion,
} from '../src/utilidades.js';

afterEach(() => vi.useRealTimers());

const token = (carga) => `x.${btoa(JSON.stringify(carga)).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')}.y`;

describe('utilidades', () => {
  test('leerToken decodifica la carga del JWT y devuelve null si está mal formado', () => {
    expect(leerToken(token({ rol: 'gerente', nombre: 'Ana' }))).toEqual({ rol: 'gerente', nombre: 'Ana' });
    expect(leerToken('basura')).toBeNull();
    expect(leerToken('')).toBeNull();
  });

  test('consultaFechas arma la query solo con las fechas presentes', () => {
    expect(consultaFechas('2026-11-01', '2026-11-30')).toBe('?desde=2026-11-01&hasta=2026-11-30');
    expect(consultaFechas('', '2026-11-30')).toBe('?hasta=2026-11-30');
    expect(consultaFechas()).toBe('');
  });

  test('escaparHtml neutraliza etiquetas y comillas', () => {
    expect(escaparHtml(`<img src=x onerror="a">&'`)).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;&amp;&#39;');
    expect(escaparHtml(null)).toBe('');
  });

  test('el asfalto toma el color de la empresa y las demás superficies el suyo', () => {
    expect(colorSuperficie('asfalto', '#123456')).toBe('#123456');
    expect(colorSuperficie('tierra', '#123456')).toBe('#f79009');
    expect(colorSuperficie('desconocida', '#123456')).toBe('#123456');
  });

  test('fechaLocal usa la hora local, no UTC', () => {
    expect(fechaLocal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05');
  });

  test('formatos de moneda y número en es-BO', () => {
    expect(formatoMoneda(1234.5, 'S/')).toMatch(/^S\/ 1.?234,50$/);
    expect(formatoMoneda(null)).toBe('Bs 0,00');
    expect(formatoNumero(3.14159, 2)).toBe('3,14');
  });

  test('desgloseKm lista solo las superficies recorridas', () => {
    expect(desgloseKm({ km_asfalto: 1.2, km_tierra: 0, km_empedrado: 0.8 })).toBe('1,20 asfalto · 0,80 empedrado');
  });

  test('cambiosEntre devuelve solo los campos que cambiaron', () => {
    expect(cambiosEntre({ a: 1, b: { x: 1 }, c: 3 }, { a: 1, b: { x: 2 }, d: 4 })).toEqual([
      { campo: 'b', antes: { x: 1 }, despues: { x: 2 } },
      { campo: 'c', antes: 3, despues: undefined },
      { campo: 'd', antes: undefined, despues: 4 },
    ]);
    expect(cambiosEntre(null, null)).toEqual([]);
  });

  test('haceTiempo redacta minutos, horas y días', () => {
    expect(haceTiempo(null)).toBe('');
    expect(haceTiempo(0)).toBe('hace un momento');
    expect(haceTiempo(42)).toBe('hace 42 min');
    expect(haceTiempo(150)).toBe('hace 2 h');
    expect(haceTiempo(60 * 24)).toBe('hace 1 día');
    expect(haceTiempo(60 * 24 * 3)).toBe('hace 3 días');
  });

  test('resumenFlota cuenta activos y GPS vivo de los últimos 5 minutos', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-17T12:00:00Z'));
    expect(minutosDesde('2026-11-17T11:50:00Z')).toBe(10);
    expect(minutosDesde(null)).toBeNull();
    const r = resumenFlota([
      { estado_activo: true, ultima_actualizacion: '2026-11-17T11:58:00Z' },
      { estado_activo: true, ultima_actualizacion: '2026-11-17T11:50:00Z' },
      { estado_activo: true, ultima_actualizacion: null },
      { estado_activo: false, ultima_actualizacion: '2026-11-17T11:59:00Z' },
    ]);
    expect(r).toEqual({ activosCount: 3, conGPSVivo: 1 });
  });

  test('variacion porcentual y null sin período anterior', () => {
    expect(variacion(150, 100)).toBe(50);
    expect(variacion(50, 100)).toBe(-50);
    expect(variacion(10, 0)).toBeNull();
  });
});
