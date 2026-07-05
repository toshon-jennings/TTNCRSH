# TTNCRSH Data Dictionary

This document defines the schemas, columns, data types, and descriptions for the datasets used in the TTNCRSH Safety Diagnostic Engine (Trenton). The data is stored in GeoParquet format and queried in-browser via DuckDB-WASM.

---

## 1. Table: `segments`
This table represents individual street centerline segments in Trenton, NJ, enriched with crash statistics, road design metrics, tree canopy coverage, topographic grade, and socioeconomic block group context.

| Column Name | Data Type | Source / Calculation | Description |
| :--- | :--- | :--- | :--- |
| **`seg_id`** | `INTEGER` | OpenStreetMap | Unique street centerline segment identifier (Primary Key). |
| **`st_name`** | `VARCHAR` | OpenStreetMap | Name of the street (e.g., "Broad", "Hamilton"). |
| **`st_type`** | `VARCHAR` | OpenStreetMap | Street suffix type (e.g., "St", "Ave", "Blvd"). |
| **`class`** | `INTEGER` | OpenStreetMap | Functional classification code (1: Expressway, 2: Major Arterial, 3: Minor Arterial, 4: Collector, 5: Local, 9: Ramp). |
| **`length`** | `FLOAT` | Computed | Geometry length of the street segment in feet (calculated in EPSG:3424). |
| **`cartway_width_ft`** | `FLOAT` | Class Default | Estimated width of the roadway cartway (curb-to-curb) in feet, defaulted based on functional classification. |
| **`maxspeed_final`** | `FLOAT` | OpenStreetMap / Defaults | Final posted speed limit in miles per hour (MPH). |
| **`canopy_pct`** | `FLOAT` | NLCD 2021 Tree Canopy Cover / null | Percentage of tree canopy cover sampled along the segment corridor. Null when canopy rasters are unavailable. |
| **`grade_range_smooth`** | `FLOAT` | USGS 3DEP DEM / null | Smoothed segment slope grade sampled from elevation. Null when elevation rasters are unavailable. |
| **`GEOID`** | `VARCHAR` | Census Bureau | FIPS census block group identifier containing the segment midpoint. |
| **`geometry`** | `GEOMETRY` | OpenStreetMap | LineString geometry of the centerline segment (EPSG:4326). |

### Phase 1: Exposure & Severity Metrics
| Column Name | Data Type | Source / Calculation | Description |
| :--- | :--- | :--- | :--- |
| **`crash_count`** | `INTEGER` | NJDOT Crashes snap | Total historical crash count snapped to this segment (2018–2023). |
| **`fatal_count`** | `INTEGER` | NJDOT Crashes snap | Number of fatalities recorded on this segment. |
| **`injury_count`** | `INTEGER` | NJDOT Crashes snap | Number of general injuries recorded on this segment. |
| **`severity_score`** | `INTEGER` | `10*fatal + 3*injury + 1*PDO` | Weighted severity score representing the overall hazard level of crashes on the segment. |
| **`has_fatality`** | `INTEGER` | `fatal_count > 0` | Binary indicator (1: segment has had one or more fatal crashes; 0: otherwise). |
| **`has_severe_injury`** | `INTEGER` | `injury_count > 0` | Binary indicator (1: segment has had one or more serious injuries; 0: otherwise). |
| **`crash_density`** | `FLOAT` | `crash_count * 1000.0 / length` | Crashes per 1,000 ft of segment length. Used to compare corridors of different lengths. |

### Phase 2: Micro-Infrastructure
| Column Name | Data Type | Source / Calculation | Description |
| :--- | :--- | :--- | :--- |
| **`bike_infra_type`** | `VARCHAR` | OpenStreetMap | Snapped bicycle facility category: defaults to `None`. |
| **`intersection_control`** | `VARCHAR` | OpenStreetMap signal join | Estimated intersection control type at segment boundaries: `Signalized` (if near an OSM traffic signal) or `Stop-Controlled` / `Uncontrolled` (based on class). |
| **`has_signal`** | `INTEGER` | OpenStreetMap signal join | Binary indicator (1: segment is within 50ft of an OSM traffic signal; 0: otherwise). |

### Phase 3: Temporal & Environmental Slices
| Column Name | Data Type | Source / Calculation | Description |
| :--- | :--- | :--- | :--- |
| **`nighttime_illumination`** | `FLOAT` | Default | Streetlight pole density proxy (defaults to 0.0). |
| **`is_glare_prone`** | `INTEGER` | Computed | Binary indicator (1: segment runs directly East-West (bearing azimuth 75°–105° or 255°–285°); 0: otherwise). |
| **`crash_count_day`** | `INTEGER` | NJDOT (6 AM - 6 PM) | Crashes occurring during daylight hours. |
| **`crash_count_night`** | `INTEGER` | NJDOT (6 PM - 6 AM) | Crashes occurring during nighttime hours. |
| **`crash_count_clear`** | `INTEGER` | NJDOT weather dry | Crashes occurring under clear, dry weather conditions. |
| **`crash_count_wet`** | `INTEGER` | NJDOT weather wet/snow | Crashes occurring under wet, frozen, or adverse weather conditions. |

### Phase 4: Equity & Climate Context
| Column Name | Data Type | Source / Calculation | Description |
| :--- | :--- | :--- | :--- |
| **`is_school_zone`** | `INTEGER` | Default | Binary indicator (1: segment falls within a school zone; 0: otherwise). |
| **`high_heat_vulnerability`** | `INTEGER` | Default | Binary indicator (1: segment intersects high heat vulnerability tract; 0: otherwise). |

### 311 Roadway Condition Requests
| Column Name | Data Type | Source / Calculation | Description |
| :--- | :--- | :--- | :--- |
| **`roadway_request_count`** | `INTEGER` | Default | Total 311 roadway-condition requests snapped to the segment (defaults to 0). |
| **`roadway_defect_count`** | `INTEGER` | Default | Street Defect requests snapped to the segment (defaults to 0). |
| **`roadway_paving_request_count`** | `INTEGER` | Default | Street Paving requests snapped to the segment (defaults to 0). |
| **`roadway_open_request_count`** | `INTEGER` | Default | Snapped roadway-condition requests whose status is open (defaults to 0). |

---

## 2. Table: `block_groups`
This table contains census block groups in Trenton, providing socioeconomic and demographic context layers.

| Column Name | Data Type | Source / Calculation | Description |
| :--- | :--- | :--- | :--- |
| **`GEOID`** | `VARCHAR` | Census Bureau | FIPS block group unique identifier (Primary Key). Starts with `34021` for Mercer County, NJ. |
| **`population`** | `INTEGER` | Census ACS 2022 (5-Yr) | Total population count. |
| **`median_income`** | `INTEGER` | Census ACS 2022 (5-Yr) | Median household income in USD. |
| **`geometry`** | `GEOMETRY` | Census TIGER/Line | Polygon boundary geometry of the census block group (EPSG:4326). |
