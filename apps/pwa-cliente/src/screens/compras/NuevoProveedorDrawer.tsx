/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/NuevoProveedorDrawer.tsx — Alta de proveedor (fijo, con RUC)
// o compra ad-hoc de mercado (RUC opcional a propósito).

import { useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import type { CrearProveedorPayload } from '../../types/compras.types';

interface NuevoProveedorDrawerProps {
  onClose: () => void;
  onCrear: (payload: CrearProveedorPayload) => Promise<unknown>;
}

export function NuevoProveedorDrawer({ onClose, onCrear }: Readonly<NuevoProveedorDrawerProps>) {
  const [nombre, setNombre] = useState('');
  const [ruc, setRuc] = useState('');
  const [categoria, setCategoria] = useState('');
  const [contacto, setContacto] = useState('');
  const [telefono, setTelefono] = useState('');
  const [diasEntrega, setDiasEntrega] = useState('');
  const [condicionPago, setCondicionPago] = useState('');
  const [guardando, setGuardando] = useState(false);

  const crear = async () => {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    try {
      await onCrear({
        nombre: nombre.trim(),
        ruc: ruc.trim() || undefined,
        categoria: categoria.trim() || undefined,
        contacto: contacto.trim() || undefined,
        telefono: telefono.trim() || undefined,
        diasEntrega: diasEntrega.trim() || undefined,
        condicionPago: condicionPago.trim() || undefined,
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
          <h3 style={{ fontSize: 17 }}>Nuevo proveedor</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body" style={{ display: 'grid', gap: 12 }}>
          <div className="field">
            <label htmlFor="pv-nombre">Nombre *</label>
            <div className="input"><input id="pv-nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Pesquera del Sur" /></div>
          </div>
          <div className="field">
            <label htmlFor="pv-ruc">RUC (déjalo vacío si es compra de mercado)</label>
            <div className="input"><input id="pv-ruc" value={ruc} onChange={(e) => setRuc(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <div className="field">
            <label htmlFor="pv-categoria">Categoría</label>
            <div className="input"><input id="pv-categoria" value={categoria} onChange={(e) => setCategoria(e.target.value)} placeholder="Ej: Pescados y mariscos" /></div>
          </div>
          <div className="field">
            <label htmlFor="pv-contacto">Contacto</label>
            <div className="input"><input id="pv-contacto" value={contacto} onChange={(e) => setContacto(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <div className="field">
            <label htmlFor="pv-telefono">Teléfono</label>
            <div className="input"><input id="pv-telefono" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Opcional" /></div>
          </div>
          <div className="field">
            <label htmlFor="pv-dias">Días de entrega</label>
            <div className="input"><input id="pv-dias" value={diasEntrega} onChange={(e) => setDiasEntrega(e.target.value)} placeholder="Ej: Mar · Vie" /></div>
          </div>
          <div className="field">
            <label htmlFor="pv-credito">Condición de pago</label>
            <div className="input"><input id="pv-credito" value={condicionPago} onChange={(e) => setCondicionPago(e.target.value)} placeholder="Ej: 15 días o Contado" /></div>
          </div>
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={!nombre.trim() || guardando} onClick={crear}>
            <Icons.Check s={15} /> Crear proveedor
          </button>
        </div>
      </aside>
    </div>
  );
}
