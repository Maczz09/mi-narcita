// screens/facturacion/FacturacionScreen.tsx — Emisión de boletas/facturas SUNAT (solo ADMIN)
//
// Dos listas: comprobantes de pago DISPONIBLES (cuentas ya cerradas, aún sin
// subir a SUNAT) y EMITIDOS (con su estado real: FIRMADO/ENVIADO mientras
// espera el envío async, ACEPTADO/RECHAZADO/OBSERVADO una vez que SUNAT
// responde — ver useFacturacionQuery para el polling mientras hay pendientes).

import { useMemo, useRef, useState } from 'react';
import { Scrim } from '../../components/ui/Scrim';
import { Icons } from '../../components/ui/icons';
import { StatKpi } from '../../components/ui/StatKpi';
import { useToast } from '../../components/ui/ToastProvider';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import { fmt } from '../../utils/format';
import { useFacturacionQuery } from '../../hooks/queries/useFacturacionQuery';
import { abrirComprobanteParaImprimir } from '../../utils/comprobantePrint';
import { ConfigurarEmpresaModal } from './ConfigurarEmpresaModal';
import type { ComprobantePagoDto, EstadoComprobante, TipoComprobante } from '../../types/facturacion.types';

const ESTADO_BADGE: Record<EstadoComprobante, string> = {
  FIRMADO: 'badge-info',
  ENVIADO: 'badge-info',
  ACEPTADO: 'badge-ok',
  RECHAZADO: 'badge-danger',
  OBSERVADO: 'badge-warn',
};

const ESTADO_LABEL: Record<EstadoComprobante, string> = {
  FIRMADO: 'Firmado · enviando',
  ENVIADO: 'Enviado · esperando CDR',
  ACEPTADO: 'Aceptado por SUNAT',
  RECHAZADO: 'Rechazado',
  OBSERVADO: 'Observado',
};

