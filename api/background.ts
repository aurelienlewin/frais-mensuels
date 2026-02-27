import { methodNotAllowed } from './_http.js';
import type { HttpRequest, HttpResponse } from './_http.js';

type BgTheme = { id: string; keywords: string };
type BgCandidate = { provider: string; url: string };

const THEMES: BgTheme[] = [
  { id: 'snow-mountains', keywords: 'mountains,snow,winter,landscape' },
  { id: 'alps', keywords: 'alps,snow,landscape' },
  { id: 'snow-forest', keywords: 'winter,forest,snow,landscape' },
  { id: 'bokeh', keywords: 'bokeh,lights,abstract' },
  { id: 'night-bokeh', keywords: 'bokeh,night,lights' },
  { id: 'glacier', keywords: 'glacier,ice,mountains,landscape' },
];

const LOCAL_FALLBACK = '/bg-snowy.jpg';
const UPSTREAM_TIMEOUT_MS = 9000;

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

function pickTheme(seed: string) {
  const idx = THEMES.length ? hash32(seed) % THEMES.length : 0;
  return THEMES[idx] ?? THEMES[0]!;
}

function parsePositiveInt(raw: string | null) {
  if (!raw) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildCandidates(w: number, h: number, seed: string, theme: BgTheme) {
  const out: BgCandidate[] = [];
  const uniq = new Set<string>();

  const add = (provider: string, url: string) => {
    if (!url || uniq.has(url)) return;
    uniq.add(url);
    out.push({ provider, url });
  };

  const unsplashUrl = new URL(`https://source.unsplash.com/random/${w}x${h}/`);
  unsplashUrl.search = `${theme.keywords}&sig=${encodeURIComponent(seed)}`;
  add('unsplash', unsplashUrl.toString());

  const unsplashRetryUrl = new URL(`https://source.unsplash.com/random/${w}x${h}/`);
  unsplashRetryUrl.search = `${theme.keywords}&sig=${encodeURIComponent(`${seed}-r1`)}`;
  add('unsplash', unsplashRetryUrl.toString());

  const picsumSeedA = hash32(`${seed}:${theme.id}:a`).toString(16);
  const picsumSeedB = hash32(`${seed}:${theme.id}:b`).toString(16);
  const picsumSeedC = hash32(`${seed}:${theme.id}:c`).toString(16);
  add('picsum', `https://picsum.photos/seed/${picsumSeedA}/${w}/${h}`);
  add('picsum', `https://picsum.photos/seed/${picsumSeedB}/${w}/${h}`);
  add('picsum', `https://picsum.photos/seed/${picsumSeedC}/${w}/${h}`);

  const compactW = clamp(Math.round(w * 0.82), 480, 2200);
  const compactH = clamp(Math.round(h * 0.82), 480, 2200);
  add('picsum', `https://picsum.photos/seed/${picsumSeedB}/${compactW}/${compactH}`);
  add('picsum', `https://picsum.photos/seed/${picsumSeedC}/${compactW}/${compactH}`);

  return out;
}

async function fetchImage(url: string, method: 'GET' | 'HEAD') {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
  try {
    const upstream = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'fraismensuels/1.0 (background proxy)',
        Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
    });

    const contentType = upstream.headers.get('content-type') || '';
    if (!upstream.ok || !contentType.toLowerCase().startsWith('image/')) return null;

    const contentLengthRaw = upstream.headers.get('content-length') || '';
    const contentLength = Number.parseInt(contentLengthRaw, 10);
    if (Number.isFinite(contentLength) && contentLength <= 0) return null;
    return { upstream, contentType };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function redirectToLocal(res: HttpResponse) {
  res.statusCode = 302;
  res.setHeader('Location', LOCAL_FALLBACK);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Background-Provider', 'local');
  res.setHeader('X-Background-Fallback', '1');
  res.end();
}

export default async function handler(req: HttpRequest, res: HttpResponse) {
  if (req?.method !== 'GET' && req?.method !== 'HEAD') return methodNotAllowed(res, ['GET', 'HEAD']);

  try {
    const url = new URL(String(req?.url || ''), 'http://localhost');
    const wRaw = parsePositiveInt(url.searchParams.get('w'));
    const hRaw = parsePositiveInt(url.searchParams.get('h'));
    const seedRaw = url.searchParams.get('seed') || url.searchParams.get('sig') || '';
    const seed = seedRaw.trim() ? seedRaw.trim().slice(0, 64) : String(Date.now());

    const w = clamp(wRaw ?? 1440, 480, 2400);
    const h = clamp(hRaw ?? 1800, 480, 2400);
    const theme = pickTheme(seed);
    const candidates = buildCandidates(w, h, seed, theme);

    let picked: { provider: string; upstream: Response; contentType: string } | null = null;
    for (const candidate of candidates) {
      const found = await fetchImage(candidate.url, req.method);
      if (!found) continue;
      picked = { provider: candidate.provider, ...found };
      break;
    }

    if (!picked) {
      redirectToLocal(res);
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', picked.contentType);
    res.setHeader('Cache-Control', 'no-store, max-age=0');
    res.setHeader('X-Background-Provider', picked.provider);
    res.setHeader('X-Background-Theme', theme.id);
    res.setHeader('X-Background-Seed', seed);
    res.setHeader('X-Background-Fallback', '0');

    if (req?.method === 'HEAD') {
      res.end();
      return;
    }

    const buf = Buffer.from(await picked.upstream.arrayBuffer());
    res.end(buf);
  } catch {
    redirectToLocal(res);
  }
}
