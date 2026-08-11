/* eslint-disable @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises */
import { APP_NAME } from '../../config';

// TODO(mi-narcita): zona/ruc/dir siguen siendo el placeholder heredado del
// core — son datos fiscales reales que van impresos en la boleta interna
// del cliente. Reemplazar con el RUC y dirección reales de Mi Narcita
// antes de usar esto en un cobro real.
export const RESTO_FISCAL = {
  nombre: APP_NAME,
  zona: 'Barranco · Lima',
  ruc: '20554879631',
  dir: 'Av. Saenz Pena 234, Barranco',
};

export const BILLETES = [200, 100, 50, 20, 10];
export const MONEDAS = [5, 2, 1, 0.5, 0.2, 0.1];
export const DENOM_COLOR: Record<number, string> = {
  200: '#5b8f3a',
  100: '#1f6fb0',
  50: '#b5820e',
  20: '#c4322f',
  10: '#3a8f7e',
};
