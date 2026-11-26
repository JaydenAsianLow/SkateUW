// The guide's side of the demo scene. One hidden iframe (/?demo, DemoStage.jsx) runs the real game for the demos;
// this module steps it:
//  - recording: each demo once, as fast as the laptop allows (a few ms per screen frame so the menu stays smooth),
//    kept as a small sprite sheet (REC.fps) plus the phone record of every frame. The cards' previews and the pinned
//    demo play these clips: no extra 3D scene while you browse or play.
//  - live: one demo at a time over the demo window's game pane, in real time or slow motion, looping.
import { DEMOS, demoById } from './demos.js';

export const REC = { w: 288, h: 180, fps: 12, cols: 8 };
const STEP = 1 / 60;
const BUDGET_MS = 7; // recording work per screen frame

let iframe = null;
let api = null;
let readyP = null;
let mode = 'idle'; // 'idle' | 'rec' | 'live'
let live = null; // { demo, el, speed, onFrame, raf, acc, last, loading }
const queue = [];
const clips = new Map(); // id -> { url, cols, rows, n, w, h, fps, recs, length }
const listeners = new Set();
let recording = null; // id being recorded
let paused = false; // the guide is closed: no recording
const stopRec = () => paused || live != null;

export const onClips = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const getClip = (id) => clips.get(id);
const notify = () => listeners.forEach((fn) => fn());
const frame = () => new Promise((r) => requestAnimationFrame(r));

function ensure() {
  if (readyP) return readyP;
  iframe = document.createElement('iframe');
  iframe.src = '/?demo';
  iframe.title = 'Controls demo';
  iframe.setAttribute('aria-hidden', 'true');
  iframe.tabIndex = -1;
  Object.assign(iframe.style, { position: 'fixed', left: '0px', top: '0px', width: `${REC.w}px`, height: `${REC.h}px`, border: '0', opacity: '0', pointerEvents: 'none', zIndex: '-1', borderRadius: '12px' });
  document.body.appendChild(iframe);
  readyP = new Promise((resolve) => {
    const poll = () => {
      const a = iframe.contentWindow?.__demo;
      if (a?.ready) (api = a), resolve(a);
      else setTimeout(poll, 120);
    };
    poll();
  });
  return readyP;
}

// Resize the scene's canvas and wait for it to take the new size.
async function setSize(w, h) {
  w = Math.max(2, Math.round(w));
  h = Math.max(2, Math.round(h));
  if (iframe.style.width === `${w}px` && iframe.style.height === `${h}px`) return;
  iframe.style.width = `${w}px`;
  iframe.style.height = `${h}px`;
  for (let i = 0; i < 30; i++) {
    await frame();
    const c = api.canvas;
    if (c && Math.abs(c.width - w * (api.dpr ?? 1)) <= 1) break;
  }
}

// --- Recording -------------------------------------------------------------------------------------------------

// Ask for these demos' clips (in this order; already queued ones move to the front).
export function prepare(ids) {
  paused = false;
  for (const id of [...ids].reverse()) {
    if (clips.has(id) || id === recording) continue;
    const i = queue.indexOf(id);
    if (i >= 0) queue.splice(i, 1);
    queue.unshift(id);
  }
  pump();
}
export const prepareAll = () => prepare(DEMOS.map((d) => d.id));

async function pump() {
  if (mode !== 'idle' || !queue.length || stopRec()) return;
  mode = 'rec';
  await ensure();
  while (queue.length && !stopRec()) {
    const id = queue.shift();
    if (clips.has(id)) continue;
    recording = id;
    try {
      const clip = await record(demoById[id]);
      if (clip) clips.set(id, clip), notify();
      else queue.unshift(id); // interrupted by a live demo: try again later
    } catch (e) {
      console.warn('[guide] could not record', id, e);
    }
    recording = null;
  }
  mode = 'idle';
  if (!live) pump();
}

async function record(d) {
  api.setDpr?.(1);
  iframe.style.opacity = '0';
  iframe.style.zIndex = '-1';
  iframe.style.left = iframe.style.top = '0px';
  await setSize(REC.w, REC.h);
  await api.load(d);
  const n = Math.round(d.length / STEP);
  const every = Math.round(1 / STEP / REC.fps);
  const frames = Math.ceil(n / every);
  const rows = Math.ceil(frames / REC.cols);
  const sheet = document.createElement('canvas');
  sheet.width = REC.cols * REC.w;
  sheet.height = rows * REC.h;
  const ctx = sheet.getContext('2d');
  const recs = [];
  let i = 0;
  while (i < n) {
    await frame();
    if (stopRec()) return null;
    const t0 = performance.now();
    while (i < n && performance.now() - t0 < BUDGET_MS) {
      const draw = i % every === 0;
      recs.push(api.step(draw));
      if (draw) {
        const k = i / every;
        ctx.drawImage(api.canvas, (k % REC.cols) * REC.w, Math.floor(k / REC.cols) * REC.h, REC.w, REC.h);
      }
      i++;
    }
  }
  const blob = await new Promise((r) => sheet.toBlob(r, 'image/jpeg', 0.82));
  return { url: URL.createObjectURL(blob), cols: REC.cols, rows, n: frames, w: REC.w, h: REC.h, fps: REC.fps, recs, length: d.length };
}

