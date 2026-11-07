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
- Choose an area with a place search (city, province/state, or country) or enter a `latitude, longitude` pair and a radius. Place lookup is sent only when requested to OpenStreetMap's Nominatim search service; the selected place's bounding box is filled in for you. For coordinates, AFRA calculates a bounding box around the point. The tile source is configured separately and is never preselected.
- Download and install a raster region from a provider you configure in **Advanced download settings**. Enter its HTTPS XYZ tile URL template using `{z}`, `{x}`, and `{y}`, required attribution, and a zoom range. Choose a maximum zoom no higher than the provider supports; AFRA accepts zoom levels 0–22 and limits each download to 25,000 planned tiles. The provider must allow browser CORS requests.
- Activate a different installed package or remove packages from this device.

Before a regional download, AFRA requires you to confirm that the provider permits offline and bulk downloads. The downloader blocks `openstreetmap.org` and its subdomains: **do not use it for bulk downloads from the OpenStreetMap Standard tile service**. The ordinary online OpenStreetMap layer remains available for normal interactive map use. Use only a source whose terms explicitly permit offline use, and retain its required attribution.

Imported archives and downloaded tiles are stored locally in the device's WebView IndexedDB and are not uploaded. Storage availability and quota depend on the device/browser; keep source packages and backups if needed.
