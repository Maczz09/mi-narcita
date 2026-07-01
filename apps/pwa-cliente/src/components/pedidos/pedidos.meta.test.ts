import { describe, it, expect, vi } from 'vitest';
import { nextEstadoFor, nextLabelFor } from './pedidos.meta';
import type { PedidoVM } from '../../types/pedido.types';

vi.mock('../../domain/pedido.flow', async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    PERMITIR_OVERRIDE_PRODUCCION: true,
  };
});

describe('pedidos.meta', () => {
  it('nextEstadoFor and nextLabelFor cover all states', () => {
    expect(nextEstadoFor({ estado: 'PENDIENTE' } as PedidoVM)).toBeDefined();
    expect(nextEstadoFor({ estado: 'EN_PREPARACION' } as PedidoVM)).toBeDefined();
    expect(nextEstadoFor({ estado: 'LISTO' } as PedidoVM)).toBeDefined();
    expect(nextEstadoFor({ estado: 'ENTREGADO' } as PedidoVM)).toBeDefined();

    expect(nextLabelFor({ estado: 'PENDIENTE', canal: 'SALON' } as PedidoVM)).toBeDefined();
    expect(nextLabelFor({ estado: 'EN_PREPARACION', canal: 'SALON' } as PedidoVM)).toBeDefined();
    expect(nextLabelFor({ estado: 'LISTO', canal: 'SALON' } as PedidoVM)).toBeDefined();
    expect(nextLabelFor({ estado: 'ENTREGADO', canal: 'SALON' } as PedidoVM)).toBeDefined();
  });
});
