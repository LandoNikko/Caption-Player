const COLORS = [['#ffffff', 'White'], ['#ffe23d', 'Yellow']];
const EDGES = [['box', 'Box'], ['outline', 'Outline'], ['shadow', 'Shadow'], ['none', 'None']];
// Catppuccin Mocha accent hues.
const CHAT_COLORS = ['#f5e0dc', '#f2cdcd', '#f5c2e7', '#cba6f7', '#f38ba8', '#eba0ac', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89dceb', '#74c7ec', '#89b4fa', '#b4befe'];
const CHAT_USERNAME_MODES = ['on', 'colored', 'off'];
const CHAT_USERNAME_LABELS = { on: 'On', colored: 'Colored', off: 'Off' };
// SVG icons render consistently everywhere; the Unicode glyphs they replace look uneven on iOS Safari.
const PLAY_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><polygon points="6,4 20,12 6,20"></polygon></svg>';
const PAUSE_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"></rect><rect x="14" y="4" width="4" height="16" rx="1"></rect></svg>';

let state = {
  cues: [], audioSrc: '', playing: false,
  time: 0, duration: 0, idx: -1,
  panelOpen: false, rail: true,
  chat: [], chatIdx: -1, chatRail: true, chatUsernameMode: 'on',
  audioFileName: '',
  cfg: { font: "'Helvetica Neue', Helvetica, sans-serif", size: 56, color: '#ffffff', edge: 'box', boxOpacity: 0.78, lh: 1.3, width: 92, align: 'center', caps: false }
};

const audio = document.getElementById('audio');
const captionText = document.getElementById('captionText');
const scrubTrack = document.getElementById('scrubTrack');
const progress = document.getElementById('progress');
const ticksContainer = document.getElementById('ticksContainer');
const clock = document.getElementById('clock');
const playBtn = document.getElementById('playBtn');
const stylePanel = document.getElementById('stylePanel');
const main = document.getElementById('main');
const dragOverlay = document.getElementById('dragOverlay');
const errorEl = document.getElementById('error');
const panelBackdrop = document.getElementById('panelBackdrop');
const menuBackdrop = document.getElementById('menuBackdrop');
const transcriptHandleBtn = document.getElementById('transcriptHandleBtn');
const chatHandleBtn = document.getElementById('chatHandleBtn');
const hamburgerBtn = document.getElementById('hamburgerBtn');
const uploadsDropdown = document.getElementById('uploadsDropdown');
const uploadsHeaderBtn = document.getElementById('uploadsHeaderBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const footerEl = document.querySelector('footer');
const narrowMq = window.matchMedia('(max-width: 767px)');
let errorTimeoutId;
let srtLoadId = 0;
let chatLoadId = 0;
let transcriptRows = [];
let renderedTranscriptIdx = null;
let chatRows = [];
let renderedChatIdx = null;
let fallbackFullscreen = false;
const panelLabelTimeouts = {};

function flashPanelLabel(id) {
  const label = document.querySelector('#' + id + ' .panel-label');
  if (!label) return;
  label.classList.add('show');
  window.clearTimeout(panelLabelTimeouts[id]);
  panelLabelTimeouts[id] = window.setTimeout(() => label.classList.remove('show'), 1000);
}

function isNarrow() { return narrowMq.matches; }
function isFullscreenActive() { return Boolean(document.fullscreenElement) || fallbackFullscreen; }

function syncFullscreenUI() {
  const active = isFullscreenActive();
  document.body.classList.toggle('app-fullscreen', active);
  fullscreenBtn.textContent = active ? '×' : '⛶';
  fullscreenBtn.setAttribute('aria-label', active ? 'Exit full screen' : 'Enter full screen');
  fullscreenBtn.title = active ? 'Exit full screen' : 'Enter full screen';
}

async function toggleFullscreen() {
  if (isFullscreenActive()) {
    if (document.fullscreenElement && document.exitFullscreen) {
      try {
        await document.exitFullscreen();
      } catch {
        showError('Could not exit full screen');
      }
    }
    fallbackFullscreen = false;
    syncFullscreenUI();
    return;
  }

  closeMenu();
  closePanel();
  closeTranscriptSheet();
  closeChatSheet();
  if (document.documentElement.requestFullscreen) {
    try {
      await document.documentElement.requestFullscreen();
      syncFullscreenUI();
      return;
    } catch {
      // Some mobile browsers do not allow arbitrary elements to enter native full screen.
    }
  }
  fallbackFullscreen = true;
  syncFullscreenUI();
}

function updateTranscriptUI() {
  const active = state.rail && state.cues.length > 0;
  const sheetOpen = main.classList.contains('transcript-open');
  transcriptHandleBtn.disabled = !state.cues.length;
  transcriptHandleBtn.classList.toggle('active', isNarrow() ? sheetOpen : active);
}

function updateChatUI() {
  const active = state.chatRail && state.chat.length > 0;
  const sheetOpen = main.classList.contains('chat-open');
  chatHandleBtn.disabled = !state.chat.length;
  chatHandleBtn.classList.toggle('active', isNarrow() ? sheetOpen : active);
}

function toggleMenu() {
  const open = !document.body.classList.contains('menu-open');
  document.body.classList.toggle('menu-open', open);
  menuBackdrop.classList.toggle('show', open);
  hamburgerBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
  hamburgerBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  if (open) closePanel();
}

function closeMenu() {
  document.body.classList.remove('menu-open');
  menuBackdrop.classList.remove('show');
  hamburgerBtn.setAttribute('aria-expanded', 'false');
  hamburgerBtn.setAttribute('aria-label', 'Open menu');
  closeUploadsMenu();
}

function toggleUploadsMenu() {
  const open = !uploadsDropdown.classList.contains('show');
  uploadsDropdown.classList.toggle('show', open);
  uploadsHeaderBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
}

function closeUploadsMenu() {
  uploadsDropdown.classList.remove('show');
  uploadsHeaderBtn.setAttribute('aria-expanded', 'false');
}

function applyPanelState() {
  stylePanel.style.display = state.panelOpen ? 'block' : 'none';
  document.body.classList.toggle('panel-open', state.panelOpen);
  panelBackdrop.classList.toggle('show', state.panelOpen && isNarrow());
  if (state.panelOpen) closeMenu();
}

function closePanel() {
  if (!state.panelOpen) return;
  state.panelOpen = false;
  applyPanelState();
}

function closeTranscriptSheet() {
  main.classList.remove('transcript-open');
  document.body.classList.remove('transcript-open');
  updateTranscriptUI();
}

function toggleTranscript() {
  if (!state.cues.length) {
    showError('Load a subtitle file first');
    return;
  }
  closeMenu();
  if (isNarrow()) {
    const justBuilt = !state.rail;
    if (justBuilt) {
      state.rail = true;
      document.getElementById('railBtn').textContent = 'On';
      rebuildRail(); // already flashes the label itself, so skip the direct call below
    }
    const open = !main.classList.contains('transcript-open');
    if (open) {
      if (state.panelOpen) closePanel();
      closeChatSheet();
      if (!justBuilt) flashPanelLabel('transcript');
    }
    main.classList.toggle('transcript-open', open);
    document.body.classList.toggle('transcript-open', open);
    updateTranscriptUI();
    return;
  }
  state.rail = !state.rail;
  document.getElementById('railBtn').textContent = state.rail ? 'On' : 'Off';
  if (!state.rail) closeTranscriptSheet();
  rebuildRail();
  updateTranscriptUI();
}

function closeChatSheet() {
  main.classList.remove('chat-open');
  document.body.classList.remove('chat-open');
  updateChatUI();
}

function toggleChat() {
  if (!state.chat.length) {
    showError('Load a chat file first');
    return;
  }
  closeMenu();
  if (isNarrow()) {
    const justBuilt = !state.chatRail;
    if (justBuilt) {
      state.chatRail = true;
      document.getElementById('chatRailBtn').textContent = 'On';
      rebuildChatRail(); // already flashes the label itself, so skip the direct call below
    }
    const open = !main.classList.contains('chat-open');
    if (open) {
      if (state.panelOpen) closePanel();
      closeTranscriptSheet();
      if (!justBuilt) flashPanelLabel('chat');
    }
    main.classList.toggle('chat-open', open);
    document.body.classList.toggle('chat-open', open);
    updateChatUI();
    return;
  }
  state.chatRail = !state.chatRail;
  document.getElementById('chatRailBtn').textContent = state.chatRail ? 'On' : 'Off';
  if (!state.chatRail) closeChatSheet();
  rebuildChatRail();
  updateChatUI();
}

// --- loading & parsing ---
function loadAudio(file) {
  if (!file) return;
  audio.pause();
  audio.removeAttribute('src');
  audio.load();
  if (state.audioSrc) URL.revokeObjectURL(state.audioSrc);
  state.audioSrc = URL.createObjectURL(file);
  state.audioFileName = file.name;
  state.idx = -1;
  state.time = 0;
  state.duration = 0;
  state.playing = false;
  audio.src = state.audioSrc;
  audio.load();
  document.getElementById('audioLabel').textContent = '✓';
  renderTicks();
  render();
  errorEl.classList.remove('show');
}

function loadSrt(file) {
  if (!file) return;
  const loadId = ++srtLoadId;
  const r = new FileReader();
  r.onload = () => {
    if (loadId !== srtLoadId) return;
    const cues = parseSrt(String(r.result));
    if (!cues.length) {
      showError('No cues found in ' + file.name);
      return;
    }
    state.cues = cues;
    state.idx = -1;
    document.getElementById('srtLabel').textContent = '✓';
    rebuildRail();
    renderTicks();
    updateCue();
    render();
    errorEl.classList.remove('show');
  };
  r.onerror = () => {
    if (loadId === srtLoadId) showError('Could not read ' + file.name);
  };
  r.readAsText(file);
}

function parseSrt(raw) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r/g, '').replace(/^WEBVTT.*$/m, '');
  const out = [];
  text.split(/\n{2,}/).forEach((block) => {
    const lines = block.split('\n').filter((l) => l.trim() !== '');
    if (!lines.length) return;
    const ti = lines.findIndex((l) => l.indexOf('-->') > -1);
    if (ti < 0) return;
    const m = lines[ti].match(/[\d:.,]+/g);
    if (!m || m.length < 2) return;
    const body = lines.slice(ti + 1).join('\n').replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
    if (!body) return;
    out.push({ start: timeToSecs(m[0]), end: timeToSecs(m[1]), text: body });
  });
  return out.filter((c) => c.end > c.start).sort((a, b) => a.start - b.start);
}

