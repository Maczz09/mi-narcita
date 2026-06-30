// @ts-nocheck
/* eslint-disable */
import {
  expect,
  test,
  type APIRequestContext,
  type BrowserContext,
  type Page,
} from '@playwright/test';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@nachopps.pe';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'nachopps123';
const REQUIRED_PAGE_SIZE = 50;

type ListResponse<T> = {
  data?: T[];
  nextCursor?: string | null;
};

type Categoria = {
  id: string;
  nombre: string;
};

type Producto = {
  id: string;
  categoriaId: string;
  nombre: string;
  stockActual?: number | null;
};

type Mesa = {
  id: string;
  numero: number;
};

type Pedido = {
  id: string;
  mesaNumero?: number | string | null;
};

type LoginResponse = {
  access_token: string;
};

test.describe('PWA paginacion infinita', () => {
  test('Inventario, Pedidos y Cocina cargan una segunda pagina', async ({
    page,
    request,
    context,
  }) => {
    const token = await login(request);
    await ensurePaginationFixtures(request, token);
    await authenticateBrowser(context, token);

    await assertLoadMoreInInventario(page);
    await assertLoadMoreInPedidos(page);
    await assertLoadMoreInCocina(page);
  });
});

async function login(request: APIRequestContext) {
  const response = await request.post(`${API_BASE_URL}/identidad/auth/login`, {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();

  const body = (await response.json()) as LoginResponse;
  expect(body.access_token).toBeTruthy();
  return body.access_token;
}

async function authenticateBrowser(
  context: BrowserContext,
  token: string,
) {
  await context.addCookies([
    {
      name: 'access_token',
      value: token,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Strict',
      secure: false,
    },
    {
      name: 'nachopps.csrf_token',
      value: 'pwa-pagination-e2e',
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      sameSite: 'Strict',
      secure: false,
    },
  ]);
}

async function ensurePaginationFixtures(request: APIRequestContext, token: string) {
  const headers = authHeaders(token);
  const categoria = await ensureCategoria(request, headers);
  await ensureProductos(request, headers, categoria.id);
  await ensurePedidos(request, headers);
}

async function ensureCategoria(
  request: APIRequestContext,
  headers: Record<string, string>,
) {
  const categorias = await getArray<Categoria>(
    request,
    '/inventario/categorias',
    headers,
    'categorias',
  );

  const existing = categorias.find((categoria) => categoria.nombre === 'QA Paginacion');
  if (existing) return existing;

  const response = await request.post(`${API_BASE_URL}/inventario/categorias`, {
    headers,
    data: {
      nombre: 'QA Paginacion',
      descripcion: 'Datos creados por e2e de paginacion PWA',
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  return body.categoria as Categoria;
}

async function ensureProductos(
  request: APIRequestContext,
  headers: Record<string, string>,
  categoriaId: string,
) {
  // La pantalla Inventario lista con conStock=true; el fixture debe garantizar
  // la segunda página sobre ESA misma vista (no sobre el total sin filtrar).
  const firstPage = await getPage<Producto>(request, '/inventario/productos?conStock=true&limit=50', headers);
  if ((firstPage.nextCursor ?? null) || firstPage.data.length > REQUIRED_PAGE_SIZE) {
    return;
  }

  const missing = REQUIRED_PAGE_SIZE + 1 - firstPage.data.length;
  const runId = Date.now();

  for (let index = 0; index < missing; index += 1) {
    const response = await request.post(`${API_BASE_URL}/inventario/productos`, {
      headers,
      data: {
        categoriaId,
        nombre: `QA Paginacion Producto ${runId}-${index}`,
        descripcion: 'Fixture e2e de paginacion',
        precio: 10,
        stockActual: 1000,
        disponible: true,
      },
    });

    expect(response.ok(), await response.text()).toBeTruthy();
  }
}

async function ensurePedidos(request: APIRequestContext, headers: Record<string, string>) {
  const pedidos = await getPage<Pedido>(request, '/pedidos?limit=100', headers);
  const pedidosSalon = pedidos.data.filter((pedido) => Number(pedido.mesaNumero) < 90);

  if (pedidosSalon.length > REQUIRED_PAGE_SIZE) {
    return;
  }

  const mesa = await ensureMesaSalon(request, headers);
  const producto = await ensureProductoConStock(request, headers);
  const missing = REQUIRED_PAGE_SIZE + 1 - pedidosSalon.length;
  const runId = Date.now();

  for (let index = 0; index < missing; index += 1) {
    const response = await request.post(`${API_BASE_URL}/pedidos`, {
      headers,
      data: {
        mesaId: mesa.id,
        items: [
          {
            productoId: producto.id,
            cantidad: 1,
            notas: `QA Paginacion Pedido ${runId}-${index}`,
          },
        ],
      },
    });

    expect(response.ok(), await response.text()).toBeTruthy();
  }
}

async function ensureMesaSalon(request: APIRequestContext, headers: Record<string, string>) {
  const mesas = await getArray<Mesa>(request, '/mesas', headers, 'mesas');
  const existing = mesas.find((mesa) => Number(mesa.numero) < 90);
  if (existing) return existing;

  const response = await request.post(`${API_BASE_URL}/mesas`, {
    headers,
    data: {
      numero: 1,
      capacidad: 4,
      ubicacion: 'Salon Principal',
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  return body.mesa as Mesa;
}

async function ensureProductoConStock(
  request: APIRequestContext,
  headers: Record<string, string>,
) {
  const productos = await getPage<Producto>(request, '/inventario/productos?limit=100', headers);
  const existing = productos.data.find((producto) => Number(producto.stockActual ?? 0) > 100);
  if (existing) return existing;

  const categoria = await ensureCategoria(request, headers);
  const response = await request.post(`${API_BASE_URL}/inventario/productos`, {
    headers,
    data: {
      categoriaId: categoria.id,
      nombre: `QA Paginacion Stock ${Date.now()}`,
      descripcion: 'Producto con stock para pedidos e2e',
      precio: 10,
      stockActual: 1000,
      disponible: true,
    },
  });

  expect(response.ok(), await response.text()).toBeTruthy();
  const body = await response.json();
  return body.producto as Producto;
}

async function assertLoadMoreInInventario(page: Page) {
  await page.goto('/app/inventario');
  await expect(page.getByRole('heading', { name: 'Inventario' })).toBeVisible();

  const counter = page.locator('section.panel .panel-h .badge').first();
  const before = await readCount(counter, /(\d+)\s+productos/);

  await clickLoadMore(page);

  await expect
    .poll(() => readCount(counter, /(\d+)\s+productos/))
    .toBeGreaterThan(before);
}

async function assertLoadMoreInPedidos(page: Page) {
  await page.goto('/app/pedidos');
  await expect(page.getByRole('heading', { name: 'Pedidos' })).toBeVisible();

  const counter = page.locator('.page-h .sub').first();
  const before = await readCount(counter, /(\d+)\s+pedidos activos/);

  await clickLoadMore(page);

  await expect
    .poll(() => readCount(counter, /(\d+)\s+pedidos activos/))
    .toBeGreaterThan(before);
}

async function assertLoadMoreInCocina(page: Page) {
  await page.goto('/app/cocina');
  await expect(page.getByRole('heading', { name: /Cocina/ })).toBeVisible();
  // El KDS usa autoLoadAll (sin botón "Cargar más"): carga todas las páginas
  // automáticamente. Verificamos que esa carga trajo más de una página de
  // tickets (cada pedido en producción renderiza al menos una .kds-card).
  await expect
    .poll(() => page.locator('.kds-card').count(), { timeout: 15000 })
    .toBeGreaterThan(REQUIRED_PAGE_SIZE);
}

async function clickLoadMore(page: Page) {
  const button = loadMoreButton(page);
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
}

function loadMoreButton(page: Page) {
  return page.locator('button').filter({ hasText: /Cargar m.s/ }).first();
}

async function readCount(
  locator: ReturnType<Page['locator']>,
  pattern: RegExp,
) {
  const text = (await locator.textContent()) ?? '';
  const match = text.match(pattern);
  if (!match) throw new Error(`No se pudo leer contador desde: ${text}`);
  return Number(match[1]);
}

async function getPage<T>(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string>,
) {
  const response = await request.get(`${API_BASE_URL}${path}`, { headers });
  expect(response.ok(), await response.text()).toBeTruthy();

  const body = (await response.json()) as ListResponse<T> | Record<string, unknown> | T[];

  if (Array.isArray(body)) {
    return { data: body, nextCursor: null };
  }

  if (Array.isArray((body as ListResponse<T>).data)) {
    const page = body as ListResponse<T>;
    return {
      data: page.data ?? [],
      nextCursor: page.nextCursor ?? null,
    };
  }

  return {
    data:
      getResponseArray<T>(body, 'productos').length > 0
        ? getResponseArray<T>(body, 'productos')
        : getResponseArray<T>(body, 'pedidos'),
    nextCursor: null,
  };
}

async function getArray<T>(
  request: APIRequestContext,
  path: string,
  headers: Record<string, string>,
  key: string,
) {
  const response = await request.get(`${API_BASE_URL}${path}`, { headers });
  expect(response.ok(), await response.text()).toBeTruthy();
  return getResponseArray<T>(await response.json(), key);
}

function getResponseArray<T>(body: unknown, key: string) {
  if (Array.isArray(body)) return body as T[];
  if (body && typeof body === 'object' && Array.isArray((body as Record<string, unknown>)[key])) {
    return (body as Record<string, T[]>)[key] ?? [];
  }
  return [];
}

function authHeaders(token: string) {
  return {
    Authorization: `Bearer ${token}`,
  };
}
