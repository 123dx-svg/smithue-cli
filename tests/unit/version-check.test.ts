import { afterEach, describe, expect, it, vi } from 'vitest';

import { checkVersionCompat } from '../../src/version-check.js';

describe('checkVersionCompat', () => {
  const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);

  afterEach(() => {
    stderrWrite.mockClear();
  });

  it('is silent for matching versions', () => {
    checkVersionCompat('0.7.1', '0.7.1');

    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('is silent when only patch differs', () => {
    checkVersionCompat('0.7.1', '0.7.2');

    expect(stderrWrite).not.toHaveBeenCalled();
  });

  it('warns on major or minor mismatch', () => {
    checkVersionCompat('0.7.1', '0.8.0');

    expect(stderrWrite).toHaveBeenCalledTimes(1);
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining('smithue-cli upgrade'),
    );
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining('0.7.1'),
    );
    expect(stderrWrite).toHaveBeenCalledWith(
      expect.stringContaining('0.8.0'),
    );
  });

  it('is silent when plugin version is undefined', () => {
    checkVersionCompat('0.7.1', undefined);

    expect(stderrWrite).not.toHaveBeenCalled();
  });
});
