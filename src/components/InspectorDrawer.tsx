import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownToLine,
  Copy,
  FlipHorizontal2,
  FolderKanban,
  ImagePlus,
  Layers,
  Minus,
  PenTool,
  Plus,
  RotateCcw,
  RotateCw,
  Ruler,
  Trash2,
  X,
} from 'lucide-react';
import {
  DrawerSlideType,
  EdgeBandingThickness,
  Fastener,
  FurniturePart,
  HandleSide,
  HandleStyle,
  MATERIAL_CATALOG,
  MaterialId,
  PART_KIND_LABELS,
  PartCutout,
  PartKind,
  SCREW_MAP,
  SurfaceFinish,
} from '../types/furniture';
import { getMaterialSwatchDataUrl } from '../engine/materials';
import { computePolygonAreaM2, getPartWorldBoundsMm } from '../engine/geometry';
import {
  computeSawCutAngles,
  type ClearanceGuide,
  type FastenerAudit,
  type ShelfDeflectionAudit,
} from '../engine/carpentry';

interface InspectorDrawerProps {
  open: boolean;
  part: FurniturePart | null;
  partFasteners: Fastener[];
  groupBounds: { width: number; height: number; depth: number; count: number } | null;
  materialsVersion: number;
  customTextures: Partial<Record<MaterialId, string>>;
  isColliding: boolean;
  clearances: ClearanceGuide[];
  fastenerAuditMap: Map<string, FastenerAudit>;
  shelfDeflection?: ShelfDeflectionAudit;
  onClose: () => void;
  onUpdatePart: (id: string, patch: Partial<FurniturePart>) => void;
  onSmartResizeGroup: (groupId: string, width: number, height: number, depth: number) => void;
  onDuplicatePart: (id: string) => void;
  onDeletePart: (id: string) => void;
  onDeleteFastener: (id: string) => void;
  onClearPartFasteners: (partId: string) => void;
  onSetCustomTexture: (id: MaterialId, dataUrl: string | null) => void;
  onEditPartShape: (part: FurniturePart) => void;
  onMirrorPart: (id: string, asDuplicate: boolean) => void;
  onDistributeShelves: (id: string, count: number, spanHeightMm: number) => void;
}

const THICKNESS_PRESETS = [6, 12, 16, 18, 22, 38];

