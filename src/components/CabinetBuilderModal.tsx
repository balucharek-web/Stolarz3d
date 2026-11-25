import React, { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import {
  DrawerSlideType,
  Fastener,
  FurniturePart,
  MATERIAL_CATALOG,
  MaterialId,
  SCREW_CATALOG,
  ScrewType,
  SurfaceFinish,
} from '../types/furniture';
import {
  buildParametricCabinet,
  CABINET_PRESETS,
  type CabinetPresetId,
  type ParametricCabinetConfig,
} from '../engine/parametric';

interface CabinetBuilderModalProps {
  open: boolean;
  onClose: () => void;
  onInsertCabinet: (parts: FurniturePart[], fasteners: Fastener[], groupName: string) => void;
}

const PRESET_ORDER: CabinetPresetId[] = [
  'base_kitchen',
  'drawer_chest',
  'wall_cabinet',
  'wardrobe',
  'tv_console',
];

export const CabinetBuilderModal: React.FC<CabinetBuilderModalProps> = ({
  open,
  onClose,
  onInsertCabinet,
}) => {
  const [cfg, setCfg] = useState<ParametricCabinetConfig>(() =>
    structuredClone(CABINET_PRESETS.base_kitchen.config)
  );

  const previewSummary = useMemo(() => {
    const t = cfg.boardThicknessMm;
    const innerW = Math.max(80, cfg.widthMm - 2 * t);
    const bodyH = Math.max(120, cfg.heightMm - (cfg.plinthStyle === 'none' ? 0 : cfg.plinthHeightMm));
    const slideClearance =
      cfg.slideType === 'undermount_blum' ? 10 : cfg.slideType === 'ball_26mm' ? 26 : 14;
    const drawerBoxW = Math.max(60, innerW - slideClearance);
    return { innerW, bodyH, drawerBoxW };
  }, [cfg]);

  if (!open) return null;

  const selectPreset = (presetId: CabinetPresetId) => {
    setCfg(structuredClone(CABINET_PRESETS[presetId].config));
  };

  const patch = (next: Partial<ParametricCabinetConfig>) =>
    setCfg((prev) => ({ ...prev, ...next }));

  const handleInsert = () => {
    const { parts, fasteners, groupId } = buildParametricCabinet(cfg, 0, 0);
    onInsertCabinet(parts, fasteners, groupId);
    onClose();
  };

  // Live 2D SVG schematic dimensions
  const totalDrawH = cfg.heightMm + (cfg.addCountertop ? 38 : 0);
  const pad = 120;
  const vbW = cfg.widthMm + pad * 2;
  const vbH = totalDrawH + pad * 2;
  const plinthH = cfg.plinthStyle === 'none' ? 0 : cfg.plinthHeightMm;
  const topOffset = cfg.addCountertop ? 38 : 0;
  const bodyH = Math.max(100, cfg.heightMm - plinthH);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-4xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col max-h-[92dvh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              Kreator parametrycznych szafek i szuflad
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Automatyczne luzy prowadnic, szczeliny frontów, nut pod plecy HDF i zsynchronizowane łączniki
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
        <div className="cad-scroll flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Presets Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
            {PRESET_ORDER.map((pid) => {
              const p = CABINET_PRESETS[pid];
              const active = cfg.preset === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  onClick={() => selectPreset(pid)}
                  className={`rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-amber-500 bg-amber-500/15 text-white'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <div className="text-xs font-semibold truncate">{p.label}</div>
                  <div className="mt-0.5 text-[10px] text-zinc-400 font-mono-num truncate">
                    {p.config.widthMm}×{p.config.heightMm}×{p.config.depthMm}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Left: Live 2D Orthographic Front Blueprint */}
            <div className="md:col-span-5 flex flex-col gap-3">
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3">
                <div className="flex items-center justify-between text-[11px] text-zinc-400 mb-2">
                  <span>Podgląd techniczny (przód)</span>
                  <span className="font-mono-num text-amber-300">
                    Światło: {previewSummary.innerW} mm
                  </span>
                </div>
                <svg
                  viewBox={`0 0 ${vbW} ${vbH}`}
                  className="w-full h-auto max-h-[260px] rounded-lg bg-[#1A1C22]"
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

                  {/* Main Corpus Box */}
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

                  {/* Internal Shelves */}
                  {cfg.drawerCount === 0 &&
                    Array.from({ length: cfg.shelfCount }).map((_, idx) => {
                      const y =
                        pad +
                        topOffset +
                        ((idx + 1) / (cfg.shelfCount + 1)) * bodyH;
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

                  {/* Drawers */}
                  {cfg.drawerCount > 0 &&
                    Array.from({ length: cfg.drawerCount }).map((_, idx) => {
                      const gap = cfg.frontGapMm;
                      const eachH = (bodyH - gap * (cfg.drawerCount + 1)) / cfg.drawerCount;
                      const y = pad + topOffset + gap + idx * (eachH + gap);
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
                          <line
                            x1={pad + cfg.widthMm * 0.4}
                            y1={y + Math.min(40, eachH * 0.25)}
                            x2={pad + cfg.widthMm * 0.6}
                            y2={y + Math.min(40, eachH * 0.25)}
                            stroke="#E4E4E7"
                            strokeWidth={8}
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    })}

                  {/* Doors */}
                  {cfg.drawerCount === 0 && cfg.doorMode === 'double' && (
                    <>
                      <rect
                        x={pad + cfg.frontGapMm}
                        y={pad + topOffset + cfg.frontGapMm}
                        width={cfg.widthMm / 2 - cfg.frontGapMm * 1.5}
                        height={bodyH - cfg.frontGapMm * 2}
                        fill="#38BDF8"
                        fillOpacity={0.1}
                        stroke="#38BDF8"
                        strokeWidth={5}
                      />
                      <rect
                        x={pad + cfg.widthMm / 2 + cfg.frontGapMm * 0.5}
                        y={pad + topOffset + cfg.frontGapMm}
                        width={cfg.widthMm / 2 - cfg.frontGapMm * 1.5}
                        height={bodyH - cfg.frontGapMm * 2}
                        fill="#38BDF8"
                        fillOpacity={0.1}
                        stroke="#38BDF8"
                        strokeWidth={5}
                      />
                    </>
                  )}
                  {cfg.drawerCount === 0 &&
                    (cfg.doorMode === 'single_left' || cfg.doorMode === 'single_right') && (
                      <rect
                        x={pad + cfg.frontGapMm}
                        y={pad + topOffset + cfg.frontGapMm}
                        width={cfg.widthMm - cfg.frontGapMm * 2}
                        height={bodyH - cfg.frontGapMm * 2}
                        fill="#38BDF8"
                        fillOpacity={0.1}
                        stroke="#38BDF8"
                        strokeWidth={5}
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

                <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-400 font-mono-num">
                  <span>Płyta: {cfg.boardThicknessMm} mm</span>
                  <span>·</span>
                  <span>Szczelina: {cfg.frontGapMm} mm</span>
                  {cfg.drawerCount > 0 && (
                    <>
                      <span>·</span>
                      <span className="text-amber-300">
                        Skrzynka szufl.: {previewSummary.drawerBoxW} mm
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
            <div className="md:col-span-7 space-y-4">
              {/* Overall Dimensions */}
              <div className="grid grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Szerokość (mm)</span>
                  <input
                    type="number"
                    min={240}
                    max={2800}
                    step={20}
                    value={cfg.widthMm}
                    onChange={(e) => patch({ widthMm: Number(e.target.value) || 600 })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Wysokość (mm)</span>
                  <input
                    type="number"
                    min={240}
                    max={2700}
                    step={20}
                    value={cfg.heightMm}
                    onChange={(e) => patch({ heightMm: Number(e.target.value) || 720 })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Głębokość (mm)</span>
                  <input
                    type="number"
                    min={200}
                    max={900}
                    step={10}
                    value={cfg.depthMm}
                    onChange={(e) => patch({ depthMm: Number(e.target.value) || 560 })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
              </div>

              {/* Board Thickness, Plinth & Elevation */}
              <div className="grid grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Grubość płyty</span>
                  <select
                    value={cfg.boardThicknessMm}
                    onChange={(e) => patch({ boardThicknessMm: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value={16}>16 mm</option>
                    <option value={18}>18 mm (std)</option>
                    <option value={22}>22 mm</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Podstawa / Cokół</span>
                  <select
                    value={cfg.plinthStyle}
                    onChange={(e) =>
                      patch({
                        plinthStyle: e.target.value as ParametricCabinetConfig['plinthStyle'],
                        plinthHeightMm: e.target.value === 'none' ? 0 : cfg.plinthHeightMm || 100,
                      })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="plinth_board">Cokół płytowy</option>
                    <option value="legs">4 nóżki</option>
                    <option value="none">Bez cokołu</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">
                    {cfg.plinthStyle === 'none' ? 'Wys. zawieszenia' : 'Wys. cokołu (mm)'}
                  </span>
                  <input
                    type="number"
                    min={0}
                    max={cfg.plinthStyle === 'none' ? 2000 : 200}
                    step={10}
                    value={cfg.plinthStyle === 'none' ? cfg.elevationYmm : cfg.plinthHeightMm}
                    onChange={(e) =>
                      cfg.plinthStyle === 'none'
                        ? patch({ elevationYmm: Number(e.target.value) || 0 })
                        : patch({ plinthHeightMm: Number(e.target.value) || 0 })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
              </div>

              {/* Drawers, Shelves & Doors */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Szuflady</span>
                  <input
                    type="number"
                    min={0}
                    max={6}
                    value={cfg.drawerCount}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(6, Number(e.target.value) || 0));
                      patch({
                        drawerCount: v,
                        doorMode: v > 0 ? 'none' : cfg.doorMode,
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Półki wewn.</span>
                  <input
                    type="number"
                    min={0}
                    max={8}
                    disabled={cfg.drawerCount > 0}
                    value={cfg.drawerCount > 0 ? 0 : cfg.shelfCount}
                    onChange={(e) =>
                      patch({ shelfCount: Math.max(0, Math.min(8, Number(e.target.value) || 0)) })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white disabled:opacity-40 focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Drzwiczki</span>
                  <select
                    disabled={cfg.drawerCount > 0}
                    value={cfg.drawerCount > 0 ? 'none' : cfg.doorMode}
                    onChange={(e) =>
                      patch({ doorMode: e.target.value as ParametricCabinetConfig['doorMode'] })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white disabled:opacity-40 focus:border-amber-500 focus:outline-none"
                  >
                    <option value="none">Otwarte</option>
                    <option value="single_left">1-skrz. L</option>
                    <option value="single_right">1-skrz. P</option>
                    <option value="double">2-skrzydłowe</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Typ frontu / luz</span>
                  <select
                    value={cfg.frontType}
                    onChange={(e) =>
                      patch({ frontType: e.target.value as 'overlay' | 'inset' })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="overlay">Nakładane</option>
                    <option value="inset">Wpuszczane</option>
                  </select>
                </label>
              </div>

              {/* Slides, Back Panel & Gap */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Prowadnice szuflad</span>
                  <select
                    value={cfg.slideType}
                    onChange={(e) => patch({ slideType: e.target.value as DrawerSlideType })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="ball_26mm">Kulkowe boczne (−26 mm)</option>
                    <option value="undermount_blum">Dolny montaż Blum/GTV (−10 mm)</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Plecy HDF 4 mm</span>
                  <select
                    value={cfg.backType}
                    onChange={(e) =>
                      patch({ backType: e.target.value as ParametricCabinetConfig['backType'] })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="hdf_grooved">W nut (wpust 4×8 mm)</option>
                    <option value="hdf_nailed">Nabijane z tyłu</option>
                    <option value="none">Brak pleców</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Szczelina frontów</span>
                  <select
                    value={cfg.frontGapMm}
                    onChange={(e) => patch({ frontGapMm: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value={2}>2 mm</option>
                    <option value={3}>3 mm (std)</option>
                    <option value={4}>4 mm</option>
                  </select>
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

              {/* Countertop & Auto Fasteners */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/80 pt-3">
                <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cfg.addCountertop}
                    onChange={(e) => patch({ addCountertop: e.target.checked })}
                    className="h-4 w-4 accent-amber-500"
                  />
                  <span>Dodaj blat kuchenny 38 mm</span>
                </label>

                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={cfg.autoFasteners}
                      onChange={(e) => patch({ autoFasteners: e.target.checked })}
                      className="h-4 w-4 accent-amber-500"
                    />
                    <span>Auto-łączniki:</span>
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
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 px-5 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <span className="text-xs text-zinc-400">
            Cała szafka zostanie zgrupowana — w każdej chwili przeskalujesz ją jednym wymiarem (Smart Resize).
          </span>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-medium text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleInsert}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer"
            >
              <Check className="h-4 w-4" />
              <span>Wstaw szafkę do 3D</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
