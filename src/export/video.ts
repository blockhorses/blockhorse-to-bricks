// Video of the build animation (square or 9:16) with synced brick clicks.
// Recorded in real time with MediaRecorder: MP4 when the browser can, else WebM.
import type { Model } from '../core/build';
import type { PunkGrid } from '../core/detect';
import { easeIO } from '../viewer/timeline';
import { SKY, Viewer } from '../viewer/scene';
import { drawPages, PAGE_SIZE } from './pdf';
import { Book } from './book';
import { makeSoundtrack } from './sound';

export type VideoFormat = 'square' | 'story';
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

export function videoMime(): { mime: string; ext: 'mp4' | 'webm' } | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const mime of ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'])
    if (MediaRecorder.isTypeSupported(mime)) return { mime, ext: mime.startsWith('video/mp4') ? 'mp4' : 'webm' };
  return null;
}

export interface VideoOptions { format: VideoFormat; label: string; small?: boolean; onProgress?: (stage: 'pages' | 'recording', f: number) => void }

/** The booklet in the video: a 3D book whose pages turn slowly on a few pages, then riffle and land on the
 *  finished model. Right-hand pages (shown after each turn) and the backs of the leaves, in order. */
const SLOW = 1.2, FLIP = 0.6, HOLD = 1.6;
function bookPlan(steps: number) {
  const finished = steps + 2, pick = (f: number) => 2 + Math.round(f * (steps - 1));
  // pages that land on the right: cover, a step at the start, the middle and the end, a riffle, the finished model
  const right = [1, pick(0.08), pick(0.5), pick(0.85)];
  const nSlow = right.length;
  for (let i = 1; i <= 9; i++) right.push(pick(0.85 + (0.15 * i) / 10));   // riffle on to the last steps
  right.push(finished);
  const order: number[] = [];
  right.forEach((n, i) => { if (i) order.push(Math.max(2, Math.min(steps + 1, n - 1))); order.push(n); });
  const turns: [number, number][] = [];
  let at = 0.4 + SLOW;
  for (let j = 1; j < right.length; j++) {
    const fast = j >= nSlow, d = fast ? Math.max(0.22, 0.45 * Math.pow(0.85, j - nSlow)) : FLIP;
    turns.push([at, d]);
    at += fast ? Math.max(0.12, 0.3 * Math.pow(0.82, j - nSlow)) : SLOW;
  }
  return { order, turns, length: turns[turns.length - 1][0] + turns[turns.length - 1][1] + HOLD };
}

async function bookPages(m: Model, grid: PunkGrid, label: string, width: number, order: number[], onProgress: (f: number) => void): Promise<HTMLCanvasElement[]> {
  const got = new Map<number, HTMLCanvasElement>(), want = new Set(order);
  await drawPages(m, grid, { label, renderSize: width < 900 ? 700 : 1000 }, (pg, n) => {
    const c = document.createElement('canvas'); c.width = width; c.height = Math.round((width * PAGE_SIZE[1]) / PAGE_SIZE[0]);
    c.getContext('2d')!.drawImage(pg, 0, 0, c.width, c.height);
    got.set(n, c); onProgress(got.size / want.size);
  }, n => want.has(n));
  return order.map(n => got.get(n)!);
}

