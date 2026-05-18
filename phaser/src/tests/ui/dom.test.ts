import { describe, expect, it } from 'vitest';
import { formatNumber, parseIntegerInput, resourceCostText } from '../../ui/dom';

describe('DOM UI helpers', () => {
  it('formats whole numbers for compact UI display', () => {
    expect(formatNumber(1234.8)).toBe('1,235');
  });

  it('renders resource costs in stable resource order', () => {
    expect(resourceCostText({ iron: 20, gc: 300, octarine: 0 })).toBe('300 GC, 20 iron');
  });

  it('rejects blank, fractional, non-finite, and out-of-range integer input', () => {
    expect(parseIntegerInput('', { label: 'Count', min: 1 })).toEqual({ ok: false, message: 'Count must be a whole number.' });
    expect(parseIntegerInput('2.5', { label: 'Count', min: 1 })).toEqual({ ok: false, message: 'Count must be a whole number.' });
    expect(parseIntegerInput('Infinity', { label: 'Count', min: 1 })).toEqual({
      ok: false,
      message: 'Count must be a whole number.',
    });
    expect(parseIntegerInput('0', { label: 'Count', min: 1 })).toEqual({ ok: false, message: 'Count must be at least 1.' });
    expect(parseIntegerInput('11', { label: 'Count', min: 1, max: 10 })).toEqual({
      ok: false,
      message: 'Count must be at most 10.',
    });
  });

  it('parses valid integer input without coercing it', () => {
    expect(parseIntegerInput('7', { label: 'Count', min: 1, max: 10 })).toEqual({ ok: true, value: 7 });
  });
});
