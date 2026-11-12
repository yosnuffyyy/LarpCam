import { batch, signal } from '@preact/signals';
import { clamp } from '../lib/geometry';
import { MAX_DIGITAL_ZOOM, buildLensOptions, type CameraDevice, type LensOption, type ZoomRange } from './lenses';

/**
 * Owns the camera stream. Everything the browser may or may not support
 * (lens switching, real zoom, the light) is detected here and exposed as
 * plain signals, so the UI only ever shows what actually works.
 */

export type CameraStatus =
  | 'idle' // not started yet
  | 'starting'
  | 'live'
  | 'denied' // the user (or the phone's settings) said no
  | 'missing' // no camera on this device
  | 'unsupported' // this browser cannot open cameras
  | 'busy' // another app is holding the camera
  | 'error';

export type Facing = 'environment' | 'user';

// Capabilities newer than TypeScript's built-in DOM types.
interface ExtraCapabilities extends MediaTrackCapabilities {
  zoom?: { min: number; max: number; step?: number };
  torch?: boolean;
}
interface ExtraConstraints extends MediaTrackConstraintSet {
  zoom?: number;
  torch?: boolean;
}

/** Ask for a 4:3 stream: that is the full sensor on phones, so no view is lost. */
const VIDEO_WISH = { width: { ideal: 1920 }, height: { ideal: 1440 }, frameRate: { ideal: 30 } };

export class CameraService {
  readonly status = signal<CameraStatus>('idle');
  readonly facing = signal<Facing>('environment');
  readonly lenses = signal<LensOption[]>([]);
  readonly lensId = signal<string>('wide');
  /** Zoom on the current lens: 1 is that lens's natural view. */
  readonly zoom = signal(1);
  /** How far pinch may go on the current lens. */
  readonly zoomMax = signal(MAX_DIGITAL_ZOOM);
  /** Part of `zoom` the page must apply itself by cropping (1 = none). */
  readonly digitalZoom = signal(1);
  readonly torchAvailable = signal(false);
  readonly torchOn = signal(false);
  /** True once a second camera (selfie) is known to exist. */
  readonly canFlip = signal(false);
  /** Pixel size of the live video, once known. */
  readonly videoSize = signal<{ width: number; height: number } | null>(null);

  private video: HTMLVideoElement | null = null;
  private stream: MediaStream | null = null;
  private track: MediaStreamTrack | null = null;
  private devices: CameraDevice[] = [];
  private hardwareZoom: ZoomRange | null = null;
  private deviceId: string | undefined;
  private startToken = 0;
  private zoomQueue: Promise<void> = Promise.resolve();

  /** The <video> the stream should play in. Call again if the element changes. */
  attach(video: HTMLVideoElement | null): void {
    this.video = video;
    if (video && this.stream) this.play(video, this.stream);
  }

  get isSupported(): boolean {
    return typeof navigator.mediaDevices?.getUserMedia === 'function';
  }

