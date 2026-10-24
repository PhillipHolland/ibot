import { angleDelta, consumeRotation, pointerAngle, createAccelerator, accelerate, segmentDistToCenter } from "./wheel.js";
import { fitIpod } from "./layout.js";
import { CHARACTERS, nextCharacter, beatIntervalMs, characterMarkup, centerGesture } from "./avatar.js";
import { shouldScroll, marqueeMarkup } from "./marquee.js";
import { windowStart } from "./list.js";
import { nextClickTime, CLICK_GAIN } from "./click.js";
import {
  HOLD_MS, HOLD_REPEAT_MS, VOLUME_IDLE_MS, SEEK_IDLE_MS, SEEK_COMMIT_MS, KEY_REPEAT_DELAY_MS, KEY_REPEAT_MS, IDLE_JUMP_MS,
  createScrollAccumulator, createHoldSeek, createReversalFilter, createRepeater, previousAction, seekAction,
  stepVolume, clampSeek, keyAction, keyStepAmount, seekMultiplier,
} from "./controls.js";
import { createEyes } from "./eyes.js";

const PAGE = 100;
const lcd = document.getElementById("lcd");
const lcdTitle = document.getElementById("lcd-title");
const device = document.getElementById("device");
const wheel = document.getElementById("wheel");
const npIcon = document.getElementById("np-play");

const state = {
  stack: [],
  index: 0,
  music: null,
  developerToken: "",
  tokenExp: 0,
  nowPlaying: false,
  backlit: false,
  click: localStorage.getItem("ipod-click") !== "off",
  error: "",
  avatar: Number(localStorage.getItem("ipod-avatar")) || 0,
};

function applyTheme() {
  document.body.classList.remove("theme-black");
  localStorage.removeItem("ipod-theme");
}

function applyFit() {
  const fitEl = document.getElementById("fit");
  if (!fitEl) return;
  const cs = getComputedStyle(document.documentElement);
  const insets = {
    top: parseFloat(cs.getPropertyValue("--sat")) || 0,
    right: parseFloat(cs.getPropertyValue("--sar")) || 0,
    bottom: parseFloat(cs.getPropertyValue("--sab")) || 0,
    left: parseFloat(cs.getPropertyValue("--sal")) || 0,
  };
  const fit = fitIpod(window.innerWidth, window.innerHeight, insets, 4);
  fitEl.style.transform = `translate(${fit.x + fit.boxW / 2 - window.innerWidth / 2}px, ${fit.y + fit.boxH / 2 - window.innerHeight / 2}px) scale(${fit.scale})`;
}

const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

function toggleFullscreen() {
  if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
  else document.exitFullscreen?.();
}

/**
 * Click sound the way Apple's iPod does it: one decoded buffer played through
 * a 0.3 gain node, scheduled 50 ms apart. Falls back to a small reused
 * <audio> pool until the buffer is ready (no element allocated per click).
 */
const click = { ctx: null, gain: null, buffer: null, lastAt: -Infinity, pool: [], poolIdx: 0, lastFallback: 0 };
function clickContext() {
  if (click.ctx) return click.ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    click.ctx = new AC();
    click.gain = click.ctx.createGain();
    click.gain.gain.value = CLICK_GAIN;
    click.gain.connect(click.ctx.destination);
    fetch("assets/click.wav")
      .then((r) => r.arrayBuffer())
      .then((buf) => new Promise((res, rej) => click.ctx.decodeAudioData(buf, res, rej)))
      .then((decoded) => { click.buffer = decoded; })
      .catch(() => {});
  } catch {
    click.ctx = null;
  }
  return click.ctx;
}
/** Resume inside a user gesture (iOS starts and re-suspends contexts). */
function unlockClick() {
  if (!state.click) return;
  const ctx = clickContext();
  if (ctx && ctx.state !== "running") ctx.resume?.().catch(() => {});
}
function tick() {
  if (!state.click) return;
  const ctx = click.ctx;
  if (ctx && click.buffer && ctx.state === "running") {
    const at = nextClickTime(ctx.currentTime, click.lastAt);
    if (at == null) return;
    click.lastAt = at;
    const src = ctx.createBufferSource();
    src.buffer = click.buffer;
    src.connect(click.gain);
    src.start(at);
    return;
  }
  const now = performance.now();
  if (now - click.lastFallback < 50) return;
  click.lastFallback = now;
  if (!click.pool.length) {
    for (let i = 0; i < 4; i++) {
      const a = new Audio("assets/click.wav");
      a.preload = "auto";
      a.volume = CLICK_GAIN;
      click.pool.push(a);
    }
  }
  const node = click.pool[click.poolIdx++ % click.pool.length];
  try { node.currentTime = 0; } catch { /* not loaded yet */ }
  node.play().catch(() => {});
}
addEventListener("pointerdown", unlockClick, { capture: true, passive: true });
addEventListener("keydown", unlockClick, { capture: true, passive: true });

function fmt(sec) {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const s = Math.floor(sec % 60);
  const m = Math.floor(sec / 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function fetchToken() {
  const res = await fetch("/api/token", { cache: "no-store" });
  if (!res.ok) throw new Error("token");
  const data = await res.json();
  state.developerToken = data.token;
  state.tokenExp = data.expiresAt;
}

async function ensureToken() {
  const left = state.tokenExp - Date.now() / 1000;
  if (!state.developerToken || left < 86400) await fetchToken();
}

function current() {
  return state.stack[state.stack.length - 1];
}

const SLIDE_MS = 240;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
let slideRaf = 0;
function slideEase(t) {
  return -0.5 * (Math.cos(Math.PI * t) - 1);
}
/**
 * Slide the screen (#lcd) inside .screen-body, which is the overflow clip,
 * like Apple's screens slide inside their clipped parent. Moving the clip box
 * itself carried the rows out over the bezel and the body.
 */
function slideScreens(dir) {
  cancelAnimationFrame(slideRaf);
  lcd.style.transform = "";
  const body = document.getElementById("screen-body");
  if (!body || reducedMotion.matches) return;
  const w = body.clientWidth || 273;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / SLIDE_MS);
    const x = (1 - slideEase(t)) * dir * w;
    if (t < 1) {
      lcd.style.transform = `translate3d(${x}px,0,0)`;
      slideRaf = requestAnimationFrame(step);
    } else {
      lcd.style.transform = "";
      slideRaf = 0;
    }
  };
  lcd.style.transform = `translate3d(${dir * w}px,0,0)`;
  slideRaf = requestAnimationFrame(step);
}

function push(screen) {
  leaveNowPlaying();
  state.stack.push({ index: 0, ...screen });
  render();
  slideScreens(1);
}

