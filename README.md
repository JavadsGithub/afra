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

Open **Settings → Offline maps** and import a local `.pmtiles` file. The selected archive is stored on the device in IndexedDB and can be activated or removed there. On the map view, use the offline-map card to switch between installed archives; selecting one activates it and frames its covered area. Raster archives are supported; vector archives must use the Protomaps Basemaps schema. Vector styling intentionally uses no remote fonts or glyphs, so it does not show text labels. Attribution from the archive is retained.

No basemap archive is included in this repository. Until a local PMTiles archive is imported or bundled with the app, the map canvas remains empty apart from the app's pins and controls. Place search is not available offline; coordinates can still be selected directly on the map.
