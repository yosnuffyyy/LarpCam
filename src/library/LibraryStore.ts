import { signal } from '@preact/signals';
import type { Rect, Shape } from '../lib/geometry';
import { storageNamespace } from '../lib/platform';

/**
 * The photo library. Everything lives in IndexedDB on this device; there is no
 * server. Each photo keeps the untouched capture plus the crop that was framed,
 * so later edits never destroy anything.
 */

export interface PhotoMeta {
  id: string;
  createdAt: number;
  /** Pixel size of the untouched capture. */
  width: number;
  height: number;
  /** The framed part of the capture, as fractions of its size. */
  crop: Rect;
  shape: Shape;
  /** Chip label at capture time, e.g. "1×". */
  lens: string;
  zoom: number;
  facing: 'environment' | 'user';
}

/** A photo as the UI sees it: metadata plus a ready-to-show thumbnail URL. */
export interface Photo extends PhotoMeta {
  thumbUrl: string;
}

interface StoredPhoto extends PhotoMeta {
  thumb: ArrayBuffer;
  thumbType: string;
}

interface StoredOriginal {
  id: string;
  data: ArrayBuffer;
  type: string;
}

const DB_VERSION = 1;
const PHOTOS = 'photos';
const ORIGINALS = 'originals';

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export class LibraryStore {
  /** Newest first. */
  readonly photos = signal<Photo[]>([]);
  /** False when the browser refused storage: photos then last only until the tab closes. */
  readonly persistent = signal(true);
  readonly ready: Promise<void>;

  private db: IDBDatabase | null = null;
  /** Fallback when IndexedDB is unavailable (some private modes). */
  private memory = new Map<string, Blob>();
  private askedToPersist = false;

  constructor(private readonly name = storageNamespace()) {
    this.ready = this.open();
  }

  private async open(): Promise<void> {
    try {
      const req = indexedDB.open(this.name, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(PHOTOS)) {
          db.createObjectStore(PHOTOS, { keyPath: 'id' }).createIndex('createdAt', 'createdAt');
        }
        if (!db.objectStoreNames.contains(ORIGINALS)) db.createObjectStore(ORIGINALS, { keyPath: 'id' });
      };
      this.db = await request(req);
      this.db.onversionchange = () => this.db?.close();
      const rows = await request(this.db.transaction(PHOTOS).objectStore(PHOTOS).getAll() as IDBRequest<StoredPhoto[]>);
      rows.sort((a, b) => b.createdAt - a.createdAt);
      this.photos.value = rows.map(toPhoto);
    } catch {
      this.db = null;
      this.persistent.value = false;
    }
  }

  /** Saves a new capture and puts it at the front of the library. */
  async add(meta: PhotoMeta, original: Blob, thumb: Blob): Promise<Photo> {
    await this.ready;
    const photo: Photo = { ...meta, thumbUrl: URL.createObjectURL(thumb) };

    if (this.db) {
      // ArrayBuffers rather than Blobs: older iOS versions lose Blobs in IndexedDB.
      const [data, thumbData] = await Promise.all([original.arrayBuffer(), thumb.arrayBuffer()]);
      const tx = this.db.transaction([PHOTOS, ORIGINALS], 'readwrite');
      tx.objectStore(PHOTOS).put({ ...meta, thumb: thumbData, thumbType: thumb.type } satisfies StoredPhoto);
      tx.objectStore(ORIGINALS).put({ id: meta.id, data, type: original.type } satisfies StoredOriginal);
      await done(tx);
      this.askToPersist();
    } else {
      this.memory.set(meta.id, original);
    }

    this.photos.value = [photo, ...this.photos.value];
    return photo;
  }

  /** The untouched capture, or null if it is gone. */
  async original(id: string): Promise<Blob | null> {
    await this.ready;
    if (!this.db) return this.memory.get(id) ?? null;
    const row = await request(
      this.db.transaction(ORIGINALS).objectStore(ORIGINALS).get(id) as IDBRequest<StoredOriginal | undefined>,
    );
    return row ? new Blob([row.data], { type: row.type }) : null;
  }

  async remove(id: string): Promise<void> {
    await this.ready;
    if (this.db) {
      const tx = this.db.transaction([PHOTOS, ORIGINALS], 'readwrite');
      tx.objectStore(PHOTOS).delete(id);
      tx.objectStore(ORIGINALS).delete(id);
      await done(tx);
    } else {
      this.memory.delete(id);
    }
    const gone = this.photos.value.find((p) => p.id === id);
    if (gone) URL.revokeObjectURL(gone.thumbUrl);
    this.photos.value = this.photos.value.filter((p) => p.id !== id);
  }

  /** Ask the browser not to clear our photos when space runs low. Best effort. */
  private askToPersist(): void {
    if (this.askedToPersist) return;
    this.askedToPersist = true;
    void navigator.storage?.persist?.().catch(() => false);
  }
}

function toPhoto(row: StoredPhoto): Photo {
  const { thumb, thumbType, ...meta } = row;
  return { ...meta, thumbUrl: URL.createObjectURL(new Blob([thumb], { type: thumbType })) };
}

export function newPhotoId(now = Date.now()): string {
  const random = Math.random().toString(36).slice(2, 8);
  return `${now.toString(36)}-${random}`;
}

export const library = new LibraryStore();
