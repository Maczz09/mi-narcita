/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/compras/ComprasScreen.tsx — Compras / Proveedores (OC, recepción, costeo)
// Datos mock (ver src/data/compras.mock.ts). Sin backend de compras aún.

import { Scrim } from '../../components/ui/Scrim';
import { useMemo, useState } from 'react';
import { Icons } from '../../components/ui/icons';
import { MiniStat } from '../../components/ui/Stat';
import { useToast } from '../../components/ui/ToastProvider';
import { fmt } from '../../utils/format';
import {
  buildOC,
  INSUMOS,
  PROVEEDORES_COMPRAS,
  type OCEstado,
  type OrdenCompra,
} from '../../data/compras.mock';

const OC_META: Record<OCEstado, { label: string; cls: string }> = {
  BORRADOR: { label: 'Borrador', cls: 'badge-muted' },
  ENVIADA: { label: 'Enviada', cls: 'badge-info' },
  PARCIAL: { label: 'Recepción parcial', cls: 'badge-warn' },
  RECIBIDA: { label: 'Recibida', cls: 'badge-ok' },
};

const ocTotal = (oc: OrdenCompra) => oc.items.reduce((s, it) => s + it.q * it.costo, 0);

function OcAccion({ oc, onRecepcionar, onEnviar }: Readonly<{ oc: OrdenCompra; onRecepcionar: () => void; onEnviar: () => void }>) {
  if (oc.estado === 'ENVIADA' || oc.estado === 'PARCIAL') {
    return <button className="btn btn-sm btn-primary" onClick={onRecepcionar}>Recepcionar</button>;
  }
  if (oc.estado === 'BORRADOR') {
    return <button className="btn btn-sm btn-soft" onClick={onEnviar}>Enviar</button>;
  }
  return <span className="muted" style={{ fontSize: 12 }}>Completada</span>;
}

type Tab = 'ordenes' | 'insumos' | 'proveedores';

