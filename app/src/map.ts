import maplibregl from 'maplibre-gl';
import {
  activateChip,
  findChip,
  renderChipList,
  renderStoryContent,
  type StoryChip,
} from './chips';
import {
  loadBlockGroupFeatures,
  loadBlockGroupPeerComparison,
  loadTrentonBoundary,
  loadSegmentFeatures,
  loadVisibleLeaderboard,
  type SegmentProperties,
  type StoryFocalExample,
} from './mapQueries';
import {
  BLOCK_GROUP_LAYER_GROUP,
  INTERACTION_LAYER_GROUP,
  LEGENDS,
  SEGMENT_LAYER_GROUP,
  addMapSourcesAndLayers,
  clearGradeOutliers,
  setGradeOutlierVisibility,
  type LayerGroup,
} from './mapLayers';

function segmentPopupHTML(p: Partial<SegmentProperties>) {
  const row = (label: string, value: string) =>
    `<div class="seg-row"><span>${label}</span><strong>${value}</strong></div>`;
  const canopy = p.canopy_pct != null ? `${(p.canopy_pct * 100).toFixed(0)}%` : '—';
  const width = p.cartway_width_ft != null ? `${(+p.cartway_width_ft).toFixed(0)} ft` : '—';
  const grade = p.grade_range_smooth != null ? `${(p.grade_range_smooth * 100).toFixed(1)}%` : '—';
  const speed = p.maxspeed_final != null ? `${(+p.maxspeed_final).toFixed(0)} mph` : '—';
  const crashDensity = p.crash_density != null ? p.crash_density.toFixed(1) : '—';
  const defects = p.roadway_defect_count != null ? String(p.roadway_defect_count) : '—';
  return `<div class="seg-popup">
    ${row('Crashes', String(p.crash_count ?? '—'))}
    ${row('Crash Density (/1000ft)', crashDensity)}
    ${row('311 Defects', defects)}
    ${row('Canopy', canopy)}
    ${row('Grade', grade)}
    ${row('Speed', speed)}
    ${row('Width', width)}
  </div>`;
}

let activeMap: maplibregl.Map | null = null;
let allSegmentFeatures: any[] = [];

