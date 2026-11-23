# Pakistan settlements

Source: [GeoNames Pakistan country dump](https://download.geonames.org/export/dump/PK.zip), 2026-11-23 snapshot, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).

The generated list keeps current populated places with a recognized Pakistani first-level region, prefers the ASCII place name for search, and deduplicates the name and region pairs. Results are ordered by reported population. The profile stores the selected name in its existing city/country field.

To refresh the list, extract PK.txt from the source archive and run `node scripts/generate-pakistan-cities.mjs path/to/PK.txt`.
