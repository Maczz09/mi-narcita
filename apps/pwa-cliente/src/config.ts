/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-misused-promises, @typescript-eslint/no-floating-promises, prefer-const, @typescript-eslint/no-unused-vars, @typescript-eslint/restrict-template-expressions, @typescript-eslint/ban-ts-comment */
// src/config.ts - Configuraciones de UI de la aplicación

export const APP_CONFIG = {
  nombreLocal: import.meta.env.VITE_APP_NAME || 'NachoPps',
  ubicacionLocal: import.meta.env.VITE_APP_LOCATION || 'Barranco · Lima',
  turnos: [
    { nombre: 'Turno Día', startHour: 6, endHour: 17 },
    { nombre: 'Turno Noche', startHour: 17, endHour: 6 },
  ]
};

export function getTurnoActual(date = new Date()): string {
  const hour = date.getHours();
  const turno = APP_CONFIG.turnos.find(t => {
    if (t.startHour < t.endHour) {
      return hour >= t.startHour && hour < t.endHour;
    } else {
      // Cruzando medianoche
      return hour >= t.startHour || hour < t.endHour;
    }
  });
  return turno?.nombre || 'Turno Indefinido';
}
