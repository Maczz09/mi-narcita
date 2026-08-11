// components/layout/SedeGateModal.tsx — Modal de bienvenida para el admin
// general (sedeId nulo) que todavía no eligió con qué sede trabajar. Sin
// esto, sus primeras acciones (crear proveedor, insumo, orden…) fallaban en
// silencio contra el backend ("Indica la sede") porque ninguna pantalla le
// pedía elegir sede primero — solo lo insinuaba un ícono con "!" en el header.
//
// No es descartable a propósito (sin botón cerrar, Esc no hace nada, el
// scrim no cierra al click): elegir sede es un prerrequisito real para casi
// todo en la app, no una preferencia opcional. La única salida es que NO
// haya sedes creadas todavía — ahí no bloqueamos, porque el admin necesita
// poder navegar a Sedes para crear la primera.

import { useRef, useState } from 'react';
import { useAuthStore } from '../../store/auth.store';
import { useSedesQuery } from '../../hooks/queries/useSedesQuery';
import { queryClient } from '../../api/queryClient';
import { getSedeSeleccionada, setSedeSeleccionada } from '../../api/client';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { Icons } from '../ui/icons';

export function SedeGateModal() {
  const user = useAuthStore((s) => s.user);
  const esAdminGeneral = !!user && user.sedeId == null;
  const { sedes, loading } = useSedesQuery({ enabled: esAdminGeneral });
  const modalRef = useRef<HTMLDivElement>(null);
  // Estado local (no solo el módulo client.ts) para que elegir una sede
  // oculte el modal en el acto, igual que SedeSwitcher.elegir(): invalidar
  // queries no garantiza un re-render de ESTE componente si `sedes` no cambia.
  const [seleccionId, setSeleccionId] = useState(() => getSedeSeleccionada());

  const sedesActivas = sedes.filter((s) => s.activa);
  const mostrar = esAdminGeneral && !loading && seleccionId == null && sedesActivas.length > 0;

  useFocusTrap(modalRef, { active: mostrar, onClose: () => {} });

  if (!mostrar) return null;

  const elegir = (id: string) => {
    setSedeSeleccionada(id);
    setSeleccionId(id);
    void queryClient.invalidateQueries();
  };

  return (
    <div className="modal-wrap" role="dialog" aria-modal="true" aria-labelledby="sede-gate-title">
      <div className="scrim" />
      <div className="modal" ref={modalRef} style={{ width: 460 }}>
        <div className="modal-body">
          <div className="modal-icon" style={{ background: 'var(--accent-soft)', color: 'var(--accent)' }}>
            <Icons.Sede s={22} />
          </div>
          <h3 id="sede-gate-title">¿Con qué sede vas a trabajar?</h3>
          <p>Administras varios locales. Elige una para continuar — puedes cambiarla luego desde el ícono de sede, junto al nombre.</p>
          <div className="sede-gate-list">
            {sedesActivas.map((sede, i) => (
              <button
                key={sede.id}
                type="button"
                className="sede-gate-item"
                style={{ '--i': i } as React.CSSProperties}
                onClick={() => elegir(sede.id)}
              >
                <span className="sede-gate-ic"><Icons.Sede s={16} /></span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontWeight: 700, fontSize: 14 }}>{sede.nombre}</span>
                  {sede.direccion && <span className="muted" style={{ display: 'block', fontSize: 12 }}>{sede.direccion}</span>}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
