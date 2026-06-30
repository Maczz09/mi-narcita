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
      
      content = content.replace(/as jest\.Mock\)/g, 'as jest.Mock<any, any>)');
      content = content.replace(/mockResolvedValue\(undefined\)/g, 'mockResolvedValue({} as any)');
      content = content.replace(/\{ numero: 10 \}/g, '{ numero: 10, capacidad: 4 }');
      content = content.replace(/mockResolvedValue\(\[\]\)/g, 'mockResolvedValue([] as any)');
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

walk('apps');
