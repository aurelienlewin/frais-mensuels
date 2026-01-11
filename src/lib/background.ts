const SESSION_KEY = 'fm:bg:session:v1';

const LOCAL_FALLBACK = 'url("/bg-snowy.jpg")';

const PRESET_BACKGROUNDS: string[] = [
  `radial-gradient(1200px circle at 12% 8%, rgba(167, 139, 250, 0.26), transparent 58%),
radial-gradient(900px circle at 84% 28%, rgba(56, 189, 248, 0.18), transparent 56%),
radial-gradient(800px circle at 52% 92%, rgba(52, 211, 153, 0.13), transparent 60%),
${LOCAL_FALLBACK}`,
  `radial-gradient(1200px circle at 80% 12%, rgba(244, 114, 182, 0.22), transparent 58%),
radial-gradient(900px circle at 18% 34%, rgba(251, 191, 36, 0.16), transparent 56%),
radial-gradient(700px circle at 52% 90%, rgba(56, 189, 248, 0.12), transparent 60%),
${LOCAL_FALLBACK}`,
  `radial-gradient(1200px circle at 16% 16%, rgba(56, 189, 248, 0.22), transparent 58%),
radial-gradient(900px circle at 86% 36%, rgba(34, 211, 238, 0.14), transparent 56%),
radial-gradient(800px circle at 50% 90%, rgba(167, 139, 250, 0.12), transparent 60%),
${LOCAL_FALLBACK}`,
  `radial-gradient(1200px circle at 22% 12%, rgba(34, 197, 94, 0.18), transparent 58%),
radial-gradient(900px circle at 78% 32%, rgba(45, 212, 191, 0.14), transparent 56%),
radial-gradient(800px circle at 56% 92%, rgba(147, 197, 253, 0.11), transparent 60%),
${LOCAL_FALLBACK}`,
  `radial-gradient(1100px circle at 72% 18%, rgba(129, 140, 248, 0.22), transparent 58%),
radial-gradient(900px circle at 22% 40%, rgba(56, 189, 248, 0.14), transparent 56%),
radial-gradient(800px circle at 52% 92%, rgba(244, 114, 182, 0.10), transparent 60%),
${LOCAL_FALLBACK}`,
  `radial-gradient(1200px circle at 18% 18%, rgba(167, 139, 250, 0.20), transparent 58%),
radial-gradient(900px circle at 82% 34%, rgba(74, 222, 128, 0.12), transparent 56%),
radial-gradient(800px circle at 54% 92%, rgba(56, 189, 248, 0.12), transparent 60%),
${LOCAL_FALLBACK}`,
].map((s) => s.replace(/\s*\r?\n\s*/g, ' '));

type SessionBgV1 = {
  v: 1;
  css: string;
  savedAt: number;
};

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

function pickPreset(excludeCss?: string) {
  const pool = PRESET_BACKGROUNDS.filter((s) => s !== excludeCss);
  return pool[Math.floor(Math.random() * pool.length)] ?? PRESET_BACKGROUNDS[0] ?? LOCAL_FALLBACK;
}

function applyBackgroundCss(css: string) {
  document.documentElement.style.setProperty('--bg-image', css);
  document.body?.style?.setProperty('--bg-image', css);
  if (document.body) document.body.style.backgroundImage = css;
}

export function initDynamicBackground(options?: { force?: boolean }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const session = readSessionSaved();
  if (!options?.force && session?.css) {
    applyBackgroundCss(session.css);
    return;
  }

  const preset = pickPreset(session?.css);
  applyBackgroundCss(preset);
  saveSession(preset);
}
