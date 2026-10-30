import type { ReactNode } from 'react';
import { cx } from './cx';

export type MobileTab = 'budgets' | 'charges' | 'accounts' | 'summary';

const icon = (path: ReactNode) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5" aria-hidden="true">
    {path}
  </svg>
);

const TABS: Array<{ id: MobileTab; label: string; icon: ReactNode }> = [
  {
    id: 'budgets',
    label: 'Enveloppes',
    icon: icon(
      <>
        <rect x="3" y="6" width="18" height="12" rx="2.5" />
        <path d="M3 10.5h18M7 15h3" />
      </>,
    ),
  },
  {
    id: 'charges',
    label: 'Charges',
    icon: icon(<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01" />),
  },
  {
    id: 'accounts',
    label: 'Comptes',
    icon: icon(
      <>
        <path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18" />
      </>,
    ),
  },
  {
    id: 'summary',
    label: 'Résumé',
    icon: icon(
      <>
        <path d="M12 3v9h9" />
        <path d="M20.5 15.5A9 9 0 1 1 8.5 3.5" />
      </>,
    ),
  },
];

/**
 * Mobile section switcher. Bottom bar in portrait; left rail on short (landscape) screens so it
 * doesn't eat the little vertical space left. Always rendered below the `desk` breakpoint only.
 */
export function MobileTabBar({
  tab,
  onChange,
  pendingCount,
}: {
  tab: MobileTab;
  onChange: (tab: MobileTab) => void;
  /** Transfers still to do; shown as a badge on the accounts tab. */
  pendingCount: number;
}) {
  return (
    <nav
      aria-label="Sections"
      data-tour="tabs"
      className={cx(
        // Floating glass dock (portrait) / floating rail (landscape).
        'fixed z-40 flex rounded-[1.75rem] border border-white/15 bg-ink-950/90 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_20px_50px_-20px_rgba(0,0,0,0.95)]',
        'inset-x-3 bottom-[calc(0.5rem+env(safe-area-inset-bottom))]',
        'short:inset-x-auto short:bottom-2 short:left-[calc(0.5rem+env(safe-area-inset-left))] short:top-2 short:w-[4.25rem] short:flex-col short:justify-center',
      )}
    >
      {TABS.map((t) => {
        const selected = t.id === tab;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-current={selected ? 'page' : undefined}
            className={cx(
              'relative flex min-h-14 flex-1 flex-col rounded-3xl items-center justify-center gap-0.5 px-1 text-[10px] font-semibold leading-tight transition-colors',
              'short:flex-none short:py-2',
              selected ? 'text-sky-100' : 'text-slate-400 active:text-slate-200',
            )}
          >
            <span
              className={cx(
                'relative flex h-7 w-12 items-center justify-center rounded-full transition-colors short:h-6',
                selected && 'bg-sky-400/20',
              )}
            >
              {t.icon}
              {t.id === 'accounts' && pendingCount > 0 ? (
                <span className="absolute -right-0.5 -top-1 min-w-4 rounded-full bg-amber-300 px-1 text-center text-[10px] font-bold leading-4 text-ink-950">
                  {pendingCount}
                  <span className="sr-only"> à virer</span>
                </span>
              ) : null}
            </span>
            {t.label}
          </button>
        );
      })}
    </nav>
  );
}
