import React, { useMemo, useState } from 'react';
import {
  Armchair,
  Bath,
  BedDouble,
  BedSingle,
  Box,
  CookingPot,
  Droplets,
  Flame,
  Layers,
  LayoutPanelTop,
  Monitor,
  PenTool,
  Plus,
  Refrigerator,
  Search,
  Settings2,
  Shirt,
  ShowerHead,
  Sofa,
  Sparkles,
  Thermometer,
  Tv,
  Utensils,
  WashingMachine,
  Wind,
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
  getMaterialMeta,
} from '../types/furniture';
import { getMaterialSwatchDataUrl } from '../engine/materials';

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

interface PresetBlueprint {
  id: string;
  label: string;
  dims: string;
  desc: string;
  tags: string[];
  build: (materialId: MaterialId) => Omit<FurniturePart, 'id'>;
}

const PRESETS: PresetBlueprint[] = [
  {
    id: 'shelf_horiz',
    label: 'Półka / płyta pozioma',
    dims: '800 × grub. × 450 mm',
    desc: 'Płyta pozioma, podłoga, wieniec',
    tags: ['półka', 'płyta', 'deska', 'wieniec', 'podłoga'],
    build: (materialId) => {
      const t = Math.min(120, Math.max(4, getMaterialMeta(materialId).defaultThicknessMm));
      return {
        name: 'Płyta pozioma',
        kind: 'panel',
        materialId,
        width: 800,
        height: t,
        depth: 450,
        position: [0, 600, 0],
        rotation: [0, 0, 0],
      };
    },
  },
  {
    id: 'wall_vert',
    label: 'Bok / ściana pionowa',
    dims: 'grub. × 1200 × 450 mm',
    desc: 'Ściana boczna, przegroda, ocieplenie',
    tags: ['bok', 'przegroda', 'ściana', 'płyta', 'styropian', 'ocieplenie'],
    build: (materialId) => {
      const t = Math.min(150, Math.max(4, getMaterialMeta(materialId).defaultThicknessMm));
      return {
        name: 'Ściana boczna',
        kind: 'panel',
        materialId,
        width: t,
        height: 1200,
        depth: 450,
        position: [400, 600, 0],
        rotation: [0, 0, 0],
        grainRotated: true,
      };
    },
  },
  {
    id: 'timber_beam',
    label: 'Kantówka / belka drewniana',
    dims: '50 × 1000 × 50 mm',
    desc: 'Szkielet budy, altany, pergoli (rozkrój mb)',
    tags: ['kantówka', 'belka', 'drewno', 'słupek', 'krawędziak', 'buda', 'c24'],
    build: (materialId) => {
      const meta = getMaterialMeta(materialId);
      const useSelected = Boolean(meta.barLengthMm && meta.category !== 'Stal i szkło');
      const finalMat = useSelected ? materialId : 'pine_timber';
      const sec = useSelected ? Math.max(20, Math.min(180, meta.defaultThicknessMm)) : 50;
      return {
        name: `Kantówka ${sec}×${sec}`,
        kind: 'profile',
        materialId: finalMat,
        width: sec,
        height: 1000,
        depth: sec,
        position: [0, 500, 0],
        rotation: [0, 0, 0],
      };
    },
  },
  {
    id: 'wood_batten',
    label: 'Łata / listwa montażowa',
    dims: '40 × 1000 × 25 mm',
    desc: 'Łata dachowa, legar lub ramiak (mb)',
    tags: ['łata', 'listwa', 'legar', 'drewno', 'buda', 'dach'],
    build: (materialId) => {
      const meta = getMaterialMeta(materialId);
      const finalMat =
        meta.category === 'Budowa i ogród' ? materialId : 'pine_timber';
      return {
        name: 'Łata drewniana 40×25',
        kind: 'profile',
        materialId: finalMat,
        width: 40,
        height: 1000,
        depth: 25,
        position: [0, 500, 0],
        rotation: [0, 0, 0],
      };
    },
  },
  {
    id: 'insulation_slab',
    label: 'Płyta izolacyjna (styropian / wełna)',
    dims: '1000 × 500 × 50 mm',
    desc: 'Ocieplenie ścian i dachu budy / domku',
    tags: ['styropian', 'eps', 'wełna', 'ocieplenie', 'izolacja', 'buda'],
    build: (materialId) => {
      const meta = getMaterialMeta(materialId);
      const finalMat =
        meta.category === 'Izolacja i dach' && materialId !== 'roof_shingle'
          ? materialId
          : 'styrofoam_eps';
      const finalMeta = getMaterialMeta(finalMat);
      return {
        name: finalMeta.shortName,
        kind: 'panel',
        materialId: finalMat,
        width: 1000,
        height: 500,
        depth: Math.max(20, Math.min(200, finalMeta.defaultThicknessMm)),
        position: [0, 300, 0],
        rotation: [0, 0, 0],
      };
    },
  },
  {
    id: 'sloped_panel',
    label: 'Płyta ze skosem (trapez / dach)',
    dims: '900 × 800 × grub. mm',
    desc: 'Ścięcie dachowe, szczyt budy / poddasza',
    tags: ['skos', 'trapez', 'poddasze', 'płyta', 'dach', 'buda'],
    build: (materialId) => {
      const t = Math.min(120, Math.max(4, getMaterialMeta(materialId).defaultThicknessMm));
      return {
        name: 'Płyta ze skosem',
        kind: 'sloped',
        materialId,
        width: 900,
        height: 800,
        depth: t,
        position: [0, 400, 0],
        rotation: [0, 0, 0],
        slopeTopLeft: 0,
        slopeTopRight: 320,
      };
    },
  },
  {
    id: 'kitchen_door',
    label: 'Front szafki z uchwytem',
    dims: '596 × 714 × 18 mm',
    desc: 'Drzwiczki z okleiną ABS i uchwytem',
    tags: ['front', 'drzwi', 'drzwiczki', 'szafka'],
    build: (materialId) => ({
      name: 'Front meblowy',
      kind: 'door',
      materialId,
      width: 596,
      height: 714,
      depth: 18,
      position: [0, 460, 280],
      rotation: [0, 0, 0],
      handleSide: 'right',
      grainRotated: true,
      edgeBanding: { thicknessMm: 0.8, top: true, bottom: true, left: true, right: true },
    }),
  },
  {
    id: 'kitchen_countertop',
    label: 'Blat kuchenny 38 mm',
    dims: '1200 × 38 × 600 mm',
    desc: 'Zaokrąglony nosek frontowy',
    tags: ['blat', 'roboczy', 'kuchnia', 'biurko'],
    build: (materialId) => ({
      name: 'Blat kuchenny 38 mm',
      kind: 'countertop',
      materialId: materialId === 'osb3' ? 'concrete_top' : materialId,
      width: 1200,
      height: 38,
      depth: 600,
      position: [0, 840, 0],
      rotation: [0, 0, 0],
    }),
  },
  {
    id: 'gusset_triangle',
    label: 'Zastrzał / trójkąt wzmacniający',
    dims: '300 × 300 × 18 mm',
    desc: 'Narożne usztywnienie skośne',
    tags: ['zastrzał', 'trójkąt', 'wzmocnienie'],
    build: (materialId) => ({
      name: 'Zastrzał skośny',
      kind: 'sloped',
      materialId,
      width: 300,
      height: 300,
      depth: 18,
      position: [0, 500, 0],
      rotation: [0, 0, 0],
      slopeBottomRight: 270,
    }),
  },
  {
    id: 'steel_post',
    label: 'Profil stalowy / słupek loft',
    dims: '40 × 1600 × 40 mm',
    desc: 'Profil stalowy 40×40 mm (rozkrój mb)',
    tags: ['profil', 'stal', 'słupek', 'noga', 'loft'],
    build: (materialId) => {
      const meta = getMaterialMeta(materialId);
      const finalMat =
        meta.barLengthMm !== undefined ? materialId : 'steel_black';
      return {
        name: 'Profil nośny',
        kind: 'profile',
        materialId: finalMat,
        width: 40,
        height: 1600,
        depth: 40,
        position: [0, 800, 0],
        rotation: [0, 0, 0],
      };
    },
  },
];

