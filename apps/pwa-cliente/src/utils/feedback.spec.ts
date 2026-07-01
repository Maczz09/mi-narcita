// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { primerMensaje } from './feedback';

describe('primerMensaje', () => {
  it('devuelve null cuando no hay pares', () => {
    expect(primerMensaje()).toBeNull();
  });

  it('devuelve null cuando ninguna condición es verdadera', () => {
    expect(primerMensaje([false, 'error A'], [false, 'error B'])).toBeNull();
  });

  it('devuelve el primer mensaje cuya condición sea true', () => {
    expect(primerMensaje([false, 'no'], [true, 'sí'], [true, 'también'])).toBe('sí');
  });

  it('ignora pares con mensaje null o undefined aunque la condición sea true', () => {
    expect(primerMensaje([true, null], [true, undefined], [true, 'ok'])).toBe('ok');
  });

  it('devuelve el mensaje del primer par verdadero', () => {
    expect(primerMensaje([true, 'primero'], [false, 'segundo'])).toBe('primero');
  });
});

