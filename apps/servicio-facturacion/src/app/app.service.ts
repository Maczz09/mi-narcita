import { BadRequestException, ConflictException, Injectable, Logger } from '@nestjs/common';
import { OperableLog } from '@org/observabilidad';
import { SEDE_PRINCIPAL_ID } from '@org/shared-auth';
import { PrismaService } from '../prisma/prisma.service';
import { CuentaCerradaPayload } from '@org/contracts';
import { CredencialesCryptoService } from '../sunat/credenciales-crypto.service';
import { extraerClavesDesdePfx } from '../sunat/certificado';
import { CrearEmpresaDto } from './dto/crear-empresa.dto';

// Mismo límite que SunatConfigService: el mecanismo de credenciales por
// variables de entorno solo conoce SUNAT_*_EMPRESA_1_* y _2_* — agregar un
// tercer slot exigiría tocar ese fallback también, fuera de alcance acá.
const SLOTS_DISPONIBLES = [1, 2];

@Injectable()
export class AppService {
  private readonly logger = new Logger(AppService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CredencialesCryptoService,
  ) {}

  /**
   * Read-model local del cierre de cuenta (consume cuenta.cerrada), mismo
   * patrón que VentaDiaria en servicio-reportes. Es el "comprobante de pago"
   * que caja/admin ve para elegir qué emitir como boleta o factura SUNAT.
   */
  async registrarComprobantePago(data: CuentaCerradaPayload): Promise<void> {
    this.logger.log({
      operation: 'registrarComprobantePago',
      aggregateId: data.cuentaId,
      message: `Comprobante de pago disponible para mesa ${data.mesaId}, total S/ ${data.total}.`,
    } satisfies OperableLog);

    // T-23 Fase 2: los eventos RMQ no pasan por el ValidationPipe global — un
    // productor legado (rollout en curso) puede publicar sin sedeId.
    if (!data.sedeId) {
      this.logger.warn({
        operation: 'registrarComprobantePago',
        aggregateId: data.cuentaId,
        errorCode: 'EVENTO_SIN_SEDE',
        message: 'Evento CuentaCerrada sin sedeId; se asigna Sede Principal.',
      } satisfies OperableLog);
    }
    const sedeId = data.sedeId ?? SEDE_PRINCIPAL_ID;

    await this.prisma.comprobantePago.upsert({
      where: { cuentaId: data.cuentaId },
      create: {
        cuentaId: data.cuentaId,
        sedeId,
        mesaId: data.mesaId,
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
        meseroId: data.meseroId ?? null,
        meseroNombre: data.meseroNombre ?? null,
      },
      // Si ya está EMITIDO no se toca el total/items (el comprobante SUNAT ya
      // se firmó con esos datos); solo se actualiza mientras sigue DISPONIBLE.
      // Tampoco se rescribe sedeId: una re-entrega no debe reasignar la sede.
      update: {
        total: data.total,
        items: data.items ? structuredClone(data.items) : [],
      },
    });
  }

  /**
   * T-23 Fase 2 — LENIENTE (mismo criterio que reportes/identidad): usuario
   * pineado → siempre su sede; admin general → la que pida, o TODAS (sin
   * pantalla en pwa-cliente hoy que use el filtro, pero la API ya lo soporta).
   */
  async listarDisponibles(usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = usuarioSedeId ?? sedeIdSolicitado;
    return this.prisma.comprobantePago.findMany({
      where: { estado: 'DISPONIBLE', ...(sedeId ? { sedeId } : {}) },
      orderBy: { fecha: 'desc' },
      take: 200,
    });
  }

  async listarTodos(usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = usuarioSedeId ?? sedeIdSolicitado;
    return this.prisma.comprobantePago.findMany({
      where: { ...(sedeId ? { sedeId } : {}) },
      orderBy: { fecha: 'desc' },
      take: 200,
      // Se anida la empresa emisora (no todo el registro: correlativoBoleta/
      // correlativoFactura son contadores internos, no deben viajar al front)
      // porque la impresión del comprobante SUNAT (ver ComprobanteTicket.tsx
      // en pwa-cliente) necesita razón social/RUC/dirección del emisor.
      include: {
        comprobante: {
          include: {
            empresa: { select: { ruc: true, razonSocial: true, nombreComercial: true, direccion: true } },
          },
        },
      },
    });
  }

