// BlockHorse token -> brick model. Every horse of a species uses that species'
// fixed build (src/data/builds.json, made offline by scripts/build-horses.ts);
// only the colours change per token.
import builds from '../data/builds.json';
import { checkModel, connections, type Checks } from './check';
import { cssHex, horse, TRAITS, type Horse, type Species, type Trait } from './horse';
import { elementId, KNOWN_PARTS } from './lego';
import { BASES, COLOR_BY_ID, DEFAULT_BASE, nearestColors } from './palette';
import { partId, partName, type Kind, type Piece, type Role } from './parts';

export interface BomLine { part: string; kind: Kind; name: string; color: number; colorName: string; hex: string; w: number; d: number; qty: number }

/** One trait: its original colour and the brick colour it became. */
export interface TraitColor {
  trait: Trait;
  css: string;             // CSS colour name in the token's SVG
  hex: string;             // its value
  color: number;           // BrickLink colour ID used
  nearest: number;         // nearest brick colour, before keeping touching traits apart or "only colours LEGO sells"
  parts: string[];         // BrickLink parts this trait uses
  legoAll: boolean;        // LEGO sells every one of them in this colour
}

export interface BuildOptions {
  /** base colour (BrickLink colour ID): Turf, Dirt, Sand or Stone */
  base?: number;
  /** per trait, the nearest colour LEGO sells for every part that trait uses */
  legoOnly?: boolean;
}

export interface Model {
  horse: Horse;
  base: number;
  legoOnly: boolean;
  pieces: Piece[];
  steps: number[][];
  bom: BomLine[];
  palette: TraitColor[];
  colors: Record<number, string>;
  checks: Checks;
  notes: string[];
  /** approximate size in cm: length, depth, height */
  dims: [number, number, number];
}

type Raw = [number, number, number, number, number, number, Role, ('jumper' | undefined)?];

/** Traits that touch in the model: they keep different brick colours when their original colours differ. */
export const TOUCHING: [Trait, Trait][] = [['M', 'C'], ['T', 'C'], ['E', 'C'], ['S', 'C'], ['W', 'C'], ['E', 'M'], ['U', 'M'], ['U', 'C']];

/** The pieces of a species' build, uncoloured (c = 0). */
export function shape(species: Species): Piece[] {
  return (builds[species].pieces as Raw[]).map(([x, z, y, w, d, h, role, jumper]) => {
    const kind: Kind = jumper ? 'jumper' : h === 3 ? 'brick' : 'plate';
    return { x, z, y, w, d, h, c: 0, kind, part: partId(kind, w, d), role, group: role === 'B' ? 'base' : 'body' };
  });
}

/** Brick colour per trait, in TRAITS order: nearest first, then kept apart from the traits it touches. */
export function pickColors(h: Horse, pieces: Piece[], legoOnly: boolean): TraitColor[] {
  const partsOf = new Map<Role, Set<string>>();
  for (const p of pieces) { let s = partsOf.get(p.role); if (!s) partsOf.set(p.role, s = new Set()); s.add(p.part); }
  const out: TraitColor[] = [];
  const picked = new Map<Trait, TraitColor>();
  for (const t of TRAITS) {
    const css = h.traits[t], parts = partsOf.get(t);
    if (!css || !parts) continue;
    const hex = cssHex(css);
    const exclude = TOUCHING.filter(pair => pair.includes(t)).map(([a, b]) => picked.get(a === t ? b : a))
      .filter((o): o is TraitColor => !!o && o.hex.toUpperCase() !== hex.toUpperCase()).map(o => o.color);
    const cands = nearestColors(hex);
    const sells = (id: number) => [...parts].filter(p => KNOWN_PARTS.has(p)).every(p => elementId(p, id));
    const free = cands.filter(c => !exclude.includes(c.id));
    const color = ((legoOnly && free.find(c => sells(c.id))) || free[0] || cands[0]).id;
    const tc: TraitColor = { trait: t, css, hex, color, nearest: cands[0].id, parts: [...parts].sort(), legoAll: [...parts].every(p => elementId(p, color)) };
    picked.set(t, tc); out.push(tc);
  }
  return out;
}

