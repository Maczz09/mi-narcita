// scripts/probar-beta-nota-debito.ts — Igual que probar-beta-nota.ts pero
// para NOTA DE DÉBITO (RequestedMonetaryTotal, DebitNoteLine, catálogo 10)
// contra la Factura F001-2 (aceptada 2026-08-12).

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extraerClavesDesdePfx } from '../src/sunat/certificado';
import { firmarComprobante } from '../src/sunat/firma';
import { construirXmlNotaDebito } from '../src/sunat/ubl.builder';
import { SunatSoapClient } from '../src/sunat/sunat-soap.client';

const RUC_EMISOR = '10417758432';
const RAZON_SOCIAL = 'QUISPE MORALES YUSLUNY YANET';

async function main() {
  const pfxPass = process.env['SUNAT_PFX_PASS'];
  const solUsuario = process.env['SUNAT_SOL_USER'];
  const solClave = process.env['SUNAT_SOL_PASS'];
  if (!pfxPass || !solUsuario || !solClave) {
    console.error('Faltan SUNAT_PFX_PASS / SUNAT_SOL_USER / SUNAT_SOL_PASS en el entorno.');
    process.exit(1);
  }

  const pfxPath = join(__dirname, '../../../certificates/salitral-1/certificado.p12');
  console.log(`1) Leyendo certificado: ${pfxPath}`);
  const pfxBuffer = readFileSync(pfxPath);
  const claves = extraerClavesDesdePfx(pfxBuffer, pfxPass);
  console.log('   OK — clave privada y certificado extraídos.');

  console.log('2) Armando UBL 2.1 DebitNote (nota de débito, correlativo 1, contra F001-2)...');
  const { xml: xmlSinFirmar, totales } = construirXmlNotaDebito({
    serie: 'FD01',
    correlativo: 2, // 1 aceptada 2026-08-13 — sube este número antes de correr de nuevo
    fechaEmision: new Date(),
    empresa: { ruc: RUC_EMISOR, razonSocial: RAZON_SOCIAL, direccion: 'Salitral 1' },
    cliente: { tipoDocumento: '6', numeroDocumento: '20123456789', nombreORazonSocial: 'CLIENTE DE PRUEBA SAC' },
    items: [{ descripcion: 'Intereses por mora (prueba)', cantidad: 1, precioUnitarioConIgv: 1 }],
    documentoAfectado: { tipo: 'FACTURA', serie: 'F001', correlativo: 2 },
    motivoCodigo: '01',
    motivoDescripcion: 'Intereses por mora',
  });
  console.log(`   OK — totales: valorVenta=${totales.valorVenta} igv=${totales.igv} total=${totales.total}`);

  console.log('3) Firmando (XMLDSig enveloped, C14N + SHA-1)...');
  const xmlFirmado = firmarComprobante(xmlSinFirmar, claves);
  console.log('   OK — XML firmado.');

  const nombreArchivo = `${RUC_EMISOR}-08-FD01-2`;

  console.log('4) Enviando sendBill (WSDL local + endpoint real de beta)...');
  const sunatWsdlUrl = process.env['SUNAT_WSDL_URL'] ?? 'https://e-beta.sunat.gob.pe/ol-ti-itcpfegem-beta/billService?wsdl';
  process.env['SUNAT_WSDL_URL'] = sunatWsdlUrl;
  const cliente = new SunatSoapClient();
  try {
    const { cdrBase64 } = await cliente.enviarComprobante({
      ruc: RUC_EMISOR,
      solUsuario,
      solClave,
      nombreArchivo,
      xmlFirmado,
    });

    if (cdrBase64) {
      const cdrZip = Buffer.from(cdrBase64, 'base64');
      console.log(`   RESPUESTA RECIBIDA — CDR zip de ${cdrZip.length} bytes.`);
      writeFileSync(join(__dirname, 'cdr-nota-debito-respuesta.zip'), cdrZip);
      console.log('   Escrito en scripts/cdr-nota-debito-respuesta.zip');
    } else {
      console.log('   Respuesta sin applicationResponse — revisar manualmente.');
    }
  } catch (error) {
    console.error('   FALLÓ el envío:');
    console.error((error as Error).message);
    if ((error as { root?: unknown }).root) {
      console.error('   Detalle SOAP:', JSON.stringify((error as { root?: unknown }).root, null, 2));
    }
    process.exit(1);
  }
}

void main();
