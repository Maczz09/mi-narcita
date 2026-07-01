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
      } else if (file.endsWith('.spec.ts')) {
        results.push(file);
      }
    });
  } catch(e) {}
  return results;
}

const appsDir = 'apps';
const projects = fs.readdirSync(appsDir).filter(p => p.startsWith('servicio-') && !p.endsWith('-e2e'));
let replacedCount = 0;

projects.forEach(project => {
  const specs = walk(path.join(appsDir, project, 'src'));
  specs.forEach(spec => {
    let content = fs.readFileSync(spec, 'utf8');
    let original = content;

    content = content.replace(/jest[\s\n]*\.[\s\n]*fn/g, 'vi.fn');
    content = content.replace(/jest[\s\n]*\.[\s\n]*mock/g, 'vi.mock');
    content = content.replace(/jest[\s\n]*\.[\s\n]*spyOn/g, 'vi.spyOn');
    content = content.replace(/jest[\s\n]*\.[\s\n]*clearAllMocks/g, 'vi.clearAllMocks');
    content = content.replace(/jest[\s\n]*\.[\s\n]*restoreAllMocks/g, 'vi.restoreAllMocks');
    content = content.replace(/jest[\s\n]*\.[\s\n]*requireActual/g, 'vi.importActual');
    content = content.replace(/jest[\s\n]*\.[\s\n]*useFakeTimers/g, 'vi.useFakeTimers');
    content = content.replace(/jest[\s\n]*\.[\s\n]*useRealTimers/g, 'vi.useRealTimers');
    content = content.replace(/jest[\s\n]*\.[\s\n]*setSystemTime/g, 'vi.setSystemTime');
    
    // Also remove the `import { jest }` from anywhere
    content = content.replace(/import\s+\{\s*jest\s*\}\s+from\s+'vitest';/g, '');
    
    if (content !== original) {
      if (!content.includes('import { vi } from')) {
        content = "import { vi } from 'vitest';\n" + content;
      }
      fs.writeFileSync(spec, content, 'utf8');
      replacedCount++;
    }
  });
});
console.log('Replaced multiline jest with vi in ' + replacedCount + ' files.');
