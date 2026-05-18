import { describe, expect, it } from 'vitest';
import { formatNumber, resourceCostText } from '../../ui/dom';

describe('DOM UI helpers', () => {
  it('formats whole numbers for compact UI display', () => {
    expect(formatNumber(1234.8)).toBe('1,235');
  });

  it('renders resource costs in stable resource order', () => {
    expect(resourceCostText({ iron: 20, gc: 300, octarine: 0 })).toBe('300 GC, 20 iron');
  });
});
