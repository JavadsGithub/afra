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

The map has an explicit **Online / Offline** switch on the right, beneath the coordinates card. Online mode keeps the regular OpenStreetMap layer available for interactive viewing. Offline mode uses the currently active package. No map provider, geographic region, or map dataset is preselected or bundled with the app.

Open **Settings → Offline maps** to manage installed packages. You can:

- Import a regional `.pmtiles` archive. Raster PMTiles packages and vector packages compatible with the Protomaps Basemaps schema are supported. If the archive has no attribution metadata, enter the attribution required by its provider.
- Choose an area by searching for a city, province/state, or country; select the matching result to fill its bounds. Or choose **Manual rectangle** and enter the southern/northern latitude and western/eastern longitude. Place lookup is sent only on submit to OpenStreetMap's Nominatim search service; the tile source is configured separately and is never preselected.
- Set one maximum zoom. AFRA downloads levels 0 through that zoom (0–22), estimates tile count, and limits each package to 25,000 planned tiles. The tile provider's HTTPS XYZ URL, attribution, and offline permission are in the collapsed **Map source** settings; the provider must allow browser CORS requests.
- Activate a different installed package or remove packages from this device.

Before a regional download, AFRA requires you to confirm that the provider permits offline and bulk downloads. The downloader blocks `openstreetmap.org` and its subdomains: **do not use it for bulk downloads from the OpenStreetMap Standard tile service**. The ordinary online OpenStreetMap layer remains available for normal interactive map use. Use only a source whose terms explicitly permit offline use, and retain its required attribution.

Imported archives and downloaded tiles are stored locally in the device's WebView IndexedDB and are not uploaded. Storage availability and quota depend on the device/browser; keep source packages and backups if needed.
