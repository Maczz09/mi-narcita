// @vitest-environment jsdom
import { vi } from 'vitest';
// @ts-nocheck
import { renderHook, act } from '@testing-library/react';
import { useComanda } from './useComanda';

describe('useComanda', () => {
  const defaultParams = {
    mesaLock: false,
    initialCanal: 'SALON' as const,
    modoAgregar: false,
    mesas: [{ id: '1', numero: '1', nombre: 'Mesa 1', estado: 'LIBRE', capacidad: 4 }],
    mesasFisicas: [{ id: '1', numero: '1', nombre: 'Mesa 1', estado: 'LIBRE', capacidad: 4 }],
    crear: vi.fn(),
    toast: vi.fn(),
    onClose: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize correctly', () => {
    const { result } = renderHook(() => useComanda(defaultParams as any));
    expect(result.current.canal).toBe('SALON');
    expect(result.current.lines).toEqual([]);
    expect(result.current.subtotal).toBe(0);
  });

  it('should add products to cart', () => {
    const { result } = renderHook(() => useComanda(defaultParams as any));
    
    act(() => {
      result.current.addProducto({ id: 'p1', nombre: 'Pizza', precio: 10 } as any);
    });

    expect(result.current.lines).toHaveLength(1);
    expect(result.current.totalItems).toBe(1);
    expect(result.current.subtotal).toBe(10);
  });

  it('should allow removing products', () => {
    const { result } = renderHook(() => useComanda(defaultParams as any));
    
    act(() => {
      result.current.addProducto({ id: 'p1', nombre: 'Pizza', precio: 10 } as any);
    });
    
    const lineId = result.current.lines[0].producto.id;

    act(() => {
      result.current.delLine(lineId);
    });

    expect(result.current.lines).toHaveLength(0);
  });

  it('should call crear on enviar', async () => {
    const { result } = renderHook(() => useComanda(defaultParams as any));
    
    act(() => {
      result.current.addProducto({ id: 'p1', nombre: 'Pizza', precio: 10 } as any);
    });

    await act(async () => {
      await result.current.enviar();
    });

    expect(defaultParams.crear).toHaveBeenCalled();
    expect(defaultParams.toast).toHaveBeenCalled();
    expect(defaultParams.onClose).toHaveBeenCalled();
  });

  it('should not allow enviar if context is invalid', async () => {
    const params = { ...defaultParams, initialCanal: 'DELIVERY' as const, mesaLock: false };
    const { result } = renderHook(() => useComanda(params as any));
    
    act(() => {
      result.current.addProducto({ id: 'p1', nombre: 'Pizza', precio: 10 } as any);
    });

    expect(result.current.puedeEnviar).toBe(false); // Delivery requires address/client
  });
});

