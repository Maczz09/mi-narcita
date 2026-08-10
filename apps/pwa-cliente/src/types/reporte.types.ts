// types/reporte.types.ts - DTOs y ViewModels de reportes

export interface ResumenDto {
  fecha: string;
  hasta?: string;
  totalVentas: number;
  ingresosTotales: number;
  ventasPorHora?: Array<{ hora: string; total: number; ingresos?: number }>;
  topProductos?: Array<{ productoId?: string; nombre: string; cantidad: number; ingresos?: number }>;
}

export interface ResumenQuery {
  desde?: string;
  hasta?: string;
  /** T-23 Fase 2: solo lo usa el admin general. Ausente = todas las sedes combinadas. */
  sedeId?: string;
}

export interface ResumenVM {
  fecha: string;
  fechaLabel: string;
  /** Etiqueta del rango completo ("07 ago 2026" o "01 ago – 07 ago 2026" si hasta difiere). */
  rangoLabel: string;
  totalVentas: number;
  ingresosTotales: number;
  ingresosLabel: string;
  ticketPromedio: number | null;
  ticketPromedioLabel: string;
  ventasPorHora: Array<{ hora: string; total: number; ingresos?: number }>;
  topProductos: Array<{ productoId?: string; nombre: string; cantidad: number; ingresos?: number }>;
}
