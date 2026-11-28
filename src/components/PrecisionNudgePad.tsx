import React, { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Lock,
  Magnet,
  Move,
  RotateCcw,
  RotateCw,
  Unlock,
  X,
} from 'lucide-react';

export type SnapNeighborDir = 'left' | 'right' | 'back' | 'front' | 'down' | 'up';
export type QuickOrientationPreset = 'upright' | 'flat_x' | 'flat_z';

interface PrecisionNudgePadProps {
  open: boolean;
  defaultTab?: 'move' | 'rotate';
  label: string;
  selectedCount: number;
  isCabinet?: boolean;
  locked: boolean;
  currentRotation?: [number, number, number];
  onNudge: (dx: number, dy: number, dz: number) => void;
  onSnapToNeighbor?: (dir: SnapNeighborDir) => void;
  onRotateAxis?: (axis: 'x' | 'y' | 'z', deltaDeg: number) => void;
  onQuickOrientation?: (preset: QuickOrientationPreset) => void;
  onRotate90: () => void;
  onDropToFloor: () => void;
  onToggleLock: () => void;
  onClose: () => void;
}

const STEP_OPTIONS = [1, 10, 50] as const;
const ANGLE_OPTIONS = [15, 45, 90] as const;

function formatDeg(val: number): string {
  const norm = ((Math.round(val) % 360) + 360) % 360;
  return `${norm > 180 ? norm - 360 : norm}°`;
}

