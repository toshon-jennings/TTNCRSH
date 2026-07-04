import { query } from './db';

export const BOUNDARY_URL = '/TTNCRSH/data/trenton_boundary.json';

export type SegmentProperties = {
  seg_id: number;
  crash_count: number | null;
  cartway_width_ft: number | null;
  canopy_pct: number | null;
  grade_range_smooth: number | null;
  maxspeed_final: number | null;
  state_total_width_ft: number | null;
  state_lane_cnt: number | null;
  GEOID: string | null;
  st_name: string | null;
  st_type: string | null;
  road_class: string | null;
  state_divisor_type: string | null;

  // Phase 1: Severity & Density Baselining
  crash_density: number | null;
  has_fatality: number | null;
  has_severe_injury: number | null;
  length: number | null;

  // Phase 2: Micro-Infrastructure & Right-of-Way
  bike_infra_type: string | null;
  intersection_control: string | null;

  // Phase 3: Temporal & Environmental Dynamics
  nighttime_illumination: number | null;
  crash_count_day: number | null;
  crash_count_night: number | null;
  crash_count_clear: number | null;
  crash_count_wet: number | null;
  crash_count_day_clear: number | null;
  crash_count_day_wet: number | null;
  crash_count_night_clear: number | null;
  crash_count_night_wet: number | null;
  is_glare_prone: number | null;

  // Phase 4: Equity & Climate Vulnerability Overlays
  is_school_zone: number | null;
  high_heat_vulnerability: number | null;

  // 311 roadway condition requests
  roadway_request_count: number | null;
  roadway_defect_count: number | null;
  roadway_paving_request_count: number | null;
  roadway_open_request_count: number | null;
};

export type SegmentFeature = {
  type: 'Feature';
  properties: SegmentProperties;
  geometry: any;
};

export type BlockGroupFeature = {
  type: 'Feature';
  properties: {
    GEOID: string | null;
    population: number | null;
    median_income: number | null;
  };
  geometry: any;
};

export type BoundaryFeatureCollection = {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry: any;
  }>;
};

export type PeerComparison = {
  sql: string;
  peerN: number;
  bgMedianCrash: number | null;
  bgMedianCanopy: number | null;
  crashPctile: number | null;
};

export type StoryFocalExample = {
  id: string;
  label: string;
  reason: string;
  properties: SegmentProperties;
  geometry: any;
};

export type StoryFocalExamples = {
  sql: string;
  examples: StoryFocalExample[];
};

export async function loadSegmentFeatures(): Promise<SegmentFeature[]> {
  const result = await query(`
  SELECT
    CAST(seg_id AS INTEGER)             AS seg_id,
    CAST(crash_count AS INTEGER)        AS crash_count,
    CAST(cartway_width_ft AS FLOAT)     AS cartway_width_ft,
    CAST(canopy_pct AS FLOAT)           AS canopy_pct,
    CAST(grade_range_smooth AS FLOAT)   AS grade_range_smooth,
    CAST(maxspeed_final AS FLOAT)       AS maxspeed_final,
    CAST(state_total_width_ft AS FLOAT) AS state_total_width_ft,
    CAST(state_lane_cnt AS INTEGER)     AS state_lane_cnt,
    GEOID,
    st_name,
    st_type,
    class                               AS road_class,
    state_divisor_type,
    CAST(crash_density AS FLOAT)         AS crash_density,
    CAST(length AS FLOAT)               AS length,
    CAST(has_fatality AS INTEGER)       AS has_fatality,
    CAST(has_severe_injury AS INTEGER)  AS has_severe_injury,
    bike_infra_type,
    intersection_control,
    CAST(nighttime_illumination AS FLOAT) AS nighttime_illumination,
    CAST(crash_count_day AS INTEGER)    AS crash_count_day,
    CAST(crash_count_night AS INTEGER)  AS crash_count_night,
    CAST(crash_count_clear AS INTEGER)  AS crash_count_clear,
    CAST(crash_count_wet AS INTEGER)    AS crash_count_wet,
    CAST(crash_count_day_clear AS INTEGER) AS crash_count_day_clear,
    CAST(crash_count_day_wet AS INTEGER)   AS crash_count_day_wet,
    CAST(crash_count_night_clear AS INTEGER) AS crash_count_night_clear,
    CAST(crash_count_night_wet AS INTEGER) AS crash_count_night_wet,
    CAST(is_glare_prone AS INTEGER)     AS is_glare_prone,
    CAST(is_school_zone AS INTEGER)     AS is_school_zone,
    CAST(high_heat_vulnerability AS INTEGER) AS high_heat_vulnerability,
    CAST(roadway_request_count AS INTEGER) AS roadway_request_count,
    CAST(roadway_defect_count AS INTEGER) AS roadway_defect_count,
    CAST(roadway_paving_request_count AS INTEGER) AS roadway_paving_request_count,
    CAST(roadway_open_request_count AS INTEGER) AS roadway_open_request_count,
    geojson
  FROM segments
`);

  return result.toArray().map((r: any) => ({
    type: 'Feature' as const,
    properties: {
      seg_id: r.seg_id,
      crash_count: r.crash_count,
      cartway_width_ft: r.cartway_width_ft,
      canopy_pct: r.canopy_pct,
      grade_range_smooth: r.grade_range_smooth,
      maxspeed_final: r.maxspeed_final,
      state_total_width_ft: r.state_total_width_ft,
      state_lane_cnt: r.state_lane_cnt,
      GEOID: r.GEOID,
      st_name: r.st_name,
      st_type: r.st_type,
      road_class: r.road_class,
      state_divisor_type: r.state_divisor_type,
      crash_density: r.crash_density,
      length: r.length,
      has_fatality: r.has_fatality,
      has_severe_injury: r.has_severe_injury,
      bike_infra_type: r.bike_infra_type,
      intersection_control: r.intersection_control,
      nighttime_illumination: r.nighttime_illumination,
      crash_count_day: r.crash_count_day,
      crash_count_night: r.crash_count_night,
      crash_count_clear: r.crash_count_clear,
      crash_count_wet: r.crash_count_wet,
      crash_count_day_clear: r.crash_count_day_clear,
      crash_count_day_wet: r.crash_count_day_wet,
      crash_count_night_clear: r.crash_count_night_clear,
      crash_count_night_wet: r.crash_count_night_wet,
      is_glare_prone: r.is_glare_prone,
      is_school_zone: r.is_school_zone,
      high_heat_vulnerability: r.high_heat_vulnerability,
      roadway_request_count: r.roadway_request_count,
      roadway_defect_count: r.roadway_defect_count,
      roadway_paving_request_count: r.roadway_paving_request_count,
      roadway_open_request_count: r.roadway_open_request_count,
    },
    geometry: JSON.parse(r.geojson),
  }));
}

