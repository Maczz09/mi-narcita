/**
 * NachoPps — Población de datos de prueba
 *
 * SOLO DESARROLLO. Usa credenciales debiles a proposito (admin `nachopps123`)
 * y datos demo. NUNCA ejecutar contra un VPS/host publico ni datos reales.
 *
 * Uso: npx tsx scripts/poblar-datos.ts
 * Requiere: Stack Docker corriendo (levantar-todo.ps1)
 *
 * Crea: 6 categorías, ~25 productos, 12 mesas
 * Vía: Kong API Gateway en BASE_URL/NACHOPPS_BASE_URL o http://localhost:8000
 */

import axios from 'axios';

const BASE = process.env.NACHOPPS_BASE_URL || process.env.BASE_URL || 'http://localhost:8000';
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'kong']);

interface ApiResponse<T = any> {
  message?: string;
  [key: string]: any;
}

interface Categoria {
  id: string;
  nombre: string;
  descripcion?: string;
}

interface Producto {
  id: string;
  categoriaId: string;
  nombre: string;
  precio: number;
  stockActual?: number;
}

interface Mesa {
  id: string;
  numero: number;
  capacidad: number;
  ubicacion: string;
  estado: string;
}

interface Ubicacion {
  id: string;
  nombre: string;
}

async function login(): Promise<string> {
  console.log('🔐 Iniciando sesión como admin@nachopps.pe...');
  const res = await axios.post(`${BASE}/identidad/auth/login`, {
    email: 'admin@nachopps.pe',
    password: 'nachopps123',
  });
  const token = res.data.access_token;
  if (!token) throw new Error('No se recibió token JWT');
  console.log('   ✅ Token obtenido');
  return token;
}

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function crearCategoria(
  token: string,
  nombre: string,
  descripcion?: string,
): Promise<Categoria> {
  const res = await axios.post<ApiResponse>(
    `${BASE}/inventario/categorias`,
    { nombre, descripcion },
    { headers: authHeaders(token) },
  );
  return res.data.categoria;
}

async function crearProducto(
  token: string,
  data: {
    categoriaId: string;
    nombre: string;
    precio: number;
    stockActual?: number;
    descripcion?: string;
  },
): Promise<Producto> {
  const res = await axios.post<ApiResponse>(
    `${BASE}/inventario/productos`,
    data,
    { headers: authHeaders(token) },
  );
  return res.data.producto;
}

/** Ubicaciones son un CRUD propio (find-or-create): busca por nombre y si no existe la crea. */
async function asegurarUbicacion(token: string, nombre: string): Promise<Ubicacion> {
  const res = await axios.get<ApiResponse>(`${BASE}/mesas/ubicaciones`, { headers: authHeaders(token) });
  const existentes: Ubicacion[] = res.data.ubicaciones || res.data || [];
  const encontrada = existentes.find((u) => u.nombre === nombre);
  if (encontrada) return encontrada;

  try {
    const creada = await axios.post<ApiResponse>(
      `${BASE}/mesas/ubicaciones`,
      { nombre },
      { headers: authHeaders(token) },
    );
    return creada.data.ubicacion;
  } catch (err: any) {
    if (err.response?.status === 409) {
      const retry = await axios.get<ApiResponse>(`${BASE}/mesas/ubicaciones`, { headers: authHeaders(token) });
      const lista: Ubicacion[] = retry.data.ubicaciones || retry.data || [];
      const found = lista.find((u) => u.nombre === nombre);
      if (found) return found;
    }
    throw err;
  }
}

async function crearMesa(
  token: string,
  numero: number,
  capacidad: number,
  ubicacionNombre: string = 'Salón Principal',
): Promise<Mesa> {
  const ubicacion = await asegurarUbicacion(token, ubicacionNombre);
  const res = await axios.post<ApiResponse>(
    `${BASE}/mesas`,
    { numero, capacidad, ubicacionId: ubicacion.id },
    { headers: authHeaders(token) },
  );
  return res.data.mesa;
}

