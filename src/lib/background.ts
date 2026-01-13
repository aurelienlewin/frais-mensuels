const SESSION_KEY = 'fm:bg:session:v2';

const LOCAL_FALLBACK_URL = '/bg-snowy.jpg';
const FALLBACK_CSS = `url("${LOCAL_FALLBACK_URL}")`;

const AUTO_ROTATE_MS = 1000 * 60 * 4; // base interval for background refresh
const AUTO_ROTATE_JITTER_MS = 1000 * 60 * 1.5; // jitter to avoid sync spikes
const OVERLAY_FADE_MS = 420;
const OVERLAY_SETTLE_MS = 60;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function hash32(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function computeSize() {
  const dpr = clamp(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1, 1, 1.2);
  const scale = 0.78; // request smaller images and upscale client-side
  const w = clamp(Math.round(window.innerWidth * dpr * scale), 720, 1600);
  const h = clamp(Math.round(window.innerHeight * dpr * scale), 720, 1600);
  return { w, h };
}

function newSeed() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildTarget(w: number, h: number, seed: string) {
  const apiUrl = `/api/background?w=${w}&h=${h}&seed=${encodeURIComponent(seed)}`;
  const picsumSeed = hash32(seed).toString(16);
  const directUrl = `https://picsum.photos/seed/${picsumSeed}/${w}/${h}`;
  return { url: apiUrl, directUrl, css: `url("${apiUrl}")` };
}

type SessionBgV1 = { v: 1; css: string; savedAt: number };
type SessionBgV2 = { v: 2; url: string; savedAt: number };

let currentCss: string | null = null;
let currentObjectUrl: string | null = null;
let activeLoadId = 0;
let pendingLoadId: number | null = null;
let autoRotateTimer: number | null = null;
let activeAbort: AbortController | null = null;

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return false;
  }
}

function extractUrlFromCss(css: string) {
  const m = css.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
  const raw = m?.[2]?.trim() ?? '';
  return raw ? raw : null;
}

function readSessionSaved(): { url: string; savedAt: number } | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionBgV1 | SessionBgV2>;
    if (!parsed) return null;
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    if (parsed.v === 2 && typeof parsed.url === 'string' && parsed.url) return { url: parsed.url, savedAt };
    if (parsed.v === 1 && typeof parsed.css === 'string' && parsed.css) {
      const url = extractUrlFromCss(parsed.css);
      if (!url) return null;
      return { url, savedAt };
    }
    return null;
  } catch {
    return null;
  }
}

function saveSession(url: string) {
  try {
    const now = Date.now();
    const next: SessionBgV2 = { v: 2, url, savedAt: now };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore (private mode / quota)
  }
}

function setBaseBackground(css: string) {
  const root = document.documentElement;
  if (!root) return;

  const next = css.trim() || FALLBACK_CSS;
  const nextUrl = extractUrlFromCss(next);
  if (currentObjectUrl && nextUrl !== currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
  currentCss = next;
  root.style.setProperty('--bg-image', next);
  root.style.setProperty('--bg-overlay-opacity', '0');
}

async function preloadImage(url: string) {
  return new Promise<boolean>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';

    const done = (ok: boolean) => {
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };

    img.onload = () => {
      const finalize = () => done(true);
      if (typeof img.decode === 'function') {
        img
          .decode()
          .then(finalize)
          .catch(finalize);
      } else {
        finalize();
      }
    };

    img.onerror = () => done(false);
    img.src = url;
  });
}

