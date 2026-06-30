import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

jest.mock('@org/resiliencia', () => {
  const actual = jest.requireActual('@org/resiliencia') as any;
  return {
    ...actual,
    RabbitMQRetryInterceptor: class { intercept(ctx: any, next: any) { return next.handle(); } },
    IdempotencyInterceptor: class { intercept(ctx: any, next: any) { return next.handle(); } },
  };
});

describe('AppController', () => {
  let controller: AppController;
  let appService: jest.Mocked<AppService>;

  beforeEach(async () => {
    appService = {
      crearPedido: jest.fn(),
      listarPedidos: jest.fn(),
      actualizarEstado: jest.fn(),
      actualizarEstadoItem: jest.fn(),
      procesarPagoRecibido: jest.fn(),
    } as unknown as jest.Mocked<AppService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        { provide: AppService, useValue: appService },
      ],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('crearPedido', () => {
    it('should create order with user details', async () => {
      appService.crearPedido.mockResolvedValue('pedido' as any);
      const result = await controller.crearPedido({ mesaId: 'm1', items: [] }, 'u1', 'nombre1', 'email1');
      expect(result).toBe('pedido');
      expect(appService.crearPedido).toHaveBeenCalledWith({ mesaId: 'm1', items: [] }, { id: 'u1', nombre: 'nombre1' });
    });

    it('should create order with user id as name fallback if no name/email', async () => {
      appService.crearPedido.mockResolvedValue('pedido2' as any);
      const result = await controller.crearPedido({ mesaId: 'm2', items: [] }, 'u2', null, null);
      expect(result).toBe('pedido2');
      expect(appService.crearPedido).toHaveBeenCalledWith({ mesaId: 'm2', items: [] }, { id: 'u2', nombre: 'u2' });
    });

    it('should create order with no user', async () => {
      appService.crearPedido.mockResolvedValue('pedido3' as any);
      const result = await controller.crearPedido({ mesaId: 'm3', items: [] }, null, null, null);
      expect(result).toBe('pedido3');
      expect(appService.crearPedido).toHaveBeenCalledWith({ mesaId: 'm3', items: [] }, null);
    });
  });

  describe('listarPedidos', () => {
    it('should list orders', async () => {
      appService.listarPedidos.mockResolvedValue(['p1'] as any);
      const result = await controller.listarPedidos({});
      expect(result).toEqual(['p1']);
      expect(appService.listarPedidos).toHaveBeenCalledWith({});
    });
  });

  describe('actualizarEstado', () => {
    it('should update order state', async () => {
      appService.actualizarEstado.mockResolvedValue('updated' as any);
      const result = await controller.actualizarEstado('id1', { estado: 'EN_PREPARACION' } as any);
      expect(result).toBe('updated');
      expect(appService.actualizarEstado).toHaveBeenCalledWith('id1', { estado: 'EN_PREPARACION' });
    });
  });

  describe('actualizarEstadoItem', () => {
    it('should update item state', async () => {
      appService.actualizarEstadoItem.mockResolvedValue('item_updated' as any);
      const result = await controller.actualizarEstadoItem('itemId1', { estado: 'LISTO' } as any);
      expect(result).toBe('item_updated');
      expect(appService.actualizarEstadoItem).toHaveBeenCalledWith('itemId1', { estado: 'LISTO' });
    });
  });

  describe('procesarPago', () => {
    it('should process payment', async () => {
      appService.procesarPagoRecibido.mockResolvedValue(undefined);
      await controller.procesarPago({ cuentaId: 'c1', mesaId: 'm1', monto: 100, metodo: 'EFECTIVO', transaccionId: 'tx1' } as any);
      expect(appService.procesarPagoRecibido).toHaveBeenCalledWith({ cuentaId: 'c1', mesaId: 'm1', monto: 100, metodo: 'EFECTIVO', transaccionId: 'tx1' });
    });
  });
});
