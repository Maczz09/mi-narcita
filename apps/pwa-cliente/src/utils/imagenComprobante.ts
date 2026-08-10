// utils/imagenComprobante.ts — Precompresión de la foto de boleta/factura
// ANTES de subirla: reduce una foto de móvil de 4-6 MB a ~200 KB para que la
// subida se sienta instantánea en el local. El servidor SIEMPRE vuelve a
// comprimir con sharp (autoridad real de formato/tamaño/EXIF); esto es solo
// una optimización de UX de subida, no la garantía de compresión final.
const LADO_MAXIMO = 1600;
const CALIDAD = 0.72;

export async function precomprimirComprobante(archivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(archivo);
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const ancho = Math.max(1, Math.round(bitmap.width * escala));
  const alto = Math.max(1, Math.round(bitmap.height * escala));

  const canvas = document.createElement('canvas');
  canvas.width = ancho;
  canvas.height = alto;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close();
    return archivo; // fallback: sube el original; el servidor igual lo re-comprime
  }
  ctx.drawImage(bitmap, 0, 0, ancho, alto);
  bitmap.close();

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob ?? archivo), 'image/webp', CALIDAD);
  });
}
