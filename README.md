# LarpCam

A quiet camera that installs from a link. Everything stays on your phone: no account, no cloud, no tracking.

## Install on your phone (3 steps)

1. On your iPhone, open **<https://yosnuffyyy.github.io/LarpCam/>** in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**.
3. Open **LarpCam** from your Home Screen and tap **Turn on camera**.

That's all. It opens full screen like any other app and keeps working with no signal. Needs iOS 16.4 or newer.
On Android, open the same link in Chrome and tap **Install**.

> Photos you take live inside LarpCam on your phone. Use **Save or share** on any photo to put it in your Photos app.

## What works today

- Live camera with four picture shapes (3:4, 4:5, 1:1, 9:16)
- Zoom chips and pinch to zoom; only lenses your phone really has are shown
- Selfie camera, grid lines, and the phone's light where the browser allows it
- Photos saved on your phone, with a viewer to save, share or delete them
- Works offline once installed

Coming next: the scan button that finds the shot and coaches you into position, then the film-style editor. The plan is in [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md). What a web app can't do on an iPhone is listed honestly in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).

## Privacy

Nothing your camera sees ever leaves your phone. There is no server, no sign-in, no analytics, and no outside AI service. The app is a set of static files; after the first visit it doesn't need the network at all.

---

## For contributors

```sh
npm install
npm run dev        # local dev server (camera needs localhost or HTTPS)
npm run check      # typecheck + unit tests + production build
npm run verify     # drive the built app in headless Chromium with a fake camera;
                   # screenshots land in artifacts/
```

`npm run verify` needs a Chromium for Playwright once: `npx playwright install chromium`.

| Path | What lives there |
| --- | --- |
| `src/design/tokens.css` | Every color, type size, space, radius and motion value |
| `src/camera/` | Camera stream, lens detection, capture |
| `src/library/` | Photo storage (IndexedDB) |
| `src/ui/` | Screens and components |
| `src/lib/` | Pure helpers (layout and crop math is unit-tested) |
| `src/sw.js` | Service worker template, filled in by `vite.config.ts` at build |
| `scripts/verify.mjs` | End-to-end checks and screenshots |

### Deploys

`.github/workflows/deploy.yml` checks every change, then publishes to the `gh-pages` branch:

- merge to `main` → <https://yosnuffyyy.github.io/LarpCam/>
- each pull request → `https://yosnuffyyy.github.io/LarpCam/pr-preview/pr-<number>/`

One-time setup for the repository owner: **Settings → Pages → Deploy from a branch → `gh-pages`, `/ (root)`**.

Work on a branch and open a pull request; nothing is pushed to `main` directly.
