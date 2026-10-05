// Instruction booklet: cover, one page per step, parts inventory. Pages are
// drawn on a canvas (1600×1131, A4 landscape) and packed into a PDF.
import type { Model } from '../core/build';
import { drawSprite, title as horseTitle, TRAIT_NAME } from '../core/horse';
import { BASES, COLOR_BY_ID, renderHex } from '../core/palette';
import { studsOf, type Kind } from '../core/parts';
import { StepRenderer } from './stepRenderer';

const PW = 1600, PH = 1131;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
const INK = '#1d3b5c';
const BOM_PER = 42;

// ---------- isometric part icons ----------
const KH: Record<Kind, number> = { brick: 1.2, plate: 0.4, jumper: 0.4 };
function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const k = (v: number) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${k(n >> 16)},${k((n >> 8) & 255)},${k(n & 255)})`;
}
function isoPart(x: CanvasRenderingContext2D, X: number, Y: number, w: number, d: number, hex: string, s: number, kind: Kind) {
  const h = KH[kind], c30 = Math.cos(Math.PI / 6);
  const P = (a: number, y: number, z: number): [number, number] => [X + (a - z) * c30 * s, Y + (a + z) * 0.5 * s - y * s];
  const poly = (pts: [number, number][], fill: string) => {
    x.beginPath(); pts.forEach((p, i) => (i ? x.lineTo(...p) : x.moveTo(...p))); x.closePath();
    x.fillStyle = fill; x.fill(); x.strokeStyle = 'rgba(0,0,0,.35)'; x.lineWidth = 1; x.stroke();
  };
  const dark = parseInt(hex.slice(1), 16) < 0x303030;
  const light = dark ? 2.2 : 1.12, side = dark ? 1.5 : 0.72;
  poly([P(0, h, 0), P(w, h, 0), P(w, h, d), P(0, h, d)], shade(hex, light));
  poly([P(0, 0, d), P(w, 0, d), P(w, h, d), P(0, h, d)], shade(hex, dark ? 1 : 0.9));
  poly([P(w, 0, 0), P(w, 0, d), P(w, h, d), P(w, h, 0)], shade(hex, side));
  for (const [a, b] of studsOf({ x: 0, z: 0, w, d, kind })) {
    const [u, v] = P(a, h, b), rx = 0.3 * s * c30 * 1.41, ry = 0.3 * s * 0.5 * 1.41, sh = 0.17 * s;
    x.fillStyle = shade(hex, side); x.beginPath(); x.ellipse(u, v - sh, rx, ry, 0, 0, Math.PI * 2); x.rect(u - rx, v - sh, rx * 2, sh); x.fill();
    x.beginPath(); x.ellipse(u, v, rx, ry, 0, 0, Math.PI); x.fill();
    x.fillStyle = shade(hex, light * 1.08); x.beginPath(); x.ellipse(u, v - sh, rx, ry, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(0,0,0,.3)'; x.stroke();
  }
}
export function icon(x: CanvasRenderingContext2D, cx: number, cy: number, w: number, d: number, hex: string, maxW: number, kind: Kind) {
  const c30 = Math.cos(Math.PI / 6);
  const s = Math.min(13, maxW / ((w + d) * c30));
  const width = (w + d) * c30 * s, height = ((w + d) * 0.5 + KH[kind]) * s;
  isoPart(x, cx - width / 2 + d * c30 * s, cy - height / 2 + KH[kind] * s, w, d, hex, s, kind);
}

// ---------- pages ----------
function blankPage(): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas'); c.width = PW; c.height = PH;
  const x = c.getContext('2d')!;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, PW, PH);
  return [c, x];
}
function footer(x: CanvasRenderingContext2D, n: number, title: string) {
  x.fillStyle = '#E8F1F8'; x.fillRect(0, PH - 90, PW, 90);
  x.fillStyle = INK; x.font = `bold 26px ${FONT}`; x.textAlign = 'left';
  x.fillText(title, 60, PH - 36);
  x.textAlign = 'right'; x.fillText(String(n), PW - 60, PH - 36); x.textAlign = 'left';
}
/** Which way the model faces, for the step pages: the camera looks at the front from the right. */
function orientation(x: CanvasRenderingContext2D, X: number, Y: number) {
  x.save();
  x.fillStyle = '#F3F7FB'; x.strokeStyle = '#9fbfd8'; x.lineWidth = 2;
  x.beginPath(); x.roundRect(X, Y, 330, 104, 14); x.fill(); x.stroke();
  x.fillStyle = INK; x.font = `bold 24px ${FONT}`; x.textAlign = 'left';
  x.fillText('◀ Tail', X + 20, Y + 40);
  x.textAlign = 'right'; x.fillText('Head ▶', X + 310, Y + 40);
  x.textAlign = 'left'; x.font = `20px ${FONT}`; x.fillStyle = '#44607a';
  x.fillText('Front faces you: the side the sprite shows', X + 20, Y + 78);
  x.restore();
}

export interface PageOptions { renderSize?: number }

/**
 * Draws any page of the booklet on demand: 1 = cover, 2..steps+1 = one page
 * per step, then the parts inventory. Used by the PDF, the video and the
 * on-page instructions viewer (which draws only the pages being looked at).
 */
export class PageMaker {
  readonly total: number;
  readonly steps: number;
  private r: StepRenderer;
  private NB: number;
  private title: string;
  constructor(private m: Model, o: PageOptions = {}) {
    this.NB = Math.ceil(m.bom.length / BOM_PER);
    this.steps = m.steps.length;
    this.total = 2 + m.steps.length + this.NB;   // cover, steps, finished model, parts
    this.r = new StepRenderer(m, o.renderSize ?? 1100);
    this.title = `BlockHorse ${horseTitle(m.horse)} · brick model`;
  }
  /** "Cover", "Step 12", "Finished model", "Parts 1/2" */
  label(n: number): string {
    if (n === 1) return 'Cover';
    if (n <= this.steps + 1) return `Step ${n - 1}`;
    if (n === this.steps + 2) return 'Finished model';
    return this.NB > 1 ? `Parts ${n - this.steps - 2}/${this.NB}` : 'Parts';
  }
  page(n: number): HTMLCanvasElement {
    const { m, r, title } = this, c = m.checks, NB = this.NB, h = m.horse;
    if (n === 1) {
  const [pg, x] = blankPage();
  const grad = x.createLinearGradient(0, 0, 0, PH); grad.addColorStop(0, '#7C95A5'); grad.addColorStop(1, '#5A7282');
  x.fillStyle = grad; x.fillRect(0, 0, PW, PH);
  x.drawImage(r.cover(), 470, 60, 1130, 1130);
  x.fillStyle = 'rgba(255,255,255,.92)'; x.fillRect(80, 290, 300, 300);
  drawSprite(x, h, 90, 300, 280 / 32);
  x.strokeStyle = '#fff'; x.lineWidth = 6; x.strokeRect(80, 290, 300, 300);
  x.fillStyle = '#fff'; x.font = `bold 84px ${FONT}`; x.fillText(`BLOCKHORSE #${h.token}`, 70, 150);
  x.font = `44px ${FONT}`; x.fillText(`${h.name} · brick model`, 74, 215);
  // trait colours: original → brick
  x.font = `22px ${FONT}`;
  const rows = [...m.palette.map(t => [TRAIT_NAME[t.trait], t.hex, `${t.css} → ${COLOR_BY_ID.get(t.color)!.name}`, renderHex(t.color)]),
    ['Base', renderHex(m.base), `${BASES.find(b => b.id === m.base)!.name} → ${COLOR_BY_ID.get(m.base)!.name}`, renderHex(m.base)]];
  rows.forEach(([name, from, text, to], i) => {
    const Y = 630 + i * 34;
    x.fillStyle = from; x.fillRect(80, Y - 20, 24, 24); x.fillStyle = to; x.fillRect(108, Y - 20, 24, 24);
    x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1.5; x.strokeRect(80, Y - 20, 24, 24); x.strokeRect(108, Y - 20, 24, 24);
    x.fillStyle = '#fff'; x.fillText(`${name}: ${text}`, 144, Y);
  });
  x.font = `bold 36px ${FONT}`; x.fillText(`${c.pieces.toLocaleString('en')} pieces`, 80, 950);
  x.font = `26px ${FONT}`;
  x.fillText(`${m.steps.length} steps · approx. ${m.dims[0]} × ${m.dims[1]} × ${m.dims[2]} cm`, 80, 990);
  x.font = `19px ${FONT}`; x.fillStyle = 'rgba(255,255,255,.85)';
  x.fillText('Made with BlockHorse to Bricks, based on Punk to Bricks by John Karp · Unofficial fan project · Not affiliated with, sponsored or endorsed by the LEGO Group or BrickLink.', 80, 1044);
  x.fillText('LEGO® is a trademark of the LEGO Group. Parts data: Rebrickable. Computer-checked only, not physically built. Provided "as is", without warranty.', 80, 1070);
      return pg;
    }
    if (n <= this.steps + 1) {
      const si = n - 2;
  const [pg, x] = blankPage();
  x.drawImage(r.stepView(si), 440, 0, 1100, 1100);
  const cnt = new Map<string, number>();
  for (const i of m.steps[si]) { const p = m.pieces[i]; const k = `${p.kind}|${p.c}|${Math.min(p.w, p.d)}|${Math.max(p.w, p.d)}`; cnt.set(k, (cnt.get(k) ?? 0) + 1); }
  const items = [...cnt.entries()];
  const cols = Math.max(2, Math.ceil(items.length / 10)), cw = cols > 3 ? 118 : 150, rowH = cols > 3 ? 70 : 82;
  const bw = cols * cw + 30, bh = 30 + Math.ceil(items.length / cols) * rowH;
  x.fillStyle = '#D6E8F5'; x.strokeStyle = '#9fbfd8'; x.lineWidth = 3;
  x.beginPath(); x.roundRect(40, 40, bw, bh, 18); x.fill(); x.stroke();
  items.forEach(([k, q], idx) => {
    const [kind, col, a, b] = k.split('|');
    const X0 = 55 + (idx % cols) * cw, Y0 = 55 + Math.floor(idx / cols) * rowH;
    icon(x, X0 + 38, Y0 + 32, +b, +a, renderHex(+col), cols > 3 ? 58 : 70, kind as Kind);
    x.fillStyle = '#111'; x.font = `bold 24px ${FONT}`; x.fillText(`${q}x`, X0 + (cols > 3 ? 74 : 84), Y0 + 44);
  });
  x.fillStyle = INK; x.font = `bold 110px ${FONT}`;
  x.fillText(String(si + 1), 60, Math.min(PH - 120, 40 + bh + 120));
  orientation(x, PW - 380, PH - 220);
  footer(x, si + 2, title);
      return pg;
    }
    if (n === this.steps + 2) {
  const [pg, x] = blankPage();
  x.drawImage(r.cover(), (PW - 1040) / 2, -10, 1040, 1040);
  x.fillStyle = INK; x.font = `bold 54px ${FONT}`; x.fillText('Finished model', 60, 90);
  x.font = `26px ${FONT}`; x.fillStyle = '#44607a';
  x.fillText(`${c.pieces.toLocaleString('en')} pieces · ${m.steps.length} steps · approx. ${m.dims[0]} × ${m.dims[1]} × ${m.dims[2]} cm`, 60, 130);
  orientation(x, PW - 380, PH - 220);
  footer(x, n, title);
      return pg;
    }
    const bp = n - this.steps - 3;
  const [pg, x] = blankPage();
  x.fillStyle = INK; x.font = `bold 54px ${FONT}`; x.fillText('Parts inventory' + (NB > 1 ? ` (${bp + 1}/${NB})` : ''), 60, 90);
  x.font = `26px ${FONT}`; x.fillStyle = '#44607a';
  x.fillText(`${c.pieces.toLocaleString('en')} pieces · ${m.bom.length} lots · BrickLink part and colour numbers`, 60, 130);
  const cols = 7, cw = (PW - 120) / cols, rh = 130;
  m.bom.slice(bp * BOM_PER, (bp + 1) * BOM_PER).forEach((it, k) => {
    const X0 = 60 + (k % cols) * cw, Y0 = 165 + Math.floor(k / cols) * rh;
    icon(x, X0 + 45, Y0 + 40, it.d, it.w, renderHex(it.color), 80, it.kind);
    x.fillStyle = '#111'; x.font = `bold 24px ${FONT}`; x.fillText(`${it.qty}x`, X0 + 100, Y0 + 30);
    x.font = `16px ${FONT}`; x.fillStyle = '#44607a';
    x.fillText(it.part, X0 + 100, Y0 + 52);
    x.fillText(it.name, X0 + 100, Y0 + 72);
    x.fillText(COLOR_BY_ID.get(it.color)!.name, X0 + 100, Y0 + 92);
  });
  footer(x, n, title);
    return pg;
  }
  dispose() { this.r.dispose(); }
}

