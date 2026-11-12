import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { renderFramed } from '../camera/capture';
import { usePresence } from '../lib/hooks';
import { library, type Photo } from '../library/LibraryStore';
import { Sheet } from './Sheet';
import { IconBack, IconShare, IconTrash } from './icons';
import { showToast } from './toast';
import './viewer.css';

interface ViewerProps {
  open: boolean;
  onClose: () => void;
}

/**
 * Your photos, newest first, one per page. Swipe sideways to move between
 * them. All actions sit along the bottom edge.
 */
export function Viewer({ open, onClose }: ViewerProps) {
  const { mounted, visible } = usePresence(open, 460);
  const photos = library.photos.value;
  const pager = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [confirming, setConfirming] = useState(false);

  const current: Photo | undefined = photos[Math.min(index, photos.length - 1)];
  const shareFile = useShareFile(open ? current : undefined);

  // Always open on the newest photo.
  useEffect(() => {
    if (!open) return;
    setIndex(0);
    setConfirming(false);
    pager.current?.scrollTo({ left: 0 });
  }, [open]);

  // Nothing left to show: go back to the camera.
  useEffect(() => {
    if (open && photos.length === 0) onClose();
  }, [open, photos.length, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !confirming) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirming, onClose]);

  if (!mounted) return null;

  const onScroll = () => {
    const el = pager.current;
    if (!el || !el.clientWidth) return;
    const next = Math.round(el.scrollLeft / el.clientWidth);
    if (next !== index) setIndex(next);
  };

  const share = async () => {
    if (!current) return;
    try {
      const file = await shareFile;
      if (!file) throw new Error('missing');
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
      } else {
        // No share sheet here (most desktops): download the file instead.
        const url = URL.createObjectURL(file);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
      }
    } catch (error) {
      // Closing the share sheet without choosing is not an error.
      if ((error as Error)?.name === 'AbortError') return;
      showToast('Couldn’t share that photo. Try again.');
    }
  };

  const remove = async () => {
    if (!current) return;
    setConfirming(false);
    try {
      await library.remove(current.id);
    } catch {
      showToast('Couldn’t delete that photo. Try again.');
    }
  };

  return (
    <section
      class={`viewer ${visible ? 'is-open' : ''}`}
      data-surface="paper"
      role="dialog"
      aria-modal="true"
      aria-label="Your photos"
    >
      <header class="viewer__head">
        {current && (
          <>
            <h2 class="serif viewer__title">{formatDay(current.createdAt)}</h2>
            <p class="viewer__meta">
              {formatTime(current.createdAt)}
              <span aria-hidden="true"> · </span>
              {current.lens}
              {photos.length > 1 && (
                <>
                  <span aria-hidden="true"> · </span>
                  {Math.min(index, photos.length - 1) + 1} of {photos.length}
                </>
              )}
            </p>
          </>
        )}
        {!library.persistent.value && (
          <p class="viewer__warning">This browser isn’t keeping photos. Save the ones you want before you close it.</p>
        )}
      </header>

      <div class="viewer__pager" ref={pager} onScroll={onScroll}>
        {photos.map((photo, i) => (
          <div class="viewer__page" key={photo.id} aria-hidden={i !== index}>
            <Framed photo={photo} sharp={Math.abs(i - index) <= 1} />
          </div>
        ))}
      </div>

      <footer class="viewer__bar">
        <button class="icon-btn icon-btn--lg" onClick={onClose} aria-label="Back to camera">
          <IconBack />
        </button>
        <button class="btn btn--primary viewer__share" onClick={share} disabled={!current}>
          <IconShare size={20} />
          Save or share
        </button>
        <button
          class="icon-btn icon-btn--lg"
          onClick={() => setConfirming(true)}
          disabled={!current}
          aria-label="Delete this photo"
        >
          <IconTrash />
        </button>
      </footer>

      <Sheet open={confirming} title="Delete this photo?" onClose={() => setConfirming(false)}>
        <h2 class="serif sheet__title">Delete this photo?</h2>
        <p class="viewer__confirm">It will be gone for good.</p>
        <div class="viewer__confirm-actions">
          <button class="btn btn--danger btn--wide" onClick={remove}>
            Delete
          </button>
          <button class="btn btn--fill btn--wide" onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </div>
      </Sheet>
    </section>
  );
}

/**
 * One photo, shown as it was framed. The small thumbnail appears instantly;
 * the full-size original fades in over it once it has loaded. The original is
 * never altered: the crop is applied with CSS.
 */
function Framed({ photo, sharp }: { photo: Photo; sharp: boolean }) {
  const [fullUrl, setFullUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!sharp) return;
    let url: string | null = null;
    let cancelled = false;
    void library.original(photo.id).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setFullUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
      setFullUrl(null);
      setLoaded(false);
    };
  }, [photo.id, sharp]);

  const { crop } = photo;
  const ratio = (crop.width * photo.width) / (crop.height * photo.height);
  const fullStyle = {
    width: `${100 / crop.width}%`,
    height: `${100 / crop.height}%`,
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
  };

  return (
    <div class="framed" style={{ '--ratio': String(ratio) }}>
      <img class="framed__thumb" src={photo.thumbUrl} alt={`Photo taken ${formatDay(photo.createdAt)}`} draggable={false} />
      {fullUrl && (
        <img
          class={`framed__full ${loaded ? 'is-loaded' : ''}`}
          src={fullUrl}
          style={fullStyle}
          alt=""
          draggable={false}
          onLoad={() => setLoaded(true)}
        />
      )}
    </div>
  );
}

/**
 * Gets the file ready as soon as a photo is on screen. Phones only open the
 * share sheet straight from a tap, so the slow part has to be done already.
 */
function useShareFile(photo: Photo | undefined): Promise<File | null> {
  return useMemo(async () => {
    if (!photo) return null;
    try {
      const original = await library.original(photo.id);
      if (!original) return null;
      const framed = await renderFramed(original, photo.crop);
      return new File([framed], fileName(photo.createdAt), { type: 'image/jpeg', lastModified: photo.createdAt });
    } catch {
      return null;
    }
  }, [photo?.id]);
}

function fileName(time: number): string {
  const d = new Date(time);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `LarpCam-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.jpg`;
}

function formatDay(time: number): string {
  const d = new Date(time);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return 'Today';
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', day: 'numeric', month: 'long' }).format(d);
}

function formatTime(time: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(time));
}
