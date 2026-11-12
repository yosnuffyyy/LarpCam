import { signal } from '@preact/signals';

/** Chrome and Android offer an install prompt we can trigger from a button. */
interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const installPrompt = signal<InstallPromptEvent | null>(null);

export function watchInstallPrompt(): void {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installPrompt.value = event as InstallPromptEvent;
  });
  window.addEventListener('appinstalled', () => {
    installPrompt.value = null;
  });
}

export async function promptInstall(): Promise<boolean> {
  const event = installPrompt.value;
  if (!event) return false;
  await event.prompt();
  const choice = await event.userChoice;
  installPrompt.value = null;
  return choice.outcome === 'accepted';
}
