const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('.spec.ts')) results.push(file);
  });
  return results;
}
const specs = walk('apps/servicio-pedidos/src');
specs.forEach(spec => {
  let content = fs.readFileSync(spec, 'utf8');
  content = content.replace(/jest\.importActual/g, 'jest.requireActual');
  content = content.replace(/jest\.mock\('([^']+)', async \(\) => \{/g, "jest.mock('$1', () => {");
  content = content.replace(/const actual = await /g, 'const actual = ');
  fs.writeFileSync(spec, content, 'utf8');
});
console.log('Fixed requireActual and async mocks in servicio-pedidos');
