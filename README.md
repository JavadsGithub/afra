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

The map renderer is MapLibre GL JS and reads only local PMTiles archives. It never requests map tiles, styles, fonts, search results, or other map data from the internet. There is no online/offline switch, online fallback, or network tile cache.

Open **Settings → Offline maps** and import a local `.pmtiles` file. The selected archive is stored on the device in IndexedDB and can be activated or removed there. On the map view, use the offline-map card to switch between installed archives; selecting one activates it and frames its covered area. Raster archives are supported; vector archives must use the Protomaps Basemaps schema. Vector styles include Persian-localized text labels, using bundled fonts and sprites from `static/basemap-assets` so no map assets are fetched from the internet. Labels appear only where the archive contains names. Attribution from the archive is retained.

For vector archives, the map search reads named places, points of interest, roads, and other supported named features directly from **all tiles in the active PMTiles archive**, not only the visible area. The first search builds an on-device index in a background worker and stores it locally in IndexedDB for later use. Raster archives have no searchable feature names. No geocoder or other map service is used.

No basemap archive is included in this repository. Until a local PMTiles archive is imported or bundled with the app, the map canvas remains empty apart from the app's pins and controls, and place search is unavailable. Coordinates can still be selected directly on the map.
