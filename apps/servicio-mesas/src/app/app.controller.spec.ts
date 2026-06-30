import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { MesaEstado } from '@org/contracts';

describe('AppController — Mesas', () => {
  let controller: AppController;
  let appService: jest.Mocked<AppService>;

  const mesaDto = {
    id: 'm-001',
    numero: 5,
    capacidad: 4,
    ubicacion: 'Salon Principal',
    estado: MesaEstado.Libre,
    cuentaAsociada: null,
  };

  beforeEach(async () => {
    appService = {
      listarMesas: jest.fn() as any,
      obtenerMesa: jest.fn() as any,
      crearMesa: jest.fn() as any,
      actualizarEstado: jest.fn() as any,
    } as unknown as jest.Mocked<AppService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: AppService, useValue: appService }],
    }).compile();

    controller = module.get<AppController>(AppController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listarMesas', () => {
    it('should return all mesas', async () => {
      const expected = { mesas: [mesaDto] };
      (appService.listarMesas as jest.Mock).mockResolvedValue(expected);

      const result = await controller.listarMesas();

      expect(result).toEqual(expected);
      expect(appService.listarMesas).toHaveBeenCalled();
    });

    it('should return empty list if no mesas', async () => {
      (appService.listarMesas as jest.Mock).mockResolvedValue({ mesas: [] });

      const result = await controller.listarMesas();

      expect(result).toEqual({ mesas: [] });
    });
  });

  describe('obtenerMesa', () => {
    it('should return a mesa by id', async () => {
      (appService.obtenerMesa as jest.Mock).mockResolvedValue(mesaDto);

      const result = await controller.obtenerMesa('m-001');

      expect(result).toEqual(mesaDto);
      expect(appService.obtenerMesa).toHaveBeenCalledWith('m-001');
    });

    it('should propagate NotFoundException from service', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      (appService.obtenerMesa as jest.Mock).mockRejectedValue(new NotFoundException('Mesa no encontrada'));

      await expect(controller.obtenerMesa('inexistente')).rejects.toThrow('Mesa no encontrada');
    });
  });

  describe('crearMesa', () => {
    it('should create a mesa', async () => {
      const expected = { message: 'Mesa creada exitosamente', mesa: mesaDto };
      (appService.crearMesa as jest.Mock).mockResolvedValue(expected);
      const command = { numero: 5, capacidad: 4, ubicacion: 'Salon Principal' };

      const result = await controller.crearMesa(command);

      expect(result).toEqual(expected);
      expect(appService.crearMesa).toHaveBeenCalledWith(command);
    });

    it('should propagate ConflictException if mesa number exists', async () => {
      const { ConflictException } = await import('@nestjs/common');
      (appService.crearMesa as jest.Mock).mockRejectedValue(new ConflictException('La mesa número 5 ya existe.'));

      await expect(controller.crearMesa({ numero: 5, capacidad: 4 })).rejects.toThrow('La mesa número 5 ya existe.');
    });

    it('should create mesa with minimum required fields', async () => {
      const expected = { message: 'Mesa creada exitosamente', mesa: { ...mesaDto, numero: 10 } };
      (appService.crearMesa as jest.Mock).mockResolvedValue(expected);

      const result = await controller.crearMesa({ numero: 10 });

      expect(result.message).toBe('Mesa creada exitosamente');
    });
  });

  describe('actualizarEstado', () => {
    it('should update mesa state', async () => {
      const expected = { message: 'Estado de mesa actualizado', mesa: { ...mesaDto, estado: MesaEstado.Ocupada } };
      (appService.actualizarEstado as jest.Mock).mockResolvedValue(expected);
      const command = { estado: MesaEstado.Ocupada };

      const result = await controller.actualizarEstado('m-001', command);

      expect(result).toEqual(expected);
      expect(appService.actualizarEstado).toHaveBeenCalledWith('m-001', command);
    });

    it('should return "Estado sin cambios" if state is the same', async () => {
      const expected = { message: 'Estado sin cambios', mesa: mesaDto };
      (appService.actualizarEstado as jest.Mock).mockResolvedValue(expected);

      const result = await controller.actualizarEstado('m-001', { estado: MesaEstado.Libre });

      expect(result.message).toBe('Estado sin cambios');
    });

    it('should propagate NotFoundException for invalid id', async () => {
      const { NotFoundException } = await import('@nestjs/common');
      (appService.actualizarEstado as jest.Mock).mockRejectedValue(new NotFoundException('Mesa con ID x no encontrada.'));

      await expect(controller.actualizarEstado('x', { estado: MesaEstado.Ocupada })).rejects.toThrow('Mesa con ID x no encontrada.');
    });

    it('should update mesa with cuentaAsociada', async () => {
      const expected = { message: 'Estado de mesa actualizado', mesa: { ...mesaDto, estado: MesaEstado.Ocupada, cuentaAsociada: 'c-1' } };
      (appService.actualizarEstado as jest.Mock).mockResolvedValue(expected);

      const result = await controller.actualizarEstado('m-001', { estado: MesaEstado.Ocupada, cuentaAsociada: 'c-1' });

      expect(result).toEqual(expected);
    });
  });
});
