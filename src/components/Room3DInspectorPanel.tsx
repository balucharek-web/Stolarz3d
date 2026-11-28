import React from 'react';
import {
  AppWindow,
  Columns2,
  DoorOpen,
  Eye,
  EyeOff,
  Flame,
  Home,
  Maximize2,
  Minimize2,
  Pencil,
  PlugZap,
  Plus,
  Scissors,
  SlidersHorizontal,
  Trash2,
  TriangleRight,
  X,
} from 'lucide-react';
import {
  DEFAULT_ROOM_CONFIG,
  DEFAULT_ROOM_STYLE,
  type FurniturePart,
  type RoomConfig,
  type RoomCutawayMode,
  type RoomOpening,
  type RoomOpeningType,
  type RoomWallObstacle,
  type RoomWallObstacleType,
  type RoomWallSlope,
} from '../types/furniture';
import {
  buildRoomPreset,
  computeRoomAreaM2,
  computeWallSegments,
  extrudeWallNotch,
  getEffectiveRoomWallSlopes,
  getRoomPolygonPoints,
  getRoomStyle,
  moveWallSegmentParallel,
  resizeWallSegmentLength,
  splitWallSegment,
  syncRoomWithPolygon,
  type RoomShapePresetId,
} from '../engine/roomGeometry';
import { NumericInput } from './NumericInput';

interface Room3DInspectorPanelProps {
  room: RoomConfig;
  parts: FurniturePart[];
  roomEditMode: boolean;
  selectedWallIndex: number | null;
  selectedSlopeWallIndex: number | null;
  selectedLegacySlope: boolean;
  onSelectWall: (wallIndex: number | null) => void;
  onSelectSlope: (wallIndex: number | null, isLegacy?: boolean) => void;
  onUpdateRoom: (nextRoom: RoomConfig, toastMsg?: string) => void;
  onOpen2DEditor: () => void;
  onClose: () => void;
}

const QUICK_PRESETS: Array<{ id: RoomShapePresetId; label: string }> = [
  { id: 'rectangle', label: 'Prostokąt' },
  { id: 'l_shape', label: 'Litera L' },
  { id: 'u_shape', label: 'Litera U' },
  { id: 'alcove', label: 'Wnęka' },
  { id: 'attic_single', label: 'Skos 1×' },
  { id: 'attic_gable', label: 'Skosy 2×' },
];

const CUTAWAY_MODES: Array<{ id: RoomCutawayMode; label: string }> = [
  { id: 'smart_cutaway', label: 'Przekrój' },
  { id: 'solid', label: 'Pełne' },
  { id: 'translucent', label: 'Szkic' },
];

