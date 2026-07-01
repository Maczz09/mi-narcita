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
const specs = walk('apps').filter(p => !p.includes('pwa-cliente') && !p.includes('servicio-pedidos'));
specs.forEach(spec => {
  let content = fs.readFileSync(spec, 'utf8');
  content = content.replace(/import \{.*?\} from 'vitest';\n?/g, '');
  content = content.replace(/vi\./g, 'jest.');
  content = content.replace(/jest\.importActual/g, 'jest.requireActual');
  content = content.replace(/jest\.mock\('([^']+)', async \(\) => \{/g, "jest.mock('$1', () => {");
  content = content.replace(/const actual = await /g, 'const actual = ');
  fs.writeFileSync(spec, content, 'utf8');
});
console.log('Fixed vitest/jest pollution in all backend services');
