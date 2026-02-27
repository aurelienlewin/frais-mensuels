import { useEffect, useMemo, useState } from 'react';
import { cx } from '../cx';

export type DonutSegment = {
  id: string;
  label: string;
  value: number;
  color: string;
};

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

export function DonutChart({
  segments,
  total,
  size = 132,
  thickness = 14,
  centerTop,
  centerBottom,
  activeSegmentId,
  onActiveSegmentIdChange,
  centerContainerClassName,
  centerTopClassName,
  centerBottomClassName,
  centerHint,
  centerHintClassName,
  ariaLabel,
  className,
}: {
  segments: DonutSegment[];
  total: number;
  size?: number;
  thickness?: number;
  centerTop?: string;
  centerBottom?: string;
  activeSegmentId?: string | null;
  onActiveSegmentIdChange?: (next: string | null) => void;
  centerContainerClassName?: string;
  centerTopClassName?: string;
  centerBottomClassName?: string;
  centerHint?: string;
  centerHintClassName?: string;
  ariaLabel: string;
  className?: string;
}) {
  const [mounted, setMounted] = useState(false);

  const normalized = useMemo(() => {
    const safeTotal = total > 0 ? total : 1;
    const filtered = segments.filter((s) => s.value > 0);
    const sum = filtered.reduce((acc, s) => acc + s.value, 0);
    if (sum <= 0) return [] as Array<DonutSegment & { fraction: number }>;
    return filtered.map((s) => ({
      ...s,
      fraction: clamp01(s.value / safeTotal),
    }));
  }, [segments, total]);

  const key = useMemo(() => normalized.map((s) => `${s.id}:${s.value}`).join('|'), [normalized]);

  useEffect(() => {
    setMounted(false);
    const id = window.requestAnimationFrame(() => setMounted(true));
    return () => window.cancelAnimationFrame(id);
  }, [key]);

  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;

  return (
    <div className={cx('relative', className)}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={ariaLabel}
        className="block"
        onMouseLeave={() => onActiveSegmentIdChange?.(null)}
      >
        <circle cx={center} cy={center} r={radius} fill="transparent" stroke="rgba(255,255,255,0.12)" strokeWidth={thickness} />
        <g transform={`rotate(-90 ${center} ${center})`}>
          {normalized.map((s, idx) => {
            const len = circumference * s.fraction;
            const dash = mounted ? `${len} ${Math.max(0, circumference - len)}` : `0 ${circumference}`;
            const dashOffset = -offset;
            offset += len;
            const dimOthers = Boolean(activeSegmentId);
            const isActive = activeSegmentId === s.id;
            const opacity = dimOthers ? (isActive ? 1 : 0.35) : 1;
            return (
              <circle
                key={s.id}
                cx={center}
                cy={center}
                r={radius}
                fill="transparent"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={dash}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                className="motion-dash"
                onMouseEnter={() => onActiveSegmentIdChange?.(s.id)}
                style={{
                  transitionDelay: `${idx * 40}ms`,
                  opacity,
                }}
              />
            );
          })}
        </g>
      </svg>

      <div
        className={cx(
          'pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center text-center',
          centerContainerClassName,
        )}
      >
        {(centerTop || centerBottom || centerHint) ? (
          <div className="rounded-2xl border border-white/20 bg-ink-950/85 px-3 py-1.5 shadow-[0_10px_40px_-25px_rgba(0,0,0,0.85)] shadow-black/30">
            {centerTop ? (
              <div className={cx('text-[11px] font-semibold leading-none text-slate-300', centerTopClassName)}>{centerTop}</div>
            ) : null}
            {centerBottom ? (
              <div className={cx('mt-0.5 text-sm font-semibold leading-none tabular-nums text-slate-100', centerBottomClassName)}>
                {centerBottom}
              </div>
            ) : null}
            {centerHint ? (
              <div className={cx('mt-1 text-[10px] leading-tight text-slate-400', centerHintClassName)}>{centerHint}</div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
