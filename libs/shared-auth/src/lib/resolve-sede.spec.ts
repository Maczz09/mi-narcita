import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { resolveSedeId } from './resolve-sede';

describe('resolveSedeId', () => {
  it('usa la sede del usuario pineado, ignorando la solicitada', () => {
    expect(resolveSedeId('sede-1', 'sede-2')).toBe('sede-1');
  });

  it('usa la sede del usuario pineado si no viene ninguna solicitada', () => {
    expect(resolveSedeId('sede-1', undefined)).toBe('sede-1');
  });

  it('usa la sede solicitada cuando el usuario no tiene sede fija', () => {
    expect(resolveSedeId(null, 'sede-2')).toBe('sede-2');
    expect(resolveSedeId(undefined, 'sede-2')).toBe('sede-2');
  });

  it('rechaza si el usuario no tiene sede fija y no se indicó ninguna', () => {
    expect(() => resolveSedeId(null, undefined)).toThrow(BadRequestException);
    expect(() => resolveSedeId(null, '')).toThrow(BadRequestException);
  });
});
