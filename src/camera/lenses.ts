/**
 * Works out which lens chips to show. Pure logic: the browser facts come in as
 * plain data, so this can be tested without a camera.
 *
 * Rule: only show a lens the device really has.
 *  - "1x" is always there.
 *  - "0.5x" needs a separate ultra-wide camera the browser lets us open.
 *  - "2x" uses the camera's own zoom when the browser exposes it, which keeps
 *    full sharpness; otherwise it is a crop of the 1x picture.
 *  - A telephoto camera gets its own chip. The web can't tell us whether it is
 *    2x, 3x or 5x, so the chip says "Tele" rather than guess a number.
 */

export type LensKind = 'ultrawide' | 'wide' | 'tele';

export interface CameraDevice {
  deviceId: string;
  label: string;
}

export interface ZoomRange {
  min: number;
  max: number;
}

export interface LensOption {
  id: string;
  label: string;
  /** Spoken name for screen readers. */
  name: string;
  /** Open this camera. Undefined means "the default back camera". */
  deviceId?: string;
  /** Zoom factor to apply on that camera. */
  zoom: number;
  /** Shown on the chip when selected, e.g. 1 -> "1×". */
  kind: LensKind;
}

/** How far the fallback crop zoom may go before the picture gets too soft. */
export const MAX_DIGITAL_ZOOM = 3;

/**
 * Guess a back camera's lens from its label. Browsers only give us the label
 * (and only in the phone's language), so anything unrecognised is ignored.
 */
export function classifyDevice(label: string): LensKind | 'front' | 'multi' | 'unknown' {
  const l = label.toLowerCase();
  if (/front|user|facetime|selfie/.test(l)) return 'front';
  // Virtual cameras that switch lenses by themselves ("Back Triple Camera").
  if (/\b(dual|triple)\b/.test(l)) return 'multi';
  if (/ultra[\s-]?wide/.test(l)) return 'ultrawide';
  if (/tele(photo)?/.test(l)) return 'tele';
  if (/back|rear|environment|wide/.test(l)) return 'wide';
  return 'unknown';
}

export interface LensInput {
  facing: 'environment' | 'user';
  devices: CameraDevice[];
  /** Zoom the current camera track supports natively, if the browser says. */
  hardwareZoom: ZoomRange | null;
}

export function buildLensOptions(input: LensInput): LensOption[] {
  const options: LensOption[] = [];
  const back = input.facing === 'environment';

  if (back) {
    const ultra = input.devices.find((d) => classifyDevice(d.label) === 'ultrawide');
    if (ultra) {
      options.push({ id: 'ultrawide', label: '0.5×', name: 'Wide view', deviceId: ultra.deviceId, zoom: 1, kind: 'ultrawide' });
    }
  }

  options.push({ id: 'wide', label: '1×', name: 'Normal view', zoom: 1, kind: 'wide' });

  const maxZoom = input.hardwareZoom ? input.hardwareZoom.max : MAX_DIGITAL_ZOOM;
  if (maxZoom >= 2) {
    options.push({ id: 'wide-2x', label: '2×', name: 'Closer view', zoom: 2, kind: 'wide' });
  }

  if (back) {
    const tele = input.devices.find((d) => classifyDevice(d.label) === 'tele');
    if (tele) {
      options.push({ id: 'tele', label: 'Tele', name: 'Far view', deviceId: tele.deviceId, zoom: 1, kind: 'tele' });
    }
  }

  return options;
}

/** Text for a zoom level between chips, e.g. 1.4 -> "1.4×". */
export function formatZoom(zoom: number): string {
  const rounded = Math.round(zoom * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}×`;
}
