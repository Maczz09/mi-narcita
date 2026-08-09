import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type TipoComprobanteSimple = 'BOLETA' | 'FACTURA';

@Injectable()
export class CorrelativoService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Incremento atómico del correlativo de una empresa+tipo. SUNAT exige
   * numeración estrictamente secuencial sin huecos no declarados; un
   * `UPDATE ... RETURNING` evita la carrera leer-luego-escribir bajo cobros
   * concurrentes (equivalente al `SELECT ... FOR UPDATE SKIP LOCKED` del
   * outbox, pero aquí basta un UPDATE de una fila).
   */
  async siguiente(empresaId: string, tipo: TipoComprobanteSimple): Promise<{ serie: string; correlativo: number }> {
    const columna = tipo === 'BOLETA' ? 'correlativoBoleta' : 'correlativoFactura';
    const serieColumna = tipo === 'BOLETA' ? 'serieBoleta' : 'serieFactura';
    const rows = await this.prisma.$queryRawUnsafe<{ correlativo: number; serie: string }[]>(
      `UPDATE "empresas" SET "${columna}" = "${columna}" + 1
       WHERE id = $1
       RETURNING "${columna}" AS correlativo, "${serieColumna}" AS serie`,
      empresaId,
    );
    const row = rows[0];
    if (!row) throw new Error(`Empresa ${empresaId} no encontrada al asignar correlativo`);
    return { serie: row.serie, correlativo: Number(row.correlativo) };
  }
}
