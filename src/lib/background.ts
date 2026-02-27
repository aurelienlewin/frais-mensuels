const SESSION_KEY = 'fm:bg:session:v2';

const LOCAL_FALLBACK_URL = '/bg-snowy.jpg';
const LOCAL_FALLBACK_CSS_VARIANTS = [
  `linear-gradient(140deg, rgba(15,23,42,0.42), rgba(2,6,23,0.55)), url("${LOCAL_FALLBACK_URL}")`,
  `linear-gradient(160deg, rgba(22,78,99,0.36), rgba(15,23,42,0.54)), url("${LOCAL_FALLBACK_URL}")`,
  `linear-gradient(125deg, rgba(67,56,202,0.24), rgba(12,74,110,0.44)), url("${LOCAL_FALLBACK_URL}")`,
  `linear-gradient(150deg, rgba(6,95,70,0.28), rgba(15,23,42,0.5)), url("${LOCAL_FALLBACK_URL}")`,
] as const;
const FALLBACK_CSS = LOCAL_FALLBACK_CSS_VARIANTS[0];

const SAVED_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 3; // keep last good remote for 3 days
const AUTO_ROTATE_MS = 1000 * 60 * 3;
const AUTO_ROTATE_JITTER_MS = 1000 * 45;
const CROSSFADE_MS = 520;
const CROSSFADE_SETTLE_MS = 70;
const BLACKOUT_FADE_TO_MS = 230;
const BLACKOUT_FADE_FROM_MS = 280;
const BLACKOUT_SETTLE_MS = 40;
const PRELOAD_TIMEOUT_MS = 1000 * 12;
const RETRY_BASE_MS = 1000 * 8;
const RETRY_MAX_MS = 1000 * 75;

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

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return false;
  }
}

function isLowMemoryDevice() {
  try {
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
    return typeof mem === 'number' && mem > 0 && mem <= 2;
  } catch {
    return false;
  }
}

function computeSize() {
  const lowMem = isLowMemoryDevice();
  const dpr = clamp(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1, 1, lowMem ? 1 : 1.5);
  const scale = lowMem ? 0.62 : 0.84;
  const minEdge = lowMem ? 640 : 720;
  const maxEdge = lowMem ? 1280 : 1920;
  const w = clamp(Math.round(window.innerWidth * dpr * scale), minEdge, maxEdge);
  const h = clamp(Math.round(window.innerHeight * dpr * scale), minEdge, maxEdge);
  return { w, h };
}

function newSeed() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildApiUrl(w: number, h: number, seed: string) {
  return `/api/background?w=${w}&h=${h}&seed=${encodeURIComponent(seed)}`;
}

function shouldSkipDynamicBackground() {
  try {
    if (typeof navigator.onLine === 'boolean' && !navigator.onLine) return true;
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
    if (connection?.saveData) return true;
    return false;
  } catch {
    return false;
  }
}

