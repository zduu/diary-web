import { describe, expect, it } from 'vitest';
import { formatMeters, formatPositiveIntegerCount } from './numberFormat';

describe('numberFormat', () => {
  it('formats finite meter values with one decimal place', () => {
    expect(formatMeters(0)).toBe('0.0米');
    expect(formatMeters(12.34)).toBe('12.3米');
  });

  it('uses an unknown label for missing or non-finite meter values', () => {
    expect(formatMeters()).toBe('未知');
    expect(formatMeters(null)).toBe('未知');
    expect(formatMeters(-1)).toBe('未知');
    expect(formatMeters(Number.NaN)).toBe('未知');
    expect(formatMeters(Number.POSITIVE_INFINITY)).toBe('未知');
  });

  it('formats positive integer counts with an optional unit', () => {
    expect(formatPositiveIntegerCount(1)).toBe('1');
    expect(formatPositiveIntegerCount(2, '次')).toBe('2次');
  });

  it('uses an unknown label for invalid counts', () => {
    expect(formatPositiveIntegerCount()).toBe('未知');
    expect(formatPositiveIntegerCount(null)).toBe('未知');
    expect(formatPositiveIntegerCount(0)).toBe('未知');
    expect(formatPositiveIntegerCount(-1)).toBe('未知');
    expect(formatPositiveIntegerCount(1.5)).toBe('未知');
    expect(formatPositiveIntegerCount(Number.NaN)).toBe('未知');
    expect(formatPositiveIntegerCount(Number.POSITIVE_INFINITY)).toBe('未知');
  });
});
