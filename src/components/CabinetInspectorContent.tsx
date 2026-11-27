import React, { useMemo, useState } from 'react';
import {
  BookmarkPlus,
  Copy,
  Layers,
  LayoutPanelTop,
  Palette,
  SlidersHorizontal,
  Trash2,
  Wrench,
} from 'lucide-react';
import {
  DrawerSlideType,
  HandleStyle,
  MATERIAL_CATALOG,
  MaterialId,
  ParametricCabinetConfig,
  SCREW_CATALOG,
  ScrewType,
  SurfaceFinish,
} from '../types/furniture';
import { NumericInput } from './NumericInput';

type CabinetTab = 'structure' | 'hardware' | 'materials';

interface CabinetInspectorContentProps {
  config: ParametricCabinetConfig;
  groupId: string;
  materialsVersion: number;
  swatches: Partial<Record<MaterialId, string>>;
  uiMode: 'simple' | 'expert';
  onUpdateCabinet: (groupId: string, nextCfg: ParametricCabinetConfig) => void;
  onSaveAsTemplate?: (config: ParametricCabinetConfig) => void;
  onOpenFullBuilder?: () => void;
  onDuplicateCabinet?: () => void;
  onDeleteCabinet?: () => void;
  onSwitchToSinglePartMode?: () => void;
}

const BOARD_THICKNESSES = [16, 18, 22, 25];

const DOOR_OPTIONS: Array<{ id: ParametricCabinetConfig['doorMode']; label: string }> = [
  { id: 'none', label: 'Brak' },
  { id: 'single_left', label: 'Lewe (L)' },
  { id: 'single_right', label: 'Prawe (P)' },
  { id: 'double', label: 'Podwójne' },
  { id: 'flap_up', label: 'Klapa góra' },
];

const SLIDE_OPTIONS: Array<{ id: DrawerSlideType; label: string; desc: string }> = [
  { id: 'undermount_blum', label: 'Podszufladowe (Blum / GTV)', desc: 'Cichy domyk, pełny wysuw' },
  { id: 'tandembox_metabox', label: 'Systemowe Tandembox / Metabox', desc: 'Metalowe boki, udźwig 40 kg' },
  { id: 'ball_26mm', label: 'Kulkowe boczne 26 mm', desc: 'Klasyczne H45 pełny wysuw' },
  { id: 'none', label: 'Brak prowadnic', desc: 'Tylko skrzynka / bez okucia' },
];

const HANDLE_OPTIONS: Array<{ id: HandleStyle; label: string }> = [
  { id: 'gola_j', label: 'Profil Gola J' },
  { id: 'bar', label: 'Reling klasyczny' },
  { id: 'chamfer_45', label: 'Frez 45° (bezuchwytowy)' },
  { id: 'tip_on', label: 'Tip-On (klik)' },
];

const BACK_OPTIONS: Array<{ id: ParametricCabinetConfig['backType']; label: string }> = [
  { id: 'hdf_grooved', label: 'HDF w nut (frez)' },
  { id: 'hdf_nailed', label: 'HDF nabijane' },
  { id: 'none', label: 'Brak pleców' },
];

const PLINTH_OPTIONS: Array<{ id: ParametricCabinetConfig['plinthStyle']; label: string }> = [
  { id: 'plinth_board', label: 'Cokół z płyty' },
  { id: 'legs', label: 'Nóżki meblowe' },
  { id: 'none', label: 'Brak / wisząca' },
];

