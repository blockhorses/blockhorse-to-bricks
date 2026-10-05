// Structural checks, done on the final list of pieces only (independent of how
// the model was built): stud connections, floating pieces, collisions, weak
// joints and centre of mass over the base. Positions are on a half-stud grid,
// so the horn (centred on a jumper plate, half a stud off) is checked like
// everything else.
import { socketsOf, studsOf, type Piece } from './parts';

export interface Checks {
  pieces: number;
  connections: number;      // studs engaged between pieces
  floating: number;         // pieces not connected to the base
  floatingIds: number[];
  collisions: number;       // pairs of pieces that overlap
  weak: number;             // pieces larger than 1 × 1 held by a single stud
  single: number;           // 1 × 1 pieces held by a single stud (expected, e.g. the horn tip)
  com: { x: number; z: number; inside: boolean; margin: number };
}

/** A point in half-studs, as one number. */
const hk = (x: number, z: number) => {
  const X = Math.round(x * 2), Z = Math.round(z * 2);
  if (Math.abs(X - x * 2) > 1e-6 || Math.abs(Z - z * 2) > 1e-6) throw new Error(`position ${x},${z} is not on the half-stud grid`);
  return (X + 1024) * 4096 + (Z + 1024);
};

/** adjacency: studs of piece i engage piece j sitting directly on top */
export function connections(pieces: Piece[]) {
  const sockets = new Map<number, Map<number, number>>();   // y -> point -> piece starting there
  pieces.forEach((p, i) => {
    let row = sockets.get(p.y); if (!row) sockets.set(p.y, row = new Map());
    for (const [x, z] of socketsOf(p)) row.set(hk(x, z), i);
  });
  const adj: Map<number, number>[] = pieces.map(() => new Map());
  let total = 0;
  pieces.forEach((p, i) => {
    const above = sockets.get(p.y + p.h);
    if (!above) return;
    for (const [x, z] of studsOf(p)) {
      const j = above.get(hk(x, z));
      if (j === undefined) continue;
      adj[i].set(j, (adj[i].get(j) ?? 0) + 1); adj[j].set(i, (adj[j].get(i) ?? 0) + 1); total++;
    }
  });
  return { adj, total };
}

export function grounded(pieces: Piece[], adj: Map<number, number>[]): boolean[] {
  const minY = Math.min(...pieces.map(p => p.y));
  const seen = pieces.map(p => p.y === minY);
  const st = pieces.map((_, i) => i).filter(i => seen[i]);
  while (st.length) { const k = st.pop()!; for (const n of adj[k].keys()) if (!seen[n]) { seen[n] = true; st.push(n); } }
  return seen;
}

/** Pairs of pieces sharing any volume (half-stud × plate cells). */
function collisions(pieces: Piece[]): number {
  const occ = new Map<string, number>(), pairs = new Set<string>();
  pieces.forEach((p, i) => {
    for (let a = Math.round(p.x * 2); a < Math.round((p.x + p.w) * 2); a++) for (let b = Math.round(p.z * 2); b < Math.round((p.z + p.d) * 2); b++) for (let y = p.y; y < p.y + p.h; y++) {
      const k = `${a},${b},${y}`, j = occ.get(k);
      if (j === undefined) occ.set(k, i); else pairs.add(j < i ? `${j},${i}` : `${i},${j}`);
    }
  });
  return pairs.size;
}

export function checkModel(pieces: Piece[]): Checks {
  const { adj, total } = connections(pieces);
  const g = grounded(pieces, adj);
  const floatingIds = pieces.map((_, i) => i).filter(i => !g[i]);
  const minY = Math.min(...pieces.map(p => p.y));
  const studs = (i: number) => [...adj[i].values()].reduce((a, b) => a + b, 0);
  const one = pieces.map((p, i) => p.y > minY && studs(i) === 1);
  // a 1 × 1 can only ever be held by one stud: that's how it's made, not a weak joint
  const weak = pieces.filter((p, i) => one[i] && p.w * p.d > 1).length;
  const single = pieces.filter((p, i) => one[i] && p.w * p.d === 1).length;
  // centre of mass (piece volume) must sit over the base footprint
  let m = 0, sx = 0, sz = 0;
  for (const p of pieces) { const v = p.w * p.d * p.h; m += v; sx += v * (p.x + p.w / 2); sz += v * (p.z + p.d / 2); }
  const cx = sx / m, cz = sz / m;
  const base = pieces.filter(p => p.y === minY);
  const bx0 = Math.min(...base.map(p => p.x)), bx1 = Math.max(...base.map(p => p.x + p.w));
  const bz0 = Math.min(...base.map(p => p.z)), bz1 = Math.max(...base.map(p => p.z + p.d));
  const margin = Math.min(cx - bx0, bx1 - cx, cz - bz0, bz1 - cz);
  return {
    pieces: pieces.length, connections: total, floating: floatingIds.length, floatingIds, collisions: collisions(pieces), weak, single,
    com: { x: +cx.toFixed(1), z: +cz.toFixed(1), inside: margin > 0, margin: +margin.toFixed(1) },
  };
}
