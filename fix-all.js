const fs = require('fs');
const path = require('path');

function walk(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath);
    } else if (fullPath.endsWith('.spec.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;
      
      content = content.replace(/jest\.fn\(\)/g, 'jest.fn<any>()');
      
      content = content.replace('import { describe, expect, it, as jest } from', 'import { describe, expect, it } from');
      content = content.replace('import { describe, it, expect, beforeEach, as jest } from', 'import { describe, it, expect, beforeEach } from');
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

walk('apps');
