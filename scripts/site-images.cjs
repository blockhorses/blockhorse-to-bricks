// Page images rendered by the site itself: public/og.png (1200×630) and the README screenshots in docs/.
// Run against `npm run build && npx vite preview --port 5178`.
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:5178/';
const ready = p => p.waitForFunction(() => document.querySelector('#stats .stat') && +document.getElementById('pg-range').max > 1);
(async () => {
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  // the model for the OG image: #6, the finished build, rendered square
  const p = await b.newPage({ viewport: { width: 760, height: 1000 }, deviceScaleFactor: 1.6 });
  await p.goto(`${URL}#6`, { waitUntil: 'networkidle' }); await ready(p);
  await p.click('#skip'); await p.waitForTimeout(800);
  const model = await p.evaluate(() => { const v = window.document.getElementById('view'); return v.toDataURL('image/png'); });
  const sprite = await p.locator('#sprite').innerHTML();
  const q = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await q.setContent(`<body style="margin:0;width:1200px;height:630px;background:#B4DBF1;font-family:-apple-system,system-ui,sans-serif;color:#16242f;display:flex;align-items:center;overflow:hidden">
    <div style="padding:0 0 0 64px;width:560px;flex:none"><div style="display:flex;align-items:center;gap:14px;font-size:30px;font-weight:700;opacity:.8"><span style="width:64px;height:64px;display:block">${sprite.replace(/width="\d+" height="\d+"/, 'width="64" height="64"')}</span>BlockHorse to Bricks</div>
    <div style="font-size:58px;font-weight:800;line-height:1.05;letter-spacing:-.02em;margin:18px 0 22px">Turn your BlockHorse into a brick model you can really build</div>
    <div style="font-size:25px;line-height:1.4;opacity:.8">3D build animation · PDF instructions<br>LEGO and BrickLink parts lists · free, in your browser</div></div>
    <img src="${model}" style="width:700px;height:525px;object-fit:cover;margin-left:-40px"></body>`);
  await q.waitForTimeout(300);
  await q.screenshot({ path: 'public/og.png' });
  // README screenshots, desktop
  const d = await b.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
  await d.goto(`${URL}#6`, { waitUntil: 'networkidle' }); await ready(d);
  await d.click('#skip'); await d.waitForTimeout(800);
  await d.evaluate(() => document.getElementById('secnav').style.visibility = 'hidden');
  await d.locator('#sec-horse').screenshot({ path: 'docs/horse.png' });
  await d.locator('#pg-range').fill('26'); await d.waitForTimeout(500);
  await d.locator('#sec-manual').screenshot({ path: 'docs/instructions.png' });
  await d.locator('#sec-buy').scrollIntoViewIfNeeded(); await d.waitForTimeout(300);
  await d.locator('#sec-buy').screenshot({ path: 'docs/buy.png' });
  await b.close();
  for (const f of ['public/og.png', 'docs/horse.png', 'docs/instructions.png', 'docs/buy.png']) console.log(f, Math.round(fs.statSync(f).size / 1024) + ' KB');
})();
