// @ts-nocheck
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { applyThemeColor } from './theme';

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

  it('does nothing if meta tag not found', () => {
    document.head.removeChild(meta);
    expect(() => applyThemeColor('dark')).not.toThrow();
  });
});

