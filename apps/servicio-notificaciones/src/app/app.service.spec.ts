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
    idempotencyKey: {
      create: jest.fn(),
    },
    // $transaction ejecuta el callback con el mismo cliente (que expone
    // idempotencyKey.create y notificacion.create) — como el TransactionClient real.
    $transaction: jest.fn(async (cb: (tx: unknown) => unknown) => cb(prisma)),
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

    it('RELANZA si falla la persistencia (no la traga → el mensaje reintenta/DLQ)', async () => {
      prisma.notificacion.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.registrarNotificacion('pedido.actualizado', {
          mesaId: 'mesa-1',
          estado: 'EN_PREPARACION',
        }),
      ).rejects.toThrow('db down');
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

  describe('registrarNotificacion — idempotencia por eventId (at-least-once)', () => {
    it('con eventId reclama la clave en transacción y persiste (fresh)', async () => {
      prisma.idempotencyKey.create.mockResolvedValue({ key: 'notif:evt-1' });
      prisma.notificacion.create.mockResolvedValue({ id: 'notif-1', contenido: 'x' });

      const result = await service.registrarNotificacion('pedido.creado', { mesaId: 'm1', total: 1 }, 'evt-1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.idempotencyKey.create).toHaveBeenCalledWith({ data: { key: 'notif:evt-1' } });
      expect(prisma.notificacion.create).toHaveBeenCalled();
      expect(result).toEqual({ id: 'notif-1', contenido: 'x' });
    });

    it('evento duplicado (P2002 al reclamar la clave) → devuelve null y NO persiste', async () => {
      prisma.idempotencyKey.create.mockRejectedValue({ code: 'P2002' });

      const result = await service.registrarNotificacion('pedido.creado', { mesaId: 'm1', total: 1 }, 'evt-dup');

      expect(result).toBeNull();
      expect(prisma.notificacion.create).not.toHaveBeenCalled();
    });

    it('error real dentro de la transacción → RELANZA (no lo confunde con duplicado)', async () => {
      prisma.idempotencyKey.create.mockResolvedValue({ key: 'k' });
      prisma.notificacion.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.registrarNotificacion('pedido.creado', { mesaId: 'm1', total: 1 }, 'evt-err'),
      ).rejects.toThrow('db down');
    });

    it('sin eventId NO usa transacción (persistencia directa, sin dedup)', async () => {
      prisma.notificacion.create.mockResolvedValue({ id: 'n' });

      await service.registrarNotificacion('pedido.creado', { mesaId: 'm1', total: 1 });

      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.idempotencyKey.create).not.toHaveBeenCalled();
    });
  });
});
