import React, { useMemo, useState } from 'react';
import {
  Armchair,
  ArrowLeftRight,
  ArrowUpDown,
  Bath,
  BedDouble,
  BedSingle,
  Box,
  Columns3,
  CookingPot,
  DoorOpen,
  Droplets,
  Flame,
  Hammer,
  Layers,
  LayoutPanelTop,
  Monitor,
  PanelTop,
  PenTool,
  Plus,
  Refrigerator,
  Ruler,
  Search,
  Settings2,
  Shield,
  Shirt,
  ShowerHead,
  Sofa,
  Sparkles,
  SquareStack,
  Thermometer,
  Triangle,
  Tv,
  Utensils,
  WashingMachine,
  Wind,
  Wrench,
  X,
} from 'lucide-react';
import {
  APPLIANCE_CATALOG,
  ApplianceCategory,
  ApplianceMeta,
  ApplianceModel,
  FurniturePart,
  MATERIAL_CATALOG,
  MaterialCategory,
  MaterialId,
  MaterialMeta,
  getMaterialMeta,
} from '../types/furniture';
import { getMaterialSwatchDataUrl } from '../engine/materials';
import {
  CatalogItemBadgeTone,
  MaterialCatalogParams,
  MaterialPresetItem,
  buildGlobalPresetSearchIndex,
  getDefaultParamsForMaterial,
  getMaterialFamilyConfig,
  getSectionsForMaterial,
} from '../data/materialCatalogPresets';

interface AddPartDrawerProps {
  open: boolean;
  materialsVersion: number;
  customTextures: Partial<Record<MaterialId, string>>;
  onClose: () => void;
  onAddPart: (part: Omit<FurniturePart, 'id'>) => void;
  onOpenCustomSketch: () => void;
  onOpenCabinetBuilder: () => void;
  onOpenMaterialsManager: () => void;
}

type CatalogTab = 'boards' | ApplianceCategory;
type MaterialFilterTab = 'all' | MaterialCategory;

const MATERIAL_FILTER_TABS: Array<{ id: MaterialFilterTab; label: string }> = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'Budowa i ogród', label: 'Budowa / Kantówki' },
  { id: 'Izolacja i dach', label: 'Izolacja i dach' },
  { id: 'Płyty konstrukcyjne', label: 'OSB / Sklejka' },
  { id: 'Płyty meblowe', label: 'Płyty i blaty' },
  { id: 'Stal i szkło', label: 'Stal / Szkło' },
];

function matchesMaterialFilter(mat: MaterialMeta, filter: MaterialFilterTab): boolean {
  if (filter === 'all') return true;
  if (filter === 'Płyty meblowe') {
    return mat.category === 'Płyty meblowe' || mat.category === 'Blaty';
  }
  return mat.category === filter;
}

const ROOM_TABS: Array<{
  id: CatalogTab;
  label: string;
  shortLabel: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'boards',
    label: 'Materiały i konstrukcje',
    shortLabel: 'Materiały',
    subtitle: 'Płyty, OSB, styropian, kantówki C24, złącza ciesielskie i profile',
    icon: Layers,
  },
  {
    id: 'kitchen',
    label: 'Kuchnia (AGD)',
    shortLabel: 'Kuchnia',
    subtitle: 'Sprzęt kuchenny AGD do zabudowy i wolnostojący',
    icon: Utensils,
  },
  {
    id: 'bathroom',
    label: 'Łazienka i pralnia',
    shortLabel: 'Łazienka',
    subtitle: 'Sanitariaty WC, prysznic, wanna, umywalka, pralka i suszarka',
    icon: Bath,
  },
  {
    id: 'wardrobe',
    label: 'Garderoba i sypialnia',
    shortLabel: 'Sypialnia',
    subtitle: 'Wyposażenie szaf, łóżka i siedziska do garderoby',
    icon: BedDouble,
  },
  {
    id: 'living',
    label: 'Salon i biuro',
    shortLabel: 'Salon',
    subtitle: 'RTV, wypoczynek, fotele i wyposażenie biurka',
    icon: Sofa,
  },
];

