import React, { useEffect, useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  DrawerSlideType,
  Fastener,
  FurniturePart,
  HandleStyle,
  MATERIAL_CATALOG,
  MaterialId,
  RoomConfig,
  SCREW_CATALOG,
  ScrewType,
  SurfaceFinish,
} from '../types/furniture';
import {
  buildParametricCabinet,
  CABINET_PRESETS,
  computeSmartCabinetPlacement,
  type CabinetPlacementMode,
  type CabinetPresetId,
  type ParametricCabinetConfig,
} from '../engine/parametric';
import { computeProjectWeightSummary } from '../engine/carpentry';
import { CabinetSideSectionSvg } from './CabinetPreviewSvg';
import { NumericInput } from './NumericInput';

interface CabinetBuilderModalProps {
  open: boolean;
  existingParts: FurniturePart[];
  selectedPartId: string | null;
  room?: RoomConfig;
  editingCabinet?: { groupId: string; config: ParametricCabinetConfig } | null;
  onClose: () => void;
  onInsertCabinet: (
    parts: FurniturePart[],
    fasteners: Fastener[],
    groupName: string,
    config: ParametricCabinetConfig
  ) => void;
  onUpdateCabinet?: (groupId: string, config: ParametricCabinetConfig) => void;
}

const PRESET_ORDER: CabinetPresetId[] = [
  'base_kitchen',
  'sink_cabinet',
  'oven_tower',
  'dishwasher_bay',
  'corner_l',
  'drawer_chest',
  'wall_cabinet',
  'wardrobe',
  'sliding_wardrobe',
  'tv_console',
  'steel_rack',
];

const PLACEMENT_OPTIONS: Array<{ id: CabinetPlacementMode; label: string }> = [
  { id: 'auto', label: 'Auto (w ciągu)' },
  { id: 'right', label: 'Z prawej' },
  { id: 'left', label: 'Z lewej' },
  { id: 'back_wall', label: 'Ściana tylna' },
  { id: 'center', label: 'Środek (0,0)' },
];

