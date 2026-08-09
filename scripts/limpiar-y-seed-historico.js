/**
 * Limpia todas las bases de datos del negocio (mesas, inventario, pedidos,
 * reservas, cuentas, caja, reportes, notificaciones) EXCEPTO identidad_db
 * (usuarios), y las siembra con un mes de datos históricos realistas y
 * coherentes entre servicios (mismas mesas, mismos productos, mismos
 * pedidos referenciados desde cuentas/caja/reportes).
 *
 * Uso: node scripts/limpiar-y-seed-historico.js
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

const uuid = () => crypto.randomUUID();

// ---------------------------------------------------------------------------
// Conexiones (una por servicio, excluyendo servicio-identidad a propósito)
// ---------------------------------------------------------------------------
const SERVICIOS = [
  'servicio-mesas',
  'servicio-inventario',
  'servicio-pedidos',
  'servicio-reservas',
  'servicio-cuentas',
  'servicio-caja',
  'servicio-reportes',
  'servicio-notificaciones',
];

function leerDatabaseUrl(servicio) {
  const envPath = path.join(__dirname, '..', 'apps', servicio, '.env');
  const parsed = dotenv.parse(fs.readFileSync(envPath));
  if (!parsed.DATABASE_URL) throw new Error(`DATABASE_URL no encontrada en ${envPath}`);
  return parsed.DATABASE_URL;
}

// ---------------------------------------------------------------------------
// Utilidades de aleatoriedad / fechas
// ---------------------------------------------------------------------------
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[randInt(0, arr.length - 1)];
const money = (n) => Math.round(n * 100) / 100;

function pickN(arr, n) {
  const copia = [...arr];
  const out = [];
  n = Math.min(n, copia.length);
  for (let i = 0; i < n; i++) {
    const idx = randInt(0, copia.length - 1);
    out.push(copia[idx]);
    copia.splice(idx, 1);
  }
  return out;
}

function weighted(pares) {
  const total = pares.reduce((s, [, w]) => s + w, 0);
  let r = Math.random() * total;
  for (const [valor, peso] of pares) {
    r -= peso;
    if (r <= 0) return valor;
  }
  return pares[pares.length - 1][0];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const atUTC = (base, h, m = 0) => {
  const d = new Date(base);
  d.setUTCHours(h, m, 0, 0);
  return d;
};
const addMin = (date, min) => new Date(date.getTime() + min * 60000);

// `ahora` representa el reloj de pared LOCAL, pero expresado con getters UTC,
// para que sea comparable directamente contra las horas sintéticas del
// restaurante (construidas con setUTCHours). Evita que un huso horario
// distinto a UTC (ej. UTC-5) descarte por error los pedidos de "hoy".
const _real = new Date();
const ahora = new Date(
  Date.UTC(_real.getFullYear(), _real.getMonth(), _real.getDate(), _real.getHours(), _real.getMinutes(), _real.getSeconds()),
);
const HOY = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), ahora.getUTCDate()));
const DIAS_HISTORIA = 30;

// ---------------------------------------------------------------------------
// Datos de referencia (personal, mesas, menú)
// ---------------------------------------------------------------------------
const MESEROS = ['Ana Torres', 'Luis Ramírez', 'Carla Mendoza', 'Jorge Quispe'].map((nombre) => ({
  id: uuid(),
  nombre,
}));
const CAJEROS = ['Rosa Fernández', 'Miguel Ángel Soto'].map((nombre) => ({ id: uuid(), nombre }));

// Ubicaciones (CRUD propio en servicio-mesas): mesas.ubicacionId referencia esto.
const UBICACIONES_DEF = ['Barra', 'Salon Principal', 'Terraza', 'VIP'].map((nombre) => ({ id: uuid(), nombre }));
const ubicacionIdPorNombre = new Map(UBICACIONES_DEF.map((u) => [u.nombre, u.id]));

const MESAS_DEF = [
  { numero: 1, capacidad: 2, ubicacion: 'Barra' },
  { numero: 2, capacidad: 2, ubicacion: 'Barra' },
  { numero: 3, capacidad: 4, ubicacion: 'Salon Principal' },
  { numero: 4, capacidad: 4, ubicacion: 'Salon Principal' },
  { numero: 5, capacidad: 4, ubicacion: 'Salon Principal' },
  { numero: 6, capacidad: 6, ubicacion: 'Salon Principal' },
  { numero: 7, capacidad: 4, ubicacion: 'Salon Principal' },
  { numero: 8, capacidad: 4, ubicacion: 'Terraza' },
  { numero: 9, capacidad: 4, ubicacion: 'Terraza' },
  { numero: 10, capacidad: 6, ubicacion: 'Terraza' },
  { numero: 11, capacidad: 2, ubicacion: 'Terraza' },
  { numero: 12, capacidad: 8, ubicacion: 'Salon Principal' },
  { numero: 13, capacidad: 6, ubicacion: 'VIP' },
  { numero: 14, capacidad: 10, ubicacion: 'VIP' },
].map((m) => ({ ...m, id: uuid(), ubicacionId: ubicacionIdPorNombre.get(m.ubicacion) }));

const CATEGORIAS_DEF = [
  { nombre: 'Entradas', descripcion: 'Para compartir antes del plato fuerte' },
  { nombre: 'Nachos de la Casa', descripcion: 'La especialidad de Nachopps' },
  { nombre: 'Platos Fuertes', descripcion: 'Platos principales mexicanos' },
  { nombre: 'Bebidas', descripcion: 'Bebidas frías y con alcohol' },
  { nombre: 'Postres', descripcion: 'Para cerrar con algo dulce' },
].map((c) => ({ ...c, id: uuid() }));
const [ENTRADAS, NACHOS, FUERTES, BEBIDAS, POSTRES] = CATEGORIAS_DEF;

// stockInicial se calibró para que, tras ~4000 unidades vendidas en el mes
// repartidas entre 21 productos (~195 u./producto en promedio), la mayoría
// quede con stock cómodo y solo un par de ítems terminen "casi agotados"
// (no en cero, para no romper la pantalla de carta).
const PRODUCTOS_DEF = [
  { categoria: ENTRADAS, nombre: 'Guacamole con Totopos', precio: 18.0, stockInicial: 480 },
  { categoria: ENTRADAS, nombre: 'Alitas BBQ (8u)', precio: 26.0, stockInicial: 450 },
  { categoria: ENTRADAS, nombre: 'Quesadilla de Queso', precio: 16.0, stockInicial: 500 },
  { categoria: ENTRADAS, nombre: 'Dedos de Queso', precio: 19.0, stockInicial: 450 },
  { categoria: NACHOS, nombre: 'Nachos Supreme', precio: 32.0, stockInicial: 550 },
  { categoria: NACHOS, nombre: 'Nachos con Carne', precio: 34.0, stockInicial: 500 },
  { categoria: NACHOS, nombre: 'Nachos con Pollo BBQ', precio: 30.0, stockInicial: 500 },
  { categoria: NACHOS, nombre: 'Nachos Vegetarianos', precio: 28.0, stockInicial: 400 },
  { categoria: FUERTES, nombre: 'Burrito de Carne', precio: 28.0, stockInicial: 480 },
  { categoria: FUERTES, nombre: 'Tacos al Pastor (3u)', precio: 25.0, stockInicial: 550 },
  { categoria: FUERTES, nombre: 'Enchiladas Verdes', precio: 30.0, stockInicial: 230 },
  { categoria: FUERTES, nombre: 'Fajitas Mixtas', precio: 42.0, stockInicial: 420 },
  { categoria: FUERTES, nombre: 'Quesadilla Grande de Pollo', precio: 27.0, stockInicial: 450 },
  { categoria: BEBIDAS, nombre: 'Chicha Morada', precio: 8.0, stockInicial: 700 },
  { categoria: BEBIDAS, nombre: 'Limonada Frozen', precio: 10.0, stockInicial: 700 },
  { categoria: BEBIDAS, nombre: 'Cerveza Artesanal', precio: 14.0, stockInicial: 600 },
  { categoria: BEBIDAS, nombre: 'Margarita Clásica', precio: 18.0, stockInicial: 240 },
  { categoria: BEBIDAS, nombre: 'Gaseosa Personal', precio: 6.0, stockInicial: 700 },
  { categoria: POSTRES, nombre: 'Churros con Chocolate', precio: 14.0, stockInicial: 480 },
  { categoria: POSTRES, nombre: 'Flan Casero', precio: 12.0, stockInicial: 450 },
  { categoria: POSTRES, nombre: 'Volcán de Chocolate', precio: 16.0, stockInicial: 450 },
].map((p) => ({ ...p, id: uuid(), vendidos: 0 }));

const CLIENTES_DEF = [
  'María López', 'Pedro Sánchez', 'Lucía Vargas', 'Diego Castillo', 'Fernanda Ríos',
  'Gustavo Chávez', 'Valeria Rojas', 'Sergio Paredes', 'Camila Flores', 'Andrés Delgado',
  'Patricia Vega', 'Ricardo Gómez', 'Daniela Salazar', 'Enrique Núñez', 'Alejandra Cruz',
];
const telefono = () => `9${randInt(10000000, 99999999)}`;

// ---------------------------------------------------------------------------
// Generación de datos históricos
// ---------------------------------------------------------------------------
const HORAS_RESERVA = ['12:00', '12:30', '13:00', '13:30', '14:00', '19:00', '19:30', '20:00', '20:30', '21:00'];

const rows = {
  mesas: [],
  ubicaciones: UBICACIONES_DEF,
  categorias: CATEGORIAS_DEF,
  productos: PRODUCTOS_DEF,
  mesasLocal: [],
  productosLocales: [],
  pedidos: [],
  pedidoItems: [],
  cuentas: [],
  turnos: [],
  transacciones: [],
  movimientos: [],
  cierres: [],
  arqueos: [],
  ventasDiarias: [],
  reservas: [],
  notificaciones: [],
};

// Estado "en vivo" (hoy) por mesa, se decide al final del día actual
const estadoMesa = new Map(MESAS_DEF.map((m) => [m.id, { estado: 'LIBRE', cuentaAsociada: null }]));

function crearPedidoPagado(mesa, momento) {
  const mesero = pick(MESEROS);
  const nItems = randInt(1, 4);
  const productosElegidos = pickN(PRODUCTOS_DEF, nItems);
  const pedidoId = uuid();
  let total = 0;
  const items = productosElegidos.map((prod) => {
    const cantidad = randInt(1, 3);
    prod.vendidos += cantidad;
    total += cantidad * prod.precio;
    return {
      id: uuid(),
      pedidoId,
      productoId: prod.id,
      nombre: prod.nombre,
      cantidad,
      precioUnitario: prod.precio,
      area: prod.categoria === BEBIDAS ? 'BARRA' : 'COCINA',
      comensal: randInt(1, 4),
      mesero,
    };
  });
  total = money(total);

  const prepMin = randInt(15, 35);
  const createdAt = momento;
  const listoAt = addMin(createdAt, prepMin);

  return { pedidoId, mesa, mesero, items, total, createdAt, listoAt };
}

function cerrarCuentaPedido(pedido, payTimeMax, turnoId) {
  const payTime = new Date(Math.min(addMin(pedido.listoAt, randInt(5, 20)).getTime(), payTimeMax.getTime()));
  const cuentaId = uuid();
  const descuento = Math.random() < 0.08 ? money(pedido.total * (randInt(5, 10) / 100)) : 0;
  const metodo = weighted([
    ['EFECTIVO', 45],
    ['TARJETA', 25],
    ['YAPE', 20],
    ['PLIN', 7],
    ['TRANSFERENCIA', 3],
  ]);
  const monto = money(pedido.total - descuento);
  const propina = Math.random() < 0.4 ? money(monto * (randInt(0, 12) / 100)) : 0;
  const transaccionId = uuid();

  rows.cuentas.push({
    id: cuentaId,
    mesaId: pedido.mesa.id,
    pedidos: [pedido.pedidoId],
    total: pedido.total,
    estado: 'PAGADA',
    ticket: `TCK-${pedido.createdAt.toISOString().slice(0, 10).replace(/-/g, '')}-${String(rows.cuentas.length + 1).padStart(4, '0')}`,
    createdAt: pedido.createdAt,
    updatedAt: payTime,
  });

  rows.transacciones.push({
    id: transaccionId,
    cuentaId,
    turnoId,
    mesaId: pedido.mesa.id,
    monto,
    descuento,
    metodo,
    referencia: metodo === 'EFECTIVO' ? null : `OP-${randInt(100000, 999999)}`,
    notas: null,
    createdAt: payTime,
  });

  rows.ventasDiarias.push({
    id: uuid(),
    cuentaId,
    mesaId: pedido.mesa.id,
    total: pedido.total,
    items: pedido.items.map((it) => ({
      productoId: it.productoId,
      nombre: it.nombre,
      cantidad: it.cantidad,
      precioUnitario: it.precioUnitario,
    })),
    meseroId: pedido.mesero.id,
    meseroNombre: pedido.mesero.nombre,
    fecha: payTime,
  });

  if (Math.random() < 0.2) {
    rows.notificaciones.push({
      id: uuid(),
      eventoOrigen: 'pedido.listo',
      destinatario: `Mesa ${pedido.mesa.numero}`,
      canal: 'UI',
      contenido: `Pedido de mesa ${pedido.mesa.numero} listo para servir`,
      estado: 'ENVIADO',
      intentos: 1,
      timestamp: pedido.listoAt,
    });
  }

  return { transaccionId, monto, metodo, propina, descuento, payTime };
}

for (let offset = DIAS_HISTORIA - 1; offset >= 0; offset--) {
  const dia = new Date(HOY);
  dia.setUTCDate(dia.getUTCDate() - offset);
  const esHoy = offset === 0;
  const diaSemana = dia.getUTCDay(); // 0=Dom .. 6=Sab
  const esFinde = diaSemana === 0 || diaSemana === 5 || diaSemana === 6;

  // --- Reservas del día ---
  const combosDisponibles = shuffle(
    HORAS_RESERVA.flatMap((hora) => MESAS_DEF.map((m) => ({ hora, mesa: m }))),
  );
  const nReservas = randInt(esFinde ? 6 : 3, esFinde ? 10 : 7);
  const reservasDelDia = combosDisponibles.slice(0, nReservas);
  const nowLimitHora = esHoy ? `${String(ahora.getUTCHours()).padStart(2, '0')}:${String(ahora.getUTCMinutes()).padStart(2, '0')}` : null;

  for (const { hora, mesa } of reservasDelDia) {
    const esFutura = esHoy && hora > nowLimitHora;
    let estado;
    if (esFutura) {
      estado = weighted([['PENDIENTE', 40], ['CONFIRMADA', 60]]);
    } else {
      estado = weighted([['CONFIRMADA', 78], ['CANCELADA', 14], ['EXPIRADA', 8]]);
    }
    const creadaOffsetDias = randInt(1, 6);
    const createdAt = addMin(new Date(dia), -creadaOffsetDias * 24 * 60 + randInt(0, 600));
    const clienteNombre = pick(CLIENTES_DEF);
    const clienteTelefono = telefono();
    const numComensales = randInt(2, Math.min(8, mesa.capacidad));

    rows.reservas.push({
      id: uuid(),
      clienteNombre,
      clienteTelefono,
      fecha: dia,
      hora,
      mesaPreferida: String(mesa.numero),
      numComensales,
      estado,
      createdAt: createdAt < dia ? createdAt : dia,
      updatedAt: createdAt < dia ? createdAt : dia,
    });

    if (estado === 'CONFIRMADA' || estado === 'PENDIENTE') {
      rows.notificaciones.push({
        id: uuid(),
        eventoOrigen: 'reserva.confirmada',
        destinatario: clienteTelefono,
        canal: 'WHATSAPP',
        contenido: `Su reserva para ${numComensales} personas el ${dia.toISOString().slice(0, 10)} a las ${hora} fue confirmada`,
        estado: 'ENVIADO',
        intentos: 1,
        timestamp: createdAt < dia ? createdAt : dia,
      });
    }

    if (esFutura && estado !== 'CANCELADA') {
      const st = estadoMesa.get(mesa.id);
      if (st.estado === 'LIBRE') st.estado = 'RESERVADA';
    }
  }

  // --- Turno de caja del día ---
  const cajero = pick(CAJEROS);
  const turnoId = uuid();
  const fondoInicial = 200;
  const abiertoAt = atUTC(dia, 11, 0);
  const cerradoAt = esHoy ? null : atUTC(dia, 23, 30);
  const limitePago = esHoy ? ahora : cerradoAt;

  rows.turnos.push({
    id: turnoId,
    cajaId: 'CAJA-PRINCIPAL',
    cajaNombre: 'Caja Principal',
    usuarioId: cajero.id,
    cajeroNombre: cajero.nombre,
    fondoInicial,
    estado: esHoy ? 'ABIERTA' : 'CERRADA',
    abiertoAt,
    cerradoAt,
    createdAt: abiertoAt,
    updatedAt: cerradoAt ?? abiertoAt,
  });

  const movimientosDelTurno = [
    { tipo: 'APERTURA', metodo: 'EFECTIVO', monto: fondoInicial, donde: 'Fondo inicial', createdAt: abiertoAt },
  ];
  if (Math.random() < 0.25) {
    const ajusteMonto = randInt(20, 80);
    const esIngreso = Math.random() < 0.6;
    movimientosDelTurno.push({
      tipo: esIngreso ? 'INGRESO' : 'EGRESO',
      metodo: 'EFECTIVO',
      monto: esIngreso ? ajusteMonto : -ajusteMonto,
      donde: esIngreso ? 'Ingreso de vuelto' : 'Compra menor de insumos',
      createdAt: atUTC(dia, 16, randInt(0, 59)),
    });
  }

  // --- Pedidos del día ---
  const nPedidos = randInt(esFinde ? 30 : 18, esFinde ? 45 : 28);
  const horariosServicio = [];
  for (let i = 0; i < nPedidos; i++) {
    const enAlmuerzo = Math.random() < 0.45;
    const hora = enAlmuerzo ? randInt(12, 14) : randInt(19, 22);
    const minuto = randInt(0, 59);
    horariosServicio.push(atUTC(dia, hora, minuto));
  }
  horariosServicio.sort((a, b) => a - b);

  const pedidosValidos = esHoy ? horariosServicio.filter((h) => h <= ahora) : horariosServicio;

  for (const momento of pedidosValidos) {
    const mesa = pick(MESAS_DEF);
    const esMuyReciente = esHoy && ahora - momento < 45 * 60000;
    const rngEstado = Math.random();

    if (!esMuyReciente && rngEstado < 0.05) {
      // Pedido cancelado o rechazado: no genera cuenta ni venta.
      continue;
    }

    const pedido = crearPedidoPagado(mesa, momento);
    let estadoPedido = 'PAGADO';

    if (esMuyReciente) {
      const minsDesde = (ahora - momento) / 60000;
      estadoPedido = minsDesde < 8 ? 'PENDIENTE' : minsDesde < 20 ? 'EN_PREPARACION' : minsDesde < 35 ? 'LISTO' : 'ENTREGADO';
    }

    rows.pedidos.push({
      id: pedido.pedidoId,
      mesaId: mesa.id,
      numeroMesa: mesa.numero,
      estado: estadoPedido,
      total: pedido.total,
      comensales: randInt(1, Math.min(6, mesa.capacidad)),
      meseroId: pedido.mesero.id,
      meseroNombre: pedido.mesero.nombre,
      createdAt: pedido.createdAt,
      updatedAt: estadoPedido === 'PAGADO' ? pedido.listoAt : momento,
    });

    for (const it of pedido.items) {
      rows.pedidoItems.push({
        id: it.id,
        pedidoId: it.pedidoId,
        productoId: it.productoId,
        nombre: it.nombre,
        cantidad: it.cantidad,
        precioUnitario: it.precioUnitario,
        area: it.area,
        estado: estadoPedido === 'PAGADO' ? 'ENTREGADO' : 'PENDIENTE',
        comensal: it.comensal,
        meseroId: pedido.mesero.id,
        meseroNombre: pedido.mesero.nombre,
      });
    }

    if (estadoPedido === 'PAGADO') {
      const { transaccionId, monto, metodo, propina, descuento, payTime } = cerrarCuentaPedido(pedido, limitePago, turnoId);
      movimientosDelTurno.push({
        tipo: 'VENTA',
        cuentaId: rows.cuentas[rows.cuentas.length - 1].id,
        transaccionId,
        mesaId: mesa.id,
        metodo,
        monto,
        descuento,
        propina,
        donde: `Mesa ${mesa.numero}`,
        createdAt: payTime,
      });
    } else {
      // Cuenta abierta en curso: aún no se paga (mesa ocupada en vivo).
      const cuentaAbiertaId = uuid();
      rows.cuentas.push({
        id: cuentaAbiertaId,
        mesaId: mesa.id,
        pedidos: [pedido.pedidoId],
        total: pedido.total,
        estado: 'ABIERTA',
        ticket: null,
        createdAt: pedido.createdAt,
        updatedAt: momento,
      });
      const st = estadoMesa.get(mesa.id);
      st.estado = 'OCUPADA';
      st.cuentaAsociada = cuentaAbiertaId;
    }
  }

  // --- Movimientos de caja (turno) ---
  for (const mv of movimientosDelTurno) {
    rows.movimientos.push({
      id: uuid(),
      turnoId,
      tipo: mv.tipo,
      cuentaId: mv.cuentaId ?? null,
      transaccionId: mv.transaccionId ?? null,
      mesaId: mv.mesaId ?? null,
      donde: mv.donde,
      metodo: mv.metodo,
      monto: mv.monto,
      descuento: mv.descuento ?? 0,
      propina: mv.propina ?? 0,
      motivo: null,
      createdAt: mv.createdAt,
    });
  }

  if (!esHoy) {
    const efectivoEsperado = money(
      movimientosDelTurno.filter((m) => m.metodo === 'EFECTIVO').reduce((s, m) => s + m.monto, 0),
    );
    const diferencia = Math.random() < 0.7 ? 0 : money(randInt(-5, 5));
    const efectivoContado = money(efectivoEsperado + diferencia);

    const denominaciones = {};
    let restante = Math.max(0, Math.floor(efectivoContado));
    for (const bill of [200, 100, 50, 20, 10, 5, 2, 1]) {
      const n = Math.floor(restante / bill);
      if (n > 0) {
        denominaciones[bill] = n;
        restante -= n * bill;
      }
    }

    const ventasDelDia = movimientosDelTurno.filter((m) => m.tipo === 'VENTA');
    rows.arqueos.push({
      id: uuid(),
      turnoId,
      denominaciones,
      efectivoEsperado,
      efectivoContado,
      diferencia,
      usuarioId: cajero.id,
      createdAt: cerradoAt,
    });
    rows.cierres.push({
      id: uuid(),
      turnoId,
      montoEsperado: efectivoEsperado,
      montoReal: efectivoContado,
      diferencia,
      usuarioId: cajero.id,
      resumen: {
        totalVentas: ventasDelDia.length,
        montoTotalVentas: money(ventasDelDia.reduce((s, m) => s + m.monto, 0)),
        porMetodo: ventasDelDia.reduce((acc, m) => {
          acc[m.metodo] = money((acc[m.metodo] ?? 0) + m.monto);
          return acc;
        }, {}),
      },
      createdAt: cerradoAt,
    });
  }
}

// --- Estado final de mesas (mirror mesas_local en pedidos_db) ---
for (const mesa of MESAS_DEF) {
  const st = estadoMesa.get(mesa.id);
  rows.mesas.push({
    id: mesa.id,
    numero: mesa.numero,
    capacidad: mesa.capacidad,
    ubicacionId: mesa.ubicacionId,
    estado: st.estado,
    cuentaAsociada: st.cuentaAsociada,
    createdAt: HOY,
    updatedAt: ahora,
  });
  rows.mesasLocal.push({ id: mesa.id, numero: mesa.numero, updatedAt: ahora });
}

// --- Stock final de productos, tras un mes de ventas ---
for (const prod of PRODUCTOS_DEF) {
  const stockActual = Math.max(0, prod.stockInicial - prod.vendidos);
  prod.stockActualFinal = stockActual;
  prod.disponibleFinal = stockActual > 0;
  rows.productosLocales.push({
    id: prod.id,
    nombre: prod.nombre,
    precio: prod.precio,
    stockActual,
    categoriaNombre: prod.categoria === BEBIDAS ? 'BARRA' : 'COCINA',
    disponible: stockActual > 0,
  });
}

// ---------------------------------------------------------------------------
// Definición de limpieza + inserción por base de datos
// ---------------------------------------------------------------------------
function col(row, columns) {
  return columns.map((c) => {
    const v = row[c];
    if (v && typeof v === 'object' && !(v instanceof Date)) return JSON.stringify(v);
    return v === undefined ? null : v;
  });
}

async function bulkInsert(client, table, columns, dataRows) {
  if (dataRows.length === 0) return 0;
  const chunkSize = Math.max(1, Math.floor(1800 / columns.length));
  const quotedCols = columns.map((c) => `"${c}"`).join(',');
  for (let i = 0; i < dataRows.length; i += chunkSize) {
    const chunk = dataRows.slice(i, i + chunkSize);
    const values = [];
    const placeholders = chunk
      .map((row, ri) => {
        const vals = col(row, columns);
        const base = ri * columns.length;
        values.push(...vals);
        return `(${columns.map((_, ci) => `$${base + ci + 1}`).join(',')})`;
      })
      .join(',');
    await client.query(`INSERT INTO ${table} (${quotedCols}) VALUES ${placeholders}`, values);
  }
  return dataRows.length;
}

const PLAN = {
  'servicio-mesas': {
    truncate: ['mesas', 'ubicaciones', 'outbox_events', 'idempotency_keys'],
    inserts: [
      { table: 'ubicaciones', columns: ['id', 'nombre', 'createdAt', 'updatedAt'], data: () => rows.ubicaciones.map((u) => ({ ...u, createdAt: HOY, updatedAt: ahora })) },
      { table: 'mesas', columns: ['id', 'numero', 'capacidad', 'ubicacionId', 'estado', 'cuentaAsociada', 'createdAt', 'updatedAt'], data: () => rows.mesas },
    ],
  },
  'servicio-inventario': {
    truncate: ['productos', 'categorias', 'outbox_events', 'idempotency_keys'],
    inserts: [
      { table: 'categorias', columns: ['id', 'nombre', 'descripcion', 'createdAt', 'updatedAt'], data: () => rows.categorias.map((c) => ({ ...c, createdAt: HOY, updatedAt: ahora })) },
      { table: 'productos', columns: ['id', 'categoriaId', 'nombre', 'descripcion', 'precio', 'disponible', 'stockActual', 'createdAt', 'updatedAt'], data: () => rows.productos.map((p) => ({ id: p.id, categoriaId: p.categoria.id, nombre: p.nombre, descripcion: null, precio: p.precio, disponible: p.disponibleFinal, stockActual: p.stockActualFinal, createdAt: HOY, updatedAt: ahora })) },
    ],
  },
  'servicio-pedidos': {
    truncate: ['pedido_items', 'pedidos', 'mesas_local', 'productos_locales', 'outbox_events', 'idempotency_keys'],
    inserts: [
      { table: 'mesas_local', columns: ['id', 'numero', 'updatedAt'], data: () => rows.mesasLocal },
      { table: 'productos_locales', columns: ['id', 'nombre', 'precio', 'stockActual', 'categoriaNombre', 'disponible'], data: () => rows.productosLocales },
      { table: 'pedidos', columns: ['id', 'mesaId', 'numeroMesa', 'estado', 'total', 'comensales', 'meseroId', 'meseroNombre', 'createdAt', 'updatedAt'], data: () => rows.pedidos },
      { table: 'pedido_items', columns: ['id', 'pedidoId', 'productoId', 'nombre', 'cantidad', 'precioUnitario', 'area', 'estado', 'comensal', 'meseroId', 'meseroNombre'], data: () => rows.pedidoItems },
    ],
  },
  'servicio-reservas': {
    truncate: ['"Reserva"', 'outbox_events'],
    inserts: [
      { table: '"Reserva"', columns: ['id', 'clienteNombre', 'clienteTelefono', 'fecha', 'hora', 'mesaPreferida', 'numComensales', 'estado', 'createdAt', 'updatedAt'], data: () => rows.reservas },
    ],
  },
  'servicio-cuentas': {
    truncate: ['cuentas', 'outbox_events', 'idempotency_keys'],
    inserts: [
      { table: 'cuentas', columns: ['id', 'mesaId', 'pedidos', 'total', 'estado', 'ticket', 'createdAt', 'updatedAt'], data: () => rows.cuentas },
    ],
  },
  'servicio-caja': {
    truncate: ['movimientos_caja', 'cierres_caja', 'arqueos_caja', 'transacciones', 'cuentas_abiertas', 'turnos_caja', 'outbox_events', 'idempotency_keys'],
    inserts: [
      { table: 'turnos_caja', columns: ['id', 'cajaId', 'cajaNombre', 'usuarioId', 'cajeroNombre', 'fondoInicial', 'estado', 'abiertoAt', 'cerradoAt', 'createdAt', 'updatedAt'], data: () => rows.turnos },
      { table: 'transacciones', columns: ['id', 'cuentaId', 'turnoId', 'mesaId', 'monto', 'descuento', 'metodo', 'referencia', 'notas', 'createdAt'], data: () => rows.transacciones },
      { table: 'movimientos_caja', columns: ['id', 'turnoId', 'tipo', 'cuentaId', 'transaccionId', 'mesaId', 'donde', 'metodo', 'monto', 'descuento', 'propina', 'motivo', 'createdAt'], data: () => rows.movimientos },
      { table: 'cierres_caja', columns: ['id', 'turnoId', 'montoEsperado', 'montoReal', 'diferencia', 'usuarioId', 'resumen', 'createdAt'], data: () => rows.cierres },
      { table: 'arqueos_caja', columns: ['id', 'turnoId', 'denominaciones', 'efectivoEsperado', 'efectivoContado', 'diferencia', 'usuarioId', 'createdAt'], data: () => rows.arqueos },
    ],
  },
  'servicio-reportes': {
    truncate: ['ventas_diarias', 'idempotency_keys'],
    inserts: [
      { table: 'ventas_diarias', columns: ['id', 'cuentaId', 'mesaId', 'total', 'items', 'meseroId', 'meseroNombre', 'fecha'], data: () => rows.ventasDiarias },
    ],
  },
  'servicio-notificaciones': {
    truncate: ['"Notificacion"', 'idempotency_keys'],
    inserts: [
      { table: '"Notificacion"', columns: ['id', 'eventoOrigen', 'destinatario', 'canal', 'contenido', 'estado', 'intentos', 'timestamp'], data: () => rows.notificaciones },
    ],
  },
};

async function main() {
  console.log(`Sembrando ${DIAS_HISTORIA} días de historia hasta ${HOY.toISOString().slice(0, 10)}...\n`);

  if (process.env.DRY_RUN === '1') {
    console.log('DRY_RUN=1: no se toca ninguna base de datos. Conteos generados en memoria:\n');
    for (const [key, val] of Object.entries(rows)) {
      console.log(`  ${key}: ${val.length}`);
    }
    return;
  }

  for (const servicio of SERVICIOS) {
    const plan = PLAN[servicio];
    const databaseUrl = leerDatabaseUrl(servicio);
    const pool = new Pool({ connectionString: databaseUrl });
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`TRUNCATE TABLE ${plan.truncate.join(', ')} RESTART IDENTITY CASCADE`);

      const counts = {};
      for (const ins of plan.inserts) {
        const data = ins.data();
        const n = await bulkInsert(client, ins.table, ins.columns, data);
        counts[ins.table] = n;
      }
      await client.query('COMMIT');
      console.log(`✅ ${servicio}:`, counts);
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`❌ Error en ${servicio}:`, err.message);
      throw err;
    } finally {
      client.release();
      await pool.end();
    }
  }

  console.log('\n🎉 Limpieza + seed histórico completado (identidad_db no fue tocada).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
