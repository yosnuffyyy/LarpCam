import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { camera, type CameraStatus } from '../camera/CameraService';
import { grabFrame } from '../camera/capture';
import { formatZoom } from '../camera/lenses';
import { SHAPES, SHAPE_RATIO, layoutFinder, nextShape, type FinderLayout } from '../lib/geometry';
import { isStandalone, prefersReducedMotion, tick } from '../lib/platform';
import { library, newPhotoId } from '../library/LibraryStore';
import { settings, updateSettings } from '../state/settings';
import { InstallSteps, canShowInstallSteps } from './InstallSteps';
import { Sheet, SwitchRow } from './Sheet';
import { IconFlip, IconGrid, IconLight, IconMore, IconPrivate, IconShape } from './icons';
import { showToast } from './toast';
import './camera.css';

interface CameraScreenProps {
  /** False while the first-run screens are showing or the camera should rest. */
  active: boolean;
  onOpenViewer: () => void;
}

export function CameraScreen({ active, onOpenViewer }: CameraScreenProps) {
  const root = useRef<HTMLElement>(null);
  const controls = useRef<HTMLDivElement>(null);
  const mainRow = useRef<HTMLDivElement>(null);
  const finder = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const blink = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLDivElement>(null);

  const [moreOpen, setMoreOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const noticeTimer = useRef(0);

  const { shape, grid } = settings.value;
  const ratio = SHAPE_RATIO[shape];
  const status = camera.status.value;
  const live = status === 'live';
  const lenses = camera.lenses.value;
  const lensId = camera.lensId.value;
  const mirrored = camera.facing.value === 'user';
  const latest = library.photos.value[0];

  const layout = useFinderLayout(root, controls, mainRow, ratio);

  /** A short message in the hint line that clears itself. */
  const say = useCallback((message: string) => {
    window.clearTimeout(noticeTimer.current);
    setNotice(message);
    noticeTimer.current = window.setTimeout(() => setNotice(''), 1400);
  }, []);

  // The camera runs only while this screen is in front and the app is visible.
  useEffect(() => {
    camera.attach(video.current);
    return () => camera.attach(null);
  }, []);

  useEffect(() => {
    if (!active) return;
    const sync = () => {
      if (document.visibilityState === 'visible') {
        const s = camera.status.value;
        if (s !== 'live' && s !== 'starting') void camera.start();
      } else {
        camera.stop();
      }
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, [active]);

  usePinchZoom(finder, live, say);

  const shoot = async () => {
    const el = video.current;
    if (!el || camera.status.value !== 'live') return;
    tick();
    blink.current?.animate([{ opacity: 0 }, { opacity: 0.9, offset: 0.2 }, { opacity: 0 }], {
      duration: prefersReducedMotion() ? 120 : 260,
      easing: 'ease-out',
    });
    try {
      const lens = camera.lenses.value.find((l) => l.id === camera.lensId.value);
      // Copy the frame now (instant), start the animation, then encode in the background.
      const frame = grabFrame(el, ratio, camera.digitalZoom.value);
      flyToThumb(frame.preview, finder.current, thumb.current);
      const shot = await frame.encode();
      await library.add(
        {
          id: newPhotoId(),
          createdAt: Date.now(),
          width: shot.width,
          height: shot.height,
          crop: shot.crop,
          shape,
          lens: lens?.label ?? formatZoom(camera.zoom.value),
          zoom: camera.zoom.value,
          facing: camera.facing.value,
        },
        shot.original,
        shot.thumb,
      );
    } catch {
      showToast("That one didn't save. Try again.");
    }
  };

  const cycleShape = () => {
    const next = nextShape(shape);
    updateSettings({ shape: next });
    say(next);
  };

  const finderStyle = layout
    ? {
        width: `${layout.width}px`,
        height: `${layout.height}px`,
        transform: `translate(${layout.x}px, ${layout.y}px)`,
      }
    : { visibility: 'hidden' as const };

  return (
    <section class="camera" ref={root} aria-label="Camera">
      <div class={`finder ${live ? 'is-live' : ''}`} ref={finder} style={finderStyle}>
        <video
          ref={video}
          class="finder__video"
          style={{ transform: `scale(${mirrored ? -1 : 1}, 1) scale(${camera.digitalZoom.value})` }}
          playsInline
          muted
          autoPlay
          disablePictureInPicture
          aria-label="Live camera view"
          onResize={(e) => camera.noteVideoSize(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          onLoadedMetadata={(e) => camera.noteVideoSize(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
        />
        <div class={`finder__grid ${grid && live ? 'is-on' : ''}`} aria-hidden="true">
          <span />
          <span />
          <span />
          <span />
        </div>
        <div class="finder__blink" ref={blink} aria-hidden="true" />
        {!live && active && <StatusPanel status={status} />}
      </div>

      <div class={`controls ${layout?.underControls ? 'is-over-picture' : ''}`} ref={controls}>
        <p class="hint" aria-live="polite">
          {notice}
        </p>

        <div class="controls__row controls__row--quiet">
          <button class="chip" onClick={cycleShape} aria-label={`${shape} picture shape, tap to change`}>
            <IconShape ratio={ratio} />
            <span>{shape}</span>
          </button>

          <div class="lenses" role="radiogroup" aria-label="Zoom" hidden={lenses.length === 0}>
            {lenses.map((lens) => {
              const selected = lens.id === lensId;
              // The chosen chip shows the live zoom, so pinching reads out as you go.
              const text = selected && lens.kind !== 'tele' ? formatZoom(camera.zoom.value * lensBase(lens.id)) : lens.label;
              return (
                <button
                  key={lens.id}
                  class="lens"
                  role="radio"
                  aria-checked={selected}
                  aria-label={`${text} ${lens.name}`}
                  disabled={!live}
                  onClick={() => {
                    tick(6);
                    void camera.selectLens(lens.id);
                  }}
                >
                  <span>{text}</span>
                </button>
              );
            })}
          </div>

          <button class="icon-btn" onClick={() => setMoreOpen(true)} aria-label="More options" aria-haspopup="dialog">
            <IconMore />
          </button>
        </div>

        <div class="controls__row controls__row--main" ref={mainRow}>
          <div class="thumb-slot" ref={thumb}>
            {latest ? (
              <button class="thumb" onClick={onOpenViewer} aria-label="Open your photos">
                <img key={latest.id} src={latest.thumbUrl} alt="" draggable={false} />
              </button>
            ) : (
              // No photos yet: keep the slot so the layout does not jump, but it is not a button.
              <span class="thumb thumb--empty" aria-hidden="true" />
            )}
          </div>

          <button class="shutter" onClick={shoot} disabled={!live} aria-label="Take photo">
            <span class="shutter__disc" />
          </button>

          {camera.canFlip.value ? (
            <button
              class="icon-btn icon-btn--lg"
              onClick={() => void camera.flip()}
              disabled={status === 'starting'}
              aria-label={mirrored ? 'Switch to back camera' : 'Switch to selfie camera'}
            >
              <IconFlip />
            </button>
          ) : (
            <span class="icon-btn--placeholder" aria-hidden="true" />
          )}
        </div>
      </div>

      <Sheet open={moreOpen} title="More options" onClose={() => setMoreOpen(false)}>
        <h2 class="serif sheet__title">More</h2>

        <div class="sheet__section">
          <span class="sheet__label" id="shape-label">
            Picture shape
          </span>
          <div class="segments" role="radiogroup" aria-labelledby="shape-label">
            {SHAPES.map((s) => (
              <button
                key={s}
                class="segment"
                role="radio"
                aria-checked={s === shape}
                aria-label={`${s} shape`}
                onClick={() => updateSettings({ shape: s })}
              >
                <IconShape ratio={SHAPE_RATIO[s]} size={22} />
                {s}
              </button>
            ))}
          </div>
        </div>

        <div class="sheet__section rows">
          <SwitchRow
            label="Grid"
            hint="Helps you line things up"
            icon={<IconGrid />}
            checked={grid}
            onChange={(on) => updateSettings({ grid: on })}
          />
          {camera.torchAvailable.value && (
            <SwitchRow
              label="Light"
              hint="Keeps the phone’s light on"
              icon={<IconLight />}
              checked={camera.torchOn.value}
              onChange={(on) => void camera.setTorch(on)}
            />
          )}
        </div>

        {!isStandalone() && canShowInstallSteps() && (
          <div class="sheet__section">
            <span class="sheet__label">Add to your Home Screen</span>
            <InstallSteps compact />
          </div>
        )}

        <p class="sheet__note">
          <IconPrivate size={20} />
          <span>Nothing your camera sees ever leaves this phone. No account, no cloud, no tracking.</span>
        </p>
        <p class="sheet__build">LarpCam · build {__BUILD_ID__}</p>
      </Sheet>
    </section>
  );
}

/** Chips show the live zoom when selected; the ultra-wide lens counts from 0.5. */
function lensBase(id: string): number {
  return id === 'ultrawide' ? 0.5 : 1;
}

const STATUS_COPY: Partial<Record<CameraStatus, { title: string; body: string; action?: string }>> = {
  denied: {
    title: 'The camera is off',
    body: 'LarpCam can’t take photos without it. Tap below and choose Allow.',
    action: 'Turn on camera',
  },
  missing: {
    title: 'No camera found',
    body: 'This device doesn’t seem to have a camera LarpCam can use.',
    action: 'Look again',
  },
  unsupported: {
    title: 'Open this in Safari',
    body: 'This browser can’t use the camera. Open the same link in Safari and it will work.',
  },
  busy: {
    title: 'The camera is busy',
    body: 'Another app may be using it. Close that app, then try again.',
    action: 'Try again',
  },
  error: {
    title: 'The camera didn’t start',
    body: 'Something got in the way. Trying again usually fixes it.',
    action: 'Try again',
  },
  idle: {
    title: 'Camera is resting',
    body: 'Tap to wake it up.',
    action: 'Wake camera',
  },
};

function StatusPanel({ status }: { status: CameraStatus }) {
  // Starting is normally over in a blink; only mention it if it drags on.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (status !== 'starting') return;
    const timer = window.setTimeout(() => setSlow(true), 1500);
    return () => window.clearTimeout(timer);
  }, [status]);

  if (status === 'starting') {
    return slow ? (
      <div class="status" role="status">
        <p class="status__body">Waking the camera…</p>
      </div>
    ) : null;
  }

  const copy = STATUS_COPY[status];
  if (!copy) return null;
  return (
    <div class="status" role="alert">
      <h2 class="serif status__title">{copy.title}</h2>
      <p class="status__body">{copy.body}</p>
      {copy.action && (
        <button class="btn btn--primary" onClick={() => void camera.start()}>
          {copy.action}
        </button>
      )}
    </div>
  );
}

/** Measures the screen and the controls and works out where the picture goes. */
function useFinderLayout(
  root: { current: HTMLElement | null },
  controls: { current: HTMLElement | null },
  mainRow: { current: HTMLElement | null },
  ratio: number,
): FinderLayout | null {
  const [layout, setLayout] = useState<FinderLayout | null>(null);

  useLayoutEffect(() => {
    const el = root.current;
    const bar = controls.current;
    const row = mainRow.current;
    if (!el || !bar || !row) return;
    const measure = () => {
      const top = parseFloat(getComputedStyle(el).paddingTop) || 0;
      const next = layoutFinder({
        width: el.clientWidth,
        height: el.clientHeight,
        top,
        controls: bar.offsetHeight,
        // From the top of the shutter row (plus a little air) to the screen edge.
        shutterRow: bar.offsetHeight - row.offsetTop + 8,
        ratio,
      });
      setLayout((prev) =>
        prev &&
        prev.x === next.x &&
        prev.y === next.y &&
        prev.width === next.width &&
        prev.height === next.height &&
        prev.underControls === next.underControls
          ? prev
          : next,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [ratio]);

  return layout;
}

/** Two-finger pinch on the picture (or Ctrl + scroll on a laptop) zooms. */
function usePinchZoom(target: { current: HTMLElement | null }, enabled: boolean, say: (message: string) => void): void {
  useEffect(() => {
    const el = target.current;
    if (!el || !enabled) return;
    const points = new Map<number, { x: number; y: number }>();
    let startDistance = 0;
    let startZoom = 1;

    const distance = () => {
      const [a, b] = [...points.values()];
      return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
    };
    const apply = (zoom: number) => {
      camera.setZoom(zoom);
      say(formatZoom(camera.zoom.value * (camera.lensId.value === 'ultrawide' ? 0.5 : 1)));
    };

    const down = (e: PointerEvent) => {
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2) {
        startDistance = distance();
        startZoom = camera.zoom.value;
      }
    };
    const move = (e: PointerEvent) => {
      if (!points.has(e.pointerId)) return;
      points.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (points.size === 2 && startDistance > 0) apply(startZoom * (distance() / startDistance));
    };
    const up = (e: PointerEvent) => {
      points.delete(e.pointerId);
      startDistance = 0;
    };
    const wheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      apply(camera.zoom.value * Math.exp(-e.deltaY / 200));
    };

    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', wheel, { passive: false });
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('wheel', wheel);
    };
  }, [target, enabled, say]);
}

/**
 * The just-taken picture shrinks from the viewfinder into the thumbnail.
 * One transform animation on its own layer, so it costs nothing per frame.
 */
function flyToThumb(canvas: HTMLCanvasElement, from: HTMLElement | null, to: HTMLElement | null): void {
  if (!from || !to || prefersReducedMotion()) return;
  const a = from.getBoundingClientRect();
  const b = to.getBoundingClientRect();
  if (!a.width || !b.width) return;

  canvas.className = 'fly';
  Object.assign(canvas.style, {
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
  });
  document.body.append(canvas);

  const scale = Math.max(b.width / a.width, b.height / a.height);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const animation = canvas.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1, borderRadius: '14px' },
      { opacity: 1, offset: 0.7 },
      { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0, borderRadius: '60px' },
    ],
    { duration: 460, easing: 'cubic-bezier(0.3, 0.9, 0.3, 1)' },
  );
  const cleanup = () => canvas.remove();
  animation.onfinish = cleanup;
  animation.oncancel = cleanup;
}