function timeToSecs(s) {
  const p = s.replace(',', '.').split(':').map(parseFloat);
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0] || 0;
}

function loadChat(file) {
  if (!file) return;
  const loadId = ++chatLoadId;
  const r = new FileReader();
  r.onload = () => {
    if (loadId !== chatLoadId) return;
    const chat = parseChat(String(r.result));
    if (!chat.length) {
      showError('No messages found in ' + file.name);
      return;
    }
    state.chat = chat;
    state.chatIdx = -1;
    document.getElementById('chatLabel').textContent = '✓';
    rebuildChatRail();
    updateChatIdx();
    render();
    errorEl.classList.remove('show');
  };
  r.onerror = () => {
    if (loadId === chatLoadId) showError('Could not read ' + file.name);
  };
  r.readAsText(file);
}

const CHAT_LINE_RE = /^\[(\d{1,2}(?::\d{2}){1,2})\]\s*([^:\n]+):\s*(.*)$/;

function parseChat(raw) {
  if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
  const text = raw.replace(/\r/g, '');
  const out = [];
  text.split('\n').forEach((line) => {
    line = line.trim();
    if (!line) return;
    const m = line.match(CHAT_LINE_RE);
    if (!m) return;
    const user = m[2].trim();
    const body = m[3].trim();
    if (!user || !body) return;
    out.push({ start: timeToSecs(m[1]), user, text: body });
  });
  return out.sort((a, b) => a.start - b.start);
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.codePointAt(i)) | 0;
  return Math.abs(h);
}

