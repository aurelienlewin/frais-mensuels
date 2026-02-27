import { methodNotAllowed } from './_http.js';
import type { HttpRequest, HttpResponse } from './_http.js';

type BgTheme = { id: string; keywords: string };

const THEMES: BgTheme[] = [
  { id: 'snow-mountains', keywords: 'mountains,snow,winter,landscape' },
  { id: 'alps', keywords: 'alps,snow,landscape' },
  { id: 'snow-forest', keywords: 'winter,forest,snow,landscape' },
  { id: 'bokeh', keywords: 'bokeh,lights,abstract' },
  { id: 'night-bokeh', keywords: 'bokeh,night,lights' },
  { id: 'glacier', keywords: 'glacier,ice,mountains,landscape' },
];

const LOCAL_FALLBACK = '/bg-snowy.jpg';

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

async function fetchImage(url: string) {
  const upstream = await fetch(url, {
    redirect: 'follow',
    headers: {
      'User-Agent': 'fraismensuels/1.0 (background proxy)',
      Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
    },
  });

  const contentType = upstream.headers.get('content-type') || '';
  if (!upstream.ok || !contentType.toLowerCase().startsWith('image/')) return null;
  return { upstream, contentType };
}

function redirectToLocal(res: HttpResponse) {
  res.statusCode = 302;
  res.setHeader('Location', LOCAL_FALLBACK);
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Background-Provider', 'local');
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

    const unsplashUrl = new URL(`https://source.unsplash.com/random/${w}x${h}/`);
    // Unsplash "Source" expects keywords as query string (without key), plus an optional cache buster.
    unsplashUrl.search = `${theme.keywords}&sig=${encodeURIComponent(seed)}`;

    const picsumSeed = hash32(`${seed}:${theme.id}`).toString(16);
    const picsumUrl = `https://picsum.photos/seed/${picsumSeed}/${w}/${h}`;

    const picked =
      (await fetchImage(unsplashUrl.toString()).then((r) => (r ? { provider: 'unsplash', ...r } : null))) ??
      (await fetchImage(picsumUrl).then((r) => (r ? { provider: 'picsum', ...r } : null)));

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