export async function loadBlockGroupFeatures(): Promise<BlockGroupFeature[]> {
  const result = await query(`
    SELECT
      GEOID,
      CAST(population AS INTEGER) AS population,
      CASE WHEN median_income < 0 THEN NULL ELSE CAST(median_income AS INTEGER) END AS median_income,
      geojson
    FROM block_groups
  `);

  return result.toArray().map((r: any) => ({
    type: 'Feature' as const,
    properties: {
      GEOID: r.GEOID,
      population: r.population,
      median_income: r.median_income,
    },
    geometry: JSON.parse(r.geojson),
  }));
}

export async function loadTrentonBoundary(): Promise<BoundaryFeatureCollection> {
  const res = await fetch(BOUNDARY_URL);
  if (!res.ok) throw new Error(`Failed to load boundary: ${res.status}`);
  return res.json();
}

export async function loadBlockGroupPeerComparison(p: SegmentProperties): Promise<PeerComparison | null> {
  const geoid = p.GEOID && p.GEOID !== 'null' ? String(p.GEOID) : null;
  if (!geoid) return null;

  const safeGeoid = geoid.replace(/'/g, "''");
  const crashCount = p.crash_count == null ? 'NULL' : String(Number(p.crash_count));
  const sql =
`SELECT
  COUNT(*) AS peer_n,
  MEDIAN(crash_count) AS bg_median_crash,
  MEDIAN(canopy_pct)  AS bg_median_canopy,
  SUM(CASE WHEN crash_count <= ${crashCount} THEN 1 ELSE 0 END) * 1.0
    / COUNT(*) AS crash_pctile
FROM segments
WHERE GEOID = '${safeGeoid}'`;

  const result = await query(sql);
  const row = result.toArray()[0] as any;

  return {
    sql,
    peerN: Number(row.peer_n),
    bgMedianCrash: row.bg_median_crash != null ? Number(row.bg_median_crash) : null,
    bgMedianCanopy: row.bg_median_canopy != null ? Number(row.bg_median_canopy) : null,
    crashPctile: row.crash_pctile != null ? Number(row.crash_pctile) : null,
  };
}

function rowToStoryFocalExample(r: any): StoryFocalExample {
  return {
    id: String(r.example_id),
    label: r.example_label,
    reason: r.example_reason,
    properties: {
      seg_id: Number(r.seg_id),
      crash_count: r.crash_count,
      cartway_width_ft: r.cartway_width_ft,
      canopy_pct: r.canopy_pct,
      grade_range_smooth: r.grade_range_smooth,
      maxspeed_final: r.maxspeed_final,
      state_total_width_ft: r.state_total_width_ft,
      state_lane_cnt: r.state_lane_cnt,
      GEOID: r.GEOID,
      st_name: r.st_name,
      st_type: r.st_type,
      road_class: r.road_class,
      state_divisor_type: r.state_divisor_type,
      crash_density: r.crash_density,
      length: r.length,
      has_fatality: r.has_fatality,
      has_severe_injury: r.has_severe_injury,
      bike_infra_type: r.bike_infra_type,
      intersection_control: r.intersection_control,
      nighttime_illumination: r.nighttime_illumination,
      crash_count_day: r.crash_count_day,
      crash_count_night: r.crash_count_night,
      crash_count_clear: r.crash_count_clear,
      crash_count_wet: r.crash_count_wet,
      crash_count_day_clear: r.crash_count_day_clear,
      crash_count_day_wet: r.crash_count_day_wet,
      crash_count_night_clear: r.crash_count_night_clear,
      crash_count_night_wet: r.crash_count_night_wet,
      is_glare_prone: r.is_glare_prone,
      is_school_zone: r.is_school_zone,
      high_heat_vulnerability: r.high_heat_vulnerability,
      roadway_request_count: r.roadway_request_count,
      roadway_defect_count: r.roadway_defect_count,
      roadway_paving_request_count: r.roadway_paving_request_count,
      roadway_open_request_count: r.roadway_open_request_count,
    },
    geometry: JSON.parse(r.geojson),
  };
}

export async function loadStoryFocalExamples(storyId: string): Promise<StoryFocalExamples> {
  const selectColumns = `
    example_id,
    example_label,
    example_reason,
    CAST(seg_id AS INTEGER)             AS seg_id,
    CAST(crash_count AS INTEGER)        AS crash_count,
    CAST(cartway_width_ft AS FLOAT)     AS cartway_width_ft,
    CAST(canopy_pct AS FLOAT)           AS canopy_pct,
    CAST(grade_range_smooth AS FLOAT)   AS grade_range_smooth,
    CAST(maxspeed_final AS FLOAT)       AS maxspeed_final,
    CAST(state_total_width_ft AS FLOAT) AS state_total_width_ft,
    CAST(state_lane_cnt AS INTEGER)     AS state_lane_cnt,
    GEOID,
    st_name,
    st_type,
    class                               AS road_class,
    state_divisor_type,
    CAST(crash_density AS FLOAT)         AS crash_density,
    CAST(length AS FLOAT)               AS length,
    CAST(has_fatality AS INTEGER)       AS has_fatality,
    CAST(has_severe_injury AS INTEGER)  AS has_severe_injury,
    bike_infra_type,
    intersection_control,
    CAST(nighttime_illumination AS FLOAT) AS nighttime_illumination,
    CAST(crash_count_day AS INTEGER)    AS crash_count_day,
    CAST(crash_count_night AS INTEGER)  AS crash_count_night,
    CAST(crash_count_clear AS INTEGER)  AS crash_count_clear,
    CAST(crash_count_wet AS INTEGER)    AS crash_count_wet,
    CAST(crash_count_day_clear AS INTEGER) AS crash_count_day_clear,
    CAST(crash_count_day_wet AS INTEGER)   AS crash_count_day_wet,
    CAST(crash_count_night_clear AS INTEGER) AS crash_count_night_clear,
    CAST(crash_count_night_wet AS INTEGER) AS crash_count_night_wet,
    CAST(is_glare_prone AS INTEGER)     AS is_glare_prone,
    CAST(is_school_zone AS INTEGER)     AS is_school_zone,
    CAST(high_heat_vulnerability AS INTEGER) AS high_heat_vulnerability,
    CAST(roadway_request_count AS INTEGER) AS roadway_request_count,
    CAST(roadway_defect_count AS INTEGER) AS roadway_defect_count,
    CAST(roadway_paving_request_count AS INTEGER) AS roadway_paving_request_count,
    CAST(roadway_open_request_count AS INTEGER) AS roadway_open_request_count,
    geojson
  `;

  const queries: Record<string, string> = {
    'canopy-width': `
WITH narrow AS (
  SELECT *
  FROM segments
  WHERE cartway_width_ft BETWEEN 18 AND 35
    AND crash_count IS NOT NULL
    AND canopy_pct IS NOT NULL
    AND st_name IS NOT NULL
),
selected AS (
  SELECT
    'low-canopy-high-crash' AS example_id,
    'Low canopy, high crashes' AS example_label,
    'Narrow segment with sparse canopy and one of the higher crash counts in its peer set.' AS example_reason,
    *
  FROM narrow
  WHERE canopy_pct < 0.05
  ORDER BY crash_count DESC, cartway_width_ft ASC
  LIMIT 1
),
selected_high_canopy AS (
  SELECT
    'higher-canopy-low-crash' AS example_id,
    'Higher canopy, lower crashes' AS example_label,
    'Comparable narrow segment with more canopy and fewer recorded crashes.' AS example_reason,
    *
  FROM narrow
  WHERE canopy_pct >= 0.20
  ORDER BY crash_count ASC, canopy_pct DESC
  LIMIT 1
)
SELECT ${selectColumns} FROM selected
UNION ALL
SELECT ${selectColumns} FROM selected_high_canopy`,

    'grade-speed': `
WITH graded AS (
  SELECT *
  FROM segments
  WHERE grade_range_smooth IS NOT NULL
    AND maxspeed_final IS NOT NULL
    AND crash_count IS NOT NULL
    AND st_name IS NOT NULL
),
slow_steep AS (
  SELECT
    'slow-steep' AS example_id,
    'Slow, steep street' AS example_label,
    'Steep low-speed segment where grade behaves more like traffic calming.' AS example_reason,
    *
  FROM graded
  WHERE maxspeed_final <= 25
    AND grade_range_smooth >= 0.06
  ORDER BY crash_count ASC, grade_range_smooth DESC
  LIMIT 1
),
fast_steep AS (
  SELECT
    'fast-steep' AS example_id,
    'Faster steep segment' AS example_label,
    'Higher-speed steep segment where slope compounds exposure rather than calming it.' AS example_reason,
    *
  FROM graded
  WHERE maxspeed_final >= 35
    AND grade_range_smooth >= 0.02
  ORDER BY crash_count DESC, grade_range_smooth DESC
  LIMIT 1
)
SELECT ${selectColumns} FROM slow_steep
UNION ALL
SELECT ${selectColumns} FROM fast_steep`,

    'method-check': `
WITH outliers AS (
  SELECT *
  FROM segments
  WHERE grade_range_smooth IS NOT NULL
    AND grade_range_smooth >= 0.15
    AND st_name IS NOT NULL
),
ranked AS (
  SELECT
    'grade-outlier-' || CAST(ROW_NUMBER() OVER (ORDER BY grade_range_smooth DESC) AS VARCHAR) AS example_id,
    'Grade outlier #' || CAST(ROW_NUMBER() OVER (ORDER BY grade_range_smooth DESC) AS VARCHAR) AS example_label,
    'Top-ranked grade outlier; inspect as a likely bridge, ramp, short segment, or elevation artifact.' AS example_reason,
    *
  FROM outliers
  ORDER BY grade_range_smooth DESC
  LIMIT 2
)
SELECT ${selectColumns} FROM ranked`,
  };

  const sql = queries[storyId];
  if (!sql) return { sql: '', examples: [] };

  const result = await query(sql);
  return {
    sql,
    examples: result.toArray().map(rowToStoryFocalExample),
  };
}

export async function countGradeOutliers(threshold: number): Promise<number> {
  const result = await query(`SELECT COUNT(*) AS n FROM segments WHERE grade_range_smooth > ${threshold}`);
  return Number((result.toArray()[0] as any).n);
}

export type LeaderboardEntry = {
  seg_id: number;
  st_name: string | null;
  st_type: string | null;
  road_class: string | null;
  crash_count: number;
  crash_density: number;
  length: number;
};

// Segments shorter than this are usually intersection stubs. A handful of
// crashes on a ~50ft stub produces a huge crashes-per-foot rate that has
// nothing to do with the street being dangerous — it's just a tiny
// denominator. Excluding them keeps the leaderboard to corridors long enough
// for a density figure to mean something.
const LEADERBOARD_MIN_LENGTH_FT = 150;

export async function loadVisibleLeaderboard(
  west: number,
  south: number,
  east: number,
  north: number,
  colName: string = 'crash_count'
): Promise<LeaderboardEntry[]> {
  const result = await query(`
    SELECT
      CAST(seg_id AS INTEGER)             AS seg_id,
      st_name,
      st_type,
      class                               AS road_class,
      CAST(${colName} AS INTEGER)         AS crash_count,
      CAST(length AS FLOAT)               AS length,
      CASE WHEN length > 0
           THEN (CAST(${colName} AS FLOAT) * 1000.0) / CAST(length AS FLOAT)
           ELSE 0.0 END                   AS crash_density
    FROM segments
    WHERE centroid_lat BETWEEN ${south} AND ${north}
      AND centroid_lon BETWEEN ${west} AND ${east}
      AND ${colName} > 0
      AND length >= ${LEADERBOARD_MIN_LENGTH_FT}
    ORDER BY crash_density DESC
    LIMIT 10
  `);

  return result.toArray().map((r: any) => ({
    seg_id: r.seg_id,
    st_name: r.st_name,
    st_type: r.st_type,
    road_class: r.road_class,
    crash_count: r.crash_count,
    crash_density: r.crash_density,
    length: r.length,
  }));
}