function colorForUser(user) {
  return CHAT_COLORS[hashString(user) % CHAT_COLORS.length];
}

// --- transport ---
function togglePlay() {
  if (!audio.src) { showError('Load an audio file first'); return; }
  if (audio.paused) audio.play().catch(() => showError('Playback blocked'));
  else audio.pause();
}

function nudge(d) { seek(state.time + d); }
function seek(t) {
  if (!Number.isFinite(state.duration) || state.duration <= 0) return;
  t = Math.max(0, Math.min(state.duration, t));
  audio.currentTime = t;
  state.time = t;
  renderPlaybackUI();
  updateCue();
  updateChatIdx();
}

function jumpCue(dir) {
  const t = state.time;
  if (dir > 0) {
    const n = findCueAfter(t + 0.05);
    if (n) seek(n.start + 0.01);
  } else {
    const p = findCueBefore(t - 0.35);
    seek((p ? p.start : 0) + 0.01);
  }
}

// --- rendering ---
function render() {
  renderCaption();
  renderPlaybackUI();
  renderTranscript();
  renderChat();
}

function renderCaption() {
  const s = state, c = s.cfg;
  const cur = s.idx >= 0 ? s.cues[s.idx] : null;
  let text = cur ? cur.text : '';
  if (!text) text = s.playing ? '' : '·';
  if (c.caps && cur) text = text.toUpperCase();

  const isIdle = !cur;
  const styles = {
    fontSize: (isIdle ? Math.min(24, c.size) : c.size) + 'px',
    fontFamily: c.font,
    lineHeight: c.lh,
    textAlign: c.align,
    color: isIdle ? '#565c65' : c.color,
    maxWidth: c.width + '%',
    whiteSpace: 'pre-wrap',
    fontWeight: 500,
    letterSpacing: c.caps ? '0.02em' : '0',
    padding: (c.edge === 'box' && !isIdle) ? '0.35em 0.6em' : '0',
    borderRadius: '4px',
    background: (c.edge === 'box' && !isIdle) ? 'rgba(6,7,9,' + c.boxOpacity + ')' : 'transparent',
  };

  if (isIdle) {
    styles.textShadow = 'none';
  } else if (c.edge === 'outline') {
    styles.textShadow = '-2px 0 0 #06070a, 2px 0 0 #06070a, 0 -2px 0 #06070a, 0 2px 0 #06070a, -2px -2px 0 #06070a, 2px 2px 0 #06070a, -2px 2px 0 #06070a, 2px -2px 0 #06070a';
  } else if (c.edge === 'shadow') {
    styles.textShadow = '0 3px 10px rgba(0,0,0,0.85)';
  } else {
    styles.textShadow = 'none';
  }

  captionText.textContent = text;
  captionText.className = isIdle ? 'caption-text empty' : 'caption-text';
  Object.assign(captionText.style, styles);
}

