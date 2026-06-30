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
      
      content = content.replace(/as jest\.Mock(\<any,\s*any\>)?\)/g, 'as unknown as jest.Mock)');
      content = content.replace(/mockResolvedValue\(undefined\)/g, 'mockResolvedValue({} as any)');
      content = content.replace(/mockResolvedValue\(\)/g, 'mockResolvedValue({} as any)');
      
      content = content.replace('import { describe, it, expect, jest }', 'import { describe, it, expect }');
      content = content.replace('import { describe, expect, it, jest }', 'import { describe, expect, it }');
      content = content.replace('import { describe, it, expect, beforeEach, jest }', 'import { describe, it, expect, beforeEach }');
      content = content.replace(', jest } from \'@jest/globals\'', ' } from \'@jest/globals\'');
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

walk('apps');
