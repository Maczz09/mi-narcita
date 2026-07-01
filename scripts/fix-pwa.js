const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        results = results.concat(walk(file));
      } else if (file.endsWith('.spec.ts') || file.endsWith('.spec.tsx')) {
        results.push(file);
      }
    });
  } catch(e) {}
  return results;
}

const specs = walk('apps/pwa-cliente/src');
let replacedCount = 0;

specs.forEach(spec => {
  let content = fs.readFileSync(spec, 'utf8');
  let original = content;

  content = content.replace(/@jest\/globals/g, 'vitest');
  content = content.replace(/jest\.mock/g, 'vi.mock');
  content = content.replace(/jest\.fn/g, 'vi.fn');
  content = content.replace(/jest\.spyOn/g, 'vi.spyOn');
  
  if (content !== original) {
    if (content.includes('vi.mock') || content.includes('vi.fn') || content.includes('vi.spyOn')) {
      if (!content.includes('import { vi } from')) {
        content = "import { vi } from 'vitest';\n" + content;
      }
    }
    fs.writeFileSync(spec, content, 'utf8');
    replacedCount++;
  }
});
console.log('Fixed imports in ' + replacedCount + ' files in pwa-cliente.');