  /**
   * Notas de crédito/débito emitidas — no viven bajo un ComprobantePago
   * (nacen de OTRO Comprobante vía comprobanteAfectadoId), así que no
   * aparecen en listarTodos(). El sedeId se resuelve viajando por el
   * comprobante afectado hasta su comprobantePago (las notas no tienen
   * sedeId propio).
   */
  async listarNotas(usuarioSedeId?: string | null, sedeIdSolicitado?: string) {
    const sedeId = usuarioSedeId ?? sedeIdSolicitado;
    return this.prisma.comprobante.findMany({
      where: {
        tipo: { in: ['NOTA_CREDITO', 'NOTA_DEBITO'] },
        ...(sedeId ? { comprobanteAfectado: { comprobantePago: { sedeId } } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        comprobanteAfectado: { select: { tipo: true, serie: true, correlativo: true } },
      },
    });
  }

  // Selector de RUC emisor al emitir: hoy solo hay una empresa activa
  // (Salitral 1), pero no se hardcodea el RUC en el frontend — cuando se
  // configure la segunda, aparece sola en este listado.
  async listarEmpresas() {
    return this.prisma.empresa.findMany({
      where: { activo: true },
      select: { id: true, slot: true, ruc: true, razonSocial: true, activo: true },
      orderBy: { slot: 'asc' },
    });
  }

  /**
   * Alta de una empresa emisora vía el formulario "Configurar SUNAT" de
   * Facturación — la alternativa a sembrarla a mano con prisma studio +
   * secretos de infraestructura (ver CONTEXTO.md). Valida el .p12 con su
   * contraseña ANTES de guardar nada (extraerClavesDesdePfx explota si el
   * archivo no es un PKCS#12 válido o la contraseña es incorrecta) — mejor
   * fallar acá con un mensaje claro que descubrirlo en el cron de envío.
   */
  async crearEmpresa(dto: CrearEmpresaDto, certificadoPfx: Buffer) {
    if (!this.crypto.configurada()) {
      throw new BadRequestException(
        'FACTURACION_CRED_ENCRYPTION_KEY no está configurada en el servidor; no se pueden guardar credenciales de forma segura.',
      );
    }
    if (!certificadoPfx || certificadoPfx.length === 0) {
      throw new BadRequestException('Sube el certificado digital (.p12/.pfx) de la empresa');
    }

    const existente = await this.prisma.empresa.findUnique({ where: { ruc: dto.ruc } });
    if (existente) {
      throw new ConflictException(`Ya existe una empresa configurada con el RUC ${dto.ruc}`);
    }

    const ocupados = await this.prisma.empresa.findMany({ select: { slot: true } });
    const slot = SLOTS_DISPONIBLES.find((s) => !ocupados.some((o) => o.slot === s));
    if (!slot) {
      throw new ConflictException('Ya hay 2 empresas configuradas; no se admite una tercera por ahora.');
    }

    try {
      extraerClavesDesdePfx(certificadoPfx, dto.certificadoPass);
    } catch (error) {
      throw new BadRequestException(
        `El certificado o su contraseña no son válidos: ${(error as Error).message}`,
      );
    }

    const empresa = await this.prisma.empresa.create({
      data: {
        slot,
        ruc: dto.ruc,
        razonSocial: dto.razonSocial,
        nombreComercial: dto.nombreComercial ?? null,
        direccion: dto.direccion ?? null,
        ubigeo: dto.ubigeo ?? null,
        codigoEstablecimiento: dto.codigoEstablecimiento ?? '0000',
        solUsuario: dto.solUsuario,
        solClaveCifrada: this.crypto.encriptarTexto(dto.solClave),
        // Prisma tipa Bytes como Uint8Array<ArrayBuffer>, más estricto que
        // Buffer<ArrayBufferLike> — new Uint8Array(buffer) copia a un
        // ArrayBuffer propio y no compartido, satisface el tipo.
        certificadoPfxCifrado: new Uint8Array(this.crypto.encriptar(certificadoPfx)),
        certificadoPassCifrada: this.crypto.encriptarTexto(dto.certificadoPass),
      },
      select: { id: true, slot: true, ruc: true, razonSocial: true, activo: true },
    });

    this.logger.log({
      operation: 'crearEmpresa',
      aggregateId: empresa.id,
      resultingState: 'CONFIGURADA',
      message: `Empresa ${dto.razonSocial} (RUC ${dto.ruc}) configurada en slot ${slot} vía formulario.`,
    } satisfies OperableLog);

    return empresa;
  }
}