/** Apple's screen change out of Now Playing closes the volume overlay and commits any seek. */
function leaveNowPlaying() {
  if (!state.nowPlaying) return;
  state.nowPlaying = false;
  seekCtl.exit();
  volumeCtl.exit(false);
}

/** Push the Now Playing screen (Apple's `Ft(rl())`). */
function showNowPlaying() {
  if (state.nowPlaying) { renderNow(); return; }
  state.nowPlaying = true;
  render();
  slideScreens(1);
}

/** Menu: back one screen (Apple's `Gt`). At the root it does nothing. */
function goBack() {
  if (state.nowPlaying) {
    leaveNowPlaying();
    render();
    slideScreens(-1);
    return;
  }
  if (state.stack.length > 1) {
    state.stack.pop();
    render();
    slideScreens(-1);
  }
}

/** Menu held 1 s toggles the backlight (Apple's `backlight.toggle`). */
function toggleBacklight() {
  state.backlit = !state.backlit;
  document.getElementById("screen")?.classList.toggle("backlit", state.backlit);
}

function move(rows) {
  const screen = current();
  if (!screen || state.nowPlaying) return false;
  const n = screen.items.length;
  if (!n) return false;
  const next = Math.max(0, Math.min(n - 1, screen.index + rows));
  if (next === screen.index) return false;
  screen.index = next;
  maybeLoadMore();
  render();
  return true;
}

function visibleRows() {
  return 6;
}

/** Live DOM for the current list or now-playing view, so updates patch instead of rebuild. */
let listView = null;
let npView = null;
const MARQUEE_SETTLE_MS = 150;
let marqueeTimer = 0;

/** Every full LCD rewrite goes through here so cached views never point at dead nodes. */
function setLcd(html) {
  clearTimeout(marqueeTimer);
  listView = null;
  npView = null;
  lcd.innerHTML = html;
}

/** "iBot" is pinned in the title bar, so a screen titled "iBot" shows no centered title. */
function setTitle(text) {
  const t = text === "iBot" ? "" : text;
  if (lcdTitle.textContent !== t) lcdTitle.textContent = t;
}

function render() {
  const screen = current();
  setTitle(state.nowPlaying ? "Now Playing" : screen?.title || "iBot");
  npIcon?.toggleAttribute("hidden", !state.nowPlaying);
  if (state.error && !state.music?.isAuthorized) {
    setLcd(`<div class="note">${escapeHtml(state.error)}</div>`);
    return;
  }
  if (state.nowPlaying) {
    renderNow();
    return;
  }
  if (!screen) return;
  if (screen.root) syncRootItems(screen);
  const note = screen.noteHtml
    ? `<div class="note">${screen.noteHtml}</div>`
    : (screen.note ? `<div class="note">${escapeHtml(screen.note)}</div>` : "");
  if (!screen.items.length) {
    setLcd(note);
    return;
  }
  renderList(screen, note);
}

function rowHtml(item, abs, selected) {
  const chev = item.chev ? `<span class="chevron" aria-hidden="true"></span>` : "";
  return `<div class="menu-item${selected ? " selected" : ""}" role="option" data-i="${abs}"><span class="item-title">${escapeHtml(item.label)}</span>${chev}</div>`;
}

/**
 * Build the 6-row window once per screen, then patch: a wheel step only moves
 * the selected class and rewrites the rows whose item changed.
 */
function renderList(screen, note) {
  const n = Math.min(visibleRows(), screen.items.length);
  const start = windowStart(screen.index, screen.items.length, visibleRows());
  const v = listView;
  if (!v || v.screen !== screen || v.note !== note || v.rows.length !== n || !v.ul.isConnected) {
    let rows = "";
    for (let i = 0; i < n; i++) rows += rowHtml(screen.items[start + i], start + i, start + i === screen.index);
    setLcd(`<ul class="menu-items" role="listbox">${note}${rows}</ul>`);
    const ul = lcd.firstElementChild;
    listView = { screen, note, ul, rows: Array.from(ul.querySelectorAll(".menu-item")), labels: [], sel: screen.index - start, selAbs: screen.index };
    for (let i = 0; i < n; i++) listView.labels[i] = screen.items[start + i].label;
    scheduleMarquee();
    return;
  }
  const sel = screen.index - start;
  const selChanged = screen.index !== v.selAbs;
  for (let i = 0; i < n; i++) {
    const row = v.rows[i];
    const abs = start + i;
    const item = screen.items[abs];
    const title = row.firstElementChild;
    if (row.dataset.i !== String(abs)) row.dataset.i = String(abs);
    // New item in this slot, or a marquee on a row that is no longer the
    // fresh selection: back to plain ellipsized text.
    if (v.labels[i] !== item.label || (title.firstElementChild && (i !== sel || selChanged))) {
      title.textContent = item.label;
      v.labels[i] = item.label;
    }
    const hasChev = row.lastElementChild?.classList.contains("chevron");
    if (!!item.chev !== hasChev) {
      if (item.chev) row.insertAdjacentHTML("beforeend", `<span class="chevron" aria-hidden="true"></span>`);
      else row.lastElementChild.remove();
    }
    if (row.classList.contains("selected") !== (i === sel)) row.classList.toggle("selected", i === sel);
  }
  v.sel = sel;
  v.selAbs = screen.index;
  if (selChanged) scheduleMarquee();
}

/**
 * Marquee only the selected row, only when it overflows, and only after the
 * wheel settles (Apple's track waits 2 s before moving anyway). The read
 * happens once on a clean layout, never inside pointermove.
 */
function scheduleMarquee() {
  clearTimeout(marqueeTimer);
  marqueeTimer = setTimeout(applyMarquee, MARQUEE_SETTLE_MS);
}

function applyMarquee() {
  marqueeTimer = 0;
  if (document.hidden) return;
  if (listView && listView.ul.isConnected) {
    const row = listView.rows[listView.sel];
    const title = row?.firstElementChild;
    if (!title || title.firstElementChild) return;
    const text = title.textContent;
    const copy = title.scrollWidth;
    if (shouldScroll(copy, title.clientWidth)) {
      title.innerHTML = marqueeMarkup(text, { scrolling: true, copyWidth: copy });
    }
  } else if (npView && npView.root.isConnected) {
    const el = npView.title;
    const box = el.firstElementChild;
    const copyEl = box?.querySelector(".marquee-copy");
    if (!box || !copyEl || box.classList.contains("scrolling")) return;
    const copy = copyEl.offsetWidth;
    if (shouldScroll(copy, box.clientWidth)) {
      el.innerHTML = marqueeMarkup(npView.titleText, { scrolling: true, copyWidth: copy });
    }
  }
}

