import { buildModel, type Model } from './core/build';
import { EXAMPLES, horse, slug, SPECIES_NAME, spriteSVG, title, TOKENS, TRAIT_NAME } from './core/horse';
import { BASES, COLOR_BY_ID, DEFAULT_BASE, renderHex } from './core/palette';
import { Viewer } from './viewer/scene';
import { brickLinkXML, partsCSV } from './export/parts';
import { brickLinkRemainderXML, orderSummary, pickABrickFiles } from './export/order';
import { icon } from './export/pdf';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const isPhone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const viewer = new Viewer($('view'), { lowPoly: isPhone });
viewer.onFinished = () => { $('hint').hidden = false; };

// per-viewer conveniences: the last base colour and LEGO choice
const store = {
  get(k: string) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k: string, v: string) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
let token = 0;
let base = BASES.some(b => b.id === +(store.get('bh.base') ?? '')) ? +store.get('bh.base')! : DEFAULT_BASE;
let legoOnly = store.get('bh.lego') === '1';
let model: Model | null = null;
const current = () => model;

// ---------- input ----------
function showError(msg: string | null) {
  const e = $('error'); e.hidden = !msg; e.textContent = msg ?? '';
}
function showHorse(t: number) {
  const h = horse(t);
  $('sprite').innerHTML = spriteSVG(h, 176);
  $('sprite').setAttribute('aria-label', `The original sprite of BlockHorse ${title(h)}`);
  $('horse-name').textContent = title(h);
  $('horse-species').textContent = `${SPECIES_NAME[h.species]} · BlockHorse ${t} of ${TOKENS}`;
  $<HTMLInputElement>('token').value = String(t);
  document.querySelectorAll<HTMLButtonElement>('#examples button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.t! === t)));
}
/** Pick a token: show its sprite, build its model. */
function choose(t: number, { scroll = false } = {}) {
  if (!Number.isInteger(t) || t < 1 || t > TOKENS) { showError(`Type a BlockHorse number from 1 to ${TOKENS}.`); return; }
  showError(null);
  token = t;
  showHorse(t);
  if (location.hash !== `#${t}`) history.replaceState(null, '', `#${t}`);
  rebuild();
  if (scroll) $('sec-horse').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
const wrap = (t: number) => ((t - 1 + TOKENS) % TOKENS) + 1;
$('by-number').addEventListener('submit', e => { e.preventDefault(); choose(+$<HTMLInputElement>('token').value.trim(), { scroll: true }); });
$('prev').addEventListener('click', () => choose(wrap(token - 1)));
$('next').addEventListener('click', () => choose(wrap(token + 1)));
$('random').addEventListener('click', () => { let t = token; while (t === token) t = 1 + Math.floor(Math.random() * TOKENS); choose(t); });
for (const t of EXAMPLES) {
  const h = horse(t), b = document.createElement('button');
  b.type = 'button'; b.dataset.t = String(t); b.title = title(h);
  b.innerHTML = `${spriteSVG(h, 40)}#${t}<small>${SPECIES_NAME[h.species].replace('Winged Unicorn', 'Winged')}</small>`;
  b.addEventListener('click', () => choose(t));
  $('examples').append(b);
}
for (const b of BASES) {
  const el = document.createElement('button');
  el.className = 'base'; el.setAttribute('role', 'radio'); el.dataset.base = String(b.id);
  el.title = `${b.name}: ${COLOR_BY_ID.get(b.id)!.name}`;
  el.innerHTML = `<i style="background:${renderHex(b.id)}"></i>${b.name}`;
  el.addEventListener('click', () => { base = b.id; store.set('bh.base', String(base)); rebuild({ replay: false }); });
  $('bases').append(el);
}

// ---------- the model ----------
function rebuild({ replay = true } = {}) {
  const t = performance.now();
  const m = buildModel(token, { base, legoOnly });
  model = m;
  $('result').hidden = false;
  document.querySelectorAll<HTMLButtonElement>('.base').forEach(b => b.setAttribute('aria-checked', String(+b.dataset.base! === base)));
  $('hint').hidden = true;
  viewer.setModel(m);
  if (replay) viewer.play(); else viewer.skip();
  renderChecks(m, performance.now() - t);
  renderTraits(m);
  $('horse-sub').textContent = `${title(m.horse)} · built and checked in your browser`;
  $('secnav').hidden = false;
  renderBuy(m);
  renderReader(m);
}

function renderTraits(m: Model) {
  const rows = m.palette.map(t => {
    const c = COLOR_BY_ID.get(t.color)!;
    const why = t.color !== t.nearest ? ` · nearest was ${COLOR_BY_ID.get(t.nearest)!.name}` : '';
    return `<li title="${TRAIT_NAME[t.trait]}: ${t.css} (${t.hex}) → ${c.name}${why}"><b>${TRAIT_NAME[t.trait]}</b><i class="sw" style="background:${t.hex}"></i><span class="from">${t.css} →</span><i class="sw" style="background:${renderHex(t.color)}"></i><span>${c.name}</span>${t.legoAll ? '' : '<small>some parts BrickLink only</small>'}</li>`;
  });
  const b = BASES.find(x => x.id === m.base)!, bc = COLOR_BY_ID.get(m.base)!;
  rows.push(`<li><b>Base</b><i class="sw" style="background:${renderHex(m.base)}"></i><span>${b.name} · ${bc.name}</span></li>`);
  $('traits').innerHTML = rows.join('');
}

function renderChecks(m: Model, ms: number) {
  const c = m.checks;
  const li = (cls: string, big: string, small: string) => `<li class="${cls}"><b>${big}</b>${small}</li>`;
  $('checks').innerHTML = [
    li('ok', `${c.connections.toLocaleString('en')} studs`, 'connected between pieces'),
    c.collisions === 0 ? li('ok', '0 collisions', 'no two pieces overlap') : li('bad', `${c.collisions} collisions`, 'some pieces overlap: this model can’t be built as is'),
    c.floating === 0 ? li('ok', '0 floating', 'every piece is attached to the base') : li('bad', `${c.floating} floating`, 'pieces not attached to the base: this model can’t be built as is'),
    c.com.inside ? li('ok', 'Balanced', `centre of mass ${c.com.margin} studs inside the base`) : li('bad', 'Will tip over', 'the centre of mass is outside the base'),
    c.weak === 0 ? li('ok', '0 weak joints', 'no piece larger than 1 × 1 hangs on a single stud') : li('warn', `${c.weak} weak joint${c.weak > 1 ? 's' : ''}`, 'pieces larger than 1 × 1 held by a single stud: fine for display, handle gently'),
    ...(c.single ? [li('ok', `${c.single} on one stud`, `1 × 1 piece${c.single > 1 ? 's' : ''} held by a single stud, as a 1 × 1 always is: not counted as weak`)] : []),
  ].join('');
  $('notes').innerHTML = [...m.notes, `Computed in your browser in ${Math.max(1, Math.round(ms))} ms. Computer-checked, not physically build-tested.`].map(n => `<li>${n}</li>`).join('');
  const stat = (v: string, l: string) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`;
  $('stats').innerHTML = stat(c.pieces.toLocaleString('en'), 'pieces') + stat(String(m.steps.length), 'steps')
    + stat(String(m.bom.length), 'lots to buy') + stat(`${m.dims[0]}×${m.dims[1]}×${m.dims[2]}`, 'cm');
  const solid = c.floating === 0 && c.collisions === 0 && c.com.inside;
  const pill = $('pill');
  pill.className = solid ? 'pill' : 'pill bad';
  pill.textContent = solid ? '✓ Checked: solid' : '✗ Check failed';
  $('status-short').textContent = `${c.floating} floating · ${c.collisions} collisions · ${c.weak} weak · ${c.com.inside ? 'balanced' : 'will tip over'}`;
}

$('replay').addEventListener('click', () => { $('hint').hidden = true; viewer.play(); });
$('skip').addEventListener('click', () => viewer.skip());

// ---------- exports ----------
const baseName = () => (model ? slug(model.horse) : 'blockhorse');
function save(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
function progress(text: string | null, f = 0) {
  $('progress').hidden = text === null;
  if (text !== null) { $('progress-text').textContent = text; $('bar').style.width = `${Math.round(f * 100)}%`; }
}
let exporting = false;
const busyButtons = () => document.querySelectorAll<HTMLButtonElement>('.act, .vid-btn, .ctab');
async function run(label: string, job: () => Promise<void>) {
  if (exporting || !current()) return;
  exporting = true;
  busyButtons().forEach(b => { b.disabled = true; });
  try { await job(); progress(null); }
  catch (e) { progress(`${label} failed: ${(e as Error).message}`, 0); setTimeout(() => progress(null), 6000); }
  finally { exporting = false; busyButtons().forEach(b => { b.disabled = false; }); }
}

// ---------- ② instructions reader: pages are drawn only when looked at ----------
type Maker = import('./export/pdf').PageMaker;
let maker: Maker | null = null, makerFor: Model | null = null, pageNo = 1;
let thumbObserver: IntersectionObserver | null = null;
async function renderReader(m: Model) {
  const { PageMaker } = await import('./export/pdf');
  if (current() !== m) return;
  const keep = makerFor && makerFor.horse.token === m.horse.token ? pageNo : 1;
  maker?.dispose();
  maker = new PageMaker(m, { renderSize: isPhone ? 800 : 1000 });
  makerFor = m;
  const range = $<HTMLInputElement>('pg-range');
  range.max = String(maker.total);
  $('manual-sub').textContent = `${m.steps.length} steps · ${maker.total} pages · one page per brick row`;
  $('pdf-note').textContent = `PDF · ${maker.total} pages`;
  // thumbnails: placeholders now, drawn when they scroll into view
  thumbObserver?.disconnect();
  const strip = $('thumbs'); strip.innerHTML = '';
  const queue: number[] = [];
  let drawing = false;
  const drain = () => {
    if (drawing || !queue.length || !maker) return;
    drawing = true;
    const n = queue.shift()!, c = strip.querySelector<HTMLCanvasElement>(`[data-n="${n}"] canvas`);
    setTimeout(() => {
      if (c && maker && makerFor === m) c.getContext('2d')!.drawImage(maker.page(n), 0, 0, c.width, c.height);
      drawing = false; drain();
    }, 0);
  };
  thumbObserver = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const n = +(e.target as HTMLElement).dataset.n!;
    thumbObserver!.unobserve(e.target); queue.push(n); drain();
  }), { root: strip, rootMargin: '0px 240px' });
  for (let n = 1; n <= maker.total; n++) {
    const b = document.createElement('button');
    b.dataset.n = String(n);
    const c = document.createElement('canvas'); c.width = 224; c.height = 158;
    b.append(c, maker.label(n));
    b.addEventListener('click', () => showPage(n));
    strip.append(b); thumbObserver.observe(b);
  }
  showPage(keep);
}
function showPage(n: number) {
  if (!maker) return;
  pageNo = Math.max(1, Math.min(maker.total, n));
  const c = $<HTMLCanvasElement>('page-canvas');
  c.getContext('2d')!.drawImage(maker.page(pageNo), 0, 0, c.width, c.height);
  $<HTMLInputElement>('pg-range').value = String(pageNo);
  $('pg-label').textContent = `${maker.label(pageNo)}${pageNo > 1 && pageNo <= maker.steps + 1 ? ` of ${maker.steps}` : ''}`;
  $<HTMLButtonElement>('pg-prev').disabled = pageNo === 1;
  $<HTMLButtonElement>('pg-next').disabled = pageNo === maker.total;
  const strip = $('thumbs');
  strip.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.n! === pageNo));
  const on = strip.querySelector<HTMLElement>(`[data-n="${pageNo}"]`);
  if (on) strip.scrollTo({ left: on.offsetLeft - strip.clientWidth / 2 + on.clientWidth / 2, behavior: 'smooth' });
}
$('pg-prev').addEventListener('click', () => showPage(pageNo - 1));
$('pg-next').addEventListener('click', () => showPage(pageNo + 1));
$('pg-range').addEventListener('input', e => showPage(+(e.target as HTMLInputElement).value));
$('page-view').tabIndex = 0;
$('page-view').addEventListener('keydown', e => { if (e.key === 'ArrowRight') showPage(pageNo + 1); if (e.key === 'ArrowLeft') showPage(pageNo - 1); });
{ // swipe on phones
  let x0: number | null = null;
  $('page-view').addEventListener('pointerdown', e => { x0 = e.clientX; });
  $('page-view').addEventListener('pointerup', e => { if (x0 !== null && Math.abs(e.clientX - x0) > 40) showPage(pageNo + (e.clientX < x0 ? 1 : -1)); x0 = null; });
}
const makePdf = async (m: Model) => {
  const { makeInstructions } = await import('./export/pdf');
  progress('Drawing the instructions…', 0);
  return makeInstructions(m, { renderSize: isPhone ? 800 : 1100, onProgress: (d, t) => progress(`Drawing page ${d} of ${t}…`, d / t) });
};
$('dl-pdf').addEventListener('click', () => run('Instructions', async () => {
  save(await makePdf(current()!), `${baseName()}.pdf`);
}));
$('dl-kit').addEventListener('click', () => run('Kit', async () => {
  const { makeZip } = await import('./export/zip');
  const m = current()!, name = baseName();
  const pdf = await makePdf(m);
  const readme = [`BlockHorse ${title(m.horse)} — made with BlockHorse to Bricks`, '',
    `${m.checks.pieces} pieces · ${m.steps.length} steps · ${m.bom.length} lots · about ${m.dims.join(' × ')} cm`, '',
    ...m.palette.map(t => `${TRAIT_NAME[t.trait]}: ${t.css} (${t.hex}) → ${COLOR_BY_ID.get(t.color)!.name}`),
    `Base: ${BASES.find(b => b.id === m.base)!.name} → ${COLOR_BY_ID.get(m.base)!.name}`, '',
    `${name}.pdf   step-by-step instructions, one page per brick row`, `${name}-parts.csv   parts list (BrickLink part and colour numbers)`, '',
    'To order the bricks, use "Buy the bricks" on the site: it makes your LEGO Pick a Brick and BrickLink lists.', '',
    'Models are generated automatically and checked by software only. They have NOT been physically built. Provided "as is", without warranty of any kind.',
    'Unofficial fan project · Not affiliated with, sponsored or endorsed by the LEGO Group or BrickLink. LEGO® is a trademark of the LEGO Group. Parts data: Rebrickable.',
    'Based on Punk to Bricks by John Karp (MIT). BlockHorses: https://github.com/blockhorses/BlockHorses', ''].join('\r\n');
  save(await makeZip([{ name: `${name}.pdf`, data: pdf }, { name: `${name}-parts.csv`, data: partsCSV(m) }, { name: 'README.txt', data: readme }]), `${name}-kit.zip`);
}));
for (const format of ['square', 'story'] as const) $(format === 'square' ? 'vid-square' : 'vid-story').addEventListener('click', () => run('Video', async () => {
  const { recordVideo } = await import('./export/video');
  progress('Preparing the booklet pages…', 0);
  const { blob, ext } = await recordVideo(current()!, { format, small: isPhone,
    onProgress: (stage, f) => progress(stage === 'pages' ? 'Preparing the booklet pages…' : 'Recording the video (24 s)… keep this tab open', f) });
  save(blob, `${baseName()}-${format === 'story' ? '9x16' : 'square'}.${ext}`);
}));

// ---------- ③ buy the bricks ----------
function renderBuy(m: Model) {
  const s = orderSummary(m), total = m.bom.length, pcs = m.checks.pieces.toLocaleString('en');
  const legoSet = new Set(s.lego.map(l => `${l.part}|${l.color}`));
  $('shop-sum').textContent = `${total} lots · ${pcs} pieces · BrickLink part numbers`;
  const g = $('shop-grid'); g.innerHTML = '';
  for (const b of m.bom) {
    const lot = document.createElement('div'); lot.className = 'lot';
    const at = legoSet.has(`${b.part}|${b.color}`);
    lot.title = `${b.qty}× ${b.name}, ${b.colorName} (${b.part}) · ${at ? 'at LEGO Pick a Brick' : 'BrickLink only'}`;
    const c = document.createElement('canvas'); c.width = 112; c.height = 88;
    icon(c.getContext('2d')!, 56, 44, b.d, b.w, renderHex(b.color), 96, b.kind);
    const dot = document.createElement('i'); dot.className = `dot ${at ? 'lego' : 'bl'}`;
    const t = document.createElement('span');
    t.innerHTML = `<span class="q">${b.qty}x</span><small>${b.name}</small><small>${b.colorName}</small>`;
    lot.append(dot, c, t); g.append(lot);
  }
  const more = $('shop-more');
  more.hidden = total <= 8;
  $('shoplist').classList.toggle('open', false);
  more.textContent = `See all ${total} lots ▾`;
  // LEGO button
  $('lego-n').textContent = String(s.lego.length);
  $('lego-total').textContent = `/${total} lots`;
  $<HTMLButtonElement>('buy-lego').disabled = s.lego.length === 0;
  $('lego-guide').hidden = true;
  $('lego-option').hidden = false;
  const changed = m.palette.filter(t => legoOnly && t.color !== buildModel(m.horse.token, { base: m.base }).palette.find(q => q.trait === t.trait)!.color).length;
  $('prefer-text').textContent = legoOnly
    ? `Only colours LEGO sells: on${changed ? `, ${changed} trait colour${changed > 1 ? 's' : ''} changed` : ', no colour had to change'}. The model is the same.`
    : 'Only colours LEGO sells: per trait, the nearest colour LEGO sells in every part that trait uses. The model stays the same.';
  $<HTMLInputElement>('prefer-lego').checked = legoOnly;
  // BrickLink button: the missing lots, or everything if LEGO has it all
  const missing = s.brickLinkOnly.length;
  $('bl-n').textContent = String(missing || total);
  $('bl-total').textContent = `/${total} lots`;
  $('bl-sub').textContent = missing ? 'Independent shops · the rest' : 'Independent shops · if LEGO runs out';
  $('bl-after').hidden = true;
  $('bl-option').hidden = missing === 0;
  $('copy-all').textContent = `copy all ${total} lots`;
  const files = pickABrickFiles(m).length;
  $('pab-files').textContent = files > 1 ? `${files} files, 400 references each at most` : 'one CSV file';
  $('dl-xml-rest').hidden = missing === 0;
}
$('shop-more').addEventListener('click', () => {
  const open = $('shoplist').classList.toggle('open');
  $('shop-more').textContent = open ? 'Show less ▴' : `See all ${current()?.bom.length ?? ''} lots ▾`;
});
/** The "Before you order" notice, once per visit, before the first order file. */
let understood = false;
function beforeOrder(): Promise<boolean> {
  if (understood) return Promise.resolve(true);
  const d = $<HTMLDialogElement>('before-order'), ok = $<HTMLInputElement>('bo-ok'), go = $<HTMLButtonElement>('bo-continue');
  ok.checked = false; go.disabled = true;
  ok.onchange = () => { go.disabled = !ok.checked; };
  d.showModal();
  return new Promise(res => { d.onclose = () => { understood = d.returnValue === 'ok' && ok.checked; res(understood); }; });
}
async function orderAction(make: (m: Model) => void | Promise<void>) {
  const m = current();
  if (m && await beforeOrder()) await make(m);
}
const downloadLego = (m: Model) => {
  const files = pickABrickFiles(m);
  files.forEach((f, i) => setTimeout(() => save(new Blob([f], { type: 'text/csv' }), `${baseName()}-pick-a-brick${files.length > 1 ? `-${i + 1}-of-${files.length}` : ''}.csv`), i * 400));
  return files.length;
};
async function copyOrSave(xml: string, file: string): Promise<'copied' | 'downloaded'> {
  try { await navigator.clipboard.writeText(xml); return 'copied'; }
  catch { save(new Blob([xml], { type: 'application/xml' }), file); return 'downloaded'; }
}
$('buy-lego').addEventListener('click', () => orderAction(m => {
  const n = downloadLego(m);
  $('lego-file').textContent = n > 1
    ? `${n} files saved to your Downloads (${baseName()}-pick-a-brick-1-of-${n}.csv …): upload them one after the other`
    : `${baseName()}-pick-a-brick.csv · saved to your Downloads`;
  const g = $('lego-guide'); g.hidden = false;
  g.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}));
$('lego-again').addEventListener('click', () => orderAction(m => { downloadLego(m); }));
async function buyBrickLink(all: boolean) {
  await orderAction(async m => {
    const missing = orderSummary(m).brickLinkOnly.length;
    const everything = all || missing === 0;
    const how = await copyOrSave(everything ? brickLinkXML(m) : brickLinkRemainderXML(m), `${baseName()}-bricklink${everything ? '' : '-missing'}.xml`);
    const lots = everything ? m.bom.length : missing;
    $('bl-after-text').textContent = how === 'copied' ? `List copied (${lots} of ${m.bom.length} lots)` : `Couldn’t copy: list downloaded instead (open it and copy its text)`;
    $('bl-after').hidden = false;
  });
}
$('buy-bl').addEventListener('click', () => buyBrickLink(false));
$('copy-all').addEventListener('click', () => buyBrickLink(true));
$('dl-pab').addEventListener('click', () => orderAction(m => { downloadLego(m); }));
$('dl-xml').addEventListener('click', () => orderAction(m => save(new Blob([brickLinkXML(m)], { type: 'application/xml' }), `${baseName()}-bricklink.xml`)));
$('dl-xml-rest').addEventListener('click', () => orderAction(m => save(new Blob([brickLinkRemainderXML(m)], { type: 'application/xml' }), `${baseName()}-bricklink-missing.xml`)));
$('prefer-lego').addEventListener('change', e => {
  legoOnly = (e.target as HTMLInputElement).checked;
  store.set('bh.lego', legoOnly ? '1' : '0');
  rebuild({ replay: false });
});

// ---------- sticky section menu ----------
const secLinks = [...document.querySelectorAll<HTMLAnchorElement>('#secnav a')];
const secObserver = new IntersectionObserver(es => {
  for (const e of es) if (e.isIntersecting) secLinks.forEach(a => a.classList.toggle('on', a.dataset.sec === e.target.id));
}, { rootMargin: '-45% 0px -50% 0px' });
['sec-horse', 'sec-manual', 'sec-buy'].forEach(id => secObserver.observe($(id)));
function shareLink() {
  const m = current();
  const text = m
    ? `I turned BlockHorse ${title(m.horse)} into a ${m.checks.pieces.toLocaleString('en')}-piece brick model you can really build 🧱🐴`
    : 'Turn your BlockHorse into a brick model you can really build 🧱🐴';
  const url = location.origin + location.pathname + (m ? `#${m.horse.token}` : '');
  $<HTMLAnchorElement>('share-x').href = `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}
$('share-x').addEventListener('pointerdown', shareLink);
$('share-x').addEventListener('focus', shareLink);

// start on the horse in the link (#6), else #6
const fromHash = () => { const n = +location.hash.slice(1); return Number.isInteger(n) && n >= 1 && n <= TOKENS ? n : 0; };
window.addEventListener('hashchange', () => { const n = fromHash(); if (n && n !== token) choose(n); });
choose(fromHash() || 6);

// dev/test hook: lets scripts drive the page
if (import.meta.env.DEV) Object.assign(window, { bhb: { viewer, choose, buildModel, current } });