function renderPlaybackUI() {
  const frac = state.duration ? Math.max(0, Math.min(1, state.time / state.duration)) : 0;
  progress.style.width = (frac * 100) + '%';

  clock.textContent = fmt(state.time) + ' / ' + fmt(state.duration);

  playBtn.innerHTML = state.playing ? PAUSE_ICON : PLAY_ICON;
}

function renderTranscript() {
  if (renderedTranscriptIdx === state.idx) return;
  transcriptRows.forEach((row, i) => {
    row.classList.remove('active', 'past', 'future');
    if (i === state.idx) row.classList.add('active');
    else if (state.idx >= 0 && i < state.idx) row.classList.add('past');
    else row.classList.add('future');
  });
  renderedTranscriptIdx = state.idx;
  if (state.idx >= 0 && state.playing) {
    const active = transcriptRows[state.idx];
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function updateCue() {
  const t = state.time;
  let low = 0, high = state.cues.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (state.cues[mid].start <= t) low = mid + 1;
    else high = mid;
  }
  const candidateIdx = low - 1;
  const candidate = state.cues[candidateIdx];
  const idx = (candidate && t < candidate.end) ? candidateIdx : -1;
  if (idx === state.idx) return;
  state.idx = idx;
  renderCaption();
  renderTranscript();
}

function renderChat() {
  if (renderedChatIdx === state.chatIdx) return;
  chatRows.forEach((row, i) => {
    row.classList.remove('active', 'past', 'future');
    if (i === state.chatIdx) row.classList.add('active');
    else if (state.chatIdx >= 0 && i < state.chatIdx) row.classList.add('past');
    else row.classList.add('future');
  });
  renderedChatIdx = state.chatIdx;
  if (state.chatIdx >= 0 && state.playing) {
    const active = chatRows[state.chatIdx];
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function updateChatIdx() {
  const t = state.time;
  let low = 0, high = state.chat.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (state.chat[mid].start <= t) low = mid + 1;
    else high = mid;
  }
  const idx = low - 1;
  if (idx === state.chatIdx) return;
  state.chatIdx = idx;
  renderChat();
}

function findCueAfter(time) {
  let low = 0, high = state.cues.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (state.cues[mid].start > time) high = mid;
    else low = mid + 1;
  }
  return state.cues[low];
}

function findCueBefore(time) {
  let low = 0, high = state.cues.length;
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (state.cues[mid].start < time) low = mid + 1;
    else high = mid;
  }
  return state.cues[low - 1];
}

