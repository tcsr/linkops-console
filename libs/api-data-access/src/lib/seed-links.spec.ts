import { createSeedLinks } from './seed-links.js';

describe('createSeedLinks', () => {
  it('produces a deterministic set of 10 links (assignment requires 8..12)', () => {
    const a = createSeedLinks();
    const b = createSeedLinks();
    expect(a).toHaveLength(10);
    expect(a).toEqual(b);
  });

  it('uses deterministic ids and version 1', () => {
    const links = createSeedLinks();
    expect(links.map((l) => l.id)).toEqual([
      'link-0001',
      'link-0002',
      'link-0003',
      'link-0004',
      'link-0005',
      'link-0006',
      'link-0007',
      'link-0008',
      'link-0009',
      'link-0010',
    ]);
    expect(links.every((l) => l.version === 1)).toBe(true);
  });

  it('has unique names within the assignment length constraint (3..40)', () => {
    const links = createSeedLinks();
    const names = links.map((l) => l.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((n) => n.length >= 3 && n.length <= 40)).toBe(true);
  });

  it('keeps txPowerDbm within the assignment constraint (-10..30)', () => {
    const links = createSeedLinks();
    expect(links.every((l) => l.txPowerDbm >= -10 && l.txPowerDbm <= 30)).toBe(true);
  });

  it('returns fresh objects so callers cannot mutate shared state', () => {
    expect(createSeedLinks()[0]).not.toBe(createSeedLinks()[0]);
  });
});
