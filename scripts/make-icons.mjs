// Renders the app icons from one drawing. Run with `npm run icons` after
// changing the mark; the PNGs are committed so CI never needs a browser.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const out = resolve(import.meta.dirname, '../public/icons');
mkdirSync(out, { recursive: true });

/** The mark: a yellow frame that has found a small subject. */
const mark = (scale = 1) => `
  <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
    <rect x="154" y="121" width="204" height="270" rx="46" fill="none" stroke="#ffd23f" stroke-width="22"/>
    <circle cx="222" cy="301" r="21" fill="#ffffff"/>
  </g>`;

const svg = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#0d0d0e"/>${inner}</svg>`;

const targets = [
  { file: 'icon-192.png', size: 192, body: svg(mark()) },
  { file: 'icon-512.png', size: 512, body: svg(mark()) },
  // Maskable icons get cropped to a circle on Android: keep the mark smaller.
  { file: 'icon-maskable-512.png', size: 512, body: svg(mark(0.78)) },
  // iOS rounds the corners itself and needs an opaque square.
  { file: 'apple-touch-icon.png', size: 180, body: svg(mark()) },
];

const browser = await chromium.launch();
for (const { file, size, body } of targets) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(
    `<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${body}`,
  );
  await page.screenshot({ path: resolve(out, file) });
  await page.close();
  console.log('wrote', file);
}
await browser.close();
