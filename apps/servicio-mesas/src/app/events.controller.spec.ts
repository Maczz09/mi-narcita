// @ts-nocheck

import { EventsController } from './events.controller';

describe('EventsController - Mesas', () => {
  it('cuenta.abierta recibe payload directo, ocupa la mesa y propaga al grupo', async () => {
    const appService = { actualizarEstado: jest.fn().mockResolvedValue({}), propagarCuentaAGrupo: jest.fn().mockResolvedValue(undefined) };
    const controller = new EventsController(appService as never);

    await controller.handleCuentaAbierta({ cuentaId: 'cuenta-1', mesaId: 'mesa-1' });

    expect(appService.actualizarEstado).toHaveBeenCalledWith('mesa-1', {
      estado: 'OCUPADA',
      cuentaAsociada: 'cuenta-1',
    });
    expect(appService.propagarCuentaAGrupo).toHaveBeenCalledWith('mesa-1', 'cuenta-1', 'OCUPADA');
  });

  it('cuenta.cerrada recibe payload directo, libera la mesa y libera el grupo', async () => {
    const appService = { actualizarEstado: jest.fn().mockResolvedValue({}), liberarGrupo: jest.fn().mockResolvedValue(undefined) };
    const controller = new EventsController(appService as never);

    await controller.handleCuentaCerrada({ cuentaId: 'cuenta-1', mesaId: 'mesa-1', total: 90 });

    expect(appService.actualizarEstado).toHaveBeenCalledWith('mesa-1', {
      estado: 'LIBRE',
      cuentaAsociada: null,
    });
    expect(appService.liberarGrupo).toHaveBeenCalledWith('mesa-1');
  });
});

