import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cx } from './cx';

export type TourStep = {
  id: string;
  title: string;
  body: ReactNode;
  anchor?: string; // matches [data-tour="<anchor>"]
};

function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function cssEscape(s: string) {
  try {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
  } catch {
    // ignore
  }
  return s.replace(/["\\]/g, '\\$&');
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export function Tour({
  open,
  steps,
  onDismiss,
}: {
  open: boolean;
  steps: TourStep[];
  onDismiss: () => void;
}) {
  const [idx, setIdx] = useState(0);
  const step = steps[idx] ?? steps[0];
  const isLast = idx >= steps.length - 1;

  const containerRef = useRef<HTMLDivElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const prevActiveRef = useRef<HTMLElement | null>(null);

  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const [popPos, setPopPos] = useState<{ left: number; top: number } | null>(null);

  const anchorSelector = useMemo(() => {
    const a = step?.anchor?.trim();
    return a ? `[data-tour="${cssEscape(a)}"]` : null;
  }, [step?.anchor]);

  useEffect(() => {
    if (!open) return;
    setIdx(0);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    prevActiveRef.current = (document.activeElement as HTMLElement | null) ?? null;
    window.requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el) return;
      const first = el.querySelector<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      (first ?? el).focus();
    });

    return () => {
      prevActiveRef.current?.focus?.();
      prevActiveRef.current = null;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!anchorSelector) {
      setAnchorRect(null);
      return;
    }

    const el = document.querySelector<HTMLElement>(anchorSelector);
    if (!el) {
      setAnchorRect(null);
      return;
    }

    const update = () => setAnchorRect(el.getBoundingClientRect());
    update();

    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    try {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
    } catch {
      // ignore
    }

    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorSelector, idx, open]);

  useLayoutEffect(() => {
    if (!open) return;
    if (!anchorRect || !popRef.current) {
      setPopPos(null);
      return;
    }
    const pop = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const gap = 14;
    const margin = 12;

    const candidates = [
      { left: anchorRect.left, top: anchorRect.bottom + gap }, // bottom
      { left: anchorRect.left, top: anchorRect.top - pop.height - gap }, // top
      { left: anchorRect.right + gap, top: anchorRect.top }, // right
      { left: anchorRect.left - pop.width - gap, top: anchorRect.top }, // left
    ];

    const fits = (p: { left: number; top: number }) =>
      p.left >= margin &&
      p.top >= margin &&
      p.left + pop.width <= vw - margin &&
      p.top + pop.height <= vh - margin;

    const chosen = candidates.find(fits) ?? candidates[0]!;
    setPopPos({
      left: clamp(chosen.left, margin, Math.max(margin, vw - pop.width - margin)),
      top: clamp(chosen.top, margin, Math.max(margin, vh - pop.height - margin)),
    });
  }, [anchorRect, idx, open]);

  const close = () => {
    onDismiss();
  };

  const back = () => setIdx((v) => Math.max(0, v - 1));
  const next = () => {
    if (isLast) close();
    else setIdx((v) => Math.min(steps.length - 1, v + 1));
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      back();
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
      return;
    }
    if (e.key !== 'Tab') return;

    const root = containerRef.current;
    if (!root) return;
    const focusables = Array.from(
      root.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'),
    ).filter((x) => !x.hasAttribute('disabled') && x.getAttribute('aria-hidden') !== 'true');
    if (focusables.length === 0) return;

    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;
    const active = document.activeElement as HTMLElement | null;
    const shift = (e as unknown as { shiftKey?: boolean }).shiftKey === true;

    if (shift && active === first) {
      e.preventDefault();
      last.focus();
      return;
    }
    if (!shift && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  if (!open || !step) return null;

  const anchored = Boolean(anchorRect);
  const dialogStyle = (() => {
    if (!anchored || !anchorRect) return undefined;
    if (popPos) return { left: popPos.left, top: popPos.top } satisfies CSSProperties;
    const margin = 12;
    const gap = 14;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 420;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 320;
    const approxW = Math.min(420, Math.round(vw * 0.92));
    const approxH = 260;

    return {
      left: clamp(anchorRect.left, margin, Math.max(margin, vw - approxW - margin)),
      top: clamp(anchorRect.bottom + gap, margin, Math.max(margin, vh - approxH - margin)),
    } satisfies CSSProperties;
  })();

  const highlightStyle =
    anchorRect && anchored
      ? ({
          left: Math.max(8, anchorRect.left - 8),
          top: Math.max(8, anchorRect.top - 8),
          width: Math.max(0, anchorRect.width + 16),
          height: Math.max(0, anchorRect.height + 16),
        } satisfies CSSProperties)
      : undefined;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/65 backdrop-blur-[2px]" aria-hidden="true" />

      {highlightStyle ? (
        <div
          className="pointer-events-none absolute rounded-[28px] border border-fuchsia-200/55 shadow-[0_0_0_1px_rgba(56,189,248,0.14),0_0_60px_-30px_rgba(189,147,249,0.6)]"
          style={highlightStyle}
          aria-hidden="true"
        />
      ) : null}

      <div
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Guide de démarrage"
        className="absolute inset-0 flex items-center justify-center p-4"
        onKeyDown={onKeyDown}
      >
        <div
          ref={popRef}
          className={cx(
            'motion-pop w-[min(92vw,420px)] rounded-3xl border border-white/15 bg-ink-950/95 p-5 shadow-[0_20px_80px_-40px_rgba(0,0,0,0.95)]',
            anchored ? 'fixed' : 'relative',
          )}
          style={dialogStyle}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Guide · {idx + 1}/{steps.length}
              </div>
              <div className="mt-1 text-base font-semibold text-slate-100">{step.title}</div>
            </div>
            <button
              type="button"
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200 transition-colors hover:bg-white/10"
              onClick={close}
              aria-label="Fermer le guide"
            >
              ✕
            </button>
          </div>

          <div className="mt-4 space-y-3 text-sm text-slate-200">{step.body}</div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              className="rounded-2xl border border-white/15 bg-white/7 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10"
              onClick={close}
            >
              Ignorer
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={cx(
                  'rounded-2xl border border-white/15 bg-white/7 px-4 py-2 text-sm text-slate-200 transition-colors hover:bg-white/10',
                  idx === 0 && 'opacity-50 hover:bg-white/7',
                )}
                onClick={back}
                disabled={idx === 0}
              >
                Retour
              </button>
              <button
                type="button"
                className="rounded-2xl border border-fuchsia-200/30 bg-fuchsia-400/15 px-4 py-2 text-sm font-semibold text-fuchsia-100 transition-colors hover:bg-fuchsia-400/20"
                onClick={next}
              >
                {isLast ? 'Terminer' : idx === 0 ? 'Commencer' : 'Suivant'}
              </button>
            </div>
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            Raccourcis: <span className="font-mono">Esc</span> fermer · <span className="font-mono">←</span>/<span className="font-mono">→</span> naviguer
          </div>
        </div>
      </div>
    </div>
  );
}