function NumberStepper({
  label,
  value,
  step = 10,
  min,
  max,
  unit = 'mm',
  onChange,
}: {
  label: string;
  value: number;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  onChange: (next: number) => void;
}) {
  const clamp = (v: number) => {
    let out = v;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return Math.round(out);
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between text-[11px] text-zinc-400">
        <span>{label}</span>
        <span className="font-mono-num text-zinc-500">{unit}</span>
      </div>
      <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 overflow-hidden">
        <button
          type="button"
          onClick={() => onChange(clamp(value - step))}
          className="flex h-9 w-8 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
          aria-label={`Zmniejsz ${label}`}
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <input
          type="number"
          value={value}
          onChange={(e) => {
            const parsed = Number(e.target.value);
            if (!Number.isNaN(parsed)) onChange(clamp(parsed));
          }}
          className="w-full min-w-0 bg-transparent text-center text-xs font-medium text-zinc-100 font-mono-num focus:outline-none py-1.5"
        />
        <button
          type="button"
          onClick={() => onChange(clamp(value + step))}
          className="flex h-9 w-8 items-center justify-center text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
          aria-label={`Zwiększ ${label}`}
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

export const InspectorDrawer: React.FC<InspectorDrawerProps> = ({
  open,
  part,
  partFasteners,
  groupBounds,
  materialsVersion,
  customTextures,
  isColliding,
  clearances,
  fastenerAuditMap,
  shelfDeflection,
  onClose,
  onUpdatePart,
  onSmartResizeGroup,
  onDuplicatePart,
  onDeletePart,
  onDeleteFastener,
  onClearPartFasteners,
  onSetCustomTexture,
  onEditPartShape,
  onMirrorPart,
  onDistributeShelves,
}) => {
  const textureFileRef = useRef<HTMLInputElement | null>(null);
  const [shelfCopies, setShelfCopies] = useState(3);
  const [shelfSpanMm, setShelfSpanMm] = useState(1100);
  const [newCutShape, setNewCutShape] = useState<'rect' | 'circle'>('rect');
  const [newCutW, setNewCutW] = useState(560);
  const [newCutH, setNewCutH] = useState(490);
  const [newCutDia, setNewCutDia] = useState(60);
  const [newCutX, setNewCutX] = useState(0);
  const [newCutY, setNewCutY] = useState(0);
  const [grpW, setGrpW] = useState<number | null>(null);
  const [grpH, setGrpH] = useState<number | null>(null);
  const [grpD, setGrpD] = useState<number | null>(null);
  const [lastGroupId, setLastGroupId] = useState<string | undefined>(undefined);

  if (part?.groupId !== lastGroupId) {
    setLastGroupId(part?.groupId);
    setGrpW(null);
    setGrpH(null);
    setGrpD(null);
  }

  const swatches = useMemo(() => {
    void materialsVersion;
    const map: Partial<Record<MaterialId, string>> = {};
    for (const m of MATERIAL_CATALOG) {
      map[m.id] = getMaterialSwatchDataUrl(m.id, customTextures);
    }
    return map;
  }, [customTextures, materialsVersion]);

  const sawAngles = useMemo(
    () => (part ? computeSawCutAngles(part) : []),
    [part]
  );

  if (!open || !part) return null;

  const eb = part.edgeBanding;
  const ebThickness: EdgeBandingThickness = eb?.thicknessMm ?? 0;

  const setEdgeThickness = (thicknessMm: EdgeBandingThickness) => {
    if (thicknessMm === 0) {
      onUpdatePart(part.id, { edgeBanding: undefined });
      return;
    }
    const prev = part.edgeBanding;
    onUpdatePart(part.id, {
      edgeBanding: {
        thicknessMm,
        top: prev?.top ?? true,
        bottom: prev?.bottom ?? false,
        left: prev?.left ?? false,
        right: prev?.right ?? false,
      },
    });
  };

  const toggleEdgeSide = (side: 'top' | 'bottom' | 'left' | 'right') => {
    const cur = part.edgeBanding ?? { thicknessMm: 0.8 as EdgeBandingThickness };
    const nextThickness = cur.thicknessMm === 0 ? (0.8 as EdgeBandingThickness) : cur.thicknessMm;
    onUpdatePart(part.id, {
      edgeBanding: {
        ...cur,
        thicknessMm: nextThickness,
        [side]: !cur[side],
      },
    });
  };

  const handleTextureUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        onSetCustomTexture(part.materialId, reader.result);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const snapToFloor = () => {
    const bounds = getPartWorldBoundsMm(part);
    const deltaY = -bounds.min[1];
    onUpdatePart(part.id, {
      position: [part.position[0], Math.round(part.position[1] + deltaY), part.position[2]],
    });
  };

  const rotateY90 = () => {
    const nextY = (part.rotation[1] + 90) % 360;
    onUpdatePart(part.id, {
      rotation: [part.rotation[0], nextY, part.rotation[2]],
    });
  };

  return (
    <>
      <div
        className="sm:hidden fixed inset-0 z-30 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:top-14 sm:right-3 sm:bottom-24 z-40 flex max-h-[78dvh] sm:max-h-none sm:w-[336px] flex-col rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl">
      {/* Mobile grab handle */}
      <div className="sm:hidden flex justify-center pt-2.5 pb-1">
        <div className="h-1 w-10 rounded-full bg-zinc-700" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-white truncate">
            Właściwości elementu
          </h2>
          <p className="text-[11px] text-zinc-400 font-mono-num">
            {part.width} × {part.height} × {part.depth} mm
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
          aria-label="Zamknij panel właściwości"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable Body */}
      <div className="cad-scroll flex-1 overflow-y-auto px-4 py-3.5 space-y-5">
        {/* Collision Alert, Shelf Deflection Sag Check & Clearances Summary */}
        {(isColliding || Boolean(shelfDeflection) || clearances.length > 0 || sawAngles.length > 0) && (
          <div className="space-y-2">
            {isColliding && (
              <div className="flex items-start gap-2 rounded-xl border border-red-500/50 bg-red-950/50 px-3 py-2 text-[11px] text-red-200">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                <span>
                  <strong className="font-semibold">Kolizja płyt!</strong> Ten element nachodzi na sąsiednią płytę — przesuń go z włączonym Magnesem.
                </span>
              </div>
            )}

            {shelfDeflection && (
              <div
                className={`rounded-xl border px-3 py-2 space-y-1 text-[11px] ${
                  shelfDeflection.status === 'critical'
                    ? 'border-red-500/50 bg-red-950/45 text-red-100'
                    : shelfDeflection.status === 'warning'
                      ? 'border-amber-500/45 bg-amber-950/35 text-amber-100'
                      : 'border-emerald-500/35 bg-emerald-950/25 text-emerald-100'
                }`}
              >
                <div className="flex items-center justify-between gap-2 font-semibold">
                  <span>
                    Test ugięcia półki ({shelfDeflection.status === 'critical' ? 'RYZYKO!' : shelfDeflection.status === 'warning' ? 'Uwaga' : 'Sztywna'})
                  </span>
                  <span className="font-mono-num">
                    ~{shelfDeflection.deflectionMm} mm
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] opacity-85 font-mono-num">
                  <span>Rozpiętość: {shelfDeflection.maxUnsupportedSpanMm} mm</span>
                  <span>Udźwig bezp.: ~{shelfDeflection.safeMaxLoadKg} kg</span>
                </div>
                <div className="text-[10px] leading-snug opacity-90">
                  {shelfDeflection.recommendation}
                </div>
              </div>
            )}

            {clearances.length > 0 && (
              <div className="rounded-xl border border-sky-500/30 bg-sky-950/30 px-3 py-2 space-y-1">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-300">
                  <Ruler className="h-3.5 w-3.5" />
                  <span>Prześwity w świetle</span>
                </div>
                <div className="grid grid-cols-2 gap-1 text-[11px] font-mono-num text-sky-100/90">
                  {clearances.map((c) => {
                    const arrow =
                      c.direction === 'up'
                        ? '↑'
                        : c.direction === 'down'
                          ? '↓'
                          : c.direction === 'left'
                            ? '←'
                            : '→';
                    return (
                      <div key={c.direction} className="truncate" title={`Do: ${c.targetName}`}>
                        {arrow} {c.distanceMm} mm{' '}
                        <span className="text-sky-300/60 font-sans text-[10px]">
                          ({c.targetName})
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {sawAngles.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-950/25 px-3 py-2 space-y-1">
                <div className="text-[11px] font-semibold text-amber-300">
                  Kąty cięcia na piłę
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-mono-num text-amber-100/90">
                  {sawAngles.map((a, idx) => (
                    <span key={`${a.label}_${idx}`}>
                      {a.label}: {a.interiorDeg}° (ukos {a.sawMiterDeg}°)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Name & Geometry Kind */}
        <div className="space-y-2.5">
          <label className="block">
            <span className="text-xs font-medium text-zinc-300">Nazwa elementu</span>
            <input
              type="text"
              value={part.name}
              onChange={(e) => onUpdatePart(part.id, { name: e.target.value })}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-medium text-zinc-300">Typ geometrii</span>
            <select
              value={part.kind}
              onChange={(e) => {
                const nextKind = e.target.value as PartKind;
                const patch: Partial<FurniturePart> = { kind: nextKind };
                if (nextKind === 'sloped' && !part.slopeTopRight && !part.slopeTopLeft) {
                  patch.slopeTopRight = Math.min(250, Math.round(part.height * 0.3));
                }
                if (nextKind === 'door' && !part.handleSide) {
                  patch.handleSide = 'right';
                }
                onUpdatePart(part.id, patch);
              }}
              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none cursor-pointer"
            >
              {(Object.keys(PART_KIND_LABELS) as PartKind[]).map((k) => (
                <option key={k} value={k}>
                  {PART_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>

          {/* Open 2D Sketch Editor for custom shapes OR convert any panel/sloped board */}
          {(part.kind === 'custom' || part.kind === 'panel' || part.kind === 'sloped') && (
            <button
              type="button"
              onClick={() => onEditPartShape(part)}
              className="flex w-full min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-amber-500/45 bg-amber-500/12 px-3 text-xs font-medium text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
            >
              <PenTool className="h-3.5 w-3.5 shrink-0" />
              <span>
                {part.kind === 'custom'
                  ? `Edytuj kształt 2D (${part.customPolygon?.length ?? 0} pkt)`
                  : 'Przerób kształt w szkicowniku 2D'}
              </span>
            </button>
          )}
        </div>

        {/* Dimensions (mm) */}
        <div className="space-y-2.5 border-t border-zinc-800/80 pt-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200">Wymiary (mm)</h3>
            <span className="text-[11px] text-zinc-500 font-mono-num">
              {(part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3
                ? computePolygonAreaM2(part.customPolygon, part.width, part.height)
                : (part.width * part.height) / 1_000_000
              ).toFixed(2)}{' '}
              m²
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <NumberStepper
              label="Szer. (X)"
              value={part.width}
              step={10}
              min={12}
              max={4000}
              onChange={(width) => onUpdatePart(part.id, { width })}
            />
            <NumberStepper
              label="Wys. (Y)"
              value={part.height}
              step={10}
              min={6}
              max={3200}
              onChange={(height) => onUpdatePart(part.id, { height })}
            />
            <NumberStepper
              label="Głęb. (Z)"
              value={part.depth}
              step={2}
              min={4}
              max={2000}
              onChange={(depth) => onUpdatePart(part.id, { depth })}
            />
          </div>

          {/* Quick thickness buttons applied to smallest dimension */}
          <div className="flex items-center gap-1 flex-wrap pt-0.5">
            <span className="text-[11px] text-zinc-500 mr-1">Grubość płyty:</span>
            {THICKNESS_PRESETS.map((th) => (
              <button
                key={th}
                type="button"
                onClick={() => {
                  // Apply preset thickness to whichever axis is currently the thinnest
                  if (part.width <= part.height && part.width <= part.depth) {
                    onUpdatePart(part.id, { width: th });
                  } else if (part.height <= part.width && part.height <= part.depth) {
                    onUpdatePart(part.id, { height: th });
                  } else {
                    onUpdatePart(part.id, { depth: th });
                  }
                }}
                className="rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-[11px] font-mono-num text-zinc-300 hover:border-amber-500/60 hover:text-amber-300 transition-colors cursor-pointer"
              >
                {th}
              </button>
            ))}
          </div>
        </div>

        {/* Sloped Cut Parameters (Skosy / Ścięcia) */}
        {part.kind === 'sloped' && (
          <div className="space-y-2.5 border-t border-zinc-800/80 pt-3.5">
            <h3 className="text-xs font-semibold text-amber-300">
              Skosy i ścięcia narożników (mm)
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <NumberStepper
                label="Góra-Lewo"
                value={part.slopeTopLeft ?? 0}
                step={20}
                min={0}
                max={Math.max(0, part.height - 30)}
                onChange={(slopeTopLeft) => onUpdatePart(part.id, { slopeTopLeft })}
              />
              <NumberStepper
                label="Góra-Prawo"
                value={part.slopeTopRight ?? 0}
                step={20}
                min={0}
                max={Math.max(0, part.height - 30)}
                onChange={(slopeTopRight) => onUpdatePart(part.id, { slopeTopRight })}
              />
              <NumberStepper
                label="Dół-Lewo"
                value={part.slopeBottomLeft ?? 0}
                step={20}
                min={0}
                max={Math.max(0, part.height - 30)}
                onChange={(slopeBottomLeft) => onUpdatePart(part.id, { slopeBottomLeft })}
              />
              <NumberStepper
                label="Dół-Prawo"
                value={part.slopeBottomRight ?? 0}
                step={20}
                min={0}
                max={Math.max(0, part.height - 30)}
                onChange={(slopeBottomRight) => onUpdatePart(part.id, { slopeBottomRight })}
              />
            </div>
          </div>
        )}

        {/* Door Handle, Hinges & Drawer Slides */}
        {part.kind === 'door' && (
          <div className="space-y-2.5 border-t border-zinc-800/80 pt-3.5">
            <h3 className="text-xs font-semibold text-zinc-200">Front: uchwyt, zawiasy i prowadnice</h3>
            <div className="grid grid-cols-4 gap-1 rounded-lg bg-zinc-900 p-1 border border-zinc-800">
              {(
                [
                  { id: 'left', label: 'Lewy' },
                  { id: 'right', label: 'Prawy' },
                  { id: 'top', label: 'Góra' },
                  { id: 'none', label: 'Brak' },
                ] as { id: HandleSide; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onUpdatePart(part.id, { handleSide: opt.id })}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    (part.handleSide ?? 'right') === opt.id
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="text-[11px] text-zinc-400">Zawiasy puszkowe Ø35</span>
                <select
                  value={part.hingeSide ?? 'none'}
                  onChange={(e) => {
                    const hs = e.target.value as HandleSide;
                    onUpdatePart(part.id, {
                      hingeSide: hs,
                      hingeCount: hs === 'none' ? undefined : part.hingeCount ?? 2,
                    });
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="none">Brak (szuflada/stały)</option>
                  <option value="left">Lewa krawędź</option>
                  <option value="right">Prawa krawędź</option>
                  <option value="top">Góra (klapa)</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-400">Prowadnice szuflady</span>
                <select
                  value={part.drawerSlideType ?? 'none'}
                  onChange={(e) =>
                    onUpdatePart(part.id, {
                      drawerSlideType: e.target.value as DrawerSlideType,
                    })
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="none">Brak</option>
                  <option value="ball_26mm">Kulkowe (−26 mm)</option>
                  <option value="undermount_blum">Dolny montaż Blum/GTV</option>
                </select>
              </label>
            </div>

            <div className="space-y-1">
              <span className="text-[11px] text-zinc-400">System otwierania frontu</span>
              <div className="grid grid-cols-4 gap-1 rounded-lg bg-zinc-900 p-1 border border-zinc-800">
                {(
                  [
                    { id: 'bar', label: 'Reling' },
                    { id: 'tip_on', label: 'Tip-On' },
                    { id: 'gola_j', label: 'Gola J' },
                    { id: 'chamfer_45', label: 'Ukos 45°' },
                  ] as { id: HandleStyle; label: string }[]
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => onUpdatePart(part.id, { handleStyle: opt.id })}
                    className={`rounded-md py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                      (part.handleStyle ?? 'bar') === opt.id
                        ? 'bg-amber-500 text-zinc-950 font-semibold'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Material Texture Swatches */}
        <div className="space-y-2.5 border-t border-zinc-800/80 pt-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200">Materiał i tekstura</h3>
            <button
              type="button"
              onClick={() => onUpdatePart(part.id, { grainRotated: !part.grainRotated })}
              className="text-[11px] font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
            >
              Obróć usłojenie 90°
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            {MATERIAL_CATALOG.map((mat) => {
              const active = part.materialId === mat.id;
              return (
                <button
                  key={mat.id}
                  type="button"
                  onClick={() => onUpdatePart(part.id, { materialId: mat.id })}
                  className={`flex items-center gap-2 rounded-lg border p-1.5 text-left transition-colors cursor-pointer ${
                    active
                      ? 'border-amber-500 bg-amber-500/10 text-white'
                      : 'border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <img
                    src={swatches[mat.id]}
                    alt={mat.name}
                    referrerPolicy="no-referrer"
                    className="h-7 w-7 rounded-md object-cover border border-white/10 shrink-0"
                  />
                  <span className="text-[11px] font-medium leading-tight truncate">
                    {mat.shortName}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Surface Finish (Mat / Satyna / Wysoki Połysk Lakier) */}
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] text-zinc-400">Wykończenie lakiernicze (PBR)</span>
            <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-900 p-1 border border-zinc-800">
              {(
                [
                  { id: 'matte', label: 'Mat' },
                  { id: 'satin', label: 'Satyna' },
                  { id: 'gloss', label: 'Połysk' },
                ] as { id: SurfaceFinish; label: string }[]
              ).map((fin) => (
                <button
                  key={fin.id}
                  type="button"
                  onClick={() => onUpdatePart(part.id, { surfaceFinish: fin.id })}
                  className={`rounded-md py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                    (part.surfaceFinish ?? 'matte') === fin.id
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  {fin.label}
                </button>
              ))}
            </div>
          </div>

          {/* Upload custom texture photo from phone or PC */}
          <div className="flex items-center gap-1.5 pt-1">
            <button
              type="button"
              onClick={() => textureFileRef.current?.click()}
              className="flex flex-1 min-h-[38px] items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-[11px] font-medium text-zinc-200 hover:border-amber-500/60 hover:text-amber-300 transition-colors cursor-pointer"
            >
              <ImagePlus className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="truncate">Wgraj własne zdjęcie tekstury</span>
            </button>
            {customTextures[part.materialId] && (
              <button
                type="button"
                onClick={() => onSetCustomTexture(part.materialId, null)}
                className="flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer shrink-0"
                title="Przywróć domyślną teksturę"
                aria-label="Przywróć domyślną teksturę"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            <input
              ref={textureFileRef}
              type="file"
              accept="image/*"
              onChange={handleTextureUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Board Machining: Rounded Corners, Dado Groove, 45° Miter & Internal Cutouts */}
        <div className="space-y-3 border-t border-zinc-800/80 pt-3.5">
          <h3 className="text-xs font-semibold text-zinc-200">
            Obróbki płyty (wycięcia, nut, zaokrąglenia)
          </h3>

          {/* Corner Fillet Radius & Dado Groove */}
          <div className="grid grid-cols-2 gap-2">
            <NumberStepper
              label="Zaokrąglenie R"
              value={part.cornerRadiusMm ?? 0}
              step={5}
              min={0}
              max={200}
              onChange={(r) =>
                onUpdatePart(part.id, { cornerRadiusMm: r > 0 ? r : undefined })
              }
            />
            <div className="flex flex-col justify-between">
              <span className="text-[11px] text-zinc-400">Nut pod plecy HDF</span>
              <button
                type="button"
                onClick={() =>
                  onUpdatePart(part.id, {
                    dadoGroove: part.dadoGroove?.enabled
                      ? undefined
                      : { enabled: true, edge: 'back', insetMm: 16, widthMm: 4, depthMm: 8 },
                  })
                }
                className={`h-9 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                  part.dadoGroove?.enabled
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                }`}
              >
                {part.dadoGroove?.enabled ? 'Nut 4×8 mm (Wł.)' : 'Brak nutu'}
              </button>
            </div>
          </div>

          {/* System 32 Shelf-Pin Drilling Rows on Vertical Side Walls */}
          {part.kind === 'panel' && part.height >= 400 && part.width <= 45 && (
            <label className="flex items-center justify-between gap-2 rounded-lg border border-zinc-800 bg-zinc-900/70 px-3 py-2 cursor-pointer">
              <div>
                <div className="text-[11px] font-medium text-zinc-200">
                  System 32 (rzędy otworów Ø5 co 32 mm)
                </div>
                <div className="text-[10px] text-zinc-500">
                  Automatyczna mapa nawiertów pod podpórki półek (37 mm od krawędzi)
                </div>
              </div>
              <input
                type="checkbox"
                checked={Boolean(part.system32ShelfHoles)}
                onChange={(e) =>
                  onUpdatePart(part.id, { system32ShelfHoles: e.target.checked })
                }
                className="h-4 w-4 accent-amber-500 shrink-0"
              />
            </label>
          )}

          {/* 45-degree Miter Edges (Gerung) */}
          <div className="space-y-1.5">
            <span className="text-[11px] text-zinc-400">Zacinanie krawędzi 45° (gerung)</span>
            <div className="grid grid-cols-4 gap-1">
              {(
                [
                  { k: 'left' as const, label: 'Lewa' },
                  { k: 'right' as const, label: 'Prawa' },
                  { k: 'top' as const, label: 'Góra' },
                  { k: 'bottom' as const, label: 'Dół' },
                ] as const
              ).map(({ k, label }) => {
                const on = Boolean(part.miter45?.[k]);
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() =>
                      onUpdatePart(part.id, {
                        miter45: { ...part.miter45, [k]: !on },
                      })
                    }
                    className={`rounded-md border py-1 text-[10px] font-medium cursor-pointer ${
                      on
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {label} 45°
                  </button>
                );
              })}
            </div>
          </div>

          {/* Internal Cutouts (Sink, Hob, Cable Grommet, Pipes) */}
          <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/50 p-2.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-zinc-200">
                Wycięcia wewnętrzne ({part.cutouts?.length ?? 0})
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setNewCutShape('rect')}
                  className={`rounded px-1.5 py-0.5 text-[10px] cursor-pointer ${
                    newCutShape === 'rect'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Prostokąt
                </button>
                <button
                  type="button"
                  onClick={() => setNewCutShape('circle')}
                  className={`rounded px-1.5 py-0.5 text-[10px] cursor-pointer ${
                    newCutShape === 'circle'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  Otwór Ø
                </button>
              </div>
            </div>

            {newCutShape === 'rect' ? (
              <div className="grid grid-cols-4 gap-1.5">
                <label>
                  <span className="text-[10px] text-zinc-500">Szer.</span>
                  <input
                    type="number"
                    value={newCutW}
                    onChange={(e) => setNewCutW(Number(e.target.value) || 100)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] text-zinc-500">Gł./Wys.</span>
                  <input
                    type="number"
                    value={newCutH}
                    onChange={(e) => setNewCutH(Number(e.target.value) || 100)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] text-zinc-500">Przes. X</span>
                  <input
                    type="number"
                    value={newCutX}
                    onChange={(e) => setNewCutX(Number(e.target.value) || 0)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] text-zinc-500">Przes. Y</span>
                  <input
                    type="number"
                    value={newCutY}
                    onChange={(e) => setNewCutY(Number(e.target.value) || 0)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                  />
                </label>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1.5">
                <label>
                  <span className="text-[10px] text-zinc-500">Średnica Ø</span>
                  <input
                    type="number"
                    value={newCutDia}
                    onChange={(e) => setNewCutDia(Number(e.target.value) || 60)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] text-zinc-500">Przes. X</span>
                  <input
                    type="number"
                    value={newCutX}
                    onChange={(e) => setNewCutX(Number(e.target.value) || 0)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                  />
                </label>
                <label>
                  <span className="text-[10px] text-zinc-500">Przes. Y</span>
                  <input
                    type="number"
                    value={newCutY}
                    onChange={(e) => setNewCutY(Number(e.target.value) || 0)}
                    className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                  />
                </label>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                const nextCut: PartCutout = {
                  id: `cut_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                  shape: newCutShape,
                  xMm: newCutX,
                  yMm: newCutY,
                  widthMm: newCutShape === 'circle' ? newCutDia : Math.max(20, newCutW),
                  heightMm: newCutShape === 'circle' ? newCutDia : Math.max(20, newCutH),
                  diameterMm: newCutShape === 'circle' ? Math.max(12, newCutDia) : undefined,
                  label: newCutShape === 'circle' ? `Otwór Ø${newCutDia}` : `Wycięcie ${newCutW}×${newCutH}`,
                };
                onUpdatePart(part.id, {
                  cutouts: [...(part.cutouts ?? []), nextCut],
                });
              }}
              className="w-full rounded-lg border border-amber-500/40 bg-amber-500/15 py-1.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/25 cursor-pointer"
            >
              + Wytnij otwór w płycie 3D
            </button>

            {part.cutouts && part.cutouts.length > 0 && (
              <div className="space-y-1 pt-1">
                {part.cutouts.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-md bg-zinc-950 px-2 py-1 text-[11px]"
                  >
                    <span className="font-mono-num text-zinc-300 truncate">
                      {c.shape === 'circle'
                        ? `Ø${c.diameterMm ?? c.widthMm} mm`
                        : `${c.widthMm}×${c.heightMm} mm`}{' '}
                      ({c.xMm}, {c.yMm})
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdatePart(part.id, {
                          cutouts: part.cutouts?.filter((x) => x.id !== c.id),
                        })
                      }
                      className="text-zinc-500 hover:text-red-400 p-0.5 cursor-pointer"
                      aria-label="Usuń wycięcie"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Edge Banding (Okleina ABS/PCV) */}
        <div className="space-y-2.5 border-t border-zinc-800/80 pt-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200">Okleina krawędzi (ABS/PCV)</h3>
            {ebThickness === 2 && (
              <span className="text-[10px] text-amber-400">Piła: −2 mm/kraw.</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-lg bg-zinc-900 p-1 border border-zinc-800">
            {(
              [
                { v: 0 as EdgeBandingThickness, label: 'Brak' },
                { v: 0.8 as EdgeBandingThickness, label: '0.8 mm' },
                { v: 2 as EdgeBandingThickness, label: '2 mm ABS' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.v}
                type="button"
                onClick={() => setEdgeThickness(opt.v)}
                className={`rounded-md py-1.5 text-[11px] font-medium transition-colors cursor-pointer ${
                  ebThickness === opt.v
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {ebThickness > 0 && (
            <div className="grid grid-cols-4 gap-1.5">
              {(
                [
                  { side: 'top' as const, label: 'L1 Przód' },
                  { side: 'bottom' as const, label: 'L2 Tył' },
                  { side: 'left' as const, label: 'S1 Lewa' },
                  { side: 'right' as const, label: 'S2 Prawa' },
                ] as const
              ).map(({ side, label }) => {
                const active = Boolean(eb?.[side]);
                return (
                  <button
                    key={side}
                    type="button"
                    onClick={() => toggleEdgeSide(side)}
                    className={`rounded-lg border py-1.5 text-[10px] font-medium transition-colors cursor-pointer ${
                      active
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Position & Rotation */}
        <div className="space-y-2.5 border-t border-zinc-800/80 pt-3.5">
          <h3 className="text-xs font-semibold text-zinc-200">Pozycja i obrót</h3>
          <div className="grid grid-cols-3 gap-2">
            <NumberStepper
              label="Poz. X"
              value={part.position[0]}
              step={10}
              onChange={(x) =>
                onUpdatePart(part.id, { position: [x, part.position[1], part.position[2]] })
              }
            />
            <NumberStepper
              label="Poz. Y"
              value={part.position[1]}
              step={10}
              min={5}
              onChange={(y) =>
                onUpdatePart(part.id, { position: [part.position[0], y, part.position[2]] })
              }
            />
            <NumberStepper
              label="Poz. Z"
              value={part.position[2]}
              step={10}
              onChange={(z) =>
                onUpdatePart(part.id, { position: [part.position[0], part.position[1], z] })
              }
            />
          </div>

          <div className="grid grid-cols-3 gap-2">
            <NumberStepper
              label="Obrót X"
              value={part.rotation[0]}
              step={5}
              unit="°"
              onChange={(rx) =>
                onUpdatePart(part.id, { rotation: [rx, part.rotation[1], part.rotation[2]] })
              }
            />
            <NumberStepper
              label="Obrót Y"
              value={part.rotation[1]}
              step={15}
              unit="°"
              onChange={(ry) =>
                onUpdatePart(part.id, { rotation: [part.rotation[0], ry, part.rotation[2]] })
              }
            />
            <NumberStepper
              label="Obrót Z"
              value={part.rotation[2]}
              step={5}
              unit="°"
              onChange={(rz) =>
                onUpdatePart(part.id, { rotation: [part.rotation[0], part.rotation[1], rz] })
              }
            />
          </div>

          {/* Quick alignment helpers */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            <button
              type="button"
              onClick={snapToFloor}
              className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            >
              <ArrowDownToLine className="h-3.5 w-3.5 text-amber-400" />
              <span>Do podłogi</span>
            </button>
            <button
              type="button"
              onClick={rotateY90}
              className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 cursor-pointer"
            >
              <RotateCw className="h-3.5 w-3.5 text-amber-400" />
              <span>Obróć 90°</span>
            </button>
          </div>
        </div>

        {/* Carpentry Productivity Tools: Mirror, Even Shelves, Grouping */}
        <div className="space-y-3 border-t border-zinc-800/80 pt-3.5">
          <h3 className="text-xs font-semibold text-zinc-200">Narzędzia stolarskie</h3>

          {/* Mirror X */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => onMirrorPart(part.id, false)}
              className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:border-amber-500/50 hover:text-amber-300 cursor-pointer"
            >
              <FlipHorizontal2 className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Odbij lustrzanie</span>
            </button>
            <button
              type="button"
              onClick={() => onMirrorPart(part.id, true)}
              className="flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:border-amber-500/50 hover:text-amber-300 cursor-pointer"
            >
              <Copy className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span>Duplikuj lustro</span>
            </button>
          </div>

          {/* Even Shelf Distribution */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 space-y-2">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
              <Layers className="h-3.5 w-3.5 text-amber-400" />
              <span>Rozłóż półki równo w pionie</span>
            </div>
            <div className="flex items-center gap-1.5">
              <label className="flex-1">
                <span className="text-[10px] text-zinc-500">Nowych półek</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={shelfCopies}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) setShelfCopies(Math.max(1, Math.min(8, Math.round(v))));
                  }}
                  className="mt-0.5 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
              <label className="flex-1">
                <span className="text-[10px] text-zinc-500">Zakres (mm)</span>
                <input
                  type="number"
                  min={150}
                  max={2800}
                  step={50}
                  value={shelfSpanMm}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) setShelfSpanMm(Math.max(150, Math.min(2800, Math.round(v))));
                  }}
                  className="mt-0.5 w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={() => onDistributeShelves(part.id, shelfCopies, shelfSpanMm)}
                className="mt-3.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer shrink-0"
              >
                Rozłóż
              </button>
            </div>
          </div>

          {/* Group Assignment */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-300">
                <FolderKanban className="h-3.5 w-3.5 text-amber-400" />
                Grupa elementów (ruch razem)
              </span>
              {part.groupId && (
                <button
                  type="button"
                  onClick={() => onUpdatePart(part.id, { groupId: undefined })}
                  className="text-[10px] text-zinc-400 hover:text-red-300 cursor-pointer"
                >
                  Odepnij
                </button>
              )}
            </div>
            <input
              type="text"
              placeholder="np. Korpus lewy, Szuflada 1"
              value={part.groupId ?? ''}
              onChange={(e) =>
                onUpdatePart(part.id, {
                  groupId: e.target.value.trim() ? e.target.value : undefined,
                })
              }
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-white placeholder:text-zinc-600 focus:border-amber-500 focus:outline-none"
            />

            {/* Commercial Smart Resize for the Entire Grouped Cabinet */}
            {part.groupId && groupBounds && groupBounds.count >= 2 && (
              <div className="mt-2 rounded-xl border border-amber-500/35 bg-amber-950/20 p-2.5 space-y-2">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-amber-300">
                    Smart Resize grupy ({groupBounds.count} elem.)
                  </span>
                  <span className="text-[10px] text-zinc-400">Grubości płyt bez zmian</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <label>
                    <span className="text-[10px] text-zinc-400">Szer. S</span>
                    <input
                      type="number"
                      min={150}
                      max={4000}
                      step={20}
                      value={grpW ?? groupBounds.width}
                      onChange={(e) => setGrpW(Number(e.target.value) || groupBounds.width)}
                      className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-center text-xs font-mono-num text-white"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-zinc-400">Wys. W</span>
                    <input
                      type="number"
                      min={150}
                      max={3000}
                      step={20}
                      value={grpH ?? groupBounds.height}
                      onChange={(e) => setGrpH(Number(e.target.value) || groupBounds.height)}
                      className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-center text-xs font-mono-num text-white"
                    />
                  </label>
                  <label>
                    <span className="text-[10px] text-zinc-400">Głęb. G</span>
                    <input
                      type="number"
                      min={150}
                      max={1500}
                      step={10}
                      value={grpD ?? groupBounds.depth}
                      onChange={(e) => setGrpD(Number(e.target.value) || groupBounds.depth)}
                      className="mt-0.5 w-full rounded border border-zinc-700 bg-zinc-950 px-1.5 py-1 text-center text-xs font-mono-num text-white"
                    />
                  </label>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onSmartResizeGroup(
                      part.groupId!,
                      grpW ?? groupBounds.width,
                      grpH ?? groupBounds.height,
                      grpD ?? groupBounds.depth
                    );
                    setGrpW(null);
                    setGrpH(null);
                    setGrpD(null);
                  }}
                  className="w-full rounded-lg bg-amber-500 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer"
                >
                  Przeskaluj cały korpus i wkręty
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Attached Fasteners with Physical Audit */}
        <div className="space-y-2 border-t border-zinc-800/80 pt-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold text-zinc-200">
              Wkręty w elemencie ({partFasteners.length})
            </h3>
            {partFasteners.length > 0 && (
              <button
                type="button"
                onClick={() => onClearPartFasteners(part.id)}
                className="text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
              >
                Usuń wszystkie
              </button>
            )}
          </div>
          {partFasteners.length === 0 ? (
            <p className="text-[11px] text-zinc-500">
              Wybierz narzędzie „Wkręty” na dolnym pasku i kliknij płytę w 3D, aby dodać wkręty.
            </p>
          ) : (
            <div className="space-y-1 max-h-36 overflow-y-auto cad-scroll">
              {partFasteners.map((f, idx) => {
                const audit = fastenerAuditMap.get(f.id);
                const statusBadge =
                  audit?.status === 'ok' ? (
                    <span
                      title={audit.reason}
                      className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300 shrink-0"
                    >
                      OK
                    </span>
                  ) : audit?.status === 'through' ? (
                    <span
                      title={audit.reason}
                      className="rounded bg-red-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-red-300 shrink-0"
                    >
                      Przelot!
                    </span>
                  ) : audit?.status === 'air' ? (
                    <span
                      title={audit.reason}
                      className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 shrink-0"
                    >
                      W powietrzu
                    </span>
                  ) : null;
                return (
                  <div
                    key={f.id}
                    className="flex items-center justify-between gap-1.5 rounded-lg bg-zinc-900/90 px-2.5 py-1.5 text-[11px]"
                  >
                    <span className="text-zinc-300 truncate">
                      #{idx + 1} · {SCREW_MAP[f.type].shortName}
                    </span>
                    <div className="flex items-center gap-1 shrink-0">
                      {statusBadge}
                      <button
                        type="button"
                        onClick={() => onDeleteFastener(f.id)}
                        className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer"
                        aria-label="Usuń wkręt"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex items-center gap-2 border-t border-zinc-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={() => onDuplicatePart(part.id)}
          className="flex flex-1 min-h-[44px] sm:min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 text-xs font-medium text-zinc-100 hover:bg-zinc-800 transition-colors cursor-pointer"
        >
          <Copy className="h-3.5 w-3.5" />
          <span>Duplikuj</span>
        </button>
        <button
          type="button"
          onClick={() => onDeletePart(part.id)}
          className="flex min-h-[44px] sm:min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-red-600/20 px-4 text-xs font-medium text-red-300 hover:bg-red-600/35 transition-colors cursor-pointer"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>Usuń</span>
        </button>
      </div>
    </aside>
    </>
  );
};
