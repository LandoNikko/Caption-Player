const COLORS = [['#ffffff', 'White'], ['#ffe23d', 'Yellow'], ['#5ee0f0', 'Cyan'], ['#8ef58e', 'Green'], ['#0c0d10', 'Black']];
const EDGES = [['box', 'Box'], ['outline', 'Outline'], ['shadow', 'Shadow'], ['none', 'None']];
// Catppuccin Mocha accent hues — muted pastels that read clearly on the dark chat rail.
const CHAT_COLORS = ['#f5e0dc', '#f2cdcd', '#f5c2e7', '#cba6f7', '#f38ba8', '#eba0ac', '#fab387', '#f9e2af', '#a6e3a1', '#94e2d5', '#89dceb', '#74c7ec', '#89b4fa', '#b4befe'];

let state = {
  cues: [], audioSrc: '', playing: false,
  time: 0, duration: 0, idx: -1,
  panelOpen: false, rail: true,
  chat: [], chatIdx: -1, chatRail: true,
  cfg: { font: "'Helvetica Neue', Helvetica, sans-serif", size: 56, color: '#ffffff', edge: 'box', boxOpacity: 0.78, lh: 1.3, width: 80, align: 'center', caps: false }
};

const audio = document.getElementById('audio');
const captionText = document.getElementById('captionText');
const scrubTrack = document.getElementById('scrubTrack');
const progress = document.getElementById('progress');
const knob = document.getElementById('knob');
const ticksContainer = document.getElementById('ticksContainer');
const clock = document.getElementById('clock');
const playBtn = document.getElementById('playBtn');
const stylePanel = document.getElementById('stylePanel');
const main = document.getElementById('main');
const dragOverlay = document.getElementById('dragOverlay');
const errorEl = document.getElementById('error');
const panelBackdrop = document.getElementById('panelBackdrop');
const menuBackdrop = document.getElementById('menuBackdrop');
const transcriptBackdrop = document.getElementById('transcriptBackdrop');
const transcriptHeaderBtn = document.getElementById('transcriptHeaderBtn');
const chatBackdrop = document.getElementById('chatBackdrop');
const chatHeaderBtn = document.getElementById('chatHeaderBtn');
const hamburgerBtn = document.getElementById('hamburgerBtn');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const narrowMq = window.matchMedia('(max-width: 767px)');
let errorTimeoutId;
let srtLoadId = 0;
let chatLoadId = 0;
let transcriptRows = [];
let renderedTranscriptIdx = null;
let chatRows = [];
let renderedChatIdx = null;
let fallbackFullscreen = false;

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
  transcriptHeaderBtn.disabled = !state.cues.length;
  transcriptHeaderBtn.classList.toggle('active', isNarrow() ? sheetOpen : active);
}

function updateChatUI() {
  const active = state.chatRail && state.chat.length > 0;
  const sheetOpen = main.classList.contains('chat-open');
  chatHeaderBtn.disabled = !state.chat.length;
  chatHeaderBtn.classList.toggle('active', isNarrow() ? sheetOpen : active);
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
  transcriptBackdrop.classList.remove('show');
  updateTranscriptUI();
}

