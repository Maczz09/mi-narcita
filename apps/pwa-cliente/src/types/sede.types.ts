// types/sede.types.ts — DTOs de sedes (T-23: multi-sede)

import type {
  SedeDto as ContractSedeDto,
  CrearSedeCommand as ContractCrearSedeCommand,
  ActualizarSedeCommand as ContractActualizarSedeCommand,
} from '@org/contracts';

export type SedeDto = ContractSedeDto;
export type CrearSedePayload = ContractCrearSedeCommand;
export type ActualizarSedePayload = ContractActualizarSedeCommand;
