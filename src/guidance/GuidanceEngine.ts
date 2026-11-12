import { signal } from '@preact/signals';
import { fitWithin, visibleSourceRect } from '../lib/geometry';
import type { AnalysisRequest, AnalysisResult } from './analysis.worker';
import { smoothFrame, type Frame } from './scorer';

/**
 * Drives the scan: a few times a second it hands a tiny copy of the
 * viewfinder to the analysis worker and smooths the answers into one steady
 * target frame. If the worker is still busy, the frame is skipped.
 */

export type GuidanceStatus = 'off' | 'scanning' | 'found' | 'empty';

export interface ViewState {
  /** Picture shape, width / height. */
  ratio: number;
  digitalZoom: number;
  /** Selfie preview is mirrored; the target is flipped to match what is shown. */
  mirrored: boolean;
  aim: string;
}

/** Fastest the scan runs: four looks a second. */
const INTERVAL_MS = 250;
/** Slowest it backs off to on a struggling phone. */
const MAX_INTERVAL_MS = 1000;
/**
 * Copying a frame out of the video is the one step that must happen on the
 * main thread. It may use at most this share of the time, so the scan slows
 * itself down rather than making the viewfinder stutter.
 */
const GRAB_BUDGET = 0.04;
/** The scanning state is shown at least this long so it reads as a deliberate look. */
const MIN_SCAN_MS = 650;
/** Long edge of the frame sent for analysis. */
const ANALYSIS_EDGE = 96;
/** Misses in a row before a found frame is given up on. */
const MAX_MISSES = 4;

export class GuidanceEngine {
  readonly status = signal<GuidanceStatus>('off');
  /** Target frame in viewfinder fractions, as displayed. */
  readonly target = signal<Frame | null>(null);
  readonly label = signal('');

  private worker: Worker | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private timer = 0;
  private busy = false;
  private interval = INTERVAL_MS;
  private nextId = 1;
  private session = 0;
  private startedAt = 0;
  private misses = 0;
  private raw: Frame | null = null;
  private aim = '';
  private video: HTMLVideoElement | null = null;
  private view: (() => ViewState) | null = null;

  /** Starts (or restarts) looking. */
  start(video: HTMLVideoElement, view: () => ViewState): void {
    this.video = video;
    this.view = view;
    this.session++;
    this.raw = null;
    this.misses = 0;
    this.busy = false;
    this.startedAt = performance.now();
    this.target.value = null;
    this.label.value = '';
    this.status.value = 'scanning';
    if (!this.worker) {
      this.worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (event: MessageEvent<AnalysisResult>) => this.onResult(event.data);
      this.worker.onerror = () => this.stop();
    }
    this.interval = INTERVAL_MS;
    this.schedule(0);
  }

  /** Clears the suggestion and stops all analysis. */
  stop(): void {
    window.clearTimeout(this.timer);
    this.session++;
    this.busy = false;
    this.raw = null;
    this.target.value = null;
    this.label.value = '';
    this.status.value = 'off';
  }

  get active(): boolean {
    return this.status.value !== 'off';
  }

  private schedule(delay: number): void {
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.tick();
      if (this.status.value !== 'off') this.schedule(this.interval);
    }, delay);
  }

  private tick = (): void => {
    const video = this.video;
    const view = this.view?.();
    if (!video || !view || this.busy || document.visibilityState !== 'visible') return;
    if (!video.videoWidth || video.readyState < 2) return;

    if (view.aim !== this.aim) {
      // A different aim wants a different frame: don't cling to the old one.
      this.aim = view.aim;
      this.raw = null;
    }

    const crop = visibleSourceRect(video.videoWidth, video.videoHeight, view.ratio, view.digitalZoom);
    const size = fitWithin(crop.width, crop.height, ANALYSIS_EDGE);
    const started = performance.now();
    const canvas = (this.canvas ??= document.createElement('canvas'));
    if (canvas.width !== size.width || canvas.height !== size.height) {
      canvas.width = size.width;
      canvas.height = size.height;
    }
    const ctx = canvas.getContext('2d', { willReadFrequently: true, alpha: false });
    if (!ctx) return;
    ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, size.width, size.height);
    const pixels = ctx.getImageData(0, 0, size.width, size.height).data;
    // Pace the next look by what this one cost (smoothed, so one hiccup doesn't matter).
    const cost = performance.now() - started;
    const wanted = Math.min(MAX_INTERVAL_MS, Math.max(INTERVAL_MS, cost / GRAB_BUDGET));
    this.interval += (wanted - this.interval) * 0.5;

    this.busy = true;
    const request: AnalysisRequest = {
      id: this.nextId++ * 1000 + (this.session % 1000),
      rgba: pixels.buffer as ArrayBuffer,
      width: size.width,
      height: size.height,
      aim: view.aim,
      previous: this.raw,
    };
    this.worker?.postMessage(request, [request.rgba]);
  };

  private onResult(result: AnalysisResult): void {
    this.busy = false;
    if (result.id % 1000 !== this.session % 1000 || this.status.value === 'off') return;
    const looking = performance.now() - this.startedAt < MIN_SCAN_MS;

    if (!result.frame) {
      this.misses++;
      if (!looking && (this.status.value === 'scanning' || this.misses >= MAX_MISSES)) {
        this.raw = null;
        this.target.value = null;
        this.status.value = 'empty';
      }
      return;
    }

    this.misses = 0;
    this.raw = smoothFrame(this.raw, result.frame);
    if (looking) return; // keep refining quietly until the scan animation is done

    const mirrored = this.view?.().mirrored ?? false;
    const shown = mirrored ? { ...this.raw, x: 1 - this.raw.x - this.raw.size } : this.raw;
    this.target.value = shown;
    this.label.value = result.label;
    this.status.value = 'found';
  }
}

export const guidance = new GuidanceEngine();
