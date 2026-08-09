import { Injectable } from '@nestjs/common';
import { readFileSync } from 'node:fs';

export interface CredencialesSunat {
  pfxBuffer: Buffer;
  pfxPass: string;
  solUsuario: string;
  solClave: string;
}

/**
 * Lee las credenciales SUNAT (certificado .pfx + SOL) de una de las dos
 * empresas desde variables de entorno, por convención de "slot" (1 o 2 —
 * ver Empresa.slot). Mientras el cajero/admin no haya tramitado el
 * certificado de una empresa, `credencialesParaSlot` lanza un error claro en
 * vez de dejar caer todo el servicio: emitir() y EnvioProcessor lo capturan
 * y devuelven "no configurado" sin tumbar el resto de comprobantes.
 */
@Injectable()
export class SunatConfigService {
  /**
   * Cada valor admite dos formas: `<VAR>` en claro (dev) o `<VAR>_FILE`
   * apuntando a un Docker secret (prod — ver
   * infra/docker-compose.secrets.yml). Mismo idiom que `<VAR>_FILE` en
   * infra/entrypoint.sh, pero autocontenido aquí: no hace falta tocar el
   * entrypoint compartido por los otros 10 servicios para sumar estas 6 vars.
   */
  private leerSecreto(nombreVar: string): string | undefined {
    const archivo = process.env[`${nombreVar}_FILE`];
    if (archivo) {
      try {
        return readFileSync(archivo, 'utf8').trim();
      } catch (error) {
        throw new Error(`No se pudo leer ${nombreVar}_FILE (${archivo}): ${(error as Error).message}`);
      }
    }
    return process.env[nombreVar];
  }

  credencialesParaSlot(slot: number): CredencialesSunat {
    const pfxFile = process.env[`SUNAT_PFX_EMPRESA_${slot}_FILE`];
    const pfxPass = this.leerSecreto(`SUNAT_PFX_EMPRESA_${slot}_PASS`);
    const solUsuario = this.leerSecreto(`SUNAT_SOL_USER_EMPRESA_${slot}`);
    const solClave = this.leerSecreto(`SUNAT_SOL_PASS_EMPRESA_${slot}`);

    const faltantes = [
      !pfxFile && `SUNAT_PFX_EMPRESA_${slot}_FILE`,
      !pfxPass && `SUNAT_PFX_EMPRESA_${slot}_PASS`,
      !solUsuario && `SUNAT_SOL_USER_EMPRESA_${slot}`,
      !solClave && `SUNAT_SOL_PASS_EMPRESA_${slot}`,
    ].filter(Boolean);

    if (faltantes.length > 0) {
      throw new Error(`Credenciales SUNAT no configuradas para la empresa (slot ${slot}). Faltan: ${faltantes.join(', ')}`);
    }

    let pfxBuffer: Buffer;
    try {
      pfxBuffer = readFileSync(pfxFile as string);
    } catch (error) {
      throw new Error(`No se pudo leer el certificado SUNAT (slot ${slot}) en ${pfxFile}: ${(error as Error).message}`);
    }

    return { pfxBuffer, pfxPass: pfxPass as string, solUsuario: solUsuario as string, solClave: solClave as string };
  }

  tieneCredenciales(slot: number): boolean {
    try {
      this.credencialesParaSlot(slot);
      return true;
    } catch {
      return false;
    }
  }
}