export const CabinetBuilderModal: React.FC<CabinetBuilderModalProps> = ({
  open,
  existingParts,
  selectedPartId,
  room,
  editingCabinet,
  onClose,
  onInsertCabinet,
  onUpdateCabinet,
}) => {
  const [cfg, setCfg] = useState<ParametricCabinetConfig>(() =>
    structuredClone(CABINET_PRESETS.base_kitchen.config)
  );
  const [placementMode, setPlacementMode] = useState<CabinetPlacementMode>('auto');
  const [previewView, setPreviewView] = useState<'front' | 'side'>('front');

  useEffect(() => {
    if (!open) return;
    if (editingCabinet) {
      setCfg(structuredClone(editingCabinet.config));
    } else {
      setPlacementMode('auto');
    }
  }, [open, editingCabinet]);

  const placementPreview = useMemo(
    () =>
      editingCabinet
        ? null
        : computeSmartCabinetPlacement(
            cfg,
            existingParts,
            selectedPartId,
            room,
            placementMode
          ),
    [cfg, existingParts, selectedPartId, room, placementMode, editingCabinet]
  );

  const previewSummary = useMemo(() => {
    const t = cfg.boardThicknessMm;
    const innerW = Math.max(80, cfg.widthMm - 2 * t);
    const bodyH = Math.max(
      120,
      cfg.heightMm - (cfg.plinthStyle === 'none' ? 0 : cfg.plinthHeightMm)
    );
    const slideClearance =
      cfg.slideType === 'undermount_blum' ? 10 : cfg.slideType === 'ball_26mm' ? 26 : 14;
    const drawerBoxW = Math.max(60, innerW - slideClearance);
    const isHybrid =
      cfg.preset !== 'sliding_wardrobe' &&
      cfg.preset !== 'corner_l' &&
      cfg.preset !== 'oven_tower' &&
      cfg.preset !== 'sink_cabinet' &&
      cfg.preset !== 'dishwasher_bay' &&
      cfg.drawerCount > 0 &&
      (cfg.shelfCount > 0 || Boolean(cfg.addWardrobeRod) || cfg.doorMode !== 'none') &&
      bodyH >= 900;
    const builtPreview = buildParametricCabinet({ ...cfg, autoFasteners: false }, 0, 0);
    const weight = computeProjectWeightSummary(builtPreview.parts);
    return {
      innerW,
      bodyH,
      drawerBoxW,
      isHybrid,
      totalWeightKg: weight.totalWeightKg,
      flapRec: weight.flapRecommendations[0]?.recommendedLift ?? null,
    };
  }, [cfg]);

  if (!open) return null;

  const isEditing = Boolean(editingCabinet && onUpdateCabinet);

  const selectPreset = (presetId: CabinetPresetId) => {
    setCfg(structuredClone(CABINET_PRESETS[presetId].config));
  };

  const patch = (next: Partial<ParametricCabinetConfig>) =>
    setCfg((prev) => ({ ...prev, ...next }));

  const handleSubmit = () => {
    const snapshot = structuredClone(cfg);
    if (isEditing && editingCabinet && onUpdateCabinet) {
      onUpdateCabinet(editingCabinet.groupId, snapshot);
      onClose();
      return;
    }
    const offX = placementPreview?.offsetXmm ?? 0;
    const offZ = placementPreview?.offsetZmm ?? 0;
    const { parts, fasteners, groupId } = buildParametricCabinet(snapshot, offX, offZ);
    onInsertCabinet(parts, fasteners, groupId, snapshot);
    onClose();
  };

  const isSliding = cfg.preset === 'sliding_wardrobe';
  const isCorner = cfg.preset === 'corner_l';
  const isSteelRack = cfg.preset === 'steel_rack';
  const isOvenTower = cfg.preset === 'oven_tower';
  const isSinkCabinet = cfg.preset === 'sink_cabinet';
  const isDishwasher = cfg.preset === 'dishwasher_bay';
  const isAgdPreset = isOvenTower || isSinkCabinet || isDishwasher;

  // Live 2D SVG schematic dimensions
  const totalDrawH = cfg.heightMm + (cfg.addCountertop ? 38 : 0);
  const pad = 120;
  const vbW = cfg.widthMm + pad * 2;
  const vbH = totalDrawH + pad * 2;
  const plinthH = cfg.plinthStyle === 'none' ? 0 : cfg.plinthHeightMm;
  const topOffset = cfg.addCountertop ? 38 : 0;
  const bodyH = Math.max(100, cfg.heightMm - plinthH);
  const divCount = isCorner ? 0 : cfg.verticalDividers;
  const drawZoneH = previewSummary.isHybrid ? bodyH * 0.42 : bodyH;
  const upperZoneH = previewSummary.isHybrid ? bodyH - drawZoneH : bodyH;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full sm:max-w-4xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              {isEditing
                ? `Edycja parametryczna: ${editingCabinet?.config.name ?? cfg.name}`
                : 'Kreator parametrycznych szafek, szaf przesuwnych i regałów'}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              {isEditing
                ? 'Zmień liczbę szuflad, półek, frontów, cokołu lub materiały — szafka przebuduje się w miejscu z zachowaniem pozycji.'
                : 'Auto-dostawianie w ciągu zabudowy, trawersy, strefy hybrydowe, dno Blum −13 mm, regały stal+OSB i System 32'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
            aria-label="Zamknij kreator szafki"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="cad-scroll flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* 8 Presets Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {PRESET_ORDER.map((pid) => {
              const p = CABINET_PRESETS[pid];
              const active = cfg.preset === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => selectPreset(pid)}
                  className={`rounded-xl border px-2.5 py-2 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-amber-500 bg-amber-500/15 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-[11px] font-semibold truncate">{p.label}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-400 font-mono-num truncate">
                    {p.config.widthMm}×{p.config.heightMm}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 sm:gap-5 items-start">
            {/* Left: Live 2D Orthographic Front Blueprint (sticky on mobile & desktop!) */}
            <div className="md:col-span-5 sticky top-0 z-10 bg-[#141518] pb-2 md:pb-0 flex flex-col gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/95 p-2.5 sm:p-3 shadow-md md:shadow-none">
                <div className="flex items-center justify-between gap-2 text-[11px] text-zinc-400 mb-1.5 sm:mb-2">
                  <div className="flex items-center gap-0.5 rounded-lg bg-zinc-900 p-0.5 border border-zinc-800">
                    <button
                      type="button"
                      onClick={() => setPreviewView('front')}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
                        previewView === 'front'
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Przód
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewView('side')}
                      className={`rounded-md px-2 py-0.5 text-[10px] font-medium cursor-pointer transition-colors ${
                        previewView === 'side'
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'text-zinc-400 hover:text-white'
                      }`}
                    >
                      Przekrój (gł.)
                    </button>
                  </div>
                  <span className="font-mono-num text-amber-300">
                    Światło: {previewSummary.innerW} mm
                  </span>
                </div>
                {previewView === 'side' ? (
                  <CabinetSideSectionSvg
                    cfg={cfg}
                    bodyHeightMm={bodyH}
                    isHybrid={previewSummary.isHybrid}
                  />
                ) : (
                <svg
                  viewBox={`0 0 ${vbW} ${vbH}`}
                  className="w-full h-auto max-h-[155px] sm:max-h-[240px] rounded-lg bg-[#1A1C22]"
                >
                  {/* Optional Countertop */}
                  {cfg.addCountertop && (
                    <rect
                      x={pad - 8}
                      y={pad}
                      width={cfg.widthMm + 16}
                      height={38}
                      fill="#94A3B8"
                      fillOpacity={0.35}
                      stroke="#CBD5E1"
                      strokeWidth={6}
                    />
                  )}

                  {/* Main Corpus Box or Steel Rack Posts */}
                  {isSteelRack ? (
                    <>
                      {Array.from({ length: divCount + 2 }).map((_, idx) => {
                        const px = pad + (idx / (divCount + 1)) * (cfg.widthMm - 40);
                        return (
                          <rect
                            key={`post_${idx}`}
                            x={px}
                            y={pad}
                            width={40}
                            height={cfg.heightMm}
                            fill="#334155"
                            stroke="#94A3B8"
                            strokeWidth={6}
                          />
                        );
                      })}
                      {Array.from({ length: Math.max(2, cfg.shelfCount + 1) }).map((_, idx, arr) => {
                        const y =
                          pad +
                          11 +
                          (idx / Math.max(1, arr.length - 1)) *
                            Math.max(100, cfg.heightMm - 120);
                        return (
                          <line
                            key={`rsh_${idx}`}
                            x1={pad + 40}
                            y1={y}
                            x2={pad + cfg.widthMm - 40}
                            y2={y}
                            stroke="#F59E0B"
                            strokeWidth={cfg.boardThicknessMm}
                          />
                        );
                      })}
                    </>
                  ) : (
                    <>
                      <rect
                        x={pad}
                        y={pad + topOffset}
                        width={cfg.widthMm}
                        height={bodyH}
                        fill="#3F3F46"
                        fillOpacity={0.28}
                        stroke="#F59E0B"
                        strokeWidth={6}
                      />

                      {/* Vertical Dividers */}
                      {divCount > 0 &&
                        Array.from({ length: divCount }).map((_, idx) => {
                          const x = pad + ((idx + 1) / (divCount + 1)) * cfg.widthMm;
                          return (
                            <line
                              key={`div_${idx}`}
                              x1={x}
                              y1={pad + topOffset + cfg.boardThicknessMm}
                              x2={x}
                              y2={pad + topOffset + upperZoneH - cfg.boardThicknessMm}
                              stroke="#A1A1AA"
                              strokeWidth={cfg.boardThicknessMm}
                            />
                          );
                        })}

                      {/* Internal Shelves */}
                      {(cfg.drawerCount === 0 || previewSummary.isHybrid) &&
                        Array.from({ length: cfg.shelfCount }).map((_, idx) => {
                          const y =
                            pad +
                            topOffset +
                            ((idx + 1) / (cfg.shelfCount + 1)) * upperZoneH;
                          return (
                            <line
                              key={`sh_${idx}`}
                              x1={pad + cfg.boardThicknessMm}
                              y1={y}
                              x2={pad + cfg.widthMm - cfg.boardThicknessMm}
                              y2={y}
                              stroke="#94A3B8"
                              strokeWidth={cfg.boardThicknessMm}
                              strokeDasharray="18 10"
                            />
                          );
                        })}
                    </>
                  )}

                  {/* Drawers (Full or Bottom Hybrid Zone) */}
                  {!isSliding &&
                    !isCorner &&
                    cfg.drawerCount > 0 &&
                    Array.from({ length: cfg.drawerCount }).map((_, idx) => {
                      const gap = cfg.frontGapMm;
                      const zoneTop = previewSummary.isHybrid
                        ? pad + topOffset + upperZoneH
                        : pad + topOffset;
                      const eachH =
                        (drawZoneH - gap * (cfg.drawerCount + 1)) / cfg.drawerCount;
                      const y = zoneTop + gap + idx * (eachH + gap);
                      return (
                        <g key={`dr_${idx}`}>
                          <rect
                            x={pad + gap}
                            y={y}
                            width={cfg.widthMm - gap * 2}
                            height={Math.max(20, eachH)}
                            fill="#F59E0B"
                            fillOpacity={0.14}
                            stroke="#FBBF24"
                            strokeWidth={5}
                          />
                          {cfg.handleStyle === 'bar' && (
                            <line
                              x1={pad + cfg.widthMm * 0.4}
                              y1={y + Math.min(40, eachH * 0.25)}
                              x2={pad + cfg.widthMm * 0.6}
                              y2={y + Math.min(40, eachH * 0.25)}
                              stroke="#E4E4E7"
                              strokeWidth={8}
                              strokeLinecap="round"
                            />
                          )}
                        </g>
                      );
                    })}

                  {/* Sliding Doors */}
                  {isSliding && (
                    <>
                      <rect
                        x={pad + cfg.boardThicknessMm}
                        y={pad + topOffset + 42}
                        width={cfg.widthMm * 0.51}
                        height={bodyH - 72}
                        fill="#10B981"
                        fillOpacity={0.12}
                        stroke="#10B981"
                        strokeWidth={5}
                      />
                      <rect
                        x={pad + cfg.widthMm * 0.49 - cfg.boardThicknessMm}
                        y={pad + topOffset + 42}
                        width={cfg.widthMm * 0.51}
                        height={bodyH - 72}
                        fill="#38BDF8"
                        fillOpacity={0.15}
                        stroke="#38BDF8"
                        strokeWidth={5}
                      />
                    </>
                  )}

                  {/* Blind Corner Front */}
                  {isCorner && (
                    <>
                      <rect
                        x={pad + cfg.frontGapMm}
                        y={pad + topOffset + cfg.frontGapMm}
                        width={cfg.widthMm * 0.52}
                        height={bodyH - cfg.frontGapMm * 2}
                        fill="#71717A"
                        fillOpacity={0.22}
                        stroke="#A1A1AA"
                        strokeWidth={5}
                        strokeDasharray="24 14"
                      />
                      <rect
                        x={pad + cfg.widthMm * 0.54}
                        y={pad + topOffset + cfg.frontGapMm}
                        width={cfg.widthMm * 0.45}
                        height={bodyH - cfg.frontGapMm * 2}
                        fill="#38BDF8"
                        fillOpacity={0.12}
                        stroke="#38BDF8"
                        strokeWidth={5}
                      />
                    </>
                  )}

                  {/* Special AGD Presets Front Schematics */}
                  {isOvenTower && (
                    <>
                      <rect
                        x={pad + cfg.boardThicknessMm}
                        y={pad + topOffset + bodyH * 0.34}
                        width={cfg.widthMm - cfg.boardThicknessMm * 2}
                        height={Math.min(595, bodyH * 0.32)}
                        fill="#18181B"
                        stroke="#F59E0B"
                        strokeWidth={6}
                      />
                      <rect
                        x={pad + cfg.boardThicknessMm + 48}
                        y={pad + topOffset + bodyH * 0.34 + 90}
                        width={cfg.widthMm - cfg.boardThicknessMm * 2 - 96}
                        height={Math.min(360, bodyH * 0.19)}
                        fill="#09090B"
                        stroke="#71717A"
                        strokeWidth={4}
                      />
                      <text
                        x={pad + cfg.widthMm / 2}
                        y={pad + topOffset + bodyH * 0.34 + 62}
                        textAnchor="middle"
                        fill="#FBBF24"
                        fontSize={Math.max(34, cfg.widthMm * 0.06)}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight={700}
                      >
                        PIEKARNIK 600
                      </text>
                    </>
                  )}
                  {isSinkCabinet && (
                    <rect
                      x={pad + cfg.widthMm * 0.12}
                      y={pad + Math.max(4, topOffset * 0.25)}
                      width={cfg.widthMm * 0.76}
                      height={Math.max(24, topOffset * 0.7)}
                      fill="#0EA5E9"
                      fillOpacity={0.35}
                      stroke="#38BDF8"
                      strokeWidth={5}
                    />
                  )}
                  {isDishwasher && (
                    <>
                      <rect
                        x={pad + cfg.frontGapMm}
                        y={pad + topOffset + cfg.frontGapMm}
                        width={cfg.widthMm - cfg.frontGapMm * 2}
                        height={bodyH - cfg.frontGapMm * 2}
                        fill="#0284C7"
                        fillOpacity={0.14}
                        stroke="#38BDF8"
                        strokeWidth={5}
                      />
                      <text
                        x={pad + cfg.widthMm / 2}
                        y={pad + topOffset + bodyH * 0.5}
                        textAnchor="middle"
                        fill="#7DD3FC"
                        fontSize={Math.max(36, cfg.widthMm * 0.06)}
                        fontFamily="JetBrains Mono, monospace"
                        fontWeight={700}
                      >
                        ZMYWARKA {cfg.widthMm}
                      </text>
                    </>
                  )}

                  {/* Standard Hinged Doors & Upward Flaps (Full or Upper Hybrid Zone) */}
                  {!isSliding &&
                    !isCorner &&
                    !isOvenTower &&
                    !isDishwasher &&
                    (cfg.drawerCount === 0 || previewSummary.isHybrid) &&
                    cfg.doorMode === 'flap_up' && (
                      <>
                        {Array.from({ length: upperZoneH >= 640 ? 2 : 1 }).map((_, idx, arr) => {
                          const gap = cfg.frontGapMm;
                          const eachH = (upperZoneH - gap * (arr.length + 1)) / arr.length;
                          const y = pad + topOffset + gap + idx * (eachH + gap);
                          return (
                            <g key={`flap_${idx}`}>
                              <rect
                                x={pad + gap}
                                y={y}
                                width={cfg.widthMm - gap * 2}
                                height={Math.max(20, eachH)}
                                fill="#A78BFA"
                                fillOpacity={0.14}
                                stroke="#A78BFA"
                                strokeWidth={5}
                              />
                              <polyline
                                points={`${pad + cfg.widthMm * 0.15},${y + eachH - 18} ${pad + cfg.widthMm * 0.5},${y + 18} ${pad + cfg.widthMm * 0.85},${y + eachH - 18}`}
                                fill="none"
                                stroke="#C4B5FD"
                                strokeWidth={5}
                                strokeDasharray="16 10"
                              />
                            </g>
                          );
                        })}
                      </>
                    )}
                  {!isSliding &&
                    !isCorner &&
                    !isOvenTower &&
                    !isDishwasher &&
                    (cfg.drawerCount === 0 || previewSummary.isHybrid) &&
                    cfg.doorMode === 'double' && (
                      <>
                        <rect
                          x={pad + cfg.frontGapMm}
                          y={pad + topOffset + cfg.frontGapMm}
                          width={cfg.widthMm / 2 - cfg.frontGapMm * 1.5}
                          height={upperZoneH - cfg.frontGapMm * 2}
                          fill="#38BDF8"
                          fillOpacity={0.1}
                          stroke="#38BDF8"
                          strokeWidth={5}
                        />
                        <rect
                          x={pad + cfg.widthMm / 2 + cfg.frontGapMm * 0.5}
                          y={pad + topOffset + cfg.frontGapMm}
                          width={cfg.widthMm / 2 - cfg.frontGapMm * 1.5}
                          height={upperZoneH - cfg.frontGapMm * 2}
                          fill="#38BDF8"
                          fillOpacity={0.1}
                          stroke="#38BDF8"
                          strokeWidth={5}
                        />
                      </>
                    )}
                  {!isSliding &&
                    !isCorner &&
                    !isOvenTower &&
                    !isDishwasher &&
                    (cfg.drawerCount === 0 || previewSummary.isHybrid) &&
                    (cfg.doorMode === 'single_left' || cfg.doorMode === 'single_right') && (
                      <rect
                        x={pad + cfg.frontGapMm}
                        y={pad + topOffset + cfg.frontGapMm}
                        width={cfg.widthMm - cfg.frontGapMm * 2}
                        height={upperZoneH - cfg.frontGapMm * 2}
                        fill="#38BDF8"
                        fillOpacity={0.1}
                        stroke="#38BDF8"
                        strokeWidth={5}
                      />
                    )}
                  {/* Recessed LED Groove Indicator on Bottom Deck */}
                  {cfg.addLedGroove && !isSteelRack && (
                    <line
                      x1={pad + cfg.boardThicknessMm}
                      y1={pad + topOffset + bodyH + 6}
                      x2={pad + cfg.widthMm - cfg.boardThicknessMm}
                      y2={pad + topOffset + bodyH + 6}
                      stroke="#FDE047"
                      strokeWidth={10}
                    />
                  )}

                  {/* Plinth / Legs */}
                  {plinthH > 0 && cfg.plinthStyle === 'plinth_board' && (
                    <rect
                      x={pad + cfg.boardThicknessMm}
                      y={pad + topOffset + bodyH}
                      width={cfg.widthMm - cfg.boardThicknessMm * 2}
                      height={plinthH}
                      fill="#52525B"
                      fillOpacity={0.45}
                      stroke="#71717A"
                      strokeWidth={5}
                    />
                  )}
                  {plinthH > 0 && cfg.plinthStyle === 'legs' && (
                    <>
                      <rect
                        x={pad + 50}
                        y={pad + topOffset + bodyH}
                        width={36}
                        height={plinthH}
                        fill="#71717A"
                      />
                      <rect
                        x={pad + cfg.widthMm - 86}
                        y={pad + topOffset + bodyH}
                        width={36}
                        height={plinthH}
                        fill="#71717A"
                      />
                    </>
                  )}

                  {/* Overall dimension callouts */}
                  <text
                    x={pad + cfg.widthMm / 2}
                    y={pad + totalDrawH + 68}
                    textAnchor="middle"
                    fill="#FAFAFA"
                    fontSize={Math.max(42, cfg.widthMm * 0.055)}
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight={700}
                  >
                    {cfg.widthMm} mm
                  </text>
                  <text
                    x={pad - 24}
                    y={pad + totalDrawH / 2}
                    textAnchor="end"
                    fill="#FAFAFA"
                    fontSize={Math.max(40, totalDrawH * 0.05)}
                    fontFamily="JetBrains Mono, monospace"
                    fontWeight={700}
                  >
                    {totalDrawH}
                  </text>
                </svg>
                )}

                <div className="mt-2.5 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-zinc-400 font-mono-num">
                  <span>Płyta: {cfg.boardThicknessMm} mm</span>
                  <span>·</span>
                  <span className="text-sky-300">Masa: ~{previewSummary.totalWeightKg} kg</span>
                  <span>·</span>
                  <span>
                    {isOvenTower
                      ? 'Komin went. 50 mm'
                      : isSinkCabinet
                        ? 'Trawers pionowy + zlew'
                        : isDishwasher
                          ? 'Podcięty cokół AGD'
                          : cfg.topType === 'stretchers' && !isSliding
                            ? '2 trawersy'
                            : 'Pełny wieniec'}
                  </span>
                  {previewSummary.flapRec && (
                    <>
                      <span>·</span>
                      <span className="text-violet-300">{previewSummary.flapRec}</span>
                    </>
                  )}
                  {previewSummary.isHybrid && (
                    <>
                      <span>·</span>
                      <span className="text-emerald-300">Hybryda (szuflady + góra)</span>
                    </>
                  )}
                  {cfg.drawerCount > 0 && !isSliding && !isCorner && !isAgdPreset && (
                    <>
                      <span>·</span>
                      <span className="text-amber-300">
                        Skrzynka: {previewSummary.drawerBoxW} mm
                      </span>
                    </>
                  )}
                </div>
              </div>

              <label className="block">
                <span className="text-xs font-medium text-zinc-300">Nazwa modułu / grupy</span>
                <input
                  type="text"
                  value={cfg.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
            </div>

            {/* Right: Parametric Carpentry Controls */}
            <div className="md:col-span-7 space-y-3.5">
              {/* Overall Dimensions */}
              <div className="grid grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Szerokość (mm)</span>
                  <NumericInput
                    min={240}
                    max={3000}
                    step={20}
                    value={cfg.widthMm}
                    onChange={(val) => patch({ widthMm: val })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Wysokość (mm)</span>
                  <NumericInput
                    min={240}
                    max={2750}
                    step={20}
                    value={cfg.heightMm}
                    onChange={(val) => patch({ heightMm: val })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Głębokość (mm)</span>
                  <NumericInput
                    min={200}
                    max={900}
                    step={10}
                    value={cfg.depthMm}
                    onChange={(val) => patch({ depthMm: val })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
              </div>

              {/* Board Thickness, Top Construction, Vertical Dividers, Plinth */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Grubość płyty</span>
                  <select
                    value={cfg.boardThicknessMm}
                    onChange={(e) => patch({ boardThicknessMm: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value={16}>16 mm</option>
                    <option value={18}>18 mm (std)</option>
                    <option value={22}>22 mm</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Góra korpusu</span>
                  <select
                    disabled={isSliding}
                    value={isSliding ? 'full_panel' : cfg.topType}
                    onChange={(e) =>
                      patch({ topType: e.target.value as 'full_panel' | 'stretchers' })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white disabled:opacity-40 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="full_panel">Pełny wieniec</option>
                    <option value="stretchers">2 trawersy (kuch.)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Przegrody pion.</span>
                  <select
                    disabled={isCorner}
                    value={isCorner ? 0 : cfg.verticalDividers}
                    onChange={(e) =>
                      patch({ verticalDividers: Number(e.target.value) as 0 | 1 | 2 })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs font-mono-num text-white disabled:opacity-40 focus:border-amber-500 focus:outline-none"
                  >
                    <option value={0}>0 (1 sekcja)</option>
                    <option value={1}>1 (2 sekcje)</option>
                    <option value={2}>2 (3 sekcje)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Podstawa</span>
                  <select
                    value={cfg.plinthStyle}
                    onChange={(e) =>
                      patch({
                        plinthStyle: e.target.value as ParametricCabinetConfig['plinthStyle'],
                        plinthHeightMm: e.target.value === 'none' ? 0 : cfg.plinthHeightMm || 100,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="plinth_board">Cokół</option>
                    <option value="legs">4 nóżki</option>
                    <option value="none">Wisząca / brak</option>
                  </select>
                </label>
              </div>

              {/* Drawers, Shelves, Doors & Opening Style */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Szuflady</span>
                  <NumericInput
                    min={0}
                    max={6}
                    step={1}
                    disabled={isSliding || isCorner}
                    value={isSliding || isCorner ? 0 : cfg.drawerCount}
                    onChange={(val) => patch({ drawerCount: val })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white disabled:opacity-40 focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Półki / sekcja</span>
                  <NumericInput
                    min={0}
                    max={8}
                    step={1}
                    value={cfg.shelfCount}
                    onChange={(val) => patch({ shelfCount: val })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Drzwiczki / Klapy</span>
                  <select
                    disabled={isSliding || isCorner || isOvenTower || isDishwasher}
                    value={isSliding ? 'double' : isCorner ? 'single_right' : cfg.doorMode}
                    onChange={(e) =>
                      patch({ doorMode: e.target.value as ParametricCabinetConfig['doorMode'] })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white disabled:opacity-40 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="none">Otwarte</option>
                    <option value="single_left">1-skrz. L</option>
                    <option value="single_right">1-skrz. P</option>
                    <option value="double">2-skrzydłowe</option>
                    <option value="flap_up">Klapa uchylna ↑</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">System otwierania</span>
                  <select
                    value={cfg.handleStyle}
                    onChange={(e) => patch({ handleStyle: e.target.value as HandleStyle })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="bar">Uchwyt reling</option>
                    <option value="tip_on">Tip-On (klik)</option>
                    <option value="gola_j">Listwa Gola (J)</option>
                    <option value="chamfer_45">Podchwyt 45°</option>
                  </select>
                </label>
              </div>

              {/* Slides, Back Panel, Wall Filler & Plinth/Elev */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Prowadnice</span>
                  <select
                    value={cfg.slideType}
                    onChange={(e) => patch({ slideType: e.target.value as DrawerSlideType })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="undermount_blum">Blum/GTV (−10, dno +13)</option>
                    <option value="tandembox_metabox">Tandembox metalowe (−14 mm)</option>
                    <option value="ball_26mm">Kulkowe (−26 mm)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Plecy HDF 3 mm</span>
                  <select
                    value={cfg.backType}
                    onChange={(e) =>
                      patch({ backType: e.target.value as ParametricCabinetConfig['backType'] })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="hdf_grooved">W nut (4×8 mm)</option>
                    <option value="hdf_nailed">Nabijane tył</option>
                    <option value="none">Brak pleców</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Blenda przyścienna</span>
                  <select
                    value={cfg.wallFillerSide}
                    onChange={(e) =>
                      patch({
                        wallFillerSide: e.target.value as ParametricCabinetConfig['wallFillerSide'],
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="none">Brak</option>
                    <option value="left">Lewa ({cfg.wallFillerWidthMm} mm)</option>
                    <option value="right">Prawa ({cfg.wallFillerWidthMm} mm)</option>
                    <option value="both">Obie strony</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">
                    {cfg.plinthStyle === 'none' ? 'Zawieszenie (mm)' : 'Cokół (mm)'}
                  </span>
                  <NumericInput
                    min={0}
                    max={cfg.plinthStyle === 'none' ? 2000 : 200}
                    step={10}
                    value={cfg.plinthStyle === 'none' ? cfg.elevationYmm : cfg.plinthHeightMm}
                    onChange={(val) =>
                      cfg.plinthStyle === 'none'
                        ? patch({ elevationYmm: val })
                        : patch({ plinthHeightMm: val })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
              </div>

              {/* Materials & Lacquer Finish */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Materiał korpusu</span>
                  <select
                    value={cfg.corpusMaterialId}
                    onChange={(e) => patch({ corpusMaterialId: e.target.value as MaterialId })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    {MATERIAL_CATALOG.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.shortName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Materiał frontów</span>
                  <select
                    value={cfg.frontMaterialId}
                    onChange={(e) => patch({ frontMaterialId: e.target.value as MaterialId })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    {MATERIAL_CATALOG.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.shortName}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Wykończenie frontów</span>
                  <select
                    value={cfg.frontFinish}
                    onChange={(e) => patch({ frontFinish: e.target.value as SurfaceFinish })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="matte">Mat</option>
                    <option value="satin">Satyna / Półmat</option>
                    <option value="gloss">Wysoki połysk (lakier)</option>
                  </select>
                </label>
              </div>

              {/* Checkboxes: Countertop, Wardrobe Rod, System 32, Auto Fasteners */}
              <div className="flex flex-wrap items-center justify-between gap-2.5 border-t border-zinc-800/80 pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.addCountertop}
                      onChange={(e) => patch({ addCountertop: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span>Blat 38 mm</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cfg.addWardrobeRod)}
                      onChange={(e) => patch({ addWardrobeRod: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span>Drążek</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cfg.system32Holes)}
                      onChange={(e) => patch({ system32Holes: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span>System 32 (Ø5)</span>
                  </label>
                  <label className="flex items-center gap-1.5 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(cfg.addLedGroove)}
                      onChange={(e) => patch({ addLedGroove: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span>Frez LED 10×8</span>
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1.5 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.autoFasteners}
                      onChange={(e) => patch({ autoFasteners: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span>Łączniki:</span>
                  </label>
                  <select
                    disabled={!cfg.autoFasteners}
                    value={cfg.fastenerType}
                    onChange={(e) => patch({ fastenerType: e.target.value as ScrewType })}
                    className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white disabled:opacity-40 focus:border-amber-500 focus:outline-none"
                  >
                    {SCREW_CATALOG.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.shortName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Smart Auto-Placement Row (Only when inserting a new cabinet) */}
              {!isEditing && placementPreview && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-2.5 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <span className="font-semibold text-zinc-200">
                      Ustawienie w 3D (auto-dostawianie)
                    </span>
                    <span className="font-mono-num text-emerald-300 truncate">
                      {placementPreview.label} · X {Math.round(placementPreview.offsetXmm)} / Z{' '}
                      {Math.round(placementPreview.offsetZmm)} mm
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {PLACEMENT_OPTIONS.map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setPlacementMode(opt.id)}
                        className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                          placementMode === opt.id
                            ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200 font-semibold'
                            : 'border-zinc-800 bg-zinc-950 text-zinc-300 hover:border-zinc-700 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-5 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <span className="text-xs text-zinc-400">
            {isEditing
              ? 'Przebudowa zachowa środek X i wyrównanie tyłu Z modułu w istniejącej zabudowie.'
              : 'Cała szafka zostanie zgrupowana — w każdej chwili wrócisz do tego kreatora lub użyjesz Smart Resize.'}
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-medium text-zinc-200 hover:bg-zinc-800 whitespace-nowrap shrink-0 cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>{isEditing ? 'Zaktualizuj szafkę w 3D' : 'Wstaw szafkę do 3D'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
