import React, { useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  Camera,
  ChevronDown,
  ChevronUp,
  Crosshair,
  DoorOpen,
  Eye,
  EyeOff,
  FolderOpen,
  Group,
  Layers,
  Lightbulb,
  ListOrdered,
  Magnet,
  Maximize2,
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
  Ungroup,
  Wrench,
  X,
} from 'lucide-react';
import {
  AlignMode,
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
  screwJointsOnly: boolean;
  onToggleScrewJointsOnly: () => void;
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
  ledUnderCabinet: boolean;
  onToggleLedUnderCabinet: () => void;
  measurementsCount: number;
  onClearMeasurements: () => void;
  explodedAmount: number;
  onChangeExploded: (val: number) => void;
  openAmount: number;
  onChangeOpenAmount: (val: number) => void;
  assemblyStep: number;
  onToggleAssemblyMode: () => void;
  lighting: StudioLighting;
  onCycleLighting: () => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onAutoFasteners: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  selectedPartName: string | null;
  selectedCount: number;
  selectedCanUngroup: boolean;
  selectedFastenerLabel: string | null;
  onAlignSelected: (mode: AlignMode) => void;
  onDistributeSelected: (axis: 'x' | 'y' | 'z') => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
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
  photoreal: 'Studio HQ',
};