function fmt(t) {
  if (!isFinite(t)) t = 0;
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + ss;
}

// --- settings ---
const SETTINGS_STORAGE_KEY = 'caption-player-settings';

// Keeps a range input's fill bar (see input[type=range] in styles.css) in sync with its value.
function updateSliderFill(slider) {
  const min = parseFloat(slider.min), max = parseFloat(slider.max);
  const pct = ((parseFloat(slider.value) - min) / (max - min)) * 100;
  slider.style.setProperty('--fill', pct + '%');
}

// localStorage can throw (disabled, private browsing, quota) - settings just won't persist then.
function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify({ cfg: state.cfg, chatUsernameMode: state.chatUsernameMode }));
  } catch {}
}

// Restores cfg/chatUsernameMode from a prior session, then syncs each control's displayed value -
// needed since these are static HTML with hardcoded defaults, unlike e.g. the color swatches.
function applySavedSettings() {
  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_STORAGE_KEY));
  } catch {}
  if (saved && saved.cfg) Object.assign(state.cfg, saved.cfg);
  if (saved && saved.chatUsernameMode) state.chatUsernameMode = saved.chatUsernameMode;

  document.getElementById('fontSelect').value = state.cfg.font;

  const sizeSlider = document.getElementById('sizeSlider');
  sizeSlider.value = state.cfg.size;
  document.getElementById('sizeValue').textContent = state.cfg.size + 'px';
  updateSliderFill(sizeSlider);

  const opacitySlider = document.getElementById('opacitySlider');
  opacitySlider.value = state.cfg.boxOpacity;
  document.getElementById('opacityValue').textContent = Math.round(state.cfg.boxOpacity * 100) + '%';
  updateSliderFill(opacitySlider);

  const widthSlider = document.getElementById('widthSlider');
  widthSlider.value = state.cfg.width;
  document.getElementById('widthValue').textContent = state.cfg.width + '%';
  updateSliderFill(widthSlider);

  document.getElementById('chatUsernamesBtn').textContent = CHAT_USERNAME_LABELS[state.chatUsernameMode];
}

function setFont(f) { state.cfg.font = f; render(); saveSettings(); }
function setSize(v) { state.cfg.size = parseInt(v, 10); document.getElementById('sizeValue').textContent = v + 'px'; updateSliderFill(document.getElementById('sizeSlider')); render(); saveSettings(); }
function setColor(c) { state.cfg.color = c; render(); updateColorSwatches(); saveSettings(); }
function setEdge(e) { state.cfg.edge = e; render(); updateEdgeButtons(); saveSettings(); }
function setOpacity(o) { state.cfg.boxOpacity = parseFloat(o); document.getElementById('opacityValue').textContent = Math.round(parseFloat(o) * 100) + '%'; updateSliderFill(document.getElementById('opacitySlider')); render(); saveSettings(); }
function setWidth(w) { state.cfg.width = parseInt(w, 10); document.getElementById('widthValue').textContent = w + '%'; updateSliderFill(document.getElementById('widthSlider')); render(); saveSettings(); }

function stepSlider(id, dir) {
  const slider = document.getElementById(id);
  const min = parseFloat(slider.min);
  const max = parseFloat(slider.max);
  const step = parseFloat(slider.step) || 1;
  const decimals = (slider.step.split('.')[1] || '').length;
  const value = Math.min(max, Math.max(min, parseFloat(slider.value) + dir * step));
  slider.value = decimals ? value.toFixed(decimals) : value;
  slider.dispatchEvent(new Event('change'));
}
function toggleRail() {
  state.rail = !state.rail;
  document.getElementById('railBtn').textContent = state.rail ? 'On' : 'Off';
  if (!state.rail) closeTranscriptSheet();
  rebuildRail();
  updateTranscriptUI();
}
function toggleChatRail() {
  state.chatRail = !state.chatRail;
  document.getElementById('chatRailBtn').textContent = state.chatRail ? 'On' : 'Off';
  if (!state.chatRail) closeChatSheet();
  rebuildChatRail();
  updateChatUI();
}

