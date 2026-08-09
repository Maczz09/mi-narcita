/// <reference lib="dom" />
// utils/theme.ts — sincroniza la <meta name="theme-color"> con el tema activo,
// para que la barra del navegador / status bar móvil coincida con la app.

export type Theme = 'light' | 'dark' | 'navy';

export const THEMES: readonly Theme[] = ['light', 'dark', 'navy'];

// Coinciden con --bg de cada tema en styles.css.
const THEME_COLOR: Record<Theme, string> = {
  light: '#ffffff',
  dark: '#0d0f13',
  navy: '#1b2844',
};

/** Siguiente tema en el ciclo light → dark → navy → light. */
export function nextTheme(current: Theme): Theme {
  const idx = THEMES.indexOf(current);
  return THEMES[(idx + 1) % THEMES.length] ?? 'light';
}

/** Valida un valor arbitrario (p.ej. de localStorage) como Theme conocido. */
export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value);
}

export function applyThemeColor(theme: Theme): void {
  const meta = document.getElementById('meta-theme-color');
  if (meta) meta.setAttribute('content', THEME_COLOR[theme]);
}
