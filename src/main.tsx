import { render } from 'preact';
import '@fontsource/instrument-serif/latin-400.css';
import './design/tokens.css';
import './design/base.css';
import { App } from './app';
import { watchInstallPrompt } from './lib/install';
import { registerServiceWorker } from './lib/updates';

watchInstallPrompt();
registerServiceWorker();

// iOS only honours :active styles once something listens for touches.
document.addEventListener('touchstart', () => undefined, { passive: true });
// Stop Safari's page pinch-zoom: pinching zooms the camera instead.
document.addEventListener('gesturestart', (event) => event.preventDefault());
document.addEventListener('contextmenu', (event) => {
  if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
});

render(<App />, document.getElementById('app')!);
