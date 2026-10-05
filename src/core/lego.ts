// Which parts LEGO sells, from the Element ID table (src/data/elements.json,
// built from Rebrickable's exports by scripts/build-elements.ts).
import data from '../data/elements.json';

const TABLE = data.elements as Record<string, string>;
export const ELEMENTS_EXPORTED = data.exported;

/** LEGO Element ID for a BrickLink part and colour, or null: not available at LEGO. */
export const elementId = (part: string, color: number): string | null => TABLE[`${part}|${color}`] ?? null;

/** Parts the table covers at all. A part it doesn't know (no export yet) can't rule a colour out. */
export const KNOWN_PARTS = new Set(Object.keys(TABLE).map(k => k.split('|')[0]));
