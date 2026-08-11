/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/InsumoDrawer.tsx — Alta y edición de insumo (lo que se
// COMPRA; distinto de Producto/servicio-inventario, lo que se VENDE).

import { useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { unidadesConValorActual, UNIDADES_COMPRA_GRUPOS } from './unidadesCompra';
import type { ActualizarInsumoPayload, CrearInsumoPayload, InsumoVM, ProveedorVM } from '../../types/compras.types';

interface InsumoDrawerProps {
  insumo: InsumoVM | null;
  proveedores: ProveedorVM[];
  saving: boolean;
  onClose: () => void;
  onCrear: (payload: CrearInsumoPayload) => Promise<unknown>;
  onActualizar: (id: string, payload: ActualizarInsumoPayload) => Promise<unknown>;
}

export function InsumoDrawer({ insumo, proveedores, saving, onClose, onCrear, onActualizar }: Readonly<InsumoDrawerProps>) {
  const isNew = !insumo;
  const [nombre, setNombre] = useState(insumo?.nombre ?? '');
  const [unidad, setUnidad] = useState(insumo?.unidad ?? 'kg');
  const [proveedorId, setProveedorId] = useState(insumo?.proveedorId ?? '');
  const [stockActual, setStockActual] = useState('0');
  const [stockMinimo, setStockMinimo] = useState(insumo ? String(insumo.stockMinimo) : '0');
  const [costoUnitario, setCostoUnitario] = useState(insumo ? String(insumo.costoUnitario) : '0');

  const opcionesUnidad = unidadesConValorActual(insumo?.unidad);
  const valido = nombre.trim() !== '' && unidad.trim() !== '';

  const guardar = async () => {
    if (!valido || saving) return;
    if (isNew) {
      await onCrear({
        nombre: nombre.trim(),
        unidad: unidad.trim(),
        proveedorId: proveedorId || undefined,
        stockActual: Number(stockActual) || 0,
        stockMinimo: Number(stockMinimo) || 0,
        costoUnitario: Number(costoUnitario) || 0,
      });
    } else {
      await onActualizar(insumo.id, {
        nombre: nombre.trim(),
        unidad: unidad.trim(),
        proveedorId: proveedorId || null,
        stockMinimo: Number(stockMinimo) || 0,
        costoUnitario: Number(costoUnitario) || 0,
      });
    }
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 17 }}>{isNew ? 'Nuevo insumo' : insumo.nombre}</h3>
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
            <div className="input">
              <select id="in-unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)} style={{ border: 0, background: 'transparent', width: '100%' }}>
                {UNIDADES_COMPRA_GRUPOS.map((grupo) => (
                  <optgroup key={grupo} label={grupo}>
                    {opcionesUnidad.filter((u) => u.grupo === grupo).map((u) => (
                      <option key={u.value} value={u.value}>{u.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
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
          {isNew ? (
            <div className="field">
              <label htmlFor="in-stock">Stock actual</label>
              <div className="input"><input id="in-stock" inputMode="decimal" value={stockActual} onChange={(e) => setStockActual(e.target.value.replace(/[^\d.]/g, ''))} /></div>
            </div>
          ) : (
            <div className="field">
              <span className="hint">Stock actual</span>
              <div className="kv" style={{ padding: '6px 0' }}>
                <span className="v mono">{insumo.stockActual} {insumo.unidad}</span>
              </div>
              <span className="hint">Se actualiza al recepcionar compras o registrar mermas, no aquí.</span>
            </div>
          )}
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
          <button className="btn btn-primary" disabled={!valido || saving} onClick={guardar}>
            <Icons.Check s={15} /> {isNew ? 'Crear insumo' : 'Guardar cambios'}
          </button>
        </div>
      </aside>
    </div>
  );
}
