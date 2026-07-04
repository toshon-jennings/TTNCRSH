import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { query } from './db';
import { highlightAndZoomToSegments } from './map';
import { encryptKey, decryptKey } from './security';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sql?: string;
  segIds?: number[];
  error?: string;
  rows?: any[];
}

// A single conversation turn as sent to the LLM (the last turn must be 'user')
type ChatTurn = { role: 'user' | 'assistant'; content: string };

const DEFAULT_MODELS: Record<string, string> = {
  gemini: 'gemini-2.5-flash',
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
  groq: 'llama-3.3-70b-versatile',
  grok: 'grok-2-1212',
  openrouter: 'google/gemini-2.5-flash',
  custom: '',
};

const SCHEMA_GROUNDING = `
You are a Text-to-SQL assistant for TTNCRSH (Trenton Safety Analysis) running local DuckDB.
Given a user's prompt, generate a single executable DuckDB SQL query.

TABLES:
1. 'segments'
Represents street centerline segments. Actual columns (verified against parquet schema):
- seg_id (INTEGER): Unique street centerline segment identifier (Primary Key).
- st_name (VARCHAR): Street name (e.g., "Broad", "Market").
- st_type (VARCHAR): Street suffix (e.g., "St", "Ave", "Blvd").
- class (INTEGER): Functional classification code (1: Expressway, 2: Major Arterial, 3: Minor Arterial, 4: Collector, 5: Local, 9: Ramp). DO NOT use road_class — it does not exist.
- length (FLOAT): Segment length in feet.
- cartway_width_ft (FLOAT): Roadway cartway width (curb-to-curb) in feet.
- width_confidence (VARCHAR): Reliability of the cartway width measurement.
- maxspeed_final (FLOAT): Posted speed limit in mph.
- lanes_final (INTEGER): Best available lane count (prefers state road data, falls back to OSM).
- canopy_pct (FLOAT): Tree canopy cover fraction (0.0 to 1.0).
- grade_range_smooth (FLOAT): Smoothed segment slope grade (0.0 to 1.0 = 0% to 100% slope).
- grade_smooth_p90 (FLOAT): 90th percentile of smoothed grade along the segment.
- state_total_width_ft (FLOAT): Total roadway width from State Road attributes.
- state_lane_cnt (INTEGER): Number of lanes from State Road data.
- state_divisor_type (VARCHAR): Median separator ("Divided", "Undivided", "Barrier").
- state_aadt (FLOAT): PennDOT state-road AADT where present; NULL for most local/city streets — PennDOT only surveys state-owned roads, so this is NULL for the vast majority of segments.
- state_road_distance (FLOAT): Feet to nearest State Road centerline.
- GEOID (VARCHAR): Census block group identifier for the segment midpoint.
- dvrpc_aadt (FLOAT): Raw DVRPC traffic-count volume. Do NOT treat this as AADT or use it for any rate/normalization query; the source service mixes 15-minute, bicycle, pedestrian, and class-count records, so it is not a reliable vehicle count.
- crash_density (FLOAT): Crashes per 1,000 ft of segment length (crash_count * 1000.0 / length). This is the app's crash-rate metric — it deliberately does NOT normalize by traffic volume, because no reliable per-segment volume exists for most Trenton streets. Prefer this over raw crash_count when comparing segments of different lengths.
- crash_count (INTEGER): Total snapped crashes.
- fatal_count (INTEGER): Number of fatal crashes.
- injury_count (INTEGER): Number of general injury crashes.
- severity_score (INTEGER): Weighted severity score (10*fatal + 4*serious + 1*injury).
- has_fatality (INTEGER): Binary (1: has fatality; 0: otherwise).
- has_severe_injury (INTEGER): Binary (1: has suspected serious injury; 0: otherwise).
- bike_infra_type (VARCHAR): Bicycle facility: 'Protected', 'Painted', 'Sharrow', or 'None'.
- intersection_control (VARCHAR): 'Signalized', 'Stop-Controlled', or 'Uncontrolled'.
- is_divided (INTEGER): Binary (1: divided roadway; 0: undivided).
- has_signal (INTEGER): Binary (1: has traffic signal; 0: otherwise).
- calming_device_count (INTEGER): Number of traffic calming devices on this segment.
- nighttime_illumination (INTEGER): Streetlight pole count proxy.
- is_glare_prone (INTEGER): Binary (1: East-West segment prone to sun glare; 0: otherwise).
- crash_count_day (INTEGER), crash_count_night (INTEGER), crash_count_clear (INTEGER), crash_count_wet (INTEGER)
- crash_count_day_clear (INTEGER), crash_count_day_wet (INTEGER), crash_count_night_clear (INTEGER), crash_count_night_wet (INTEGER)
- is_school_zone (INTEGER): Binary (1: within 500ft of school; 0: otherwise).
- high_heat_vulnerability (INTEGER): Binary (1: Heat Vulnerability Index 4 or 5; 0: otherwise).
- roadway_request_count (INTEGER): Total 311 roadway-condition requests since 2020.
- roadway_defect_count (INTEGER): 311 Street Defect requests (SR-ST01) since 2020.
- roadway_paving_request_count (INTEGER): 311 Street Paving requests (SR-ST23) since 2020.
- roadway_open_request_count (INTEGER): Open 311 roadway-condition requests.
- geometry (GEOMETRY): LineString (EPSG:4326).

NEVER use these columns (they DO NOT exist and will cause a database error — the query will fail): road_class, susp_serious_inj_count, ped_count, bicycle_count, osm_lanes, osm_maxspeed, osm_highway, maxspeed_inferred, has_any_control, oneway, tree_count, adt, adt_source, vmt, risk_index, has_aadt.
If you need pedestrian or bicycle crash data: use crash_count (total crashes). There are no separate ped_count or bicycle_count columns.\n
2. 'block_groups'
Contains census block groups. Columns:
- GEOID (VARCHAR): FIPS block group unique identifier (Primary Key).
- population (INTEGER): Total population count.
- median_income (INTEGER): Median household income in USD.
- geometry (GEOMETRY): Polygon boundary (EPSG:4326).

3. 'neighborhoods'
Contains neighborhood boundaries. Columns:
- name (VARCHAR): Uppercase neighborhood name with underscores (e.g., 'CENTER_CITY', 'UNIVERSITY_CITY', 'CHESTNUT_HILL', 'MOUNT_AIRY_EAST', 'MOUNT_AIRY_WEST').
- listname (VARCHAR): Human-readable list name (e.g., 'Center City East', 'University City', 'Chestnut Hill', 'Mount Airy, East', 'Mount Airy, West').
- mapname (VARCHAR): Human-readable map name (e.g., 'Center City East', 'University City', 'West Mount Airy').
- geometry (GEOMETRY): Polygon/MultiPolygon boundary (EPSG:4326).

CRITICAL RULES:
1. ALWAYS select 'seg_id' in any query returning street segments (required to highlight on map).
2. DuckDB has spatial support — use geometry columns directly, NOT ST_GeomFromWKB.
3. ONLY use columns explicitly listed above in the segments table definition. Do NOT use any other column names — they do not exist and the query will fail with BinderError.
4. Output ONLY valid SQL wrapped in \`\`\`sql ... \`\`\` code blocks. No markdown explanations.
5. For neighborhood queries: spatial join with ST_Intersects(s.geometry, n.geometry).
   Mt. Airy: name LIKE '%MOUNT_AIRY%' or IN ('MOUNT_AIRY_EAST', 'MOUNT_AIRY_WEST').
6. South Trenton: GEOID LIKE '3402100%'.
7. ALWAYS append LIMIT 20 unless the user explicitly requests more.
8. The conversation may include earlier questions and the SQL that answered them. For follow-up requests (e.g., "now only school zones", "sort those by fatalities"), modify the most recent SQL accordingly instead of starting from scratch.
`;

