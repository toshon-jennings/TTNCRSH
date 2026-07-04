# About TTNCRSH

TTNCRSH is an exploratory map of Trenton, NJ street segments, crash history, and block group context. The project asks where street geometry and environmental context line up with crash risk, using 100% real NJDOT police crash records (NJTR-1).

The map is not a causal model. It is a browser-based analytical viewer for comparing patterns: crash counts by street segment, speed limits, lane counts, and demographic context. The strongest use case is inspection: turn layers on, compare similar streets, and click examples to see the live DuckDB queries behind the story panels.

## What the App Shows

- Dynamic crash risk index by street segment.
- Posted speed limits and lane counts.
- Block group population and median household income.
- Infrastructure layers (Traffic Signal Locations).
- Day/Night and Weather (Clear vs. Wet) crash splits.

## Diagnostic Engine & Feature Integration

The Trenton Engine aggregates official, geocoded accident records from the New Jersey Department of Transportation:

- **Real NJDOT Crash Records**: We compiled 993 geocoded crash records (years 2018–2023, excluding 2019 due to source format changes) located in Trenton City. These records contain exact coordinates, severity metrics, surface conditions (dry vs wet), and timestamps (mapped to day vs night).
- **OSMnx Street Centerlines**: Street segment geometries, functional classes, speed limits, and lane configurations are pulled directly from OpenStreetMap.
- **Real Census Demographics**: Population and median household income at the Census block group level are mapped directly to Mercer County/Trenton block groups to provide equity overlays.

## Credits & Contributions

- **Original Application**: Created and developed by [Ben Polinsky](https://github.com/ben-polinsky) as an exploratory analysis tool linking spatial geometry and PennDOT crashes. View the original [PHLCRSH GitHub repository](https://github.com/benpolinsky/PHLCRSH) or the [live map](https://benpolinsky.github.io/PHLCRSH/).
- **TTNCRSH Engine**: Created and developed by [Toshon Jennings](https://github.com/toschon-jennings) and **Antigravity** (Google DeepMind's AI coding assistant). This system is designed as a federated extension of the safety portal concept built on top of Ben's original layout and visualization system.

## Data Sources

- Crash records: [NJDOT Police Crash Investigation Reports (NJTR-1)](https://www.state.nj.us/transportation/refdata/accident/crash_data.shtm).
- Street geometry: [OpenStreetMap](https://www.openstreetmap.org) via [OSMnx](https://osmnx.readthedocs.io/).
- Census demographics: [US Census Bureau ACS 5-year API](https://api.census.gov/).
- Census block-group geometry: [Census TIGER/Line shapefiles](https://www.census.gov/geographies/mapping-files/time-series/geo/tiger-line-file.html) via [pygris](https://github.com/walkerke/pygris).
- Basemap: [CARTO basemaps](https://carto.com/basemaps) with [OpenStreetMap](https://www.openstreetmap.org/copyright) data attribution.

## Limitations

- The analysis is correlational, not causal proof.
- Crash records and Census fields each have timing and geocoding limitations (approx. 35% of NJDOT records in these years contain valid coordinates).
- Segment-level aggregation can hide intersection effects and corridor-level behavior.

## Links

- [GitHub Repository](https://github.com/toshon-jennings/PHLCRSH-V2)
- [Federation Hub (CRSH-NXS)](https://toshon-jennings.github.io/CRSH-NXS/)