function fechaHora(iso: string): string {
  return new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// YYYY-MM-DD en hora local del navegador (Lima en este despliegue) — comparable
// lexicográficamente contra los <input type="date"> de los filtros sin líos de UTC.
function fechaLocal(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA');
}

function enRango(iso: string, desde: string, hasta: string): boolean {
  const f = fechaLocal(iso);
  if (desde && f < desde) return false;
  if (hasta && f > hasta) return false;
  return true;
}

type FiltroEstado = '' | 'PENDIENTE' | 'ACEPTADO' | 'RECHAZADO' | 'OBSERVADO';

export function FacturacionScreen() {
  const online = useOnlineStatus();
  const { toast } = useToast();
  const {
    disponibles, emitidos, empresas, empresasLoading, loading, emitiendo, error, success, fetch,
    emitirComprobante, clearFeedback, crearEmpresa, configurandoEmpresa, errorEmpresa, clearFeedbackEmpresa,
  } = useFacturacionQuery();

  const [configurarSunat, setConfigurarSunat] = useState(false);

  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<TipoComprobante | ''>('');
  const [filtroEstado, setFiltroEstado] = useState<FiltroEstado>('');

  const disponiblesFiltrados = useMemo(
    () => disponibles.filter((c) => enRango(c.fecha, desde, hasta)),
    [disponibles, desde, hasta],
  );

  const emitidosFiltrados = useMemo(
    () =>
      emitidos.filter((c) => {
        if (!enRango(c.comprobante?.createdAt ?? c.fecha, desde, hasta)) return false;
        if (filtroTipo && c.comprobante?.tipo !== filtroTipo) return false;
        if (!filtroEstado) return true;
        const estado = c.comprobante?.estado;
        if (filtroEstado === 'PENDIENTE') return estado === 'FIRMADO' || estado === 'ENVIADO';
        return estado === filtroEstado;
      }),
    [emitidos, desde, hasta, filtroTipo, filtroEstado],
  );

  const [emitir, setEmitir] = useState<ComprobantePagoDto | null>(null);
  const [tipo, setTipo] = useState<TipoComprobante>('BOLETA');
  const [clienteRuc, setClienteRuc] = useState('');
  const [clienteRazonSocial, setClienteRazonSocial] = useState('');
  const [clienteDni, setClienteDni] = useState('');
  const [clienteNombre, setClienteNombre] = useState('');
  const modalRef = useRef<HTMLDialogElement>(null);

  const cerrarModal = () => setEmitir(null);
  useFocusTrap(modalRef, { active: !!emitir, onClose: cerrarModal });

  const empresaUnica = empresas.length === 1 ? empresas[0] : null;
  const puedeEmitir = empresas.length > 0;

  const abrirEmision = (c: ComprobantePagoDto) => {
    setEmitir(c);
    setTipo('BOLETA');
    setClienteRuc('');
    setClienteRazonSocial('');
    setClienteDni('');
    setClienteNombre('');
  };

  const confirmarEmision = async () => {
    if (!emitir || !empresaUnica) return;
    if (tipo === 'FACTURA' && clienteRuc.trim().length !== 11) {
      toast({ title: 'RUC inválido', msg: 'La factura electrónica exige un RUC de 11 dígitos.', icon: 'Alert', kind: 'err' });
      return;
    }
    try {
      await emitirComprobante(emitir.cuentaId, {
        tipoComprobante: tipo,
        empresaRuc: empresaUnica.ruc,
        clienteRuc: tipo === 'FACTURA' ? clienteRuc.trim() : undefined,
        clienteRazonSocial: tipo === 'FACTURA' ? clienteRazonSocial.trim() || undefined : undefined,
        clienteDni: tipo === 'BOLETA' ? clienteDni.trim() || undefined : undefined,
        clienteNombre: tipo === 'BOLETA' ? clienteNombre.trim() || undefined : undefined,
      });
      toast({ title: 'Comprobante firmado', msg: 'Enviándose a SUNAT — el estado se actualiza solo.', icon: 'Check', kind: 'ok' });
      cerrarModal();
    } catch {
      toast({ title: 'No se pudo emitir', msg: 'Revisa los datos e inténtalo de nuevo.', icon: 'Alert', kind: 'err' });
    }
  };

  const pendientesSunat = emitidosFiltrados.filter((c) => c.comprobante?.estado === 'FIRMADO' || c.comprobante?.estado === 'ENVIADO').length;
  const aceptados = emitidosFiltrados.filter((c) => c.comprobante?.estado === 'ACEPTADO').length;
  const hayFiltros = !!(desde || hasta || filtroTipo || filtroEstado);
  const limpiarFiltros = () => {
    setDesde('');
    setHasta('');
    setFiltroTipo('');
    setFiltroEstado('');
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="page-h">
        <div>
          <h1>Facturación</h1>
          <div className="sub">Emisión de boletas y facturas electrónicas SUNAT</div>
        </div>
        <span className="spacer" />
        {!empresasLoading && empresas.length < 2 && (
          <button className="btn btn-soft btn-sm" onClick={() => setConfigurarSunat(true)}>
            <Icons.Sede s={15} /> {empresas.length === 0 ? 'Configurar SUNAT' : 'Agregar otra empresa'}
          </button>
        )}
        <button className="btn btn-ghost btn-sm" onClick={fetch} title="Refrescar" aria-label="Refrescar facturación">
          <Icons.Refresh s={16} />
        </button>
      </div>

      {!online && (
        <output className="banner warn module-feedback">
          <Icons.Alert s={17} />
          <span>Sin conexión. La emisión está deshabilitada.</span>
        </output>
      )}

      {!empresasLoading && !puedeEmitir && (
        <div className="banner warn module-feedback" role="alert">
          <Icons.Alert s={17} />
          <span>No hay ninguna empresa con certificado SUNAT configurado todavía — usa "Configurar SUNAT" arriba.</span>
        </div>
      )}

      {(error || success) && (
        <div className={`banner ${error ? 'err' : 'ok'} module-feedback`} role="alert">
          {error ? <Icons.Alert s={17} /> : <Icons.Check s={16} />}
          <span>{error ?? success}</span>
          <span className="spacer" />
          <button className="btn btn-sm btn-ghost" onClick={clearFeedback}>Cerrar</button>
        </div>
      )}

      <div className="grid-stats" style={{ marginBottom: 16 }}>
        <StatKpi icon="Receipt" tint="accent" label="Disponibles" value={disponiblesFiltrados.length} />
        <StatKpi icon="Clock" tint="warn" label="Esperando SUNAT" value={pendientesSunat} />
        <StatKpi icon="Check" tint="ok" label="Aceptados" value={aceptados} />
      </div>

      <div className="module-toolbar" style={{ marginBottom: 16 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="fact-desde">Desde</label>
          <div className="input"><input id="fact-desde" type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></div>
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="fact-hasta">Hasta</label>
          <div className="input"><input id="fact-hasta" type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></div>
        </div>
        <span className="spacer" />
        {hayFiltros && (
          <button className="btn btn-ghost btn-sm" onClick={limpiarFiltros}>Limpiar filtros</button>
        )}
      </div>

      <section className="panel" style={{ marginBottom: 16 }}>
        <div className="panel-h">
          <h3>Comprobantes de pago disponibles</h3>
          <span className="spacer" />
          <span className="badge badge-info">{disponiblesFiltrados.length}</span>
        </div>

        {loading && disponiblesFiltrados.length === 0 && (
          <div className="table-wrap table-wrap-flat">
            {[1, 2, 3].map((row) => (
              <div key={row} className="skeleton-row row" style={{ gap: 12 }}>
                <div className="skel" style={{ width: '50%', height: 13 }} />
              </div>
            ))}
          </div>
        )}

        {!loading && disponiblesFiltrados.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Receipt s={24} /></div>
            <h3>{hayFiltros ? 'Nada con este filtro' : 'Sin comprobantes pendientes'}</h3>
            <p>{hayFiltros ? 'Prueba ampliando el rango de fechas.' : 'Aparecen acá apenas se cierra una cuenta en caja.'}</p>
          </div>
        )}

        {!loading && disponiblesFiltrados.length > 0 && (
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th className="col-mobile-hidden">Mesero</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th className="cell-action"></th>
                </tr>
              </thead>
              <tbody>
                {disponiblesFiltrados.map((c) => (
                  <tr key={c.id}>
                    <td className="muted">{fechaHora(c.fecha)}</td>
                    <td className="col-mobile-hidden">{c.meseroNombre ?? <span className="muted">Sin datos</span>}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(Number(c.total))}</td>
                    <td className="cell-action">
                      <button
                        className="btn btn-sm btn-primary"
                        disabled={!online || !puedeEmitir}
                        onClick={() => abrirEmision(c)}
                      >
                        Emitir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-h">
          <h3>Emitidos recientes</h3>
          <span className="spacer" />
          <span className="badge badge-info">{emitidosFiltrados.length}</span>
        </div>

        <div className="module-toolbar" style={{ padding: '0 16px 12px' }}>
          <fieldset className="filters" aria-label="Filtrar por tipo de comprobante">
            <button className={`chip ${filtroTipo === '' ? 'on' : ''}`} onClick={() => setFiltroTipo('')}>Todos</button>
            <button className={`chip ${filtroTipo === 'BOLETA' ? 'on' : ''}`} onClick={() => setFiltroTipo('BOLETA')}>Boletas</button>
            <button className={`chip ${filtroTipo === 'FACTURA' ? 'on' : ''}`} onClick={() => setFiltroTipo('FACTURA')}>Facturas</button>
          </fieldset>
          <span className="spacer" />
          <fieldset className="filters" aria-label="Filtrar por estado SUNAT">
            <button className={`chip ${filtroEstado === '' ? 'on' : ''}`} onClick={() => setFiltroEstado('')}>Todos</button>
            <button className={`chip ${filtroEstado === 'PENDIENTE' ? 'on' : ''}`} onClick={() => setFiltroEstado('PENDIENTE')}>Pendientes</button>
            <button className={`chip ${filtroEstado === 'ACEPTADO' ? 'on' : ''}`} onClick={() => setFiltroEstado('ACEPTADO')}>Aceptados</button>
            <button className={`chip ${filtroEstado === 'RECHAZADO' ? 'on' : ''}`} onClick={() => setFiltroEstado('RECHAZADO')}>Rechazados</button>
            <button className={`chip ${filtroEstado === 'OBSERVADO' ? 'on' : ''}`} onClick={() => setFiltroEstado('OBSERVADO')}>Observados</button>
          </fieldset>
        </div>

        {!loading && emitidosFiltrados.length === 0 && (
          <div className="empty">
            <div className="e-ic"><Icons.Check s={24} /></div>
            <h3>{emitidos.length === 0 ? 'Todavía no emitiste ninguno' : 'Nada con este filtro'}</h3>
            <p>{emitidos.length === 0 ? 'Los comprobantes emitidos y su estado ante SUNAT aparecen acá.' : 'Prueba ampliando el rango de fechas o cambiando el filtro.'}</p>
          </div>
        )}

        {emitidosFiltrados.length > 0 && (
          <div className="table-wrap table-wrap-flat">
            <table className="dt">
              <thead>
                <tr>
                  <th>Comprobante</th>
                  <th className="col-mobile-hidden">Cliente</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th>Estado</th>
                  <th className="cell-action"></th>
                </tr>
              </thead>
              <tbody>
                {emitidosFiltrados.map((c) => {
                  const comprobante = c.comprobante;
                  return (
                    <tr key={c.id}>
                      <td><strong>{comprobante ? `${comprobante.tipo === 'FACTURA' ? 'F' : 'B'} ${comprobante.serie}-${comprobante.correlativo}` : '—'}</strong></td>
                      <td className="col-mobile-hidden muted">
                        {comprobante?.clienteRazonSocial ?? comprobante?.clienteNombre ?? comprobante?.clienteRuc ?? comprobante?.clienteDni ?? 'Cliente varios'}
                      </td>
                      <td style={{ textAlign: 'right' }}>{fmt(Number(comprobante?.total ?? c.total))}</td>
                      <td>
                        {comprobante ? (
                          <span className={`badge dot ${ESTADO_BADGE[comprobante.estado]}`} title={comprobante.motivoRechazo ?? undefined}>
                            {ESTADO_LABEL[comprobante.estado]}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="cell-action">
                        {comprobante?.estado === 'ACEPTADO' && (
                          <button
                            className="btn btn-sm btn-ghost"
                            title="Imprimir comprobante"
                            aria-label="Imprimir comprobante"
                            onClick={() => abrirComprobanteParaImprimir({ comprobante, items: c.items ?? [] })}
                          >
                            <Icons.Print s={15} />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {emitir && (
        <div className="modal-wrap">
          <Scrim onClose={cerrarModal} />
          <dialog open className="modal" ref={modalRef} aria-modal="true" aria-label="Emitir comprobante" style={{ position: 'relative', zIndex: 1 }}>
            <div className="panel-h" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: 18 }}>Emitir comprobante · {fmt(Number(emitir.total))}</h3>
              <span className="spacer" />
              <button className="icon-btn" onClick={cerrarModal} aria-label="Cerrar"><Icons.Close s={17} /></button>
            </div>
            <div className="modal-scroll" style={{ padding: '18px 20px' }}>
              {empresaUnica && (
                <div className="hint" style={{ marginBottom: 12 }}>
                  Emisor: {empresaUnica.razonSocial} · RUC {empresaUnica.ruc}
                </div>
              )}

              <div className="row" style={{ gap: 6, marginBottom: 12 }}>
                {([{ v: 'BOLETA', l: 'Boleta' }, { v: 'FACTURA', l: 'Factura' }] as { v: TipoComprobante; l: string }[]).map((c) => (
                  <button key={c.v} type="button" className={`chip ${tipo === c.v ? 'on' : ''}`} onClick={() => setTipo(c.v)}>
                    {c.l}
                  </button>
                ))}
              </div>

              {tipo === 'FACTURA' ? (
                <>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="fact-ruc">RUC del cliente</label>
                    <div className="input">
                      <input
                        id="fact-ruc"
                        value={clienteRuc}
                        onChange={(e) => setClienteRuc(e.target.value.replace(/\D/g, ''))}
                        inputMode="numeric"
                        maxLength={11}
                        autoFocus
                        placeholder="11 dígitos"
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="fact-razon">Razón social</label>
                    <div className="input">
                      <input id="fact-razon" value={clienteRazonSocial} onChange={(e) => setClienteRazonSocial(e.target.value)} placeholder="Opcional" />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="bol-dni">DNI del cliente</label>
                    <div className="input">
                      <input
                        id="bol-dni"
                        value={clienteDni}
                        onChange={(e) => setClienteDni(e.target.value.replace(/\D/g, ''))}
                        inputMode="numeric"
                        maxLength={8}
                        autoFocus
                        placeholder="Opcional"
                      />
                    </div>
                  </div>
                  <div className="field" style={{ marginBottom: 12 }}>
                    <label htmlFor="bol-nombre">Nombre del cliente</label>
                    <div className="input">
                      <input id="bol-nombre" value={clienteNombre} onChange={(e) => setClienteNombre(e.target.value)} placeholder="Opcional" />
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', paddingTop: 14, padding: '14px 20px' }}>
              <button className="btn btn-ghost" onClick={cerrarModal}>Cancelar</button>
              <span className="spacer" />
              <button
                className="btn btn-primary"
                disabled={emitiendo || !empresaUnica || (tipo === 'FACTURA' && clienteRuc.trim().length !== 11)}
                onClick={() => void confirmarEmision()}
              >
                {emitiendo ? <span className="spinner" /> : <Icons.Check s={15} />} Emitir {tipo === 'FACTURA' ? 'factura' : 'boleta'}
              </button>
            </div>
          </dialog>
        </div>
      )}

      {configurarSunat && (
        <ConfigurarEmpresaModal
          guardando={configurandoEmpresa}
          error={errorEmpresa}
          onClose={() => { setConfigurarSunat(false); clearFeedbackEmpresa(); }}
          onGuardar={async (payload) => {
            const empresa = await crearEmpresa(payload);
            toast({ title: 'Empresa configurada', msg: `${empresa.razonSocial} (RUC ${empresa.ruc}) ya puede emitir comprobantes.`, icon: 'Check', kind: 'ok' });
            setConfigurarSunat(false);
            clearFeedbackEmpresa();
            return empresa;
          }}
        />
      )}
    </div>
  );
}
