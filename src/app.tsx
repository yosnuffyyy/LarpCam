import { useCallback, useEffect, useState } from 'preact/hooks';
import { camera } from './camera/CameraService';
import { settings } from './state/settings';
import { CameraScreen } from './ui/CameraScreen';
import { Viewer } from './ui/Viewer';
import { Welcome } from './ui/Welcome';
import { Toast } from './ui/toast';
import './ui/app.css';

/** How long the camera keeps running behind the viewer before it rests. */
const REST_AFTER_MS = 20_000;

export function App() {
  const [viewerOpen, setViewerOpen] = useState(false);
  const [resting, setResting] = useState(false);
  const welcomed = settings.value.welcomed;

  // A quick look at a photo should not restart the camera, but a long one
  // should not keep it (and the battery) running either.
  useEffect(() => {
    if (!viewerOpen) {
      setResting(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setResting(true);
      camera.stop();
    }, REST_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [viewerOpen]);

  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const openViewer = useCallback(() => setViewerOpen(true), []);

  return (
    <div class="column" data-surface="dark">
      <CameraScreen active={welcomed && !resting} onOpenViewer={openViewer} />
      <Viewer open={viewerOpen} onClose={closeViewer} />
      <Welcome />
      <Toast />
      <div class="upright" role="status">
        <p class="serif">Turn your phone upright</p>
      </div>
    </div>
  );
}
