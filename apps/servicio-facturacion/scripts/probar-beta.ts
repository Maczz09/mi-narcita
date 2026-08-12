// scripts/probar-beta.ts — Prueba manual, fuera del stack NestJS/Docker: arma
// una FACTURA de prueba para Salitral 1 (RUC 10417758432), la firma con el
// certificado real y la envía al ambiente BETA de SUNAT vía sendBill.
//
// Objetivo (fase 1 del plan): validar que SUNAT acepta lo que generamos antes
// de construir nada más encima. Corre con:
//   cd apps/servicio-facturacion
//   SUNAT_PFX_PASS=... SUNAT_SOL_USER=... SUNAT_SOL_PASS=... npx tsx scripts/probar-beta.ts
//
// No toca la base de datos ni el correlativo real (usa uno fijo de prueba) —
// no está pensado para dejarse corriendo dentro del servicio.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { extraerClavesDesdePfx } from '../src/sunat/certificado';
import { firmarComprobante } from '../src/sunat/firma';
import { construirXmlComprobante } from '../src/sunat/ubl.builder';
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

  console.log('2) Armando XML UBL 2.1 (Factura de prueba, correlativo 1)...');
  const { xml: xmlSinFirmar, totales } = construirXmlComprobante({
    tipo: 'FACTURA',
    serie: 'F001',
    correlativo: 1,
    fechaEmision: new Date(),
    empresa: { ruc: RUC_EMISOR, razonSocial: RAZON_SOCIAL, direccion: 'Salitral 1' },
    cliente: { tipoDocumento: '6', numeroDocumento: '20123456789', nombreORazonSocial: 'CLIENTE DE PRUEBA SAC' },
    items: [{ descripcion: 'Prueba de integracion SUNAT beta', cantidad: 1, precioUnitarioConIgv: 10 }],
  });
  console.log(`   OK — totales: valorVenta=${totales.valorVenta} igv=${totales.igv} total=${totales.total}`);

  console.log('3) Firmando (XMLDSig enveloped, C14N + SHA-1)...');
  const xmlFirmado = firmarComprobante(xmlSinFirmar, claves);
  console.log('   OK — XML firmado.');
  console.log(xmlFirmado);

  const nombreArchivo = `${RUC_EMISOR}-01-F001-1`;

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
      console.log(`   RESPUESTA RECIBIDA — CDR zip de ${cdrZip.length} bytes (base64 decodificado).`);
      console.log('   Guárdalo y desempaquétalo para leer el ResponseCode del CDR.');
      writeFileSync(join(__dirname, 'cdr-respuesta.zip'), cdrZip);
      console.log('   Escrito en scripts/cdr-respuesta.zip');
    } else {
      console.log('   Respuesta sin applicationResponse — revisar manualmente.');
    }
  } catch (error) {
    console.error('   FALLÓ el envío:');
    console.error(error);
    if ((error as { root?: unknown }).root) {
      console.error('   Detalle SOAP:', JSON.stringify((error as { root?: unknown }).root, null, 2));
    }
    process.exit(1);
  }
}

void main();
