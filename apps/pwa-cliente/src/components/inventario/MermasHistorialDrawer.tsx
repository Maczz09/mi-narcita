// components/inventario/MermasHistorialDrawer.tsx — Historial de mermas (T-22)

import { Scrim } from '../ui/Scrim';
import { Icons } from '../ui/icons';
import { useMermasQuery } from '../../hooks/queries/useMermasQuery';

interface Props {
  onClose: () => void;
}

export function MermasHistorialDrawer({ onClose }: Readonly<Props>) {
  const { mermas, loading } = useMermasQuery({ limit: 50 });

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
          {loading && mermas.length === 0 && <div className="muted" style={{ padding: 12 }}>Cargando…</div>}
          {!loading && mermas.length === 0 && (
            <div className="empty">
              <div className="e-ic"><Icons.Alert s={24} /></div>
              <h3>Sin mermas registradas</h3>
              <p>Las pérdidas de stock (botellas rotas, vencidas, etc.) aparecerán aquí.</p>
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
                <div className="hint" style={{ marginTop: 6 }}>
                  {m.fechaLabel}{m.usuarioNombre ? ` · ${m.usuarioNombre}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      </aside>
    </div>
  );
}
