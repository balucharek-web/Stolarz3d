import React, { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Crosshair,
  Eye,
  EyeOff,
  FolderOpen,
  Layers,
  Magnet,
  Move,
  MousePointer2,
  Redo2,
  RotateCw,
  Ruler,
  Scissors,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Trash2,
  Undo2,
  Wrench,
  X,
} from 'lucide-react';
import {
  CameraPreset,
  EditorTool,
  SCREW_CATALOG,
  ScrewType,
  StudioLighting,
} from '../types/furniture';

interface BottomDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  tool: EditorTool;
  onChangeTool: (tool: EditorTool) => void;
  activeScrewType: ScrewType;
  onChangeScrewType: (type: ScrewType) => void;
  snapMm: number;
  onCycleSnap: () => void;
  magneticSnap: boolean;
  onToggleMagneticSnap: () => void;
  showDimensions: boolean;
  onToggleShowDimensions: () => void;
  xrayMode: boolean;
  onToggleXray: () => void;
  showFasteners: boolean;
  onToggleShowFasteners: () => void;
  explodedAmount: number;
  onChangeExploded: (val: number) => void;
  lighting: StudioLighting;
  onCycleLighting: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onAutoFasteners: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectedPartName: string | null;
  selectedFastenerLabel: string | null;
  onOpenInspector: () => void;
  onDeleteSelectedFastener: () => void;
  onOpenTemplates: () => void;
  onOpenPartsList: () => void;
  onOpenCutList: () => void;
  onSnapshot: () => void;
}

const LIGHTING_LABELS: Record<StudioLighting, string> = {
  daylight: 'Dzień',
  studio: 'Studio',
  warm: 'Ciepłe',
};

