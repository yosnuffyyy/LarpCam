import type { Frame } from './scorer';

/**
 * Turns "where the target frame is" into one plain sentence.
 * Biggest error first, with dead zones so the words don't flip back and forth.
 */

export interface HintContext {
  /** Current zoom on the lens, and whether a 2x chip exists to suggest. */
  zoom: number;
  canZoomTo2x: boolean;
}

export const MATCHED = 'Nice, shoot';

/** Close enough to count as lined up. */
export function isMatched(target: Frame): boolean {
  const dx = target.x + target.size / 2 - 0.5;
  const dy = target.y + target.size / 2 - 0.5;
  return target.size >= 0.88 && Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05;
}

export function hintFor(target: Frame, context: HintContext): string {
  if (isMatched(target)) return MATCHED;

  const dx = target.x + target.size / 2 - 0.5;
  const dy = target.y + target.size / 2 - 0.5;
  const offCenter = Math.max(Math.abs(dx), Math.abs(dy));
  const tooFar = 1 - target.size;

  // Getting closer only works once the target is roughly in the middle.
  const moveFirst = offCenter > 0.05 && offCenter * 2 >= tooFar * 0.6;
  if (moveFirst) {
    if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'Move your phone up' : 'Move your phone down';
    return dx < 0 ? 'Move your phone left' : 'Move your phone right';
  }
  if (tooFar > 0.12) {
    if (target.size <= 0.58 && context.canZoomTo2x && context.zoom < 1.9) return 'Zoom in to 2×';
    return target.size < 0.75 ? 'Step closer' : 'A little closer';
  }
  if (offCenter > 0.05) {
    if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'Move your phone up' : 'Move your phone down';
    return dx < 0 ? 'Move your phone left' : 'Move your phone right';
  }
  return 'Hold it';
}
