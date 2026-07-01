const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) results = results.concat(walk(file));
    else if (file.endsWith('lcov.info')) results.push(file);
  });
  return results;
}

const allLcovs = walk('.');

allLcovs.forEach(lcovFile => {
  if (lcovFile.includes('node_modules')) return;
  
  let content = fs.readFileSync(lcovFile, 'utf8');
  let lines = content.split('\n');
  let changed = false;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('SF:')) {
      let relativePath = lines[i].substring(3);
      // Fix backslashes
      relativePath = relativePath.replace(/\\/g, '/');
      
      // If the path is just 'src/...', we need to prefix it with the project folder
      // e.g., apps/pwa-cliente/src/... if the lcov file is in coverage/apps/pwa-cliente
      if (relativePath.startsWith('src/')) {
        const parts = lcovFile.replace(/\\/g, '/').split('/');
        // Assuming coverage/apps/<project>/lcov.info
        const idx = parts.indexOf('apps');
        if (idx !== -1 && parts.length > idx + 1) {
          const projectName = parts[idx + 1];
          relativePath = `apps/${projectName}/${relativePath}`;
        }
      }

      lines[i] = 'SF:' + relativePath;
      changed = true;
    }
  }

  if (changed) {
    fs.writeFileSync(lcovFile, lines.join('\n'), 'utf8');
    console.log('Fixed paths in: ' + lcovFile);
  }
});
