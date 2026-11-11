<script lang="ts">
  import {
    addProtocol,
    Map as MapLibreMapClass,
    Marker as MapLibreMarkerClass,
    removeProtocol,
    setWorkerUrl,
    type Map as MapLibreMap,
    type MapMouseEvent,
    type Marker as MapLibreMarker,
    type StyleSpecification,
  } from "maplibre-gl";
  import mapLibreWorkerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
  import { layers as protomapsLayers, namedFlavor } from "@protomaps/basemaps";
  import { Protocol, TileType } from "pmtiles";
  import { onMount } from "svelte";
  import {
    activateOfflineMap,
    loadSavedOfflineMaps,
    offlineMap,
    offlineMaps,
    type OfflineMapPackage,
    type PmtilesOfflineMap,
  } from "$lib/services/offline-maps";
  import {
    type Pin,
    addPin,
    deletePin as deletePinBackend,
    loadPins,
    updatePin,
  } from "$lib/services/pins";
  import { scanPorts } from "$lib/services/ports";
  import { mapActions } from "$lib/stores/map-actions";
  import { settings, isPortConnected, updateMode } from "$lib/stores/settings";
  import { telemetryData, lastTelemetry } from "$lib/stores/telemetry";
  import {
    deleteOfflineSearchIndex,
    loadOfflineSearchIndex,
    normalizeSearchText,
    saveOfflineSearchIndex,
    searchOfflineMapIndex,
    type OfflineSearchEntry,
    type OfflineSearchIndex,
    type OfflineSearchWorkerResponse,
  } from "$lib/services/offline-search";
  import { ChevronDown, Copy, LocateFixed, MapPin, Navigation2 as Navigation, Search } from "lucide-svelte";
  import { sendPins } from "$lib/services/transmitter";
  import { connectionStatus } from "$lib/stores/settings";
  import { get } from "svelte/store";

  const LOCAL_BASEMAP_ASSETS = `${import.meta.env.BASE_URL}basemap-assets`;

  const EMPTY_MAP_STYLE: StyleSpecification = {
    version: 8,
    sources: {},
    layers: [{
      id: "offline-background",
      type: "background",
      paint: { "background-color": "#e8e7e2" },
    }],
  };

  let mapContainer: HTMLDivElement;
  let map: MapLibreMap | null = null;
  let pmtilesProtocol: Protocol | null = null;
  let unsubscribeOfflineMap: (() => void) | null = null;
  let offlineMapsLoading = $state(true);
  let isActivatingOfflineMap = $state(false);
  let offlineMapActivationError = $state("");
  let offlineSearchQuery = $state("");
  let offlineSearchResultSelected = $state(false);
  let offlineSearchResults = $state<OfflineSearchEntry[]>([]);
  let offlineSearchIndex = $state.raw<OfflineSearchIndex | null>(null);
  let offlineSearchState = $state<"idle" | "loading" | "building" | "ready" | "error" | "unsupported">("idle");
  let offlineSearchError = $state("");
  let offlineSearchCacheWarning = $state("");
  let offlineSearchCompleted = $state(0);
  let offlineSearchTotal = $state(0);
  let offlineSearchUnreadableTiles = $state(0);
  let offlineSearchWorker: Worker | null = null;
  let offlineSearchRequestId: string | null = null;
  let offlineSearchMapId: string | null = null;
  let offlineSearchGeneration = 0;
  let offlineSearchRequestSequence = 0;
  let searchResultMarker: MapLibreMarker | null = null;
  let pinMarkers = new Map<number, MapLibreMarker>();
  let locationMarker: MapLibreMarker | null = null;
  let currentPosition = $state({ lat: 35.6895, lng: 51.389 });
  let coordinates = $state("0, 0");

  let backendPins = $state<Pin[]>([]);
  let routesLayer = $state(false);
  let objectsLayer = $state(true);
  let showContextMenu = $state(false);
  let contextMenuPosition = $state({ x: 0, y: 0 });
  let contextMenuLatLng = $state({ lat: 0, lng: 0 });
  let contextMenuPinId = $state<number | null>(null);

  // Pin details modal state
  let showPinDetailsModal = $state(false);
  let selectedPin = $state<Pin | null>(null);
  let editDepth = $state(0);
  let editSpeed = $state(0);
  let editUnderWaterTime = $state(0);
  let editMissionTime = $state(0);

  // Command loop state
  let isCommandLoopActive = $state(false);
  // Collapsible panels state
  let showMapControls = $state(true);
  let showNavigationControls = $state(true);
  let showStatusInfo = $state(true);

  // Send command modal state
  let showSendCommandModal = $state(false);

  let showDataLogs = $state(true);
  let showSentPins = $state(true);
  let expandedLog = $state(false);

  interface PinFrame {
    id: number;
    time: string;
    pins: Pin[];
  }
  let pinFrames = $state<PinFrame[]>([]);

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character) => {
      const replacements: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return replacements[character] ?? character;
    });
  }

  function rasterTileExtension(tileType: TileType): string {
    switch (tileType) {
      case TileType.Png:
        return ".png";
      case TileType.Jpeg:
        return ".jpg";
      case TileType.Webp:
        return ".webp";
      case TileType.Avif:
        return ".avif";
      default:
        return "";
    }
  }

  function offlineStyleFor(packageInfo: PmtilesOfflineMap): StyleSpecification {
    const sourceId = "local-basemap";
    const sourceKey = `afra-local/${packageInfo.info.id}`;
    const attribution = escapeHtml(packageInfo.info.attribution);
    const bounds: [number, number, number, number] = [
      packageInfo.info.minLon,
      packageInfo.info.minLat,
      packageInfo.info.maxLon,
      packageInfo.info.maxLat,
    ];

    if (packageInfo.info.tileKind === "raster") {
      return {
        version: 8,
        sources: {
          [sourceId]: {
            type: "raster",
            tiles: [
              `pmtiles://${sourceKey}/{z}/{x}/{y}${rasterTileExtension(packageInfo.header.tileType)}`,
            ],
            tileSize: 256,
            minzoom: packageInfo.info.minZoom,
            maxzoom: packageInfo.info.maxZoom,
            bounds,
            attribution,
          },
        },
        layers: [
          {
            id: "offline-background",
            type: "background",
            paint: { "background-color": "#e8e7e2" },
          },
          {
            id: "offline-raster",
            type: "raster",
            source: sourceId,
            paint: { "raster-fade-duration": 0 },
          },
        ],
      };
    }

    return {
      version: 8,
      sprite: `${LOCAL_BASEMAP_ASSETS}/sprites/v4/light`,
      glyphs: `${LOCAL_BASEMAP_ASSETS}/fonts/{fontstack}/{range}.pbf`,
      sources: {
        [sourceId]: {
          type: "vector",
          url: `pmtiles://${sourceKey}`,
          bounds,
          attribution,
        },
      },
      // Persian labels are rendered using bundled glyphs and sprites, with no remote assets.
      layers: protomapsLayers(
        sourceId,
        namedFlavor("light"),
        { lang: "fa" },
      ) as unknown as StyleSpecification["layers"],
    };
  }

  async function handleOfflineMapSelection(event: Event): Promise<void> {
    const selectedId = (event.currentTarget as HTMLSelectElement).value;
    if (!selectedId || selectedId === get(offlineMap)?.info.id) return;

    offlineMapActivationError = "";
    isActivatingOfflineMap = true;
    try {
      await activateOfflineMap(selectedId);
    } catch (error) {
      offlineMapActivationError = error instanceof Error
        ? error.message
        : "فعال‌سازی نقشه آفلاین ناموفق بود";
    } finally {
      isActivatingOfflineMap = false;
    }
  }

  function focusOfflineMapCenter(): void {
    if (!map) return;
    const packageInfo = get(offlineMap);
    if (!packageInfo) return;

    const { minLon, minLat, maxLon, maxLat } = packageInfo.info;
    if (![minLon, minLat, maxLon, maxLat].every(Number.isFinite)) return;

    map.easeTo({
      center: [(minLon + maxLon) / 2, (minLat + maxLat) / 2],
      duration: 500,
    });
  }

  function syncOfflineMap(packageInfo: OfflineMapPackage | null): void {
    if (!map) return;
    if (!packageInfo) {
      map.setStyle(EMPTY_MAP_STYLE);
      return;
    }

    pmtilesProtocol?.add(packageInfo.pmtiles);
    map.setStyle(offlineStyleFor(packageInfo));
    const info = packageInfo.info;
    if (
      [info.minLon, info.minLat, info.maxLon, info.maxLat].every(Number.isFinite) &&
      info.minLon < info.maxLon &&
      info.minLat < info.maxLat
    ) {
      map.fitBounds(
        [[info.minLon, info.minLat], [info.maxLon, info.maxLat]],
        { padding: 24, maxZoom: Math.min(13, info.maxZoom), duration: 0 },
      );
    }
  }

  function stopOfflineSearchWorker(): void {
    offlineSearchWorker?.terminate();
    offlineSearchWorker = null;
    offlineSearchRequestId = null;
  }

  function updateOfflineSearchResults(): void {
    if (offlineSearchResultSelected || !offlineSearchIndex || offlineSearchState !== "ready") {
      offlineSearchResults = [];
      return;
    }

    const normalizedQuery = normalizeSearchText(offlineSearchQuery);
    if ([...normalizedQuery].length < 2) {
      offlineSearchResults = [];
      return;
    }

    const center = map?.getCenter();
    const origin: [number, number] = center
      ? [center.lng, center.lat]
      : [currentPosition.lng, currentPosition.lat];
    offlineSearchResults = searchOfflineMapIndex(offlineSearchIndex, offlineSearchQuery, origin, 8);
  }

  function startOfflineSearchIndex(): void {
    const packageInfo = get(offlineMap);
    if (
      !packageInfo ||
      packageInfo.info.tileKind !== "vector" ||
      packageInfo.info.id !== offlineSearchMapId ||
      offlineSearchWorker ||
      offlineSearchState === "building"
    ) {
      return;
    }

    offlineSearchState = "building";
    offlineSearchError = "";
    offlineSearchCacheWarning = "";
    offlineSearchCompleted = 0;
    offlineSearchTotal = packageInfo.header.numAddressedTiles;
    const requestId = `offline-search-${Date.now()}-${++offlineSearchRequestSequence}`;
    offlineSearchRequestId = requestId;

    try {
      const worker = new Worker(
        new URL("../../workers/offline-map-search.worker.ts", import.meta.url),
        { type: "module" },
      );
      offlineSearchWorker = worker;
      worker.onmessage = (event: MessageEvent<OfflineSearchWorkerResponse>) => {
        const message = event.data;
        if (
          message.requestId !== offlineSearchRequestId ||
          packageInfo.info.id !== offlineSearchMapId
        ) {
          return;
        }

        if (message.type === "progress") {
          offlineSearchCompleted = message.completed;
          offlineSearchTotal = message.total;
          return;
        }
        if (message.type === "cancelled") {
          stopOfflineSearchWorker();
          offlineSearchState = "idle";
          return;
        }
        if (message.type === "error") {
          stopOfflineSearchWorker();
          offlineSearchState = "error";
          offlineSearchError = message.error;
          return;
        }

        stopOfflineSearchWorker();
        offlineSearchIndex = message.index;
        offlineSearchState = "ready";
        offlineSearchUnreadableTiles = message.unreadableTiles ?? 0;
        updateOfflineSearchResults();

        void saveOfflineSearchIndex(packageInfo.info.id, message.index)
          .then(async () => {
            if (!get(offlineMaps).some((item) => item.id === packageInfo.info.id)) {
              await deleteOfflineSearchIndex(packageInfo.info.id);
            }
          })
          .catch((error: unknown) => {
            if (offlineSearchMapId === packageInfo.info.id) {
              offlineSearchCacheWarning = error instanceof Error
                ? "فهرست آماده است، اما ذخیرهٔ ماندگار آن ناموفق بود."
                : "فهرست آماده است، اما ذخیرهٔ ماندگار آن ممکن نشد.";
            }
          });
      };
      worker.onerror = (event: ErrorEvent) => {
        if (offlineSearchRequestId !== requestId) return;
        stopOfflineSearchWorker();
        offlineSearchState = "error";
        offlineSearchError = event.message || "ساخت فهرست جستجو ناموفق بود";
      };
      worker.postMessage({ type: "build", requestId, file: packageInfo.file });
    } catch (error) {
      stopOfflineSearchWorker();
      offlineSearchState = "error";
      offlineSearchError = error instanceof Error
        ? error.message
        : "ساخت فهرست جستجو ناموفق بود";
    }
  }

  function cancelOfflineSearchIndex(): void {
    if (offlineSearchWorker && offlineSearchRequestId) {
      offlineSearchWorker.postMessage({ type: "cancel", requestId: offlineSearchRequestId });
    }
    stopOfflineSearchWorker();
    offlineSearchState = "idle";
    offlineSearchCompleted = 0;
    offlineSearchResults = [];
  }

  function handleOfflineSearchInput(event: Event): void {
    offlineSearchQuery = (event.currentTarget as HTMLInputElement).value;
    offlineSearchResultSelected = false;
    offlineSearchResults = [];
    if ([...normalizeSearchText(offlineSearchQuery)].length < 2) return;

    if (offlineSearchState === "ready") updateOfflineSearchResults();
    else if (offlineSearchState === "idle" || offlineSearchState === "error") {
      startOfflineSearchIndex();
    }
  }

  function handleOfflineSearchKeydown(event: KeyboardEvent): void {
    if (event.key === "Enter" && offlineSearchResults.length > 0) {
      event.preventDefault();
      focusOfflineSearchResult(offlineSearchResults[0]);
    }
  }

  function focusOfflineSearchResult(entry: OfflineSearchEntry): void {
    if (!map) return;
    currentPosition = { lat: entry.lat, lng: entry.lon };
    searchResultMarker?.remove();
    searchResultMarker = new MapLibreMarkerClass({ color: "#16a34a" })
      .setLngLat([entry.lon, entry.lat])
      .addTo(map);

    const archiveMaxZoom = offlineSearchIndex?.maxZoom ?? 15;
    map.easeTo({
      center: [entry.lon, entry.lat],
      zoom: Math.min(Math.max(map.getZoom(), 13), archiveMaxZoom),
      duration: 650,
    });
    offlineSearchQuery = entry.title;
    offlineSearchResultSelected = true;
    offlineSearchResults = [];
  }

  function searchLayerLabel(layer: OfflineSearchEntry["layer"]): string {
    switch (layer) {
      case "earth": return "منطقه";
      case "landcover": return "پوشش زمین";
      case "landuse": return "کاربری زمین";
      case "places": return "مکان";
      case "pois": return "نقطهٔ موردعلاقه";
      case "roads": return "راه";
      case "water": return "آبراه یا پهنهٔ آبی";
      case "buildings": return "ساختمان";
      case "boundaries": return "مرز";
      default: return layer.replace(/[_-]/g, " ");
    }
  }

  function handleOfflineMapChange(packageInfo: OfflineMapPackage | null): void {
    syncOfflineMap(packageInfo);
    const mapId = packageInfo?.info.id ?? null;
    if (mapId === offlineSearchMapId) return;

    offlineSearchMapId = mapId;
    const generation = ++offlineSearchGeneration;
    stopOfflineSearchWorker();
    offlineSearchIndex = null;
    offlineSearchResultSelected = false;
    offlineSearchResults = [];
    offlineSearchError = "";
    offlineSearchCacheWarning = "";
    offlineSearchCompleted = 0;
    offlineSearchTotal = 0;
    offlineSearchUnreadableTiles = 0;
    searchResultMarker?.remove();
    searchResultMarker = null;

    if (!packageInfo) {
      offlineSearchState = "idle";
      return;
    }
    if (packageInfo.info.tileKind !== "vector") {
      offlineSearchState = "unsupported";
      return;
    }

    const activeMapId = packageInfo.info.id;
    offlineSearchState = "loading";
    void loadOfflineSearchIndex(activeMapId).then((index) => {
      if (generation !== offlineSearchGeneration || offlineSearchMapId !== activeMapId) return;
      if (index) {
        offlineSearchIndex = index;
        offlineSearchState = "ready";
        updateOfflineSearchResults();
        return;
      }
      offlineSearchState = "idle";
      if ([...normalizeSearchText(offlineSearchQuery)].length >= 2) {
        startOfflineSearchIndex();
      }
    }).catch((error: unknown) => {
      if (generation !== offlineSearchGeneration || offlineSearchMapId !== activeMapId) return;
      offlineSearchState = "error";
      offlineSearchError = error instanceof Error
        ? error.message
        : "فهرست جستجوی محلی بارگذاری نشد";
    });
  }

  function updateMarkersOnMap(): void {
    if (!map) return;
    for (const marker of pinMarkers.values()) marker.remove();
    pinMarkers.clear();

    for (const pin of backendPins) {
      const marker = new MapLibreMarkerClass({ color: "#dc2626" })
        .setLngLat([pin.lng, pin.lat])
        .addTo(map);
      marker.getElement().addEventListener("click", (event: MouseEvent) => {
        event.stopPropagation();
        onPinSelected(pin);
      });
      pinMarkers.set(pin.id, marker);
    }
  }

  onMount(() => {
    let isDisposed = false;
    pmtilesProtocol = new Protocol({ metadata: false });
    addProtocol("pmtiles", pmtilesProtocol.tile);
    // Load MapLibre's worker as a Vite-managed asset so it works in dev and in Tauri builds.
    setWorkerUrl(mapLibreWorkerUrl);

    const mapInstance = new MapLibreMapClass({
      container: mapContainer,
      style: EMPTY_MAP_STYLE,
      center: [currentPosition.lng, currentPosition.lat],
      zoom: 13,
      maxZoom: 22,
    });
    map = mapInstance;

    mapInstance.on("click", (event: MapMouseEvent) => {
      currentPosition = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      coordinates = `${event.lngLat.lat.toFixed(6)}, ${event.lngLat.lng.toFixed(6)}`;
      showContextMenu = false;
    });

    mapInstance.on("contextmenu", (event: MapMouseEvent) => {
      const nativeEvent = event.originalEvent;
      nativeEvent.preventDefault();
      const mapBounds = mapContainer.getBoundingClientRect();
      let x = nativeEvent.clientX - mapBounds.left;
      let y = nativeEvent.clientY - mapBounds.top;
      const menuWidth = 150;
      const menuHeight = 40;
      if (x + menuWidth > mapBounds.width) x = Math.max(0, x - menuWidth);
      if (y + menuHeight > mapBounds.height) y = Math.max(0, y - menuHeight);

      contextMenuPosition = { x, y };
      contextMenuLatLng = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      contextMenuPinId = null;
      for (const pin of backendPins) {
        if (
          Math.abs(pin.lat - event.lngLat.lat) < 0.0001 &&
          Math.abs(pin.lng - event.lngLat.lng) < 0.0001
        ) {
          contextMenuPinId = pin.id;
          break;
        }
      }
      showContextMenu = true;
    });

    mapInstance.on("moveend", () => {
      const center = mapInstance.getCenter();
      coordinates = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
      updateOfflineSearchResults();
    });

    const handleOutsideClick = (event: Event) => {
      if (showContextMenu && !mapContainer.contains(event.target as Node)) {
        showContextMenu = false;
      }
    };
    document.addEventListener("click", handleOutsideClick);

    unsubscribeOfflineMap = offlineMap.subscribe(handleOfflineMapChange);
    void loadSavedOfflineMaps()
      .catch((error) => {
        // There is deliberately no network fallback if local map data is unavailable.
        console.error("Could not load local PMTiles map:", error);
      })
      .finally(() => {
        offlineMapsLoading = false;
      });

    loadPins()
      .then((pins) => {
        if (isDisposed) return;
        backendPins = pins;
        updateMarkersOnMap();
      })
      .catch((error) => console.error("Error loading pins:", error));

    if (!$settings.port) {
      scanPorts()
        .then((ports) => {
          if (ports.length > 0) {
            $settings.port = ports[0].path;
            console.log("Receiver not implemented");
          }
        })
        .catch(() => {});
    }

    return () => {
      isDisposed = true;
      offlineSearchGeneration++;
      stopOfflineSearchWorker();
      searchResultMarker?.remove();
      searchResultMarker = null;
      unsubscribeOfflineMap?.();
      unsubscribeOfflineMap = null;
      document.removeEventListener("click", handleOutsideClick);
      for (const marker of pinMarkers.values()) marker.remove();
      pinMarkers.clear();
      locationMarker?.remove();
      locationMarker = null;
      map?.remove();
      map = null;
      removeProtocol("pmtiles");
      pmtilesProtocol?.tiles.clear();
      pmtilesProtocol = null;
    };
  });

  // Handle layer toggles
  $effect(() => {
    if (map && routesLayer) console.log("Routes layer enabled");
  });

  $effect(() => {
    if (map && objectsLayer) console.log("Objects layer enabled");
  });

  function zoomIn(): void {
    map?.zoomIn();
  }

  function zoomOut(): void {
    map?.zoomOut();
  }

  function markLocation(): void {
    if (!map) return;
    locationMarker?.remove();
    locationMarker = new MapLibreMarkerClass({ color: "#2563eb" })
      .setLngLat([currentPosition.lng, currentPosition.lat])
      .addTo(map);
    map.easeTo({ center: [currentPosition.lng, currentPosition.lat], zoom: 15 });
  }

  function measureDistance(): void {
    alert("اندازه گیری فاصله");
  }

  // Function to insert a pin at the context menu location
  async function insertPin(): Promise<void> {
    if (map && contextMenuLatLng) {
      try {
        const newPin = await addPin(
          Date.now(),
          contextMenuLatLng.lat,
          contextMenuLatLng.lng,
          0,
          0,
          0,
          0,
        );

        // Update local state and refresh markers
        backendPins.push(newPin);
        updateMarkersOnMap();

        // Close the context menu
        showContextMenu = false;
      } catch (error) {
        console.error("Error adding pin:", error);
        alert("خطا در افزودن پین: " + (error as Error).message);
      }
    }
  }

  // Function to delete a pin
  async function deletePin(pinId: number): Promise<void> {
    // Remove the pin using the backend service
    const success = await deletePinBackend(pinId);

    if (success) {
      // Update local state and refresh markers
      backendPins = backendPins.filter((pin) => pin.id !== pinId);
      updateMarkersOnMap();
    }

    // Close the context menu
    showContextMenu = false;
  }

  function onPinSelected(pin: Pin): void {
    selectedPin = { ...pin };
    editDepth = pin.depth || 0;
    editSpeed = pin.speed || 0;
    editUnderWaterTime = pin.under_water_time || 0;
    editMissionTime = pin.mission_time || 0;
    showPinDetailsModal = true;
  }

  async function savePinDetails(): Promise<void> {
    if (selectedPin) {
      try {
        const success = await updatePin(
          selectedPin.id,
          selectedPin.lat,
          selectedPin.lng,
          editDepth,
          editSpeed,
          editUnderWaterTime,
          editMissionTime,
        );

        if (success && selectedPin) {
          const index = backendPins.findIndex(
            (pin) => selectedPin && pin.id === selectedPin.id,
          );
          if (index !== -1) {
            backendPins[index] = {
              ...selectedPin,
              depth: editDepth,
              speed: editSpeed,
              under_water_time: editUnderWaterTime,
              mission_time: editMissionTime,
            };
            updateMarkersOnMap();
          }
        }

        showPinDetailsModal = false;
      } catch (error) {
        alert("خطا در ذخیره پین: " + (error as Error).message);
      }
    }
  }

  // Function to close context menu
  function closeContextMenu(): void {
    showContextMenu = false;
  }

  // Sync map actions with sidebar store
  $effect(() => {
    mapActions.set({
      onToggleCommand: isCommandLoopActive
        ? toggleCommandLoop
        : () => (showSendCommandModal = true),
      commandLoopActive: isCommandLoopActive,
      hasPins: backendPins.length > 0,
      hasPort: Boolean($settings.port),
    });
  });

  // Function to toggle between transmit and receive
  async function toggleCommandLoop(): Promise<void> {
    alert("تغییر وضعیت فرستنده/گیرنده پیاده‌سازی نشده است");
  }

  let frameCounter = 0;

  function capturePinFrame() {
    pinFrames = [
      {
        id: ++frameCounter,
        time: new Date().toLocaleTimeString("fa-IR"),
        pins: [...backendPins],
      },
      ...pinFrames,
    ];
  }

  async function sendCommand(): Promise<void> {
    const status = get(connectionStatus);

    if (status !== "connected") {
      alert("پورت سریال متصل نیست. لطفاً ابتدا متصل شوید.");
      return;
    }

    try {
      const pins = await loadPins();
      if (pins.length === 0) {
        alert("هیچ نقطه‌ای برای ارسال وجود ندارد");
        return;
      }
      updateMode("sending");
      const response = await sendPins(pins);
      console.log("Send pins response:", response);
      alert("نقاط با موفقیت ارسال شدند");
    } catch (err) {
      console.error("Send failed:", err);
      if (err == "Timeout waiting for ACK") {
        alert("پاسخی دریافت نشد");
      } else alert("ارسال دستورات ناموفق بود");
    } finally {
      updateMode("idle");
    }
  }

  function handleKeydown(e: KeyboardEvent): void {
    switch (e.key) {
      case "Escape":
        closeContextMenu();
        break;
      case "Enter":
        if (contextMenuPinId) {
          deletePin(contextMenuPinId);
        } else {
          insertPin();
        }
        break;
      case " ":
        e.preventDefault(); // Prevent page scrolling on spacebar
        if (contextMenuPinId) {
          deletePin(contextMenuPinId);
        } else {
          insertPin();
        }
        break;
    }
  }