function getApplianceIcon(model: ApplianceModel): React.ComponentType<{ className?: string }> {
  switch (model) {
    case 'fridge_freezer':
      return Refrigerator;
    case 'induction_hob':
    case 'builtin_oven':
    case 'microwave_builtin':
      return Flame;
    case 'kitchen_sink':
    case 'bathroom_sink':
      return Droplets;
    case 'dishwasher_60':
    case 'washing_machine':
    case 'tumble_dryer':
      return WashingMachine;
    case 'range_hood':
      return Wind;
    case 'wire_cargo':
      return CookingPot;
    case 'wc_geberit':
    case 'wc_low_cistern':
    case 'wc_high_cistern':
    case 'bathtub_170':
      return Bath;
    case 'shower_cabin':
      return ShowerHead;
    case 'towel_radiator':
      return Thermometer;
    case 'led_mirror':
      return Sparkles;
    case 'wardrobe_rod':
      return Shirt;
    case 'bed_double':
      return BedDouble;
    case 'bed_single':
      return BedSingle;
    case 'dressing_bench':
    case 'office_chair':
      return Armchair;
    case 'tv_65':
      return Tv;
    case 'sofa_3seat':
      return Sofa;
    case 'desk_monitor_set':
      return Monitor;
    default:
      return Box;
  }
}

function getPresetIcon(
  iconKind: MaterialPresetItem['iconKind']
): React.ComponentType<{ className?: string }> {
  switch (iconKind) {
    case 'sheet':
      return SquareStack;
    case 'panel_vert':
      return Columns3;
    case 'beam':
      return Hammer;
    case 'plank':
      return Ruler;
    case 'insulation':
      return Shield;
    case 'roof':
      return Layers;
    case 'slope':
      return Triangle;
    case 'door':
      return DoorOpen;
    case 'countertop':
      return PanelTop;
    case 'bracket':
      return Wrench;
    case 'profile':
      return Box;
    case 'glass':
      return Sparkles;
    default:
      return Layers;
  }
}

function getBadgeToneClasses(tone?: CatalogItemBadgeTone): string {
  switch (tone) {
    case 'amber':
      return 'border-amber-500/35 bg-amber-500/12 text-amber-300';
    case 'sky':
      return 'border-sky-500/35 bg-sky-500/12 text-sky-300';
    case 'emerald':
      return 'border-emerald-500/35 bg-emerald-500/12 text-emerald-300';
    case 'zinc':
    default:
      return 'border-zinc-700/80 bg-zinc-800/80 text-zinc-300';
  }
}

