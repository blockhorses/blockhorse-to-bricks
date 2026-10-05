// The TypeScript builder must reproduce the agreed builds piece for piece.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildWithSeed, searchBuild, SPECIES } from '../scripts/build-horses';
import builds from '../src/data/builds.json';

const golden = (s: string) => JSON.parse(readFileSync(`blockhorse-reference/builds/${s}.json`, 'utf8'));
const SEEDS = { horse: 1201, pegasus: 1150, unicorn: 2241, winged: 1150 };

describe('build-horses port', () => {
  for (const s of SPECIES) {
    it(`${s}: seed ${SEEDS[s]} gives the golden build`, () => {
      expect(buildWithSeed(s, SEEDS[s])).toEqual(golden(s));
    });
    it(`${s}: src/data/builds.json is the golden build`, () => {
      expect(builds[s]).toEqual(golden(s));
    });
  }
  it('the 3000-seed search picks the same seeds', () => {
    for (const s of SPECIES) {
      const r = searchBuild(s, 3000);
      expect(r.build.seed).toBe(SEEDS[s]);
      expect(r.build).toEqual(golden(s));
      expect([r.comps, r.weak]).toEqual([1, 0]);
    }
  }, 120_000);
});
