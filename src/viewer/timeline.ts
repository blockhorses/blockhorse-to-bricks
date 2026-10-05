// Build animation schedule, shared by the live viewer and the video export.
// Pure maths, no three.js: every time here is in seconds.
import type { Model } from '../core/build';

export const PL = 0.4;              // one plate, in stud units
export const DROP = 0.32;           // seconds a piece takes to land

export interface Timeline {
  start: Float32Array;              // when each piece starts falling
  hero: number;                     // build finished, camera settles
  end: number;                      // end of the build shot
  fall: number;                     // fall height (units)
  height: number;                   // model height (units)
  size: number;                     // how big the model looks: framing scales with size / 42
  order: number[];                  // piece indices in build order
}

export function makeTimeline(m: Model): Timeline {
  const n = m.pieces.length;
  const order = m.steps.flat();
  const ys = m.pieces.flatMap(p => [p.y, p.y + p.h]), xs = m.pieces.flatMap(p => [p.x, p.x + p.w]);
  const height = (Math.max(...ys) - Math.min(...ys)) * PL;
  // the horse is long and low: frame it on its length as much as its height
  const size = Math.max(height, (Math.max(...xs) - Math.min(...xs)) * 0.95);
  const s = size / 42;
  const win: Record<'base' | 'body', [number, number]> = { base: [0.2, 2.6], body: [2.0, 11.4] };
  const start = new Float32Array(n);
  for (const g of ['base', 'body'] as const) {
    const ids = order.filter(i => m.pieces[i].group === g);
    const [a, b] = win[g];
    ids.forEach((i, r) => { start[i] = a + (b - a - DROP) * r / Math.max(1, ids.length - 1); });
  }
  const hero = 11.8;
  return { start, hero, end: hero + 3.3, fall: 7 * s, height, size, order };
}

export const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
export const easeIO = (t: number) => { t = Math.min(1, Math.max(0, t)); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
export const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/** Piece i at time t: visible?, extra height (falling), and fall speed for the motion trail. */
export function pieceState(tl: Timeline, i: number, t: number): { visible: boolean; dy: number; speed: number } {
  const p = (t - tl.start[i]) / DROP;
  if (p <= 0) return { visible: false, dy: 0, speed: 0 };
  if (p >= 1) return { visible: true, dy: 0, speed: 0 };
  const dy = tl.fall * (1 - ease(p));
  return { visible: true, dy, speed: tl.fall * 3 * Math.pow(1 - p, 2) / DROP };
}

/** Camera during the build: orbit angle, elevation, distance and look-at height (units). */
export function buildCamera(tl: Timeline, t: number): { az: number; el: number; dist: number; ty: number } {
  const s = tl.size / 42, top = tl.height * 0.45;
  if (t < tl.hero) {
    const u = t / tl.hero, k = easeIO(Math.min(1, t / 7));
    return { az: -38 + 55 * u, el: 32 - 10 * u, dist: lerp(95, 150, k) * s, ty: lerp(3 * s, top, k) };
  }
  const u = Math.min(1, (t - tl.hero) / (tl.end - tl.hero));
  return { az: 17 + 28 * easeIO(u), el: 24 - 6 * easeIO(u), dist: (132 - 14 * easeIO(u)) * s, ty: top };
}
