// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { descargarComprobantePdf } from './comprobantePdf';

const mockAddImage = vi.fn();
const mockSave = vi.fn();
const mockJsPDFCtor = vi.fn();

vi.mock('jspdf', () => ({
  default: class MockJsPDF {
    constructor(...args: unknown[]) {
      mockJsPDFCtor(...args);
    }
    addImage = mockAddImage;
    save = mockSave;
  },
}));

describe('descargarComprobantePdf', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 400, height: 300, close: vi.fn() });
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({ drawImage: vi.fn() }) as never;
    HTMLCanvasElement.prototype.toDataURL = vi.fn().mockReturnValue('data:image/jpeg;base64,xyz');
  });

  // H4 (hallazgo del plan): jsPDF.processWEBP decodifica en JS puro y
  // recomprime a JPEG q=100 — pasar 'WEBP' a addImage produciría un PDF 3-5×
  // más pesado. Esta aserción blinda que SIEMPRE se transcodifica a JPEG en
  // el canvas antes y se pasa 'JPEG' (processJPEG guarda los bytes verbatim).
  it('transcodifica a JPEG en el canvas y pasa "JPEG" a addImage, nunca "WEBP"', async () => {
    const blob = new Blob(['fake-webp-bytes'], { type: 'image/webp' });
    await descargarComprobantePdf(blob, 'comprobante-abc');

    expect(mockAddImage).toHaveBeenCalledWith('data:image/jpeg;base64,xyz', 'JPEG', 0, 0, 400, 300);
    expect(mockAddImage).not.toHaveBeenCalledWith(expect.anything(), 'WEBP', expect.anything(), expect.anything(), expect.anything(), expect.anything());
  });

  it('dimensiona la página del PDF al tamaño exacto de la imagen (sin márgenes de A4)', async () => {
    const blob = new Blob(['fake-webp-bytes']);
    await descargarComprobantePdf(blob, 'comprobante-abc');

    expect(mockJsPDFCtor).toHaveBeenCalledWith(
      expect.objectContaining({ unit: 'px', format: [400, 300], orientation: 'landscape' }),
    );
  });

  it('usa orientación portrait cuando la imagen es más alta que ancha', async () => {
    (globalThis as unknown as { createImageBitmap: unknown }).createImageBitmap = vi
      .fn()
      .mockResolvedValue({ width: 300, height: 500, close: vi.fn() });

    const blob = new Blob(['fake-webp-bytes']);
    await descargarComprobantePdf(blob, 'comprobante-vertical');

    expect(mockJsPDFCtor).toHaveBeenCalledWith(expect.objectContaining({ orientation: 'portrait', format: [300, 500] }));
  });

  it('agrega la extensión .pdf si el nombre no la trae', async () => {
    const blob = new Blob(['fake-webp-bytes']);
    await descargarComprobantePdf(blob, 'comprobante-abc');
    expect(mockSave).toHaveBeenCalledWith('comprobante-abc.pdf');
  });

  it('no duplica la extensión .pdf si ya viene incluida', async () => {
    const blob = new Blob(['fake-webp-bytes']);
    await descargarComprobantePdf(blob, 'comprobante-abc.pdf');
    expect(mockSave).toHaveBeenCalledWith('comprobante-abc.pdf');
  });

  it('lanza un error legible si el canvas no da contexto 2D', async () => {
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue(null) as never;
    const blob = new Blob(['fake-webp-bytes']);
    await expect(descargarComprobantePdf(blob, 'x')).rejects.toThrow('lienzo');
  });
});
