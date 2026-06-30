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
      content = content.replace(/\bvi\./g, 'jest.');
      content = content.replace(/:\s*vi\b/g, ': jest');
      content = content.replace(/\=\s*vi\b/g, '= jest');
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

walk('apps');
