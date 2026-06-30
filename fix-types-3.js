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
      
      // Fix jest.Mock casts
      content = content.replace(/as unknown as jest\.Mock\)/g, 'as any)');
      content = content.replace(/as jest\.Mock\)/g, 'as any)');
      
      // Fix jest.fn() returning never when used with mockResolvedValue
      content = content.replace(/jest\.fn\(\)\.mockResolvedValue/g, 'jest.fn<any>().mockResolvedValue');
      content = content.replace(/jest\.fn\(\)\.mockRejectedValue/g, 'jest.fn<any>().mockRejectedValue');
      
      // Fix unused jest import
      content = content.replace(/import\s*\{\s*([^}]*?)jest([^}]*?)\}\s*from\s*['"]@jest\/globals['"];?/g, (match, p1, p2) => {
         let newImport = match.replace(/,?s*\bjest\b\s*,?/, '');
         newImport = newImport.replace(/,\s*\}/, ' }').replace(/\{\s*,/, '{ ');
         return newImport;
      });
      
      if (content !== original) {
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

walk('apps');
