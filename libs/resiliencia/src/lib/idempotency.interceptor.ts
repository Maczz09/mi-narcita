import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Observable, from, lastValueFrom } from 'rxjs';

/**
 * Idempotencia HTTP en mutaciones críticas (plan 1.3).
 *
 * Si la petición POST trae el header `Idempotency-Key`, persistimos la clave y la
 * respuesta. Un reintento/doble-click con la misma clave devuelve la respuesta
 * cacheada (mismo recurso, misma respuesta) en lugar de crear un duplicado.
 *
 * El store es agnóstico del cliente Prisma concreto: cada servicio inyecta su
 * PrismaService (que expone el modelo `idempotencyKey`) bajo el token IDEMPOTENCY_DB.
 */
export const IDEMPOTENCY_DB = Symbol('IDEMPOTENCY_DB');

export interface IdempotencyRecord {
  key: string;
  statusCode?: number | null;
  body?: string | null;
  completedAt?: Date | null;
  createdAt?: Date | null;
  requestHash?: string | null;
}

export interface IdempotencyDb {
  idempotencyKey: {
    findUnique(args: { where: { key: string } }): Promise<IdempotencyRecord | null>;
    create(args: { data: { key: string; method?: string; path?: string; requestHash?: string } }): Promise<unknown>;
    update(args: { where: { key: string }; data: Record<string, unknown> }): Promise<unknown>;
    delete(args: { where: { key: string } }): Promise<unknown>;
  };
}

const IN_PROGRESS_MSG = 'Ya hay una solicitud en curso con esta Idempotency-Key';
// T-14: misma clave + payload distinto = uso indebido del cliente (comportamiento tipo Stripe).
const BODY_MISMATCH_MSG = 'La Idempotency-Key ya se usó con un cuerpo de petición distinto';
// H-1: un proceso muerto entre el claim y la respuesta deja la clave reclamada
// pero sin completar; sin TTL el cliente recibiría 409 hasta que la fila expira
// (7 días). Pasado este umbral, un claim incompleto se considera huérfano.
const CLAIM_TTL_MS = 60_000;

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(IDEMPOTENCY_DB) private readonly db: IdempotencyDb) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ method: string; url: string; headers: Record<string, string | string[] | undefined>; route?: { path: string }; body?: unknown }>();
    if (req.method !== 'POST') return next.handle();

    const headerKey = req.headers['idempotency-key'];
    if (!headerKey || typeof headerKey !== 'string') return next.handle();

    const res = context.switchToHttp().getResponse<{ statusCode?: number; status: (code: number) => unknown }>();
    const routePath = req.route?.path ?? req.url;
    const key = `http:${req.method}:${routePath}:${headerKey}`;
    const requestHash = createHash('sha256')
      .update(req.body == null ? '' : JSON.stringify(req.body))
      .digest('hex');

    return from(this.handle(next, key, req.method, String(routePath), requestHash, res));
  }

  private replayExistingResponse(
    existing: IdempotencyRecord,
    requestHash: string,
    res: { statusCode?: number; status: (code: number) => unknown },
  ): unknown {
    // T-14: misma clave con un body distinto al original → 422 (no replay silencioso).
    if (existing.requestHash != null && existing.requestHash !== requestHash) {
      throw new UnprocessableEntityException(BODY_MISMATCH_MSG);
    }
    if (existing.completedAt && existing.statusCode != null) {
      res.status(existing.statusCode);
      return existing.body == null ? undefined : JSON.parse(existing.body);
    }
    // Registro reclamado pero aún sin completar → duplicado concurrente.
    throw new ConflictException(IN_PROGRESS_MSG);
  }

  private async claimKey(key: string, method: string, path: string, requestHash: string): Promise<void> {
    // Reclama la clave de forma atómica (el índice único resuelve la carrera).
    try {
      await this.db.idempotencyKey.create({ data: { key, method, path, requestHash } });
    } catch (e: unknown) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(IN_PROGRESS_MSG);
      }
      throw e;
    }
  }

  private async executeAndPersist(
    next: CallHandler,
    key: string,
    res: { statusCode?: number; status: (code: number) => unknown },
  ): Promise<unknown> {
    try {
      const result = (await lastValueFrom(next.handle())) as unknown;
      // En POST el status real (201) lo fija Nest tras el interceptor; aquí solo
      // está el 200 por defecto, así que normalizamos a 201 para el replay.
      const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 201;
      await this.db.idempotencyKey.update({
        where: { key },
        data: { statusCode, body: JSON.stringify(result ?? null), completedAt: new Date() },
      });
      return result;
    } catch (err) {
      // Falló: liberamos la clave para que un reintento legítimo pueda proceder.
      await this.db.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
      throw err;
    }
  }

  // H-1: claim reclamado pero nunca completado por un proceso caído, más viejo que
  // CLAIM_TTL_MS. El "en curso reciente" (createdAt dentro del TTL, o sin createdAt)
  // NO es huérfano y sigue devolviendo 409.
  private esClaimHuerfano(existing: IdempotencyRecord): boolean {
    return (
      !existing.completedAt &&
      existing.createdAt != null &&
      existing.createdAt.getTime() < Date.now() - CLAIM_TTL_MS
    );
  }

  private async handle(
    next: CallHandler,
    key: string,
    method: string,
    path: string,
    requestHash: string,
    res: { statusCode?: number; status: (code: number) => unknown },
  ): Promise<unknown> {
    const existing = await this.db.idempotencyKey.findUnique({ where: { key } });
    if (existing) {
      // Claim huérfano: se libera (tolerando carrera con .catch) y se re-reclama.
      if (this.esClaimHuerfano(existing)) {
        await this.db.idempotencyKey.delete({ where: { key } }).catch(() => undefined);
      } else {
        return this.replayExistingResponse(existing, requestHash, res);
      }
    }
    await this.claimKey(key, method, path, requestHash);
    return this.executeAndPersist(next, key, res);
  }
}