function nowPlayingInfo(music) {
  const item = music?.nowPlayingItem;
  const q = music?.queue?.items || music?.queue || [];
  const dur = item?.playbackDuration || item?.attributes?.durationInMillis / 1000 || 0;
  return {
    item,
    key: item?.id || item?.attributes?.playParams?.id || "",
    len: q.length || 1,
    pos: (music?.queue?.position ?? music?.nowPlayingItemIndex ?? 0) + 1,
    title: item?.title || item?.attributes?.name || "—",
    artist: item?.artistName || item?.attributes?.artistName || "",
    album: item?.albumName || item?.attributes?.albumName || "",
    dur,
    elapsed: music?.currentPlaybackTime || 0,
  };
}

const VOLUME_LOW_SVG = `<svg class="np-vol-icon" viewBox="0 0 10 16" width="10" height="16" aria-hidden="true"><path d="M9.476 16V0L4.307 4.495a.25.25 0 0 1-.168.073L0 4.555v6.924l4.138-.014a.24.24 0 0 1 .168.063z"/></svg>`;
const VOLUME_HIGH_SVG = `<svg class="np-vol-icon" viewBox="0 0 18 16" width="18" height="16" aria-hidden="true"><path d="M11.526 15.763c.569.239 1.022.245 1.462-.13 2.568-2.046 4.353-4.826 4.353-7.632S15.55 2.482 13.038.425c-.44-.384-.943-.424-1.512-.185-.455.443-.257 1.07.202 1.454 2.518 1.79 3.852 3.795 3.852 6.3 0 2.493-1.597 4.509-3.816 6.317-.458.384-.7.934-.238 1.452"/><path d="M10.628 11.546c.426.211 1.023.148 1.365-.22.852-.843 1.45-2.069 1.45-3.311 0-1.243-.598-2.491-1.45-3.344-.342-.369-.939-.432-1.365-.21-.434.428-.343.91.055 1.299.597.6 1.14 1.385 1.14 2.29s-.457 1.746-1.177 2.293c-.384.4-.412.806-.018 1.203M9.476 16V0L4.307 4.495a.25.25 0 0 1-.168.073L0 4.555v6.924l4.138-.014a.24.24 0 0 1 .168.063z"/></svg>`;

/** Apple's Now Playing progress modes: "progress", "scrubbing" (seek) or "volume". */
function npMode() {
  if (volumeCtl.open) return "volume";
  if (seekCtl.active) return "scrubbing";
  return "progress";
}

/**
 * Build the now-playing screen once per track; time updates only touch the
 * labels and the bars' transforms. Like Apple, the progress row is a
 * two-pane strip that slides left to show the scrubber or the volume bar.
 */
