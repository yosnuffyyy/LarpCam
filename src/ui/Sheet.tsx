import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { usePresence } from '../lib/hooks';
import './sheet.css';

interface SheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ComponentChildren;
}

/**
 * A bottom sheet: slides up over the screen, closes on backdrop tap, Escape,
 * or a downward drag on its handle. Stays mounted while it animates out.
 */
export function Sheet({ open, title, onClose, children }: SheetProps) {
  const { mounted, visible } = usePresence(open);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; dy: number } | null>(null);
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) restoreFocus.current = document.activeElement as HTMLElement | null;
    else restoreFocus.current?.focus?.({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (visible) panel.current?.focus({ preventScroll: true });
  }, [visible]);

  if (!mounted) return null;

  const onPointerDown = (event: PointerEvent) => {
    drag.current = { startY: event.clientY, dy: 0 };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    if (panel.current) panel.current.style.transition = 'none';
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag.current || !panel.current) return;
    drag.current.dy = Math.max(0, event.clientY - drag.current.startY);
    panel.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const onPointerEnd = () => {
    if (!drag.current || !panel.current) return;
    const { dy } = drag.current;
    drag.current = null;
    panel.current.style.transition = '';
    panel.current.style.transform = '';
    if (dy > 80) onClose();
  };

  return (
    <div class={`sheet ${visible ? 'is-open' : ''}`}>
      <div class="sheet__backdrop" onClick={onClose} />
      <div class="sheet__panel" ref={panel} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}>
        <div
          class="sheet__handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        >
          <span />
        </div>
        <div class="sheet__body">{children}</div>
      </div>
    </div>
  );
}

interface SwitchRowProps {
  label: string;
  hint?: string;
  icon?: ComponentChildren;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** A full-width row with a switch. The whole row is the tap target. */
export function SwitchRow({ label, hint, icon, checked, onChange }: SwitchRowProps) {
  return (
    <button class="row" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}>
      {icon && <span class="row__icon">{icon}</span>}
      <span class="row__text">
        <span class="row__label">{label}</span>
        {hint && <span class="row__hint">{hint}</span>}
      </span>
      <span class={`switch ${checked ? 'is-on' : ''}`} aria-hidden="true">
        <span class="switch__knob" />
      </span>
    </button>
  );
}
