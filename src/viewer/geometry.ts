// Geometry of one piece type (brick, plate, jumper plate), cached by shape.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { studsOf, type Piece } from '../core/parts';
import { PL } from './timeline';

const cache = new Map<string, THREE.BufferGeometry>();

export const geoKey = (p: Piece) => `${p.kind}${p.w}x${p.d}`;

export function pieceGeometry(p: Piece, lowPoly = false): THREE.BufferGeometry {
  const k = geoKey(p) + (lowPoly ? 'L' : '');
  const hit = cache.get(k);
  if (hit) return hit;
  const h = p.h * PL;
  const body = new RoundedBoxGeometry(p.w - 0.03, h - 0.02, p.d - 0.03, lowPoly ? 1 : 2, Math.min(0.035, h / 4));
  body.translate(0, h / 2, 0);
  const parts: THREE.BufferGeometry[] = [body];
  // studs where the piece really has them (a jumper: one, in the centre), relative to the piece centre
  for (const [sx, sz] of studsOf({ x: 0, z: 0, w: p.w, d: p.d, kind: p.kind })) {
    const c = new THREE.CylinderGeometry(0.3, 0.3, 0.17, lowPoly ? 8 : 12);
    c.translate(sx - p.w / 2, h + 0.085, sz - p.d / 2);
    parts.push(c);
  }
  const g = mergeGeometries(parts.map(q => { const r = q.index ? q.toNonIndexed() : q; if (r.attributes.uv) r.deleteAttribute('uv'); return r; }))!;
  g.computeBoundingSphere();
  cache.set(k, g);
  return g;
}
