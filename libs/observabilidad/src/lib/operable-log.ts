/**
 * Campos canónicos de un "log operable" (sesión 29: de texto suelto a evidencia).
 *
 * Un log útil es estructurado, buscable y correlacionable. Este tipo fija los
 * NOMBRES de campo para que los 9 servicios no diverjan (`orderId` en uno,
 * `pedidoId` en otro): así soporte puede buscar por el mismo campo en Loki
 * (`| json | aggregateId="..."`) sin importar el servicio.
 *
 * Se pasa como primer argumento a `logger.warn/error/log(...)`: nest-winston
 * serializa cada propiedad TOP-LEVEL en el JSON (verificado en runtime), por lo
 * que quedan queryables individualmente. `correlationId`, `trace_id`, `span_id`,
 * `service`, `timestamp` y `level` los inyecta el pipeline de Winston
 * (`otelTraceFormat` + Nest) → NO los repitas aquí.
 *
 * Seguridad (regla dura de la sesión 29 — "observar no es exponer"): nunca
 * incluir tokens, contraseñas, datos de tarjeta, secretos, PII ni el body crudo
 * de una dependencia. Clasifica con `errorCode`/`message`, no con el payload.
 *
 * La interfaz es CERRADA a propósito: un campo ad-hoc en un solo servicio es la
 * deriva que este tipo previene. Si un id secundario importa (p. ej. la
 * transacción de un pago), va en `message`; el campo canónico de búsqueda es
 * `aggregateId`.
 */
export interface OperableLog {
  /** Acción de negocio/técnica, p. ej. 'authorizePayment', 'cerrarCuenta'. */
  operation: string;
  /** Texto humano para la decisión operativa (sin datos sensibles). */
  message: string;
  /** Id de negocio para reconstruir el caso: cuentaId, mesaId, pedidoId... */
  aggregateId?: string;
  /** Dependencia externa involucrada (nombre canónico = label de métrica). */
  dependency?: string;
  /** Latencia real de la operación en ms (medida, no el valor del timeout). */
  durationMs?: number;
  /** Código de error clasificado, p. ej. 'DEPENDENCY_TIMEOUT'. */
  errorCode?: string;
  /** Nº de reintentos ejecutados (0 = solo el intento inicial). */
  retryAttempt?: number;
  /** Estado del circuito al momento del log. */
  circuitBreakerState?: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
  /** Estado en que quedó el agregado tras la operación (solo si se persiste). */
  resultingState?: string;
  /** Id de evento publicado/consumido, si aplica. */
  eventId?: string;
  /** Clave de idempotencia, si aplica. */
  idempotencyKey?: string;
}
