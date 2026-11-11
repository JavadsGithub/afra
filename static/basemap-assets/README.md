# Offline basemap assets

These assets are copied from [protomaps/basemaps-assets](https://github.com/protomaps/basemaps-assets) at commit `028c18f713baecad011301ff7a69acc39bcc2ae7` so vector-map labels and icons work without contacting a font or sprite CDN.

- `fonts/` contains Protomaps' Noto Sans glyph PBFs. The SIL Open Font License is in `fonts/OFL.txt`.
- `sprites/v4/light*` contains the light-flavor sprite sheets used by the v4 Protomaps basemap style. The upstream assets are derived from MIT-licensed [tangrams/icons](https://github.com/tangrams/icons); the license is included in `sprites/LICENSE.md`.

The app uses these assets for Persian-localized vector labels. Names still depend on the features and language tags present in each PMTiles archive.
