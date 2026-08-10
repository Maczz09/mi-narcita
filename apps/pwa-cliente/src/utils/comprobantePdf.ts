// utils/comprobantePdf.ts — Descarga la foto de un comprobante de compra
// (WebP) como PDF ligero.
//
// El formato PDF no soporta WebP en ninguno de sus filtros de imagen
// (DCTDecode/FlateDecode/JPXDecode/CCITTFax/JBIG2): hay que transcodificar sí
// o sí. Se hace en el canvas del cliente con el decodificador/codificador
// nativo del navegador — gratis, sin round-trip al servidor — en vez de con
// una librería nueva del lado del servidor.
//
// jsPDF.processWEBP decodifica el WebP en JS puro y lo re-codifica a JPEG con
// qu=100: pasar el .webp directo a addImage() produce un PDF 3-5× más pesado
// que la imagen. En cambio processJPEG guarda los bytes JPEG verbatim con
// /Filter /DCTDecode (sin recomprimir), así que transcodificando ANTES a JPEG
// en el canvas y pasando 'JPEG' a addImage el PDF final pesa ≈ la imagen + ~1 KB.
export async function descargarComprobantePdf(blobWebp: Blob, nombreArchivo: string): Promise<void> {
  const bitmap = await createImageBitmap(blobWebp);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    throw new Error('No se pudo preparar el lienzo para generar el PDF');
  }
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  const jpeg = canvas.toDataURL('image/jpeg', 0.82);

  const { default: JsPDF } = await import('jspdf');
  const horizontal = canvas.width > canvas.height;
  // Página del tamaño EXACTO de la imagen: sin márgenes, sin A4 vacío — se
  // abre y ya se ve la boleta.
  const doc = new JsPDF({
    orientation: horizontal ? 'landscape' : 'portrait',
    unit: 'px',
    format: [canvas.width, canvas.height],
  });
  doc.addImage(jpeg, 'JPEG', 0, 0, canvas.width, canvas.height);
  doc.save(nombreArchivo.endsWith('.pdf') ? nombreArchivo : `${nombreArchivo}.pdf`);
}
