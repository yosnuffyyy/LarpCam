# PROJECT BRIEF: LarpCam, a composition-coach camera + film editor that installs from a link

You are building an original camera app called **LarpCam**. It looks at what you point it at, finds the best shot inside the scene, draws a frame around that shot, and coaches you physically into position ("Move your phone up"). After shooting, you develop the photo like film in a built-in editor.

LarpCam is a **mobile-first Progressive Web App**. The owner's whole setup is: open a link on an iPhone, tap Share, tap Add to Home Screen. Nothing else.

Use LarpCam's own name, icon, copy, film-look names, and visual design. Do not copy any existing app's branding or assets. Everything below describes behavior, not branding.

## HARD RULES (these win over everything else in this file)

1. **No API keys, no accounts, no cloud AI.** All guidance runs on the device, in the browser, using small models and algorithms that ship inside the app. No CDN model downloads, no keys, no sign-in, no backend, no analytics. Nothing the camera sees ever leaves the phone, and the app says so in its privacy line.
2. **Zero setup for the user.** Static site, installable, works offline through a service worker, served over HTTPS by GitHub Pages, deployed by GitHub Actions on merge to `main`. The user never installs Xcode, Node, or anything else. Developer tooling runs in CI; `npm install && npm run dev` must work for contributors.
3. **Never fake a feature.** Detect what the browser can really do. Where something isn't possible, hide it (no dead buttons) and list it in [LIMITATIONS.md](LIMITATIONS.md).
4. **Design is a feature**, not a coat of paint. See section 5.
5. **60 fps is a hard requirement.** Heavy work happens off the main thread (Web Worker / OffscreenCanvas), with frame skipping when needed.

## 0. STACK

| Brief concept | Web implementation |
| --- | --- |
| Camera | `getUserMedia`, `MediaStreamTrack` capabilities (zoom, torch, exposure) where the browser exposes them |
| Subject, face, pose detection | MediaPipe Tasks (WASM + models bundled with the app) |
| "What's interesting" | Saliency heuristic (spectral residual plus edge/contrast), run in a worker |
| Tilt, level, steadiness | `DeviceMotion` / `DeviceOrientation`, asked for with one tap in context |
| Film looks and edits | WebGL2 shader pipeline (WebGPU where available) |
| Library and edit recipes | IndexedDB |
| Offline + install | Service worker + web app manifest |
| Hosting | GitHub Pages via GitHub Actions |

Tooling: Vite, TypeScript, Preact + signals, Vitest, Playwright. Keep the dependency list short.

## 1. THE CORE LOOP
Point -> Scan -> Follow the guide -> Capture -> Develop -> Keep.

### 1a. Camera screen (portrait, one thumb)
- The live preview is the hero: full width inside the chosen aspect-ratio rectangle on a black background. Optional rule-of-thirds grid (thin, semi-transparent white lines).
- **Everything you tap often lives in the bottom third**, top to bottom:
  1. A one-line coaching hint in accent yellow, centered (e.g. "Move your phone up").
  2. A quiet row: shape (aspect ratio) on the left, round lens chips in the middle, "More" on the right. Only show lenses the device really has. The selected chip is highlighted in the accent color.
  3. The control row: last-photo thumbnail (left, opens the viewer/library), large white ring shutter (center), and the sparkle "scan" button (right). While a suggestion is showing, a small X to dismiss it sits within thumb reach.
- Everything else (shape options 3:4 / 4:5 / 1:1 / 9:16, light, grid, level, crop-to-frame, spoken coaching, selfie camera, privacy line) lives in the **More bottom sheet**, not in rows of icons.
- There is no top toolbar.

### 1b. Scan and the guide overlay
When the user taps the sparkle:
1. Briefly show a scanning state (subtle pulse/shimmer, ~0.5-1.5 s).
2. The app proposes a target frame: a rounded-rectangle outline in accent yellow (about 3 px stroke, ~20 px corner radius) at the target aspect ratio, drawn over the live preview.
3. A small pill label under the frame names the subject in 2-4 lowercase words (e.g. "person by window"). Labels come from the on-device detectors and simple scene cues, so they are plainer than a cloud model would write. That is the price of privacy and it is fine.
4. A dashed line with a small "+" marker runs from the current center-of-view point to the target, showing which way to move.
5. The hint line says what to do in plain words, driven by the geometry: "Move your phone up / down / left / right", "Tilt up / down", "Step back", "Step closer", "Zoom in to 2x", "Level it out", "Hold it", "Nice, shoot".
6. The frame and hint update live as the phone moves, so the frame stays glued to the subject (live tracking).
7. When the view matches the target (thresholds below), the frame locks: color/weight change, a haptic tick where the device supports it, hint becomes "Hold it" then "Shoot", and the shutter lights up. Shooting before lock is always allowed.
8. The X dismisses the suggestion. Tapping the sparkle again rescans.

