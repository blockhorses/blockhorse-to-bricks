import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseHorseSVG } from '../scripts/extract-horses';
import data from '../src/data/horses.json';

describe('horses.json', () => {
  it('matches the reference parse of api/horse/<n>.svg', () => {
    const ref = JSON.parse(readFileSync('blockhorse-reference/horses.json', 'utf8'));
    expect(data.horses).toEqual(ref.horses);
    expect(data.fields).toEqual(ref.fields);
    expect(data.cssHex).toEqual(ref.cssHex);
  });
  it('reads trait strokes from a token SVG, horn and wings optional', () => {
    const g = (id: string, c: string) => `<g id="${id}" style="stroke:${c};"></g>`;
    const svg = g('shoes', 'Black') + g('horse', 'Purple ') + g('eye', 'Orange') + g('tail', 'Gold') + g('mane', 'Gold') + g('wings', 'GoldenRod');
    expect(parseHorseSVG(svg)).toEqual(['Purple', 'Gold', 'Gold', 'Black', 'Orange', null, 'GoldenRod']);
  });
});