const ROOM_TABS: Array<{
  id: CatalogTab;
  label: string;
  shortLabel: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'boards',
    label: 'Płyty i formatki',
    shortLabel: 'Płyty',
    subtitle: 'Elementy stolarskie, fronty, blaty i profile do rozkroju',
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
  const [matCategoryFilter, setMatCategoryFilter] = useState<'all' | MaterialCategory>('all');

  const filteredMaterials = useMemo(() => {
    void materialsVersion;
    if (matCategoryFilter === 'all') return MATERIAL_CATALOG;
    return MATERIAL_CATALOG.filter((m) => m.category === matCategoryFilter);
  }, [matCategoryFilter, materialsVersion]);

  const swatches = useMemo(() => {
    void materialsVersion;
    const map: Partial<Record<MaterialId, string>> = {};
    for (const m of MATERIAL_CATALOG) {
      map[m.id] = getMaterialSwatchDataUrl(m.id, customTextures);
    }
    return map;
  }, [customTextures, materialsVersion]);

  const countsByTab = useMemo(() => {
    const counts: Record<CatalogTab, number> = {
      boards: PRESETS.length,
      kitchen: 0,
      bathroom: 0,
      wardrobe: 0,
      living: 0,
    };
    for (const item of APPLIANCE_CATALOG) {
      counts[item.category] = (counts[item.category] ?? 0) + 1;
    }
    return counts;
  }, []);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const isSearching = normalizedQuery.length > 0;

  const filteredPresets = useMemo(() => {
    if (!isSearching) return PRESETS;
    return PRESETS.filter((p) => {
      const haystack = `${p.label} ${p.desc} ${p.dims} ${p.tags.join(' ')}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [isSearching, normalizedQuery]);

  const filteredAppliances = useMemo(() => {
    if (isSearching) {
      return APPLIANCE_CATALOG.filter((item) => {
        const haystack =
          `${item.name} ${item.desc} ${item.mountHint} ${item.category} ${(item.tags ?? []).join(' ')}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }
    if (activeTab === 'boards') return [];
    return APPLIANCE_CATALOG.filter((item) => item.category === activeTab);
  }, [activeTab, isSearching, normalizedQuery]);

  if (!open) return null;

  const activeTabMeta = ROOM_TABS.find((t) => t.id === activeTab) ?? ROOM_TABS[0];

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

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 backdrop-blur-[3px] p-0 md:p-4"
    >
      <div className="studio-sheet animate-studio-sheet w-full md:max-w-4xl rounded-t-3xl md:rounded-3xl text-zinc-100 flex flex-col max-h-[92dvh] md:max-h-[86dvh] overflow-hidden">
        <div className="md:hidden flex justify-center pt-2.5 pb-0.5 shrink-0">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>
        {/* Top Modal Header + Search Input */}
        <div className="flex flex-col gap-3 border-b border-white/[0.08] px-4 sm:px-5 py-3.5 shrink-0">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-white truncate">
                Biblioteka elementów i urządzeń 3D
              </h2>
              <p className="text-xs text-zinc-400 truncate">
                Wybierz pomieszczenie lub formatkę — każdy obiekt ma realne wymiary w mm
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

          {/* Live Global Search across all rooms & boards */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Szukaj w całym katalogu: pralka, geberit, lodówka, wanna, sofa, TV, półka..."
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

        {/* Main Split Body: Desktop Sidebar Rail + Scrollable Content Grid */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Desktop Left Category Rail (>= md) */}
          <aside className="hidden md:flex w-56 shrink-0 flex-col justify-between border-r border-zinc-800 bg-[#111215] p-3 overflow-y-auto cad-scroll">
            <div className="space-y-1">
              <div className="px-2.5 pb-1.5 text-[11px] font-medium text-zinc-500">
                Pomieszczenia i płyty
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
            {/* Search Results Mode */}
            {isSearching ? (
              <div className="space-y-5">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2">
                  <div className="text-xs font-semibold text-white">
                    Wyniki dla „{searchQuery.trim()}”
                  </div>
                  <div className="text-xs font-mono-num text-zinc-400">
                    {filteredPresets.length + filteredAppliances.length} poz.
                  </div>
                </div>

                {filteredPresets.length === 0 && filteredAppliances.length === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-8 text-center">
                    <p className="text-sm font-medium text-zinc-300">
                      Brak pasujących urządzeń ani płyt
                    </p>
                    <p className="mt-1 text-xs text-zinc-500">
                      Spróbuj np. „pralka”, „wanna”, „lodówka”, „geberit”, „sofa”, „TV” lub „półka”
                    </p>
                  </div>
                ) : (
                  <>
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

                    {filteredPresets.length > 0 && (
                      <div className="space-y-2.5">
                        <h3 className="text-xs font-semibold text-zinc-300">
                          Płyty i formatki stolarskie ({filteredPresets.length})
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          {filteredPresets.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() => {
                                onAddPart(preset.build(selectedMaterial));
                                onClose();
                              }}
                              className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/75 px-3.5 py-3 text-left hover:border-amber-500/70 hover:bg-zinc-900 transition-colors cursor-pointer min-h-[64px]"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors">
                                  {preset.label}
                                </div>
                                <div className="mt-0.5 text-[11px] text-zinc-400 truncate">
                                  <span className="font-mono-num text-zinc-300">{preset.dims}</span>
                                  {' · '}
                                  {preset.desc}
                                </div>
                              </div>
                              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 group-hover:bg-amber-500 group-hover:text-zinc-950 transition-colors shrink-0">
                                <Plus className="h-4 w-4" />
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            ) : activeTab === 'boards' ? (
              /* ==================== TAB: PŁYTY I FORMATKI ==================== */
              <div className="space-y-5">
                {/* Mobile quick launchers (hidden on md+ because they sit in the left rail) */}
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

                {/* Step 1: Material Picker with Category Filter */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-zinc-200">
                      Domyślny materiał elementu
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        onClose();
                        onOpenMaterialsManager();
                      }}
                      className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-amber-400 hover:bg-amber-500/15 transition-colors cursor-pointer"
                    >
                      <Settings2 className="h-3 w-3" />
                      <span>Dodaj własny / Cennik</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1 overflow-x-auto cad-scroll pb-0.5">
                    {(
                      [
                        { id: 'all', label: 'Wszystkie' },
                        { id: 'Budowa i ogród', label: 'Budowa / Kantówki' },
                        { id: 'Izolacja i dach', label: 'Izolacja i dach' },
                        { id: 'Płyty konstrukcyjne', label: 'OSB / Sklejka' },
                        { id: 'Płyty meblowe', label: 'Płyty meblowe' },
                        { id: 'Stal i szkło', label: 'Stal / Szkło' },
                      ] as const
                    ).map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setMatCategoryFilter(cat.id)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                          matCategoryFilter === cat.id
                            ? 'bg-amber-500 text-zinc-950 font-semibold'
                            : 'border border-zinc-800 bg-zinc-900/80 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5">
                    {filteredMaterials.map((mat) => {
                      const active = selectedMaterial === mat.id;
                      return (
                        <button
                          key={mat.id}
                          type="button"
                          onClick={() => setSelectedMaterial(mat.id)}
                          className={`flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition-colors cursor-pointer ${
                            active
                              ? 'border-amber-500 bg-amber-500/15 text-white'
                              : 'border-zinc-800 bg-zinc-900/80 text-zinc-300 hover:border-zinc-700'
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

                {/* Step 2: Board Shape Presets */}
                <div className="space-y-2">
                  <h3 className="text-xs font-semibold text-zinc-200">
                    Wybierz formatkę lub element konstrukcyjny
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => {
                          onAddPart(preset.build(selectedMaterial));
                          onClose();
                        }}
                        className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/75 px-3.5 py-3 text-left hover:border-amber-500/70 hover:bg-zinc-900 transition-colors cursor-pointer min-h-[64px]"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors">
                            {preset.label}
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-400 truncate">
                            <span className="font-mono-num text-zinc-300">{preset.dims}</span>
                            {' · '}
                            {preset.desc}
                          </div>
                        </div>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-800 text-zinc-300 group-hover:bg-amber-500 group-hover:text-zinc-950 transition-colors shrink-0">
                          <Plus className="h-4 w-4" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              /* ==================== ROOM APPLIANCE TABS ==================== */
              <div className="space-y-4">
                <div className="flex items-end justify-between gap-2 border-b border-zinc-800/80 pb-2.5">
                  <div>
                    <h3 className="text-sm font-semibold text-white">
                      {activeTabMeta.label}
                    </h3>
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