function extractUrlFromCss(css: string) {
  const m = css.match(/url\(\s*(['"]?)(.*?)\1\s*\)/i);
  const raw = m?.[2]?.trim() ?? '';
  return raw ? raw : null;
}

function isLocalFallbackUrl(url: string) {
  try {
    const u = new URL(url, window.location.origin);
    return u.pathname === LOCAL_FALLBACK_URL;
  } catch {
    return url === LOCAL_FALLBACK_URL || url.endsWith(LOCAL_FALLBACK_URL);
  }
}

function isLocalCss(css: string) {
  const url = extractUrlFromCss(css);
  return url ? isLocalFallbackUrl(url) : false;
}

function fallbackCssForKey(key: string) {
  const idx = LOCAL_FALLBACK_CSS_VARIANTS.length
    ? hash32(key || String(Date.now())) % LOCAL_FALLBACK_CSS_VARIANTS.length
    : 0;
  return LOCAL_FALLBACK_CSS_VARIANTS[idx] ?? FALLBACK_CSS;
}

type SessionBgV1 = { v: 1; css: string; savedAt: number };
type SessionBgV2 = { v: 2; url: string; savedAt: number };
type SessionBgV3 = { v: 3; url: string; savedAt: number };

let currentCss: string | null = null;
let currentObjectUrl: string | null = null;
let activeLoadId = 0;
let pendingLoadId: number | null = null;
let autoRotateTimer: number | null = null;
let retryTimer: number | null = null;
let activeAbort: AbortController | null = null;
let consecutiveFailures = 0;

function waitMs(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function parseStored(raw: string | null) {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SessionBgV1 | SessionBgV2 | SessionBgV3>;
    if (!parsed) return null;
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : 0;
    if (parsed.v === 3 && typeof parsed.url === 'string' && parsed.url) return { url: parsed.url, savedAt };
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

function readSessionSaved(): { url: string; savedAt: number } | null {
  try {
    const fromSession = parseStored(window.sessionStorage.getItem(SESSION_KEY));
    const fromLocal = parseStored(window.localStorage.getItem(SESSION_KEY));
    const picked =
      fromSession && fromLocal ? (fromSession.savedAt >= fromLocal.savedAt ? fromSession : fromLocal) : fromSession || fromLocal;
    if (!picked) return null;
    if (Date.now() - picked.savedAt > SAVED_MAX_AGE_MS) return null;
    if (isLocalFallbackUrl(picked.url)) return null;
    return picked;
  } catch {
    return null;
  }
}

function saveSession(url: string) {
  if (!url || isLocalFallbackUrl(url)) return;
  try {
    const now = Date.now();
    const next: SessionBgV3 = { v: 3, url, savedAt: now };
    const raw = JSON.stringify(next);
    window.sessionStorage.setItem(SESSION_KEY, raw);
    window.localStorage.setItem(SESSION_KEY, raw);
  } catch {
    // ignore (private mode / quota)
  }
}

function clearRetryTimer() {
  if (!retryTimer) return;
  window.clearTimeout(retryTimer);
  retryTimer = null;
}

function scheduleRetry() {
  if (typeof window === 'undefined') return;
  if (retryTimer) return;
  if (shouldSkipDynamicBackground()) return;

  const exp = Math.min(consecutiveFailures, 4);
  const jitter = Math.round(Math.random() * 1400);
  const delay = Math.min(RETRY_BASE_MS * 2 ** exp + jitter, RETRY_MAX_MS);
  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    initDynamicBackground({ force: true });
  }, delay);
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
  root.style.setProperty('--bg-image-current', next);
  root.style.setProperty('--bg-image-next', next);
  root.style.setProperty('--bg-crossfade-opacity', '0');
  root.style.setProperty('--bg-blackout-opacity', '0');
}

async function preloadImage(url: string, signal: AbortSignal) {
  return new Promise<{ ok: boolean; finalUrl: string }>((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.loading = 'eager';
    let finished = false;
    let timeoutId: number | null = null;

    const done = (ok: boolean) => {
      if (finished) return;
      finished = true;
      img.onload = null;
      img.onerror = null;
      if (timeoutId) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      signal.removeEventListener('abort', onAbort);
      resolve({ ok, finalUrl: img.currentSrc || url });
    };

    const onAbort = () => done(false);
    signal.addEventListener('abort', onAbort, { once: true });

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
    timeoutId = window.setTimeout(() => done(false), PRELOAD_TIMEOUT_MS);
    img.src = url;
  });
}

type FetchedImage = { objectUrl: string; finalUrl: string; isLocal: boolean };

async function fetchAsObjectUrl(url: string, signal: AbortSignal): Promise<FetchedImage | null> {
  try {
    const res = await fetch(url, { method: 'GET', signal, cache: 'no-store' });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('image/')) return null;
    const blob = await res.blob();
    if (!blob || blob.size <= 0) return null;
    const finalUrl = res.url || url;
    return {
      objectUrl: URL.createObjectURL(blob),
      finalUrl,
      isLocal: isLocalFallbackUrl(finalUrl),
    };
  } catch {
    return null;
  }
}

function parseApiParams(url: string) {
  try {
    const u = new URL(url, window.location.origin);
    if (u.pathname !== '/api/background') return null;
    const w = Number.parseInt(u.searchParams.get('w') || '', 10);
    const h = Number.parseInt(u.searchParams.get('h') || '', 10);
    const seed = u.searchParams.get('seed') || u.searchParams.get('sig') || '';
    if (!Number.isFinite(w) || !Number.isFinite(h) || !seed.trim()) return null;
    return { w, h, seed: seed.trim() };
  } catch {
    return null;
  }
}

function buildCandidateUrls(primaryUrl: string, maxCount = 2) {
  const out = new Set<string>();
  if (primaryUrl) out.add(primaryUrl);
  if (maxCount <= 1) return Array.from(out);

  const api = parseApiParams(primaryUrl);
  if (!api) return Array.from(out);

  out.add(buildApiUrl(api.w, api.h, `${api.seed}-r1`));
  return Array.from(out).slice(0, Math.max(1, maxCount));
}

function finishLoad(loadId: number, controller: AbortController) {
  if (pendingLoadId === loadId) pendingLoadId = null;
  if (activeAbort === controller) activeAbort = null;
}

async function loadAndSwap(sourceUrl: string, options?: { allowLocalFallback?: boolean; maxCandidates?: number }) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;

  const reduced = prefersReducedMotion();
  const loadId = ++activeLoadId;
  pendingLoadId = loadId;

  if (activeAbort) activeAbort.abort();
  const controller = new AbortController();
  activeAbort = controller;
  root.style.setProperty('--bg-crossfade-opacity', '0');

  const candidates = buildCandidateUrls(sourceUrl, options?.maxCandidates ?? 2);

  let chosenDisplayCss: string | null = null;
  let chosenObjectUrl: string | null = null;
  let chosenSaveUrl: string | null = null;
  let chosenIsLocal = false;

  for (const candidate of candidates) {
    if (!candidate) continue;

    const fetched = await fetchAsObjectUrl(candidate, controller.signal);
    if (loadId !== activeLoadId) {
      if (fetched?.objectUrl) URL.revokeObjectURL(fetched.objectUrl);
      finishLoad(loadId, controller);
      return;
    }

    if (fetched) {
      const canUseLocal = options?.allowLocalFallback || !currentCss || isLocalCss(currentCss);
      if (fetched.isLocal && !canUseLocal) {
        URL.revokeObjectURL(fetched.objectUrl);
      } else {
        if (fetched.isLocal) {
          URL.revokeObjectURL(fetched.objectUrl);
          chosenDisplayCss = fallbackCssForKey(candidate);
          chosenObjectUrl = null;
          chosenSaveUrl = null;
          chosenIsLocal = true;
          break;
        }
        const ok = await preloadImage(fetched.objectUrl, controller.signal);
        if (loadId !== activeLoadId) {
          URL.revokeObjectURL(fetched.objectUrl);
          finishLoad(loadId, controller);
          return;
        }
        if (ok.ok) {
          chosenDisplayCss = `url("${fetched.objectUrl}")`;
          chosenObjectUrl = fetched.objectUrl;
          chosenSaveUrl = fetched.isLocal ? null : candidate;
          chosenIsLocal = fetched.isLocal;
          break;
        }
        URL.revokeObjectURL(fetched.objectUrl);
      }
    }

    const direct = await preloadImage(candidate, controller.signal);
    if (loadId !== activeLoadId) {
      finishLoad(loadId, controller);
      return;
    }

    if (direct.ok) {
      const isLocal = isLocalFallbackUrl(direct.finalUrl || candidate);
      const canUseLocal = options?.allowLocalFallback || !currentCss || isLocalCss(currentCss);
      if (isLocal && !canUseLocal) continue;

      chosenDisplayCss = isLocal ? fallbackCssForKey(candidate) : `url("${candidate}")`;
      chosenObjectUrl = null;
      chosenSaveUrl = isLocal ? null : candidate;
      chosenIsLocal = isLocal;
      break;
    }
  }

  if (!chosenDisplayCss) {
    consecutiveFailures += 1;
    scheduleRetry();
    if (!currentCss) setBaseBackground(FALLBACK_CSS);
    root.style.setProperty('--bg-crossfade-opacity', '0');
    root.style.setProperty('--bg-blackout-opacity', '0');
    finishLoad(loadId, controller);
    return;
  }

  if (chosenIsLocal) {
    consecutiveFailures = Math.max(consecutiveFailures + 1, 1);
    scheduleRetry();
  } else {
    consecutiveFailures = 0;
    clearRetryTimer();
  }

  if (reduced) {
    setBaseBackground(chosenDisplayCss);
    currentObjectUrl = chosenObjectUrl;
    if (chosenSaveUrl) saveSession(chosenSaveUrl);
    finishLoad(loadId, controller);
    return;
  }

  const shouldBlackoutTransition = Boolean(currentCss);
  if (shouldBlackoutTransition) {
    root.style.setProperty('--bg-blackout-opacity', '1');
    await waitMs(BLACKOUT_FADE_TO_MS + BLACKOUT_SETTLE_MS);
    if (loadId !== activeLoadId) {
      if (chosenObjectUrl) URL.revokeObjectURL(chosenObjectUrl);
      finishLoad(loadId, controller);
      return;
    }
  }

  root.style.setProperty('--bg-image-next', chosenDisplayCss);
  window.requestAnimationFrame(() => {
    if (loadId !== activeLoadId) return;
    root.style.setProperty('--bg-crossfade-opacity', '1');
  });

  await waitMs(CROSSFADE_MS + CROSSFADE_SETTLE_MS);
  if (loadId !== activeLoadId) {
    if (chosenObjectUrl) URL.revokeObjectURL(chosenObjectUrl);
    finishLoad(loadId, controller);
    return;
  }

  root.style.setProperty('--bg-image-current', chosenDisplayCss);
  root.style.setProperty('--bg-image-next', chosenDisplayCss);
  root.style.setProperty('--bg-crossfade-opacity', '0');
  root.style.setProperty('--bg-blackout-opacity', '0');
  await waitMs(BLACKOUT_FADE_FROM_MS + BLACKOUT_SETTLE_MS);
  if (loadId !== activeLoadId) {
    if (chosenObjectUrl) URL.revokeObjectURL(chosenObjectUrl);
    finishLoad(loadId, controller);
    return;
  }

  const prevObjectUrl = currentObjectUrl;
  currentObjectUrl = chosenObjectUrl;
  currentCss = chosenDisplayCss;
  if (chosenSaveUrl) saveSession(chosenSaveUrl);
  if (prevObjectUrl && prevObjectUrl !== chosenObjectUrl) URL.revokeObjectURL(prevObjectUrl);
  finishLoad(loadId, controller);
}

export function initDynamicBackground(options?: { force?: boolean }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  if (pendingLoadId && !options?.force) return;

  if (shouldSkipDynamicBackground() && !options?.force) {
    if (!currentCss) setBaseBackground(FALLBACK_CSS);
    return;
  }

  const allowLocalFallback = !currentCss || isLocalCss(currentCss);
  const session = readSessionSaved();
  if (!options?.force && session?.url) {
    loadAndSwap(session.url, { allowLocalFallback, maxCandidates: 2 }).catch(() => {
      consecutiveFailures += 1;
      scheduleRetry();
      if (!currentCss) setBaseBackground(FALLBACK_CSS);
    });
    return;
  }

  if (options?.force && activeAbort) {
    activeAbort.abort();
    activeAbort = null;
    pendingLoadId = null;
  }

  const { w, h } = computeSize();
  const sourceUrl = buildApiUrl(w, h, newSeed());
  loadAndSwap(sourceUrl, { allowLocalFallback, maxCandidates: options?.force ? 1 : 2 }).catch(() => {
    consecutiveFailures += 1;
    scheduleRetry();
    if (!currentCss) setBaseBackground(FALLBACK_CSS);
  });
}

function scheduleAutoRotate() {
  if (typeof window === 'undefined') return;
  if (prefersReducedMotion()) return;
  if (shouldSkipDynamicBackground()) return;
  if (autoRotateTimer) window.clearTimeout(autoRotateTimer);
  const base = isLowMemoryDevice() ? Math.round(AUTO_ROTATE_MS * 1.5) : AUTO_ROTATE_MS;
  const jitter = Math.random() * AUTO_ROTATE_JITTER_MS;
  const delay = base + jitter;
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
  if (retryTimer) {
    window.clearTimeout(retryTimer);
    retryTimer = null;
  }
  if (activeAbort) {
    activeAbort.abort();
    activeAbort = null;
  }
}
