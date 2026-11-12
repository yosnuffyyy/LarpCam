import type { Aim, Anchor } from './aims';
import type { Subject } from './saliency';

/**
 * Picks the best framing of a subject for an aim.
 *
 * A candidate frame is a rectangle with the same shape as the picture, so in
 * fractions of the view it is a square: position (x, y) and size s, where
 * s = 1 is the whole view. Candidates over many positions and sizes are
 * scored; the best one becomes the yellow target frame.
 */

export interface Frame {
  x: number;
  y: number;
  /** Width and height as a fraction of the view (they are equal). */
  size: number;
}

export interface Scored extends Frame {
  score: number;
}

const MIN_SIZE = 0.3;

function anchorDistance(u: number, v: number, anchors: Anchor[]): number {
  let best = Infinity;
  for (const a of anchors) {
    const du = a.u === undefined ? 0 : u - a.u;
    const dv = a.v === undefined ? 0 : v - a.v;
    best = Math.min(best, Math.hypot(du, dv));
  }
  return best;
}

export function iou(a: Frame, b: Frame): number {
  const w = Math.min(a.x + a.size, b.x + b.size) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.size, b.y + b.size) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return 0;
  const inter = w * h;
  return inter / (a.size * a.size + b.size * b.size - inter);
}

export function scoreFrame(frame: Frame, subject: Subject, aim: Aim, previous?: Frame | null): number {
  const { x, y, size } = frame;

  // How much of the subject the frame keeps. Cutting the subject is the worst mistake.
  const ix = Math.max(0, Math.min(x + size, subject.x + subject.width) - Math.max(x, subject.x));
  const iy = Math.max(0, Math.min(y + size, subject.y + subject.height) - Math.max(y, subject.y));
  const kept = (ix * iy) / (subject.width * subject.height);

  // Where the subject's center lands inside the frame.
  const u = (subject.cx - x) / size;
  const v = (subject.cy - y) / size;
  const place = 1 - Math.min(1, anchorDistance(u, v, aim.anchors) / 0.5);

  // How much of the frame the subject spans, against what the aim wants.
  const span = (aim.fillByHeight ? subject.height : Math.max(subject.width, subject.height)) / size;
  const fill = 1 - Math.min(1, Math.abs(span - aim.fill) / aim.fill);

  // A little air between the subject and the frame edge.
  const margin = Math.min(subject.x - x, subject.y - y, x + size - (subject.x + subject.width), y + size - (subject.y + subject.height)) / size;
  const air = Math.max(0, Math.min(1, margin / 0.05));

  // How much the subject dominates the frame.
  const tight = Math.min(1, (subject.width * subject.height * kept) / (size * size));

  const w = aim.weights;
  let score = 3 * kept + w.place * place + w.fill * fill + 0.4 * air + w.tight * tight + w.keepWide * size;
  // Stickiness: prefer staying near the last answer so the frame doesn't flicker.
  if (previous) score += 0.25 * iou(frame, previous);
  return score;
}

export function bestFrame(subject: Subject, aim: Aim, previous?: Frame | null): Scored {
  let best: Scored = { x: 0, y: 0, size: 1, score: -Infinity };
  for (let size = 1; size >= MIN_SIZE - 1e-6; size *= 0.9) {
    const free = 1 - size;
    const steps = free < 0.01 ? 0 : 12;
    for (let iy = 0; iy <= steps; iy++) {
      for (let ix = 0; ix <= steps; ix++) {
        const frame = { x: steps ? (free * ix) / steps : 0, y: steps ? (free * iy) / steps : 0, size };
        const score = scoreFrame(frame, subject, aim, previous);
        if (score > best.score) best = { ...frame, score };
      }
    }
  }
  return best;
}

/** Moves a frame part of the way toward a new one. Tiny changes are ignored. */
export function smoothFrame(current: Frame | null, next: Frame, amount = 0.5, deadZone = 0.015): Frame {
  if (!current) return next;
  const moved = Math.max(Math.abs(next.x - current.x), Math.abs(next.y - current.y), Math.abs(next.size - current.size));
  if (moved < deadZone) return current;
  return {
    x: current.x + (next.x - current.x) * amount,
    y: current.y + (next.y - current.y) * amount,
    size: current.size + (next.size - current.size) * amount,
  };
}
