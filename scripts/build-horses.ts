// Regenerate src/data/builds.json: one brick build per BlockHorse species,
// from the 32×32 sprite in blockhorses/BlockHorses templates/horse.js.
//   npx tsx scripts/build-horses.ts [seeds=3000]
// The tiling of each layer is random; the seed search keeps the build with one
// connected group, no weak joints, the fewest seams and the fewest pieces. The
// site loads these fixed builds and only recolours them per token.
// Port of blockhorse-reference/build-blockhorse.js: the output must stay
// identical to blockhorse-reference/builds/*.json (see test/builds.test.ts).
//
// Units: x, z in studs (x = tail -> head, z = depth, z = 0 is the base's front
// edge); y, h in plates (brick = 3). One pixel = one stud wide, one brick tall.
// Roles: B base, C coat, M mane, T tail, E eye, S shoes, U horn, W wings.
import { writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { GEO, type Line, type Species } from '../src/core/horse';
import type { Role } from '../src/core/parts';

export const SPECIES: Species[] = ['horse', 'pegasus', 'unicorn', 'winged'];
/** [x, z, y, w, d, h, role, kind?] */
export type BuildPiece = [number, number, number, number, number, number, Role] | [number, number, number, number, number, number, Role, 'jumper'];
export interface Build { top: number; seed: number; pieces: BuildPiece[] }

// brick-only fills: pixels that only touch at corners cannot be held by studs
const FILL: Record<'U' | 'W', [number, number][]> = { U: [[28, 9], [29, 8], [30, 7]], W: [[5, 3], [5, 5], [5, 7]] };
const cellsOf = (lines: Line[]) => { const s: [number, number][] = []; for (const l of lines) for (let x = l.x1; x < l.x2; x++) s.push([x, l.y]); return s; };

export const hasHorn = (s: Species) => s === 'unicorn' || s === 'winged';
export const hasWings = (s: Species) => s === 'pegasus' || s === 'winged';

interface Px { role: Role; part: string }
function sprite(species: Species) {
  const px = new Map<string, Px>(); // "x,y" -> {role, part}
  const put = (cells: [number, number][], role: Role, part: string) => cells.forEach(([x, y]) => { const k = `${x},${y}`, prev = px.get(k); px.set(k, { role, part: part || (prev && prev.part) || role }); });
  put(cellsOf(GEO.S), 'S', 'leg');
  put(cellsOf(GEO.backleg), 'C', 'leg'); put(cellsOf(GEO.frontleg), 'C', 'leg');
  put(cellsOf(GEO.core), 'C', 'core'); put(cellsOf(GEO.head), 'C', 'head'); put(cellsOf(GEO.ear), 'C', 'ear');
  const over = (cells: [number, number][], role: Role) => cells.forEach(([x, y]) => { const k = `${x},${y}`, prev = px.get(k); px.set(k, { role, part: prev ? prev.part : role + 'only' }); });
  over(cellsOf(GEO.E), 'E'); over(cellsOf(GEO.T), 'T'); over(cellsOf(GEO.M), 'M');
  if (hasHorn(species)) { over(cellsOf(GEO.U), 'U'); over(FILL.U, 'U'); }
  if (hasWings(species)) { over(cellsOf(GEO.W), 'W'); over(FILL.W, 'W'); }
  return px;
}
/** The neck rises out of the body at row 14 and across the front of rows 15 and 16 (x >= 19).
 *  The SVG groups those pixels with the body, but they are built at neck (head) depth. */
const isNeck = (part: string, r: number, x: number) => part === 'core' && (r === 14 || (r >= 15 && r <= 16 && x >= 19));
/** depth cells of a pixel (before the base offset): [z, role] */
function depth(p: Px, r: number, x: number): [number, Role][] {
  const all = (a: number, b: number, role: Role) => { const o: [number, Role][] = []; for (let z = a; z <= b; z++) o.push([z, role]); return o; };
  const { role } = p, part = isNeck(p.part, r, x) ? 'head' : p.part;
  if (role === 'W') {
    if (part === 'core') return [[0, 'W'], ...all(1, 4, 'C'), [5, 'W']];
    return [[0, 'W'], [5, 'W']];
  }
  if (role === 'U') return [[2, 'U']];
  switch (part) {
    case 'leg': return [...all(0, 1, role), ...all(4, 5, role)];
    case 'core': return all(0, 5, role);
    case 'head': return all(1, 4, role);
    case 'ear': return r === 8 ? [[1, role], [4, role]] : [[1, role], [2, 'M'], [3, 'M'], [4, role]]; // mane between the ears, below the ear tips
    default: return all(2, 3, role); // tail, mane-only
  }
}

const ZOFF = 1, BASE_W = 32, BASE_D = 8;
const SIZES = [[1, 1], [1, 2], [1, 3], [1, 4], [1, 6], [1, 8], [2, 2], [2, 3], [2, 4], [2, 6], [2, 8]];
const OPTS: [number, number][] = []; for (const [a, c] of SIZES) { OPTS.push([c, a]); if (a !== c) OPTS.push([a, c]); }

interface Cell { x: number; z: number; lab: Role; hid: boolean }
interface LayerDef { b: number; y: number; h: number; cells: Map<string, Cell> }
interface P { x: number; z: number; y: number; w: number; d: number; h: number; lab: Role; kind?: 'jumper' }

function rngFrom(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

function tileLayer(Lr: LayerDef, axis: 'x' | 'z', rev: boolean, rnd: () => number, odd: number): P[] {
  const cov = new Set<string>(), pieces: P[] = [];
  const keys = [...Lr.cells.values()].sort((a, b) => {
    const pa = axis === 'x' ? [a.z, a.x] : [a.x, a.z], pb = axis === 'x' ? [b.z, b.x] : [b.x, b.z];
    return rev ? (pb[0] - pa[0] || pb[1] - pa[1]) : (pa[0] - pb[0] || pa[1] - pb[1]);
  });
  for (const cell of keys) {
    if (cov.has(`${cell.x},${cell.z}`)) continue;
    const cands: { x0: number; z0: number; w: number; d: number; lab: Role; score: number }[] = [];
    for (const [w, d] of OPTS) {
      const x0 = rev ? cell.x - w + 1 : cell.x, z0 = rev ? cell.z - d + 1 : cell.z;
      let ok = true, lab: Role | null = null;
      for (let i = 0; i < w && ok; i++) for (let j = 0; j < d; j++) {
        const kk = `${x0 + i},${z0 + j}`, c2 = Lr.cells.get(kk);
        if (!c2 || cov.has(kk)) { ok = false; break; }
        if (!c2.hid) { if (lab === null) lab = c2.lab; else if (lab !== c2.lab) { ok = false; break; } }
      }
      if (!ok) continue;
      const along = axis === 'x' ? w >= d : d >= w;
      cands.push({ x0, z0, w, d, lab: lab || 'C', score: w * d * 10 + (along ? 3 : 0) + rnd() * 4 });
    }
    cands.sort((a, b) => b.score - a.score);
    let p = cands[0];
    if (rnd() < odd) { const o = cands.find(q => Math.min(q.w, q.d) === 1 && Math.max(q.w, q.d) >= 3); if (o) p = o; }
    for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) cov.add(`${p.x0 + i},${p.z0 + j}`);
    pieces.push({ x: p.x0, z: p.z0, w: p.w, d: p.d, y: Lr.y, h: Lr.h, lab: p.lab });
  }
  return pieces;
}
function basePieces(): P[] {
  const out: P[] = [];
  for (let z = 0; z < BASE_D; z += 2) {
    const runs = (z / 2) % 2 ? [4, 8, 8, 8, 4] : [8, 8, 8, 8];
    let x = 0; for (const w of runs) { out.push({ x, z, w, d: 2, y: 0, h: 1, lab: 'B' }); x += w; }
  }
  for (let x = 0; x < BASE_W; x += 2) out.push({ x, z: 0, w: 2, d: 8, y: 1, h: 1, lab: 'B' });
  return out;
}
const ov = (a: P, b: P) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), d = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z); return w > 0 && d > 0 ? w * d : 0; };
/** search score: connected groups and pieces larger than 1×1 held by a single stud */
function check(P: P[]) {
  const byTop = new Map<number, number[]>(); P.forEach((p, i) => { const k = p.y + p.h; let l = byTop.get(k); if (!l) byTop.set(k, (l = [])); l.push(i); });
  const n = P.length, par = [...Array(n).keys()], studs = new Array<number>(n).fill(0);
  const f = (i: number): number => (par[i] === i ? i : (par[i] = f(par[i])));
  P.forEach((b, j) => { for (const i of byTop.get(b.y) || []) { const o = ov(P[i], b); if (o) { studs[i] += o; studs[j] += o; par[f(i)] = f(j); } } });
  const comps = new Set(P.map((_, i) => f(i))).size;
  const weak = P.filter((p, i) => studs[i] === 1 && p.w * p.d > 1).length;
  return { comps, weak };
}
/** stud-edges where a joint between two pieces sits directly on a joint below */
function seams(P: P[]) {
  const at = new Map<number, Map<string, number>>(); // y -> cell -> piece index
  P.forEach((p, i) => { let m = at.get(p.y); if (!m) at.set(p.y, (m = new Map())); for (let a = 0; a < p.w; a++) for (let c = 0; c < p.d; c++) m.set(`${p.x + a},${p.z + c}`, i); });
  let s = 0;
  for (const [yy, m] of at) {
    const below = [...at.keys()].find(k => { const i = at.get(k)!.values().next().value!; return P[i].y + P[i].h === yy; });
    if (below === undefined) continue;
    const mb = at.get(below)!;
    for (const [k, i] of m) {
      const [x, z] = k.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [0, 1]]) {
        const k2 = `${x + dx},${z + dz}`, j = m.get(k2); if (j === undefined || j === i) continue;
        const bi = mb.get(k), bj = mb.get(k2); if (bi !== undefined && bj !== undefined && bi !== bj) s++;
      }
    }
  }
  return s;
}

