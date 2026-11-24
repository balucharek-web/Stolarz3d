import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  LayoutGrid,
  ListChecks,
  Upload,
  X,
} from 'lucide-react';
import {
  FurniturePart,
  FurnitureProject,
  MATERIAL_MAP,
  MaterialId,
  PART_KIND_LABELS,
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
import { sanitizeImportedProject } from '../engine/storage';

interface CutListModalProps {
  open: boolean;
  project: FurnitureProject;
  fastenerAuditMap: Map<string, FastenerAudit>;
  collisionCount: number;
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

export const CutListModal: React.FC<CutListModalProps> = ({
  open,
  project,
  fastenerAuditMap,
  collisionCount,
  onClose,
  onImportProject,
  onImportError,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeTab, setActiveTab] = useState<'list' | 'nesting'>('list');
  const [kerfMm, setKerfMm] = useState<number>(4);
  const [selectedNestMat, setSelectedNestMat] = useState<MaterialId | null>(null);

  const cutSpecs = useMemo(() => {
    const map = new Map<string, CarpentryCutSpec>();
    for (const part of project.parts) {
      map.set(part.id, getCarpentryCutSpec(part));
    }
    return map;
  }, [project.parts]);

  const nestingResults = useMemo(
    () => nestMaterialSheets(project.parts, kerfMm, 10),
    [project.parts, kerfMm]
  );

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

    // Add linear profile material costs if any
    for (const part of project.parts) {
      if (part.kind === 'profile') {
        const spec = cutSpecs.get(part.id);
        if (spec) {
          totalSheetCostPln += Math.round(spec.areaM2 * MATERIAL_MAP[part.materialId].pricePerM2Pln);
        }
      }
    }

    const fastenerTotals: Record<ScrewType, number> = {
      wood_4x45: 0,
      confirmat_7x50: 0,
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
      'Powierzchnia [m2]',
    ];
    const rows = project.parts.map((part, idx) => {
      const spec = cutSpecs.get(part.id) ?? getCarpentryCutSpec(part);
      return [
        String(idx + 1),
        `"${part.name.replace(/"/g, '""')}"`,
        `"${PART_KIND_LABELS[part.kind]}"`,
        `"${MATERIAL_MAP[part.materialId].name}"`,
        String(spec.grainLenMm),
        String(spec.crossWidMm),
        `${spec.sawLenMm}x${spec.sawWidMm}`,
        String(spec.thicknessMm),
        `"${spec.edgeBandingLabel}"`,
        spec.edgeBandingLinearM.toFixed(2),
        `"${formatAnglesNote(part)}"`,
        spec.areaM2.toFixed(3),
      ].join(';');
    });

    const nestingRows = [
      '',
      `PODSUMOWANIE ROZKROJU ARKUSZY (RZAZ ${kerfMm} mm, OBRZYN 10 mm)`,
      'Material;Format arkusza;Liczba arkuszy;Odpad [%];Szac. koszt [zl]',
      ...nestingResults.map((nr) =>
        [
          `"${MATERIAL_MAP[nr.materialId].name}"`,
          `${nr.sheetWidthMm}x${nr.sheetHeightMm} mm`,
          String(nr.totalSheets),
          `${nr.wastePercent}%`,
          String(nr.estimatedCostPln),
        ].join(';')
      ),
    ];

    const screwRows = [
      '',
      'LISTA WKRETOW I LACZNIKOW',
      'Nazwa;Rozmiar;Ilosc [szt.]',
      ...SCREW_CATALOG.filter((s) => summary.fastenerTotals[s.id] > 0).map((s) =>
        [
          `"${s.name}"`,
          `${s.diameterMm}x${s.lengthMm} mm`,
          String(summary.fastenerTotals[s.id]),
        ].join(';')
      ),
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

  const screwWarnings = summary.screwsThrough + summary.screwsAir;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4">
      <div className="w-full sm:max-w-4xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col max-h-[90dvh]">
        {/* Header + Tab Switch */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800 px-4 sm:px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              Rozkrój płyt, okleina i nesting 2D
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400 font-mono-num">
              {project.name} · Gabaryt {summary.overall.width} × {summary.overall.height} ×{' '}
              {summary.overall.depth} mm
            </p>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('list')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'list'
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <ListChecks className="h-3.5 w-3.5" />
                <span>Lista cięcia</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('nesting')}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                  activeTab === 'nesting'
                    ? 'bg-amber-500 text-zinc-950 font-semibold'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Mapa arkuszy ({summary.totalSheets})</span>
              </button>
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
          {activeTab === 'list' ? (
            <>
              {/* Structural Audit Banner */}
              {(collisionCount > 0 || screwWarnings > 0) ? (
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
                        ? `, wszystkie ${summary.screwsOk} wkrętów prawidłowo osadzone.`
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
                  <div className="text-[11px] text-zinc-400">Koszt arkuszy</div>
                  <div className="mt-0.5 text-lg font-semibold text-amber-400 font-mono-num">
                    ~{Math.round(summary.totalSheetCostPln)} zł
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
                        const meta = MATERIAL_MAP[nr.materialId];
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

              {/* Detailed Carpentry Cut List (preserving grain direction & 2mm ABS saw cut deduction) */}
              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-zinc-300">
                    Lista cięcia na piłę formatową (pierwszy wymiar = kierunek słojów)
                  </h3>
                </div>
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
                        <th className="py-2 pl-2 font-medium text-right">Kąty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {project.parts.map((part, i) => {
                        const spec = cutSpecs.get(part.id) ?? getCarpentryCutSpec(part);
                        const sawReduced =
                          spec.sawLenMm !== spec.grainLenMm || spec.sawWidMm !== spec.crossWidMm;
                        return (
                          <tr key={part.id} className="text-zinc-200">
                            <td className="py-2 pr-2 text-zinc-500 font-mono-num">{i + 1}</td>
                            <td className="py-2 px-2 font-medium">{part.name}</td>
                            <td className="py-2 px-2 text-zinc-400 whitespace-nowrap">
                              {MATERIAL_MAP[part.materialId].shortName}
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
                            <td className="py-2 pl-2 text-right font-mono-num text-amber-300/90 whitespace-nowrap">
                              {formatAnglesNote(part)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Fasteners BOM */}
              <div>
                <h3 className="text-xs font-semibold text-zinc-300 mb-2">
                  Wkręty, konfirmaty, śruby i kołki
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
          ) : (
            /* ==================== 2D SHEET NESTING VIEW ==================== */
            <div className="space-y-4">
              {/* Kerf & Material Filter Bar */}
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
                        {MATERIAL_MAP[nr.materialId].shortName} ({nr.totalSheets} ark.)
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
                      Arkusz <strong className="text-zinc-200">{MATERIAL_MAP[activeNesting.materialId].name}</strong>{' '}
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
                          {/* Full raw sheet background */}
                          <rect
                            x={0}
                            y={0}
                            width={sheet.sheetWidthMm}
                            height={sheet.sheetHeightMm}
                            fill="#23262D"
                          />
                          {/* Perimeter trim boundary (10mm obrzyn) */}
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
                          {/* Placed boards */}
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

                      {/* Legend of pieces on this sheet */}
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
        </div>

        {/* Footer Actions: CSV, Save JSON, Load JSON */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-800 px-4 sm:px-5 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={exportJson}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
            >
              <FileJson className="h-4 w-4 text-zinc-400" />
              <span>Zapisz JSON</span>
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-xs font-medium text-zinc-200 hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
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

          <button
            type="button"
            onClick={exportCsv}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Download className="h-4 w-4" />
            <span>Eksportuj CSV (Rozkrój)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