### 1b-2. Aims
The scan has selectable **aims**: the same engine with different taste. The owner picks what they're shooting and the target frame follows that aim's rules (where the subject sits, how much of the picture it fills, which shape suits it). Shipped aims: Auto, Views, Food, People, Fit check, Dump, Larp, Detail, Symmetry, Minimal. Aims live in one file ([src/guidance/aims.ts](../src/guidance/aims.ts)); adding one is adding a profile, not new code. Each aim will also suggest a vibe (see 3).

### 1c. "Your frame" mode
The user can instead drag on the viewfinder to draw their own frame. Same guide, same tracking, same lock behavior. Frames (auto or drawn) can be moved and resized with gestures before shooting.

### 1d. Capture behavior
- Output is cropped to the chosen shape. If a target frame is locked, a setting offers to crop to the frame instead ("Crop to frame").
- The untouched capture is kept in the library; the crop and every edit are a non-destructive recipe on top of it.
- Extra controls appear **only when the browser reports them**: light (torch), brightness (exposure compensation), tap to focus. No RAW/ProRAW and no manual shutter/ISO on the web; see LIMITATIONS.md.
- Fast path: shutter -> saved to the library in under ~1 s, with a small thumbnail animation into the bottom-left thumbnail.

## 2. THE GUIDANCE ENGINE (design this carefully)
Treat this as the core technical risk. The goal is guidance that feels instant and stable, not jittery. **One layer only, fully on-device.** There is no cloud layer and no setting for one.

- Runs in a Web Worker on downscaled frames, every few frames, with frame skipping under load:
  - Saliency map (spectral residual + edge/contrast energy).
  - MediaPipe face and person/object detections; horizon estimate from dominant near-horizontal edges.
  - Tracking between scans (template/feature tracking on the downscaled frame, corrected by detections) so the target frame follows the subject.
- Device motion converts "target is X% to the right/above" into tilt vs. move guidance, and detects hand steadiness and level. Motion data never leaves the device.
- Composition scorer: generate candidate crops at the current aspect ratio and zooms, then score them (subject on thirds/power points, headroom, no awkward edge cuts of subjects, leading lines/diagonals, level horizon, subject size, minimal clutter, balanced exposure). Pick the best, then smooth it over time (exponential smoothing + hysteresis) so it doesn't flicker.

Guidance math to implement:
- Normalize target frame and current view into the same coordinate space. Compute dx, dy (normalized), scale ratio (zoom needed), and roll (horizon).
- Map to hints with dead-zones and priorities (fix the big error first: zoom/step, then move/tilt, then roll).
- LOCK condition: IoU(target, current) >= ~0.85, center error under ~4% of frame width, roll under ~2 degrees, device steady for ~300 ms. Use hysteresis to unlock (e.g. IoU < 0.75) so it doesn't flicker.
- Haptics and sounds only on state changes (scan found, locked), never continuously.

## 2b. IMAGE QUALITY: TWO SHELLS, ONE APP
The owner wants **zero image quality loss** and the iPhone's own processing. A web page cannot deliver that: it can only save frames from the live video, which skip Apple's photo pipeline (Deep Fusion, Smart HDR, Night mode) and top out around video resolution.

Plan, pending the owner's answer on sideloading:
- **Web app (shipping now):** zero setup, same UI and guidance, video-frame quality. Stays as the instant-try version.
- **Native shell (sideloadable IPA):** the same web UI inside a thin native wrapper with a small Swift camera module that shoots through the iPhone's photo pipeline at full resolution and saves the result. Built unsigned by GitHub Actions on a macOS runner; the owner installs it with a sideloading tool. Guidance, aims, editor and library code are shared between both shells.

## 3. THE EDITOR ("Develop it like film")

**Vibes come first.** Before the full editor, ship the simple version the owner asked for: after a shot, pick a vibe (an aesthetic) and it applies a light filter on top of the photo. It is optional, non-destructive, and each aim suggests one. Vibes are the first few Looks below with one tap instead of panels.

A non-destructive editor that opens from the thumbnail or the library. Edits are stored as a JSON recipe applied to the original through a WebGL shader pipeline, with a fast preview and full-resolution export.

Panels:
- LOOKS: a horizontal list of film-style looks, each a starting preset the user can then adjust. Create LarpCam's own originals with their own names (aim for 8-12), previewed live on the actual photo with a before/after press-and-hold.
- LIGHT: exposure, contrast, highlights, shadows, whites, blacks, fade, temperature, tint.
- COLOR: HSL mixer (8 color bands x hue/sat/lum), color grading (shadows/mids/highlights wheels), tone curves (RGB + per-channel), calibration.
- EFFECTS: grain (amount/size/roughness), halation (red-orange glow around highlights; amount/radius/threshold), glow/bloom, light leaks (several overlays with position/intensity), scratches, dust, motion blur, vignette.
- FINISH: frames (Plain, White, Paper, Black, Negative-strip, and "Specs", which prints what the browser knows about the shot: lens chip, zoom, size, date), plus an optional date stamp in a classic orange film-camera style from the capture date.
- Controls: undo/redo, reset, copy/paste adjustments, save custom looks as presets, export (full-res JPEG/PNG, WebP where supported), share sheet, save to Photos through the share sheet.

