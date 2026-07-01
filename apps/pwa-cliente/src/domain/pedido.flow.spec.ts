// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  canalFromModalidad,
  CANAL_LABEL,
  CANAL_CLS,
  ETAPAS_PRODUCCION,
  ESTADOS_PRODUCCION,
  FLOW_PEDIDO,
  NEXT_ITEM,
  PREV_ITEM,
  nextEstadoComercial,
  nextLabelComercial,
  derivarEstadoProduccion,
  urgClass,
  slaRatio,
  SLA_MIN,
  PERMITIR_OVERRIDE_PRODUCCION,
} from './pedido.flow';

// ─── canalFromModalidad ───────────────────────────────────────────────────────

describe('canalFromModalidad', () => {
  it('retorna SALON por defecto cuando no se pasa nada', () => {
    expect(canalFromModalidad()).toBe('SALON');
    expect(canalFromModalidad(undefined)).toBe('SALON');
  });

  it('retorna SALON para la modalidad "SALON" (case-insensitive)', () => {
    expect(canalFromModalidad('SALON')).toBe('SALON');
    expect(canalFromModalidad('salon')).toBe('SALON');
  });

  it('retorna DELIVERY para la modalidad "DELIVERY"', () => {
    expect(canalFromModalidad('DELIVERY')).toBe('DELIVERY');
    expect(canalFromModalidad('delivery')).toBe('DELIVERY');
  });

  it('retorna LLEVAR para la modalidad "LLEVAR"', () => {
    expect(canalFromModalidad('LLEVAR')).toBe('LLEVAR');
    expect(canalFromModalidad('llevar')).toBe('LLEVAR');
  });

  it('retorna SALON para modalidades desconocidas', () => {
    expect(canalFromModalidad('DESCONOCIDO')).toBe('SALON');
    expect(canalFromModalidad('')).toBe('SALON');
  });
});

// ─── Labels y clases ──────────────────────────────────────────────────────────

describe('CANAL_LABEL', () => {
  it('tiene labels en español para cada canal', () => {
    expect(CANAL_LABEL.SALON).toBe('Salón');
    expect(CANAL_LABEL.DELIVERY).toBe('Delivery');
    expect(CANAL_LABEL.LLEVAR).toBe('Llevar');
  });
});

describe('CANAL_CLS', () => {
  it('tiene clases CSS para cada canal', () => {
    expect(typeof CANAL_CLS.SALON).toBe('string');
    expect(typeof CANAL_CLS.DELIVERY).toBe('string');
    expect(typeof CANAL_CLS.LLEVAR).toBe('string');
  });
});

// ─── Etapas y estados ─────────────────────────────────────────────────────────

describe('ETAPAS_PRODUCCION', () => {
  it('tiene 3 etapas en orden correcto', () => {
    const estados = ETAPAS_PRODUCCION.map((e) => e.estado);
    expect(estados).toEqual(['PENDIENTE', 'EN_PREPARACION', 'LISTO']);
  });

  it('cada etapa tiene label y color', () => {
    for (const etapa of ETAPAS_PRODUCCION) {
      expect(typeof etapa.label).toBe('string');
      expect(typeof etapa.color).toBe('string');
    }
  });
});

describe('ESTADOS_PRODUCCION', () => {
  it('contiene PENDIENTE, EN_PREPARACION y LISTO', () => {
    expect(ESTADOS_PRODUCCION.has('PENDIENTE')).toBe(true);
    expect(ESTADOS_PRODUCCION.has('EN_PREPARACION')).toBe(true);
    expect(ESTADOS_PRODUCCION.has('LISTO')).toBe(true);
  });

  it('NO contiene ENTREGADO (estado comercial, no de producción)', () => {
    expect((ESTADOS_PRODUCCION as ReadonlySet<string>).has('ENTREGADO')).toBe(false);
  });
});

describe('FLOW_PEDIDO', () => {
  it('incluye ENTREGADO en el flujo comercial', () => {
    const estados = FLOW_PEDIDO.map((f) => f.estado);
    expect(estados).toContain('ENTREGADO');
  });

  it('tiene 4 estados en orden PENDIENTE→EN_PREPARACION→LISTO→ENTREGADO', () => {
    const estados = FLOW_PEDIDO.map((f) => f.estado);
    expect(estados).toEqual(['PENDIENTE', 'EN_PREPARACION', 'LISTO', 'ENTREGADO']);
  });
});

// ─── Flujo de ítem ────────────────────────────────────────────────────────────

describe('NEXT_ITEM', () => {
  it('PENDIENTE avanza a EN_PREPARACION', () => {
    expect(NEXT_ITEM.PENDIENTE).toBe('EN_PREPARACION');
  });

  it('EN_PREPARACION avanza a LISTO', () => {
    expect(NEXT_ITEM.EN_PREPARACION).toBe('LISTO');
  });

  it('LISTO no tiene siguiente (cocina no avanza más)', () => {
    expect(NEXT_ITEM.LISTO).toBeUndefined();
  });
});