  /** Opens the camera. Safe to call repeatedly; the latest call wins. */
  async start(): Promise<void> {
    if (!this.isSupported) {
      this.status.value = 'unsupported';
      return;
    }
    const token = ++this.startToken;
    if (this.status.value !== 'live') this.status.value = 'starting';
    this.release();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: this.videoConstraints() });
      if (token !== this.startToken) {
        // A newer start() or a stop() happened while we were waiting.
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const track = stream.getVideoTracks()[0];
      if (!track) throw new DOMException('No video track', 'NotFoundError');
      this.stream = stream;
      this.track = track;
      track.addEventListener('ended', this.onTrackEnded);

      await this.readDevices();
      if (token !== this.startToken) return;
      this.readCapabilities(track);
      if (this.video) await this.play(this.video, stream);
      if (token !== this.startToken) return;

      await this.applyZoom(this.zoom.value);
      this.status.value = 'live';
    } catch (error) {
      if (token !== this.startToken) return;
      this.release();
      this.status.value = statusForError(error);
    }
  }

  /** Closes the camera and turns the indicator light off. */
  stop(): void {
    this.startToken++;
    this.release();
    if (this.status.value === 'live' || this.status.value === 'starting') this.status.value = 'idle';
  }

  async flip(): Promise<void> {
    batch(() => {
      this.facing.value = this.facing.value === 'environment' ? 'user' : 'environment';
      this.lensId.value = 'wide';
      this.zoom.value = 1;
      this.digitalZoom.value = 1;
    });
    this.deviceId = undefined;
    await this.start();
  }

  /** Switches lens chip. Falls back to the previous lens if the camera refuses. */
  async selectLens(id: string): Promise<void> {
    const lens = this.lenses.value.find((l) => l.id === id);
    if (!lens) return;
    const previous = { deviceId: this.deviceId, lensId: this.lensId.value, zoom: this.zoom.value };
    this.lensId.value = id;
    this.zoom.value = lens.zoom;

    if (lens.deviceId !== this.deviceId) {
      this.deviceId = lens.deviceId;
      await this.start();
      if (this.status.value !== 'live') {
        this.deviceId = previous.deviceId;
        this.lensId.value = previous.lensId;
        this.zoom.value = previous.zoom;
        await this.start();
      }
      return;
    }
    await this.applyZoom(lens.zoom);
  }

  /** Smooth zoom on the current lens (pinch). */
  setZoom(value: number): void {
    const zoom = clamp(value, 1, this.zoomMax.value);
    if (zoom === this.zoom.value) return;
    this.zoom.value = zoom;
    const current = this.lenses.value.find((l) => l.id === this.lensId.value);
    // Light up whichever chip on this camera matches the zoom, if any.
    const match = this.lenses.value.find(
      (l) => l.deviceId === current?.deviceId && Math.abs(l.zoom - zoom) < 0.05,
    );
    if (match) this.lensId.value = match.id;
    void this.applyZoom(zoom);
  }

  async setTorch(on: boolean): Promise<void> {
    if (!this.track || !this.torchAvailable.value) return;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on } as ExtraConstraints] });
      this.torchOn.value = on;
    } catch {
      // The phone refused (often: low battery or too hot). Hide the control.
      this.torchOn.value = false;
      this.torchAvailable.value = false;
    }
  }

  // ---- internals ---------------------------------------------------------

  private videoConstraints(): MediaTrackConstraints {
    if (this.deviceId) return { deviceId: { exact: this.deviceId }, ...VIDEO_WISH };
    return { facingMode: { ideal: this.facing.value }, ...VIDEO_WISH };
  }

  private async play(video: HTMLVideoElement, stream: MediaStream): Promise<void> {
    if (video.srcObject !== stream) video.srcObject = stream;
    try {
      await video.play();
    } catch {
      /* autoplay can be interrupted by a newer stream; the next start() retries */
    }
    if (video.videoWidth && video.videoHeight) {
      this.videoSize.value = { width: video.videoWidth, height: video.videoHeight };
    }
  }

  /** Call when the <video> reports new dimensions (e.g. the phone rotated). */
  noteVideoSize(width: number, height: number): void {
    if (!width || !height) return;
    const current = this.videoSize.value;
    if (!current || current.width !== width || current.height !== height) this.videoSize.value = { width, height };
  }

  private async readDevices(): Promise<void> {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cameras = all.filter((d) => d.kind === 'videoinput');
      this.devices = cameras.map((d) => ({ deviceId: d.deviceId, label: d.label }));
      this.canFlip.value = cameras.length > 1;
    } catch {
      this.devices = [];
      this.canFlip.value = false;
    }
  }

  private readCapabilities(track: MediaStreamTrack): void {
    let caps: ExtraCapabilities = {};
    try {
      caps = typeof track.getCapabilities === 'function' ? (track.getCapabilities() as ExtraCapabilities) : {};
    } catch {
      caps = {};
    }

    this.hardwareZoom =
      caps.zoom && Number.isFinite(caps.zoom.max) && caps.zoom.max > caps.zoom.min
        ? { min: caps.zoom.min, max: caps.zoom.max }
        : null;

    const lenses = buildLensOptions({
      facing: this.facing.value,
      devices: this.devices,
      hardwareZoom: this.hardwareZoom,
    });

    batch(() => {
      this.lenses.value = lenses;
      if (!lenses.some((l) => l.id === this.lensId.value)) {
        this.lensId.value = 'wide';
        this.zoom.value = 1;
      }
      this.zoomMax.value = this.hardwareZoom ? Math.min(this.hardwareZoom.max, 10) : MAX_DIGITAL_ZOOM;
      this.zoom.value = clamp(this.zoom.value, 1, this.zoomMax.value);
      this.torchAvailable.value = caps.torch === true;
      this.torchOn.value = false;
    });
  }

  /**
   * Uses the camera's own zoom when it has one (sharper), and makes up any
   * difference by cropping. Calls are queued so pinch gestures cannot overlap.
   */
  private applyZoom(zoom: number): Promise<void> {
    this.zoomQueue = this.zoomQueue.then(async () => {
      const track = this.track;
      if (!track) return;
      const range = this.hardwareZoom;
      if (!range) {
        this.digitalZoom.value = zoom;
        return;
      }
      // Hardware zoom is measured from the lens's own "1".
      const target = clamp(zoom * Math.max(1, range.min), range.min, range.max);
      try {
        await track.applyConstraints({ advanced: [{ zoom: target } as ExtraConstraints] });
        this.digitalZoom.value = 1;
      } catch {
        // The camera said it could zoom but would not: crop instead.
        this.hardwareZoom = null;
        this.zoomMax.value = MAX_DIGITAL_ZOOM;
        this.digitalZoom.value = clamp(zoom, 1, MAX_DIGITAL_ZOOM);
      }
    });
    return this.zoomQueue;
  }

  private onTrackEnded = (): void => {
    // The phone took the camera away (call, another app, backgrounding).
    if (this.status.value === 'live') {
      this.release();
      this.status.value = 'idle';
    }
  };

  private release(): void {
    if (this.track) this.track.removeEventListener('ended', this.onTrackEnded);
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.track = null;
    this.torchOn.value = false;
    if (this.video) this.video.srcObject = null;
  }
}

function statusForError(error: unknown): CameraStatus {
  const name = error instanceof DOMException || error instanceof Error ? error.name : '';
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    case 'NotReadableError':
    case 'AbortError':
      return 'busy';
    default:
      return 'error';
  }
}

export const camera = new CameraService();
