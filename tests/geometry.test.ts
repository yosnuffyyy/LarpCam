import { describe, expect, it } from 'vitest';
import { SHAPE_RATIO, fitWithin, layoutFinder, nextShape, normalizeRect, visibleSourceRect } from '../src/lib/geometry';

describe('layoutFinder', () => {
  // iPhone 14-ish, installed: 390 x 844, 47 px status bar, 250 px of controls
  // of which the bottom 130 px is the shutter row.
  const phone = { width: 390, height: 844, top: 47, controls: 250, shutterRow: 130 };

  it('centers a 3:4 picture between the status bar and the controls', () => {
    const r = layoutFinder({ ...phone, ratio: SHAPE_RATIO['3:4'] });
    expect(r.width).toBe(390);
    expect(r.height).toBe(520);
    expect(r.underControls).toBe(false);
    expect(r.y).toBeGreaterThanOrEqual(47);
    expect(r.y + r.height).toBeLessThanOrEqual(844 - 250);
  });

  it('centers a square in the free space', () => {
    const r = layoutFinder({ ...phone, ratio: 1 });
    const gapAbove = r.y - 47;
    const gapBelow = 844 - 250 - (r.y + r.height);
    expect(Math.abs(gapAbove - gapBelow)).toBeLessThanOrEqual(1);
  });

  it('lets a tall picture slide under the chips but never under the shutter', () => {
    const r = layoutFinder({ ...phone, ratio: SHAPE_RATIO['9:16'] });
    expect(r.underControls).toBe(true);
    expect(r.y).toBe(47);
    expect(r.y + r.height).toBeLessThanOrEqual(844 - 130);
    // 9:16 does not fit at full width above the shutter row, so it shrinks.
    expect(r.width).toBeLessThan(390);
    expect(r.x).toBeCloseTo((390 - r.width) / 2, 6);
  });

  it('keeps full width when sliding under the chips is enough', () => {
    // Safari with its bars showing: 3:4 no longer fits above the controls.
    const r = layoutFinder({ width: 390, height: 664, top: 0, controls: 214, shutterRow: 100, ratio: SHAPE_RATIO['3:4'] });
    expect(r.underControls).toBe(true);
    expect(r.width).toBe(390);
    expect(r.y + r.height).toBeLessThanOrEqual(664 - 100);
  });

  it('keeps the requested shape and stays above the shutter in every case', () => {
    for (const ratio of Object.values(SHAPE_RATIO)) {
      for (const height of [548, 664, 812, 844, 932]) {
        const r = layoutFinder({ width: 375, height, top: 20, controls: 240, shutterRow: 120, ratio });
        expect(r.width / r.height).toBeCloseTo(ratio, 6);
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.y).toBeGreaterThanOrEqual(20);
        expect(r.y + r.height).toBeLessThanOrEqual(height - 120 + 0.001);
      }
    }
  });
});

describe('visibleSourceRect', () => {
  it('uses the whole image when the shapes match', () => {
    expect(visibleSourceRect(1440, 1920, 3 / 4)).toEqual({ x: 0, y: 0, width: 1440, height: 1920 });
  });

  it('cuts the sides off a wider image', () => {
    // Landscape webcam, upright 3:4 picture.
    const r = visibleSourceRect(1920, 1080, 3 / 4);
    expect(r).toEqual({ x: 555, y: 0, width: 810, height: 1080 });
  });

  it('cuts top and bottom off a taller image', () => {
    const r = visibleSourceRect(1440, 1920, 1);
    expect(r).toEqual({ x: 0, y: 240, width: 1440, height: 1440 });
  });

  it('zooms about the center', () => {
    const r = visibleSourceRect(1440, 1920, 3 / 4, 2);
    expect(r).toEqual({ x: 360, y: 480, width: 720, height: 960 });
  });

  it('never zooms out past the image or returns an empty rectangle', () => {
    expect(visibleSourceRect(1440, 1920, 3 / 4, 0.5)).toEqual({ x: 0, y: 0, width: 1440, height: 1920 });
    const tiny = visibleSourceRect(8, 8, 1, 100);
    expect(tiny.width).toBeGreaterThanOrEqual(2);
    expect(tiny.height).toBeGreaterThanOrEqual(2);
  });

  it('keeps the requested shape to within a pixel', () => {
    for (const ratio of Object.values(SHAPE_RATIO)) {
      for (const zoom of [1, 1.3, 2, 3]) {
        const r = visibleSourceRect(1440, 1920, ratio, zoom);
        expect(Math.abs(r.width - r.height * ratio)).toBeLessThanOrEqual(1);
        expect(r.x + r.width).toBeLessThanOrEqual(1440);
        expect(r.y + r.height).toBeLessThanOrEqual(1920);
      }
    }
  });
});

describe('helpers', () => {
  it('cycles through shapes and wraps around', () => {
    expect(nextShape('3:4')).toBe('4:5');
    expect(nextShape('9:16')).toBe('3:4');
  });

  it('normalizes a rectangle to fractions of the image', () => {
    expect(normalizeRect({ x: 360, y: 480, width: 720, height: 960 }, 1440, 1920)).toEqual({
      x: 0.25,
      y: 0.25,
      width: 0.5,
      height: 0.5,
    });
  });

  it('fits a size within a long edge without enlarging', () => {
    expect(fitWithin(1440, 1920, 480)).toEqual({ width: 360, height: 480 });
    expect(fitWithin(300, 200, 480)).toEqual({ width: 300, height: 200 });
  });
});
