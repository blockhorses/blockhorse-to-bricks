// Reference builder: the BlockHorses 32x32 sprite (blockhorses/BlockHorses templates/horse.js) -> brick models.
// Prototype code from the design session. Port it to TypeScript; don't ship it as is.
// Usage: node build-blockhorse.cjs <horse|pegasus|unicorn|winged> [seeds=3000]
// Writes builds/<species>.json: { top, seed, pieces: [x, z, y, w, d, h, role, kind?] }
// Units: x, z in studs (x = tail -> head, z = depth, z = 0 is the base's front edge); y, h in plates (brick = 3).
// One pixel = one stud wide, one brick tall. Roles: B base, C coat, M mane, T tail, E eye, S shoes, U horn, W wings.
const fs = require('fs');
const L = (x1, y, x2) => ({ x1, y, x2 });
// role layers in draw order (later wins), taken from templates/horse.js
const GEO = {
  S: [L(7,31,9), L(18,31,20)],
  backleg: [L(7,30,9),L(7,29,9),L(7,28,9),L(7,27,9),L(7,26,9),L(7,25,9),L(7,24,9),L(6,23,10)],
  frontleg: [L(18,30,20),L(18,29,20),L(18,28,20),L(18,27,20),L(18,26,20),L(18,25,20),L(18,24,20),L(17,23,21)],
  core: [L(6,22,21),L(5,21,22),L(5,20,22),L(5,19,22),L(5,18,22),L(5,17,22),L(6,16,23),L(8,15,24),L(20,14,25)],
  head: [L(28,15,30),L(27,14,31),L(21,13,31),L(22,12,30),L(23,11,29),L(23,10,28),L(25,9,27)],
  ear: [L(22,9,24),L(22,8,23)],
  E: [L(26,11,27)],
  T: [L(1,23,2),L(0,22,2),L(0,21,3),L(1,20,3),L(1,19,4),L(2,18,4),L(2,17,4),L(3,16,6),L(3,15,7),L(4,14,6)],
  M: [L(18,15,19),L(17,14,20),L(18,13,21),L(19,12,22),L(20,11,23),L(21,10,23),L(25,10,28),L(24,9,27),L(24,8,26)],
  U: [L(27,9,28),L(28,8,29),L(29,7,30),L(30,6,31)],
  W: [L(15,16,17),L(14,15,16),L(14,14,16),L(11,13,16),L(10,12,16),L(9,11,15),L(7,10,15),L(6,9,14),L(5,8,13),L(4,7,5),L(6,7,12),L(5,6,11),L(4,5,5),L(6,5,10),L(5,4,8),L(4,3,5),L(6,3,7)],
};
// brick-only fills: pixels that only touch at corners cannot be held by studs
const FILL = { U: [[28, 9], [29, 8], [30, 7]], W: [[5, 3], [5, 5], [5, 7]] };
const cellsOf = lines => { const s = []; for (const l of lines) for (let x = l.x1; x < l.x2; x++) s.push([x, l.y]); return s; };

function sprite(species) {
  const hasU = species === 'unicorn' || species === 'winged', hasW = species === 'pegasus' || species === 'winged';
  const px = new Map(); // "x,y" -> {role, part}
  const put = (cells, role, part) => cells.forEach(([x, y]) => { const k = `${x},${y}`; const prev = px.get(k); px.set(k, { role, part: part || (prev && prev.part) || role, under: prev && prev.part }); });
  put(cellsOf(GEO.S), 'S', 'leg');
  put(cellsOf(GEO.backleg), 'C', 'leg'); put(cellsOf(GEO.frontleg), 'C', 'leg');
  put(cellsOf(GEO.core), 'C', 'core'); put(cellsOf(GEO.head), 'C', 'head'); put(cellsOf(GEO.ear), 'C', 'ear');
  const over = (cells, role) => cells.forEach(([x, y]) => { const k = `${x},${y}`, prev = px.get(k); px.set(k, { role, part: prev ? prev.part : role + 'only' }); });
  over(cellsOf(GEO.E), 'E'); over(cellsOf(GEO.T), 'T'); over(cellsOf(GEO.M), 'M');
  if (hasU) { over(cellsOf(GEO.U), 'U'); over(FILL.U, 'U'); }
  if (hasW) { over(cellsOf(GEO.W), 'W'); over(FILL.W, 'W'); }
  return px;
}
// z ranges for a pixel; returns list of [z, role]
// The neck rises out of the body at row 14 and across the front of row 15 (x >= 19).
// The SVG groups those pixels with the body, but they are built at neck (head) depth.
const isNeck = (part, r, x) => part === 'core' && (r === 14 || (r === 15 && x >= 19));
function depth(p, r, x) {
  const all = (a, b, r) => { const o = []; for (let z = a; z <= b; z++) o.push([z, r]); return o; };
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
    default: return all(2, 3, role); // tail, mane-only, horn
  }
}

