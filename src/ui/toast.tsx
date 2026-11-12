import { signal } from '@preact/signals';
import './toast.css';

interface ToastState {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

const current = signal<ToastState | null>(null);
let timer = 0;
let nextId = 1;

/** Shows one short message above the controls. A newer message replaces it. */
export function showToast(message: string, options: { action?: ToastState['action']; sticky?: boolean } = {}): void {
  window.clearTimeout(timer);
  current.value = { id: nextId++, message, action: options.action };
  if (!options.sticky) timer = window.setTimeout(() => (current.value = null), 3200);
}

export function Toast() {
  const toast = current.value;
  if (!toast) return null;
  return (
    <div class="toast" role="status" key={toast.id}>
      <span>{toast.message}</span>
      {toast.action && (
        <button
          class="toast__action"
          onClick={() => {
            current.value = null;
            toast.action!.run();
          }}
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
