// @ts-nocheck

import { ProveedoresService } from './proveedores.service';
import { PrismaService } from '../prisma/prisma.service';

function createMockPrismaService(overrides: Record<string, unknown> = {}) {
  return { ...overrides } as unknown as PrismaService;
}

const SEDE = 'sede-001';
const OTRA_SEDE = 'sede-002';

describe('ProveedoresService', () => {
  let service: ProveedoresService;
  let mockPrisma: ReturnType<typeof createMockPrismaService>;

  const proveedorBase = {
    id: 'pr-001',
    sedeId: SEDE,
    nombre: 'Pesquera del Sur',
    ruc: '20488112345',
    categoria: 'Pescados y mariscos',
    contacto: 'Sra. Rojas',
    telefono: '987100200',
    diasEntrega: 'Mar · Vie',
    condicionPago: '15 días',
    activo: true,
    createdAt: new Date('2026-06-01'),
    updatedAt: new Date('2026-06-01'),
  };

  beforeEach(() => {
    mockPrisma = createMockPrismaService({
      proveedor: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      ordenCompra: { count: jest.fn() },
    });
    service = new ProveedoresService(mockPrisma);
  });

  describe('listar', () => {
    it('lista proveedores de la sede', async () => {
      mockPrisma.proveedor.findMany.mockResolvedValue([proveedorBase]);
      const result = await service.listar({}, SEDE);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].nombre).toBe('Pesquera del Sur');
      expect(mockPrisma.proveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE }) }),
      );
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.listar({}, null)).rejects.toThrow('Indica la sede');
    });

    it('un usuario pineado ignora el sedeId del query', async () => {
      mockPrisma.proveedor.findMany.mockResolvedValue([]);
      await service.listar({ sedeId: OTRA_SEDE }, SEDE);
      expect(mockPrisma.proveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ sedeId: SEDE }) }),
      );
    });

    it('pagina con cursor y respeta el tope de limit', async () => {
      mockPrisma.proveedor.findMany.mockResolvedValue([]);
      await service.listar({ cursor: 'pr-010', limit: 500 }, SEDE);
      expect(mockPrisma.proveedor.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ cursor: { id: 'pr-010' }, skip: 1, take: 101 }),
      );
    });
  });

  describe('crear', () => {
    it('crea un proveedor en la sede resuelta', async () => {
      mockPrisma.proveedor.create.mockResolvedValue(proveedorBase);
      const result = await service.crear({ nombre: 'Pesquera del Sur', ruc: '20488112345' }, SEDE);
      expect(result.message).toBe('Proveedor creado');
      expect(mockPrisma.proveedor.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ sedeId: SEDE, nombre: 'Pesquera del Sur' }) }),
      );
    });

    it('permite ruc ausente (compra ad-hoc de mercado)', async () => {
      mockPrisma.proveedor.create.mockResolvedValue({ ...proveedorBase, ruc: null });
      const result = await service.crear({ nombre: 'Mercado Central' }, SEDE);
      expect(result.proveedor.ruc).toBeNull();
    });

    it('traduce P2002 (nombre/ruc duplicado en la sede) a ConflictException', async () => {
      mockPrisma.proveedor.create.mockRejectedValue({ code: 'P2002' });
      await expect(service.crear({ nombre: 'Pesquera del Sur' }, SEDE)).rejects.toThrow('Ya existe un proveedor');
    });

    it('el admin general sin sede seleccionada recibe BadRequestException', async () => {
      await expect(service.crear({ nombre: 'X' }, null)).rejects.toThrow('Indica la sede');
    });
  });

  describe('actualizar', () => {
    it('actualiza un proveedor existente', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue(proveedorBase);
      mockPrisma.proveedor.update.mockResolvedValue({ ...proveedorBase, telefono: '999000111' });
      const result = await service.actualizar('pr-001', { telefono: '999000111' }, SEDE);
      expect(result.proveedor.telefono).toBe('999000111');
    });

    it('un usuario pineado no puede editar un proveedor de otra sede', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue(proveedorBase);
      await expect(service.actualizar('pr-001', { telefono: '1' }, OTRA_SEDE)).rejects.toThrow('no encontrado');
    });
  });

  describe('eliminar', () => {
    it('borra un proveedor sin órdenes asociadas', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue(proveedorBase);
      mockPrisma.ordenCompra.count.mockResolvedValue(0);
      const result = await service.eliminar('pr-001', SEDE);
      expect(mockPrisma.proveedor.delete).toHaveBeenCalledWith({ where: { id: 'pr-001' } });
      expect(result.message).toBe('Proveedor eliminado');
    });

    it('desactiva (soft-delete) un proveedor con órdenes asociadas en vez de borrarlo', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue(proveedorBase);
      mockPrisma.ordenCompra.count.mockResolvedValue(2);
      mockPrisma.proveedor.update.mockResolvedValue({ ...proveedorBase, activo: false });
      const result = await service.eliminar('pr-001', SEDE);
      expect(mockPrisma.proveedor.delete).not.toHaveBeenCalled();
      expect(mockPrisma.proveedor.update).toHaveBeenCalledWith({ where: { id: 'pr-001' }, data: { activo: false } });
      expect(result.proveedor.activo).toBe(false);
    });

    it('lanza NotFoundException si no existe', async () => {
      mockPrisma.proveedor.findUnique.mockResolvedValue(null);
      await expect(service.eliminar('inexistente', SEDE)).rejects.toThrow('no encontrado');
    });
  });
});
