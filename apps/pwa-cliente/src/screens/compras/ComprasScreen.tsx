/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/ComprasScreen.tsx — Compras / Proveedores (OC, recepción,
// costeo, comprobantes de boleta/factura). Datos reales de servicio-compras.

import { useState } from 'react';
import { Icons } from '../../components/ui/icons';
import { MiniStat } from '../../components/ui/Stat';
import { useToast } from '../../components/ui/ToastProvider';
import { formatMoney } from '../../mappers/compras.mapper';
import { useInsumosQuery, useOrdenesQuery, useProveedoresQuery, useResumenComprasQuery } from '../../hooks/queries/useComprasQuery';
import { RecepcionDrawer } from './RecepcionDrawer';
import { NuevaOCDrawer } from './NuevaOCDrawer';
import { NuevoProveedorDrawer } from './NuevoProveedorDrawer';
import { NuevoInsumoDrawer } from './NuevoInsumoDrawer';
import { OrdenDetalleModal } from './OrdenDetalleModal';
import type { OrdenCompraVM } from '../../types/compras.types';

type Tab = 'ordenes' | 'insumos' | 'proveedores';

function OcAccion({ orden, onRecepcionar, onEnviar }: Readonly<{ orden: OrdenCompraVM; onRecepcionar: () => void; onEnviar: () => void }>) {
  if (orden.puedeRecibir) {
    return <button className="btn btn-sm btn-primary" onClick={onRecepcionar}>Recepcionar</button>;
  }
  if (orden.puedeEnviar) {
    return <button className="btn btn-sm btn-soft" onClick={onEnviar}>Enviar</button>;
  }
  if (orden.estado === 'ANULADA') {
    return <span className="muted" style={{ fontSize: 12 }}>Anulada</span>;
  }
  return <span className="muted" style={{ fontSize: 12 }}>Completada</span>;
}

export function ComprasScreen() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('ordenes');
  const [recibirId, setRecibirId] = useState<string | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [nueva, setNueva] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState(false);
  const [nuevoInsumo, setNuevoInsumo] = useState(false);

  const { resumen } = useResumenComprasQuery();
  const proveedoresQuery = useProveedoresQuery();
  const insumosQuery = useInsumosQuery();
  const ordenesQuery = useOrdenesQuery();

  const recibirOrden = recibirId ? ordenesQuery.ordenes.find((o) => o.id === recibirId) ?? null : null;

  const enviarOc = async (id: string) => {
    await ordenesQuery.enviar(id);
    toast({ title: 'Orden enviada', msg: 'Se marcó como enviada al proveedor', icon: 'Bag' });
  };

  const recibir = async (payload: Parameters<typeof ordenesQuery.recibir>[1]) => {
    if (!recibirOrden) return;
    const { orden } = await ordenesQuery.recibir(recibirOrden.id, payload);
    toast({
      title: orden.estado === 'RECIBIDA' ? 'Mercadería recibida' : 'Recepción parcial registrada',
      msg: `${orden.codigo} · stock actualizado`,
      icon: 'Check',
    });
  };

  const cerrarConFaltante = async (motivo?: string) => {
    if (!recibirOrden) return;
    await ordenesQuery.cerrar(recibirOrden.id, motivo);
    toast({ title: 'Orden cerrada con faltante', msg: recibirOrden.codigo, icon: 'Alert' });
  };

  const crearOC = async (payload: Parameters<typeof ordenesQuery.crear>[0]) => {
    const orden = await ordenesQuery.crear(payload);
    setNueva(false);
    toast({ title: 'OC creada', msg: `${orden.codigo} · borrador`, icon: 'Bag' });
  };

  const enviarDesdeModal = async (id: string) => {
    await ordenesQuery.enviar(id);
    toast({ title: 'Orden enviada', msg: 'Se marcó como enviada al proveedor', icon: 'Bag' });
  };

  const anularDesdeModal = async (id: string, motivo?: string) => {
    await ordenesQuery.anular(id, motivo);
    toast({ title: 'Orden anulada', msg: '', icon: 'Alert' });
    setDetalleId(null);
  };

  const eliminarDesdeModal = async (id: string) => {
    await ordenesQuery.eliminar(id);
    toast({ title: 'Borrador eliminado', msg: '', icon: 'Check' });
  };

  const crearProveedor = async (payload: Parameters<typeof proveedoresQuery.crear>[0]) => {
    const { proveedor } = await proveedoresQuery.crear(payload);
    setNuevoProveedor(false);
    toast({ title: 'Proveedor creado', msg: proveedor.nombre, icon: 'Bag' });
  };

  const eliminarProveedor = async (id: string) => {
    await proveedoresQuery.eliminar(id);
    toast({ title: 'Proveedor eliminado', msg: '', icon: 'Check' });
  };

  const crearInsumo = async (payload: Parameters<typeof insumosQuery.crear>[0]) => {
    const { insumo } = await insumosQuery.crear(payload);
    setNuevoInsumo(false);
    toast({ title: 'Insumo creado', msg: insumo.nombre, icon: 'Bag' });
  };

  const eliminarInsumo = async (id: string) => {
    await insumosQuery.eliminar(id);
    toast({ title: 'Insumo eliminado', msg: '', icon: 'Check' });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Compras y Proveedores</h1>
          <div className="sub">Órdenes de compra, recepción y costeo de insumos</div>
        </div>
        <span className="spacer" />
        {tab === 'ordenes' && (
          <button className="btn btn-primary" onClick={() => setNueva(true)}><Icons.Plus s={16} /> Nueva orden</button>
        )}
        {tab === 'insumos' && (
          <button className="btn btn-primary" onClick={() => setNuevoInsumo(true)}><Icons.Plus s={16} /> Nuevo insumo</button>
        )}
        {tab === 'proveedores' && (
          <button className="btn btn-primary" onClick={() => setNuevoProveedor(true)}><Icons.Plus s={16} /> Nuevo proveedor</button>
        )}
      </div>

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <MiniStat icon="Bag" color="var(--accent)" soft="var(--accent-soft)" k="Órdenes abiertas" v={resumen?.ordenesAbiertas ?? 0} d="por enviar / recibir" />
        <MiniStat icon="ArrowDown" color="var(--warn)" soft="var(--warn-soft)" k="Por recibir" v={formatMoney(resumen?.montoPorRecibir ?? 0)} d="mercadería en tránsito" />
        <MiniStat icon="Coins" color="var(--info)" soft="var(--info-soft)" k="Gasto recibido" v={formatMoney(resumen?.gastoRecibido ?? 0)} d="este periodo" />
        <MiniStat
          icon="Alert"
          color={resumen?.insumosBajoMinimo ? 'var(--danger)' : 'var(--ok)'}
          soft={resumen?.insumosBajoMinimo ? 'var(--danger-soft)' : 'var(--ok-soft)'}
          k="Insumos bajo mínimo"
          v={resumen?.insumosBajoMinimo ?? 0}
          d="requieren reposición"
        />
      </div>

      <div className="seg sm compras-tabs" style={{ marginBottom: 14, width: 'fit-content' }}>
        <button className={tab === 'ordenes' ? 'on' : ''} onClick={() => setTab('ordenes')}>Órdenes de compra</button>
        <button className={tab === 'insumos' ? 'on' : ''} onClick={() => setTab('insumos')}>Insumos</button>
        <button className={tab === 'proveedores' ? 'on' : ''} onClick={() => setTab('proveedores')}>Proveedores</button>
      </div>

      {tab === 'ordenes' && (
        <div className="table-wrap table-wrap-scroll-fallback" style={{ flex: 1, overflowY: 'auto' }}>
          {ordenesQuery.loading ? (
            <div className="muted" style={{ padding: 16 }}>Cargando órdenes…</div>
          ) : ordenesQuery.ordenes.length === 0 ? (
            <div className="muted" style={{ padding: 16 }}>Sin órdenes de compra todavía.</div>
          ) : (
            <table className="dt">
              <thead>
                <tr>
                  <th>OC</th><th>Proveedor</th><th className="col-mobile-hidden">Ítems</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th className="col-mobile-hidden">Emisión</th><th className="col-mobile-hidden">Entrega</th><th>Estado</th>
                  <th style={{ textAlign: 'right' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {ordenesQuery.ordenes.map((oc) => (
                  <tr key={oc.id} style={{ cursor: 'pointer' }} onClick={() => setDetalleId(oc.id)}>
                    <td className="mono"><strong>{oc.codigo}</strong></td>
                    <td><strong>{oc.proveedorNombre}</strong></td>
                    <td className="col-mobile-hidden"><span className="muted">{oc.items.length} líneas · {oc.items.reduce((s, it) => s + it.cantidadPedida, 0)} und</span></td>
                    <td style={{ textAlign: 'right' }}><strong className="mono">{formatMoney(oc.total)}</strong></td>
                    <td className="col-mobile-hidden"><span className="muted">{oc.fechaEmisionLabel}</span></td>
                    <td className="col-mobile-hidden"><span className="muted">{oc.fechaEntregaLabel}</span></td>
                    <td><span className={`badge dot ${oc.estadoClass}`}>{oc.estadoLabel}</span></td>
                    <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                      <OcAccion orden={oc} onRecepcionar={() => setRecibirId(oc.id)} onEnviar={() => enviarOc(oc.id)} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'insumos' && (
        <div className="table-wrap table-wrap-scroll-fallback" style={{ flex: 1, overflowY: 'auto' }}>
          {insumosQuery.loading ? (
            <div className="muted" style={{ padding: 16 }}>Cargando insumos…</div>
          ) : insumosQuery.insumos.length === 0 ? (
            <div className="muted" style={{ padding: 16 }}>Sin insumos registrados todavía.</div>
          ) : (
            <table className="dt">
              <thead>
                <tr>
                  <th>Insumo</th><th className="col-mobile-hidden">Proveedor</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ textAlign: 'right' }} className="col-mobile-hidden">Mínimo</th>
                  <th style={{ textAlign: 'right' }}>Costo unit.</th>
                  <th>Estado</th>
                  <th style={{ textAlign: 'right' }}></th>
                </tr>
              </thead>
              <tbody>
                {insumosQuery.insumos.map((i) => (
                  <tr key={i.id}>
                    <td><strong>{i.nombre}</strong></td>
                    <td className="col-mobile-hidden"><span className="muted">{i.proveedorNombre ?? '—'}</span></td>
                    <td style={{ textAlign: 'right' }}><strong className="mono" style={i.bajoMinimo ? { color: 'var(--danger-text)' } : undefined}>{i.stockActual} {i.unidad}</strong></td>
                    <td style={{ textAlign: 'right' }} className="col-mobile-hidden"><span className="mono muted">{i.stockMinimo} {i.unidad}</span></td>
                    <td style={{ textAlign: 'right' }}><span className="mono">{formatMoney(i.costoUnitario)}</span></td>
                    <td>{i.bajoMinimo ? <span className="badge badge-danger dot">Reponer</span> : <span className="badge badge-ok dot">OK</span>}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button className="icon-btn" title="Eliminar insumo" onClick={() => eliminarInsumo(i.id)}><Icons.Close s={14} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'proveedores' && (
        <div className="prov-grid">
          {proveedoresQuery.loading && <div className="muted">Cargando proveedores…</div>}
          {!proveedoresQuery.loading && proveedoresQuery.proveedores.length === 0 && (
            <div className="muted">Sin proveedores registrados todavía.</div>
          )}
          {proveedoresQuery.proveedores.map((p) => (
            <div className="panel prov-card" key={p.id}>
              <div className="row" style={{ gap: 11, marginBottom: 10 }}>
                <span className="prov-ava">{p.iniciales}</span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 15 }}>{p.nombre}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{p.categoria ?? 'Sin categoría'}</div>
                </div>
                <span className="spacer" />
                <button className="icon-btn" title="Eliminar proveedor" onClick={() => eliminarProveedor(p.id)}><Icons.Close s={14} /></button>
              </div>
              <div className="kv"><span className="k">RUC</span><span className="v mono">{p.ruc ?? '—'}</span></div>
              <div className="kv"><span className="k">Contacto</span><span className="v">{p.contacto ?? '—'}</span></div>
              <div className="kv"><span className="k">Teléfono</span><span className="v">{p.telefono ?? '—'}</span></div>
              <div className="kv"><span className="k">Entregas</span><span className="v">{p.diasEntrega ?? '—'}</span></div>
              <div className="kv"><span className="k">Crédito</span><span className="v"><span className="pill-soft">{p.condicionPago ?? '—'}</span></span></div>
            </div>
          ))}
        </div>
      )}

      {recibirOrden && (
        <RecepcionDrawer
          orden={recibirOrden}
          onClose={() => setRecibirId(null)}
          onRecibir={async (payload) => { await recibir(payload); }}
          onCerrarConFaltante={cerrarConFaltante}
        />
      )}
      {nueva && (
        <NuevaOCDrawer
          proveedores={proveedoresQuery.proveedores}
          insumos={insumosQuery.insumos}
          onClose={() => setNueva(false)}
          onCrear={crearOC}
        />
      )}
      {nuevoProveedor && (
        <NuevoProveedorDrawer onClose={() => setNuevoProveedor(false)} onCrear={crearProveedor} />
      )}
      {nuevoInsumo && (
        <NuevoInsumoDrawer proveedores={proveedoresQuery.proveedores} onClose={() => setNuevoInsumo(false)} onCrear={crearInsumo} />
      )}
      {detalleId && (
        <OrdenDetalleModal
          ordenId={detalleId}
          onClose={() => setDetalleId(null)}
          onEnviar={enviarDesdeModal}
          onAnular={anularDesdeModal}
          onEliminar={eliminarDesdeModal}
        />
      )}
    </div>
  );
}
