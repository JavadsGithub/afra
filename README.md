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

Open **Settings → Offline map** and import a regional `.pmtiles` package. The archive is stored in the local WebView database on this device; it is not uploaded, and no map dataset is bundled with the app. Raster PMTiles packages are supported, along with vector packages that use the Protomaps Basemaps schema. The package's attribution is shown on the map; if it is missing from metadata, enter the attribution supplied by its provider when importing.

Use a package whose provider and license permit offline use. AFRA does not download or prefetch tiles from `tile.openstreetmap.org`. The existing OpenStreetMap layer remains available as a normal, interactive online layer; use the Leaflet layer selector to switch between it and the imported offline package.