describe('PREV_ITEM', () => {
  it('LISTO retrocede a EN_PREPARACION', () => {
    expect(PREV_ITEM.LISTO).toBe('EN_PREPARACION');
  });

  it('EN_PREPARACION retrocede a PENDIENTE', () => {
    expect(PREV_ITEM.EN_PREPARACION).toBe('PENDIENTE');
  });
});

// ─── nextEstadoComercial ──────────────────────────────────────────────────────

describe('nextEstadoComercial', () => {
  it('LISTO puede avanzar a ENTREGADO', () => {
    expect(nextEstadoComercial('LISTO')).toBe('ENTREGADO');
  });

  it('estados distintos de LISTO devuelven null', () => {
    expect(nextEstadoComercial('PENDIENTE')).toBeNull();
    expect(nextEstadoComercial('EN_PREPARACION')).toBeNull();
    expect(nextEstadoComercial('ENTREGADO')).toBeNull();
  });
});

// ─── nextLabelComercial ───────────────────────────────────────────────────────

describe('nextLabelComercial', () => {
  it('LISTO + SALON → "Entregar"', () => {
    expect(nextLabelComercial('LISTO', 'SALON')).toBe('Entregar');
  });

  it('LISTO + DELIVERY → "Despachar"', () => {
    expect(nextLabelComercial('LISTO', 'DELIVERY')).toBe('Despachar');
  });

  it('LISTO + LLEVAR → "Despachar"', () => {
    expect(nextLabelComercial('LISTO', 'LLEVAR')).toBe('Despachar');
  });

  it('cualquier estado distinto de LISTO devuelve null', () => {
    expect(nextLabelComercial('PENDIENTE', 'SALON')).toBeNull();
    expect(nextLabelComercial('EN_PREPARACION', 'DELIVERY')).toBeNull();
    expect(nextLabelComercial('ENTREGADO', 'SALON')).toBeNull();
  });
});

// ─── derivarEstadoProduccion ──────────────────────────────────────────────────

describe('derivarEstadoProduccion', () => {
  it('retorna null cuando no hay ítems', () => {
    expect(derivarEstadoProduccion([])).toBeNull();
  });

  it('todos PENDIENTE → PENDIENTE', () => {
    expect(derivarEstadoProduccion(['PENDIENTE', 'PENDIENTE'])).toBe('PENDIENTE');
  });

  it('al menos uno EN_PREPARACION → EN_PREPARACION', () => {
    expect(derivarEstadoProduccion(['PENDIENTE', 'EN_PREPARACION'])).toBe('EN_PREPARACION');
  });

  it('al menos uno LISTO y resto PENDIENTE → EN_PREPARACION', () => {
    expect(derivarEstadoProduccion(['PENDIENTE', 'LISTO'])).toBe('EN_PREPARACION');
  });

  it('todos LISTO → LISTO', () => {
    expect(derivarEstadoProduccion(['LISTO', 'LISTO'])).toBe('LISTO');
  });

  it('todos ENTREGADO → LISTO (tratados como finalizados)', () => {
    expect(derivarEstadoProduccion(['ENTREGADO', 'ENTREGADO'])).toBe('LISTO');
  });

  it('mix LISTO + ENTREGADO → LISTO', () => {
    expect(derivarEstadoProduccion(['LISTO', 'ENTREGADO'])).toBe('LISTO');
  });

  it('un solo ítem PENDIENTE → PENDIENTE', () => {
    expect(derivarEstadoProduccion(['PENDIENTE'])).toBe('PENDIENTE');
  });
});

// ─── SLA y urgencia ───────────────────────────────────────────────────────────

describe('SLA', () => {
  it('SLA_MIN es 15 (umbral del negocio)', () => {
    expect(SLA_MIN).toBe(15);
  });

  it('slaRatio calcula correctamente', () => {
    expect(slaRatio(0)).toBe(0);
    expect(slaRatio(15)).toBe(1);
    expect(slaRatio(7.5)).toBeCloseTo(0.5);
  });

  it('urgClass fresh cuando ratio < 0.7', () => {
    expect(urgClass(0)).toBe('fresh');
    expect(urgClass(0.5)).toBe('fresh');
    expect(urgClass(0.69)).toBe('fresh');
  });

  it('urgClass warn cuando 0.7 <= ratio < 1', () => {
    expect(urgClass(0.7)).toBe('warn');
    expect(urgClass(0.99)).toBe('warn');
  });

  it('urgClass late cuando ratio >= 1', () => {
    expect(urgClass(1)).toBe('late');
    expect(urgClass(2)).toBe('late');
  });
});

// ─── Constantes ───────────────────────────────────────────────────────────────

describe('PERMITIR_OVERRIDE_PRODUCCION', () => {
  it('está desactivado por defecto (cocina manda)', () => {
    expect(PERMITIR_OVERRIDE_PRODUCCION).toBe(false);
  });
});

