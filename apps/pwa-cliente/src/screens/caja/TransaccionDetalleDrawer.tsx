/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/caja/TransaccionDetalleDrawer.tsx — Detalle de un cobro cerrado +
// edición acotada (método de pago y notas). El monto/descuento/ítems de una
// venta ya cerrada quedan fijos a propósito: cambiarlos rompería el cuadre
// de caja del turno — ver useTransaccionDetalleQuery.

import { useEffect, useRef, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { fmt, horaOf } from '../../utils/format';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useTransaccionDetalleQuery } from '../../hooks/queries/useTransaccionDetalleQuery';
import { METODO_META, METODOS_ORDEN } from './cajaMeta';
import type { MetodoPagoCaja } from '../../types/caja.types';

interface Props {
  transaccionId: string;
  cuentaId: string | null;
  onClose: () => void;
}

export function TransaccionDetalleDrawer({ transaccionId, cuentaId, onClose }: Readonly<Props>) {
  const online = useOnlineStatus();
  const { transaccion, cuenta, loading, saving, error, success, actualizar, clearFeedback } =
    useTransaccionDetalleQuery(transaccionId, cuentaId);
  const drawerRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(drawerRef, { active: true, onClose });

  const [metodo, setMetodo] = useState<MetodoPagoCaja | null>(null);
  const [notas, setNotas] = useState('');

  useEffect(() => {
    if (transaccion) {
      setMetodo(transaccion.metodo);
      setNotas(transaccion.notas ?? '');
    }
  }, [transaccion]);

  const items = cuenta?.pedidos.flatMap((p) => p.items) ?? [];
  const hayCambios = !!transaccion && (metodo !== transaccion.metodo || notas !== (transaccion.notas ?? ''));

  const guardar = async () => {
    if (!online || !hayCambios) return;
    await actualizar({ metodo: metodo ?? undefined, notas });
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer" ref={drawerRef} aria-modal="true" aria-label="Detalle del cobro">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Detalle del cobro</h3>
          {transaccion && <span className="muted mono" style={{ fontSize: 12 }}>· {transaccion.id.slice(0, 8)}</span>}
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar detalle del cobro"><Icons.Close s={17} /></button>
        </div>

        {!online && (
          <div className="banner warn" style={{ margin: '12px 20px 0' }} role="alert">
            <Icons.Alert s={16} />
            <span>Sin conexión. La edición está deshabilitada.</span>
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

        <div className="drawer-body">
          {loading && !transaccion ? (
            <div className="muted" style={{ padding: 16, textAlign: 'center' }}>Cargando cobro…</div>
          ) : !transaccion ? (
            <div className="banner err"><Icons.Alert s={16} /><span>No se encontró el cobro.</span></div>
          ) : (
            <>
              <div className="zwrap" style={{ marginBottom: 18 }}>
                <div className="zticket">
                  <div className="zc">
                    <div className="zlbl">Cobro · {horaOf(transaccion.createdAt)}</div>
                    {transaccion.cajeroNombre && <div style={{ fontSize: 12 }}>Cajero: {transaccion.cajeroNombre}</div>}
                  </div>
                  <hr className="zhr" />
                  {items.length === 0 ? (
                    <div className="muted zc" style={{ fontSize: 12 }}>Sin detalle de ítems disponible.</div>
                  ) : items.map((it) => (
                    <div className="zrow" key={it.id}><span>{it.cantidad}x {it.nombre}</span><span>{fmt(it.subtotal)}</span></div>
                  ))}
                  <hr className="zhr" />
                  {transaccion.descuento > 0 && <div className="zrow"><span>Descuento</span><span>-{fmt(transaccion.descuento)}</span></div>}
                  <div className="zrow bold"><span>Total cobrado</span><span>{fmt(transaccion.monto)}</span></div>
                </div>
              </div>

              <div className="field" style={{ marginBottom: 14 }}>
                <label htmlFor="tx-metodo-grid">Método de pago</label>
                <div id="tx-metodo-grid" className="method-grid">
                  {METODOS_ORDEN.map((key) => {
                    const meta = METODO_META[key];
                    const Ic = Icons[meta.ic];
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`method-opt ${metodo === key ? 'on' : ''}`}
                        disabled={!online}
                        onClick={() => setMetodo(key)}
                      >
                        <span className="m-ic" style={{ background: meta.color }}><Ic s={16} /></span>{meta.label}
                      </button>
                    );
                  })}
                </div>
                <span className="hint">El monto no cambia; solo corrige cómo se registró el pago.</span>
              </div>

              <div className="field">
                <label htmlFor="tx-notas">Notas</label>
                <div className="input">
                  <textarea
                    id="tx-notas"
                    rows={3}
                    disabled={!online}
                    value={notas}
                    onChange={(e) => setNotas(e.target.value)}
                    placeholder="Opcional · referencia, aclaración, etc."
                  />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={!hayCambios || saving || !online} onClick={guardar}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14, borderWidth: 2 }} /> : <Icons.Check s={15} />} Guardar cambios
          </button>
        </div>
      </aside>
    </div>
  );
}