Panel names in the UI stay plain. No jargon where a simpler word exists.

## 4. LIBRARY ("Keep it")
- In-app library (grid / contact-sheet style) of everything shot or imported.
- Each item keeps the original, metadata, and its edit recipe so it can be re-edited later.
- Import from Photos (file picker); save back through the share sheet; favorites; delete.
- IndexedDB only. No account system.

## 5. DESIGN (as clean and sleek as possible, phones first)
- **One-thumb use.** Primary actions in the bottom third. Tap targets at least 44 px. Respect safe-area insets and use `100dvh` so nothing hides behind Safari bars or the home indicator.
- **Minimal chrome.** The camera view is the hero. Controls are quiet until needed. Advanced options live in a bottom sheet.
- **One token file** ([src/design/tokens.css](../src/design/tokens.css)) for color, type scale, spacing, radii, and motion, used everywhere. Dark camera UI with a single accent yellow for all guidance elements; warm off-white "paper" surfaces for the editor and library. System sans for controls, one editorial serif for a few headings.
- **Motion** is smooth, springy, restrained (frame appears, locks, shutter press). Honor `prefers-reduced-motion`.
- **No jargon** anywhere in the UI. Short, human copy ("Move your phone up", not "Adjust pitch").
- **First run:** at most 3 quick screens. Ask for camera and motion permission in context, at the moment each is needed, with one friendly sentence on why. No sign-up, no settings maze. The app works well with zero configuration.
- **Accessibility:** labeled controls, sufficient contrast, optional spoken coaching.

## 6. DATA MODEL (sketch, refine as needed)
- Photo { id, createdAt, original (Blob), thumb (Blob), width, height, crop, aspect, lens, zoom, facing, targetFrame?, subjectLabel?, recipe?, favorite }
- EditRecipe { lookID, light{}, color{hsl, grading, curves}, effects{}, frame{}, dateStamp{} }
- CustomLook { id, name, recipe }
- Settings { aspect, grid, level, cropToFrame, spokenCoaching, onboarded }

## 7. OWNER CUSTOMIZATIONS (build these too)
1. [TWEAK #1: e.g. no paywall, everything unlocked, it's a personal app]
2. [TWEAK #2: e.g. a preset/look pack to be described later]
3. [TWEAK #3: e.g. daily composition challenge, different accent color, spoken coaching]

## 8. MILESTONES (stop after each; give the owner the live link and exactly what to tap)
Priority order: installable camera shell with beautiful UI, then scan + guidance, then editor and looks, then library and polish.

- **M1. Installable camera shell.** Vite/TS project, design tokens, PWA manifest + service worker + offline, Pages deploy workflow with PR previews, in-context camera permission, live preview, shapes (3:4, 4:5, 1:1, 9:16), lens chips and zoom (feature-detected), light (if available), grid, selfie camera, shutter, save original to IndexedDB, thumbnail -> viewer with share/delete, first-run screens, README install guide, LIMITATIONS.md.
- **M2. On-device scan and aims.** Analysis worker, "what stands out" map, candidate-crop scorer, ten aims, yellow frame + plain subject label, first plain-words hints, rescan, dismiss. *(done)*
- **M2b. Recognition.** Bundled detectors for people, faces, food, pets and common objects, so aims can find their subject by what it is and labels can name it.
- **N1. Native shell.** Sideloadable IPA with full-quality capture (see 2b). Scheduled once the owner confirms how they sideload.
- **V1. Vibes.** One-tap light filters after the shot (see 3).
- **M3. Guidance.** Dashed line + "+" marker, hint text engine, motion permission in context, live tracking, lock state with hysteresis, shutter glow, haptics where available, optional spoken coaching, level. Unit tests for all of the math.
- **M4. Your frame.** Draw, move, resize; crop to frame.
- **M5. Editor engine.** WebGL pipeline, Light + Color panels, recipe storage, re-edit from original.
- **M6. Looks and effects.** 8-12 original looks, grain, halation, glow, leaks, dust, scratches, vignette, before/after.
- **M7. Finish and export.** Frames, Specs frame, date stamp, full-res export, share.
- **M8. Library and polish.** Grid library, import, favorites, settings, performance pass on a real phone (heat and battery), final QA checklist.

## 9. WORKING RULES
- Work on a branch and open PRs. Commit small and often. Never push to `main` directly.
- Keep code modular: CameraService, GuidanceEngine, CompositionScorer, SubjectTracker, MotionService, EditorPipeline, RecipeStore, LibraryStore, UI.
- Write unit tests for the guidance math and the lock/hysteresis logic.
- Verify your own work before reporting: run the app in a headless browser with a fake camera feed, take screenshots at 375x812 and 390x844, run Lighthouse, fix what you find.
- Comment non-obvious logic. Explain what you did after each milestone in 3-5 lines.
- If something in this brief is ambiguous or infeasible on the web, say so and propose the closest workable option rather than silently changing scope.