export const CabinetInspectorContent: React.FC<CabinetInspectorContentProps> = ({
  config,
  groupId,
  materialsVersion,
  swatches,
  uiMode,
  onUpdateCabinet,
  onSaveAsTemplate,
  onOpenFullBuilder,
  onDuplicateCabinet,
  onDeleteCabinet,
  onSwitchToSinglePartMode,
}) => {
  const [tab, setTab] = useState<CabinetTab>('structure');
  const [matTarget, setMatTarget] = useState<'corpus' | 'front' | 'countertop'>('front');

  const patch = (partial: Partial<ParametricCabinetConfig>) => {
    onUpdateCabinet(groupId, { ...structuredClone(config), ...partial });
  };

  const catalog = useMemo(() => {
    void materialsVersion;
    return MATERIAL_CATALOG;
  }, [materialsVersion]);

  const activeMaterialId: MaterialId =
    matTarget === 'corpus'
      ? config.corpusMaterialId
      : matTarget === 'countertop'
        ? config.countertopMaterialId
        : config.frontMaterialId;

  const setActiveMaterial = (matId: MaterialId) => {
    if (matTarget === 'corpus') patch({ corpusMaterialId: matId });
    else if (matTarget === 'countertop') patch({ countertopMaterialId: matId });
    else patch({ frontMaterialId: matId });
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Primary Commercial Actions Strip: Save Template + Full 2D Builder */}
      <div className="flex items-center gap-1.5 border-b border-white/[0.08] bg-white/[0.02] px-3.5 py-2">
        {onSaveAsTemplate && (
          <button
            type="button"
            onClick={() => onSaveAsTemplate(structuredClone(config))}
            className="flex flex-1 min-h-[34px] items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-2.5 text-[11px] font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
          >
            <BookmarkPlus className="h-3.5 w-3.5 shrink-0" />
            <span>Zapisz jako szablon</span>
          </button>
        )}
        {onOpenFullBuilder && (
          <button
            type="button"
            onClick={onOpenFullBuilder}
            className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-xl border border-white/[0.1] bg-white/[0.05] px-2.5 text-[11px] font-medium text-zinc-100 hover:bg-white/[0.1] transition-colors whitespace-nowrap cursor-pointer"
            title="Otwórz pełny kreator z rysunkiem 2D i przekrojem"
          >
            <LayoutPanelTop className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Kreator 2D</span>
          </button>
        )}
      </div>

      {/* 3-Tab Commercial Cabinet Switcher */}
      <div className="grid grid-cols-3 gap-1 border-b border-white/[0.08] px-3.5 py-2 shrink-0">
        {(
          [
            { id: 'structure', label: 'Wymiary i tył', icon: SlidersHorizontal },
            { id: 'hardware', label: 'Fronty i okucia', icon: Wrench },
            { id: 'materials', label: 'Kolory płyt', icon: Palette },
          ] as const
        ).map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`flex min-h-[34px] items-center justify-center gap-1 rounded-xl px-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                active
                  ? 'bg-amber-500/18 text-amber-300 border border-amber-400/40 font-semibold'
                  : 'text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-100 border border-transparent'
              }`}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Scrollable Body */}
      <div className="cad-scroll flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
        {tab === 'structure' && (
          <>
            {/* Cabinet Name */}
            <div className="space-y-1">
              <label className="text-[11px] font-medium text-zinc-400">Nazwa szafki</label>
              <input
                type="text"
                value={config.name}
                onChange={(e) => patch({ name: e.target.value })}
                className="w-full rounded-xl border border-white/[0.1] bg-zinc-900/90 px-3 py-2 text-xs font-medium text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* External Dimensions (W × H × D) */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Wymiary zewnętrzne (mm)
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400">Szerokość</span>
                  <NumericInput
                    value={config.widthMm}
                    min={150}
                    max={3200}
                    step={10}
                    ariaLabel="Szerokość szafki"
                    onChange={(v) => patch({ widthMm: v })}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-center text-xs font-semibold font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400">Wysokość</span>
                  <NumericInput
                    value={config.heightMm}
                    min={200}
                    max={2800}
                    step={10}
                    ariaLabel="Wysokość szafki"
                    onChange={(v) => patch({ heightMm: v })}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-center text-xs font-semibold font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400">Głębokość</span>
                  <NumericInput
                    value={config.depthMm}
                    min={150}
                    max={950}
                    step={10}
                    ariaLabel="Głębokość szafki"
                    onChange={(v) => patch({ depthMm: v })}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-center text-xs font-semibold font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Board Thickness */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-zinc-400">Grubość płyty korpusu</span>
              <div className="grid grid-cols-4 gap-1.5">
                {BOARD_THICKNESSES.map((th) => (
                  <button
                    key={th}
                    type="button"
                    onClick={() => patch({ boardThicknessMm: th })}
                    className={`min-h-[32px] rounded-lg border text-xs font-mono-num transition-colors cursor-pointer ${
                      config.boardThicknessMm === th
                        ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {th} mm
                  </button>
                ))}
              </div>
            </div>

            {/* Interior Layout: Shelves, Drawers, Dividers */}
            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Wnętrze szafki
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400">Półki</span>
                  <NumericInput
                    value={config.shelfCount}
                    min={0}
                    max={10}
                    step={1}
                    ariaLabel="Liczba półek"
                    onChange={(v) => patch({ shelfCount: v })}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400">Szuflady</span>
                  <NumericInput
                    value={config.drawerCount}
                    min={0}
                    max={8}
                    step={1}
                    ariaLabel="Liczba szuflad"
                    onChange={(v) => patch({ drawerCount: v })}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400">Przegrody</span>
                  <div className="grid grid-cols-3 gap-1">
                    {([0, 1, 2] as const).map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => patch({ verticalDividers: d })}
                        className={`h-[30px] rounded-lg border text-xs font-mono-num cursor-pointer transition-colors ${
                          config.verticalDividers === d
                            ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                        }`}
                      >
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Back Panel (Tył szafki) */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-zinc-400">Tył szafki (plecy)</span>
              <div className="grid grid-cols-3 gap-1.5">
                {BACK_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ backType: opt.id })}
                    className={`min-h-[34px] rounded-lg border px-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      config.backType === opt.id
                        ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Plinth / Legs / Wall-hung elevation */}
            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <span className="text-[11px] font-medium text-zinc-400">Podstawa i zawieszenie</span>
              <div className="grid grid-cols-3 gap-1.5">
                {PLINTH_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      patch({
                        plinthStyle: opt.id,
                        plinthHeightMm: opt.id === 'none' ? 0 : Math.max(60, config.plinthHeightMm || 100),
                      })
                    }
                    className={`min-h-[32px] rounded-lg border px-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      config.plinthStyle === opt.id
                        ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {config.plinthStyle !== 'none' && (
                  <div className="space-y-1">
                    <span className="text-[10px] text-zinc-400">Wys. cokołu / nóżek (mm)</span>
                    <NumericInput
                      value={config.plinthHeightMm}
                      min={0}
                      max={300}
                      step={10}
                      ariaLabel="Wysokość cokołu"
                      onChange={(v) => patch({ plinthHeightMm: v })}
                      className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                )}
                <div className="space-y-1">
                  <span className="text-[10px] text-zinc-400">Wys. zawieszenia od podłogi</span>
                  <NumericInput
                    value={config.elevationYmm}
                    min={0}
                    max={2200}
                    step={50}
                    ariaLabel="Wysokość zawieszenia"
                    onChange={(v) => patch({ elevationYmm: v })}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            {/* Top Construction + Extra Carpentry Options */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => patch({ topType: 'full_panel' })}
                  className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-medium cursor-pointer transition-colors ${
                    config.topType === 'full_panel'
                      ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  Pełny wieniec górny
                </button>
                <button
                  type="button"
                  onClick={() => patch({ topType: 'stretchers' })}
                  className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-medium cursor-pointer transition-colors ${
                    config.topType === 'stretchers'
                      ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  Trawersy (pod blat)
                </button>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.addCountertop}
                    onChange={(e) => patch({ addCountertop: e.target.checked })}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  <span>Blat 38 mm</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(config.addWardrobeRod)}
                    onChange={(e) => patch({ addWardrobeRod: e.target.checked })}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  <span>Drążek ubraniowy</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={Boolean(config.addLedGroove)}
                    onChange={(e) => patch({ addLedGroove: e.target.checked })}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  <span>Frez LED w dnie</span>
                </label>
                <label className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 text-xs text-zinc-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.system32Holes}
                    onChange={(e) => patch({ system32Holes: e.target.checked })}
                    className="h-3.5 w-3.5 accent-amber-500"
                  />
                  <span>Nawierty System 32</span>
                </label>
              </div>
            </div>
          </>
        )}

        {tab === 'hardware' && (
          <>
            {/* Doors & Hinges */}
            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Fronty i zawiasy puszkowe
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                {DOOR_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ doorMode: opt.id })}
                    className={`min-h-[32px] rounded-lg border px-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      config.doorMode === opt.id
                        ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-2 gap-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => patch({ frontType: 'overlay' })}
                  className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-medium cursor-pointer ${
                    config.frontType === 'overlay'
                      ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  Zawias nakładany
                </button>
                <button
                  type="button"
                  onClick={() => patch({ frontType: 'inset' })}
                  className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-medium cursor-pointer ${
                    config.frontType === 'inset'
                      ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                  }`}
                >
                  Zawias wpuszczany
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 pt-1">
                <span className="text-[11px] text-zinc-400">Szczelina między frontami (mm)</span>
                <NumericInput
                  value={config.frontGapMm}
                  min={1}
                  max={8}
                  step={1}
                  ariaLabel="Szczelina frontu"
                  onChange={(v) => patch({ frontGapMm: v })}
                  className="w-20 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Drawer Slides (Prowadnice) */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Prowadnice szuflad
              </div>
              <div className="space-y-1.5">
                {SLIDE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ slideType: opt.id })}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors cursor-pointer ${
                      config.slideType === opt.id
                        ? 'border-amber-500 bg-amber-500/15 text-white'
                        : 'border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <div className="text-xs font-semibold">{opt.label}</div>
                    <div className="text-[10px] text-zinc-400">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Handles (Uchwyty) */}
            <div className="space-y-1.5">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400">
                Uchwyty i otwieranie
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {HANDLE_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ handleStyle: opt.id })}
                    className={`min-h-[32px] rounded-lg border px-2 text-[11px] font-medium transition-colors cursor-pointer ${
                      config.handleStyle === opt.id
                        ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Wall Filler Strip (Blenda przyścienna) */}
            <div className="space-y-1.5 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <span className="text-[11px] font-medium text-zinc-400">Blenda przyścienna</span>
              <div className="grid grid-cols-4 gap-1">
                {(
                  [
                    { id: 'none', label: 'Brak' },
                    { id: 'left', label: 'Lewa' },
                    { id: 'right', label: 'Prawa' },
                    { id: 'both', label: 'Obie' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => patch({ wallFillerSide: opt.id })}
                    className={`min-h-[30px] rounded-lg border text-[11px] font-medium cursor-pointer ${
                      config.wallFillerSide === opt.id
                        ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {config.wallFillerSide !== 'none' && (
                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-zinc-400">Szerokość blendy (mm)</span>
                  <NumericInput
                    value={config.wallFillerWidthMm}
                    min={18}
                    max={180}
                    step={5}
                    ariaLabel="Szerokość blendy"
                    onChange={(v) => patch({ wallFillerWidthMm: v })}
                    className="w-20 rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Fasteners (Łączniki) */}
            <div className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
              <label className="flex items-center justify-between gap-2 text-xs text-zinc-200 cursor-pointer">
                <span className="font-medium">Automatyczne łączniki korpusu</span>
                <input
                  type="checkbox"
                  checked={config.autoFasteners}
                  onChange={(e) => patch({ autoFasteners: e.target.checked })}
                  className="h-4 w-4 accent-amber-500"
                />
              </label>
              {config.autoFasteners && (
                <select
                  value={config.fastenerType}
                  onChange={(e) => patch({ fastenerType: e.target.value as ScrewType })}
                  className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  {SCREW_CATALOG.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </>
        )}

        {tab === 'materials' && (
          <>
            {/* Target Selector: Front / Corpus / Countertop */}
            <div className="grid grid-cols-3 gap-1">
              <button
                type="button"
                onClick={() => setMatTarget('front')}
                className={`min-h-[34px] rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                  matTarget === 'front'
                    ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                Fronty
              </button>
              <button
                type="button"
                onClick={() => setMatTarget('corpus')}
                className={`min-h-[34px] rounded-lg border text-[11px] font-medium cursor-pointer transition-colors ${
                  matTarget === 'corpus'
                    ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                Korpus
              </button>
              <button
                type="button"
                disabled={!config.addCountertop}
                onClick={() => setMatTarget('countertop')}
                className={`min-h-[34px] rounded-lg border text-[11px] font-medium cursor-pointer transition-colors disabled:opacity-35 disabled:cursor-not-allowed ${
                  matTarget === 'countertop'
                    ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                Blat
              </button>
            </div>

            {/* Front Surface Finish */}
            {matTarget === 'front' && (
              <div className="space-y-1.5">
                <span className="text-[11px] text-zinc-400">Wykończenie powierzchni frontu</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'matte', label: 'Mat' },
                      { id: 'satin', label: 'Satyna' },
                      { id: 'gloss', label: 'Połysk' },
                    ] as Array<{ id: SurfaceFinish; label: string }>
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => patch({ frontFinish: f.id })}
                      className={`min-h-[32px] rounded-lg border text-[11px] font-medium cursor-pointer ${
                        config.frontFinish === f.id
                          ? 'border-amber-500 bg-amber-500/20 text-amber-200 font-semibold'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Swatch Material Picker */}
            <div className="grid grid-cols-2 gap-1.5">
              {catalog.map((m) => {
                const selected = activeMaterialId === m.id;
                const swatchUrl = swatches[m.id];
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setActiveMaterial(m.id)}
                    className={`flex items-center gap-2 rounded-xl border p-2 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'border-amber-500 bg-amber-500/15 text-white'
                        : 'border-zinc-800 bg-zinc-900/75 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <span
                      className="h-7 w-7 rounded-lg border border-white/15 shrink-0 bg-cover bg-center"
                      style={{
                        backgroundColor: m.swatchFallbackHex,
                        backgroundImage: swatchUrl ? `url(${swatchUrl})` : undefined,
                      }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-semibold leading-tight">
                        {m.name}
                      </span>
                      <span className="block truncate text-[9px] text-zinc-500 font-mono-num">
                        {m.pricePerM2Pln} zł/m²
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Footer Utility Actions */}
        <div className="pt-2 border-t border-white/[0.08] space-y-2">
          <div className="grid grid-cols-2 gap-1.5">
            {onDuplicateCabinet && (
              <button
                type="button"
                onClick={onDuplicateCabinet}
                className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900 text-xs font-medium text-zinc-200 hover:border-zinc-700 hover:text-white cursor-pointer"
              >
                <Copy className="h-3.5 w-3.5" />
                <span>Duplikuj szafkę</span>
              </button>
            )}
            {onDeleteCabinet && (
              <button
                type="button"
                onClick={onDeleteCabinet}
                className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs font-medium text-red-300 hover:bg-red-500/20 cursor-pointer"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Usuń szafkę</span>
              </button>
            )}
          </div>

          {uiMode === 'expert' && onSwitchToSinglePartMode && (
            <button
              type="button"
              onClick={onSwitchToSinglePartMode}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg py-1.5 text-[11px] text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
            >
              <Layers className="h-3 w-3" />
              <span>Zaawansowane: edytuj pojedynczą płytę (CNC / wycięcia)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
