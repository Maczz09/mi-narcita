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

    content = content.replace(/jest\.fn/g, 'vi.fn');
    content = content.replace(/jest\.mock/g, 'vi.mock');
    content = content.replace(/jest\.spyOn/g, 'vi.spyOn');
    content = content.replace(/jest\.clearAllMocks/g, 'vi.clearAllMocks');
    content = content.replace(/jest\.restoreAllMocks/g, 'vi.restoreAllMocks');
    content = content.replace(/jest\.requireActual/g, 'vi.importActual');
    content = content.replace(/jest\.useFakeTimers/g, 'vi.useFakeTimers');
    content = content.replace(/jest\.setSystemTime/g, 'vi.setSystemTime');
    content = content.replace(/@jest\/globals/g, 'vitest');
    
    // Sometimes jest is imported: import { jest } from '@jest/globals'
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
console.log('Replaced jest with vi in ' + replacedCount + ' files.');
