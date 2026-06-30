// @ts-nocheck
import axios from 'axios';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

/**
 * P-51 (T-31): integración real de cambiarRol contra Postgres.
 *
 * Existe para que el bug-clase "SQL inválido oculto por mocks" no reaparezca:
 * la protección "no degradar al último ADMIN" usa FOR UPDATE y solo un test
 * contra Postgres real valida que la query es aceptada y serializa.
 *
 * El spec es autocontenido: crea sus propios admins, degrada los admins
 * preexistentes para controlar el conteo y restaura todo en afterAll.
 */

const http = axios.create({
  baseURL: axios.defaults.baseURL,
  headers: axios.defaults.headers.common,
  validateStatus: () => true,
});

interface UsuarioDto {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

async function listarAdminsActivos(): Promise<UsuarioDto[]> {
  const admins: UsuarioDto[] = [];
  let cursor: string | null = null;
  do {
    const res = (await http.get('/api/usuarios', {
      params: { rol: 'ADMIN', limit: 100, ...(cursor ? { cursor } : {}) },
    })) as unknown as { status: number; data: { data: UsuarioDto[]; nextCursor: string | null } };
    expect(res.status).toBe(200);
    admins.push(...res.data.data);
    cursor = res.data.nextCursor;
  } while (cursor);
  return admins;
}

async function crearAdmin(tag: string): Promise<UsuarioDto> {
  const res = (await http.post('/api/usuarios', {
    nombre: `E2E Admin ${tag}`,
    email: `e2e-t31-${tag}-${Date.now()}@test.com`,
    password: 'Password#123',
    rol: 'ADMIN',
  })) as unknown as { status: number; data: UsuarioDto };
  expect(res.status).toBe(201);
  return res.data;
}

function cambiarRol(id: string, rol: string) {
  return http.patch(`/api/usuarios/${id}/rol`, { rol }) as unknown as Promise<{ status: number; data: { rol: string } }>;
}

describe('PATCH /api/usuarios/:id/rol — degradación de ADMIN (T-31 / P-51)', () => {
  let preexistentes: UsuarioDto[] = [];
  let adminA: UsuarioDto;
  let adminB: UsuarioDto;

  beforeAll(async () => {
    adminA = await crearAdmin('a');
    adminB = await crearAdmin('b');
    // Degradar los admins preexistentes para controlar exactamente el conteo
    // (quedan solo A y B). Se restauran en afterAll.
    const actuales = await listarAdminsActivos();
    preexistentes = actuales.filter((u) => u.id !== adminA.id && u.id !== adminB.id);
    for (const admin of preexistentes) {
      const res = await cambiarRol(admin.id, 'MESERO');
      expect(res.status).toBe(200);
    }
  });

  afterAll(async () => {
    // Restaurar el estado: re-promover los preexistentes y degradar los del test.
    for (const admin of preexistentes) {
      await cambiarRol(admin.id, 'ADMIN');
    }
    for (const creado of [adminA, adminB]) {
      if (creado) await cambiarRol(creado.id, 'MESERO');
    }
  });

  it('(a) degrada un ADMIN cuando hay 2 → 200', async () => {
    const adminC = await crearAdmin('c');
    const res = await cambiarRol(adminC.id, 'MESERO');
    expect(res.status).toBe(200);
    expect(res.data.rol).toBe('MESERO');
  });

  it('(c) dos degradaciones concurrentes del penúltimo y último → exactamente una gana', async () => {
    // Estado controlado: solo A y B son admins activos.
    const [resA, resB] = await Promise.all([
      cambiarRol(adminA.id, 'MESERO'),
      cambiarRol(adminB.id, 'MESERO'),
    ]);
    const codigos = [resA.status, resB.status].sort();
    expect(codigos).toEqual([200, 409]);

    const adminsRestantes = await listarAdminsActivos();
    expect(adminsRestantes).toHaveLength(1);
  });

  it('(b) degradar al último ADMIN activo → 409', async () => {
    const [ultimo] = await listarAdminsActivos();
    expect(ultimo).toBeDefined();
    const res = await cambiarRol(ultimo.id, 'MESERO');
    expect(res.status).toBe(409);
  });
});
