<script lang="ts">
  import * as L from "leaflet";
  import "leaflet/dist/leaflet.css";
  import { leafletRasterLayer, TileType } from "pmtiles";
  import { leafletLayer as protomapsLeafletLayer } from "protomaps-leaflet";
  import { onMount } from "svelte";
  import {
    loadOfflineTile,
    loadSavedOfflineMaps,
    offlineMap,
    type OfflineMapPackage,
    type OsmOfflineMap,
    type PmtilesOfflineMap,
    type XyzOfflineMap,
  } from "$lib/services/offline-maps";
  // Import pin service instead of store
  import {
    type Pin,
    addPin,
    deletePin as deletePinBackend,
    loadPins,
    updatePin,
  } from "$lib/services/pins";
  // Import command service functions
  import { scanPorts } from "$lib/services/ports";
  import { mapActions } from "$lib/stores/map-actions";
  import { settings, isPortConnected, updateMode } from "$lib/stores/settings";
  import { telemetryData, lastTelemetry } from "$lib/stores/telemetry";
  import { ChevronDown, Copy, Navigation2 as Navigation } from "lucide-svelte";
  import { sendPins } from "$lib/services/transmitter";
  import { connectionStatus } from "$lib/stores/settings";
  import icon from "leaflet/dist/images/marker-icon.png";
  import iconShadow from "leaflet/dist/images/marker-shadow.png";
  import { get } from "svelte/store";

  const OSM_TILE_URL_TEMPLATE = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";

  type LeafletMap = L.Map;
  type OfflineTileElement = HTMLImageElement & {
    _offlineAbort?: AbortController;
    _offlineObjectUrl?: string;
    _offlineDone?: boolean;
  };

  let mapContainer: HTMLDivElement;
  let map: LeafletMap;
  let onlineBaseLayer: L.TileLayer;
  let offlineBaseLayer: L.Layer | null = null;
  let unsubscribeOfflineMap: (() => void) | null = null;
  let currentPosition = $state({ lat: 35.6895, lng: 51.389 });
  let coordinates = $state("0, 0");

  // Backend pins state
  let backendPins = $state<Pin[]>([]);

  // Map layers state
  let routesLayer = $state(false);
  let objectsLayer = $state(true);

  // Context menu state
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

  function loadOsmFallbackTile(
    tile: OfflineTileElement,
    coords: L.Coords,
    signal: AbortSignal,
    finish: (error?: Error) => void,
  ): void {
    if (signal.aborted) return;
    if (coords.z > 19) {
      finish();
      return;
    }
    tile.onload = () => finish();
    tile.onerror = () => finish();
    tile.src = L.Util.template(OSM_TILE_URL_TEMPLATE, {
      s: "a",
      z: String(coords.z),
      x: String(coords.x),
      y: String(coords.y),
    });
  }

  function createXyzOfflineLayer(packageInfo: XyzOfflineMap): L.Layer {
    const createTile = (coords: L.Coords, done: L.DoneCallback): HTMLElement => {
      const tile = document.createElement("img") as OfflineTileElement;
      const controller = new AbortController();
      tile._offlineAbort = controller;
      tile.alt = "";
      tile.setAttribute("role", "presentation");
      tile.decoding = "async";

      const finish = (error?: Error) => {
        if (tile._offlineDone) return;
        tile._offlineDone = true;
        done(error, tile);
      };
      const cleanup = () => {
        tile.onload = null;
        tile.onerror = null;
        if (tile._offlineObjectUrl) {
          URL.revokeObjectURL(tile._offlineObjectUrl);
          tile._offlineObjectUrl = undefined;
        }
      };
      void loadOfflineTile(packageInfo.info.id, coords.z, coords.x, coords.y)
        .then((blob) => {
          if (controller.signal.aborted) return;
          if (!blob) {
            loadOsmFallbackTile(tile, coords, controller.signal, finish);
            return;
          }

          tile._offlineObjectUrl = URL.createObjectURL(blob);
          tile.onload = () => finish();
          tile.onerror = () => {
            cleanup();
            loadOsmFallbackTile(tile, coords, controller.signal, finish);
          };
          tile.src = tile._offlineObjectUrl;
        })
        .catch(() => loadOsmFallbackTile(tile, coords, controller.signal, finish));

      return tile;
    };

    const OfflineGridLayer = L.GridLayer.extend({ createTile }) as unknown as new (
      options: L.GridLayerOptions,
    ) => L.GridLayer;
    const layer = new OfflineGridLayer({
      attribution: `${escapeHtml(packageInfo.info.attribution)} · &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors`,
      minZoom: 0,
      maxZoom: 22,
      tileSize: 256,
      noWrap: true,
    }) as L.GridLayer;

    layer.on("tileunload", (event: L.TileEvent) => {
      const tile = event.tile as OfflineTileElement;
      tile._offlineAbort?.abort();
      tile.onload = null;
      tile.onerror = null;
      tile.removeAttribute("src");
      if (tile._offlineObjectUrl) {
        URL.revokeObjectURL(tile._offlineObjectUrl);
        tile._offlineObjectUrl = undefined;
      }
    });
    return layer;
  }

  function tileBoundsForCoords(coords: L.Coords): L.LatLngBounds | null {
    const count = 2 ** coords.z;
    if (coords.x < 0 || coords.x >= count || coords.y < 0 || coords.y >= count) return null;
    const longitude = (x: number) => (x / count) * 360 - 180;
    const latitude = (y: number) =>
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / count))) * 180) / Math.PI;
    return L.latLngBounds(
      [latitude(coords.y), longitude(coords.x)],
      [latitude(coords.y + 1), longitude(coords.x + 1)],
    );
  }

  function createOsmRegionFallbackLayer(bounds: L.LatLngBounds): L.Layer {
    const createTile = (coords: L.Coords, done: L.DoneCallback): HTMLElement => {
      const tile = document.createElement("img") as OfflineTileElement;
      const controller = new AbortController();
      tile._offlineAbort = controller;
      tile.alt = "";
      tile.setAttribute("role", "presentation");
      tile.decoding = "async";
      const finish = (error?: Error) => {
        if (tile._offlineDone) return;
        tile._offlineDone = true;
        done(error, tile);
      };
      const tileBounds = tileBoundsForCoords(coords);
      if (tileBounds && bounds.contains(tileBounds)) finish();
      else loadOsmFallbackTile(tile, coords, controller.signal, finish);
      return tile;
    };

    const FallbackGridLayer = L.GridLayer.extend({ createTile }) as unknown as new (
      options: L.GridLayerOptions,
    ) => L.GridLayer;
    const layer = new FallbackGridLayer({
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: 0,
      maxZoom: 22,
      tileSize: 256,
      noWrap: true,
    }) as L.GridLayer;
    layer.on("tileunload", (event: L.TileEvent) => {
      const tile = event.tile as OfflineTileElement;
      tile._offlineAbort?.abort();
      tile.onload = null;
      tile.onerror = null;
      tile.removeAttribute("src");
    });
    return layer;
  }

  function createOsmFeatureLayer(packageInfo: OsmOfflineMap): L.Layer {
    const getTags = (feature: { properties?: Record<string, unknown> }) =>
      (feature.properties?.tags ?? {}) as Record<string, string>;
    const styleForTags = (tags: Record<string, string>): L.PathOptions => {
      if (tags.natural === "water" || tags.water || tags.waterway === "riverbank") {
        return { color: "#3b82a0", weight: 1.5, fillColor: "#78bfd3", fillOpacity: 0.72 };
      }
      if (tags.building && tags.building !== "no") {
        return { color: "#9b8062", weight: 1, fillColor: "#dfc9a9", fillOpacity: 0.72 };
      }
      if (tags.highway) {
        const major = ["motorway", "trunk", "primary", "secondary"].includes(tags.highway);
        return { color: major ? "#c57858" : "#8b9298", weight: major ? 3 : 1.8, opacity: 0.92 };
      }
      if (tags.railway) return { color: "#6f6578", weight: 2, dashArray: "5 4" };
      if (tags.leisure || tags.landuse || tags.natural || tags.amenity) {
        return { color: "#648b62", weight: 1.2, fillColor: "#a9c99a", fillOpacity: 0.58 };
      }
      return { color: "#765f9b", weight: 2, fillColor: "#a78acb", fillOpacity: 0.62 };
    };

    return L.geoJSON(packageInfo.data as never, {
      style: (feature) => styleForTags(getTags(feature ?? {})),
      pointToLayer: (feature, latlng) => {
        const tags = getTags(feature);
        const marker = L.circleMarker(latlng, {
          radius: tags.amenity || tags.shop || tags.tourism || tags.place ? 5 : 3.5,
          ...styleForTags(tags),
        });
        const label = tags.name;
        if (label) marker.bindTooltip(escapeHtml(label), { direction: "top", offset: [0, -4] });
        return marker;
      },
      onEachFeature: (feature, layer) => {
        const tags = getTags(feature);
        const label = tags.name || tags.amenity || tags.shop || tags.tourism || tags.highway;
        if (label) {
          const category = tags.amenity || tags.shop || tags.tourism || tags.highway || tags.natural || "OpenStreetMap";
          layer.bindPopup(`<strong>${escapeHtml(label)}</strong><br><small>${escapeHtml(category)}</small>`);
        }
      },
    });
  }

  function createOsmOfflineLayer(packageInfo: OsmOfflineMap, bounds: L.LatLngBounds): L.Layer {
    const background = L.rectangle(bounds, {
      stroke: false,
      fillColor: "#f8f7f2",
      fillOpacity: 1,
      interactive: false,
    });
    return L.layerGroup([
      createOsmRegionFallbackLayer(bounds),
      background,
      createOsmFeatureLayer(packageInfo),
    ]);
  }

  function createPmtilesFallbackLayer(packageInfo: PmtilesOfflineMap): L.Layer {
    const createTile = (coords: L.Coords, done: L.DoneCallback): HTMLElement => {
      const tile = document.createElement("img") as OfflineTileElement;
      const controller = new AbortController();
      tile._offlineAbort = controller;
      tile.alt = "";
      tile.setAttribute("role", "presentation");
      tile.decoding = "async";

      let isDone = false;
      const finish = (error?: Error) => {
        if (isDone) return;
        isDone = true;
        done(error, tile);
      };
      const useOsmFallback = () =>
        loadOsmFallbackTile(tile, coords, controller.signal, finish);

      void packageInfo.pmtiles
        .getZxy(coords.z, coords.x, coords.y, controller.signal)
        .then((cachedTile) => {
          if (controller.signal.aborted) return;
          if (cachedTile) finish();
          else useOsmFallback();
        })
        .catch(useOsmFallback);

      return tile;
    };

    const FallbackGridLayer = L.GridLayer.extend({ createTile }) as unknown as new (
      options: L.GridLayerOptions,
    ) => L.GridLayer;
    const layer = new FallbackGridLayer({
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      minZoom: 0,
      maxZoom: 22,
      tileSize: 256,
      noWrap: true,
    }) as L.GridLayer;

    layer.on("tileunload", (event: L.TileEvent) => {
      const tile = event.tile as OfflineTileElement;
      tile._offlineAbort?.abort();
      tile.onload = null;
      tile.onerror = null;
      tile.removeAttribute("src");
    });
    return layer;
  }

  function syncOfflineBaseLayer(packageInfo: OfflineMapPackage | null): void {
    if (!map || !onlineBaseLayer) return;

    if (offlineBaseLayer) {
      if (map.hasLayer(offlineBaseLayer)) map.removeLayer(offlineBaseLayer);
      offlineBaseLayer = null;
    }

    if (!packageInfo) {
      if (!map.hasLayer(onlineBaseLayer)) onlineBaseLayer.addTo(map);
      return;
    }

    if (map.hasLayer(onlineBaseLayer)) map.removeLayer(onlineBaseLayer);

    const info = packageInfo.info;
    const bounds = L.latLngBounds(
      [info.minLat, info.minLon],
      [info.maxLat, info.maxLon],
    );
    const tileOptions = {
      attribution: escapeHtml(info.attribution),
      minZoom: info.minZoom,
      maxZoom: info.maxZoom,
      bounds: bounds.isValid() ? bounds : undefined,
      noWrap: true,
    };

    let layer: L.Layer;
    if (packageInfo.kind === "osm") {
      layer = createOsmOfflineLayer(packageInfo, bounds);
    } else if (packageInfo.kind === "xyz") {
      layer = createXyzOfflineLayer(packageInfo);
    } else if (packageInfo.header.tileType === TileType.Mvt) {
      const localLayer = protomapsLeafletLayer({
        ...tileOptions,
        url: packageInfo.pmtiles,
        flavor: "light",
        lang: "fa",
        maxDataZoom: packageInfo.header.maxZoom,
      }) as unknown as L.Layer;
      layer = L.layerGroup([createPmtilesFallbackLayer(packageInfo), localLayer]);
    } else {
      const localLayer = leafletRasterLayer(packageInfo.pmtiles, tileOptions) as L.Layer;
      localLayer.on("tileunload", (event: L.TileEvent) => {
        const sourceUrl = event.tile.currentSrc || event.tile.src;
        if (sourceUrl.startsWith("blob:")) URL.revokeObjectURL(sourceUrl);
      });
      layer = L.layerGroup([createPmtilesFallbackLayer(packageInfo), localLayer]);
    }

    offlineBaseLayer = layer;
    layer.addTo(map);
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [24, 24],
        maxZoom: Math.min(13, info.maxZoom),
      });
    }
  }

  // Initialize the map when the component mounts
  onMount(() => {
    let isDisposed = false;

    // Leaflet-based PMTiles adapters expect the Leaflet namespace on the global object.
    (globalThis as typeof globalThis & { L?: typeof L }).L = L;

    // Fix for default marker icons in Leaflet with Vite
    // @ts-ignore: _getIconUrl property exists but is not typed
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconUrl: icon,
      iconRetinaUrl: icon,
      shadowUrl: iconShadow,
    });

    // Initialize the map
    map = L.map(mapContainer).setView(
      [currentPosition.lat, currentPosition.lng],
      13,
    );

    // Use OSM when no offline map is saved; installed tiles take priority automatically.
    onlineBaseLayer = L.tileLayer(
      OSM_TILE_URL_TEMPLATE,
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
      },
    );

    const subscribeToOfflineMap = () => {
      if (isDisposed || !map) return;
      unsubscribeOfflineMap = offlineMap.subscribe(syncOfflineBaseLayer);
    };
    void loadSavedOfflineMaps()
      .then(subscribeToOfflineMap)
      .catch((error) => {
        console.error("Error loading offline map package:", error);
        // If local storage is unavailable or the saved pack is invalid, keep
        // the online map usable instead of leaving the basemap empty.
        subscribeToOfflineMap();
      });

    // Load pins from backend
    loadPins()
      .then((pins) => {
        backendPins = pins;
        updateMarkersOnMap();
      })
      .catch((error) => {
        console.error("Error loading pins:", error);
      });

    // Listen for robot data received events

    // Add click event to get coordinates
    map.on("click", (e: any) => {
      currentPosition = { lat: e.latlng.lat, lng: e.latlng.lng };
      coordinates = `${e.latlng.lat.toFixed(6)}, ${e.latlng.lng.toFixed(6)}`;
    });

    // Add right-click event to show context menu
    map.on("contextmenu", (e: any) => {
      // Prevent the default browser context menu
      const event = e.originalEvent;
      event.preventDefault();

      // Calculate the position for the context menu (position to the bottom-right of cursor)
      const mapBounds = mapContainer.getBoundingClientRect();
      let x = event.clientX - mapBounds.left;
      let y = event.clientY - mapBounds.top;

      const menuWidth = 150;
      const menuHeight = 40;

      if (x + menuWidth > mapBounds.width) {
        x = Math.max(0, event.clientX - mapBounds.left - menuWidth);
      }

      if (y + menuHeight > mapBounds.height) {
        y = Math.max(0, event.clientY - mapBounds.top - menuHeight);
      }

      contextMenuPosition = { x, y };
      contextMenuLatLng = { lat: e.latlng.lat, lng: e.latlng.lng };

      // Check if we're right-clicking on an existing pin
      contextMenuPinId = null; // Reset the pin ID
      const clickedLat = e.latlng.lat;
      const clickedLng = e.latlng.lng;

      // Iterate through all pins to see if any are at this location (with a small tolerance)
      for (const pin of backendPins) {
        // Check if the click is close to an existing pin (within 0.0001 degrees ~ 11 meters)
        if (
          Math.abs(pin.lat - clickedLat) < 0.0001 &&
          Math.abs(pin.lng - clickedLng) < 0.0001
        ) {
          contextMenuPinId = pin.id;
          break;
        }
      }

      // Show the context menu
      showContextMenu = true;
    });

    // Close context menu when clicking elsewhere on the map
    map.on("click", () => {
      showContextMenu = false;
    });

    // Watch for zoom/pan changes to update the coordinate display
    map.on("moveend", () => {
      const center = map.getCenter();
      coordinates = `${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`;
    });

    // Add event listener to close context menu when clicking outside the map
    const handleOutsideClick = (e: Event) => {
      if (
        showContextMenu &&
        mapContainer &&
        !mapContainer.contains(e.target as Node)
      ) {
        showContextMenu = false;
      }
    };

    document.addEventListener("click", handleOutsideClick);

    // Auto-detect serial port if none configured
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

    // Cleanup function
    return () => {
      isDisposed = true;
      unsubscribeOfflineMap?.();
      unsubscribeOfflineMap = null;
      document.removeEventListener("click", handleOutsideClick);
      if (map) {
        map.remove();
      }
    };
  });

  // Function to update markers on the map based on backend pins
  function updateMarkersOnMap(): void {
    // This implementation will clear existing markers and add new ones from backendPins
    // In a real implementation, you would want to optimize this to only add/remove changed markers
    map.eachLayer((layer) => {
      if (layer instanceof L.Marker) {
        map.removeLayer(layer);
      }
    });

    // Add markers for all backend pins
    backendPins.forEach((pin) => {
      const marker = L.marker([pin.lat, pin.lng]).addTo(map);
      // Add click event to open pin details modal
      marker.on("click", () => {
        onPinSelected(pin);
      });
    });
  }

  // Handle layer toggles

  $effect(() => {
    if (map && routesLayer) {
      console.log("Routes layer enabled");
    }
  });

  $effect(() => {
    if (map && objectsLayer) {
      console.log("Objects layer enabled");
    }
  });

  // Map control functions
  function zoomIn(): void {
    if (map) map.zoomIn();
  }

  function zoomOut(): void {
    if (map) map.zoomOut();
  }

  function searchLocation(): void {
    // Basic implementation - you can expand this
    alert("جستجوی مکان");
  }

  function markLocation(): void {
    if (map && currentPosition) {
      const marker = L.marker([currentPosition.lat, currentPosition.lng]).addTo(
        map,
      );
      map.setView([currentPosition.lat, currentPosition.lng], 15);
    }
  }

  function measureDistance(): void {
    // Basic implementation - you can expand this
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

  // Cleanup function
  function destroyMap(): void {
    if (map) {
      map.remove();
    }
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
    <div class="absolute top-3 left-14 z-[1000] flex gap-2">
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

<style>
  :global(.leaflet-grab),
  :global(.leaflet-container) {
    cursor: default !important;
  }
</style>