async function main() {
  assertDevOnlyTarget();

  console.log('═══════════════════════════════════════════');
  console.log('  NachoPps — Población de Datos de Prueba');
  console.log('═══════════════════════════════════════════\n');

  const token = await login();

  // ── Categorías ────────────────────────────────────
  console.log('\n📦 Creando categorías...');
  const categoriasData = [
    { nombre: 'Entradas', descripcion: 'Platos de entrada fríos y calientes' },
    { nombre: 'Platos de Fondo', descripcion: 'Platos principales de la carta' },
    { nombre: 'Parrillas', descripcion: 'Carnes y parrillas a la brasa' },
    { nombre: 'Bebidas', descripcion: 'Bebidas sin alcohol' },
    { nombre: 'Cócteles', descripcion: 'Cócteles y bebidas con alcohol' },
    { nombre: 'Postres', descripcion: 'Postres artesanales' },
  ];

  const categorias: Record<string, Categoria> = {};
  for (const c of categoriasData) {
    try {
      categorias[c.nombre] = await crearCategoria(token, c.nombre, c.descripcion);
      console.log(`   ✅ Categoría: ${c.nombre}`);
    } catch (err: any) {
      if (err.response?.status === 409) {
        console.log(`   ⚠️  Categoría "${c.nombre}" ya existe`);
        // Buscar la categoría existente
        const res = await axios.get(`${BASE}/inventario/categorias`, { headers: authHeaders(token) });
        const cats = res.data || res.data.categorias || [];
        const found = cats.find((cat: any) => cat.nombre === c.nombre);
        if (found) categorias[c.nombre] = found;
      } else {
        throw err;
      }
    }
  }

  // ── Productos ─────────────────────────────────────
  console.log('\n🍽️  Creando productos...');
  const productos: Producto[] = [];

  // Platos preparados (a la orden) → SIN stock → módulo Carta / Menú.
  // Productos contables / embotellados → CON stock → módulo Inventario.
  const productosData: Array<{ cat: string; nombre: string; precio: number; stock?: number }> = [
    { cat: 'Entradas', nombre: 'Ceviche Clásico', precio: 35 },
    { cat: 'Entradas', nombre: 'Tiradito de Pescado', precio: 28 },
    { cat: 'Entradas', nombre: 'Causa Limeña', precio: 22 },
    { cat: 'Entradas', nombre: 'Anticuchos', precio: 18 },
    { cat: 'Entradas', nombre: 'Tequeños', precio: 15 },
    { cat: 'Platos de Fondo', nombre: 'Lomo Saltado', precio: 42 },
    { cat: 'Platos de Fondo', nombre: 'Ají de Gallina', precio: 38 },
    { cat: 'Platos de Fondo', nombre: 'Arroz Chaufa', precio: 32 },
    { cat: 'Platos de Fondo', nombre: 'Tallarines Verdes', precio: 30 },
    { cat: 'Parrillas', nombre: 'Parrilla Mixta', precio: 65 },
    { cat: 'Parrillas', nombre: 'Anticucho de Corazón', precio: 25 },
    { cat: 'Parrillas', nombre: 'Chorizo Parrillero', precio: 28 },
    { cat: 'Bebidas', nombre: 'Inca Kola', precio: 8, stock: 200 },
    { cat: 'Bebidas', nombre: 'Coca Cola', precio: 8, stock: 200 },
    { cat: 'Bebidas', nombre: 'Agua Mineral', precio: 5, stock: 150 },
    { cat: 'Bebidas', nombre: 'Limonada Frozen', precio: 12, stock: 100 },
    { cat: 'Bebidas', nombre: 'Chicha Morada', precio: 10, stock: 120 },
    { cat: 'Cócteles', nombre: 'Pisco Sour', precio: 25, stock: 80 },
    { cat: 'Cócteles', nombre: 'Chilcano de Pisco', precio: 22, stock: 70 },
    { cat: 'Cócteles', nombre: 'Maracuyá Sour', precio: 24, stock: 70 },
    { cat: 'Cócteles', nombre: 'Mojito Clásico', precio: 28, stock: 60 },
    { cat: 'Postres', nombre: 'Suspiro Limeño', precio: 18 },
    { cat: 'Postres', nombre: 'Picarones', precio: 16 },
    { cat: 'Postres', nombre: 'Tres Leches', precio: 20 },
    { cat: 'Postres', nombre: 'Crema Volteada', precio: 15 },
  ];

  for (const p of productosData) {
    try {
      const prod = await crearProducto(token, {
        categoriaId: categorias[p.cat].id,
        nombre: p.nombre,
        precio: p.precio,
        ...(p.stock != null ? { stockActual: p.stock } : {}),
      });
      productos.push(prod);
      console.log(`   ✅ ${p.cat} → ${p.nombre} (S/ ${p.precio}${p.stock != null ? `, stock: ${p.stock}` : ', carta'})`);
    } catch (err: any) {
      if (err.response?.status === 409 || (err.response?.status === 400 && err.response?.data?.message?.includes('existe'))) {
        console.log(`   ⚠️  ${p.nombre} ya existe`);
        const res = await axios.get(`${BASE}/inventario/productos`, { headers: authHeaders(token) });
        const prods = res.data.productos || res.data || [];
        const found = prods.find((prod: any) => prod.nombre === p.nombre);
        if (found) productos.push(found);
      } else {
        throw err;
      }
    }
  }

  // ── Mesas ─────────────────────────────────────────
  console.log('\n🪑  Creando mesas...');
  const mesas: Mesa[] = [];

  for (let i = 1; i <= 10; i++) {
    const capacidad = [2, 2, 4, 4, 4, 6, 6, 2, 4, 6][i - 1];
    try {
      const mesa = await crearMesa(token, i, capacidad);
      mesas.push(mesa);
      console.log(`   ✅ Mesa #${i} — capacidad ${capacidad} — ${mesa.ubicacion}`);
    } catch (err: any) {
      if (err.response?.status === 409) {
        console.log(`   ⚠️  Mesa #${i} ya existe`);
        const res = await axios.get(`${BASE}/mesas`, { headers: authHeaders(token) });
        const mesasArr = Array.isArray(res.data) ? res.data : res.data.mesas || [];
        const found = mesasArr.find((m: any) => m.numero === i);
        if (found) mesas.push(found);
      } else {
        throw err;
      }
    }
  }

  for (let i = 11; i <= 12; i++) {
    try {
      const mesa = await crearMesa(token, i, 8, 'Terraza');
      mesas.push(mesa);
      console.log(`   ✅ Mesa #${i} — capacidad 8 — Terraza (VIP)`);
    } catch (err: any) {
      if (err.response?.status === 409) {
        console.log(`   ⚠️  Mesa #${i} ya existe`);
        const res = await axios.get(`${BASE}/mesas`, { headers: authHeaders(token) });
        const mesasArr = Array.isArray(res.data) ? res.data : res.data.mesas || [];
        const found = mesasArr.find((m: any) => m.numero === i);
        if (found) mesas.push(found);
      } else {
        throw err;
      }
    }
  }

  // Mesas virtuales para Delivery (#99) y Para Llevar (#98)
  try {
    const mesaDelivery = await crearMesa(token, 99, 999, 'Virtual Delivery');
    mesas.push(mesaDelivery);
    console.log(`   ✅ Mesa #99 — capacidad 999 — Delivery (Virtual)`);
  } catch (err: any) {
    if (err.response?.status === 409) {
      console.log(`   ⚠️  Mesa #99 ya existe`);
      const res = await axios.get(`${BASE}/mesas`, { headers: authHeaders(token) });
      const mesasArr = Array.isArray(res.data) ? res.data : res.data.mesas || [];
      const found = mesasArr.find((m: any) => m.numero === 99);
      if (found) mesas.push(found);
    } else {
      throw err;
    }
  }

  try {
    const mesaLlevar = await crearMesa(token, 98, 999, 'Virtual Llevar');
    mesas.push(mesaLlevar);
    console.log(`   ✅ Mesa #98 — capacidad 999 — Para Llevar (Virtual)`);
  } catch (err: any) {
    if (err.response?.status === 409) {
      console.log(`   ⚠️  Mesa #98 ya existe`);
      const res = await axios.get(`${BASE}/mesas`, { headers: authHeaders(token) });
      const mesasArr = Array.isArray(res.data) ? res.data : res.data.mesas || [];
      const found = mesasArr.find((m: any) => m.numero === 98);
      if (found) mesas.push(found);
    } else {
      throw err;
    }
  }


  // ── Resumen ───────────────────────────────────────
  console.log('\n═══════════════════════════════════════════');
  console.log('  📊 Resumen de Población');
  console.log('═══════════════════════════════════════════');
  console.log(`  Categorías creadas:  ${categoriasData.length}`);
  console.log(`  Productos creados:   ${productos.length}`);
  console.log(`  Mesas creadas:       ${mesas.length}`);
  console.log('═══════════════════════════════════════════\n');
}

function assertDevOnlyTarget() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed demo bloqueado: NODE_ENV=production');
  }

  const url = new URL(BASE);
  if (!DEV_HOSTS.has(url.hostname) && !url.hostname.endsWith('.local')) {
    throw new Error(`Seed demo bloqueado: ${BASE} no parece un endpoint local/dev`);
  }
}

main().catch((err) => {
  console.error('\n❌ Error durante la población:', err.response?.data || err.message);
  process.exit(1);
});
