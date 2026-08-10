// components/layout/SedeSwitcher.tsx — Selector de sede en el navbar (T-23).
// Visible solo para el admin general (usuario con sedeId nulo): los usuarios
// pineados a una sede no lo ven porque el backend ya resuelve su sede desde
// el JWT. Cambiar de sede invalida toda la caché de queries para que Mesas,
// Inventario/Carta y Usuarios recarguen scopeados a la sede recién elegida.

import { useRef, useState } from 'react';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { queryClient } from '../../api/queryClient';
import { getSedeSeleccionada, setSedeSeleccionada } from '../../api/client';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Icons } from '../ui/icons';

export function SedeSwitcher() {
  const { sedes, loading } = useSedesQuery();
  const [open, setOpen] = useState(false);
  const [seleccionId, setSeleccionId] = useState(() => getSedeSeleccionada());
  const popRef = useRef<HTMLDivElement>(null);
  useFocusTrap(popRef, { active: open, onClose: () => setOpen(false) });

  const sedeActual = sedes.find((s) => s.id === seleccionId) ?? null;

  const elegir = (id: string) => {
    setSedeSeleccionada(id);
    setSeleccionId(id);
    setOpen(false);
    void queryClient.invalidateQueries();
  };

  return (
    <div style={{ position: 'relative' }}>
      <button
        className={`icon-btn ${open ? 'on' : ''}`}
        onClick={() => setOpen((x) => !x)}
        title="Sede en administración"
        aria-label={sedeActual ? `Sede en administración: ${sedeActual.nombre}` : 'Elegir sede a administrar'}
        aria-expanded={open}
        aria-haspopup="dialog"
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: 'auto', padding: '0 10px' }}
      >
        <Icons.Sede s={17} />
        <span className="desktop-only" style={{ fontSize: 13, fontWeight: 600 }}>
          {sedeActual ? sedeActual.nombre : 'Elegir sede'}
        </span>
        {!sedeActual && <span className="bdg danger" aria-hidden="true">!</span>}
      </button>
      {open && (
        <div ref={popRef}>
          <button
            type="button"
            aria-label="Cerrar"
            tabIndex={-1}
            style={{
              position: 'fixed', inset: 0, zIndex: 89,
              background: 'transparent', border: 'none',
              padding: 0, cursor: 'default', appearance: 'none',
            }}
            onClick={() => setOpen(false)}
          />
          <dialog open className="settings-pop" aria-modal="true" aria-label="Elegir sede">
            <div className="sp-row">
              <span className="sp-lbl">Sede en administración</span>
              {loading && <div className="muted" style={{ fontSize: 13 }}>Cargando sedes…</div>}
              {!loading && sedes.length === 0 && (
                <div className="muted" style={{ fontSize: 13 }}>Aún no hay sedes creadas.</div>
              )}
              {!loading && sedes.length > 0 && (
                <div className="col" style={{ gap: 4 }}>
                  {sedes.map((sede) => (
                    <button
                      key={sede.id}
                      className={`btn btn-sm ${sede.id === seleccionId ? 'btn-primary' : 'btn-ghost'}`}
                      style={{ justifyContent: 'flex-start', opacity: sede.activa ? 1 : 0.55 }}
                      disabled={!sede.activa}
                      title={sede.activa ? undefined : 'Sede inactiva'}
                      onClick={() => elegir(sede.id)}
                    >
                      {sede.id === seleccionId ? <Icons.Check s={14} /> : <Icons.Sede s={14} />}
                      {sede.nombre}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </dialog>
        </div>
      )}
    </div>
  );
}