function escapeHTML(text: string): string {
  return text.replace(/[&<>"']/g, (ch) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!)
  );
}

function renderMarkdown(text: string): string {
  const renderer = new marked.Renderer();
  const originalTable = renderer.table.bind(renderer);
  renderer.table = (...args) => `<div class="table-scroll">${originalTable(...args)}</div>`;
  const rawHtml = marked.parse(text, { async: false, gfm: true, breaks: true, renderer });
  return DOMPurify.sanitize(rawHtml);
}

function extractSQL(text: string): string {
  const sqlMatch = text.match(/```sql([\s\S]*?)```/i);
  if (sqlMatch) {
    return sqlMatch[1].trim();
  }
  const codeMatch = text.match(/```([\s\S]*?)```/i);
  if (codeMatch) {
    return codeMatch[1].trim();
  }
  return text.trim();
}

async function consumeSSE(response: Response, onEvent: (raw: string) => void): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;
  const decoder = new TextDecoder();
  let buffer = '';
  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return;
    const payload = trimmed.slice(5).trim();
    if (payload === '[DONE]') return;
    onEvent(payload);
  };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    lines.forEach(processLine);
  }
  // Flush any final event that arrived without a trailing newline
  buffer += decoder.decode();
  buffer.split('\n').forEach(processLine);
}

