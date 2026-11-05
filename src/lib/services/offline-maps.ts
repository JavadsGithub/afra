import { FileSource, PMTiles, TileType, type Header } from "pmtiles";
import { get, writable } from "svelte/store";

const DATABASE_NAME = "afra-offline-maps";
const DATABASE_VERSION = 2;
const LEGACY_ARCHIVE_STORE = "archives";
const MAP_STORE = "maps";
const TILE_STORE = "tiles";
const PREFERENCE_STORE = "preferences";
const ACTIVE_MAP_KEY = "active";
const LEGACY_MAP_ID = "legacy-pmtiles-map";
const MAX_REGION_TILE_COUNT = 25_000;
const MAX_LATITUDE = 85.05112878;

export type OfflineMapKind = "pmtiles" | "xyz";
export type OfflineMapTileKind = "vector" | "raster";

export interface OfflineMapInfo {
  id: string;
  kind: OfflineMapKind;
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
  providerHost?: string;
}

export interface PmtilesOfflineMap {
  kind: "pmtiles";
  info: OfflineMapInfo;
  file: File;
  pmtiles: PMTiles;
  header: Header;
}

export interface XyzOfflineMap {
  kind: "xyz";
  info: OfflineMapInfo;
}

export type OfflineMapPackage = PmtilesOfflineMap | XyzOfflineMap;

export interface OfflineMapCandidate {
  file: File;
  pmtiles: PMTiles;
  header: Header;
  info: Omit<OfflineMapInfo, "id" | "kind" | "providerHost" | "tileCount">;
}

export interface RegionDownloadOptions {
  name: string;
  urlTemplate: string;
  south: number;
  west: number;
  north: number;
  east: number;
  minZoom: number;
  maxZoom: number;
  attribution: string;
  confirmsOfflinePermission: boolean;
}

