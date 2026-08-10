/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/NuevoInsumoDrawer.tsx — Alta de insumo (lo que se COMPRA;
// distinto de Producto/servicio-inventario, lo que se VENDE).

import { useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import type { CrearInsumoPayload, ProveedorVM } from '../../types/compras.types';

interface NuevoInsumoDrawerProps {
  proveedores: ProveedorVM[];
  onClose: () => void;
  onCrear: (payload: CrearInsumoPayload) => Promise<unknown>;
}

export function NuevoInsumoDrawer({ proveedores, onClose, onCrear }: Readonly<NuevoInsumoDrawerProps>) {
  const [nombre, setNombre] = useState('');
  const [unidad, setUnidad] = useState('kg');
  const [proveedorId, setProveedorId] = useState('');
  const [stockActual, setStockActual] = useState('0');
  const [stockMinimo, setStockMinimo] = useState('0');
  const [costoUnitario, setCostoUnitario] = useState('0');
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    if (!nombre.trim() || !unidad.trim() || guardando) return;
    setGuardando(true);
    try {
      await onCrear({
        nombre: nombre.trim(),
        unidad: unidad.trim(),
        proveedorId: proveedorId || undefined,
        stockActual: Number(stockActual) || 0,
        stockMinimo: Number(stockMinimo) || 0,
        costoUnitario: Number(costoUnitario) || 0,
      });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 17 }}>Nuevo insumo</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body" style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label htmlFor="in-nombre">Nombre *</label>
            <div className="input"><input id="in-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Pescado (lenguado)" /></div>
          </div>
          <div className="field">
            <label htmlFor="in-unidad">Unidad de compra *</label>
            <div className="input"><input id="in-unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} placeholder="kg, bot, pack, und, lt" /></div>
          </div>
          <div className="field">
            <label htmlFor="in-proveedor">Proveedor</label>
            <div className="input">
              <select id="in-proveedor" value={proveedorId} onChange={(e) => setProveedorId(e.target.value)} style={{ border: 0, background: 'transparent', width: '100%' }}>
                <option value="">Sin proveedor fijo</option>
                {proveedores.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
              </select>
            </div>
          </div>
          <div className="field">
            <label htmlFor="in-stock">Stock actual</label>
            <div className="input"><input id="in-stock" inputMode="decimal" value={stockActual} onChange={(e) => setStockActual(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          </div>
          <div className="field">
            <label htmlFor="in-minimo">Stock mínimo</label>
            <div className="input"><input id="in-minimo" inputMode="decimal" value={stockMinimo} onChange={(e) => setStockMinimo(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          </div>
          <div className="field">
            <label htmlFor="in-costo">Costo unitario (S/)</label>
            <div className="input"><input id="in-costo" inputMode="decimal" value={costoUnitario} onChange={(e) => setCostoUnitario(e.target.value.replace(/[^\d.]/g, ''))} /></div>
          </div>
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={!nombre.trim() || !unidad.trim() || guardando} onClick={crear}>
            <Icons.Check s={15} /> Crear insumo
          </button>
        </div>
      </aside>
    </div>
  );
}
