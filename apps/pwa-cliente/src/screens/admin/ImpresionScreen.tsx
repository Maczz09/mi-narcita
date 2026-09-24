import { useCallback, useEffect, useState } from 'react';
import { useSedeActualQuery } from '../../hooks/queries/useSedesQuery';
import { useToast } from '../../components/ui/ToastProvider';
import { impresionApi, type DestinationForm, type PrintDestination, type PrintJobSummary, type Station } from '../../api/impresion.api';

const STATIONS: { id: Station; label: string }[] = [
  { id: 'COCINA', label: 'Cocina' }, { id: 'BAR', label: 'Barra' },
  { id: 'COMPROBANTES', label: 'Comprobantes 80 mm' },
];
const empty: DestinationForm = { transport: 'NETWORK', host: null, port: 9100, printerName: null, paperWidth: 80, copies: 1, enabled: false };

export function ImpresionScreen() {
  const { sede } = useSedeActualQuery();
  const { toast } = useToast();
  const [destinations, setDestinations] = useState<PrintDestination[]>([]);
  const [jobs, setJobs] = useState<PrintJobSummary[]>([]);
  const [station, setStation] = useState<Station>('COCINA');
  const [form, setForm] = useState<DestinationForm>(empty);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!sede?.id) return;
    setLoading(true);
    try {
      const [nextDestinations, nextJobs] = await Promise.all([impresionApi.destinations(), impresionApi.jobs()]);
      setDestinations(nextDestinations);
      setJobs(nextJobs);
    } catch (err) {
      toast({ title: 'No se pudo cargar impresión', msg: err instanceof Error ? err.message : 'Error de red', kind: 'err' });
    } finally { setLoading(false); }
  }, [sede?.id, toast]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const selected = destinations.find((item) => item.station === station);
    setForm(selected ? { transport: selected.transport, host: selected.host, port: selected.port,
      printerName: selected.printerName, paperWidth: selected.paperWidth, copies: selected.copies, enabled: selected.enabled } : empty);
  }, [destinations, station]);

  const save = async () => {
    setSaving(true);
    try {
      const saved = await impresionApi.save(station, form);
      setDestinations((current) => [...current.filter((item) => item.station !== station), saved]);
      toast({ title: `${station} configurada`, kind: 'ok' });
      await refresh();
    } catch (err) {
      toast({ title: 'No se pudo guardar impresora', msg: err instanceof Error ? err.message : 'Error de red', kind: 'err' });
    } finally { setSaving(false); }
  };

  const retry = async (id: string) => {
    try {
      await impresionApi.retry(id);
      await refresh();
    } catch (err) {
      toast({ title: 'No se pudo reintentar', msg: err instanceof Error ? err.message : 'Error de red', kind: 'err' });
    }
  };

  return <div>
    <div className="page-h"><div><h1>Impresión</h1><div className="sub">Impresoras térmicas de {sede?.nombre ?? 'la sede seleccionada'}</div></div>
      <span className="spacer" /><button className="btn btn-ghost" onClick={() => void refresh()} disabled={loading}>Actualizar</button></div>
    {!sede && <div className="banner warn">Selecciona una sede para configurar sus impresoras.</div>}
    {sede && <>
      <section className="panel" style={{ padding: 20, marginBottom: 16 }}>
        <h3>Destino por estación</h3>
        <p className="muted">Cada estación usa su propia impresora. La laptop puente debe permanecer encendida. Cocina y barra imprimen al registrar pedidos; comprobantes imprime en su térmica de 80 mm cuando SUNAT acepta la boleta o factura.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {STATIONS.map((entry) => <button key={entry.id} className={`btn btn-sm ${station === entry.id ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setStation(entry.id)}>{entry.label} {destinations.find((item) => item.station === entry.id)?.enabled ? '●' : ''}</button>)}
        </div>
        <div className="form-stack" style={{ maxWidth: 520 }}>
          <label>Conexión<select value={form.transport} onChange={(e) => setForm({ ...form, transport: e.target.value as DestinationForm['transport'] })}>
            <option value="NETWORK">Impresora de red (ESC/POS, IP)</option><option value="USB">USB instalada en Windows</option></select></label>
          {form.transport === 'NETWORK' ? <label>IP privada de la impresora<input value={form.host ?? ''} placeholder="192.168.1.50"
            onChange={(e) => setForm({ ...form, host: e.target.value })} /></label>
            : <label>Nombre exacto en Impresoras de Windows<input value={form.printerName ?? ''} placeholder="POS-80"
              onChange={(e) => setForm({ ...form, printerName: e.target.value })} /></label>}
          <label>Ancho<select value={station === 'COMPROBANTES' ? 80 : form.paperWidth} disabled={station === 'COMPROBANTES'} onChange={(e) => setForm({ ...form, paperWidth: Number(e.target.value) as 58 | 80 })}>
            <option value={80}>80 mm</option><option value={58}>58 mm</option></select></label>
          <label>Copias<input type="number" min={1} max={3} value={form.copies} onChange={(e) => setForm({ ...form, copies: Number(e.target.value) })} /></label>
          <label><input type="checkbox" checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} /> Activar este destino</label>
          <button className="btn btn-primary" disabled={saving || !sede} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar destino'}</button>
        </div>
      </section>
      <section className="panel" style={{ padding: 20 }}><h3>Movimientos de impresión</h3>
        {jobs.length === 0 ? <p className="muted">Sin trabajos de impresión.</p> :
          <div className="table-wrap"><table><thead><tr><th>Fecha</th><th>Estación</th><th>Estado</th><th>Intentos</th><th>Detalle</th><th></th></tr></thead><tbody>
            {jobs.map((job) => <tr key={job.id}><td>{new Date(job.createdAt).toLocaleString('es-PE')}</td><td>{job.station}</td>
              <td>{job.status}</td><td>{job.attempts}</td><td>{job.lastError || '—'}</td><td>{['FAILED', 'UNCERTAIN'].includes(job.status) &&
                <button className="btn btn-sm btn-ghost" onClick={() => void retry(job.id)}>Reintentar</button>}</td></tr>)}
          </tbody></table></div>}
      </section>
    </>}
  </div>;
}
