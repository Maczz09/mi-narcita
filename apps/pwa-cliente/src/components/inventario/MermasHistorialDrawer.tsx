/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
// components/inventario/MermasHistorialDrawer.tsx — Historial de mermas (T-22,
// CU-04): listado con KPIs de pérdida, filtros y CRUD completo (editar
// corrige stock por la diferencia; eliminar restaura el stock completo).

import { useMemo, useState } from 'react';
import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import { StatKpi } from '../ui/StatKpi';
import { useMermasQuery } from '../../hooks/queries/useMermasQuery';
import { useToast } from '../ui/ToastProvider';
import { EditarMermaModal } from './EditarMermaModal';
import { EliminarMermaModal } from './EliminarMermaModal';
import type { MermaOrigen, MermaVM } from '../../types/inventario.types';

interface Props {
  onClose: () => void;
}

const ORIGEN_FILTROS: { value: MermaOrigen | ''; label: string }[] = [
  { value: '', label: 'Todos los orígenes' },
  { value: 'DESCARTE_MANUAL_INVENTARIO', label: 'Descarte manual' },
  { value: 'ANULACION_COMANDA_NO_COBRADA', label: 'Anulación (no cobrada)' },
  { value: 'ANULACION_COMANDA_COBRADA', label: 'Anulación (cobrada)' },
];

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

export function MermasHistorialDrawer({ onClose }: Readonly<Props>) {
  const { toast } = useToast();
  const [origen, setOrigen] = useState<MermaOrigen | ''>('');
  const { mermas, loading, saving, actualizarMerma, eliminarMerma } = useMermasQuery({ limit: 100, origen: origen || undefined });
  const [editando, setEditando] = useState<MermaVM | null>(null);
  const [eliminando, setEliminando] = useState<MermaVM | null>(null);

  const kpis = useMemo(() => {
    const totalMermado = mermas.reduce((sum, m) => sum + (m.costoTotal ?? 0), 0);
    const porProducto = new Map<string, number>();
    for (const m of mermas) {
      porProducto.set(m.productoNombre, (porProducto.get(m.productoNombre) ?? 0) + (m.costoTotal ?? 0));
    }
    let topProducto: string | null = null;
    let topMonto = 0;
    for (const [nombre, monto] of porProducto) {
      if (monto > topMonto) { topProducto = nombre; topMonto = monto; }
    }
    return { totalMermado, topProducto, topMonto };
  }, [mermas]);

  const handleGuardarEdicion = async (cantidad: number, motivo: string, observacion: string) => {
    if (!editando) return;
    try {
      await actualizarMerma(editando.id, { cantidad, motivo, observacion: observacion || null });
      toast({ title: 'Merma actualizada', icon: 'Check', kind: 'ok' });
      setEditando(null);
    } catch (err) {
      toast({ title: 'No se pudo actualizar la merma', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  const handleConfirmarEliminar = async (justificacion: string) => {
    if (!eliminando) return;
    try {
      await eliminarMerma(eliminando.id, justificacion);
      toast({ title: 'Merma eliminada', msg: 'Stock restaurado.', icon: 'Check', kind: 'ok' });
      setEliminando(null);
    } catch (err) {
      toast({ title: 'No se pudo eliminar la merma', msg: err instanceof Error ? err.message : 'Inténtalo de nuevo', icon: 'Alert', kind: 'err' });
    }
  };

  return (
    <div className="drawer-wrap">
      <Scrim onClose={onClose} />
      <aside className="drawer">
        <div className="panel-h" style={{ padding: '16px 20px' }}>
          <h3 style={{ fontSize: 18 }}>Historial de mermas</h3>
          <span className="spacer" />
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar"><Icons.Close s={17} /></button>
        </div>
        <div className="drawer-body">
          <div className="grid-stats" style={{ marginBottom: 14 }}>
            <StatKpi icon="Alert" tint="danger" label="Total mermado" value={formatMoney(kpis.totalMermado)} />
            <StatKpi
              icon="Inventario"
              tint="warn"
              label="Mayor pérdida"
              value={kpis.topProducto ? <>{kpis.topProducto} <span className="muted" style={{ fontSize: 13 }}>· {formatMoney(kpis.topMonto)}</span></> : '—'}
            />
          </div>

          <div className="field" style={{ marginBottom: 12 }}>
            <div className="input toolbar-input">
              <select value={origen} onChange={(e) => setOrigen(e.target.value as MermaOrigen | '')} aria-label="Filtrar por origen">
                {ORIGEN_FILTROS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </div>
          </div>

          {loading && mermas.length === 0 && <div className="muted" style={{ padding: 12 }}>Cargando…</div>}
          {!loading && mermas.length === 0 && (
            <div className="empty">
              <div className="e-ic"><Icons.Alert s={24} /></div>
              <h3>Sin mermas registradas</h3>
              <p>Las pérdidas de stock (botellas rotas, vencidas, anulaciones, etc.) aparecerán aquí.</p>
            </div>
          )}
          <div style={{ display: 'grid', gap: 8 }}>
            {mermas.map((m) => (
              <div key={m.id} className="panel" style={{ padding: '12px 14px' }}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{m.productoNombre}</strong>
                  <span className="mono badge badge-danger">-{m.cantidad}</span>
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 4 }}>{m.motivo}</div>
                {m.observacion && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{m.observacion}</div>}
                <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: 'wrap' }}>
                  <span className="badge badge-muted" style={{ fontSize: 11 }}>{m.origenLabel}</span>
                  {m.costoTotal !== null && <span className="mono muted" style={{ fontSize: 12 }}>{m.costoTotalLabel}</span>}
                </div>
                <div className="hint" style={{ marginTop: 6 }}>
                  {m.fechaLabel}{m.usuarioNombre ? ` · ${m.usuarioNombre}` : ''}
                </div>
                <div className="row" style={{ marginTop: 8, gap: 6, justifyContent: 'flex-end' }}>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditando(m)} aria-label={`Editar merma de ${m.productoNombre}`}>
                    <Icons.Edit s={13} /> Editar
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEliminando(m)} aria-label={`Eliminar merma de ${m.productoNombre}`}>
                    <Icons.Close s={13} /> Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {editando && (
        <EditarMermaModal
          merma={editando}
          saving={saving}
          onClose={() => setEditando(null)}
          onSave={(cantidad, motivo, observacion) => { void handleGuardarEdicion(cantidad, motivo, observacion); }}
        />
      )}

      {eliminando && (
        <EliminarMermaModal
          merma={eliminando}
          saving={saving}
          onClose={() => setEliminando(null)}
          onConfirm={(justificacion) => { void handleConfirmarEliminar(justificacion); }}
        />
      )}
    </div>
  );
}