async function fetchAsObjectUrl(url: string, signal: AbortSignal) {
  try {
    const res = await fetch(url, { method: 'GET', signal, cache: 'no-store' });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob || blob.size <= 0) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

function parseApiParams(url: string) {
  try {
    if (!url.startsWith('/api/background')) return null;
    const u = new URL(url, window.location.origin);
    const w = Number.parseInt(u.searchParams.get('w') || '', 10);
    const h = Number.parseInt(u.searchParams.get('h') || '', 10);
    const seed = u.searchParams.get('seed') || u.searchParams.get('sig') || '';
    if (!Number.isFinite(w) || !Number.isFinite(h) || !seed.trim()) return null;
    return { w, h, seed: seed.trim() };
  } catch {
    return null;
  }
}

function buildCandidateUrls(primaryUrl: string) {
  const out: string[] = [];
  if (primaryUrl) out.push(primaryUrl);

  const api = parseApiParams(primaryUrl);
  if (api) {
    const picsumSeed = hash32(api.seed).toString(16);
    const directUrl = `https://picsum.photos/seed/${picsumSeed}/${api.w}/${api.h}`;
    if (!out.includes(directUrl)) out.push(directUrl);
  }

  if (!out.includes(LOCAL_FALLBACK_URL)) out.push(LOCAL_FALLBACK_URL);
  return out;
}

async function loadAndSwap(sourceUrl: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;

  const reduced = prefersReducedMotion();
  const loadId = ++activeLoadId;
  pendingLoadId = loadId;

  if (activeAbort) activeAbort.abort();
  const controller = new AbortController();
  activeAbort = controller;

  if (!reduced) {
    root.style.setProperty('--bg-overlay-opacity', '1');
    await waitMs(OVERLAY_FADE_MS + OVERLAY_SETTLE_MS);
    if (loadId !== activeLoadId) {
      if (pendingLoadId === loadId) pendingLoadId = null;
      if (activeAbort === controller) activeAbort = null;
      return;
    }
  }

  const candidates = buildCandidateUrls(sourceUrl);

  let chosenDisplayCss: string | null = null;
  let chosenObjectUrl: string | null = null;
  let chosenSaveUrl: string | null = null;

  for (const candidate of candidates) {
    if (!candidate) continue;

    const objectUrl = await fetchAsObjectUrl(candidate, controller.signal);
    if (loadId !== activeLoadId) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      if (pendingLoadId === loadId) pendingLoadId = null;
      if (activeAbort === controller) activeAbort = null;
      return;
    }

    if (objectUrl) {
      const ok = await preloadImage(objectUrl);
      if (loadId !== activeLoadId) {
        URL.revokeObjectURL(objectUrl);
        if (pendingLoadId === loadId) pendingLoadId = null;
        if (activeAbort === controller) activeAbort = null;
        return;
      }

      if (ok) {
        chosenDisplayCss = `url("${objectUrl}")`;
        chosenObjectUrl = objectUrl;
        chosenSaveUrl = candidate;
        break;
      }

      URL.revokeObjectURL(objectUrl);
    }

    const okDirect = await preloadImage(candidate);
    if (loadId !== activeLoadId) {
      if (pendingLoadId === loadId) pendingLoadId = null;
      if (activeAbort === controller) activeAbort = null;
      return;
    }

    if (okDirect) {
      chosenDisplayCss = `url("${candidate}")`;
      chosenObjectUrl = null;
      chosenSaveUrl = candidate;
      break;
    }
  }

  if (!chosenDisplayCss || !chosenSaveUrl) {
    if (!currentCss) setBaseBackground(FALLBACK_CSS);
    if (!reduced) root.style.setProperty('--bg-overlay-opacity', '0');
    if (pendingLoadId === loadId) pendingLoadId = null;
    if (activeAbort === controller) activeAbort = null;
    return;
  }

  if (reduced) {
    setBaseBackground(chosenDisplayCss);
    currentObjectUrl = chosenObjectUrl;
    currentCss = chosenDisplayCss;
    saveSession(chosenSaveUrl);
    if (pendingLoadId === loadId) pendingLoadId = null;
    if (activeAbort === controller) activeAbort = null;
    return;
  }

  root.style.setProperty('--bg-image', chosenDisplayCss);
  window.requestAnimationFrame(() => {
    if (loadId !== activeLoadId) return;
    root.style.setProperty('--bg-overlay-opacity', '0');
  });

  await waitMs(OVERLAY_FADE_MS + OVERLAY_SETTLE_MS);
  if (loadId !== activeLoadId) {
    if (chosenObjectUrl) URL.revokeObjectURL(chosenObjectUrl);
    if (pendingLoadId === loadId) pendingLoadId = null;
    if (activeAbort === controller) activeAbort = null;
    return;
  }

  const prevObjectUrl = currentObjectUrl;
  currentObjectUrl = chosenObjectUrl;
  currentCss = chosenDisplayCss;
  saveSession(chosenSaveUrl);
  if (prevObjectUrl && prevObjectUrl !== chosenObjectUrl) URL.revokeObjectURL(prevObjectUrl);
  if (pendingLoadId === loadId) pendingLoadId = null;
  if (activeAbort === controller) activeAbort = null;
}

export function initDynamicBackground(options?: { force?: boolean }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (pendingLoadId) return;

  const session = readSessionSaved();
  if (!options?.force && session?.url) {
    loadAndSwap(session.url).catch(() => {
      if (currentCss) {
        setBaseBackground(currentCss);
      } else {
        setBaseBackground(FALLBACK_CSS);
        saveSession(LOCAL_FALLBACK_URL);
      }
    });
    return;
  }

  const { w, h } = computeSize();
  const { url } = buildTarget(w, h, newSeed());
  loadAndSwap(url).catch(() => {
    if (currentCss) {
      setBaseBackground(currentCss);
    } else {
      setBaseBackground(FALLBACK_CSS);
      saveSession(LOCAL_FALLBACK_URL);
    }
  });
}

function scheduleAutoRotate() {
  if (typeof window === 'undefined') return;
  if (autoRotateTimer) window.clearTimeout(autoRotateTimer);
  const jitter = Math.random() * AUTO_ROTATE_JITTER_MS;
  const delay = AUTO_ROTATE_MS + jitter;
  autoRotateTimer = window.setTimeout(() => {
    autoRotateTimer = null;
    if (document.visibilityState === 'hidden') {
      scheduleAutoRotate();
      return;
    }
    initDynamicBackground({ force: true });
    scheduleAutoRotate();
  }, delay);
}

export function startBackgroundRotation() {
  scheduleAutoRotate();
}

export function stopBackgroundRotation() {
  if (autoRotateTimer) {
    window.clearTimeout(autoRotateTimer);
    autoRotateTimer = null;
  }
}
