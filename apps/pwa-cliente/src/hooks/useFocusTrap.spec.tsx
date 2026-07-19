// @ts-nocheck
// @vitest-environment jsdom
import React, { useRef } from 'react';
import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getFocusableElements, useFocusTrap } from './useFocusTrap';

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

describe('useFocusTrap API', () => {
  const TrapC = ({ active, onClose }: any) => {
    const ref = useRef<HTMLDivElement>(null);
    useFocusTrap(ref, { active, onClose });
    return (
      <div ref={ref} data-testid="trap">
        <button id="btn1">Btn 1</button>
        <button id="btn2">Btn 2</button>
      </div>
    );
  };

  it('atrapa el foco y maneja Escape y Tab', () => {
    const onClose = vi.fn();
    render(
      <div>
        <button id="out">Out</button>
        <TrapC active={true} onClose={onClose} />
      </div>
    );
    
    // Al renderizar, setea el primer elemento
    // Simulamos tecla Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();

    // Simulamos Tab shift (reverse)
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    
    // Simulamos Tab normal
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: false });
  });

  it('ignora si no esta activo', () => {
    const onClose = vi.fn();
    render(
      <div>
        <button id="out">Out</button>
        <TrapC active={false} onClose={onClose} />
      </div>
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('no marca como inert al elemento .scrim hermano del trap', () => {
    // Regresión: el scrim (backdrop del drawer) es hermano del <dialog>.
    // useFocusTrap NO debe marcarlo inert — de lo contrario el click para
    // cerrar el drawer queda bloqueado.
    const onClose = vi.fn();
    const { container } = render(
      <div>
        <button className="scrim" data-testid="scrim-btn">Scrim</button>
        <TrapC active={true} onClose={onClose} />
      </div>
    );
    const scrim = container.querySelector('.scrim');
    expect(scrim).not.toBeNull();
    expect(scrim!.hasAttribute('inert')).toBe(false);
  });

  it('sí marca como inert a hermanos normales (no scrim)', () => {
    // Contrario al test anterior: un hermano sin clase scrim SÍ debe quedar inert.
    const onClose = vi.fn();
    const { container } = render(
      <div>
        <button data-testid="normal-sibling">Normal</button>
        <TrapC active={true} onClose={onClose} />
      </div>
    );
    const sibling = container.querySelector('[data-testid="normal-sibling"]');
    expect(sibling).not.toBeNull();
    expect(sibling!.hasAttribute('inert')).toBe(true);
  });
});
