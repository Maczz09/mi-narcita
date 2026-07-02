const fs = require('fs');
let code = fs.readFileSync('stress-tests/run-all-stress-tests.js', 'utf8');

// Fix 409 conflict for mesas by using random numbers
code = code.replace(/numero: 900 \+ i/g, 'numero: Math.floor(Math.random() * 100000) + 9000 + i');
code = code.replace(/numero: 800 \+ i/g, 'numero: Math.floor(Math.random() * 100000) + 8000 + i');
code = code.replace(/numero: 700 \+ i/g, 'numero: Math.floor(Math.random() * 100000) + 7000 + i');

// Fix Test 3: Pedidos Concurrent Order Creation (replace 'test-product')
const test3Replacement = `
async function testPedidosConcurrentCreate() {
  console.log('\\n═══ TEST 3: servicio-pedidos — Concurrent Order Creation ═══');
  const mesasRes = await req('GET', '/mesas', null, adminToken);
  const mesaId = mesasRes.data?.[0]?.id;
  if (!mesaId) { console.log('  ⚠ No mesas found, skipping'); return; }
  
  const prods = await req('GET', '/inventario/productos', null, adminToken);
  const realProdId = prods.data?.[0]?.id || 'f1b9b9b9-1111-2222-3333-444444444444';

  await runConcurrent('Pedidos concurrent creation', async (i) => {
    return req('POST', '/pedidos', {
      mesaId,
      items: [{ productoId: realProdId, cantidad: 1, area: 'COCINA' }]
    }, adminToken);
`;
code = code.replace(/async function testPedidosConcurrentCreate\(\) \{[\s\S]*?items: \[\{ productoId: 'test-product', cantidad: 1, area: 'COCINA' \}\][\s\S]*?\}, adminToken\);\n/m, test3Replacement);

// Fix Test 8: Inventario product creation (category)
const test8Replacement = `
async function testInventarioConcurrentCreate() {
  console.log('\\n═══ TEST 6b: servicio-inventario — Concurrent Product Creation ═══');
  const cats = await req('GET', '/inventario/categorias', null, adminToken);
  const categoriaId = cats.data?.[0]?.id || 'f1b9b9b9-1111-2222-3333-444444444444';
  
  await runConcurrent('Inventario concurrent product creation', async (i) => {
    return req('POST', '/inventario/productos', {
      nombre: \`Stress Prod \${Date.now()} \${i}\`, precio: 10, categoriaId, stockActual: 100
`;
code = code.replace(/async function testInventarioConcurrentCreate\(\) \{[\s\S]*?return req\('POST', '\/inventario\/productos', \{\n\s*nombre: `Stress Prod \$\{i\}`, precio: 10, categoriaId/m, test8Replacement);

// Fix Test 11: Full flow
const test11Replacement = `
async function testFullFlowConcurrent() {
  console.log('\\n═══ TEST 9: Cross-service — Full Order-to-Payment Flow ═══');
  const prods = await req('GET', '/inventario/productos', null, adminToken);
  const realProdId = prods.data?.[0]?.id || 'f1b9b9b9-1111-2222-3333-444444444444';

  await runConcurrent('Full flow: mesa→pedido→cuenta→pago', async (i) => {
    // 1. Create mesa
    const mesa = await req('POST', '/mesas', {
      numero: Math.floor(Math.random() * 100000) + 8000 + i, capacidad: 2, ubicacion: 'STRESS-TEST'
    }, adminToken);
    if (!mesa.ok) return mesa;
    const mesaId = mesa.data?.id;

    // 2. Create pedido
    const pedido = await req('POST', '/pedidos', {
      mesaId,
      items: [{ productoId: realProdId, cantidad: 1, area: 'COCINA' }]
`;
code = code.replace(/async function testFullFlowConcurrent\(\) \{[\s\S]*?items: \[\{ productoId: 'stress-product', cantidad: 1, area: 'COCINA' \}\]/m, test11Replacement);

// Fix Test 12: Multi-table
const test12Replacement = `
async function testMultiTableCycle() {
  console.log('\\n═══ TEST 10: Cross-service — Multi-Table Concurrent Full Cycle ═══');
  const prods = await req('GET', '/inventario/productos', null, adminToken);
  const realProdId = prods.data?.[0]?.id || 'f1b9b9b9-1111-2222-3333-444444444444';
  const realProdId2 = prods.data?.[1]?.id || realProdId;
  const TABLES = 10;
  
  await runConcurrent(\`\${TABLES} tables doing full cycle simultaneously\`, async (i) => {
    const mesa = await req('POST', '/mesas', {
      numero: Math.floor(Math.random() * 100000) + 7000 + i, capacidad: 4, ubicacion: \`MULTI-\${i}\`
    }, adminToken);
    if (!mesa.ok) return mesa;

    const pedido = await req('POST', '/pedidos', {
      mesaId: mesa.data.id,
      items: [
        { productoId: realProdId, cantidad: 2, area: 'COCINA' },
        { productoId: realProdId2, cantidad: 1, area: 'BAR' }
      ]
`;
code = code.replace(/async function testMultiTableCycle\(\) \{[\s\S]*?items: \[\n\s*\{ productoId: 'prod-1', cantidad: 2, area: 'COCINA' \},\n\s*\{ productoId: 'prod-2', cantidad: 1, area: 'BAR' \}\n\s*\]/m, test12Replacement);

fs.writeFileSync('stress-tests/run-all-stress-tests.js', code);
