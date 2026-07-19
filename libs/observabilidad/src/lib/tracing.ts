import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

// SDK activo del proceso. `initTracing` corre ANTES de crear Nest, así que el
// apagado del tracer no puede vivir en un provider; se guarda aquí y lo drena
// `shutdownTracing()` desde el apagado graceful del bootstrap (después de que
// `app.close()` haya vaciado HTTP + RMQ). No registramos aquí un handler de
// señal con `process.exit`: competía con el drenaje de Nest (quien acabara
// primero mataba el proceso, cortando requests/mensajes en vuelo).
let activeSdk: NodeSDK | undefined;

export function initTracing(serviceName: string): NodeSDK {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318';
  const traceExporter = new OTLPTraceExporter({
    url: `${endpoint.replace(/\/$/, '')}/v1/traces`,
  });

  const sdk = new NodeSDK({
    serviceName,
    traceExporter,
    instrumentations: [getNodeAutoInstrumentations()],
  });

  sdk.start();
  activeSdk = sdk;

  return sdk;
}

/**
 * Vacía y cierra el SDK de OpenTelemetry. Idempotente: la segunda llamada es un
 * no-op. Lo invoca el apagado graceful del bootstrap tras drenar la app; nunca
 * llama a `process.exit` (de eso se encarga el orquestador de apagado).
 */
export async function shutdownTracing(): Promise<void> {
  const sdk = activeSdk;
  if (!sdk) return;
  activeSdk = undefined;
  try {
    await sdk.shutdown();
    // Durante el apagado el logger de la app puede estar cerrándose; stderr sigue disponible.
    process.stderr.write('OpenTelemetry SDK finalizado exitosamente\n');
  } catch (error) {
    process.stderr.write(`Error finalizando OpenTelemetry SDK: ${String(error)}\n`);
  }
}
