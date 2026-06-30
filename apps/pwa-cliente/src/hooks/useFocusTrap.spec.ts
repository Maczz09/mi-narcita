// @ts-nocheck
// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { getFocusableElements, useFocusTrap } from './useFocusTrap';

// ─── getFocusableElements ─────────────────────────────────────────────────────

describe('getFocusableElements', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  it('devuelve botones, inputs y links activos', () => {
    container.innerHTML = `
      <button id="b1">Btn</button>
      <input id="i1" />
      <a href="#" id="a1">Link</a>
      <span>No focusable</span>
    `;
    const ids = getFocusableElements(container).map((e) => e.id);
    expect(ids).toEqual(['b1', 'i1', 'a1']);
  });

  it('excluye elementos disabled', () => {
    container.innerHTML = `
      <button id="ok">OK</button>
      <button disabled id="dis">Dis</button>
      <input disabled id="inp" />
    `;
    const ids = getFocusableElements(container).map((e) => e.id);
    expect(ids).toEqual(['ok']);
  });

  it('excluye tabindex="-1"', () => {
    container.innerHTML = `
      <button id="normal">Normal</button>
      <button tabindex="-1" id="skip">Skip</button>
    `;
    const ids = getFocusableElements(container).map((e) => e.id);
    expect(ids).toEqual(['normal']);
  });

  it('incluye elementos con tabindex >= 0', () => {
    container.innerHTML = `
      <div id="d0" tabindex="0">Div</div>
      <div id="d1" tabindex="1">Div1</div>
    `;
    const ids = getFocusableElements(container).map((e) => e.id);
    expect(ids).toContain('d0');
    expect(ids).toContain('d1');
  });

  it('devuelve array vacío si no hay focusables', () => {
    container.innerHTML = '<p>Solo texto</p>';
    expect(getFocusableElements(container)).toHaveLength(0);
  });

  it('incluye select y textarea', () => {
    container.innerHTML = `
      <select id="sel"><option>A</option></select>
      <textarea id="ta"></textarea>
    `;
    const ids = getFocusableElements(container).map((e) => e.id);
    expect(ids).toContain('sel');
    expect(ids).toContain('ta');
  });
});

// ─── useFocusTrap API ─────────────────────────────────────────────────────────

describe('useFocusTrap', () => {
  it('es una función exportada', () => {
    expect(typeof useFocusTrap).toBe('function');
  });
});