function renderNow() {
  const music = state.music;
  const np = nowPlayingInfo(music);
  setTitle("Now Playing");
  npIcon?.toggleAttribute("hidden", false);
  syncAvatar(music, np.item);
  seekCtl.trackChanged(np.key);
  const shown = seekCtl.active && seekCtl.preview !== undefined ? seekCtl.preview : np.elapsed;
  const pct = np.dur ? Math.min(1, Math.max(0, shown / np.dur)) : 0;
  const index = `${np.pos} of ${np.len}`;
  const left = fmt(shown);
  const right = `-${fmt(Math.max(0, np.dur - shown))}`;
  const mode = npMode();
  const vol = volumePercent();
  const ident = `${np.key}\0${np.title}\0${np.artist}\0${np.album}`;
  if (!npView || npView.ident !== ident || !npView.root.isConnected) {
    setLcd(`<div class="now-playing">
    <div class="now-playing-index">${escapeHtml(index)}</div>
    <div class="song-title">${marqueeMarkup(np.title)}</div>
    <div class="artist" dir="auto">${escapeHtml(np.artist)}</div>
    <div class="album" dir="auto">${escapeHtml(np.album)}</div>
    <div class="np-progress" data-mode="${mode}">
      <div class="np-pane">
        <div class="np-bar"><span style="transform:scaleX(${pct})"></span></div>
        <div class="times"><span>${left}</span><span>${right}</span></div>
      </div>
      <div class="np-pane np-alt">
        <div class="np-scrub${mode === "scrubbing" ? "" : " inactive"}">
          <div class="np-bar np-scrub-bar"><i class="np-marker" style="left:${pct * 100}%"></i></div>
          <div class="times"><span>${left}</span><span>${right}</span></div>
        </div>
        <div class="np-volume${mode === "volume" ? "" : " inactive"}" role="meter" aria-label="Volume" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${vol}">${VOLUME_LOW_SVG}<div class="np-bar"><span style="transform:scaleX(${vol / 100})"></span></div>${VOLUME_HIGH_SVG}</div>
      </div>
    </div>
  </div>`);
    const root = lcd.firstElementChild;
    const [l, r] = root.querySelector(".np-pane .times").children;
    const [sl, sr] = root.querySelector(".np-scrub .times").children;
    npView = {
      ident, root, titleText: np.title, title: root.querySelector(".song-title"), index: root.querySelector(".now-playing-index"),
      bar: root.querySelector(".np-pane .np-bar span"), left: l, right: r, sl, sr,
      progress: root.querySelector(".np-progress"), scrub: root.querySelector(".np-scrub"), marker: root.querySelector(".np-marker"),
      volume: root.querySelector(".np-volume"), volBar: root.querySelector(".np-volume .np-bar span"),
      pct, idx: index, l: left, r: right, mode, vol,
    };
    scheduleMarquee();
    return;
  }
  const v = npView;
  if (v.idx !== index) { v.index.textContent = index; v.idx = index; }
  if (v.l !== left) { v.left.textContent = left; v.sl.textContent = left; v.l = left; }
  if (v.r !== right) { v.right.textContent = right; v.sr.textContent = right; v.r = right; }
  if (Math.abs(v.pct - pct) > 0.001) { v.bar.style.transform = `scaleX(${pct})`; v.marker.style.left = `${pct * 100}%`; v.pct = pct; }
  if (v.mode !== mode) {
    v.progress.dataset.mode = mode;
    // Apple keeps the last overlay visible while it slides back out.
    if (mode !== "progress") {
      v.scrub.classList.toggle("inactive", mode !== "scrubbing");
      v.volume.classList.toggle("inactive", mode !== "volume");
    }
    v.mode = mode;
  }
  if (v.vol !== vol) { v.volBar.style.transform = `scaleX(${vol / 100})`; v.volume.setAttribute("aria-valuenow", String(vol)); v.vol = vol; }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function signedOut() {
  state.stack = [{
    title: "iBot",
    items: [{ label: "Sign In", id: "signin" }],
    note: "Sign in with your Apple Music account.",
    index: 0,
  }];
  state.nowPlaying = false;
  render();
}

/**
 * Center button (Apple's `B`). On Now Playing it closes the volume overlay,
 * else toggles seek mode. In lists it opens or runs the selected row. No
 * click sound: Apple only clicks when the wheel moves something.
 */
async function select() {
  if (state.nowPlaying) {
    if (volumeCtl.open) { volumeCtl.exit(); return; }
    if (!hasLoadedItem()) return;
    seekCtl.toggle();
    return;
  }
  const screen = current();
  const item = screen?.items[screen.index];
  if (!item) return;
  if (item.id === "signin") return signIn();
  if (item.action) return item.action();
  if (item.loader) {
    const next = await item.loader();
    if (next) push(next);
  }
}

function showSignError(message) {
  state.error = message;
  signedOut();
  setTitle("iBot");
  setLcd(`<div class="note">${escapeHtml(state.error)}</div><ul class="menu-items" role="listbox"><div class="menu-item selected" role="option" data-i="0"><span class="item-title">Sign In</span></div></ul>`);
}

/** authorize() runs in this turn. Nothing is awaited before it. */
function signIn() {
  setTitle("Signing in…");
  setLcd(`<div class="note">Signing in…</div>`);
  const kit = window.MusicKit;
  if (!kit || typeof kit.configure !== "function" || !state.developerToken) {
    showSignError("MusicKit is not configured");
    return;
  }
  if (!state.music) {
    showSignError("Still loading. Try again.");
    configureKit();
    return;
  }
  try {
    const pending = state.music.authorize();
    Promise.resolve(pending).then(() => {
      bindPlayer();
      openRoot();
    }).catch((err) => {
      const msg = String(err?.message || err || "");
      showSignError(/subscri/i.test(msg) ? "Needs Apple Music subscription" : "Sign in did not finish. Try again.");
    });
  } catch (err) {
    const msg = String(err?.message || err || "");
    showSignError(msg ? "Sign in did not finish. Try again." : "MusicKit is not configured");
  }
}

/** Listeners currently attached to a MusicKit instance, so sign-in never stacks a second set. */
let boundPlayer = null;
function refreshNow() {
  if (state.nowPlaying && !document.hidden) renderNow();
  else syncAvatar(state.music, state.music?.nowPlayingItem);
}
/** The root menu gains or loses its Now Playing row with playback, like Apple's. */
function refreshRoot() {
  const screen = current();
  if (!state.nowPlaying && screen?.root) render();
}
function onPlaybackError(e) {
  const msg = String(e?.message || e || "");
  state.error = /subscri|403|401/i.test(msg) ? "Needs Apple Music subscription" : "Playback stopped.";
  state.nowPlaying = true;
  setLcd(`<div class="note">${escapeHtml(state.error)}</div>`);
}
const PLAYER_EVENTS = [
  ["playbackStateDidChange", refreshNow],
  ["nowPlayingItemDidChange", refreshNow],
  ["nowPlayingItemDidChange", refreshRoot],
  ["playbackTimeDidChange", refreshNow],
  ["playbackError", onPlaybackError],
];
function unbindPlayer() {
  if (!boundPlayer) return;
  for (const [name, fn] of PLAYER_EVENTS) boundPlayer.removeEventListener?.(name, fn);
  boundPlayer = null;
}
function bindPlayer() {
  const music = state.music;
  if (!music || boundPlayer === music) return;
  unbindPlayer();
  for (const [name, fn] of PLAYER_EVENTS) music.addEventListener(name, fn);
  boundPlayer = music;
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearTimeout(marqueeTimer);
    return;
  }
  refreshNow();
  if (!state.nowPlaying) scheduleMarquee();
});

function rootItems() {
  return [
    { label: "Playlists", chev: true, loader: loadPlaylists },
    { label: "Artists", chev: true, loader: loadArtists },
    { label: "Songs", chev: true, loader: () => loadSongs(), playable: true },
    { label: "Settings", chev: true, loader: loadSettings },
    { label: "Shuffle Songs", action: shuffleSongs },
    // Apple's root lists Now Playing only while something is loaded.
    ...(hasLoadedItem() ? [{ label: "Now Playing", chev: true, action: showNowPlaying }] : []),
  ];
}

/** Rebuild the root rows when Now Playing appears or goes, keeping the selected row. */
function syncRootItems(screen) {
  const want = hasLoadedItem();
  const has = screen.items.some((it) => it.label === "Now Playing");
  if (want === has) return;
  const label = screen.items[screen.index]?.label;
  screen.items = rootItems();
  const i = screen.items.findIndex((it) => it.label === label);
  screen.index = i >= 0 ? i : Math.min(screen.index, screen.items.length - 1);
}

function openRoot() {
  state.error = "";
  state.stack = [{ title: "iBot", index: 0, root: true, items: rootItems() }];
  render();
}

async function api(path) {
  const music = state.music;
  const res = await music.api.music(path);
  return res?.data ?? res;
}

function rowsFrom(data, map) {
  const list = data?.data || data || [];
  return list.map(map);
}

async function loadPlaylists() {
  const data = await api("/v1/me/library/playlists?limit=100");
  const items = rowsFrom(data, (p) => ({
    label: p.attributes?.name || "Playlist",
    chev: true,
    playable: true,
    loader: () => loadPlaylistSongs(p.id, p.attributes?.name),
  }));
  return { title: "Playlists", items, note: items.length ? "" : "No playlists in this library." };
}

async function loadPlaylistSongs(id, name) {
  const data = await api(`/v1/me/library/playlists/${id}/tracks?limit=100`);
  return songScreen(name || "Playlist", data, { playlist: id });
}

async function loadArtists() {
  const data = await api("/v1/me/library/artists?limit=100");
  const items = rowsFrom(data, (a) => ({
    label: a.attributes?.name || "Artist",
    chev: true,
    loader: () => loadArtistAlbums(a.id, a.attributes?.name),
  }));
  return { title: "Artists", items, note: items.length ? "" : "No artists in this library." };
}

async function loadArtistAlbums(id, name) {
  const data = await api(`/v1/me/library/artists/${id}/albums?limit=100`);
  const items = rowsFrom(data, (al) => ({
    label: al.attributes?.name || "Album",
    chev: true,
    playable: true,
    loader: () => loadAlbumSongs(al.id, al.attributes?.name),
  }));
  return { title: name || "Albums", items, note: items.length ? "" : "No albums." };
}