function cycleChatUsernameMode() {
  const next = CHAT_USERNAME_MODES[(CHAT_USERNAME_MODES.indexOf(state.chatUsernameMode) + 1) % CHAT_USERNAME_MODES.length];
  state.chatUsernameMode = next;
  document.getElementById('chatUsernamesBtn').textContent = CHAT_USERNAME_LABELS[next];
  applyChatUsernameMode();
  saveSettings();
}

function applyChatUsernameMode() {
  const chatEl = document.getElementById('chat');
  if (!chatEl) return;
  chatEl.classList.toggle('hide-usernames', state.chatUsernameMode !== 'on');
  chatEl.classList.toggle('chat-colored-text', state.chatUsernameMode === 'colored');
}
function togglePanel() {
  state.panelOpen = !state.panelOpen;
  if (state.panelOpen) { closeTranscriptSheet(); closeChatSheet(); }
  applyPanelState();
}

function updateColorSwatches() {
  const isPreset = COLORS.some(([color]) => color === state.cfg.color);
  document.querySelectorAll('#colorSwatches .swatch:not(.swatch-custom)').forEach((el, i) => {
    el.classList.toggle('active', COLORS[i][0] === state.cfg.color);
  });
  const customBtn = document.querySelector('#colorSwatches .swatch-custom');
  const customInput = document.getElementById('customColorInput');
  if (customBtn) {
    customBtn.classList.toggle('active', !isPreset);
    customBtn.style.background = isPreset ? '' : state.cfg.color;
  }
  if (customInput && !isPreset) customInput.value = state.cfg.color;
}

function updateEdgeButtons() {
  document.querySelectorAll('#edgeGroup button').forEach((el, i) => {
    el.className = 'style-btn' + (EDGES[i][0] === state.cfg.edge ? ' active' : '');
  });
}

function rebuildRail() {
  const existing = document.getElementById('transcript');
  if (existing) existing.remove();
  transcriptRows = [];
  renderedTranscriptIdx = null;

  if (state.rail && state.cues.length) {
    main.classList.toggle('with-rail', !isNarrow());
    const t = document.createElement('aside');
    t.id = 'transcript';
    t.className = 'transcript';
    const label = document.createElement('div');
    label.className = 'panel-label';
    const labelText = document.createElement('span');
    labelText.textContent = 'Transcription';
    label.appendChild(labelText);
    t.appendChild(label);
    state.cues.forEach((cue, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'cue-row';
      if (i === state.idx) row.classList.add('active');
      else if (state.idx >= 0 && i < state.idx) row.classList.add('past');
      else row.classList.add('future');
      row.addEventListener('click', () => {
        seek(cue.start + 0.01);
        if (isNarrow()) closeTranscriptSheet();
      });
      const stamp = document.createElement('div');
      stamp.className = 'cue-stamp';
      stamp.textContent = fmt(cue.start);
      const text = document.createElement('div');
      text.className = 'cue-text';
      text.textContent = cue.text;
      row.append(stamp, text);
      transcriptRows.push(row);
      t.appendChild(row);
    });
    main.appendChild(t);
    flashPanelLabel('transcript');
  } else {
    main.classList.remove('with-rail');
    closeTranscriptSheet();
  }
  updateTranscriptUI();
}

