/* eslint-disable */
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { AppController } from './app.controller';

// El controller es delegación pura sobre AppService: cada endpoint reenvía sus
// argumentos al método de servicio correspondiente (y el usuario actual cuando aplica).
describe('AppController — Caja', () => {
  let service: Record<string, ReturnType<typeof jest.fn>>;
  let controller: AppController;

  beforeEach(() => {
    service = {
      registrarPago: jest.fn<any>().mockResolvedValue({ ok: true }),
      listarTransacciones: jest.fn<any>().mockResolvedValue({ data: [] }),
      abrirTurno: jest.fn<any>().mockResolvedValue({ id: 'turno-1' }),
      obtenerTurnoActivo: jest.fn<any>().mockResolvedValue(null),
      obtenerResumenTurnoActivo: jest.fn<any>().mockResolvedValue({ turno: null }),
      obtenerResumenTurno: jest.fn<any>().mockResolvedValue({ turno: { id: 't-1' } }),
      listarMovimientosTurno: jest.fn<any>().mockResolvedValue({ data: [] }),
      crearMovimiento: jest.fn<any>().mockResolvedValue({ id: 'mov-1' }),
      registrarArqueo: jest.fn<any>().mockResolvedValue({ id: 'arq-1' }),
      cerrarTurno: jest.fn<any>().mockResolvedValue({ turno: { estado: 'CERRADA' } }),
    };
    controller = new AppController(service as any);
  });

  it('healthCheck reporta el servicio', () => {
    expect(controller.healthCheck()).toEqual({ status: 'OK', service: 'Caja' });
  });

  it('registrarPago delega con el usuario actual', async () => {
    const body = { cuentaId: 'c-1', montoRecibido: 50, metodo: 'EFECTIVO' } as any;
    await controller.registrarPago(body, 'u-1');
    expect(service.registrarPago).toHaveBeenCalledWith(body, 'u-1');
  });

  it('P-62: registrarPago acepta token S2S sin email/nombre', async () => {
    const body = { cuentaId: 'c-1', montoRecibido: 50, metodo: 'EFECTIVO' } as any;
    await expect(controller.registrarPago(body, 'svc-caja')).resolves.toEqual({ ok: true });
    expect(service.registrarPago).toHaveBeenCalledWith(body, 'svc-caja');
  });

  it('listarTransacciones delega el query', async () => {
    await controller.listarTransacciones({ limit: 10 } as any);
    expect(service.listarTransacciones).toHaveBeenCalledWith({ limit: 10 });
  });

  it('abrirTurno delega body y usuario', async () => {
    await controller.abrirTurno({ fondoInicial: 100 } as any, 'u-1');
    expect(service.abrirTurno).toHaveBeenCalledWith({ fondoInicial: 100 }, 'u-1');
  });

  it('obtenerTurnoActivo / resumenActivo delegan el usuario', async () => {
    await controller.obtenerTurnoActivo('u-1');
    await controller.obtenerResumenTurnoActivo('u-1');
    expect(service.obtenerTurnoActivo).toHaveBeenCalledWith();
    expect(service.obtenerResumenTurnoActivo).toHaveBeenCalledWith();
  });

  it('obtenerResumenTurno / listarMovimientosTurno delegan el id', async () => {
    await controller.obtenerResumenTurno('turno-1');
    await controller.listarMovimientosTurno('turno-1');
    expect(service.obtenerResumenTurno).toHaveBeenCalledWith('turno-1');
    expect(service.listarMovimientosTurno).toHaveBeenCalledWith('turno-1');
  });

  it('crearMovimiento delega id y body', async () => {
    const body = { tipo: 'INGRESO', monto: 10, donde: 'caja' } as any;
    await controller.crearMovimiento('turno-1', body);
    expect(service.crearMovimiento).toHaveBeenCalledWith('turno-1', body);
  });

  it('registrarArqueo delega id, body y usuario', async () => {
    const body = { denominaciones: {} } as any;
    await controller.registrarArqueo('turno-1', body, 'u-1');
    expect(service.registrarArqueo).toHaveBeenCalledWith('turno-1', body, 'u-1');
  });

  it('cerrarTurno delega id, body y usuario', async () => {
    const body = { denominaciones: {} } as any;
    await controller.cerrarTurno('turno-1', body, 'u-1');
    expect(service.cerrarTurno).toHaveBeenCalledWith('turno-1', body, 'u-1');
  });
});
