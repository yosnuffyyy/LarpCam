# LarpCam

An original camera app that installs from a link: a composition coach that finds the shot, guides you into position, then lets you develop the photo like film. Mobile-first Progressive Web App, built for iPhone Safari first.

The full spec lives in [docs/PROJECT_BRIEF.md](docs/PROJECT_BRIEF.md). Read it before doing any work, and follow its hard rules and section 8 (milestones). Work one milestone at a time and stop after each.

## Ground rules
- **On-device only.** No API keys, no accounts, no cloud AI, no backend, no analytics, no CDN downloads at runtime. Models and algorithms ship inside the app. Nothing the camera sees leaves the phone.
- **Zero setup for the user:** open the link, Share, Add to Home Screen. Never require the user to install anything else.
- **Never fake a feature.** Feature-detect; hide what the browser can't do; record it in [docs/LIMITATIONS.md](docs/LIMITATIONS.md).
- **Design is a feature.** All colors, type, spacing, radii and motion come from [src/design/tokens.css](src/design/tokens.css). Primary actions in the bottom third, 44 px minimum tap targets, safe-area insets, `100dvh`, `prefers-reduced-motion`. No jargon in UI copy.
- **60 fps.** Heavy work goes in a worker; skip frames rather than block the main thread.
- Original branding only; never copy another app's name, icon, copy, or assets.
- The owner's custom tweaks are listed in section 7 of the brief. Ask if they're still placeholders.

## Working
- Branch + PR; never push to `main`. Small commits.
- `npm install && npm run dev` to run locally. `npm run check` runs typecheck, unit tests and build (the same thing CI runs).
- `npm run verify` drives the built app in headless Chromium with a fake camera and writes screenshots to `artifacts/`.
- Deploys: merge to `main` publishes to GitHub Pages; every PR gets a preview under `/pr-preview/pr-<number>/`.
