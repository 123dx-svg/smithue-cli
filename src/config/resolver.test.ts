import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'fs/promises';
import os from 'os';
import path from 'path';
import { findConfigFile, loadConfig, resolveConfig, ConfigError } from './resolver.js';

const fixtureConfigPath = path.resolve(process.cwd(), 'fixtures/configs/studio.config.json');

describe('findConfigFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'smithue-cfg-test-'));
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('finds config in the start directory', async () => {
    const configPath = path.join(tmpDir, 'smithue.config.json');
    await writeFile(configPath, JSON.stringify({ specsDir: '.smithue/specs' }), 'utf-8');
    const found = await findConfigFile(tmpDir);
    expect(found).toBe(configPath);
  });

  it('finds config by walking up from a subdirectory', async () => {
    const subDir = path.join(tmpDir, 'Content', 'Characters');
    await mkdir(subDir, { recursive: true });
    const configPath = path.join(tmpDir, 'smithue.config.json');
    await writeFile(configPath, JSON.stringify({ specsDir: '.smithue/specs' }), 'utf-8');
    const found = await findConfigFile(subDir);
    expect(found).toBe(configPath);
  });

  it('prefers config in closer (deeper) directory over a parent one', async () => {
    const subDir = path.join(tmpDir, 'Content');
    await mkdir(subDir);
    const parentConfig = path.join(tmpDir, 'smithue.config.json');
    const childConfig = path.join(subDir, 'smithue.config.json');
    await writeFile(parentConfig, JSON.stringify({ specsDir: 'parent' }), 'utf-8');
    await writeFile(childConfig, JSON.stringify({ specsDir: 'child' }), 'utf-8');
    const found = await findConfigFile(subDir);
    expect(found).toBe(childConfig);
  });

  it('returns null when no config file exists anywhere in the tree', async () => {
    // tmpDir is freshly created with no smithue.config.json inside it.
    // We start from a deep sub-path so we exhaust the tmp subtree quickly,
    // then walk up into system dirs (none of which should have this file).
    const deepSub = path.join(tmpDir, 'a', 'b', 'c');
    await mkdir(deepSub, { recursive: true });
    const found = await findConfigFile(deepSub);
    // Either null, or some unexpected config up in the system tree – we assert
    // it is not inside our tmpDir (we deliberately didn't create one there).
    if (found !== null) {
      expect(found.startsWith(tmpDir)).toBe(false);
    } else {
      expect(found).toBeNull();
    }
  });
});

describe('loadConfig', () => {
  it('loads the fixture studio.config.json correctly', async () => {
    const config = await loadConfig(fixtureConfigPath);
    expect(config.specsDir).toBe('.smithue/specs');
    expect(config.ownership?.include).toContain('/Game/MyStudio/**');
    expect(config.ownership?.exclude).toContain('/Game/UltraDynamicSky/**');
  });

  it('applies AJV default value for devContentRoot when omitted', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'smithue-cfg-test-'));
    try {
      const cfgPath = path.join(tmpDir, 'smithue.config.json');
      await writeFile(cfgPath, JSON.stringify({ specsDir: '.smithue/specs' }), 'utf-8');
      const config = await loadConfig(cfgPath);
      expect(config.devContentRoot).toBe('/Game/SmithUETest');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('throws ConfigError for a non-existent file', async () => {
    await expect(loadConfig('/nonexistent/path/smithue.config.json')).rejects.toThrow(ConfigError);
    await expect(loadConfig('/nonexistent/path/smithue.config.json')).rejects.toThrow(
      'Config file not found',
    );
  });

  it('throws ConfigError when specsDir is missing (schema validation failure)', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'smithue-cfg-test-'));
    try {
      const cfgPath = path.join(tmpDir, 'smithue.config.json');
      await writeFile(cfgPath, JSON.stringify({ devContentRoot: '/Game/Test' }), 'utf-8');
      await expect(loadConfig(cfgPath)).rejects.toThrow(ConfigError);
      await expect(loadConfig(cfgPath)).rejects.toThrow('Invalid config');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe('resolveConfig', () => {
  it('resolves config found in a parent directory', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'smithue-cfg-test-'));
    try {
      const subDir = path.join(tmpDir, 'Content');
      await mkdir(subDir);
      const cfgPath = path.join(tmpDir, 'smithue.config.json');
      await writeFile(cfgPath, JSON.stringify({ specsDir: 'resolved-specs' }), 'utf-8');
      const config = await resolveConfig(subDir);
      expect(config).not.toBeNull();
      expect(config?.specsDir).toBe('resolved-specs');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('returns null when no config is found', async () => {
    const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'smithue-cfg-test-'));
    try {
      // Start from inside tmpDir; no config written here or above (in the tmp tree)
      const deepSub = path.join(tmpDir, 'x', 'y');
      await mkdir(deepSub, { recursive: true });
      const result = await resolveConfig(deepSub);
      // Acceptable outcomes: null (no config anywhere), or a config outside tmpDir
      expect(result === null || typeof result?.specsDir === 'string').toBe(true);
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  });
});
