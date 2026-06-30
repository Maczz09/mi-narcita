const fs = require('fs');
const services = ['servicio-notificaciones', 'servicio-reportes', 'servicio-reservas', 'servicio-mesas', 'servicio-identidad'];
services.forEach(srv => {
  const file = 'apps/' + srv + '/tsconfig.spec.json';
  if (fs.existsSync(file)) {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!data.compilerOptions) data.compilerOptions = {};
    data.compilerOptions.emitDecoratorMetadata = true;
    data.compilerOptions.experimentalDecorators = true;
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  }
});