/**
 * Draw the booklet's pages one by one and hand each to `use`. `pick` limits
 * which pages are drawn (e.g. a sample for the video).
 */
export async function drawPages(m: Model, o: PageOptions, use: (page: HTMLCanvasElement, n: number, total: number) => void | Promise<void>, pick: (n: number, total: number) => boolean = () => true): Promise<number> {
  const pm = new PageMaker(m, o);
  for (let n = 1; n <= pm.total; n++) {
    if (!pick(n, pm.total)) continue;
    await use(pm.page(n), n, pm.total);
    await new Promise(res => setTimeout(res, 0));
  }
  pm.dispose();
  return pm.total;
}

export const PAGE_SIZE = [PW, PH] as const;

export async function makeInstructions(m: Model, o: PageOptions & { onProgress?: (done: number, total: number) => void }): Promise<Blob> {
  const { jsPDF } = await import('jspdf');
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'px', format: [PW, PH], compress: true, hotfixes: ['px_scaling'] });
  pdf.setProperties({ title: `BlockHorse ${horseTitle(m.horse)} brick model — instructions`, creator: 'BlockHorse to Bricks' });
  await drawPages(m, o, (pg, n, total) => {
    if (n > 1) pdf.addPage([PW, PH], 'landscape');
    pdf.addImage(pg.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, PW, PH, undefined, 'FAST');
    o.onProgress?.(n, total);
  });
  return pdf.output('blob');
}
