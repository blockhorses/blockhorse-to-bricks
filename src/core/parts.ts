// Piece model, BrickLink part numbers, and where each piece's studs are.

export type Kind = 'brick' | 'plate' | 'jumper';

/** What a piece shows: a trait of the horse, or the base. */
export type Role = 'B' | 'C' | 'M' | 'T' | 'E' | 'S' | 'U' | 'W';

/**
 * One piece. Units: x and z in studs (x from the tail to the head, z towards
 * the back, z = 0 is the front face: the side the sprite shows), y and h in
 * plates (a brick is 3 plates tall). w is the size along x, d along z.
 * x and z can be half-studs: the horn sits centred on a jumper plate.
 */
export interface Piece {
  x: number; z: number; y: number; h: number; w: number; d: number;
  c: number;               // BrickLink colour ID
  kind: Kind;
  part: string;            // BrickLink part number
  role: Role;
  group: 'base' | 'body';
}

export const PARTS: Record<Kind, Record<string, string>> = {
  brick: { '1x1': '3005', '1x2': '3004', '1x3': '3622', '1x4': '3010', '1x6': '3009', '1x8': '3008', '2x2': '3003', '2x3': '3002', '2x4': '3001', '2x6': '2456', '2x8': '3007' },
  plate: { '1x1': '3024', '1x2': '3023', '1x3': '3623', '1x4': '3710', '1x6': '3666', '1x8': '3460', '2x2': '3022', '2x3': '3021', '2x4': '3020', '2x6': '3795', '2x8': '3034' },
  // 1 × 2 jumper plate: one stud, in the centre
  jumper: { '1x2': '15573' },
};

export function partId(kind: Kind, w: number, d: number): string {
  const id = PARTS[kind][`${Math.min(w, d)}x${Math.max(w, d)}`];
  if (!id) throw new Error(`no ${kind} ${w}x${d}`);
  return id;
}

export function partName(kind: Kind, w: number, d: number): string {
  const a = Math.min(w, d), b = Math.max(w, d);
  return kind === 'jumper' ? `Jumper plate ${a} x ${b}` : `${kind === 'brick' ? 'Brick' : 'Plate'} ${a} x ${b}`;
}

/** Stud centres on top of a piece, in studs. A jumper has one, in the middle. */
export function studsOf(p: Pick<Piece, 'x' | 'z' | 'w' | 'd' | 'kind'>): [number, number][] {
  if (p.kind === 'jumper') return [[p.x + p.w / 2, p.z + p.d / 2]];
  const o: [number, number][] = [];
  for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) o.push([p.x + i + 0.5, p.z + j + 0.5]);
  return o;
}

/** Where studs from below can engage a piece: the centre of every cell it covers (a jumper too). */
export function socketsOf(p: Pick<Piece, 'x' | 'z' | 'w' | 'd'>): [number, number][] {
  const o: [number, number][] = [];
  for (let i = 0; i < p.w; i++) for (let j = 0; j < p.d; j++) o.push([p.x + i + 0.5, p.z + j + 0.5]);
  return o;
}
