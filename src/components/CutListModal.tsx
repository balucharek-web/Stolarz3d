import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  Crosshair,
  Download,
  FileCode2,
  FileJson,
  LayoutGrid,
  ListChecks,
  Printer,
  Tag,
  Upload,
  X,
} from 'lucide-react';
import {
  FurniturePart,
  FurnitureProject,
  getMaterialMeta,
  MaterialId,
  PART_KIND_LABELS,
  QuoteSettings,
  SCREW_CATALOG,
  ScrewType,
} from '../types/furniture';
import { getProjectDimensionsMm } from '../engine/geometry';
import {
  computeSawCutAngles,
  type FastenerAudit,
} from '../engine/carpentry';
import {
  getCarpentryCutSpec,
  nestMaterialSheets,
  type CarpentryCutSpec,
} from '../engine/nesting';
import {
  buildOrthographicSvg,
  computeCommercialQuote,
  extractBoardDrillingMap,
  generateProjectDxf,
  printBoardLabels,
  printTechnicalDocumentation,
} from '../engine/documentation';
import { sanitizeImportedProject } from '../engine/storage';

interface CutListModalProps {
  open: boolean;
  project: FurnitureProject;
  materialsVersion: number;
  fastenerAuditMap: Map<string, FastenerAudit>;
  collisionCount: number;
  quoteSettings: QuoteSettings;
  onChangeQuoteSettings: (next: QuoteSettings) => void;
  onCaptureSnapshot: () => string | null;
  onClose: () => void;
  onImportProject: (proj: FurnitureProject) => void;
  onImportError: (msg: string) => void;
}

const KERF_OPTIONS = [3, 4, 5];

const SHEET_PIECE_COLORS = [
  '#D97706',
  '#0284C7',
  '#059669',
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#0D9488',
  '#4F46E5',
];

function formatAnglesNote(part: FurniturePart): string {
  const angles = computeSawCutAngles(part);
  if (angles.length > 0) {
    return angles.map((a) => `${a.interiorDeg}°`).join(', ');
  }
  if (part.kind === 'custom') {
    return `2D (${part.customPolygon?.length ?? 0} pkt)`;
  }
  return '90°';
}

function formatMachiningNote(part: FurniturePart): string {
  const notes: string[] = [];
  if (part.cornerRadiusMm) notes.push(`R${part.cornerRadiusMm}`);
  if (part.cutouts?.length) notes.push(`${part.cutouts.length} wyc.`);
  if (part.dadoGroove?.enabled) notes.push(`Nut ${part.dadoGroove.widthMm}×${part.dadoGroove.depthMm}`);
  if (part.miter45 && (part.miter45.left || part.miter45.right || part.miter45.top || part.miter45.bottom)) {
    notes.push('Ukos 45°');
  }
  if (part.hingeSide && part.hingeSide !== 'none') {
    notes.push(`Ø35 (${part.hingeCount ?? 2}×)`);
  }
  if (part.surfaceFinish === 'gloss') notes.push('Połysk');
  else if (part.surfaceFinish === 'satin') notes.push('Satyna');
  return notes.length > 0 ? notes.join(', ') : '—';
}

type ModalTab = 'list' | 'nesting' | 'drilling' | 'quote';

