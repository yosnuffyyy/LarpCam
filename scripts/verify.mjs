// End-to-end check of the built app in headless Chromium with a fake camera.
// Usage: npm run build && npm run verify
// Serves dist/ under /LarpCam/ (like GitHub Pages), walks the main flows at
// phone sizes, checks the things that are easy to break, and writes
// screenshots to artifacts/.
import { createServer } from 'node:http';
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const out = join(root, 'artifacts');
const BASE = '/LarpCam/';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';

if (!existsSync(join(dist, 'index.html'))) {
  console.error('dist/ not found. Run `npm run build` first.');
  process.exit(1);
}
mkdirSync(out, { recursive: true });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.wasm': 'application/wasm',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith(BASE)) {
    res.writeHead(404).end('not found');
    return;
  }
  let file = join(dist, decodeURIComponent(url.pathname.slice(BASE.length)));
  if (!file.startsWith(dist)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end('not found');
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'max-age=600' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
const url = origin + BASE;

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? `  (${detail})` : ''}`);
};

const browser = await chromium.launch({
  args: ['--use-fake-device-for-media-stream=device-count=2', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
});

async function newPhone({ width, height, iphone = true, insets = null, reducedMotion = false }) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: iphone ? IPHONE_UA : undefined,
    permissions: ['camera'],
    reducedMotion: reducedMotion ? 'reduce' : 'no-preference',
  });
  const page = await context.newPage();
  const errors = [];
  page.on('console', (m) => m.text().startsWith('long frame') && console.log('  note ', m.text()));
  page.on('console', (m) => m.type() === 'error' && !m.text().includes('ERR_INTERNET_DISCONNECTED') && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  if (insets) {
    // Pretend to be an installed app on a phone with a notch and home bar.
    const cdp = await context.newCDPSession(page);
    try {
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets });
    } catch {
      console.log('  note  safe-area emulation not available in this Chromium');
    }
  }
  return { context, page, errors };
}

const shot = (page, name) => page.screenshot({ path: join(out, `${name}.png`) });
const settle = (page, ms = 700) => page.waitForTimeout(ms);

/** Every visible button must be at least 44 x 44 CSS px. */
async function smallTargets(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('button')]
      .filter((b) => b.offsetParent !== null)
      .map((b) => ({ r: b.getBoundingClientRect(), label: b.getAttribute('aria-label') || b.textContent.trim() }))
      .filter(({ r }) => r.width > 0 && (r.width < 43.5 || r.height < 43.5))
      .map(({ r, label }) => `${label} ${Math.round(r.width)}x${Math.round(r.height)}`),
  );
}

/** Buttons whose center is above the bottom third... we only require primary ones be low. */
async function yFraction(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return (r.top + r.height / 2) / window.innerHeight;
  }, selector);
}

/** Picture shape lives in the More sheet. */
async function setShape(page, label) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.waitForSelector('.sheet.is-open');
  await page.getByRole('radio', { name: `${label} shape` }).click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
}

async function flipCamera(page) {
  await page.getByRole('button', { name: 'More options' }).click();
  await page.waitForSelector('.sheet.is-open');
  await page.getByRole('switch', { name: /Selfie camera/ }).click();
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await page.waitForSelector('.finder.is-live');
}

async function pickAim(page, name) {
  await page.locator('.chip').click();
  await page.waitForSelector('.sheet.is-open');
  await page.getByRole('radio', { name: new RegExp(`^${name}`) }).click();
  await page.waitForSelector('.sheet', { state: 'detached' });
}

const guideBox = (page) =>
  page.evaluate(() => {
    const g = document.querySelector('.guide');
    const f = document.querySelector('.finder').getBoundingClientRect();
    if (!g) return null;
    const r = g.getBoundingClientRect();
    return { x: (r.left - f.left) / f.width, y: (r.top - f.top) / f.height, w: r.width / f.width, h: r.height / f.height, ratio: r.width / r.height, finderRatio: f.width / f.height };
  });

async function scanChecks(page, tag) {
  await page.getByRole('button', { name: 'Find the shot' }).click();
  check(`${tag}: scanning state shows`, await page.locator('.finder__scan').count() === 1 && (await page.locator('.hint').textContent()).includes('Looking'));
  await page.waitForSelector('.guide', { timeout: 5000 });
  await settle(page, 900);
  const box = await guideBox(page);
  check(`${tag}: target frame is inside the picture and has its shape`, box && box.x >= -0.01 && box.y >= -0.01 && box.x + box.w <= 1.01 && box.y + box.h <= 1.01 && Math.abs(box.ratio - box.finderRatio) < 0.02, JSON.stringify(box));
  const label = await page.locator('.guide__label').textContent();
  check(`${tag}: subject label is 2 to 4 plain words`, /^[a-z]+( [a-z]+){1,3}$/.test(label), label);
  const hint = await page.locator('.hint').textContent();
  check(`${tag}: hint is a plain sentence`, /^(Move your phone (up|down|left|right)|Step closer|A little closer|Zoom in to 2×|Hold it|Nice, shoot)$/.test(hint), hint);
  await shot(page, `${tag}-scan-auto`);
  const small = await smallTargets(page);
  check(`${tag}: all tap targets are at least 44 px while scanning`, small.length === 0, small.join(', '));

  // Aims must really change the answer.
  await page.locator('.chip').click();
  await page.waitForSelector('.sheet.is-open');
  await settle(page);
  await shot(page, `${tag}-aim-sheet`);
  const aimSmall = await smallTargets(page);
  check(`${tag}: all aim tap targets are at least 44 px`, aimSmall.length === 0, aimSmall.join(', '));
  check(`${tag}: ten aims are offered`, (await page.locator('.aim').count()) === 10);
  await page.getByRole('radio', { name: /^Detail/ }).click();
  await page.waitForSelector('.sheet', { state: 'detached' });
  await settle(page, 1800);
  const tight = await guideBox(page);
  await shot(page, `${tag}-scan-detail`);
  await pickAim(page, 'Minimal');
  await settle(page, 1800);
  const loose = await guideBox(page);
  check(`${tag}: Detail frames tighter than Minimal`, tight && loose && tight.w < loose.w - 0.1, `${tight?.w.toFixed(2)} vs ${loose?.w.toFixed(2)}`);
  await pickAim(page, 'Fit check');
  await settle(page, 600);
  const tall = await page.evaluate(() => { const f = document.querySelector('.finder').getBoundingClientRect(); return f.width / f.height; });
  check(`${tag}: Fit check switches to the tall shape`, Math.abs(tall - 9 / 16) < 0.01, tall.toFixed(3));

  await page.getByRole('button', { name: 'Clear the frame' }).click();
  await settle(page, 300);
  check(`${tag}: clearing removes the frame and the hint`, (await page.locator('.guide').count()) === 0 && (await page.locator('.hint').textContent()) === '');
  await pickAim(page, 'Auto');
  await setShape(page, '3:4');
  await settle(page, 700);
}

async function walkFirstRun(page, tag) {
  await page.goto(url);
  await page.waitForSelector('.welcome.is-open');
  await settle(page, 1100);
  await shot(page, `${tag}-1-welcome`);
  check(`${tag}: welcome primary button is in the bottom third`, (await yFraction(page, '.welcome .btn--primary')) > 0.66);

  await page.getByRole('button', { name: 'Get started' }).click();
  await page.waitForSelector('.steps');
  await settle(page);
  await shot(page, `${tag}-2-install`);

  await page.getByRole('button', { name: 'Not now, try it here' }).click();
  await page.getByRole('button', { name: 'Turn on camera' }).waitFor();
  await settle(page);
  await shot(page, `${tag}-3-permission`);
  check(`${tag}: camera not requested before the user taps`, await page.evaluate(() => !document.querySelector('video')?.srcObject));

  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await page.waitForSelector('.finder.is-live', { timeout: 10_000 });
  await page.waitForSelector('.welcome', { state: 'detached', timeout: 5000 });
  await settle(page, 900);
}

async function cameraChecks(page, tag, { width, height }) {
  await shot(page, `${tag}-4-camera-3x4`);
  const video = await page.evaluate(() => {
    const v = document.querySelector('video');
    return { w: v.videoWidth, h: v.videoHeight, paused: v.paused };
  });
  check(`${tag}: live video is playing`, video.w > 0 && !video.paused, `${video.w}x${video.h}`);

  const small = await smallTargets(page);
  check(`${tag}: all camera tap targets are at least 44 px`, small.length === 0, small.join(', '));

  for (const sel of ['.shutter', '.lenses', '.chip', '.thumb-slot', '[aria-label="More options"]']) {
    const y = await yFraction(page, sel);
    check(`${tag}: ${sel} sits in the bottom third`, y !== null && y > 0.66, y?.toFixed(2));
  }

  const columns = await page.evaluate(() => {
    const mid = (sel) => {
      const r = document.querySelector(sel).getBoundingClientRect();
      return r.left + r.width / 2;
    };
    return {
      left: Math.abs(mid('.chip') - mid('.thumb-slot')),
      center: Math.abs(mid('.lenses') - mid('.shutter')),
      right: Math.abs(mid('[aria-label="More options"]') - mid('[aria-label="Find the shot"]')),
      shutter: Math.abs(mid('.shutter') - window.innerWidth / 2),
    };
  });
  check(`${tag}: the two control rows line up in columns`, Object.values(columns).every((d) => d < 1), JSON.stringify(columns));

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  check(`${tag}: no sideways scrolling`, !overflow);

  // Shapes: the viewfinder must take each shape exactly and stay on screen.
  for (const [label, ratio] of [['4:5', 4 / 5], ['1:1', 1], ['9:16', 9 / 16], ['3:4', 3 / 4]]) {
    await setShape(page, label);
    await settle(page, 800);
    const r = await page.evaluate(() => {
      const b = document.querySelector('.finder').getBoundingClientRect();
      return { x: b.left, y: b.top, w: b.width, h: b.height };
    });
    const okShape = Math.abs(r.w / r.h - ratio) < 0.005;
    const onScreen = r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= width + 0.5 && r.y + r.h <= height + 0.5;
    const shutterTop = await page.evaluate(() => document.querySelector('.shutter').getBoundingClientRect().top);
    check(`${tag}: ${label} picture stops above the shutter`, r.y + r.h <= shutterTop, `${(r.y + r.h).toFixed(0)} vs ${shutterTop.toFixed(0)}`);
    check(`${tag}: viewfinder is ${label} and on screen`, okShape && onScreen, `${r.w.toFixed(0)}x${r.h.toFixed(0)} at ${r.x.toFixed(0)},${r.y.toFixed(0)}`);
    if (label !== '3:4') await shot(page, `${tag}-5-camera-${label.replace(':', 'x')}`);
  }

  // More sheet with the grid switched on.
  await page.getByRole('button', { name: 'More options' }).click();
  await page.waitForSelector('.sheet.is-open');
  await page.getByRole('switch', { name: /Grid/ }).click();
  await settle(page);
  await shot(page, `${tag}-6-more-sheet`);
  const sheetSmall = await smallTargets(page);
  check(`${tag}: all sheet tap targets are at least 44 px`, sheetSmall.length === 0, sheetSmall.join(', '));
  check(`${tag}: privacy line is shown`, await page.getByText('Nothing your camera sees ever leaves this phone').isVisible());
  await page.keyboard.press('Escape');
  await page.waitForSelector('.sheet', { state: 'detached' });
  await settle(page, 300);
  check(`${tag}: grid is drawn`, await page.evaluate(() => document.querySelector('.finder__grid').classList.contains('is-on')));
  await shot(page, `${tag}-7-camera-grid`);

  // 2x lens.
  await page.getByRole('radio', { name: 'Closer view' }).click();
  await settle(page, 500);
  check(`${tag}: 2x chip is selected`, (await page.getByRole('radio', { name: 'Closer view' }).getAttribute('aria-checked')) === 'true');
  await shot(page, `${tag}-8-camera-2x`);

  // Selfie camera and back.
  await flipCamera(page);
  check(`${tag}: selfie view is mirrored`, await page.evaluate(() => getComputedStyle(document.querySelector('video')).transform.startsWith('matrix(-1')));
  await flipCamera(page);
  await page.getByRole('radio', { name: 'Closer view' }).click();
  await settle(page, 400);

  // Shoot at 2x, then at 1x.
  const t0 = Date.now();
  await page.getByRole('button', { name: 'Take photo' }).click();
  await page.waitForSelector('.thumb img', { timeout: 5000 });
  const saveMs = Date.now() - t0;
  check(`${tag}: photo is in the library in under a second`, saveMs < (process.env.CI ? 3000 : 1000), `${saveMs} ms`);
  await page.getByRole('radio', { name: 'Normal view' }).click();
  await settle(page, 400);
  await page.getByRole('button', { name: 'Take photo' }).click();
  await page.waitForFunction(() => document.querySelectorAll('.fly').length === 0);
  await settle(page, 600);
  await shot(page, `${tag}-9-camera-after-shot`);

  const stored = await page.evaluate(async () => {
    const dbs = await indexedDB.databases();
    const name = dbs.find((d) => d.name.startsWith('larpcam:'))?.name;
    const db = await new Promise((res, rej) => {
      const r = indexedDB.open(name);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    const all = (store) =>
      new Promise((res) => {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = () => res(r.result);
      });
    const photos = await all('photos');
    const originals = await all('originals');
    db.close();
    return {
      name,
      photos: photos.map((p) => ({ w: p.width, h: p.height, crop: p.crop, lens: p.lens, thumb: p.thumb.byteLength })),
      originals: originals.map((o) => o.data.byteLength),
    };
  });
  check(`${tag}: two photos stored with their originals`, stored.photos.length === 2 && stored.originals.length === 2, stored.name);
  check(`${tag}: storage is namespaced by folder`, stored.name === `larpcam:${BASE}`, stored.name);
  const zoomed = stored.photos.find((p) => p.lens === '2×');
  check(`${tag}: the 2x photo keeps a half-size crop of the full frame`, zoomed && Math.abs(zoomed.crop.width * zoomed.w - (zoomed.crop.height * zoomed.h * 3) / 4) <= 2 && zoomed.crop.height <= 0.51, JSON.stringify(zoomed?.crop));
  check(`${tag}: originals are real images`, stored.originals.every((b) => b > 5000), stored.originals.join(', '));
}

async function viewerChecks(page, tag) {
  await page.getByRole('button', { name: 'Open your photos' }).click();
  await page.waitForSelector('.viewer.is-open');
  await page.waitForSelector('.framed__full.is-loaded');
  await settle(page, 700);
  await shot(page, `${tag}-10-viewer`);
  const small = await smallTargets(page);
  check(`${tag}: all viewer tap targets are at least 44 px`, small.length === 0, small.join(', '));
  for (const sel of ['.viewer__share', '[aria-label="Back to camera"]', '[aria-label="Delete this photo"]']) {
    const y = await yFraction(page, sel);
    check(`${tag}: ${sel} sits in the bottom third`, y !== null && y > 0.66, y?.toFixed(2));
  }
  const fit = await page.evaluate(() => {
    const f = document.querySelector('.framed').getBoundingClientRect();
    const p = document.querySelector('.viewer__page').getBoundingClientRect();
    return f.width > 100 && f.left >= p.left - 0.5 && f.right <= p.right + 0.5 && f.top >= p.top - 0.5 && f.bottom <= p.bottom + 0.5;
  });
  check(`${tag}: the photo fits its page`, fit);

  // Swipe to the older photo (the 2x one) and check the crop is applied.
  await page.evaluate(() => {
    const el = document.querySelector('.viewer__pager');
    el.scrollTo({ left: el.clientWidth, behavior: 'instant' });
  });
  await page.waitForFunction(() => document.querySelector('.viewer__meta')?.textContent.includes('2 of 2'));
  await page.waitForFunction(() => document.querySelectorAll('.framed__full.is-loaded').length >= 2);
  await settle(page, 500);
  await shot(page, `${tag}-11-viewer-second`);

  await page.getByRole('button', { name: 'Delete this photo' }).click();
  await page.waitForSelector('.sheet.is-open');
  await settle(page);
  await shot(page, `${tag}-12-delete-confirm`);
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll('.viewer__page').length === 1);
  check(`${tag}: delete removes the photo`, true);
  await settle(page, 500);
  await page.getByRole('button', { name: 'Back to camera' }).click();
  await page.waitForSelector('.viewer', { state: 'detached' });
  check(`${tag}: camera is still live after the viewer`, await page.evaluate(() => document.querySelector('.finder').classList.contains('is-live')));
}

// ---- 375 x 812 and 390 x 844, as a browser tab --------------------------------
for (const size of [{ width: 375, height: 812 }, { width: 390, height: 844 }]) {
  const tag = `${size.width}x${size.height}`;
  console.log(`\n${tag} (browser tab)`);
  const { context, page, errors } = await newPhone(size);
  await walkFirstRun(page, tag);
  await cameraChecks(page, tag, size);
  await scanChecks(page, tag);
  await viewerChecks(page, tag);

  // Second launch: straight to the camera, photo still there.
  await page.reload();
  await page.waitForSelector('.finder.is-live', { timeout: 10_000 });
  check(`${tag}: second launch skips the welcome screens`, (await page.locator('.welcome').count()) === 0);
  check(`${tag}: photos survive a relaunch`, (await page.locator('.thumb img').count()) === 1);
  check(`${tag}: no errors in the console`, errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---- Installed on a notched iPhone (safe areas) --------------------------------
{
  const tag = 'installed-390x844';
  console.log(`\n${tag} (Home Screen app, safe areas 47 / 34)`);
  const { context, page, errors } = await newPhone({
    width: 390,
    height: 844,
    insets: { top: 47, bottom: 34, left: 0, right: 0, topMax: 47, bottomMax: 34, leftMax: 0, rightMax: 0 },
  });
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'standalone', { value: true });
  });
  await page.goto(url);
  await page.waitForSelector('.welcome.is-open');
  await settle(page, 1100);
  await shot(page, `${tag}-1-welcome`);
  await page.getByRole('button', { name: 'Get started' }).click();
  check(`${tag}: installed app skips the Home Screen step`, await page.getByRole('button', { name: 'Turn on camera' }).isVisible());
  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await page.waitForSelector('.finder.is-live', { timeout: 10_000 });
  await page.waitForSelector('.welcome', { state: 'detached' });
  await settle(page, 900);
  await shot(page, `${tag}-2-camera`);
  const geometry = await page.evaluate(() => {
    const f = document.querySelector('.finder').getBoundingClientRect();
    const c = document.querySelector('.controls').getBoundingClientRect();
    const s = document.querySelector('.shutter').getBoundingClientRect();
    return { finderTop: f.top, finderBottom: f.bottom, controlsTop: c.top, shutterBottom: s.bottom, h: window.innerHeight };
  });
  check(`${tag}: picture clears the status bar`, geometry.finderTop >= 47 || geometry.finderTop === 0, `top ${geometry.finderTop}`);
  check(`${tag}: 3:4 picture is not covered by the controls`, geometry.finderBottom <= geometry.controlsTop + 0.5, `${geometry.finderBottom} vs ${geometry.controlsTop}`);
  await setShape(page, '9:16');
  await settle(page, 800);
  await shot(page, `${tag}-3-camera-9x16`);
  check(`${tag}: no errors in the console`, errors.length === 0, errors.join(' | '));
  await context.close();
}

// ---- Camera refused -----------------------------------------------------------
{
  const tag = 'denied';
  console.log(`\n${tag}`);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await context.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('no', 'NotAllowedError'));
  });
  await page.goto(url);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await page.getByRole('alert').waitFor();
  await settle(page);
  await shot(page, `${tag}-1-welcome`);
  check(`${tag}: a refusal is explained in plain words`, await page.getByText('The camera is still off').isVisible());
  // Same thing once past the welcome screens.
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.endsWith(':settings'));
    localStorage.setItem(key, JSON.stringify({ ...JSON.parse(localStorage.getItem(key)), welcomed: true }));
  });
  await page.reload();
  await page.getByRole('heading', { name: 'The camera is off' }).waitFor();
  await settle(page);
  await shot(page, `${tag}-2-camera`);
  check(`${tag}: shutter is disabled without a camera`, await page.getByRole('button', { name: 'Take photo' }).isDisabled());
  await context.close();
}

// ---- Reduced motion ------------------------------------------------------------
{
  const tag = 'reduced-motion';
  console.log(`\n${tag}`);
  const { context, page } = await newPhone({ width: 390, height: 844, reducedMotion: true });
  await page.goto(url);
  await page.waitForSelector('.welcome.is-open');
  const dur = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--dur-slow').trim());
  check(`${tag}: motion durations collapse`, dur === '1ms', dur);
  await context.close();
}

// ---- Offline, install, frame rate ---------------------------------------------
{
  const tag = 'pwa';
  console.log(`\n${tag}`);
  const { context, page, errors } = await newPhone({ width: 390, height: 844, iphone: false });
  await page.goto(url);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10_000 });
  check(`${tag}: service worker controls the page`, true);

  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  check(`${tag}: Chrome finds no installability problems`, installabilityErrors.length === 0, JSON.stringify(installabilityErrors));
  const manifest = await cdp.send('Page.getAppManifest');
  check(`${tag}: manifest parses without errors`, manifest.errors.length === 0, JSON.stringify(manifest.errors));

  const cached = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names[0]);
    return { names, count: (await cache.keys()).length };
  });
  check(`${tag}: cache is named for its folder`, cached.names.length === 1 && cached.names[0].startsWith(`larpcam:${BASE}:`), cached.names.join(','));

  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector('.welcome.is-open', { timeout: 10_000 });
  const fontOk = await page.evaluate(async () => {
    await document.fonts.load('40px "Instrument Serif"');
    return document.fonts.check('40px "Instrument Serif"');
  });
  check(`${tag}: app opens with no connection (${cached.count} files cached)`, true);
  check(`${tag}: heading font works offline`, fontOk);
  await page.getByRole('button', { name: 'Get started' }).click();
  await page.getByRole('button', { name: 'Turn on camera' }).click();
  await page.waitForSelector('.finder.is-live', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Take photo' }).click();
  await page.waitForSelector('.thumb img');
  check(`${tag}: camera and saving work offline`, true);

  // The worker must not hijack other folders on the same site (PR previews).
  const leak = await page.evaluate(async (base) => {
    try {
      const r = await fetch(`${base}pr-preview/pr-1/`, { cache: 'no-store' });
      return r.ok;
    } catch {
      return false;
    }
  }, BASE);
  check(`${tag}: worker leaves other folders alone`, leak === false);
  await context.setOffline(false);

  // Frame rate on the camera screen with the CPU slowed 4x, during a shape change and a shot.
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const frames = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const gaps = [];
        let last = performance.now();
        const start = last;
        const step = (now) => {
          if (now - last > 34) console.log(`long frame ${(now - last).toFixed(0)} ms at t=${(now - start).toFixed(0)}`);
          gaps.push(now - last);
          last = now;
          if (now - start < 3000) requestAnimationFrame(step);
          else resolve(gaps);
        };
        requestAnimationFrame(step);
        setTimeout(() => document.querySelector('.scan-btn').click(), 300);
        setTimeout(() => document.querySelector('.shutter').click(), 1300);
        setTimeout(() => document.querySelector('[aria-label="More options"]').click(), 2100);
      }),
  );
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const sorted = [...frames].sort((a, b) => a - b);
  const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  const worst = sorted[sorted.length - 1];
  const long = frames.filter((g) => g > 34).length;
  console.log(`  note  frames: avg ${avg.toFixed(1)} ms, p95 ${p95.toFixed(1)} ms, worst ${worst.toFixed(1)} ms, over 34 ms: ${long}/${frames.length}`);
  // Shared CI machines are too noisy to judge frame times; there it is reported only.
  if (process.env.CI) console.log(`  note  frame-rate check skipped on CI (p95 ${p95.toFixed(1)} ms)`);
  else check(`${tag}: holds 60 fps with a 4x slower CPU (p95 under 20 ms)`, p95 < 20, `p95 ${p95.toFixed(1)} ms`);
  check(`${tag}: no errors in the console`, errors.length === 0, errors.join(' | '));
  await context.close();
}

await browser.close();
server.close();

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed. Screenshots in artifacts/.`);
if (failed.length) {
  console.log('Failed:');
  for (const f of failed) console.log(` - ${f.name} ${f.detail}`);
  process.exit(1);
}
