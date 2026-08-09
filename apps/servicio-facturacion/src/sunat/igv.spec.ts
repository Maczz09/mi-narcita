import { desglosarIgv, redondear2, TASA_IGV } from './igv';

describe('desglosarIgv', () => {
  it('desglosa un total con IGV incluido en valorVenta + IGV', () => {
    const resultado = desglosarIgv(118);
    expect(resultado.valorVenta).toBeCloseTo(100, 2);
    expect(resultado.igv).toBeCloseTo(18, 2);
    expect(resultado.total).toBe(118);
  });

  it('valorVenta + igv reconstruye el total exacto (sin drift de redondeo)', () => {
    const totales = [10.5, 23.9, 99.99, 150, 7.33];
    for (const total of totales) {
      const { valorVenta, igv } = desglosarIgv(total);
      expect(redondear2(valorVenta + igv)).toBe(redondear2(total));
    }
  });

  it('usa la tasa vigente de 18%', () => {
    expect(TASA_IGV).toBe(0.18);
  });
});