export const CutListModal: React.FC<CutListModalProps> = ({
  open,
  project,
  materialsVersion,
  fastenerAuditMap,
  collisionCount,
  quoteSettings,
  onChangeQuoteSettings,
  onCaptureSnapshot,
  onClose,
  onImportProject,
  onImportError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<ModalTab>('list');
  const [kerfMm, setKerfMm] = useState<number>(4);
  const [selectedNestMat, setSelectedNestMat] = useState<MaterialId | null>(null);
  const [selectedDrillPartId, setSelectedDrillPartId] = useState<string | null>(null);

  const cutSpecs = useMemo(() => {
    void materialsVersion;
    const map = new Map<string, CarpentryCutSpec>();
    for (const part of project.parts) {
      map.set(part.id, getCarpentryCutSpec(part));
    }
    return map;
  }, [project.parts, materialsVersion]);

  const nestingResults = useMemo(() => {
    void materialsVersion;
    return nestMaterialSheets(project.parts, kerfMm, 10);
  }, [project.parts, kerfMm, materialsVersion]);

  const quote = useMemo(() => {
    void materialsVersion;
    return computeCommercialQuote(project, nestingResults, cutSpecs, quoteSettings);
  }, [project, nestingResults, cutSpecs, quoteSettings, materialsVersion]);

  const orthoSvgs = useMemo(() => {
    if (!open || activeTab !== 'drilling') return null;
    return {
      front: buildOrthographicSvg(project.parts, 'front'),
      side: buildOrthographicSvg(project.parts, 'side'),
      top: buildOrthographicSvg(project.parts, 'top'),
    };
  }, [open, activeTab, project.parts]);

  const drillingMaps = useMemo(() => {
    if (!open || activeTab !== 'drilling') return [];
    return project.parts.map((part, idx) => ({
      index: idx + 1,
      map: extractBoardDrillingMap(part, project.parts, project.fasteners),
    }));
  }, [open, activeTab, project.parts, project.fasteners]);

  const summary = useMemo(() => {
    let totalAreaM2 = 0;
    let totalEdgeBandingM = 0;
    let totalSheets = 0;
    let totalSheetCostPln = 0;

    for (const spec of cutSpecs.values()) {
      totalAreaM2 += spec.areaM2;
      totalEdgeBandingM += spec.edgeBandingLinearM;
    }

    const nestingByMat = new Map<MaterialId, (typeof nestingResults)[number]>();
    for (const nr of nestingResults) {
      nestingByMat.set(nr.materialId, nr);
      totalSheets += nr.totalSheets;
      totalSheetCostPln += nr.estimatedCostPln;
    }

    for (const part of project.parts) {
      if (part.kind === 'profile') {
        const spec = cutSpecs.get(part.id);
        if (spec) {
          totalSheetCostPln += Math.round(spec.areaM2 * getMaterialMeta(part.materialId).pricePerM2Pln);
        }
      }
    }

    const fastenerTotals: Record<ScrewType, number> = {
      wood_4x45: 0,
      confirmat_7x50: 0,
      minifix_15: 0,
      bolt_m8: 0,
      dowel_8x35: 0,
    };
    let screwsOk = 0;
    let screwsThrough = 0;
    let screwsAir = 0;

    for (const f of project.fasteners) {
      fastenerTotals[f.type] = (fastenerTotals[f.type] ?? 0) + 1;
      const audit = fastenerAuditMap.get(f.id);
      if (audit?.status === 'through') screwsThrough++;
      else if (audit?.status === 'air') screwsAir++;
      else screwsOk++;
    }

    const overall = getProjectDimensionsMm(project.parts);

    return {
      totalAreaM2,
      totalEdgeBandingM: Math.round(totalEdgeBandingM * 100) / 100,
      totalSheets,
      totalSheetCostPln,
      nestingByMat,
      fastenerTotals,
      screwsOk,
      screwsThrough,
      screwsAir,
      overall,
    };
  }, [project, cutSpecs, nestingResults, fastenerAuditMap]);

  if (!open) return null;

  const activeNesting =
    nestingResults.find((n) => n.materialId === selectedNestMat) ?? nestingResults[0] ?? null;

  const activeDrillEntry =
    drillingMaps.find((d) => d.map.part.id === selectedDrillPartId) ??
    drillingMaps.find((d) => d.map.holes.length > 0 || d.map.cutouts.length > 0) ??
    drillingMaps[0] ??
    null;

  const exportCsv = () => {
    const header = [
      'Lp.',
      'Nazwa elementu',
      'Typ',
      'Material',
      'Dlugosc_wzdloz_slojow [mm]',
      'Szerokosc [mm]',
      'Wymiar_ciecia_pila [mm]',
      'Grubosc [mm]',
      'Okleina_ABS',
      'Okleina [mb]',
      'Katy_ciecia',
      'Obrobka_CNC',
      'Powierzchnia [m2]',
    ];
    const rows = project.parts
      .filter((p) => p.kind !== 'appliance')
      .map((part, idx) => {
        const spec = cutSpecs.get(part.id) ?? getCarpentryCutSpec(part);
        return [
          String(idx + 1),
          `"${part.name.replace(/"/g, '""')}"`,
          `"${PART_KIND_LABELS[part.kind]}"`,
          `"${getMaterialMeta(part.materialId).name}"`,
          String(spec.grainLenMm),
          String(spec.crossWidMm),
          `${spec.sawLenMm}x${spec.sawWidMm}`,
          String(spec.thicknessMm),
          `"${spec.edgeBandingLabel}"`,
          spec.edgeBandingLinearM.toFixed(2),
          `"${formatAnglesNote(part)}"`,
          `"${formatMachiningNote(part)}"`,
          spec.areaM2.toFixed(3),
        ].join(';');
      });

    const nestingRows = [
      '',
      `PODSUMOWANIE ROZKROJU ARKUSZY (RZAZ ${kerfMm} mm, OBRZYN 10 mm)`,
      'Material;Format arkusza;Liczba arkuszy;Odpad [%];Szac. koszt [zl]',
      ...nestingResults.map((nr) =>
        [
          `"${getMaterialMeta(nr.materialId).name}"`,
          `${nr.sheetWidthMm}x${nr.sheetHeightMm} mm`,
          String(nr.totalSheets),
          `${nr.wastePercent}%`,
          String(nr.estimatedCostPln),
        ].join(';')
      ),
    ];

    const screwRows = [
      '',
      'LISTA WKRETOW I OKUC',
      'Nazwa;Rozmiar;Ilosc [szt.]',
      ...SCREW_CATALOG.filter((s) => summary.fastenerTotals[s.id] > 0).map((s) =>
        [
          `"${s.name}"`,
          `${s.diameterMm}x${s.lengthMm} mm`,
          String(summary.fastenerTotals[s.id]),
        ].join(';')
      ),
      ...(quote.hardware.hingeCupsCount > 0
        ? [`"Zawias puszkowy Ø35";"Ø35 mm";${quote.hardware.hingeCupsCount}`]
        : []),
      ...(quote.hardware.drawerSlidePairs > 0
        ? [`"Prowadnice szuflad (komplety)";"L/P";${quote.hardware.drawerSlidePairs}`]
        : []),
      ...(quote.hardware.handlesCount > 0
        ? [`"Uchwyty meblowe";"szt.";${quote.hardware.handlesCount}`]
        : []),
      ...(quote.hardware.legsCount > 0
        ? [`"Nóżki regulowane";"szt.";${quote.hardware.legsCount}`]
        : []),
    ];

    const csvContent =
      '\uFEFF' + [header.join(';'), ...rows, ...nestingRows, ...screwRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_rozkroj.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportDxf = () => {
    const dxf = generateProjectDxf(project.parts, project.fasteners);
    const blob = new Blob([dxf], { type: 'application/dxf;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_cnc.dxf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrintPdf = () => {
    const snapshotDataUrl = onCaptureSnapshot();
    printTechnicalDocumentation({
      project,
      cutSpecs,
      nestingResults,
      quote,
      quoteSettings,
      kerfMm,
      snapshotDataUrl,
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(project, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}.stolarz3d.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const { project: cleanProject, error } = sanitizeImportedProject(parsed);
        if (cleanProject) {
          onImportProject(cleanProject);
          onClose();
        } else {
          onImportError(error || 'Nieprawidłowy plik projektu JSON.');
        }
      } catch {
        onImportError('Uszkodzony plik JSON — nie udało się odczytać projektu.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const updateQuoteField = <K extends keyof QuoteSettings>(key: K, val: QuoteSettings[K]) => {
    onChangeQuoteSettings({ ...quoteSettings, [key]: val });
  };

  const boardParts = project.parts.filter((p) => p.kind !== 'appliance');
  const screwWarnings = summary.screwsThrough + summary.screwsAir;
  const hw = quote.hardware;
  const hasHardware =
    hw.hingeCupsCount > 0 ||
    hw.drawerSlidePairs > 0 ||
    hw.handlesCount > 0 ||
    hw.legsCount > 0 ||
    hw.appliancesCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4">
      <div className="w-full sm:max-w-5xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col max-h-[92dvh]">
        {/* Header + 4-Tab Switch */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 sm:px-5 py-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              Dokumentacja, Rozkrój 2D, Wiercenia CNC i Wycena
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400 font-mono-num">
              {project.name} · Gabaryt {summary.overall.width} × {summary.overall.height} ×{' '}
              {summary.overall.depth} mm
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
              {(
                [
                  { id: 'list', label: 'Lista cięcia', icon: ListChecks },
                  { id: 'nesting', label: `Arkusze (${summary.totalSheets})`, icon: LayoutGrid },
                  { id: 'drilling', label: 'Wiercenia i 2D', icon: Crosshair },
                  { id: 'quote', label: 'Wycena', icon: Calculator },
                ] as const
              ).map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                    activeTab === id
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
              aria-label="Zamknij"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="cad-scroll flex-1 overflow-y-auto px-4 sm:px-5 py-4 space-y-5">
          {activeTab === 'list' && (
            <>
              {/* Structural Audit Banner */}
              {collisionCount > 0 || screwWarnings > 0 ? (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-500/40 bg-red-950/35 px-3.5 py-2.5 text-xs text-red-200">
                  <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {collisionCount > 0 && (
                      <span>
                        <strong>{collisionCount}</strong> kolizji nachodzących płyt
                      </span>
                    )}
                    {summary.screwsThrough > 0 && (
                      <span>
                        <strong>{summary.screwsThrough}</strong> wkrętów na przelot!
                      </span>
                    )}
                    {summary.screwsAir > 0 && (
                      <span>
                        <strong>{summary.screwsAir}</strong> wkrętów nie łapie sąsiedniej płyty
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                project.parts.length > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3.5 py-2 text-xs text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Audyt stolarski: brak kolizji płyt
                      {project.fasteners.length > 0
                        ? `, wszystkie ${summary.screwsOk} łączników prawidłowo osadzone.`
                        : '.'}
                    </span>
                  </div>
                )
              )}

              {/* Clean Unboxed KPI Row */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3.5 border-b border-zinc-800/80 pb-4">
                <div>
                  <div className="text-[11px] text-zinc-400">Formatki</div>
                  <div className="mt-0.5 text-lg font-semibold text-white font-mono-num">
                    {project.parts.length} szt.
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400">Pow. netto</div>
                  <div className="mt-0.5 text-lg font-semibold text-white font-mono-num">
                    {summary.totalAreaM2.toFixed(2)} m²
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400">Arkusze (2D)</div>
                  <div className="mt-0.5 text-lg font-semibold text-white font-mono-num">
                    {summary.totalSheets} ark.
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400">Okleina ABS</div>
                  <div className="mt-0.5 text-lg font-semibold text-sky-300 font-mono-num">
                    {summary.totalEdgeBandingM.toFixed(2)} mb
                  </div>
                </div>
                <div>
                  <div className="text-[11px] text-zinc-400">Oferta brutto</div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-400 font-mono-num">
                    {quote.grossTotalPln.toLocaleString('pl-PL')} zł
                  </div>
                </div>
              </div>

              {/* Material Breakdown from Real 2D Nesting */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-300 mb-2">
                  Zestawienie arkuszy (realny rozkrój 2D · rzaz {kerfMm} mm, obrzyn 10 mm)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400">
                        <th className="py-2 pr-3 font-medium">Materiał</th>
                        <th className="py-2 px-2 font-medium text-right">Format</th>
                        <th className="py-2 px-2 font-medium text-right">Szt.</th>
                        <th className="py-2 px-2 font-medium text-right">Arkusze</th>
                        <th className="py-2 px-2 font-medium text-right">Odpad</th>
                        <th className="py-2 pl-2 font-medium text-right">Koszt ark.</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {nestingResults.map((nr) => {
                        const meta = getMaterialMeta(nr.materialId);
                        return (
                          <tr key={nr.materialId} className="text-zinc-200">
                            <td className="py-2 pr-3 font-medium">
                              {meta.name}
                              {nr.grainLocked && (
                                <span className="ml-1.5 text-[10px] text-amber-400/90">
                                  (usłojenie)
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-zinc-400 whitespace-nowrap">
                              {nr.sheetWidthMm}×{nr.sheetHeightMm}
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num">{nr.totalParts}</td>
                            <td className="py-2 px-2 text-right font-mono-num font-semibold text-white">
                              {nr.totalSheets} ark.
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-zinc-400">
                              {nr.wastePercent}%
                            </td>
                            <td className="py-2 pl-2 text-right font-mono-num text-amber-300">
                              ~{nr.estimatedCostPln} zł
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Detailed Carpentry Cut List */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-300 mb-2">
                  Lista cięcia na piłę formatową (pierwszy wymiar = kierunek słojów)
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 text-zinc-400">
                        <th className="py-2 pr-2 font-medium">#</th>
                        <th className="py-2 px-2 font-medium">Nazwa</th>
                        <th className="py-2 px-2 font-medium">Materiał</th>
                        <th className="py-2 px-2 font-medium text-right">
                          Gotowy (Słój × Szer. × Gr.)
                        </th>
                        <th className="py-2 px-2 font-medium text-right">Cięcie piłą</th>
                        <th className="py-2 px-2 font-medium text-right">Okleina</th>
                        <th className="py-2 px-2 font-medium text-right">Kąty</th>
                        <th className="py-2 pl-2 font-medium text-right">Obróbka CNC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {boardParts.map((part, i) => {
                        const spec = cutSpecs.get(part.id) ?? getCarpentryCutSpec(part);
                        const sawReduced =
                          spec.sawLenMm !== spec.grainLenMm || spec.sawWidMm !== spec.crossWidMm;
                        return (
                          <tr key={part.id} className="text-zinc-200">
                            <td className="py-2 pr-2 text-zinc-500 font-mono-num">{i + 1}</td>
                            <td className="py-2 px-2 font-medium">{part.name}</td>
                            <td className="py-2 px-2 text-zinc-400 whitespace-nowrap">
                              {getMaterialMeta(part.materialId).shortName}
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num whitespace-nowrap">
                              {spec.grainLenMm} × {spec.crossWidMm} × {spec.thicknessMm}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-mono-num whitespace-nowrap ${
                                sawReduced ? 'text-amber-300 font-semibold' : 'text-zinc-400'
                              }`}
                            >
                              {spec.sawLenMm} × {spec.sawWidMm}
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-sky-300/90 whitespace-nowrap">
                              {spec.edgeBandingLabel}
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-amber-300/90 whitespace-nowrap">
                              {formatAnglesNote(part)}
                            </td>
                            <td className="py-2 pl-2 text-right text-[11px] text-emerald-300/90 whitespace-nowrap">
                              {formatMachiningNote(part)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Hardware BOM (Hinges, Slides, Handles, Legs) */}
              {hasHardware && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-300 mb-2">
                    Okucia meblowe (BOM z projektu)
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {hw.hingeCupsCount > 0 && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-400">Zawiasy puszkowe Ø35</div>
                        <div className="mt-0.5 text-sm font-semibold text-sky-300 font-mono-num">
                          {hw.hingeCupsCount} szt.
                        </div>
                      </div>
                    )}
                    {hw.drawerSlidePairs > 0 && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-400">Prowadnice szuflad</div>
                        <div className="mt-0.5 text-sm font-semibold text-sky-300 font-mono-num">
                          {hw.drawerSlidePairs} kpl.
                        </div>
                        <div className="text-[10px] text-zinc-500">
                          {hw.ballSlidePairs > 0 ? `Kulkowe: ${hw.ballSlidePairs}` : ''}
                          {hw.ballSlidePairs > 0 && hw.undermountSlidePairs > 0 ? ' · ' : ''}
                          {hw.undermountSlidePairs > 0 ? `Dolne: ${hw.undermountSlidePairs}` : ''}
                        </div>
                      </div>
                    )}
                    {hw.handlesCount > 0 && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-400">Uchwyty meblowe</div>
                        <div className="mt-0.5 text-sm font-semibold text-sky-300 font-mono-num">
                          {hw.handlesCount} szt.
                        </div>
                      </div>
                    )}
                    {hw.legsCount > 0 && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-400">Nóżki regulowane</div>
                        <div className="mt-0.5 text-sm font-semibold text-sky-300 font-mono-num">
                          {hw.legsCount} szt.
                        </div>
                      </div>
                    )}
                    {hw.appliancesCount > 0 && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-400">Wnętrze / AGD 3D</div>
                        <div className="mt-0.5 text-sm font-semibold text-amber-300 font-mono-num">
                          {hw.appliancesCount} szt. ({hw.appliancesCostPln.toLocaleString('pl-PL')} zł)
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Fasteners BOM */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-300 mb-2">
                  Wkręty, konfirmaty, mimośrody Minifix, śruby i kołki
                </h3>
                {project.fasteners.length === 0 ? (
                  <p className="text-xs text-zinc-500">
                    Brak wyznaczonych wkrętów. Użyj narzędzia „Wkręty” lub przycisku „Auto-wkręty”.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SCREW_CATALOG.filter((s) => summary.fastenerTotals[s.id] > 0).map((s) => (
                      <div
                        key={s.id}
                        className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 px-3.5 py-2.5 text-xs"
                      >
                        <div>
                          <div className="font-medium text-zinc-100">{s.name}</div>
                          <div className="text-[11px] text-zinc-500">{s.usage}</div>
                        </div>
                        <div className="text-sm font-semibold text-amber-400 font-mono-num">
                          {summary.fastenerTotals[s.id]} szt.
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'nesting' && (
            /* ==================== 2D SHEET NESTING VIEW ==================== */
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {nestingResults.map((nr) => {
                    const active = activeNesting?.materialId === nr.materialId;
                    return (
                      <button
                        key={nr.materialId}
                        type="button"
                        onClick={() => setSelectedNestMat(nr.materialId)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        {getMaterialMeta(nr.materialId).shortName} ({nr.totalSheets} ark.)
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-zinc-400">Rzaz piły:</span>
                  {KERF_OPTIONS.map((k) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKerfMm(k)}
                      className={`rounded-md border px-2 py-1 text-xs font-mono-num cursor-pointer ${
                        kerfMm === k
                          ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                          : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {k} mm
                    </button>
                  ))}
                </div>
              </div>

              {!activeNesting ? (
                <p className="py-10 text-center text-xs text-zinc-500">
                  Brak płyt arkuszowych do rozkroju w tym projekcie.
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <span>
                      Arkusz <strong className="text-zinc-200">{getMaterialMeta(activeNesting.materialId).name}</strong>{' '}
                      <span className="font-mono-num">
                        {activeNesting.sheetWidthMm} × {activeNesting.sheetHeightMm} mm
                      </span>{' '}
                      · obrzyn 10 mm · rzaz {kerfMm} mm
                    </span>
                    <span className="font-mono-num text-amber-300">
                      {activeNesting.grainLocked
                        ? 'Kierunek słojów zablokowany (bez obrotu 90°)'
                        : 'Automatyczny obrót 90° włączony'}
                    </span>
                  </div>

                  {activeNesting.sheets.map((sheet) => (
                    <div
                      key={sheet.sheetIndex}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-zinc-100">
                          Arkusz #{sheet.sheetIndex} z {activeNesting.totalSheets}
                        </span>
                        <span className="font-mono-num text-zinc-400">
                          Wykorzystanie: {100 - sheet.wastePercent}% · Odpad: {sheet.wastePercent}% (
                          {sheet.placements.length} formatek)
                        </span>
                      </div>

                      <div className="w-full overflow-x-auto">
                        <svg
                          viewBox={`0 0 ${sheet.sheetWidthMm} ${sheet.sheetHeightMm}`}
                          className="w-full h-auto max-h-[340px] rounded-lg border border-zinc-700 bg-[#1B1D22]"
                        >
                          <rect
                            x={0}
                            y={0}
                            width={sheet.sheetWidthMm}
                            height={sheet.sheetHeightMm}
                            fill="#23262D"
                          />
                          <rect
                            x={sheet.trimMm}
                            y={sheet.trimMm}
                            width={sheet.sheetWidthMm - sheet.trimMm * 2}
                            height={sheet.sheetHeightMm - sheet.trimMm * 2}
                            fill="#1A1D23"
                            stroke="#52525B"
                            strokeWidth={6}
                            strokeDasharray="24 16"
                          />
                          {sheet.placements.map((pl, idx) => {
                            const fill = pl.oversized
                              ? '#DC2626'
                              : SHEET_PIECE_COLORS[(pl.labelIndex - 1) % SHEET_PIECE_COLORS.length];
                            const minSide = Math.min(pl.wMm, pl.hMm);
                            const fontSize = Math.max(36, Math.min(72, minSide * 0.19));
                            return (
                              <g key={`${pl.partId}_${idx}`}>
                                <rect
                                  x={pl.xMm}
                                  y={pl.yMm}
                                  width={pl.wMm}
                                  height={pl.hMm}
                                  fill={fill}
                                  fillOpacity={0.28}
                                  stroke={fill}
                                  strokeWidth={7}
                                />
                                {pl.wMm > 140 && pl.hMm > 90 && (
                                  <>
                                    <text
                                      x={pl.xMm + pl.wMm / 2}
                                      y={pl.yMm + pl.hMm / 2 - fontSize * 0.35}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill="#FAFAFA"
                                      fontSize={fontSize}
                                      fontWeight={700}
                                      fontFamily="Inter, sans-serif"
                                    >
                                      #{pl.labelIndex} {pl.rotated ? '↻' : ''}
                                    </text>
                                    <text
                                      x={pl.xMm + pl.wMm / 2}
                                      y={pl.yMm + pl.hMm / 2 + fontSize * 0.72}
                                      textAnchor="middle"
                                      dominantBaseline="middle"
                                      fill="#E4E4E7"
                                      fontSize={fontSize * 0.78}
                                      fontFamily="JetBrains Mono, monospace"
                                    >
                                      {pl.wMm}×{pl.hMm}
                                    </text>
                                  </>
                                )}
                              </g>
                            );
                          })}
                        </svg>
                      </div>

                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {sheet.placements.map((pl, idx) => (
                          <span
                            key={`leg_${pl.partId}_${idx}`}
                            className={`rounded-md border px-2 py-0.5 text-[10px] font-mono-num ${
                              pl.oversized
                                ? 'border-red-500/60 bg-red-950/50 text-red-200'
                                : 'border-zinc-800 bg-zinc-900 text-zinc-300'
                            }`}
                          >
                            #{pl.labelIndex} {pl.partName} ({pl.wMm}×{pl.hMm}
                            {pl.rotated ? ' ↻' : ''}
                            {pl.oversized ? ' — ZA DUŻA NA ARKUSZ!' : ''})
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'drilling' && (
            /* ==================== 2D ORTHOGRAPHIC VIEWS & DRILLING MAPS ==================== */
            <div className="space-y-5">
              {/* 3 Orthographic Projections */}
              {orthoSvgs && (
                <div>
                  <h3 className="text-xs font-semibold text-zinc-300 mb-2">
                    Rzuty techniczne 2D z wymiarami gabarytowymi
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(
                      [
                        { key: 'front', title: 'Widok z przodu (X × Y)', svg: orthoSvgs.front },
                        { key: 'side', title: 'Widok z boku (Z × Y)', svg: orthoSvgs.side },
                        { key: 'top', title: 'Rzut z góry (X × Z)', svg: orthoSvgs.top },
                      ] as const
                    ).map((v) => (
                      <div
                        key={v.key}
                        className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-2.5 space-y-1.5"
                      >
                        <div className="text-[11px] font-medium text-zinc-300">{v.title}</div>
                        <div
                          className="w-full"
                          dangerouslySetInnerHTML={{ __html: v.svg }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Interactive Per-Board 2D Drilling Map & Coordinate Table */}
              <div className="space-y-3 border-t border-zinc-800 pt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    Mapa wierceń i wycięć 2D dla wybranej formatki (współrzędne X/Y od lewego dolnego rogu)
                  </h3>
                  <select
                    value={activeDrillEntry?.map.part.id ?? ''}
                    onChange={(e) => setSelectedDrillPartId(e.target.value)}
                    className="rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-100 focus:border-amber-500 focus:outline-none cursor-pointer"
                  >
                    {drillingMaps.map(({ index, map }) => (
                      <option key={map.part.id} value={map.part.id}>
                        #{index} {map.part.name} ({map.faceWidthMm}×{map.faceHeightMm} mm ·{' '}
                        {map.holes.length} otw., {map.cutouts.length} wyc.)
                      </option>
                    ))}
                  </select>
                </div>

                {activeDrillEntry ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
                    {/* 2D Board Drawing SVG */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-white">
                          #{activeDrillEntry.index} {activeDrillEntry.map.part.name}
                        </span>
                        <span className="font-mono-num text-zinc-400">
                          {activeDrillEntry.map.faceWidthMm} × {activeDrillEntry.map.faceHeightMm} ×{' '}
                          {activeDrillEntry.map.thicknessMm} mm
                        </span>
                      </div>

                      {(() => {
                        const m = activeDrillEntry.map;
                        const pad = Math.max(60, Math.max(m.faceWidthMm, m.faceHeightMm) * 0.1);
                        const vw = m.faceWidthMm + pad * 2;
                        const vh = m.faceHeightMm + pad * 2;
                        const fs = Math.max(20, Math.max(m.faceWidthMm, m.faceHeightMm) * 0.036);
                        return (
                          <svg
                            viewBox={`0 0 ${vw} ${vh}`}
                            className="w-full h-auto max-h-[300px] rounded-lg border border-zinc-800 bg-[#1B1D22]"
                          >
                            {/* Board outline */}
                            <rect
                              x={pad}
                              y={pad}
                              width={m.faceWidthMm}
                              height={m.faceHeightMm}
                              rx={m.part.cornerRadiusMm ?? 0}
                              fill="#252932"
                              stroke="#E4E4E7"
                              strokeWidth={Math.max(3, fs * 0.14)}
                            />
                            {/* Dado groove line */}
                            {m.part.dadoGroove?.enabled && (
                              <line
                                x1={pad}
                                y1={pad + m.faceHeightMm - m.part.dadoGroove.insetMm}
                                x2={pad + m.faceWidthMm}
                                y2={pad + m.faceHeightMm - m.part.dadoGroove.insetMm}
                                stroke="#38BDF8"
                                strokeWidth={Math.max(3, m.part.dadoGroove.widthMm)}
                                strokeDasharray="16 8"
                              />
                            )}
                            {/* Internal cutouts */}
                            {m.cutouts.map((c) => {
                              const cx = pad + m.faceWidthMm / 2 + c.xMm;
                              const cy = pad + m.faceHeightMm - (m.faceHeightMm / 2 + c.yMm);
                              return c.shape === 'circle' ? (
                                <circle
                                  key={c.id}
                                  cx={cx}
                                  cy={cy}
                                  r={(c.diameterMm ?? c.widthMm) / 2}
                                  fill="#7F1D1D"
                                  fillOpacity={0.35}
                                  stroke="#F87171"
                                  strokeWidth={Math.max(3, fs * 0.14)}
                                  strokeDasharray="12 6"
                                />
                              ) : (
                                <rect
                                  key={c.id}
                                  x={cx - c.widthMm / 2}
                                  y={cy - c.heightMm / 2}
                                  width={c.widthMm}
                                  height={c.heightMm}
                                  fill="#7F1D1D"
                                  fillOpacity={0.35}
                                  stroke="#F87171"
                                  strokeWidth={Math.max(3, fs * 0.14)}
                                  strokeDasharray="12 6"
                                />
                              );
                            })}
                            {/* Drill holes */}
                            {m.holes.map((h, hi) => {
                              const hx = pad + h.xMm;
                              const hy = pad + m.faceHeightMm - h.yMm;
                              const r = Math.max(8, h.diameterMm / 2);
                              const stroke =
                                h.kind === 'hinge_cup'
                                  ? '#38BDF8'
                                  : h.kind === 'minifix_cam'
                                    ? '#A78BFA'
                                    : '#F59E0B';
                              return (
                                <g key={h.id}>
                                  <circle
                                    cx={hx}
                                    cy={hy}
                                    r={r}
                                    fill={stroke}
                                    fillOpacity={0.22}
                                    stroke={stroke}
                                    strokeWidth={Math.max(3, fs * 0.12)}
                                  />
                                  <text
                                    x={hx + r + 8}
                                    y={hy + fs * 0.28}
                                    fontSize={fs * 0.8}
                                    fill="#FAFAFA"
                                    fontFamily="JetBrains Mono, monospace"
                                    fontWeight={700}
                                  >
                                    O{hi + 1}
                                  </text>
                                </g>
                              );
                            })}
                            {/* Overall width & height labels */}
                            <text
                              x={pad + m.faceWidthMm / 2}
                              y={pad - fs * 0.45}
                              textAnchor="middle"
                              fontSize={fs}
                              fill="#FBBF24"
                              fontFamily="JetBrains Mono, monospace"
                              fontWeight={700}
                            >
                              {m.faceWidthMm} mm
                            </text>
                            <text
                              x={pad - fs * 0.35}
                              y={pad + m.faceHeightMm / 2}
                              textAnchor="end"
                              fontSize={fs}
                              fill="#FBBF24"
                              fontFamily="JetBrains Mono, monospace"
                              fontWeight={700}
                            >
                              {m.faceHeightMm}
                            </text>
                          </svg>
                        );
                      })()}

                      <div className="flex flex-wrap gap-3 text-[10px] text-zinc-400 pt-1">
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-amber-400 inline-block" /> Wkręty / Kołki
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-violet-400 inline-block" /> Minifix Ø15
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-sky-400 inline-block" /> Zawias Ø35 / Nut
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" /> Wycięcie
                        </span>
                      </div>
                    </div>

                    {/* X/Y Coordinate Table */}
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3">
                      <div className="text-xs font-semibold text-zinc-200 mb-2">
                        Tabela współrzędnych wierceń ({activeDrillEntry.map.holes.length} otw.)
                      </div>
                      {activeDrillEntry.map.holes.length === 0 ? (
                        <p className="text-xs text-zinc-500 py-4">
                          Ta formatka nie ma jeszcze otworów montażowych ani zawiasów.
                        </p>
                      ) : (
                        <div className="overflow-x-auto max-h-[280px] cad-scroll">
                          <table className="w-full text-left text-[11px] border-collapse">
                            <thead>
                              <tr className="border-b border-zinc-800 text-zinc-400">
                                <th className="py-1.5 pr-2">Nr</th>
                                <th className="py-1.5 px-2">Opis</th>
                                <th className="py-1.5 px-2">Strona</th>
                                <th className="py-1.5 px-2 text-right">X [mm]</th>
                                <th className="py-1.5 px-2 text-right">Y [mm]</th>
                                <th className="py-1.5 pl-2 text-right">Ø × gł.</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-zinc-800/60">
                              {activeDrillEntry.map.holes.map((h, hi) => (
                                <tr key={h.id} className="text-zinc-200">
                                  <td className="py-1.5 pr-2 font-mono-num font-semibold text-amber-300">
                                    O{hi + 1}
                                  </td>
                                  <td className="py-1.5 px-2">{h.label}</td>
                                  <td className="py-1.5 px-2 text-zinc-400">{h.face}</td>
                                  <td className="py-1.5 px-2 text-right font-mono-num">{h.xMm}</td>
                                  <td className="py-1.5 px-2 text-right font-mono-num">{h.yMm}</td>
                                  <td className="py-1.5 pl-2 text-right font-mono-num text-sky-300 whitespace-nowrap">
                                    Ø{h.diameterMm} × {h.depthMm}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-zinc-500">Brak formatek w projekcie.</p>
                )}
              </div>
            </div>
          )}

          {activeTab === 'quote' && (
            /* ==================== COMMERCIAL CLIENT QUOTE CALCULATOR ==================== */
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              {/* Left: Editable Commercial Rates & Client Header */}
              <div className="space-y-4">
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-2.5">
                  <h3 className="text-xs font-semibold text-zinc-200">
                    Dane do oferty PDF (nagłówek klienta)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Nazwa pracowni / stolarza</label>
                      <input
                        type="text"
                        value={quoteSettings.companyName}
                        onChange={(e) => updateQuoteField('companyName', e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Klient / inwestycja</label>
                      <input
                        type="text"
                        value={quoteSettings.clientName}
                        onChange={(e) => updateQuoteField('clientName', e.target.value)}
                        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-1.5 text-xs text-white focus:border-amber-500 focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-2.5">
                  <h3 className="text-xs font-semibold text-zinc-200">
                    Stawki usług, okuć i robocizny [PLN]
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { key: 'cuttingPricePerMbPln', label: 'Cięcie [zł/mb]' },
                        { key: 'edgeBandingPricePerMbPln', label: 'Oklejanie [zł/mb]' },
                        { key: 'hingePricePln', label: 'Zawias Ø35 [zł/szt]' },
                        { key: 'slidePairPricePln', label: 'Prow. szuflad [zł/kpl]' },
                        { key: 'handlePricePln', label: 'Uchwyt [zł/szt]' },
                        { key: 'legPricePln', label: 'Nóżka reg. [zł/szt]' },
                        { key: 'fastenerPricePln', label: 'Łącznik [zł/szt]' },
                        { key: 'laborHours', label: 'Robocizna [godz.]' },
                        { key: 'laborRatePln', label: 'Stawka [zł/godz.]' },
                        { key: 'marginPercent', label: 'Marża [%]' },
                      ] as const
                    ).map(({ key, label }) => (
                      <div key={key}>
                        <label className="block text-[10px] text-zinc-400 mb-1 truncate">
                          {label}
                        </label>
                        <input
                          type="number"
                          min={0}
                          step={key === 'fastenerPricePln' ? 0.05 : 1}
                          value={quoteSettings[key]}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            if (Number.isFinite(v) && v >= 0) updateQuoteField(key, v);
                          }}
                          className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block text-[10px] text-zinc-400 mb-1">Stawka VAT</label>
                      <div className="grid grid-cols-2 gap-1">
                        {([8, 23] as const).map((vat) => (
                          <button
                            key={vat}
                            type="button"
                            onClick={() => updateQuoteField('vatPercent', vat)}
                            className={`min-h-[30px] rounded-lg border text-xs font-mono-num font-semibold cursor-pointer ${
                              quoteSettings.vatPercent === vat
                                ? 'border-amber-500 bg-amber-500/15 text-amber-300'
                                : 'border-zinc-800 bg-zinc-950 text-zinc-400'
                            }`}
                          >
                            {vat}%
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: Live Financial Breakdown */}
              <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                    <h3 className="text-sm font-semibold text-white">Kalkulacja oferty</h3>
                    <span className="text-[11px] text-zinc-400 font-mono-num">
                      VAT {quoteSettings.vatPercent}% · Marża {quoteSettings.marginPercent}%
                    </span>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">
                        Materiały płytowe ({summary.totalSheets} ark.)
                      </span>
                      <span className="font-mono-num text-zinc-100">
                        {quote.sheetsCostPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">
                        Cięcie na pile ({quote.cuttingLinearM} mb)
                      </span>
                      <span className="font-mono-num text-zinc-100">
                        {quote.cuttingCostPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">
                        Oklejanie krawędzi ABS ({quote.edgeBandingLinearM} mb)
                      </span>
                      <span className="font-mono-num text-zinc-100">
                        {quote.edgeBandingCostPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">
                        Okucia i łączniki ({hw.hingeCupsCount} zaw., {hw.drawerSlidePairs} prow.,{' '}
                        {hw.fastenersTotal} wkr.)
                      </span>
                      <span className="font-mono-num text-zinc-100">
                        {quote.hardwareCostPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">
                        Robocizna i montaż ({quoteSettings.laborHours} h × {quoteSettings.laborRatePln} zł)
                      </span>
                      <span className="font-mono-num text-zinc-100">
                        {quote.laborCostPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>

                    <div className="border-t border-zinc-800 pt-2 flex justify-between">
                      <span className="text-zinc-400">Koszt wytworzenia (netto)</span>
                      <span className="font-mono-num text-zinc-200">
                        {quote.subtotalPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Marża ({quoteSettings.marginPercent}%)</span>
                      <span className="font-mono-num text-emerald-300">
                        +{quote.marginPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>
                    <div className="flex justify-between font-medium text-sm border-t border-zinc-800 pt-2">
                      <span className="text-zinc-200">Razem NETTO</span>
                      <span className="font-mono-num text-white">
                        {quote.netTotalPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Podatek VAT ({quoteSettings.vatPercent}%)</span>
                      <span className="font-mono-num text-zinc-300">
                        {quote.vatPln.toLocaleString('pl-PL')} zł
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-amber-500/40 bg-amber-500/12 px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-[11px] text-amber-200/80 uppercase tracking-wide font-semibold">
                      Cena końcowa BRUTTO
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      Gotowa do wydruku w ofercie PDF
                    </div>
                  </div>
                  <div className="text-2xl font-bold text-amber-400 font-mono-num">
                    {quote.grossTotalPln.toLocaleString('pl-PL')} zł
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions: Save/Load JSON, DXF CNC, CSV, Print/PDF */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-4 sm:px-5 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={exportJson}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileJson className="h-4 w-4 text-zinc-400" />
              <span>Zapisz JSON</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Upload className="h-4 w-4 text-zinc-400" />
              <span>Wczytaj JSON</span>
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              onChange={handleImportFile}
              className="hidden"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={exportDxf}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-sky-500/45 bg-sky-500/12 px-3 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition-colors whitespace-nowrap cursor-pointer"
              title="Eksportuj wszystkie formatki, wycięcia i wiercenia w formacie AutoCAD DXF R12 (CNC)"
            >
              <FileCode2 className="h-4 w-4" />
              <span>Eksport DXF</span>
            </button>
            <button
              type="button"
              onClick={exportCsv}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-100 hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Download className="h-4 w-4 text-amber-400" />
              <span>CSV</span>
            </button>
            <button
              type="button"
              onClick={() => printBoardLabels(project, cutSpecs)}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-500/45 bg-emerald-500/12 px-3 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/20 transition-colors whitespace-nowrap cursor-pointer"
              title="Drukuj naklejki warsztatowe A4 (3×7) na formatki z mapą okleinowania ABS"
            >
              <Tag className="h-4 w-4" />
              <span>Etykiety PDF</span>
            </button>
            <button
              type="button"
              onClick={handlePrintPdf}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Printer className="h-4 w-4" />
              <span>Drukuj / PDF</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