function toggleTranscript() {
  if (!state.cues.length) {
    showError('Load a subtitle file first');
    return;
  }
  closeMenu();
  if (isNarrow()) {
    if (!state.rail) {
      state.rail = true;
      document.getElementById('railBtn').textContent = 'On';
      rebuildRail();
    }
    const open = !main.classList.contains('transcript-open');
    if (open) {
      if (state.panelOpen) closePanel();
      closeChatSheet();
    }
    main.classList.toggle('transcript-open', open);
    document.body.classList.toggle('transcript-open', open);
    transcriptBackdrop.classList.toggle('show', open);
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
  chatBackdrop.classList.remove('show');
  updateChatUI();
}

function toggleChat() {
  if (!state.chat.length) {
    showError('Load a chat file first');
    return;
  }
  closeMenu();
  if (isNarrow()) {
    if (!state.chatRail) {
      state.chatRail = true;
      document.getElementById('chatRailBtn').textContent = 'On';
      rebuildChatRail();
    }
    const open = !main.classList.contains('chat-open');
    if (open) {
      if (state.panelOpen) closePanel();
      closeTranscriptSheet();
    }
    main.classList.toggle('chat-open', open);
    document.body.classList.toggle('chat-open', open);
    chatBackdrop.classList.toggle('show', open);
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

  // caption styling
  const isIdle = !cur;
  const styles = {
    fontSize: (isIdle ? Math.min(24, c.size) : c.size) + 'px',
    fontFamily: c.font,
    lineHeight: c.lh,
    textAlign: c.align,
    color: isIdle ? '#565c65' : c.color,
    maxWidth: c.width + '%',
    whiteSpace: 'pre-wrap',
    textWrap: 'pretty',
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
  knob.style.left = (frac * 100) + '%';

  clock.textContent = fmt(state.time) + ' / ' + fmt(state.duration);

  playBtn.textContent = state.playing ? '❙❙' : '▶';
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
  let idx = -1;
  for (let i = 0; i < state.cues.length; i++) {
    if (t >= state.cues[i].start && t < state.cues[i].end) {
      idx = i;
      break;
    }
  }
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
function setFont(f) { state.cfg.font = f; render(); }
function setSize(v) { state.cfg.size = parseInt(v, 10); document.getElementById('sizeValue').textContent = v + 'px'; render(); }
function setColor(c) { state.cfg.color = c; render(); updateColorSwatches(); }
function setEdge(e) { state.cfg.edge = e; render(); updateEdgeButtons(); }
function setOpacity(o) { state.cfg.boxOpacity = parseFloat(o); document.getElementById('opacityValue').textContent = Math.round(parseFloat(o) * 100) + '%'; render(); }
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
function togglePanel() {
  state.panelOpen = !state.panelOpen;
  if (state.panelOpen) { closeTranscriptSheet(); closeChatSheet(); }
  applyPanelState();
}

function updateColorSwatches() {
  document.querySelectorAll('.swatch').forEach((el, i) => {
    el.className = 'swatch' + (COLORS[i][0] === state.cfg.color ? ' active' : '');
  });
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
    if (isNarrow()) {
      const handle = document.createElement('div');
      handle.className = 'transcript-handle';
      handle.setAttribute('aria-hidden', 'true');
      const top = document.createElement('div');
      top.className = 'transcript-top';
      const closeButton = document.createElement('button');
      closeButton.className = 'transcript-close';
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Close transcript');
      closeButton.textContent = '×';
      closeButton.addEventListener('click', closeTranscriptSheet);
      top.append(handle, closeButton);
      t.append(top);
    }
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
    if (isNarrow()) {
      const handle = document.createElement('div');
      handle.className = 'chat-handle';
      handle.setAttribute('aria-hidden', 'true');
      const top = document.createElement('div');
      top.className = 'chat-top';
      const closeButton = document.createElement('button');
      closeButton.className = 'chat-close';
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', 'Close chat');
      closeButton.textContent = '×';
      closeButton.addEventListener('click', closeChatSheet);
      top.append(handle, closeButton);
      t.append(top);
    }
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
      const user = document.createElement('div');
      user.className = 'chat-user';
      user.style.color = colorForUser(msg.user);
      user.textContent = msg.user;
      const body = document.createElement('div');
      body.className = 'chat-text';
      body.textContent = msg.text;
      row.append(user, body);
      chatRows.push(row);
      t.appendChild(row);
    });
    main.appendChild(t);
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
    btn.className = 'swatch' + (color === state.cfg.color ? ' active' : '');
    btn.style.background = color;
    btn.setAttribute('aria-label', name + ' caption text');
    btn.onclick = () => setColor(color);
    container.appendChild(btn);
  });
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
  if (audio.error) showError('Could not load ' + document.getElementById('audioLabel').textContent);
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
