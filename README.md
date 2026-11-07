# AFRA Ground Station

AFRA Ground Station is a desktop control and telemetry application for AFRA robotics, built with Tauri 2, SvelteKit, TypeScript, and Rust.

## Development

```bash
pnpm install
pnpm tauri dev
```

Run the frontend type and Svelte checks with:

```bash
pnpm check
```

Create a desktop build with:

```bash
pnpm tauri build
```

## Offline maps

The map automatically uses its active saved package; there is no online/offline switch. Downloaded OSM data is rendered from local storage inside its saved rectangle. The ordinary OpenStreetMap layer remains available for normal interactive viewing outside that region and when no package is active. No region or map dataset is preselected or bundled with the app.

Open **Settings → Offline maps** to manage packages. You can:

- Search for a neighborhood, suburb, village, town, city, province/state, or country and select its bounds, or enter the southern, western, northern, and eastern coordinates of a rectangle manually.
- Download raw OpenStreetMap map data for the selected rectangle. The features are converted to GeoJSON, saved in the device's IndexedDB, and rendered by the app. Downloading the same rectangle again activates its saved package instead of requesting it again. Requests are kept to small areas and subject to OpenStreetMap API limits; choose a smaller rectangle if a request is rejected.
- Import a regional `.pmtiles` archive. Raster PMTiles packages and vector packages compatible with the Protomaps Basemaps schema are supported. If the archive has no attribution metadata, enter the attribution required by its provider.
- Activate another installed package or remove packages from this device.

AFRA does not bulk-download tiles from the OpenStreetMap Standard tile service. Ordinary interactive tile viewing remains available, and OSM attribution is retained for downloaded data and map display.

Imported archives and downloaded OSM data are stored locally in the device's WebView IndexedDB and are not uploaded. Storage availability and quota depend on the device/browser; keep source packages and backups if needed.
