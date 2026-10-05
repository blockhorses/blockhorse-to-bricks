// The 260 BlockHorses: traits, species, names, and the original 32 × 32 sprite.
import data from '../data/horses.json';

export const TOKENS = data.horses.length;
export type Species = 'horse' | 'pegasus' | 'unicorn' | 'winged';
export type Trait = 'C' | 'M' | 'T' | 'E' | 'S' | 'U' | 'W';
/** Traits in the order their brick colours are picked (coat first). */
export const TRAITS: Trait[] = ['C', 'M', 'T', 'E', 'S', 'U', 'W'];
export const TRAIT_NAME: Record<Trait, string> = { C: 'Coat', M: 'Mane', T: 'Tail', E: 'Eyes', S: 'Shoes', U: 'Horn', W: 'Wings' };
const FIELD: Record<Trait, number> = { C: 0, M: 1, T: 2, S: 3, E: 4, U: 5, W: 6 };   // index in horses.json
export const SPECIES_NAME: Record<Species, string> = { horse: 'Horse', pegasus: 'Pegasus', unicorn: 'Unicorn', winged: 'Winged Unicorn' };
/** One example of each species, shown under the picker. */
export const EXAMPLES = [5, 4, 8, 6];

export interface Horse {
  token: number;
  species: Species;
  name: string;                                // "Purple Winged Unicorn", as the token is named
  traits: Partial<Record<Trait, string>>;      // CSS colour names; no horn / wings when it has none
}

export const cssHex = (name: string) => (data.cssHex as Record<string, string>)[name];

export function horse(token: number): Horse {
  const row = data.horses[token - 1];
  if (!row) throw new Error(`BlockHorse #${token} doesn't exist (1 to ${TOKENS})`);
  const traits: Horse['traits'] = {};
  for (const t of TRAITS) { const v = row[FIELD[t]]; if (v) traits[t] = v; }
  const species: Species = traits.U && traits.W ? 'winged' : traits.U ? 'unicorn' : traits.W ? 'pegasus' : 'horse';
  return { token, species, name: `${traits.C} ${SPECIES_NAME[species]}`, traits };
}

/** "#6 Purple Winged Unicorn" */
export const title = (h: Horse) => `#${h.token} ${h.name}`;
/** "blockhorse-6-purple-winged-unicorn" */
export const slug = (h: Horse) => `blockhorse-${h.token}-${h.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

// ---------- the sprite (blockhorses/BlockHorses templates/horse.js) ----------
/** A 1-pixel line: pixels x1 .. x2-1 of row y. */
export interface Line { x1: number; y: number; x2: number }
const L = (x1: number, y: number, x2: number): Line => ({ x1, y, x2 });
export const GEO: Record<'S' | 'backleg' | 'frontleg' | 'core' | 'head' | 'ear' | 'E' | 'T' | 'M' | 'U' | 'W', Line[]> = {
  S: [L(7, 31, 9), L(18, 31, 20)],
  backleg: [L(7, 30, 9), L(7, 29, 9), L(7, 28, 9), L(7, 27, 9), L(7, 26, 9), L(7, 25, 9), L(7, 24, 9), L(6, 23, 10)],
  frontleg: [L(18, 30, 20), L(18, 29, 20), L(18, 28, 20), L(18, 27, 20), L(18, 26, 20), L(18, 25, 20), L(18, 24, 20), L(17, 23, 21)],
  core: [L(6, 22, 21), L(5, 21, 22), L(5, 20, 22), L(5, 19, 22), L(5, 18, 22), L(5, 17, 22), L(6, 16, 23), L(8, 15, 24), L(20, 14, 25)],
  head: [L(28, 15, 30), L(27, 14, 31), L(21, 13, 31), L(22, 12, 30), L(23, 11, 29), L(23, 10, 28), L(25, 9, 27)],
  ear: [L(22, 9, 24), L(22, 8, 23)],
  E: [L(26, 11, 27)],
  T: [L(1, 23, 2), L(0, 22, 2), L(0, 21, 3), L(1, 20, 3), L(1, 19, 4), L(2, 18, 4), L(2, 17, 4), L(3, 16, 6), L(3, 15, 7), L(4, 14, 6)],
  M: [L(18, 15, 19), L(17, 14, 20), L(18, 13, 21), L(19, 12, 22), L(20, 11, 23), L(21, 10, 23), L(25, 10, 28), L(24, 9, 27), L(24, 8, 26)],
  U: [L(27, 9, 28), L(28, 8, 29), L(29, 7, 30), L(30, 6, 31)],
  W: [L(15, 16, 17), L(14, 15, 16), L(14, 14, 16), L(11, 13, 16), L(10, 12, 16), L(9, 11, 15), L(7, 10, 15), L(6, 9, 14), L(5, 8, 13), L(4, 7, 5), L(6, 7, 12), L(5, 6, 11), L(4, 5, 5), L(6, 5, 10), L(5, 4, 8), L(4, 3, 5), L(6, 3, 7)],
};
/** Sprite lines per trait, in draw order (later wins). */
export function spriteLines(h: Horse): [Trait, Line[]][] {
  const coat = [...GEO.backleg, ...GEO.frontleg, ...GEO.core, ...GEO.head, ...GEO.ear];
  const out: [Trait, Line[]][] = [['S', GEO.S], ['C', coat], ['E', GEO.E], ['T', GEO.T], ['M', GEO.M]];
  if (h.traits.U) out.push(['U', GEO.U]);
  if (h.traits.W) out.push(['W', GEO.W]);
  return out;
}

/** The original sprite, drawn on a canvas, `px` pixels per sprite pixel, on a transparent or `bg` background. */
export function drawSprite(x: CanvasRenderingContext2D, h: Horse, X: number, Y: number, px: number) {
  for (const [t, lines] of spriteLines(h)) {
    x.fillStyle = cssHex(h.traits[t]!);
    for (const l of lines) x.fillRect(X + l.x1 * px, Y + l.y * px, (l.x2 - l.x1) * px, px);
  }
}

/** The original sprite as SVG markup. */
export function spriteSVG(h: Horse, size = 32): string {
  let s = '';
  for (const [t, lines] of spriteLines(h)) for (const l of lines) s += `<rect x="${l.x1}" y="${l.y}" width="${l.x2 - l.x1}" height="1" fill="${cssHex(h.traits[t]!)}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="${size}" height="${size}" shape-rendering="crispEdges">${s}</svg>`;
}
