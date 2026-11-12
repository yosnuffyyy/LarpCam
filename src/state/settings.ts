import { effect, signal } from '@preact/signals';
import { SHAPES, type Shape } from '../lib/geometry';
import { storageNamespace } from '../lib/platform';

/** Everything the app remembers between launches. Deliberately tiny. */
export interface Settings {
  shape: Shape;
  /** Which aim the scan uses (see guidance/aims.ts). */
  aim: string;
  grid: boolean;
  /** First-run screens have been seen. */
  welcomed: boolean;
  /** The user chose to keep using the browser tab instead of installing. */
  skippedInstall: boolean;
}

const DEFAULTS: Settings = {
  shape: '3:4',
  aim: 'auto',
  grid: false,
  welcomed: false,
  skippedInstall: false,
};

const KEY = `${storageNamespace()}:settings`;

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    const merged = { ...DEFAULTS, ...parsed };
    if (!SHAPES.includes(merged.shape)) merged.shape = DEFAULTS.shape;
    return merged;
  } catch {
    // Private mode or a corrupted value: fall back to defaults, never crash.
    return { ...DEFAULTS };
  }
}

export const settings = signal<Settings>(load());

export function updateSettings(patch: Partial<Settings>): void {
  settings.value = { ...settings.value, ...patch };
}

effect(() => {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings.value));
  } catch {
    /* storage unavailable; settings just won't persist */
  }
});
