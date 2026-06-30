// @ts-nocheck
import { describe, it, expect } from '@jest/globals';
import {
  accesoDeRol,
  puedeAcceder,
  homeDeRol,
  ACCESO_POR_ROL,
  TODAS_LAS_RUTAS,
} from './permisos';

describe('ACCESO_POR_ROL', () => {
  it('ADMIN tiene acceso a todas las rutas', () => {
    expect(ACCESO_POR_ROL.ADMIN.rutas).toEqual(TODAS_LAS_RUTAS);
  });

  it('COCINA solo tiene acceso a cocina', () => {
    expect(ACCESO_POR_ROL.COCINA.rutas).toEqual(['cocina']);
    expect(ACCESO_POR_ROL.COCINA.home).toBe('cocina');
  });

  it('CAJERO tiene home en caja', () => {
    expect(ACCESO_POR_ROL.CAJERO.home).toBe('caja');
  });

  it('GERENCIA tiene home en reportes', () => {
    expect(ACCESO_POR_ROL.GERENCIA.home).toBe('reportes');
  });

  it('MESERO tiene acceso a mesas, pedidos y reservas', () => {
    expect(ACCESO_POR_ROL.MESERO.rutas).toContain('mesas');
    expect(ACCESO_POR_ROL.MESERO.rutas).toContain('pedidos');
    expect(ACCESO_POR_ROL.MESERO.rutas).toContain('reservas');
  });

  it('RECEPCION tiene home en reservas', () => {
    expect(ACCESO_POR_ROL.RECEPCION.home).toBe('reservas');
  });
});

describe('accesoDeRol', () => {
  it('devuelve el acceso correcto para roles conocidos', () => {
    expect(accesoDeRol('ADMIN')).toBe(ACCESO_POR_ROL.ADMIN);
    expect(accesoDeRol('CAJERO')).toBe(ACCESO_POR_ROL.CAJERO);
    expect(accesoDeRol('COCINA')).toBe(ACCESO_POR_ROL.COCINA);
    expect(accesoDeRol('MESERO')).toBe(ACCESO_POR_ROL.MESERO);
    expect(accesoDeRol('GERENCIA')).toBe(ACCESO_POR_ROL.GERENCIA);
    expect(accesoDeRol('RECEPCION')).toBe(ACCESO_POR_ROL.RECEPCION);
    expect(accesoDeRol('SISTEMA')).toBe(ACCESO_POR_ROL.SISTEMA);
  });

  it('devuelve fallback para rol null', () => {
    const fallback = accesoDeRol(null);
    expect(fallback.home).toBe('inicio');
    expect(fallback.rutas).toContain('inicio');
  });

  it('devuelve fallback para rol undefined', () => {
    const fallback = accesoDeRol(undefined);
    expect(fallback.home).toBe('inicio');
  });

  it('devuelve fallback para rol desconocido', () => {
    const fallback = accesoDeRol('ROL_DESCONOCIDO');
    expect(fallback.home).toBe('inicio');
  });
});

describe('puedeAcceder', () => {
  it('ADMIN puede acceder a cualquier ruta', () => {
    for (const ruta of TODAS_LAS_RUTAS) {
      expect(puedeAcceder('ADMIN', ruta)).toBe(true);
    }
  });

  it('COCINA NO puede acceder a caja', () => {
    expect(puedeAcceder('COCINA', 'caja')).toBe(false);
  });

  it('CAJERO puede acceder a caja', () => {
    expect(puedeAcceder('CAJERO', 'caja')).toBe(true);
  });

  it('CAJERO NO puede acceder a reportes', () => {
    expect(puedeAcceder('CAJERO', 'reportes')).toBe(false);
  });

  it('MESERO puede acceder a mesas pero no a caja', () => {
    expect(puedeAcceder('MESERO', 'mesas')).toBe(true);
    expect(puedeAcceder('MESERO', 'caja')).toBe(false);
  });

  it('rol desconocido solo puede acceder a inicio', () => {
    expect(puedeAcceder('FANTASMA', 'inicio')).toBe(true);
    expect(puedeAcceder('FANTASMA', 'caja')).toBe(false);
  });

  it('rol null no puede acceder a rutas protegidas', () => {
    expect(puedeAcceder(null, 'reportes')).toBe(false);
  });
});

describe('homeDeRol', () => {
  it('devuelve la ruta home correcta para cada rol', () => {
    expect(homeDeRol('ADMIN')).toBe('inicio');
    expect(homeDeRol('CAJERO')).toBe('caja');
    expect(homeDeRol('COCINA')).toBe('cocina');
    expect(homeDeRol('MESERO')).toBe('mesas');
    expect(homeDeRol('GERENCIA')).toBe('reportes');
    expect(homeDeRol('RECEPCION')).toBe('reservas');
    expect(homeDeRol('SISTEMA')).toBe('usuarios');
  });

  it('devuelve "inicio" para rol desconocido', () => {
    expect(homeDeRol(null)).toBe('inicio');
    expect(homeDeRol(undefined)).toBe('inicio');
    expect(homeDeRol('OTRO')).toBe('inicio');
  });
});

