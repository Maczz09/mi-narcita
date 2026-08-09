import type { IconName } from '../ui/icons';

export interface NavItem {
  key: string;
  label: string;
  shortLabel: string;
  icon: IconName;
  priority: number;
}

export interface NavGroup {
  group: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    group: 'Operación',
    items: [
      { key: 'inicio', label: 'Inicio', shortLabel: 'Inicio', icon: 'Inicio', priority: 0 },
      { key: 'mesas', label: 'Mesas', shortLabel: 'Mesas', icon: 'Mesas', priority: 1 },
      { key: 'pedidos', label: 'Pedidos', shortLabel: 'Pedidos', icon: 'Pedidos', priority: 2 },
      { key: 'cocina', label: 'Cocina', shortLabel: 'Cocina', icon: 'Cocina', priority: 3 },
      { key: 'caja', label: 'Caja', shortLabel: 'Caja', icon: 'Caja', priority: 4 },
      { key: 'reservas', label: 'Reservas', shortLabel: 'Reservas', icon: 'Reservas', priority: 5 },
    ],
  },
  {
    group: 'Administración',
    items: [
      { key: 'carta', label: 'Carta / Menú', shortLabel: 'Carta', icon: 'Pedidos', priority: 8 },
      { key: 'compras', label: 'Compras', shortLabel: 'Compras', icon: 'Bag', priority: 10 },
      { key: 'inventario', label: 'Inventario', shortLabel: 'Stock', icon: 'Inventario', priority: 7 },
      { key: 'categorias', label: 'Categorías', shortLabel: 'Categorías', icon: 'Tag', priority: 7.5 },
      { key: 'reportes', label: 'Reportes', shortLabel: 'Reportes', icon: 'Reportes', priority: 9 },
      { key: 'historial-caja', label: 'Historial de caja', shortLabel: 'Hist. Caja', icon: 'Caja', priority: 9.5 },
      { key: 'usuarios', label: 'Usuarios', shortLabel: 'Usuarios', icon: 'Usuarios', priority: 11 },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);
