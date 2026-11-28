import React, { useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Box,
  Calculator,
  CheckCircle2,
  Crosshair,
  Download,
  FileCode2,
  FileJson,
  LayoutGrid,
  ListChecks,
  PackageCheck,
  Plus,
  Printer,
  Scale,
  Tag,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  FurniturePart,
  FurnitureProject,
  getMaterialMeta,
  MATERIAL_CATALOG,
  MaterialId,
  OffcutRemnant,
  PART_KIND_LABELS,
  QuoteSettings,
  SCREW_CATALOG,
  ScrewType,
} from '../types/furniture';
import { getProjectDimensionsMm } from '../engine/geometry';
import { NumericInput } from './NumericInput';
import {
  computePartWeightKg,
  computeProjectWeightSummary,
  computeSawCutAngles,
  type CountertopBridgeIssue,
  type DoorSwingCollision,
  type FastenerAudit,
  type RoomClearanceIssue,
  type ShelfDeflectionAudit,
} from '../engine/carpentry';
import {
  getCarpentryCutSpec,
  nestLinearProfiles,
  nestMaterialSheets,
  type CarpentryCutSpec,
} from '../engine/nesting';
import {
  buildOrthographicSvg,
  computeCommercialQuote,
  extractBoardDrillingMap,
  generateProjectDxf,
  getBoardOutline2D,
  getDadoGrooveLine2D,
  getLedGrooveLine2D,
  printBoardLabels,
  printTechnicalDocumentation,
} from '../engine/documentation';
import { loadOffcuts, sanitizeImportedProject, saveOffcuts } from '../engine/storage';
import { exportProjectTo3D, type Export3DFormat } from '../engine/export3D';

interface CutListModalProps {
  open: boolean;
  project: FurnitureProject;
  materialsVersion: number;
  fastenerAuditMap: Map<string, FastenerAudit>;
  shelfDeflectionMap: Map<string, ShelfDeflectionAudit>;
  roomIssues: RoomClearanceIssue[];
  doorSwingCollisions?: DoorSwingCollision[];
  countertopBridgeIssues?: CountertopBridgeIssue[];
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
  if (part.ledGroove?.enabled) notes.push(`Frez LED ${part.ledGroove.widthMm}×${part.ledGroove.depthMm}`);
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
  shelfDeflectionMap,
  roomIssues,
  doorSwingCollisions = [],
  countertopBridgeIssues = [],
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
  const [selectedNestKey, setSelectedNestKey] = useState<string | null>(null);
  const [selectedDrillPartId, setSelectedDrillPartId] = useState<string | null>(null);

  // Workshop offcuts (remnant boards warehouse)
  const [offcuts, setOffcuts] = useState<OffcutRemnant[]>(() => loadOffcuts());
  const [useOffcuts, setUseOffcuts] = useState<boolean>(true);
  const [offcutPanelOpen, setOffcutPanelOpen] = useState<boolean>(false);
  const [newOffMat, setNewOffMat] = useState<MaterialId>('white_matte');
  const [newOffThick, setNewOffThick] = useState<number>(18);
  const [newOffLen, setNewOffLen] = useState<number>(1400);
  const [newOffWid, setNewOffWid] = useState<number>(800);
  const [newOffQty, setNewOffQty] = useState<number>(1);
  const [newOffLabel, setNewOffLabel] = useState<string>('');