export async function recordVideo(m: Model, grid: PunkGrid, o: VideoOptions): Promise<{ blob: Blob; ext: string }> {
  const kind = videoMime();
  if (!kind) throw new Error('This browser can’t record video. Try Chrome, Edge, Firefox or Safari 14.1+.');
  const k = o.small ? 2 / 3 : 1;
  const W = Math.round(1080 * k), H = Math.round((o.format === 'story' ? 1920 : 1080) * k);
  // 3D frames off-screen, composed with titles on a 2D canvas that is recorded
  const glCanvas = document.createElement('canvas');
  const v = new Viewer(glCanvas, { fixedSize: [W, H], lowPoly: o.small, label: o.label });
  v.setModel(m);
  const tl = v.tl!;
  const plan = bookPlan(m.steps.length);
  const pages = await bookPages(m, grid, o.label, o.small ? 1100 : 1600, plan.order, f => o.onProgress?.('pages', f));
  const book = new Book(pages, PAGE_SIZE[1] / PAGE_SIZE[0], W / H, plan.turns);
  const tBook = tl.end, duration = tBook + plan.length;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const x = out.getContext('2d')!;
  const title = o.label ? `Punk ${o.label}` : 'My CryptoPunk';
  const sub = `${m.checks.pieces.toLocaleString('en')} pieces · ${m.size === 'xl' ? 'XL' : 'Mini'} brick bust`;

  const drawModel = (t: number) => {
    v.pose(Math.min(t, tl.end)); v.setBuildCamera(Math.min(t, tl.end)); v.render();
    x.drawImage(glCanvas, 0, 0, W, H);
  };
  const drawBook = (tb: number) => { book.pose(tb); v.renderer.render(book.scene, book.camera); return glCanvas; };
  const frame = (t: number) => {
    x.fillStyle = `#${SKY.getHexString()}`; x.fillRect(0, 0, W, H);
    if (t < tBook) drawModel(t);
    else if (t < tBook + 0.6) {   // cross-fade from the bust to the booklet
      drawModel(t);
      x.globalAlpha = easeIO((t - tBook) / 0.6); x.drawImage(drawBook(t - tBook), 0, 0, W, H); x.globalAlpha = 1;
    } else x.drawImage(drawBook(t - tBook), 0, 0, W, H);
    x.fillStyle = '#16242f'; x.textAlign = 'center';
    if (o.format === 'story') {
      x.font = `800 ${Math.round(72 * k)}px ${FONT}`; x.fillText(title, W / 2, 150 * k);
      x.font = `500 ${Math.round(40 * k)}px ${FONT}`; x.fillText(sub, W / 2, 215 * k);
      x.font = `600 ${Math.round(34 * k)}px ${FONT}`; x.globalAlpha = 0.75; x.fillText('Punk to Bricks', W / 2, H - 110 * k); x.globalAlpha = 1;
    } else {
      x.textAlign = 'left';
      x.font = `800 ${Math.round(44 * k)}px ${FONT}`; x.fillText(title, 44 * k, 76 * k);
      x.font = `500 ${Math.round(28 * k)}px ${FONT}`; x.fillText(sub, 44 * k, 118 * k);
      x.font = `600 ${Math.round(24 * k)}px ${FONT}`; x.globalAlpha = 0.7; x.fillText('Punk to Bricks', 44 * k, H - 40 * k); x.globalAlpha = 1;
    }
  };

  const ac = new AudioContext({ sampleRate: 48000 });
  const src = ac.createBufferSource();
  src.buffer = makeSoundtrack(m, tl, duration, { at: tBook, flips: book.sched });
  const dest = ac.createMediaStreamDestination();
  src.connect(dest);
  frame(0);
  const stream = new MediaStream([...out.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: kind.mime, videoBitsPerSecond: o.small ? 2_000_000 : 3_000_000, audioBitsPerSecond: 128_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  const done = new Promise<void>(res => { rec.onstop = () => res(); });
  await ac.resume();
  rec.start(250);
  const t0 = ac.currentTime + 0.05;
  src.start(t0);
  // the audio clock drives the animation, so clicks stay on the pieces
  await new Promise<void>(res => {
    const step = () => {
      const t = ac.currentTime - t0;
      frame(Math.max(0, t));
      o.onProgress?.('recording', Math.min(1, Math.max(0, t) / duration));
      if (t >= duration) return res();
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  });
  rec.stop();
  await done;
  src.disconnect(); await ac.close();
  stream.getTracks().forEach(tr => tr.stop());
  v.dispose(); book.dispose();
  return { blob: new Blob(chunks, { type: kind.mime.split(';')[0] }), ext: kind.ext };
}
