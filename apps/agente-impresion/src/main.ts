import type { PrinterJobDto } from '@org/contracts';
import { loadConfig } from './config';
import { printJob } from './printer';

const config = loadConfig();
let stopped = false;
process.on('SIGINT', () => { stopped = true; });
process.on('SIGTERM', () => { stopped = true; });

async function api(path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${config.serverUrl}/agente-impresion${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'x-print-agent-key': config.key, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`API impresión: HTTP ${response.status}`);
  return response.json();
}

async function run(): Promise<void> {
  console.log(`Agente de impresión iniciado: ${config.agentId}`);
  while (!stopped) {
    try {
      const job = await api(`/next?agentId=${encodeURIComponent(config.agentId)}`) as PrinterJobDto | null;
      if (job) {
        let ok = false;
        let error: string | undefined;
        try {
          await printJob(job);
          ok = true;
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
          console.error(`Impresión ${job.id} falló: ${error}`);
        }
        // Anotar el resultado antes de tomar otro trabajo. Si se pierde el ACK,
        // se reintenta el ACK, nunca se vuelve a imprimir aquí.
        while (!stopped) {
          try {
            await api(`/${encodeURIComponent(job.id)}/ack`, { agentId: config.agentId, leaseToken: job.leaseToken, ok, error });
            console.log(`Impresión ${job.id}: ${ok ? 'enviada' : 'pendiente de reintento'}`);
            break;
          } catch (err) {
            console.error(`ACK ${job.id}: ${err instanceof Error ? err.message : String(err)}`);
            if (err instanceof Error && err.message.includes('HTTP 409')) break;
            await pause(3000);
          }
        }
      }
    } catch (err) {
      console.error(`Consulta de impresión: ${err instanceof Error ? err.message : String(err)}`);
    }
    if (!stopped) await pause(config.pollMs);
  }
}

function pause(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

void run();
