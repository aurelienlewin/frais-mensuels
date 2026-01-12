const SESSION_KEY = 'fm:bg:session:v2';

const LOCAL_FALLBACK_URL = '/bg-snowy.jpg';
const FALLBACK_CSS = `url("${LOCAL_FALLBACK_URL}")`;

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeSize() {
  const dpr = clamp(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1, 1, 2);
  const w = clamp(Math.round(window.innerWidth * dpr), 720, 1920);
  const h = clamp(Math.round(window.innerHeight * dpr), 720, 1920);
  return { w, h };
}

function newSeed() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function buildTarget(w: number, h: number, seed: string) {
  const apiUrl = `/api/background?w=${w}&h=${h}&seed=${encodeURIComponent(seed)}`;
  return { url: apiUrl, css: `url("${apiUrl}")` };
}

type SessionBgV1 = {
  v: 1;
  css: string;
  savedAt: number;
};

let currentCss: string | null = null;
let fadeTimer: number | null = null;
let activeLoadId = 0;
let pendingLoadId: number | null = null;

function prefersReducedMotion() {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
  } catch {
    return false;
  }
}

function readSessionSaved(): SessionBgV1 | null {
  try {
    const raw = window.sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionBgV1>;
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.css !== 'string' || !parsed.css) return null;
    return { v: 1, css: parsed.css, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0 };
  } catch {
    return null;
  }
}

function saveSession(css: string) {
  try {
    const now = Date.now();
    const next: SessionBgV1 = { v: 1, css, savedAt: now };
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(next));
  } catch {
    // ignore (private mode / quota)
  }
}

function setBaseBackground(css: string) {
  const root = document.documentElement;
  if (!root) return;

  const next = css.trim() || FALLBACK_CSS;
  currentCss = next;
  root.style.setProperty('--bg-image-a', next);
  root.style.setProperty('--bg-image-b', next);
  root.style.setProperty('--bg-b-opacity', '0');
  root.style.setProperty('--bg-a-opacity', '1');
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

async function loadAndSwap(css: string, url: string) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (!root) return;

  const reduced = prefersReducedMotion();
  const loadId = ++activeLoadId;
  pendingLoadId = loadId;

  if (fadeTimer) {
    window.clearTimeout(fadeTimer);
    fadeTimer = null;
  }

  if (!reduced) {
    root.style.setProperty('--bg-a-opacity', '0');
    root.style.setProperty('--bg-b-opacity', '0');
  }

  const ok = await preloadImage(url);
  if (loadId !== activeLoadId) {
    if (pendingLoadId === loadId) pendingLoadId = null;
    return;
  }

  if (!ok) {
    root.style.setProperty('--bg-a-opacity', '1');
    if (!currentCss) setBaseBackground(FALLBACK_CSS);
    if (pendingLoadId === loadId) pendingLoadId = null;
    return;
  }

  if (reduced) {
    setBaseBackground(css);
    saveSession(css);
    if (pendingLoadId === loadId) pendingLoadId = null;
    return;
  }

  root.style.setProperty('--bg-image-b', css);
  window.requestAnimationFrame(() => {
    if (loadId !== activeLoadId) {
      if (pendingLoadId === loadId) pendingLoadId = null;
      return;
    }
    root.style.setProperty('--bg-b-opacity', '1');
    fadeTimer = window.setTimeout(() => {
      if (loadId !== activeLoadId) {
        if (pendingLoadId === loadId) pendingLoadId = null;
        return;
      }
      setBaseBackground(css);
      saveSession(css);
      fadeTimer = null;
      if (pendingLoadId === loadId) pendingLoadId = null;
    }, 620);
  });
}

export function initDynamicBackground(options?: { force?: boolean }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  if (pendingLoadId && !options?.force) return;

  const session = readSessionSaved();
  if (!options?.force && session?.css) {
    if (!currentCss || currentCss !== session.css) {
      setBaseBackground(session.css);
    }
    return;
  }

  const { w, h } = computeSize();
  const { css, url } = buildTarget(w, h, newSeed());
  loadAndSwap(css, url).catch(() => {
    if (currentCss) {
      setBaseBackground(currentCss);
    } else {
      setBaseBackground(FALLBACK_CSS);
      saveSession(FALLBACK_CSS);
    }
  });
}
