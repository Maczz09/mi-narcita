/**
 * Mi Narcita — Carga de la carta real del restaurante (Salitral 1)
 *
 * Carga la carta real transcrita de las fotos del menú físico ("Restaurant
 * Cevichería Mi Narcita", Carretera Panamericana Salitral - Querecotillo) en
 * categorías/productos de servicio-inventario. Para platos con Porción
 * Personal/Mediana/Familiar (PP/PM/PF), se crea un Producto por tamaño — el
 * schema de Producto tiene un solo precio, no variantes nativas (ver notas
 * de la sesión 2026-08-13). Las categorías ya vienen con su `area`
 * (COCINA/BARRA/INVENTARIO — ver TODAS_LAS_CATEGORIAS) según el esquema
 * Carta/Inventario/Barra vigente.
 *
 * Cerveza/Gaseosas/Agua Mineral se crean como Producto (con stockActual, así
 * aparecen en el módulo Inventario, no en Carta suelta) Y como Insumo en
 * servicio-compras con productoId apuntando al Producto — así el dueño puede
 * llevar el stock real por compras/mermas. stockActual arranca en 0 a
 * propósito: el stock inicial lo carga el dueño, no se inventa acá.
 *
 * Por defecto SOLO corre contra un host local/dev (ver assertDevOnlyTarget) —
 * es intencional, para que nadie reseedee producción sin querer con un
 * NACHOPPS_BASE_URL mal puesto. Para el sembrado real en la VPS (una sola
 * vez, ver docs/guia-despliegue-vps-contabo.md paso 9.1), pasa explícitamente
 * ALLOW_PRODUCTION_SEED=yes.
 *
 * Uso (dev):  npx tsx scripts/poblar-carta-real.ts
 * Uso (prod): ALLOW_PRODUCTION_SEED=yes NACHOPPS_BASE_URL=https://tu-dominio/v1 \
 *             ADMIN_EMAIL=... ADMIN_PASSWORD=... SEDE_ID=... npx tsx scripts/poblar-carta-real.ts
 * Requiere: admin con password real de ese entorno (pásala por ADMIN_PASSWORD).
 */

import axios from 'axios';

const BASE = process.env.NACHOPPS_BASE_URL || process.env.BASE_URL || 'http://localhost:8000';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@nachopps.pe';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'nachopps123';
// El admin de este entorno administra varias sedes — sin esto, la API 400
// ("indica la sede") porque no hay una sola sede implícita para asumir.
const SEDE_ID = process.env.SEDE_ID || '';
const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '::1', 'kong']);
// Opt-in explícito para el único caso legítimo de correr esto fuera de
// dev: el sembrado inicial de producción en la VPS.
const ALLOW_PRODUCTION_SEED = process.env.ALLOW_PRODUCTION_SEED === 'yes';

interface Categoria { id: string; nombre: string; descripcion?: string; area?: string }
interface Producto { id: string; categoriaId: string; nombre: string; precio: number; stockActual?: number }
interface Insumo { id: string; nombre: string }

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}

