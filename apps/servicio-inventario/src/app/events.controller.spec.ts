/* eslint-disable */
import { Test, TestingModule } from '@nestjs/testing';
import { EventsController } from './events.controller';
import { AppService } from './app.service';
import { PedidoCreadoPayload, PedidoEstado } from '@org/contracts';

describe('EventsController (Inventario)', () => {
  let eventsController: EventsController;
  let appService: AppService;

  beforeEach(async () => {
    const mockAppService = {
      procesarPedidoCreado: jest.fn(),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [EventsController],
      providers: [
        {
          provide: AppService,
          useValue: mockAppService,
        },
      ],
    }).compile();

    eventsController = app.get<EventsController>(EventsController);
    appService = app.get<AppService>(AppService);
  });

  it('debe estar definido', () => {
    expect(eventsController).toBeDefined();
  });

  it('handlePedidoCreado debe llamar a appService.procesarPedidoCreado con el pedido del payload', async () => {
    const pedido = {
      id: 'pedido-1',
      mesaId: 'mesa-1',
      items: [{ id: 'i-001', productoId: 'p-1', cantidad: 2, precioUnitario: 10, nombre: 'Test' }],
      total: 20,
      estado: PedidoEstado.Pendiente,
      createdAt: new Date().toISOString(),
      numeroMesa: 1,
    };
    const payload: PedidoCreadoPayload = { pedido };

    jest.spyOn(appService, 'procesarPedidoCreado').mockResolvedValue(undefined);

    await eventsController.handlePedidoCreado(payload);

    expect(appService.procesarPedidoCreado).toHaveBeenCalledWith(pedido);
  });

  it('debe propagar errores del servicio', async () => {
    const pedido = {
      id: 'pedido-err',
      mesaId: 'mesa-1',
      items: [],
      total: 0,
      estado: PedidoEstado.Pendiente,
      createdAt: new Date().toISOString(),
      numeroMesa: 1,
    };
    const payload: PedidoCreadoPayload = { pedido };

    jest.spyOn(appService, 'procesarPedidoCreado').mockRejectedValue(new Error('fail'));

    await expect(eventsController.handlePedidoCreado(payload)).rejects.toThrow('fail');
  });
});
