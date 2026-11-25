import React, { useMemo, useRef, useState } from 'react';
import {
  ImagePlus,
  Layers,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from 'lucide-react';
import {
  BuiltInMaterialId,
  DEFAULT_MATERIAL_CATALOG,
  MATERIAL_CATALOG,
  MaterialId,
  MaterialMeta,
  MaterialsCatalogConfig,
} from '../types/furniture';
import { getMaterialSwatchDataUrl } from '../engine/materials';

interface MaterialsManagerModalProps {
  open: boolean;
  config: MaterialsCatalogConfig;
  materialsVersion: number;
  customTextures: Partial<Record<MaterialId, string>>;
  onClose: () => void;
  onChangeConfig: (next: MaterialsCatalogConfig) => void;
  onSetCustomTexture: (id: MaterialId, dataUrl: string | null) => void;
}

const CATEGORIES: MaterialMeta['category'][] = [
  'Płyty meblowe',
  'Płyty konstrukcyjne',
  'Blaty',
  'Stal i szkło',
];

export const MaterialsManagerModal: React.FC<MaterialsManagerModalProps> = ({
  open,
  config,
  materialsVersion,
  customTextures,
  onClose,
  onChangeConfig,
  onSetCustomTexture,
}) => {
  const [tab, setTab] = useState<'catalog' | 'add'>('catalog');
  const [name, setName] = useState('Egger H1180 Dąb Halifax');
  const [shortName, setShortName] = useState('Dąb Halifax');
  const [category, setCategory] = useState<MaterialMeta['category']>('Płyty meblowe');
  const [thicknessMm, setThicknessMm] = useState(18);
  const [sheetWidthMm, setSheetWidthMm] = useState(2800);
  const [sheetHeightMm, setSheetHeightMm] = useState(2070);
  const [pricePerM2Pln, setPricePerM2Pln] = useState(118);
  const [swatchHex, setSwatchHex] = useState('#B88E5F');
  const [grainDirectional, setGrainDirectional] = useState(true);
  const [pendingTexture, setPendingTexture] = useState<string | null>(null);

  const newFileRef = useRef<HTMLInputElement | null>(null);
  const rowFileRef = useRef<HTMLInputElement | null>(null);
  const [uploadTargetId, setUploadTargetId] = useState<MaterialId | null>(null);

  const swatches = useMemo(() => {
    void materialsVersion;
    const map: Partial<Record<MaterialId, string>> = {};
    for (const m of MATERIAL_CATALOG) {
      map[m.id] = getMaterialSwatchDataUrl(m.id, customTextures);
    }
    return map;
  }, [customTextures, materialsVersion]);

  if (!open) return null;

  const sheetAreaM2 = Math.max(0.01, (sheetWidthMm * sheetHeightMm) / 1_000_000);
  const sheetPricePln = Math.round(sheetAreaM2 * pricePerM2Pln);

  const readImageFile = (file: File, onLoaded: (dataUrl: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 512;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.max(32, Math.round(img.width * scale));
        c.height = Math.max(32, Math.round(img.height * scale));
        const ctx = c.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, c.width, c.height);
          onLoaded(c.toDataURL('image/jpeg', 0.86));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleAddCustomMaterial = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = name.trim();
    if (!cleanName) return;
    const id: MaterialId = `custom_mat_${Date.now().toString(36)}`;
    const newMat: MaterialMeta = {
      id,
      name: cleanName,
      shortName: (shortName.trim() || cleanName).slice(0, 22),
      category,
      defaultThicknessMm: Math.max(3, Math.min(80, Math.round(thicknessMm))),
      sheetWidthMm: Math.max(500, Math.min(4500, Math.round(sheetWidthMm))),
      sheetHeightMm: Math.max(300, Math.min(3000, Math.round(sheetHeightMm))),
      pricePerM2Pln: Math.max(1, Math.round(pricePerM2Pln)),
      swatchFallbackHex: swatchHex,
      isCustom: true,
      grainDirectional,
    };

    onChangeConfig({
      ...config,
      customMaterials: [...config.customMaterials, newMat],
    });
    if (pendingTexture) {
      onSetCustomTexture(id, pendingTexture);
    }

    setPendingTexture(null);
    setName('');
    setShortName('');
    setTab('catalog');
  };

  const updateBuiltInField = (
    id: BuiltInMaterialId,
    field: 'pricePerM2Pln' | 'sheetWidthMm' | 'sheetHeightMm',
    value: number
  ) => {
    if (!Number.isFinite(value) || value <= 0) return;
    const prev = config.builtInOverrides[id] ?? {};
    onChangeConfig({
      ...config,
      builtInOverrides: {
        ...config.builtInOverrides,
        [id]: {
          ...prev,
          [field]: Math.round(value),
        },
      },
    });
  };

  const updateCustomField = (
    id: string,
    field: 'pricePerM2Pln' | 'sheetWidthMm' | 'sheetHeightMm',
    value: number
  ) => {
    if (!Number.isFinite(value) || value <= 0) return;
    onChangeConfig({
      ...config,
      customMaterials: config.customMaterials.map((m) =>
        m.id === id ? { ...m, [field]: Math.round(value) } : m
      ),
    });
  };

  const deleteCustomMaterial = (id: string) => {
    onChangeConfig({
      ...config,
      customMaterials: config.customMaterials.filter((m) => m.id !== id),
    });
    onSetCustomTexture(id, null);
  };

  const resetBuiltInPrices = () => {
    onChangeConfig({
      ...config,
      builtInOverrides: {},
    });
  };

  const hasBuiltInOverrides = Object.keys(config.builtInOverrides).length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4">
      <div className="w-full sm:max-w-3xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-5 py-3.5">
          <div>
            <h2 className="text-base font-semibold text-white">
              Katalog płyt i cennik z hurtowni
            </h2>
            <p className="text-xs text-zinc-400">
              Dodaj dekory Egger, Kronospan lub Swiss Krono — ceny i formaty arkuszy aktualizują rozkrój 2D i wycenę
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
              <button
                type="button"
                onClick={() => setTab('catalog')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
                  tab === 'catalog'
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>Cennik ({MATERIAL_CATALOG.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setTab('add')}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium cursor-pointer ${
                  tab === 'add'
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Dodaj własną płytę</span>
              </button>
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
        </div>

        {/* Hidden file input for per-row photo texture upload */}
        <input
          ref={rowFileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && uploadTargetId) {
              readImageFile(file, (url) => onSetCustomTexture(uploadTargetId, url));
            }
            e.target.value = '';
          }}
        />

        {/* Body */}
        <div className="cad-scroll flex-1 overflow-y-auto px-5 py-4">
          {tab === 'add' ? (
            <form onSubmit={handleAddCustomMaterial} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Pełna nazwa płyty / dekoru
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="np. Egger H1180 ST37 Dąb Halifax"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Krótka nazwa (na przyciski i etykiety)
                  </label>
                  <input
                    type="text"
                    placeholder="np. Dąb Halifax"
                    value={shortName}
                    onChange={(e) => setShortName(e.target.value)}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Kategoria
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as MaterialMeta['category'])}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Grubość [mm]
                  </label>
                  <input
                    type="number"
                    min={3}
                    max={80}
                    value={thicknessMm}
                    onChange={(e) => setThicknessMm(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Arkusz szer. [mm]
                  </label>
                  <input
                    type="number"
                    min={500}
                    max={4500}
                    step={10}
                    value={sheetWidthMm}
                    onChange={(e) => setSheetWidthMm(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Arkusz wys. [mm]
                  </label>
                  <input
                    type="number"
                    min={300}
                    max={3000}
                    step={10}
                    value={sheetHeightMm}
                    onChange={(e) => setSheetHeightMm(Number(e.target.value))}
                    className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                    Cena w hurtowni [zł / m² netto]
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={5000}
                      value={pricePerM2Pln}
                      onChange={(e) => setPricePerM2Pln(Number(e.target.value))}
                      className="w-28 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm font-semibold font-mono-num text-amber-300 focus:border-amber-500 focus:outline-none"
                    />
                    <span className="text-xs text-zinc-400 font-mono-num">
                      ≈ <strong className="text-zinc-200">{sheetPricePln} zł</strong> / arkusz (
                      {sheetAreaM2.toFixed(2)} m²)
                    </span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-zinc-400">Kolor bazowy:</label>
                    <input
                      type="color"
                      value={swatchHex}
                      onChange={(e) => setSwatchHex(e.target.value)}
                      className="h-8 w-10 cursor-pointer rounded border border-zinc-700 bg-transparent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => newFileRef.current?.click()}
                    className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-amber-500/60 cursor-pointer"
                  >
                    <ImagePlus className="h-3.5 w-3.5 text-amber-400" />
                    <span>{pendingTexture ? 'Zmień zdjęcie' : 'Wgraj zdjęcie dekoru'}</span>
                  </button>
                  <input
                    ref={newFileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) readImageFile(file, setPendingTexture);
                      e.target.value = '';
                    }}
                  />
                  {pendingTexture && (
                    <img
                      src={pendingTexture}
                      alt="Podgląd dekoru"
                      className="h-9 w-9 rounded-lg object-cover border border-amber-500/60"
                    />
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-zinc-300 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={grainDirectional}
                  onChange={(e) => setGrainDirectional(e.target.checked)}
                  className="h-4 w-4 rounded border-zinc-700 bg-zinc-900 accent-amber-500"
                />
                <span>
                  Płyta ma kierunek słojów (blokuj obrót o 90° podczas rozkroju arkuszy 2D)
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-800">
                <button
                  type="button"
                  onClick={() => setTab('catalog')}
                  className="rounded-xl border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-800 cursor-pointer"
                >
                  Anuluj
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>Zapisz w moim katalogu</span>
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                <span>
                  Edytuj ceny za m² i wymiary arkuszy z Twojej hurtowni (zapisywane lokalnie w przeglądarce).
                </span>
                {hasBuiltInOverrides && (
                  <button
                    type="button"
                    onClick={resetBuiltInPrices}
                    className="flex items-center gap-1 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 hover:text-white cursor-pointer"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Przywróć domyślne ceny</span>
                  </button>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-zinc-400">
                      <th className="py-2 pr-2 font-medium">Płyta / Dekor</th>
                      <th className="py-2 px-2 font-medium text-right">Arkusz szer. [mm]</th>
                      <th className="py-2 px-2 font-medium text-right">Arkusz wys. [mm]</th>
                      <th className="py-2 px-2 font-medium text-right">Cena [zł/m²]</th>
                      <th className="py-2 px-2 font-medium text-right">Arkusz</th>
                      <th className="py-2 pl-2 font-medium text-right">Akcje</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800/60">
                    {MATERIAL_CATALOG.map((mat) => {
                      const isBuiltIn = DEFAULT_MATERIAL_CATALOG.some((d) => d.id === mat.id);
                      const area = (mat.sheetWidthMm * mat.sheetHeightMm) / 1_000_000;
                      const perSheet = Math.round(area * mat.pricePerM2Pln);
                      return (
                        <tr key={mat.id} className="text-zinc-200">
                          <td className="py-2 pr-2">
                            <div className="flex items-center gap-2.5">
                              <img
                                src={swatches[mat.id]}
                                alt={mat.name}
                                className="h-8 w-8 rounded-lg object-cover border border-white/10 shrink-0"
                              />
                              <div className="min-w-0">
                                <div className="font-medium text-zinc-100 truncate">
                                  {mat.name}
                                  {mat.isCustom && (
                                    <span className="ml-1.5 text-[10px] font-semibold text-emerald-400">
                                      WŁASNA
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-zinc-500">
                                  {mat.category} · {mat.defaultThicknessMm} mm
                                  {mat.grainDirectional ? ' · Usłojenie' : ''}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min={500}
                              max={4500}
                              step={10}
                              value={mat.sheetWidthMm}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (isBuiltIn) {
                                  updateBuiltInField(mat.id as BuiltInMaterialId, 'sheetWidthMm', v);
                                } else {
                                  updateCustomField(mat.id, 'sheetWidthMm', v);
                                }
                              }}
                              className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-right font-mono-num text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min={300}
                              max={3000}
                              step={10}
                              value={mat.sheetHeightMm}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (isBuiltIn) {
                                  updateBuiltInField(mat.id as BuiltInMaterialId, 'sheetHeightMm', v);
                                } else {
                                  updateCustomField(mat.id, 'sheetHeightMm', v);
                                }
                              }}
                              className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-right font-mono-num text-xs text-white focus:border-amber-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-2 text-right">
                            <input
                              type="number"
                              min={1}
                              max={5000}
                              value={mat.pricePerM2Pln}
                              onChange={(e) => {
                                const v = Number(e.target.value);
                                if (isBuiltIn) {
                                  updateBuiltInField(mat.id as BuiltInMaterialId, 'pricePerM2Pln', v);
                                } else {
                                  updateCustomField(mat.id, 'pricePerM2Pln', v);
                                }
                              }}
                              className="w-20 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-right font-mono-num text-xs font-semibold text-amber-300 focus:border-amber-500 focus:outline-none"
                            />
                          </td>
                          <td className="py-2 px-2 text-right font-mono-num text-zinc-400 whitespace-nowrap">
                            ~{perSheet} zł
                          </td>
                          <td className="py-2 pl-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setUploadTargetId(mat.id);
                                  rowFileRef.current?.click();
                                }}
                                title="Wgraj zdjęcie własnej płyty jako teksturę 3D"
                                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-amber-500/60 hover:text-amber-300 cursor-pointer"
                              >
                                <ImagePlus className="h-3.5 w-3.5" />
                              </button>
                              {mat.isCustom && (
                                <button
                                  type="button"
                                  onClick={() => deleteCustomMaterial(mat.id)}
                                  title="Usuń własną płytę z katalogu"
                                  className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-red-500/60 hover:text-red-400 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