async function loadAlbumSongs(id, name) {
  const data = await api(`/v1/me/library/albums/${id}/tracks?limit=100`);
  return songScreen(name || "Album", data, { album: id });
}

function songScreen(title, data, queueHint) {
  const raw = data?.data || data || [];
  const items = raw.map((s, i) => ({
    label: s.attributes?.name || "Song",
    song: s,
    action: () => playCollection(raw, i, queueHint),
  }));
  const screen = {
    title,
    items,
    note: items.length ? "" : "No songs in this library.",
    next: data?.next || null,
    queueHint,
    raw,
  };
  return screen;
}

async function loadSongs() {
  const data = await api(`/v1/me/library/songs?limit=${PAGE}`);
  return songScreen("Songs", data, { songs: true });
}

async function maybeLoadMore() {
  const screen = current();
  if (!screen?.next || state.nowPlaying) return;
  if (screen.index < screen.items.length - 8 || screen.loading) return;
  screen.loading = true;
  try {
    const data = await api(screen.next.startsWith("http") ? new URL(screen.next).pathname + new URL(screen.next).search : screen.next);
    const raw = data?.data || [];
    const base = screen.items.length;
    raw.forEach((s, i) => {
      screen.raw.push(s);
      screen.items.push({
        label: s.attributes?.name || "Song",
        song: s,
        action: () => playCollection(screen.raw, base + i, screen.queueHint),
      });
    });
    screen.next = data?.next || null;
    render();
  } finally {
    screen.loading = false;
  }
}

async function playCollection(songs, index) {
  const music = state.music;
  const cat = (s) => s?.attributes?.playParams?.catalogId || (s?.type === "songs" ? s.id : null);
  const lib = (s) => (s?.id && String(s.id).startsWith("i.") ? s.id : s?.attributes?.playParams?.id);
  const picked = songs[index];
  const attempts = [];
  const catIdx = [];
  songs.forEach((s, i) => { if (cat(s)) catIdx.push(i); });
  if (catIdx.includes(index)) attempts.push({ songs: catIdx.map((i) => cat(songs[i])), startWith: catIdx.indexOf(index) });
  const libIdx = [];
  songs.forEach((s, i) => { if (lib(s)) libIdx.push(i); });
  if (libIdx.includes(index)) attempts.push({ songs: libIdx.map((i) => lib(songs[i])), startWith: libIdx.indexOf(index) });
  if (cat(picked)) attempts.push({ song: cat(picked) });
  if (lib(picked)) attempts.push({ song: lib(picked) });
  let lastErr = null;
  for (const opts of attempts) {
    try {
      await music.setQueue({ ...opts, startPlaying: true });
      if (music.playbackState !== 2) await music.play();
      state.error = "";
      showNowPlaying();
      return;
    } catch (err) {
      lastErr = err;
    }
  }
  const msg = String(lastErr?.message || lastErr || "Not available");
  state.error = /subscri|403/i.test(msg) ? "Needs Apple Music subscription" : `Could not play that. ${msg.slice(0, 60)}`;
  state.nowPlaying = true;
  setLcd(`<div class="note">${escapeHtml(state.error)}</div>`);
}

async function shuffleSongs() {
  const data = await api(`/v1/me/library/songs?limit=${PAGE}`);
  const songs = data?.data || [];
  if (!songs.length) {
    push({ title: "Songs", items: [], note: "No songs in this library." });
    return;
  }
  for (let i = songs.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [songs[i], songs[j]] = [songs[j], songs[i]];
  }
  await playCollection(songs, 0);
}

function loadSettings() {
  return {
    title: "Settings",
    items: [
      { label: "Sign Out", action: signOut },
      { label: `Click: ${state.click ? "On" : "Off"}`, action: toggleClick },
      ...(ios ? [] : [{ label: "Full screen", action: toggleFullscreen }]),
      { label: "Share", action: shareNow },
      { label: "About", chev: true, action: showAbout },
    ],
  };
}

function showAbout() {
  push({
    title: "About",
    items: [],
    noteHtml: 'Made by <a href="https://x.com/Phil_Holland">@Phil_Holland</a><br><a href="https://github.com/PhillipHolland/ibot">github.com/PhillipHolland/ibot</a>',
  });
}

async function shareNow() {
  const item = state.music?.nowPlayingItem;
  const title = item?.title || item?.attributes?.name || "a song";
  const artist = item?.artistName || item?.attributes?.artistName || "someone";
  const text = `Now playing ${title} by ${artist} on my iBot`;
  const url = location.origin + location.pathname;
  if (navigator.share) {
    try { await navigator.share({ text, url }); return; } catch { /* cancelled or unsupported */ }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
  } catch { /* ignore */ }
}

async function signOut() {
  try { await state.music?.unauthorize(); } catch { /* already signed out */ }
  unbindPlayer();
  state.music = null;
  signedOut();
}

function toggleClick() {
  state.click = !state.click;
  localStorage.setItem("ipod-click", state.click ? "on" : "off");
  const screen = current();
  if (screen?.title === "Settings") screen.items = loadSettings().items;
  render();
}

function isPlaying() {
  const s = state.music?.playbackState;
  return s === 2 || s === "playing";
}

/** Apple's `hasLoadedItem`: something is queued and loaded. */
function hasLoadedItem() {
  return !!(state.music?.isAuthorized && state.music?.nowPlayingItem);
}

function volumePercent() {
  const v = Number(state.music?.volume);
  return Math.round((Number.isFinite(v) ? v : 1) * 100);
}

/** Center button: sign in when signed out, else Apple's select. */
function centerPress() {
  if (!state.music?.isAuthorized) {
    signIn();
    return;
  }
  select();
}

/**
 * Volume overlay (Apple's `zh`): whole points 0-100, opens on the first
 * wheel step on Now Playing and closes after 5 s idle or a center press.
 */
const volumeCtl = {
  open: false,
  timer: 0,
  touch() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.exit(), VOLUME_IDLE_MS);
    this.open = true;
  },
  by(delta) {
    const music = state.music;
    if (!music) return false;
    const was = this.open;
    this.touch();
    const cur = volumePercent();
    const next = stepVolume(cur, delta);
    if (next !== cur) music.volume = next / 100;
    if (next !== cur || !was) refreshNow();
    return next !== cur;
  },
  exit(rerender = true) {
    clearTimeout(this.timer);
    if (!this.open) return;
    this.open = false;
    if (rerender) refreshNow();
  },
};

