import { describe, expect, it } from 'vitest';
import { buildLensOptions, classifyDevice, formatZoom } from '../src/camera/lenses';

const iphonePro = [
  { deviceId: 'f', label: 'Front Camera' },
  { deviceId: 'w', label: 'Back Camera' },
  { deviceId: 'u', label: 'Back Ultra Wide Camera' },
  { deviceId: 't', label: 'Back Telephoto Camera' },
  { deviceId: 'm', label: 'Back Triple Camera' },
];

describe('classifyDevice', () => {
  it('recognises the labels iPhones use', () => {
    expect(classifyDevice('Front Camera')).toBe('front');
    expect(classifyDevice('Back Camera')).toBe('wide');
    expect(classifyDevice('Back Ultra Wide Camera')).toBe('ultrawide');
    expect(classifyDevice('Back Telephoto Camera')).toBe('tele');
    expect(classifyDevice('Back Triple Camera')).toBe('multi');
    expect(classifyDevice('Back Dual Wide Camera')).toBe('multi');
  });

  it('does not guess at labels it cannot read', () => {
    expect(classifyDevice('')).toBe('unknown');
    expect(classifyDevice('Rückkamera')).toBe('unknown');
  });
});

describe('buildLensOptions', () => {
  it('shows only 1x and a cropped 2x when nothing else is known', () => {
    const ids = buildLensOptions({ facing: 'environment', devices: [], hardwareZoom: null }).map((o) => o.id);
    expect(ids).toEqual(['wide', 'wide-2x']);
  });

  it('adds ultra-wide and telephoto only when those cameras exist', () => {
    const options = buildLensOptions({ facing: 'environment', devices: iphonePro, hardwareZoom: null });
    expect(options.map((o) => o.label)).toEqual(['0.5×', '1×', '2×', 'Tele']);
    expect(options[0]!.deviceId).toBe('u');
    expect(options[3]!.deviceId).toBe('t');
  });

  it('hides 2x when the camera reports it cannot zoom that far', () => {
    const options = buildLensOptions({ facing: 'environment', devices: [], hardwareZoom: { min: 1, max: 1.5 } });
    expect(options.map((o) => o.id)).toEqual(['wide']);
  });

  it('never offers back lenses for the selfie camera', () => {
    const options = buildLensOptions({ facing: 'user', devices: iphonePro, hardwareZoom: null });
    expect(options.map((o) => o.id)).toEqual(['wide', 'wide-2x']);
  });
});

describe('formatZoom', () => {
  it('drops a trailing .0', () => {
    expect(formatZoom(1)).toBe('1×');
    expect(formatZoom(2.04)).toBe('2×');
    expect(formatZoom(1.44)).toBe('1.4×');
  });
});