export const BottomDock: React.FC<BottomDockProps> = ({
  collapsed,
  onToggleCollapse,
  tool,
  onChangeTool,
  activeScrewType,
  onChangeScrewType,
  screwJointsOnly,
  onToggleScrewJointsOnly,
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
  ledUnderCabinet,
  onToggleLedUnderCabinet,
  measurementsCount,
  onClearMeasurements,
  explodedAmount,
  onChangeExploded,
  openAmount,
  onChangeOpenAmount,
  assemblyStep,
  onToggleAssemblyMode,
  lighting,
  onCycleLighting,
  onCameraPreset,
  onAutoFasteners,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  selectedPartName,
  selectedCount,
  selectedCanUngroup,
  selectedFastenerLabel,
  onAlignSelected,
  onDistributeSelected,
  onGroupSelected,
  onUngroupSelected,
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
      ===================================================================== */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        {!mobileMenuOpen &&
          (selectedPartName || selectedFastenerLabel || tool === 'screw' || tool === 'measure') && (
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
              ) : tool === 'measure' ? (
                <>
                  <span className="text-[11px] font-medium text-sky-300 truncate pl-1">
                    Kliknij 2 punkty w 3D, aby zmierzyć odległość
                  </span>
                  {measurementsCount > 0 && (
                    <button
                      type="button"
                      onClick={onClearMeasurements}
                      className="flex min-h-[34px] items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-200 whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Wyczyść ({measurementsCount})</span>
                    </button>
                  )}
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
                    onClick={onToggleScrewJointsOnly}
                    className={`flex min-h-[36px] items-center gap-1 rounded-lg border px-2 text-[11px] font-medium whitespace-nowrap shrink-0 ${
                      screwJointsOnly
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                        : 'border-zinc-700 bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    <span>Styki</span>
                  </button>
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

            {/* Extra mobile CAD tools: Resize + Tape Measure + Rotate */}
            <div className="grid grid-cols-3 gap-1.5">
              {(
                [
                  { id: 'rotate', label: 'Obróć', icon: RotateCw },
                  { id: 'resize', label: 'Rozciągnij', icon: Maximize2 },
                  { id: 'measure', label: 'Miarka 3D', icon: Ruler },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    onChangeTool(id);
                    setMobileMenuOpen(false);
                  }}
                  className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border text-xs font-medium ${
                    tool === id
                      ? 'border-amber-500 bg-amber-500/20 text-amber-300 font-semibold'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Exploded View & Open Doors/Drawers Sliders */}
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-300 whitespace-nowrap w-16">Rozstrzał</span>
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
              <div className="flex items-center gap-3">
                <span className="text-xs text-zinc-300 whitespace-nowrap w-16">Otwórz</span>
                <input
                  type="range"
                  aria-label="Otwórz fronty i wysuń szuflady"
                  min={0}
                  max={1}
                  step={0.02}
                  value={openAmount}
                  onChange={(e) => onChangeOpenAmount(parseFloat(e.target.value))}
                  className="cad-slider flex-1"
                />
                <span className="w-9 text-right text-xs text-zinc-400 font-mono-num">
                  {Math.round(openAmount * 100)}%
                </span>
              </div>
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
                  className="min-h-[38px] rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-200 active:bg-zinc-800"
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
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
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
                onClick={onToggleLedUnderCabinet}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                  ledUnderCabinet
                    ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                }`}
              >
                <Lightbulb className="h-3.5 w-3.5" />
                <span>LED podszaf.: {ledUnderCabinet ? 'Wł.' : 'Wył.'}</span>
              </button>
              <button
                type="button"
                onClick={onCycleSnap}
                className="min-h-[40px] rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 font-mono-num"
              >
                Skok: {snapMm > 0 ? `${snapMm} mm` : 'Wył.'}
              </button>
              <button
                type="button"
                onClick={onToggleXray}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
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
                className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>Światło: {LIGHTING_LABELS[lighting]}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onToggleAssemblyMode();
                  setMobileMenuOpen(false);
                }}
                className={`flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                  assemblyStep > 0
                    ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                }`}
              >
                <ListOrdered className="h-3.5 w-3.5" />
                <span>Montaż krokowy</span>
              </button>
              <button
                type="button"
                onClick={onToggleShowFasteners}
                className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200"
              >
                {showFasteners ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                <span>{showFasteners ? 'Wkręty: Pokaż' : 'Wkręty: Ukryj'}</span>
              </button>
            </div>

            {/* Project Actions */}
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
                <span>Rozkrój/PDF</span>
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

        {/* Mobile Fixed Bottom Thumb Bar */}
        <nav
          aria-label="Narzędzia projektowania"
          className="pointer-events-auto border-t border-zinc-800 bg-[#141518] px-1.5 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
        >
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                { id: 'select', label: 'Zaznacz', icon: MousePointer2 },
                { id: 'move', label: 'Przesuń', icon: Move },
                { id: 'resize', label: 'Rozciągnij', icon: Maximize2 },
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
              <span className="leading-none">Więcej</span>
            </button>
          </div>
        </nav>
      </div>

      {/* =====================================================================
          DESKTOP COLLAPSIBLE CAD DOCK (>= md)
      ===================================================================== */}
      <div
        className="hidden md:block fixed bottom-0 left-1/2 z-30 w-[min(1040px,calc(100vw-24px))] -translate-x-1/2 pb-3 pointer-events-none transition-transform duration-200 ease-out"
        style={{
          transform: collapsed
            ? 'translate(-50%, calc(100% - 34px))'
            : 'translate(-50%, 0)',
        }}
      >
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

        <div className="pointer-events-auto rounded-2xl border border-zinc-800 bg-[#141518]/[0.96] text-zinc-100 shadow-2xl px-3.5 py-2.5">
          {/* Contextual Selection / Tool Helper Banner */}
          {(selectedPartName ||
            selectedFastenerLabel ||
            tool === 'screw' ||
            tool === 'resize' ||
            tool === 'measure') && (
            <div className="mb-2 flex items-center justify-between gap-2 border-b border-zinc-800/90 pb-2 text-xs">
              {selectedFastenerLabel ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate font-medium text-zinc-200">
                    Zaznaczony łącznik: {selectedFastenerLabel}
                  </span>
                </div>
              ) : tool === 'screw' ? (
                <div className="flex items-center gap-2 min-w-0 text-emerald-300/95">
                  <Crosshair className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {screwJointsOnly
                      ? 'Zielone pasy pokazują miejsca styku z drugą płytą — kliknij w zieloną strefę, aby wkręcić'
                      : 'Tryb dowolny — kursor pokazuje na żywo na zielono/czerwono czy wkręt trafia w drugą płytę'}
                  </span>
                </div>
              ) : tool === 'measure' ? (
                <div className="flex items-center gap-2 min-w-0 text-sky-300">
                  <Ruler className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Miarka 3D: kliknij pierwszy i drugi punkt (przyciąga do narożników płyt), aby zmierzyć dystans w mm
                  </span>
                </div>
              ) : tool === 'resize' ? (
                <div className="flex items-center gap-2 min-w-0 text-amber-300">
                  <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    {selectedPartName
                      ? `Rozciąganie: ${selectedPartName} — złap pomarańczowy uchwyt na ścianie płyty i przeciągnij`
                      : 'Kliknij płytę w 3D, aby rozciągać ją za dowolną ściankę'}
                  </span>
                </div>
              ) : selectedCount >= 2 ? (
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <span className="font-semibold text-amber-300 whitespace-nowrap mr-1">
                    {selectedCount} elem.:
                  </span>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('left')}
                    title="Wyrównaj do lewej krawędzi"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    <AlignStartVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('centerX')}
                    title="Wyśrodkuj w poziomie (X)"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    <AlignCenterHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('right')}
                    title="Wyrównaj do prawej krawędzi"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    <AlignEndVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('bottom')}
                    title="Wyrównaj do dołu"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    <AlignEndHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('top')}
                    title="Wyrównaj do góry"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    <AlignStartHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('front')}
                    title="Wyrównaj lico do przodu (+Z)"
                    className="h-7 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 text-[11px] font-medium text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    Lico
                  </button>
                  {selectedCount >= 3 && (
                    <>
                      <span className="mx-0.5 h-4 w-px bg-zinc-800" />
                      <button
                        type="button"
                        onClick={() => onDistributeSelected('x')}
                        title="Rozmieść równomiernie w poziomie (X)"
                        className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 text-[11px] text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                      >
                        <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
                        <span>X</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDistributeSelected('y')}
                        title="Rozmieść równomiernie w pionie (Y)"
                        className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 text-[11px] text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                      >
                        <AlignVerticalDistributeCenter className="h-3.5 w-3.5" />
                        <span>Y</span>
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-medium text-zinc-200">
                    {selectedPartName}
                  </span>
                </div>
              )}

              <div className="flex items-center gap-1.5 shrink-0">
                {tool === 'measure' && measurementsCount > 0 ? (
                  <button
                    type="button"
                    onClick={onClearMeasurements}
                    className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-200 hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>Wyczyść pomiary ({measurementsCount})</span>
                  </button>
                ) : selectedFastenerLabel ? (
                  <button
                    type="button"
                    onClick={onDeleteSelectedFastener}
                    className="flex items-center gap-1 rounded-lg bg-red-600/20 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-600/35 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Usuń łącznik</span>
                  </button>
                ) : (
                  <>
                    {selectedCount >= 2 && (
                      <button
                        type="button"
                        onClick={onGroupSelected}
                        className="flex items-center gap-1 rounded-lg border border-sky-500/50 bg-sky-500/15 px-2.5 py-1 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title="Połącz zaznaczone elementy w jedną grupę (Smart Resize i wspólne przesuwanie)"
                      >
                        <Group className="h-3.5 w-3.5" />
                        <span>Grupuj</span>
                      </button>
                    )}
                    {selectedCanUngroup && (
                      <button
                        type="button"
                        onClick={onUngroupSelected}
                        className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                        title="Rozdziel elementy z grupy"
                      >
                        <Ungroup className="h-3.5 w-3.5" />
                        <span>Rozgrupuj</span>
                      </button>
                    )}
                    {selectedPartName && (
                      <button
                        type="button"
                        onClick={onOpenInspector}
                        className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                      >
                        <SlidersHorizontal className="h-3.5 w-3.5" />
                        <span>Właściwości</span>
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Row 1: Core CAD Tools + Snap / Screw Selector + Undo/Redo */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-0.5 rounded-xl bg-zinc-900 p-1 border border-zinc-800">
              {(
                [
                  { id: 'select', label: 'Zaznacz', icon: MousePointer2, title: 'Zaznacz (V)' },
                  { id: 'move', label: 'Przesuń', icon: Move, title: 'Przesuń (G)' },
                  { id: 'rotate', label: 'Obróć', icon: RotateCw, title: 'Obróć (R)' },
                  { id: 'resize', label: 'Rozciągnij', icon: Maximize2, title: 'Rozciągnij ścianki 3D (S)' },
                  { id: 'screw', label: 'Wkręty', icon: Wrench, title: 'Wkręty i Minifix (W)' },
                  { id: 'measure', label: 'Miarka 3D', icon: Ruler, title: 'Pomiar punkt-punkt 3D (T)' },
                ] as const
              ).map(({ id, label, icon: Icon, title }) => {
                const active = tool === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onChangeTool(id)}
                    title={title}
                    className={`flex min-h-[36px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
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
                  className="min-h-[36px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs font-medium text-zinc-100 focus:border-amber-500 focus:outline-none cursor-pointer"
                >
                  {SCREW_CATALOG.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.shortName}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onToggleScrewJointsOnly}
                  className={`flex min-h-[36px] items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    screwJointsOnly
                      ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                  }`}
                  title="Blokuj wkręcanie w puste miejsca"
                >
                  <Magnet className="h-3.5 w-3.5" />
                  <span>Styki</span>
                </button>
                <button
                  type="button"
                  onClick={onAutoFasteners}
                  className="flex min-h-[36px] items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  <span>Auto</span>
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleMagneticSnap}
                  className={`flex min-h-[36px] items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    magneticSnap
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                  }`}
                  title="Przyciąganie magnetyczne do krawędzi sąsiednich płyt (M)"
                >
                  <Magnet className="h-3.5 w-3.5" />
                  <span>Magnes</span>
                </button>
                <button
                  type="button"
                  onClick={onToggleShowDimensions}
                  className={`flex min-h-[36px] items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    showDimensions
                      ? 'border-sky-500/60 bg-sky-500/15 text-sky-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                  }`}
                  title="Pokaż prześwity w świetle (D)"
                >
                  <Ruler className="h-3.5 w-3.5" />
                  <span>Prześwit</span>
                </button>
                <button
                  type="button"
                  onClick={onCycleSnap}
                  className="min-h-[36px] rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-xs font-medium text-zinc-300 hover:border-zinc-700 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer font-mono-num"
                  title="Skok przyciągania do siatki"
                >
                  {snapMm > 0 ? `${snapMm}mm` : 'Bez siatki'}
                </button>
                <button
                  type="button"
                  onClick={onToggleXray}
                  className={`flex min-h-[36px] items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    xrayMode
                      ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                  }`}
                  title="Tryb RTG (X)"
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
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onRedo}
                disabled={!canRedo}
                aria-label="Ponów"
                title="Ponów (Ctrl+Y)"
                className="flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <Redo2 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Row 2: Exploded View, Open Doors/Drawers, Camera Presets, Assembly Guide, Lighting & LED */}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-zinc-800/80 pt-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex items-center gap-1.5 w-[155px] shrink-0">
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
                <span className="w-7 text-right text-[10px] text-zinc-400 font-mono-num">
                  {Math.round(explodedAmount * 100)}%
                </span>
              </div>

              <div className="flex items-center gap-1.5 w-[150px] shrink-0">
                <button
                  type="button"
                  onClick={() => onChangeOpenAmount(openAmount > 0.1 ? 0 : 1)}
                  className={`flex items-center gap-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    openAmount > 0.05 ? 'text-amber-300' : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                  title="Otwórz/zamknij fronty i wysuń szuflady (klawisz O)"
                >
                  <DoorOpen className="h-3.5 w-3.5" />
                  <span>Otwórz</span>
                </button>
                <input
                  type="range"
                  aria-label="Otwórz fronty i wysuń szuflady"
                  min={0}
                  max={1}
                  step={0.02}
                  value={openAmount}
                  onChange={(e) => onChangeOpenAmount(parseFloat(e.target.value))}
                  className="cad-slider w-full"
                />
              </div>
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
                  className="min-h-[32px] rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {cam.label}
                </button>
              ))}

              <span className="mx-0.5 h-4 w-px bg-zinc-800" aria-hidden="true" />

              <button
                type="button"
                onClick={onToggleAssemblyMode}
                className={`flex min-h-[32px] items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  assemblyStep > 0
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
                }`}
                title="Instrukcja montażu krok po kroku (1–5)"
              >
                <ListOrdered className="h-3.5 w-3.5" />
                <span>Montaż</span>
              </button>

              <button
                type="button"
                onClick={onCycleLighting}
                className="flex min-h-[32px] items-center gap-1 rounded-md px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Zmień oświetlenie studia 3D (Dzień / Studio / Ciepłe / Studio HQ)"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>{LIGHTING_LABELS[lighting]}</span>
              </button>

              <button
                type="button"
                onClick={onToggleLedUnderCabinet}
                className={`flex min-h-[32px] items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  ledUnderCabinet
                    ? 'bg-amber-500/20 text-amber-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
                title="Włącz/wyłącz ciepłe podświetlenie LED pod szafkami i półkami (klawisz L)"
              >
                <Lightbulb className="h-3.5 w-3.5" />
                <span>LED</span>
              </button>

              <button
                type="button"
                onClick={onToggleShowFasteners}
                className={`flex min-h-[32px] items-center gap-1 rounded-md px-2 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
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
