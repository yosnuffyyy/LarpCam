import { useEffect, useState } from 'preact/hooks';
import { camera } from '../camera/CameraService';
import { isStandalone } from '../lib/platform';
import { usePresence } from '../lib/hooks';
import { settings, updateSettings } from '../state/settings';
import { InstallSteps, canShowInstallSteps } from './InstallSteps';
import { IconPrivate } from './icons';
import './welcome.css';

type Step = 'hello' | 'install' | 'camera';

/**
 * First run: at most three quick screens.
 *   1. Hello, with the privacy line.
 *   2. Add to Home Screen (only in a browser tab on a device that can).
 *   3. Turn on the camera, asked at the moment it is needed.
 * The camera screen is already mounted underneath, so when permission is
 * granted this simply lifts away to a live picture.
 */
export function Welcome() {
  const open = !settings.value.welcomed;
  const { mounted, visible } = usePresence(open, 560);
  const [step, setStep] = useState<Step>('hello');
  const status = camera.status.value;

  // Decided once: does this device get the Home Screen step?
  const [offerInstall] = useState(() => !isStandalone() && !settings.value.skippedInstall);

  useEffect(() => {
    if (open && step === 'camera' && status === 'live') updateSettings({ welcomed: true });
  }, [open, step, status]);

  if (!mounted) return null;

  const afterHello = () => setStep(offerInstall && canShowInstallSteps() ? 'install' : 'camera');
  const total = offerInstall && canShowInstallSteps() ? 3 : 2;
  const index = step === 'hello' ? 1 : step === 'camera' ? total : 2;
  const failed = status === 'denied' || status === 'missing' || status === 'unsupported' || status === 'busy' || status === 'error';

  return (
    <section class={`welcome ${visible ? 'is-open' : ''}`} aria-label="Welcome to LarpCam">
      <div class="welcome__art" aria-hidden="true">
        <Mark step={step} />
      </div>

      <div class="welcome__panel" key={step}>
        {step === 'hello' && (
          <>
            <h1 class="serif welcome__title">LarpCam</h1>
            <p class="welcome__lead">A quiet camera for better photos.</p>
            <p class="welcome__privacy">
              <IconPrivate size={18} />
              <span>Everything stays on your phone. No account, no cloud, no tracking.</span>
            </p>
            <button class="btn btn--primary btn--wide" onClick={afterHello}>
              Get started
            </button>
          </>
        )}

        {step === 'install' && (
          <>
            <h1 class="serif welcome__title welcome__title--sm">Put it on your Home Screen</h1>
            <p class="welcome__lead">It opens full screen, works with no signal, and holds on to your photos.</p>
            <InstallSteps />
            <button
              class="btn btn--quiet btn--wide"
              onClick={() => {
                updateSettings({ skippedInstall: true });
                setStep('camera');
              }}
            >
              Not now, try it here
            </button>
          </>
        )}

        {step === 'camera' && (
          <>
            <h1 class="serif welcome__title welcome__title--sm">Turn on the camera</h1>
            <p class="welcome__lead">
              LarpCam needs it to take photos. Nothing it sees ever leaves your phone.
            </p>
            {failed && (
              <p class="welcome__error" role="alert">
                {status === 'denied' && 'The camera is still off. Tap the button and choose Allow.'}
                {status === 'missing' && 'No camera was found on this device.'}
                {status === 'unsupported' && 'This browser can’t use the camera. Open the same link in Safari.'}
                {status === 'busy' && 'Another app is using the camera. Close it and try again.'}
                {status === 'error' && 'The camera didn’t start. Try again.'}
              </p>
            )}
            <button
              class="btn btn--primary btn--wide"
              disabled={status === 'starting'}
              onClick={() => void camera.start()}
            >
              {status === 'starting' ? 'One moment…' : failed ? 'Try again' : 'Turn on camera'}
            </button>
          </>
        )}

        <div class="welcome__dots" role="img" aria-label={`Step ${index} of ${total}`}>
          {Array.from({ length: total }, (_, i) => (
            <span key={i} class={i + 1 === index ? 'is-on' : ''} />
          ))}
        </div>
      </div>
    </section>
  );
}

/**
 * The brand mark, drawn live: a yellow frame that finds a small subject.
 * It shifts a little on each step so the screens feel connected.
 */
function Mark({ step }: { step: Step }) {
  return (
    <div class={`mark mark--${step}`}>
      <span class="mark__dot" />
      <span class="mark__frame" />
    </div>
  );
}