/** Steps: the two base layers, then one per brick row (the horn's jumper and plates go with the row they sit on). */
function makeSteps(pieces: Piece[]): number[][] {
  const rowOf = (p: Piece) => (p.y < 2 ? p.y : 2 + Math.floor((p.y - 2) / 3));
  const stepOf = pieces.map(rowOf);
  // a piece that hangs under another (nothing holds it from below yet) is
  // added right after the piece that holds it, in that piece's step
  const { adj } = connections(pieces);
  const deferred = new Set<number>();
  for (let pass = 0; pass < 30; pass++) {
    let changed = false;
    pieces.forEach((p, i) => {
      if (stepOf[i] === 0) return;
      const nb = [...adj[i].keys()];
      if (nb.some(j => pieces[j].y < p.y && stepOf[j] <= stepOf[i])) return;
      const up = nb.filter(j => pieces[j].y > p.y).map(j => stepOf[j]);
      if (!up.length) return;
      const s = Math.min(...up);
      if (s > stepOf[i]) { stepOf[i] = s; deferred.add(i); changed = true; }
    });
    if (!changed) break;
  }
  const by: number[][] = [];
  pieces.forEach((_, i) => { (by[stepOf[i]] ??= []).push(i); });
  return by.filter(s => s?.length).map(s => s.sort((a, b) => {
    const da = deferred.has(a) ? 1 : 0, db = deferred.has(b) ? 1 : 0;
    if (da !== db) return da - db;
    const pa = pieces[a], pb = pieces[b];
    return (da ? pb.y - pa.y : pa.y - pb.y) || pa.z - pb.z || pa.x - pb.x;
  }));
}

export function buildModel(token: number, o: BuildOptions = {}): Model {
  const h = horse(token);
  const base = BASES.some(b => b.id === o.base) ? o.base! : DEFAULT_BASE;
  const legoOnly = !!o.legoOnly;
  const pieces = shape(h.species);
  const palette = pickColors(h, pieces, legoOnly);
  const colorOf = new Map<Role, number>([['B', base], ...palette.map(t => [t.trait, t.color] as [Role, number])]);
  for (const p of pieces) p.c = colorOf.get(p.role)!;

  const checks = checkModel(pieces);
  const notes: string[] = [];
  if (checks.floating) notes.push(`${checks.floating} piece${checks.floating > 1 ? 's are' : ' is'} not connected to the base.`);
  if (h.species === 'unicorn' || h.species === 'winged')
    notes.push('The horn is centred on the head: it starts on a 1 × 2 jumper plate (one centre stud), and each 1-stud-wide step above it is held by a single stud.');
  for (const t of palette) if (legoOnly && !t.legoAll && t.parts.some(p => !KNOWN_PARTS.has(p)))
    notes.push(`Part ${t.parts.filter(p => !KNOWN_PARTS.has(p)).join(', ')} isn’t in the LEGO element table yet, so it doesn’t limit the colour choice.`);

  const bomMap = new Map<string, BomLine>();
  for (const p of pieces) {
    const k = `${p.part}|${p.c}`, col = COLOR_BY_ID.get(p.c)!;
    const line = bomMap.get(k) ?? { part: p.part, kind: p.kind, name: partName(p.kind, p.w, p.d), color: p.c, colorName: col.name, hex: col.hex, w: Math.min(p.w, p.d), d: Math.max(p.w, p.d), qty: 0 };
    line.qty++; bomMap.set(k, line);
  }
  const bom = [...bomMap.values()].sort((a, b) => a.colorName.localeCompare(b.colorName) || a.kind.localeCompare(b.kind) || a.w - b.w || a.d - b.d);
  const colors: Record<number, string> = {};
  for (const p of pieces) colors[p.c] = COLOR_BY_ID.get(p.c)!.hex;
  const xs = pieces.flatMap(p => [p.x, p.x + p.w]), zs = pieces.flatMap(p => [p.z, p.z + p.d]), ys = pieces.flatMap(p => [p.y, p.y + p.h]);
  const dims = [(Math.max(...xs) - Math.min(...xs)) * 0.8, (Math.max(...zs) - Math.min(...zs)) * 0.8, (Math.max(...ys) - Math.min(...ys)) * 0.32].map(v => Math.round(v * 10) / 10) as [number, number, number];
  return { horse: h, base, legoOnly, pieces, steps: makeSteps(pieces), bom, palette, colors, checks, notes, dims };
}
