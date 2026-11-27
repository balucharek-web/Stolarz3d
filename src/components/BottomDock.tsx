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
  canEditParametricCabinet?: boolean;
  selectedFastenerLabel: string | null;
  onAlignSelected: (mode: AlignMode) => void;
  onDistributeSelected: (axis: 'x' | 'y' | 'z') => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onOpenInspector: () => void;
  onEditParametricCabinet?: () => void;
  onRotateSelected90?: () => void;
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
  canEditParametricCabinet = false,
  selectedFastenerLabel,
  onAlignSelected,
  onDistributeSelected,
  onGroupSelected,
  onUngroupSelected,
  onOpenInspector,
  onEditParametricCabinet,
  onRotateSelected90,
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
      tool === 'measure'
  );

  return (
    <>
      {/* =====================================================================
          DESKTOP LEFT VERTICAL CAD TOOL RAIL (>= md)
      ===================================================================== */}
      <aside
        aria-label="Narzędzia CAD"
        className="hidden md:flex fixed left-3 top-1/2 -translate-y-1/2 z-30 flex-col items-center gap-1 rounded-2xl border border-zinc-800 bg-[#141518]/[0.96] p-1.5 shadow-2xl backdrop-blur-md"
      >
        {visibleRailTools.map(({ id, label, shortcut, icon: Icon }) => {
          const active = tool === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChangeTool(id)}
              title={`${label} (${shortcut})`}
              aria-label={`${label} (${shortcut})`}
              className={`group relative flex h-10 w-10 items-center justify-center rounded-xl transition-colors cursor-pointer ${
                active
                  ? 'bg-amber-500 text-zinc-950 shadow-sm'
                  : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
              }`}
            >
              <Icon className="h-[18px] w-[18px]" />
            </button>
          );
        })}

        <div className="my-0.5 h-px w-7 bg-zinc-800" />

        {/* SketchUp-Style Group vs Single Part Selection Toggle */}
        <button
          type="button"
          onClick={onToggleSelectionScope}
          title={
            selectionScope === 'group'
              ? 'Tryb kliknięcia: Cała szafka / grupa (dwuklik = pojedyncza płyta)'
              : 'Tryb kliknięcia: Pojedyncza płyta (kliknij, aby przełączyć na całe grupy)'
          }
          aria-label="Przełącz tryb zaznaczania grupa lub płyta"
          className={`flex h-10 w-10 flex-col items-center justify-center rounded-xl transition-colors cursor-pointer ${
            selectionScope === 'group'
              ? 'bg-sky-500/15 text-sky-300 border border-sky-500/40'
              : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
          }`}
        >
          {selectionScope === 'group' ? (
            <Boxes className="h-4 w-4" />
          ) : (
            <Square className="h-4 w-4" />
          )}
          <span className="text-[8px] font-semibold leading-none mt-0.5">
            {selectionScope === 'group' ? 'Grupa' : 'Płyta'}
          </span>
        </button>

        <div className="my-0.5 h-px w-7 bg-zinc-800" />

        {/* Undo / Redo */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title="Cofnij (Ctrl+Z)"
          aria-label="Cofnij"
          className="flex h-9 w-10 items-center justify-center rounded-xl text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title="Ponów (Ctrl+Y)"
          aria-label="Ponów"
          className="flex h-9 w-10 items-center justify-center rounded-xl text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          <Redo2 className="h-4 w-4" />
        </button>
      </aside>

      {/* =====================================================================
          MOBILE-FIRST THUMB DOCK & 3-TAB SHEET (< md)
      ===================================================================== */}
      <div className="md:hidden fixed inset-x-0 bottom-0 z-30 pointer-events-none">
        {/* Contextual Selection / Group-Drill Bar above mobile nav */}
        {!mobileMenuOpen &&
          (selectedPartName ||
            selectedFastenerLabel ||
            activeGroupEditLabel ||
            tool === 'screw' ||
            tool === 'measure') && (
            <div className="mx-2 mb-1.5 pointer-events-auto flex items-center justify-between gap-1.5 rounded-xl border border-zinc-800 bg-[#141518]/[0.96] px-2.5 py-1.5 text-zinc-100 shadow-lg">
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
                    Tapnij 2 punkty w 3D, aby zmierzyć
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
                </>
              ) : !selectedPartName && activeGroupEditLabel ? (
                <>
                  <span className="text-[11px] text-sky-300 truncate pl-1">
                    Wnętrze grupy: {activeGroupEditLabel}
                  </span>
                  <button
                    type="button"
                    onClick={onExitGroupEdit}
                    className="flex min-h-[34px] items-center gap-1 rounded-lg bg-sky-500/20 border border-sky-500/50 px-2.5 text-xs font-semibold text-sky-200 whitespace-nowrap shrink-0"
                  >
                    <span>Wyjdź z grupy</span>
                  </button>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1 pl-0.5">
                    <div className="text-xs font-medium text-zinc-100 truncate">
                      {selectedCount > 1
                        ? `Grupa (${selectedCount} elem.)`
                        : selectedPartName}
                    </div>
                    {activeGroupEditLabel ? (
                      <button
                        type="button"
                        onClick={onExitGroupEdit}
                        className="text-[10px] font-medium text-sky-300 underline"
                      >
                        ← Wróć do całej grupy
                      </button>
                    ) : selectedInGroup && selectedCount > 1 ? (
                      <button
                        type="button"
                        onClick={onEnterSinglePartEdit}
                        className="text-[10px] font-medium text-sky-300 underline"
                      >
                        Edytuj pojedynczą płytę
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={onToggleNudgePad}
                      aria-label="Pad precyzyjnego przesuwania"
                      title="Pad precyzji ±mm"
                      className={`flex min-h-[36px] min-w-[34px] items-center justify-center rounded-lg border transition-colors ${
                        nudgePadOpen
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-200 active:bg-zinc-800'
                      }`}
                    >
                      <Gamepad2 className="h-4 w-4" />
                    </button>
                    {onRotateSelected90 && (
                      <button
                        type="button"
                        onClick={onRotateSelected90}
                        aria-label="Obróć o 90 stopni"
                        className="flex min-h-[36px] min-w-[34px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-200 active:bg-zinc-800"
                      >
                        <RotateCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {onDeleteSelected && (
                      <button
                        type="button"
                        onClick={onDeleteSelected}
                        aria-label="Usuń zaznaczone"
                        className="flex min-h-[36px] min-w-[34px] items-center justify-center rounded-lg border border-red-900/50 bg-red-950/40 text-red-300 active:bg-red-900/50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canEditParametricCabinet && onEditParametricCabinet && (
                      <button
                        type="button"
                        onClick={onEditParametricCabinet}
                        className="flex min-h-[36px] items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2 text-xs font-semibold text-emerald-200 active:bg-emerald-500/30 whitespace-nowrap"
                      >
                        <LayoutPanelTop className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenInspector}
                      className="flex min-h-[36px] items-center gap-1 rounded-lg bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 active:bg-amber-400 whitespace-nowrap"
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
              className="fixed inset-0 z-0 bg-black/45 pointer-events-auto"
              aria-hidden="true"
            />
            <div className="relative z-10 mx-2 mb-1.5 pointer-events-auto max-h-[72dvh] flex flex-col rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl overflow-hidden">
              {/* Drag Handle + Header + 3-Way Tab Selector */}
              <div className="px-3.5 pt-2 pb-2.5 border-b border-zinc-800 space-y-2.5 shrink-0">
                <div className="flex justify-center">
                  <div className="h-1 w-10 rounded-full bg-zinc-700" />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-0.5 rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => onChangeUiMode('simple')}
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
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
                      className={`rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors ${
                        isExpert
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'text-zinc-400'
                      }`}
                    >
                      Ekspert
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 active:bg-zinc-800"
                    aria-label="Zamknij menu"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-1 rounded-xl bg-zinc-900 p-1 border border-zinc-800">
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
                      className={`min-h-[34px] rounded-lg text-xs font-medium transition-colors ${
                        mobileTab === t.id
                          ? 'bg-zinc-800 text-amber-300 font-semibold'
                          : 'text-zinc-400'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Scrollable Active Tab Body */}
              <div className="cad-scroll overflow-y-auto p-3.5 space-y-3">
                {mobileTab === 'tools' && (
                  <>
                    {/* Show only CAD tools not already pinned on the 5-button bottom thumb bar */}
                    {isExpert && (
                      <div className="grid grid-cols-2 gap-2">
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
                                ? 'border-amber-500 bg-amber-500/20 text-amber-300 font-semibold'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                            }`}
                          >
                            <Icon className="h-4 w-4 shrink-0" />
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div
                      className={`grid grid-cols-2 gap-2 ${
                        isExpert ? 'pt-1 border-t border-zinc-800' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onOpenCabinetBuilder();
                        }}
                        className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-emerald-500/45 bg-emerald-500/12 px-3 text-xs font-semibold text-emerald-200"
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
                          className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200"
                        >
                          <PenTool className="h-4 w-4 text-amber-400" />
                          <span>Szkic płyty 2D</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-1 border-t border-zinc-800">
                      <button
                        type="button"
                        onClick={onToggleSelectionScope}
                        className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                          selectionScope === 'group'
                            ? 'border-sky-500/60 bg-sky-500/15 text-sky-200'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-200'
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
                            ? 'border-amber-500/60 bg-amber-500/15 text-amber-300'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                        }`}
                      >
                        <Magnet className="h-4 w-4" />
                        <span>Magnes: {magneticSnap ? 'Wł.' : 'Wył.'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={onCycleSnap}
                        className="col-span-2 min-h-[42px] rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 font-mono-num"
                      >
                        Skok siatki: {snapMm > 0 ? `${snapMm} mm` : 'Bez siatki'}
                      </button>
                    </div>
                  </>
                )}

                {mobileTab === 'view' && (
                  <>
                    {/* Sliders */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-zinc-300 whitespace-nowrap w-20">
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
                          <span className="text-xs text-zinc-300 whitespace-nowrap w-20">
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
                    <div className="grid grid-cols-4 gap-1.5 pt-1">
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
                          className="min-h-[42px] rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-200 active:bg-zinc-800"
                        >
                          {cam.label}
                        </button>
                      ))}
                    </div>

                    {/* Visual Toggles (aligned 1:1 with Desktop Simple vs Expert) */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <button
                        type="button"
                        onClick={onCycleLighting}
                        className={`${
                          isExpert ? '' : 'col-span-2'
                        } flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200`}
                      >
                        <Sun className="h-4 w-4 text-amber-400" />
                        <span>Światło: {LIGHTING_LABELS[lighting]}</span>
                      </button>

                      {isExpert ? (
                        <>
                          <button
                            type="button"
                            onClick={onToggleLedUnderCabinet}
                            className={`flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                              ledUnderCabinet
                                ? 'border-amber-400/70 bg-amber-500/20 text-amber-200'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-200'
                            }`}
                          >
                            <Lightbulb className="h-4 w-4" />
                            <span>LED: {ledUnderCabinet ? 'Wł.' : 'Wył.'}</span>
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
                            <Ruler className="h-4 w-4" />
                            <span>Prześwity</span>
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
                            <Layers className="h-4 w-4" />
                            <span>Tryb RTG</span>
                          </button>
                          <button
                            type="button"
                            onClick={onToggleShowFasteners}
                            className="col-span-2 flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-200"
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
                            className={`col-span-2 flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border px-3 text-xs font-medium ${
                              assemblyStep > 0
                                ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-200'
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
                          className="col-span-2 flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 text-xs font-medium text-amber-300 active:bg-zinc-800"
                        >
                          <Sparkles className="h-3.5 w-3.5 shrink-0" />
                          <span>Włącz tryb Ekspert (RTG, LED, rozstrzał, montaż)</span>
                        </button>
                      )}
                    </div>
                  </>
                )}

                {mobileTab === 'project' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenPartsList();
                      }}
                      className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-100 active:bg-zinc-800"
                    >
                      <Layers className="h-4 w-4 text-amber-400 shrink-0" />
                      <span className="truncate">Drzewo sceny</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenMaterials();
                      }}
                      className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 text-xs font-semibold text-amber-200 active:bg-amber-500/20"
                    >
                      <Palette className="h-4 w-4 text-amber-400 shrink-0" />
                      <span className="truncate">Materiały i ceny</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenCutList();
                      }}
                      className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-100 active:bg-zinc-800"
                    >
                      <Scissors className="h-4 w-4 text-emerald-400 shrink-0" />
                      <span className="truncate">Rozkrój i PDF</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenTemplates();
                      }}
                      className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-100 active:bg-zinc-800"
                    >
                      <FolderOpen className="h-4 w-4 text-sky-400 shrink-0" />
                      <span className="truncate">Szablony i DIY</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onOpenProjects();
                      }}
                      className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-100 active:bg-zinc-800"
                    >
                      <FolderOpen className="h-4 w-4 text-zinc-400 shrink-0" />
                      <span className="truncate">Moje projekty</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMobileMenuOpen(false);
                        onSnapshot();
                      }}
                      className="flex min-h-[48px] items-center gap-2.5 rounded-xl border border-zinc-800 bg-zinc-900 px-3 text-xs font-medium text-zinc-100 active:bg-zinc-800"
                    >
                      <Camera className="h-4 w-4 text-zinc-300 shrink-0" />
                      <span className="truncate">Zapisz PNG</span>
                    </button>
                    {onOpenShortcuts && (
                      <button
                        type="button"
                        onClick={() => {
                          setMobileMenuOpen(false);
                          onOpenShortcuts();
                        }}
                        className="col-span-2 flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3 text-xs font-medium text-zinc-200 active:bg-zinc-800"
                      >
                        <HelpCircle className="h-4 w-4 text-sky-400 shrink-0" />
                        <span>Pomoc, skróty i gesty</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* Mobile Fixed Bottom Thumb Bar (5 ergonomic targets) */}
        <nav
          aria-label="Narzędzia projektowania"
          className="relative z-10 pointer-events-auto border-t border-zinc-800 bg-[#141518] px-1.5 pt-1 pb-[max(0.375rem,env(safe-area-inset-bottom))]"
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
              <span className="leading-none">Menu</span>
            </button>
          </div>
        </nav>
      </div>

      {/* =====================================================================
          DESKTOP SLIM 1-ROW BOTTOM VIEW & CONTEXT BAR (>= md)
      ===================================================================== */}
      <div
        className="hidden md:block fixed bottom-0 left-1/2 z-30 w-[min(980px,calc(100vw-136px))] pb-2.5 pointer-events-none transition-transform duration-200 ease-out"
        style={{
          transform: collapsed
            ? 'translate(-50%, calc(100% - 32px))'
            : 'translate(-50%, 0)',
        }}
      >
        <div className="flex justify-center pointer-events-auto">
          <button
            type="button"
            onClick={onToggleCollapse}
            className="flex items-center gap-1.5 rounded-t-lg border border-b-0 border-zinc-800 bg-[#141518] px-3 py-0.5 text-[11px] font-medium text-zinc-400 hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Pokaż lub ukryj pasek widoku (klawisz H)"
          >
            {collapsed ? (
              <>
                <ChevronUp className="h-3.5 w-3.5 text-amber-400" />
                <span>Widok i opcje</span>
              </>
            ) : (
              <>
                <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
                <span>Ukryj pasek</span>
              </>
            )}
          </button>
        </div>

        <div className="pointer-events-auto rounded-2xl border border-zinc-800 bg-[#141518]/[0.96] text-zinc-100 shadow-2xl px-3 py-2 backdrop-blur-md">
          {/* Contextual Selection / Tool Strip (Only rendered when active!) */}
          {showContextStrip && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/90 pb-2 text-xs">
              {selectedFastenerLabel ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Wrench className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  <span className="truncate font-medium text-zinc-200">
                    Łącznik: {selectedFastenerLabel}
                  </span>
                </div>
              ) : tool === 'screw' ? (
                <div className="flex items-center gap-2 min-w-0">
                  <Crosshair className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  <select
                    aria-label="Rodzaj wkrętu"
                    value={activeScrewType}
                    onChange={(e) => onChangeScrewType(e.target.value as ScrewType)}
                    className="h-7 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs font-medium text-zinc-100 focus:border-amber-500 focus:outline-none cursor-pointer"
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
                    className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium whitespace-nowrap cursor-pointer ${
                      screwJointsOnly
                        ? 'border-emerald-500/60 bg-emerald-500/15 text-emerald-300'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                    }`}
                  >
                    <Magnet className="h-3.5 w-3.5" />
                    <span>Tylko styki</span>
                  </button>
                  <button
                    type="button"
                    onClick={onAutoFasteners}
                    className="flex h-7 items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 px-2.5 text-xs font-medium text-amber-300 hover:bg-amber-500/25 whitespace-nowrap cursor-pointer"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Auto wkręty</span>
                  </button>
                </div>
              ) : tool === 'measure' ? (
                <div className="flex items-center gap-2 min-w-0 text-sky-300">
                  <Ruler className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">
                    Miarka 3D: kliknij 2 punkty w przestrzeni, aby zmierzyć dystans w mm
                  </span>
                </div>
              ) : selectedCount >= 2 ? (
                <div className="flex items-center gap-1 min-w-0 flex-wrap">
                  <span className="font-semibold text-amber-300 whitespace-nowrap mr-1">
                    {selectedInGroup ? `Grupa (${selectedCount})` : `${selectedCount} elem.`}
                  </span>
                  {selectedInGroup && (
                    <button
                      type="button"
                      onClick={onEnterSinglePartEdit}
                      title="Wejdź do wnętrza grupy, aby edytować pojedynczą płytę (lub kliknij 2× w 3D)"
                      className="h-7 rounded-md border border-sky-500/45 bg-sky-500/12 px-2 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20 mr-1 cursor-pointer whitespace-nowrap"
                    >
                      Edytuj pojedynczą płytę
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => onAlignSelected('left')}
                    title="Wyrównaj do lewej"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    <AlignStartVertical className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('centerX')}
                    title="Wyśrodkuj X"
                    className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    <AlignCenterHorizontal className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onAlignSelected('right')}
                    title="Wyrównaj do prawej"
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
                    title="Wyrównaj lico (+Z)"
                    className="h-7 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 text-[11px] font-medium text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                  >
                    Lico
                  </button>
                  {selectedCount >= 3 && !selectedInGroup && (
                    <>
                      <button
                        type="button"
                        onClick={() => onDistributeSelected('x')}
                        title="Rozmieść równomiernie X"
                        className="flex h-7 items-center gap-1 rounded-md border border-zinc-800 bg-zinc-900 px-1.5 text-[11px] text-zinc-300 hover:border-amber-500/60 hover:text-white cursor-pointer"
                      >
                        <AlignHorizontalDistributeCenter className="h-3.5 w-3.5" />
                        <span>X</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDistributeSelected('y')}
                        title="Rozmieść równomiernie Y"
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
                    {selectedPartName ?? `Wnętrze: ${activeGroupEditLabel}`}
                  </span>
                  {activeGroupEditLabel ? (
                    <button
                      type="button"
                      onClick={onExitGroupEdit}
                      className="rounded-md border border-sky-500/50 bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/25 cursor-pointer whitespace-nowrap"
                    >
                      ← Wyjdź z grupy
                    </button>
                  ) : selectedInGroup ? (
                    <button
                      type="button"
                      onClick={onSelectWholeGroup}
                      className="rounded-md border border-sky-500/40 bg-sky-500/12 px-2 py-0.5 text-[11px] font-medium text-sky-200 hover:bg-sky-500/20 cursor-pointer whitespace-nowrap"
                    >
                      Zaznacz całą grupę
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
                    className="flex h-7 items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-sky-400" />
                    <span>Wyczyść ({measurementsCount})</span>
                  </button>
                ) : selectedFastenerLabel ? (
                  <button
                    type="button"
                    onClick={onDeleteSelectedFastener}
                    className="flex h-7 items-center gap-1 rounded-lg bg-red-600/20 px-2.5 text-xs font-medium text-red-300 hover:bg-red-600/35 whitespace-nowrap cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Usuń łącznik</span>
                  </button>
                ) : selectedPartName && tool !== 'screw' ? (
                  <>
                    {selectedCount >= 2 && !selectedInGroup && (
                      <button
                        type="button"
                        onClick={onGroupSelected}
                        className="flex h-7 items-center gap-1 rounded-lg border border-sky-500/50 bg-sky-500/15 px-2 text-xs font-semibold text-sky-300 hover:bg-sky-500/25 whitespace-nowrap cursor-pointer"
                      >
                        <Group className="h-3.5 w-3.5" />
                        <span>Grupuj</span>
                      </button>
                    )}
                    {selectedCanUngroup && (
                      <button
                        type="button"
                        onClick={onUngroupSelected}
                        className="flex h-7 items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 whitespace-nowrap cursor-pointer"
                      >
                        <Ungroup className="h-3.5 w-3.5" />
                        <span>Rozgrupuj</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onToggleNudgePad}
                      title="Otwórz pad precyzyjnego przesuwania (±1 / 10 / 50 mm)"
                      className={`flex h-7 items-center gap-1 rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                        nudgePadOpen
                          ? 'border-amber-500 bg-amber-500/20 text-amber-300'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-amber-500/50'
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
                        className="flex h-7 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-xs font-medium text-zinc-200 hover:border-amber-500/50 whitespace-nowrap cursor-pointer"
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
                        className="flex h-7 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-xs font-medium text-zinc-200 hover:border-amber-500/50 whitespace-nowrap cursor-pointer"
                      >
                        <Copy className="h-3.5 w-3.5 text-zinc-400" />
                      </button>
                    )}
                    {onDropSelectedToFloor && (
                      <button
                        type="button"
                        onClick={onDropSelectedToFloor}
                        title="Postaw na podłodze (Y = 0)"
                        className="flex h-7 items-center gap-1 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-xs font-medium text-zinc-200 hover:border-amber-500/50 whitespace-nowrap cursor-pointer"
                      >
                        <ArrowDownToLine className="h-3.5 w-3.5 text-zinc-400" />
                      </button>
                    )}
                    {onDeleteSelected && (
                      <button
                        type="button"
                        onClick={onDeleteSelected}
                        title="Usuń (Delete)"
                        className="flex h-7 w-7 items-center justify-center rounded-lg border border-red-900/50 bg-red-950/35 text-red-300 hover:bg-red-900/50 cursor-pointer"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {canEditParametricCabinet && onEditParametricCabinet && (
                      <button
                        type="button"
                        onClick={onEditParametricCabinet}
                        className="flex h-7 items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-500/15 px-2.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 whitespace-nowrap cursor-pointer"
                      >
                        <LayoutPanelTop className="h-3.5 w-3.5" />
                        <span>Kreator</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={onOpenInspector}
                      className="flex h-7 items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap cursor-pointer"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span>Właściwości</span>
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          )}

          {/* Single Clean Bottom Row: Essential View Controls + Prosty/Ekspert Switch */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: Open Doors + (Expert) Exploded */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 w-[124px] lg:w-[140px]">
                <button
                  type="button"
                  onClick={() => onChangeOpenAmount(openAmount > 0.1 ? 0 : 1)}
                  className={`flex items-center gap-1 text-[11px] font-medium whitespace-nowrap cursor-pointer ${
                    openAmount > 0.05 ? 'text-amber-300' : 'text-zinc-300 hover:text-white'
                  }`}
                  title="Otwórz/zamknij fronty i szuflady (O)"
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

              {isExpert && (
                <div className="flex items-center gap-1.5 w-[128px] lg:w-[144px]">
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

            {/* Center: Precision & Visual Toggles */}
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={onToggleMagneticSnap}
                className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                  magneticSnap
                    ? 'bg-amber-500/15 text-amber-300'
                    : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                }`}
                title="Magnes — przyciąganie do krawędzi płyt (M)"
              >
                <Magnet className="h-3.5 w-3.5" />
                <span>Magnes</span>
              </button>

              <button
                type="button"
                onClick={onCycleSnap}
                className="h-8 rounded-lg px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white whitespace-nowrap cursor-pointer font-mono-num"
                title="Skok przyciągania do siatki"
              >
                {snapMm > 0 ? `${snapMm}mm` : '0mm'}
              </button>

              <button
                type="button"
                onClick={onCycleLighting}
                className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white whitespace-nowrap cursor-pointer"
                title="Oświetlenie sceny 3D"
              >
                <Sun className="h-3.5 w-3.5 text-amber-400" />
                <span>{LIGHTING_LABELS[lighting]}</span>
              </button>

              {isExpert && (
                <>
                  <button
                    type="button"
                    onClick={onToggleShowDimensions}
                    className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      showDimensions
                        ? 'bg-sky-500/15 text-sky-300'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Prześwity w świetle (D)"
                  >
                    <Ruler className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Prześwit</span>
                  </button>

                  <button
                    type="button"
                    onClick={onToggleXray}
                    className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      xrayMode
                        ? 'bg-amber-500/15 text-amber-300'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
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
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
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
                  </button>

                  <button
                    type="button"
                    onClick={onToggleAssemblyMode}
                    className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                      assemblyStep > 0
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                    }`}
                    title="Instrukcja montażu krok po kroku"
                  >
                    <ListOrdered className="h-3.5 w-3.5" />
                    <span className="hidden lg:inline">Montaż</span>
                  </button>
                </>
              )}
            </div>

            {/* Right: Simple / Expert Segmented Switch + Shortcuts */}
            <div className="flex items-center gap-1.5">
              <div
                className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5"
                title="Tryb Prosty ukrywa zaawansowane opcje warsztatowe (wkręty, RTG, CNC). Tryb Ekspert odblokowuje wszystko."
              >
                <button
                  type="button"
                  onClick={() => onChangeUiMode('simple')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    !isExpert
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Prosty
                </button>
                <button
                  type="button"
                  onClick={() => onChangeUiMode('expert')}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    isExpert
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
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
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
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
