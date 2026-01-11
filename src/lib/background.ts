type SavedBgV1 = {
  v: 1;
  css: string;
  savedAt: number;
  expiresAt: number;
};

const STORAGE_KEY = 'fm:bg:v1';
const SESSION_KEY = 'fm:bg:session:v1';
const DEFAULT_TTL_MS = 24 * 60 * 60 * 1000;

type BgTheme = { id: string; keywords: string };

const THEMES: BgTheme[] = [
  { id: 'snow-mountains', keywords: 'mountains,snow,winter,landscape' },
  { id: 'alps', keywords: 'alps,snow,landscape' },
  { id: 'snow-forest', keywords: 'winter,forest,snow,landscape' },
  { id: 'bokeh', keywords: 'bokeh,lights,abstract' },
  { id: 'night-bokeh', keywords: 'bokeh,night,lights' },
  { id: 'glacier', keywords: 'glacier,ice,mountains,landscape' },
];

const LOCAL_FALLBACK = 'url("/bg-snowy.jpg")';

const PRESET_BACKGROUNDS: string[] = [
  `radial-gradient(1200px circle at 12% 8%, rgba(167, 139, 250, 0.26), transparent 58%),
radial-gradient(900px circle at 84% 28%, rgba(56, 189, 248, 0.18), transparent 56%),
radial-gradient(800px circle at 52% 92%, rgba(52, 211, 153, 0.13), transparent 60%),
linear-gradient(180deg, #0b1020, #070814),
${LOCAL_FALLBACK}`,
  `radial-gradient(1200px circle at 80% 12%, rgba(244, 114, 182, 0.22), transparent 58%),
radial-gradient(900px circle at 18% 34%, rgba(251, 191, 36, 0.16), transparent 56%),
radial-gradient(700px circle at 52% 90%, rgba(56, 189, 248, 0.12), transparent 60%),
linear-gradient(180deg, #0b1020, #060814),
${LOCAL_FALLBACK}`,
  `radial-gradient(1200px circle at 16% 16%, rgba(56, 189, 248, 0.22), transparent 58%),
radial-gradient(900px circle at 86% 36%, rgba(34, 211, 238, 0.14), transparent 56%),
radial-gradient(800px circle at 50% 90%, rgba(167, 139, 250, 0.12), transparent 60%),
linear-gradient(180deg, #090d1b, #060814),
${LOCAL_FALLBACK}`,
  `radial-gradient(1200px circle at 22% 12%, rgba(34, 197, 94, 0.18), transparent 58%),
radial-gradient(900px circle at 78% 32%, rgba(45, 212, 191, 0.14), transparent 56%),
radial-gradient(800px circle at 56% 92%, rgba(147, 197, 253, 0.11), transparent 60%),
linear-gradient(180deg, #0a0e1c, #060814),
${LOCAL_FALLBACK}`,
  `radial-gradient(1100px circle at 72% 18%, rgba(129, 140, 248, 0.22), transparent 58%),
radial-gradient(900px circle at 22% 40%, rgba(56, 189, 248, 0.14), transparent 56%),
radial-gradient(800px circle at 52% 92%, rgba(244, 114, 182, 0.10), transparent 60%),
linear-gradient(180deg, #0a0e1c, #060814),
${LOCAL_FALLBACK}`,
  `radial-gradient(1200px circle at 18% 18%, rgba(167, 139, 250, 0.20), transparent 58%),
radial-gradient(900px circle at 82% 34%, rgba(74, 222, 128, 0.12), transparent 56%),
radial-gradient(800px circle at 54% 92%, rgba(56, 189, 248, 0.12), transparent 60%),
linear-gradient(180deg, #090d1b, #060814),
${LOCAL_FALLBACK}`,
].map((s) => s.replace(/\s*\r?\n\s*/g, ' '));

let requestSeq = 0;
let activeRequest = 0;

type SessionBgV1 = {
  v: 1;
  css: string;
  savedAt: number;
};

function readSaved(): SavedBgV1 | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedBgV1>;
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.css !== 'string' || !parsed.css) return null;
    if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) return null;
    return { v: 1, css: parsed.css, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0, expiresAt: parsed.expiresAt };
  } catch {
    return null;
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

function save(css: string, ttlMs: number) {
  try {
    const now = Date.now();
    const next: SavedBgV1 = { v: 1, css, savedAt: now, expiresAt: now + ttlMs };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore (private mode / quota)
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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeSize() {
  const dpr = clamp(typeof window.devicePixelRatio === 'number' ? window.devicePixelRatio : 1, 1, 2);
  const w = clamp(Math.round(window.innerWidth * dpr), 720, 1920);
  const h = clamp(Math.round(window.innerHeight * dpr), 720, 1920);
  return { w, h };
}

function pickTheme(): BgTheme {
  return THEMES[Math.floor(Math.random() * THEMES.length)] ?? THEMES[0]!;
}

function pickPreset(excludeCss?: string) {
  const pool = PRESET_BACKGROUNDS.filter((s) => s !== excludeCss);
  return pool[Math.floor(Math.random() * pool.length)] ?? PRESET_BACKGROUNDS[0] ?? `linear-gradient(180deg, rgb(11 16 32), rgb(6 8 20))`;
}

function applyBackgroundCss(css: string) {
  document.documentElement.style.setProperty('--bg-image', css);
  document.body?.style?.setProperty('--bg-image', css);
  if (document.body) document.body.style.backgroundImage = css;
}

function buildUnsplashUrl(theme: BgTheme, w: number, h: number) {
  // Unsplash "Source" (no API key): returns an image via redirect.
  // Note: this triggers a third-party request from the client.
  const sig = Math.floor(Math.random() * 1_000_000_000);
  // Use the "random" endpoint to avoid sticky caching on size-only URLs.
  return `https://source.unsplash.com/random/${w}x${h}?${theme.keywords}&sig=${sig}`;
}

export function initDynamicBackground(options?: { force?: boolean; ttlMs?: number }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const ttlMs = typeof options?.ttlMs === 'number' && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;

  const session = readSessionSaved();
  if (!options?.force && session?.css) {
    applyBackgroundCss(session.css);
    return;
  }

  const existing = readSaved();

  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  // Always apply a new local preset first so the UI changes immediately (even if third-party images are blocked).
  const preset = pickPreset(session?.css ?? existing?.css);
  applyBackgroundCss(preset);
  saveSession(preset);

  // If we're offline, stop here (we already applied a visible background).
  if (offline) return;

  const { w, h } = computeSize();
  const theme = pickTheme();
  const src = buildUnsplashUrl(theme, w, h);

  const requestId = (requestSeq += 1);
  activeRequest = requestId;

  const img = new Image();
  img.decoding = 'async';
  img.onload = () => {
    if (activeRequest !== requestId) return;
    const finalUrl = img.currentSrc || img.src;
    if (!finalUrl) return;
    const escaped = finalUrl.replace(/"/g, '\\"');
    const css = `url("${escaped}"), ${LOCAL_FALLBACK}`;
    applyBackgroundCss(css);
    saveSession(css);
    save(css, ttlMs);
  };
  img.onerror = () => {
    if (activeRequest !== requestId) return;
    // If we have a previously saved background, use it (better than the default photo).
    if (existing?.css) {
      applyBackgroundCss(existing.css);
      saveSession(existing.css);
    }
  };
  img.src = src;
}
