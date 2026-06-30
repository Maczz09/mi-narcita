// @ts-nocheck
import { AppService } from './app.service';
import { PrismaService } from '../prisma/prisma.service';

describe('AppService — Notificaciones', () => {
  let service: AppService;
  const prisma = {
    notificacion: {
      findMany: jest.fn(),
      create: jest.fn(),
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new AppService(prisma as unknown as PrismaService);
  });

  describe('obtenerNotificaciones', () => {
    it('devuelve las últimas 50 notificaciones ordenadas por timestamp desc', async () => {
      prisma.notificacion.findMany.mockResolvedValue([{ id: 'notif-1' }]);

      const result = await service.obtenerNotificaciones();

      expect(result).toEqual([{ id: 'notif-1' }]);
      expect(prisma.notificacion.findMany).toHaveBeenCalledWith({
        orderBy: { timestamp: 'desc' },
        take: 50,
      });
    });

    it('devuelve array vacío si no hay notificaciones', async () => {
      prisma.notificacion.findMany.mockResolvedValue([] as any);
      const result = await service.obtenerNotificaciones();
      expect(result).toEqual([]);
    });
  });

  describe('registrarNotificacion', () => {
    it('persiste contenido de pedido.creado con numeroMesa y total', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'notif-1' });

      const result = await service.registrarNotificacion('pedido.creado', {
        numeroMesa: 7,
        total: 42,
      });

      expect(result).toEqual({ id: 'notif-1' });
      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventoOrigen: 'pedido.creado',
          destinatario: 'TODOS',
          canal: 'UI',
          contenido: 'Nuevo pedido registrado para la Mesa 7 por un total de S/ 42.00.',
          estado: 'PENDIENTE',
        }),
      });
    });

    it('usa mesaNumero como fallback si no hay numeroMesa', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'n2' });

      await service.registrarNotificacion('pedido.creado', { mesaNumero: 3, total: 100 });

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: 'Nuevo pedido registrado para la Mesa 3 por un total de S/ 100.00.',
        }),
      });
    });

    it('usa mesaId como último fallback si no hay numeroMesa ni mesaNumero', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'n3' });

      await service.registrarNotificacion('pedido.creado', { mesaId: 'mesa-abc', total: 0 });

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: 'Nuevo pedido registrado para la Mesa mesa-abc por un total de S/ 0.00.',
        }),
      });
    });

    it('formatea pedido.actualizado con estado y mesa', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'n4' });

      await service.registrarNotificacion('pedido.actualizado', {
        estado: 'EN_PREPARACION',
        mesaId: 'mesa-1',
      });

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: 'El pedido de la Mesa mesa-1 ha cambiado al estado en preparacion.',
        }),
      });
    });

    it('formatea reserva.creada correctamente', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'r-notif' });

      await service.registrarNotificacion('reserva.creada', {
        clienteNombre: 'Ana',
        fecha: '2026-01-02',
        hora: '20:00',
      });

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: 'Nueva reserva registrada a nombre de Ana para el 2026-01-02 a las 20:00.',
        }),
      });
    });

    it('formatea reserva.cancelada correctamente', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'rc-notif' });

      await service.registrarNotificacion('reserva.cancelada', {
        clienteNombre: 'Pedro',
      });

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: 'La reserva a nombre de Pedro ha sido cancelada.',
        }),
      });
    });

    it('usa fallback "Cliente" cuando clienteNombre no es string', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'fb' });

      await service.registrarNotificacion('reserva.cancelada', { clienteNombre: null });

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: expect.stringContaining('Cliente'),
        }),
      });
    });

    it('formatea payload generico como JSON si no coincide patrón conocido', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'gen' });

      await service.registrarNotificacion('evento.desconocido', { ok: true });

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: '{"ok":true}',
        }),
      });
    });

    it('devuelve null si data es null/undefined', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'null-case' });

      await service.registrarNotificacion('evento.algo', null as any);

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: 'Actualización de evento.algo',
        }),
      });
    });

    it('devuelve null si falla la persistencia', async () => {
      prisma.notificacion.create.mockRejectedValue(new Error('db down'));

      const result = await service.registrarNotificacion('pedido.actualizado', {
        mesaId: 'mesa-1',
        estado: 'EN_PREPARACION',
      });

      expect(result).toBeNull();
    });

    it('usa texto() fallback cuando mesaId es null → Mesa ??', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'fb' });

      await service.registrarNotificacion('pedido.creado', { mesaId: null, total: 10 });

      expect(prisma.notificacion.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          contenido: expect.stringContaining('Mesa ??'),
        }),
      });
    });
  });
});