export const BottomDock: React.FC<BottomDockProps> = ({
  collapsed,
  onToggleCollapse,
  tool,
  onChangeTool,
  activeScrewType,
  onChangeScrewType,
  snapMm,
  onCycleSnap,
  magneticSnap,
  onToggleMagneticSnap,
  showDimensions,
  onToggleShowDimensions,
  xrayMode,
  onToggleXray,
  showFasteners,
  onToggleShowFasteners,
  explodedAmount,
  onChangeExploded,
  lighting,
  onCycleLighting,
  onCameraPreset,
  onAutoFasteners,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedPartName,
  selectedFastenerLabel,
  onOpenInspector,
  onDeleteSelectedFastener,
  onOpenTemplates,
  onOpenPartsList,
  onOpenCutList,
  onSnapshot,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <>
      {/* =====================================================================
          MOBILE-FIRST THUMB DOCK (< md): Slim, thumb-zone ergonomic bar
          Keeps >= 85% of smartphone screen completely unobstructed for 3D
      ===================================================================== */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        {/* Contextual single-row action strip above mobile bar when needed */}
        {!mobileMenuOpen && (selectedPartName || selectedFastenerLabel || tool === 'screw') && (
          <div className="mx-2 mb-1.5 pointer-events-auto flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-[#141518]/[0.96] px-2.5 py-1.5 text-zinc-100 shadow-lg">
            {selectedFastenerLabel ? (
              <>
                <span className="text-[11px] font-medium text-zinc-200 truncate">
                  {selectedFastenerLabel}
                </span>
                <button
                  type="button"
                  onClick={onDeleteSelectedFastener}
                  className="flex min-h-[36px] items-center gap-1 rounded-lg bg-red-600/25 px-3 text-xs font-medium text-red-200 active:bg-red-600/40 whitespace-nowrap shrink-0"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>Usuń</span>
                </button>
              </>
            ) : tool === 'screw' ? (
              <>
                <select
                  aria-label="Rodzaj wkrętu"
                  value={activeScrewType}
                  onChange={(e) => onChangeScrewType(e.target.value as ScrewType)}
                  className="min-h-[36px] min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs font-medium text-zinc-100 focus:border-amber-500 focus:outline-none"
                >
                  {SCREW_CATALOG.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shortName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onAutoFasteners}
                  className="flex min-h-[36px] items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 text-xs font-medium text-amber-300 active:bg-amber-500/25 whitespace-nowrap shrink-0"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto</span>
                </button>
                <button
                  type="button"
                  onClick={onUndo}
                  disabled={!canUndo}
                  aria-label="Cofnij wkręt"
                  className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 disabled:opacity-35 shrink-0"
                >
                  <Undo2 className="h-4 w-4" />
                </button>
              </>
            ) : (
              <>
                <span className="text-xs font-medium text-zinc-200 truncate pl-1">
                  {selectedPartName}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={onUndo}
                    disabled={!canUndo}
                    aria-label="Cofnij"
                    className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 disabled:opacity-35"
                  >
                    <Undo2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={onOpenInspector}
                    className="flex min-h-[36px] items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-zinc-950 active:bg-amber-400 whitespace-nowrap"
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                    <span>Edytuj</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Mobile "Widok i Opcje" Slide-Up Popover Sheet */}
        {mobileMenuOpen && (
          <div className="mx-2 mb-1.5 pointer-events-auto rounded-2xl border border-zinc-800 bg-[#141518] p-3.5 text-zinc-100 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-semibold text-white">Widok 3D i narzędzia</span>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 active:bg-zinc-800"
                aria-label="Zamknij menu widoku"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Exploded View Slider */}
            <div className="flex items-center gap-3">
              <span className="text-xs text-zinc-300 whitespace-nowrap">Rozstrzał</span>
              <input
                type="range"
                aria-label="Widok rozstrzelony"
                min={0}
                max={1}
                step={0.02}
                value={explodedAmount}
                onChange={(e) => onChangeExploded(parseFloat(e.target.value))}
                className="cad-slider flex-1"
              />
              <span className="w-9 text-right text-xs text-zinc-400 font-mono-num">
                {Math.round(explodedAmount * 100)}%
              </span>
            </div>

            {/* Camera Views */}
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { id: 'iso', label: '3D' },
                  { id: 'front', label: 'Przód' },
                  { id: 'side', label: 'Bok' },
                  { id: 'top', label: 'Góra' },
                ] as const
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => {
                    onCameraPreset(cam.id);
                    setMobileMenuOpen(false);
                  }}
                  className="min-h-[40px] rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-200 active:bg-zinc-800"
                >
                  {cam.label}
                </button>
              ))}
            </div>

            {/* Visual & Precision Toggles */}
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onToggleMagneticSnap}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                  magneticSnap
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                }`}
              >
                <Magnet className="h-3.5 w-3.5" />
                <span>Magnes: {magneticSnap ? 'Wł.' : 'Wył.'}</span>
              </button>
              <button
                type="button"
                onClick={onToggleShowDimensions}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                  showDimensions
                    ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                }`}
              >
                <Ruler className="h-3.5 w-3.5" />
                <span>Prześwity: {showDimensions ? 'Wł.' : 'Wył.'}</span>
              </button>
              <button
                type="button"
                onClick={onCycleSnap}
                className="min-h-[42px] rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 font-mono-num"
              >
                Skok: {snapMm > 0 ? `${snapMm} mm` : 'Wył.'}
              </button>
              <button
                type="button"
                onClick={onToggleXray}
                className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                  xrayMode
                    ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Tryb RTG</span>
              </button>
              <button
                type="button"
                onClick={onCycleLighting}
                className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>Światło: {LIGHTING_LABELS[lighting]}</span>
              </button>
              <button
                type="button"
                onClick={onToggleShowFasteners}
                className="flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200"
              >
                {showFasteners ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>{showFasteners ? 'Wkręty: Pokaż' : 'Wkręty: Ukryj'}</span>
              </button>
            </div>

            {/* Project Actions + Undo/Redo */}
            <div className="grid grid-cols-4 gap-1.5 border-t border-zinc-800 pt-2.5">
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenTemplates();
                }}
                className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-900 text-[10px] font-medium text-zinc-200 active:bg-zinc-800"
              >
                <FolderOpen className="h-4 w-4 text-amber-400" />
                <span>Szablony</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenPartsList();
                }}
                className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-900 text-[10px] font-medium text-zinc-200 active:bg-zinc-800"
              >
                <Layers className="h-4 w-4 text-amber-400" />
                <span>Elementy</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenCutList();
                }}
                className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-900 text-[10px] font-medium text-zinc-200 active:bg-zinc-800"
              >
                <Scissors className="h-4 w-4 text-amber-400" />
                <span>Rozkrój</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onSnapshot();
                }}
                className="flex min-h-[44px] flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-900 text-[10px] font-medium text-zinc-200 active:bg-zinc-800"
              >
                <Camera className="h-4 w-4 text-amber-400" />
                <span>Zdjęcie</span>
              </button>
            </div>
          </div>
        )}

        {/* Mobile Fixed Bottom Thumb Bar (5 generous >=44px targets + iOS/Android safe-area padding) */}
        <nav
          aria-label="Narzędzia projektowania"
          className="pointer-events-auto border-t border-zinc-800 bg-[#141518] px-1.5 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
        >
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                { id: 'select', label: 'Zaznacz', icon: MousePointer2 },
                { id: 'move', label: 'Przesuń', icon: Move },
                { id: 'rotate', label: 'Obróć', icon: RotateCw },
                { id: 'screw', label: 'Wkręty', icon: Wrench },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = tool === id && !mobileMenuOpen;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    onChangeTool(id);
                  }}
                  className={`flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors ${
                    active
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-300 active:bg-zinc-800'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="leading-none">{label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className={`flex min-h-[46px] flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium transition-colors ${
                mobileMenuOpen
                  ? 'bg-zinc-800 text-amber-400 font-semibold'
                  : 'text-zinc-300 active:bg-zinc-800'
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              <span className="leading-none">Widok</span>
            </button>
          </div>
        </nav>
      </div>

      {/* =====================================================================
          DESKTOP COLLAPSIBLE CAD DOCK (>= md)
      ===================================================================== */}
      <div
        className="hidden md:block fixed bottom-0 left-1/2 z-30 w-[min(960px,calc(100vw-24px))] -translate-x-1/2 pb-3 pointer-events-none transition-transform duration-200 ease-out"
        style={{
          transform: collapsed
            ? 'translate(-50%, calc(100% - 34px))'
            : 'translate(-50%, 0)',
        }}
      >
        {/* Centered Collapse / Expand Handle */}
        <div className="flex justify-center pointer-events-auto">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 rounded-t-lg border border-b-0 border-zinc-700/80 bg-[#141518] px-3.5 py-1 text-xs font-medium text-zinc-300 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Pokaż lub ukryj panel narzędzi (klawisz H)"
          >
            {collapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 text-amber-400" />
                <span>Narzędzia</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                <span>Ukryj panel</span>
              </>
            )}
          </button>
        </div>

        {/* Main Desktop Dock Container */}
        <div className="pointer-events-auto rounded-2xl border border-zinc-800 bg-[#141518]/[0.96] text-zinc-100 shadow-2xl px-3.5 py-2.5">
          {/* Contextual Selection / Screw Mode Helper Banner */}
          {(selectedPartName || selectedFastenerLabel || tool === 'screw') && (
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-800/90 pb-2 text-xs">
              {selectedFastenerLabel ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate font-medium text-zinc-200">
                    Zaznaczony łącznik: {selectedFastenerLabel}
                  </span>
                </div>
              ) : tool === 'screw' ? (
                <div className="flex items-center gap-2 min-w-0 text-amber-300/95">
                  <Crosshair className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Kliknij dowolną ściankę płyty, aby wkręcić łącznik prostopadle do powierzchni
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium text-zinc-200">
                    {selectedPartName}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5 shrink-0">
                {selectedFastenerLabel ? (
                  <button
                    type="button"
                    onClick={onDeleteSelectedFastener}
                    className="flex items-center gap-1 rounded-lg bg-red-600/20 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-600/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Usuń łącznik</span>
                  </button>
                ) : (
                  selectedPartName && (
                    <button
                      type="button"
                      onClick={onOpenInspector}
                      className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span>Właściwości</span>
                    </button>
                  )
                )}
              </div>
            </div>
          )}

          {/* Row 1: Core CAD Tools + Snap / Screw Selector + Undo/Redo */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-0.5 rounded-xl bg-zinc-900 p-1 border border-zinc-800">
              {(
                [
                  { id: 'select', label: 'Zaznacz', icon: MousePointer2 },
                  { id: 'move', label: 'Przesuń', icon: Move },
                  { id: 'rotate', label: 'Obróć', icon: RotateCw },
                  { id: 'screw', label: 'Wkręty', icon: Wrench },
                ] as const
              ).map(({ id, label, icon: Icon }) => {
                const active = tool === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChangeTool(id)}
                    className={`flex min-h-[38px] items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>

            {tool === 'screw' ? (
              <div className="flex items-center gap-1.5">
                <select
                  aria-label="Rodzaj wkrętu"
                  value={activeScrewType}
                  onChange={(e) => onChangeScrewType(e.target.value as ScrewType)}
                  className="min-h-[38px] rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-100 focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {SCREW_CATALOG.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shortName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onAutoFasteners}
                  className="flex min-h-[38px] items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  title="Automatycznie wyznacz wkręty w miejscach styku płyt"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto-wkręty</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={onToggleMagneticSnap}
                  className={`flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    magneticSnap
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                  }`}
                  title="Przyciąganie magnetyczne do krawędzi sąsiednich płyt i podłogi"
                >
                  <Magnet className="h-3.5 w-3.5" />
                  <span>Magnes</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleShowDimensions}
                  className={`flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showDimensions
                      ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                  }`}
                  title="Pokaż prześwity w świetle (wymiary 3D między płytami)"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  <span>Miarka</span>
                </button>
                <button
                  type="button"
                  onClick={onCycleSnap}
                  className="min-h-[38px] rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer font-mono-num"
                  title="Skok przyciągania do siatki"
                >
                  Skok: {snapMm > 0 ? `${snapMm} mm` : 'Wył.'}
                </button>
                <button
                  type="button"
                  onClick={onToggleXray}
                  className={`flex min-h-[38px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    xrayMode
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                  }`}
                  title="Tryb RTG (przezroczyste płyty — podgląd wkrętów wewnątrz)"
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>RTG</span>
                </button>
              </div>
            )}

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={onUndo}
                disabled={!canUndo}
                aria-label="Cofnij"
                title="Cofnij (Ctrl+Z)"
                className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label="Ponów"
                title="Ponów (Ctrl+Y)"
                className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Row 2: Exploded View, Camera Presets & Lighting */}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
            <div className="flex items-center gap-2 min-w-[180px] flex-1 max-w-[260px]">
              <span className="text-[11px] font-medium text-zinc-400 whitespace-nowrap">
                Rozstrzał
              </span>
              <input
                type="range"
                aria-label="Widok rozstrzelony"
                min={0}
                max={1}
                step={0.02}
                value={explodedAmount}
                onChange={(e) => onChangeExploded(parseFloat(e.target.value))}
                className="cad-slider w-full"
              />
              <span className="w-8 text-right text-[11px] text-zinc-400 font-mono-num">
                {Math.round(explodedAmount * 100)}%
              </span>
            </div>

            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'iso', label: '3D' },
                  { id: 'front', label: 'Przód' },
                  { id: 'side', label: 'Bok' },
                  { id: 'top', label: 'Góra' },
                ] as const
              ).map((cam) => (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => onCameraPreset(cam.id)}
                  className="min-h-[34px] rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {cam.label}
                </button>
              ))}

              <span className="mx-0.5 h-4 w-px bg-zinc-800" aria-hidden="true" />

              <button
                type="button"
                onClick={onCycleLighting}
                className="flex min-h-[34px] items-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Zmień oświetlenie studia 3D"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>{LIGHTING_LABELS[lighting]}</span>
              </button>

              <button
                type="button"
                onClick={onToggleShowFasteners}
                className={`flex min-h-[34px] items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  showFasteners
                    ? 'text-zinc-200 hover:bg-zinc-800'
                    : 'text-zinc-500 hover:bg-zinc-800'
                }`}
                title={showFasteners ? 'Ukryj wkręty' : 'Pokaż wkręty'}
              >
                {showFasteners ? (
                  <Eye className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                <span>Wkręty</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
