import React, { useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDownToLine,
  Boxes,
  Camera,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Copy,
  Crosshair,
  DoorOpen,
  Eye,
  EyeOff,
  FolderOpen,
  Gamepad2,
  Group,
  HelpCircle,
  Layers,
  LayoutPanelTop,
  Lightbulb,
  ListOrdered,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  Palette,
  PenTool,
  Redo2,
  RotateCw,
  Ruler,
  Scissors,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
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
import type { CarpentryJoinMode } from '../engine/carpentry';

export type UiMode = 'simple' | 'expert';
export type SelectionScope = 'group' | 'part';
type MobileSheetTab = 'tools' | 'view' | 'project';

interface BottomDockProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
  uiMode: UiMode;
  onChangeUiMode: (mode: UiMode) => void;
  selectionScope: SelectionScope;
  onToggleSelectionScope: () => void;
  activeGroupEditLabel: string | null;
  onExitGroupEdit: () => void;
  selectedInGroup: boolean;
  onSelectWholeGroup: () => void;
  onEnterSinglePartEdit: () => void;
  nudgePadOpen: boolean;
  onToggleNudgePad: () => void;
  multiSelectMode?: boolean;
  onToggleMultiSelectMode?: () => void;
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
  selectedCabinetName?: string | null;
  selectedCount: number;
  selectedCanUngroup: boolean;
  canEditParametricCabinet?: boolean;
  latestMeasurementLabel?: string | null;
  selectedFastenerLabel: string | null;
  onAlignSelected: (mode: AlignMode) => void;
  onJoinSelected?: (mode: CarpentryJoinMode) => void;
  onDistributeSelected: (axis: 'x' | 'y' | 'z') => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onOpenInspector: () => void;
  onEditParametricCabinet?: () => void;
  onRotateSelected90?: () => void;
  onRotateAxis?: (axis: 'x' | 'y' | 'z', deltaDeg: number) => void;
  onQuickOrientation?: (preset: 'upright' | 'flat_x' | 'flat_z') => void;
  onDuplicateSelected?: () => void;
  onDropSelectedToFloor?: () => void;
  onDeleteSelected?: () => void;
  onDeleteSelectedFastener: () => void;
  onOpenProjects: () => void;
  onOpenTemplates: () => void;
  onOpenPartsList: () => void;
  onOpenMaterials: () => void;
  onOpenCabinetBuilder: () => void;
  onOpenCutList: () => void;
  onOpenSketch2D?: () => void;
  onOpenShortcuts?: () => void;
  onOpenCommandPalette?: () => void;
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
  uiMode,
  onChangeUiMode,
  selectionScope,
  onToggleSelectionScope,
  activeGroupEditLabel,
  onExitGroupEdit,
  selectedInGroup,
  onSelectWholeGroup,
  onEnterSinglePartEdit,
  nudgePadOpen,
  onToggleNudgePad,
  multiSelectMode = false,
  onToggleMultiSelectMode,
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
  selectedCabinetName = null,
  selectedCount,
  selectedCanUngroup,
  canEditParametricCabinet = false,
  latestMeasurementLabel = null,
  selectedFastenerLabel,
  onAlignSelected,
  onJoinSelected,
  onDistributeSelected,
  onGroupSelected,
  onUngroupSelected,
  onOpenInspector,
  onEditParametricCabinet,
  onRotateSelected90,
  onRotateAxis,
  onQuickOrientation,
  onDuplicateSelected,
  onDropSelectedToFloor,
  onDeleteSelected,
  onDeleteSelectedFastener,
  onOpenProjects,
  onOpenTemplates,
  onOpenPartsList,
  onOpenMaterials,
  onOpenCabinetBuilder,
  onOpenCutList,
  onOpenSketch2D,
  onOpenShortcuts,
  onOpenCommandPalette,
  onSnapshot,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileTab, setMobileTab] = useState<MobileSheetTab>('tools');

  const isExpert = uiMode === 'expert';

  const desktopRailTools: Array<{
    id: EditorTool;
    label: string;
    shortcut: string;
    icon: React.ComponentType<{ className?: string }>;
    expertOnly?: boolean;
  }> = [
    { id: 'select', label: 'Zaznacz', shortcut: 'V', icon: MousePointer2 },
    { id: 'move', label: 'Przesuń', shortcut: 'G', icon: Move },
    { id: 'rotate', label: 'Obróć', shortcut: 'R', icon: RotateCw },
    { id: 'resize', label: 'Rozciągnij', shortcut: 'S', icon: Maximize2 },
    { id: 'screw', label: 'Wkręty', shortcut: 'W', icon: Wrench, expertOnly: true },
    { id: 'measure', label: 'Miarka 3D', shortcut: 'T', icon: Ruler, expertOnly: true },
  ];

  const visibleRailTools = desktopRailTools.filter((t) => isExpert || !t.expertOnly);

  const showContextStrip = Boolean(
    selectedPartName ||
      selectedFastenerLabel ||
      activeGroupEditLabel ||
      tool === 'screw' ||
      tool === 'resize' ||
      tool === 'rotate' ||
      tool === 'measure'
  );

  const ctxBtn =
    'flex h-7 items-center gap-1 rounded-lg border border-white/[0.08] bg-white/[0.04] px-2 text-xs font-medium text-zinc-200 hover:bg-white/[0.1] hover:text-white transition-colors whitespace-nowrap cursor-pointer';

  const alignBtn =
    'flex h-7 w-7 items-center justify-center rounded-lg border border-white/[0.08] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.1] hover:text-white transition-colors cursor-pointer';

  return (
    <>
      {/* =====================================================================
          DESKTOP LEFT VERTICAL CAD TOOL RAIL (>= md)
      ===================================================================== */}
      <aside
        aria-label="Narzędzia CAD"
        className="hidden md:flex studio-glass fixed left-3.5 top-1/2 -translate-y-1/2 z-30 flex-col items-center gap-1 rounded-2xl p-1.5"
      >
        {visibleRailTools.map(({ id, label, shortcut, icon: Icon }) => {
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChangeTool(id)}
              aria-label={`${label} (${shortcut})`}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all cursor-pointer ${
                active
                  ? 'bg-amber-500 text-zinc-950 shadow-[0_2px_12px_rgba(245,158,11,0.35)]'
                  : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
              {/* Floating Tooltip + Shortcut Keycap */}
              <span
                role="tooltip"
                className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#101216]/95 px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-xl whitespace-nowrap"
              >
                <span>{label}</span>
                <kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[10px] font-mono-num text-zinc-400">
                  {shortcut}
                </kbd>
              </span>
            </button>
          );
        })}

        {onToggleMultiSelectMode && (
          <button
            type="button"
            onClick={onToggleMultiSelectMode}
            aria-label="Zaznacz wiele elementów (Shift + klik)"
            className={`group relative flex h-10 w-10 flex-col items-center justify-center rounded-xl transition-all cursor-pointer ${
              multiSelectMode
                ? 'bg-sky-500 text-zinc-950 shadow-[0_2px_12px_rgba(14,165,233,0.4)]'
                : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            <span className="text-[8px] font-semibold leading-none mt-0.5">Wiele</span>
            {selectedCount > 1 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-bold text-zinc-950 font-mono-num shadow">
                {selectedCount}
              </span>
            )}
            <span
              role="tooltip"
              className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#101216]/95 px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-xl whitespace-nowrap"
            >
              <span>Zaznacz wiele (łącz elementy)</span>
              <kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[10px] font-mono-num text-zinc-400">
                Shift+Klik
              </kbd>
            </span>
          </button>
        )}

        {isExpert && (
          <>
            <div className="my-1 h-px w-6 bg-white/[0.08]" />

            {/* SketchUp-Style Group vs Single Part Selection Toggle (Expert CAD only) */}
            <button
              type="button"
              onClick={onToggleSelectionScope}
              aria-label="Przełącz tryb zaznaczania szafka lub pojedyncza płyta"
              className={`group relative flex h-10 w-10 flex-col items-center justify-center rounded-xl transition-all cursor-pointer ${
                selectionScope === 'group'
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-400/30'
                  : 'text-zinc-300 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              {selectionScope === 'group' ? (
                <Boxes className="h-4 w-4" />
              ) : (
                <Square className="h-4 w-4" />
              )}
              <span className="text-[8px] font-semibold leading-none mt-0.5">
                {selectionScope === 'group' ? 'Moduł' : 'Płyta'}
              </span>
              <span
                role="tooltip"
                className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 rounded-lg border border-white/[0.1] bg-[#101216]/95 px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-xl whitespace-nowrap"
              >
                {selectionScope === 'group'
                  ? 'Klik zaznacza całą szafkę jako 1 element'
                  : 'Tryb CNC: klik zaznacza pojedynczą płytę'}
              </span>
            </button>
          </>
        )}

        <div className="my-1 h-px w-6 bg-white/[0.08]" />

        {/* Undo / Redo */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label="Cofnij"
          className="group relative flex h-9 w-10 items-center justify-center rounded-xl text-zinc-300 hover:bg-white/[0.08] hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Undo2 className="h-4 w-4" />
          <span
            role="tooltip"
            className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#101216]/95 px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-xl whitespace-nowrap"
          >
            <span>Cofnij</span>
            <kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[10px] font-mono-num text-zinc-400">
              Ctrl+Z
            </kbd>
          </span>
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label="Ponów"
          className="group relative flex h-9 w-10 items-center justify-center rounded-xl text-zinc-300 hover:bg-white/[0.08] hover:text-white disabled:opacity-25 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Redo2 className="h-4 w-4" />
          <span
            role="tooltip"
            className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 -translate-y-1/2 -translate-x-1 opacity-0 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-150 flex items-center gap-1.5 rounded-lg border border-white/[0.1] bg-[#101216]/95 px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-xl whitespace-nowrap"
          >
            <span>Ponów</span>
            <kbd className="rounded bg-white/[0.08] px-1 py-0.5 text-[10px] font-mono-num text-zinc-400">
              Ctrl+Y
            </kbd>
          </span>
        </button>
      </aside>

      {/* =====================================================================
          MOBILE-FIRST THUMB DOCK & 3-TAB SHEET (< md)
      ===================================================================== */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        {/* Contextual Selection / Group-Drill / Rotate Bar above mobile nav */}
        {!mobileMenuOpen &&
          (selectedPartName ||
            selectedFastenerLabel ||
            activeGroupEditLabel ||
            tool === 'screw' ||
            tool === 'rotate' ||
            tool === 'measure') && (
            <div className="studio-glass animate-studio-pop mx-2.5 mb-2 pointer-events-auto flex items-center justify-between gap-1.5 rounded-2xl px-2.5 py-1.5 text-zinc-100">
              {selectedFastenerLabel ? (
                <>
                  <span className="text-xs font-medium text-zinc-200 truncate pl-1">
                    {selectedFastenerLabel}
                  </span>
                  <button
                    type="button"
                    onClick={onDeleteSelectedFastener}
                    className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-500/20 px-3 text-xs font-medium text-red-200 active:bg-red-500/35 whitespace-nowrap shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Usuń</span>
                  </button>
                </>
              ) : tool === 'measure' ? (
                <>
                  <span className="text-xs font-medium text-sky-300 truncate pl-1 font-mono-num">
                    {latestMeasurementLabel
                      ? `Pomiar: ${latestMeasurementLabel}`
                      : 'Tapnij 2 punkty w 3D, aby zmierzyć'}
                  </span>
                  {measurementsCount > 0 && (
                    <button
                      type="button"
                      onClick={onClearMeasurements}
                      className="flex min-h-[36px] items-center gap-1 rounded-xl border border-white/[0.1] bg-white/[0.06] px-2.5 text-xs text-zinc-200 whitespace-nowrap shrink-0"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Wyczyść ({measurementsCount})</span>
                    </button>
                  )}
                </>
              ) : tool === 'rotate' && !selectedPartName ? (
                <span className="text-xs font-medium text-amber-300 truncate pl-1 py-1.5">
                  Obrót 3D: tapnij szafkę lub kantówkę, aby ją obrócić
                </span>
              ) : tool === 'rotate' && selectedPartName && onRotateAxis ? (
                <div className="w-full space-y-1.5 py-0.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-semibold text-amber-300 truncate pl-0.5">
                      Obrót: {selectedCabinetName || (selectedCount > 1 ? `Grupa (${selectedCount})` : selectedPartName)}
                    </span>
                    <button
                      type="button"
                      onClick={onToggleNudgePad}
                      className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-[11px] font-semibold shrink-0 ${
                        nudgePadOpen
                          ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                          : 'border-white/[0.12] bg-white/[0.06] text-zinc-100'
                      }`}
                    >
                      <Gamepad2 className="h-3.5 w-3.5 text-amber-400" />
                      <span>Więcej / Dosuń</span>
                    </button>
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto cad-scroll">
                    {([-90, -45, 45, 90] as const).map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => onRotateAxis('y', deg)}
                        className="flex min-h-[36px] flex-1 min-w-[48px] items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06] px-2 text-xs font-semibold font-mono-num text-zinc-100 active:bg-amber-500 active:text-zinc-950"
                      >
                        {deg > 0 ? `+${deg}°` : `${deg}°`}
                      </button>
                    ))}
                    {!selectedCabinetName && onQuickOrientation && (
                      <>
                        <button
                          type="button"
                          onClick={() => onQuickOrientation('upright')}
                          className="flex min-h-[36px] items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/12 px-2.5 text-[11px] font-semibold text-sky-200 active:bg-sky-500 active:text-zinc-950 whitespace-nowrap"
                        >
                          Pion
                        </button>
                        <button
                          type="button"
                          onClick={() => onQuickOrientation('flat_x')}
                          className="flex min-h-[36px] items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/12 px-2.5 text-[11px] font-semibold text-sky-200 active:bg-sky-500 active:text-zinc-950 whitespace-nowrap"
                        >
                          Poz. ↔
                        </button>
                        <button
                          type="button"
                          onClick={() => onQuickOrientation('flat_z')}
                          className="flex min-h-[36px] items-center justify-center rounded-xl border border-sky-400/30 bg-sky-500/12 px-2.5 text-[11px] font-semibold text-sky-200 active:bg-sky-500 active:text-zinc-950 whitespace-nowrap"
                        >
                          Poz. ↕
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ) : tool === 'screw' ? (
                <>
                  <select
                    aria-label="Rodzaj wkrętu"
                    value={activeScrewType}
                    onChange={(e) => onChangeScrewType(e.target.value as ScrewType)}
                    className="min-h-[38px] min-w-0 flex-1 rounded-xl border border-white/[0.1] bg-white/[0.06] px-2.5 text-xs font-medium text-zinc-100 focus:border-amber-500 focus:outline-none"
                  >
                    {SCREW_CATALOG.map((s) => (
                      <option key={s.id} value={s.id} className="bg-zinc-900">
                        {s.shortName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onToggleScrewJointsOnly}
                    className={`flex min-h-[38px] items-center gap-1 rounded-xl border px-2.5 text-xs font-medium whitespace-nowrap shrink-0 ${
                      screwJointsOnly
                        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.08] bg-white/[0.04] text-zinc-400'
                    }`}
                  >
                    <span>Styki</span>
                  </button>
                  <button
                    type="button"
                    onClick={onAutoFasteners}
                    className="flex min-h-[38px] items-center gap-1 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-zinc-950 active:bg-amber-400 whitespace-nowrap shrink-0"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Auto</span>
                  </button>
                </>
              ) : !selectedPartName && activeGroupEditLabel ? (
                <>
                  <span className="text-xs text-sky-300 truncate pl-1">
                    Wnętrze: {activeGroupEditLabel}
                  </span>
                  <button
                    type="button"
                    onClick={onExitGroupEdit}
                    className="flex min-h-[36px] items-center gap-1 rounded-xl bg-sky-500/20 border border-sky-400/35 px-3 text-xs font-semibold text-sky-200 whitespace-nowrap shrink-0"
                  >
                    <span>Wyjdź z edycji</span>
                  </button>
                </>
              ) : selectedCount >= 2 && !selectedCabinetName && !selectedInGroup && onJoinSelected ? (
                <div className="w-full space-y-1.5 py-0.5">
                  <div className="flex items-center justify-between gap-1.5">
                    <span className="text-[11px] font-semibold text-amber-300 truncate pl-0.5 font-mono-num">
                      Połącz ({selectedCount} elem.)
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={onGroupSelected}
                        className="flex h-7 items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2 text-[11px] font-semibold text-sky-200 active:bg-sky-500/30"
                      >
                        <Group className="h-3.5 w-3.5" />
                        <span>Grupuj</span>
                      </button>
                      <button
                        type="button"
                        onClick={onToggleNudgePad}
                        aria-label="Pad precyzji"
                        className={`flex h-7 w-7 items-center justify-center rounded-lg border ${
                          nudgePadOpen
                            ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                            : 'border-white/[0.1] bg-white/[0.05] text-zinc-200'
                        }`}
                      >
                        <Gamepad2 className="h-3.5 w-3.5" />
                      </button>
                      {onDeleteSelected && (
                        <button
                          type="button"
                          onClick={onDeleteSelected}
                          aria-label="Usuń zaznaczone"
                          className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 active:bg-red-500/25"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto cad-scroll">
                    <button
                      type="button"
                      onClick={() => onJoinSelected('corner_l')}
                      className="flex min-h-[36px] items-center justify-center rounded-xl border border-amber-400/45 bg-amber-500/18 px-2.5 text-[11px] font-semibold text-amber-200 active:bg-amber-500 active:text-zinc-950 whitespace-nowrap shrink-0"
                    >
                      Narożnik 90°
                    </button>
                    <button
                      type="button"
                      onClick={() => onJoinSelected('stack_top')}
                      className="flex min-h-[36px] items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06] px-2.5 text-[11px] font-semibold text-zinc-100 active:bg-amber-500 active:text-zinc-950 whitespace-nowrap shrink-0"
                    >
                      Na górze
                    </button>
                    <button
                      type="button"
                      onClick={() => onJoinSelected('t_joint')}
                      className="flex min-h-[36px] items-center justify-center rounded-xl border border-white/[0.1] bg-white/[0.06] px-2.5 text-[11px] font-semibold text-zinc-100 active:bg-amber-500 active:text-zinc-950 whitespace-nowrap shrink-0"
                    >
                      Środek T
                    </button>
                    <button
                      type="button"
                      onClick={() => onJoinSelected('side_by_side')}
                      className="flex min-h-[36px] items-center justify-center rounded-xl border border-sky-400/35 bg-sky-500/12 px-2.5 text-[11px] font-semibold text-sky-200 active:bg-sky-500 active:text-zinc-950 whitespace-nowrap shrink-0"
                    >
                      Obok siebie
                    </button>
                    <button
                      type="button"
                      onClick={() => onJoinSelected('in_line')}
                      className="flex min-h-[36px] items-center justify-center rounded-xl border border-sky-400/35 bg-sky-500/12 px-2.5 text-[11px] font-semibold text-sky-200 active:bg-sky-500 active:text-zinc-950 whitespace-nowrap shrink-0"
                    >
                      W linii
                    </button>
                    <button
                      type="button"
                      onClick={() => onAlignSelected('front')}
                      className="flex min-h-[36px] items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] px-2.5 text-[11px] font-medium text-zinc-200 active:bg-white/[0.14] whitespace-nowrap shrink-0"
                    >
                      Lico
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="min-w-0 flex-1 pl-1">
                    <div className="text-xs font-semibold text-white truncate">
                      {selectedCabinetName
                        ? selectedCabinetName
                        : selectedCount > 1
                          ? `${selectedCount} zaznaczonych`
                          : selectedPartName}
                    </div>
                    {activeGroupEditLabel ? (
                      <button
                        type="button"
                        onClick={onExitGroupEdit}
                        className="text-[11px] font-medium text-sky-300"
                      >
                        ← Wróć do całej szafki
                      </button>
                    ) : !selectedCabinetName && selectedInGroup && selectedCount > 1 ? (
                      <button
                        type="button"
                        onClick={onEnterSinglePartEdit}
                        className="text-[11px] font-medium text-sky-300"
                      >
                        Edytuj pojedynczą płytę
                      </button>
                    ) : !selectedCabinetName && onToggleMultiSelectMode ? (
                      <button
                        type="button"
                        onClick={onToggleMultiSelectMode}
                        className="text-[11px] font-medium text-sky-300"
                      >
                        {multiSelectMode
                          ? 'Tapnij 2. element, aby połączyć...'
                          : '+ Zaznacz 2. element (połącz)'}
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={onToggleNudgePad}
                      aria-label="Pad precyzyjnego przesuwania"
                      title="Pad precyzji ±mm"
                      className={`flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                        nudgePadOpen
                          ? 'border-amber-400/60 bg-amber-500/20 text-amber-300'
                          : 'border-white/[0.08] bg-white/[0.05] text-zinc-200 active:bg-white/[0.12]'
                      }`}
                    >
                      <Gamepad2 className="h-4 w-4" />
                    </button>
                    {onRotateSelected90 && (
                      <button
                        type="button"
                        onClick={onRotateSelected90}
                        aria-label="Obróć o 90 stopni"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.08] bg-white/[0.05] text-zinc-200 active:bg-white/[0.12]"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteSelected && (
                      <button
                        type="button"
                        onClick={onDeleteSelected}
                        aria-label="Usuń zaznaczone"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-500/25 bg-red-500/10 text-red-300 active:bg-red-500/25"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canEditParametricCabinet && onEditParametricCabinet && (
                      <button
                        type="button"
                        onClick={onEditParametricCabinet}
                        aria-label="Edytuj szafkę w kreatorze"
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/[0.12] bg-white/[0.08] text-zinc-100 active:bg-white/[0.16]"
                      >
                        <LayoutPanelTop className="h-4 w-4 text-amber-400" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenInspector}
                      className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-zinc-950 active:bg-amber-400 whitespace-nowrap"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span>Edytuj</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        {/* Mobile 3-Tab Bottom Sheet ("Narzędzia" | "Widok 3D" | "Projekt") */}
        {mobileMenuOpen && (
          <>
            <div
              onClick={() => setMobileMenuOpen(false)}
              className="fixed inset-0 z-0 bg-black/50 backdrop-blur-[2px] pointer-events-auto"
              aria-hidden="true"
            />
            <div className="studio-sheet animate-studio-sheet relative z-10 mx-0 pointer-events-auto max-h-[76dvh] flex flex-col rounded-t-3xl border-b-0 text-zinc-100 overflow-hidden">
              {/* Drag Handle + Header + 3-Way Tab Selector */}
              <div className="px-4 pt-2.5 pb-3 border-b border-white/[0.08] space-y-3 shrink-0">
                <div className="flex justify-center">
                  <div className="h-1 w-10 rounded-full bg-white/20" />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-0.5 rounded-xl bg-white/[0.05] p-0.5 border border-white/[0.08]">
                    <button
                      type="button"
                      onClick={() => onChangeUiMode('simple')}
                      className={`min-h-[32px] rounded-lg px-3 text-xs font-medium transition-colors ${
                        !isExpert
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'text-zinc-400'
                      }`}
                    >
                      Prosty
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeUiMode('expert')}
                      className={`min-h-[32px] rounded-lg px-3 text-xs font-medium transition-colors ${
                        isExpert
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'text-zinc-400'
                      }`}
                    >
                      Ekspert
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {onOpenCommandPalette && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onOpenCommandPalette();
                        }}
                        className="flex h-9 items-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.05] px-2.5 text-xs font-medium text-zinc-200 active:bg-white/[0.12]"
                        aria-label="Szukaj polecenia"
                      >
                        <Search className="h-3.5 w-3.5 text-amber-400" />
                        <span>Szukaj</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 active:bg-white/[0.08]"
                      aria-label="Zamknij menu"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 rounded-xl bg-white/[0.04] p-1 border border-white/[0.07]">
                  {(
                    [
                      { id: 'tools', label: 'Narzędzia' },
                      { id: 'view', label: 'Widok 3D' },
                      { id: 'project', label: 'Projekt' },
                    ] as const
                  ).map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setMobileTab(t.id)}
                      className={`min-h-[36px] rounded-lg text-xs font-medium transition-colors ${
                        mobileTab === t.id
                          ? 'bg-white/[0.12] text-white font-semibold shadow-sm'
                          : 'text-zinc-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable Active Tab Body */}
              <div className="cad-scroll overflow-y-auto px-4 py-3.5 space-y-4">
                {mobileTab === 'tools' && (
                  <>
                    {/* Quick Builders */}
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onOpenCabinetBuilder();
                        }}
                        className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-zinc-950 active:bg-amber-400"
                      >
                        <LayoutPanelTop className="h-4 w-4" />
                        <span>Kreator szafki</span>
                      </button>
                      {onOpenSketch2D && (
                        <button
                          type="button"
                          onClick={() => {
                            setMobileMenuOpen(false);
                            onOpenSketch2D();
                          }}
                          className="flex min-h-[46px] items-center justify-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.05] px-3 text-xs font-medium text-zinc-100 active:bg-white/[0.1]"
                        >
                          <PenTool className="h-4 w-4 text-amber-400" />
                          <span>Szkic 2D</span>
                        </button>
                      )}
                    </div>

                    {/* Expert Extra CAD Tools */}
                    {isExpert && (
                      <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.08]">
                        {(
                          [
                            { id: 'rotate', label: 'Obróć 3D', icon: RotateCw },
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
                            className={`flex min-h-[44px] items-center justify-center gap-2 rounded-xl border text-xs font-medium ${
                              tool === id
                                ? 'border-amber-400/60 bg-amber-500/18 text-amber-200 font-semibold'
                                : 'border-white/[0.08] bg-white/[0.04] text-zinc-200 active:bg-white/[0.1]'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    {/* Selection & Snapping Controls */}
                    <div className="space-y-2 pt-3 border-t border-white/[0.08]">
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={onToggleSelectionScope}
                          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                            selectionScope === 'group'
                              ? 'border-sky-400/40 bg-sky-500/15 text-sky-200'
                              : 'border-white/[0.08] bg-white/[0.04] text-zinc-200'
                          }`}
                        >
                          {selectionScope === 'group' ? (
                            <Boxes className="h-4 w-4" />
                          ) : (
                            <Square className="h-4 w-4" />
                          )}
                          <span>
                            Klik: {selectionScope === 'group' ? 'Cała grupa' : '1 płyta'}
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={onToggleMagneticSnap}
                          className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                            magneticSnap
                              ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                              : 'border-white/[0.08] bg-white/[0.04] text-zinc-200'
                          }`}
                        >
                          <Magnet className="h-4 w-4" />
                          <span>Magnes: {magneticSnap ? 'Wł.' : 'Wył.'}</span>
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={onCycleSnap}
                        className="w-full min-h-[44px] rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 font-mono-num active:bg-white/[0.1]"
                      >
                        Skok siatki: {snapMm > 0 ? `${snapMm} mm` : 'Bez siatki'}
                      </button>
                    </div>
                  </>
                )}

                {mobileTab === 'view' && (
                  <>
                    {/* Sliders */}
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-300 whitespace-nowrap w-24">
                          Otwórz fronty
                        </span>
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
                      {isExpert && (
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-zinc-300 whitespace-nowrap w-24">
                            Rozstrzał 3D
                          </span>
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
                      )}
                    </div>

                    {/* Camera Presets */}
                    <div className="grid grid-cols-4 gap-1.5 pt-3 border-t border-white/[0.08]">
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
                          className="min-h-[44px] rounded-xl border border-white/[0.08] bg-white/[0.04] text-xs font-medium text-zinc-200 active:bg-white/[0.12]"
                        >
                          {cam.label}
                        </button>
                      ))}
                    </div>

                    {/* Visual Toggles */}
                    <div className="grid grid-cols-2 gap-2 pt-3 border-t border-white/[0.08]">
                      <button
                        type="button"
                        onClick={onCycleLighting}
                        className={`${
                          isExpert ? '' : 'col-span-2'
                        } flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-zinc-200 active:bg-white/[0.1]`}
                      >
                        <Sun className="h-4 w-4 text-amber-400" />
                        <span>Światło: {LIGHTING_LABELS[lighting]}</span>
                      </button>

                      {isExpert ? (
                        <>
                          <button
                            type="button"
                            onClick={onToggleLedUnderCabinet}
                            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                              ledUnderCabinet
                                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                                : 'border-white/[0.08] bg-white/[0.04] text-zinc-200'
                            }`}
                          >
                            <Lightbulb className="h-4 w-4" />
                            <span>LED: {ledUnderCabinet ? 'Wł.' : 'Wył.'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={onToggleShowDimensions}
                            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                              showDimensions
                                ? 'border-sky-400/50 bg-sky-500/15 text-sky-200'
                                : 'border-white/[0.08] bg-white/[0.04] text-zinc-200'
                            }`}
                          >
                            <Ruler className="h-4 w-4" />
                            <span>Prześwity</span>
                          </button>
                          <button
                            type="button"
                            onClick={onToggleXray}
                            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                              xrayMode
                                ? 'border-amber-400/50 bg-amber-500/15 text-amber-200'
                                : 'border-white/[0.08] bg-white/[0.04] text-zinc-200'
                            }`}
                          >
                            <Layers className="h-4 w-4" />
                            <span>Tryb RTG</span>
                          </button>
                          <button
                            type="button"
                            onClick={onToggleShowFasteners}
                            className="col-span-2 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-zinc-200"
                          >
                            {showFasteners ? (
                              <Eye className="h-4 w-4" />
                            ) : (
                              <EyeOff className="h-4 w-4" />
                            )}
                            <span>{showFasteners ? 'Wkręty: Pokaż' : 'Wkręty: Ukryj'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              onToggleAssemblyMode();
                              setMobileMenuOpen(false);
                            }}
                            className={`col-span-2 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                              assemblyStep > 0
                                ? 'border-emerald-400/50 bg-emerald-500/15 text-emerald-200'
                                : 'border-white/[0.08] bg-white/[0.04] text-zinc-200'
                            }`}
                          >
                            <ListOrdered className="h-4 w-4" />
                            <span>Instrukcja montażu krok po kroku</span>
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => onChangeUiMode('expert')}
                          className="col-span-2 flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 text-xs font-medium text-amber-300 active:bg-white/[0.1]"
                        >
                          <Sparkles className="h-3.5 w-3.5 shrink-0" />
                          <span>Włącz tryb Ekspert (RTG, LED, rozstrzał, montaż)</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

                {mobileTab === 'project' && (
                  <div className="divide-y divide-white/[0.07]">
                    {(
                      [
                        {
                          label: 'Rozkrój płyt i wycena PDF',
                          desc: 'Optymalizacja cięcia, obrzeża, kosztorys',
                          icon: Scissors,
                          accent: true,
                          action: onOpenCutList,
                        },
                        {
                          label: 'Materiały, dekory i ceny',
                          desc: 'Płyty laminowane, drewno, własne tekstury',
                          icon: Palette,
                          action: onOpenMaterials,
                        },
                        {
                          label: 'Drzewo sceny i warstwy',
                          desc: 'Przeglądaj grupy, ukrywaj i blokuj elementy',
                          icon: Layers,
                          action: onOpenPartsList,
                        },
                        {
                          label: 'Szablony z Firestore',
                          desc: 'Gotowe projekty startowe i własne szablony',
                          icon: FolderOpen,
                          action: onOpenTemplates,
                        },
                        {
                          label: 'Moje projekty',
                          desc: 'Przełączaj, duplikuj i zmieniaj nazwy',
                          icon: FolderOpen,
                          action: onOpenProjects,
                        },
                        {
                          label: 'Zapisz wizualizację PNG',
                          desc: 'Eksportuj aktualny widok 3D jako obraz',
                          icon: Camera,
                          action: onSnapshot,
                        },
                      ] as Array<{
                        label: string;
                        desc: string;
                        icon: React.ComponentType<{ className?: string }>;
                        accent?: boolean;
                        action: () => void;
                      }>
                    ).map(({ label, desc, icon: Icon, accent, action }) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          action();
                        }}
                        className="flex w-full min-h-[52px] items-center gap-3 py-2.5 px-1 text-left active:bg-white/[0.05] transition-colors"
                      >
                        <span
                          className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${
                            accent
                              ? 'bg-amber-500/20 text-amber-300'
                              : 'bg-white/[0.06] text-zinc-300'
                          }`}
                        >
                          <Icon className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-zinc-100 truncate">
                            {label}
                          </div>
                          <div className="text-[11px] text-zinc-500 truncate">{desc}</div>
                        </div>
                      </button>
                    ))}
                    {onOpenShortcuts && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onOpenShortcuts();
                        }}
                        className="flex w-full min-h-[48px] items-center gap-3 py-2.5 px-1 text-left active:bg-white/[0.05] transition-colors"
                      >
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-300 shrink-0">
                          <HelpCircle className="h-4 w-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-semibold text-zinc-100">
                            Pomoc, skróty i gesty
                          </div>
                          <div className="text-[11px] text-zinc-500">
                            Obsługa dotykiem i skróty klawiszowe
                          </div>
                        </div>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Mobile Fixed Bottom Thumb Bar (5 ergonomic targets, subtle top indicator) */}
        <nav
          aria-label="Narzędzia projektowania"
          className="relative z-10 pointer-events-auto border-t border-white/[0.08] bg-[#101216]/96 backdrop-blur-xl px-1.5 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
        >
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                { id: 'select' as EditorTool, label: 'Zaznacz', icon: MousePointer2 },
                { id: 'move' as EditorTool, label: 'Przesuń', icon: Move },
                { id: 'resize' as EditorTool, label: 'Rozciągnij', icon: Maximize2 },
                isExpert
                  ? { id: 'screw' as EditorTool, label: 'Wkręty', icon: Wrench }
                  : { id: 'rotate' as EditorTool, label: 'Obróć', icon: RotateCw },
              ]
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
                  className={`relative flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors ${
                    active
                      ? 'bg-amber-500/15 text-amber-300 font-semibold'
                      : 'text-zinc-400 active:bg-white/[0.06] active:text-zinc-100'
                  }`}
                >
                  {active && (
                    <span
                      aria-hidden="true"
                      className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-amber-400"
                    />
                  )}
                  <Icon className="h-[18px] w-[18px]" />
                  <span className="leading-none">{label}</span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setMobileMenuOpen((o) => !o)}
              className={`relative flex min-h-[46px] flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-medium transition-colors ${
                mobileMenuOpen
                  ? 'bg-white/[0.1] text-amber-300 font-semibold'
                  : 'text-zinc-400 active:bg-white/[0.06] active:text-zinc-100'
              }`}
            >
              {mobileMenuOpen && (
                <span
                  aria-hidden="true"
                  className="absolute top-0 left-1/2 -translate-x-1/2 h-[2px] w-6 rounded-full bg-amber-400"
                />
              )}
              <SlidersHorizontal className="h-[18px] w-[18px]" />
              <span className="leading-none">Menu</span>
            </button>
          </div>
        </nav>
      </div>

      {/* =====================================================================
          DESKTOP SLIM FLOATING GLASS VIEW & CONTEXT DOCK (>= md)
      ===================================================================== */}
      <div
        className="hidden md:block fixed bottom-0 left-1/2 z-30 w-[min(1140px,calc(100vw-116px))] pb-3 pointer-events-none transition-transform duration-200 ease-out"
        style={{
          transform: collapsed
            ? 'translate(-50%, calc(100% - 34px))'
            : 'translate(-50%, 0)',
        }}
      >
        {/* Minimal Architectural Collapse Pill */}
        <div className="flex justify-center mb-1 pointer-events-auto">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 rounded-full border border-white/[0.09] bg-[#101216]/90 backdrop-blur-md px-3 py-0.5 text-[10px] font-medium text-zinc-400 hover:text-zinc-100 shadow-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Pokaż lub ukryj pasek widoku (klawisz H)"
          >
            {collapsed ? (
              <>
                <ChevronUp className="h-3 w-3 text-amber-400" />
                <span>Widok i opcje</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 text-zinc-500" />
                <span>Ukryj</span>
              </>
            )}
          </button>
        </div>

        <div className="studio-glass pointer-events-auto rounded-2xl text-zinc-100 px-3.5 py-2">
          {/* Contextual Selection / Tool Strip (Only rendered when active) */}
          {showContextStrip && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] pb-2 text-xs">
              {selectedFastenerLabel ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate font-medium text-zinc-100">
                    Łącznik: {selectedFastenerLabel}
                  </span>
                </div>
              ) : tool === 'screw' ? (
                <div className="flex items-center gap-1.5 min-w-0">
                  <Crosshair className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <select
                    aria-label="Rodzaj wkrętu"
                    value={activeScrewType}
                    onChange={(e) => onChangeScrewType(e.target.value as ScrewType)}
                    className="h-7 rounded-lg border border-white/[0.1] bg-white/[0.06] px-2 text-xs font-medium text-zinc-100 focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    {SCREW_CATALOG.map((s) => (
                      <option key={s.id} value={s.id} className="bg-zinc-900">
                        {s.shortName}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={onToggleScrewJointsOnly}
                    className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
                      screwJointsOnly
                        ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-300'
                        : 'border-white/[0.08] bg-white/[0.04] text-zinc-300'
                    }`}
                  >
                    <Magnet className="h-3.5 w-3.5" />
                    <span>Tylko styki</span>
                  </button>
                  <button
                    type="button"
                    onClick={onAutoFasteners}
                    className="flex h-7 items-center gap-1 rounded-lg bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Auto wkręty</span>
                  </button>
                </div>
              ) : tool === 'measure' ? (
                <div className="flex items-center gap-2.5 min-w-0 text-sky-300">
                  <Ruler className="h-3.5 w-3.5 shrink-0" />
                  {latestMeasurementLabel ? (
                    <span className="truncate font-mono-num">
                      <span className="text-zinc-400">Ostatni pomiar: </span>
                      <strong className="text-amber-300 font-semibold">
                        {latestMeasurementLabel}
                      </strong>
                      <span className="hidden lg:inline text-zinc-400">
                        {' '}
                        · kliknij kolejne 2 punkty, aby zmierzyć
                      </span>
                    </span>
                  ) : (
                    <span className="truncate">
                      Miarka 3D: kliknij 2 punkty na ścianie, podłodze lub meblu, aby zmierzyć dystans w mm
                    </span>
                  )}
                </div>
              ) : tool === 'resize' && !selectedPartName ? (
                <div className="flex items-center gap-2 min-w-0 text-amber-300">
                  <Maximize2 className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Rozciągnij: kliknij szafkę lub płytę w 3D, aby rozciągnąć jej wymiary uchwytami
                  </span>
                </div>
              ) : tool === 'rotate' && !selectedPartName ? (
                <div className="flex items-center gap-2 min-w-0 text-amber-300">
                  <RotateCw className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Obrót 3D: kliknij szafkę lub element (np. kantówkę), aby go obrócić
                  </span>
                </div>
              ) : tool === 'rotate' && selectedPartName && onRotateAxis ? (
                <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                  <RotateCw className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate font-semibold text-white max-w-[160px]">
                    {selectedCabinetName || (selectedCount > 1 ? `Grupa (${selectedCount})` : selectedPartName)}
                  </span>
                  <div className="flex items-center gap-1 ml-1">
                    {([-90, -45, -15, 15, 45, 90] as const).map((deg) => (
                      <button
                        key={deg}
                        type="button"
                        onClick={() => onRotateAxis('y', deg)}
                        className="h-7 rounded-lg border border-white/[0.09] bg-white/[0.05] px-2 text-[11px] font-semibold font-mono-num text-zinc-100 hover:bg-amber-500/20 hover:border-amber-400/50 hover:text-amber-200 cursor-pointer transition-colors"
                        title={`Obróć w poziomie (Y) o ${deg > 0 ? `+${deg}` : deg}°`}
                      >
                        {deg > 0 ? `+${deg}°` : `${deg}°`}
                      </button>
                    ))}
                  </div>
                  {!selectedCabinetName && onQuickOrientation && (
                    <div className="flex items-center gap-1 pl-1.5 ml-0.5 border-l border-white/[0.1]">
                      <button
                        type="button"
                        onClick={() => onQuickOrientation('upright')}
                        className="h-7 rounded-lg border border-sky-400/30 bg-sky-500/12 px-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25 cursor-pointer transition-colors"
                        title="Postaw element pionowo (0°)"
                      >
                        Pion 0°
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickOrientation('flat_x')}
                        className="h-7 rounded-lg border border-sky-400/30 bg-sky-500/12 px-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25 cursor-pointer transition-colors"
                        title="Połóż element poziomo wzdłuż osi X"
                      >
                        Poziom ↔
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickOrientation('flat_z')}
                        className="h-7 rounded-lg border border-sky-400/30 bg-sky-500/12 px-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25 cursor-pointer transition-colors"
                        title="Połóż element poziomo wzdłuż osi Z"
                      >
                        Poziom ↕
                      </button>
                    </div>
                  )}
                </div>
              ) : selectedCabinetName ? (
                <div className="flex items-center gap-2 min-w-0">
                  <LayoutPanelTop className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate font-semibold text-white">
                    {selectedCabinetName}
                  </span>
                  <span className="hidden lg:inline text-[11px] text-zinc-400 whitespace-nowrap">
                    · szafka parametryczna
                  </span>
                </div>
              ) : selectedCount >= 2 ? (
                <div className="flex items-center gap-1 min-w-0 flex-wrap">
                  <span className="font-semibold text-amber-300 whitespace-nowrap mr-1 font-mono-num">
                    {selectedInGroup ? `Grupa (${selectedCount})` : `${selectedCount} elem.`}
                  </span>
                  {selectedInGroup ? (
                    <button
                      type="button"
                      onClick={onEnterSinglePartEdit}
                      title="Wejdź do wnętrza grupy, aby edytować pojedynczą płytę (lub kliknij 2× w 3D)"
                      className="h-7 rounded-lg border border-sky-400/35 bg-sky-500/12 px-2 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20 mr-1 cursor-pointer whitespace-nowrap transition-colors"
                    >
                      Edytuj pojedynczą płytę
                    </button>
                  ) : onJoinSelected ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onJoinSelected('corner_l')}
                        title="Połącz 2 elementy pod kątem prostym (narożnik L, 90°, styk 0 mm)"
                        className="h-7 rounded-lg border border-amber-400/45 bg-amber-500/18 px-2 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/30 cursor-pointer whitespace-nowrap transition-colors"
                      >
                        Narożnik 90°
                      </button>
                      <button
                        type="button"
                        onClick={() => onJoinSelected('stack_top')}
                        title="Połóż 2. element idealnie na górze 1. elementu (belka na słupku)"
                        className="h-7 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 text-[11px] font-medium text-zinc-100 hover:bg-amber-500/20 hover:border-amber-400/45 hover:text-amber-200 cursor-pointer whitespace-nowrap transition-colors"
                      >
                        Na górze
                      </button>
                      <button
                        type="button"
                        onClick={() => onJoinSelected('t_joint')}
                        title="Połącz 2. element pod kątem 90° do środka 1. elementu (łączenie T)"
                        className="h-7 rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 text-[11px] font-medium text-zinc-100 hover:bg-amber-500/20 hover:border-amber-400/45 hover:text-amber-200 cursor-pointer whitespace-nowrap transition-colors"
                      >
                        Środek T
                      </button>
                      <button
                        type="button"
                        onClick={() => onJoinSelected('side_by_side')}
                        title="Ustaw zaznaczone elementy obok siebie w jednej linii (styk 0 mm)"
                        className="h-7 rounded-lg border border-sky-400/35 bg-sky-500/12 px-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25 cursor-pointer whitespace-nowrap transition-colors"
                      >
                        Obok siebie
                      </button>
                      <button
                        type="button"
                        onClick={() => onJoinSelected('in_line')}
                        title="Złącz 2 elementy czoło do czoła w jednej osi (przedłużenie)"
                        className="h-7 rounded-lg border border-sky-400/35 bg-sky-500/12 px-2 text-[11px] font-semibold text-sky-200 hover:bg-sky-500/25 cursor-pointer whitespace-nowrap transition-colors"
                      >
                        W linii
                      </button>
                      <div className="mx-0.5 h-4 w-px bg-white/[0.1] shrink-0" aria-hidden="true" />
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onAlignSelected('left')}
                    title="Wyrównaj do lewej"
                    className={alignBtn}
                  >
                    <AlignStartVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('centerX')}
                    title="Wyśrodkuj X"
                    className={alignBtn}
                  >
                    <AlignCenterHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('right')}
                    title="Wyrównaj do prawej"
                    className={alignBtn}
                  >
                    <AlignEndVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('bottom')}
                    title="Wyrównaj do dołu"
                    className={alignBtn}
                  >
                    <AlignEndHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('top')}
                    title="Wyrównaj do góry"
                    className={alignBtn}
                  >
                    <AlignStartHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('front')}
                    title="Wyrównaj lico (+Z)"
                    className={`${ctxBtn} px-2 text-[11px]`}
                  >
                    Lico
                  </button>
                  {selectedCount >= 3 && !selectedInGroup && (
                    <>
                      <button
                        type="button"
                        onClick={() => onDistributeSelected('x')}
                        title="Rozmieść równomiernie X"
                        className={`${ctxBtn} text-[11px]`}
                      >
                        <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
                        <span>X</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDistributeSelected('y')}
                        title="Rozmieść równomiernie Y"
                        className={`${ctxBtn} text-[11px]`}
                      >
                        <AlignVerticalDistributeCenter className="h-3.5 w-3.5" />
                        <span>Y</span>
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-2 min-w-0">
                  <span className="truncate font-semibold text-white">
                    {selectedPartName ?? (activeGroupEditLabel ? `Wnętrze: ${activeGroupEditLabel}` : '')}
                  </span>
                  {activeGroupEditLabel ? (
                    <button
                      type="button"
                      onClick={onExitGroupEdit}
                      className="rounded-lg border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/25 cursor-pointer whitespace-nowrap"
                    >
                      ← Wróć do całej szafki
                    </button>
                  ) : selectedInGroup ? (
                    <button
                      type="button"
                      onClick={onSelectWholeGroup}
                      className="rounded-lg border border-sky-400/35 bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20 cursor-pointer whitespace-nowrap"
                    >
                      Zaznacz całą szafkę
                    </button>
                  ) : onToggleMultiSelectMode ? (
                    <button
                      type="button"
                      onClick={onToggleMultiSelectMode}
                      title="Włącz zaznaczanie wielu elementów (lub przytrzymaj Shift + klik), aby połączyć ze sobą 2 elementy"
                      className={`flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-medium cursor-pointer whitespace-nowrap transition-colors ${
                        multiSelectMode
                          ? 'border-sky-400/60 bg-sky-500/25 text-sky-200'
                          : 'border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.1] hover:text-white'
                      }`}
                    >
                      <CheckSquare className="h-3 w-3 text-sky-400" />
                      <span>
                        {multiSelectMode ? 'Kliknij 2. element...' : '+ Zaznacz 2. (połącz)'}
                      </span>
                    </button>
                  ) : null}
                </div>
              )}

              {/* Right Quick Actions for Selection */}
              <div className="flex items-center gap-1.5 shrink-0">
                {tool === 'measure' && measurementsCount > 0 ? (
                  <button
                    type="button"
                    onClick={onClearMeasurements}
                    className={ctxBtn}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>Wyczyść ({measurementsCount})</span>
                  </button>
                ) : selectedFastenerLabel ? (
                  <button
                    type="button"
                    onClick={onDeleteSelectedFastener}
                    className="flex h-7 items-center gap-1 rounded-lg bg-red-500/20 px-2.5 text-xs font-medium text-red-200 hover:bg-red-500/35 whitespace-nowrap cursor-pointer transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Usuń łącznik</span>
                  </button>
                ) : selectedPartName && tool !== 'screw' ? (
                  <>
                    {!selectedCabinetName && selectedCount >= 2 && !selectedInGroup && (
                      <button
                        type="button"
                        onClick={onGroupSelected}
                        className="flex h-7 items-center gap-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 whitespace-nowrap cursor-pointer transition-colors"
                      >
                        <Group className="h-3.5 w-3.5" />
                        <span>Grupuj</span>
                      </button>
                    )}
                    {!selectedCabinetName && selectedCanUngroup && (
                      <button
                        type="button"
                        onClick={onUngroupSelected}
                        className={ctxBtn}
                      >
                        <Ungroup className="h-3.5 w-3.5 text-zinc-400" />
                        <span>Rozgrupuj</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onToggleNudgePad}
                      title="Otwórz pad precyzyjnego przesuwania (±1 / 10 / 50 mm)"
                      className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        nudgePadOpen
                          ? 'border-amber-400/60 bg-amber-500/20 text-amber-200'
                          : 'border-white/[0.08] bg-white/[0.04] text-zinc-200 hover:bg-white/[0.1]'
                      }`}
                    >
                      <Gamepad2 className="h-3.5 w-3.5" />
                      <span className="hidden lg:inline">Precyzja</span>
                    </button>
                    {onRotateSelected90 && (
                      <button
                        type="button"
                        onClick={onRotateSelected90}
                        title="Obróć o 90°"
                        className={ctxBtn}
                      >
                        <RotateCw className="h-3.5 w-3.5 text-zinc-400" />
                        <span>90°</span>
                      </button>
                    )}
                    {onDuplicateSelected && (
                      <button
                        type="button"
                        onClick={onDuplicateSelected}
                        title="Duplikuj (Ctrl+D)"
                        className={alignBtn}
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDropSelectedToFloor && (
                      <button
                        type="button"
                        onClick={onDropSelectedToFloor}
                        title="Postaw na podłodze (Y = 0)"
                        className={alignBtn}
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteSelected && (
                      <button
                        type="button"
                        onClick={onDeleteSelected}
                        title="Usuń (Delete)"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-500/25 bg-red-500/10 text-red-300 hover:bg-red-500/25 transition-colors cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canEditParametricCabinet && onEditParametricCabinet && (
                      <button
                        type="button"
                        onClick={onEditParametricCabinet}
                        className={ctxBtn}
                      >
                        <LayoutPanelTop className="h-3.5 w-3.5 text-amber-400" />
                        <span>Kreator</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenInspector}
                      className="flex h-7 items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span>Właściwości</span>
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* Single Clean Bottom Row: Essential View Controls + Prosty/Ekspert Switch (Strict 1-row nowrap) */}
          <div className="flex flex-nowrap items-center justify-between gap-2 overflow-x-auto cad-scroll">
            {/* Left: Open Doors + (Expert) Exploded */}
            <div className="flex items-center gap-2.5 shrink-0">
              <div className="flex items-center gap-1.5 w-[104px] xl:w-[132px]">
                <button
                  type="button"
                  onClick={() => onChangeOpenAmount(openAmount > 0.1 ? 0 : 1)}
                  className={`flex items-center gap-1 text-[11px] font-medium whitespace-nowrap cursor-pointer transition-colors ${
                    openAmount > 0.05 ? 'text-amber-300' : 'text-zinc-300 hover:text-white'
                  }`}
                  title="Otwórz/zamknij fronty i szuflady (O)"
                >
                  <DoorOpen className="h-3.5 w-3.5 shrink-0" />
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

              {isExpert && (
                <div className="flex items-center gap-1.5 w-[106px] xl:w-[134px]">
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
                </div>
              )}
            </div>

            <div className="hidden lg:block h-4 w-px bg-white/[0.08] shrink-0" aria-hidden="true" />

            {/* Center: Precision & Visual Toggles */}
            <div className="flex flex-nowrap items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={onToggleMagneticSnap}
                className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  magneticSnap
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
                }`}
                title="Magnes — przyciąganie do krawędzi płyt (M)"
              >
                <Magnet className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">Magnes</span>
              </button>

              <button
                type="button"
                onClick={onCycleSnap}
                className="h-8 rounded-lg px-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.07] hover:text-white whitespace-nowrap cursor-pointer font-mono-num transition-colors"
                title="Skok przyciągania do siatki"
              >
                {snapMm > 0 ? `${snapMm}mm` : '0mm'}
              </button>

              <button
                type="button"
                onClick={onCycleLighting}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-zinc-300 hover:bg-white/[0.07] hover:text-white whitespace-nowrap cursor-pointer transition-colors"
                title="Oświetlenie sceny 3D"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>{LIGHTING_LABELS[lighting]}</span>
              </button>

              {isExpert && (
                <>
                  <div className="mx-0.5 h-4 w-px bg-white/[0.08] shrink-0" aria-hidden="true" />

                  <button
                    type="button"
                    onClick={onToggleShowDimensions}
                    className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      showDimensions
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
                    }`}
                    title="Prześwity w świetle (D)"
                  >
                    <Ruler className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">Prześwit</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleXray}
                    className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      xrayMode
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
                    }`}
                    title="Tryb RTG (X)"
                  >
                    <Layers className="h-3.5 w-3.5" />
                    <span>RTG</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleLedUnderCabinet}
                    className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      ledUnderCabinet
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
                    }`}
                    title="Podświetlenie LED (L)"
                  >
                    <Lightbulb className="h-3.5 w-3.5" />
                    <span>LED</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleShowFasteners}
                    className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      showFasteners
                        ? 'text-zinc-200 hover:bg-white/[0.07]'
                        : 'text-zinc-500 hover:bg-white/[0.07]'
                    }`}
                    title={showFasteners ? 'Ukryj wkręty' : 'Pokaż wkręty'}
                  >
                    {showFasteners ? (
                      <Eye className="h-3.5 w-3.5" />
                    ) : (
                      <EyeOff className="h-3.5 w-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={onToggleAssemblyMode}
                    className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      assemblyStep > 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-zinc-400 hover:bg-white/[0.07] hover:text-white'
                    }`}
                    title="Instrukcja montażu krok po kroku"
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                    <span className="hidden xl:inline">Montaż</span>
                  </button>
                </>
              )}
            </div>

            {/* Right: Simple / Expert Segmented Switch + Shortcuts */}
            <div className="flex items-center gap-1 shrink-0">
              <div
                className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.04] p-0.5"
                title="Tryb Prosty ukrywa zaawansowane opcje warsztatowe (wkręty, RTG, CNC). Tryb Ekspert odblokowuje wszystko."
              >
                <button
                  type="button"
                  onClick={() => onChangeUiMode('simple')}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    !isExpert
                      ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Prosty
                </button>
                <button
                  type="button"
                  onClick={() => onChangeUiMode('expert')}
                  className={`rounded-lg px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isExpert
                      ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Ekspert
                </button>
              </div>

              {onOpenShortcuts && (
                <button
                  type="button"
                  onClick={onOpenShortcuts}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.07] hover:text-white transition-colors cursor-pointer"
                  title="Skróty klawiszowe (?)"
                  aria-label="Skróty klawiszowe"
                >
                  <HelpCircle className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