/** The layers of one species: every pixel row is one brick, from y = 2 (on the 2-plate base). */
function layersOf(species: Species) {
  const px = sprite(species);
  const topRow = Math.min(...[...px.keys()].map(k => +k.split(',')[1]));
  const grid = new Map<number, Map<string, Role>>(); // b -> "x,z" -> role
  for (const [k, p] of px) {
    const [x, r] = k.split(',').map(Number), b = 31 - r;
    if (!grid.has(b)) grid.set(b, new Map());
    if (p.role === 'U') continue; // horn is placed by hand, centred on a jumper
    for (const [z, role] of depth(p, r, x)) grid.get(b)!.set(`${x},${z + ZOFF}`, role);
  }
  const ROWS = 32 - topRow;
  const filled = (b: number, x: number, z: number) => b < 0 ? (x >= 0 && x < BASE_W && z >= 0 && z < BASE_D) : !!grid.get(b)?.has(`${x},${z}`);
  const hidden = (b: number, x: number, z: number) => filled(b, x - 1, z) && filled(b, x + 1, z) && filled(b, x, z - 1) && filled(b, x, z + 1) && filled(b - 1, x, z) && filled(b + 1, x, z);
  const layers: LayerDef[] = []; let y = 2;
  for (let b = 0; b < ROWS; b++) {
    const cells = new Map<string, Cell>();
    for (const [k, lab] of grid.get(b) || []) { const [x, z] = k.split(',').map(Number); cells.set(k, { x, z, lab, hid: hidden(b, x, z) }); }
    layers.push({ b, y, h: 3, cells }); y += 3;
  }
  return { layers, top: y, rows: ROWS };
}