export function ComprasScreen() {
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('ordenes');
  const [ocs, setOcs] = useState<OrdenCompra[]>(() => buildOC());
  const [recibir, setRecibir] = useState<OrdenCompra | null>(null);
  const [nueva, setNueva] = useState(false);

  const kpis = useMemo(() => {
    const abiertas = ocs.filter((o) => o.estado === 'ENVIADA' || o.estado === 'BORRADOR' || o.estado === 'PARCIAL').length;
    const porRecibir = ocs.filter((o) => o.estado === 'ENVIADA' || o.estado === 'PARCIAL').reduce((s, o) => s + ocTotal(o), 0);
    const gastoMes = ocs.filter((o) => o.estado === 'RECIBIDA').reduce((s, o) => s + ocTotal(o), 0);
    const bajos = INSUMOS.filter((i) => i.stock < i.min).length;
    return { abiertas, porRecibir, gastoMes, bajos };
  }, [ocs]);

  const enviarOc = (id: string) => {
    setOcs((xs) => xs.map((o) => (o.id === id ? { ...o, estado: 'ENVIADA' } : o)));
  };

  const recepcionar = (oc: OrdenCompra) => {
    setOcs((xs) => xs.map((o) => (o.id === oc.id ? { ...o, estado: 'RECIBIDA', entrega: 'Hoy' } : o)));
    setRecibir(null);
    toast({ title: 'Mercadería recibida', msg: `${oc.id} · stock actualizado`, icon: 'Check' });
  };

  const crearOC = (oc: OrdenCompra) => {
    setOcs((xs) => [oc, ...xs]);
    setNueva(false);
    toast({ title: 'OC creada', msg: `${oc.id} · ${oc.prov}`, icon: 'Bag' });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Compras y Proveedores</h1>
          <div className="sub">Órdenes de compra, recepción y costeo de insumos</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={() => setNueva(true)}><Icons.Plus s={16} /> Nueva orden</button>
      </div>

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <MiniStat icon="Bag" color="var(--accent)" soft="var(--accent-soft)" k="Órdenes abiertas" v={kpis.abiertas} d="por enviar / recibir" />
        <MiniStat icon="ArrowDown" color="var(--warn)" soft="var(--warn-soft)" k="Por recibir" v={fmt(kpis.porRecibir)} d="mercadería en tránsito" />
        <MiniStat icon="Coins" color="var(--info)" soft="var(--info-soft)" k="Gasto recibido" v={fmt(kpis.gastoMes)} d="este periodo" />
        <MiniStat icon="Alert" color={kpis.bajos ? 'var(--danger)' : 'var(--ok)'} soft={kpis.bajos ? 'var(--danger-soft)' : 'var(--ok-soft)'} k="Insumos bajo mínimo" v={kpis.bajos} d="requieren reposición" />
      </div>

      <div className="seg sm compras-tabs" style={{ marginBottom: 14, width: 'fit-content' }}>
        <button className={tab === 'ordenes' ? 'on' : ''} onClick={() => setTab('ordenes')}>Órdenes de compra</button>
        <button className={tab === 'insumos' ? 'on' : ''} onClick={() => setTab('insumos')}>Insumos</button>
        <button className={tab === 'proveedores' ? 'on' : ''} onClick={() => setTab('proveedores')}>Proveedores</button>
      </div>

      {tab === 'ordenes' && (
        <div className="table-wrap table-wrap-scroll-fallback" style={{ flex: 1, overflowY: 'auto' }}>
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
              {ocs.map((oc) => (
                <tr key={oc.id}>
                  <td className="mono"><strong>{oc.id}</strong></td>
                  <td><strong>{oc.prov}</strong></td>
                  <td className="col-mobile-hidden"><span className="muted">{oc.items.length} líneas · {oc.items.reduce((s, it) => s + it.q, 0)} und</span></td>
                  <td style={{ textAlign: 'right' }}><strong className="mono">{fmt(ocTotal(oc))}</strong></td>
                  <td className="col-mobile-hidden"><span className="muted">{oc.fecha}</span></td>
                  <td className="col-mobile-hidden"><span className="muted">{oc.entrega}</span></td>
                  <td><span className={`badge dot ${OC_META[oc.estado].cls}`}>{OC_META[oc.estado].label}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <OcAccion oc={oc} onRecepcionar={() => setRecibir(oc)} onEnviar={() => enviarOc(oc.id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'insumos' && (
        <div className="table-wrap table-wrap-scroll-fallback" style={{ flex: 1, overflowY: 'auto' }}>
          <table className="dt">
            <thead>
              <tr>
                <th>Insumo</th><th className="col-mobile-hidden">Proveedor</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th style={{ textAlign: 'right' }} className="col-mobile-hidden">Mínimo</th>
                <th style={{ textAlign: 'right' }}>Costo unit.</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {INSUMOS.map((i) => {
                const bajo = i.stock < i.min;
                return (
                  <tr key={i.id}>
                    <td><strong>{i.n}</strong></td>
                    <td className="col-mobile-hidden"><span className="muted">{i.prov}</span></td>
                    <td style={{ textAlign: 'right' }}><strong className="mono" style={bajo ? { color: 'var(--danger-text)' } : undefined}>{i.stock} {i.uni}</strong></td>
                    <td style={{ textAlign: 'right' }} className="col-mobile-hidden"><span className="mono muted">{i.min} {i.uni}</span></td>
                    <td style={{ textAlign: 'right' }}><span className="mono">{fmt(i.costo)}</span></td>
                    <td>{bajo ? <span className="badge badge-danger dot">Reponer</span> : <span className="badge badge-ok dot">OK</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'proveedores' && (
        <div className="prov-grid">
          {PROVEEDORES_COMPRAS.map((p) => (
            <div className="panel prov-card" key={p.id}>
              <div className="row" style={{ gap: 11, marginBottom: 10 }}>
                <span className="prov-ava">{p.n.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
                <div style={{ minWidth: 0 }}>
                  <b style={{ fontSize: 15 }}>{p.n}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{p.cat}</div>
                </div>
              </div>
              <div className="kv"><span className="k">RUC</span><span className="v mono">{p.ruc}</span></div>
              <div className="kv"><span className="k">Contacto</span><span className="v">{p.contacto}</span></div>
              <div className="kv"><span className="k">Teléfono</span><span className="v">{p.tel}</span></div>
              <div className="kv"><span className="k">Entregas</span><span className="v">{p.dias}</span></div>
              <div className="kv"><span className="k">Crédito</span><span className="v"><span className="pill-soft">{p.credito}</span></span></div>
            </div>
          ))}
        </div>
      )}

      {recibir && <RecepcionDrawer oc={recibir} onClose={() => setRecibir(null)} onRecibir={recepcionar} />}
      {nueva && <NuevaOC onClose={() => setNueva(false)} onCrear={crearOC} />}
    </div>
  );
}

interface RecepcionDrawerProps {
  oc: OrdenCompra;
  onClose: () => void;
  onRecibir: (oc: OrdenCompra) => void;
}

function RecepcionDrawer({ oc, onClose, onRecibir }: Readonly<RecepcionDrawerProps>) {
  const [chk, setChk] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(oc.items.map((_, i) => [i, true])),
  );
  const total = oc.items.reduce((s, it, i) => s + (chk[i] ? it.q * it.costo : 0), 0);

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <span className="modal-icon" style={{ width: 34, height: 34, margin: 0, borderRadius: 9, background: 'var(--accent-soft)', color: 'var(--accent-text)' }}><Icons.ArrowDown s={17} /></span>
          <h3 style={{ fontSize: 17 }}>Recepción · {oc.id}</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <div className="banner info" style={{ marginBottom: 14 }}><Icons.Bag s={16} /><span>{oc.prov} · marca lo que llegó conforme</span></div>
          <div style={{ display: 'grid', gap: 8 }}>
            {oc.items.map((it, i) => (
              <button key={it.n} className={`rep-opt ${chk[i] ? 'on' : ''}`} onClick={() => setChk((c) => ({ ...c, [i]: !c[i] }))} style={{ width: '100%' }}>
                <span className="mod-tick sq" style={chk[i] ? { background: 'var(--accent)', borderColor: 'var(--accent)' } : undefined}>{chk[i] && <Icons.Check s={12} />}</span>
                <div style={{ flex: 1, textAlign: 'left' }}>
                  <b style={{ fontSize: 13.5 }}>{it.n}</b>
                  <div className="muted" style={{ fontSize: 12 }}>{it.q} {it.uni} × {fmt(it.costo)}</div>
                </div>
                <b className="mono">{fmt(it.q * it.costo)}</b>
              </button>
            ))}
          </div>
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, alignItems: 'center' }}>
          <div><div className="hint">Total recibido</div><b className="mono" style={{ fontSize: 18 }}>{fmt(total)}</b></div>
          <span className="spacer" />
          <button className="btn btn-success" onClick={() => onRecibir(oc)}><Icons.Check s={15} /> Confirmar recepción</button>
        </div>
      </aside>
    </div>
  );
}

interface NuevaOCProps {
  onClose: () => void;
  onCrear: (oc: OrdenCompra) => void;
}

function NuevaOC({ onClose, onCrear }: Readonly<NuevaOCProps>) {
  const [prov, setProv] = useState(PROVEEDORES_COMPRAS[0].n);
  const [sel, setSel] = useState<Record<string, number>>({});
  const insumosProv = INSUMOS.filter((i) => i.prov === prov);
  const total = Object.entries(sel).reduce((s, [id, q]) => {
    const ins = INSUMOS.find((i) => i.id === id);
    return s + (ins ? ins.costo * q : 0);
  }, 0);
  const lineas = Object.values(sel).filter((q) => q > 0).length;
  const setQ = (id: string, q: number) => setSel((s) => ({ ...s, [id]: Math.max(0, q) }));

  const crear = () => {
    const items = Object.entries(sel)
      .filter(([, q]) => q > 0)
      .map(([id, q]) => {
        const ins = INSUMOS.find((i) => i.id === id)!;
        return { n: ins.n, q, uni: ins.uni, costo: ins.costo };
      });
    onCrear({ id: `OC-${crypto.randomUUID().slice(0, 8).toUpperCase()}`, prov, estado: 'BORRADOR', fecha: 'Hoy', entrega: '—', items });
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
              <select id="compra-proveedor" value={prov} onChange={(e) => { setProv(e.target.value); setSel({}); }} style={{ border: 0, background: 'transparent', width: '100%' }}>
                {PROVEEDORES_COMPRAS.map((p) => <option key={p.id} value={p.n}>{p.n}</option>)}
              </select>
            </div>
          </div>
          <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Insumos del proveedor</div>
          {insumosProv.length === 0 ? (
            <div className="muted" style={{ fontSize: 13 }}>Sin insumos asociados a este proveedor.</div>
          ) : (
            <div style={{ display: 'grid', gap: 8 }}>
              {insumosProv.map((i) => {
                const sugerido = i.stock < i.min;
                return (
                  <div key={i.id} className="panel" style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, borderColor: sugerido ? 'var(--warn)' : 'var(--border)' }}>
                    <div style={{ flex: 1 }}>
                      <b style={{ fontSize: 13.5 }}>{i.n}</b>
                      <div className="muted" style={{ fontSize: 11.5 }}>stock {i.stock}{i.uni} · mín {i.min}{i.uni} · {fmt(i.costo)}/{i.uni}{sugerido ? ' · reponer' : ''}</div>
                    </div>
                    <div className="stepper sm">
                      <button onClick={() => setQ(i.id, (sel[i.id] || 0) - 1)}><Icons.Minus s={13} /></button>
                      <span className="qv">{sel[i.id] || 0}</span>
                      <button onClick={() => setQ(i.id, (sel[i.id] || 0) + 1)}><Icons.Plus s={13} /></button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, alignItems: 'center' }}>
          <div><div className="hint">Total · {lineas} líneas</div><b className="mono" style={{ fontSize: 18 }}>{fmt(total)}</b></div>
          <span className="spacer" />
          <button className="btn btn-primary" disabled={lineas === 0} onClick={crear}><Icons.Check s={15} /> Crear borrador</button>
        </div>
      </aside>
    </div>
  );
}