/** Seek or skip, with Apple's rule that seeking into the last 2 s skips ahead. */
function seekPlayer(to) {
  const music = state.music;
  if (!music) return undefined;
  const np = nowPlayingInfo(music);
  if (seekAction(to, np.dur, np.pos < np.len) === "next") return music.skipToNextItem?.();
  return music.seekToTime?.(to);
}

/**
 * Seek mode (Apple's `wh`): the center press on Now Playing toggles it. The
 * wheel moves a preview; it commits 1 s after the last change (held while a
 * finger is on the wheel) and the mode closes after 5 s idle.
 */
const seekCtl = {
  active: false,
  preview: undefined,
  pending: undefined,
  dragging: false,
  commitTimer: 0,
  idleTimer: 0,
  track: "",
  gen: 0,
  restartIdle() {
    clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => { if (this.active) { this.exit(); refreshNow(); } }, SEEK_IDLE_MS);
  },
  enter() {
    this.active = true;
    this.preview = undefined;
    this.track = nowPlayingInfo(state.music).key;
    this.restartIdle();
  },
  toggle() {
    if (this.active) this.exit();
    else this.enter();
    refreshNow();
  },
  exit() {
    this.commit();
    clearTimeout(this.idleTimer);
    this.active = false;
    this.dragging = false;
    this.preview = undefined;
  },
  current() {
    return this.preview ?? Math.floor(state.music?.currentPlaybackTime || 0);
  },
  seekTo(t) {
    if (!this.active) return false;
    const to = clampSeek(t, nowPlayingInfo(state.music).dur);
    this.restartIdle();
    if (to === this.current()) return false;
    this.pending = to;
    if (!this.dragging) this.scheduleCommit();
    this.preview = to;
    refreshNow();
    return true;
  },
  by(seconds) {
    return this.seekTo(this.current() + seconds);
  },
  scheduleCommit() {
    clearTimeout(this.commitTimer);
    this.commitTimer = setTimeout(() => this.commit(), SEEK_COMMIT_MS);
  },
  commit() {
    clearTimeout(this.commitTimer);
    if (this.pending === undefined) return;
    const to = this.pending;
    this.pending = undefined;
    const gen = ++this.gen;
    Promise.resolve(seekPlayer(to)).catch(() => {}).finally(() => {
      if (gen === this.gen) { this.preview = undefined; refreshNow(); }
    });
  },
  dragStart() {
    this.dragging = true;
    clearTimeout(this.commitTimer);
  },
  dragEnd() {
    this.dragging = false;
    if (this.pending !== undefined) this.scheduleCommit();
  },
  /** A new track drops the pending preview, like Apple's seek store. */
  trackChanged(key) {
    if (!this.active || key === this.track) return;
    clearTimeout(this.commitTimer);
    this.pending = undefined;
    this.preview = undefined;
    this.track = key;
    this.restartIdle();
  },
};

const holdSeek = createHoldSeek();
/** Back/forward held: seek 5,5,5,10,10,10,20 s per repeat (Apple's `Zr`). */
function onSeekHold(dir, repeat) {
  if (seekCtl.active) return;
  const music = state.music;
  const np = nowPlayingInfo(music);
  const to = holdSeek.step(dir, repeat, {
    isInert: !music?.isAuthorized,
    isSeeking: seekCtl.active,
    hasLoadedItem: hasLoadedItem(),
    currentTrackIndex: np.key,
    currentPlaybackTime: music?.currentPlaybackTime || 0,
    currentPlaybackDuration: np.dur,
  });
  if (to === undefined) return;
  seekPlayer(to);
  refreshNow();
}

/**
 * Play/pause (Apple's `zt`): toggles whatever is loaded and stays on the
 * current screen. With nothing loaded it plays the selected song or
 * playlist/album/Songs list.
 */
async function onPlayPause() {
  const music = state.music;
  if (!music?.isAuthorized) {
    signIn();
    return;
  }
  if (hasLoadedItem()) {
    if (isPlaying()) music.pause();
    else music.play();
    refreshNow();
    return;
  }
  if (state.nowPlaying) return;
  const screen = current();
  const item = screen?.items[screen.index];
  if (item?.playable && item.loader) {
    const next = await item.loader();
    if (next?.raw?.length) await playCollection(next.raw, 0);
    return;
  }
  if (item?.song) select();
}

/** Forward: skip next. Ignored in seek mode (Apple's `disableSkip`). */
function onNext() {
  if (seekCtl.active || !hasLoadedItem()) return;
  state.music.skipToNextItem?.();
}

/** Back: restart past 3 s while playing, else previous, else end the queue (Apple's `skipToPreviousItem`). */
function onPrev() {
  if (seekCtl.active || !hasLoadedItem()) return;
  const music = state.music;
  const np = nowPlayingInfo(music);
  const act = previousAction({
    isPlaying: isPlaying(),
    currentTime: music.currentPlaybackTime || 0,
    position: np.pos - 1,
    repeatOne: music.repeatMode === 1,
  });
  if (act === "restart") music.seekToTime?.(0);
  else if (act === "previous") music.skipToPreviousItem?.();
  else {
    music.stop?.();
    if (state.nowPlaying) goBack();
  }
}

function pressButton(button) {
  if (button === "menu") goBack();
  else if (button === "select") centerPress();
  else if (button === "playpause") onPlayPause();
  else if (button === "back") onPrev();
  else if (button === "forward") onNext();
}

/** What the wheel and arrow keys drive right now (Apple's `currentScrollTarget`). */
function wheelTarget() {
  if (!state.nowPlaying) return "list";
  return seekCtl.active ? "seek" : "volume";
}

/**
 * Apple's long-press action (`Wi`, line 5566): a hold fires after `duration`
 * and repeats every `repeatInterval`; the click that follows a hold is
 * swallowed, so releasing a hold never also taps. Sliding off cancels.
 */
function bindLongPress(btn, { duration, repeatInterval, onHold, onClick }) {
  let pid;
  let swallow = false;
  const rep = createRepeater((repeat) => {
    if (pid !== undefined) swallow = true;
    onHold(repeat);
  });
  const reset = () => { rep.stop(); pid = undefined; };
  btn.addEventListener("pointerdown", (e) => {
    if (!e.isPrimary || e.button !== 0 || pid !== undefined) return;
    pid = e.pointerId;
    try { if (btn.hasPointerCapture?.(pid)) btn.releasePointerCapture(pid); } catch { /* already released */ }
    swallow = false;
    rep.start(duration, repeatInterval);
  });
  btn.addEventListener("pointerup", (e) => { if (e.pointerId === pid) { pid = undefined; rep.stop(); } });
  btn.addEventListener("pointercancel", (e) => { if (e.pointerId === pid) reset(); });
  btn.addEventListener("pointerleave", (e) => { if (e.pointerId === pid) reset(); });
  btn.addEventListener("contextmenu", (e) => { if (pid !== undefined) e.preventDefault(); });
  addEventListener("blur", reset);
  addEventListener("pointerdown", () => { swallow = false; }, true);
  addEventListener("click", (e) => {
    if (!swallow) return;
    const [t] = e.composedPath();
    if (!(t instanceof Node) || !(btn.contains(t) || t.contains(btn))) return;
    swallow = false;
    e.stopImmediatePropagation();
    e.preventDefault();
  }, true);
  btn.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
}

