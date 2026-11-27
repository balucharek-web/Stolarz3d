import React, { useMemo, useState } from 'react';
import { LayoutPanelTop, PenTool, Plus, Settings2, X } from 'lucide-react';
import {
  APPLIANCE_CATALOG,
  FurniturePart,
  MATERIAL_CATALOG,
  MaterialId,
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

interface PresetBlueprint {
  id: string;
  label: string;
  desc: string;
  build: (materialId: MaterialId) => Omit<FurniturePart, 'id'>;
}

const PRESETS: PresetBlueprint[] = [
  {
    id: 'shelf_horiz',
    label: 'Półka pozioma',
    desc: '800 × 18 × 450 mm · Płyta pozioma',
    build: (materialId) => ({
      name: 'Półka pozioma',
      kind: 'panel',
      materialId,
      width: 800,
      height: 18,
      depth: 450,
      position: [0, 600, 0],
      rotation: [0, 0, 0],
    }),
  },
  {
    id: 'wall_vert',
    label: 'Bok / ściana pionowa',
    desc: '18 × 1200 × 450 mm · Pionowy element konstrukcyjny',
    build: (materialId) => ({
      name: 'Ściana boczna',
      kind: 'panel',
      materialId,
      width: 18,
      height: 1200,
      depth: 450,
      position: [400, 600, 0],
      rotation: [0, 0, 0],
      grainRotated: true,
    }),
  },
  {
    id: 'sloped_panel',
    label: 'Płyta ze skosem (trapez)',
    desc: '900 × 800 × 18 mm · Ścięcie dachowe / poddaszowe',
    build: (materialId) => ({
      name: 'Płyta ze skosem',
      kind: 'sloped',
      materialId,
      width: 900,
      height: 800,
      depth: 18,
      position: [0, 400, 0],
      rotation: [0, 0, 0],
      slopeTopLeft: 0,
      slopeTopRight: 320,
    }),
  },
  {
    id: 'gusset_triangle',
    label: 'Zastrzał / trójkąt wzmacniający',
    desc: '300 × 300 × 18 mm · Narożne usztywnienie skośne',
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
    label: 'Słupek / profil nośny',
    desc: '40 × 1600 × 40 mm · Krawędziak lub profil stalowy',
    build: (materialId) => ({
      name: 'Profil nośny',
      kind: 'profile',
      materialId:
        materialId === 'steel_black' || materialId === 'steel_galv'
          ? materialId
          : 'steel_black',
      width: 40,
      height: 1600,
      depth: 40,
      position: [0, 800, 0],
      rotation: [0, 0, 0],
    }),
  },
  {
    id: 'kitchen_door',
    label: 'Front szafki z uchwytem',
    desc: '596 × 714 × 18 mm · Drzwiczki z metalowym uchwytem',
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
    desc: '1200 × 38 × 600 mm · Zaokrąglony nosek frontowy',
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
];

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
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialId>('osb3');

  const swatches = useMemo(() => {
    void materialsVersion;
    const map: Partial<Record<MaterialId, string>> = {};
    for (const m of MATERIAL_CATALOG) {
      map[m.id] = getMaterialSwatchDataUrl(m.id, customTextures);
    }
    return map;
  }, [customTextures, materialsVersion]);

  if (!open) return null;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4"
    >
      <div className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col max-h-[85dvh]">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-white">Dodaj nowy element</h2>
            <p className="text-xs text-zinc-400">
              Wybierz materiał i kształt płyty — wymiary zmienisz w każdej chwili
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="cad-scroll overflow-y-auto px-5 py-4 space-y-5">
          {/* Featured Actions: Parametric Cabinet Builder + Draw Any Custom 2D Shape */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCabinetBuilder();
              }}
              className="group flex items-center justify-between gap-2.5 rounded-xl border border-emerald-500/50 bg-emerald-500/12 px-3.5 py-3 text-left hover:bg-emerald-500/20 transition-colors cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-emerald-300">
                  Kreator szafki i szuflad
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-300 leading-snug">
                  Parametryczny korpus, szuflady, fronty, zawiasy Ø35 i cokół
                </div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-zinc-950 shrink-0">
                <LayoutPanelTop className="h-4 w-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                onClose();
                onOpenCustomSketch();
              }}
              className="group flex items-center justify-between gap-2.5 rounded-xl border border-amber-500/50 bg-amber-500/12 px-3.5 py-3 text-left hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <div className="min-w-0">
                <div className="text-xs font-semibold text-amber-300">
                  Narysuj własny kształt 2D
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-300 leading-snug">
                  Kształty L, wnęki, skosy poddaszowe i wycięcia na siatce mm
                </div>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-zinc-950 shrink-0">
                <PenTool className="h-4 w-4" />
              </div>
            </button>
          </div>

          {/* Step 1: Material Picker */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold text-zinc-300">
                1. Domyślny materiał elementu
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
                <span>Katalog i ceny z hurtowni</span>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
              {MATERIAL_CATALOG.map((mat) => {
                const active = selectedMaterial === mat.id;
                return (
                  <button
                    key={mat.id}
                    type="button"
                    onClick={() => setSelectedMaterial(mat.id)}
                    className={`flex sm:flex-col items-center gap-2 sm:gap-1.5 rounded-xl border p-2 text-left sm:text-center transition-colors cursor-pointer ${
                      active
                        ? 'border-amber-500 bg-amber-500/15 text-white'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    <img
                      src={swatches[mat.id]}
                      alt={mat.name}
                      referrerPolicy="no-referrer"
                      className="h-8 w-8 sm:h-9 sm:w-9 rounded-lg object-cover border border-white/10 shrink-0"
                    />
                    <span className="text-[11px] font-medium leading-tight truncate w-full">
                      {mat.shortName}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: Element Shape Presets */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300">
              2. Wybierz typ elementu do wstawienia
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    onAddPart(preset.build(selectedMaterial));
                    onClose();
                  }}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-3 text-left hover:border-amber-500/70 hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-100 group-hover:text-amber-300 transition-colors">
                      {preset.label}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-400 truncate">
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

          {/* Step 3: Interior Accessories & 3D Kitchen Appliances */}
          <div className="space-y-2 border-t border-zinc-800/80 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-zinc-300">
                3. Wnętrze szaf, AGD i sanitariaty WC 3D (bez rozkroju płyt)
              </h3>
              <span className="text-[10px] text-zinc-500">Wliczane w kosztorys</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {APPLIANCE_CATALOG.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
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
                  }}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 px-3.5 py-2.5 text-left hover:border-sky-500/70 hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-100 group-hover:text-sky-300 transition-colors truncate">
                      {item.name}
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-400 truncate">
                      {item.desc}
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0">
                    <span className="text-[10px] font-mono-num text-amber-300/90">
                      {item.defaultPricePln} zł
                    </span>
                    <Plus className="h-3.5 w-3.5 text-zinc-400 group-hover:text-sky-300 mt-0.5" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
