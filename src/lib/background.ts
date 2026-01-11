const SESSION_KEY = 'fm:bg:session:v2';

const LOCAL_FALLBACK_URL = '/bg-snowy.jpg';

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

function buildCss(w: number, h: number, seed: string) {
  const apiUrl = `/api/background?w=${w}&h=${h}&seed=${encodeURIComponent(seed)}`;
  return `url("${apiUrl}"), url("${LOCAL_FALLBACK_URL}")`;
}

type SessionBgV1 = {
  v: 1;
  css: string;
  savedAt: number;
};

let currentCss: string | null = null;
let fadeTimer: number | null = null;

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

function applyBackgroundCss(css: string) {
  const root = document.documentElement;
  if (!root) return;

  const next = css.trim();
  if (!next) return;

  if (fadeTimer) {
    window.clearTimeout(fadeTimer);
    fadeTimer = null;

    const mid = root.style.getPropertyValue('--bg-image-b').trim();
    if (mid) {
      root.style.setProperty('--bg-image-a', mid);
      currentCss = mid;
    }
    root.style.setProperty('--bg-b-opacity', '0');
  }

  if (currentCss === next) {
    root.style.setProperty('--bg-image-a', next);
    root.style.setProperty('--bg-image-b', next);
    root.style.setProperty('--bg-b-opacity', '0');
    return;
  }

  if (prefersReducedMotion()) {
    currentCss = next;
    root.style.setProperty('--bg-image-a', next);
    root.style.setProperty('--bg-image-b', next);
    root.style.setProperty('--bg-b-opacity', '0');
    return;
  }

  root.style.setProperty('--bg-image-b', next);
  root.style.setProperty('--bg-b-opacity', '0');

  window.requestAnimationFrame(() => {
    root.style.setProperty('--bg-b-opacity', '1');
    fadeTimer = window.setTimeout(() => {
      currentCss = next;
      root.style.setProperty('--bg-image-a', next);
      root.style.setProperty('--bg-b-opacity', '0');
      fadeTimer = null;
    }, 620);
  });
}

export function initDynamicBackground(options?: { force?: boolean }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const session = readSessionSaved();
  if (!options?.force && session?.css) {
    applyBackgroundCss(session.css);
    return;
  }

  const { w, h } = computeSize();
  const css = buildCss(w, h, newSeed());
  applyBackgroundCss(css);
  saveSession(css);
}
