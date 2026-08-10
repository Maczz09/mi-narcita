// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { precomprimirComprobante } from './imagenComprobante';

function stubCanvas() {
  const canvases: HTMLCanvasElement[] = [];
  const original = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, opts?: unknown) => {
    const el = original(tag, opts as never);
    if (tag === 'canvas') canvases.push(el as HTMLCanvasElement);
    return el;
  });
  return canvases;
}

describe('precomprimirComprobante', () => {
  let mockToBlob: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() }) as never;
    mockToBlob = vi.fn((cb: (b: Blob | null) => void) => cb(new Blob(['comprimido'], { type: 'image/webp' })));
    HTMLCanvasElement.prototype.toBlob = mockToBlob as never;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reduce el lado máximo a 1600px manteniendo el aspect ratio', async () => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 4000, height: 3000, close: vi.fn() });
    const canvases = stubCanvas();

    const archivo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    await precomprimirComprobante(archivo);

    expect(canvases[0].width).toBe(1600);
    expect(canvases[0].height).toBe(1200);
  });

  it('no agranda una imagen ya más pequeña que el lado máximo', async () => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 300, height: 200, close: vi.fn() });
    const canvases = stubCanvas();

    const archivo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    await precomprimirComprobante(archivo);

    expect(canvases[0].width).toBe(300);
    expect(canvases[0].height).toBe(200);
  });

  it('codifica a WebP con calidad 0.72', async () => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 800, height: 600, close: vi.fn() });
    stubCanvas();

    const archivo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const resultado = await precomprimirComprobante(archivo);

    expect(mockToBlob).toHaveBeenCalledWith(expect.any(Function), 'image/webp', 0.72);
    expect(resultado.type).toBe('image/webp');
  });

  it('cae al archivo original si el canvas no da contexto 2D', async () => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 800, height: 600, close: vi.fn() });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as never;

    const archivo = new File(['x'], 'foto.jpg', { type: 'image/jpeg' });
    const resultado = await precomprimirComprobante(archivo);

    expect(resultado).toBe(archivo);
  });
});
