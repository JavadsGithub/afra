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

export type OfflineMapKind = "pmtiles" | "xyz" | "osm";
export type OfflineMapTileKind = "vector" | "raster";

export type OsmPosition = [longitude: number, latitude: number];
export type OsmGeometry =
  | { type: "Point"; coordinates: OsmPosition }
  | { type: "LineString"; coordinates: OsmPosition[] }
  | { type: "Polygon"; coordinates: OsmPosition[][] }
  | { type: "MultiPolygon"; coordinates: OsmPosition[][][] };

export interface OsmFeature {
  type: "Feature";
  id: string;
  geometry: OsmGeometry;
  properties: {
    osmType: "node" | "way" | "relation";
    osmId: string;
    tags: Record<string, string>;
  };
}

export interface OsmFeatureCollection {
  type: "FeatureCollection";
  features: OsmFeature[];
}

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

export interface OsmOfflineMap {
  kind: "osm";
  info: OfflineMapInfo;
  data: OsmFeatureCollection;
}

export type OfflineMapPackage = PmtilesOfflineMap | XyzOfflineMap | OsmOfflineMap;

export interface OfflineMapCandidate {
  file: File;
  pmtiles: PMTiles;
  header: Header;
  info: Omit<OfflineMapInfo, "id" | "kind" | "providerHost" | "tileCount">;
}

