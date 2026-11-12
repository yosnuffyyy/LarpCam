import { showToast } from '../ui/toast';

/**
 * Registers the service worker (offline support) and handles new versions:
 *  - A version that finished downloading last time is applied at launch,
 *    before the user has started doing anything.
 *  - A version that arrives mid-session shows a quiet "Refresh" message
 *    instead of reloading under the user's thumb.
 */
const RELOAD_FLAG = 'larpcam:reloaded-for-update';

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    location.reload();
  });
  const activate = (worker: ServiceWorker) => {
    refreshing = false;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };

  window.addEventListener('load', async () => {
    try {
      const hadController = Boolean(navigator.serviceWorker.controller);
      // Until a worker controls the page, taking control is not an update.
      refreshing = !hadController;
      const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });

      if (registration.waiting && hadController) {
        // Guard against a reload loop if activation somehow fails.
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          activate(registration.waiting);
          return;
        }
      }
      sessionStorage.removeItem(RELOAD_FLAG);

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showToast('A new version is ready', {
              sticky: true,
              action: { label: 'Refresh', run: () => activate(worker) },
            });
          }
        });
      });

      // Installed apps can stay open for days: look for updates when they come back.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') void registration.update().catch(() => undefined);
      });
    } catch {
      /* No service worker (private mode, old browser): the app still works online. */
    }
  });
}
