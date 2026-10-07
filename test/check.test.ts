import { describe, expect, it } from 'vitest';
import { buildModel, shape } from '../src/core/build';
import { checkModel, connections } from '../src/core/check';
import { horse } from '../src/core/horse';
import { partId, studsOf, type Kind, type Piece } from '../src/core/parts';

const P = (x: number, z: number, y: number, w: number, d: number, kind: Kind = 'brick', h = kind === 'brick' ? 3 : 1): Piece =>
  ({ x, z, y, w, d, h, kind, c: 11, part: partId(kind, w, d), role: 'C', group: 'body' });

describe('solidity checker', () => {
  it('two stacked bricks share their studs', () => {
    const c = checkModel([P(0, 0, 0, 2, 4), P(0, 0, 3, 2, 4)]);
    expect(c).toMatchObject({ connections: 8, floating: 0, collisions: 0, weak: 0 });
  });
  it('an offset brick connects through the overlap only', () => {
    expect(checkModel([P(0, 0, 0, 2, 4), P(1, 2, 3, 2, 4)]).connections).toBe(2);
  });
  it('a brick with nothing under it is floating', () => {
    const c = checkModel([P(0, 0, 0, 2, 4), P(10, 0, 3, 2, 2)]);
    expect(c.floating).toBe(1);
    expect(c.floatingIds).toEqual([1]);
  });
  it('a brick one plate too high does not touch', () => {
    expect(checkModel([P(0, 0, 0, 2, 4), P(0, 0, 4, 2, 4)]).floating).toBe(1);
  });
  it('a piece hanging from above is held', () => {
    const c = checkModel([P(0, 0, 0, 2, 2), P(0, 0, 3, 2, 8), P(0, 5, 0, 2, 2)]);
    expect(c.floating).toBe(0);
  });
  it('counts overlapping pieces as collisions, half-studs included', () => {
    expect(checkModel([P(0, 0, 0, 2, 4), P(1, 1, 1, 2, 2)]).collisions).toBe(1);
    expect(checkModel([P(0, 0, 0, 1, 2), P(0, 1.5, 0, 1, 1)]).collisions).toBe(1);
    expect(checkModel([P(0, 0, 0, 1, 1), P(0, 1, 0, 1, 1)]).collisions).toBe(0);
  });
  it('a piece larger than 1 × 1 held by a single stud is weak', () => {
    expect(checkModel([P(0, 0, 0, 2, 2), P(1, 1, 3, 1, 4)]).weak).toBe(1);
  });
  it('a 1 × 1 held by a single stud is not weak', () => {
    const c = checkModel([P(0, 0, 0, 2, 2), P(1, 1, 3, 1, 1)]);
    expect(c).toMatchObject({ weak: 0, single: 1, floating: 0 });
  });
  it('finds a centre of mass outside the base', () => {
    const c = checkModel([P(0, 0, 0, 2, 2), P(1, 0, 3, 1, 8), P(1, 4, 6, 1, 8), P(1, 8, 9, 1, 8)]);
    expect(c.com.inside).toBe(false);
  });
});

describe('jumper plate', () => {
  it('has one stud, in the centre', () => {
    expect(studsOf(P(27, 3, 0, 1, 2, 'jumper'))).toEqual([[27.5, 4]]);
    expect(partId('jumper', 1, 2)).toBe('15573');
  });
  it('sits on two studs and holds a half-stud-offset plate by its centre stud', () => {
    const ps = [P(27, 3, 0, 1, 2, 'plate'), P(27, 3, 1, 1, 2, 'jumper'), P(27, 3.5, 2, 2, 1, 'plate')];
    const { adj, total } = connections(ps);
    expect(adj[0].get(1)).toBe(2);
    expect(adj[1].get(2)).toBe(1);
    expect(total).toBe(3);
    expect(checkModel(ps)).toMatchObject({ floating: 0, collisions: 0 });
  });
  it('a plate on the jumper\'s whole-stud positions misses the centre stud', () => {
    const ps = [P(27, 3, 0, 1, 2, 'plate'), P(27, 3, 1, 1, 2, 'jumper'), P(27, 3, 2, 1, 2, 'plate')];
    expect(checkModel(ps).floating).toBe(1);
  });
});

// the prototype's rule: studs = overlap area between a piece and the pieces directly on it
const ov = (a: Piece, b: Piece) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), d = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z); return w > 0 && d > 0 ? w * d : 0; };

describe('every species builds solid', () => {
  for (const token of [5, 4, 8, 6]) {
    const h = horse(token);
    it(`${h.species} (#${token})`, () => {
      const m = buildModel(token);
      expect(m.checks).toMatchObject({ floating: 0, collisions: 0, weak: 0 });
      expect(m.checks.com.inside).toBe(true);
      // the half-stud grid counts the same studs as the prototype's overlap areas
      const ps = shape(h.species);
      let proto = 0;
      for (const a of ps) for (const b of ps) if (a.y + a.h === b.y) proto += ov(a, b);
      expect(m.checks.connections).toBe(proto);
      expect(m.pieces.length).toBe({ horse: 177, pegasus: 201, unicorn: 183, winged: 210 }[h.species]);
      // every piece is in exactly one step
      expect(m.steps.flat().sort((a, b) => a - b)).toEqual(m.pieces.map((_, i) => i));
    });
  }
  it('the horn: jumper, two plates, 1-stud steps; only 1 × 1s hang on one stud', () => {
    const m = buildModel(8);
    const horn = m.pieces.filter(p => p.role === 'U');
    expect(horn.map(p => p.kind)).toEqual(['jumper', 'plate', 'plate', 'brick', 'brick', 'brick']);
    expect(horn.slice(1).every(p => p.z === 3.5)).toBe(true);
    expect(m.checks.single).toBeGreaterThan(0);
  });
  it('sizes match the agreed builds', () => {
    expect(buildModel(5).dims).toEqual([25.6, 6.4, 23.7]);
    expect(buildModel(4).dims).toEqual([25.6, 6.4, 28.5]);
    expect(buildModel(8).dims).toEqual([25.6, 6.4, 25.6]);
    expect(buildModel(6).dims).toEqual([25.6, 6.4, 28.5]);
  });
});
