// @ts-nocheck

import { OrdenesService } from './ordenes.service';
import { PrismaService } from '../prisma/prisma.service';

function dec(n: number) {
  return {
    toNumber: () => n,
    lte: (o: { toNumber: () => number } | number) => n <= (typeof o === 'number' ? o : o.toNumber()),
    gte: (o: { toNumber: () => number } | number) => n >= (typeof o === 'number' ? o : o.toNumber()),
  };
}

function createMockPrismaService(overrides: Record<string, unknown> = {}) {
  return { ...overrides } as unknown as PrismaService;
}

const SEDE = 'sede-001';
const OTRA_SEDE = 'sede-002';

describe('OrdenesService', () => {
  let service: OrdenesService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  const insumoRow = {
    id: 'i-001',
    sedeId: SEDE,
    nombre: 'Pescado (lenguado)',
    unidad: 'kg',
    costoUnitario: dec(28),
  };

  function ordenRow(overrides: Record<string, unknown> = {}) {
    return {
      id: 'oc-001',
      sedeId: SEDE,
      codigo: 'OC-1001',
      proveedorId: null,
      proveedorNombre: 'Pesquera del Sur',
      estado: 'BORRADOR',
      fechaEmision: new Date('2026-06-01'),
      fechaEnvio: null,
      fechaEntregaEsperada: null,
      fechaCierre: null,
      moneda: 'PEN',
      total: dec(336),
      notas: null,
      usuarioId: null,
      usuarioNombre: null,
      items: [
        { id: 'it-001', insumoId: 'i-001', insumoNombre: 'Pescado (lenguado)', unidad: 'kg', cantidadPedida: dec(12), cantidadRecibida: dec(0), costoUnitario: dec(28) },
      ],
      createdAt: new Date('2026-06-01'),
      updatedAt: new Date('2026-06-01'),
      ...overrides,
    };
  }

  beforeEach(() => {
    mockPrisma = createMockPrismaService({
      ordenCompra: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      ordenCompraItem: {
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        createMany: jest.fn(),
      },
      insumo: { findMany: jest.fn() },
      proveedor: { findUnique: jest.fn() },
      secuenciaOrden: { upsert: jest.fn() },
    });
    mockPrisma.insumo.findMany.mockResolvedValue([insumoRow]);
    mockPrisma.$transaction = jest.fn((callback: unknown) => (callback as (arg: unknown) => unknown)(mockPrisma));
    service = new OrdenesService(mockPrisma);
  });

  describe('crear', () => {
    it('crea una orden BORRADOR con el correlativo de la sede y el total calculado', async () => {
      mockPrisma.secuenciaOrden.upsert.mockResolvedValue({ sedeId: SEDE, ultimo: 1001 });
      mockPrisma.ordenCompra.create.mockResolvedValue(ordenRow());

      const result = await service.crear(
        { proveedorNombre: 'Pesquera del Sur', items: [{ insumoId: 'i-001', cantidadPedida: 12 }] },
        null,
        SEDE,
      );

      expect(result.message).toBe('Orden de compra creada');
      expect(result.orden.codigo).toBe('OC-1001');
      expect(mockPrisma.ordenCompra.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ sedeId: SEDE, codigo: 'OC-1001', estado: 'BORRADOR', total: 336 }),
        }),
      );
    });

    it('usa el proveedor existente y su nombre real cuando se pasa proveedorId', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue({ id: 'pr-1', sedeId: SEDE, nombre: 'Pesquera del Sur' });
      mockPrisma.secuenciaOrden.upsert.mockResolvedValue({ sedeId: SEDE, ultimo: 1001 });
      mockPrisma.ordenCompra.create.mockResolvedValue(ordenRow());

      await service.crear({ proveedorId: 'pr-1', items: [{ insumoId: 'i-001', cantidadPedida: 12 }] }, null, SEDE);

      expect(mockPrisma.ordenCompra.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ proveedorId: 'pr-1', proveedorNombre: 'Pesquera del Sur' }) }),
      );
    });

    it('rechaza un insumo que no pertenece a la sede', async () => {
      mockPrisma.insumo.findMany.mockResolvedValue([]);
      await expect(
        service.crear({ proveedorNombre: 'X', items: [{ insumoId: 'i-otro', cantidadPedida: 1 }] }, null, SEDE),
      ).rejects.toThrow('no encontrado');
    });

    it('exige un proveedor (existente o nombre ad-hoc)', async () => {
      await expect(
        service.crear({ items: [{ insumoId: 'i-001', cantidadPedida: 1 }] }, null, SEDE),
      ).rejects.toThrow('Indica el proveedor');
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(
        service.crear({ proveedorNombre: 'X', items: [{ insumoId: 'i-001', cantidadPedida: 1 }] }, null, null),
      ).rejects.toThrow('Indica la sede');
    });
  });

  describe('actualizar', () => {
    it('permite editar una orden en BORRADOR y recalcula el total', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow());
      mockPrisma.ordenCompraItem.findMany.mockResolvedValue([
        { cantidadPedida: dec(20), costoUnitario: dec(28) },
      ]);
      mockPrisma.ordenCompra.update.mockResolvedValue(ordenRow({ total: dec(560) }));

      const result = await service.actualizar('oc-001', { items: [{ insumoId: 'i-001', cantidadPedida: 20 }] }, SEDE);
      expect(mockPrisma.ordenCompraItem.deleteMany).toHaveBeenCalledWith({ where: { ordenId: 'oc-001' } });
      expect(result.orden.total).toBe(560);
    });

    it('rechaza editar una orden que ya no está en BORRADOR', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow({ estado: 'ENVIADA' }));
      await expect(service.actualizar('oc-001', { notas: 'x' }, SEDE)).rejects.toThrow('Solo se puede editar');
    });
  });

  describe('eliminar', () => {
    it('elimina una orden en BORRADOR', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow());
      const result = await service.eliminar('oc-001', SEDE);
      expect(mockPrisma.ordenCompra.delete).toHaveBeenCalledWith({ where: { id: 'oc-001' } });
      expect(result.message).toBe('Orden de compra eliminada');
    });

    it('rechaza eliminar una orden que ya no está en BORRADOR', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow({ estado: 'RECIBIDA' }));
      await expect(service.eliminar('oc-001', SEDE)).rejects.toThrow('Solo se puede eliminar');
    });
  });

  describe('enviar', () => {
    it('pasa de BORRADOR a ENVIADA', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow());
      mockPrisma.ordenCompra.update.mockResolvedValue(ordenRow({ estado: 'ENVIADA', fechaEnvio: new Date() }));
      const result = await service.enviar('oc-001', SEDE);
      expect(result.orden.estado).toBe('ENVIADA');
    });

    it('rechaza (409) enviar una orden que ya fue enviada', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow({ estado: 'ENVIADA' }));
      await expect(service.enviar('oc-001', SEDE)).rejects.toThrow('Solo se puede enviar');
    });

    it('un usuario pineado no puede enviar una orden de otra sede', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow());
      await expect(service.enviar('oc-001', OTRA_SEDE)).rejects.toThrow('no encontrada');
    });
  });

  describe('cerrar', () => {
    it('cierra con faltante una orden ENVIADA o PARCIAL, quedando RECIBIDA', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow({ estado: 'PARCIAL' }));
      mockPrisma.ordenCompra.update.mockResolvedValue(ordenRow({ estado: 'RECIBIDA', fechaCierre: new Date() }));
      const result = await service.cerrar('oc-001', 'proveedor sin stock', SEDE);
      expect(result.orden.estado).toBe('RECIBIDA');
      expect(mockPrisma.ordenCompra.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ estado: 'RECIBIDA' }) }),
      );
    });

    it('rechaza cerrar una orden en BORRADOR', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow());
      await expect(service.cerrar('oc-001', undefined, SEDE)).rejects.toThrow('Solo se puede cerrar');
    });
  });

  describe('anular', () => {
    it('anula una orden en BORRADOR', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow());
      mockPrisma.ordenCompra.update.mockResolvedValue(ordenRow({ estado: 'ANULADA' }));
      const result = await service.anular('oc-001', 'ya no se necesita', SEDE);
      expect(result.orden.estado).toBe('ANULADA');
    });

    it('rechaza anular una orden ya RECIBIDA', async () => {
      mockPrisma.ordenCompra.findUnique.mockResolvedValue(ordenRow({ estado: 'RECIBIDA' }));
      await expect(service.anular('oc-001', undefined, SEDE)).rejects.toThrow('No se puede anular');
    });
  });

  describe('resumen', () => {
    it('calcula los KPIs a partir de las órdenes e insumos de la sede', async () => {
      mockPrisma.ordenCompra.findMany.mockResolvedValue([
        ordenRow({ estado: 'ENVIADA', items: [{ cantidadPedida: dec(10), cantidadRecibida: dec(0), costoUnitario: dec(28) }] }),
        ordenRow({ id: 'oc-002', estado: 'RECIBIDA', items: [{ cantidadPedida: dec(5), cantidadRecibida: dec(5), costoUnitario: dec(6) }] }),
      ]);
      mockPrisma.insumo.findMany.mockResolvedValue([
        { stockActual: dec(1), stockMinimo: dec(3) },
        { stockActual: dec(40), stockMinimo: dec(20) },
      ]);

      const result = await service.resumen(SEDE);
      expect(result.ordenesAbiertas).toBe(1);
      expect(result.ordenesPorRecibir).toBe(1);
      expect(result.montoPorRecibir).toBe(280);
      expect(result.gastoRecibido).toBe(30);
      expect(result.insumosBajoMinimo).toBe(1);
    });
  });
});
