import { useEffect, useMemo, useState } from 'react';
import type { InputHTMLAttributes } from 'react';
import { parseEuroAmount } from '../../lib/money';
import { cx } from '../cx';

type DataAttributes = { [key: `data-${string}`]: string | undefined };

type InputExtraProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'onBlur' | 'onKeyDown' | 'disabled' | 'placeholder' | 'aria-label' | 'className' | 'type'
> &
  DataAttributes;

type BaseProps = {
  className?: string;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel: string;
  inputProps?: InputExtraProps;
};

type InlineTextInputProps = BaseProps & {
  value: string;
  onCommit: (next: string) => void;
  type?: InputHTMLAttributes<HTMLInputElement>['type'];
};

const DEFAULT_TEXT_INPUT_CLASS =
  'h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-white/15 focus:bg-white/10';

export function InlineTextInput({
  value,
  onCommit,
  className = DEFAULT_TEXT_INPUT_CLASS,
  disabled,
  placeholder,
  ariaLabel,
  inputProps,
  type = 'text',
}: InlineTextInputProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };

  return (
    <input
      {...inputProps}
      className={cx(className, disabled && 'opacity-60')}
      disabled={disabled}
      type={type}
      value={draft}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => {
        setDraft(e.target.value);
        setEditing(true);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          setEditing(false);
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
    />
  );
}

type InlineNumberInputProps = BaseProps & {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  inputClassName?: string;
  onCommit: (next: number) => void;
};

export function InlineNumberInput({
  value,
  onCommit,
  className,
  disabled,
  placeholder,
  ariaLabel,
  inputProps,
  min,
  max,
  step,
  suffix,
  inputClassName,
}: InlineNumberInputProps) {
  const initial = useMemo(() => String(value), [value]);
  const [draft, setDraft] = useState(initial);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (!editing) setDraft(initial);
  }, [initial, editing]);

  const commit = () => {
    setEditing(false);
    const n = parseEuroAmount(draft);
    if (n === null) {
      setDraft(initial);
      return;
    }

    const clamped =
      typeof min === 'number' || typeof max === 'number'
        ? Math.max(typeof min === 'number' ? min : n, Math.min(n, typeof max === 'number' ? max : n))
        : n;

    if (clamped !== value) onCommit(clamped);
    if (clamped !== n) setDraft(String(clamped));
  };

  return (
    <div className={cx('relative', className)}>
      <input
        {...inputProps}
        className={cx(
          'h-9 w-full rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-500 focus:border-white/15 focus:bg-white/10',
          suffix && 'pr-9',
          disabled && 'opacity-60',
          inputClassName,
        )}
        disabled={disabled}
        value={draft}
        placeholder={placeholder}
        aria-label={ariaLabel}
        inputMode="decimal"
        type="text"
        min={min}
        max={max}
        step={step}
        onChange={(e) => {
          setDraft(e.target.value);
          setEditing(true);
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setDraft(initial);
            setEditing(false);
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
      />
      {suffix ? (
        <div className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-slate-400">{suffix}</div>
      ) : null}
    </div>
  );
}
