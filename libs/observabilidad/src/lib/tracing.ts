import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';

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

  // Asegurarnos de apagar el tracer si la app crashea
  process.on('SIGTERM', () => {
    sdk.shutdown()
      // Durante el apagado el logger de la app puede estar cerrandose; stderr sigue disponible.
      .then(() => process.stderr.write('OpenTelemetry SDK finalizado exitosamente\n'))
      .catch((error) => process.stderr.write(`Error finalizando OpenTelemetry SDK: ${String(error)}\n`))
      .finally(() => process.exit(0));
  });

  return sdk;
}
