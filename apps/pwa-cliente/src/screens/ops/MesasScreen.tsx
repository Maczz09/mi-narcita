/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// screens/ops/MesasScreen.tsx — Plano de salón en vivo (rediseño del prototipo).
// Cableado real: useMesasQuery (plano + estados) y useCuentasQuery (cuenta de la
// mesa seleccionada). Lanza el Comandero para tomar/agregar pedido.

import { Scrim } from '../../components/ui/Scrim';
import { useEffect, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icons } from '../../components/ui/icons';
import { fmt, elapsedLabel } from '../../utils/format';
import { useMesasQuery } from '../../hooks/queries/useMesasQuery';
import { useUbicacionesQuery } from '../../hooks/queries/useUbicacionesQuery';
import { useCuentasQuery } from '../../hooks/queries/useCuentasQuery';
import { Comandero } from '../../components/comandero/Comandero';
import { UbicacionesModal } from './UbicacionesModal';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useNow } from '../../hooks/useNow';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { useToast } from '../../components/ui/ToastProvider';
import { useAuthStore } from '../../store/auth.store';
import type { MesaVM, EstadoMesa, CrearMesaPayload } from '../../types/mesa.types';
import type { CuentaVM } from '../../types/cuenta.types';
import type { PedidoItemVM } from '../../types/pedido.types';

const EST_META: Record<EstadoMesa, { label: string; cls: string; color: string }> = {
  LIBRE: { label: 'Libre', cls: 'libre', color: 'var(--ok)' },
  OCUPADA: { label: 'Ocupada', cls: 'ocupada', color: 'var(--accent)' },
  RESERVADA: { label: 'Reservada', cls: 'reservada', color: 'var(--info)' },
};

const SKEL_KEYS = Array.from({ length: 12 }, (_, i) => `skel-${i}`);

const INITIAL_MESA_FORM: CrearMesaPayload = {
  numero: 1,
  capacidad: 4,
  ubicacionId: '',
};

type ComanderoState =
  | { open: true; mesaId?: string; mesaNumero?: string; mesaUbicacion?: string; modoAgregar: boolean }
  | { open: false };