export const AddPartDrawer: React.FC<AddPartDrawerProps> = ({
  open,
  materialsVersion,
  customTextures,
  onClose,
  onAddPart,
  onOpenCustomSketch,
  onOpenCabinetBuilder,
  onOpenMaterialsManager,
}) => {
  const [activeTab, setActiveTab] = useState<CatalogTab>('boards');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialId>('osb3');
  const [matCategoryFilter, setMatCategoryFilter] = useState<MaterialFilterTab>('all');
  const [catalogParams, setCatalogParams] = useState<MaterialCatalogParams>(() =>
    getDefaultParamsForMaterial(getMaterialMeta('osb3'))
  );

  const selectedMeta = useMemo(() => {
    void materialsVersion;
    return getMaterialMeta(selectedMaterial);
  }, [selectedMaterial, materialsVersion]);

  const familyConfig = useMemo(() => getMaterialFamilyConfig(selectedMeta), [selectedMeta]);
  const materialSections = useMemo(() => getSectionsForMaterial(selectedMeta), [selectedMeta]);

  const filteredMaterials = useMemo(() => {
    void materialsVersion;
    return MATERIAL_CATALOG.filter((m) => matchesMaterialFilter(m, matCategoryFilter));
  }, [matCategoryFilter, materialsVersion]);

  const swatches = useMemo(() => {
    void materialsVersion;
    const map: Partial<Record<MaterialId, string>> = {};
    for (const m of MATERIAL_CATALOG) {
      map[m.id] = getMaterialSwatchDataUrl(m.id, customTextures);
    }
    return map;
  }, [customTextures, materialsVersion]);

  const globalPresetIndex = useMemo(() => {
    void materialsVersion;
    return buildGlobalPresetSearchIndex();
  }, [materialsVersion]);

  const countsByTab = useMemo(() => {
    const counts: Record<CatalogTab, number> = {
      boards: globalPresetIndex.length,
      kitchen: 0,
      bathroom: 0,
      wardrobe: 0,
      living: 0,
    };
    for (const item of APPLIANCE_CATALOG) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, [globalPresetIndex.length]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const filteredSearchPresets = useMemo(() => {
    if (!isSearching) return [];
    const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
    return globalPresetIndex.filter((entry) =>
      tokens.every((token) => entry.haystack.includes(token))
    );
  }, [globalPresetIndex, isSearching, normalizedQuery]);

  const filteredAppliances = useMemo(() => {
    if (isSearching) {
      const tokens = normalizedQuery.split(/\s+/).filter(Boolean);
      return APPLIANCE_CATALOG.filter((item) => {
        const haystack =
          `${item.name} ${item.desc} ${item.mountHint} ${item.category} ${(item.tags ?? []).join(' ')}`.toLowerCase();
        return tokens.every((token) => haystack.includes(token));
      });
    }
    if (activeTab === 'boards') return [];
    return APPLIANCE_CATALOG.filter((item) => item.category === activeTab);
  }, [activeTab, isSearching, normalizedQuery]);

  if (!open) return null;

  const activeTabMeta = ROOM_TABS.find((t) => t.id === activeTab) ?? ROOM_TABS[0];

  const handleSelectMaterial = (matId: MaterialId) => {
    setSelectedMaterial(matId);
    setCatalogParams(getDefaultParamsForMaterial(getMaterialMeta(matId)));
  };

  const handleSelectCategoryFilter = (cat: MaterialFilterTab) => {
    setMatCategoryFilter(cat);
    const matching = MATERIAL_CATALOG.filter((m) => matchesMaterialFilter(m, cat));
    if (matching.length > 0 && !matching.some((m) => m.id === selectedMaterial)) {
      handleSelectMaterial(matching[0].id);
    }
  };

  const handleInsertAppliance = (item: ApplianceMeta) => {
    onAddPart({
      name: item.name,
      kind: 'appliance',
      applianceModel: item.id,
      appliancePricePln: item.defaultPricePln,
      materialId: 'steel_galv',
      width: item.width,
      height: item.height,
      depth: item.depth,
      position: [0, item.defaultY, 0],
      rotation: [0, 0, 0],
    });
    onClose();
  };

  const totalCurrentSectionItems = materialSections.reduce(
    (sum, section) => sum + section.items.length,
    0
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-[3px] p-0 md:p-4"
    >
      <div className="studio-sheet animate-studio-sheet w-full md:max-w-5xl rounded-t-3xl md:rounded-3xl text-zinc-100 flex flex-col max-h-[92dvh] md:max-h-[88dvh] overflow-hidden">
        <div className="md:hidden flex justify-center pt-2.5 pb-0.5 shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Top Modal Header + Global Search */}
        <div className="flex flex-col gap-3 border-b border-white/[0.08] px-4 sm:px-5 py-3.5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white truncate">
                Biblioteka elementów i urządzeń 3D
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                Wybierz materiał, dobierz grubość lub długość i wstaw gotowy element w mm
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer shrink-0"
              aria-label="Zamknij bibliotekę"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Live Global Search across all materials, connectors, & rooms */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj w katalogu: OSB, styropian, kantówka, kątownik, kotwa, krokiew, blat, pralka..."
              className="h-10 w-full rounded-xl border border-white/[0.09] bg-white/[0.05] pl-9 pr-9 text-xs sm:text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Wyczyść wyszukiwanie"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Mobile Horizontal Room Category Tabs (< md) */}
          <div className="md:hidden -mx-1 flex items-center gap-1.5 overflow-x-auto px-1 pb-0.5 cad-scroll">
            {ROOM_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = !isSearching && activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    setActiveTab(tab.id);
                  }}
                  className={`flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'border-amber-500/80 bg-amber-500/15 text-amber-300 font-semibold'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-300 active:bg-zinc-800'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span>{tab.shortLabel}</span>
                  <span className="text-[11px] font-mono-num text-zinc-500">
                    {countsByTab[tab.id]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Split Body: Desktop Sidebar Rail + Scrollable Content */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Desktop Left Category Rail (>= md) */}
          <aside className="hidden md:flex w-56 shrink-0 flex-col justify-between border-r border-zinc-800 bg-[#111215] p-3 overflow-y-auto cad-scroll">
            <div className="space-y-1">
              <div className="px-2.5 pb-1.5 text-[11px] font-medium text-zinc-500">
                Katalog i pomieszczenia
              </div>
              {ROOM_TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = !isSearching && activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setActiveTab(tab.id);
                    }}
                    className={`flex w-full min-h-[40px] items-center justify-between gap-2 rounded-xl px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                      isActive
                        ? 'bg-amber-500/15 text-amber-300 font-semibold border border-amber-500/40'
                        : 'text-zinc-300 hover:bg-zinc-800/70 hover:text-white border border-transparent'
                    }`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          isActive ? 'text-amber-400' : 'text-zinc-400'
                        }`}
                      />
                      <span className="truncate">{tab.label}</span>
                    </span>
                    <span className="text-[11px] font-mono-num text-zinc-500 shrink-0">
                      {countsByTab[tab.id]}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Quick Parametric & Sketch Launchers */}
            <div className="mt-4 space-y-1.5 border-t border-zinc-800/90 pt-3">
              <div className="px-2 pb-1 text-[11px] font-medium text-zinc-500">
                Kreatory własne
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCabinetBuilder();
                }}
                className="flex w-full min-h-[38px] items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-2.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors cursor-pointer"
              >
                <LayoutPanelTop className="h-4 w-4 shrink-0" />
                <span className="truncate">Kreator szafki</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenCustomSketch();
                }}
                className="flex w-full min-h-[38px] items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:border-amber-500/50 hover:text-amber-300 transition-colors cursor-pointer"
              >
                <PenTool className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="truncate">Narysuj płytę 2D</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenMaterialsManager();
                }}
                className="flex w-full min-h-[36px] items-center gap-2 rounded-xl px-2.5 text-xs font-medium text-zinc-400 hover:bg-zinc-800/70 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                <Settings2 className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">Katalog i ceny płyt</span>
              </button>
            </div>
          </aside>

          {/* Right Main Scrollable Catalog Panel */}
          <div className="cad-scroll flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
            {/* ==================== SEARCH RESULTS MODE ==================== */}
            {isSearching ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <div className="text-xs font-semibold text-white">
                    Wyniki dla „{searchQuery.trim()}”
                  </div>
                  <div className="text-xs font-mono-num text-zinc-400">
                    {filteredSearchPresets.length + filteredAppliances.length} poz.
                  </div>
                </div>

                {filteredSearchPresets.length === 0 && filteredAppliances.length === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-zinc-300">
                      Brak pasujących elementów ani urządzeń
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Spróbuj np. „OSB”, „styropian”, „wełna”, „kantówka 80”, „kątownik”, „kotwa”, „krokiew”, „blat” lub „pralka”
                    </p>
                  </div>
                ) : (
                  <>
                    {filteredSearchPresets.length > 0 && (
                      <div className="space-y-2.5">
                        <h3 className="text-xs font-semibold text-zinc-300">
                          Materiały, formatki, kantówki i złącza ({filteredSearchPresets.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {filteredSearchPresets.map((entry) => {
                            const Icon = getPresetIcon(entry.item.iconKind);
                            return (
                              <button
                                key={entry.key}
                                type="button"
                                onClick={() => {
                                  onAddPart(entry.item.build(entry.materialId, entry.params));
                                  onClose();
                                }}
                                className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/75 p-3 text-left hover:border-amber-500/70 hover:bg-zinc-900 transition-colors cursor-pointer min-h-[72px]"
                              >
                                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800/90 text-zinc-300 group-hover:bg-amber-500/15 group-hover:text-amber-300 transition-colors shrink-0">
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors leading-snug">
                                      {entry.item.label}
                                    </span>
                                    <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 group-hover:bg-amber-500 group-hover:text-zinc-950 transition-colors shrink-0">
                                      <Plus className="h-3.5 w-3.5" />
                                    </div>
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-zinc-400 leading-snug line-clamp-1">
                                    {entry.item.desc}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                                    <span className="font-mono-num text-zinc-200">
                                      {entry.dimsText}
                                    </span>
                                    <span className="text-zinc-600" aria-hidden="true">
                                      ·
                                    </span>
                                    <span className="text-amber-300/90 font-medium">
                                      {entry.materialShortName}
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {filteredAppliances.length > 0 && (
                      <div className="space-y-2.5">
                        <h3 className="text-xs font-semibold text-zinc-300">
                          Urządzenia i wyposażenie pomieszczeń ({filteredAppliances.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {filteredAppliances.map((item) => {
                            const Icon = getApplianceIcon(item.id);
                            const roomLabel =
                              ROOM_TABS.find((t) => t.id === item.category)?.shortLabel ?? '';
                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => handleInsertAppliance(item)}
                                className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/75 p-3 text-left hover:border-amber-500/60 hover:bg-zinc-900 transition-colors cursor-pointer min-h-[76px]"
                              >
                                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800/90 text-zinc-300 group-hover:bg-amber-500/15 group-hover:text-amber-300 transition-colors shrink-0">
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <span className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors leading-snug">
                                      {item.name}
                                    </span>
                                    <Plus className="h-4 w-4 text-zinc-500 group-hover:text-amber-400 shrink-0 mt-0.5" />
                                  </div>
                                  <p className="mt-0.5 text-[11px] text-zinc-400 leading-snug line-clamp-2">
                                    {item.desc}
                                  </p>
                                  <div className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-zinc-500">
                                    <span className="font-mono-num text-zinc-300">
                                      {item.width}×{item.height}×{item.depth} mm
                                    </span>
                                    <span aria-hidden="true">·</span>
                                    <span>{roomLabel}</span>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono-num text-amber-300/90">
                                      {item.defaultPricePln.toLocaleString('pl-PL')} zł
                                    </span>
                                  </div>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : activeTab === 'boards' ? (
              /* ==================== TAB: MATERIAŁY I KONSTRUKCJE ==================== */
              <div className="space-y-4">
                {/* Mobile quick launchers */}
                <div className="md:hidden grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCabinetBuilder();
                    }}
                    className="flex min-h-[48px] items-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/12 px-3 py-2 text-left active:bg-emerald-500/20"
                  >
                    <LayoutPanelTop className="h-4 w-4 text-emerald-300 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-emerald-200 truncate">
                        Kreator szafki
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">Korpus i szuflady</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCustomSketch();
                    }}
                    className="flex min-h-[48px] items-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/12 px-3 py-2 text-left active:bg-amber-500/20"
                  >
                    <PenTool className="h-4 w-4 text-amber-300 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-amber-200 truncate">
                        Szkic płyty 2D
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">Skosy i wycięcia</div>
                    </div>
                  </button>
                </div>

                {/* Step 1: Material Category & Swatch Selector */}
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-5 w-5 items-center justify-center rounded-md bg-amber-500/15 text-[11px] font-bold text-amber-300 shrink-0">
                        1
                      </span>
                      <h3 className="text-xs font-semibold text-zinc-100 truncate">
                        Wybierz grupę i materiał
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenMaterialsManager();
                      }}
                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/15 transition-colors cursor-pointer shrink-0"
                    >
                      <Settings2 className="h-3 w-3" />
                      <span>Dodaj własny / Cennik</span>
                    </button>
                  </div>

                  {/* Category filter tabs */}
                  <div className="flex items-center gap-1.5 overflow-x-auto cad-scroll pb-0.5">
                    {MATERIAL_FILTER_TABS.map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleSelectCategoryFilter(cat.id)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          matCategoryFilter === cat.id
                            ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                            : 'border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  {/* Swatch tiles */}
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {filteredMaterials.map((mat) => {
                      const active = selectedMaterial === mat.id;
                      return (
                        <button
                          key={mat.id}
                          type="button"
                          onClick={() => handleSelectMaterial(mat.id)}
                          className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-all cursor-pointer ${
                            active
                              ? 'border-amber-500 bg-amber-500/15 text-white shadow-[0_0_0_1px_rgba(245,158,11,0.35)]'
                              : 'border-zinc-800 bg-zinc-900/75 text-zinc-300 hover:border-zinc-700 hover:bg-zinc-900'
                          }`}
                        >
                          <img
                            src={swatches[mat.id]}
                            alt={mat.name}
                            referrerPolicy="no-referrer"
                            className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg object-cover border border-white/10 shrink-0"
                          />
                          <span className="text-[10px] font-medium leading-tight truncate w-full">
                            {mat.shortName}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Step 2: Live Material-Specific Parameter Configurator */}
                <div className="rounded-2xl border border-amber-500/25 bg-zinc-900/85 p-3.5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={swatches[selectedMeta.id]}
                        alt={selectedMeta.name}
                        referrerPolicy="no-referrer"
                        className="h-9 w-9 rounded-xl object-cover border border-white/15 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs sm:text-sm font-semibold text-white truncate">
                            {familyConfig.title}
                          </span>
                        </div>
                        <p className="text-[11px] text-zinc-400 leading-snug">
                          {familyConfig.subtitle}
                        </p>
                      </div>
                    </div>
                    <div className="hidden sm:flex flex-col items-end shrink-0 text-right">
                      <span className="text-[11px] font-mono-num text-amber-300 font-semibold">
                        {selectedMeta.pricePerLinearMPln
                          ? `${selectedMeta.pricePerLinearMPln} zł/mb`
                          : `${selectedMeta.pricePerM2Pln} zł/m²`}
                      </span>
                      <span className="text-[10px] font-mono-num text-zinc-500">
                        {totalCurrentSectionItems} gotowych poz.
                      </span>
                    </div>
                  </div>

                  {/* Interactive Chips: Thickness / Length / Depth / Orientation */}
                  <div className="flex flex-col gap-2.5 pt-1 border-t border-white/[0.06]">
                    {familyConfig.thicknessOptions && familyConfig.thicknessLabel && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                        <span className="text-[11px] font-medium text-zinc-400 shrink-0 sm:w-32">
                          {familyConfig.thicknessLabel}:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {familyConfig.thicknessOptions.map((mm) => {
                            const active = catalogParams.thicknessMm === mm;
                            return (
                              <button
                                key={mm}
                                type="button"
                                onClick={() =>
                                  setCatalogParams((prev) => ({ ...prev, thicknessMm: mm }))
                                }
                                className={`min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] font-mono-num font-semibold transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-amber-500 text-zinc-950 shadow-sm'
                                    : 'border border-zinc-700/80 bg-zinc-950/60 text-zinc-300 hover:border-amber-500/50 hover:text-white'
                                }`}
                              >
                                {mm} mm
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {familyConfig.lengthOptions && familyConfig.lengthLabel && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                        <span className="text-[11px] font-medium text-zinc-400 shrink-0 sm:w-32">
                          {familyConfig.lengthLabel}:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {familyConfig.lengthOptions.map((mm) => {
                            const active = catalogParams.lengthMm === mm;
                            return (
                              <button
                                key={mm}
                                type="button"
                                onClick={() =>
                                  setCatalogParams((prev) => ({ ...prev, lengthMm: mm }))
                                }
                                className={`min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] font-mono-num font-semibold transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-amber-500 text-zinc-950 shadow-sm'
                                    : 'border border-zinc-700/80 bg-zinc-950/60 text-zinc-300 hover:border-amber-500/50 hover:text-white'
                                }`}
                              >
                                {mm >= 1000 && mm % 1000 === 0
                                  ? `${mm / 1000} m (${mm})`
                                  : `${mm} mm`}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {familyConfig.depthOptions && familyConfig.depthLabel && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                        <span className="text-[11px] font-medium text-zinc-400 shrink-0 sm:w-32">
                          {familyConfig.depthLabel}:
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {familyConfig.depthOptions.map((mm) => {
                            const active = catalogParams.depthMm === mm;
                            return (
                              <button
                                key={mm}
                                type="button"
                                onClick={() =>
                                  setCatalogParams((prev) => ({ ...prev, depthMm: mm }))
                                }
                                className={`min-h-[30px] rounded-lg px-2.5 py-1 text-[11px] font-mono-num font-semibold transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-amber-500 text-zinc-950 shadow-sm'
                                    : 'border border-zinc-700/80 bg-zinc-950/60 text-zinc-300 hover:border-amber-500/50 hover:text-white'
                                }`}
                              >
                                {mm} mm
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {familyConfig.supportsOrientation && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                        <span className="text-[11px] font-medium text-zinc-400 shrink-0 sm:w-32">
                          Ustawienie startowe:
                        </span>
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              setCatalogParams((prev) => ({ ...prev, orientation: 'vertical' }))
                            }
                            className={`flex min-h-[30px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                              catalogParams.orientation === 'vertical'
                                ? 'bg-sky-500 text-zinc-950'
                                : 'border border-zinc-700/80 bg-zinc-950/60 text-zinc-300 hover:border-sky-500/50'
                            }`}
                          >
                            <ArrowUpDown className="h-3.5 w-3.5" />
                            <span>Pionowo (słupek)</span>
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setCatalogParams((prev) => ({ ...prev, orientation: 'horizontal' }))
                            }
                            className={`flex min-h-[30px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                              catalogParams.orientation === 'horizontal'
                                ? 'bg-sky-500 text-zinc-950'
                                : 'border border-zinc-700/80 bg-zinc-950/60 text-zinc-300 hover:border-sky-500/50'
                            }`}
                          >
                            <ArrowLeftRight className="h-3.5 w-3.5" />
                            <span>Poziomo (belka / deska)</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 3: Material-Specific Grouped Catalog Sections */}
                <div className="space-y-5">
                  {materialSections.map((section) => (
                    <div key={section.id} className="space-y-2.5">
                      <div className="flex items-end justify-between gap-2 border-b border-zinc-800/80 pb-1.5">
                        <div className="min-w-0">
                          <h4 className="text-xs font-semibold text-zinc-100 truncate">
                            {section.title}
                          </h4>
                          {section.subtitle && (
                            <p className="text-[11px] text-zinc-500 truncate">
                              {section.subtitle}
                            </p>
                          )}
                        </div>
                        <span className="text-[11px] font-mono-num text-zinc-500 shrink-0">
                          {section.items.length} poz.
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {section.items.map((preset) => {
                          const Icon = getPresetIcon(preset.iconKind);
                          const liveDims = preset.formatDims(catalogParams);
                          return (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                onAddPart(preset.build(selectedMaterial, catalogParams));
                                onClose();
                              }}
                              className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/75 p-3 text-left hover:border-amber-500/70 hover:bg-zinc-900 transition-colors cursor-pointer min-h-[74px]"
                            >
                              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-800/90 text-zinc-300 group-hover:bg-amber-500/15 group-hover:text-amber-300 transition-colors shrink-0 mt-0.5">
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start justify-between gap-2">
                                  <span className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors leading-snug">
                                    {preset.label}
                                  </span>
                                  <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 group-hover:bg-amber-500 group-hover:text-zinc-950 transition-colors shrink-0">
                                    <Plus className="h-3.5 w-3.5" />
                                  </div>
                                </div>
                                <p className="mt-0.5 text-[11px] text-zinc-400 leading-snug line-clamp-1">
                                  {preset.desc}
                                </p>
                                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                                  <span className="text-[11px] font-mono-num text-zinc-200 font-medium">
                                    {liveDims}
                                  </span>
                                  {preset.badge && (
                                    <span
                                      className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold leading-none ${getBadgeToneClasses(
                                        preset.badgeTone
                                      )}`}
                                    >
                                      {preset.badge}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* ==================== ROOM APPLIANCE TABS ==================== */
              <div className="space-y-4">
                <div className="flex items-end justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-white">{activeTabMeta.label}</h3>
                    <p className="mt-0.5 text-xs text-zinc-400">{activeTabMeta.subtitle}</p>
                  </div>
                  <div className="text-[11px] text-zinc-500 whitespace-nowrap shrink-0">
                    <span className="font-mono-num text-zinc-300">{filteredAppliances.length}</span>{' '}
                    urządzeń · wliczane w wycenę
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {filteredAppliances.map((item) => {
                    const Icon = getApplianceIcon(item.id);
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleInsertAppliance(item)}
                        className="group flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-900/75 p-3 text-left hover:border-amber-500/65 hover:bg-zinc-900 transition-colors cursor-pointer min-h-[82px]"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-800/90 text-zinc-300 group-hover:bg-amber-500/15 group-hover:text-amber-300 transition-colors shrink-0">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors leading-snug">
                              {item.name}
                            </span>
                            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-zinc-800 text-zinc-400 group-hover:bg-amber-500 group-hover:text-zinc-950 transition-colors shrink-0">
                              <Plus className="h-3.5 w-3.5" />
                            </div>
                          </div>
                          <p className="mt-0.5 text-[11px] text-zinc-400 leading-snug">
                            {item.desc}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-zinc-500">
                            <span className="font-mono-num text-zinc-300">
                              {item.width} × {item.height} × {item.depth} mm
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{item.mountHint}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-mono-num text-amber-300/90">
                              {item.defaultPricePln.toLocaleString('pl-PL')} zł
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