const SPECIES = process.argv[2] || 'horse';
const ZOFF = 1, BASE_W = 32, BASE_D = 8;
const px = sprite(SPECIES);
const topRow = Math.min(...[...px.keys()].map(k => +k.split(',')[1]));
const grid = new Map(); // b -> Map "x,z" -> role
for (const [k, p] of px) {
  const [x, r] = k.split(',').map(Number), b = 31 - r;
  if (!grid.has(b)) grid.set(b, new Map());
  if (p.role === 'U') continue; // horn is placed by hand, centred on a jumper
  for (const [z, role] of depth(p, r, x)) grid.get(b).set(`${x},${z + ZOFF}`, role);
}
const ROWS = 32 - topRow;
const filled = (b, x, z) => b < 0 ? (x >= 0 && x < BASE_W && z >= 0 && z < BASE_D) : !!(grid.get(b) && grid.get(b).has(`${x},${z}`));
const hidden = (b, x, z) => filled(b, x - 1, z) && filled(b, x + 1, z) && filled(b, x, z - 1) && filled(b, x, z + 1) && filled(b - 1, x, z) && filled(b + 1, x, z);

const layers = []; let y = 2;
for (let b = 0; b < ROWS; b++) {
  const cells = new Map();
  for (const [k, lab] of grid.get(b) || []) { const [x, z] = k.split(',').map(Number); cells.set(k, { x, z, lab, hid: hidden(b, x, z) }); }
  layers.push({ b, y, h: 3, cells }); y += 3; // every pixel row is one brick
}
const TOP = y;

