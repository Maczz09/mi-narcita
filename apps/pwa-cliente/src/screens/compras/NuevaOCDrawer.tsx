/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/NuevaOCDrawer.tsx — Crear una orden de compra en BORRADOR
// contra proveedores e insumos reales.

import { useMemo, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { formatMoney } from '../../mappers/compras.mapper';
import type { CrearOrdenPayload, InsumoVM, ProveedorVM } from '../../types/compras.types';

interface NuevaOCDrawerProps {
  proveedores: ProveedorVM[];
  insumos: InsumoVM[];
  onClose: () => void;
  onCrear: (payload: CrearOrdenPayload) => Promise<unknown>;
}

export function NuevaOCDrawer({ proveedores, insumos, onClose, onCrear }: Readonly<NuevaOCDrawerProps>) {
  const [proveedorId, setProveedorId] = useState(proveedores[0]?.id ?? '');
  const [sel, setSel] = useState<Record<string, number>>({});
  const [creando, setCreando] = useState(false);

  const insumosProveedor = useMemo(
    () => insumos.filter((i) => i.proveedorId === proveedorId),
    [insumos, proveedorId],
  );

  const items = Object.entries(sel).filter(([, q]) => q > 0);
  const total = items.reduce((s, [id, q]) => {
    const insumo = insumos.find((i) => i.id === id);
    return s + (insumo ? insumo.costoUnitario * q : 0);
  }, 0);

  const setQ = (id: string, q: number) => setSel((s) => ({ ...s, [id]: Math.max(0, q) }));

  const crear = async () => {
    if (items.length === 0 || creando) return;
    setCreando(true);
    try {
      await onCrear({
        proveedorId: proveedorId || undefined,
        items: items.map(([insumoId, cantidadPedida]) => ({ insumoId, cantidadPedida })),
      });
    } finally {
      setCreando(false);
    }
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 17 }}>Nueva orden de compra</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="compra-proveedor">Proveedor</label>
            <div className="input">
              <select
                id="compra-proveedor"
                value={proveedorId}
                onChange={(e) => { setProveedorId(e.target.value); setSel({}); }}
                style={{ border: 0, background: 'transparent', width: '100%' }}
              >
                {proveedores.length === 0 && <option value="">Sin proveedores registrados</option>}
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
            Insumos del proveedor
          </div>
          {insumosProveedor.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>Este proveedor no tiene insumos asociados todavía.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {insumosProveedor.map((i) => (
                <div
                  key={i.id}
                  className="panel"
                  style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderColor: i.bajoMinimo ? 'var(--warn)' : 'var(--border)' }}
                >
                  <div style={{ flex: 1 }}>
                    <b style={{ fontSize: 13.5 }}>{i.nombre}</b>
                    <div className="muted" style={{ fontSize: 11.5 }}>
                      stock {i.stockActual} {i.unidad} · mín {i.stockMinimo} {i.unidad} · {formatMoney(i.costoUnitario)}/{i.unidad}
                      {i.bajoMinimo ? ' · reponer' : ''}
                    </div>
                  </div>
                  <div className="stepper sm">
                    <button onClick={() => setQ(i.id, (sel[i.id] || 0) - 1)}><Icons.Minus s={13} /></button>
                    <span className="qv">{sel[i.id] || 0}</span>
                    <button onClick={() => setQ(i.id, (sel[i.id] || 0) + 1)}><Icons.Plus s={13} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, alignItems: 'center' }}>
          <div><div className="hint">Total · {items.length} líneas</div><b className="mono" style={{ fontSize: 18 }}>{formatMoney(total)}</b></div>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={items.length === 0 || creando} onClick={crear}>
            <Icons.Check s={15} /> Crear borrador
          </button>
        </div>
      </aside>
    </div>
  );
}
