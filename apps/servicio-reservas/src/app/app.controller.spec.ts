// @ts-nocheck
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { ReservasService } from './reservas.service';
import { CrearReservaCommand, ListarReservasQuery } from '@org/contracts';

describe('AppController', () => {
  let appController: AppController;
  let reservasService: ReservasService;

  const mockReservasService = {
    listar: jest.fn() as any,
    consultarDisponibilidad: jest.fn() as any,
    crear: jest.fn() as any,
    confirmar: jest.fn() as any,
    cancelar: jest.fn() as any,
  };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: ReservasService,
          useValue: mockReservasService,
        },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    reservasService = app.get<ReservasService>(ReservasService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('listar', () => {
    it('should return a list of reservas', async () => {
      const query: ListarReservasQuery = {};
      const expectedResult = { data: [], nextCursor: null };
      mockReservasService.listar.mockResolvedValue(expectedResult);

      const result = await appController.listar(query);

      expect(reservasService.listar).toHaveBeenCalledWith(query);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('disponibilidad', () => {
    it('should return disponibilidad', async () => {
      const fecha = '2026-06-15';
      const hora = '19:00';
      const mesaPreferida = 'mesa-005';
      const expectedResult = { disponible: true, mesasReservadas: [], capacidadRestante: 1, fecha, hora, mesaPreferida };
      mockReservasService.consultarDisponibilidad.mockResolvedValue(expectedResult);

      const result = await appController.disponibilidad(fecha, hora, mesaPreferida);

      expect(reservasService.consultarDisponibilidad).toHaveBeenCalledWith(fecha, hora, mesaPreferida);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('crear', () => {
    it('should create a reserva sin usuario autenticado (null)', async () => {
      const command: CrearReservaCommand = { fecha: '2026-06-15', hora: '19:00', mesaPreferida: 'mesa-005', clienteNombre: 'Juan' };
      const expectedResult = { message: 'Reserva creada' };
      mockReservasService.crear.mockResolvedValue(expectedResult);

      const result = await appController.crear(command, null, null, null);

      expect(reservasService.crear).toHaveBeenCalledWith(command, null);
      expect(result).toEqual(expectedResult);
    });

    it('debe delegar el usuario que registró la reserva (id + nombre)', async () => {
      const command: CrearReservaCommand = { fecha: '2026-06-15', hora: '19:00', mesaPreferida: 'mesa-005', clienteNombre: 'Juan' };
      mockReservasService.crear.mockResolvedValue({ message: 'Reserva creada' });

      await appController.crear(command, 'u-recepcion', 'Recepción Uno', null);

      expect(reservasService.crear).toHaveBeenCalledWith(command, { id: 'u-recepcion', nombre: 'Recepción Uno' });
    });

    it('debe caer a email y luego a usuarioId si falta el nombre', async () => {
      const command: CrearReservaCommand = { fecha: '2026-06-15', hora: '19:00', mesaPreferida: 'mesa-005', clienteNombre: 'Juan' };
      mockReservasService.crear.mockResolvedValue({ message: 'Reserva creada' });

      await appController.crear(command, 'u-1', null, 'recepcion@nachopps.pe');
      expect(reservasService.crear).toHaveBeenCalledWith(command, { id: 'u-1', nombre: 'recepcion@nachopps.pe' });

      await appController.crear(command, 'svc-reservas', null, null);
      expect(reservasService.crear).toHaveBeenCalledWith(command, { id: 'svc-reservas', nombre: 'svc-reservas' });
    });
  });

  describe('confirmar', () => {
    it('should confirm a reserva', async () => {
      const id = 'r-001';
      const expectedResult = { message: 'Reserva confirmada' };
      mockReservasService.confirmar.mockResolvedValue(expectedResult);

      const result = await appController.confirmar(id);

      expect(reservasService.confirmar).toHaveBeenCalledWith(id);
      expect(result).toEqual(expectedResult);
    });
  });

  describe('cancelar', () => {
    it('should cancel a reserva', async () => {
      const id = 'r-001';
      const motivo = 'Cliente cancelo';
      const expectedResult = { message: 'Reserva cancelada' };
      mockReservasService.cancelar.mockResolvedValue(expectedResult);

      const result = await appController.cancelar(id, motivo);

      expect(reservasService.cancelar).toHaveBeenCalledWith(id, motivo);
      expect(result).toEqual(expectedResult);
    });

    it('should cancel a reserva without motivo', async () => {
      const id = 'r-001';
      const expectedResult = { message: 'Reserva cancelada' };
      mockReservasService.cancelar.mockResolvedValue(expectedResult);

      const result = await appController.cancelar(id);

      expect(reservasService.cancelar).toHaveBeenCalledWith(id, undefined);
      expect(result).toEqual(expectedResult);
    });
  });
});