export function MesasScreen() {
  const navigate = useNavigate();
  const online = useOnlineStatus();
  const { toast } = useToast();
  const rol = useAuthStore((s) => s.user?.rol);
  const puedeCrearMesa = rol === 'ADMIN' || rol === 'SISTEMA';
  const { mesas, loading, saving, loadError, error, success, fetch, crearMesa, clearFeedback } = useMesasQuery();
  const { ubicaciones: ubicacionesCrud } = useUbicacionesQuery();
  const [ubicacion, setUbicacion] = useState('TODAS');
  const [sel, setSel] = useState<MesaVM | null>(null);
  const [mesaForm, setMesaForm] = useState<CrearMesaPayload>(INITIAL_MESA_FORM);
  const [comandero, setComandero] = useState<ComanderoState>({ open: false });
  const [gestionUbicaciones, setGestionUbicaciones] = useState(false);

  // Sólo mesas físicas (excluir virtuales 98/99 de delivery/llevar)
  const fisicas = useMemo(() => mesas.filter((m) => m.numeroRaw < 90), [mesas]);

  const ubicacionesFiltro = useMemo(
    () => ['TODAS', ...ubicacionesCrud.map((u) => u.nombre)],
    [ubicacionesCrud],
  );
  const visibles = fisicas.filter((m) => ubicacion === 'TODAS' || m.ubicacion === ubicacion);

  const resumen = useMemo(() => {
    const r: Record<EstadoMesa, number> = { LIBRE: 0, OCUPADA: 0, RESERVADA: 0 };
    fisicas.forEach((m) => { r[m.estado] = (r[m.estado] ?? 0) + 1; });
    return r;
  }, [fisicas]);

  const siguienteNumero = useMemo(() => {
    const usados = new Set(fisicas.map((m) => m.numeroRaw));
    let numero = 1;
    while (usados.has(numero)) numero += 1;
    return numero;
  }, [fisicas]);

  useEffect(() => {
    setMesaForm((current) => (
      current.numero === INITIAL_MESA_FORM.numero && siguienteNumero !== INITIAL_MESA_FORM.numero
        ? { ...current, numero: siguienteNumero }
        : current
    ));
  }, [siguienteNumero]);

  // Preselecciona la primera ubicación disponible en cuanto carga el CRUD.
  useEffect(() => {
    if (!mesaForm.ubicacionId && ubicacionesCrud.length > 0) {
      setMesaForm((current) => ({ ...current, ubicacionId: ubicacionesCrud[0].id }));
    }
  }, [ubicacionesCrud, mesaForm.ubicacionId]);

  useEffect(() => {
    const el = document.querySelector('.content');
    if (el) {
      if (puedeCrearMesa) el.classList.add('has-form');
      else el.classList.remove('has-form');
    }
    return () => {
      if (el) el.classList.remove('has-form');
    };
  }, [puedeCrearMesa]);

  const handleCrearMesa = async (event: SubmitEvent) => {
    event.preventDefault();
    if (!online || !puedeCrearMesa || !mesaForm.ubicacionId) return;

    try {
      await crearMesa({
        numero: Number(mesaForm.numero),
        capacidad: Number(mesaForm.capacidad),
        ubicacionId: mesaForm.ubicacionId,
      });
      setMesaForm((current) => ({ ...INITIAL_MESA_FORM, numero: siguienteNumero + 1, ubicacionId: current.ubicacionId }));
    } catch (e) {
      toast({ title: 'No se pudo crear la mesa', msg: e instanceof Error ? e.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const updateMesaForm = (key: keyof CrearMesaPayload, value: string | number) => {
    setMesaForm((current) => ({ ...current, [key]: value }));
  };

  // ─── Loading ────────────────────────────────────────────────
  if (loading && mesas.length === 0) {
    return (
      <div>
        <div className="page-h"><div><h1>Mesas</h1><div className="sub">Cargando salón…</div></div></div>
        <div className="mesa-floor">
          {SKEL_KEYS.map((sk) => (
            <div key={sk} className="skel" style={{ height: 110, borderRadius: 'var(--r-lg)' }} />
          ))}
        </div>
      </div>
    );
  }

  // ─── Error ──────────────────────────────────────────────────
  if (loadError) {
    return (
      <div>
        <div className="page-h"><div><h1>Mesas</h1></div></div>
        <div className="banner err" style={{ marginBottom: 16 }}>
          <Icons.Alert s={17} />
          <span>{loadError}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={() => fetch()}>Reintentar</button>
        </div>
      </div>
    );
  }

  return (
    <div 
      style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div className="page-h">
        <div>
          <h1>Mesas</h1>
          <div className="sub">Salón en vivo · toca una mesa para tomar o agregar pedido</div>
        </div>
        <span className="spacer" />
        <button className="btn btn-ghost btn-sm" onClick={() => fetch()} title="Refrescar mesas" aria-label="Refrescar mesas"><Icons.Refresh s={16} /></button>
        <button className="btn btn-primary" onClick={() => setComandero({ open: true, modoAgregar: false })}><Icons.Plus s={16} /> Nuevo pedido</button>
      </div>

      {!online && (
        <output className="banner warn module-feedback" role="alert">
          <Icons.Alert s={17} />
          <span>Sin conexión. La creación de mesas está deshabilitada.</span>
        </output>
      )}

      {(error || success) && (
        <div className={`banner ${error ? 'err' : 'ok'} module-feedback`} role="alert">
          {error ? <Icons.Alert s={17} /> : <Icons.Check s={16} />}
          <span>{error ?? success}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={clearFeedback}>Cerrar</button>
        </div>
      )}

      <div className="module-grid mesas-layout">
        <section className="mesas-main">
          {/* Resumen de estados + filtro de ubicación (la UI la llama "zona") */}
          <div className="mesa-summary">
            {(Object.keys(EST_META) as EstadoMesa[]).map((k) => (
              <div className="ms-chip" key={k}>
                <span className="ms-dot" style={{ background: EST_META[k].color }} />
                {EST_META[k].label}<b>{resumen[k]}</b>
              </div>
            ))}
            <span className="spacer" />
            <div className="seg sm mesa-zone-filter" role="radiogroup" aria-label="Filtrar mesas por zona">
              {ubicacionesFiltro.map((z) => (
                <button key={z} className={ubicacion === z ? 'on' : ''} onClick={() => setUbicacion(z)}>{z === 'TODAS' ? 'Todas' : z}</button>
              ))}
            </div>
            {puedeCrearMesa && (
              <button className="btn btn-ghost btn-sm" onClick={() => setGestionUbicaciones(true)}>
                <Icons.Layers s={14} /> Ubicaciones
              </button>
            )}
          </div>

          <div className="mesa-floor">
            {visibles.map((m) => (
              <MesaTile key={m.id} mesa={m} onSelect={() => setSel(m)} />
            ))}
            {visibles.length === 0 && (
              <div className="empty mesas-empty">
                <div className="e-ic"><Icons.Mesas s={24} /></div>
                <h3>Sin mesas en esta zona</h3>
                <p>Cambia el filtro o crea una mesa para esta ubicación.</p>
              </div>
            )}
          </div>
        </section>

        {puedeCrearMesa && (
          <aside className="module-side mesas-side">
            <section className="panel">
              <div className="panel-h">
                <Icons.Plus s={16} />
                <h3>Nueva mesa</h3>
              </div>
              <form className="form-stack" onSubmit={handleCrearMesa}>
                <div className="field">
                  <label htmlFor="mesa-numero">Número</label>
                  <div className="input">
                    <input
                      id="mesa-numero"
                      required
                      min={1}
                      max={89}
                      type="number"
                      inputMode="numeric"
                      value={mesaForm.numero}
                      onChange={(event) => updateMesaForm('numero', Number(event.target.value))}
                    />
                  </div>
                  <span className="hint">Sugerido: {siguienteNumero}. Las mesas 90+ se reservan para canales virtuales.</span>
                </div>
                <div className="field">
                  <label htmlFor="mesa-capacidad">Capacidad</label>
                  <div className="input">
                    <input
                      id="mesa-capacidad"
                      required
                      min={1}
                      max={30}
                      type="number"
                      inputMode="numeric"
                      value={mesaForm.capacidad}
                      onChange={(event) => updateMesaForm('capacidad', Number(event.target.value))}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="mesa-ubicacion">Ubicación</label>
                  <div className="input">
                    <select
                      id="mesa-ubicacion"
                      required
                      value={mesaForm.ubicacionId}
                      onChange={(event) => updateMesaForm('ubicacionId', event.target.value)}
                    >
                      {ubicacionesCrud.length === 0 && <option value="">Sin ubicaciones</option>}
                      {ubicacionesCrud.map((u) => <option key={u.id} value={u.id}>{u.nombre}</option>)}
                    </select>
                  </div>
                  <span className="hint">
                    {ubicacionesCrud.length === 0
                      ? 'Crea una ubicación primero con "Ubicaciones" arriba.'
                      : '¿Falta una zona? Usa "Ubicaciones" arriba para gestionarlas.'}
                  </span>
                </div>
                <button className="btn btn-primary btn-block" disabled={saving || !online || !mesaForm.ubicacionId} type="submit">
                  {saving ? <span className="spinner" /> : <Icons.Plus s={16} />}
                  Crear mesa
                </button>
              </form>
            </section>
          </aside>
        )}
      </div>

      {gestionUbicaciones && <UbicacionesModal onClose={() => setGestionUbicaciones(false)} />}

      {sel && (
        <MesaDrawer
          mesa={sel}
          onClose={() => setSel(null)}
          onCobrar={() => { const id = sel.id; setSel(null); navigate(`/app/caja?mesaId=${id}`); }}
          onTomar={() => { setComandero({ open: true, mesaId: sel.id, mesaNumero: sel.numero, mesaUbicacion: sel.ubicacion, modoAgregar: false }); setSel(null); }}
          onAgregar={() => { setComandero({ open: true, mesaId: sel.id, mesaNumero: sel.numero, mesaUbicacion: sel.ubicacion, modoAgregar: true }); setSel(null); }}
        />
      )}

      {comandero.open && (
        <Comandero
          onClose={() => setComandero({ open: false })}
          onCreated={() => fetch()}
          initialCanal="SALON"
          mesaId={comandero.mesaId}
          mesaNumero={comandero.mesaNumero}
          mesaUbicacion={comandero.mesaUbicacion}
          modoAgregar={comandero.modoAgregar}
        />
      )}
    </div>
  );
}

interface MesaDrawerProps {
  mesa: MesaVM;
  onClose: () => void;
  onCobrar: () => void;
  onTomar: () => void;
  onAgregar: () => void;
}

interface MesaDrawerBodyProps {
  mesa: MesaVM;
  ocupada: boolean;
  loading: boolean;
  cuentaActiva: CuentaVM | null | undefined;
  items: PedidoItemVM[];
  atencion: { label: string; title: string } | null;
  now: number;
}

function MesaDrawerBody({ mesa: m, ocupada, loading, cuentaActiva, items, atencion, now }: Readonly<MesaDrawerBodyProps>) {
  if (!ocupada) {
    if (m.estado === 'RESERVADA') {
      return <div className="banner info"><Icons.Reservas s={16} /><span>Mesa reservada.</span></div>;
    }
    return (
      <div className="empty" style={{ padding: 28 }}>
        <div className="e-ic"><Icons.Mesas s={24} /></div>
        <h3>Mesa libre</h3>
        <p>Toma un nuevo pedido para abrir la cuenta de esta mesa.</p>
      </div>
    );
  }
  if (loading) {
    return <div className="muted" style={{ padding: 16, textAlign: 'center' }}>Cargando cuenta…</div>;
  }
  if (!cuentaActiva) {
    return <div className="banner info"><Icons.Receipt s={16} /><span>Mesa ocupada sin cuenta cargada. Toma un pedido para abrirla.</span></div>;
  }
  return (
    <>
      <div className="mesa-open-meta">
        <div>
          <span className="k">Atiende</span>
          <b>{atencion?.label ?? 'Sin asignar'}</b>
        </div>
        <div>
          <span className="k">Abierta</span>
          <b>{elapsedLabel(cuentaActiva.createdAt, now)}</b>
        </div>
      </div>
      <div className="hint" style={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', margin: '4px 0 8px' }}>Cuenta actual · {cuentaActiva.cantidadItems} ítems</div>
      <div className="panel" style={{ padding: '4px 14px' }}>
        {items.length === 0 ? (
          <div className="muted" style={{ padding: 12, fontSize: 13 }}>Sin ítems registrados.</div>
        ) : items.map((it) => (
          <div className="dish-line" key={it.id}>
            <span className="dish-q">{it.cantidad}</span>
            <span style={{ flex: 1, fontWeight: 600 }}>{it.nombre}</span>
            <span className="mono muted">{fmt(it.subtotal)}</span>
          </div>
        ))}
      </div>
      <div className="kv" style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
        <span className="k" style={{ fontSize: 15, fontWeight: 800, color: 'var(--text)' }}>Total</span>
        <span className="v mono" style={{ fontSize: 20, fontWeight: 800 }}>{fmt(cuentaActiva.total)}</span>
      </div>
    </>
  );
}

interface MesaDrawerFootProps {
  ocupada: boolean;
  estado: MesaVM['estado'];
  onCobrar: () => void;
  onTomar: () => void;
  onAgregar: () => void;
  onClose: () => void;
}

/* Jerarquía de acción en mesa ocupada:
   - "Cobrar": acción de cierre económico → btn-primary (máximo énfasis)
   - "Agregar a la cuenta": acción frecuente pero no de cierre → btn-soft */
function MesaDrawerFoot({ ocupada, estado, onCobrar, onTomar, onAgregar, onClose }: Readonly<MesaDrawerFootProps>) {
  if (ocupada) {
    return (
      <>
        <button className="btn btn-primary" onClick={onCobrar} aria-label="Cobrar cuenta de esta mesa"><Icons.Caja s={15} /> Cobrar</button>
        <span className="spacer" />
        <button className="btn btn-soft" onClick={onAgregar} aria-label="Agregar ítems a la cuenta"><Icons.Plus s={15} /> Agregar a la cuenta</button>
      </>
    );
  }
  if (estado === 'LIBRE') {
    return (
      <>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={onTomar} aria-label="Tomar nuevo pedido para esta mesa"><Icons.Plus s={15} /> Tomar pedido</button>
      </>
    );
  }
  return (
    <>
      <span className="spacer" />
      <button className="btn btn-soft" onClick={onClose}>Cerrar</button>
    </>
  );
}

function MesaDrawer({ mesa: m, onClose, onCobrar, onTomar, onAgregar }: Readonly<MesaDrawerProps>) {
  const ocupada = m.estado === 'OCUPADA';
  const { cuentaActiva, loading } = useCuentasQuery(ocupada ? m.id : undefined);
  const now = useNow();
  const meta = EST_META[m.estado];
  const drawerRef = useRef<HTMLDialogElement>(null);
  useFocusTrap(drawerRef, { active: true, onClose });

  const items = cuentaActiva?.pedidos.flatMap((p) => p.items) ?? [];
  const atencion = cuentaActiva ? atencionDeCuenta(cuentaActiva) : null;
  const badgeCls = { OCUPADA: 'badge-accent', RESERVADA: 'badge-info', LIBRE: 'badge-muted' }[m.estado] ?? 'badge-muted';

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <dialog
        open
        className="drawer"
        ref={drawerRef}
        aria-modal="true"
        aria-label={`Mesa ${m.numero}`}
      >
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <span className={`badge dot ${badgeCls}`}>{meta.label}</span>
          <h3 style={{ fontSize: 18, marginLeft: 4 }}>Mesa {m.numero}</h3>
          <span className="muted mesa-drawer-meta" style={{ fontSize: 13 }}>· {m.ubicacion} · {m.capacidad} pers</span>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label={`Cerrar detalle de Mesa ${m.numero}`}><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <MesaDrawerBody
            mesa={m}
            ocupada={ocupada}
            loading={loading}
            cuentaActiva={cuentaActiva}
            items={items}
            atencion={atencion}
            now={now}
          />
        </div>
        <div className="drawer-foot">
          <MesaDrawerFoot
            ocupada={ocupada}
            estado={m.estado}
            onCobrar={onCobrar}
            onTomar={onTomar}
            onAgregar={onAgregar}
            onClose={onClose}
          />
        </div>
      </dialog>
    </div>
  );
}

interface MesaTileProps {
  mesa: MesaVM;
  onSelect: () => void;
}

function MesaTile({ mesa: m, onSelect }: Readonly<MesaTileProps>) {
  const ocupada = m.estado === 'OCUPADA';
  const meta = EST_META[m.estado];
  const now = useNow();
  const { cuentaActiva, loading } = useCuentasQuery(ocupada ? m.id : undefined);
  const atencion = cuentaActiva ? atencionDeCuenta(cuentaActiva) : null;

  return (
    <button className={`mesa-tile ${meta.cls}`} onClick={onSelect}>
      <div className="mt-top">
        <span className="mt-num">{m.numero}</span>
        <span className="mt-cap"><Icons.Users2 s={12} /> {m.capacidad}</span>
      </div>
      <div className="mt-zone">{m.ubicacion}</div>
      {ocupada && cuentaActiva ? (
        <div className="mt-live">
          <span title={atencion?.title}>{atencion?.label ?? 'Sin asignar'}</span>
          <b><Icons.Clock s={12} /> {elapsedLabel(cuentaActiva.createdAt, now)}</b>
        </div>
      ) : null}
      <div className="mt-foot">
        {ocupada
          ? <span className="mt-state" style={{ color: 'var(--accent-text)' }}>{loading ? 'Cargando cuenta...' : 'Cuenta abierta'}</span>
          : <span className="mt-state">{meta.label}</span>}
      </div>
    </button>
  );
}

function atencionDeCuenta(cuenta: CuentaVM): { label: string; title: string } {
  const nombres = Array.from(
    new Set(cuenta.pedidos.map((pedido) => pedido.meseroNombre?.trim()).filter(Boolean) as string[]),
  );

  if (nombres.length === 0) {
    return { label: 'Sin asignar', title: 'Sin mesero registrado en los pedidos' };
  }

  if (nombres.length === 1) {
    return { label: nombres[0], title: nombres[0] };
  }

  return { label: `${nombres[0]} +${nombres.length - 1}`, title: nombres.join(', ') };
}
