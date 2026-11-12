import { installPrompt, promptInstall } from '../lib/install';
import { isIOS } from '../lib/platform';
import { IconAddHome, IconShare } from './icons';
import './install.css';

/** True when we know how this device adds apps to its Home Screen. */
export function canShowInstallSteps(): boolean {
  return isIOS() || installPrompt.value !== null;
}

/**
 * How to put LarpCam on the Home Screen. iPhones have no install button a web
 * page can press, so there we show the three taps; elsewhere, a real button.
 */
export function InstallSteps({ compact = false }: { compact?: boolean }) {
  if (installPrompt.value) {
    return (
      <button class="btn btn--fill btn--wide" onClick={() => void promptInstall()}>
        <IconAddHome size={20} />
        Install LarpCam
      </button>
    );
  }

  return (
    <ol class={`steps ${compact ? 'steps--compact' : ''}`}>
      <li>
        <span class="steps__num">1</span>
        <span class="steps__text">
          Tap <strong>Share</strong>
        </span>
        <span class="steps__icon">
          <IconShare size={20} />
        </span>
      </li>
      <li>
        <span class="steps__num">2</span>
        <span class="steps__text">
          Choose <strong>Add to Home Screen</strong>
        </span>
        <span class="steps__icon">
          <IconAddHome size={20} />
        </span>
      </li>
      <li>
        <span class="steps__num">3</span>
        <span class="steps__text">
          Open <strong>LarpCam</strong> from your Home Screen
        </span>
      </li>
    </ol>
  );
}
