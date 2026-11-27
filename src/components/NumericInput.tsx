import React, { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

export interface NumericInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  allowDecimal?: boolean;
  disabled?: boolean;
  className?: string;
  showSteppers?: boolean;
  ariaLabel?: string;
  title?: string;
  placeholder?: string;
}

/**
 * Ergonomic numeric input for both desktop and mobile touch keyboards.
 * Keeps a local string draft while focused so users can freely Backspace
 * to empty or type intermediate digits without mid-keystroke min/max clamping.
 * Live-updates parent only when the typed value is valid and inside [min, max];
 * clamps and commits on blur or Enter, and cleanly reverts on Escape.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 10,
  allowDecimal = false,
  disabled = false,
  className = '',
  showSteppers = false,
  ariaLabel,
  title,
  placeholder,
}) => {
  const formatValue = (n: number) => (Number.isFinite(n) ? String(n) : '0');

  const [draft, setDraft] = useState<string>(() => formatValue(value));
  const [focused, setFocused] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) {
      setDraft(formatValue(value));
    }
  }, [value, focused]);

  const clampAndNormalize = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return allowDecimal ? Math.round(v * 1000) / 1000 : Math.round(v);
  };

  const parseRaw = (raw: string): number | null => {
    const normalized = raw.replace(/\s+/g, '').replace(',', '.');
    if (
      normalized === '' ||
      normalized === '-' ||
      normalized === '.' ||
      normalized === '-.'
    ) {
      return null;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const commitDraft = (raw: string) => {
    const parsed = parseRaw(raw);
    if (parsed === null) {
      setDraft(formatValue(value));
      return;
    }
    const next = clampAndNormalize(parsed);
    onChange(next);
    setDraft(formatValue(next));
  };

  const handleStep = (delta: number) => {
    if (disabled) return;
    const base = parseRaw(draft) ?? value;
    const next = clampAndNormalize(base + delta);
    onChange(next);
    setDraft(formatValue(next));
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextRaw = e.target.value;
    setDraft(nextRaw);

    const trimmed = nextRaw.replace(/\s+/g, '').replace(',', '.');
    if (
      trimmed === '' ||
      trimmed === '-' ||
      trimmed === '.' ||
      trimmed === '-.' ||
      (allowDecimal && trimmed.endsWith('.'))
    ) {
      return;
    }

    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return;

    const inRange =
      (min === undefined || parsed >= min) &&
      (max === undefined || parsed <= max);
    if (inRange) {
      const normalizedVal = allowDecimal
        ? Math.round(parsed * 1000) / 1000
        : Math.round(parsed);
      onChange(normalizedVal);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.stopPropagation();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      skipBlurCommitRef.current = true;
      commitDraft(draft);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      skipBlurCommitRef.current = true;
      setDraft(formatValue(value));
      e.currentTarget.blur();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      handleStep(step);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      handleStep(-step);
    }
  };

  const handleBlur = () => {
    setFocused(false);
    if (skipBlurCommitRef.current) {
      skipBlurCommitRef.current = false;
      return;
    }
    commitDraft(draft);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    skipBlurCommitRef.current = false;
    setFocused(true);
    e.currentTarget.select();
  };

  const inputMode: React.HTMLAttributes<HTMLInputElement>['inputMode'] =
    min === undefined || min < 0
      ? 'text'
      : allowDecimal
        ? 'decimal'
        : 'numeric';

  if (!showSteppers) {
    return (
      <input
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        placeholder={placeholder}
        value={draft}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className={className}
      />
    );
  }

  return (
    <div className="mt-1 flex items-stretch rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden focus-within:border-amber-500">
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleStep(-step)}
        tabIndex={-1}
        aria-label={ariaLabel ? `Zmniejsz ${ariaLabel}` : 'Zmniejsz wartość'}
        className="flex w-7 items-center justify-center border-r border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white active:bg-zinc-700 disabled:opacity-40 cursor-pointer shrink-0"
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="text"
        inputMode={inputMode}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        aria-label={ariaLabel}
        title={title}
        placeholder={placeholder}
        value={draft}
        onFocus={handleFocus}
        onChange={handleChange}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full min-w-0 bg-transparent px-1.5 py-1.5 text-center text-xs font-mono tabular-nums text-white disabled:opacity-40 focus:outline-none"
      />
      <button
        type="button"
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => handleStep(step)}
        tabIndex={-1}
        aria-label={ariaLabel ? `Zwiększ ${ariaLabel}` : 'Zwiększ wartość'}
        className="flex w-7 items-center justify-center border-l border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white active:bg-zinc-700 disabled:opacity-40 cursor-pointer shrink-0"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
};