const btnOf = (zone) => wheel.querySelector(`.wheel-button[data-zone="${zone}"]`);
bindLongPress(btnOf("menu"), { duration: HOLD_MS, onHold: toggleBacklight, onClick: goBack });
bindLongPress(btnOf("prev"), { duration: HOLD_MS, repeatInterval: HOLD_REPEAT_MS, onHold: (r) => onSeekHold(-1, r), onClick: onPrev });
bindLongPress(btnOf("next"), { duration: HOLD_MS, repeatInterval: HOLD_REPEAT_MS, onHold: (r) => onSeekHold(1, r), onClick: onNext });
btnOf("play").addEventListener("click", (e) => { e.stopPropagation(); onPlayPause(); });

/** Apple jumps to Now Playing after 10 s without input while music plays. */
let idleJumpTimer = 0;
function notifyActivity() {
  clearTimeout(idleJumpTimer);
  if (!isPlaying() || state.nowPlaying) return;
  idleJumpTimer = setTimeout(() => {
    if (isPlaying() && !state.nowPlaying && state.music?.isAuthorized) showNowPlaying();
  }, IDLE_JUMP_MS);
}
for (const ev of ["pointerdown", "keydown", "click"]) device.addEventListener(ev, notifyActivity, { capture: true, passive: true });
document.addEventListener("keydown", notifyActivity, { capture: true, passive: true });

let drag = null;
/** pointermove only does math; list moves and eye glances land once per frame. */
const wheelFrame = { raf: 0, rows: 0, gx: 0, gy: 0 };
function queueWheel(rows, gx, gy) {
  wheelFrame.rows += rows;
  wheelFrame.gx += gx;
  wheelFrame.gy += gy;
  if (!wheelFrame.raf) wheelFrame.raf = requestAnimationFrame(flushWheel);
}
function flushWheel() {
  wheelFrame.raf = 0;
  const rows = wheelFrame.rows;
  wheelFrame.rows = 0;
  if (wheelFrame.gx || wheelFrame.gy) eyes.glance(wheelFrame.gx, wheelFrame.gy);
  wheelFrame.gx = 0;
  wheelFrame.gy = 0;
  if (rows && move(rows)) tick();
}
/** Volume and seek take wheel degrees through Apple's `Xr` accumulator. */
const scrollAcc = createScrollAccumulator({
  move: (step, count) => (wheelTarget() === "volume" ? volumeCtl.by(step * count) : seekCtl.by(step * count)),
  click: (count) => { for (let i = 0; i < count; i++) tick(); },
});
const dirFilter = createReversalFilter();
const scrollRing = wheel.querySelector(".scroll-wheel") || wheel;
/**
 * Drags start only on the ring (Apple's `Yh`), so the quadrant buttons in
 * the outer band never start a drag and a drag never taps a button.
 */
scrollRing.addEventListener("pointerdown", (e) => {
  if (drag) return;
  const rect = scrollRing.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = Math.min(rect.width, rect.height) / 2;
  const r2 = (e.clientX - cx) ** 2 + (e.clientY - cy) ** 2;
  if (r2 > radius * radius + 1e-6 || r2 < (radius * 100 / 276) ** 2) return;
  drag = { cx, cy, radius, x: e.clientX, y: e.clientY, angle: pointerAngle(cx, cy, e.clientX, e.clientY), carry: { acc: 0, dir: 0, pending: 0 }, id: e.pointerId, accel: createAccelerator() };
  try { scrollRing.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  wheel.classList.add("dragging");
  scrollAcc.reset();
  dirFilter.reset();
  if (state.nowPlaying) seekCtl.dragStart();
});
scrollRing.addEventListener("pointermove", (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const px = e.clientX, py = e.clientY;
  const mx = px - drag.x, my = py - drag.y;
  if (segmentDistToCenter(drag.x - drag.cx, drag.y - drag.cy, px - drag.cx, py - drag.cy) < drag.radius * 0.1) {
    drag.x = px; drag.y = py;
    drag.angle = pointerAngle(drag.cx, drag.cy, px, py);
    return;
  }
  const next = pointerAngle(drag.cx, drag.cy, px, py);
  const delta = angleDelta(drag.angle, next);
  drag.angle = next; drag.x = px; drag.y = py;
  if (!delta) return;
  const deg = delta * 180 / Math.PI;
  const { speed, heldMs } = accelerate(drag.accel, deg, performance.now());
  const target = wheelTarget();
  if (target === "list") {
    const spun = consumeRotation(drag.carry, delta, speed, heldMs);
    drag.carry = spun.carry;
    queueWheel(spun.rows, mx, my);
    return;
  }
  queueWheel(0, mx, my);
  const step = dirFilter.next(deg);
  if (!step) return;
  scrollAcc.scroll({ step, degrees: Math.abs(deg), target, multiplier: target === "seek" ? seekMultiplier(speed, heldMs) : 1, dragStepDegrees: 15 });
});
function endDrag(e) {
  if (!drag || e.pointerId !== drag.id) return;
  drag = null;
  wheel.classList.remove("dragging");
  seekCtl.dragEnd();
}
scrollRing.addEventListener("pointerup", endDrag);
scrollRing.addEventListener("pointercancel", endDrag);
scrollRing.addEventListener("lostpointercapture", endDrag);

const centerBtn = document.getElementById("center");
let avatarPress = null;
let lastTrackKey = "";
const eyes = createEyes({
  getEl: () => centerBtn.querySelector(".eyes"),
  getId: () => centerBtn.dataset.avatar,
  reducedMotion: reducedMotion,
});

/** Swap the character instantly; the eyes snap home and blink. The body never animates. */
function paintAvatar() {
  const id = CHARACTERS[state.avatar % CHARACTERS.length].id;
  centerBtn.dataset.avatar = id;
  centerBtn.innerHTML = characterMarkup(id);
  eyes.reset();
}

function cycleAvatar() {
  state.avatar = nextCharacter(state.avatar);
  localStorage.setItem("ipod-avatar", String(state.avatar));
  paintAvatar();
}

function syncAvatar(music, item) {
  const key = item?.id || item?.attributes?.playParams?.id || "";
  if (key && key !== lastTrackKey) {
    if (lastTrackKey) eyes.surprise();
    lastTrackKey = key;
  }
  const s = music?.playbackState;
  const playing = s === 2 || s === "playing";
  const paused = s === 3 || s === "paused";
  const tempo = item?.attributes?.tempo || music?.currentPlaybackTempo;
  eyes.setMode(playing ? "playing" : paused ? "paused" : "idle", playing ? beatIntervalMs(tempo, key) : 0);
}

paintAvatar();
centerBtn.addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  try { centerBtn.setPointerCapture(e.pointerId); } catch {}
  avatarPress = { x: e.clientX, y: e.clientY, t: Date.now(), id: e.pointerId, fired: false };
});
centerBtn.addEventListener("pointermove", (e) => {
  if (!avatarPress || e.pointerId !== avatarPress.id || avatarPress.fired) return;
  const dx = e.clientX - avatarPress.x;
  const dy = e.clientY - avatarPress.y;
  if (Math.hypot(dx, dy) >= 24) {
    avatarPress.fired = true;
    cycleAvatar();
  }
});
centerBtn.addEventListener("pointerup", (e) => {
  if (!avatarPress || e.pointerId !== avatarPress.id) return;
  const held = Date.now() - avatarPress.t;
  const dx = e.clientX - avatarPress.x;
  const dy = e.clientY - avatarPress.y;
  const dist = Math.hypot(dx, dy);
  const fired = avatarPress.fired;
  avatarPress = null;
  if (fired) return;
  const kind = centerGesture({ dt: held, dist });
  if (kind === "cycle") cycleAvatar();
  else centerPress();
});
centerBtn.addEventListener("pointercancel", () => {
  avatarPress = null;
});
centerBtn.addEventListener("click", (e) => e.stopPropagation());
centerBtn.addEventListener("contextmenu", (e) => e.preventDefault());
lcd.addEventListener("click", (e) => {
  const row = e.target.closest("[data-i]");
  if (!row || state.nowPlaying) return;
  current().index = Number(row.dataset.i);
  select();
});

