// Visitor journey through the picker and the three sections (horse, instructions, buy), one horse of each
// species, desktop and mobile, with screenshots in out/ui/. Run against `npm run build && npx vite preview --port 5178`.
//   node scripts/ui-flow.cjs [url] [tokens=5,4,8,6]
const { chromium } = require('playwright-core');
const { exe } = require('./shot.cjs');
const fs = require('fs');
const URL = process.argv[2] || 'http://localhost:5178/';
const TOKENS = (process.argv[3] || '5,4,8,6').split(',').map(Number);
const DEVICES = (process.env.DEVICES || 'desktop,mobile').split(',');
(async () => {
  fs.mkdirSync('out/ui', { recursive: true });
  const b = await chromium.launch({ executablePath: exe(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const dev of DEVICES) {
    const ctx = await b.newContext({ ...(dev === 'mobile' ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 900 } }), acceptDownloads: true, permissions: ['clipboard-read', 'clipboard-write'] });
    const p = await ctx.newPage(); const errs = [], hosts = new Set();
    p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('request', r => hosts.add(new globalThis.URL(r.url()).host));
    await p.goto(URL, { waitUntil: 'networkidle' });
    let first = true;
    for (const t of TOKENS) {
      const shot = (n, sel) => p.locator(sel).screenshot({ path: `out/ui/${dev}-${t}-${n}.png` });
      await p.fill('#token', String(t)); await p.click('.go');
      await p.waitForFunction(t => document.getElementById('token').value === String(t) && document.querySelector('#stats .stat') && +document.getElementById('pg-range').max > 1, t);
      await p.locator('#input-panel').scrollIntoViewIfNeeded();
      await shot('0-picker', '#input-panel');
      await p.click('#skip'); await p.waitForTimeout(600);
      await p.evaluate(() => { const v = window.bhb?.viewer; if (v) v.controls.autoRotate = false; });
      console.log(`\n${dev} #${t}: ① ${await p.textContent('#horse-sub')} · ${(await p.locator('#stats .stat b').allInnerTexts()).join(' / ')} · ${await p.textContent('#pill')} · ${await p.textContent('#status-short')}`);
      console.log(`  traits: ${(await p.locator('#traits li').allInnerTexts()).map(s => s.replace(/\s+/g, ' ')).join(' | ')}`);
      await p.locator('#more summary').click(); await p.waitForTimeout(200);
      await shot('1-horse', '#sec-horse');
      console.log(`  checks: ${(await p.locator('#checks li').allInnerTexts()).map(s => s.replace(/\s+/g, ' ')).join(' | ')}`);
      await p.locator('#more summary').click();
      // ② instructions: cover, then the step with the horn's jumper (or a middle step)
      await p.locator('#sec-manual').scrollIntoViewIfNeeded(); await p.waitForTimeout(400);
      await shot('2-cover', '#sec-manual');
      const max = +(await p.getAttribute('#pg-range', 'max'));
      await p.locator('#pg-range').fill(String(Math.max(2, max - 6))); await p.waitForTimeout(400);
      console.log(`  ② ${await p.textContent('#manual-sub')} · showing ${await p.textContent('#pg-label')}`);
      await shot('3-step', '#sec-manual');
      // ③ buy
      await p.locator('#sec-buy').scrollIntoViewIfNeeded(); await p.waitForTimeout(300);
      console.log(`  ③ ${await p.textContent('#shop-sum')} · ${await p.locator('.lot .dot.bl').count()} BrickLink only · LEGO ${await p.textContent('#lego-n')}${await p.textContent('#lego-total')} · ${await p.textContent('#prefer-text')}`);
      await shot('4-buy', '#sec-buy');
      if (first) {
        first = false;
        const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 60000 }), (async () => { await p.click('#buy-lego'); await p.waitForSelector('#before-order[open]'); await p.check('#bo-ok'); await p.click('#bo-continue'); })()]);
        console.log(`  Buy at LEGO → ${dl.suggestedFilename()}`);
        await p.click('#buy-bl'); await p.waitForTimeout(300);
        const clip = await p.evaluate(() => navigator.clipboard.readText());
        console.log(`  Buy on BrickLink → clipboard ${[...clip.matchAll(/<ITEM>/g)].length} lots`);
        await p.locator('#lego-option').click(); await p.waitForTimeout(400);
        console.log(`  only colours LEGO sells → LEGO ${await p.textContent('#lego-n')}${await p.textContent('#lego-total')} · ${await p.textContent('#prefer-text')} · ${await p.textContent('#pill')}`);
        await shot('5-lego-only', '#sec-buy');
        await p.locator('#lego-option').click(); await p.waitForTimeout(300);
      }
    }
    console.log(`\n${dev}: hosts ${[...hosts].join(', ')} · errors ${errs.length ? errs.join(' / ') : 'none'}`);
    await ctx.close();
  }
  await b.close();
})();
