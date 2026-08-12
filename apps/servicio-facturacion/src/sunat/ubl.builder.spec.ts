import { construirXmlComprobante } from './ubl.builder';

describe('construirXmlComprobante', () => {
  const base = {
    tipo: 'BOLETA' as const,
    serie: 'B001',
    correlativo: 1,
    fechaEmision: new Date('2026-08-07T12:00:00Z'),
    empresa: { ruc: '20123456789', razonSocial: 'La Barra del Ceviche 1 SAC' },
    cliente: { tipoDocumento: '0' as const, numeroDocumento: '-', nombreORazonSocial: 'Cliente varios' },
    items: [{ descripcion: 'Ceviche mixto', cantidad: 2, precioUnitarioConIgv: 35 }],
  };

  it('deja el slot de firma vacío listo para insertar la firma', () => {
    const { xml } = construirXmlComprobante(base);
    expect(xml).toContain('<ext:ExtensionContent/>');
  });

  it('usa el InvoiceTypeCode correcto por tipo de comprobante', () => {
    expect(construirXmlComprobante(base).xml).toContain('<cbc:InvoiceTypeCode listID="0101">03</cbc:InvoiceTypeCode>');
    expect(construirXmlComprobante({ ...base, tipo: 'FACTURA' }).xml).toContain(
      '<cbc:InvoiceTypeCode listID="0101">01</cbc:InvoiceTypeCode>',
    );
  });

  it('los totales devueltos coinciden exactamente con el XML (misma fuente)', () => {
    const { xml, totales } = construirXmlComprobante(base);
    expect(xml).toContain(`<cbc:PayableAmount currencyID="PEN">${totales.total.toFixed(2)}</cbc:PayableAmount>`);
    expect(totales.total).toBe(70);
  });

  it('rechaza un comprobante sin ítems', () => {
    expect(() => construirXmlComprobante({ ...base, items: [] })).toThrow();
  });

  // Campos confirmados contra beta real de SUNAT (RUC 10417758432, respuesta
  // ACEPTADA): sin AddressTypeCode, SUNAT rechaza con error 3030 ("código de
  // local anexo"); sin PaymentTerms, rechaza con 3244 ("tipo de transacción").
  it('incluye el código de establecimiento (0000 por defecto) en RegistrationAddress', () => {
    const { xml } = construirXmlComprobante(base);
    expect(xml).toContain('<cbc:AddressTypeCode>0000</cbc:AddressTypeCode>');
  });

  it('usa el código de establecimiento de la empresa si se indica uno distinto', () => {
    const { xml } = construirXmlComprobante({
      ...base,
      empresa: { ...base.empresa, codigoEstablecimiento: '0001' },
    });
    expect(xml).toContain('<cbc:AddressTypeCode>0001</cbc:AddressTypeCode>');
  });

  it('incluye el ubigeo de la empresa dentro de RegistrationAddress cuando está disponible', () => {
    const { xml } = construirXmlComprobante({ ...base, empresa: { ...base.empresa, ubigeo: '150101' } });
    expect(xml).toContain('<cac:RegistrationAddress>\n          <cbc:ID>150101</cbc:ID>');
  });

  it('siempre declara la forma de pago como Contado (no hay ventas al crédito)', () => {
    const { xml } = construirXmlComprobante(base);
    expect(xml).toContain('<cac:PaymentTerms>\n    <cbc:ID>FormaPago</cbc:ID>\n    <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>\n  </cac:PaymentTerms>');
  });
});