function rebuildChatRail() {
  const existing = document.getElementById('chat');
  if (existing) existing.remove();
  chatRows = [];
  renderedChatIdx = null;

  if (state.chatRail && state.chat.length) {
    main.classList.toggle('with-chat', !isNarrow());
    const t = document.createElement('aside');
    t.id = 'chat';
    t.className = 'chat';
    t.classList.toggle('hide-usernames', state.chatUsernameMode !== 'on');
    t.classList.toggle('chat-colored-text', state.chatUsernameMode === 'colored');
    const label = document.createElement('div');
    label.className = 'panel-label';
    const labelText = document.createElement('span');
    labelText.textContent = 'Chat';
    label.appendChild(labelText);
    t.appendChild(label);
    state.chat.forEach((msg, i) => {
      const row = document.createElement('button');
      row.type = 'button';
      row.className = 'chat-row';
      if (i === state.chatIdx) row.classList.add('active');
      else if (state.chatIdx >= 0 && i < state.chatIdx) row.classList.add('past');
      else row.classList.add('future');
      row.addEventListener('click', () => {
        seek(msg.start + 0.01);
        if (isNarrow()) closeChatSheet();
      });
      const userColor = colorForUser(msg.user);
      const user = document.createElement('div');
      user.className = 'chat-user';
      user.style.color = userColor;
      user.textContent = msg.user;
      const body = document.createElement('div');
      body.className = 'chat-text';
      body.style.setProperty('--user-color', userColor);
      body.textContent = msg.text;
      row.append(user, body);
      chatRows.push(row);
      t.appendChild(row);
    });
    main.appendChild(t);
    flashPanelLabel('chat');
  } else {
    main.classList.remove('with-chat');
    closeChatSheet();
  }
  updateChatUI();
}

function showError(msg) {
  window.clearTimeout(errorTimeoutId);
  errorEl.textContent = msg;
  errorEl.classList.add('show');
  errorTimeoutId = window.setTimeout(() => errorEl.classList.remove('show'), 4000);
}

// --- setup ---
function initColorSwatches() {
  const container = document.getElementById('colorSwatches');
  COLORS.forEach(([color, name]) => {
    const btn = document.createElement('button');
    btn.className = 'swatch';
    btn.style.background = color;
    btn.setAttribute('aria-label', name + ' caption text');
    btn.onclick = () => setColor(color);
    container.appendChild(btn);
  });

  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.id = 'customColorInput';
  customInput.value = state.cfg.color;
  customInput.oninput = (e) => setColor(e.target.value);
  container.appendChild(customInput);

  const customBtn = document.createElement('button');
  customBtn.className = 'swatch swatch-custom';
  customBtn.setAttribute('aria-label', 'Custom caption text color');
  customBtn.onclick = () => customInput.click();
  container.appendChild(customBtn);

  updateColorSwatches();
}

function initEdgeButtons() {
  const container = document.getElementById('edgeGroup');
  EDGES.forEach(([edge, label]) => {
    const btn = document.createElement('button');
    btn.className = 'style-btn' + (edge === state.cfg.edge ? ' active' : '');
    btn.textContent = label;
    btn.onclick = () => setEdge(edge);
    container.appendChild(btn);
  });
}

// --- audio events ---
audio.addEventListener('timeupdate', () => {
  state.time = audio.currentTime;
  renderPlaybackUI();
  updateCue();
  updateChatIdx();
});

audio.addEventListener('loadedmetadata', () => {
  state.duration = Number.isFinite(audio.duration) ? audio.duration : 0;
  state.time = audio.currentTime || 0;
  renderTicks();
  updateCue();
  updateChatIdx();
  renderPlaybackUI();
});

audio.addEventListener('play', () => { state.playing = true; render(); });
audio.addEventListener('pause', () => { state.playing = false; render(); });
audio.addEventListener('ended', () => { state.playing = false; render(); });
audio.addEventListener('error', () => {
  if (audio.error) showError('Could not load ' + state.audioFileName);
});

// --- scrubbing ---
scrubTrack.addEventListener('pointerdown', (e) => {
  if (!state.duration) return;
  scrubTrack.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const r = scrubTrack.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    seek(f * state.duration);
  };
  move(e);
  const up = (ev) => {
    if (scrubTrack.hasPointerCapture(ev.pointerId)) scrubTrack.releasePointerCapture(ev.pointerId);
    scrubTrack.removeEventListener('pointermove', move);
    scrubTrack.removeEventListener('pointerup', up);
    scrubTrack.removeEventListener('pointercancel', up);
  };
  scrubTrack.addEventListener('pointermove', move);
  scrubTrack.addEventListener('pointerup', up);
  scrubTrack.addEventListener('pointercancel', up);
});

