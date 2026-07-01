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

  content = content.replace(/jest\.mock/g, 'vi.mock');
  content = content.replace(/jest\.fn/g, 'vi.fn');
  content = content.replace(/jest\.spyOn/g, 'vi.spyOn');
  content = content.replace(/jest\.clearAllMocks/g, 'vi.clearAllMocks');
  content = content.replace(/jest\.restoreAllMocks/g, 'vi.restoreAllMocks');
  content = content.replace(/jest\.useFakeTimers/g, 'vi.useFakeTimers');
  content = content.replace(/jest\.useRealTimers/g, 'vi.useRealTimers');
  content = content.replace(/jest\.setSystemTime/g, 'vi.setSystemTime');
  content = content.replace(/jest\.stubGlobal/g, 'vi.stubGlobal');
  content = content.replace(/jest\.unstubAllGlobals/g, 'vi.unstubAllGlobals');
  
  if (spec.endsWith('theme.spec.ts') || spec.endsWith('useOnlineStatus.spec.ts') || spec.endsWith('useFocusTrap.spec.ts') || spec.endsWith('useInicioData.spec.ts') || spec.endsWith('useComanda.spec.ts') || spec.endsWith('useNow.spec.ts')) {
     if (!content.includes('@vitest-environment jsdom')) {
        content = "// @vitest-environment jsdom\n" + content;
     }
  }

  if (content !== original) {
    if (content.match(/vi\.(mock|fn|spyOn|clearAllMocks|restoreAllMocks|useFakeTimers|useRealTimers|setSystemTime|stubGlobal|unstubAllGlobals)/)) {
      if (!content.includes('import { vi } from')) {
        content = "import { vi } from 'vitest';\n" + content;
      }
    }
    fs.writeFileSync(spec, content, 'utf8');
    replacedCount++;
  }
});
console.log('Fixed imports in ' + replacedCount + ' files in pwa-cliente.');
