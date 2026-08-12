// api/facturacion.api.ts — Emisión de boletas/facturas electrónicas (SUNAT)

import { client } from './client';
import type {
  ComprobantePagoDto,
  EmpresaDto,
  EmitirComprobantePayload,
  EmitirComprobanteResultado,
} from '../types/facturacion.types';

export async function listarDisponibles(sedeId?: string): Promise<ComprobantePagoDto[]> {
  const qs = sedeId ? `?sedeId=${encodeURIComponent(sedeId)}` : '';
  const response = await client.get<ComprobantePagoDto[]>(`/facturacion/comprobantes-pago${qs}`);
  return Array.isArray(response) ? response : [];
}

export async function listarTodos(sedeId?: string): Promise<ComprobantePagoDto[]> {
  const qs = sedeId ? `?sedeId=${encodeURIComponent(sedeId)}` : '';
  const response = await client.get<ComprobantePagoDto[]>(`/facturacion/comprobantes-pago/todos${qs}`);
  return Array.isArray(response) ? response : [];
}

export async function listarEmpresas(): Promise<EmpresaDto[]> {
  const response = await client.get<EmpresaDto[]>('/facturacion/empresas');
  return Array.isArray(response) ? response : [];
}

export async function emitir(cuentaId: string, payload: EmitirComprobantePayload): Promise<EmitirComprobanteResultado> {
  return client.post<EmitirComprobanteResultado>(`/facturacion/comprobantes/${cuentaId}/emitir`, payload);
}
