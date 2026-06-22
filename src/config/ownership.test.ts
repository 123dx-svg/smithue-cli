import { describe, it, expect } from 'vitest';
import { createOwnershipChecker } from './ownership.js';

const studioConfig = {
  specsDir: '.smithue/specs',
  ownership: {
    include: ['/Game/MyStudio/**'],
    exclude: ['/Game/UltraDynamicSky/**', '/Game/ThirdParty/**'],
  },
};

describe('isOwned', () => {
  const isOwned = createOwnershipChecker(studioConfig);

  it('accepts an owned path inside MyStudio', () => {
    expect(isOwned('/Game/MyStudio/Props/SM_Crate')).toBe(true);
  });

  it('accepts the include root itself', () => {
    expect(isOwned('/Game/MyStudio')).toBe(true);
  });

  it('rejects /Game/UltraDynamicSky (hard-excluded)', () => {
    expect(isOwned('/Game/UltraDynamicSky/BP_Sky')).toBe(false);
  });

  it('rejects /Game/ThirdParty (hard-excluded)', () => {
    expect(isOwned('/Game/ThirdParty/Plugin/BP_Foo')).toBe(false);
  });

  it('rejects a path not in any include glob', () => {
    expect(isOwned('/Game/OtherStudio/BP_Bar')).toBe(false);
  });

  it('rejects all paths when include is empty (conservative default)', () => {
    const checker = createOwnershipChecker({ specsDir: '.smithue/specs' });
    expect(checker('/Game/Anything')).toBe(false);
    expect(checker('/Game/MyStudio/Props/SM_Crate')).toBe(false);
  });

  it('rejects a path that matches both include and exclude (exclude wins)', () => {
    // Construct a config where an asset could theoretically match both
    const conflictConfig = {
      specsDir: '.smithue/specs',
      ownership: {
        include: ['/Game/**'],
        exclude: ['/Game/UltraDynamicSky/**'],
      },
    };
    const checker = createOwnershipChecker(conflictConfig);
    expect(checker('/Game/UltraDynamicSky/BP_Sky')).toBe(false);
    expect(checker('/Game/MyStudio/Props/SM_Crate')).toBe(true);
  });

  it('handles an empty exclude list correctly', () => {
    const noExcludeConfig = {
      specsDir: '.smithue/specs',
      ownership: { include: ['/Game/MyStudio/**'] },
    };
    const checker = createOwnershipChecker(noExcludeConfig);
    expect(checker('/Game/MyStudio/Characters/BP_Hero')).toBe(true);
    expect(checker('/Game/ThirdParty/Foo')).toBe(false);
  });
});
