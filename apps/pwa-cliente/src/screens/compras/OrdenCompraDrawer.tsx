/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/OrdenCompraDrawer.tsx — Crear una orden de compra en
// BORRADOR, o editar los ítems/cantidades de una que sigue en borrador.
// El proveedor NO se puede cambiar en edición (el backend no lo admite:
// reemplazar proveedor sería, en la práctica, otra orden).

import { useMemo, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { formatMoney } from '../../mappers/compras.mapper';
import type { ActualizarOrdenPayload, CrearOrdenPayload, InsumoVM, OrdenCompraVM, ProveedorVM } from '../../types/compras.types';

interface OrdenCompraDrawerProps {
  orden: OrdenCompraVM | null;
  proveedores: ProveedorVM[];
  insumos: InsumoVM[];
  saving: boolean;
  onClose: () => void;
  onCrear: (payload: CrearOrdenPayload) => Promise<unknown>;
  onActualizar: (id: string, payload: ActualizarOrdenPayload) => Promise<unknown>;
}

export function OrdenCompraDrawer({ orden, proveedores, insumos, saving, onClose, onCrear, onActualizar }: Readonly<OrdenCompraDrawerProps>) {
  const isNew = !orden;
  const [proveedorId, setProveedorId] = useState(orden?.proveedorId ?? proveedores[0]?.id ?? '');
  const [sel, setSel] = useState<Record<string, number>>(() => {
    if (!orden) return {};
    return Object.fromEntries(orden.items.map((it) => [it.insumoId, it.cantidadPedida]));
  });

  // Insumos a mostrar: los del proveedor elegido + los que ya estaban en la
  // orden (por si su insumo cambió de proveedor fijo después de creada).
  const insumosProveedor = useMemo(() => {
    const propios = insumos.filter((i) => i.proveedorId === proveedorId);
    if (isNew) return propios;
    const idsPropios = new Set(propios.map((i) => i.id));
    const deLaOrden = insumos.filter((i) => sel[i.id] != null && !idsPropios.has(i.id));
    return [...propios, ...deLaOrden];
  }, [insumos, proveedorId, isNew, sel]);

  const items = Object.entries(sel).filter(([, q]) => q > 0);
  const total = items.reduce((s, [id, q]) => {
    const insumo = insumos.find((i) => i.id === id);
    return s + (insumo ? insumo.costoUnitario * q : 0);
  }, 0);

  const setQ = (id: string, q: number) => setSel((s) => ({ ...s, [id]: Math.max(0, q) }));

  const guardar = async () => {
    if (items.length === 0 || saving) return;
    if (isNew) {
      await onCrear({
        proveedorId: proveedorId || undefined,
        items: items.map(([insumoId, cantidadPedida]) => ({ insumoId, cantidadPedida })),
      });
    } else {
      await onActualizar(orden.id, {
        items: items.map(([insumoId, cantidadPedida]) => ({ insumoId, cantidadPedida })),
      });
    }
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 17 }}>{isNew ? 'Nueva orden de compra' : `Editar ${orden.codigo}`}</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <div className="field" style={{ marginBottom: 14 }}>
            <label htmlFor="compra-proveedor">Proveedor</label>
            {isNew ? (
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
            ) : (
              <div className="input" style={{ opacity: 0.75 }}>
                <span>{orden.proveedorNombre}</span>
              </div>
            )}
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
          <button className="btn btn-primary" disabled={items.length === 0 || saving} onClick={guardar}>
            <Icons.Check s={15} /> {isNew ? 'Crear borrador' : 'Guardar cambios'}
          </button>
        </div>
      </aside>
    </div>
  );
}
