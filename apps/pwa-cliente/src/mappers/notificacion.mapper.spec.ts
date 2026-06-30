// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import { mapNotificacion, mapNotificaciones, mapSocketNotification } from './notificacion.mapper';
import type { NotificacionDto, SocketNotificationPayload } from '../types/notificacion.types';

describe('notificacion.mapper', () => {
  it('mapNotificacion falls back to explicit title/content', () => {
    const dto: NotificacionDto = {
      id: '1',
      eventoOrigen: 'custom.event',
      contenido: 'hello',
      canal: 'UI',
      estado: 'PENDIENTE',
      leida: false,
      timestamp: '2026-06-30T10:00:00Z',
    };
    const vm = mapNotificacion(dto);
    expect(vm.titulo).toBe('Custom Event');
    expect(vm.contenido).toBe('hello');
  });

  it('mapNotificacion handles mesa.creada', () => {
    const dto: NotificacionDto = {
      id: '2',
      eventoOrigen: 'mesa.creada',
      contenido: JSON.stringify({ mesa: { numero: 5 } }),
      canal: 'UI',
      estado: 'PENDIENTE',
      leida: false,
      timestamp: '2026-06-30T10:00:00Z',
    };
    const vm = mapNotificacion(dto);
    expect(vm.titulo).toBe('Nueva mesa');
    expect(vm.contenido).toBe('Mesa 5 creada.');
  });

  it('mapNotificaciones maps array', () => {
    const dtos: NotificacionDto[] = [
      { id: '1', eventoOrigen: 'custom.1', contenido: 'hi', canal: 'UI', estado: 'PENDIENTE', leida: true, timestamp: '2026-06-30T10:00:00Z' },
    ];
    const vms = mapNotificaciones(dtos);
    expect(vms).toHaveLength(1);
    expect(vms[0].id).toBe('1');
  });

  it('mapSocketNotification maps correctly', () => {
    const payload: SocketNotificationPayload = {
      pattern: 'pedido.creado',
      data: { pedido: { mesa: { numero: 10, capacidad: 4 }, total: 100 } }
    };
    const vm = mapSocketNotification(payload);
    expect(vm.titulo).toBe('Nuevo pedido');
    expect(vm.contenido).toContain('Nuevo pedido para Mesa 10.');
    expect(vm.contenido).toContain('S/ 100.00');
  });
});

