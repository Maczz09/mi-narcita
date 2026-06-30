// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import { fmt, minAgo, fechaLocalISO, horaOf, elapsedMin, elapsedLabel } from './format';

describe('fmt', () => {
  it('formatea soles con 2 decimales', () => {
    expect(fmt(42)).toBe('S/ 42.00');
    expect(fmt(9.5)).toBe('S/ 9.50');
  });
  it('trata valores no numéricos como 0', () => {
    expect(fmt(NaN)).toBe('S/ 0.00');
    expect(fmt(undefined as unknown as number)).toBe('S/ 0.00');
  });
});

describe('minAgo', () => {
  it('devuelve un ISO en el pasado', () => {
    const iso = minAgo(10);
    expect(new Date(iso).getTime()).toBeLessThan(Date.now());
    expect(iso).toMatch(/T.*Z$/);
  });
});

describe('fechaLocalISO', () => {
  it('produce YYYY-MM-DD en zona de Lima', () => {
    // 2026-06-11T01:00:00Z = 2026-06-10 20:00 en Lima (UTC-5) → sigue siendo el día 10.
    expect(fechaLocalISO(new Date('2026-06-11T01:00:00Z'))).toBe('2026-06-10');
  });
});

describe('horaOf', () => {
  it('devuelve HH:mm en 24h', () => {
    expect(horaOf('2026-06-10T14:05:00-05:00')).toBe('14:05');
  });
});

describe('elapsedMin', () => {
  it('cuenta los minutos transcurridos', () => {
    const now = new Date('2026-06-10T10:00:00Z').getTime();
    expect(elapsedMin('2026-06-10T09:30:00Z', now)).toBe(30);
  });
});

describe('elapsedLabel', () => {
  const now = new Date('2026-06-10T10:00:00Z').getTime();
  it('muestra minutos bajo una hora', () => {
    expect(elapsedLabel('2026-06-10T09:45:00Z', now)).toBe('15m');
  });
  it('muestra horas y minutos', () => {
    expect(elapsedLabel('2026-06-10T08:20:00Z', now)).toBe('1h 40m');
  });
  it('omite los minutos cuando son cero', () => {
    expect(elapsedLabel('2026-06-10T08:00:00Z', now)).toBe('2h');
  });
});

