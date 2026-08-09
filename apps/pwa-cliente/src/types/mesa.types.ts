// types/mesa.types.ts — DTOs y ViewModels de mesas
// DTOs derivados de @org/contracts; ViewModels propios de la UI.

import type {
  ActualizarEstadoMesaCommand,
  CrearMesaCommand,
  MesaDto as ContractMesaDto,
  MesaEstado as ContractEstadoMesa,
  UbicacionDto as ContractUbicacionDto,
  CrearUbicacionCommand,
  ActualizarUbicacionCommand,
} from '@org/contracts';

// ─── Enums ──────────────────────────────────────────────────────
export const EstadoMesa = {
  Libre: 'LIBRE',
  Ocupada: 'OCUPADA',
  Reservada: 'RESERVADA',
} as const satisfies Record<string, ContractEstadoMesa>;

export type EstadoMesa = ContractEstadoMesa;

// ─── DTO del backend (GET /mesas) ───────────────────────────────
export type MesaDto = ContractMesaDto;

// ─── ViewModel para la UI ───────────────────────────────────────
export interface MesaVM {
  id: string;
  numero: string;       // "01", "02" (padStart 2)
  numeroRaw: number;    // número original para ordenamiento
  capacidad: number;
  ubicacion: string;    // homologado con el backend (antes "zona" en la PWA)
  ubicacionId: string;
  estado: EstadoMesa;
  cuentaAsociada: string | null;
  /** Clase CSS para el color del estado */
  estadoClass: string;
  /** Label legible del estado */
  estadoLabel: string;
}

// ─── Comando para actualizar estado ─────────────────────────────
export type ActualizarEstadoMesaPayload = ActualizarEstadoMesaCommand;

// ─── Comando para crear mesa ────────────────────────────────────
export type CrearMesaPayload = CrearMesaCommand;

// ─── Ubicaciones (CRUD) ──────────────────────────────────────────
export type UbicacionDto = ContractUbicacionDto;
export type CrearUbicacionPayload = CrearUbicacionCommand;
export type ActualizarUbicacionPayload = ActualizarUbicacionCommand;

export interface UbicacionVM {
  id: string;
  nombre: string;
}
