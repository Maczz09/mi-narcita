// screens/caja/BoletaInterna.tsx — Boleta de venta interna, imprimible (80mm).
// NO es el comprobante electrónico SUNAT (eso lo emite servicio-facturacion,
// aparte, a mano por caja/admin — ver CONTEXTO.md). Esto es el recibo que se
// entrega al cliente al momento del cobro, con desglose de IGV.

import { Icons } from '../../components/ui/icons';
import { fmt } from '../../utils/format';
import { RESTO_FISCAL } from './cajaConstants';
import type { TicketDto, TransaccionDto } from '../../types/cuenta.types';

const Row = ({ l, v, bold }: Readonly<{ l: string; v: string; bold?: boolean }>) => (
  <div className={`zrow ${bold ? 'bold' : ''}`}><span>{l}</span><span>{v}</span></div>
);

interface Props {
  ticket: TicketDto;
  transaccion: TransaccionDto;
  mesaNumero?: string;
  propina: number;
  onImprimir: () => void;
  onCerrar: () => void;
}

export function BoletaInterna({ ticket, transaccion, mesaNumero, propina, onImprimir, onCerrar }: Readonly<Props>) {
  const totalConPropina = ticket.total + propina;
  const igv = ticket.total - ticket.total / 1.18;
  const fecha = new Date(ticket.fecha);

  return (
    <div style={{ padding: 20 }}>
      <div className="print-area">
        <div className="zticket">
          <div className="zc">
            <img src="/logo.webp" alt="" style={{ width: 56, height: 'auto', marginBottom: 6 }} />
            <h4>{RESTO_FISCAL.nombre.toUpperCase()}</h4>
            <div style={{ fontSize: 11 }}>{RESTO_FISCAL.dir}</div>
            <div style={{ fontSize: 11 }}>RUC {RESTO_FISCAL.ruc}</div>
          </div>
          <hr className="zhr" />
          <div className="zc">
            <div className="zlbl">Boleta de venta · Documento interno</div>
            <div style={{ fontWeight: 800, fontSize: 14 }}>Mesa {mesaNumero ?? ticket.mesaId}</div>
          </div>
          <Row l="Ticket" v={ticket.id.slice(0, 8)} />
          <Row l="Fecha" v={fecha.toLocaleDateString('es-PE')} />
          <Row l="Hora" v={fecha.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} />
          {transaccion.cajeroNombre && <Row l="Cajero" v={transaccion.cajeroNombre} />}
          <hr className="zhr" />
          <div className="zlbl" style={{ marginBottom: 4 }}>Ítems</div>
          {ticket.items.map((it, i) => (
            <Row key={`${it.productoId ?? it.nombre}-${i}`} l={`${it.cantidad}x ${it.nombre}`} v={fmt(it.cantidad * it.precioUnitario)} />
          ))}
          <hr className="zhr" />
          <Row l="Subtotal" v={fmt(ticket.subtotal)} />
          {ticket.descuento > 0 && <Row l="Descuento" v={`-${fmt(ticket.descuento)}`} />}
          {propina > 0 && <Row l="Propina" v={fmt(propina)} />}
          <Row l="IGV (18%, incluido)" v={fmt(igv)} />
          <Row l="Total" v={fmt(totalConPropina)} bold />
          <hr className="zhr" />
          <Row l="Método de pago" v={transaccion.metodo} />
          <hr className="zhr" />
          <div className="zc" style={{ fontSize: 11, marginTop: 4 }}>
            Documento interno de control · no es un comprobante de pago electrónico SUNAT
          </div>
        </div>
      </div>

      <div className="row" style={{ gap: 10, marginTop: 20, justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" onClick={onCerrar}>Listo</button>
        <button className="btn btn-primary" onClick={onImprimir}><Icons.Print s={16} /> Imprimir boleta</button>
      </div>
    </div>
  );
}
