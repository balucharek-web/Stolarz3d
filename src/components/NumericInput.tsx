import React, { useEffect, useState } from 'react';
import { Minus, Plus } from 'lucide-react';

interface NumericInputProps {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  showSteppers?: boolean;
  ariaLabel?: string;
}

/**
 * Ergonomic numeric input that allows clearing and typing freely without
 * jumping back to fallback/min values mid-keystroke. Commits clamped values
 * on valid numeric edits, blur, or Enter.
 */
export const NumericInput: React.FC<NumericInputProps> = ({
  value,
  onChange,
  min,
  max,
  step = 10,
  className = '',
  showSteppers = false,
  ariaLabel,
}) => {
  const [draft, setDraft] = useState<string>(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDraft(String(value));
    }
  }, [value, focused]);

  const clamp = (n: number) => {
    let v = n;
    if (min !== undefined) v = Math.max(min, v);
    if (max !== undefined) v = Math.min(max, v);
    return v;
  };

  const commitDraft = (raw: string) => {
    const normalized = raw.replace(',', '.').trim();
    if (normalized === '' || normalized === '-') {
      setDraft(String(value));
      return;
    }
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const clamped = clamp(parsed);
    onChange(clamped);
    setDraft(String(clamped));
  };

  const handleStep = (delta: number) => {
    const next = clamp(Math.round((value + delta) * 100) / 100);
    onChange(next);
    setDraft(String(next));
  };

  if (!showSteppers) {
    return (
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const nextRaw = e.target.value;
          setDraft(nextRaw);
          const parsed = Number(nextRaw.replace(',', '.').trim());
          if (
            nextRaw.trim() !== '' &&
            nextRaw.trim() !== '-' &&
            Number.isFinite(parsed) &&
            (min === undefined || parsed >= min) &&
            (max === undefined || parsed <= max)
          ) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          setFocused(false);
          commitDraft(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft(draft);
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(String(value));
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            handleStep(step);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            handleStep(-step);
          }
        }}
        className={className}
      />
    );
  }

  return (
    <div className="mt-1 flex items-stretch rounded-lg border border-zinc-700 bg-zinc-900 overflow-hidden focus-within:border-amber-500">
      <button
        type="button"
        onClick={() => handleStep(-step)}
        tabIndex={-1}
        aria-label="Zmniejsz wartość"
        className="flex w-7 items-center justify-center border-r border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white active:bg-zinc-700 cursor-pointer shrink-0"
      >
        <Minus className="h-3 w-3" />
      </button>
      <input
        type="text"
        inputMode="decimal"
        aria-label={ariaLabel}
        value={draft}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onChange={(e) => {
          const nextRaw = e.target.value;
          setDraft(nextRaw);
          const parsed = Number(nextRaw.replace(',', '.').trim());
          if (
            nextRaw.trim() !== '' &&
            nextRaw.trim() !== '-' &&
            Number.isFinite(parsed) &&
            (min === undefined || parsed >= min) &&
            (max === undefined || parsed <= max)
          ) {
            onChange(parsed);
          }
        }}
        onBlur={() => {
          setFocused(false);
          commitDraft(draft);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            commitDraft(draft);
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            setDraft(String(value));
            e.currentTarget.blur();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            handleStep(step);
          } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            handleStep(-step);
          }
        }}
        className="w-full min-w-0 bg-transparent px-1.5 py-1.5 text-center text-xs font-mono tabular-nums text-white focus:outline-none"
      />
      <button
        type="button"
        onClick={() => handleStep(step)}
        tabIndex={-1}
        aria-label="Zwiększ wartość"
        className="flex w-7 items-center justify-center border-l border-zinc-800 text-zinc-400 hover:bg-zinc-800 hover:text-white active:bg-zinc-700 cursor-pointer shrink-0"
      >
        <Plus className="h-3 w-3" />
      </button>
    </div>
  );
};
