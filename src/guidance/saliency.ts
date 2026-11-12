/**
 * "What stands out" map. Pure math on a small frame (about 96 px on the long
 * edge), so it runs in a worker in well under a millisecond per frame.
 *
 * Method: center-surround contrast. For every pixel, compare the average of a
 * small neighbourhood with the average of a large one, in brightness and two
 * color-opponent channels, at two sizes. Things that differ from their
 * surroundings score high. Box averages come from summed-area tables.
 */

export interface SaliencyMap {
  width: number;
  height: number;
  /** 0..1 per pixel. */
  data: Float32Array;
  /** Strongest raw contrast found, in 0..255 units. Low means a flat scene. */
  strength: number;
}

export interface Subject {
  /** Bounding box as fractions of the frame. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Saliency-weighted center, as fractions of the frame. */
  cx: number;
  cy: number;
  /** A plain-words description from simple cues, e.g. "bright spot". */
  label: string;
}

/** Below this raw contrast the scene is treated as having nothing to frame. */
const MIN_STRENGTH = 10;

function summedArea(plane: Float32Array, w: number, h: number): Float64Array {
  const sat = new Float64Array((w + 1) * (h + 1));
  for (let y = 0; y < h; y++) {
    let row = 0;
    for (let x = 0; x < w; x++) {
      row += plane[y * w + x]!;
      sat[(y + 1) * (w + 1) + x + 1] = sat[y * (w + 1) + x + 1]! + row;
    }
  }
  return sat;
}

/** Mean of `plane` over a square of radius r around (x, y), clipped to the image. */
function boxMean(sat: Float64Array, w: number, h: number, x: number, y: number, r: number): number {
  const x0 = Math.max(0, x - r);
  const y0 = Math.max(0, y - r);
  const x1 = Math.min(w, x + r + 1);
  const y1 = Math.min(h, y + r + 1);
  const W = w + 1;
  const sum = sat[y1 * W + x1]! - sat[y0 * W + x1]! - sat[y1 * W + x0]! + sat[y0 * W + x0]!;
  return sum / ((x1 - x0) * (y1 - y0));
}

export function computeSaliency(rgba: Uint8ClampedArray, width: number, height: number): SaliencyMap {
  const n = width * height;
  const light = new Float32Array(n);
  const redGreen = new Float32Array(n);
  const blueYellow = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const r = rgba[i * 4]!;
    const g = rgba[i * 4 + 1]!;
    const b = rgba[i * 4 + 2]!;
    light[i] = (r + g + b) / 3;
    redGreen[i] = r - g;
    blueYellow[i] = b - (r + g) / 2;
  }
  const planes = [summedArea(light, width, height), summedArea(redGreen, width, height), summedArea(blueYellow, width, height)];

  const long = Math.max(width, height);
  const scales: [number, number][] = [
    [Math.max(1, Math.round(long / 48)), Math.max(4, Math.round(long / 10))],
    [Math.max(2, Math.round(long / 24)), Math.max(8, Math.round(long / 5))],
  ];

  const data = new Float32Array(n);
  let max = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let v = 0;
      for (const sat of planes) {
        for (const [small, large] of scales) {
          v += Math.abs(boxMean(sat, width, height, x, y, small) - boxMean(sat, width, height, x, y, large));
        }
      }
      // Gentle preference for the middle: people point the camera at things.
      const dx = (x + 0.5) / width - 0.5;
      const dy = (y + 0.5) / height - 0.5;
      v *= 0.7 + 0.3 * Math.exp(-(dx * dx + dy * dy) / 0.18);
      data[y * width + x] = v;
      if (v > max) max = v;
    }
  }
  const strength = max / (planes.length * scales.length);
  if (max > 0) for (let i = 0; i < n; i++) data[i] = data[i]! / max;
  return { width, height, data, strength };
}

/**
 * The main thing in the frame: the connected blob of high saliency around the
 * strongest point. Returns null when nothing stands out.
 */
export function findSubject(map: SaliencyMap, rgba?: Uint8ClampedArray): Subject | null {
  const { width: w, height: h, data } = map;
  if (map.strength < MIN_STRENGTH) return null;

  let peak = 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    sum += data[i]!;
    if (data[i]! > data[peak]!) peak = i;
  }
  const mean = sum / data.length;
  const threshold = Math.max(0.45, mean + (1 - mean) * 0.35);

  // Flood fill from the peak over pixels above the threshold.
  const seen = new Uint8Array(data.length);
  const stack = [peak];
  seen[peak] = 1;
  let x0 = w, y0 = h, x1 = 0, y1 = 0;
  let mass = 0, mx = 0, my = 0, count = 0;
  let r = 0, g = 0, b = 0;
  while (stack.length) {
    const i = stack.pop()!;
    const x = i % w;
    const y = (i - x) / w;
    const s = data[i]!;
    mass += s;
    mx += s * (x + 0.5);
    my += s * (y + 0.5);
    count++;
    if (rgba) {
      r += rgba[i * 4]!;
      g += rgba[i * 4 + 1]!;
      b += rgba[i * 4 + 2]!;
    }
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    const tryPush = (j: number) => {
      if (!seen[j] && data[j]! >= threshold) {
        seen[j] = 1;
        stack.push(j);
      }
    };
    if (x > 0) tryPush(i - 1);
    if (x < w - 1) tryPush(i + 1);
    if (y > 0) tryPush(i - w);
    if (y < h - 1) tryPush(i + w);
  }

  let label = 'main subject';
  if (rgba) {
    let tr = 0, tg = 0, tb = 0;
    for (let i = 0; i < data.length; i++) {
      tr += rgba[i * 4]!;
      tg += rgba[i * 4 + 1]!;
      tb += rgba[i * 4 + 2]!;
    }
    label = describe([r / count, g / count, b / count], [tr / data.length, tg / data.length, tb / data.length]);
  }

  return {
    x: x0 / w,
    y: y0 / h,
    width: (x1 - x0 + 1) / w,
    height: (y1 - y0 + 1) / h,
    cx: mx / mass / w,
    cy: my / mass / h,
    label,
  };
}

/**
 * Names the subject from what can honestly be measured: its color and how its
 * brightness compares with the rest of the scene. No object recognition here.
 */
export function describe(subject: [number, number, number], scene: [number, number, number]): string {
  const [r, g, b] = subject;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (r + g + b) / 3;
  const sceneLightness = (scene[0] + scene[1] + scene[2]) / 3;
  const saturation = max === 0 ? 0 : (max - min) / max;

  if (saturation > 0.4 && max > 70) {
    let hue = 0;
    const d = max - min;
    if (max === r) hue = ((g - b) / d + 6) % 6;
    else if (max === g) hue = (b - r) / d + 2;
    else hue = (r - g) / d + 4;
    hue *= 60;
    const name =
      hue < 15 || hue >= 345 ? 'red' : hue < 45 ? 'orange' : hue < 70 ? 'yellow' : hue < 165 ? 'green' : hue < 200 ? 'teal' : hue < 260 ? 'blue' : hue < 300 ? 'purple' : 'pink';
    return `pop of ${name}`;
  }
  if (lightness - sceneLightness > 35) return 'bright spot';
  if (sceneLightness - lightness > 35) return 'dark shape';
  return 'main subject';
}
