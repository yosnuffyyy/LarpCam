import { fitWithin, normalizeRect, visibleSourceRect, type Rect } from '../lib/geometry';

/**
 * Takes the picture: copies the current video frame, then encodes it.
 *
 * The copy (drawImage) is the only part that has to happen right at the tap and
 * it is a fast GPU blit. JPEG encoding is asynchronous in the browser, so the
 * shutter animation keeps running smoothly while it happens.
 */

export interface Capture {
  /** Untouched full frame. */
  original: Blob;
  /** Small picture of just the framed part, for the library. */
  thumb: Blob;
  width: number;
  height: number;
  /** The framed part, as fractions of the full frame. */
  crop: Rect;
}

export interface GrabbedFrame {
  /** A small copy of the framed picture, ready to show or animate right away. */
  preview: HTMLCanvasElement;
  /** Turns the grabbed frame into files. Call once. */
  encode: () => Promise<Capture>;
}

export const THUMB_EDGE = 480;
/** The flying preview is on screen for under half a second; it can be rough. */
const PREVIEW_EDGE = 240;
const ORIGINAL_QUALITY = 0.92;
const THUMB_QUALITY = 0.8;

function encodeCanvas(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode photo'))), 'image/jpeg', quality);
  });
}

function canvasOf(width: number, height: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('Could not read the camera image');
  ctx.imageSmoothingQuality = 'high';
  return [canvas, ctx];
}

/** Lets the browser paint a frame before we carry on with slower work. */
function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

/**
 * Copies what the viewfinder shows at this instant.
 * `ratio` is the picture shape (width / height); `digitalZoom` is any zoom the
 * page is applying itself by cropping.
 *
 * Only two things happen at the tap: the full frame is copied (it has to be,
 * the video moves on, and only this thread can read the video) and a small
 * rough preview is drawn from that copy for the animation. The careful
 * downscale and both JPEG encodes wait until after the next paint.
 */
export function grabFrame(video: HTMLVideoElement, ratio: number, digitalZoom: number): GrabbedFrame {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (!width || !height) throw new Error('Camera is not ready');

  const [full, ctx] = canvasOf(width, height);
  ctx.drawImage(video, 0, 0, width, height);

  const cropPx = visibleSourceRect(width, height, ratio, digitalZoom);
  const size = fitWithin(cropPx.width, cropPx.height, THUMB_EDGE);
  const previewSize = fitWithin(cropPx.width, cropPx.height, PREVIEW_EDGE);
  const [preview, pctx] = canvasOf(previewSize.width, previewSize.height);
  pctx.imageSmoothingQuality = 'low';
  // From the copy, not the video: reading the video a second time is slow.
  pctx.drawImage(full, cropPx.x, cropPx.y, cropPx.width, cropPx.height, 0, 0, previewSize.width, previewSize.height);

  return {
    preview,
    async encode() {
      await nextFrame();
      const [small, sctx] = canvasOf(size.width, size.height);
      sctx.drawImage(full, cropPx.x, cropPx.y, cropPx.width, cropPx.height, 0, 0, size.width, size.height);
      const [original, thumb] = await Promise.all([
        encodeCanvas(full, ORIGINAL_QUALITY),
        encodeCanvas(small, THUMB_QUALITY),
      ]);
      // Free the big canvas's memory straight away (matters on phones).
      full.width = full.height = 0;
      small.width = small.height = 0;
      return { original, thumb, width, height, crop: normalizeRect(cropPx, width, height) };
    },
  };
}

/**
 * The framed photo as a file to share or save: the capture cut to its crop.
 * When the crop is the whole picture the original bytes are used as they are.
 */
export async function renderFramed(original: Blob, crop: Rect): Promise<Blob> {
  const whole = crop.x <= 0.0005 && crop.y <= 0.0005 && crop.width >= 0.999 && crop.height >= 0.999;
  if (whole) return original;

  const bitmap = await createImageBitmap(original);
  try {
    const sx = Math.round(crop.x * bitmap.width);
    const sy = Math.round(crop.y * bitmap.height);
    const sw = Math.min(bitmap.width - sx, Math.round(crop.width * bitmap.width));
    const sh = Math.min(bitmap.height - sy, Math.round(crop.height * bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Could not prepare the photo');
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    const blob = await encodeCanvas(canvas, ORIGINAL_QUALITY);
    canvas.width = 0;
    canvas.height = 0;
    return blob;
  } finally {
    bitmap.close();
  }
}
