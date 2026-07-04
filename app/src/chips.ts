import type maplibregl from 'maplibre-gl';
import { GRADE_OUTLIER_THRESHOLD, setGradeOutlierThreshold } from './mapLayers';
import { countGradeOutliers, loadStoryFocalExamples, type StoryFocalExample } from './mapQueries';

export type StoryChip = {
  id: string;
  title: string;
  hook: string;
  toggleIds: string[];
  camera: maplibregl.FlyToOptions;
  stat: string;
  writeup: string;
  extras?: 'grade-outlier-slider';
};

export const CHIPS: StoryChip[] = [
  {
    id: 'canopy-width',
    title: 'Canopy on Narrow Streets',
    hook: 'Tree cover reduces crashes — but mostly on narrow residential roads.',
    toggleIds: ['toggle-canopy-width'],
    camera: { center: [-74.757, 40.223], zoom: 14.5 },
    stat: 'Narrow residential streets with moderate canopy show ~15–25% fewer crashes than equivalent streets with no canopy.',
    writeup: 'Wide arterial roads are built for speed, and it seems no amount of canopy coverage makes a difference. On narrow residential streets, canopy coverage is a meaningful predictor of safety. Streets that are wide <em>and</em> treeless show the highest crash concentrations.',
  },
  {
    id: 'grade-speed',
    title: 'Grade × Speed',
    hook: 'Steep hills prevent crashes on less-frenetic streets.',
    toggleIds: ['toggle-grade-speed'],
    camera: { center: [-74.743, 40.217], zoom: 14, pitch: 30, bearing: -20 },
    stat: 'On 25 mph streets, 10% grade is associated with ~65% fewer crashes. On 45+ mph arterials, the relationship reverses — grade becomes a hazard.',
    writeup: 'On slow residential streets, it follows that hills are self-calming with drivers naturally breaking on steep grades. But on faster arterials, grade amplifies risk. Possibilities: overall vision and traffic context reduces, stopping distances increase, reaction time compressed. Generally, the consequences of a mistake are more severe. The same slope that makes a Chambersburg side street relatively safe makes a fast connector road more dangerous.',
  },
  {
    id: 'method-check',
    title: 'Take it with a Grade of Salt',
    hook: 'The grade calculation is not robust on bridges, ramps, and very short segments.',
    toggleIds: ['toggle-grade'],
    camera: { center: [-74.765, 40.225], zoom: 13.5 },
    stat: 'Some segments show grades above 15% — physically implausible for a drivable city road. Most are measurement artifacts.',
    writeup: 'I calculated grade from LiDAR elevation data and noticed a small but significant number of outliers with impossible grades. Eye-checks revealed these are onramps, bridges, and overpasses. My initial attempts at sampling more points, and introducing smoothing, were not successful in limiting these errors. Use the slider to explore the threshold and see where the calculation goes wrong.',
    extras: 'grade-outlier-slider',
  },
];

export function findChip(id: string | null): StoryChip | undefined {
  return id ? CHIPS.find((chip) => chip.id === id) : undefined;
}

export type SetSidebarMode = (mode: 'idle' | 'pinned' | 'story', payload?: StoryChip) => void;
export type FocusStoryExample = (example: StoryFocalExample) => void;

export function activateChip(chip: StoryChip, map: maplibregl.Map, setSidebarMode: SetSidebarMode) {
  document.querySelectorAll<HTMLInputElement>('#layer-panel input[type=checkbox]').forEach((input) => {
    const should = chip.toggleIds.includes(input.id);
    if (input.checked !== should) {
      input.checked = should;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  map.flyTo({ ...chip.camera, essential: true });
  setSidebarMode('story', chip);
  document.querySelectorAll('.chip').forEach((el) =>
    el.classList.toggle('active', el.getAttribute('data-chip-id') === chip.id)
  );
}

export function renderStoryContent(chip: StoryChip, map: maplibregl.Map, onFocusExample: FocusStoryExample) {
  const el = document.getElementById('story-content')!;
  el.dataset.storyId = chip.id;
  const sliderHtml = chip.extras === 'grade-outlier-slider' ? `
    <div class="outlier-slider-wrap">
      <div class="outlier-slider-label">
        <span>Outlier threshold</span>
        <strong id="slider-val">15%</strong>
      </div>
      <input type="range" class="outlier-slider" id="outlier-threshold-slider"
             min="5" max="30" value="15" step="1">
      <div class="outlier-count" id="outlier-count">Counting…</div>
    </div>` : '';
  el.innerHTML = `
    <div class="story-label">Finding</div>
    <div class="story-title">${chip.title}</div>
    <div class="story-stat">${chip.stat}</div>
    <div class="story-writeup">${chip.writeup}</div>
    <div class="story-focal-examples" id="story-focal-examples">
      <div class="story-focal-loading">Finding live examples…</div>
    </div>
    ${sliderHtml}`;

  if (chip.extras === 'grade-outlier-slider') {
    const checkbox = document.getElementById('toggle-grade-outliers') as HTMLInputElement | null;
    if (checkbox && !checkbox.checked) {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    }
    setupOutlierSlider(map);
  }

  renderFocalExamples(chip, onFocusExample);
}

export function renderChipList(onActivate: (chip: StoryChip) => void) {
  const listEl = document.getElementById('chip-list')!;
  listEl.innerHTML = CHIPS.map((chip) => `
    <button class="chip" data-chip-id="${chip.id}">
      <div class="chip-title">${chip.title}</div>
      <div class="chip-hook">${chip.hook}</div>
    </button>`).join('');
  listEl.querySelectorAll<HTMLButtonElement>('.chip').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chip = findChip(btn.dataset.chipId ?? null);
      if (chip) onActivate(chip);
    });
  });
}