export async function initMap(container: string) {
  const map = new maplibregl.Map({
    container,
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    center: [-74.7429, 40.2170],
    zoom: 13,
  });

  activeMap = map;

  await map.once('load');

  const [segmentFeatures, blockGroupFeatures, trentonBoundary] = await Promise.all([
    loadSegmentFeatures(),
    loadBlockGroupFeatures(),
    loadTrentonBoundary(),
  ]);
  allSegmentFeatures = segmentFeatures;
  addMapSourcesAndLayers(map, segmentFeatures, blockGroupFeatures, trentonBoundary);

  let hoveredId: number | string | null = null;
  let pinnedSegId: number | string | null = null;
  let storyFocusedSegId: number | string | null = null;
  const mobileLayout = window.matchMedia('(max-width: 760px)');
  const coarsePointer = window.matchMedia('(pointer: coarse)');
  const isMobileLayout = () => mobileLayout.matches;
  const suppressHoverPopup = () => isMobileLayout() || coarsePointer.matches;
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 8 });
  type MobileSheetState = 'collapsed' | 'peek' | 'full';
  let mobileSheetState: MobileSheetState = 'full';

  map.on('mousemove', 'segments-hit', (e) => {
    if (suppressHoverPopup()) return;
    if (!e.features?.length) return;
    map.getCanvas().style.cursor = 'pointer';

    const id = e.features[0].id as number | string;
    if (hoveredId !== null && hoveredId !== id) {
      map.setFeatureState({ source: 'segments', id: hoveredId }, { hover: false });
    }
    hoveredId = id;
    map.setFeatureState({ source: 'segments', id }, { hover: true });

    if (id === pinnedSegId) {
      popup.remove();
      return;
    }
    const p = e.features[0].properties as Partial<SegmentProperties>;
    popup.setLngLat(e.lngLat).setHTML(segmentPopupHTML(p)).addTo(map);
  });

  map.on('mouseleave', 'segments-hit', () => {
    map.getCanvas().style.cursor = '';
    if (hoveredId !== null) {
      map.setFeatureState({ source: 'segments', id: hoveredId }, { hover: false });
      hoveredId = null;
    }
    popup.remove();
  });

  const legendColorClass = (color: string) => `legend-color-${color.replace('#', '').toLowerCase()}`;
  const legendColorStyle = (color: string) => `style="background:${color}"`;

  function renderLegend(container: HTMLElement, layerId: string | null) {
    if (!layerId || !LEGENDS[layerId]) {
      container.innerHTML = '';
      container.classList.remove('visible');
      return;
    }
    const legend = LEGENDS[layerId];
    let body = '';
    if (legend.kind === 'steps') {
      body = `
        <div class="legend-steps">
          ${legend.stops.map((s) => `<div class="${legendColorClass(s.color)}"></div>`).join('')}
        </div>
        <div class="legend-labels">
          ${legend.stops.map((s) => `<span>${s.label}</span>`).join('')}
        </div>`;
    } else {
      const [tl, tr, bl, br] = legend.cells;
      body = `
        <div class="biv-legend">
          <span class="biv-y-head"><span>${legend.yLabel}</span><strong>${legend.yHi}</strong></span>
          <div class="biv-row">
            <div ${legendColorStyle(tl)}></div><div ${legendColorStyle(tr)}></div>
          </div>
          <span class="biv-y-lo">${legend.yLo}</span>
          <div class="biv-row">
            <div ${legendColorStyle(bl)}></div><div ${legendColorStyle(br)}></div>
          </div>
          <div class="biv-x-axis">
            <span>${legend.xLo}</span>
            <span class="biv-x-name">${legend.xLabel}</span>
            <span>${legend.xHi}</span>
          </div>
        </div>`;
    }
    const extras = layerId === 'grade' ? `
      <label class="outlier-check">
        <input type="checkbox" id="toggle-grade-outliers">
        <span>Highlight outliers &gt;15%</span>
      </label>` : '';
    container.innerHTML = body + extras;
    container.classList.add('visible');
  }

  function setupGroup(group: LayerGroup, onDeactivate?: Partial<Record<string, () => void>>) {
    const setVisible = (layerId: string, visible: boolean) =>
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');

    group.forEach(({ toggleId, layerId, legendId }) => {
      const el = document.getElementById(toggleId) as HTMLInputElement | null;
      const legendEl = document.getElementById(legendId)!;
      if (el && !el.checked) {
        setVisible(layerId, false);
      } else if (el?.checked) {
        renderLegend(legendEl, layerId);
      }
    });

    group.forEach(({ toggleId, layerId, legendId }) => {
      const legendEl = document.getElementById(legendId)!;
      document.getElementById(toggleId)?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        if (checked) {
          group.forEach((item) => {
            if (item.toggleId !== toggleId) {
              setVisible(item.layerId, false);
              onDeactivate?.[item.layerId]?.();
              const other = document.getElementById(item.toggleId) as HTMLInputElement | null;
              if (other) other.checked = false;
              renderLegend(document.getElementById(item.legendId)!, null);
            }
          });
          setVisible(layerId, true);
          renderLegend(legendEl, layerId);
        } else {
          setVisible(layerId, false);
          onDeactivate?.[layerId]?.();
          renderLegend(legendEl, null);
        }
      });
    });
  }

  setupGroup(SEGMENT_LAYER_GROUP, { grade: () => clearGradeOutliers(map) });

  document.getElementById('legend-grade')!.addEventListener('change', (e) => {
    const target = e.target as HTMLInputElement;
    if (target.id === 'toggle-grade-outliers') {
      setGradeOutlierVisibility(map, target.checked);
    }
  });

  setupGroup(INTERACTION_LAYER_GROUP);
  setupGroup(BLOCK_GROUP_LAYER_GROUP);

  // Independent overlays
  const INFRASTRUCTURE_OVERLAYS = [
    { toggleId: 'toggle-bike-lanes', layerId: 'bike-lanes', legendId: 'legend-bike-lanes' },
    { toggleId: 'toggle-signals', layerId: 'signals', legendId: 'legend-signals' },
    { toggleId: 'toggle-roadway-defects', layerId: 'roadway-defects', legendId: 'legend-roadway-defects' },
  ];

  const EQUITY_OVERLAYS = [
    { toggleId: 'toggle-heat', layerId: 'heat', legendId: 'legend-heat' },
    { toggleId: 'toggle-school-zones', layerId: 'school-zones', legendId: 'legend-school-zones' },
  ];

  function setupOverlays(group: typeof INFRASTRUCTURE_OVERLAYS) {
    const setVisible = (layerId: string, visible: boolean) =>
      map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');

    group.forEach(({ toggleId, layerId, legendId }) => {
      const el = document.getElementById(toggleId) as HTMLInputElement | null;
      const legendEl = document.getElementById(legendId)!;
      if (el) {
        setVisible(layerId, el.checked);
        if (el.checked) {
          renderLegend(legendEl, layerId);
        }
      }
    });

    group.forEach(({ toggleId, layerId, legendId }) => {
      const legendEl = document.getElementById(legendId)!;
      document.getElementById(toggleId)?.addEventListener('change', (e) => {
        const checked = (e.target as HTMLInputElement).checked;
        setVisible(layerId, checked);
        if (checked) {
          renderLegend(legendEl, layerId);
        } else {
          renderLegend(legendEl, null);
        }
      });
    });
  }

  setupOverlays(INFRASTRUCTURE_OVERLAYS);
  setupOverlays(EQUITY_OVERLAYS);

  // Phase 1: KSI toggle filter
  document.getElementById('toggle-ksi')?.addEventListener('change', (e) => {
    const checked = (e.target as HTMLInputElement).checked;
    const filter = checked 
      ? ['any', ['>', ['coalesce', ['get', 'has_fatality'], 0], 0], ['>', ['coalesce', ['get', 'has_severe_injury'], 0], 0]]
      : ['has', 'seg_id'];
    map.setFilter('segments-line', filter as any);
  });

  // Phase 3: Temporal & Environmental filters
  function updateSegmentColor() {
    const timeSelect = document.getElementById('filter-time-of-day') as HTMLSelectElement | null;
    const weatherSelect = document.getElementById('filter-weather') as HTMLSelectElement | null;
    if (!timeSelect || !weatherSelect) return;

    const time = timeSelect.value;
    const weather = weatherSelect.value;

    let colName = 'crash_count';
    if (time === 'all' && weather === 'all') {
      colName = 'crash_count';
    } else if (time !== 'all' && weather === 'all') {
      colName = `crash_count_${time}`;
    } else if (time === 'all' && weather !== 'all') {
      colName = `crash_count_${weather}`;
    } else {
      colName = `crash_count_${time}_${weather}`;
    }

    const riskIndexExpr = [
      'case',
      ['all', ['>', ['coalesce', ['get', 'adt'], 0], 0], ['>', ['coalesce', ['get', 'length'], 0], 0]],
      ['/', ['*', ['coalesce', ['get', colName], 0], 1000000.0], ['*', ['get', 'adt'], ['get', 'length']]],
      0.0
    ];

    map.setPaintProperty('segments-line', 'line-color', [
      'step', riskIndexExpr as any,
      '#ffffff',
      0.1, '#fee5d9',
      0.5, '#fcae91',
      2.0, '#fb6a4a',
      10.0, '#de2d26',
      50.0, '#a50f15',
    ] as any);

    // Update leaderboard when filters change!
    updateLeaderboard();
  }

  document.getElementById('filter-time-of-day')?.addEventListener('change', updateSegmentColor);
  document.getElementById('filter-weather')?.addEventListener('change', updateSegmentColor);

  function syncMobileSidebarButton() {
    const sidebar = document.getElementById('sidebar');
    const toggle = document.getElementById('sidebar-toggle') as HTMLButtonElement | null;
    const icon = toggle?.querySelector<HTMLElement>('.panel-collapse-icon');
    if (!sidebar || !toggle || !isMobileLayout()) return;

    const expanded = mobileSheetState !== 'collapsed';
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.setAttribute('aria-label', mobileSheetState === 'full' ? 'Collapse panel' : 'Expand panel');
    if (icon) icon.textContent = mobileSheetState === 'full' ? '⌄' : '⌃';
  }

  function setMobileSheetState(state: MobileSheetState) {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    mobileSheetState = state;
    sidebar.classList.remove('mobile-sheet-collapsed', 'mobile-sheet-peek', 'mobile-sheet-full');

    if (isMobileLayout()) {
      sidebar.classList.toggle('is-collapsed', state === 'collapsed');
      sidebar.classList.add(`mobile-sheet-${state}`);
      syncMobileSidebarButton();
      window.setTimeout(() => map.resize(), 260);
    }
  }

  function collapseMobileLayers() {
    const layerPanel = document.getElementById('layer-panel');
    const layerToggle = document.getElementById('layer-panel-toggle') as HTMLButtonElement | null;
    if (isMobileLayout() && layerPanel && !layerPanel.classList.contains('is-collapsed')) {
      layerToggle?.click();
    }
  }

  function showMobilePinnedPeek() {
    if (!isMobileLayout()) return;
    collapseMobileLayers();
    setMobileSheetState('peek');
  }

  function toggleMobileSheetFromHeader() {
    if (!isMobileLayout()) return false;
    collapseMobileLayers();
    setMobileSheetState(mobileSheetState === 'full' ? 'collapsed' : 'full');
    return true;
  }

  function setupCollapsiblePanels() {
    let sidebarResizeFrame = 0;
    let sidebarResizeTimeout = 0;

    const resizeMapDuringSidebarMotion = () => {
      window.cancelAnimationFrame(sidebarResizeFrame);
      window.clearTimeout(sidebarResizeTimeout);

      const startedAt = performance.now();
      const tick = () => {
        map.resize();
        if (performance.now() - startedAt < 320) {
          sidebarResizeFrame = window.requestAnimationFrame(tick);
        }
      };

      sidebarResizeFrame = window.requestAnimationFrame(tick);
      sidebarResizeTimeout = window.setTimeout(() => {
        window.cancelAnimationFrame(sidebarResizeFrame);
        map.resize();
      }, 340);
    };

    const setupPanelToggle = (
      panelId: string,
      toggleIds: string | string[],
      expandedIcon: string,
      collapsedIcon: string,
      labels: { expand: string; collapse: string },
      onChange?: () => void,
    ) => {
      const panel = document.getElementById(panelId);
      const toggles = (Array.isArray(toggleIds) ? toggleIds : [toggleIds])
        .map((id) => document.getElementById(id) as HTMLButtonElement | null)
        .filter((toggle): toggle is HTMLButtonElement => !!toggle);
      if (!panel || !toggles.length) return;

      const sync = () => {
        if (panelId === 'sidebar' && isMobileLayout()) {
          syncMobileSidebarButton();
          return;
        }

        const expanded = !panel.classList.contains('is-collapsed');
        toggles.forEach((toggle) => {
          const icon = toggle.querySelector<HTMLElement>('.panel-collapse-icon');
          const mobileSidebar = panelId === 'sidebar' && isMobileLayout();
          toggle.setAttribute('aria-expanded', String(expanded));
          toggle.setAttribute('aria-label', expanded ? labels.collapse : labels.expand);
          if (icon) {
            icon.textContent = mobileSidebar
              ? (expanded ? '⌄' : '⌃')
              : (expanded ? expandedIcon : collapsedIcon);
          }
        });
        if (panelId === 'layer-panel') {
          panel.setAttribute('aria-hidden', String(!expanded));
        }
      };

      toggles.forEach((toggle) => toggle.addEventListener('click', () => {
        if (panelId === 'sidebar' && toggleMobileSheetFromHeader()) {
          sync();
          onChange?.();
          return;
        }

        panel.classList.toggle('is-collapsed');
        sync();
        if (panelId === 'layer-panel' && isMobileLayout() && !panel.classList.contains('is-collapsed')) {
          setMobileSheetState('collapsed');
        }
        onChange?.();
      }));
      panel.addEventListener('transitionend', (event) => {
        if (
          event.target === panel
          && ['width', 'max-height', 'transform'].includes(event.propertyName)
        ) {
          map.resize();
        }
      });
      sync();
      mobileLayout.addEventListener('change', sync);
      return { panel, sync };
    };

    const sidebarPanel = setupPanelToggle(
      'sidebar',
      'sidebar-toggle',
      '‹',
      '›',
      { expand: 'Expand sidebar', collapse: 'Collapse sidebar' },
      resizeMapDuringSidebarMotion,
    );

    const layerPanel = setupPanelToggle(
      'layer-panel',
      ['layer-panel-toggle', 'layer-panel-restore'],
      '›',
      '‹',
      { expand: 'Expand layers panel', collapse: 'Collapse layers panel' },
    );

    const syncMobilePanelState = () => {
      const mobile = isMobileLayout();
      if (sidebarPanel) {
        sidebarPanel.panel.classList.remove('mobile-sheet-collapsed', 'mobile-sheet-peek', 'mobile-sheet-full');
        if (mobile) {
          mobileSheetState = 'collapsed';
          sidebarPanel.panel.classList.add('mobile-sheet-collapsed', 'is-collapsed');
        } else {
          sidebarPanel.panel.classList.remove('is-collapsed');
        }
        sidebarPanel.sync();
      }
      if (layerPanel) {
        layerPanel.panel.classList.toggle('is-collapsed', mobile);
        layerPanel.sync();
      }
      window.setTimeout(() => map.resize(), 260);
    };
    syncMobilePanelState();
    mobileLayout.addEventListener('change', syncMobilePanelState);

    document.querySelectorAll<HTMLButtonElement>('.panel-section-toggle').forEach((toggle) => {
      const section = toggle.closest('.panel-section') as HTMLElement | null;
      if (!section) return;
      const label = toggle.querySelector('span:not(.section-toggle-icon)')?.textContent?.trim() || 'section';

      const sync = () => {
        const expanded = !section.classList.contains('is-collapsed');
        toggle.setAttribute('aria-expanded', String(expanded));
        toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${label}`);
      };

      toggle.addEventListener('click', () => {
        section.classList.toggle('is-collapsed');
        sync();
      });
      sync();
    });
  }

  let activeChipId: string | null = null;

  function expandMobileSidebar() {
    if (!isMobileLayout()) return;
    collapseMobileLayers();
    setMobileSheetState('full');
  }

  function setSidebarMode(mode: 'idle' | 'pinned' | 'story', payload?: StoryChip) {
    const sidebar = document.getElementById('sidebar')!;
    const hasChip = mode === 'story' ? true : !!activeChipId;
    const collapsedClass = sidebar.classList.contains('is-collapsed') ? ' is-collapsed' : '';
    sidebar.className = `mode-${mode}${hasChip ? ' has-active-chip' : ''}${collapsedClass}`;
    if (mode === 'story' && payload) {
      activeChipId = payload.id;
      sidebar.className = `mode-story has-active-chip${collapsedClass}`;
      renderStoryContent(payload, map, focusStoryExample);
    }
    if (mode === 'story') expandMobileSidebar();
    if (mode === 'idle' && isMobileLayout()) setMobileSheetState('collapsed');
  }

  function unpin() {
    if (pinnedSegId !== null) {
      map.setFeatureState({ source: 'segments', id: pinnedSegId }, { pinned: false });
      pinnedSegId = null;
    }
    if (storyFocusedSegId !== null) {
      map.setFeatureState({ source: 'segments', id: storyFocusedSegId }, { pinned: false });
      storyFocusedSegId = null;
    }
    const chip = findChip(activeChipId);
    if (chip) {
      setSidebarMode('story', chip);
    } else {
      setSidebarMode('idle');
      setTimeout(updateLeaderboard, 50);
    }
  }

  document.getElementById('sidebar-back-story')!.addEventListener('click', unpin);

  document.getElementById('sidebar-back-idle')!.addEventListener('click', () => {
    activeChipId = null;
    document.querySelectorAll('.chip').forEach((el) => el.classList.remove('active'));
    setSidebarMode('idle');
    setTimeout(updateLeaderboard, 50);
  });

  document.getElementById('sidebar-back-leaderboard')!.addEventListener('click', () => {
    if (pinnedSegId !== null) {
      map.setFeatureState({ source: 'segments', id: pinnedSegId }, { pinned: false });
      pinnedSegId = null;
    }
    setSidebarMode('idle');
    setTimeout(updateLeaderboard, 50);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') unpin();
  });

  map.on('click', (e) => {
    const hit = map.queryRenderedFeatures(e.point, { layers: ['segments-hit'] });
    if (!hit.length && pinnedSegId !== null) unpin();
  });

  map.on('click', 'segments-hit', (e) => {
    if (!e.features?.length) return;
    const id = e.features[0].id as number | string;
    const props = e.features[0].properties as unknown as SegmentProperties;
    if (pinnedSegId !== null && pinnedSegId !== id) {
      map.setFeatureState({ source: 'segments', id: pinnedSegId }, { pinned: false });
    }
    if (storyFocusedSegId !== null && storyFocusedSegId !== id) {
      map.setFeatureState({ source: 'segments', id: storyFocusedSegId }, { pinned: false });
      storyFocusedSegId = null;
    }
    pinnedSegId = id;
    map.setFeatureState({ source: 'segments', id }, { pinned: true });
    setSidebarMode('pinned');
    renderPinnedStats(props);
    runPeerQuery(props);
    showMobilePinnedPeek();
  });

  function focusStoryExample(example: StoryFocalExample) {
    const id = example.properties.seg_id;
    if (storyFocusedSegId !== null && storyFocusedSegId !== id) {
      map.setFeatureState({ source: 'segments', id: storyFocusedSegId }, { pinned: false });
    }
    if (pinnedSegId !== null && pinnedSegId !== id) {
      map.setFeatureState({ source: 'segments', id: pinnedSegId }, { pinned: false });
    }

    storyFocusedSegId = id;
    pinnedSegId = id;
    map.setFeatureState({ source: 'segments', id }, { pinned: true });

    const center = lineFeatureCenter(example.geometry);
    if (center) {
      map.flyTo({ center, zoom: Math.max(map.getZoom(), 15), essential: true });
    }

    setSidebarMode('pinned');
    renderPinnedStats(example.properties);
    runPeerQuery(example.properties);
    showMobilePinnedPeek();
  }

  function renderPinnedStats(p: SegmentProperties) {
    const content = document.getElementById('pinned-content')!;
    const streetName = [p.st_name, p.st_type].filter(Boolean).join(' ') || 'Unknown segment';
    const fmt = (v: any, suffix: string, dec = 0) =>
      v != null && !isNaN(+v) ? `${(+v).toFixed(dec)}${suffix}` : '—';

    const delta = (p.cartway_width_ft != null && p.state_total_width_ft != null)
      ? +p.cartway_width_ft - +p.state_total_width_ft : null;
    const deltaStr = delta != null
      ? `${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ft vs state` : null;
    const deltaCls = delta != null && Math.abs(delta) > 3 ? (delta > 0 ? ' warn' : ' good') : '';

    const rows: [string, string, string][] = [
      ['Crashes', fmt(p.crash_count, ''), ''],
      ['Crash Density (/1000ft)', fmt(p.crash_density, '', 1), ''],
      ['Length', fmt(p.length, ' ft'), ''],
      ['Canopy', fmt(p.canopy_pct != null ? p.canopy_pct * 100 : null, '%'), ''],
      ['Grade', fmt(p.grade_range_smooth != null ? p.grade_range_smooth * 100 : null, '%', 1), ''],
      ['Speed', fmt(p.maxspeed_final, ' mph'), ''],
      ['Width (calc.)', fmt(p.cartway_width_ft, ' ft'), ''],
      ['Bike Lanes', p.bike_infra_type ?? 'None', ''],
      ['Int. Control', p.intersection_control ?? 'Uncontrolled', ''],
      ['311 Defects', fmt(p.roadway_defect_count, ''), ''],
      ['311 Paving', fmt(p.roadway_paving_request_count, ''), ''],
    ];
    if (deltaStr) rows.push([
      'Width (state)',
      `${fmt(p.state_total_width_ft, ' ft')} <small class="stat-note">${deltaStr}</small>`,
      deltaCls,
    ]);
    if (p.state_lane_cnt != null) rows.push(['State lanes', String(p.state_lane_cnt), '']);
    if (p.state_divisor_type && p.state_divisor_type !== 'null') {
      rows.push(['Divider', p.state_divisor_type, '']);
    }

    content.innerHTML = `
      <div class="pinned-street">
        <div class="pinned-street-name">${streetName}</div>
      </div>
      <div class="mobile-pinned-actions">
        <button type="button" id="mobile-pinned-details">Details</button>
        <button type="button" id="mobile-pinned-close">Close</button>
      </div>
      ${rows.map(([label, val, cls], idx) =>
        `<div class="stat-row${cls}${idx < 8 ? ' peek-visible' : ' peek-extra'}"><span>${label}</span><strong>${val}</strong></div>`
      ).join('')}
      <div class="peer-comparison" id="peer-comparison">
        <h4>Loading block-group context…</h4>
      </div>`;

    content.querySelector<HTMLButtonElement>('#mobile-pinned-details')?.addEventListener('click', () => {
      setMobileSheetState('full');
    });
    content.querySelector<HTMLButtonElement>('#mobile-pinned-close')?.addEventListener('click', unpin);
  }

  async function runPeerQuery(p: SegmentProperties) {
    const peerEl = document.getElementById('peer-comparison');
    if (!peerEl) return;

    try {
      const comparison = await loadBlockGroupPeerComparison(p);
      if (!comparison) {
        peerEl.innerHTML = '<h4>No block group data for this segment.</h4>';
        return;
      }

      const pctile = comparison.crashPctile != null ? Math.round(comparison.crashPctile * 100) : null;
      const medCrash = comparison.bgMedianCrash != null ? comparison.bgMedianCrash.toFixed(0) : '—';
      const medCanopy = comparison.bgMedianCanopy != null
        ? `${(comparison.bgMedianCanopy * 100).toFixed(0)}%`
        : '—';

      peerEl.innerHTML = `
        <h4>Block group (${comparison.peerN} segments)</h4>
        <div class="stat-row">
          <span>Crashes — block-group median</span>
          <strong>${medCrash}${pctile != null ? ` <small class="stat-note">(this: ${pctile}th pctile)</small>` : ''}</strong>
        </div>
        <div class="stat-row">
          <span>Canopy — block-group median</span>
          <strong>${medCanopy}</strong>
        </div>
        <details class="sql-details">
          <summary>View DuckDB query</summary>
          <pre>${comparison.sql}</pre>
        </details>`;
    } catch (err) {
      peerEl.innerHTML = '<h4>Query failed.</h4>';
      console.error(err);
    }
  }

  renderChipList((chip) => activateChip(chip, map, setSidebarMode));
  setupCollapsiblePanels();

  // Dynamic High-Risk Corridor Leaderboard
  async function updateLeaderboard() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar || !sidebar.classList.contains('mode-idle')) return;

    const leaderboardEl = document.getElementById('leaderboard-list');
    if (!leaderboardEl) return;

    const timeSelect = document.getElementById('filter-time-of-day') as HTMLSelectElement | null;
    const weatherSelect = document.getElementById('filter-weather') as HTMLSelectElement | null;
    const time = timeSelect?.value || 'all';
    const weather = weatherSelect?.value || 'all';

    let colName = 'crash_count';
    if (time === 'all' && weather === 'all') {
      colName = 'crash_count';
    } else if (time !== 'all' && weather === 'all') {
      colName = `crash_count_${time}`;
    } else if (time === 'all' && weather !== 'all') {
      colName = `crash_count_${weather}`;
    } else {
      colName = `crash_count_${time}_${weather}`;
    }

    const bounds = map.getBounds();
    try {
      const entries = await loadVisibleLeaderboard(
        bounds.getWest(),
        bounds.getSouth(),
        bounds.getEast(),
        bounds.getNorth(),
        colName
      );

      if (entries.length === 0) {
        leaderboardEl.innerHTML = '<div style="font-size: 11px; color: var(--color-muted); padding: 8px 0; text-align: center;">No qualifying segments in current view.</div>';
        return;
      }

      leaderboardEl.innerHTML = entries.map(entry => {
        const name = [entry.st_name, entry.st_type].filter(Boolean).join(' ') || 'Unnamed Segment';
        return `
          <div class="leaderboard-item" data-seg-id="${entry.seg_id}" style="padding: 6px 8px; border-radius: var(--radius-sm); cursor: pointer; display: flex; flex-direction: column; gap: 2px; transition: background 0.12s;">
            <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 8px;">
              <span style="font-size: 11.5px; font-weight: 600; color: var(--color-text-strong); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">${name}</span>
              <span style="font-size: 11px; font-weight: bold; color: var(--color-warn); white-space: nowrap;">${entry.crash_density.toFixed(1)}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 9.5px; color: var(--color-secondary); gap: 8px;">
              <span style="text-transform: capitalize;">${entry.road_class || 'Local'}</span>
              <span style="white-space: nowrap;">${entry.crash_count} crashes / ${entry.length.toFixed(0)} ft</span>
            </div>
          </div>
        `;
      }).join('');

      leaderboardEl.querySelectorAll('.leaderboard-item').forEach(el => {
        el.addEventListener('click', (e) => {
          const target = e.currentTarget as HTMLElement;
          const segId = Number(target.getAttribute('data-seg-id'));
          const feature = segmentFeatures.find(f => f.properties.seg_id === segId);
          if (feature) {
            const bounds = new maplibregl.LngLatBounds();
            if (feature.geometry.type === 'LineString') {
              feature.geometry.coordinates.forEach((coord: any) => bounds.extend(coord));
            } else if (feature.geometry.type === 'MultiLineString') {
              feature.geometry.coordinates.forEach((line: any) => line.forEach((coord: any) => bounds.extend(coord)));
            }
            map.fitBounds(bounds, { padding: 120, maxZoom: 16 });

            if (pinnedSegId !== null && pinnedSegId !== segId) {
              map.setFeatureState({ source: 'segments', id: pinnedSegId }, { pinned: false });
            }
            pinnedSegId = segId;
            map.setFeatureState({ source: 'segments', id: segId }, { pinned: true });
            setSidebarMode('pinned');
            renderPinnedStats(feature.properties);
            runPeerQuery(feature.properties);
            showMobilePinnedPeek();
          }
        });
      });
    } catch (err) {
      console.error('[leaderboard] failed to update:', err);
    }
  }

  // Update on map moves or transitions
  map.on('moveend', updateLeaderboard);
  map.once('idle', updateLeaderboard); // Initial load when map finishes loading initial viewport

  return map;
}

function lineFeatureCenter(geometry: any): [number, number] | null {
  const coords = firstLineCoordinates(geometry?.coordinates);
  if (!coords.length) return null;
  const mid = coords[Math.floor(coords.length / 2)];
  return Array.isArray(mid) && typeof mid[0] === 'number' && typeof mid[1] === 'number'
    ? [mid[0], mid[1]]
    : null;
}

function firstLineCoordinates(coords: any): any[] {
  if (!Array.isArray(coords)) return [];
  if (coords.length && typeof coords[0]?.[0] === 'number') return coords;
  for (const item of coords) {
    const line = firstLineCoordinates(item);
    if (line.length) return line;
  }
  return [];
}

let flashInterval: any = null;
export function highlightAndZoomToSegments(segIds: number[]) {
  if (!activeMap) return;

  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }

  if (segIds.length === 0) {
    activeMap.setFilter('segments-ai-highlight', ['==', ['get', 'seg_id'], -1]);
    return;
  }

  // Set filter using standard MapLibre match syntax
  activeMap.setFilter('segments-ai-highlight', ['match', ['get', 'seg_id'], segIds, true, false]);
  activeMap.setLayoutProperty('segments-ai-highlight', 'visibility', 'visible');

  // Flash animation: cycle opacity between 0.3 and 1.0 a few times
  let opacity = 1.0;
  let count = 0;
  activeMap.setPaintProperty('segments-ai-highlight', 'line-opacity', opacity);

  flashInterval = setInterval(() => {
    if (!activeMap) return;
    opacity = opacity === 1.0 ? 0.25 : 1.0;
    activeMap.setPaintProperty('segments-ai-highlight', 'line-opacity', opacity);
    count++;
    if (count >= 6) {
      clearInterval(flashInterval);
      flashInterval = null;
      activeMap.setPaintProperty('segments-ai-highlight', 'line-opacity', 0.95);
    }
  }, 250);

  // Zoom to fit bounds of these segments
  const bounds = new maplibregl.LngLatBounds();
  let hasFeatures = false;
  segIds.forEach(id => {
    const feature = allSegmentFeatures.find(f => f.properties.seg_id === id);
    if (feature && feature.geometry) {
      hasFeatures = true;
      if (feature.geometry.type === 'LineString') {
        feature.geometry.coordinates.forEach((coord: any) => bounds.extend(coord));
      } else if (feature.geometry.type === 'MultiLineString') {
        feature.geometry.coordinates.forEach((line: any) => line.forEach((coord: any) => bounds.extend(coord)));
      }
    }
  });

  if (hasFeatures) {
    activeMap.fitBounds(bounds, {
      padding: { top: 80, bottom: 80, left: 80, right: 80 },
      maxZoom: 16,
      duration: 1500
    });
  }
}
