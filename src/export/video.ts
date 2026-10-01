// Video of the build animation (square or 9:16) with synced brick clicks.
// Recorded in real time with MediaRecorder: MP4 when the browser can, else WebM.
import type { Model } from '../core/build';
import type { PunkGrid } from '../core/detect';
import { easeIO } from '../viewer/timeline';
import { SKY, Viewer } from '../viewer/scene';
import { drawPages, PAGE_SIZE } from './pdf';
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

/** The booklet in the video: a few pages read slowly, then a quick riffle that ends on the finished model. */
const SLOW = 1.2, FAST = 0.13, HOLD = 1.4;
function bookPlan(steps: number) {
  const last = steps + 1, pick = (f: number) => 2 + Math.round(f * (steps - 1));
  // cover, a step at the start, the middle and the end, then the finished model (the last step)
  const slow = [...new Set([1, pick(0.08), pick(0.5), pick(0.85), last])];
  const fast: number[] = [];
  for (let i = 0; i < 10; i++) fast.push(2 + Math.round((i * (steps - 1)) / 10));
  fast.push(last);
  return { slow, fast, length: slow.length * SLOW + fast.length * FAST + HOLD };
}

async function bookPages(m: Model, grid: PunkGrid, label: string, width: number, want: Set<number>, onProgress: (f: number) => void): Promise<Map<number, HTMLCanvasElement>> {
  const out = new Map<number, HTMLCanvasElement>();
  await drawPages(m, grid, { label, renderSize: width < 900 ? 700 : 1000 }, (pg, n) => {
    const c = document.createElement('canvas'); c.width = width; c.height = Math.round((width * PAGE_SIZE[1]) / PAGE_SIZE[0]);
    c.getContext('2d')!.drawImage(pg, 0, 0, c.width, c.height);
    out.set(n, c); onProgress(out.size / want.size);
  }, n => want.has(n));
  return out;
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
  const pages = await bookPages(m, grid, o.label, o.small ? 720 : 1080, new Set([...plan.slow, ...plan.fast]), f => o.onProgress?.('pages', f));
  // page turns: [start, duration] after the model, for the page sounds
  const turns: [number, number, number][] = [];   // start, length, page
  let at = 0.6;
  for (const n of plan.slow) { turns.push([at, SLOW, n]); at += SLOW; }
  for (const n of plan.fast) { turns.push([at, FAST, n]); at += FAST; }
  turns[turns.length - 1][1] += HOLD;
  const tBook = tl.end, duration = tBook + at + HOLD;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const x = out.getContext('2d')!;
  const title = o.label ? `Punk ${o.label}` : 'My CryptoPunk';
  const sub = `${m.checks.pieces.toLocaleString('en')} pieces · ${m.size === 'xl' ? 'XL' : 'Mini'} brick bust`;

  const drawModel = (t: number) => {
    v.pose(Math.min(t, tl.end)); v.setBuildCamera(Math.min(t, tl.end)); v.render();
    x.drawImage(glCanvas, 0, 0, W, H);
  };
  // a page fills 88 % of the width, centred under the titles, with a soft shadow
  const PWv = Math.round(W * 0.88), PHv = Math.round((PWv * PAGE_SIZE[1]) / PAGE_SIZE[0]);
  const PX = (W - PWv) / 2, PY = o.format === 'story' ? (H - PHv) / 2 : Math.max(140 * k, (H - PHv) / 2 + 30 * k);
  const pageAt = (tb: number) => { let cur = turns[0]; for (const tr of turns) if (tb >= tr[0]) cur = tr; return cur; };
  const drawPage = (n: number, alpha = 1) => {
    const pg = pages.get(n); if (!pg) return;
    x.save(); x.globalAlpha = alpha; x.shadowColor = 'rgba(20,40,60,.28)'; x.shadowBlur = 30 * k; x.shadowOffsetY = 10 * k;
    x.drawImage(pg, PX, PY, PWv, PHv); x.restore();
  };
  const drawBook = (tb: number) => {
    const cur = pageAt(tb), i = turns.indexOf(cur), prev = turns[i - 1];
    // slow pages fade in, the riffle cuts
    const fade = cur[1] >= SLOW && prev ? Math.min(1, (tb - cur[0]) / 0.25) : 1;
    if (fade < 1 && prev) drawPage(prev[2]);
    drawPage(cur[2], fade);
  };
  const frame = (t: number) => {
    x.fillStyle = `#${SKY.getHexString()}`; x.fillRect(0, 0, W, H);
    if (t < tBook) drawModel(t);
    else if (t < tBook + 0.6) {   // the bust fades out, the cover comes in
      drawModel(t);
      const u = easeIO((t - tBook) / 0.6);
      x.fillStyle = `#${SKY.getHexString()}`; x.globalAlpha = u; x.fillRect(0, 0, W, H); x.globalAlpha = 1;
      drawPage(turns[0][2], u);
    } else drawBook(t - tBook);
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
  src.buffer = makeSoundtrack(m, tl, duration, { at: tBook, flips: turns.slice(1).map(([s0, d]) => [s0, Math.min(d, 0.3)] as [number, number]) });
  const dest = ac.createMediaStreamDestination();
  src.connect(dest);
  frame(0);
  const stream = new MediaStream([...out.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const rec = new MediaRecorder(stream, { mimeType: kind.mime, videoBitsPerSecond: o.small ? 5_000_000 : 9_000_000, audioBitsPerSecond: 128_000 });
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
  v.dispose();
  return { blob: new Blob(chunks, { type: kind.mime.split(';')[0] }), ext: kind.ext };
}
