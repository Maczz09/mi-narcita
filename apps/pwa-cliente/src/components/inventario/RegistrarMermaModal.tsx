/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/inventario/RegistrarMermaModal.tsx — Registrar merma (T-22):
// botellas rotas/vencidas u otra pérdida de stock que no viene de una venta.
// Exige un motivo — no se puede registrar sin explicar la pérdida.

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { ProductoVM } from '../../types/inventario.types';

interface Props {
  producto: ProductoVM;
  saving: boolean;
  onClose: () => void;
  onSave: (cantidad: number, motivo: string) => void;
}

export function RegistrarMermaModal({ producto, saving, onClose, onSave }: Readonly<Props>) {
  const [cantidad, setCantidad] = useState('1');
  const [motivo, setMotivo] = useState('');

  const stockDisponible = producto.stockActual ?? 0;
  const cant = Number(cantidad || 0);
  const valido = Number.isInteger(cant) && cant > 0 && cant <= stockDisponible && motivo.trim() !== '';

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Registrar merma" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Registrar merma</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          <div className="muted" style={{ marginBottom: 14 }}>
            <strong>{producto.nombre}</strong> · stock actual: <span className="mono">{stockDisponible}</span>
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <label htmlFor="merma-cantidad">Cantidad perdida</label>
            <div className="input">
              <input
                id="merma-cantidad"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                autoFocus
              />
            </div>
            {cant > stockDisponible && <div className="hint" style={{ color: 'var(--danger)' }}>No puedes mermar más de lo que hay en stock ({stockDisponible}).</div>}
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="merma-motivo">Motivo</label>
            <div className="input">
              <textarea
                id="merma-motivo"
                rows={3}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Botellas de cerveza rotas al descargar el pedido"
              />
            </div>
          </div>

          <button className="btn btn-primary btn-block" disabled={!valido || saving} onClick={() => onSave(cant, motivo.trim())}>
            <Icons.Alert s={15} /> Registrar merma
          </button>
        </div>
      </dialog>
    </div>
  );
}
