import { FileSource, PMTiles, TileType, type Header } from "pmtiles";
import { get, writable } from "svelte/store";

const DATABASE_NAME = "afra-offline-maps";
const DATABASE_VERSION = 3;
const LEGACY_ARCHIVE_STORE = "archives";
const MAP_STORE = "maps";
const TILE_STORE = "tiles";
const PREFERENCE_STORE = "preferences";
const ACTIVE_MAP_KEY = "active";
const LEGACY_MAP_ID = "legacy-pmtiles-map";

export type OfflineMapTileKind = "vector" | "raster";

export interface OfflineMapInfo {
  id: string;
  kind: "pmtiles";
  name: string;
  fileName: string;
  sizeBytes: number;
  tileCount: number;
  tileKind: OfflineMapTileKind;
  minZoom: number;
  maxZoom: number;
  minLon: number;
  minLat: number;
  maxLon: number;
  maxLat: number;
  attribution: string;
}

export interface PmtilesOfflineMap {
  kind: "pmtiles";
  info: OfflineMapInfo;
  file: File;
  pmtiles: PMTiles;
  header: Header;
}

export type OfflineMapPackage = PmtilesOfflineMap;

export interface OfflineMapCandidate {
  file: File;
  pmtiles: PMTiles;
  header: Header;
  info: Omit<OfflineMapInfo, "id" | "kind" | "tileCount">;
}

interface StoredPmtilesMap {
  id: string;
  kind: "pmtiles";
  blob: Blob;
  fileName: string;
  fileType: string;
  lastModified: number;
  info?: OfflineMapInfo;
  attribution: string;
}

interface LegacyStoredMap {
  blob?: Blob;
  fileName?: string;
  fileType?: string;
  lastModified?: number;
  attribution?: string;
}

interface LegacyOfflineMapRecord {
  kind?: string;
}

class OfflineFileSource extends FileSource {
  private readonly sourceKey: string;

  constructor(file: File, sourceKey: string) {
    super(file);
    this.sourceKey = sourceKey;
  }

  override getKey(): string {
    return this.sourceKey;
  }
}

export const offlineMap = writable<OfflineMapPackage | null>(null);
export const offlineMaps = writable<OfflineMapInfo[]>([]);

let databasePromise: Promise<IDBDatabase> | null = null;
let loadPromise: Promise<OfflineMapPackage | null> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("ذخیره‌سازی نقشه آفلاین در این محیط در دسترس نیست"));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) return;

      if (!database.objectStoreNames.contains(MAP_STORE)) database.createObjectStore(MAP_STORE);
      if (!database.objectStoreNames.contains(PREFERENCE_STORE)) {
        database.createObjectStore(PREFERENCE_STORE);
      }
      if (database.objectStoreNames.contains(TILE_STORE)) {
        // Discard the previous network-tile cache; offline maps are whole local archives only.
        database.deleteObjectStore(TILE_STORE);
      }

      const oldVersion = (event as IDBVersionChangeEvent).oldVersion;
      if (
        oldVersion < 2 &&
        database.objectStoreNames.contains(LEGACY_ARCHIVE_STORE)
      ) {
        const legacyStore = transaction.objectStore(LEGACY_ARCHIVE_STORE);
        const legacyRequest = legacyStore.get(ACTIVE_MAP_KEY);
        legacyRequest.onsuccess = () => {
          const legacy = legacyRequest.result as LegacyStoredMap | undefined;
          if (!legacy?.blob || !legacy.fileName) return;

          const legacyRecord: StoredPmtilesMap = {
            id: LEGACY_MAP_ID,
            kind: "pmtiles",
            blob: legacy.blob,
            fileName: legacy.fileName,
            fileType: legacy.fileType ?? "application/octet-stream",
            lastModified: legacy.lastModified ?? Date.now(),
            attribution: legacy.attribution ?? "",
          };
          transaction.objectStore(MAP_STORE).put(legacyRecord, LEGACY_MAP_ID);
          transaction.objectStore(PREFERENCE_STORE).put(LEGACY_MAP_ID, ACTIVE_MAP_KEY);
          legacyStore.delete(ACTIVE_MAP_KEY);
        };
      } else if (oldVersion >= 2) {
        const maps = transaction.objectStore(MAP_STORE);
        const cursorRequest = maps.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const record = cursor.value as LegacyOfflineMapRecord;
          if (record.kind !== "pmtiles") cursor.delete();
          cursor.continue();
        };
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
      reject(request.error ?? new Error("باز کردن فضای ذخیره‌سازی نقشه ناموفق بود"));
    };
    request.onblocked = () => {
      databasePromise = null;
      reject(new Error("فضای ذخیره‌سازی نقشه توسط پنجره دیگری قفل شده است"));
    };
  });

  return databasePromise;
}

