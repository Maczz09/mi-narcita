import 'reflect-metadata';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { RoutingKeys } from '@org/contracts';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { NotificationsGateway } from './notifications.gateway';

describe('AppController - Notificaciones', () => {
  let controller: AppController;
  let appService: { obtenerNotificaciones: ReturnType<typeof vi.fn>; registrarNotificacion: ReturnType<typeof vi.fn> };
  let gateway: { emitPedidoUpdate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    appService = {
      obtenerNotificaciones: vi.fn(),
      registrarNotificacion: vi.fn(),
    };
    gateway = { emitPedidoUpdate: vi.fn() };
    controller = new AppController(appService as unknown as AppService, gateway as unknown as NotificationsGateway);
  });

  describe('obtenerNotificaciones', () => {
    it('should return notifications list', async () => {
      const mockNotifs = [{ id: 'n1', contenido: 'Test' }];
      appService.obtenerNotificaciones.mockResolvedValue(mockNotifs);

      const result = await controller.obtenerNotificaciones();

      expect(result).toEqual(mockNotifs);
      expect(appService.obtenerNotificaciones).toHaveBeenCalled();
    });
  });

  describe('handlePedidoCreado', () => {
    it('persiste y emite el payload enriquecido', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'notif-1', contenido: 'Nuevo pedido' });
      const payload = {
        pedido: { id: 'pedido-1', mesaId: 'mesa-1', items: [], total: 0, estado: 'PENDIENTE', createdAt: new Date().toISOString() },
      };

      await controller.handlePedidoCreado(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.PedidoCreado, payload);
      expect(gateway.emitPedidoUpdate).toHaveBeenCalledWith({
        pattern: RoutingKeys.PedidoCreado,
        data: { ...payload, notificacionId: 'notif-1', contenido: 'Nuevo pedido' },
      });
    });

    it('handles null notif gracefully (notificacionId=undefined)', async () => {
      appService.registrarNotificacion.mockResolvedValue(null);
      await controller.handlePedidoCreado({ estado: 'TEST' } as any);
      expect(gateway.emitPedidoUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ pattern: RoutingKeys.PedidoCreado }),
      );
    });
  });

  describe('handlePedidoActualizado', () => {
    it('persiste y emite evento pedido actualizado', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n2', contenido: 'act' });
      const payload = { estado: 'EN_PREPARACION', mesaId: 'mesa-1' };

      await controller.handlePedidoActualizado(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.PedidoActualizado, payload);
    });
  });

  describe('handlePedidoListo', () => {
    it('persiste y emite evento pedido listo', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n3', contenido: 'listo' });
      const payload = { pedidoId: 'ped-1', mesaId: 'mesa-2' };

      await controller.handlePedidoListo(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.PedidoListo, payload);
    });
  });

  describe('handleTicketGenerado', () => {
    it('persiste y emite evento ticket generado', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n4', contenido: 'ticket' });
      const payload = { ticketId: 'tick-1', cuentaId: 'c-1' };

      await controller.handleTicketGenerado(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.TicketGenerado, payload);
    });
  });

  describe('handleCuentaAbierta', () => {
    it('persiste y emite evento cuenta abierta', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n5', contenido: 'cuenta' });
      const payload = { cuentaId: 'c-1', mesaId: 'mesa-1' };

      await controller.handleCuentaAbierta(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.CuentaAbierta, payload);
    });
  });

  describe('handleCuentaCerrada', () => {
    it('persiste y emite evento cuenta cerrada', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n6', contenido: 'cerrada' });
      const payload = { cuentaId: 'c-1', mesaId: 'mesa-1', total: 150 };

      await controller.handleCuentaCerrada(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.CuentaCerrada, payload);
    });
  });

  describe('handleMesaActualizada', () => {
    it('persiste y emite evento mesa actualizada', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n7', contenido: 'mesa' });
      const payload = { mesa: { id: 'mesa-1', estado: 'OCUPADA' } };

      await controller.handleMesaActualizada(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.MesaActualizada, payload);
    });
  });

  describe('handleReservaCreada', () => {
    it('persiste y emite evento reserva creada', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n8', contenido: 'reserva creada' });
      const payload = { reserva: { id: 'r-1', clienteNombre: 'Ana' } };

      await controller.handleReservaCreada(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.ReservaCreada, payload);
    });
  });

  describe('handleReservaCancelada', () => {
    it('persiste y emite evento reserva cancelada', async () => {
      appService.registrarNotificacion.mockResolvedValue({ id: 'n9', contenido: 'reserva cancelada' });
      const payload = { reservaId: 'r-1', motivo: 'Cliente no llegó' };

      await controller.handleReservaCancelada(payload as any);

      expect(appService.registrarNotificacion).toHaveBeenCalledWith(RoutingKeys.ReservaCancelada, payload);
    });
  });
});
