import { FileSource, PMTiles, TileType, type Header } from "pmtiles";
import { writable } from "svelte/store";

const DATABASE_NAME = "afra-offline-maps";
const DATABASE_VERSION = 1;
const OBJECT_STORE = "archives";
const ACTIVE_MAP_KEY = "active";

export type OfflineMapTileKind = "vector" | "raster";

export interface OfflineMapInfo {
  name: string;
  fileName: string;
  sizeBytes: number;
  tileKind: OfflineMapTileKind;
  minZoom: number;
  maxZoom: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  attribution: string;
}

export interface OfflineMapPackage {
  file: File;
  pmtiles: PMTiles;
  header: Header;
  info: OfflineMapInfo;
}

interface StoredOfflineMap {
  blob: Blob;
  fileName: string;
  fileType: string;
  lastModified: number;
  attribution: string;
}

export const offlineMap = writable<OfflineMapPackage | null>(null);

let loadPromise: Promise<OfflineMapPackage | null> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("ذخیره‌سازی آفلاین در این محیط در دسترس نیست"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(OBJECT_STORE)) {
        database.createObjectStore(OBJECT_STORE);
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("باز کردن فضای ذخیره‌سازی نقشه ناموفق بود"));
    request.onblocked = () => reject(new Error("فضای ذخیره‌سازی نقشه توسط پنجره دیگری قفل شده است"));
  });
}

function asMetadata(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function metadataText(metadata: Record<string, unknown>, key: string): string {
  const value = metadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function plainAttribution(metadata: Record<string, unknown>): string {
  return metadataText(metadata, "attribution")
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<\/p\s*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&copy;/gi, "©")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

function tileKindFor(tileType: TileType): OfflineMapTileKind | null {
  if (tileType === TileType.Mvt) return "vector";
  if (
    tileType === TileType.Png ||
    tileType === TileType.Jpeg ||
    tileType === TileType.Webp ||
    tileType === TileType.Avif
  ) {
    return "raster";
  }
  return null;
}

export async function inspectOfflineMap(file: File): Promise<OfflineMapPackage> {
  if (!file.name.toLowerCase().endsWith(".pmtiles")) {
    throw new Error("فقط بسته‌های نقشه با پسوند .pmtiles پشتیبانی می‌شوند");
  }
  if (file.size < 127) {
    throw new Error("فایل برای یک آرشیو PMTiles معتبر بیش از حد کوچک است");
  }

  const pmtiles = new PMTiles(new FileSource(file));
  let header: Header;
  try {
    header = await pmtiles.getHeader();
  } catch {
    throw new Error("فایل خوانده نشد یا قالب PMTiles آن معتبر نیست");
  }

  const tileKind = tileKindFor(header.tileType);
  if (!tileKind) {
    throw new Error("قالب کاشی‌های این بسته پشتیبانی نمی‌شود");
  }

  let metadata: Record<string, unknown> = {};
  try {
    metadata = asMetadata(await pmtiles.getMetadata());
  } catch {
    // Some valid archives have no optional metadata. The user can still provide
    // a visible attribution before activating the package.
  }

  const baseName = file.name.replace(/\.pmtiles$/i, "");
  const name = metadataText(metadata, "name") || baseName || file.name;

  return {
    file,
    pmtiles,
    header,
    info: {
      name,
      fileName: file.name,
      sizeBytes: file.size,
      tileKind,
      minZoom: header.minZoom,
      maxZoom: header.maxZoom,
      minLon: header.minLon,
      minLat: header.minLat,
      maxLon: header.maxLon,
      maxLat: header.maxLat,
      attribution: plainAttribution(metadata),
    },
  };
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("ذخیره نقشه آفلاین ناموفق بود"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("ذخیره نقشه آفلاین لغو شد"));
  });
}

export async function saveOfflineMap(
  candidate: OfflineMapPackage,
  attribution: string,
): Promise<OfflineMapPackage> {
  const cleanAttribution = attribution.trim();
  if (!cleanAttribution) {
    throw new Error("برای نمایش قانونی نقشه، متن انتساب منبع را وارد کنید");
  }

  try {
    await navigator.storage?.persist?.();
  } catch {
    // The browser may decline persistent-storage status; IndexedDB remains usable.
  }

  const database = await openDatabase();
  try {
    const transaction = database.transaction(OBJECT_STORE, "readwrite");
    transaction.objectStore(OBJECT_STORE).put(
      {
        blob: candidate.file,
        fileName: candidate.file.name,
        fileType: candidate.file.type,
        lastModified: candidate.file.lastModified,
        attribution: cleanAttribution,
      } satisfies StoredOfflineMap,
      ACTIVE_MAP_KEY,
    );
    await transactionComplete(transaction);
  } finally {
    database.close();
  }

  const savedPackage: OfflineMapPackage = {
    ...candidate,
    info: { ...candidate.info, attribution: cleanAttribution },
  };
  offlineMap.set(savedPackage);
  loadPromise = Promise.resolve(savedPackage);
  return savedPackage;
}

async function readStoredMap(): Promise<StoredOfflineMap | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE, "readonly");
      const request = transaction.objectStore(OBJECT_STORE).get(ACTIVE_MAP_KEY);
      request.onsuccess = () => resolve((request.result as StoredOfflineMap) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error("خواندن نقشه آفلاین ناموفق بود"));
    });
  } finally {
    database.close();
  }
}

export function loadSavedOfflineMap(): Promise<OfflineMapPackage | null> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const stored = await readStoredMap();
    if (!stored) {
      offlineMap.set(null);
      return null;
    }

    const file = new File([stored.blob], stored.fileName, {
      type: stored.fileType,
      lastModified: stored.lastModified,
    });
    const savedPackage = await inspectOfflineMap(file);
    savedPackage.info.attribution = stored.attribution;
    offlineMap.set(savedPackage);
    return savedPackage;
  })().catch((error: unknown) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}

export async function removeOfflineMap(): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction(OBJECT_STORE, "readwrite");
    transaction.objectStore(OBJECT_STORE).delete(ACTIVE_MAP_KEY);
    await transactionComplete(transaction);
  } finally {
    database.close();
  }

  offlineMap.set(null);
  loadPromise = Promise.resolve(null);
}
