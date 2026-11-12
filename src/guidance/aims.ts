import type { Shape } from '../lib/geometry';

/**
 * Aims: the different things the scan can go for. Each one is the same engine
 * with different taste: where the subject should sit, how much of the picture
 * it should fill, and how strongly each rule counts.
 *
 * Positions are fractions of the picture: u across (0 left, 1 right), v down
 * (0 top, 1 bottom). An anchor with only u or only v is a line, not a point.
 */

export interface Anchor {
  u?: number;
  v?: number;
}

export interface Aim {
  id: string;
  name: string;
  /** One short line shown in the picker. */
  blurb: string;
  /** Where the subject's center wants to be. The nearest one wins. */
  anchors: Anchor[];
  /** How much of the picture the subject should span (0..1). */
  fill: number;
  /** Measure `fill` against the subject's height only (standing people). */
  fillByHeight?: boolean;
  /** Picture shape this aim looks best in. Applied when the aim is chosen. */
  shape?: Shape;
  /** How much each rule counts. */
  weights: {
    /** Subject sits on an anchor. */
    place: number;
    /** Subject spans the wanted share of the picture. */
    fill: number;
    /** Prefer keeping more of the scene (less zooming in). */
    keepWide: number;
    /** Prefer the subject dominating the picture (tighter, fewer distractions). */
    tight: number;
  };
}

const THIRDS: Anchor[] = [
  { u: 1 / 3, v: 1 / 3 },
  { u: 2 / 3, v: 1 / 3 },
  { u: 1 / 3, v: 2 / 3 },
  { u: 2 / 3, v: 2 / 3 },
];
const CENTER: Anchor[] = [{ u: 0.5, v: 0.5 }];
const BALANCED = { place: 1, fill: 1, keepWide: 0.15, tight: 0.3 };

export const AIMS: Aim[] = [
  {
    id: 'auto',
    name: 'Auto',
    blurb: 'A balanced shot of whatever stands out',
    anchors: THIRDS,
    fill: 0.5,
    weights: BALANCED,
  },
  {
    id: 'views',
    name: 'Views',
    blurb: 'Wide and calm, for scenery and skylines',
    anchors: [{ v: 1 / 3 }, { v: 2 / 3 }],
    fill: 0.85,
    weights: { place: 0.8, fill: 0.6, keepWide: 0.9, tight: 0.1 },
  },
  {
    id: 'food',
    name: 'Food',
    blurb: 'Close and centered so the plate fills the frame',
    anchors: CENTER,
    fill: 0.78,
    shape: '4:5',
    weights: { place: 1.2, fill: 1.2, keepWide: 0, tight: 0.5 },
  },
  {
    id: 'people',
    name: 'People',
    blurb: 'Eyes high in the frame with room to breathe',
    anchors: [{ u: 0.5, v: 0.38 }, { u: 1 / 3, v: 0.38 }, { u: 2 / 3, v: 0.38 }],
    fill: 0.6,
    weights: { place: 1.2, fill: 0.9, keepWide: 0.1, tight: 0.4 },
  },
  {
    id: 'fit',
    name: 'Fit check',
    blurb: 'Head to toe, centered, tall',
    anchors: CENTER,
    fill: 0.86,
    fillByHeight: true,
    shape: '9:16',
    weights: { place: 1, fill: 1.3, keepWide: 0.1, tight: 0.2 },
  },
  {
    id: 'dump',
    name: 'Dump',
    blurb: 'Loose and off-center, like you just caught it',
    anchors: THIRDS,
    fill: 0.36,
    weights: { place: 0.8, fill: 0.8, keepWide: 0.3, tight: 0.1 },
  },
  {
    id: 'larp',
    name: 'Larp',
    blurb: 'Small subject, big moody space above',
    anchors: [{ u: 1 / 3, v: 0.72 }, { u: 2 / 3, v: 0.72 }],
    fill: 0.28,
    shape: '9:16',
    weights: { place: 1.3, fill: 1.2, keepWide: 0.5, tight: 0 },
  },
  {
    id: 'detail',
    name: 'Detail',
    blurb: 'Right up close on texture and small things',
    anchors: CENTER,
    fill: 0.92,
    shape: '1:1',
    weights: { place: 1, fill: 1.4, keepWide: 0, tight: 0.6 },
  },
  {
    id: 'symmetry',
    name: 'Symmetry',
    blurb: 'Dead center, for doors, halls and reflections',
    anchors: [{ u: 0.5 }],
    fill: 0.6,
    weights: { place: 1.6, fill: 0.7, keepWide: 0.3, tight: 0.2 },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    blurb: 'One small thing in a lot of empty space',
    anchors: THIRDS,
    fill: 0.16,
    weights: { place: 1.1, fill: 1.3, keepWide: 0.8, tight: 0 },
  },
];

export const DEFAULT_AIM = 'auto';

export function aimById(id: string): Aim {
  return AIMS.find((a) => a.id === id) ?? AIMS[0]!;
}
