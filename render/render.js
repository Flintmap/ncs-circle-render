const http = require('http');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Chromium blocks fetch() on file:// pages (opaque/null origin), and this
// page needs to fetch job/config.json, job/audio.*, etc. relative to
// itself. Serving the render/ directory over a local HTTP server sidesteps
// that entirely — everything becomes a normal same-origin request.
function mimeType(file){
  const ext = path.extname(file).toLowerCase();
  const map = { '.html':'text/html', '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.mp3':'audio/mpeg', '.wav':'audio/wav', '.m4a':'audio/mp4', '.ogg':'audio/ogg', '.flac':'audio/flac', '.aac':'audio/aac' };
  return map[ext] || 'application/octet-stream';
}
function startServer(rootDir){
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(rootDir, urlPath);
      fs.readFile(filePath, (err, data) => {
        if (err) { res.writeHead(404); res.end('Not found'); return; }
        res.writeHead(200, { 'Content-Type': mimeType(filePath) });
        res.end(data);
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

(async () => {
  const outDir = path.join(__dirname, 'output');
  fs.mkdirSync(outDir, { recursive: true });

  const server = await startServer(__dirname);
  const port = server.address().port;

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

  const indexUrl = 'http://127.0.0.1:' + port + '/index.html?ghHeadless=1';
  await page.goto(indexUrl, { waitUntil: 'load', timeout: 60000 });

  const start = Date.now();
  const timeoutMs = 55 * 60 * 1000;
  while (!done) {
    if (Date.now() - start > timeoutMs) throw new Error('Render timed out');
    await new Promise(r => setTimeout(r, 2000));
  }

  await browser.close();
  server.close();
  if (failed) { console.error('Render failed:', failed); process.exit(1); }
  console.log('Render complete.');
})().catch(e => { console.error(e); process.exit(1); });