async function login(): Promise<string> {
  console.log(`🔐 Iniciando sesión como ${ADMIN_EMAIL}...`);
  const res = await axios.post(`${BASE}/identidad/auth/login`, { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  const token = res.data.access_token;
  if (!token) throw new Error('No se recibió token JWT');
  console.log('   ✅ Token obtenido');
  return token;
}

const sedeQs = SEDE_ID ? `?sedeId=${SEDE_ID}` : '';

async function crearCategoria(token: string, nombre: string, descripcion?: string, area?: string): Promise<Categoria> {
  try {
    const res = await axios.post(`${BASE}/inventario/categorias${sedeQs}`, { nombre, descripcion, area }, { headers: authHeaders(token) });
    console.log(`   ✅ Categoría: ${nombre}`);
    return res.data.categoria;
  } catch (err: any) {
    if (err.response?.status === 409) {
      console.log(`   ⚠️  Categoría "${nombre}" ya existe`);
      const res = await axios.get(`${BASE}/inventario/categorias${sedeQs}`, { headers: authHeaders(token) });
      const cats = res.data.categorias || res.data || [];
      const found = cats.find((c: any) => c.nombre === nombre);
      if (found) return found;
    }
    throw err;
  }
}

async function crearProducto(
  token: string,
  data: { categoriaId: string; nombre: string; precio: number; stockActual?: number; descripcion?: string },
): Promise<Producto> {
  try {
    const res = await axios.post(`${BASE}/inventario/productos${sedeQs}`, data, { headers: authHeaders(token) });
    return res.data.producto;
  } catch (err: any) {
    if (err.response?.status === 409 || (err.response?.status === 400 && err.response?.data?.message?.includes('existe'))) {
      const res = await axios.get(`${BASE}/inventario/productos${sedeQs}`, { headers: authHeaders(token) });
      const prods = res.data.productos || res.data || [];
      const found = prods.find((p: any) => p.nombre === data.nombre);
      if (found) return found;
    }
    throw err;
  }
}

async function crearInsumo(
  token: string,
  data: { nombre: string; unidad: string; productoId?: string; stockActual?: number; stockMinimo?: number },
): Promise<Insumo> {
  try {
    const res = await axios.post(`${BASE}/compras/insumos${sedeQs}`, data, { headers: authHeaders(token) });
    return res.data.insumo;
  } catch (err: any) {
    if (err.response?.status === 409) {
      console.log(`   ⚠️  Insumo "${data.nombre}" ya existe`);
      return { id: '', nombre: data.nombre };
    }
    throw err;
  }
}

// ── Platos con Porción Personal/Mediana/Familiar (P.P./P.M./P.F.) ─────────
// [PP, PM, PF] — null = ese tamaño no se ofrece para ese plato (tal como
// viene impreso en la carta; no se completan números que no están).
interface PlatoVariante { cat: string; nombre: string; precios: [number | null, number | null, number | null] }

const PLATOS_VARIANTES: PlatoVariante[] = [
  // Ceviches
  { cat: 'Ceviches', nombre: 'Ceviche de Filete', precios: [30, 35, 40] },
  { cat: 'Ceviches', nombre: 'Ceviche de Caballa', precios: [30, 35, 40] },
  { cat: 'Ceviches', nombre: 'Ceviche de Mariscos', precios: [35, 40, 45] },
  { cat: 'Ceviches', nombre: 'Ceviche de Filete + Mariscos', precios: [35, 40, 45] },
  { cat: 'Ceviches', nombre: 'Ceviche de Filete + Caballa', precios: [30, 35, 40] },
  { cat: 'Ceviches', nombre: 'Ceviche de Conchas Negras', precios: [30, 35, 40] },
  { cat: 'Ceviches', nombre: 'Ceviche de Filete + Conchas Negras', precios: [null, 35, 45] },
  { cat: 'Ceviches', nombre: 'Ceviche de Mero', precios: [null, 60, 70] },
  { cat: 'Ceviches', nombre: 'Ceviche de Cabrillón', precios: [55, 65, 75] },
  { cat: 'Ceviches', nombre: 'Ceviche de Cabrillón + Conchas', precios: [55, 65, 75] },
  { cat: 'Ceviches', nombre: 'Ceviche Triple (Caballa + Filete y Mariscos)', precios: [50, 55, 60] },
  { cat: 'Ceviches', nombre: 'Ceviche Triple (Caballa + Conchas Negras y Mariscos)', precios: [50, 55, 60] },

  // Sudados
  { cat: 'Sudados', nombre: 'Sudado de Mero', precios: [null, 60, 70] },
  { cat: 'Sudados', nombre: 'Sudado de Cabrillón', precios: [55, 60, 70] },
  { cat: 'Sudados', nombre: 'Sudado de Cabezas de Mero y Cabrillón', precios: [50, 55, 60] },

  // Parihuelas
  { cat: 'Parihuelas', nombre: 'Parihuela de Mero', precios: [null, 60, 70] },
  { cat: 'Parihuelas', nombre: 'Parihuela de Cabrillón', precios: [55, 60, 70] },

  // Festival de Carnes
  { cat: 'Festival de Carnes', nombre: 'Chancho, Carne Aliñada, Chorizo y Chifles', precios: [null, 50, 60] },

  // Especiales
  { cat: 'Especiales', nombre: 'Leche de Tigre', precios: [12, 15, 20] },
  { cat: 'Especiales', nombre: 'Leche de Tigre Fría', precios: [null, 15, 20] },
  { cat: 'Especiales', nombre: 'Chupe de Cangrejo', precios: [25, 30, 40] },
  { cat: 'Especiales', nombre: 'Chaufa de Mariscos', precios: [30, 35, 40] },
  { cat: 'Especiales', nombre: 'Arroz con Conchas', precios: [30, 35, 40] },
  { cat: 'Especiales', nombre: 'Arroz con Mariscos', precios: [30, 35, 40] },

  // Chicharrones
  { cat: 'Chicharrones', nombre: 'Chicharrón de Pescado', precios: [30, 35, 40] },
  { cat: 'Chicharrones', nombre: 'Chicharrón Mixto', precios: [30, 35, 40] },
  { cat: 'Chicharrones', nombre: 'Chicharrón en Salsa de Mariscos', precios: [40, 45, 50] },

  // Dúos Marinos
  { cat: 'Dúos Marinos', nombre: 'Chicharrón + Ceviche', precios: [35, 40, 45] },
  { cat: 'Dúos Marinos', nombre: 'Ceviche + Arroz con Mariscos', precios: [35, 40, 45] },
  { cat: 'Dúos Marinos', nombre: 'Chicharrón + Arroz con Mariscos', precios: [35, 40, 45] },

  // Dúos Criollos
  { cat: 'Dúos Criollos', nombre: 'Seco de Chavelo + Chancho', precios: [45, 55, 60] },
  { cat: 'Dúos Criollos', nombre: 'Majado de Yuca + Chancho', precios: [45, 55, 60] },
  { cat: 'Dúos Criollos', nombre: 'Patacones + Chancho', precios: [45, 55, 60] },
  { cat: 'Dúos Criollos', nombre: 'Carne Seca + Chifles', precios: [45, 55, 60] },

  // Rondas (la carta repite el encabezado "Dúos Criollos" para este grupo,
  // pero los platos son "Ronda X" — se separan en su propia categoría para
  // no tener dos categorías con el mismo nombre y contenido distinto)
  { cat: 'Rondas', nombre: 'Ronda Criolla', precios: [50, 60, 70] },
  { cat: 'Rondas', nombre: 'Ronda Marina', precios: [50, 60, 70] },
  { cat: 'Rondas', nombre: 'Ronda Mar y Tierra', precios: [null, 60, 70] },
  { cat: 'Rondas', nombre: 'Ronda Amazónica', precios: [null, 60, 70] },
  { cat: 'Rondas', nombre: 'Tacacho con Cecina', precios: [30, 35, 40] },

  // Jaleas
  { cat: 'Jaleas', nombre: 'Jalea de Cachemas', precios: [30, 35, 40] },
  { cat: 'Jaleas', nombre: 'Jalea de Cabrillón', precios: [55, 60, 70] },
  { cat: 'Jaleas', nombre: 'Jalea de Mero', precios: [null, 60, 70] },

  // Pasados por Agua Caliente
  { cat: 'Pasados por Agua Caliente', nombre: 'Caballa en Agua Caliente', precios: [30, 35, null] },
  { cat: 'Pasados por Agua Caliente', nombre: 'Cabrillón en Agua Caliente', precios: [55, 60, 70] },
  { cat: 'Pasados por Agua Caliente', nombre: 'Mero en Agua Caliente', precios: [null, 60, 70] },
];

const SUFIJO_TAMANO = ['Personal', 'Mediana', 'Familiar'] as const;

// ── Platos y bebidas de precio único (sin PP/PM/PF) ────────────────────────
const ITEMS_PRECIO_UNICO: Array<{ cat: string; nombre: string; precio: number; descripcion?: string }> = [
  // Guarniciones
  { cat: 'Guarniciones', nombre: 'Porción de Arroz', precio: 3 },
  { cat: 'Guarniciones', nombre: 'Porción de Chifles', precio: 3 },
  { cat: 'Guarniciones', nombre: 'Porción de Yuca Frita', precio: 3 },
  { cat: 'Guarniciones', nombre: 'Porción de Cancha', precio: 3 },
  { cat: 'Guarniciones', nombre: 'Porción de Sarandaja', precio: 3 },
  { cat: 'Guarniciones', nombre: 'Porción de Camotes', precio: 3 },
  { cat: 'Guarniciones', nombre: 'Porción de Patacones', precio: 8 },

  // Bebidas de la casa (preparadas al momento, no llevan stock de insumo)
  { cat: 'Bebidas de la Casa', nombre: 'Clarito Helado', precio: 7 },
  { cat: 'Bebidas de la Casa', nombre: 'Limonada', precio: 7 },
  { cat: 'Bebidas de la Casa', nombre: 'Chicha Morada', precio: 7 },

  // Tragos (coctelería, área BARRA — preparados al momento, no llevan stock de insumo)
  { cat: 'Tragos', nombre: 'Machu Picchu', precio: 15 },

  // Domingos y feriados
  { cat: 'Domingos y Feriados', nombre: 'Arroz con Pato', precio: 20, descripcion: 'Solo domingos y feriados' },
  // "Arroz con cabrito y tamal" queda pendiente: el precio no se distinguía
  // con certeza en la foto de la carta — agrégalo desde la UI cuando lo confirmes.
];

// ── Cerveza / Gaseosas / Agua Mineral: Producto (con stock) + Insumo ──────
// stockActual: 0 a propósito — lo carga el dueño según lo que compre.
const BEBIDAS_CON_STOCK: Array<{ cat: string; nombre: string; precio: number; unidad: string }> = [
  // Cerveza
  { cat: 'Cerveza', nombre: 'Cristal', precio: 8, unidad: 'botella' },
  { cat: 'Cerveza', nombre: 'Pilsen', precio: 9, unidad: 'botella' },
  { cat: 'Cerveza', nombre: 'Cusqueña de Trigo', precio: 9, unidad: 'botella' },
  { cat: 'Cerveza', nombre: 'Cusqueña Negra', precio: 9, unidad: 'botella' },
  { cat: 'Cerveza', nombre: 'Smirnoff Personal', precio: 10, unidad: 'botella' },
  { cat: 'Cerveza', nombre: 'Coronita Personal', precio: 4, unidad: 'botella' },
  { cat: 'Cerveza', nombre: 'Corona', precio: 6, unidad: 'botella' },

  // Gaseosas — personal/chica (S/2)
  { cat: 'Gaseosas', nombre: 'Guaranita Personal', precio: 2, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Kr Personal', precio: 2, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Maltin Personal', precio: 2, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Frugo Fresh Personal', precio: 2, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Pulp', precio: 2.5, unidad: 'botella' },
  // S/3
  { cat: 'Gaseosas', nombre: 'Guaraná Chica', precio: 3, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Volt', precio: 3, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Pepsi 1/2', precio: 3, unidad: 'botella' },
  // S/4
  { cat: 'Gaseosas', nombre: 'Inca Kola Personal', precio: 4, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Coca Cola Personal', precio: 4, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Fanta Personal', precio: 4, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Cola Inglesa', precio: 4, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Crush Personal', precio: 4, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Sporade', precio: 4, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Gatorade', precio: 4, unidad: 'botella' },
  // S/5-6
  { cat: 'Gaseosas', nombre: 'Kr 1L', precio: 5, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Gordita', precio: 6, unidad: 'botella' },
  // S/8
  { cat: 'Gaseosas', nombre: 'Inca Kola 1L', precio: 8, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Coca Cola 1L', precio: 8, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Fanta 1L', precio: 8, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Kr 1.7L', precio: 8, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Frugo del Valle 1L', precio: 8, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Pulp 1L', precio: 8, unidad: 'botella' },
  // S/10
  { cat: 'Gaseosas', nombre: 'Inca Kola Retornable 2L', precio: 10, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Coca Cola Retornable 2L', precio: 10, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Fanta Retornable 2L', precio: 10, unidad: 'botella' },
  // S/12
  { cat: 'Gaseosas', nombre: 'Kr 3L', precio: 12, unidad: 'botella' },
  // S/15
  { cat: 'Gaseosas', nombre: 'Crush 3L', precio: 15, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Guaraná 3L', precio: 15, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Pepsi 3L', precio: 15, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Triple Kola 3L', precio: 15, unidad: 'botella' },
  // S/18
  { cat: 'Gaseosas', nombre: 'Inka Kola 3L', precio: 18, unidad: 'botella' },
  { cat: 'Gaseosas', nombre: 'Coca Cola 3L', precio: 18, unidad: 'botella' },

  // Agua mineral
  { cat: 'Agua Mineral', nombre: 'San Carlos 450ml', precio: 2, unidad: 'botella' },
  { cat: 'Agua Mineral', nombre: 'San Luis 450ml', precio: 2, unidad: 'botella' },
  { cat: 'Agua Mineral', nombre: 'San Luis', precio: 3, unidad: 'botella' },
  { cat: 'Agua Mineral', nombre: 'San Mateo', precio: 3, unidad: 'botella' },
  { cat: 'Agua Mineral', nombre: 'Agua Alcalina', precio: 3, unidad: 'botella' },
  { cat: 'Agua Mineral', nombre: 'Benedictino', precio: 3, unidad: 'botella' },
  { cat: 'Agua Mineral', nombre: 'San Luis con Gas', precio: 3, unidad: 'botella' },
  { cat: 'Agua Mineral', nombre: 'San Mateo con Gas', precio: 3, unidad: 'botella' },
];

const TODAS_LAS_CATEGORIAS = [
  { nombre: 'Ceviches' },
  { nombre: 'Sudados' },
  { nombre: 'Parihuelas' },
  { nombre: 'Festival de Carnes' },
  { nombre: 'Especiales' },
  { nombre: 'Guarniciones' },
  { nombre: 'Chicharrones' },
  { nombre: 'Dúos Marinos' },
  { nombre: 'Dúos Criollos' },
  { nombre: 'Rondas' },
  { nombre: 'Jaleas' },
  { nombre: 'Pasados por Agua Caliente' },
  { nombre: 'Bebidas de la Casa' },
  { nombre: 'Domingos y Feriados' },
  { nombre: 'Tragos', area: 'BARRA' },
  // Área INVENTARIO: productos con control de stock, van directo a cuenta sin
  // pasar por Cocina/Barra (ver assertStockCoincideConAreaCategoria en
  // servicio-inventario — un producto con stockActual SOLO puede vivir acá).
  { nombre: 'Cerveza', area: 'INVENTARIO' },
  { nombre: 'Gaseosas', area: 'INVENTARIO' },
  { nombre: 'Agua Mineral', area: 'INVENTARIO' },
  { nombre: 'Postres', descripcion: 'Variedad de postres — agregar cada uno desde la carta cuando esté definido el surtido' },
];

async function main() {
  assertDevOnlyTarget();

  console.log('═══════════════════════════════════════════');
  console.log('  Mi Narcita — Carga de la carta real');
  console.log('═══════════════════════════════════════════\n');

  const token = await login();

  console.log('\n📦 Creando categorías...');
  const categorias: Record<string, Categoria> = {};
  for (const c of TODAS_LAS_CATEGORIAS) {
    categorias[c.nombre] = await crearCategoria(token, c.nombre, (c as any).descripcion, (c as any).area);
  }

  console.log('\n🍽️  Creando platos con Personal/Mediana/Familiar...');
  let totalPlatos = 0;
  for (const p of PLATOS_VARIANTES) {
    for (let i = 0; i < 3; i++) {
      const precio = p.precios[i];
      if (precio == null) continue;
      const nombre = `${p.nombre} (${SUFIJO_TAMANO[i]})`;
      await crearProducto(token, { categoriaId: categorias[p.cat].id, nombre, precio });
      totalPlatos++;
      console.log(`   ✅ ${p.cat} → ${nombre} (S/ ${precio})`);
    }
  }

  console.log('\n🍽️  Creando platos y bebidas de precio único...');
  for (const item of ITEMS_PRECIO_UNICO) {
    await crearProducto(token, { categoriaId: categorias[item.cat].id, nombre: item.nombre, precio: item.precio, descripcion: item.descripcion });
    console.log(`   ✅ ${item.cat} → ${item.nombre} (S/ ${item.precio})`);
  }

  console.log('\n🍺 Creando cerveza/gaseosas/agua mineral (Producto + Insumo, stock en 0)...');
  let totalBebidas = 0;
  for (const b of BEBIDAS_CON_STOCK) {
    const producto = await crearProducto(token, {
      categoriaId: categorias[b.cat].id,
      nombre: b.nombre,
      precio: b.precio,
      stockActual: 0,
    });
    await crearInsumo(token, {
      nombre: b.nombre,
      unidad: b.unidad,
      productoId: producto.id,
      stockActual: 0,
      stockMinimo: 0,
    });
    totalBebidas++;
    console.log(`   ✅ ${b.cat} → ${b.nombre} (S/ ${b.precio}, stock inicial 0 — cárgalo desde Inventario)`);
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  📊 Resumen');
  console.log('═══════════════════════════════════════════');
  console.log(`  Categorías:               ${TODAS_LAS_CATEGORIAS.length}`);
  console.log(`  Platos con PP/PM/PF:      ${totalPlatos}`);
  console.log(`  Platos/bebidas precio único: ${ITEMS_PRECIO_UNICO.length}`);
  console.log(`  Cerveza/Gaseosas/Agua:    ${totalBebidas} (Producto + Insumo)`);
  console.log('═══════════════════════════════════════════\n');
}

function assertDevOnlyTarget() {
  if (ALLOW_PRODUCTION_SEED) {
    console.log('⚠️  ALLOW_PRODUCTION_SEED=yes — sembrando contra:', BASE);
    return;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Seed bloqueado: NODE_ENV=production. Si de verdad quieres sembrar producción, pasa ALLOW_PRODUCTION_SEED=yes.');
  }
  const url = new URL(BASE);
  if (!DEV_HOSTS.has(url.hostname) && !url.hostname.endsWith('.local')) {
    throw new Error(`Seed bloqueado: ${BASE} no parece un endpoint local/dev. Si de verdad quieres sembrar producción, pasa ALLOW_PRODUCTION_SEED=yes.`);
  }
}

main().catch((err) => {
  console.error('\n❌ Error durante la carga:', err.response?.data || err.message);
  process.exit(1);
});