function setupOutlierSlider(map: maplibregl.Map) {
  const slider = document.getElementById('outlier-threshold-slider') as HTMLInputElement | null;
  const valLabel = document.getElementById('slider-val') as HTMLElement | null;
  const countEl = document.getElementById('outlier-count') as HTMLElement | null;
  if (!slider || !valLabel || !countEl) return;

  const valueEl = valLabel;
  const outputEl = countEl;
  let timer: ReturnType<typeof setTimeout> | undefined;
  async function apply(threshold: number) {
    valueEl.textContent = `${threshold}%`;
    const t = threshold / 100;
    setGradeOutlierThreshold(map, t);
    if (timer) clearTimeout(timer);
    timer = setTimeout(async () => {
      try {
        const n = await countGradeOutliers(t);
        outputEl.textContent = `${n.toLocaleString()} segments flagged at ≥${threshold}% grade`;
      } catch {
        outputEl.textContent = '';
      }
    }, 150);
  }
  slider.addEventListener('input', () => apply(Number(slider.value)));
  apply(GRADE_OUTLIER_THRESHOLD * 100);
}

async function renderFocalExamples(chip: StoryChip, onFocusExample: FocusStoryExample) {
  const storyEl = document.getElementById('story-content') as HTMLElement | null;
  const target = document.getElementById('story-focal-examples') as HTMLElement | null;
  if (!storyEl || !target) return;

  try {
    const focal = await loadStoryFocalExamples(chip.id);
    if (storyEl.dataset.storyId !== chip.id) return;

    if (!focal.examples.length) {
      target.innerHTML = '<div class="story-focal-empty">No live examples matched this story.</div>';
      return;
    }

    target.innerHTML = `
      <div class="story-focal-label">Live examples</div>
      <div class="story-focal-list">
        ${focal.examples.map((example, idx) => renderFocalExampleButton(example, idx)).join('')}
      </div>
      <details class="sql-details story-sql">
        <summary>View DuckDB query</summary>
        <pre>${escapeHtml(focal.sql.trim())}</pre>
      </details>`;

    target.querySelectorAll<HTMLButtonElement>('.story-focal-card').forEach((button) => {
      const example = focal.examples[Number(button.dataset.exampleIndex)];
      if (!example) return;
      button.addEventListener('click', () => onFocusExample(example));
    });
  } catch (err) {
    console.error(err);
    if (storyEl.dataset.storyId === chip.id) {
      target.innerHTML = '<div class="story-focal-empty">Example query failed.</div>';
    }
  }
}

function renderFocalExampleButton(example: StoryFocalExample, idx: number) {
  const p = example.properties;
  const streetName = [p.st_name, p.st_type].filter(Boolean).join(' ') || 'Unknown segment';
  const crash = p.crash_count == null ? '—' : String(p.crash_count);
  const canopy = p.canopy_pct == null ? '—' : `${(p.canopy_pct * 100).toFixed(0)}%`;
  const width = p.cartway_width_ft == null ? '—' : `${p.cartway_width_ft.toFixed(0)} ft`;
  const grade = p.grade_range_smooth == null ? '—' : `${(p.grade_range_smooth * 100).toFixed(1)}%`;
  const speed = p.maxspeed_final == null ? '—' : `${p.maxspeed_final.toFixed(0)} mph`;

  return `
    <button class="story-focal-card" type="button" data-example-index="${idx}">
      <span class="story-focal-card-label">${escapeHtml(example.label)}</span>
      <strong>${escapeHtml(streetName)}</strong>
      <span class="story-focal-reason">${escapeHtml(example.reason)}</span>
      <span class="story-focal-metrics">
        <span>Crashes ${escapeHtml(crash)}</span>
        <span>Canopy ${escapeHtml(canopy)}</span>
        <span>Width ${escapeHtml(width)}</span>
        <span>Grade ${escapeHtml(grade)}</span>
        <span>Speed ${escapeHtml(speed)}</span>
      </span>
    </button>`;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[char] ?? char));
}
