import { describe, it, expect } from 'vitest';
import { projectId } from '../../src/identity.js';

describe('projectId', () => {
  it('returns the same id for the same path', () => {
    const path = 'F:/Projects/GameA/GameA.uproject';
    expect(projectId(path)).toBe(projectId(path));
  });

  it('returns the same id for path variants that resolve to the same location', () => {
    const base = 'F:/Projects/GameA/GameA.uproject';
    const withTrailingSlash = 'F:/Projects/GameA/./GameA.uproject';
    expect(projectId(base)).toBe(projectId(withTrailingSlash));
  });

  it('returns different ids for different paths', () => {
    expect(projectId('F:/Projects/GameA/GameA.uproject')).not.toBe(
      projectId('F:/Projects/GameB/GameB.uproject'),
    );
  });

  it('returns a 16 character lowercase hex id', () => {
    expect(projectId('F:/Projects/GameA/GameA.uproject')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('normalizes case on Windows', () => {
    if (process.platform !== 'win32') {
      return;
    }

    expect(projectId('F:/Projects/GameA/GameA.uproject')).toBe(
      projectId('f:/projects/gamea/gamea.uproject'),
    );
  });
});
