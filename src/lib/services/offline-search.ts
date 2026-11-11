export const OFFLINE_SEARCH_INDEX_VERSION = 1;

export type OfflineSearchLayer =
  | "earth"
  | "landcover"
  | "landuse"
  | "places"
  | "roads"
  | "pois"
  | "water"
  | "buildings"
  | "boundaries"
  | (string & {});

export interface OfflineSearchEntry {
  id: string;
  title: string;
  searchText: string;
  layer: OfflineSearchLayer;
  detail: string;
  lon: number;
  lat: number;
}

export interface OfflineSearchIndex {
  version: number;
  maxZoom: number;
  entries: OfflineSearchEntry[];
}

export type OfflineSearchWorkerRequest =
  | { type: "build"; requestId: string; file: File }
  | { type: "cancel"; requestId: string };

export type OfflineSearchWorkerResponse =
  | { type: "progress"; requestId: string; completed: number; total: number }
  | { type: "complete"; requestId: string; index: OfflineSearchIndex; unreadableTiles?: number }
  | { type: "error"; requestId: string; error: string }
  | { type: "cancelled"; requestId: string };

const DATABASE_NAME = "afra-offline-search";
const DATABASE_VERSION = 1;
const INDEX_STORE = "indexes";

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("ذخیره‌سازی جستجوی آفلاین در دسترس نیست"));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(INDEX_STORE)) {
        request.result.createObjectStore(INDEX_STORE);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => {
        database.close();
        databasePromise = null;
      };
      resolve(database);
    };
    request.onerror = () => {
      databasePromise = null;
      reject(request.error ?? new Error("باز کردن فهرست جستجو ناموفق بود"));
    };
  });

  return databasePromise;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("خواندن فهرست جستجو ناموفق بود"));
  });
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("ذخیره فهرست جستجو ناموفق بود"));
    transaction.onabort = () => reject(transaction.error ?? new Error("ذخیره فهرست جستجو لغو شد"));
  });
}

export function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[يى]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[\u200c\u200d]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function searchOfflineMapIndex(
  index: OfflineSearchIndex,
  query: string,
  center: [number, number],
  limit = 10,
): OfflineSearchEntry[] {
  const normalizedQuery = normalizeSearchText(query);
  if ([...normalizedQuery].length < 2 || limit <= 0) return [];

  interface Match {
    entry: OfflineSearchEntry;
    exact: boolean;
    prefix: boolean;
    distance: number;
  }
  const matches: Match[] = [];
  const cosLat = Math.cos((center[1] * Math.PI) / 180);
  const queryAsToken = ` ${normalizedQuery}`;
  const compare = (a: Match, b: Match): number => {
    if (a.exact !== b.exact) return a.exact ? -1 : 1;
    if (a.prefix !== b.prefix) return a.prefix ? -1 : 1;
    if (a.distance !== b.distance) return a.distance - b.distance;
    return a.entry.title.localeCompare(b.entry.title);
  };

  for (const entry of index.entries) {
    if (!entry.searchText.includes(normalizedQuery)) continue;
    const exact = normalizeSearchText(entry.title) === normalizedQuery;
    const prefix = entry.searchText.startsWith(normalizedQuery) ||
      entry.searchText.includes(queryAsToken);
    const deltaLon = ((entry.lon - center[0] + 540) % 360) - 180;
    const dx = deltaLon * cosLat;
    const dy = entry.lat - center[1];
    const match = { entry, exact, prefix, distance: dx * dx + dy * dy };

    let insertion = 0;
    while (insertion < matches.length && compare(matches[insertion], match) <= 0) insertion++;
    if (insertion < limit) {
      matches.splice(insertion, 0, match);
      if (matches.length > limit) matches.pop();
    } else if (matches.length < limit) {
      matches.push(match);
    }
  }

  return matches.map(({ entry }) => entry);
}

export async function loadOfflineSearchIndex(mapId: string): Promise<OfflineSearchIndex | null> {
  const database = await openDatabase();
  const transaction = database.transaction(INDEX_STORE, "readonly");
  const index = await requestResult(
    transaction.objectStore(INDEX_STORE).get(mapId),
  ) as OfflineSearchIndex | undefined;
  return index?.version === OFFLINE_SEARCH_INDEX_VERSION ? index : null;
}

export async function saveOfflineSearchIndex(
  mapId: string,
  index: OfflineSearchIndex,
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(INDEX_STORE, "readwrite");
  const complete = transactionComplete(transaction);
  transaction.objectStore(INDEX_STORE).put(index, mapId);
  await complete;
}

export async function deleteOfflineSearchIndex(mapId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(INDEX_STORE, "readwrite");
  const complete = transactionComplete(transaction);
  transaction.objectStore(INDEX_STORE).delete(mapId);
  await complete;
}
