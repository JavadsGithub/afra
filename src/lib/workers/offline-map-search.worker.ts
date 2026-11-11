/// <reference lib="webworker" />

import { VectorTile } from "@mapbox/vector-tile";
import { Compression, FileSource, PMTiles, TileType, tileIdToZxy, type Entry, type Header } from "pmtiles";
import { PbfReader } from "pbf";
import {
  normalizeSearchText,
  OFFLINE_SEARCH_INDEX_VERSION,
  type OfflineSearchEntry,
  type OfflineSearchLayer,
  type OfflineSearchWorkerRequest,
  type OfflineSearchWorkerResponse,
} from "$lib/services/offline-search";

const workerScope = self as DedicatedWorkerGlobalScope;
const PROGRESS_INTERVAL = 64;

let activeRequestId: string | null = null;
let cancelRequested = false;

function send(message: OfflineSearchWorkerResponse): void {
  workerScope.postMessage(message);
}

function isCancelled(requestId: string): boolean {
  return cancelRequested || activeRequestId !== requestId;
}

function yieldToWorker(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function* dataEntries(
  reader: PMTiles,
  header: Header,
  requestId: string,
): AsyncGenerator<Entry> {
  const directories = [{ offset: header.rootDirectoryOffset, length: header.rootDirectoryLength }];
  const visited = new Set<string>();

  while (directories.length > 0) {
    if (isCancelled(requestId)) return;
    const directory = directories.pop();
    if (!directory) continue;

    const key = `${directory.offset}:${directory.length}`;
    if (visited.has(key)) continue;
    visited.add(key);
    if (visited.size % PROGRESS_INTERVAL === 0) await yieldToWorker();

    const entries = await reader.cache.getDirectory(
      reader.source,
      directory.offset,
      directory.length,
      header,
    );
    for (const entry of entries) {
      if (entry.runLength === 0) {
        directories.push({
          offset: header.leafDirectoryOffset + entry.offset,
          length: entry.length,
        });
      } else {
        yield entry;
      }
    }
  }
}

function normalizeDetail(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/_/g, " ").trim()
    : "";
}

function geometryCenter(geometry: unknown): [number, number] | null {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  let sumLon = 0;
  let sumLat = 0;
  let count = 0;

  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (
      value.length >= 2 &&
      typeof value[0] === "number" &&
      typeof value[1] === "number" &&
      Number.isFinite(value[0]) &&
      Number.isFinite(value[1])
    ) {
      const lon = value[0];
      const lat = value[1];
      minLon = Math.min(minLon, lon);
      minLat = Math.min(minLat, lat);
      maxLon = Math.max(maxLon, lon);
      maxLat = Math.max(maxLat, lat);
      sumLon += lon;
      sumLat += lat;
      count++;
      return;
    }
    for (const child of value) visit(child);
  };

  if (geometry && typeof geometry === "object" && "coordinates" in geometry) {
    visit((geometry as { coordinates: unknown }).coordinates);
  }
  if (count === 0) return null;

  // Point collections are best represented by their average; lines and polygons by
  // their bounding-box center, which is less biased toward densely sampled vertices.
  const geometryType = (geometry as { type?: unknown }).type;
  if (geometryType === "Point" || geometryType === "MultiPoint") {
    return [sumLon / count, sumLat / count];
  }
  return [(minLon + maxLon) / 2, (minLat + maxLat) / 2];
}

