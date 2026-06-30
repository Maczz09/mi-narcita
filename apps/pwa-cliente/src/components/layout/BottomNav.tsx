/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
// components/layout/BottomNav.tsx — Navegación inferior (móvil ≤920px)
// v2: Gestión de foco en panel "Más":
//   - Al ABRIR: foco va al primer ítem del panel (ARIA authoring practices).
//   - Al CERRAR con Escape/clic fuera: foco vuelve al botón "Más".
//   Esto satisface el patrón de menu button de ARIA APG.

import { useLocation, useNavigate } from 'react-router-dom';
import { puedeAcceder } from '../../auth/permisos';
import { useAuthStore } from '../../store/auth.store';
import { Icons } from '../ui/icons';
import { NAV_ITEMS } from './navigation';
import { useEffect, useRef, useState } from 'react';

export function BottomNav() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const rol       = useAuthStore((s) => s.user?.rol);
  const [moreOpen, setMoreOpen] = useState(false);

  const moreRef       = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const activeKey     = location.pathname.split('/')[2] ?? '';

  const allowedItems  = NAV_ITEMS
    .filter((item) => puedeAcceder(rol, item.key))
    .sort((a, b) => a.priority - b.priority);

  const hasOverflow    = allowedItems.length > 5;
  const primaryItems   = hasOverflow ? allowedItems.slice(0, 4) : allowedItems;
  const overflowItems  = hasOverflow ? allowedItems.slice(4)    : [];
  const overflowActive = overflowItems.some((item) => item.key === activeKey);

  // ── Gestión de foco: mover al primer ítem cuando el panel abre ──────────
  useEffect(() => {
    if (moreOpen && moreRef.current) {
      const firstItem = moreRef.current.querySelector<HTMLButtonElement>('.bn-more-item');
      firstItem?.focus();
    }
  }, [moreOpen]);

  // ── Cerrar panel con Escape/clic fuera; devolver foco al botón "Más" ────
  useEffect(() => {
    if (!moreOpen) return undefined;

    const handlePointerDown = (event: PointerEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
        // El foco ya está fuera del panel — no hace falta moverlo.
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMoreOpen(false);
        // Devolver foco al botón "Más" al cerrar con teclado.
        moreButtonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown',     handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown',     handleKeyDown);
    };
  }, [moreOpen]);

  // Cerrar panel al cambiar de ruta y devolver foco al botón.
  useEffect(() => {
    setMoreOpen(false);
    // No movemos foco aquí: la navegación ya lo gestiona via <main>.
  }, [location.pathname]);

  if (allowedItems.length <= 1) return null;

  return (
    <nav className="bottom-nav" aria-label="Navegación principal">
      {primaryItems.map((item) => {
        const Icon   = Icons[item.icon];
        const active = activeKey === item.key;
        return (
          <button
            key={item.key}
            className={`bn-item ${active ? 'on' : ''}`}
            type="button"
            aria-current={active ? 'page' : undefined}
            aria-label={item.label}
            onClick={() => navigate(`/app/${item.key}`)}
          >
            <Icon s={20} aria-hidden="true" />
            <span aria-hidden="true">{item.shortLabel}</span>
          </button>
        );
      })}

      {hasOverflow && (
        <div className="bn-more-wrap" ref={moreRef}>
          {moreOpen && (
            <div
              className="bn-more-panel"
              role="menu"
              aria-label="Más módulos"
            >
              {overflowItems.map((item) => {
                const Icon   = Icons[item.icon];
                const active = activeKey === item.key;
                return (
                  <button
                    key={item.key}
                    className={`bn-more-item ${active ? 'on' : ''}`}
                    type="button"
                    role="menuitem"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => navigate(`/app/${item.key}`)}
                  >
                    <Icon s={18} aria-hidden="true" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          <button
            ref={moreButtonRef}
            className={`bn-item ${overflowActive || moreOpen ? 'on' : ''}`}
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label="Más módulos"
            onClick={() => setMoreOpen((current) => !current)}
          >
            <Icons.Plus s={20} aria-hidden="true" />
            <span aria-hidden="true">Más</span>
          </button>
        </div>
      )}
    </nav>
  );
}
