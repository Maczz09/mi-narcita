// screens/compras/unidadesCompra.ts — Catálogo cerrado de unidades de compra.
// Antes era un <input> de texto libre (cada quien escribía "kg", "Kg", "kilo"…);
// ahora es un <select> con un código corto fijo por unidad para que el dato en
// BD sea consistente (mismo código siempre = se puede sumar/filtrar/reportar).

export interface UnidadCompra {
  value: string;
  label: string;
  grupo: 'Peso' | 'Volumen' | 'Cantidad y empaque';
}

export const UNIDADES_COMPRA: UnidadCompra[] = [
  { value: 'kg', label: 'Kilogramo (kg)', grupo: 'Peso' },
  { value: 'g', label: 'Gramo (g)', grupo: 'Peso' },
  { value: 'ton', label: 'Tonelada (ton)', grupo: 'Peso' },

  { value: 'lt', label: 'Litro (lt)', grupo: 'Volumen' },
  { value: 'ml', label: 'Mililitro (ml)', grupo: 'Volumen' },
  { value: 'gal', label: 'Galón (gal)', grupo: 'Volumen' },
  { value: 'barril', label: 'Barril (barril)', grupo: 'Volumen' },

  { value: 'und', label: 'Unidad (und)', grupo: 'Cantidad y empaque' },
  { value: 'doc', label: 'Docena (doc)', grupo: 'Cantidad y empaque' },
  { value: 'par', label: 'Par (par)', grupo: 'Cantidad y empaque' },
  { value: 'paq', label: 'Paquete (paq)', grupo: 'Cantidad y empaque' },
  { value: 'caja', label: 'Caja (caja)', grupo: 'Cantidad y empaque' },
  { value: 'jaba', label: 'Jaba (jaba)', grupo: 'Cantidad y empaque' },
  { value: 'bolsa', label: 'Bolsa (bolsa)', grupo: 'Cantidad y empaque' },
  { value: 'saco', label: 'Saco (saco)', grupo: 'Cantidad y empaque' },
  { value: 'bot', label: 'Botella (bot)', grupo: 'Cantidad y empaque' },
  { value: 'lata', label: 'Lata (lata)', grupo: 'Cantidad y empaque' },
  { value: 'balde', label: 'Balde (balde)', grupo: 'Cantidad y empaque' },
  { value: 'atd', label: 'Atado (atd)', grupo: 'Cantidad y empaque' },
  { value: 'malla', label: 'Malla (malla)', grupo: 'Cantidad y empaque' },
  { value: 'frasco', label: 'Frasco (frasco)', grupo: 'Cantidad y empaque' },
  { value: '6pack', label: 'Six pack (6pack)', grupo: 'Cantidad y empaque' },
  { value: 'fardo', label: 'Fardo (fardo)', grupo: 'Cantidad y empaque' },
  { value: 'rollo', label: 'Rollo (rollo)', grupo: 'Cantidad y empaque' },
  { value: 'balon', label: 'Balón de gas (balón)', grupo: 'Cantidad y empaque' },
];

export const UNIDADES_COMPRA_GRUPOS = ['Peso', 'Volumen', 'Cantidad y empaque'] as const;

export function unidadLabel(value: string): string {
  return UNIDADES_COMPRA.find((u) => u.value === value)?.label ?? value;
}

// Si un insumo ya tiene guardado un código que no está en el catálogo (dato
// viejo de cuando el campo era texto libre), lo mantenemos seleccionable para
// no forzar un cambio de dato al abrir el formulario de edición.
export function unidadesConValorActual(valorActual?: string): UnidadCompra[] {
  if (!valorActual || UNIDADES_COMPRA.some((u) => u.value === valorActual)) return UNIDADES_COMPRA;
  return [{ value: valorActual, label: `${valorActual} (valor anterior)`, grupo: 'Cantidad y empaque' }, ...UNIDADES_COMPRA];
}
