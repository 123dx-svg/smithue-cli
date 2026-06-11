import { describe, expect, it } from 'vitest';
import { isProcessAlive } from '../../src/proc.js';

describe('isProcessAlive', () => {
  it('returns true for the current process', () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it('returns false for pid <= 0', () => {
    expect(isProcessAlive(0)).toBe(false);
  });

  it('returns false for a missing process', () => {
    expect(isProcessAlive(999999999)).toBe(false);
  });
});
