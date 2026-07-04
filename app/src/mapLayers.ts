import type maplibregl from 'maplibre-gl';
import type { BlockGroupFeature, BoundaryFeatureCollection, SegmentFeature } from './mapQueries';

export const GRADE_OUTLIER_THRESHOLD = 0.15;

export type LegendStop = { color: string; label: string };
export type Legend =
  | { kind: 'steps'; stops: LegendStop[] }
  | {
      kind: 'bivariate';
      xLabel: string;
      xLo: string;
      xHi: string;
      yLabel: string;
      yLo: string;
      yHi: string;
      // cells in order: yHi+xLo, yHi+xHi, yLo+xLo, yLo+xHi (top-left, top-right, bottom-left, bottom-right)
      cells: [string, string, string, string];
    };

export type LayerGroup = { toggleId: string; layerId: string; legendId: string }[];

export const SEGMENT_LAYER_GROUP: LayerGroup = [
  { toggleId: 'toggle-crashes', layerId: 'segments-line', legendId: 'legend-crashes' },
  { toggleId: 'toggle-canopy', layerId: 'canopy-pct', legendId: 'legend-canopy' },
  { toggleId: 'toggle-grade', layerId: 'grade', legendId: 'legend-grade' },
];

export const INTERACTION_LAYER_GROUP: LayerGroup = [
  { toggleId: 'toggle-canopy-width', layerId: 'inter-canopy-width', legendId: 'legend-canopy-width' },
  { toggleId: 'toggle-grade-speed', layerId: 'inter-grade-speed', legendId: 'legend-grade-speed' },
];

export const BLOCK_GROUP_LAYER_GROUP: LayerGroup = [
  { toggleId: 'toggle-population', layerId: 'population', legendId: 'legend-population' },
  { toggleId: 'toggle-income', layerId: 'median-income', legendId: 'legend-income' },
];

export const LEGENDS: Record<string, Legend> = {
  'segments-line': { kind: 'steps', stops: [
    { color: '#ffffff', label: '0' },
    { color: '#fee5d9', label: '1' },
    { color: '#fcae91', label: '3' },
    { color: '#fb6a4a', label: '8' },
    { color: '#de2d26', label: '20' },
    { color: '#a50f15', label: '50+' },
  ]},
  'canopy-pct': { kind: 'steps', stops: [
    { color: '#ffffff', label: '0%' },
    { color: '#e5f5e0', label: '5%' },
    { color: '#a1d99b', label: '10%' },
    { color: '#31a354', label: '50%+' },
  ]},
  'grade': { kind: 'steps', stops: [
    { color: '#f7f4f9', label: '0%' },
    { color: '#d4b9da', label: '0.5%' },
    { color: '#d281b3', label: '2%' },
    { color: '#cf27f1', label: '6%' },
    { color: '#ff0000', label: '10%+' },
  ]},
  'population': { kind: 'steps', stops: [
    { color: '#fff7ec', label: '0' },
    { color: '#fdd49e', label: '500' },
    { color: '#fdbb84', label: '1k' },
    { color: '#fc8d59', label: '1.5k' },
    { color: '#d7301f', label: '2.5k' },
    { color: '#7f0000', label: '3.5k+' },
  ]},
  'median-income': { kind: 'steps', stops: [
    { color: '#f7fbff', label: '$0' },
    { color: '#c6dbef', label: '$25k' },
    { color: '#6baed6', label: '$50k' },
    { color: '#2171b5', label: '$75k' },
    { color: '#08306b', label: '$125k+' },
  ]},
  'inter-canopy-width': {
    kind: 'bivariate',
    xLabel: 'canopy',
    xLo: '<10%',
    xHi: '≥10%',
    yLabel: 'width',
    yLo: '<35ft',
    yHi: '≥35ft',
    cells: ['#f59e7d', '#137a4a', '#d5d8d2', '#9bd880'],
  },
  'inter-grade-speed': {
    kind: 'bivariate',
    xLabel: 'speed',
    xLo: '<35',
    xHi: '≥35',
    yLabel: 'grade',
    yLo: 'flat',
    yHi: 'steep',
    cells: ['#f2c66d', '#b91c1c', '#d7d9dc', '#f29a76'],
  },
  'bike-lanes': { kind: 'steps', stops: [
    { color: '#059669', label: 'Protected' },
    { color: '#3b82f6', label: 'Painted' },
    { color: '#f59e0b', label: 'Sharrow' },
  ]},
  'signals': { kind: 'steps', stops: [
    { color: '#ef4444', label: 'Traffic Signal' },
  ]},
  'roadway-defects': { kind: 'steps', stops: [
    { color: '#fed7aa', label: '1' },
    { color: '#fb923c', label: '3' },
    { color: '#f97316', label: '10' },
    { color: '#ea580c', label: '25+' },
  ]},
  'heat': { kind: 'steps', stops: [
    { color: '#f97316', label: 'High Heat' },
  ]},
  'school-zones': { kind: 'steps', stops: [
    { color: '#8b5cf6', label: 'School Zone' },
  ]},
};

