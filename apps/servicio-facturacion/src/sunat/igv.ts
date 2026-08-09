// IGV Perú: 18% (estándar vigente). Los precios del POS ya incluyen IGV
// (precio final al cliente); SUNAT exige desglosar valorVenta + IGV por
// separado en el XML.
export const TASA_IGV = 0.18;

export interface DesgloseIgv {
  valorVenta: number;
  igv: number;
  total: number;
}

/** Redondeo a 2 decimales, half-up (evita el drift binario de sumar floats). */
export function redondear2(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100;
}

/** A partir de un monto con IGV incluido, desglosa valorVenta + IGV. */
export function desglosarIgv(totalConIgv: number): DesgloseIgv {
  const valorVenta = redondear2(totalConIgv / (1 + TASA_IGV));
  const igv = redondear2(totalConIgv - valorVenta);
  return { valorVenta, igv, total: redondear2(totalConIgv) };
}
