import { describe as group, expect, it } from 'vitest';
import { AIMS, aimById } from '../src/guidance/aims';
import { MATCHED, hintFor, isMatched } from '../src/guidance/hints';
import { computeSaliency, describe, findSubject, type Subject } from '../src/guidance/saliency';
import { bestFrame, iou, smoothFrame } from '../src/guidance/scorer';

/** A flat grey frame with one coloured rectangle on it. */
function scene(w: number, h: number, box?: { x: number; y: number; w: number; h: number; rgb: [number, number, number] }) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) rgba.set([70, 70, 70, 255], i * 4);
  if (box) {
    for (let y = box.y; y < box.y + box.h; y++) for (let x = box.x; x < box.x + box.w; x++) rgba.set([...box.rgb, 255], (y * w + x) * 4);
  }
  return rgba;
}

group('saliency', () => {
  it('finds a bright object and puts a box around it', () => {
    const rgba = scene(72, 96, { x: 44, y: 20, w: 12, h: 14, rgb: [240, 240, 240] });
    const subject = findSubject(computeSaliency(rgba, 72, 96), rgba)!;
    expect(subject).not.toBeNull();
    expect(subject.cx).toBeGreaterThan(44 / 72);
    expect(subject.cx).toBeLessThan(56 / 72);
    expect(subject.cy).toBeGreaterThan(20 / 96);
    expect(subject.cy).toBeLessThan(34 / 96);
    // The box hugs the object: not the whole frame, not a single pixel.
    expect(subject.width).toBeGreaterThan(0.1);
    expect(subject.width).toBeLessThan(0.45);
    expect(subject.label).toBe('bright spot');
  });

  it('reports nothing for a flat scene', () => {
    const rgba = scene(72, 96);
    expect(findSubject(computeSaliency(rgba, 72, 96), rgba)).toBeNull();
  });

  it('notices color, not only brightness', () => {
    // Same lightness as the background, very different color.
    const rgba = scene(72, 96, { x: 10, y: 60, w: 14, h: 14, rgb: [190, 10, 10] });
    const subject = findSubject(computeSaliency(rgba, 72, 96), rgba)!;
    expect(subject.cx).toBeLessThan(0.4);
    expect(subject.cy).toBeGreaterThan(0.6);
    expect(subject.label).toBe('pop of red');
  });

  it('describes only what it can measure', () => {
    expect(describe([30, 30, 30], [140, 140, 140])).toBe('dark shape');
    expect(describe([120, 120, 125], [118, 120, 120])).toBe('main subject');
    expect(describe([40, 90, 220], [100, 100, 100])).toBe('pop of blue');
  });
});

const subject: Subject = { x: 0.55, y: 0.25, width: 0.14, height: 0.16, cx: 0.62, cy: 0.33, label: 'bright spot' };

group('bestFrame', () => {
  it('always stays inside the view and keeps the whole subject', () => {
    for (const aim of AIMS) {
      const f = bestFrame(subject, aim);
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.size).toBeLessThanOrEqual(1 + 1e-9);
      expect(f.y + f.size).toBeLessThanOrEqual(1 + 1e-9);
      expect(f.x).toBeLessThanOrEqual(subject.x + 1e-9);
      expect(f.y).toBeLessThanOrEqual(subject.y + 1e-9);
      expect(f.x + f.size).toBeGreaterThanOrEqual(subject.x + subject.width - 1e-9);
      expect(f.y + f.size).toBeGreaterThanOrEqual(subject.y + subject.height - 1e-9);
    }
  });

  it('gives each aim its own taste', () => {
    // A subject big enough that no aim runs into the smallest allowed frame.
    const big: Subject = { x: 0.35, y: 0.3, width: 0.3, height: 0.3, cx: 0.5, cy: 0.45, label: '' };
    const size = (id: string) => bestFrame(big, aimById(id)).size;
    // Tight aims frame closer than loose ones.
    expect(size('detail')).toBeLessThan(size('auto'));
    expect(size('food')).toBeLessThan(size('dump'));
    expect(size('auto')).toBeLessThan(size('minimal'));
    expect(size('views')).toBeGreaterThan(0.8);
  });

  it('centers food and puts people high in the frame', () => {
    const food = bestFrame(subject, aimById('food'));
    expect((subject.cx - food.x) / food.size).toBeCloseTo(0.5, 1);
    expect((subject.cy - food.y) / food.size).toBeCloseTo(0.5, 1);
    const people = bestFrame({ ...subject, cy: 0.5, y: 0.42 }, aimById('people'));
    expect((0.5 - people.y) / people.size).toBeLessThan(0.48);
  });

  it('sticks near the previous answer when scores are close', () => {
    const first = bestFrame(subject, aimById('symmetry'));
    const nudged = { ...subject, cx: subject.cx + 0.004, x: subject.x + 0.004 };
    const second = bestFrame(nudged, aimById('symmetry'), first);
    expect(iou(first, second)).toBeGreaterThan(0.85);
  });
});

group('smoothFrame', () => {
  it('ignores tiny changes and eases toward big ones', () => {
    const a = { x: 0.2, y: 0.2, size: 0.5 };
    expect(smoothFrame(a, { x: 0.205, y: 0.2, size: 0.5 })).toBe(a);
    const moved = smoothFrame(a, { x: 0.4, y: 0.2, size: 0.5 });
    expect(moved.x).toBeCloseTo(0.3, 6);
    expect(smoothFrame(null, a)).toBe(a);
  });
});

group('hints', () => {
  const ctx = { zoom: 1, canZoomTo2x: true };
  it('says which way to move, in plain words', () => {
    expect(hintFor({ x: 0.5, y: 0.1, size: 0.45 }, ctx)).toBe('Move your phone right');
    expect(hintFor({ x: 0.05, y: 0.3, size: 0.45 }, ctx)).toBe('Move your phone left');
    expect(hintFor({ x: 0.3, y: 0.0, size: 0.4 }, ctx)).toBe('Move your phone up');
    expect(hintFor({ x: 0.3, y: 0.6, size: 0.4 }, ctx)).toBe('Move your phone down');
  });

  it('asks for zoom or a step closer once the target is centered', () => {
    expect(hintFor({ x: 0.25, y: 0.25, size: 0.5 }, ctx)).toBe('Zoom in to 2×');
    expect(hintFor({ x: 0.25, y: 0.25, size: 0.5 }, { zoom: 2, canZoomTo2x: true })).toBe('Step closer');
    expect(hintFor({ x: 0.25, y: 0.25, size: 0.5 }, { zoom: 1, canZoomTo2x: false })).toBe('Step closer');
    expect(hintFor({ x: 0.1, y: 0.1, size: 0.8 }, ctx)).toBe('A little closer');
  });

  it('says to shoot when the frame fills the view', () => {
    const lined = { x: 0.04, y: 0.05, size: 0.92 };
    expect(isMatched(lined)).toBe(true);
    expect(hintFor(lined, ctx)).toBe(MATCHED);
    expect(isMatched({ x: 0.2, y: 0.05, size: 0.8 })).toBe(false);
  });
});