export const Room3DInspectorPanel: React.FC<Room3DInspectorPanelProps> = ({
  room,
  parts,
  roomEditMode,
  selectedWallIndex,
  selectedSlopeWallIndex,
  selectedLegacySlope,
  onSelectWall,
  onSelectSlope,
  onUpdateRoom,
  onOpen2DEditor,
  onClose,
}) => {
  const pts = getRoomPolygonPoints(room);
  const segments = computeWallSegments(pts);
  const areaM2 = computeRoomAreaM2(pts);
  const style = getRoomStyle(room);
  const effectiveSlopes = getEffectiveRoomWallSlopes(room, segments);
  const hiddenSet = new Set<number>(room.hiddenWallIndices ?? []);

  const selectedWall =
    selectedWallIndex !== null ? segments[selectedWallIndex] ?? null : null;

  // Resolve active slope for editing (either directly selected slope or slope attached to selected wall)
  const activeSlope = (() => {
    if (selectedLegacySlope) {
      return effectiveSlopes.find((s) => s.isLegacy) ?? null;
    }
    if (selectedSlopeWallIndex !== null) {
      return effectiveSlopes.find((s) => s.wallIndex === selectedSlopeWallIndex) ?? null;
    }
    if (selectedWall) {
      return effectiveSlopes.find((s) => s.wallIndex === selectedWall.index) ?? null;
    }
    return null;
  })();

  const applyRoomPatch = (updater: (prev: RoomConfig) => RoomConfig, toast?: string) => {
    const updated = syncRoomWithPolygon(updater(room));
    onUpdateRoom(updated, toast);
  };

  /** Migrates legacy slopedCeiling into explicit wallSlopes array so per-wall edits stay seamless */
  const materializeSlopes = (prev: RoomConfig): RoomWallSlope[] => {
    if (prev.wallSlopes && prev.wallSlopes.length > 0) {
      return prev.wallSlopes.map((s) => ({ ...s }));
    }
    const resolved = getEffectiveRoomWallSlopes(prev);
    return resolved
      .filter((s) => s.wallIndex !== null)
      .map((s) => ({
        wallIndex: s.wallIndex as number,
        kneeWallHeightMm: Math.round(s.kneeWallHeightMm),
        slopeDepthMm: Math.round(s.slopeDepthMm),
      }));
  };

  const toggleWallSlope = (wallIdx: number) => {
    applyRoomPatch((prev) => {
      const list = materializeSlopes(prev);
      const exists = list.some((s) => s.wallIndex === wallIdx);
      const nextList = exists
        ? list.filter((s) => s.wallIndex !== wallIdx)
        : [
            ...list,
            {
              wallIndex: wallIdx,
              kneeWallHeightMm: Math.min(1250, Math.max(400, prev.heightMm - 700)),
              slopeDepthMm: 1600,
            },
          ];
      return {
        ...prev,
        slopedCeiling: { ...prev.slopedCeiling, enabled: false },
        wallSlopes: nextList,
      };
    });
  };

  const updateWallSlope = (
    wallIdx: number,
    patch: Partial<Pick<RoomWallSlope, 'kneeWallHeightMm' | 'slopeDepthMm'>>
  ) => {
    applyRoomPatch((prev) => {
      const list = materializeSlopes(prev);
      const has = list.some((s) => s.wallIndex === wallIdx);
      const nextList = has
        ? list.map((s) => (s.wallIndex === wallIdx ? { ...s, ...patch } : s))
        : [
            ...list,
            {
              wallIndex: wallIdx,
              kneeWallHeightMm: patch.kneeWallHeightMm ?? 1250,
              slopeDepthMm: patch.slopeDepthMm ?? 1600,
            },
          ];
      return {
        ...prev,
        slopedCeiling: { ...prev.slopedCeiling, enabled: false },
        wallSlopes: nextList,
      };
    });
  };

  const updateSlopeByAngle = (wallIdx: number, angleDeg: number, kneeWallHeightMm: number) => {
    const clampedAngle = Math.max(12, Math.min(72, angleDeg));
    const rise = Math.max(150, room.heightMm - kneeWallHeightMm);
    const rad = (clampedAngle * Math.PI) / 180;
    const nextDepth = Math.round(Math.max(250, Math.min(6000, rise / Math.tan(rad))));
    updateWallSlope(wallIdx, { slopeDepthMm: nextDepth });
  };

  const addOpeningToWall = (wallIdx: number, type: RoomOpeningType) => {
    const seg = segments[wallIdx];
    if (!seg) return;
    const defaults: Record<
      RoomOpeningType,
      { label: string; w: number; h: number; sill: number }
    > = {
      door_single: { label: 'Drzwi 90', w: 900, h: 2050, sill: 0 },
      door_double: { label: 'Drzwi podwójne', w: 1500, h: 2050, sill: 0 },
      window: { label: 'Okno 120', w: 1200, h: 1350, sill: 880 },
      window_balcony: { label: 'Okno balkonowe', w: 1400, h: 2150, sill: 0 },
      arch: { label: 'Przejście', w: 1100, h: 2150, sill: 0 },
    };
    const d = defaults[type];
    const widthMm = Math.min(d.w, Math.max(350, Math.round(seg.lengthMm - 200)));
    const offsetMm = Math.max(60, Math.round((seg.lengthMm - widthMm) / 2));
    const nextOpening: RoomOpening = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type,
      label: d.label,
      wallIndex: wallIdx,
      offsetMm,
      widthMm,
      heightMm: Math.min(d.h, Math.max(400, room.heightMm - d.sill - 120)),
      sillHeightMm: d.sill,
      swingInward: true,
      hingeSide: 'left',
    };
    applyRoomPatch(
      (prev) => ({
        ...prev,
        openings: [...(prev.openings ?? []), nextOpening],
      }),
      `Dodano: ${d.label}`
    );
  };

  const addObstacleToWall = (wallIdx: number, type: RoomWallObstacleType) => {
    const seg = segments[wallIdx];
    if (!seg) return;
    const isRad = type === 'radiator';
    const widthMm = isRad ? Math.min(1000, Math.max(400, Math.round(seg.lengthMm - 200))) : 160;
    const nextObs: RoomWallObstacle = {
      id: `wobs_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type,
      label: isRad ? 'Grzejnik' : 'Gniazdko 230V',
      wallIndex: wallIdx,
      offsetMm: Math.max(60, Math.round((seg.lengthMm - widthMm) / 2)),
      elevationMm: isRad ? 150 : 300,
      widthMm,
      heightMm: isRad ? 600 : 90,
      depthMm: isRad ? 120 : 25,
    };
    applyRoomPatch(
      (prev) => ({
        ...prev,
        wallObstacles: [...(prev.wallObstacles ?? []), nextObs],
      }),
      `Dodano: ${nextObs.label}`
    );
  };

  const applyQuickPreset = (presetId: RoomShapePresetId) => {
    const built = buildRoomPreset(presetId, parts, room.heightMm);
    const nextRoom = syncRoomWithPolygon({
      ...DEFAULT_ROOM_CONFIG,
      ...room,
      enabled: true,
      floorPoints: built.floorPoints,
      openings: built.openings,
      wallObstacles: built.wallObstacles,
      hiddenWallIndices: [],
      slopedCeiling: built.slopedCeiling ?? {
        ...room.slopedCeiling,
        enabled: false,
      },
      wallSlopes: built.wallSlopes ?? [],
      style: getRoomStyle(room),
    });
    onSelectWall(null);
    onSelectSlope(null, false);
    onUpdateRoom(nextRoom, 'Zastosowano układ pomieszczenia 3D');
  };

  // Editing target wall index for slope controls
  const slopeTargetWallIdx =
    activeSlope && activeSlope.wallIndex !== null
      ? activeSlope.wallIndex
      : selectedWall
        ? selectedWall.index
        : null;

  const isSelectedWallHidden =
    selectedWall !== null && hiddenSet.has(selectedWall.index);

  return (
    <aside
      aria-label="Edycja ścian i skosów 3D"
      className="fixed right-3 top-[58px] md:top-[62px] bottom-[84px] md:bottom-4 z-30 w-[min(336px,calc(100vw-24px))] flex flex-col rounded-2xl border border-white/[0.11] bg-[#141519]/95 text-zinc-100 shadow-2xl backdrop-blur-md overflow-hidden"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3.5 py-2.5 shrink-0">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-white">
            <Home className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="truncate">
              {selectedWall
                ? selectedWall.label
                : activeSlope
                  ? activeSlope.label
                  : 'Ściany i skosy 3D'}
            </span>
          </div>
          <div className="text-[11px] text-zinc-400 font-mono-num truncate">
            {room.enabled
              ? `${areaM2.toFixed(2).replace('.', ',')} m² · ${segments.length} ścian · wys. ${room.heightMm} mm`
              : 'Pomieszczenie wyłączone'}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.08] hover:text-white cursor-pointer shrink-0"
          aria-label="Zamknij panel ścian 3D"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="cad-scroll flex-1 overflow-y-auto p-3.5 space-y-4">
        {!room.enabled ? (
          <div className="space-y-3">
            <p className="text-xs text-zinc-300 leading-relaxed">
              Włącz pomieszczenie, aby klikać i edytować ściany, wnęki oraz skosy dachu bezpośrednio w widoku 3D.
            </p>
            <button
              type="button"
              onClick={() =>
                onUpdateRoom(
                  syncRoomWithPolygon({ ...room, enabled: true }),
                  'Włączono pomieszczenie 3D'
                )
              }
              className="w-full min-h-[38px] rounded-xl bg-amber-500 text-xs font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer"
            >
              Włącz pomieszczenie 3D
            </button>
          </div>
        ) : (
          <>
            {/* Interactive Hint when no wall/slope selected */}
            {!selectedWall && !activeSlope && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2 text-[11px] text-amber-200 leading-snug">
                {roomEditMode
                  ? 'Kliknij dowolną ścianę lub skos w widoku 3D (albo wybierz z listy poniżej), aby zmienić wymiary, dodać wykusz, wnękę lub skos dachu.'
                  : 'Kliknij ścianę lub skos na scenie 3D, aby rozpocząć edycję.'}
              </div>
            )}

            {/* 1. SELECTED WALL DIRECT 3D EDITOR */}
            {selectedWall && (
              <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/[0.06] p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-amber-300 truncate">
                    {selectedWall.label}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextHidden = new Set(room.hiddenWallIndices ?? []);
                      if (isSelectedWallHidden) nextHidden.delete(selectedWall.index);
                      else nextHidden.add(selectedWall.index);
                      applyRoomPatch((prev) => ({
                        ...prev,
                        hiddenWallIndices: Array.from(nextHidden),
                      }));
                    }}
                    className="flex items-center gap-1 rounded-md border border-white/[0.1] bg-zinc-900/90 px-2 py-1 text-[11px] text-zinc-200 hover:border-amber-500/50 cursor-pointer"
                  >
                    {isSelectedWallHidden ? (
                      <>
                        <EyeOff className="h-3 w-3 text-zinc-400" />
                        <span>Ukryta</span>
                      </>
                    ) : (
                      <>
                        <Eye className="h-3 w-3 text-emerald-400" />
                        <span>Widoczna</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Wall length */}
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Długość ściany (mm)</span>
                  <NumericInput
                    min={300}
                    max={20000}
                    step={50}
                    showSteppers
                    value={Math.round(selectedWall.lengthMm)}
                    onChange={(val) =>
                      applyRoomPatch((prev) => ({
                        ...prev,
                        floorPoints: resizeWallSegmentLength(
                          getRoomPolygonPoints(prev),
                          selectedWall.index,
                          val
                        ),
                      }))
                    }
                  />
                </label>

                {/* Push / Pull Wall Position in 3D */}
                <div className="space-y-1">
                  <span className="text-[11px] text-zinc-400">
                    Przesuń ścianę (zmień głębokość pokoju)
                  </span>
                  <div className="grid grid-cols-4 gap-1">
                    {[-500, -100, 100, 500].map((delta) => (
                      <button
                        key={delta}
                        type="button"
                        onClick={() =>
                          onUpdateRoom(
                            moveWallSegmentParallel(room, selectedWall.index, delta)
                          )
                        }
                        className="min-h-[32px] rounded-lg border border-zinc-700 bg-zinc-900 text-[11px] font-mono-num text-zinc-200 hover:border-amber-500/60 hover:text-amber-300 cursor-pointer"
                        title={
                          delta > 0
                            ? `Odsuń ścianę na zewnątrz o ${delta} mm`
                            : `Dosuń ścianę do środka o ${Math.abs(delta)} mm`
                        }
                      >
                        {delta > 0 ? `+${delta}` : delta}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 1-Click Architectural Shape Modifiers */}
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRoom(
                        extrudeWallNotch(room, selectedWall.index, 600),
                        'Dodano wykusz (+600 mm)'
                      )
                    }
                    disabled={selectedWall.lengthMm < 900 || pts.length > 20}
                    className="flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:border-amber-500/60 hover:text-amber-300 disabled:opacity-40 cursor-pointer"
                    title="Wysuń środkową część ściany na zewnątrz o 600 mm (wykusz / wnęka na szafę)"
                  >
                    <Maximize2 className="h-3 w-3 shrink-0" />
                    <span>Wykusz</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRoom(
                        extrudeWallNotch(room, selectedWall.index, -600),
                        'Dodano występ / filar (-600 mm)'
                      )
                    }
                    disabled={selectedWall.lengthMm < 900 || pts.length > 20}
                    className="flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:border-amber-500/60 hover:text-amber-300 disabled:opacity-40 cursor-pointer"
                    title="Wsuń środkową część ściany do wnętrza o 600 mm (komin / filar)"
                  >
                    <Minimize2 className="h-3 w-3 shrink-0" />
                    <span>Filar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateRoom(
                        splitWallSegment(room, selectedWall.index),
                        'Podzielono ścianę w połowie'
                      )
                    }
                    disabled={pts.length >= 24}
                    className="flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:border-amber-500/60 hover:text-amber-300 disabled:opacity-40 cursor-pointer"
                    title="Wstaw narożnik w połowie ściany"
                  >
                    <Scissors className="h-3 w-3 shrink-0" />
                    <span>Podziel</span>
                  </button>
                </div>

                {/* Quick Openings & Installations right in 3D */}
                <div className="space-y-1.5 pt-1 border-t border-white/[0.08]">
                  <span className="text-[11px] text-zinc-400">Dodaj na tej ścianie</span>
                  <div className="flex flex-wrap gap-1">
                    <button
                      type="button"
                      onClick={() => addOpeningToWall(selectedWall.index, 'door_single')}
                      className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                    >
                      <DoorOpen className="h-3 w-3" /> Drzwi
                    </button>
                    <button
                      type="button"
                      onClick={() => addOpeningToWall(selectedWall.index, 'window')}
                      className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                    >
                      <AppWindow className="h-3 w-3" /> Okno
                    </button>
                    <button
                      type="button"
                      onClick={() => addOpeningToWall(selectedWall.index, 'window_balcony')}
                      className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                    >
                      <Columns2 className="h-3 w-3" /> Balkon
                    </button>
                    <button
                      type="button"
                      onClick={() => addObstacleToWall(selectedWall.index, 'radiator')}
                      className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                    >
                      <Flame className="h-3 w-3" /> Grzejnik
                    </button>
                    <button
                      type="button"
                      onClick={() => addObstacleToWall(selectedWall.index, 'socket')}
                      className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                    >
                      <PlugZap className="h-3 w-3" /> 230V
                    </button>
                  </div>
                </div>

                {/* Per-Wall Roof Slope Toggle */}
                <div className="pt-2 border-t border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => toggleWallSlope(selectedWall.index)}
                    className={`w-full flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      activeSlope && activeSlope.wallIndex === selectedWall.index
                        ? 'border border-red-500/40 bg-red-950/40 text-red-200 hover:bg-red-900/50'
                        : 'bg-amber-500 text-zinc-950 hover:bg-amber-400'
                    }`}
                  >
                    <TriangleRight className="h-3.5 w-3.5" />
                    <span>
                      {activeSlope && activeSlope.wallIndex === selectedWall.index
                        ? 'Usuń skos z tej ściany'
                        : 'Dodaj skos dachu na tej ścianie'}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* 2. ACTIVE ROOF SLOPE EDITOR (for clicked slope or selected wall's slope) */}
            {activeSlope && slopeTargetWallIdx !== null && (
              <div className="space-y-3 rounded-xl border border-sky-500/40 bg-sky-500/[0.07] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300 truncate">
                    <TriangleRight className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{activeSlope.label}</span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] font-mono-num text-sky-200">
                      {activeSlope.angleDeg.toFixed(0)}°
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        toggleWallSlope(slopeTargetWallIdx);
                        onSelectSlope(null, false);
                      }}
                      className="p-1 text-zinc-400 hover:text-red-400 cursor-pointer"
                      title="Usuń ten skos dachu"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Knee Wall Height */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300">Ścianka kolankowa</span>
                    <span className="font-mono-num text-white">
                      {Math.round(activeSlope.kneeWallHeightMm)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={Math.max(500, room.heightMm - 150)}
                    step={25}
                    value={Math.round(activeSlope.kneeWallHeightMm)}
                    onChange={(e) =>
                      updateWallSlope(slopeTargetWallIdx, {
                        kneeWallHeightMm: Number(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </div>

                {/* Slope Depth */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300">Głębokość skosu</span>
                    <span className="font-mono-num text-white">
                      {Math.round(activeSlope.slopeDepthMm)} mm
                    </span>
                  </div>
                  <input
                    type="range"
                    min={300}
                    max={Math.max(1200, Math.min(5000, Math.max(room.widthMm, room.depthMm)))}
                    step={25}
                    value={Math.round(activeSlope.slopeDepthMm)}
                    onChange={(e) =>
                      updateWallSlope(slopeTargetWallIdx, {
                        slopeDepthMm: Number(e.target.value),
                      })
                    }
                    className="w-full accent-sky-400 cursor-pointer"
                  />
                </div>

                {/* Roof Pitch Angle */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-zinc-300">Kąt połaci dachu</span>
                    <span className="font-mono-num text-white">
                      {activeSlope.angleDeg.toFixed(1)}°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={68}
                    step={1}
                    value={Math.round(activeSlope.angleDeg)}
                    onChange={(e) =>
                      updateSlopeByAngle(
                        slopeTargetWallIdx,
                        Number(e.target.value),
                        activeSlope.kneeWallHeightMm
                      )
                    }
                    className="w-full accent-amber-400 cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* 3. QUICK ROOM HEIGHT, CUTAWAY & PRESETS */}
            <div className="space-y-2.5 border-t border-white/[0.08] pt-3">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-zinc-300">
                <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-400" />
                <span>Parametry pomieszczenia</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Wysokość (mm)</span>
                  <NumericInput
                    min={1600}
                    max={4500}
                    step={50}
                    showSteppers
                    value={room.heightMm}
                    onChange={(val) => applyRoomPatch((prev) => ({ ...prev, heightMm: val }))}
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Grubość ścian</span>
                  <NumericInput
                    min={60}
                    max={360}
                    step={20}
                    showSteppers
                    value={room.wallThicknessMm ?? 120}
                    onChange={(val) =>
                      applyRoomPatch((prev) => ({ ...prev, wallThicknessMm: val }))
                    }
                  />
                </label>
              </div>

              {/* 3D Cutaway Mode */}
              <div className="grid grid-cols-3 gap-1">
                {CUTAWAY_MODES.map((m) => {
                  const active = style.wallCutawayMode === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() =>
                        applyRoomPatch((prev) => ({
                          ...prev,
                          style: { ...(prev.style ?? DEFAULT_ROOM_STYLE), wallCutawayMode: m.id },
                        }))
                      }
                      className={`min-h-[30px] rounded-lg text-[11px] font-medium transition-colors cursor-pointer ${
                        active
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                      }`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>

              <label className="flex items-center justify-between text-xs text-zinc-300 cursor-pointer pt-0.5">
                <span>Pokaż płaski sufit</span>
                <input
                  type="checkbox"
                  checked={room.showCeiling}
                  onChange={(e) =>
                    applyRoomPatch((prev) => ({ ...prev, showCeiling: e.target.checked }))
                  }
                  className="h-4 w-4 accent-amber-500"
                />
              </label>
            </div>

            {/* 4. WALL LIST FOR INSTANT SELECTION + SLOPE TOGGLE */}
            <div className="space-y-1.5 border-t border-white/[0.08] pt-3">
              <div className="flex items-center justify-between text-[11px] font-semibold text-zinc-300">
                <span>Ściany ({segments.length})</span>
                <span className="font-normal text-zinc-500">Kliknij, aby edytować</span>
              </div>
              <div className="space-y-1">
                {segments.map((seg) => {
                  const isSel = selectedWallIndex === seg.index;
                  const hasSlope = effectiveSlopes.some((s) => s.wallIndex === seg.index);
                  return (
                    <div
                      key={seg.index}
                      onClick={() => {
                        onSelectSlope(null, false);
                        onSelectWall(seg.index);
                      }}
                      className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                        isSel
                          ? 'bg-amber-500/20 text-amber-200 border border-amber-500/40'
                          : 'bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800/80 border border-transparent'
                      }`}
                    >
                      <span className="truncate font-medium">{seg.label}</span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {hasSlope && (
                          <span className="text-[10px] font-semibold text-sky-300">SKOS</span>
                        )}
                        <span className="font-mono-num text-[11px] text-zinc-400">
                          {Math.round(seg.lengthMm)} mm
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 5. 1-CLICK ROOM SHAPE PRESETS RIGHT FROM 3D */}
            <div className="space-y-1.5 border-t border-white/[0.08] pt-3">
              <span className="text-[11px] font-semibold text-zinc-300">
                Szybki kształt pokoju
              </span>
              <div className="grid grid-cols-3 gap-1">
                {QUICK_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => applyQuickPreset(p.id)}
                    className="min-h-[32px] rounded-lg border border-zinc-800 bg-zinc-900/80 px-1.5 text-[11px] font-medium text-zinc-200 hover:border-amber-500/50 hover:text-amber-300 transition-colors cursor-pointer truncate"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* Footer: Jump to 2D Freehand Drawing */}
      <div className="border-t border-white/[0.08] bg-[#111216] p-2.5 flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={onOpen2DEditor}
          className="flex-1 flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
        >
          <Pencil className="h-3.5 w-3.5" />
          <span>Rysuj rzut 2D</span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="min-h-[36px] rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 cursor-pointer"
        >
          Gotowe
        </button>
      </div>
    </aside>
  );
};