function renderTicks() {
  ticksContainer.replaceChildren();
  if (!state.duration || !state.cues.length) return;
  const fragment = document.createDocumentFragment();
  const stride = Math.ceil(state.cues.length / 300);
  for (let i = 0; i < state.cues.length; i += stride) {
    const cue = state.cues[i];
    if (cue.start > state.duration) continue;
    const el = document.createElement('div');
    el.className = 'tick';
    el.style.left = (cue.start / state.duration) * 100 + '%';
    fragment.appendChild(el);
  }
  ticksContainer.appendChild(fragment);
}

// --- drag & drop (desktop / fine pointer only) ---
const dragDropMq = window.matchMedia('(hover: hover) and (pointer: fine)');

function initDragDrop() {
  if (!dragDropMq.matches) return;

  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragOverlay.classList.add('show');
  });

  document.addEventListener('dragleave', (e) => {
    if (e.target === document) dragOverlay.classList.remove('show');
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    dragOverlay.classList.remove('show');
    const files = Array.from(e.dataTransfer.files);
    files.forEach((f) => {
      if (/\.(srt|vtt)$/i.test(f.name)) loadSrt(f);
      else if (/\.txt$/i.test(f.name)) routeTxtFile(f);
      else if (f.type.indexOf('audio') === 0 || /\.(mp3|m4a|wav|ogg|flac|aac)$/i.test(f.name)) loadAudio(f);
    });
  });
}

// A dropped .txt could be a transcript or a chat log; sniff its first line to tell them apart.
function routeTxtFile(file) {
  const r = new FileReader();
  r.onload = () => {
    let sample = String(r.result);
    if (sample.charCodeAt(0) === 0xFEFF) sample = sample.slice(1);
    const firstLine = (sample.split(/\r?\n/).find((l) => l.trim() !== '') || '').trim();
    if (CHAT_LINE_RE.test(firstLine)) loadChat(file);
    else loadSrt(file);
  };
  r.onerror = () => loadSrt(file);
  r.readAsText(file);
}

initDragDrop();

document.addEventListener('click', (e) => {
  if (!e.target.closest('.nav-uploads')) closeUploadsMenu();
});

// Keeps --footer-h in sync with the footer's real height (it changes across fullscreen/mobile),
// so the transcript/chat sheets can reserve exactly enough space to clear it.
function updateFooterHeightVar() {
  document.documentElement.style.setProperty('--footer-h', footerEl.getBoundingClientRect().height + 'px');
}
if (window.ResizeObserver) {
  new ResizeObserver(updateFooterHeightVar).observe(footerEl);
} else {
  window.addEventListener('resize', updateFooterHeightVar);
  updateFooterHeightVar();
}

// --- keyboard ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && fallbackFullscreen) {
    fallbackFullscreen = false;
    syncFullscreenUI();
    return;
  }
  const t = e.target.tagName;
  if (t === 'INPUT' || t === 'SELECT' || t === 'BUTTON' || t === 'TEXTAREA') return;
  if (e.code === 'Space') { e.preventDefault(); togglePlay(); }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); nudge(-5); }
  else if (e.key === 'ArrowRight') { e.preventDefault(); nudge(5); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); jumpCue(-1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); jumpCue(1); }
});

narrowMq.addEventListener('change', () => {
  closeMenu();
  if (!isNarrow()) { closeTranscriptSheet(); closeChatSheet(); }
  if (state.panelOpen) applyPanelState();
  rebuildRail();
  rebuildChatRail();
  updateTranscriptUI();
  updateChatUI();
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) fallbackFullscreen = false;
  syncFullscreenUI();
});

// init
applySavedSettings();
if (isNarrow()) {
  state.rail = false;
  document.getElementById('railBtn').textContent = 'Off';
  state.chatRail = false;
  document.getElementById('chatRailBtn').textContent = 'Off';
}
initColorSwatches();
initEdgeButtons();
rebuildRail();
rebuildChatRail();
updateTranscriptUI();
updateChatUI();
render();

// 'change' (via onchange="set…") applies the value but only fires on release; this keeps the
// thumbless bar tracking position live while dragging instead of jumping only at the end.
document.querySelectorAll('input[type=range]').forEach((slider) => {
  slider.addEventListener('input', () => updateSliderFill(slider));
});
