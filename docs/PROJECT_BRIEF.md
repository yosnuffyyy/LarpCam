# PROJECT BRIEF: LarpCam, an AI composition-coach camera + film editor for iPhone

You are building an original iPhone camera app called **LarpCam**. It is inspired by an existing app category: a camera that looks at what you point it at, finds the best shot inside the scene, draws a frame around that shot, and coaches you physically into position ("Move your phone up"). After shooting, you develop the photo like film in a built-in editor. Tagline of the concept: "Point. Shoot. Develop."

Use LarpCam's own name, icon, copy, film-look names, and visual design. Do not copy any existing app's branding or assets. Everything below describes behavior, not branding.

## 0. FIRST STEPS (before writing code)
1. Check the environment (OS, Xcode, Node, devices). If the owner isn't on a Mac, say plainly what's possible (e.g. Expo/React Native with a dev build, or what's needed for native Swift) and recommend one path.
2. Ask the owner up to 5 questions you really need answered, then propose the architecture and a milestone plan. Wait for their OK.
3. Default target if not told otherwise: native iOS, SwiftUI + AVFoundation + Vision + Core Image/Metal, iOS 17+.

## 1. THE CORE LOOP
Point -> Scan -> Follow the guide -> Capture -> Develop -> Keep.

### 1a. Camera screen (reference layout, portrait)
- Full-bleed live preview inside the chosen aspect-ratio rectangle on a black background. Optional rule-of-thirds grid (thin, semi-transparent white lines).
- Top bar (left to right): aspect-ratio picker (icon + label like "3:4" with a chevron; options 3:4, 4:5, 1:1, 9:16), flash toggle (icon with slash when off), a style/exposure-mode button (aperture-like icon with chevron), and a "..." overflow menu (grid, level, haptics, settings).
- Bottom area, top to bottom:
  1. A one-line coaching hint in accent yellow, centered (e.g. "Move your phone up").
  2. A row of round lens/zoom chips: .5x, 1x, 2x, 5x. Only show lenses the device really has. Selected chip is highlighted in the accent color.
  3. Control row: last-photo thumbnail (left, tapping opens the library/viewer), large white ring shutter button (center), and a circular X button (right) that dismisses the current frame suggestion.
- A sparkle button is the "scan" trigger. Place it where it's reachable by thumb.

### 1b. Scan and the guide overlay
When the user taps the sparkle:
1. Briefly show a scanning state (subtle pulse/shimmer, ~0.5-1.5 s).
2. The app proposes a target frame: a rounded-rectangle outline in accent yellow (about 3 pt stroke, ~20 pt corner radius) at the target aspect ratio, drawn over the live preview.
3. A small pill label under the frame names the subject in 2-4 lowercase words (e.g. "sunlit palm crown").
4. A dashed line with a small "+" marker runs from the frame's current-center-of-view point to the target, showing which way to move/tilt. In the reference, the frame sits upper-right of center, the + is at the frame's lower-left, and the dashed line points from there into the frame.
5. The hint line says what to do in plain words, driven by the geometry. Cover: "Move your phone up / down / left / right", "Tilt up/down", "Step back / Step closer", "Zoom in to 2x", "Level the horizon", "Hold it", "Nice, shoot".
6. Both the frame and the hint update live as the phone moves, so the frame stays glued to the subject (live tracking).
7. When the camera view matches the target (see thresholds below), the frame locks: color/weight change, haptic tick, hint becomes "Hold it" then "Shoot", and the shutter button lights up (glow/ring color change). Shooting before lock is still allowed.
8. The X dismisses the suggestion. Tapping the sparkle again rescans.

### 1c. "Your frame" mode
The user can instead tap/drag on the viewfinder to draw their own frame. Same guide, same tracking, same lock behavior. Frames (auto or drawn) can be moved and resized with gestures before shooting.

### 1d. Capture behavior
- Output is cropped to the chosen aspect ratio. If a target frame is locked, offer a setting to crop to the frame instead of the full ratio ("Crop to frame").
- Capture RAW (ProRAW on Pro models, plain RAW/HEIF elsewhere). Keep the original untouched in the app library and always save edits as a non-destructive recipe.
- Manual controls (hidden behind a "Pro" toggle): shutter speed, ISO, exposure compensation, flash mode, tap-to-focus with true focus lock.
- Fast path: shutter -> saved to library in under ~1 s, with a small thumbnail animation into the bottom-left thumbnail.

## 2. THE AI / GUIDANCE ENGINE (design this carefully)
Treat this as the core technical risk. The goal is guidance that feels instant and stable, not jittery.

Suggested hybrid architecture (explain your final choice and tradeoffs before building):
- LAYER A, on-device and real-time (runs every frame or every few frames):
  - Apple Vision: attention-based and objectness-based saliency, face and human-body rectangles, horizon detection, and object tracking (VNTrackObjectRequest) so the target frame follows the subject between scans.
  - CoreMotion (gyro/accelerometer/attitude) to convert "target is X% to the right/above" into tilt vs. pan guidance, and to detect hand stability and horizon level. This data must stay on the device.
  - A composition scorer: generate candidate crops at the current aspect ratio and zooms, then score them (subject centered on thirds/power points, headroom, no awkward edge cuts of subjects, leading lines/diagonals, horizon level, subject size, minimal clutter, balanced exposure). Pick the best, then smooth it over time (exponential smoothing + hysteresis) so it doesn't flicker.
- LAYER B, optional and low-frequency: send a downscaled frame (e.g. ~512 px long edge, JPEG) to a vision-language model to get (1) a short subject label, (2) an optional "what's the best shot here" bounding box, and (3) a one-line tip. Throttle it (only on scan tap, or at most every few seconds), cache results, and fail gracefully to Layer A if offline. Put the API key in a settings field (Keychain), never in source. Make Layer B toggleable ("On-device only" mode) and show a short privacy note near the toggle.
- The original app's privacy policy says camera images may be sent to a third-party AI service and aren't retained, while motion data stays local. LarpCam should be more private: default to on-device only, and make cloud assist opt-in.

Guidance math to implement:
- Normalize target frame and current view into the same coordinate space. Compute dx, dy (normalized), scale ratio (zoom needed), and roll (horizon).
- Map to hints with dead-zones and priorities (fix big error first: zoom/step, then pan/tilt, then roll).
- LOCK condition: IoU(target, current) >= ~0.85, center error under ~4% of frame width, roll under ~2 degrees, device stable for ~300 ms. Use hysteresis to unlock (e.g. IoU < 0.75) so it doesn't flicker.
- Use haptics only on state changes (scan found, locked), never continuously.

## 3. THE EDITOR ("Develop it like film")
A non-destructive editor that opens from the thumbnail or the library. Edits are stored as a JSON recipe applied to the original/RAW through a Core Image or Metal pipeline, with a fast preview and full-res export.

Panels:
- LOOKS: a horizontal list of film-style looks, each a starting preset the user can then adjust. The reference app shipped four at first (a high-ISO color negative look, a 400-speed portrait color look, a faded vintage "relic" look, and a monochrome look) and added more later. Create LarpCam's own originals with their own names (aim for 8-12), previewed live on the actual photo with a before/after press-and-hold.
- LIGHT: exposure, contrast, highlights, shadows, whites, blacks, fade, temperature, tint.
- COLOR: HSL mixer (8 color bands x hue/sat/lum), color grading (shadows/mids/highlights wheels), tone curves (RGB + per-channel), calibration.
- EFFECTS: grain (amount/size/roughness), halation (red-orange glow around highlights; amount/radius/threshold), glow/bloom, light leaks (several overlays with position/intensity), scratches, dust, motion blur, vignette.
- FINISH: frames (Plain, White, Paper, Black, Negative-strip, and "Specs", which prints the lens and shooting settings like focal length, aperture, shutter, ISO read from the photo's EXIF), plus an optional date stamp in a classic orange film-camera style from the capture date.
- Controls: undo/redo, reset, copy/paste adjustments, save custom looks as presets, export (full-res JPEG/HEIF/PNG), share sheet (Instagram etc.), save to camera roll.

## 4. LIBRARY ("Keep it")
- In-app library (grid / contact-sheet style) of everything shot or imported.
- Each item keeps the original (RAW if available), metadata, and its edit recipe so it can be re-edited later from the RAW.
- Import from Photos; export/save back to the camera roll; favorites; delete.
- Local storage only (SwiftData or Core Data + files on disk). No account system.

## 5. VISUAL DESIGN DIRECTION
- Dark, quiet, camera-first UI. Accent yellow for all guidance elements (frame, label, hint, dashed line). Warm neutral off-white/paper tones for editor and library surfaces, with an editorial serif for headings/marketing-style screens and a clean sans for controls.
- Motion: gentle spring animations on frame appear/lock, no gaudy effects. Respect Reduce Motion.
- Accessibility: VoiceOver labels on all controls, spoken guidance option for the hints, Dynamic Type where it makes sense.

## 6. DATA MODEL (sketch, refine as needed)
- Photo { id, createdAt, originalURL, rawKind, width, height, aspectRatio, lens, exif, targetFrame?, subjectLabel?, recipeID }
- EditRecipe { lookID, light{}, color{hsl, grading, curves}, effects{}, frame{}, dateStamp{} }
- CustomLook { id, name, recipe }
- Settings { grid, haptics, cropToFrame, cloudAssist, apiKeyRef, defaultAspect }

## 7. OWNER CUSTOMIZATIONS (build these too)
1. [TWEAK #1: e.g. no paywall, everything unlocked, it's a personal app]
2. [TWEAK #2: e.g. a preset/look pack to be described later]
3. [TWEAK #3: e.g. daily composition challenge, different accent color, spoken coaching]

## 8. MILESTONES (stop after each, tell the owner how to run and test on their phone)
- M1. Project setup, permissions (camera, photos), live preview, aspect ratios, lens switching, shutter, save original.
- M2. Top/bottom bar UI to match the layout above, grid, flash, thumbnail -> viewer.
- M3. On-device scan: saliency + candidate-crop scorer, draw the yellow frame + label placeholder, rescan, dismiss.
- M4. Guidance: dashed line + "+" marker, hint text engine, CoreMotion integration, live tracking, lock state, haptics, shutter glow.
- M5. "Your frame" drawing mode, move/resize gestures.
- M6. RAW/ProRAW + manual controls (shutter, ISO, EV, tap-to-focus lock).
- M7. Editor engine (Core Image/Metal), Light + Color panels, recipe storage, re-edit from original.
- M8. Looks, Effects (grain, halation, glow, leaks, dust, scratches, vignette), before/after.
- M9. Frames, Specs frame from EXIF, date stamp, export/share.
- M10. Library polish, settings, optional cloud assist (Layer B), onboarding, performance pass (thermal and battery check on-device), and a final QA checklist.

## 9. WORKING RULES
- Keep code modular: CameraService, GuidanceEngine, CompositionScorer, SubjectTracker, MotionService, EditorPipeline, RecipeStore, LibraryStore, UI.
- Write unit tests for the guidance math and the lock/hysteresis logic.
- Frame rate matters: keep preview at 30-60 fps, run Vision on a background queue with frame skipping, and measure it.
- Comment non-obvious logic. Explain what you did after each milestone in 3-5 lines.
- If something in this brief is ambiguous or infeasible on the owner's setup, say so and propose the closest workable option rather than silently changing scope.
