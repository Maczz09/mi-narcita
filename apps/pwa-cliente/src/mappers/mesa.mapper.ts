// mappers/mesa.mapper.ts — MesaDto → MesaVM

import type { MesaDto, MesaVM, EstadoMesa } from '../types/mesa.types';

const ESTADO_CSS: Record<EstadoMesa, string> = {
  LIBRE: 'libre',
  OCUPADA: 'ocup',
  RESERVADA: 'resv',
};

const ESTADO_LABEL: Record<EstadoMesa, string> = {
  LIBRE: 'Libre',
  OCUPADA: 'Ocupada',
  RESERVADA: 'Reservada',
};

export function mapMesa(dto: MesaDto): MesaVM {
  return {
    id: dto.id,
    numero: String(dto.numero).padStart(2, '0'),
    numeroRaw: dto.numero,
    capacidad: dto.capacidad,
    ubicacion: dto.ubicacion,
    ubicacionId: dto.ubicacionId,
    estado: dto.estado,
    cuentaAsociada: dto.cuentaAsociada ?? null,
    estadoClass: ESTADO_CSS[dto.estado] ?? '',
    estadoLabel: ESTADO_LABEL[dto.estado] ?? dto.estado,
    grupoId: dto.grupoId ?? null,
  };
}

export function mapMesas(dtos: MesaDto[]): MesaVM[] {
  return dtos.map(mapMesa).sort((a, b) => a.numeroRaw - b.numeroRaw);
}