export interface OsmRegionDownloadOptions {
  name: string;
  south: number;
  west: number;
  north: number;
  east: number;
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

interface StoredOsmMap {
  id: string;
  kind: "osm";
  info: OfflineMapInfo;
  data: OsmFeatureCollection;
}

type StoredOfflineMap = StoredPmtilesMap | StoredXyzMap | StoredOsmMap;

interface LegacyStoredMap {
  blob?: Blob;
  fileName?: string;
  fileType?: string;
  lastModified?: number;
  attribution?: string;
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

function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `map-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function tileKey(mapId: string, z: number, x: number, y: number): string {
  return `${mapId}/${z}/${x}/${y}`;
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
  if (record.kind === "osm") return { kind: "osm", info: record.info, data: record.data };

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
  if (record.kind !== "pmtiles") return record.info;
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

const OSM_API_URL = "https://api.openstreetmap.org/api/0.6/map";
const MAX_OSM_BBOX_AREA = 0.25;
const MAX_OSM_RESPONSE_BYTES = 25 * 1024 * 1024;
const MAX_OSM_FEATURES = 50_000;
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

const OSM_RENDERABLE_TAGS = [
  "aeroway", "amenity", "barrier", "building", "craft", "emergency",
  "healthcare", "highway", "historic", "landuse", "leisure", "man_made",
  "military", "natural", "office", "place", "power", "public_transport",
  "railway", "shop", "sport", "tourism", "water", "waterway",
] as const;

function osmTags(element: Element): Record<string, string> {
  const tags: Record<string, string> = {};
  for (const tag of Array.from(element.children)) {
    if (tag.tagName !== "tag") continue;
    const key = tag.getAttribute("k");
    const value = tag.getAttribute("v");
    if (key && value !== null) tags[key] = value;
  }
  return tags;
}

function hasRenderableOsmTags(tags: Record<string, string>): boolean {
  return OSM_RENDERABLE_TAGS.some((key) => Boolean(tags[key]) && tags[key] !== "no");
}

function osmFeature(
  osmType: OsmFeature["properties"]["osmType"],
  osmId: string,
  tags: Record<string, string>,
  geometry: OsmGeometry,
): OsmFeature {
  return {
    type: "Feature",
    id: `${osmType}/${osmId}`,
    geometry,
    properties: { osmType, osmId, tags },
  };
}

function isOsmArea(tags: Record<string, string>, coordinates: OsmPosition[]): boolean {
  if (tags.area === "yes") return true;
  if (tags.area === "no" || coordinates.length < 4) return false;
  const first = coordinates[0];
  const last = coordinates[coordinates.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return false;
  return [
    "aeroway", "amenity", "building", "landuse", "leisure", "natural",
    "office", "shop", "tourism", "water",
  ].some((key) => Boolean(tags[key]) && tags[key] !== "no") || tags.waterway === "riverbank";
}

function samePosition(a: OsmPosition, b: OsmPosition): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function stitchOsmRings(segments: OsmPosition[][]): OsmPosition[][] {
  const remaining = segments.map((segment) => [...segment]);
  const rings: OsmPosition[][] = [];

  while (remaining.length > 0) {
    const ring = remaining.shift()!;
    let extended = true;
    while (extended && ring.length > 1 && !samePosition(ring[0], ring[ring.length - 1])) {
      extended = false;
      const end = ring[ring.length - 1];
      let index = remaining.findIndex((segment) =>
        samePosition(segment[0], end) || samePosition(segment[segment.length - 1], end),
      );
      if (index >= 0) {
        const [segment] = remaining.splice(index, 1);
        if (samePosition(segment[0], end)) ring.push(...segment.slice(1));
        else ring.push(...segment.slice(0, -1).reverse());
        extended = true;
        continue;
      }

      const start = ring[0];
      index = remaining.findIndex((segment) =>
        samePosition(segment[0], start) || samePosition(segment[segment.length - 1], start),
      );
      if (index < 0) continue;
      const [segment] = remaining.splice(index, 1);
      if (samePosition(segment[segment.length - 1], start)) {
        ring.unshift(...segment.slice(0, -1));
      } else {
        ring.unshift(...segment.slice(1).reverse());
      }
      extended = true;
    }
    if (ring.length >= 4 && samePosition(ring[0], ring[ring.length - 1])) rings.push(ring);
  }

  return rings;
}

function pointInOsmRing(point: OsmPosition, ring: OsmPosition[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses = (yi > point[1]) !== (yj > point[1]) &&
      point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function parseOsmMapXml(xml: string): OsmFeatureCollection {
  if (typeof DOMParser === "undefined") {
    throw new Error("دریافت نقشهٔ آفلاین در این محیط پشتیبانی نمی‌شود");
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (document.getElementsByTagName("parsererror").length > 0) {
    throw new Error("پاسخ OpenStreetMap قابل خواندن نیست");
  }

  const nodes = new Map<string, OsmPosition>();
  const features: OsmFeature[] = [];
  for (const node of Array.from(document.getElementsByTagName("node"))) {
    const id = node.getAttribute("id");
    const lat = Number(node.getAttribute("lat"));
    const lon = Number(node.getAttribute("lon"));
    if (!id || !Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const position: OsmPosition = [lon, lat];
    nodes.set(id, position);
    const tags = osmTags(node);
    if (hasRenderableOsmTags(tags)) {
      features.push(osmFeature("node", id, tags, { type: "Point", coordinates: position }));
    }
  }

  const ways = new Map<string, { coordinates: OsmPosition[]; tags: Record<string, string> }>();
  for (const way of Array.from(document.getElementsByTagName("way"))) {
    const id = way.getAttribute("id");
    if (!id) continue;
    const coordinates = Array.from(way.getElementsByTagName("nd"))
      .map((node) => nodes.get(node.getAttribute("ref") ?? ""))
      .filter((position): position is OsmPosition => Boolean(position));
    const tags = osmTags(way);
    ways.set(id, { coordinates, tags });
    if (!hasRenderableOsmTags(tags) || coordinates.length < 2) continue;

    const geometry: OsmGeometry = isOsmArea(tags, coordinates)
      ? { type: "Polygon", coordinates: [coordinates] }
      : { type: "LineString", coordinates };
    features.push(osmFeature("way", id, tags, geometry));
  }

  for (const relation of Array.from(document.getElementsByTagName("relation"))) {
    const id = relation.getAttribute("id");
    if (!id) continue;
    const tags = osmTags(relation);
    if (!hasRenderableOsmTags(tags) || !["multipolygon", "boundary"].includes(tags.type ?? "")) continue;

    const outerSegments: OsmPosition[][] = [];
    const innerSegments: OsmPosition[][] = [];
    for (const member of Array.from(relation.getElementsByTagName("member"))) {
      if (member.getAttribute("type") !== "way") continue;
      const way = ways.get(member.getAttribute("ref") ?? "");
      if (!way || way.coordinates.length < 2) continue;
      if (member.getAttribute("role") === "inner") innerSegments.push(way.coordinates);
      else outerSegments.push(way.coordinates);
    }

    const outerRings = stitchOsmRings(outerSegments);
    if (outerRings.length === 0) continue;
    const innerRings = stitchOsmRings(innerSegments);
    const polygons = outerRings.map((outer) => [
      outer,
      ...innerRings.filter((inner) => pointInOsmRing(inner[0], outer)),
    ]);
    const geometry: OsmGeometry = polygons.length === 1
      ? { type: "Polygon", coordinates: polygons[0] }
      : { type: "MultiPolygon", coordinates: polygons };
    features.push(osmFeature("relation", id, tags, geometry));
  }

  return { type: "FeatureCollection", features };
}

export async function downloadOsmRegion(
  options: OsmRegionDownloadOptions,
  signal: AbortSignal,
): Promise<OsmOfflineMap> {
  const { south, west, north, east } = options;
  const name = options.name.trim() || "محدودهٔ آفلاین";
  if (
    ![south, west, north, east].every(Number.isFinite) ||
    south >= north ||
    west >= east ||
    south < -85.05112878 ||
    north > 85.05112878 ||
    west < -180 ||
    east > 180
  ) {
    throw new Error("چهار مختصات واردشده محدودهٔ معتبری نمی‌سازند");
  }
  if ((north - south) * (east - west) > MAX_OSM_BBOX_AREA) {
    throw new Error("محدوده برای دریافت از OpenStreetMap بزرگ است؛ مستطیل کوچک‌تری انتخاب کنید");
  }
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");

  const existingRecord = (await listMapRecords()).find(
    (record): record is StoredOsmMap =>
      record.kind === "osm" &&
      record.info.minLat === south &&
      record.info.minLon === west &&
      record.info.maxLat === north &&
      record.info.maxLon === east,
  );
  if (existingRecord) {
    const existingPackage = await activateOfflineMap(existingRecord.id);
    if (existingPackage.kind === "osm") return existingPackage;
  }

  const url = new URL(OSM_API_URL);
  url.searchParams.set("bbox", `${west},${south},${east},${north}`);
  let response: Response;
  try {
    response = await fetch(url, { signal, headers: { Accept: "application/xml" } });
  } catch (error) {
    if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
    throw new Error(`اتصال به OpenStreetMap ناموفق بود؛ ${error instanceof Error ? error.message : "دوباره تلاش کنید"}`);
  }
  if (response.status === 400) {
    throw new Error("OpenStreetMap این محدوده را بزرگ تشخیص داد؛ مستطیل کوچک‌تری انتخاب کنید");
  }
  if (response.status === 429 || response.status === 503 || response.status === 509) {
    throw new Error("سرویس OpenStreetMap موقتاً شلوغ است؛ کمی بعد دوباره تلاش کنید");
  }
  if (!response.ok) throw new Error(`دریافت داده از OpenStreetMap ناموفق بود (HTTP ${response.status})`);

  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_OSM_RESPONSE_BYTES) {
    throw new Error("دادهٔ این محدوده برای ذخیره در این دستگاه بیش از حد بزرگ است؛ محدوده را کوچک‌تر کنید");
  }
  const xml = await response.text();
  const responseBytes = new TextEncoder().encode(xml).byteLength;
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  if (responseBytes > MAX_OSM_RESPONSE_BYTES) {
    throw new Error("دادهٔ این محدوده برای ذخیره در این دستگاه بیش از حد بزرگ است؛ محدوده را کوچک‌تر کنید");
  }

  const data = parseOsmMapXml(xml);
  if (data.features.length === 0) {
    throw new Error("در این محدوده دادهٔ قابل‌نمایشی از OpenStreetMap پیدا نشد");
  }
  if (data.features.length > MAX_OSM_FEATURES) {
    throw new Error("دادهٔ این محدوده بیش از حد بزرگ است؛ مستطیل کوچک‌تری انتخاب کنید");
  }
  const sizeBytes = new TextEncoder().encode(JSON.stringify(data)).byteLength;
  if (sizeBytes > MAX_OSM_RESPONSE_BYTES) {
    throw new Error("دادهٔ این محدوده برای ذخیره در این دستگاه بیش از حد بزرگ است؛ محدوده را کوچک‌تر کنید");
  }

  try {
    await navigator.storage?.persist?.();
  } catch {
    // The browser may decline persistent-storage status; IndexedDB remains usable.
  }

  const id = makeId();
  const info: OfflineMapInfo = {
    id,
    kind: "osm",
    name,
    fileName: `${name}.geojson`,
    sizeBytes,
    tileCount: data.features.length,
    tileKind: "vector",
    minZoom: 0,
    maxZoom: 22,
    minLon: west,
    minLat: south,
    maxLon: east,
    maxLat: north,
    attribution: OSM_ATTRIBUTION,
  };
  const record: StoredOsmMap = { id, kind: "osm", info, data };
  const database = await openDatabase();
  if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
  const transaction = database.transaction([MAP_STORE, PREFERENCE_STORE], "readwrite");
  const abortTransaction = () => {
    try {
      transaction.abort();
    } catch {
      // It may have already completed.
    }
  };
  signal.addEventListener("abort", abortTransaction, { once: true });
  try {
    if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
    transaction.objectStore(MAP_STORE).put(record, id);
    transaction.objectStore(PREFERENCE_STORE).put(id, ACTIVE_MAP_KEY);
    await transactionComplete(transaction);
  } catch (error) {
    if (signal.aborted) throw new DOMException("Download cancelled", "AbortError");
    throw error;
  } finally {
    signal.removeEventListener("abort", abortTransaction);
  }

  offlineMaps.update((maps) => [info, ...maps]);
  const savedPackage: OsmOfflineMap = { kind: "osm", info, data };
  offlineMap.set(savedPackage);
  loadPromise = Promise.resolve(savedPackage);
  return savedPackage;
}
