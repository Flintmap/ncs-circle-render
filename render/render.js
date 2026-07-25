const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

(async () => {
  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1920, height: 1080 });
  page.on('console', msg => console.log('[page]', msg.text()));
  page.on('pageerror', err => console.error('[page error]', err));

  let done = false, failed = null;
  await page.exposeFunction('__ghSaveFile', async (base64, name) => {
    fs.writeFileSync(path.join(outDir, name), Buffer.from(base64, 'base64'));
    done = true;
  });
  await page.exposeFunction('__ghFail', (msg) => { failed = msg; done = true; });

  const indexPath = 'file://' + path.join(__dirname, 'index.html') + '?ghHeadless=1';
  await page.goto(indexPath, { waitUntil: 'load', timeout: 60000 });

  const start = Date.now();
  const timeoutMs = 55 * 60 * 1000;
  while (!done) {
    if (Date.now() - start > timeoutMs) throw new Error('Render timed out');
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
  if (failed) { console.error('Render failed:', failed); process.exit(1); }
  console.log('Render complete.');
})().catch(e => { console.error(e); process.exit(1); });
