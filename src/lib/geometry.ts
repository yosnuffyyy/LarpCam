/** Pure layout and crop math. No DOM in here, so it is easy to unit test. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const SHAPES = ['3:4', '4:5', '1:1', '9:16'] as const;
export type Shape = (typeof SHAPES)[number];

/** Width divided by height, for a phone held upright. */
export const SHAPE_RATIO: Record<Shape, number> = {
  '3:4': 3 / 4,
  '4:5': 4 / 5,
  '1:1': 1,
  '9:16': 9 / 16,
};

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function nextShape(shape: Shape): Shape {
  return SHAPES[(SHAPES.indexOf(shape) + 1) % SHAPES.length]!;
}

export interface FinderLayoutInput {
  /** Size of the screen column in CSS px. */
  width: number;
  height: number;
  /** Space to keep clear at the top (status bar / notch). */
  top: number;
  /** Height of all the bottom controls, including the home-indicator inset. */
  controls: number;
  /** The part of `controls` the picture must never go under: the shutter row. */
  shutterRow: number;
  /** Width / height of the picture. */
  ratio: number;
}

export interface FinderLayout extends Rect {
  /** True when the picture runs underneath the upper controls. */
  underControls: boolean;
}

/**
 * Where the viewfinder sits on screen.
 *
 * 1. If the picture fits between the top inset and the controls, it is
 *    centered in that gap at full width.
 * 2. Otherwise it may slide under the hint line and the lens chips (which get
 *    a dark fade behind them), but it always stops above the shutter row.
 * 3. If it is too tall even for that, it shrinks to fit, keeping its shape.
 */
export function layoutFinder(input: FinderLayoutInput): FinderLayout {
  const { width, height, top, controls, shutterRow, ratio } = input;
  let w = width;
  let h = w / ratio;

  const gap = height - top - controls;
  if (h <= gap) {
    return { x: 0, y: Math.round(top + (gap - h) / 2), width: w, height: h, underControls: false };
  }

  const room = Math.max(1, height - top - shutterRow);
  if (h > room) {
    h = room;
    w = h * ratio;
  }
  return {
    x: (width - w) / 2,
    y: Math.round(top + (room - h) / 2),
    width: w,
    height: h,
    underControls: true,
  };
}

/**
 * The part of the camera image the viewfinder is showing, in image pixels.
 *
 * The video fills the viewfinder like `object-fit: cover`, then digital zoom
 * magnifies it about the center. The saved photo is exactly this rectangle.
 */
export function visibleSourceRect(videoWidth: number, videoHeight: number, ratio: number, zoom = 1): Rect {
  const z = Math.max(1, zoom);
  const videoRatio = videoWidth / videoHeight;
  let w: number;
  let h: number;
  if (videoRatio > ratio) {
    // Video is wider than the finder: full height, sides cut off.
    h = videoHeight;
    w = h * ratio;
  } else {
    w = videoWidth;
    h = w / ratio;
  }
  w /= z;
  h /= z;
  // Whole pixels, never larger than the image.
  w = Math.min(videoWidth, Math.max(2, Math.round(w)));
  h = Math.min(videoHeight, Math.max(2, Math.round(h)));
  return {
    x: Math.round((videoWidth - w) / 2),
    y: Math.round((videoHeight - h) / 2),
    width: w,
    height: h,
  };
}

/** A rectangle as fractions (0..1) of an image, so it survives resizing. */
export function normalizeRect(rect: Rect, width: number, height: number): Rect {
  return { x: rect.x / width, y: rect.y / height, width: rect.width / width, height: rect.height / height };
}

/** Largest size with the same shape whose long edge is at most `maxEdge`. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
