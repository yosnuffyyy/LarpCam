import { AIMS, type Aim } from '../guidance/aims';
import { Sheet } from './Sheet';
import './aim.css';

interface AimSheetProps {
  open: boolean;
  current: string;
  onPick: (aim: Aim) => void;
  onClose: () => void;
}

/** Pick what the scan should go for. Each card draws how that aim frames a subject. */
export function AimSheet({ open, current, onPick, onClose }: AimSheetProps) {
  return (
    <Sheet open={open} title="Choose an aim" onClose={onClose}>
      <h2 class="serif sheet__title">What are you shooting?</h2>
      <div class="aims" role="radiogroup" aria-label="Aim">
        {AIMS.map((aim) => (
          <button key={aim.id} class="aim" role="radio" aria-checked={aim.id === current} onClick={() => onPick(aim)}>
            <AimDiagram aim={aim} />
            <span class="aim__text">
              <span class="aim__name">{aim.name}</span>
              <span class="aim__blurb">{aim.blurb}</span>
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

/** A tiny picture of the aim: the frame, and where and how big the subject sits in it. */
function AimDiagram({ aim }: { aim: Aim }) {
  const anchor = aim.anchors[0]!;
  const u = anchor.u ?? 0.5;
  const v = anchor.v ?? 0.5;
  const w = 30;
  const h = 40;
  const r = Math.max(2, (aim.fill * w) / 2);
  return (
    <svg class="aim__diagram" width="38" height="48" viewBox="-4 -4 38 48" aria-hidden="true" focusable="false">
      <rect x="0" y="0" width={w} height={h} rx="5" fill="none" stroke="currentColor" stroke-width="1.6" />
      <circle cx={Math.min(w - r, Math.max(r, u * w))} cy={Math.min(h - r, Math.max(r, v * h))} r={Math.min(r, w / 2 - 1)} class="aim__dot" />
    </svg>
  );
}