</script>

<div class="flex flex-col h-screen p-0 m-0">
  <div class="relative flex-grow">
    <div
      id="map"
      bind:this={mapContainer}
      class="h-full w-full"
      style="z-index: 1;"
    ></div>

    <!-- Direction & Depth indicators -->
    <div class="absolute top-3 left-3 z-[1000] flex gap-2">
      <div class="flex flex-col gap-2">
        <!-- Direction indicator -->
        <div
          class="bg-white/30 bg-opacity-60 backdrop-blur-md rounded-full w-14 h-14 flex items-center justify-center shadow-lg"
          title="جهت ربات: {$lastTelemetry ? $lastTelemetry.yaw : 0}"
        >
          <div
            class="transition-transform duration-300"
            style="transform: rotate({$lastTelemetry ? $lastTelemetry.yaw : 0}deg)"
          >
            <Navigation class="h-6 w-6 text-blue-600" />
          </div>
        </div>

        <!-- Depth gauge -->
        <div
          class="bg-white/30 bg-opacity-60 backdrop-blur-md rounded-full w-14 h-14 flex items-center justify-center shadow-lg"
          title="عمق: {$lastTelemetry ? $lastTelemetry.depth.toFixed(1) : '—'} متر"
        >
          <svg
            class="absolute inset-0 w-full h-full -rotate-90"
            viewBox="0 0 56 56"
          >
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              class="text-gray-300"
            />
            <circle
              cx="28"
              cy="28"
              r="22"
              fill="none"
              stroke="currentColor"
              stroke-width="3"
              class="text-blue-500"
              stroke-dasharray={138.23}
              stroke-dashoffset={$lastTelemetry
                ? 138.23 - 138.23 * Math.min($lastTelemetry.depth / 100, 1)
                : 138.23}
              stroke-linecap="round"
            />
          </svg>
          <span class="text-xs font-bold text-blue-600 z-10">
            {$lastTelemetry ? $lastTelemetry.depth.toFixed(0) : "—"}
          </span>
        </div>
      </div>
      <!-- Latest log vertical card -->
      {#if $lastTelemetry}
        <div
          class="bg-white/30 bg-opacity-60 backdrop-blur-md rounded-lg shadow-lg px-3 py-2 min-w-[140px]"
        >
          <div class="flex justify-between items-center mb-1">
            <span class="text-[10px] text-gray-400">آخرین وضعیت</span>
            <button
              class="btn btn-xs btn-square text-gray-400"
              onclick={() => (expandedLog = !expandedLog)}
            >
              <ChevronDown
                class="h-3.5 w-3.5 transition-transform duration-200"
                style={expandedLog ? "transform: rotate(180deg)" : ""}
              />
            </button>
          </div>
          <div class="grid grid-cols-2 gap-x-3 gap-y-0.5 text-xs" dir="ltr">
            <span class="text-gray-500">speed</span>
            <span class="font-mono text-right">{$lastTelemetry.speed.toFixed(2)}</span>
            <span class="text-gray-500">latitude</span>
            <span class="font-mono text-right"
              >{$lastTelemetry.latitude.toFixed(4)}</span
            >
            <span class="text-gray-500">longitude</span>
            <span class="font-mono text-right"
              >{$lastTelemetry.longitude.toFixed(4)}</span
            >
            <span class="text-gray-500">ampere</span>
            <span class="font-mono text-right">{$lastTelemetry.ampere.toFixed(1)}</span
            >
            {#if expandedLog}
              <span class="text-gray-500">depth</span>
              <span class="font-mono text-right"
                >{$lastTelemetry.depth.toFixed(1)}</span
              >
              <span class="text-gray-500">yaw</span>
              <span class="font-mono text-right">{$lastTelemetry.yaw.toFixed(1)}</span>
              <span class="text-gray-500">rps</span>
              <span class="font-mono text-right">{$lastTelemetry.rps.toFixed(1)}</span>
              <span class="text-gray-500">wtd</span>
              <span class="font-mono text-right"
                >{Math.floor($lastTelemetry.wtd / 3600)
                  .toString()
                  .padStart(2, "0")}:{Math.floor(($lastTelemetry.wtd % 3600) / 60)
                  .toString()
                  .padStart(2, "0")}:{($lastTelemetry.wtd % 60)
                  .toString()
                  .padStart(2, "0")}</span
              >
              <span class="text-gray-500">temperature</span>
              <span class="font-mono text-right"
                >{$lastTelemetry.temperature.toFixed(1)}°C</span
              >
              <span class="text-gray-500">battery</span>
              <span class="font-mono text-right"
                >{$lastTelemetry.battery_level.toFixed(0)}%</span
              >
              <span class="text-gray-500">status</span>
              <span class="font-mono text-right"
                >{$lastTelemetry.status === 1
                  ? "active"
                  : $lastTelemetry.status === 0
                    ? "idle"
                    : "error"}</span
              >
              <span class="text-gray-500">error</span>
              <span class="font-mono text-right"
                >{$lastTelemetry.error === 0 ? "none" : $lastTelemetry.error}</span
              >
              <span class="text-gray-500">mission_id</span>
              <span class="font-mono text-right">{$lastTelemetry.mission_id}</span>
            {/if}
          </div>
        </div>
      {/if}
    </div>

    <!-- Context menu -->
    {#if showContextMenu}
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="absolute top-0 left-0 dropdown dropdown-open"
        style="position: absolute; top: {contextMenuPosition.y}px; left: {contextMenuPosition.x}px;"
        role="menu"
        aria-label="Context menu"
        tabindex="-1"
        onclick={(e) => e.stopPropagation()}
        onkeydown={handleKeydown}
      >
        <ul
          class="dropdown-content menu bg-base-100 text-base-content rounded-box z-[1000] w-52 p-2 shadow-2xl"
          role="menubar"
        >
          {#if contextMenuPinId}
            <!-- Context menu for existing pin -->
            <li>
              <button
                onclick={() => deletePin(contextMenuPinId!)}
                onkeydown={(e) =>
                  e.key === "Enter" && deletePin(contextMenuPinId!)}
                role="menuitem"
                class="hover:bg-base-200"
              >
                <span>حذف پین</span>
              </button>
            </li>
          {:else}
            <!-- Context menu for empty area -->
            <li>
              <button
                onclick={insertPin}
                onkeydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    insertPin();
                  }
                }}
                role="menuitem"
                class="hover:bg-base-200"
              >
                <span>قرار دادن پین</span>
              </button>
            </li>
          {/if}
        </ul>
      </div>
    {/if}

    <!-- Pin Details Modal -->
    {#if showPinDetailsModal && selectedPin}
      <div
        class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999] p-4"
      >
        <div
          class="bg-base-100 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        >
          <div class="p-6">
            <div class="flex justify-between items-center mb-4">
              <h3 class="text-xl font-bold">جزئیات پین</h3>
              <button
                class="btn btn-sm btn-circle btn-ghost"
                onclick={() => (showPinDetailsModal = false)}
              >
                ✕
              </button>
            </div>

            <div class="space-y-4">
              <div>
                <div class="label">
                  <span class="label-text">مختصات</span>
                </div>
                <div class="p-3 bg-base-200 rounded">
                  <p>
                    طول جغرافیایی: {selectedPin.lat.toFixed(6)}
                  </p>
                  <p>
                    عرض جغرافیایی: {selectedPin.lng.toFixed(6)}
                  </p>
                </div>
              </div>

              <div>
                <label class="label" for="pin-depth">
                  <span class="label-text">عمق</span>
                </label>
                <input
                  id="pin-depth"
                  type="number"
                  class="input input-bordered w-full"
                  bind:value={editDepth}
                  placeholder="عمق"
                  step="any"
                />
              </div>
              <div>
                <label class="label" for="pin-speed">
                  <span class="label-text">سرعت</span>
                </label>
                <input
                  id="pin-speed"
                  type="number"
                  class="input input-bordered w-full"
                  bind:value={editSpeed}
                  placeholder="سرعت"
                  step="any"
                />
              </div>
              <div>
                <label class="label" for="pin-under-water-time">
                  <span class="label-text">مدت زمان زیر آب</span>
                </label>
                <input
                  id="pin-under-water-time"
                  type="number"
                  class="input input-bordered w-full"
                  bind:value={editUnderWaterTime}
                  placeholder="مدت زمان زیر آب"
                  step="any"
                />
              </div>
              <div>
                <label class="label" for="pin-mission-time">
                  <span class="label-text">زمان ماموریت</span>
                </label>
                <input
                  id="pin-mission-time"
                  type="number"
                  class="input input-bordered w-full"
                  bind:value={editMissionTime}
                  placeholder="زمان ماموریت"
                  step="any"
                />
              </div>
            </div>

            <div class="flex justify-between mt-6">
              <button
                class="btn btn-error"
                onclick={async () => {
                  if (selectedPin) {
                    await deletePin(selectedPin.id);
                    showPinDetailsModal = false;
                  }
                }}
              >
                حذف
              </button>
              <div class="flex gap-2">
                <button
                  class="btn btn-outline"
                  onclick={() => (showPinDetailsModal = false)}
                >
                  لغو
                </button>
                <button class="btn btn-primary" onclick={savePinDetails}>
                  ذخیره تغییرات
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    {/if}

    <!-- Collapsible Sidebar with controls -->
    <div class="absolute top-4 right-4 z-[1000] w-56 space-y-2">
      <!-- Offline map package selector -->
      <div class="rounded-lg bg-white/80 p-3 shadow-lg backdrop-blur-md">
        <label class="mb-2 block text-sm font-medium" for="offline-map-package">
          نقشهٔ آفلاین
        </label>
        {#if offlineMapsLoading}
          <div class="flex items-center gap-2 text-xs text-gray-600">
            <span class="loading loading-spinner loading-xs"></span>
            در حال بارگذاری نقشه‌ها...
          </div>
        {:else if $offlineMaps.length === 0}
          <p class="text-xs text-gray-600">
            بسته‌ای نصب نشده است. ابتدا از تنظیمات یک فایل PMTiles وارد کنید.
          </p>
        {:else}
          <select
            id="offline-map-package"
            class="select select-bordered select-sm w-full bg-white text-sm"
            value={$offlineMap?.info.id ?? ""}
            onchange={handleOfflineMapSelection}
            disabled={isActivatingOfflineMap}
          >
            <option value="" disabled>انتخاب بستهٔ نقشه</option>
            {#each $offlineMaps as packageInfo (packageInfo.id)}
              <option value={packageInfo.id}>{packageInfo.name}</option>
            {/each}
          </select>
          {#if isActivatingOfflineMap}
            <p class="mt-2 flex items-center gap-2 text-xs text-gray-600" role="status">
              <span class="loading loading-spinner loading-xs"></span>
              در حال فعال‌سازی و رفتن به محدوده نقشه...
            </p>
          {:else if $offlineMap}
            <p class="mt-2 text-xs text-gray-600">
              {$offlineMap.info.tileKind === "vector" ? "نقشهٔ برداری" : "نقشهٔ رستری"} · محدودهٔ فعال
            </p>
            <button
              type="button"
              class="btn btn-xs btn-outline mt-2 w-full gap-1"
              onclick={focusOfflineMapCenter}
              title="رفتن به مرکز بستهٔ نقشه"
            >
              <LocateFixed class="h-3.5 w-3.5" />
              رفتن به مرکز نقشه
            </button>
          {/if}
        {/if}
        {#if offlineMapActivationError}
          <p class="mt-2 text-xs text-error" role="alert">{offlineMapActivationError}</p>
        {/if}
      </div>

      <!-- Search stays entirely inside the active local vector archive. -->
      <section class="rounded-lg bg-white/80 p-3 shadow-lg backdrop-blur-md">
        <label class="mb-2 block text-sm font-medium" for="offline-map-search">
          جستجو در نقشه
        </label>
        <div class="relative">
          <Search class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
          <input
            id="offline-map-search"
            type="search"
            class="input input-bordered input-sm w-full bg-white pr-9 text-sm"
            placeholder="جستجو..."
            autocomplete="off"
            dir="auto"
            value={offlineSearchQuery}
            oninput={handleOfflineSearchInput}
            onkeydown={handleOfflineSearchKeydown}
            disabled={!$offlineMap || $offlineMap.info.tileKind !== "vector"}
            aria-describedby="offline-map-search-status"
          />
        </div>

        <div id="offline-map-search-status" class="mt-2 text-xs text-gray-600">
          {#if !$offlineMap}
            <p>برای جستجو، یک بستهٔ نقشهٔ برداری را فعال کنید.</p>
          {:else if $offlineMap.info.tileKind === "raster"}
            <p>این بستهٔ رستری نام مکان‌ها را ندارد؛ جستجو در بسته‌های برداری پشتیبانی می‌شود.</p>
          {:else if offlineSearchState === "loading"}
            <p class="flex items-center gap-2" role="status">
              <span class="loading loading-spinner loading-xs"></span>
              در حال بررسی فهرست ذخیره‌شده...
            </p>
          {:else if offlineSearchState === "building"}
            <div role="status">
              <div class="flex items-center justify-between gap-2">
                <span class="flex items-center gap-2">
                  <span class="loading loading-spinner loading-xs"></span>
                  فهرست‌سازی در کل بستهٔ فعال...
                </span>
                <button type="button" class="btn btn-ghost btn-xs" onclick={cancelOfflineSearchIndex}>
                  لغو
                </button>
              </div>
              {#if offlineSearchTotal > 0}
                <progress
                  class="progress progress-primary mt-1 w-full"
                  max="100"
                  value={Math.min(100, (offlineSearchCompleted / offlineSearchTotal) * 100)}
                ></progress>
                <p class="mt-1 text-[10px]" dir="ltr">
                  {Math.min(100, Math.round((offlineSearchCompleted / offlineSearchTotal) * 100))}% ·
                  {offlineSearchCompleted.toLocaleString("fa-IR")} / {offlineSearchTotal.toLocaleString("fa-IR")} کاشی
                </p>
              {/if}
            </div>
          {:else if offlineSearchState === "error"}
            <p class="text-error" role="alert">{offlineSearchError}</p>
            <button type="button" class="btn btn-outline btn-xs mt-2 w-full" onclick={startOfflineSearchIndex}>
              تلاش دوباره
            </button>
          {:else if offlineSearchState === "ready"}
            {#if offlineSearchResultSelected}
              <p>مکان انتخاب‌شده روی نقشه نشان داده شد.</p>
            {:else if [...normalizeSearchText(offlineSearchQuery)].length >= 2 && offlineSearchResults.length > 0}
              <ul class="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {#each offlineSearchResults as result (result.id)}
                  <li>
                    <button
                      type="button"
                      class="w-full rounded-md p-2 text-right hover:bg-base-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
                      onclick={() => focusOfflineSearchResult(result)}
                    >
                      <span class="flex items-center gap-2">
                        <MapPin class="h-3.5 w-3.5 shrink-0 text-success" />
                        <span class="truncate font-medium" dir="auto">{result.title}</span>
                      </span>
                      <span class="mt-1 block truncate text-[10px] text-gray-500">
                        {searchLayerLabel(result.layer)}{result.detail ? ` · ${result.detail}` : ""}
                        <span dir="ltr"> · {result.lat.toFixed(4)}, {result.lon.toFixed(4)}</span>
                      </span>
                    </button>
                  </li>
                {/each}
              </ul>
            {:else if [...normalizeSearchText(offlineSearchQuery)].length >= 2}
              <p class="mt-2">نتیجه‌ای برای این عبارت در بسته پیدا نشد.</p>
            {:else}
              <p>
                جستجو بین {offlineSearchIndex?.entries.length.toLocaleString("fa-IR") ?? "۰"} نام در کل بستهٔ فعال.
              </p>
            {/if}
          {:else if offlineSearchState === "idle"}
            {#if [...normalizeSearchText(offlineSearchQuery)].length >= 2}
              <p>فهرست‌سازی آغاز نشده یا لغو شده است.</p>
              <button type="button" class="btn btn-outline btn-xs mt-2 w-full" onclick={startOfflineSearchIndex}>
                ادامهٔ فهرست‌سازی
              </button>
            {:else}
              <p>
                با وارد کردن حداقل دو نویسه، نام‌ها از همهٔ کاشی‌های بسته به‌صورت محلی فهرست می‌شوند.
              </p>
            {/if}
          {/if}
          {#if offlineSearchCacheWarning}
            <p class="mt-1 text-warning" role="status">{offlineSearchCacheWarning}</p>
          {/if}
          {#if offlineSearchUnreadableTiles > 0 && offlineSearchState === "ready"}
            <p class="mt-1 text-warning" role="status">
              {offlineSearchUnreadableTiles.toLocaleString("fa-IR")} کاشی قابل خواندن نبود.
            </p>
          {/if}
        </div>
      </section>

      <!-- Status Information Panel -->
      <div
        class="bg-white/30 bg-opacity-60 backdrop-blur-md rounded-lg shadow-lg"
      >
        <div class="p-2 flex justify-between items-center">
          <h3 class="font-medium text-sm">اطلاعات مکان</h3>
          <div class="flex gap-1">
            <button
              class="btn btn-xs btn-square"
              onclick={() => navigator.clipboard.writeText(coordinates)}
              title="کپی مختصات"
            >
              <Copy class="h-3 w-3" />
            </button>
            <button
              class="btn btn-xs btn-square"
              onclick={() => (showStatusInfo = !showStatusInfo)}
            >
              {showStatusInfo ? "−" : "+"}
            </button>
          </div>
        </div>
        {#if showStatusInfo}
          <div class="p-2 pt-0 space-y-1" dir="ltr">
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-gray-500">Lat:</span>
              <span class="text-xs font-mono"
                >{currentPosition.lat.toFixed(6)}</span
              >
            </div>
            <div class="flex items-center gap-2">
              <span class="text-xs font-medium text-gray-500">Lng:</span>
              <span class="text-xs font-mono"
                >{currentPosition.lng.toFixed(6)}</span
              >
            </div>
          </div>
        {/if}
      </div>
    </div>

    <div class="absolute bottom-2 left-2 right-2 z-[1000] flex flex-col gap-2">
      <!-- Sent Pins Panel -->
      <div
        class="bg-white/30 bg-opacity-60 backdrop-blur-md rounded-t-lg shadow-lg"
      >
        <div class="flex justify-between items-center p-2">
          <h3 class="font-medium text-sm">پین‌های ارسالی</h3>
          <div class="flex gap-1 items-center">
            <span class="text-xs text-gray-500">{pinFrames.length} ارسال</span>
            <button
              class="btn btn-xs btn-square"
              onclick={() => (showSentPins = !showSentPins)}
            >
              {showSentPins ? "−" : "+"}
            </button>
          </div>
        </div>
        {#if showSentPins}
          <div class="p-2 pt-0 overflow-x-auto max-h-48 overflow-y-auto">
            {#if pinFrames.length === 0}
              <p class="text-xs text-gray-400 text-center py-2">
                هنوز ارسالی انجام نشده
              </p>
            {:else}
              {#each pinFrames as frame}
                <div class="mb-2">
                  <div class="flex items-center gap-2 mb-1">
                    <span class="text-xs font-bold text-gray-600"
                      >#{frame.id}</span
                    >
                    <span class="text-xs text-gray-500">{frame.time}</span>
                    <span class="text-xs text-gray-400"
                      >({frame.pins.length} پین)</span
                    >
                  </div>
                  <table class="table table-xs table-zebra w-full">
                    <thead>
                      <tr>
                        <th>lat</th>
                        <th>lng</th>
                        <th>depth</th>
                        <th>speed</th>
                        <th>under_water_time</th>
                        <th>mission_time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {#each frame.pins as pin}
                        <tr>
                          <td class="font-mono text-xs">{pin.lat.toFixed(4)}</td
                          >
                          <td class="font-mono text-xs">{pin.lng.toFixed(4)}</td
                          >
                          <td class="font-mono text-xs">{pin.depth}</td>
                          <td class="font-mono text-xs">{pin.speed}</td>
                          <td class="font-mono text-xs"
                            >{pin.under_water_time}</td
                          >
                          <td class="font-mono text-xs">{pin.mission_time}</td>
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/each}
            {/if}
          </div>
        {/if}
      </div>
      <!-- Robot Data Logs Panel -->
      <div
        class="bg-white/30 bg-opacity-60 backdrop-blur-md rounded-t-lg shadow-lg"
      >
        <div class="flex justify-between items-center p-2">
          <h3 class="font-medium text-sm">داده‌های دریافتی</h3>
          <div class="flex gap-1 items-center">
            <span class="text-xs text-gray-500"
              >{$telemetryData.length} رکورد</span
            >
            <button
              class="btn btn-xs btn-square"
              onclick={() => ($telemetryData = [])}
              title="پاک کردن"
            >
              ✕
            </button>
            <button
              class="btn btn-xs btn-square"
              onclick={() => (showDataLogs = !showDataLogs)}
            >
              {showDataLogs ? "−" : "+"}
            </button>
          </div>
        </div>
        {#if showDataLogs}
          <div class="p-2 pt-0 overflow-x-auto max-h-36 overflow-y-auto">
            {#if $telemetryData.length === 0}
              <p class="text-xs text-gray-400 text-center py-2">
                هیچ داده‌ای دریافت نشده
              </p>
            {:else}
              <table class="table table-xs table-zebra w-full">
                <thead>
                  <tr>
                    <th>timestamp</th>
                    <th>latitude</th>
                    <th>longitude</th>
                    <th>depth</th>
                    <th>speed</th>
                    <th>yaw</th>
                    <th>rps</th>
                    <th>ampere</th>
                    <th>wtd</th>
                    <th>temperature</th>
                    <th>battery_level</th>
                    <th>mission_id</th>
                    <th>status</th>
                    <th>error</th>
                  </tr>
                </thead>
                <tbody>
                  {#each $telemetryData as log}
                    <tr>
                      <td class="font-mono text-xs">{log.timestamp}</td>
                      <td class="font-mono text-xs"
                        >{log.latitude.toFixed(4)}</td
                      >
                      <td class="font-mono text-xs"
                        >{log.longitude.toFixed(4)}</td
                      >
                      <td class="font-mono text-xs">{log.depth.toFixed(1)}</td>
                      <td class="font-mono text-xs">{log.speed.toFixed(2)}</td>
                      <td class="font-mono text-xs">{log.yaw.toFixed(1)}</td>
                      <td class="font-mono text-xs">{log.rps.toFixed(1)}</td>
                      <td class="font-mono text-xs">{log.ampere.toFixed(1)}</td>
                      <td class="font-mono text-xs"
                        >{Math.floor(log.wtd / 3600)
                          .toString()
                          .padStart(2, "0")}:{Math.floor((log.wtd % 3600) / 60)
                          .toString()
                          .padStart(2, "0")}:{(log.wtd % 60)
                          .toString()
                          .padStart(2, "0")}</td
                      >
                      <td class="font-mono text-xs"
                        >{log.temperature.toFixed(1)}°C</td
                      >
                      <td class="font-mono text-xs"
                        >{log.battery_level.toFixed(0)}%</td
                      >
                      <td class="font-mono text-xs">{log.mission_id}</td>
                      <td class="font-mono text-xs"
                        >{log.status === 1
                          ? "active"
                          : log.status === 0
                            ? "idle"
                            : "error"}</td
                      >
                      <td class="font-mono text-xs"
                        >{log.error === 0 ? "none" : log.error}</td
                      >
                    </tr>
                  {/each}
                </tbody>
              </table>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Send Command Confirmation Modal -->
  {#if showSendCommandModal}
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10000] p-4"
    >
      <div class="bg-base-100 rounded-lg shadow-xl w-full max-w-md">
        <div class="p-6">
          <h3 class="text-xl font-bold mb-4">تایید ارسال دستور</h3>

          <p class="mb-2">آیا از ارسال دستور اطمینان دارید؟</p>

          {#if backendPins.length > 0}
            <p class="mb-4 text-sm">
              تعداد پین‌های موجود: {backendPins.length}
            </p>
          {:else}
            <p class="mb-4 text-sm text-warning">
              هیچ پینی برای ارسال وجود ندارد!
            </p>
          {/if}

          <div class="flex justify-end space-x-2 mt-6">
            <button
              class="btn btn-outline"
              onclick={() => (showSendCommandModal = false)}
            >
              لغو
            </button>
            <button
              class="btn btn-primary"
              onclick={sendCommand}
              disabled={backendPins.length === 0 ||
                $settings.mode === "sending"}
            >
              {$settings.mode === "sending"
                ? "در انتظار دریافت پاسخ..."
                : "تأیید و ارسال"}
            </button>
          </div>
        </div>
      </div>
    </div>
  {/if}
</div>