// --- Live --------------------------------------------------------------------------------------------------------

// Play a demo live over `el` (the demo window's game pane). onFrame(record) gets the phone record every screen
// frame. Returns { stop, setSpeed, replay }.
export function playLive(demo, el, { speed = 1, onFrame } = {}) {
  stopLive();
  const L = (live = { demo, el, speed, onFrame, acc: 0, last: 0, loading: true, stopped: false });
  (async () => {
    await ensure();
    while (mode === 'rec') await frame(); // let the recording stop at its next frame
    if (L.stopped) return;
    mode = 'live';
    place(L);
    const r = el.getBoundingClientRect();
    api.setDpr?.(Math.min(1.5, window.devicePixelRatio || 1));
    await setSize(r.width, r.height);
    await start(L);
    const tick = (now) => {
      if (L.stopped) return;
      L.raf = requestAnimationFrame(tick);
      place(L);
      if (L.loading) return;
      const dt = Math.min(0.1, (now - (L.last || now)) / 1000);
      L.last = now;
      L.acc += dt * L.speed;
      let rec = null;
      const n = Math.min(6, Math.floor(L.acc / STEP));
      for (let k = 0; k < n; k++) {
        rec = api.step(k === n - 1);
        L.acc -= STEP;
      }
      if (rec) L.onFrame?.(rec);
      if (api.t >= L.demo.length) start(L); // loop
    };
    L.raf = requestAnimationFrame(tick);
  })();
  return {
    stop: () => stopLive(L),
    setSpeed: (s) => (L.speed = s),
    replay: () => start(L),
  };
}

async function start(L) {
  L.loading = true;
  const rec = await api.load(L.demo);
  if (L.stopped) return;
  L.acc = 0;
  L.last = 0;
  L.loading = false;
  rec && L.onFrame?.(api.step(true));
}

// Keep the iframe exactly over the pane (it may move: resizing, scrolling, the window opening).
function place(L) {
  const r = L.el.getBoundingClientRect();
  Object.assign(iframe.style, { left: `${r.left}px`, top: `${r.top}px`, opacity: '1', zIndex: '1001' });
  if (Math.abs(parseFloat(iframe.style.width) - r.width) > 1 || Math.abs(parseFloat(iframe.style.height) - r.height) > 1) {
    iframe.style.width = `${Math.round(r.width)}px`;
    iframe.style.height = `${Math.round(r.height)}px`;
  }
}

export function stopLive(L = live) {
  if (!L || L !== live) return;
  L.stopped = true;
  cancelAnimationFrame(L.raf);
  live = null;
  if (iframe) Object.assign(iframe.style, { opacity: '0', zIndex: '-1' });
  if (mode === 'live') mode = 'idle';
  if (!paused) pump();
}

// The guide closed: stop the live demo and pause recording (it carries on next time the guide opens).
export function pauseAll() {
  paused = true;
  stopLive();
}

// --- The pinned demo's clip, kept in the browser (IndexedDB) so it plays after a reload without recording again
// while you play. Only the one pinned clip is kept.
const DB = 'skate-guide';
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('pinned');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
const sameDemo = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export async function savePinnedClip(id) {
  const clip = clips.get(id);
  if (!clip) return;
  try {
    const blob = await (await fetch(clip.url)).blob();
    const d = await db();
    const { url, ...meta } = clip;
    d.transaction('pinned', 'readwrite').objectStore('pinned').put({ id, demo: demoById[id], blob, meta }, 'clip');
  } catch {
    /* no storage: it records again after a reload */
  }
}

// The pinned demo's clip: from this session, or saved from an earlier one (if the demo hasn't changed since),
// or recorded now (once).
export async function loadPinnedClip(id) {
  if (clips.has(id)) return clips.get(id);
  try {
    const d = await db();
    const v = await new Promise((resolve) => {
      const req = d.transaction('pinned').objectStore('pinned').get('clip');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
    if (v && v.id === id && sameDemo(v.demo, demoById[id])) {
      clips.set(id, { ...v.meta, url: URL.createObjectURL(v.blob) });
      notify();
      return clips.get(id);
    }
  } catch {
    /* no storage */
  }
  queue.length = 0; // only this one while you play (the guide records the rest when it opens)
  prepare([id]);
  return null;
}
