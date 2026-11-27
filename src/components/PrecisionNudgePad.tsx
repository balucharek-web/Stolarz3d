import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Lock,
  RotateCw,
  Unlock,
  X,
} from 'lucide-react';

interface PrecisionNudgePadProps {
  open: boolean;
  label: string;
  selectedCount: number;
  locked: boolean;
  onNudge: (dx: number, dy: number, dz: number) => void;
  onRotate90: () => void;
  onDropToFloor: () => void;
  onToggleLock: () => void;
  onClose: () => void;
}

const STEP_OPTIONS = [1, 10, 50] as const;

export const PrecisionNudgePad: React.FC<PrecisionNudgePadProps> = ({
  open,
  label,
  selectedCount,
  locked,
  onNudge,
  onRotate90,
  onDropToFloor,
  onToggleLock,
  onClose,
}) => {
  const [stepMm, setStepMm] = useState<number>(10);

  if (!open) return null;

  const dpadBtn =
    'flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-zinc-100 hover:bg-white/[0.1] hover:border-amber-500/50 active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer';

  return (
    <div
      className="studio-glass animate-studio-pop fixed bottom-[126px] md:bottom-[92px] right-2.5 md:right-4 z-30 w-[244px] rounded-2xl p-3 text-zinc-100"
      role="region"
      aria-label="Pad precyzyjnego przesuwania"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2.5 border-b border-white/[0.08]">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate">
            {selectedCount > 1 ? `Grupa (${selectedCount} elem.)` : label}
          </div>
          <div className="text-[11px] text-zinc-400">
            Ruch precyzyjny{locked ? ' · zablokowany' : ''}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.08] hover:text-white cursor-pointer shrink-0 transition-colors"
          aria-label="Zamknij pad precyzji"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Step selector */}
      <div className="mt-2.5 flex items-center justify-between gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.06]">
        {STEP_OPTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStepMm(s)}
            className={`flex-1 min-h-[30px] rounded-lg text-xs font-mono-num font-medium transition-colors cursor-pointer ${
              stepMm === s
                ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                : 'text-zinc-400 hover:text-zinc-100'
            }`}
          >
            {s} mm
          </button>
        ))}
      </div>

      {/* Main D-pad (XZ floor plane) + Vertical Y column */}
      <div className="mt-2.5 flex items-center justify-between gap-2.5">
        {/* Horizontal XZ cross */}
        <div className="grid grid-cols-3 gap-1">
          <div />
          <button
            type="button"
            disabled={locked}
            onClick={() => onNudge(0, 0, -stepMm)}
            className={dpadBtn}
            title={`W głąb (-Z ${stepMm} mm)`}
            aria-label="Przesuń w głąb"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <div />
          <button
            type="button"
            disabled={locked}
            onClick={() => onNudge(-stepMm, 0, 0)}
            className={dpadBtn}
            title={`W lewo (-X ${stepMm} mm)`}
            aria-label="Przesuń w lewo"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={onDropToFloor}
            className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.08] text-amber-300 hover:bg-amber-500/20 active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer"
            title="Postaw na podłodze (Y = 0)"
            aria-label="Postaw na podłodze"
          >
            <ArrowDownToLine className="h-4 w-4" />
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => onNudge(stepMm, 0, 0)}
            className={dpadBtn}
            title={`W prawo (+X ${stepMm} mm)`}
            aria-label="Przesuń w prawo"
          >
            <ArrowRight className="h-4 w-4" />
          </button>
          <div />
          <button
            type="button"
            disabled={locked}
            onClick={() => onNudge(0, 0, stepMm)}
            className={dpadBtn}
            title={`Do przodu (+Z ${stepMm} mm)`}
            aria-label="Przesuń do przodu"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
          <div />
        </div>

        {/* Vertical Y axis (Up/Down) */}
        <div className="flex flex-col items-center gap-1.5 pl-2.5 border-l border-white/[0.08]">
          <button
            type="button"
            disabled={locked}
            onClick={() => onNudge(0, stepMm, 0)}
            className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-zinc-100 hover:border-amber-500/50 hover:bg-white/[0.1] active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer"
            title={`W górę (+Y ${stepMm} mm)`}
            aria-label="Podnieś w górę"
          >
            <ChevronUp className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] font-medium leading-none">Góra</span>
          </button>
          <button
            type="button"
            disabled={locked}
            onClick={() => onNudge(0, -stepMm, 0)}
            className="flex h-12 w-12 flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-zinc-100 hover:border-amber-500/50 hover:bg-white/[0.1] active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer"
            title={`W dół (-Y ${stepMm} mm)`}
            aria-label="Opuść w dół"
          >
            <ChevronDown className="h-4 w-4 text-amber-400" />
            <span className="text-[10px] font-medium leading-none">Dół</span>
          </button>
        </div>
      </div>

      {/* Bottom quick actions: Rotate 90 & Lock */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 pt-2.5 border-t border-white/[0.08]">
        <button
          type="button"
          disabled={locked}
          onClick={onRotate90}
          className="flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] text-xs font-medium text-zinc-200 hover:bg-white/[0.1] disabled:opacity-30 transition-colors cursor-pointer"
        >
          <RotateCw className="h-3.5 w-3.5 text-amber-400" />
          <span>Obróć 90°</span>
        </button>
        <button
          type="button"
          onClick={onToggleLock}
          className={`flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
            locked
              ? 'border-amber-500/50 bg-amber-500/15 text-amber-300'
              : 'border-white/[0.08] bg-white/[0.05] text-zinc-300 hover:bg-white/[0.1] hover:text-white'
          }`}
        >
          {locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          <span>{locked ? 'Odblokuj' : 'Zablokuj'}</span>
        </button>
      </div>
    </div>
  );
};
