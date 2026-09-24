import { client } from './client';

export type Station = 'COCINA' | 'BAR' | 'COMPROBANTES';
export interface PrintDestination {
  id: string;
  sedeId: string;
  station: Station;
  transport: 'USB' | 'NETWORK';
  printerName: string | null;
  host: string | null;
  port: number | null;
  paperWidth: 58 | 80;
  copies: number;
  enabled: boolean;
}
export type DestinationForm = Omit<PrintDestination, 'id' | 'sedeId' | 'station'>;
export interface PrintJobSummary {
  id: string;
  station: Station;
  status: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export const impresionApi = {
  destinations: () => client.get<PrintDestination[]>('/notificaciones/impresion/destinos'),
  save: (station: Station, form: DestinationForm) => client.patch<PrintDestination>(`/notificaciones/impresion/destinos/${station}`, form),
  jobs: () => client.get<PrintJobSummary[]>('/notificaciones/impresion/trabajos'),
  retry: (id: string) => client.post(`/notificaciones/impresion/trabajos/${encodeURIComponent(id)}/reintentar`),
};
