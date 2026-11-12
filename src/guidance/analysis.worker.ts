/// <reference lib="webworker" />
import { aimById } from './aims';
import { computeSaliency, findSubject } from './saliency';
import { bestFrame, type Frame } from './scorer';

/**
 * Runs the scan off the main thread so the viewfinder never stutters.
 * In: one small frame. Out: the subject (if any) and the best frame for the aim.
 */

export interface AnalysisRequest {
  id: number;
  rgba: ArrayBuffer;
  width: number;
  height: number;
  aim: string;
  previous: Frame | null;
}

export interface AnalysisResult {
  id: number;
  frame: Frame | null;
  label: string;
}

self.onmessage = (event: MessageEvent<AnalysisRequest>) => {
  const { id, rgba, width, height, aim, previous } = event.data;
  const pixels = new Uint8ClampedArray(rgba);
  const subject = findSubject(computeSaliency(pixels, width, height), pixels);
  const result: AnalysisResult = subject
    ? { id, frame: stripScore(bestFrame(subject, aimById(aim), previous)), label: subject.label }
    : { id, frame: null, label: '' };
  (self as DedicatedWorkerGlobalScope).postMessage(result);
};

function stripScore(frame: Frame & { score?: number }): Frame {
  return { x: frame.x, y: frame.y, size: frame.size };
}
