/**
 * Nombre de marca de la suite, centralizado en un único lugar. Cada
 * `main.ts` de servicio arma su título de Swagger con `apiTitle(...)` en vez
 * de repetir el nombre como string literal, así que renombrar la marca es
 * un cambio de una sola línea acá en vez de N cambios en cada servicio.
 */
export const APP_NAME = 'RestoApp.pe';

export function apiTitle(servicio: string): string {
  return `${APP_NAME} — API ${servicio}`;
}
