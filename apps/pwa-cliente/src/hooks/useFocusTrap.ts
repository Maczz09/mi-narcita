import { useEffect, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]:not([tabindex="-1"])',
  'button:not([disabled]):not([tabindex="-1"])',
  'input:not([disabled]):not([tabindex="-1"])',
  'select:not([disabled]):not([tabindex="-1"])',
  'textarea:not([disabled]):not([tabindex="-1"])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
}

/**
 * Atrapa el foco dentro de `ref` mientras `active` sea true.
 * Al activarse: guarda el elemento previo, mueve el foco al primer focusable.
 * Tab/Shift+Tab ciclan dentro del contenedor. Esc llama a `onClose`.
 * Al desactivarse: restaura el foco al elemento previo.
 */
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  { active, onClose }: { active: boolean; onClose: () => void },
) {
  useEffect(() => {
    if (!active || !ref.current) return;

    const container = ref.current;
    const prevFocus = document.activeElement as HTMLElement | null;

    const focusable = getFocusableElements(container);
    focusable[0]?.focus();

    // Marcar hermanos en cada nivel del árbol como inert (aísla SR + teclado).
    // Excluir elementos .scrim y [data-scrim]: son parte del propio overlay
    // (backdrop del drawer/modal) y deben seguir recibiendo clicks para cerrar.
    const inertTargets: Element[] = [];
    let node: Element | null = container;
    while (node && node !== document.body) {
      const parent: HTMLElement | null = node.parentElement;
      if (parent) {
        for (const sibling of Array.from<Element>(parent.children)) {
          const isScrim =
            sibling.classList.contains('scrim') ||
            (sibling as HTMLElement).dataset?.scrim !== undefined;
          if (sibling !== node && !sibling.hasAttribute('inert') && !isScrim) {
            sibling.setAttribute('inert', '');
            inertTargets.push(sibling);
          }
        }
      }
      node = parent;
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      const els = getFocusableElements(container);
      if (els.length === 0) {
        e.preventDefault();
        return;
      }

      const first = els[0];
      const last = els.at(-1);
      const focused = document.activeElement;

      if (e.shiftKey) {
        if (focused === first || !container.contains(focused)) {
          e.preventDefault();
          last?.focus();
        }
      } else if (focused === last || !container.contains(focused)) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKey);

    return () => {
      document.removeEventListener('keydown', handleKey);
      inertTargets.forEach((t) => t.removeAttribute('inert'));
      prevFocus?.focus();
    };
  }, [active]);
}
