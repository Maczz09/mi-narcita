// @vitest-environment jsdom
// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { applyThemeColor, isTheme, nextTheme } from './theme';

describe('applyThemeColor', () => {
  let meta: HTMLMetaElement;

  beforeEach(() => {
    meta = document.createElement('meta');
    meta.id = 'meta-theme-color';
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  });

  afterEach(() => {
    if (meta.parentNode) {
      document.head.removeChild(meta);
    }
  });

  it('sets light theme color', () => {
    applyThemeColor('light');
    expect(meta.getAttribute('content')).toBe('#ffffff');
  });

  it('sets dark theme color', () => {
    applyThemeColor('dark');
    expect(meta.getAttribute('content')).toBe('#0d0f13');
  });

  it('sets navy theme color', () => {
    applyThemeColor('navy');
    expect(meta.getAttribute('content')).toBe('#1b2844');
  });

  it('does nothing if meta tag not found', () => {
    document.head.removeChild(meta);
    expect(() => applyThemeColor('dark')).not.toThrow();
  });
});

describe('nextTheme', () => {
  it('cicla light → dark → navy → light', () => {
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('navy');
    expect(nextTheme('navy')).toBe('light');
  });
});

describe('isTheme', () => {
  it('acepta los 3 temas válidos', () => {
    expect(isTheme('light')).toBe(true);
    expect(isTheme('dark')).toBe(true);
    expect(isTheme('navy')).toBe(true);
  });

  it('rechaza valores legacy, nulos o arbitrarios', () => {
    expect(isTheme('blue')).toBe(false);
    expect(isTheme(null)).toBe(false);
    expect(isTheme(undefined)).toBe(false);
    expect(isTheme('')).toBe(false);
  });
});