  const handleAddOffcut = () => {
    const rem: OffcutRemnant = {
      id: `off_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      materialId: newOffMat,
      thicknessMm: Math.max(3, Math.round(newOffThick)),
      lengthMm: Math.max(150, Math.round(newOffLen)),
      widthMm: Math.max(120, Math.round(newOffWid)),
      quantity: Math.max(1, Math.min(20, Math.round(newOffQty))),
      label: newOffLabel.trim() || undefined,
    };
    const next = [rem, ...offcuts];
    setOffcuts(next);
    saveOffcuts(next);
    setNewOffLabel('');
  };

  const handleDeleteOffcut = (id: string) => {
    const next = offcuts.filter((o) => o.id !== id);
    setOffcuts(next);
    saveOffcuts(next);
  };

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
    return nestMaterialSheets(project.parts, kerfMm, 10, useOffcuts ? offcuts : []);
  }, [project.parts, kerfMm, materialsVersion, useOffcuts, offcuts]);

  const weightSummary = useMemo(() => {
    void materialsVersion;
    return computeProjectWeightSummary(project.parts);
  }, [project.parts, materialsVersion]);

  const linearResults = useMemo(() => {
    void materialsVersion;
    return nestLinearProfiles(project.parts, kerfMm);
  }, [project.parts, kerfMm, materialsVersion]);

  const quote = useMemo(() => {
    void materialsVersion;
    return computeCommercialQuote(
      project,
      nestingResults,
      cutSpecs,
      quoteSettings,
      linearResults
    );
  }, [project, nestingResults, cutSpecs, quoteSettings, linearResults, materialsVersion]);

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
    return project.parts
      .filter((p) => p.kind !== 'appliance')
      .map((part, idx) => ({
        index: idx + 1,
        map: extractBoardDrillingMap(part, project.parts, project.fasteners),
      }));
  }, [open, activeTab, project.parts, project.fasteners]);

  const summary = useMemo(() => {
    let totalAreaM2 = 0;
    let totalEdgeBandingM = 0;
    let totalSheets = 0;
    let totalSheetCostPln = 0;

    for (const part of project.parts) {
      if (part.kind === 'profile' || part.kind === 'appliance') continue;
      const spec = cutSpecs.get(part.id);
      if (!spec) continue;
      totalAreaM2 += spec.areaM2;
      totalEdgeBandingM += spec.edgeBandingLinearM;
    }

    const nestingByMat = new Map<MaterialId, (typeof nestingResults)[number]>();
    for (const nr of nestingResults) {
      nestingByMat.set(nr.materialId, nr);
      totalSheets += nr.totalSheets;
      totalSheetCostPln += nr.estimatedCostPln;
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
    nestingResults.find((n) => n.groupKey === selectedNestKey) ?? nestingResults[0] ?? null;

  const activeDrillEntry =
    drillingMaps.find((d) => d.map.part.id === selectedDrillPartId) ??
    drillingMaps.find(
      (d) =>
        d.map.holes.length > 0 ||
        d.map.cutouts.length > 0 ||
        d.map.part.dadoGroove?.enabled ||
        d.map.part.ledGroove?.enabled
    ) ??
    drillingMaps[0] ??
    null;

  const totalUsedOffcuts = nestingResults.reduce((s, n) => s + n.usedOffcutsCount, 0);
  const totalSavedOffcutPln = nestingResults.reduce((s, n) => s + n.savedOffcutCostPln, 0);

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
        const isProfile = part.kind === 'profile';
        const sortedProfile = isProfile
          ? [Math.round(part.width), Math.round(part.height), Math.round(part.depth)].sort(
              (a, b) => a - b
            )
          : null;
        return [
          String(idx + 1),
          `"${part.name.replace(/"/g, '""')}"`,
          `"${isProfile ? 'Profil 1D' : PART_KIND_LABELS[part.kind]}"`,
          `"${getMaterialMeta(part.materialId).name}"`,
          String(isProfile && sortedProfile ? sortedProfile[2] : spec.grainLenMm),
          String(isProfile && sortedProfile ? sortedProfile[1] : spec.crossWidMm),
          isProfile && sortedProfile ? `1D: ${sortedProfile[2]} mm` : `${spec.sawLenMm}x${spec.sawWidMm}`,
          String(isProfile && sortedProfile ? sortedProfile[0] : spec.thicknessMm),
          `"${isProfile ? 'Brak' : spec.edgeBandingLabel}"`,
          isProfile ? '0.00' : spec.edgeBandingLinearM.toFixed(2),
          `"${formatAnglesNote(part)}"`,
          `"${formatMachiningNote(part)}"`,
          isProfile ? '0.000' : spec.areaM2.toFixed(3),
        ].join(';');
      });

    const nestingRows = [
      '',
      `PODSUMOWANIE ROZKROJU ARKUSZY 2D (RZAZ ${kerfMm} mm, OBRZYN 10 mm)`,
      'Material;Grubosc [mm];Format arkusza;Liczba arkuszy;Odpad [%];Szac. koszt [zl]',
      ...nestingResults.map((nr) =>
        [
          `"${getMaterialMeta(nr.materialId).name}"`,
          String(nr.thicknessMm),
          `${nr.sheetWidthMm}x${nr.sheetHeightMm} mm`,
          String(nr.totalSheets),
          `${nr.wastePercent}%`,
          String(nr.estimatedCostPln),
        ].join(';')
      ),
    ];

    const linearRows =
      linearResults.length > 0
        ? [
            '',
            `PODSUMOWANIE CIECIA LINIOWEGO 1D (PROFILE / SZTANGI, RZAZ ${kerfMm} mm)`,
            'Material;Przekroj;Dlugosc sztangi [mm];Liczba elementow;Liczba sztang;Odpad [%];Szac. koszt [zl]',
            ...linearResults.map((lr) =>
              [
                `"${getMaterialMeta(lr.materialId).name}"`,
                `"${lr.profileSectionLabel}"`,
                String(lr.stockLengthMm),
                String(lr.totalParts),
                String(lr.totalBars),
                `${lr.wastePercent}%`,
                String(lr.estimatedCostPln),
              ].join(';')
            ),
          ]
        : [];

    const screwRows = [
      '',
      'LISTA WKRETOW, OKUC I WYPOSAZENIA',
      'Nazwa;Rozmiar / Jednostka;Ilosc',
      ...SCREW_CATALOG.filter((s) => summary.fastenerTotals[s.id] > 0).map((s) =>
        [
          `"${s.name}"`,
          `${s.diameterMm}x${s.lengthMm} mm`,
          String(summary.fastenerTotals[s.id]),
        ].join(';')
      ),
      ...(quote.hardware.hingeCupsCount > 0
        ? [`"Zawias puszkowy Ø35";"Ø35 mm [szt.]";${quote.hardware.hingeCupsCount}`]
        : []),
      ...(quote.hardware.flapLiftsCount > 0
        ? [`"Podnośnik klapy / siłownik gazowy";"kpl.";${quote.hardware.flapLiftsCount}`]
        : []),
      ...(quote.hardware.drawerSlidePairs > 0
        ? [`"Prowadnice szuflad (komplety)";"L/P [kpl.]";${quote.hardware.drawerSlidePairs}`]
        : []),
      ...(quote.hardware.handlesCount > 0
        ? [`"Uchwyty meblowe";"szt.";${quote.hardware.handlesCount}`]
        : []),
      ...(quote.hardware.tipOnCount > 0
        ? [`"Odbojniki Tip-On";"szt.";${quote.hardware.tipOnCount}`]
        : []),
      ...(quote.hardware.golaLinearM > 0
        ? [`"Listwa aluminiowa Gola J";"mb";${quote.hardware.golaLinearM.toFixed(2)}`]
        : []),
      ...(quote.hardware.slidingDoorsCount > 0
        ? [`"System drzwi przesuwnych";"skrz.";${quote.hardware.slidingDoorsCount}`]
        : []),
      ...(quote.hardware.legsCount > 0
        ? [`"Nóżki regulowane";"szt.";${quote.hardware.legsCount}`]
        : []),
      ...(quote.hardware.appliancesCount > 0
        ? [`"Wnętrze / AGD 3D";"szt.";${quote.hardware.appliancesCount}`]
        : []),
    ];

    const csvContent =
      '\uFEFF' + [header.join(';'), ...rows, ...nestingRows, ...linearRows, ...screwRows].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_rozkroj.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const [exporting3d, setExporting3d] = useState<Export3DFormat | null>(null);

  const handleExport3D = async (format: Export3DFormat) => {
    if (exporting3d) return;
    setExporting3d(format);
    try {
      await exportProjectTo3D(project, format);
    } catch (err) {
      console.error('3D export failed:', err);
    } finally {
      setExporting3d(null);
    }
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
      linearResults,
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
  const sagWarnings = Array.from(shelfDeflectionMap.values()).filter(
    (a) => a.status === 'critical' || a.status === 'warning'
  );
  const hw = quote.hardware;
  const hasHardware =
    hw.hingeCupsCount > 0 ||
    hw.flapLiftsCount > 0 ||
    hw.drawerSlidePairs > 0 ||
    hw.handlesCount > 0 ||
    hw.tipOnCount > 0 ||
    hw.golaLinearM > 0 ||
    hw.slidingDoorsCount > 0 ||
    hw.legsCount > 0 ||
    hw.appliancesCount > 0;

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/55 p-0 sm:p-4"
    >
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
              {collisionCount > 0 ||
              screwWarnings > 0 ||
              sagWarnings.length > 0 ||
              roomIssues.length > 0 ||
              doorSwingCollisions.length > 0 ||
              countertopBridgeIssues.length > 0 ? (
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
                    {sagWarnings.length > 0 && (
                      <span className="text-amber-200">
                        <strong>{sagWarnings.length}</strong> półek z ryzykiem ugięcia (np.{' '}
                        {sagWarnings[0].partName}: {sagWarnings[0].deflectionMm} mm)
                      </span>
                    )}
                    {roomIssues.length > 0 && (
                      <span>
                        <strong>{roomIssues.length}</strong> kolizji z wnęką/przeszkodą
                      </span>
                    )}
                    {doorSwingCollisions.length > 0 && (
                      <span className="text-amber-200">
                        <strong>{doorSwingCollisions.length}</strong> kolizji otwierania frontów (np.{' '}
                        {doorSwingCollisions[0].doorName} przy {doorSwingCollisions[0].hitAngleDeg}°)
                      </span>
                    )}
                    {countertopBridgeIssues.length > 0 && (
                      <span>
                        <strong>{countertopBridgeIssues.length}</strong> mostków blatu &lt; 50 mm!
                      </span>
                    )}
                  </div>
                </div>
              ) : (
                project.parts.length > 0 && (
                  <div className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-950/25 px-3.5 py-2 text-xs text-emerald-200">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                    <span>
                      Audyt stolarski: brak kolizji płyt, fronty otwierają się bez kolizji, półki sztywne
                      {project.fasteners.length > 0
                        ? `, wszystkie ${summary.screwsOk} łączników prawidłowo osadzone.`
                        : '.'}
                    </span>
                  </div>
                )
              )}

              {/* Clean Unboxed KPI Row */}
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-3.5 border-b border-zinc-800/80 pb-4">
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
                  <div className="text-[11px] text-zinc-400">Masa całkowita</div>
                  <div className="mt-0.5 text-lg font-semibold text-emerald-300 font-mono-num">
                    {weightSummary.totalWeightKg} kg
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
                          <tr key={nr.groupKey} className="text-zinc-200">
                            <td className="py-2 pr-3 font-medium">
                              {meta.name}{' '}
                              <span className="font-mono-num text-amber-300/90">
                                ({nr.thicknessMm} mm)
                              </span>
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
                      {linearResults.map((lr) => {
                        const meta = getMaterialMeta(lr.materialId);
                        return (
                          <tr key={lr.groupKey} className="text-zinc-200 bg-sky-950/15">
                            <td className="py-2 pr-3 font-medium">
                              {meta.name}{' '}
                              <span className="font-mono-num text-sky-300">
                                (profil {lr.profileSectionLabel} · 1D)
                              </span>
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-zinc-400 whitespace-nowrap">
                              sztanga {lr.stockLengthMm} mm
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num">{lr.totalParts}</td>
                            <td className="py-2 px-2 text-right font-mono-num font-semibold text-sky-300">
                              {lr.totalBars} szt.
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-zinc-400">
                              {lr.wastePercent}%
                            </td>
                            <td className="py-2 pl-2 text-right font-mono-num text-amber-300">
                              ~{lr.estimatedCostPln} zł
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
                        <th className="py-2 px-2 font-medium text-right">Waga</th>
                        <th className="py-2 px-2 font-medium text-right">Kąty</th>
                        <th className="py-2 pl-2 font-medium text-right">Obróbka CNC</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/60">
                      {boardParts.map((part, i) => {
                        const spec = cutSpecs.get(part.id) ?? getCarpentryCutSpec(part);
                        const isProfile = part.kind === 'profile';
                        const sortedProfile = isProfile
                          ? [Math.round(part.width), Math.round(part.height), Math.round(part.depth)].sort(
                              (a, b) => a - b
                            )
                          : null;
                        const sawReduced =
                          !isProfile &&
                          (spec.sawLenMm !== spec.grainLenMm || spec.sawWidMm !== spec.crossWidMm);
                        const kg = computePartWeightKg(part);
                        return (
                          <tr key={part.id} className="text-zinc-200">
                            <td className="py-2 pr-2 text-zinc-500 font-mono-num">{i + 1}</td>
                            <td className="py-2 px-2 font-medium">{part.name}</td>
                            <td className="py-2 px-2 text-zinc-400 whitespace-nowrap">
                              {getMaterialMeta(part.materialId).shortName}
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num whitespace-nowrap">
                              {isProfile && sortedProfile
                                ? `${sortedProfile[0]}×${sortedProfile[1]} × ${sortedProfile[2]}`
                                : `${spec.grainLenMm} × ${spec.crossWidMm} × ${spec.thicknessMm}`}
                            </td>
                            <td
                              className={`py-2 px-2 text-right font-mono-num whitespace-nowrap ${
                                isProfile
                                  ? 'text-sky-300'
                                  : sawReduced
                                    ? 'text-amber-300 font-semibold'
                                    : 'text-zinc-400'
                              }`}
                            >
                              {isProfile && sortedProfile
                                ? `Profil 1D · ${sortedProfile[2]} mm`
                                : `${spec.sawLenMm} × ${spec.sawWidMm}`}
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-sky-300/90 whitespace-nowrap">
                              {isProfile ? '—' : spec.edgeBandingLabel}
                            </td>
                            <td className="py-2 px-2 text-right font-mono-num text-zinc-300 whitespace-nowrap">
                              {kg.toFixed(1)} kg
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
                    {hw.flapLiftsCount > 0 && (
                      <div className="rounded-xl border border-violet-500/35 bg-violet-950/25 px-3 py-2.5">
                        <div className="text-[11px] text-violet-300">Podnośniki klap / Aventos</div>
                        <div className="mt-0.5 text-sm font-semibold text-violet-200 font-mono-num">
                          {hw.flapLiftsCount} kpl.
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
                        <div className="text-[11px] text-zinc-400">Uchwyty relingowe</div>
                        <div className="mt-0.5 text-sm font-semibold text-sky-300 font-mono-num">
                          {hw.handlesCount} szt.
                        </div>
                      </div>
                    )}
                    {hw.tipOnCount > 0 && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-400">Odbojniki Tip-On</div>
                        <div className="mt-0.5 text-sm font-semibold text-emerald-300 font-mono-num">
                          {hw.tipOnCount} szt.
                        </div>
                      </div>
                    )}
                    {hw.golaLinearM > 0 && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-400">Listwa alum. Gola (J)</div>
                        <div className="mt-0.5 text-sm font-semibold text-emerald-300 font-mono-num">
                          {hw.golaLinearM} mb
                        </div>
                      </div>
                    )}
                    {hw.slidingDoorsCount > 0 && (
                      <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 px-3 py-2.5">
                        <div className="text-[11px] text-zinc-400">System drzwi przesuwnych</div>
                        <div className="mt-0.5 text-sm font-semibold text-emerald-300 font-mono-num">
                          {hw.slidingDoorsCount} skrz.
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

              {/* Weight & Hardware Load Sizing Calculator */}
              {(weightSummary.flapRecommendations.length > 0 ||
                weightSummary.hingeRecommendations.length > 0 ||
                weightSummary.drawerRecommendations.length > 0 ||
                weightSummary.heaviestPart) && (
                <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-300">
                      <Scale className="h-4 w-4" />
                      <span>Kalkulator masy ({weightSummary.totalWeightKg} kg) i dobór okuć</span>
                    </div>
                    {weightSummary.heaviestPart && (
                      <span className="text-[11px] text-zinc-400 font-mono-num">
                        Najcięższy element: {weightSummary.heaviestPart.name} ({weightSummary.heaviestPart.weightKg} kg)
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                    {weightSummary.flapRecommendations.map((fl) => (
                      <div
                        key={fl.partId}
                        className="rounded-lg border border-violet-500/35 bg-violet-950/25 px-3 py-2 space-y-0.5"
                      >
                        <div className="flex items-center justify-between font-semibold text-violet-200">
                          <span>Klapa: {fl.partName}</span>
                          <span className="font-mono-num">{fl.weightKg} kg · LF {fl.powerFactorLF}</span>
                        </div>
                        <div className="text-zinc-300">{fl.recommendedLift}</div>
                      </div>
                    ))}
                    {weightSummary.hingeRecommendations
                      .filter((d) => d.needsMoreHinges)
                      .map((d) => (
                        <div
                          key={d.partId}
                          className="rounded-lg border border-amber-500/40 bg-amber-950/25 px-3 py-2 space-y-0.5"
                        >
                          <div className="flex items-center justify-between font-semibold text-amber-200">
                            <span>Front: {d.partName}</span>
                            <span className="font-mono-num">{d.weightKg} kg</span>
                          </div>
                          <div className="text-amber-100/90">
                            Aktualnie {d.currentHinges} zaw. — zalecane min. {d.recommendedHinges} zawiasy!
                          </div>
                        </div>
                      ))}
                    {weightSummary.drawerRecommendations.slice(0, 4).map((dr) => (
                      <div
                        key={dr.partId}
                        className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2 flex items-center justify-between gap-2"
                      >
                        <span className="text-zinc-300 truncate">{dr.partName}</span>
                        <span className="font-mono-num text-sky-300 shrink-0">
                          Prow. {dr.recommendedLoadKg} kg ({dr.widthMm} mm)
                        </span>
                      </div>
                    ))}
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
                    const active = activeNesting?.groupKey === nr.groupKey;
                    return (
                      <button
                        key={nr.groupKey}
                        type="button"
                        onClick={() => setSelectedNestKey(nr.groupKey)}
                        className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                          active
                            ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                            : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                        }`}
                      >
                        {getMaterialMeta(nr.materialId).shortName} {nr.thicknessMm} mm ({nr.totalSheets} ark.)
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

              {/* Workshop Offcuts Warehouse (Magazyn odpadów / resztek płyt) */}
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/15 p-3 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <PackageCheck className="h-4 w-4 text-emerald-400 shrink-0" />
                    <div>
                      <div className="text-xs font-semibold text-emerald-200">
                        Magazyn odpadów z warsztatu ({offcuts.reduce((s, o) => s + o.quantity, 0)} resztek)
                      </div>
                      <div className="text-[10px] text-zinc-400">
                        {totalUsedOffcuts > 0
                          ? `Wykorzystano ${totalUsedOffcuts} resztek · Oszczędność na płytach: ~${totalSavedOffcutPln} zł`
                          : 'Dodaj pozostałe kawałki płyt — rozkrój użyje ich przed cięciem nowych arkuszy'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[11px] text-zinc-200 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={useOffcuts}
                        onChange={(e) => setUseOffcuts(e.target.checked)}
                        className="h-3.5 w-3.5 accent-emerald-500"
                      />
                      <span>Użyj w rozkroju</span>
                    </label>
                    <button
                      type="button"
                      onClick={() => setOffcutPanelOpen((v) => !v)}
                      className="rounded-lg border border-emerald-500/45 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300 hover:bg-emerald-500/25 cursor-pointer"
                    >
                      {offcutPanelOpen ? 'Zwiń magazyn' : '+ Zarządzaj resztkami'}
                    </button>
                  </div>
                </div>

                {offcutPanelOpen && (
                  <div className="space-y-2.5 border-t border-emerald-500/20 pt-2.5">
                    <div className="grid grid-cols-2 sm:grid-cols-6 gap-1.5 items-end">
                      <label className="col-span-2 sm:col-span-2">
                        <span className="text-[10px] text-zinc-400">Materiał</span>
                        <select
                          value={newOffMat}
                          onChange={(e) => setNewOffMat(e.target.value as MaterialId)}
                          className="mt-0.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-white"
                        >
                          {MATERIAL_CATALOG.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.shortName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-400">Grub. [mm]</span>
                        <NumericInput
                          min={3}
                          max={40}
                          step={1}
                          value={newOffThick}
                          onChange={(val) => setNewOffThick(val)}
                          className="mt-0.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] font-mono-num text-white focus:border-amber-500 focus:outline-none"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-400">Dł. (słój)</span>
                        <NumericInput
                          min={150}
                          max={2800}
                          step={50}
                          value={newOffLen}
                          onChange={(val) => setNewOffLen(val)}
                          className="mt-0.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] font-mono-num text-white focus:border-amber-500 focus:outline-none"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-400">Szer.</span>
                        <NumericInput
                          min={120}
                          max={2070}
                          step={50}
                          value={newOffWid}
                          onChange={(val) => setNewOffWid(val)}
                          className="mt-0.5 w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] font-mono-num text-white focus:border-amber-500 focus:outline-none"
                        />
                      </label>
                      <div className="flex gap-1">
                        <NumericInput
                          min={1}
                          max={20}
                          step={1}
                          value={newOffQty}
                          onChange={(val) => setNewOffQty(val)}
                          title="Ilość sztuk"
                          className="w-12 rounded-lg border border-zinc-800 bg-zinc-950 px-1.5 py-1.5 text-[11px] font-mono-num text-white focus:border-amber-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={handleAddOffcut}
                          className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-emerald-500 px-2 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-emerald-400 cursor-pointer"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Dodaj</span>
                        </button>
                      </div>
                    </div>

                    {offcuts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {offcuts.map((o) => (
                          <div
                            key={o.id}
                            className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950/80 px-2.5 py-1 text-[11px]"
                          >
                            <span className="text-zinc-200 font-medium">
                              {getMaterialMeta(o.materialId).shortName} {o.thicknessMm} mm
                            </span>
                            <span className="font-mono-num text-emerald-300">
                              {o.lengthMm}×{o.widthMm} ({o.quantity} szt.)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteOffcut(o.id)}
                              className="text-zinc-500 hover:text-red-400 cursor-pointer"
                              aria-label="Usuń resztkę"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {!activeNesting ? (
                <p className="py-10 text-center text-xs text-zinc-500">
                  Brak płyt arkuszowych do rozkroju w tym projekcie.
                </p>
              ) : (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-zinc-400">
                    <span>
                      Arkusz <strong className="text-zinc-200">{getMaterialMeta(activeNesting.materialId).name} ({activeNesting.thicknessMm} mm)</strong>{' '}
                      <span className="font-mono-num">
                        {activeNesting.sheetWidthMm} × {activeNesting.sheetHeightMm} mm
                      </span>{' '}
                      · obrzyn 10 mm · rzaz {kerfMm} mm
                      {activeNesting.usedOffcutsCount > 0 && (
                        <span className="ml-2 text-emerald-300 font-semibold">
                          ({activeNesting.usedOffcutsCount} z odpadów, {activeNesting.freshSheetsCount} nowych · oszczędność ~{activeNesting.savedOffcutCostPln} zł)
                        </span>
                      )}
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
                      className={`rounded-xl border p-3 space-y-2 ${
                        sheet.isOffcut
                          ? 'border-emerald-500/45 bg-emerald-950/15'
                          : 'border-zinc-800 bg-zinc-950/70'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2 font-semibold text-zinc-100">
                          {sheet.isOffcut ? (
                            <>
                              <span className="rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-zinc-950">
                                ODPAD
                              </span>
                              <span>
                                {sheet.offcutLabel || 'Resztka warsztatowa'} ({sheet.sheetWidthMm}×{sheet.sheetHeightMm} mm)
                              </span>
                            </>
                          ) : (
                            <span>
                              Arkusz #{sheet.sheetIndex} z {activeNesting.totalSheets}
                            </span>
                          )}
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

              {/* 1D Linear Bar Cutting Optimization for Steel Profiles & Timber Battens */}
              {linearResults.length > 0 && (
                <div className="space-y-3 border-t border-zinc-800 pt-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-sky-300">
                      Rozkrój liniowy 1D — profile stalowe i listwy (sztangi handlowe)
                    </h3>
                    <span className="text-[11px] text-zinc-400 font-mono-num">
                      Rzaz: {kerfMm} mm · Obrzyn końcówek: 20 mm
                    </span>
                  </div>
                  {linearResults.map((lr) => (
                    <div
                      key={lr.groupKey}
                      className="rounded-xl border border-zinc-800 bg-zinc-950/70 p-3 space-y-2.5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-semibold text-white">
                          {getMaterialMeta(lr.materialId).name} · przekrój{' '}
                          <span className="font-mono-num text-sky-300">{lr.profileSectionLabel}</span>
                        </span>
                        <span className="font-mono-num text-zinc-400">
                          {lr.totalBars} sztang × {lr.stockLengthMm} mm · Odpad {lr.wastePercent}% · ~{lr.estimatedCostPln} zł
                        </span>
                      </div>

                      <div className="space-y-2">
                        {lr.bars.map((bar) => (
                          <div key={bar.barIndex} className="space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-mono-num text-zinc-400">
                              <span>Sztanga #{bar.barIndex} ({bar.stockLengthMm} mm)</span>
                              <span>
                                Wykorzystano: {bar.usedMm} mm · Odpad: {bar.wasteMm} mm ({bar.wastePercent}%)
                              </span>
                            </div>
                            <svg
                              viewBox={`0 0 ${bar.stockLengthMm} 210`}
                              className="w-full h-10 rounded-md border border-zinc-700 bg-[#1B1D22]"
                              preserveAspectRatio="none"
                            >
                              <rect x={0} y={0} width={bar.stockLengthMm} height={210} fill="#23262D" />
                              {bar.cuts.map((c, ci) => {
                                const fill = c.oversized
                                  ? '#DC2626'
                                  : SHEET_PIECE_COLORS[(c.labelIndex - 1) % SHEET_PIECE_COLORS.length];
                                return (
                                  <g key={`${c.partId}_${ci}`}>
                                    <rect
                                      x={c.startMm}
                                      y={14}
                                      width={Math.min(c.lengthMm, bar.stockLengthMm - c.startMm)}
                                      height={182}
                                      fill={fill}
                                      fillOpacity={0.34}
                                      stroke={fill}
                                      strokeWidth={10}
                                    />
                                    {c.lengthMm > bar.stockLengthMm * 0.08 && (
                                      <text
                                        x={c.startMm + c.lengthMm / 2}
                                        y={118}
                                        textAnchor="middle"
                                        fill="#FAFAFA"
                                        fontSize={86}
                                        fontFamily="JetBrains Mono, monospace"
                                        fontWeight={700}
                                      >
                                        #{c.labelIndex} ({c.lengthMm})
                                      </text>
                                    )}
                                  </g>
                                );
                              })}
                            </svg>
                          </div>
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
                        const isPolyOutline = m.part.kind === 'sloped' || m.part.kind === 'custom';
                        const outlinePtsStr = isPolyOutline
                          ? getBoardOutline2D(m.part, m.faceWidthMm, m.faceHeightMm)
                              .map(([x, y]) => `${pad + x},${pad + m.faceHeightMm - y}`)
                              .join(' ')
                          : '';
                        const groove = getDadoGrooveLine2D(
                          m.part,
                          m.thinAxis,
                          m.faceWidthMm,
                          m.faceHeightMm
                        );
                        const ledLine = getLedGrooveLine2D(
                          m.part,
                          m.thinAxis,
                          m.faceWidthMm,
                          m.faceHeightMm
                        );
                        return (
                          <svg
                            viewBox={`0 0 ${vw} ${vh}`}
                            className="w-full h-auto max-h-[300px] rounded-lg border border-zinc-800 bg-[#1B1D22]"
                          >
                            {/* Board outline (trapezoid / custom polygon OR rounded rectangle) */}
                            {isPolyOutline ? (
                              <polygon
                                points={outlinePtsStr}
                                fill="#252932"
                                stroke="#E4E4E7"
                                strokeWidth={Math.max(3, fs * 0.14)}
                                strokeLinejoin="round"
                              />
                            ) : (
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
                            )}
                            {/* Dado groove line (vertical X=inset on side walls, horizontal on decks) */}
                            {groove && (
                              <line
                                x1={pad + groove.x1}
                                y1={pad + m.faceHeightMm - groove.y1}
                                x2={pad + groove.x2}
                                y2={pad + m.faceHeightMm - groove.y2}
                                stroke="#38BDF8"
                                strokeWidth={Math.max(3, groove.widthMm)}
                                strokeDasharray="16 8"
                              />
                            )}
                            {/* Recessed LED channel groove line (10×8 mm) */}
                            {ledLine && (
                              <line
                                x1={pad + ledLine.x1}
                                y1={pad + m.faceHeightMm - ledLine.y1}
                                x2={pad + ledLine.x2}
                                y2={pad + m.faceHeightMm - ledLine.y2}
                                stroke="#F59E0B"
                                strokeWidth={Math.max(6, ledLine.widthMm)}
                                opacity={0.9}
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
                                h.kind === 'hinge_cup' || h.kind === 'hinge_plate'
                                  ? '#38BDF8'
                                  : h.kind === 'minifix_cam'
                                    ? '#A78BFA'
                                    : h.kind === 'slide_rail'
                                      ? '#10B981'
                                      : h.kind === 'shelf_pin'
                                        ? '#94A3B8'
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
                                  {h.kind !== 'shelf_pin' && (
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
                                  )}
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
                          <span className="h-2.5 w-2.5 rounded-full bg-sky-400 inline-block" /> Zawias Ø35 / Prowadnik S32
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 inline-block" /> Prowadnica S32
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-slate-400 inline-block" /> Podpórka Ø5 (S32)
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-2.5 w-2.5 rounded-full bg-red-400 inline-block" /> Wycięcie
                        </span>
                        <span className="flex items-center gap-1">
                          <span className="h-1.5 w-3.5 rounded-xs bg-amber-400 inline-block" /> Frez LED
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
                        { key: 'flapLiftPricePln', label: 'Podnośnik klapy [zł/kpl]' },
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
                        <NumericInput
                          min={0}
                          step={key === 'fastenerPricePln' ? 0.05 : 1}
                          allowDecimal
                          value={quoteSettings[key] ?? (key === 'flapLiftPricePln' ? 145 : 0)}
                          onChange={(v) => updateQuoteField(key, v)}
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
                    {quote.linearBarsCount > 0 && (
                      <div className="flex justify-between">
                        <span className="text-zinc-400">
                          Profile liniowe 1D ({quote.linearBarsCount} sztang)
                        </span>
                        <span className="font-mono-num text-sky-300">
                          {quote.linearProfilesCostPln.toLocaleString('pl-PL')} zł
                        </span>
                      </div>
                    )}
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
            <div className="flex items-center rounded-xl border border-violet-500/35 bg-violet-500/10 p-0.5">
              <span className="flex items-center gap-1 px-2 text-[11px] font-semibold text-violet-300">
                <Box className="h-3.5 w-3.5" />
                <span>3D:</span>
              </span>
              {(['glb', 'obj', 'stl'] as Export3DFormat[]).map((fmt) => (
                <button
                  key={fmt}
                  type="button"
                  disabled={exporting3d !== null}
                  onClick={() => void handleExport3D(fmt)}
                  title={`Eksportuj cały model 3D w formacie ${fmt.toUpperCase()} (Blender, SketchUp, CAD, druk 3D)`}
                  className="min-h-[32px] rounded-lg px-2 text-[11px] font-semibold uppercase text-violet-200 hover:bg-violet-500/25 disabled:opacity-50 transition-colors cursor-pointer"
                >
                  {exporting3d === fmt ? '...' : fmt}
                </button>
              ))}
            </div>
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
