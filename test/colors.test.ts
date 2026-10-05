import { describe, expect, it } from 'vitest';
import { buildModel, TOUCHING } from '../src/core/build';
import { horse, slug, title, TOKENS } from '../src/core/horse';
import { elementId, KNOWN_PARTS } from '../src/core/lego';
import { BASES, COLOR_BY_ID, DEFAULT_BASE, nearestColors } from '../src/core/palette';

describe('horses', () => {
  it('names and species follow the traits', () => {
    expect(title(horse(6))).toBe('#6 Purple Winged Unicorn');
    expect(slug(horse(6))).toBe('blockhorse-6-purple-winged-unicorn');
    const n = { horse: 0, pegasus: 0, unicorn: 0, winged: 0 };
    for (let t = 1; t <= TOKENS; t++) n[horse(t).species]++;
    expect(n).toEqual({ horse: 227, pegasus: 11, unicorn: 15, winged: 7 });
  });
});

describe('trait colours', () => {
  it('maps to the nearest opaque brick colour', () => {
    expect(COLOR_BY_ID.get(nearestColors('#000000')[0].id)!.name).toBe('Black');
    expect(COLOR_BY_ID.get(nearestColors('#FFFFFF')[0].id)!.name).toBe('White');
    expect(nearestColors('#123456').every(c => !COLOR_BY_ID.get(c.id)!.trans)).toBe(true);
  });
  it('every piece of a trait takes that trait\'s colour; Dirt is the default base', () => {
    const m = buildModel(6);
    expect(m.base).toBe(DEFAULT_BASE);
    expect(COLOR_BY_ID.get(m.base)!.name).toBe('Reddish Brown');
    for (const p of m.pieces) expect(p.c).toBe(p.role === 'B' ? m.base : m.palette.find(t => t.trait === p.role)!.color);
  });
  it('the base colour can be Turf, Dirt, Sand or Stone', () => {
    expect(BASES.map(b => b.name)).toEqual(['Turf', 'Dirt', 'Sand', 'Stone']);
    for (const b of BASES) expect(buildModel(6, { base: b.id }).pieces.filter(p => p.role === 'B').every(p => p.c === b.id)).toBe(true);
  });
  it('touching traits keep different brick colours when their original colours differ', () => {
    for (let t = 1; t <= TOKENS; t++) for (const legoOnly of [false, true]) {
      const m = buildModel(t, { legoOnly }), by = new Map(m.palette.map(c => [c.trait, c]));
      for (const [a, b] of TOUCHING) {
        const A = by.get(a), B = by.get(b);
        if (A && B && A.hex !== B.hex) expect(A.color, `#${t} ${a}/${b}`).not.toBe(B.color);
      }
    }
  });
  it('"Only colours LEGO sells" keeps the model and picks colours LEGO sells for every known part', () => {
    for (let t = 1; t <= TOKENS; t += 7) {
      const a = buildModel(t), b = buildModel(t, { legoOnly: true });
      expect(b.pieces.map(p => [p.x, p.z, p.y, p.w, p.d, p.h, p.part])).toEqual(a.pieces.map(p => [p.x, p.z, p.y, p.w, p.d, p.h, p.part]));
      for (const tc of b.palette) {
        const sellable = (id: number) => tc.parts.filter(p => KNOWN_PARTS.has(p)).every(p => elementId(p, id));
        // when some colour works, the chosen one does
        if (nearestColors(tc.hex).some(c => sellable(c.id))) expect(sellable(tc.color), `#${t} ${tc.trait}`).toBe(true);
      }
    }
  });
});
