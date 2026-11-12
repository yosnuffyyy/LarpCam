import { useEffect, useState } from 'preact/hooks';

/**
 * Keeps something mounted while it animates out.
 * `mounted` says whether to render at all; `visible` flips one frame later so
 * CSS transitions have a starting position to animate from.
 */
export function usePresence(open: boolean, exitMs = 380): { mounted: boolean; visible: boolean } {
  const [mounted, setMounted] = useState(open);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (open) {
      setMounted(true);
      let second = 0;
      const first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => setVisible(true));
      });
      return () => {
        cancelAnimationFrame(first);
        cancelAnimationFrame(second);
      };
    }
    setVisible(false);
    const timer = window.setTimeout(() => setMounted(false), exitMs);
    return () => window.clearTimeout(timer);
  }, [open, exitMs]);

  return { mounted, visible };
}
