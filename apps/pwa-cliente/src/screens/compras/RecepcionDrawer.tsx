/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/RecepcionDrawer.tsx — Registrar recepción (parcial o total)
// de una orden de compra. Stepper de cantidad por ítem con el pendiente real
// como tope y valor inicial — NO checkbox: el mock anterior marcaba la orden
// completa sin importar qué se tildara; el backend real deriva PARCIAL vs
// RECIBIDA de las cantidades exactas que se manden aquí.

import { useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { formatMoney } from '../../mappers/compras.mapper';
import type { OrdenCompraVM, RegistrarRecepcionPayload } from '../../types/compras.types';

interface RecepcionDrawerProps {
  orden: OrdenCompraVM;
  onClose: () => void;
  onRecibir: (payload: RegistrarRecepcionPayload) => Promise<unknown>;
  onCerrarConFaltante: (motivo?: string) => Promise<unknown>;
}

export function RecepcionDrawer({ orden, onClose, onRecibir, onCerrarConFaltante }: Readonly<RecepcionDrawerProps>) {
  const [cantidades, setCantidades] = useState<Record<string, number>>(() =>
    Object.fromEntries(orden.items.map((it) => [it.id, it.pendiente])),
  );
  const [enviando, setEnviando] = useState(false);
  const [mostrarCierre, setMostrarCierre] = useState(false);
  const [motivoCierre, setMotivoCierre] = useState('');

  const setCantidad = (itemId: string, valor: number, max: number) =>
    setCantidades((c) => ({ ...c, [itemId]: Math.min(Math.max(0, valor), max) }));

  const totalRecibido = orden.items.reduce((s, it) => s + (cantidades[it.id] ?? 0) * it.costoUnitario, 0);
  const algunaCantidad = orden.items.some((it) => (cantidades[it.id] ?? 0) > 0);

  const confirmar = async () => {
    if (enviando) return;
    const items = orden.items
      .filter((it) => (cantidades[it.id] ?? 0) > 0)
      .map((it) => ({ ordenItemId: it.id, cantidadRecibida: cantidades[it.id] }));
    if (items.length === 0) return;
    setEnviando(true);
    try {
      await onRecibir({ items });
      onClose();
    } finally {
      setEnviando(false);
    }
  };

  const cerrarConFaltante = async () => {
    if (enviando) return;
    setEnviando(true);
    try {
      await onCerrarConFaltante(motivoCierre || undefined);
      onClose();
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <span className="modal-icon" style={{ width: 34, height: 34, margin: 0, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}>
            <Icons.ArrowDown s={17} />
          </span>
          <h3 style={{ fontSize: 17 }}>Recepción · {orden.codigo}</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <div className="banner info" style={{ marginBottom: 14 }}>
            <Icons.Bag s={16} /><span>{orden.proveedorNombre} · indica cuánto llegó de cada ítem</span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {orden.items.map((it) => (
              <div key={it.id} className="panel" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <b style={{ fontSize: 13.5 }}>{it.insumoNombre}</b>
                  <div className="muted" style={{ fontSize: 11.5 }}>
                    pedido {it.cantidadPedida} {it.unidad} · ya recibido {it.cantidadRecibida} {it.unidad} · pendiente {it.pendiente} {it.unidad}
                  </div>
                </div>
                <div className="stepper sm">
                  <button onClick={() => setCantidad(it.id, (cantidades[it.id] ?? 0) - 1, it.pendiente)}><Icons.Minus s={13} /></button>
                  <span className="qv">{cantidades[it.id] ?? 0}</span>
                  <button onClick={() => setCantidad(it.id, (cantidades[it.id] ?? 0) + 1, it.pendiente)}><Icons.Plus s={13} /></button>
                </div>
              </div>
            ))}
          </div>

          <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 14 }} onClick={() => setMostrarCierre((v) => !v)}>
            {mostrarCierre ? 'Cancelar' : 'No va a llegar el resto — cerrar con faltante'}
          </button>
          {mostrarCierre && (
            <div className="field" style={{ marginTop: 10 }}>
              <label htmlFor="motivo-cierre">Motivo (opcional)</label>
              <div className="input">
                <input
                  id="motivo-cierre"
                  value={motivoCierre}
                  onChange={(e) => setMotivoCierre(e.target.value)}
                  placeholder="Ej: proveedor sin stock"
                />
              </div>
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, alignItems: 'center' }}>
          <div><div className="hint">Total recibido</div><b className="mono" style={{ fontSize: 18 }}>{formatMoney(totalRecibido)}</b></div>
          <span className="spacer" />
          {mostrarCierre ? (
            <button className="btn btn-soft" disabled={enviando} onClick={cerrarConFaltante}>
              <Icons.Alert s={15} /> Cerrar con faltante
            </button>
          ) : (
            <button className="btn btn-success" disabled={!algunaCantidad || enviando} onClick={confirmar}>
              <Icons.Check s={15} /> Confirmar recepción
            </button>
          )}
        </div>
      </aside>
    </div>
  );
}
