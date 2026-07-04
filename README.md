# TTNCRSH — Trenton Crash Risk Engine

TTNCRSH is an exploratory map of Trenton, NJ street segments, crash history, speed limits, and demographic block group context. The project asks where street geometry and environmental context line up with crash risk, and where public data itself needs skepticism.

The map is not a causal model. It is a browser-based analytical viewer for comparing patterns across street segments. DuckDB-WASM runs locally in the browser, reads GeoParquet outputs, and powers the map layers, peer comparisons, and story examples.

This repository is designed as a federated extension of the safety portal concept (originally developed as [PHLCRSH](https://github.com/benpolinsky/PHLCRSH) for Philadelphia).

## Links

- [Deployed map](https://toshon-jennings.github.io/TTNCRSH/)
- [Central Registry (CRSH-NXS)](https://toshon-jennings.github.io/CRSH-NXS/)
- [Frontend app](app/)

## Data Sources

- **NJDOT Crash Records**: Geocoded Police Crash Investigation Reports (NJTR-1) for Mercer County (2018–2023).
- **OSM Street Geometry**: Street centerline segments, speed limits, lanes, and traffic signals pulled directly from OpenStreetMap via OSMnx.
- **ACS Demographics**: US Census Bureau ACS 5-year block group parameters (population and median household income).
- **Basemap**: CARTO basemaps with OpenStreetMap data attribution.

## Running the Data pipeline

The data preparation pipeline downloads, cleans, snaps, and exports Trenton crash data.

To install dependencies and run:

```sh
# Setup local environment and install packages
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Run the Trenton data pipeline
python data_prep/gather_city.py
```

*Note: If a `CENSUS_API_KEY` is not present in the environment, the script will automatically fallback to standard local averages for Census demographics.*

## Running the Frontend App

```sh
cd app
npm install
npm run dev
```

Open `http://localhost:5173/TTNCRSH/`.

To build the project:

```sh
cd app
npm run build
```

---

## Interactive AI Grounded Chat Safety Assistant

TTNCRSH includes a client-side **Grounded AI Safety Assistant** (accessible via the floating chat bubble in the bottom right corner). It operates as a local Text-to-SQL grounded safety assistant:

1. **Text-to-SQL Translation (Pass 1):** Translates your natural language query (e.g., *"Find the top 5 highest risk streets with no traffic signal in South Trenton"*) into a valid DuckDB SQL query. The assistant's system prompt is grounded with the schemas for both `segments` and `block_groups` (described in `data_dictionary.md`).
2. **Local browser-side execution:** The generated SQL query is executed directly in the browser against the local DuckDB-WASM databases.
3. **Interactive Map Highlights:** Highlights returned segment IDs (`seg_id`) on the map and zooms to fit the features.
4. **Insight Synthesis (Pass 2):** Synthesizes the results into a human-readable safety summary.

### Setup

Click the **Gear** icon in the chat header to input your API key (Gemini, OpenAI, Anthropic, Groq, Grok, or OpenRouter). API keys are encrypted and stored locally (unlocked using PIN) in the browser's `localStorage` and sent directly to the vendor's API endpoint.
