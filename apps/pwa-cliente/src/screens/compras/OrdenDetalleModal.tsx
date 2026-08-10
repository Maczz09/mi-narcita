/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/OrdenDetalleModal.tsx — Detalle de una orden de compra:
// ítems, historial de recepciones y comprobantes (fotos de boleta/factura).

import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { useComprobantesMutation, useOrdenDetalleQuery } from '../../hooks/queries/useComprasQuery';
import { formatMoney } from '../../mappers/compras.mapper';
import { ComprobanteUploader } from './ComprobanteUploader';
import { ComprobanteMiniatura } from './ComprobanteViewer';

interface OrdenDetalleModalProps {
  ordenId: string;
  onClose: () => void;
  onEnviar: (id: string) => Promise<unknown>;
  onAnular: (id: string, motivo?: string) => Promise<unknown>;
  onEliminar: (id: string) => Promise<unknown>;
}

export function OrdenDetalleModal({ ordenId, onClose, onEnviar, onAnular, onEliminar }: Readonly<OrdenDetalleModalProps>) {
  const { orden, recepciones, comprobantes, loading } = useOrdenDetalleQuery(ordenId);
  const comprobanteMut = useComprobantesMutation();

  return (
    <div className="modal-wrap">
      <Scrim onClose={onClose} />
      <div className="modal xwide" style={{ position: 'relative', zIndex: 1 }}>
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 17 }}>{orden ? orden.codigo : 'Orden de compra'}</h3>
          {orden && <span className={`badge dot ${orden.estadoClass}`} style={{ marginLeft: 10 }}>{orden.estadoLabel}</span>}
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="modal-scroll" style={{ padding: 20, display: 'grid', gap: 18 }}>
          {loading && <div className="muted">Cargando…</div>}
          {orden && (
            <>
              <div>
                <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                  Ítems
                </div>
                <div className="table-wrap">
                  <table className="dt">
                    <thead>
                      <tr>
                        <th>Insumo</th>
                        <th style={{ textAlign: 'right' }}>Pedido</th>
                        <th style={{ textAlign: 'right' }}>Recibido</th>
                        <th style={{ textAlign: 'right' }}>Costo</th>
                        <th style={{ textAlign: 'right' }}>Subtotal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {orden.items.map((it) => (
                        <tr key={it.id}>
                          <td>{it.insumoNombre}</td>
                          <td style={{ textAlign: 'right' }} className="mono">{it.cantidadPedida} {it.unidad}</td>
                          <td style={{ textAlign: 'right' }} className="mono">{it.cantidadRecibida} {it.unidad}</td>
                          <td style={{ textAlign: 'right' }} className="mono">{formatMoney(it.costoUnitario)}</td>
                          <td style={{ textAlign: 'right' }} className="mono">{formatMoney(it.subtotal)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {recepciones.length > 0 && (
                <div>
                  <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>
                    Recepciones
                  </div>
                  <div style={{ display: 'grid', gap: 6 }}>
                    {recepciones.map((r) => (
                      <div key={r.id} className="panel" style={{ padding: '8px 10px', fontSize: 12.5 }}>
                        <b>{new Date(r.fecha).toLocaleString('es-PE')}</b>
                        {r.usuarioNombre && <span className="muted"> · {r.usuarioNombre}</span>}
                        <div className="muted">{r.items.length} ítem(s) recibido(s){r.observaciones ? ` · ${r.observaciones}` : ''}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <div className="row" style={{ marginBottom: 8, alignItems: 'center' }}>
                  <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    Comprobantes (boleta/factura)
                  </div>
                  <span className="spacer" />
                  <ComprobanteUploader onSubir={(archivo, nombreArchivo) => comprobanteMut.subir({ archivo, ordenId, nombreArchivo })} />
                </div>
                {comprobantes.length === 0 ? (
                  <div className="muted" style={{ fontSize: 13 }}>Sin comprobantes subidos todavía.</div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {comprobantes.map((c) => (
                      <ComprobanteMiniatura key={c.id} comprobante={c} onEliminar={() => comprobanteMut.eliminar(c.id)} />
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {orden && (orden.puedeEnviar || orden.puedeAnular || orden.puedeEditar) && (
          <div className="modal-foot">
            {orden.puedeEditar && (
              <button className="btn btn-ghost" onClick={() => { void onEliminar(orden.id).then(onClose); }}>
                <Icons.Close s={15} /> Eliminar borrador
              </button>
            )}
            <span className="spacer" />
            {orden.puedeAnular && (
              <button className="btn btn-soft" onClick={() => void onAnular(orden.id)}>
                Anular orden
              </button>
            )}
            {orden.puedeEnviar && (
              <button className="btn btn-primary" onClick={() => void onEnviar(orden.id)}>
                <Icons.Check s={15} /> Enviar al proveedor
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
