import { Injectable, Logger } from '@nestjs/common';
import * as soap from 'soap';
import archiver from 'archiver';
import { PassThrough } from 'node:stream';

export interface EnvioResultado {
  ticket?: string;
  cdrBase64?: string;
}

/**
 * Cliente SOAP para el `billService` de SUNAT (sendBill / sendSummary /
 * getStatus). Operaciones y nombres de parámetro (`fileName`, `contentFile`,
 * `ticket`) confirmados contra la documentación pública del servicio — pero
 * NO se pudieron ejercitar contra el WSDL real: hazlo tú en beta
 * (`SUNAT_WSDL_URL` de homologación) en cuanto tengas certificado y SOL de
 * al menos una empresa, antes de dar esto por definitivo.
 */
@Injectable()
export class SunatSoapClient {
  private readonly logger = new Logger(SunatSoapClient.name);
  private readonly clientesPorRuc = new Map<string, soap.Client>();

  private async obtenerCliente(ruc: string, solUsuario: string, solClave: string): Promise<soap.Client> {
    const existente = this.clientesPorRuc.get(ruc);
    if (existente) return existente;

    const wsdlUrl = process.env['SUNAT_WSDL_URL'];
    if (!wsdlUrl) throw new Error('SUNAT_WSDL_URL no configurado');

    const client = await soap.createClientAsync(wsdlUrl);
    // Usuario SOL de SUNAT: se autentica como RUC + usuarioSOL en el campo
    // Username de WS-Security (convención del servicio, no un estándar WSS).
    client.setSecurity(new soap.WSSecurity(`${ruc}${solUsuario}`, solClave, { hasTimeStamp: false }));
    this.clientesPorRuc.set(ruc, client);
    return client;
  }

  private zipear(nombreArchivo: string, xml: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const stream = new PassThrough();
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);

      const archive = archiver('zip', { zlib: { level: 9 } });
      archive.on('error', reject);
      archive.pipe(stream);
      archive.append(xml, { name: `${nombreArchivo}.xml` });
      void archive.finalize();
    });
  }

  /** sendBill: envío individual (factura, nota, y boleta si no usas resumen). CDR en la misma respuesta. */
  async enviarComprobante(params: {
    ruc: string;
    solUsuario: string;
    solClave: string;
    nombreArchivo: string;
    xmlFirmado: string;
  }): Promise<EnvioResultado> {
    const client = await this.obtenerCliente(params.ruc, params.solUsuario, params.solClave);
    const zip = await this.zipear(params.nombreArchivo, params.xmlFirmado);
    const [result] = (await (client as unknown as { sendBillAsync: (args: unknown) => Promise<unknown[]> }).sendBillAsync({
      fileName: `${params.nombreArchivo}.zip`,
      contentFile: zip,
    })) as [{ applicationResponse?: string } | undefined];
    this.logger.log(`sendBill ${params.nombreArchivo}: respuesta recibida`);
    return { cdrBase64: result?.applicationResponse };
  }

  /** sendSummary: resumen diario de boletas. Devuelve un ticket; el CDR llega después vía getStatus. */
  async enviarResumen(params: {
    ruc: string;
    solUsuario: string;
    solClave: string;
    nombreArchivo: string;
    xmlResumen: string;
  }): Promise<EnvioResultado> {
    const client = await this.obtenerCliente(params.ruc, params.solUsuario, params.solClave);
    const zip = await this.zipear(params.nombreArchivo, params.xmlResumen);
    const [result] = (await (client as unknown as { sendSummaryAsync: (args: unknown) => Promise<unknown[]> }).sendSummaryAsync({
      fileName: `${params.nombreArchivo}.zip`,
      contentFile: zip,
    })) as [{ ticket?: string } | undefined];
    return { ticket: result?.ticket };
  }

  async consultarEstado(params: { ruc: string; solUsuario: string; solClave: string; ticket: string }): Promise<EnvioResultado> {
    const client = await this.obtenerCliente(params.ruc, params.solUsuario, params.solClave);
    const [result] = (await (client as unknown as { getStatusAsync: (args: unknown) => Promise<unknown[]> }).getStatusAsync({
      ticket: params.ticket,
    })) as [{ statusCode?: string; content?: string } | undefined];
    return { cdrBase64: result?.statusCode === '0' ? result?.content : undefined };
  }
}
