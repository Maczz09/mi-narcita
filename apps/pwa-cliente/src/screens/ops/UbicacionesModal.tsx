/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/ops/UbicacionesModal.tsx — CRUD de ubicaciones (zonas del salón).
// Antes "Ubicación" en Nueva mesa era texto libre con datalist: un typo
// creaba una zona duplicada. Ahora ubicaciones es una entidad propia
// (servicio-mesas) y se gestiona acá; Nueva mesa solo selecciona por id.

import { useRef, useState, type SubmitEvent } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useUbicacionesQuery } from '../../hooks/queries/useUbicacionesQuery';
import type { UbicacionVM } from '../../types/mesa.types';

interface Props {
  onClose: () => void;
}

export function UbicacionesModal({ onClose }: Readonly<Props>) {
  const online = useOnlineStatus();
  const {
    ubicaciones, loading, saving, error, success,
    crearUbicacion, actualizarUbicacion, eliminarUbicacion, clearFeedback,
  } = useUbicacionesQuery();
  const modalRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(modalRef, { active: true, onClose });

  const [nombreNuevo, setNombreNuevo] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editNombre, setEditNombre] = useState('');

  const handleCrear = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!online || !nombreNuevo.trim()) return;
    await crearUbicacion({ nombre: nombreNuevo.trim() });
    setNombreNuevo('');
  };

  const abrirEdicion = (u: UbicacionVM) => {
    setEditId(u.id);
    setEditNombre(u.nombre);
  };

  const guardarEdicion = async () => {
    if (!editId || !editNombre.trim()) return;
    await actualizarUbicacion(editId, { nombre: editNombre.trim() });
    setEditId(null);
  };

  const handleEliminar = async (u: UbicacionVM) => {
    if (!online) return;
    if (!window.confirm(`¿Eliminar la ubicación "${u.nombre}"?`)) return;
    await eliminarUbicacion(u.id);
  };

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog
        open
        className="modal"
        ref={modalRef}
        aria-modal="true"
        aria-label="Gestionar ubicaciones"
        style={{ position: 'relative', zIndex: 1 }}
      >
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Ubicaciones</h3>
          <span className="muted" style={{ fontSize: 13 }}>· zonas del salón</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar gestión de ubicaciones"><Icons.Close s={17} /></button>
        </div>

        {!online && (
          <div className="banner warn" style={{ margin: '12px 20px 0' }} role="alert">
            <Icons.Alert s={16} />
            <span>Sin conexión. La gestión de ubicaciones está deshabilitada.</span>
          </div>
        )}

        {(error || success) && (
          <div className={`banner ${error ? 'err' : 'ok'}`} style={{ margin: '12px 20px 0' }} role="alert">
            {error ? <Icons.Alert s={16} /> : <Icons.Check s={16} />}
            <span>{error ?? success}</span>
            <span className="spacer" />
            <button className="btn btn-sm btn-ghost" onClick={clearFeedback} aria-label="Cerrar notificación">Cerrar</button>
          </div>
        )}

        <div className="modal-scroll" style={{ padding: 20 }}>
          <form className="row" style={{ gap: 8, marginBottom: 16 }} onSubmit={handleCrear}>
            <div className="input" style={{ flex: 1 }}>
              <input
                required
                value={nombreNuevo}
                onChange={(e) => setNombreNuevo(e.target.value)}
                placeholder="Nueva ubicación, ej. Azotea"
                aria-label="Nombre de la nueva ubicación"
                disabled={!online}
              />
            </div>
            <button className="btn btn-primary" disabled={saving || !online || !nombreNuevo.trim()} type="submit">
              {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Plus s={16} />}
              Agregar
            </button>
          </form>

          {loading && ubicaciones.length === 0 ? (
            <div className="muted" style={{ padding: 12, textAlign: 'center' }}>Cargando…</div>
          ) : ubicaciones.length === 0 ? (
            <div className="empty empty-compact">
              <p>Sin ubicaciones todavía. Crea la primera arriba.</p>
            </div>
          ) : (
            <div className="panel" style={{ padding: '4px 14px' }}>
              {ubicaciones.map((u) => (
                <div className="dish-line" style={{ gap: 10 }} key={u.id}>
                  {editId === u.id ? (
                    <>
                      <div className="input" style={{ flex: 1 }}>
                        <input value={editNombre} onChange={(e) => setEditNombre(e.target.value)} autoFocus />
                      </div>
                      <button className="btn btn-sm btn-ghost" onClick={() => setEditId(null)}>Cancelar</button>
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={saving || !editNombre.trim()}
                        onClick={guardarEdicion}
                      >
                        <Icons.Check s={14} /> Guardar
                      </button>
                    </>
                  ) : (
                    <>
                      <span style={{ flex: 1, fontWeight: 600 }}>{u.nombre}</span>
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={!online}
                        onClick={() => abrirEdicion(u)}
                        aria-label={`Editar ${u.nombre}`}
                      >
                        Editar
                      </button>
                      <button
                        className="btn btn-sm btn-danger"
                        disabled={!online || saving}
                        onClick={() => handleEliminar(u)}
                        aria-label={`Eliminar ${u.nombre}`}
                      >
                        Eliminar
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </dialog>
    </div>
  );
}
