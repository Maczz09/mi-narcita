import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController - Reportes', () => {
  let controller: AppController;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let appService: any;

  beforeEach(() => {
    jest.clearAllMocks();
    appService = {
      obtenerResumenDiario: jest.fn(),
      obtenerPorProducto: jest.fn(),
      obtenerPorTurno: jest.fn(),
      obtenerPorMesero: jest.fn(),
      registrarVenta: jest.fn().mockResolvedValue(undefined),
    };
    controller = new AppController(appService as unknown as AppService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('healthCheck', () => {
    it('returns OK status', () => {
      const result = controller.healthCheck();
      expect(result).toEqual({ status: 'OK', service: 'Reportes' });
    });
  });

  describe('getResumen', () => {
    it('returns daily summary', async () => {
      const mockResumen = { fecha: new Date(), totalVentas: 5, ingresosTotales: 250, ventasPorHora: [], topProductos: [] };
      appService.obtenerResumenDiario.mockResolvedValue(mockResumen);

      const result = await controller.getResumen();

      expect(result).toEqual(mockResumen);
      expect(appService.obtenerResumenDiario).toHaveBeenCalled();
    });

    it('returns empty resumen when no ventas', async () => {
      const mockResumen = { fecha: new Date(), totalVentas: 0, ingresosTotales: 0, ventasPorHora: [], topProductos: [] };
      appService.obtenerResumenDiario.mockResolvedValue(mockResumen);

      const result = await controller.getResumen();
      expect(result.totalVentas).toBe(0);
    });
  });

  describe('porProducto', () => {
    it('returns por-producto report with date range', async () => {
      const mockResult = { desde: new Date(), hasta: new Date(), productos: [] };
      appService.obtenerPorProducto.mockResolvedValue(mockResult);
      const query = { desde: '2026-01-01', hasta: '2026-12-31' };

      const result = await controller.porProducto(query);

      expect(result).toEqual(mockResult);
      expect(appService.obtenerPorProducto).toHaveBeenCalledWith(query);
    });

    it('returns por-producto report without date range', async () => {
      const mockResult = { desde: new Date(), hasta: new Date(), productos: [] };
      appService.obtenerPorProducto.mockResolvedValue(mockResult);

      const result = await controller.porProducto({});

      expect(result).toEqual(mockResult);
      expect(appService.obtenerPorProducto).toHaveBeenCalledWith({});
    });
  });

  describe('porTurno', () => {
    it('returns por-turno report', async () => {
      const mockResult = {
        desde: new Date(),
        hasta: new Date(),
        turnos: [{ turno: 'ALMUERZO', totalVentas: 3, ingresos: 200 }],
      };
      appService.obtenerPorTurno.mockResolvedValue(mockResult);
      const query = { desde: '2026-06-01' };

      const result = await controller.porTurno(query);

      expect(result).toEqual(mockResult);
      expect(appService.obtenerPorTurno).toHaveBeenCalledWith(query);
    });

    it('returns empty turnos if no ventas', async () => {
      appService.obtenerPorTurno.mockResolvedValue({ desde: new Date(), hasta: new Date(), turnos: [] });
      const result = await controller.porTurno({});
      expect((result as any).turnos).toEqual([]);
    });
  });

  describe('porMesero', () => {
    it('returns por-mesero report', async () => {
      const mockResult = {
        desde: new Date(),
        hasta: new Date(),
        meseros: [{ meseroId: 'u-1', meseroNombre: 'Ana', totalVentas: 5, ingresos: 500 }],
      };
      appService.obtenerPorMesero.mockResolvedValue(mockResult);
      const query = { hasta: '2026-12-31' };

      const result = await controller.porMesero(query);

      expect(result).toEqual(mockResult);
      expect(appService.obtenerPorMesero).toHaveBeenCalledWith(query);
    });
  });

  describe('handleCuentaCerrada', () => {
    it('cuenta.cerrada recibe payload directo y registra venta', async () => {
      const payload = { cuentaId: 'cuenta-1', mesaId: 'mesa-1', total: 100 } as any;

      await controller.handleCuentaCerrada(payload);

      expect(appService.registrarVenta).toHaveBeenCalledWith(payload);
    });

    it('cuenta.cerrada con items registra la venta completa', async () => {
      const payload = {
        cuentaId: 'c-2',
        mesaId: 'mesa-2',
        total: 250,
        items: [{ productoId: 'p1', nombre: 'Nachos', cantidad: 5, precioUnitario: 50 }],
        meseroId: 'u-1',
        meseroNombre: 'Ana',
      } as any;

      await controller.handleCuentaCerrada(payload);

      expect(appService.registrarVenta).toHaveBeenCalledWith(payload);
    });
  });
});