function transactionComplete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () =>
      reject(transaction.error ?? new Error("عملیات فضای ذخیره‌سازی ناموفق بود"));
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("عملیات فضای ذخیره‌سازی لغو شد"));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("خواندن داده‌های نقشه ناموفق بود"));
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

function localSourceKey(id: string): string {
  return `afra-local/${id}`;
}

function createFile(record: StoredPmtilesMap): File {
  return new File([record.blob], record.fileName, {
    type: record.fileType,
    lastModified: record.lastModified,
  });
}

function toPmtilesPackage(
  candidate: OfflineMapCandidate,
  id: string,
  attribution: string,
  name = candidate.info.name,
): PmtilesOfflineMap {
  const info: OfflineMapInfo = {
    ...candidate.info,
    id,
    kind: "pmtiles",
    name,
    attribution,
    tileCount: candidate.header.numAddressedTiles,
  };
  const pmtiles = new PMTiles(new OfflineFileSource(candidate.file, localSourceKey(id)));
  return { kind: "pmtiles", info, file: candidate.file, pmtiles, header: candidate.header };
}

export async function inspectOfflineMap(file: File): Promise<OfflineMapCandidate> {
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
  if (!tileKind) throw new Error("قالب کاشی‌های این بسته پشتیبانی نمی‌شود");

  let metadata: Record<string, unknown> = {};
  try {
    metadata = asMetadata(await pmtiles.getMetadata());
  } catch {
    // Some valid archives have no optional metadata; attribution can be entered during import.
  }

  if (tileKind === "vector" && Array.isArray(metadata.vector_layers)) {
    const layerNames = metadata.vector_layers
      .map((layer) => asMetadata(layer).id)
      .filter((layerName): layerName is string => typeof layerName === "string");
    if (layerNames.length > 0 && (!layerNames.includes("earth") || !layerNames.includes("roads"))) {
      throw new Error("نقشهٔ برداری باید با طرح Protomaps Basemaps سازگار باشد");
    }
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

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `map-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readPreference(key: string): Promise<IDBValidKey | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCE_STORE, "readonly");
  return requestResult(transaction.objectStore(PREFERENCE_STORE).get(key));
}

async function readMapRecord(id: string): Promise<StoredPmtilesMap | null> {
  const database = await openDatabase();
  const transaction = database.transaction(MAP_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(MAP_STORE).get(id),
  ) as (StoredPmtilesMap & { kind?: string }) | undefined;
  return record?.kind === "pmtiles" ? record : null;
}

async function listMapRecords(): Promise<StoredPmtilesMap[]> {
  const database = await openDatabase();
  const transaction = database.transaction(MAP_STORE, "readonly");
  const records = await requestResult(transaction.objectStore(MAP_STORE).getAll()) as Array<
    StoredPmtilesMap & { kind?: string }
  >;
  return records.filter((record) => record.kind === "pmtiles");
}

async function toPackage(record: StoredPmtilesMap): Promise<PmtilesOfflineMap> {
  const candidate = await inspectOfflineMap(createFile(record));
  const info: OfflineMapInfo = {
    ...candidate.info,
    ...(record.info ?? {}),
    id: record.id,
    kind: "pmtiles",
    attribution: record.attribution || record.info?.attribution || candidate.info.attribution,
    tileCount: candidate.header.numAddressedTiles,
  };
  return toPmtilesPackage(candidate, record.id, info.attribution, info.name);
}

async function persistLegacyInfo(packageInfo: PmtilesOfflineMap): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(MAP_STORE, "readwrite");
  const record = await requestResult(
    transaction.objectStore(MAP_STORE).get(packageInfo.info.id),
  ) as StoredPmtilesMap | undefined;
  if (record) {
    record.info = packageInfo.info;
    record.attribution = packageInfo.info.attribution;
    transaction.objectStore(MAP_STORE).put(record, record.id);
  }
  await transactionComplete(transaction);
}

async function clearActivePreference(): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCE_STORE, "readwrite");
  transaction.objectStore(PREFERENCE_STORE).delete(ACTIVE_MAP_KEY);
  await transactionComplete(transaction);
}

export async function loadSavedOfflineMaps(): Promise<OfflineMapPackage | null> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [records, activeKey] = await Promise.all([
      listMapRecords(),
      readPreference(ACTIVE_MAP_KEY),
    ]);
    const activeId = typeof activeKey === "string" ? activeKey : null;
    const byId = new Map(records.map((record) => [record.id, record]));
    let activePackage: PmtilesOfflineMap | null = null;
    const infos: OfflineMapInfo[] = [];

    for (const record of records) {
      let info = record.info;
      if (!info) {
        const packageInfo = await toPackage(record);
        info = packageInfo.info;
        await persistLegacyInfo(packageInfo);
      }
      infos.push(info);
    }

    if (activeId) {
      const activeRecord = byId.get(activeId);
      if (activeRecord) activePackage = await toPackage(activeRecord);
      else await clearActivePreference();
    }

    offlineMaps.set(infos);
    offlineMap.set(activePackage);
    return activePackage;
  })().catch((error: unknown) => {
    loadPromise = null;
    throw error;
  });

  return loadPromise;
}

export async function saveOfflineMap(
  candidate: OfflineMapCandidate,
  attribution: string,
  customName = candidate.info.name,
): Promise<PmtilesOfflineMap> {
  const cleanAttribution = attribution.trim();
  if (!cleanAttribution) {
    throw new Error("برای ذخیرهٔ انتساب نقشه، متن اعتباردهی را وارد کنید");
  }

  try {
    await navigator.storage?.persist?.();
  } catch {
    // Persistent storage may be declined; IndexedDB can still store the selected archive.
  }

  const id = makeId();
  const packageInfo = toPmtilesPackage(
    candidate,
    id,
    cleanAttribution,
    customName.trim() || candidate.info.name,
  );
  const record: StoredPmtilesMap = {
    id,
    kind: "pmtiles",
    blob: candidate.file,
    fileName: candidate.file.name,
    fileType: candidate.file.type,
    lastModified: candidate.file.lastModified,
    info: packageInfo.info,
    attribution: cleanAttribution,
  };

  const database = await openDatabase();
  const transaction = database.transaction([MAP_STORE, PREFERENCE_STORE], "readwrite");
  transaction.objectStore(MAP_STORE).put(record, id);
  transaction.objectStore(PREFERENCE_STORE).put(id, ACTIVE_MAP_KEY);
  await transactionComplete(transaction);

  offlineMaps.update((maps) => [packageInfo.info, ...maps.filter((map) => map.id !== id)]);
  offlineMap.set(packageInfo);
  loadPromise = Promise.resolve(packageInfo);
  return packageInfo;
}

export async function activateOfflineMap(id: string): Promise<PmtilesOfflineMap> {
  const record = await readMapRecord(id);
  if (!record) throw new Error("بسته نقشه پیدا نشد");

  const packageInfo = await toPackage(record);
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCE_STORE, "readwrite");
  transaction.objectStore(PREFERENCE_STORE).put(id, ACTIVE_MAP_KEY);
  await transactionComplete(transaction);

  offlineMap.set(packageInfo);
  loadPromise = Promise.resolve(packageInfo);
  return packageInfo;
}

export async function removeOfflineMap(id: string): Promise<void> {
  const currentlyActive = get(offlineMap)?.info.id === id;
  const remaining = get(offlineMaps).filter((mapInfo) => mapInfo.id !== id);
  const nextId = currentlyActive ? remaining[0]?.id ?? null : null;

  const database = await openDatabase();
  const transaction = database.transaction([MAP_STORE, PREFERENCE_STORE], "readwrite");
  transaction.objectStore(MAP_STORE).delete(id);
  if (currentlyActive) {
    if (nextId) transaction.objectStore(PREFERENCE_STORE).put(nextId, ACTIVE_MAP_KEY);
    else transaction.objectStore(PREFERENCE_STORE).delete(ACTIVE_MAP_KEY);
  }
  await transactionComplete(transaction);

  offlineMaps.set(remaining);
  if (currentlyActive) {
    if (nextId) await activateOfflineMap(nextId);
    else {
      offlineMap.set(null);
      loadPromise = Promise.resolve(null);
    }
  }
}
