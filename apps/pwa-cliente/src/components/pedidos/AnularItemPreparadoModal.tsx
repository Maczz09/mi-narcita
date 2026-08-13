/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/pedidos/AnularItemPreparadoModal.tsx — CU-01 (Caso B): el plato
// ya salió de cocina/barra (o es de Inventario y ya se sirvió). Distinto del
// "Anular ítem" simple: acá hay que decidir si igual se cobra al cliente, y
// siempre queda registrado como merma + auditoría (nunca avisa a cocina, ya
// no tiene nada que preparar).

import { useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import type { PedidoItemVM } from '../../types/pedido.types';

interface Props {
  item: PedidoItemVM;
  saving: boolean;
  onClose: () => void;
  onConfirm: (motivo: string, cobrar: boolean, observacion?: string) => void;
}

export function AnularItemPreparadoModal({ item, saving, onClose, onConfirm }: Readonly<Props>) {
  const [motivo, setMotivo] = useState('');
  const [cobrar, setCobrar] = useState<boolean | null>(null);
  const [observacion, setObservacion] = useState('');

  const valido = motivo.trim() !== '' && cobrar !== null;

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <dialog open className="modal" aria-modal="true" aria-label="Anular ítem ya preparado" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Anular ítem ya preparado</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div style={{ padding: '4px 20px 20px' }}>
          <div className="muted" style={{ marginBottom: 14 }}>
            <strong>{item.cantidad}× {item.nombre}</strong> ya salió de {item.area === 'BAR' ? 'barra' : 'cocina'} — se registrará como pérdida (merma) sin importar la decisión de cobro.
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="anular-motivo">Motivo</label>
            <div className="input">
              <textarea
                id="anular-motivo"
                rows={2}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. El cliente lo rechazó por error en la preparación"
                autoFocus
              />
            </div>
          </div>

          <div className="field" style={{ marginBottom: 14 }}>
            <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
              ¿Se cobra al cliente?
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              <button
                type="button"
                className={`panel ${cobrar === true ? 'sel-option' : ''}`}
                style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', border: cobrar === true ? '2px solid var(--accent)' : undefined }}
                onClick={() => setCobrar(true)}
              >
                <b>Sí, mantener en la cuenta</b>
                <div className="muted" style={{ fontSize: 13 }}>El ítem sigue cobrándose normal; solo se registra la pérdida.</div>
              </button>
              <button
                type="button"
                className={`panel ${cobrar === false ? 'sel-option' : ''}`}
                style={{ padding: '10px 14px', textAlign: 'left', cursor: 'pointer', border: cobrar === false ? '2px solid var(--accent)' : undefined }}
                onClick={() => setCobrar(false)}
              >
                <b>No, retirar de la cuenta</b>
                <div className="muted" style={{ fontSize: 13 }}>El ítem se descuenta del total a pagar.</div>
              </button>
            </div>
          </div>

          <div className="field" style={{ marginBottom: 16 }}>
            <label htmlFor="anular-observacion">Observación (opcional)</label>
            <div className="input">
              <textarea
                id="anular-observacion"
                rows={2}
                value={observacion}
                onChange={(e) => setObservacion(e.target.value)}
                placeholder="Detalle adicional para el registro de auditoría"
              />
            </div>
          </div>

          <button
            className="btn btn-primary btn-block"
            disabled={!valido || saving}
            onClick={() => onConfirm(motivo.trim(), cobrar === true, observacion.trim() || undefined)}
          >
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Alert s={15} />} Confirmar anulación
          </button>
        </div>
      </dialog>
    </div>
  );
}