function validateReadOnlySQL(sql: string): void {
  // Strip line and block comments, then leading/trailing whitespace
  const stripped = sql
    .replace(/--.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .trim();

  if (!/^(SELECT|WITH)\b/i.test(stripped)) {
    throw new Error('Only read-only SELECT/WITH queries are allowed.');
  }

  // Reject multi-statement input: no semicolon except one optional trailing terminator
  const withoutTrailingSemi = stripped.replace(/;\s*$/, '');
  if (withoutTrailingSemi.includes(';')) {
    throw new Error('Multi-statement SQL is not allowed.');
  }
}

function cleanQueryResults(rows: any[]): any[] {
  return rows.map((row) => {
    const cleaned: any = {};
    for (const key of Object.keys(row)) {
      const val = row[key];
      if (typeof val === 'bigint') {
        cleaned[key] = Number(val);
      } else if (val instanceof Uint8Array) {
        cleaned[key] = '[Binary/Geometry Data]';
      } else if (typeof val === 'object' && val !== null) {
        cleaned[key] = val.toString();
      } else {
        cleaned[key] = val;
      }
    }
    return cleaned;
  });
}

async function callLLM(
  provider: string,
  model: string,
  apiKey: string,
  systemPrompt: string,
  turns: ChatTurn[],
  onChunk?: (delta: string) => void,
  baseUrl?: string
): Promise<string> {
  if (!apiKey && provider !== 'custom') {
    throw new Error('API Key is missing. Please configure it in the assistant settings (gear icon).');
  }

  const streaming = !!onChunk;

  if (provider === 'gemini') {
    const url = streaming
      ? `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`
      : `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: turns.map((t) => ({
          role: t.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: t.content }],
        })),
        systemInstruction: {
          parts: [{ text: systemPrompt }],
        },
        generationConfig: {
          temperature: 0.1,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Error ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch {}
      throw new Error(`Gemini API error: ${errorMsg}`);
    }

    if (streaming) {
      let fullText = '';
      await consumeSSE(response, (raw) => {
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
          if (delta) {
            fullText += delta;
            onChunk!(delta);
          }
        } catch {}
      });
      if (!fullText) {
        throw new Error('Gemini API returned an empty response.');
      }
      return fullText;
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Gemini API returned an empty response.');
    }
    return text;
  } else if (provider === 'anthropic') {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        max_tokens: 1024,
        system: systemPrompt,
        messages: turns,
        temperature: 0.1,
        stream: streaming,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Error ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch {}
      throw new Error(`Anthropic API error: ${errorMsg}`);
    }

    if (streaming) {
      let fullText = '';
      await consumeSSE(response, (raw) => {
        try {
          const parsed = JSON.parse(raw);
          if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
            const delta: string = parsed.delta.text;
            fullText += delta;
            onChunk!(delta);
          }
        } catch {}
      });
      if (!fullText) {
        throw new Error('Anthropic API returned an empty response.');
      }
      return fullText;
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
    if (!text) {
      throw new Error('Anthropic API returned an empty response.');
    }
    return text;
  } else {
    // OpenAI-compatible endpoint configurations
    let endpoint = '';
    if (provider === 'openai') {
      endpoint = 'https://api.openai.com/v1/chat/completions';
    } else if (provider === 'groq') {
      endpoint = 'https://api.groq.com/openai/v1/chat/completions';
    } else if (provider === 'grok') {
      endpoint = 'https://api.x.ai/v1/chat/completions';
    } else if (provider === 'openrouter') {
      endpoint = 'https://openrouter.ai/api/v1/chat/completions';
    } else if (provider === 'custom') {
      if (!baseUrl) {
        throw new Error('Base URL is missing. Please configure it in the assistant settings (gear icon).');
      }
      endpoint = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    } else {
      throw new Error(`Unknown provider: ${provider}`);
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model,
        messages: [{ role: 'system', content: systemPrompt }, ...turns],
        temperature: 0.1,
        stream: streaming,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      let errorMsg = `Error ${response.status}`;
      try {
        const parsed = JSON.parse(errText);
        if (parsed.error?.message) errorMsg = parsed.error.message;
      } catch {}
      throw new Error(`${provider.toUpperCase()} API error: ${errorMsg}`);
    }

    if (streaming) {
      let fullText = '';
      await consumeSSE(response, (raw) => {
        try {
          const parsed = JSON.parse(raw);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullText += delta;
            onChunk!(delta);
          }
        } catch {}
      });
      if (!fullText) {
        throw new Error(`${provider.toUpperCase()} API returned an empty response.`);
      }
      return fullText;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) {
      throw new Error(`${provider.toUpperCase()} API returned an empty response.`);
    }
    return text;
  }
}

export function initAIAssistant() {
  const container = document.getElementById('app');
  if (!container) return;

  // Create UI elements
  const chatBubble = document.createElement('button');
  chatBubble.id = 'ai-chat-bubble';
  chatBubble.className = 'ai-chat-bubble';
  chatBubble.setAttribute('aria-label', 'Open safety assistant');
  chatBubble.setAttribute('aria-haspopup', 'true');
  chatBubble.innerHTML = `
    <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
      <circle cx="9" cy="10" r="1" fill="currentColor"></circle>
      <circle cx="15" cy="10" r="1" fill="currentColor"></circle>
    </svg>
  `;

  const chatPanel = document.createElement('div');
  chatPanel.id = 'ai-chat-panel';
  chatPanel.className = 'ai-chat-panel is-collapsed';
  chatPanel.setAttribute('aria-hidden', 'true');
  
  const isTrentonApp = window.location.pathname.toLowerCase().includes('trenton') || window.location.pathname.toLowerCase().includes('ttncrsh');
  const appPrefix = isTrentonApp ? 'ttncrsh_' : 'phlcrsh_';
  const logoPath = isTrentonApp ? '/TTNCRSH/favicon.png' : '/PHLCRSH-V2/favicon.png';

  chatPanel.innerHTML = `
    <div class="ai-panel-header">
      <div class="ai-panel-title-area">
        <img src="${logoPath}" class="ai-title-icon" width="16" height="16" alt="Safety Icon">
        <span class="ai-panel-title">Safety Assistant</span>
      </div>
      <div class="ai-panel-actions">
        <button id="ai-clear-chat" class="ai-panel-action-btn" aria-label="Clear chat history">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"></path>
            <path d="M10 11v6"></path>
            <path d="M14 11v6"></path>
            <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"></path>
          </svg>
        </button>
        <button id="ai-settings-toggle" class="ai-panel-action-btn" aria-label="Toggle LLM settings">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
        <button id="ai-chat-close" class="ai-panel-action-btn" aria-label="Close safety assistant">×</button>
      </div>
    </div>

    <div id="ai-settings-pane" class="ai-settings-pane is-hidden">
      <h4 class="ai-settings-title">Assistant Settings</h4>
      <div class="ai-settings-field">
        <label for="ai-provider">LLM Provider</label>
        <select id="ai-provider">
          <option value="gemini">Gemini</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
          <option value="groq">Groq</option>
          <option value="grok">Grok</option>
          <option value="openrouter">OpenRouter</option>
          <option value="custom">Custom (OpenAI-compatible)</option>
        </select>
        <div id="ai-provider-note" class="ai-settings-alert" style="display: none;"></div>
      </div>
      <div class="ai-settings-field">
        <label for="ai-model">Model Name</label>
        <input type="text" id="ai-model" placeholder="gemini-2.5-flash">
      </div>
      <div id="ai-base-url-field" class="ai-settings-field" style="display: none;">
        <label for="ai-base-url">Base URL</label>
        <input type="text" id="ai-base-url" placeholder="http://localhost:1234/v1">
      </div>
      <div class="ai-settings-field">
        <label for="ai-api-key">API Key</label>
        <input type="password" id="ai-api-key" placeholder="Enter API key...">
      </div>
      <div class="ai-settings-field" id="ai-pin-field" style="display: none;">
        <label for="ai-pin">4-Digit Security PIN</label>
        <input type="password" id="ai-pin" placeholder="Enter 4-digit PIN..." maxlength="4" pattern="[0-9]*" inputmode="numeric">
        <div class="ai-settings-alert" style="display: block; margin-top: 4px; color: var(--color-muted); font-size: 9.5px;">Required to encrypt and store your key in localStorage.</div>
      </div>
      <button id="ai-settings-save" class="ai-settings-save-btn">Save & Close</button>
    </div>

    <div id="ai-chat-messages" class="ai-chat-messages">
    </div>

    <form id="ai-chat-form" class="ai-chat-input-area">
      <input type="text" id="ai-chat-input" placeholder="Ask about safety..." autocomplete="off" required>
      <button type="submit" id="ai-chat-send" class="ai-chat-send-btn" aria-label="Send message">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <line x1="22" y1="2" x2="11" y2="13"></line>
          <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
        </svg>
      </button>
    </form>
  `;

  container.appendChild(chatBubble);
  container.appendChild(chatPanel);

  // DOM references
  const messagesContainer = document.getElementById('ai-chat-messages') as HTMLDivElement;
  const chatForm = document.getElementById('ai-chat-form') as HTMLFormElement;
  const chatInput = document.getElementById('ai-chat-input') as HTMLInputElement;
  const chatSendBtn = document.getElementById('ai-chat-send') as HTMLButtonElement;
  const settingsToggle = document.getElementById('ai-settings-toggle') as HTMLButtonElement;
  const settingsPane = document.getElementById('ai-settings-pane') as HTMLDivElement;
  const settingsSaveBtn = document.getElementById('ai-settings-save') as HTMLButtonElement;
  const chatCloseBtn = document.getElementById('ai-chat-close') as HTMLButtonElement;
  const clearChatBtn = document.getElementById('ai-clear-chat') as HTMLButtonElement;

  const providerSelect = document.getElementById('ai-provider') as HTMLSelectElement;
  const modelInput = document.getElementById('ai-model') as HTMLInputElement;
  const apiKeyInput = document.getElementById('ai-api-key') as HTMLInputElement;
  const pinField = document.getElementById('ai-pin-field') as HTMLDivElement;
  const pinInput = document.getElementById('ai-pin') as HTMLInputElement;
  const providerNote = document.getElementById('ai-provider-note') as HTMLDivElement;
  const baseUrlField = document.getElementById('ai-base-url-field') as HTMLDivElement;
  const baseUrlInput = document.getElementById('ai-base-url') as HTMLInputElement;

  // Dynamic scoping based on path
  const PREFIX = `${appPrefix}ai_`;

  // Load Settings from LocalStorage
  let currentProvider = localStorage.getItem(`${PREFIX}provider`) || 'gemini';
  let currentModel = localStorage.getItem(`${PREFIX}model`) || DEFAULT_MODELS[currentProvider];
  let currentBaseUrl = localStorage.getItem(`${PREFIX}base_url`) || '';
  let currentApiKey = ''; // Loaded dynamically on unlock

  // Initialize form fields
  providerSelect.value = currentProvider;
  modelInput.value = currentModel;
  baseUrlInput.value = currentBaseUrl;
  pinField.style.display = currentProvider === 'custom' ? 'none' : 'block';
  baseUrlField.style.display = currentProvider === 'custom' ? 'flex' : 'none';

  const updateProviderNote = (provider: string) => {
    if (provider === 'anthropic') {
      providerNote.style.display = 'block';
      providerNote.textContent = 'Note: Requires an Anthropic API key. Direct browser requests are supported.';
      providerNote.style.color = 'var(--color-good)';
    } else if (provider === 'gemini') {
      providerNote.style.display = 'block';
      providerNote.textContent = 'Note: Gemini API keys can be requested on Google AI Studio. Direct browser requests work seamlessly.';
      providerNote.style.color = 'var(--color-good)';
    } else if (provider === 'custom') {
      providerNote.style.display = 'block';
      providerNote.textContent = 'Note: Point this at a local OpenAI-compatible server, e.g. LM Studio (http://localhost:1234/v1) or Ollama (http://localhost:11434/v1). An API key is usually not required.';
      providerNote.style.color = 'var(--color-good)';
    } else {
      providerNote.style.display = 'none';
    }
  };
  updateProviderNote(currentProvider);

  // Toggle Settings Pane
  const toggleSettings = () => {
    const isHidden = settingsPane.classList.contains('is-hidden');
    if (isHidden) {
      // Refresh inputs
      currentProvider = localStorage.getItem(`${PREFIX}provider`) || 'gemini';
      currentModel = localStorage.getItem(`${PREFIX}model`) || DEFAULT_MODELS[currentProvider];
      currentBaseUrl = localStorage.getItem(`${PREFIX}base_url`) || '';

      providerSelect.value = currentProvider;
      modelInput.value = currentModel;
      baseUrlInput.value = currentBaseUrl;
      pinField.style.display = currentProvider === 'custom' ? 'none' : 'block';

      // Clear input values
      const rawKey = localStorage.getItem(`${PREFIX}key_${currentProvider}`);
      const encKey = localStorage.getItem(`${PREFIX}key_${currentProvider}_enc`);
      if (rawKey) {
        apiKeyInput.value = rawKey;
        apiKeyInput.placeholder = "Enter API key...";
      } else if (encKey) {
        apiKeyInput.value = '';
        apiKeyInput.placeholder = "[Encrypted Key Saved]";
      } else {
        apiKeyInput.value = '';
        apiKeyInput.placeholder = "Enter API key...";
      }
      pinInput.value = '';

      baseUrlField.style.display = currentProvider === 'custom' ? 'flex' : 'none';
      updateProviderNote(currentProvider);

      settingsPane.classList.remove('is-hidden');
      settingsPane.setAttribute('aria-hidden', 'false');
    } else {
      settingsPane.classList.add('is-hidden');
      settingsPane.setAttribute('aria-hidden', 'true');
    }
  };

  settingsToggle.addEventListener('click', toggleSettings);

  // Handle Provider Change (update default models)
  providerSelect.addEventListener('change', () => {
    const prov = providerSelect.value;
    modelInput.value = DEFAULT_MODELS[prov] || '';
    pinField.style.display = prov === 'custom' ? 'none' : 'block';

    const rawKey = localStorage.getItem(`${PREFIX}key_${prov}`);
    const encKey = localStorage.getItem(`${PREFIX}key_${prov}_enc`);
    if (rawKey) {
      apiKeyInput.value = rawKey;
      apiKeyInput.placeholder = "Enter API key...";
    } else if (encKey) {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = "[Encrypted Key Saved]";
    } else {
      apiKeyInput.value = '';
      apiKeyInput.placeholder = "Enter API key...";
    }
    pinInput.value = '';

    baseUrlInput.value = localStorage.getItem(`${PREFIX}base_url`) || '';
    baseUrlField.style.display = prov === 'custom' ? 'flex' : 'none';
    updateProviderNote(prov);
  });

  // Save Settings
  settingsSaveBtn.addEventListener('click', async () => {
    const prov = providerSelect.value;
    const model = modelInput.value.trim();
    const key = apiKeyInput.value.trim();
    const baseUrl = baseUrlInput.value.trim();
    const pin = pinInput.value.trim();

    if (key && prov !== 'custom') {
      if (pin.length !== 4 || !/^\d+$/.test(pin)) {
        alert('Please enter a 4-digit numeric PIN to encrypt your API key.');
        return;
      }
      try {
        const encrypted = await encryptKey(key, pin);
        localStorage.setItem(`${PREFIX}key_${prov}_enc`, encrypted);
        localStorage.removeItem(`${PREFIX}key_${prov}`); // Remove raw key if any
      } catch (err) {
        alert('Encryption failed. Please try again.');
        return;
      }
    } else if (!key && apiKeyInput.placeholder !== "[Encrypted Key Saved]") {
      localStorage.removeItem(`${PREFIX}key_${prov}_enc`);
      localStorage.removeItem(`${PREFIX}key_${prov}`);
    }

    localStorage.setItem(`${PREFIX}provider`, prov);
    localStorage.setItem(`${PREFIX}model`, model);
    localStorage.setItem(`${PREFIX}base_url`, baseUrl);

    currentProvider = prov;
    currentModel = model;
    currentApiKey = key;
    currentBaseUrl = baseUrl;

    toggleSettings();
    checkLockState();
  });

  // Toggle Chat Panel visibility
  const toggleChatPanel = () => {
    const isCollapsed = chatPanel.classList.contains('is-collapsed');
    if (isCollapsed) {
      chatPanel.classList.remove('is-collapsed');
      chatPanel.setAttribute('aria-hidden', 'false');
      chatBubble.style.transform = 'scale(0) rotate(-90deg)';
      setTimeout(() => chatInput.focus(), 150);
    } else {
      chatPanel.classList.add('is-collapsed');
      chatPanel.setAttribute('aria-hidden', 'true');
      chatBubble.style.transform = '';
    }
  };

  chatBubble.addEventListener('click', toggleChatPanel);
  chatCloseBtn.addEventListener('click', toggleChatPanel);

  // Scroll messages area to bottom
  const scrollToBottom = () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  };

  // Only auto-scroll during streaming while the user is already reading near the bottom
  const isNearBottom = () =>
    messagesContainer.scrollHeight - messagesContainer.scrollTop - messagesContainer.clientHeight < 48;

  // Build the primary text/markdown body for a message
  const renderMessageBody = (msg: Message): string =>
    msg.role === 'assistant'
      ? renderMarkdown(msg.content)
      : escapeHTML(msg.content).replace(/\n/g, '<br>');

  // Build the SQL/map/error affordances that trail a finished message
  const renderMessageExtras = (msg: Message): string => {
    let html = '';

    if (msg.sql) {
      const sqlId = `sql-${Math.random().toString(36).substr(2, 9)}`;
      html += `
        <button class="sql-details-btn" data-sql-id="${sqlId}">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          View Generated SQL
        </button>
        <div id="${sqlId}" style="display: none; margin-top: 6px;">
          <pre><code>${escapeHTML(msg.sql)}</code></pre>
        </div>
      `;
    }

    if (msg.segIds && msg.segIds.length > 0) {
      html += `
        <button class="show-on-map-btn" data-segs="${msg.segIds.join(',')}">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 2px;"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
          Flash & Zoom to Streets (${msg.segIds.length})
        </button>
      `;
    }

    if (msg.rows && msg.rows.length > 0) {
      const dataId = `data-${Math.random().toString(36).substr(2, 9)}`;
      const headers = Object.keys(msg.rows[0]).filter((key) => key !== 'geometry');
      const displayRows = msg.rows.slice(0, 20);
      const tableHead = headers.map((h) => `<th>${escapeHTML(h)}</th>`).join('');
      const tableBody = displayRows
        .map(
          (row) =>
            `<tr>${headers.map((h) => `<td>${escapeHTML(String(row[h] ?? ''))}</td>`).join('')}</tr>`
        )
        .join('');
      html += `
        <button class="sql-details-btn" data-data-id="${dataId}">
          <svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg>
          View Data (${msg.rows.length} rows)
        </button>
        <div id="${dataId}" style="display: none; margin-top: 6px;">
          <div class="table-scroll"><table><thead><tr>${tableHead}</tr></thead><tbody>${tableBody}</tbody></table></div>
        </div>
      `;
    }

    if (msg.error) {
      html += `
        <div style="color: var(--color-warn); font-size: 10px; margin-top: 6px; border-left: 2px solid var(--color-warn); padding-left: 6px;">
          <strong>Error:</strong> ${escapeHTML(msg.error)}
        </div>
      `;
    }

    return html;
  };

  // Wire up the SQL-toggle and show-on-map buttons for a rendered message
  const attachMessageListeners = (msgDiv: HTMLDivElement) => {
    msgDiv.querySelector('[data-sql-id]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const id = btn.getAttribute('data-sql-id');
      const detailsDiv = document.getElementById(id!);
      if (detailsDiv) {
        const isHidden = detailsDiv.style.display === 'none';
        detailsDiv.style.display = isHidden ? 'block' : 'none';
        btn.innerHTML = isHidden
          ? `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg> Hide Generated SQL`
          : `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg> View Generated SQL`;
        scrollToBottom();
      }
    });

    msgDiv.querySelector('.show-on-map-btn')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const idsStr = btn.getAttribute('data-segs');
      if (idsStr) {
        const ids = idsStr.split(',').map(Number);
        highlightAndZoomToSegments(ids);
      }
    });

    msgDiv.querySelector('[data-data-id]')?.addEventListener('click', (e) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const id = btn.getAttribute('data-data-id');
      const detailsDiv = document.getElementById(id!);
      if (detailsDiv) {
        const isHidden = detailsDiv.style.display === 'none';
        detailsDiv.style.display = isHidden ? 'block' : 'none';
        const rowsLabel = btn.textContent?.match(/\(\d+ rows\)/)?.[0] || '';
        btn.innerHTML = isHidden
          ? `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"></polyline></svg> Hide Data ${rowsLabel}`
          : `<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"></polyline></svg> View Data ${rowsLabel}`;
        scrollToBottom();
      }
    });
  };

  // Persisted chat history (localStorage), capped at the last 50 messages
  const HISTORY_KEY = `${PREFIX}history`;
  let chatHistory: Message[] = [];
  try {
    const saved = localStorage.getItem(HISTORY_KEY);
    if (saved) chatHistory = JSON.parse(saved);
  } catch {}

  const saveHistory = () => {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(chatHistory.slice(-50)));
    } catch {}
  };

  // Append a complete message bubble to the list
  const appendMessage = (msg: Message): HTMLDivElement => {
    const msgDiv = document.createElement('div');
    msgDiv.className = `ai-message ${msg.role}-message`;
    msgDiv.innerHTML = renderMessageBody(msg) + renderMessageExtras(msg);
    messagesContainer.appendChild(msgDiv);
    attachMessageListeners(msgDiv);
    scrollToBottom();
    return msgDiv;
  };

  // Append an empty assistant bubble that can be filled in incrementally as tokens stream in
  const appendStreamingMessage = () => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'ai-message assistant-message';
    messagesContainer.appendChild(msgDiv);
    scrollToBottom();

    return {
      update: (partialText: string) => {
        const pinned = isNearBottom();
        msgDiv.innerHTML = renderMarkdown(partialText);
        if (pinned) scrollToBottom();
      },
      finish: (msg: Message) => {
        const pinned = isNearBottom();
        msgDiv.innerHTML = renderMessageBody(msg) + renderMessageExtras(msg);
        attachMessageListeners(msgDiv);
        if (pinned) scrollToBottom();
      },
      remove: () => msgDiv.remove(),
    };
  };

  // Lock State checker & renderer
  const renderMessages = () => {
    const isTrenton = PREFIX.startsWith('ttncrsh');
    const titleName = isTrenton ? 'TTNCRSH' : 'PHLCRSH';
    const regionName = isTrenton ? 'South Trenton' : 'South Philly';
    
    messagesContainer.innerHTML = `
      <div class="ai-message assistant-message">
        Hi! I'm your ${titleName} Safety Assistant. Ask me a safety query (e.g., "Find the top 5 highest risk streets with no bike lanes in ${regionName}") and I will query the local DuckDB database and summarize the insights.
      </div>
      <div id="ai-starter-chips" class="ai-starter-chips">
        <button type="button" class="ai-starter-chip">Top 10 riskiest streets citywide</button>
        <button type="button" class="ai-starter-chip">High-risk streets with no bike lanes in ${regionName}</button>
        <button type="button" class="ai-starter-chip">Most 311 street defects near schools</button>
        <button type="button" class="ai-starter-chip">Streets with fatal crashes and no traffic signal</button>
      </div>
    `;

    // Wire up starter chips
    const starterChipsEl = document.getElementById('ai-starter-chips') as HTMLDivElement;
    starterChipsEl?.querySelectorAll<HTMLButtonElement>('.ai-starter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        chatInput.value = chip.textContent || '';
        starterChipsEl.remove();
        chatForm.requestSubmit();
      });
    });

    // Restore persisted messages after the welcome bubble
    if (chatHistory.length > 0) {
      chatHistory.forEach((msg) => appendMessage(msg));
      starterChipsEl?.remove();
    }

    scrollToBottom();
  };

  const checkLockState = () => {
    const encryptedKey = localStorage.getItem(`${PREFIX}key_${currentProvider}_enc`);
    const rawKey = localStorage.getItem(`${PREFIX}key_${currentProvider}`);
    
    settingsToggle.classList.remove('warning');
    settingsToggle.removeAttribute('title');

    if (encryptedKey) {
      // Locked state
      chatInput.disabled = true;
      chatSendBtn.disabled = true;
      chatInput.placeholder = "Please unlock the assistant...";

      messagesContainer.innerHTML = `
        <div class="ai-lock-screen">
          <svg class="ai-lock-icon" viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
          <div class="ai-lock-title">Assistant is Locked</div>
          <div class="ai-lock-desc">Your API key is encrypted. Enter your 4-digit PIN to unlock.</div>
          <input type="password" id="ai-unlock-pin" class="ai-pin-input" maxlength="4" pattern="[0-9]*" inputmode="numeric" placeholder="••••" autofocus>
          <button id="ai-unlock-btn" class="ai-unlock-btn">Unlock</button>
          <div id="ai-unlock-error" class="ai-unlock-error" style="display: none;"></div>
        </div>
      `;

      const unlockPin = document.getElementById('ai-unlock-pin') as HTMLInputElement;
      const unlockBtn = document.getElementById('ai-unlock-btn') as HTMLButtonElement;
      const unlockError = document.getElementById('ai-unlock-error') as HTMLDivElement;

      const attemptUnlock = async () => {
        const pin = unlockPin.value.trim();
        if (pin.length !== 4) {
          unlockError.textContent = "PIN must be 4 digits.";
          unlockError.style.display = 'block';
          return;
        }
        unlockBtn.disabled = true;
        unlockBtn.textContent = "Decrypting...";
        try {
          const dec = await decryptKey(encryptedKey, pin);
          currentApiKey = dec;
          
          chatInput.disabled = false;
          chatSendBtn.disabled = false;
          chatInput.placeholder = "Ask about safety...";
          
          renderMessages();
        } catch (err) {
          unlockBtn.disabled = false;
          unlockBtn.textContent = "Unlock";
          unlockError.textContent = "Incorrect PIN. Try again.";
          unlockError.style.display = 'block';
          unlockPin.value = '';
          unlockPin.focus();
        }
      };

      unlockBtn.addEventListener('click', attemptUnlock);
      unlockPin.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') attemptUnlock();
      });
      unlockPin.focus();
    } else {
      // Unlocked state (either custom, no key, or legacy unencrypted key)
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.placeholder = "Ask about safety...";

      if (rawKey && currentProvider !== 'custom') {
        currentApiKey = rawKey;
        settingsToggle.classList.add('warning');
        settingsToggle.setAttribute('title', 'Security Warning: API key is stored unencrypted in localStorage. Open settings and set a PIN.');
      } else {
        currentApiKey = '';
      }

      renderMessages();
    }
  };

  // Clear chat history and reset the panel back to just the welcome bubble
  clearChatBtn.addEventListener('click', () => {
    chatHistory = [];
    saveHistory();
    renderMessages();
  });

  // Initial check on load
  checkLockState();

  // Submit Handler
  chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const promptText = chatInput.value.trim();
    if (!promptText) return;

    chatInput.value = '';
    chatInput.disabled = true;
    chatSendBtn.disabled = true;

    const userMsg: Message = { role: 'user', content: promptText };
    appendMessage(userMsg);
    chatHistory.push(userMsg);
    saveHistory();

    if (!currentApiKey && currentProvider !== 'custom') {
      const noKeyMsg: Message = {
        role: 'assistant',
        content: 'I need an API key to orchestrate the safety query. Please click the gear icon in the top right of this chat box, select a provider, input your API key, and save it.',
      };
      appendMessage(noKeyMsg);
      chatHistory.push(noKeyMsg);
      saveHistory();
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      return;
    }

    const statusIndicator = document.createElement('div');
    statusIndicator.className = 'ai-status-indicator';
    statusIndicator.innerHTML = `
      <div class="ai-spinner"></div>
      <span class="ai-status-text">Formulating SQL query...</span>
    `;
    messagesContainer.appendChild(statusIndicator);
    scrollToBottom();

    const updateStatus = (text: string) => {
      const txtSpan = statusIndicator.querySelector('.ai-status-text');
      if (txtSpan) txtSpan.textContent = text;
    };

    let generatedSQL = '';
    let segIds: number[] = [];
    let duckdbRows: any[] = [];
    let cleanedRows: any[] = [];
    let errMsg = '';

    // Conversation context: walk prior history (excluding the just-sent user message)
    // backwards, collecting user→assistant pairs from turns that produced real SQL.
    // The SQL pass sees the prior SQL (so follow-ups modify it); the summary pass sees
    // the prior prose. Capped at 3 pairs, with content truncated to bound token cost.
    const priorHistory = chatHistory.slice(0, -1);
    const buildTurns = (mode: 'sql' | 'summary'): ChatTurn[] => {
      const turns: ChatTurn[] = [];
      for (let i = priorHistory.length - 1; i > 0 && turns.length < 6; i--) {
        const a = priorHistory[i];
        const u = priorHistory[i - 1];
        if (a.role !== 'assistant' || u.role !== 'user' || a.error || !a.sql) continue;
        turns.unshift(
          { role: 'user', content: u.content.slice(0, 500) },
          {
            role: 'assistant',
            content: mode === 'sql' ? `\`\`\`sql\n${a.sql}\n\`\`\`` : a.content.slice(0, 1200),
          }
        );
        i--;
      }
      return turns;
    };
    const sqlTurns = buildTurns('sql');

    // SQL generation + execution with auto-retry once on failure
    const executeSQL = async (): Promise<void> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          updateStatus(attempt === 0 ? 'Formulating SQL query...' : 'SQL error — retrying with corrected query...');
          const sqlLLMResult = await callLLM(
            currentProvider,
            currentModel,
            currentApiKey,
            SCHEMA_GROUNDING,
            [
              ...sqlTurns,
              {
                role: 'user',
                content:
                  attempt === 0
                    ? `Generate a DuckDB SQL query for this request: "${promptText}". Return ONLY the query wrapped in a \`\`\`sql ... \`\`\` code block.`
                    : `The following DuckDB SQL query failed. Fix it and return ONLY the corrected SQL in a \`\`\`sql block.

Previous query:
\`\`\`sql
${generatedSQL}
\`\`\`

Error: ${errMsg}

Remember: ONLY use columns listed in the schema. Do NOT reference: road_class, susp_serious_inj_count, ped_count, bicycle_count, state_aadt, osm_lanes, osm_maxspeed, osm_highway, maxspeed_inferred, has_any_control, oneway, tree_count.`,
              },
            ],
            undefined,
            currentBaseUrl
          );

          generatedSQL = extractSQL(sqlLLMResult);
          console.log('[AI Chat] Generated SQL:', generatedSQL);
          validateReadOnlySQL(generatedSQL);

          updateStatus('Executing query locally on DuckDB...');
          const queryResult = await query(generatedSQL);
          duckdbRows = queryResult.toArray();
          cleanedRows = cleanQueryResults(duckdbRows);
          console.log('[AI Chat] Query rows count:', cleanedRows.length);

          duckdbRows.forEach((row: any) => {
            if (row.seg_id !== undefined && row.seg_id !== null) {
              const id = Number(row.seg_id);
              if (!isNaN(id)) segIds.push(id);
            }
          });

          if (segIds.length > 0) {
            highlightAndZoomToSegments(segIds);
          }
          return; // success
        } catch (err: any) {
          if (attempt === 0 && generatedSQL) {
            errMsg = err.message || String(err);
            console.warn('[AI Chat] First SQL attempt failed, retrying:', errMsg);
            continue; // retry once
          }
          throw err; // both failed or no SQL to fix
        }
      }
    };

    let streamingMsg: ReturnType<typeof appendStreamingMessage> | null = null;
    let streamedText = '';

    try {
      await executeSQL();

      updateStatus('Analyzing results & drafting insights...');
      const summarySystemPrompt = `You are a professional transportation safety analyst.
The user asked a safety question. We ran a DuckDB query on local Trenton street segment datasets to fetch grounded facts.
Analyze the query results and summarize the findings into a concise, human-readable safety insight.
Format the response in Markdown: use **bold** for street names and key statistics, short bullet lists for findings, and a compact table only when comparing several segments side by side.
Do NOT output raw code or raw JSON. Keep it professional and focus on high risk indexes, crashes, speed limits, lack of bike lanes, canopy cover, or other variables.
Suggest safety improvements or highlighting observations.`;

      const summaryUserPrompt = `The user asked: "${promptText}"

Executed SQL Query:
\`\`\`sql
${generatedSQL}
\`\`\`

DuckDB Local Query Results:
\`\`\`json
${JSON.stringify(cleanedRows.slice(0, 15), null, 2)}
\`\`\`
${cleanedRows.length > 15 ? `\n(Note: ${cleanedRows.length - 15} more rows were returned but omitted here for size)` : ''}

Summarize these findings and provide actionable insights.`;

      statusIndicator.remove();
      streamingMsg = appendStreamingMessage();

      const summaryResult = await callLLM(
        currentProvider,
        currentModel,
        currentApiKey,
        summarySystemPrompt,
        [...buildTurns('summary'), { role: 'user', content: summaryUserPrompt }],
        (delta) => {
          streamedText += delta;
          streamingMsg!.update(streamedText);
        },
        currentBaseUrl
      );

      const finalMsg: Message = {
        role: 'assistant',
        content: summaryResult,
        sql: generatedSQL,
        segIds: segIds.length > 0 ? segIds : undefined,
        rows: cleanedRows.length > 0 ? cleanedRows : undefined,
      };
      streamingMsg.finish(finalMsg);
      chatHistory.push(finalMsg);
      saveHistory();

    } catch (err: any) {
      console.error('[AI Chat] Error:', err);
      statusIndicator.remove();

      // Keep any partially streamed answer rather than discarding it
      const errorMsg: Message = {
        role: 'assistant',
        content: streamedText || `Sorry, I encountered an issue orchestrating that safety query.`,
        sql: generatedSQL || undefined,
        error: err.message || String(err),
      };
      if (streamingMsg) {
        streamingMsg.finish(errorMsg);
      } else {
        appendMessage(errorMsg);
      }
      chatHistory.push(errorMsg);
      saveHistory();
    } finally {
      chatInput.disabled = false;
      chatSendBtn.disabled = false;
      chatInput.focus();
    }
  });
}