export function addMapSourcesAndLayers(
  map: maplibregl.Map,
  segmentFeatures: SegmentFeature[],
  blockGroupFeatures: BlockGroupFeature[],
  trentonBoundary: BoundaryFeatureCollection,
) {
  map.addSource('block-groups', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: blockGroupFeatures } as any,
  });

  map.addLayer({
    id: 'population',
    type: 'fill',
    source: 'block-groups',
    paint: {
      'fill-color': [
        'case', ['==', ['get', 'population'], null as any], '#fff7ec',
        ['step', ['coalesce', ['get', 'population'], 0],
          '#fff7ec',
          500, '#fdd49e',
          1000, '#fdbb84',
          1500, '#fc8d59',
          2500, '#d7301f',
          3500, '#7f0000',
        ],
      ],
      'fill-opacity': ['case', ['==', ['get', 'population'], null as any], 0, 0.55],
    },
  });

  map.addLayer({
    id: 'median-income',
    type: 'fill',
    source: 'block-groups',
    paint: {
      'fill-color': [
        'case', ['==', ['get', 'median_income'], null as any], '#e8e8e8',
        ['step', ['coalesce', ['get', 'median_income'], 0],
          '#f7fbff',
          25000, '#c6dbef',
          50000, '#6baed6',
          75000, '#2171b5',
          125000, '#08306b',
        ],
      ],
      'fill-opacity': ['case', ['==', ['get', 'median_income'], null as any], 0, 0.55],
    },
  });

  map.addSource('trenton-boundary', {
    type: 'geojson',
    data: trentonBoundary as any,
  });

  map.addLayer({
    id: 'trenton-boundary',
    type: 'line',
    source: 'trenton-boundary',
    paint: {
      'line-color': '#20242c',
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        9, 0.75,
        12, 1.15,
        15, 1.8,
      ],
      'line-opacity': 0.55,
    },
  });

  map.addSource('segments', {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: segmentFeatures } as any,
    promoteId: 'seg_id',
  });

  map.addLayer({
    id: 'segments-line',
    type: 'line',
    source: 'segments',
    paint: {
      'line-color': [
        'step', ['coalesce', ['get', 'crash_density'], 0],
        '#ffffff',
        1, '#fee5d9',
        3, '#fcae91',
        8, '#fb6a4a',
        20, '#de2d26',
        50, '#a50f15',
      ],
      'line-width': [
        'step', ['coalesce', ['get', 'cartway_width_ft'], 0],
        1,
        5, 1,
        10, 1.5,
        50, 3.5,
        100, 5.5,
      ],
    },
  });

  map.addLayer({
    id: 'canopy-pct',
    type: 'line',
    source: 'segments',
    paint: {
      'line-color': [
        'step', ['coalesce', ['get', 'canopy_pct'], 0],
        '#fff',
        0.05, '#e5f5e0',
        0.1, '#a1d99b',
        0.5, '#31a354',
      ],
      'line-width': [
        'step', ['coalesce', ['get', 'cartway_width_ft'], 0],
        1,
        5, 2,
        10, 3,
        50, 5,
        100, 8,
      ],
    },
  });

  map.addLayer({
    id: 'grade',
    type: 'line',
    source: 'segments',
    paint: {
      'line-color': [
        'step', ['coalesce', ['get', 'grade_range_smooth'], 0],
        '#f7f4f9',
        0.005, '#d4b9da',
        0.020, '#d281b3',
        0.060, '#cf27f1',
        0.100, '#ff0000',
      ],
      'line-width': [
        'step', ['coalesce', ['get', 'cartway_width_ft'], 0],
        1,
        5, 1,
        10, 1.5,
        50, 3.5,
        100, 5.5,
      ],
    },
  });

  map.addLayer({
    id: 'grade-outliers',
    type: 'line',
    source: 'segments',
    filter: ['>', ['coalesce', ['get', 'grade_range_smooth'], 0], GRADE_OUTLIER_THRESHOLD],
    layout: { visibility: 'none' },
    paint: {
      'line-color': '#ffe500',
      'line-width': [
        'step', ['coalesce', ['get', 'cartway_width_ft'], 0],
        2, 5, 2, 10, 3, 50, 5, 100, 7,
      ],
      'line-opacity': 0.9,
    },
  });

  const dotSize = 16;
  const dotCanvas = document.createElement('canvas');
  dotCanvas.width = dotSize;
  dotCanvas.height = dotSize;
  
  const dotCtx = dotCanvas.getContext('2d')!;
  dotCtx.beginPath();
  dotCtx.arc(dotSize / 2, dotSize / 2, dotSize / 2 - 1.5, 0, Math.PI * 2);
  dotCtx.fillStyle = '#ffe500';
  dotCtx.fill();
  dotCtx.strokeStyle = '#222';
  dotCtx.lineWidth = 2.5;
  dotCtx.stroke();
  
  map.addImage('grade-outlier-dot', {
    width: dotSize,
    height: dotSize,
    data: new Uint8Array(dotCtx.getImageData(0, 0, dotSize, dotSize).data.buffer),
  });

  map.addLayer({
    id: 'grade-outlier-markers',
    type: 'symbol',
    source: 'segments',
    filter: ['>', ['coalesce', ['get', 'grade_range_smooth'], 0], GRADE_OUTLIER_THRESHOLD],
    layout: {
      visibility: 'none',
      'symbol-placement': 'line-center',
      'icon-image': 'grade-outlier-dot',
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  map.addLayer({
    id: 'inter-canopy-width',
    type: 'line',
    source: 'segments',
    layout: { visibility: 'none' },
    paint: {
      'line-color': [
        'case',
        ['all', ['<', ['coalesce', ['get', 'cartway_width_ft'], 0], 35], ['<', ['coalesce', ['get', 'canopy_pct'], 0], 0.1]], '#d5d8d2',
        ['all', ['<', ['coalesce', ['get', 'cartway_width_ft'], 0], 35], ['>=', ['coalesce', ['get', 'canopy_pct'], 0], 0.1]], '#9bd880',
        ['all', ['>=', ['coalesce', ['get', 'cartway_width_ft'], 0], 35], ['<', ['coalesce', ['get', 'canopy_pct'], 0], 0.1]], '#f59e7d',
        ['all', ['>=', ['coalesce', ['get', 'cartway_width_ft'], 0], 35], ['>=', ['coalesce', ['get', 'canopy_pct'], 0], 0.1]], '#137a4a',
        '#d5d8d2',
      ],
      'line-width': [
        'step', ['coalesce', ['get', 'cartway_width_ft'], 0],
        1, 5, 1.5, 10, 2, 50, 4, 100, 6,
      ],
    },
  });

  map.addLayer({
    id: 'inter-grade-speed',
    type: 'line',
    source: 'segments',
    layout: { visibility: 'none' },
    paint: {
      'line-color': [
        'case',
        ['all', ['<', ['coalesce', ['get', 'grade_range_smooth'], 0], 0.02], ['<', ['coalesce', ['get', 'maxspeed_final'], 0], 35]], '#d7d9dc',
        ['all', ['>=', ['coalesce', ['get', 'grade_range_smooth'], 0], 0.02], ['<', ['coalesce', ['get', 'maxspeed_final'], 0], 35]], '#f2c66d',
        ['all', ['<', ['coalesce', ['get', 'grade_range_smooth'], 0], 0.02], ['>=', ['coalesce', ['get', 'maxspeed_final'], 0], 35]], '#f29a76',
        ['all', ['>=', ['coalesce', ['get', 'grade_range_smooth'], 0], 0.02], ['>=', ['coalesce', ['get', 'maxspeed_final'], 0], 35]], '#b91c1c',
        '#d7d9dc',
      ],
      'line-width': [
        'step', ['coalesce', ['get', 'cartway_width_ft'], 0],
        1, 5, 1.5, 10, 2, 50, 4, 100, 6,
      ],
    },
  });

  map.addLayer({
    id: 'segments-highlight',
    type: 'line',
    source: 'segments',
    paint: {
      'line-color': '#fff',
      'line-width': ['case', ['boolean', ['feature-state', 'hover'], false], 5, 0],
      'line-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.85, 0],
      'line-blur': 2,
    },
  });

  map.addLayer({
    id: 'segments-pinned',
    type: 'line',
    source: 'segments',
    paint: {
      'line-color': '#ffe500',
      'line-width': ['case', ['boolean', ['feature-state', 'pinned'], false], 5, 0],
      'line-opacity': ['case', ['boolean', ['feature-state', 'pinned'], false], 1, 0],
    },
  });

  map.addLayer({
    id: 'segments-ai-highlight',
    type: 'line',
    source: 'segments',
    filter: ['==', ['get', 'seg_id'], -1],
    paint: {
      'line-color': '#00ffff',
      'line-width': 6,
      'line-opacity': 0.95,
    },
  });

  map.addLayer({
    id: 'segments-hit',
    type: 'line',
    source: 'segments',
    paint: { 'line-color': 'transparent', 'line-width': 10, 'line-opacity': 0 },
  });

  // Phase 2: Bike Lanes
  map.addLayer({
    id: 'bike-lanes',
    type: 'line',
    source: 'segments',
    filter: ['!=', ['get', 'bike_infra_type'], 'None'],
    layout: { visibility: 'none' },
    paint: {
      'line-color': [
        'match', ['get', 'bike_infra_type'],
        'Protected', '#059669',
        'Painted', '#3b82f6',
        'Sharrow', '#f59e0b',
        '#d5d8d2'
      ],
      'line-width': 2.5,
    }
  });

  // Phase 2: Signal Locations (using canvas signal-dot)
  const sigCanvas = document.createElement('canvas');
  sigCanvas.width = 12;
  sigCanvas.height = 12;
  const sigCtx = sigCanvas.getContext('2d')!;
  sigCtx.beginPath();
  sigCtx.arc(6, 6, 4.5, 0, Math.PI * 2);
  sigCtx.fillStyle = '#ef4444';
  sigCtx.fill();
  sigCtx.strokeStyle = '#fff';
  sigCtx.lineWidth = 1.5;
  sigCtx.stroke();
  map.addImage('signal-dot', {
    width: 12,
    height: 12,
    data: new Uint8Array(sigCtx.getImageData(0, 0, 12, 12).data.buffer),
  });

  map.addLayer({
    id: 'signals',
    type: 'symbol',
    source: 'segments',
    filter: ['==', ['get', 'intersection_control'], 'Signalized'],
    layout: {
      visibility: 'none',
      'symbol-placement': 'line-center',
      'icon-image': 'signal-dot',
      'icon-size': 1,
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });

  // 311 Street Defect requests
  map.addLayer({
    id: 'roadway-defects',
    type: 'line',
    source: 'segments',
    filter: ['>', ['coalesce', ['get', 'roadway_defect_count'], 0], 0],
    layout: { visibility: 'none' },
    paint: {
      'line-color': [
        'step', ['coalesce', ['get', 'roadway_defect_count'], 0],
        '#fed7aa',
        3, '#fb923c',
        10, '#f97316',
        25, '#ea580c',
      ],
      'line-width': [
        'interpolate', ['linear'], ['zoom'],
        10, 1.5,
        13, 3.5,
        16, 6,
      ],
      'line-opacity': 0.9,
    }
  });

  // Phase 4: Urban Heat Index
  map.addLayer({
    id: 'heat',
    type: 'line',
    source: 'segments',
    filter: ['==', ['get', 'high_heat_vulnerability'], 1],
    layout: { visibility: 'none' },
    paint: {
      'line-color': '#f97316',
      'line-width': [
        'step', ['coalesce', ['get', 'cartway_width_ft'], 0],
        2.5, 5, 3.5, 10, 4.5, 50, 6, 100, 8,
      ],
      'line-opacity': 0.85,
    }
  });

  // Phase 4: School Zones
  map.addLayer({
    id: 'school-zones',
    type: 'line',
    source: 'segments',
    filter: ['==', ['get', 'is_school_zone'], 1],
    layout: { visibility: 'none' },
    paint: {
      'line-color': '#8b5cf6',
      'line-width': [
        'step', ['coalesce', ['get', 'cartway_width_ft'], 0],
        2.5, 5, 3.5, 10, 4.5, 50, 6, 100, 8,
      ],
      'line-opacity': 0.85,
    }
  });
}

export function setGradeOutlierVisibility(map: maplibregl.Map, visible: boolean) {
  const visibility = visible ? 'visible' : 'none';
  map.setLayoutProperty('grade-outliers', 'visibility', visibility);
  map.setLayoutProperty('grade-outlier-markers', 'visibility', visibility);
}

export function setGradeOutlierThreshold(map: maplibregl.Map, threshold: number) {
  map.setFilter('grade-outliers', ['>', ['coalesce', ['get', 'grade_range_smooth'], 0], threshold]);
  map.setFilter('grade-outlier-markers', ['>', ['coalesce', ['get', 'grade_range_smooth'], 0], threshold]);
}

export function clearGradeOutliers(map: maplibregl.Map) {
  setGradeOutlierVisibility(map, false);
  setGradeOutlierThreshold(map, GRADE_OUTLIER_THRESHOLD);
}