/**
 * Keyboard, from Apple's click-wheel handler (line 6097): arrows step with
 * a 300 ms / 80 ms repeat that accelerates; in lists Left is Menu and Right
 * is Select; on Now Playing Left/Right are back/forward (hold to seek) and
 * Up raises the volume; Enter selects, Space plays/pauses, Escape is Menu
 * (hold 1 s for the backlight). Presses fire on key release, like Apple's.
 */
const keyState = { key: undefined, action: undefined, start: 0, target: undefined };
const keyRep = createRepeater((repeat) => {
  const a = keyState.action;
  if (!a) return;
  if (wheelTarget() !== keyState.target) { keyFinish(false); return; }
  if (a.kind === "scroll") keyStep(a.step, performance.now() - keyState.start);
  else if (a.button === "menu") toggleBacklight();
  else if (a.button === "back" || a.button === "forward") onSeekHold(a.button === "back" ? -1 : 1, repeat);
});
function keyStep(step, heldMs) {
  const target = wheelTarget();
  const n = keyStepAmount(target, heldMs);
  let changed;
  if (target === "list") changed = move(step * n);
  else if (target === "volume") changed = volumeCtl.by(step * n);
  else changed = seekCtl.by(step * n);
  if (changed && target !== "seek") tick();
}
function keyFinish(commit) {
  const a = keyState.action;
  const fired = keyRep.stop();
  const target = keyState.target;
  keyState.key = undefined;
  keyState.action = undefined;
  if (!a) return;
  if (a.kind === "scroll") { if (target === "seek") seekCtl.dragEnd(); return; }
  if (commit && !fired) pressButton(a.button);
}
document.addEventListener("keydown", (e) => {
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  if (e.ctrlKey || e.metaKey || e.altKey) { keyFinish(false); return; }
  const target = wheelTarget();
  const a = keyAction(e.key, target);
  if (!a) return;
  e.preventDefault();
  e.stopPropagation();
  if (e.repeat || e.key === keyState.key) return;
  keyFinish(false);
  keyState.key = e.key;
  keyState.action = a;
  keyState.start = performance.now();
  keyState.target = target;
  if (a.kind === "scroll") {
    if (target === "seek") seekCtl.dragStart();
    keyStep(a.step, 0);
    keyRep.start(KEY_REPEAT_DELAY_MS, KEY_REPEAT_MS);
  } else if (a.kind === "hold") {
    keyRep.start(HOLD_MS, a.repeatInterval);
  }
});
document.addEventListener("keyup", (e) => {
  if (e.key !== keyState.key) return;
  e.preventDefault();
  keyFinish(true);
});
addEventListener("blur", () => keyFinish(false));

applyTheme();
applyFit();
let fitRaf = 0;
function queueFit() {
  if (!fitRaf) fitRaf = requestAnimationFrame(() => { fitRaf = 0; applyFit(); });
}
addEventListener("resize", queueFit, { passive: true });
addEventListener("orientationchange", queueFit, { passive: true });
document.fonts?.addEventListener?.("loadingdone", () => scheduleMarquee());
document.body.addEventListener("touchmove", (e) => {
  if (!e.target.closest(".wheel")) e.preventDefault();
}, { passive: false });
signedOut();
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

async function boot() {
  if (!window.MusicKit) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://js-cdn.music.apple.com/musickit/v3/musickit.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  if (!window.MusicKit?.configure) {
    await new Promise((r) => document.addEventListener("musickitloaded", r, { once: true }));
  }
  try {
    await ensureToken();
  } catch {
    state.error = "Could not reach the token service.";
    signedOut();
    return;
  }
  await configureKit();
}

/** MusicKit v3 configure is async, so it runs at load, not inside the tap. */
async function configureKit() {
  if (state.music || !window.MusicKit?.configure || !state.developerToken) return;
  try {
    state.music = await window.MusicKit.configure({
      developerToken: state.developerToken,
      app: { name: "iBot", build: "1.0.0" },
    });
    if (state.music?.isAuthorized) { bindPlayer(); openRoot(); }
  } catch (err) {
    state.error = "Apple Music did not load. Reload the page.";
    signedOut();
  }
}
boot();

// Locked page: no double-tap or pinch zoom on iOS Safari.
for (const ev of ["gesturestart", "gesturechange", "gestureend", "dblclick"]) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
