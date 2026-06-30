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
      
      content = content.replace(/import\s+\{([^\}]+)\}\s+from\s+['"]@jest\/globals['"];/g, (match, importsStr) => {
         const parts = importsStr.split(',').map(s => s.trim()).filter(s => s && s !== 'jest' && !s.includes('as jest'));
         return `import { ${parts.join(', ')} } from '@jest/globals';`;
      });
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

walk('apps');
