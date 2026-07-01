const fs = require('fs');
const file = 'apps/servicio-pedidos/src/app/app.service.spec.ts';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(/jest\.requireActual/g, 'vi.importActual');
content = content.replace(/jest\.mock/g, 'vi.mock');
content = content.replace(/jest\.fn/g, 'vi.fn');
content = content.replace(/jest\.spyOn/g, 'vi.spyOn');
content = content.replace(/jest\.clearAllMocks/g, 'vi.clearAllMocks');
content = content.replace(/jest\.restoreAllMocks/g, 'vi.restoreAllMocks');
content = content.replace(/jest\.useFakeTimers/g, 'vi.useFakeTimers');
content = content.replace(/jest\.useRealTimers/g, 'vi.useRealTimers');
content = content.replace(/jest\.setSystemTime/g, 'vi.setSystemTime');
content = content.replace(/@jest\/globals/g, 'vitest');

content = content.replace(
  "vi.mock('@org/resiliencia', () => {\n  const actual = vi.importActual('@org/resiliencia')",
  "vi.mock('@org/resiliencia', async () => {\n  const actual = await vi.importActual('@org/resiliencia')"
);

content = content.replace(
  "vi.mock('@org/resiliencia', () => {\r\n  const actual = vi.importActual('@org/resiliencia')",
  "vi.mock('@org/resiliencia', async () => {\r\n  const actual = await vi.importActual('@org/resiliencia')"
);

if (!content.includes("import { vi }")) {
  content = "import { vi } from 'vitest';\n" + content;
}

fs.writeFileSync(file, content, 'utf8');
console.log('Fixed app.service.spec.ts in servicio-pedidos');
