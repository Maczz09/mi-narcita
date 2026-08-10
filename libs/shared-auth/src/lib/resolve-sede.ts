import { BadRequestException } from '@nestjs/common';

/** "Sede Principal" — el id fijo al que se backfillearon los datos pre-multi-sede. */
export const SEDE_PRINCIPAL_ID = '00000000-0000-0000-0000-000000000001';

/**
 * T-23 (multi-sede): resuelve la sede efectiva de una request contra
 * `req.user.sedeId` (poblado por el JWT).
 *
 * - Usuario pineado (sedeId no nulo): SIEMPRE su propia sede — un
 *   `sedeId` que venga del cliente se ignora, para que un usuario pineado
 *   no pueda leer/escribir en otra sede pasando el parámetro a mano.
 * - Usuario sin sede fija (admin general, sedeId nulo en su token): debe
 *   indicar en qué sede quiere operar; sin eso no hay sede efectiva.
 */
export function resolveSedeId(usuarioSedeId: string | null | undefined, sedeIdSolicitado?: string | null): string {
  if (usuarioSedeId) return usuarioSedeId;
  if (sedeIdSolicitado) return sedeIdSolicitado;
  throw new BadRequestException('Indica la sede (sedeId): tu usuario administra varias y ninguna quedó seleccionada.');
}