// Centred horn: head spans z 2..5 (centre 4.0). A 1×2 jumper on the mane crest puts one stud at z = 4.0,
// two 1×2 plates on it finish the first brick-height row, then 1-stud-wide bricks step up and forward.
const Yrow = (r: number) => 2 + 3 * (31 - r);
const horn = (species: Species): P[] => hasHorn(species) ? [
  { x: 27, z: 3, y: Yrow(9), w: 1, d: 2, h: 1, lab: 'U', kind: 'jumper' },
  { x: 27, z: 3.5, y: Yrow(9) + 1, w: 2, d: 1, h: 1, lab: 'U' },
  { x: 27, z: 3.5, y: Yrow(9) + 2, w: 2, d: 1, h: 1, lab: 'U' },
  { x: 28, z: 3.5, y: Yrow(8), w: 2, d: 1, h: 3, lab: 'U' },
  { x: 29, z: 3.5, y: Yrow(7), w: 2, d: 1, h: 3, lab: 'U' },
  { x: 30, z: 3.5, y: Yrow(6), w: 1, d: 1, h: 3, lab: 'U' },
] : [];

const toBuild = (top: number, seed: number, pieces: P[]): Build => ({
  top, seed, pieces: pieces.map(p => (p.kind ? [p.x, p.z, p.y, p.w, p.d, p.h, p.lab, p.kind] : [p.x, p.z, p.y, p.w, p.d, p.h, p.lab]) as BuildPiece),
});

/** One candidate build: the tiling a seed gives, with its search score. */
function attempt(species: Species, L: ReturnType<typeof layersOf>, seed: number) {
  const rnd = rngFrom(seed * 2654435761);
  let pieces = basePieces();
  L.layers.forEach((Lr, i) => {
    let axis: 'x' | 'z' = i % 2 === 0 ? 'x' : 'z';
    if (rnd() < 0.25) axis = axis === 'x' ? 'z' : 'x';
    pieces = pieces.concat(tileLayer(Lr, axis, rnd() < 0.5, rnd, 0.04));
  });
  pieces = pieces.concat(horn(species));
  const c = check(pieces);
  const sm = c.comps === 1 ? seams(pieces) : 9999;
  return { sc: c.comps * 1e7 + c.weak * 1e5 + sm * 10 + pieces.length, seed, pieces, c, sm };
}

/** The build a single seed gives. */
export function buildWithSeed(species: Species, seed: number): Build {
  const L = layersOf(species);
  return toBuild(L.top, seed, attempt(species, L, seed).pieces);
}

/** Search seeds 1..n and keep the best build. */
export function searchBuild(species: Species, n = 3000) {
  const L = layersOf(species);
  let best: ReturnType<typeof attempt> | null = null;
  for (let seed = 1; seed <= n; seed++) {
    const a = attempt(species, L, seed);
    if (!best || a.sc < best.sc) best = a;
  }
  return { build: toBuild(L.top, best!.seed, best!.pieces), comps: best!.c.comps, weak: best!.c.weak, seams: best!.sm, rows: L.rows };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = +(process.argv[2] || 3000);
  const out = {} as Record<Species, Build>;
  for (const s of SPECIES) {
    const r = searchBuild(s, n);
    console.log(s, 'seed', r.build.seed, 'comps', r.comps, 'weak', r.weak, 'seams', r.seams, 'pieces', r.build.pieces.length, 'top', r.build.top, 'rows', r.rows);
    out[s] = r.build;
  }
  writeFileSync('src/data/builds.json', JSON.stringify(out) + '\n');
}
