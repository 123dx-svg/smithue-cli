import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSpec, SpecValidationError } from './loader.js';

const fixturesDir = path.resolve(process.cwd(), 'fixtures/specs');

describe('loadSpec', () => {
  it('loads a valid prop spec', async () => {
    const spec = await loadSpec(path.join(fixturesDir, 'prop.valid.json'));

    expect(spec.schemaVersion).toBe('1.0.0');
    expect(spec.id).toBe('prop');
    expect(spec.rules.naming?.pattern).toBeDefined();
  });

  it('loads a valid character spec', async () => {
    const spec = await loadSpec(path.join(fixturesDir, 'character.valid.json'));

    expect(spec.schemaVersion).toBe('1.0.0');
    expect(spec.id).toBe('character');
  });

  it('rejects spec missing schemaVersion with field error', async () => {
    await expect(loadSpec(path.join(fixturesDir, 'missing-schema-version.invalid.json'))).rejects.toThrow(
      SpecValidationError,
    );
    await expect(loadSpec(path.join(fixturesDir, 'missing-schema-version.invalid.json'))).rejects.toMatchObject({
      fields: expect.arrayContaining(['schemaVersion']),
    });
  });

  it('rejects spec with bad name pattern type with field error', async () => {
    await expect(loadSpec(path.join(fixturesDir, 'bad-name-pattern.invalid.json'))).rejects.toThrow(
      SpecValidationError,
    );
    await expect(loadSpec(path.join(fixturesDir, 'bad-name-pattern.invalid.json'))).rejects.toMatchObject({
      fields: expect.arrayContaining(['rules/naming/pattern']),
    });
  });

  it('rejects spec with wrong schemaVersion value', async () => {
    await expect(
      loadSpec(path.join(fixturesDir, 'wrong-schema-version.invalid.json')),
    ).rejects.toThrow(SpecValidationError);
    await expect(loadSpec(path.join(fixturesDir, 'wrong-schema-version.invalid.json'))).rejects.toMatchObject({
      fields: expect.arrayContaining(['schemaVersion']),
    });
  });
});