const SIZES = [[1,1],[1,2],[1,3],[1,4],[1,6],[1,8],[2,2],[2,3],[2,4],[2,6],[2,8]];
function rngFrom(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
const OPTS = []; for (const [a, c] of SIZES) { OPTS.push([c, a]); if (a !== c) OPTS.push([a, c]); }

function tileLayer(Lr, axis, rev, rnd, odd) {
  const cov = new Set(), pieces = [];
  const keys = [...Lr.cells.values()].sort((a, b) => {
    const pa = axis === 'x' ? [a.z, a.x] : [a.x, a.z], pb = axis === 'x' ? [b.z, b.x] : [b.x, b.z];
    return rev ? (pb[0] - pa[0] || pb[1] - pa[1]) : (pa[0] - pb[0] || pa[1] - pb[1]);
  });
  for (const cell of keys) {
    if (cov.has(`${cell.x},${cell.z}`)) continue;
    const cands = [];
    for (const [w, d] of OPTS) {
      const x0 = rev ? cell.x - w + 1 : cell.x, z0 = rev ? cell.z - d + 1 : cell.z;
      let ok = true, lab = null;
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
function basePieces() {
  const out = [];
  for (let z = 0; z < BASE_D; z += 2) {
    const runs = (z / 2) % 2 ? [4, 8, 8, 8, 4] : [8, 8, 8, 8];
    let x = 0; for (const w of runs) { out.push({ x, z, w, d: 2, y: 0, h: 1, lab: 'B' }); x += w; }
  }
  for (let x = 0; x < BASE_W; x += 2) out.push({ x, z: 0, w: 2, d: 8, y: 1, h: 1, lab: 'B' });
  return out;
}
const ov = (a, b) => { const w = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), d = Math.min(a.z + a.d, b.z + b.d) - Math.max(a.z, b.z); return w > 0 && d > 0 ? w * d : 0; };
function check(P) {
  const byTop = new Map(); P.forEach((p, i) => { const k = p.y + p.h; (byTop.get(k) || byTop.set(k, []).get(k)).push(i); });
  const n = P.length, par = [...Array(n).keys()], studs = new Array(n).fill(0);
  const f = i => (par[i] === i ? i : (par[i] = f(par[i])));
  P.forEach((b, j) => { for (const i of byTop.get(b.y) || []) { const o = ov(P[i], b); if (o) { studs[i] += o; studs[j] += o; par[f(i)] = f(j); } } });
  const comps = new Set(P.map((_, i) => f(i))).size;
  const weak = P.filter((p, i) => studs[i] === 1 && p.w * p.d > 1).length;
  return { comps, weak };
}
function seams(P) {
  // stud-edges where a joint between two pieces sits directly on a joint below
  const at = new Map(); // y -> Map cell->piece index
  P.forEach((p, i) => { let m = at.get(p.y); if (!m) at.set(p.y, (m = new Map())); for (let a = 0; a < p.w; a++) for (let c = 0; c < p.d; c++) m.set(`${p.x + a},${p.z + c}`, i); });
  let s = 0;
  for (const [yy, m] of at) {
    const below = [...at.keys()].find(k => { const i = at.get(k).values().next().value; return P[i].y + P[i].h === yy; });
    if (below === undefined) continue; const mb = at.get(below);
    for (const [k, i] of m) { const [x, z] = k.split(',').map(Number);
      for (const [dx, dz] of [[1, 0], [0, 1]]) { const k2 = `${x + dx},${z + dz}`, j = m.get(k2); if (j === undefined || j === i) continue;
        const bi = mb.get(k), bj = mb.get(k2); if (bi !== undefined && bj !== undefined && bi !== bj) s++; } }
  }
  return s;
}
const base = basePieces();
// Centred horn: head spans z 2..5 (centre 4.0). A 1x2 jumper on the mane crest puts one stud at z = 4.0,
// two 1x2 plates on it finish the first brick-height row, then 1-stud-wide bricks step up and forward.
const Yrow = r => 2 + 3 * (31 - r);
const HORN = (SPECIES === 'unicorn' || SPECIES === 'winged') ? [
  { x: 27, z: 3, y: Yrow(9), w: 1, d: 2, h: 1, lab: 'U', kind: 'jumper' },
  { x: 27, z: 3.5, y: Yrow(9) + 1, w: 2, d: 1, h: 1, lab: 'U' },
  { x: 27, z: 3.5, y: Yrow(9) + 2, w: 2, d: 1, h: 1, lab: 'U' },
  { x: 28, z: 3.5, y: Yrow(8), w: 2, d: 1, h: 3, lab: 'U' },
  { x: 29, z: 3.5, y: Yrow(7), w: 2, d: 1, h: 3, lab: 'U' },
  { x: 30, z: 3.5, y: Yrow(6), w: 1, d: 1, h: 3, lab: 'U' },
] : [];
let best = null;
const N = +(process.argv[3] || 3000);
for (let seed = 1; seed <= N; seed++) {
  const rnd = rngFrom(seed * 2654435761);
  let pieces = [...base];
  layers.forEach((Lr, i) => { let axis = i % 2 === 0 ? 'x' : 'z'; if (rnd() < 0.25) axis = axis === 'x' ? 'z' : 'x'; pieces = pieces.concat(tileLayer(Lr, axis, rnd() < 0.5, rnd, 0.04)); });
  pieces = pieces.concat(HORN);
  const c = check(pieces);
  const sm = c.comps === 1 ? seams(pieces) : 9999;
  const sc = c.comps * 1e7 + c.weak * 1e5 + sm * 10 + pieces.length;
  if (!best || sc < best.sc) best = { sc, seed, pieces, c, sm };
}
console.log(SPECIES, 'seed', best.seed, 'comps', best.c.comps, 'weak', best.c.weak, 'seams', best.sm, 'pieces', best.pieces.length, 'top', TOP, 'rows', ROWS);
fs.mkdirSync(__dirname + '/builds', { recursive: true });
fs.writeFileSync(__dirname + `/builds/${SPECIES}.json`, JSON.stringify({ top: TOP, seed: best.seed, pieces: best.pieces.map(p => p.kind ? [p.x, p.z, p.y, p.w, p.d, p.h, p.lab, p.kind] : [p.x, p.z, p.y, p.w, p.d, p.h, p.lab]) }));
