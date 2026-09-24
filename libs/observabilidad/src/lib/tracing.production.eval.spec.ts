import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Eval de configuración: evita repetir el OOM-loop observado en el VPS
// (176 016 reinicios de Jaeger con el límite anterior de 1 GiB).
const yaml = require('js-yaml') as { load: (text: string) => unknown };
const readYaml = (path: string) => yaml.load(readFileSync(join(process.cwd(), path), 'utf8'));

interface ComposeService {
  image?: string;
  mem_limit?: string;
  environment?: Record<string, string>;
}

describe('eval: presupuesto de trazas en producción', () => {
  it('muestrea en todos los servicios antes de exportar por red', () => {
    const compose = readYaml('infra/docker-compose.prod.yml') as { services: Record<string, ComposeService> };
    const aplicaciones = Object.entries(compose.services)
      .filter(([nombre]) => nombre.startsWith('servicio-'));
    expect(aplicaciones.length).toBe(11);
    for (const [nombre, servicio] of aplicaciones) {
      expect(servicio.environment?.OTEL_TRACES_SAMPLER, nombre).toContain('parentbased_traceidratio');
      expect(servicio.environment?.OTEL_TRACES_SAMPLER_ARG, nombre).toContain('0.1');
    }
  });

  it('limita también el flujo hacia Badger y da memoria de arranque a Jaeger', () => {
    const collector = readYaml('infra/otel-collector/otel-collector-config.yml') as {
      processors: { probabilistic_sampler: { sampling_percentage: number } };
      service: { pipelines: { traces: { processors: string[] } } };
    };
    const compose = readYaml('infra/docker-compose.prod.yml') as { services: Record<string, ComposeService> };

    expect(collector.processors.probabilistic_sampler.sampling_percentage).toBeLessThanOrEqual(10);
    expect(collector.service.pipelines.traces.processors).toContain('probabilistic_sampler');
    expect(compose.services.jaeger.mem_limit).toBe('2g');
    expect(compose.services.jaeger.image).toBe('jaegertracing/all-in-one:1.76.0');
  });
});
