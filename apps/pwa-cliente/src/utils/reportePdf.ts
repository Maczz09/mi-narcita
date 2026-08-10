// utils/reportePdf.ts — Exporta el resumen de reportes a PDF.
// jspdf/jspdf-autotable se cargan lazy (import dinámico) para no engordar
// el bundle principal: solo se descargan cuando el usuario pulsa "Exportar".

import type { ResumenVM } from '../types/reporte.types';
import { APP_NAME } from '../config';

function formatMoney(value: number): string {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

export async function exportarResumenPdf(resumen: ResumenVM, nombreLocal = APP_NAME): Promise<void> {
  const [{ default: JsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

  const doc = new JsPDF();
  const margenX = 14;
  let y = 18;

  doc.setFontSize(16);
  doc.text(`${nombreLocal} — Reporte de ventas`, margenX, y);
  y += 8;

  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(resumen.rangoLabel, margenX, y);
  y += 10;

  doc.setTextColor(0);
  doc.setFontSize(11);
  const kpis = [
    ['Ingresos', formatMoney(resumen.ingresosTotales)],
    ['Ventas cerradas', String(resumen.totalVentas)],
    ['Ticket promedio', resumen.ticketPromedioLabel],
  ];
  for (const [label, value] of kpis) {
    doc.text(`${label}: ${value}`, margenX, y);
    y += 6;
  }
  y += 4;

  if (resumen.topProductos.length > 0) {
    doc.setFontSize(12);
    doc.text('Top productos', margenX, y);
    autoTable(doc, {
      startY: y + 4,
      head: [['Producto', 'Cantidad', 'Ingresos']],
      body: resumen.topProductos.map((p) => [
        p.nombre,
        String(p.cantidad),
        p.ingresos == null ? '—' : formatMoney(p.ingresos),
      ]),
      margin: { left: margenX, right: margenX },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [55, 65, 81] },
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-assignment
    y = ((doc as any).lastAutoTable?.finalY ?? y) + 10;
  }

  if (resumen.ventasPorHora.length > 0) {
    doc.setFontSize(12);
    doc.text('Ventas por hora', margenX, y);
    autoTable(doc, {
      startY: y + 4,
      head: [['Hora', 'Total']],
      body: resumen.ventasPorHora.map((h) => [h.hora, formatMoney(h.total)]),
      margin: { left: margenX, right: margenX },
      styles: { fontSize: 9 },
      headStyles: { fillColor: [55, 65, 81] },
    });
  }

  const nombreArchivo = `reporte-ventas_${resumen.fecha.slice(0, 10)}.pdf`;
  doc.save(nombreArchivo);
}