export const PrecisionNudgePad: React.FC<PrecisionNudgePadProps> = ({
  open,
  defaultTab = 'move',
  label,
  selectedCount,
  isCabinet = false,
  locked,
  currentRotation = [0, 0, 0],
  onNudge,
  onSnapToNeighbor,
  onRotateAxis,
  onQuickOrientation,
  onRotate90,
  onDropToFloor,
  onToggleLock,
  onClose,
}) => {
  const [tab, setTab] = useState<'move' | 'rotate'>(defaultTab);
  const [stepMm, setStepMm] = useState<number>(10);
  const [angleDeg, setAngleDeg] = useState<number>(90);

  useEffect(() => {
    if (open) {
      setTab(defaultTab);
    }
  }, [open, defaultTab]);

  if (!open) return null;

  const dpadBtn =
    'flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-zinc-100 hover:bg-white/[0.1] hover:border-amber-500/50 active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer';

  const snapChipBtn =
    'flex h-8 items-center justify-center rounded-lg border border-sky-400/25 bg-sky-500/10 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/20 active:bg-sky-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer';

  const rotStepBtn =
    'flex h-9 w-11 items-center justify-center gap-0.5 rounded-xl border border-white/[0.08] bg-white/[0.05] text-xs font-semibold font-mono-num text-zinc-100 hover:border-amber-500/50 hover:bg-white/[0.1] active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer';

  const handleRotate = (axis: 'x' | 'y' | 'z', delta: number) => {
    if (onRotateAxis) {
      onRotateAxis(axis, delta);
    } else if (axis === 'y' && delta === 90) {
      onRotate90();
    }
  };

  return (
    <div
      className="studio-glass animate-studio-pop fixed bottom-[132px] md:bottom-[96px] right-2.5 md:right-4 z-30 w-[262px] rounded-2xl p-3 text-zinc-100 shadow-2xl"
      role="region"
      aria-label="Pad precyzyjnego przesuwania i obracania"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 pb-2 border-b border-white/[0.08]">
        <div className="min-w-0">
          <div className="text-xs font-semibold text-white truncate">
            {isCabinet ? label : selectedCount > 1 ? `Grupa (${selectedCount} elem.)` : label}
          </div>
          <div className="text-[11px] text-zinc-400">
            {tab === 'move' ? 'Przesuń i dosuń' : 'Obrót i orientacja'}
            {locked ? ' · zablokowany' : ''}
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

      {/* Mode Tabs: Move+Snap vs Rotate */}
      <div className="mt-2 grid grid-cols-2 gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.07]">
        <button
          type="button"
          onClick={() => setTab('move')}
          className={`flex min-h-[32px] items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            tab === 'move'
              ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          <Move className="h-3.5 w-3.5" />
          <span>Przesuń</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('rotate')}
          className={`flex min-h-[32px] items-center justify-center gap-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
            tab === 'rotate'
              ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
              : 'text-zinc-400 hover:text-zinc-100'
          }`}
        >
          <RotateCw className="h-3.5 w-3.5" />
          <span>Obróć</span>
        </button>
      </div>

      {tab === 'move' ? (
        <>
          {/* Step selector */}
          <div className="mt-2 flex items-center justify-between gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.06]">
            {STEP_OPTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStepMm(s)}
                className={`flex-1 min-h-[28px] rounded-lg text-xs font-mono-num font-medium transition-colors cursor-pointer ${
                  stepMm === s
                    ? 'bg-white/[0.14] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {s} mm
              </button>
            ))}
          </div>

          {/* Main D-pad (XZ floor plane) + Vertical Y column */}
          <div className="mt-2 flex items-center justify-between gap-2">
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
                className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.08] text-amber-300 hover:bg-amber-500/20 active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer"
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
            <div className="flex flex-col items-center gap-1.5 pl-2 border-l border-white/[0.08]">
              <button
                type="button"
                disabled={locked}
                onClick={() => onNudge(0, stepMm, 0)}
                className="flex h-12 w-14 flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-zinc-100 hover:border-amber-500/50 hover:bg-white/[0.1] active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer"
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
                className="flex h-12 w-14 flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-zinc-100 hover:border-amber-500/50 hover:bg-white/[0.1] active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 transition-all cursor-pointer"
                title={`W dół (-Y ${stepMm} mm)`}
                aria-label="Opuść w dół"
              >
                <ChevronDown className="h-4 w-4 text-amber-400" />
                <span className="text-[10px] font-medium leading-none">Dół</span>
              </button>
            </div>
          </div>

          {/* 1-Tap Magnetic Snap to Nearest Element / Wall */}
          {onSnapToNeighbor && (
            <div className="mt-2.5 pt-2 border-t border-white/[0.08] space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-sky-300">
                <Magnet className="h-3 w-3" />
                <span>Dosuń na styk (0 mm)</span>
              </div>
              <div className="grid grid-cols-3 gap-1">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onSnapToNeighbor('left')}
                  className={snapChipBtn}
                  title="Dosuń do najbliższego elementu lub ściany z lewej"
                >
                  ← Lewo
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onSnapToNeighbor('back')}
                  className={snapChipBtn}
                  title="Dosuń do ściany lub elementu z tyłu"
                >
                  ↖ Tył
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onSnapToNeighbor('right')}
                  className={snapChipBtn}
                  title="Dosuń do najbliższego elementu lub ściany z prawej"
                >
                  Prawo →
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onSnapToNeighbor('down')}
                  className={snapChipBtn}
                  title="Postaw na elemencie poniżej lub podłodze"
                >
                  ↓ Na dół
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onSnapToNeighbor('front')}
                  className={snapChipBtn}
                  title="Dosuń do najbliższego elementu z przodu"
                >
                  ↘ Przód
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => onSnapToNeighbor('up')}
                  className={snapChipBtn}
                  title="Dosuń pod spód elementu powyżej"
                >
                  ↑ Pod górę
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          {/* Angle step selector */}
          <div className="mt-2 flex items-center justify-between gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.06]">
            {ANGLE_OPTIONS.map((deg) => (
              <button
                key={deg}
                type="button"
                onClick={() => setAngleDeg(deg)}
                className={`flex-1 min-h-[28px] rounded-lg text-xs font-mono-num font-medium transition-colors cursor-pointer ${
                  angleDeg === deg
                    ? 'bg-white/[0.14] text-white font-semibold'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                {deg}°
              </button>
            ))}
          </div>

          {/* 3-Axis Intuitive Rotation Rows */}
          <div className="mt-2.5 space-y-2">
            {/* Horizontal Y Rotation (Primary for both cabinets & beams) */}
            <div className="flex items-center justify-between gap-1.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-2 py-1.5">
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-amber-200 leading-tight">
                  Poziomo (Y)
                </div>
                <div className="text-[10px] font-mono-num text-zinc-400">
                  {formatDeg(currentRotation[1])}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => handleRotate('y', -angleDeg)}
                  className={rotStepBtn}
                  title={`Obróć w lewo o ${angleDeg}°`}
                >
                  <RotateCcw className="h-3 w-3 text-amber-400" />
                  <span>-{angleDeg}°</span>
                </button>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => handleRotate('y', angleDeg)}
                  className={rotStepBtn}
                  title={`Obróć w prawo o ${angleDeg}°`}
                >
                  <RotateCw className="h-3 w-3 text-amber-400" />
                  <span>+{angleDeg}°</span>
                </button>
              </div>
            </div>

            {/* Pitch X & Roll Z (Ideal for Kantówki / Rafters / Braces) */}
            {!isCabinet && (
              <>
                <div className="flex items-center justify-between gap-1.5 px-1">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-zinc-200 leading-tight">
                      Przód / tył (X)
                    </div>
                    <div className="text-[10px] font-mono-num text-zinc-500">
                      {formatDeg(currentRotation[0])}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => handleRotate('x', -angleDeg)}
                      className={rotStepBtn}
                    >
                      -{angleDeg}°
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => handleRotate('x', angleDeg)}
                      className={rotStepBtn}
                    >
                      +{angleDeg}°
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-1.5 px-1">
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium text-zinc-200 leading-tight">
                      Na bok (Z)
                    </div>
                    <div className="text-[10px] font-mono-num text-zinc-500">
                      {formatDeg(currentRotation[2])}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => handleRotate('z', -angleDeg)}
                      className={rotStepBtn}
                    >
                      -{angleDeg}°
                    </button>
                    <button
                      type="button"
                      disabled={locked}
                      onClick={() => handleRotate('z', angleDeg)}
                      className={rotStepBtn}
                    >
                      +{angleDeg}°
                    </button>
                  </div>
                </div>

                {/* 1-Tap Timber / Kantówka Orientation Presets */}
                {onQuickOrientation && (
                  <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
                      Szybkie ułożenie (kantówka / płyta)
                    </div>
                    <div className="grid grid-cols-3 gap-1">
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => onQuickOrientation('upright')}
                        className="min-h-[34px] rounded-lg border border-white/[0.1] bg-white/[0.05] text-[11px] font-semibold text-zinc-100 hover:bg-amber-500/20 hover:border-amber-400/50 active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 cursor-pointer transition-colors"
                      >
                        Pion 0°
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => onQuickOrientation('flat_x')}
                        className="min-h-[34px] rounded-lg border border-white/[0.1] bg-white/[0.05] text-[11px] font-semibold text-zinc-100 hover:bg-amber-500/20 hover:border-amber-400/50 active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 cursor-pointer transition-colors"
                      >
                        Poziom ↔
                      </button>
                      <button
                        type="button"
                        disabled={locked}
                        onClick={() => onQuickOrientation('flat_z')}
                        className="min-h-[34px] rounded-lg border border-white/[0.1] bg-white/[0.05] text-[11px] font-semibold text-zinc-100 hover:bg-amber-500/20 hover:border-amber-400/50 active:bg-amber-500 active:text-zinc-950 disabled:opacity-30 cursor-pointer transition-colors"
                      >
                        Poziom ↕
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}

      {/* Bottom quick actions: Quick 90° & Lock */}
      <div className="mt-2.5 grid grid-cols-2 gap-1.5 pt-2 border-t border-white/[0.08]">
        <button
          type="button"
          disabled={locked}
          onClick={onRotate90}
          className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] text-xs font-medium text-zinc-200 hover:bg-white/[0.1] disabled:opacity-30 transition-colors cursor-pointer"
        >
          <RotateCw className="h-3.5 w-3.5 text-amber-400" />
          <span>Obróć 90°</span>
        </button>
        <button
          type="button"
          onClick={onToggleLock}
          className={`flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border text-xs font-medium transition-colors cursor-pointer ${
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
