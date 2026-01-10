type SavedBgV1 = {
  v: 1;
  url: string;
  savedAt: number;
  expiresAt: number;
};

const STORAGE_KEY = 'fm:bg:v1';
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

let requestSeq = 0;
let activeRequest = 0;

function readSaved(): SavedBgV1 | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SavedBgV1>;
    if (!parsed || parsed.v !== 1) return null;
    if (typeof parsed.url !== 'string' || !parsed.url) return null;
    if (typeof parsed.expiresAt !== 'number' || !Number.isFinite(parsed.expiresAt)) return null;
    return { v: 1, url: parsed.url, savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0, expiresAt: parsed.expiresAt };
  } catch {
    return null;
  }
}

function save(url: string, ttlMs: number) {
  try {
    const now = Date.now();
    const next: SavedBgV1 = { v: 1, url, savedAt: now, expiresAt: now + ttlMs };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

function applyBackgroundUrl(url: string) {
  const escaped = url.replace(/"/g, '\\"');
  document.documentElement.style.setProperty('--bg-image', `url("${escaped}")`);
}

function buildUnsplashUrl(theme: BgTheme, w: number, h: number) {
  // Unsplash "Source" (no API key): returns an image via redirect.
  // Note: this triggers a third-party request from the client.
  const sig = Math.floor(Math.random() * 1_000_000_000);
  return `https://source.unsplash.com/${w}x${h}/?${theme.keywords}&sig=${sig}`;
}

export function initDynamicBackground(options?: { force?: boolean; ttlMs?: number }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const ttlMs = typeof options?.ttlMs === 'number' && options.ttlMs > 0 ? options.ttlMs : DEFAULT_TTL_MS;

  const existing = readSaved();
  const now = Date.now();
  const shouldReuse = !options?.force && existing && existing.expiresAt > now;
  if (shouldReuse) {
    applyBackgroundUrl(existing.url);
    return;
  }

  // If we're offline but we do have a previously saved URL, keep it.
  if (existing && typeof navigator !== 'undefined' && navigator.onLine === false) {
    applyBackgroundUrl(existing.url);
    return;
  }

  const { w, h } = computeSize();
  const theme = pickTheme();
  const src = buildUnsplashUrl(theme, w, h);

  const requestId = (requestSeq += 1);
  activeRequest = requestId;

  const img = new Image();
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  img.onload = () => {
    if (activeRequest !== requestId) return;
    const finalUrl = img.currentSrc || img.src;
    if (!finalUrl) return;
    applyBackgroundUrl(finalUrl);
    save(finalUrl, ttlMs);
  };
  img.onerror = () => {
    if (activeRequest !== requestId) return;
    // Keep the default local background from CSS.
  };
  img.src = src;
}