function nameValues(properties: Record<string, unknown>): string[] {
  const values: string[] = [];
  const keys = Object.keys(properties).filter((key) =>
    key === "name" ||
    key === "name2" ||
    key === "name3" ||
    /^(?:name:[\w-]+|name_[\w-]+)$/i.test(key) ||
    /^(?:alt_name|int_name|short_name|old_name)$/i.test(key)
  );
  keys.sort((a, b) => {
    const rank = (key: string): number =>
      /^name:fa$/i.test(key) ? 0 :
      key === "name" ? 1 :
      /^(?:name:en|name_en)$/i.test(key) ? 2 :
      /^(?:name[2-3]|name[:_])/i.test(key) ? 3 : 4;
    return rank(a) - rank(b);
  });

  for (const key of keys) {
    const value = properties[key];
    if (typeof value !== "string") continue;
    const name = value.trim();
    if (
      name.length > 1 &&
      !values.some((existing) => normalizeSearchText(existing) === normalizeSearchText(name))
    ) {
      values.push(name);
    }
  }

  const reference = properties.ref;
  if (typeof reference === "string" && reference.trim().length > 1) {
    const ref = reference.trim();
    if (!values.some((existing) => normalizeSearchText(existing) === normalizeSearchText(ref))) {
      values.push(ref);
    }
  }
  return values;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

interface StoredEntry {
  entry: OfflineSearchEntry;
  zoom: number;
}

function addOrMergeEntry(
  indexed: Map<string, StoredEntry>,
  sourceLayer: OfflineSearchLayer,
  featureId: number | undefined,
  names: string[],
  properties: Record<string, unknown>,
  center: [number, number],
  zoom: number,
): void {
  const title = names[0];
  const searchText = normalizeSearchText(names.join(" "));
  if (!searchText) return;

  // Stable MVT IDs deduplicate the same OSM feature across tiles and zoom levels.
  // The spatial fallback also handles archives whose features do not carry IDs.
  const fallback = `${sourceLayer}:${searchText}:${Math.round(center[0] * 1000)}:${Math.round(center[1] * 1000)}`;
  const key = featureId === undefined
    ? fallback
    : `${sourceLayer}:feature:${featureId}`;
  const id = featureId === undefined
    ? `${sourceLayer}:${stableHash(fallback)}`
    : `${sourceLayer}:${featureId}`;
  const candidate: OfflineSearchEntry = {
    id,
    title,
    searchText,
    layer: sourceLayer,
    detail: normalizeDetail(properties.kind_detail ?? properties.class ?? properties.kind),
    lon: center[0],
    lat: center[1],
  };
  const previous = indexed.get(key);
  if (!previous) {
    indexed.set(key, { entry: candidate, zoom });
    return;
  }

  const mergedSearchText = normalizeSearchText(`${previous.entry.searchText} ${searchText}`);
  const preferred = zoom > previous.zoom ? candidate : previous.entry;
  indexed.set(key, {
    entry: { ...preferred, searchText: mergedSearchText },
    zoom: Math.max(previous.zoom, zoom),
  });
}

async function buildIndex(file: File, requestId: string): Promise<void> {
  const reader = new PMTiles(new FileSource(file));
  let header: Header;
  try {
    header = await reader.getHeader();
  } catch (error) {
    if (error instanceof Error && error.message.includes("Compression method not supported")) {
      throw new Error("فشرده‌سازی ساختار این بسته در جستجوی محلی پشتیبانی نمی‌شود");
    }
    throw error;
  }
  if (header.tileType !== TileType.Mvt) {
    throw new Error("جستجوی نام‌ها فقط برای نقشه‌های برداری پشتیبانی می‌شود");
  }
  if (
    header.tileCompression !== Compression.Unknown &&
    header.tileCompression !== Compression.None &&
    header.tileCompression !== Compression.Gzip
  ) {
    throw new Error("فشرده‌سازی کاشی‌های این بسته در جستجوی محلی پشتیبانی نمی‌شود");
  }
  if (header.numAddressedTiles <= 0) {
    throw new Error("بستهٔ نقشه هیچ کاشی برداری قابل جستجویی ندارد");
  }

  const indexed = new Map<string, StoredEntry>();
  let completed = 0;
  let unreadableTiles = 0;

  for await (const entry of dataEntries(reader, header, requestId)) {
    if (isCancelled(requestId)) {
      send({ type: "cancelled", requestId });
      return;
    }

    let vectorTile: VectorTile;
    try {
      const response = await reader.source.getBytes(
        header.tileDataOffset + entry.offset,
        entry.length,
        undefined,
        header.etag,
      );
      const tileData = await reader.decompress(response.data, header.tileCompression);
      vectorTile = new VectorTile(new PbfReader(tileData));
    } catch {
      unreadableTiles += entry.runLength;
      completed += entry.runLength;
      continue;
    }

    for (let tileOffset = 0; tileOffset < entry.runLength; tileOffset++) {
      if (isCancelled(requestId)) {
        send({ type: "cancelled", requestId });
        return;
      }

      const [zoom, x, y] = tileIdToZxy(entry.tileId + tileOffset);
      for (const [layerName, layer] of Object.entries(vectorTile.layers)) {
        const sourceLayer = layerName as OfflineSearchLayer;
        for (let featureIndex = 0; featureIndex < layer.length; featureIndex++) {
          if (featureIndex > 0 && featureIndex % 1024 === 0) {
            await yieldToWorker();
            if (isCancelled(requestId)) {
              send({ type: "cancelled", requestId });
              return;
            }
          }
          try {
            const feature = layer.feature(featureIndex);
            const properties = feature.properties;
            const names = nameValues(properties);
            if (names.length === 0) continue;

            const geometry = feature.toGeoJSON(x, y, zoom).geometry;
            const center = geometryCenter(geometry);
            if (!center || !center.every(Number.isFinite)) continue;

            addOrMergeEntry(
              indexed,
              sourceLayer,
              feature.id,
              names,
              properties,
              center,
              zoom,
            );
          } catch {
            // Skip malformed individual features while retaining the rest of the archive.
          }
        }
      }

      completed++;
      if (completed % PROGRESS_INTERVAL === 0) {
        send({
          type: "progress",
          requestId,
          completed,
          total: header.numAddressedTiles,
        });
        await yieldToWorker();
      }
    }
  }

  if (isCancelled(requestId)) {
    send({ type: "cancelled", requestId });
    return;
  }

  if (indexed.size === 0) {
    throw new Error("در این بسته نام قابل جستجویی پیدا نشد");
  }

  const index: OfflineSearchEntry[] = [...indexed.values()].map(({ entry }) => entry);
  send({
    type: "complete",
    requestId,
    index: {
      version: OFFLINE_SEARCH_INDEX_VERSION,
      maxZoom: header.maxZoom,
      entries: index,
    },
    unreadableTiles,
  });
}

workerScope.onmessage = (event: MessageEvent<OfflineSearchWorkerRequest>) => {
  const message = event.data;
  if (message.type === "cancel") {
    if (message.requestId === activeRequestId) cancelRequested = true;
    return;
  }
  if (message.type !== "build") return;

  activeRequestId = message.requestId;
  cancelRequested = false;
  void buildIndex(message.file, message.requestId).catch((error: unknown) => {
    if (isCancelled(message.requestId)) {
      send({ type: "cancelled", requestId: message.requestId });
      return;
    }
    send({
      type: "error",
      requestId: message.requestId,
      error: error instanceof Error ? error.message : "ساخت فهرست جستجو ناموفق بود",
    });
  });
};

export {};