export interface RegionDownloadProgress {
  completed: number;
  total: number;
  storedTiles: number;
  downloadedBytes: number;
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

interface StoredXyzMap {
  id: string;
  kind: "xyz";
  info: OfflineMapInfo;
}

type StoredOfflineMap = StoredPmtilesMap | StoredXyzMap;

interface LegacyStoredMap {
  blob?: Blob;
  fileName?: string;
  fileType?: string;
  lastModified?: number;
  attribution?: string;
}

interface PlannedTile {
  z: number;
  x: number;
  y: number;
}

interface TileEntry extends PlannedTile {
  blob: Blob;
}

export const offlineMap = writable<OfflineMapPackage | null>(null);
export const offlineMaps = writable<OfflineMapInfo[]>([]);

let databasePromise: Promise<IDBDatabase> | null = null;
let loadPromise: Promise<OfflineMapPackage | null> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("ذخیره‌سازی آفلاین در این محیط در دسترس نیست"));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = (event) => {
      const database = request.result;
      const transaction = request.transaction;
      if (!transaction) return;

      if (!database.objectStoreNames.contains(MAP_STORE)) {
        database.createObjectStore(MAP_STORE);
      }
      if (!database.objectStoreNames.contains(TILE_STORE)) {
        database.createObjectStore(TILE_STORE);
      }
      if (!database.objectStoreNames.contains(PREFERENCE_STORE)) {
        database.createObjectStore(PREFERENCE_STORE);
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
  return { kind: "pmtiles", ...candidate, info };
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
  if (!tileKind) {
    throw new Error("قالب کاشی‌های این بسته پشتیبانی نمی‌شود");
  }

  let metadata: Record<string, unknown> = {};
  try {
    metadata = asMetadata(await pmtiles.getMetadata());
  } catch {
    // Some valid archives have no optional metadata. Ask the user for attribution.
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

export function estimateRegionTileCount(options: {
  south: number;
  west: number;
  north: number;
  east: number;
  minZoom: number;
  maxZoom: number;
}): number {
  const { south, west, north, east, minZoom, maxZoom } = options;
  if (
    ![south, west, north, east, minZoom, maxZoom].every(Number.isFinite) ||
    south >= north ||
    west >= east ||
    south < -MAX_LATITUDE ||
    north > MAX_LATITUDE ||
    west < -180 ||
    east > 180 ||
    !Number.isInteger(minZoom) ||
    !Number.isInteger(maxZoom) ||
    minZoom < 0 ||
    maxZoom > 22 ||
    minZoom > maxZoom
  ) {
    return 0;
  }

  let total = 0;
  for (let zoom = minZoom; zoom <= maxZoom; zoom += 1) {
    const range = tileRangeForBounds(south, west, north, east, zoom);
    total += (range.maxX - range.minX + 1) * (range.maxY - range.minY + 1);
  }
  return total;
}

function tileRangeForBounds(
  south: number,
  west: number,
  north: number,
  east: number,
  zoom: number,
) {
  const count = 2 ** zoom;
  const toX = (longitude: number) =>
    Math.max(0, Math.min(count - 1, Math.floor(((longitude + 180) / 360) * count)));
  const toY = (latitude: number) => {
    const clamped = Math.max(-MAX_LATITUDE, Math.min(MAX_LATITUDE, latitude));
    const radians = (clamped * Math.PI) / 180;
    const normalized =
      (1 - Math.asinh(Math.tan(radians)) / Math.PI) / 2;
    return Math.max(0, Math.min(count - 1, Math.floor(normalized * count)));
  };

  return {
    minX: toX(west),
    maxX: toX(east),
    minY: toY(north),
    maxY: toY(south),
  };
}

function buildTilePlan(options: RegionDownloadOptions): PlannedTile[] {
  const total = estimateRegionTileCount(options);
  if (total === 0) {
    throw new Error("محدوده جغرافیایی یا بازه زوم معتبر نیست");
  }
  if (total > MAX_REGION_TILE_COUNT) {
    throw new Error(
      `این محدوده ${total.toLocaleString()} کاشی دارد؛ سقف هر بسته ${MAX_REGION_TILE_COUNT.toLocaleString()} کاشی است. محدوده یا زوم را کاهش دهید.`,
    );
  }

  const tiles: PlannedTile[] = [];
  for (let zoom = options.minZoom; zoom <= options.maxZoom; zoom += 1) {
    const range = tileRangeForBounds(
      options.south,
      options.west,
      options.north,
      options.east,
      zoom,
    );
    for (let x = range.minX; x <= range.maxX; x += 1) {
      for (let y = range.minY; y <= range.maxY; y += 1) {
        tiles.push({ z: zoom, x, y });
      }
    }
  }
  return tiles;
}

function isOpenStreetMapStandardHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return host === "openstreetmap.org" || host.endsWith(".openstreetmap.org");
}

function validateTileUrlTemplate(template: string): { host: string } {
  if (!template.includes("{z}") || !template.includes("{x}") || !template.includes("{y}")) {
    throw new Error("نشانی کاشی باید شامل {z}، {x} و {y} باشد");
  }

  let url: URL;
  try {
    url = new URL(
      template
        .replaceAll("{z}", "1")
        .replaceAll("{x}", "1")
        .replaceAll("{y}", "1")
        .replaceAll("{s}", "a"),
    );
  } catch {
    throw new Error("قالب نشانی کاشی معتبر نیست");
  }
  if (url.protocol !== "https:") {
    throw new Error("برای دریافت بسته، نشانی ارائه‌دهنده باید HTTPS باشد");
  }

  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (isOpenStreetMapStandardHost(host)) {
    throw new Error(
      "دریافت انبوه از دامنه استاندارد OpenStreetMap مجاز نیست. از ارائه‌دهنده‌ای استفاده کنید که دانلود آفلاین را صریحاً مجاز می‌داند.",
    );
  }
  return { host };
}

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `map-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function tileKey(mapId: string, z: number, x: number, y: number): string {
  return `${mapId}/${z}/${x}/${y}`;
}

async function putTileBatch(mapId: string, entries: TileEntry[]): Promise<void> {
  if (entries.length === 0) return;
  const database = await openDatabase();
  const transaction = database.transaction(TILE_STORE, "readwrite");
  const store = transaction.objectStore(TILE_STORE);
  for (const entry of entries) {
    store.put(entry.blob, tileKey(mapId, entry.z, entry.x, entry.y));
  }
  await transactionComplete(transaction);
}

async function deleteTilePack(mapId: string): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(TILE_STORE, "readwrite");
  const store = transaction.objectStore(TILE_STORE);
  const prefix = `${mapId}/`;
  const request = store.openCursor();
  request.onsuccess = () => {
    const cursor = request.result;
    if (!cursor) return;
    if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
      cursor.delete();
    }
    cursor.continue();
  };
  await transactionComplete(transaction);
}

export async function loadOfflineTile(
  mapId: string,
  z: number,
  x: number,
  y: number,
): Promise<Blob | null> {
  const database = await openDatabase();
  const transaction = database.transaction(TILE_STORE, "readonly");
  const result = await requestResult(transaction.objectStore(TILE_STORE).get(tileKey(mapId, z, x, y)));
  return result instanceof Blob ? result : null;
}

async function readPreference(key: string): Promise<IDBValidKey | undefined> {
  const database = await openDatabase();
  const transaction = database.transaction(PREFERENCE_STORE, "readonly");
  return requestResult(transaction.objectStore(PREFERENCE_STORE).get(key));
}

async function readMapRecord(id: string): Promise<StoredOfflineMap | null> {
  const database = await openDatabase();
  const transaction = database.transaction(MAP_STORE, "readonly");
  const record = await requestResult(
    transaction.objectStore(MAP_STORE).get(id),
  ) as StoredOfflineMap | undefined;
  return record ?? null;
}

async function listMapRecords(): Promise<StoredOfflineMap[]> {
  const database = await openDatabase();
  const transaction = database.transaction(MAP_STORE, "readonly");
  return requestResult(transaction.objectStore(MAP_STORE).getAll()) as Promise<StoredOfflineMap[]>;
}

async function toPackage(record: StoredOfflineMap): Promise<OfflineMapPackage> {
  if (record.kind === "xyz") return { kind: "xyz", info: record.info };

  const candidate = await inspectOfflineMap(createFile(record));
  const storedInfo = record.info;
  const info: OfflineMapInfo = {
    ...candidate.info,
    ...(storedInfo ?? {}),
    id: record.id,
    kind: "pmtiles",
    attribution: record.attribution || storedInfo?.attribution || candidate.info.attribution,
    tileCount: candidate.header.numAddressedTiles,
  };
  return { kind: "pmtiles", ...candidate, info };
}

function infoForRecord(record: StoredOfflineMap): OfflineMapInfo | null {
  if (record.kind === "xyz") return record.info;
  return record.info ?? null;
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

export async function loadSavedOfflineMaps(): Promise<OfflineMapPackage | null> {
  if (loadPromise) return loadPromise;

  loadPromise = (async () => {
    const [records, activeKey] = await Promise.all([
      listMapRecords(),
      readPreference(ACTIVE_MAP_KEY),
    ]);
    const activeId = typeof activeKey === "string" ? activeKey : null;
    const byId = new Map(records.map((record) => [record.id, record]));
    let activePackage: OfflineMapPackage | null = null;
    const infos: OfflineMapInfo[] = [];

    for (const record of records) {
      let info = infoForRecord(record);
      if (!info && record.kind === "pmtiles") {
        const packageInfo = await toPackage(record);
        if (packageInfo.kind === "pmtiles") {
          info = packageInfo.info;
          await persistLegacyInfo(packageInfo);
        }
      }
      if (info) infos.push(info);
    }

    if (activeId) {
      const activeRecord = byId.get(activeId);
      if (activeRecord) activePackage = await toPackage(activeRecord);
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
    throw new Error("برای نمایش انتساب منبع، متن اعتباردهی را وارد کنید");
  }

  try {
    await navigator.storage?.persist?.();
  } catch {
    // The browser may decline persistent-storage status; IndexedDB remains usable.
  }

  const id = makeId();
  const packageInfo = toPmtilesPackage(candidate, id, cleanAttribution, customName.trim() || candidate.info.name);
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

  offlineMaps.update((maps) => [packageInfo.info, ...maps]);
  offlineMap.set(packageInfo);
  loadPromise = Promise.resolve(packageInfo);
  return packageInfo;
}

export async function activateOfflineMap(id: string): Promise<OfflineMapPackage> {
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
  const transaction = database.transaction(
    [MAP_STORE, TILE_STORE, PREFERENCE_STORE],
    "readwrite",
  );
  transaction.objectStore(MAP_STORE).delete(id);
  if (currentlyActive) {
    if (nextId) transaction.objectStore(PREFERENCE_STORE).put(nextId, ACTIVE_MAP_KEY);
    else transaction.objectStore(PREFERENCE_STORE).delete(ACTIVE_MAP_KEY);
  }
  const tileStore = transaction.objectStore(TILE_STORE);
  const prefix = `${id}/`;
  const cursorRequest = tileStore.openCursor();
  cursorRequest.onsuccess = () => {
    const cursor = cursorRequest.result;
    if (!cursor) return;
    if (typeof cursor.key === "string" && cursor.key.startsWith(prefix)) {
      cursor.delete();
    }
    cursor.continue();
  };
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

export async function downloadRegionTiles(
  options: RegionDownloadOptions,
  onProgress: (progress: RegionDownloadProgress) => void,
  signal: AbortSignal,
): Promise<XyzOfflineMap> {
  const name = options.name.trim();
  const attribution = options.attribution.trim();
  if (!name) throw new Error("برای بسته نقشه یک نام وارد کنید");
  if (!attribution) throw new Error("انتساب منبع نقشه الزامی است");
  if (!options.confirmsOfflinePermission) {
    throw new Error("برای ادامه باید تأیید کنید که منبع اجازه دانلود آفلاین می‌دهد");
  }
  const { host } = validateTileUrlTemplate(options.urlTemplate.trim());
  const plan = buildTilePlan(options);
  const id = makeId();
  const internalController = new AbortController();
  const abortFromCaller = () => internalController.abort();
  if (signal.aborted) internalController.abort();
  signal.addEventListener("abort", abortFromCaller, { once: true });

  let nextIndex = 0;
  let completed = 0;
  let storedTiles = 0;
  let downloadedBytes = 0;
  let pendingEntries: TileEntry[] = [];
  let writeChain = Promise.resolve();
  let writeFailure: unknown = null;

  const queueBatch = (force = false) => {
    if (pendingEntries.length < 64 && !force) return;
    const batch = pendingEntries.splice(0);
    if (batch.length === 0) return;
    writeChain = writeChain.then(() => putTileBatch(id, batch));
    void writeChain.catch((error: unknown) => {
      writeFailure = error;
      internalController.abort();
    });
  };

  const worker = async () => {
    while (!internalController.signal.aborted) {
      const index = nextIndex++;
      if (index >= plan.length) return;
      const tile = plan[index];
      const url = options.urlTemplate
        .trim()
        .replaceAll("{z}", String(tile.z))
        .replaceAll("{x}", String(tile.x))
        .replaceAll("{y}", String(tile.y))
        .replaceAll("{s}", "a");

      let response: Response;
      try {
        response = await fetch(url, { signal: internalController.signal });
      } catch (error) {
        if (internalController.signal.aborted) return;
        throw new Error(
          `دریافت کاشی ناموفق بود؛ اتصال، CORS و نشانی ارائه‌دهنده را بررسی کنید (${error instanceof Error ? error.message : "network error"})`,
        );
      }

      if (
        response.url &&
        isOpenStreetMapStandardHost(new URL(response.url).hostname)
      ) {
        throw new Error(
          "دانلود از طریق تغییر مسیر به دامنه استاندارد OpenStreetMap مسدود شد.",
        );
      }

      if (response.ok) {
        const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
        if (contentType && !contentType.startsWith("image/") && !contentType.includes("octet-stream")) {
          throw new Error("این نشانی کاشی رستری برنمی‌گرداند؛ برای دانلود منطقه، قالب XYZ تصویری لازم است");
        }
        const blob = await response.blob();
        if (blob.size > 0) {
          pendingEntries.push({ ...tile, blob });
          storedTiles += 1;
          downloadedBytes += blob.size;
        }
      } else if (response.status !== 404 && response.status !== 410) {
        if (response.status === 429) {
          throw new Error("ارائه‌دهنده درخواست‌ها را محدود کرد (HTTP 429). دانلود متوقف شد؛ شرایط و نرخ مجاز را بررسی کنید.");
        }
        throw new Error(`دریافت کاشی ناموفق بود (HTTP ${response.status})`);
      }

      completed += 1;
      onProgress({ completed, total: plan.length, storedTiles, downloadedBytes });
      queueBatch();
    }
  };

  const workers = Array.from({ length: Math.min(2, plan.length) }, () => worker());
  try {
    await Promise.all(workers);
    if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
    if (writeFailure) throw writeFailure;
    if (internalController.signal.aborted) throw new DOMException("Download cancelled", "AbortError");
    queueBatch(true);
    await writeChain;
    if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
    if (storedTiles === 0) throw new Error("در این محدوده هیچ کاشی تصویری از ارائه‌دهنده دریافت نشد");

    const info: OfflineMapInfo = {
      id,
      kind: "xyz",
      name,
      fileName: `${name} (${storedTiles.toLocaleString()} tiles)`,
      sizeBytes: downloadedBytes,
      tileCount: storedTiles,
      tileKind: "raster",
      minZoom: options.minZoom,
      maxZoom: options.maxZoom,
      minLon: options.west,
      minLat: options.south,
      maxLon: options.east,
      maxLat: options.north,
      attribution,
      providerHost: host,
    };
    const record: StoredXyzMap = { id, kind: "xyz", info };
    const database = await openDatabase();
    if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
    const transaction = database.transaction([MAP_STORE, PREFERENCE_STORE], "readwrite");
    transaction.objectStore(MAP_STORE).put(record, id);
    transaction.objectStore(PREFERENCE_STORE).put(id, ACTIVE_MAP_KEY);
    await transactionComplete(transaction);

    offlineMaps.update((maps) => [info, ...maps]);
    const savedPackage: XyzOfflineMap = { kind: "xyz", info };
    offlineMap.set(savedPackage);
    loadPromise = Promise.resolve(savedPackage);
    onProgress({ completed: plan.length, total: plan.length, storedTiles, downloadedBytes });
    return savedPackage;
  } catch (error) {
    internalController.abort();
    await Promise.allSettled(workers);
    await writeChain.catch(() => undefined);
    try {
      await deleteTilePack(id);
    } catch {
      // Preserve the original error if cleanup itself fails.
    }
    if (internalController.signal.aborted && signal.aborted) {
      throw new DOMException("Download cancelled", "AbortError");
    }
    throw error;
  } finally {
    signal.removeEventListener("abort", abortFromCaller);
  }
}
