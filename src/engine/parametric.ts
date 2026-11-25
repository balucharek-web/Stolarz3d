import {
  DrawerSlideType,
  Fastener,
  FurniturePart,
  HandleStyle,
  MaterialId,
  ScrewType,
  SurfaceFinish,
} from '../types/furniture';
import { autoDetectJointFasteners } from './geometry';
import { getPartWorldBox, syncFastenersWithParts } from './carpentry';

export type CabinetPresetId =
  | 'base_kitchen'
  | 'corner_l'
  | 'drawer_chest'
  | 'wall_cabinet'
  | 'wardrobe'
  | 'sliding_wardrobe'
  | 'tv_console';

export interface ParametricCabinetConfig {
  name: string;
  preset: CabinetPresetId;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  boardThicknessMm: number;
  /** Floor clearance / plinth height (0 = sitting flat on floor, e.g. 100mm for kitchen legs/plinth) */
  plinthHeightMm: number;
  /** Elevation from floor (e.g. 1400mm for hanging wall cabinet) */
  elevationYmm: number;
  plinthStyle: 'plinth_board' | 'legs' | 'none';
  /** Full top deck vs 2 upper stretchers (trawersy) for kitchen base cabinets */
  topType: 'full_panel' | 'stretchers';
  /** Internal vertical dividers (0, 1, or 2 bays) */
  verticalDividers: 0 | 1 | 2;
  shelfCount: number;
  drawerCount: number;
  doorMode: 'none' | 'single_left' | 'single_right' | 'double';
  frontType: 'overlay' | 'inset';
  frontGapMm: number;
  handleStyle: HandleStyle;
  backType: 'hdf_grooved' | 'hdf_nailed' | 'none';
  slideType: DrawerSlideType;
  /** Optional wall filler strip (blenda przyścienna) for flush installation against uneven walls */
  wallFillerSide: 'none' | 'left' | 'right' | 'both';
  wallFillerWidthMm: number;
  /** Enable System 32 shelf-pin Ø5 drilling rows on vertical walls */
  system32Holes: boolean;
  /** Blind panel width for L-corner blind kitchen cabinet */
  cornerBlindWidthMm?: number;
  /** Include oval chrome wardrobe hanging rod inside upper bay */
  addWardrobeRod?: boolean;
  corpusMaterialId: MaterialId;
  frontMaterialId: MaterialId;
  frontFinish: SurfaceFinish;
  addCountertop: boolean;
  countertopMaterialId: MaterialId;
  autoFasteners: boolean;
  fastenerType: ScrewType;
}

export const CABINET_PRESETS: Record<
  CabinetPresetId,
  { label: string; desc: string; config: ParametricCabinetConfig }
> = {
  base_kitchen: {
    label: 'Szafka dolna kuchenna',
    desc: '800 × 820 × 560 mm · 2 trawersy, cokół 100 mm, blat',
    config: {
      name: 'Szafka dolna 80',
      preset: 'base_kitchen',
      widthMm: 800,
      heightMm: 820,
      depthMm: 560,
      boardThicknessMm: 18,
      plinthHeightMm: 100,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      topType: 'stretchers',
      verticalDividers: 0,
      shelfCount: 1,
      drawerCount: 0,
      doorMode: 'double',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'gola_j',
      backType: 'hdf_grooved',
      slideType: 'ball_26mm',
      wallFillerSide: 'none',
      wallFillerWidthMm: 45,
      system32Holes: true,
      addWardrobeRod: false,
      corpusMaterialId: 'white_matte',
      frontMaterialId: 'oak_craft',
      frontFinish: 'satin',
      addCountertop: true,
      countertopMaterialId: 'concrete_top',
      autoFasteners: true,
      fastenerType: 'confirmat_7x50',
    },
  },
  corner_l: {
    label: 'Szafka narożna L',
    desc: '1050 × 820 × 560 mm · Ślepy bok + blenda + front + blat',
    config: {
      name: 'Szafka narożna 105',
      preset: 'corner_l',
      widthMm: 1050,
      heightMm: 820,
      depthMm: 560,
      boardThicknessMm: 18,
      plinthHeightMm: 100,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      topType: 'stretchers',
      verticalDividers: 0,
      shelfCount: 1,
      drawerCount: 0,
      doorMode: 'single_right',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'bar',
      backType: 'hdf_grooved',
      slideType: 'none',
      wallFillerSide: 'none',
      wallFillerWidthMm: 50,
      system32Holes: true,
      cornerBlindWidthMm: 560,
      addWardrobeRod: false,
      corpusMaterialId: 'white_matte',
      frontMaterialId: 'oak_craft',
      frontFinish: 'satin',
      addCountertop: true,
      countertopMaterialId: 'concrete_top',
      autoFasteners: true,
      fastenerType: 'confirmat_7x50',
    },
  },
  drawer_chest: {
    label: 'Komoda z szufladami',
    desc: '900 × 860 × 450 mm · 4 szuflady Blum (dno −13 mm w nut)',
    config: {
      name: 'Komoda 4 szuflady',
      preset: 'drawer_chest',
      widthMm: 900,
      heightMm: 860,
      depthMm: 450,
      boardThicknessMm: 18,
      plinthHeightMm: 80,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      topType: 'full_panel',
      verticalDividers: 0,
      shelfCount: 0,
      drawerCount: 4,
      doorMode: 'none',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'chamfer_45',
      backType: 'hdf_grooved',
      slideType: 'undermount_blum',
      wallFillerSide: 'none',
      wallFillerWidthMm: 45,
      system32Holes: false,
      addWardrobeRod: false,
      corpusMaterialId: 'oak_craft',
      frontMaterialId: 'anthracite_matte',
      frontFinish: 'gloss',
      addCountertop: false,
      countertopMaterialId: 'oak_craft',
      autoFasteners: true,
      fastenerType: 'minifix_15',
    },
  },
  wall_cabinet: {
    label: 'Szafka wisząca',
    desc: '800 × 720 × 320 mm · Podwieszana, Tip-On, 2 półki',
    config: {
      name: 'Szafka wisząca 80',
      preset: 'wall_cabinet',
      widthMm: 800,
      heightMm: 720,
      depthMm: 320,
      boardThicknessMm: 18,
      plinthHeightMm: 0,
      elevationYmm: 1420,
      plinthStyle: 'none',
      topType: 'full_panel',
      verticalDividers: 0,
      shelfCount: 2,
      drawerCount: 0,
      doorMode: 'double',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'tip_on',
      backType: 'hdf_grooved',
      slideType: 'none',
      wallFillerSide: 'none',
      wallFillerWidthMm: 45,
      system32Holes: true,
      addWardrobeRod: false,
      corpusMaterialId: 'white_matte',
      frontMaterialId: 'white_matte',
      frontFinish: 'gloss',
      addCountertop: false,
      countertopMaterialId: 'concrete_top',
      autoFasteners: true,
      fastenerType: 'minifix_15',
    },
  },
  wardrobe: {
    label: 'Szafa hybrydowa',
    desc: '1200 × 2100 × 580 mm · 2 szuflady dół + półki + drążek',
    config: {
      name: 'Szafa 120',
      preset: 'wardrobe',
      widthMm: 1200,
      heightMm: 2100,
      depthMm: 580,
      boardThicknessMm: 18,
      plinthHeightMm: 80,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      topType: 'full_panel',
      verticalDividers: 1,
      shelfCount: 3,
      drawerCount: 2,
      doorMode: 'double',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'bar',
      backType: 'hdf_grooved',
      slideType: 'undermount_blum',
      wallFillerSide: 'none',
      wallFillerWidthMm: 50,
      system32Holes: true,
      addWardrobeRod: true,
      corpusMaterialId: 'oak_craft',
      frontMaterialId: 'white_matte',
      frontFinish: 'satin',
      addCountertop: false,
      countertopMaterialId: 'oak_craft',
      autoFasteners: true,
      fastenerType: 'confirmat_7x50',
    },
  },
  sliding_wardrobe: {
    label: 'Szafa przesuwna',
    desc: '1800 × 2200 × 640 mm · Tory 90 mm, 2 przesuwne fronty, drążek',
    config: {
      name: 'Szafa przesuwna 180',
      preset: 'sliding_wardrobe',
      widthMm: 1800,
      heightMm: 2200,
      depthMm: 640,
      boardThicknessMm: 18,
      plinthHeightMm: 80,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      topType: 'full_panel',
      verticalDividers: 1,
      shelfCount: 4,
      drawerCount: 0,
      doorMode: 'double',
      frontType: 'inset',
      frontGapMm: 3,
      handleStyle: 'gola_j',
      backType: 'hdf_grooved',
      slideType: 'none',
      wallFillerSide: 'none',
      wallFillerWidthMm: 50,
      system32Holes: true,
      addWardrobeRod: true,
      corpusMaterialId: 'white_matte',
      frontMaterialId: 'oak_craft',
      frontFinish: 'satin',
      addCountertop: false,
      countertopMaterialId: 'oak_craft',
      autoFasteners: true,
      fastenerType: 'confirmat_7x50',
    },
  },
  tv_console: {
    label: 'Szafka RTV niska',
    desc: '1600 × 480 × 420 mm · Nóżki, przegroda, 2 szuflady, bezuchwyt.',
    config: {
      name: 'Szafka RTV 160',
      preset: 'tv_console',
      widthMm: 1600,
      heightMm: 480,
      depthMm: 420,
      boardThicknessMm: 18,
      plinthHeightMm: 120,
      elevationYmm: 0,
      plinthStyle: 'legs',
      topType: 'full_panel',
      verticalDividers: 0,
      shelfCount: 0,
      drawerCount: 2,
      doorMode: 'none',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'tip_on',
      backType: 'hdf_grooved',
      slideType: 'undermount_blum',
      wallFillerSide: 'none',
      wallFillerWidthMm: 45,
      system32Holes: false,
      addWardrobeRod: false,
      corpusMaterialId: 'walnut',
      frontMaterialId: 'anthracite_matte',
      frontFinish: 'gloss',
      addCountertop: false,
      countertopMaterialId: 'walnut',
      autoFasteners: true,
      fastenerType: 'minifix_15',
    },
  },
};

function uid(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Generates a collision-free, workshop-accurate parametric cabinet assembly:
 * - sides (optional System 32 Ø5 rows), bottom deck, full top OR 2 kitchen stretchers (trawersy)
 * - 3 mm HDF back (hdf_white) in dado groove OR nailed
 * - 0 / 1 / 2 internal vertical dividers creating equal bays
 * - hybrid zones (bottom drawers + separator deck + upper shelves / wardrobe rod + doors)
 * - Blum/GTV undermount drawer box with recessed grooved HDF bottom (+13 mm up)
 * - blind corner L kitchen cabinet (`corner_l`)
 * - sliding-door wardrobe (`sliding_wardrobe`) with 90 mm aluminum track recess + overlapping sliding doors
 * - optional wall filler strips (blenda przyścienna L / P)
 * - handle styles (bar, Tip-On, Gola J, 45° chamfer)
 */
export function buildParametricCabinet(
  cfg: ParametricCabinetConfig,
  offsetXmm = 0,
  offsetZmm = 0
): { parts: FurniturePart[]; fasteners: Fastener[]; groupId: string } {
  const parts: FurniturePart[] = [];
  const t = Math.max(12, Math.min(38, Math.round(cfg.boardThicknessMm)));
  const W = Math.max(240, Math.round(cfg.widthMm));
  const H = Math.max(240, Math.round(cfg.heightMm));
  const D = Math.max(200, Math.round(cfg.depthMm));
  const plinthH =
    cfg.plinthStyle === 'none'
      ? 0
      : Math.max(0, Math.min(200, Math.round(cfg.plinthHeightMm)));
  const baseY = Math.max(0, Math.round(cfg.elevationYmm));
  const bodyH = Math.max(160, H - plinthH);
  const innerW = Math.max(120, W - 2 * t);
  const innerH = Math.max(100, bodyH - 2 * t);
  const gap = Math.max(1, Math.min(6, Math.round(cfg.frontGapMm)));
  const isSliding = cfg.preset === 'sliding_wardrobe';
  const isCorner = cfg.preset === 'corner_l';
  const topType = cfg.topType ?? 'full_panel';
  const handleStyle: HandleStyle = cfg.handleStyle ?? 'bar';
  const rawDividersCount = isCorner
    ? 0
    : (Math.max(0, Math.min(2, Math.round(cfg.verticalDividers ?? 0))) as 0 | 1 | 2);

  const groupId = `${cfg.name.trim() || 'Szafka'} #${Math.floor(10 + Math.random() * 89)}`;
  const bodyBottomY = baseY + plinthH;
  const bodyCenterY = bodyBottomY + bodyH / 2;

  const backGroove =
    cfg.backType === 'hdf_grooved'
      ? { enabled: true, edge: 'back' as const, insetMm: 16, widthMm: 4, depthMm: 8 }
      : undefined;

  const frontEdge2mm = { thicknessMm: 2 as const, top: true };
  const allEdge08 = {
    thicknessMm: 0.8 as const,
    top: true,
    bottom: true,
    left: true,
    right: true,
  };

  // Sliding wardrobe reserves 90 mm at the front for double aluminum tracks + overlapping doors
  const trackRecessMm = isSliding ? 90 : 0;

  // 1. Left & Right side walls (full body height)
  parts.push({
    id: uid('cab_side_l'),
    name: `${cfg.name} — Bok lewy`,
    kind: 'panel',
    materialId: cfg.corpusMaterialId,
    width: t,
    height: bodyH,
    depth: D,
    position: [offsetXmm - W / 2 + t / 2, bodyCenterY, offsetZmm],
    rotation: [0, 0, 0],
    grainRotated: true,
    edgeBanding: frontEdge2mm,
    dadoGroove: backGroove,
    system32ShelfHoles: Boolean(cfg.system32Holes),
    groupId,
  });

  parts.push({
    id: uid('cab_side_r'),
    name: `${cfg.name} — Bok prawy`,
    kind: 'panel',
    materialId: cfg.corpusMaterialId,
    width: t,
    height: bodyH,
    depth: D,
    position: [offsetXmm + W / 2 - t / 2, bodyCenterY, offsetZmm],
    rotation: [0, 0, 0],
    grainRotated: true,
    edgeBanding: frontEdge2mm,
    dadoGroove: backGroove,
    system32ShelfHoles: Boolean(cfg.system32Holes),
    groupId,
  });

  // 2. Bottom deck + Top deck (or 2 kitchen upper stretchers / trawersy)
  parts.push({
    id: uid('cab_bottom'),
    name: `${cfg.name} — Wieniec dolny`,
    kind: 'panel',
    materialId: cfg.corpusMaterialId,
    width: innerW,
    height: t,
    depth: D,
    position: [offsetXmm, bodyBottomY + t / 2, offsetZmm],
    rotation: [0, 0, 0],
    edgeBanding: frontEdge2mm,
    dadoGroove: backGroove,
    groupId,
  });

  if (topType === 'stretchers' && !isSliding) {
    const stretcherDepth = Math.min(100, Math.max(70, Math.round(D * 0.2)));
    const topY = bodyBottomY + bodyH - t / 2;
    parts.push({
      id: uid('cab_stretcher_f'),
      name: `${cfg.name} — Trawers górny przedni`,
      kind: 'panel',
      materialId: cfg.corpusMaterialId,
      width: innerW,
      height: t,
      depth: stretcherDepth,
      position: [offsetXmm, topY, offsetZmm + D / 2 - stretcherDepth / 2],
      rotation: [0, 0, 0],
      edgeBanding: frontEdge2mm,
      groupId,
    });
    parts.push({
      id: uid('cab_stretcher_b'),
      name: `${cfg.name} — Trawers górny tylny`,
      kind: 'panel',
      materialId: cfg.corpusMaterialId,
      width: innerW,
      height: t,
      depth: stretcherDepth,
      position: [offsetXmm, topY, offsetZmm - D / 2 + stretcherDepth / 2],
      rotation: [0, 0, 0],
      dadoGroove: backGroove,
      groupId,
    });
  } else {
    parts.push({
      id: uid('cab_top'),
      name: `${cfg.name} — Wieniec górny`,
      kind: 'panel',
      materialId: cfg.corpusMaterialId,
      width: innerW,
      height: t,
      depth: D,
      position: [offsetXmm, bodyBottomY + bodyH - t / 2, offsetZmm],
      rotation: [0, 0, 0],
      edgeBanding: frontEdge2mm,
      dadoGroove: backGroove,
      groupId,
    });
  }

  // 3. Back panel (Dedicated 3 mm white HDF — hdf_white — in dado groove OR nailed behind)
  const backInsetForInterior = cfg.backType === 'hdf_grooved' ? 20 : 0;
  if (cfg.backType === 'hdf_grooved') {
    const hdfW = Math.min(W - 4, innerW + 12);
    const hdfH = Math.min(bodyH - 4, innerH + 12);
    parts.push({
      id: uid('cab_back'),
      name: `${cfg.name} — Plecy HDF 3mm (w nut)`,
      kind: 'panel',
      materialId: 'hdf_white',
      width: hdfW,
      height: hdfH,
      depth: 3,
      position: [offsetXmm, bodyCenterY, offsetZmm - D / 2 + 16],
      rotation: [0, 0, 0],
      groupId,
    });
  } else if (cfg.backType === 'hdf_nailed') {
    parts.push({
      id: uid('cab_back'),
      name: `${cfg.name} — Plecy HDF 3mm`,
      kind: 'panel',
      materialId: 'hdf_white',
      width: W - 4,
      height: bodyH - 4,
      depth: 3,
      position: [offsetXmm, bodyCenterY, offsetZmm - D / 2 - 1.5],
      rotation: [0, 0, 0],
      groupId,
    });
  }

  // 4. Plinth board or 4 adjustable furniture legs
  if (plinthH >= 20 && cfg.plinthStyle === 'plinth_board') {
    parts.push({
      id: uid('cab_plinth_f'),
      name: `${cfg.name} — Cokół przedni`,
      kind: 'panel',
      materialId: cfg.corpusMaterialId,
      width: innerW,
      height: plinthH,
      depth: t,
      position: [offsetXmm, baseY + plinthH / 2, offsetZmm + D / 2 - 40 - t / 2],
      rotation: [0, 0, 0],
      edgeBanding: { thicknessMm: 0.8, top: true, bottom: true },
      groupId,
    });
    parts.push({
      id: uid('cab_plinth_b'),
      name: `${cfg.name} — Cokół tylny`,
      kind: 'panel',
      materialId: cfg.corpusMaterialId,
      width: innerW,
      height: plinthH,
      depth: t,
      position: [offsetXmm, baseY + plinthH / 2, offsetZmm - D / 2 + 40 + t / 2],
      rotation: [0, 0, 0],
      groupId,
    });
  } else if (plinthH >= 20 && cfg.plinthStyle === 'legs') {
    const legSize = 36;
    const insetX = Math.min(70, W * 0.14);
    const insetZ = Math.min(70, D * 0.16);
    const legCoords: [string, number, number][] = [
      ['Nóżka PL', -W / 2 + insetX, D / 2 - insetZ],
      ['Nóżka PP', W / 2 - insetX, D / 2 - insetZ],
      ['Nóżka TL', -W / 2 + insetX, -D / 2 + insetZ],
      ['Nóżka TP', W / 2 - insetX, -D / 2 + insetZ],
    ];
    for (const [label, lx, lz] of legCoords) {
      parts.push({
        id: uid('cab_leg'),
        name: `${cfg.name} — ${label}`,
        kind: 'profile',
        materialId: 'steel_black',
        width: legSize,
        height: plinthH,
        depth: legSize,
        position: [offsetXmm + lx, baseY + plinthH / 2, offsetZmm + lz],
        rotation: [0, 0, 0],
        hardwareTag: 'leg',
        groupId,
      });
    }
  }

  // 5. Optional Wall Filler Strips (Blenda przyścienna — L / P / Oba)
  const fillerW = Math.max(20, Math.min(140, Math.round(cfg.wallFillerWidthMm ?? 45)));
  const fillerZ = offsetZmm + D / 2 - t / 2;
  if (cfg.wallFillerSide === 'left' || cfg.wallFillerSide === 'both') {
    parts.push({
      id: uid('cab_filler_l'),
      name: `${cfg.name} — Blenda przyścienna L`,
      kind: 'panel',
      materialId: cfg.frontMaterialId,
      surfaceFinish: cfg.frontFinish,
      width: fillerW,
      height: bodyH,
      depth: t,
      position: [offsetXmm - W / 2 - fillerW / 2, bodyCenterY, fillerZ],
      rotation: [0, 0, 0],
      edgeBanding: allEdge08,
      hardwareTag: 'wall_filler',
      groupId,
    });
  }
  if (cfg.wallFillerSide === 'right' || cfg.wallFillerSide === 'both') {
    parts.push({
      id: uid('cab_filler_r'),
      name: `${cfg.name} — Blenda przyścienna P`,
      kind: 'panel',
      materialId: cfg.frontMaterialId,
      surfaceFinish: cfg.frontFinish,
      width: fillerW,
      height: bodyH,
      depth: t,
      position: [offsetXmm + W / 2 + fillerW / 2, bodyCenterY, fillerZ],
      rotation: [0, 0, 0],
      edgeBanding: allEdge08,
      hardwareTag: 'wall_filler',
      groupId,
    });
  }

  // Determine hybrid zone split (bottom drawers + upper shelves/rod + upper doors)
  const effectiveDrawerCount = isSliding || isCorner ? 0 : Math.max(0, Math.min(6, Math.round(cfg.drawerCount)));
  const hasUpperZoneContent =
    cfg.shelfCount > 0 || Boolean(cfg.addWardrobeRod) || cfg.doorMode !== 'none';
  const isHybridCabinet = effectiveDrawerCount > 0 && hasUpperZoneContent && bodyH >= 900;

  // Height of bottom drawer zone (in mm inside corpus) vs upper shelf/door zone
  let drawerInteriorZoneH = innerH;
  let upperZoneBottomY = bodyBottomY + t;
  let upperZoneInnerH = innerH;
  let separatorCenterY: number | null = null;

  if (isHybridCabinet) {
    // Bottom ~38-44% reserved for drawers, separated by a full-width horizontal deck
    const rawDrwH = Math.max(
      effectiveDrawerCount * 155,
      Math.min(Math.round(innerH * 0.42), effectiveDrawerCount * 240)
    );
    drawerInteriorZoneH = Math.min(innerH - 360, rawDrwH);
    separatorCenterY = Math.round(bodyBottomY + t + drawerInteriorZoneH + t / 2);
    upperZoneBottomY = separatorCenterY + t / 2;
    upperZoneInnerH = bodyBottomY + bodyH - t - upperZoneBottomY;
  }

  const interiorFrontClearance = isSliding
    ? trackRecessMm + 4
    : cfg.frontType === 'inset'
      ? t + 4
      : 10;
  const interiorDepth = Math.max(120, D - backInsetForInterior - interiorFrontClearance);
  const interiorCenterZ = Math.round(
    offsetZmm - D / 2 + backInsetForInterior + interiorDepth / 2 + 2
  );

  // Add horizontal separator deck in hybrid cabinet
  if (isHybridCabinet && separatorCenterY !== null) {
    parts.push({
      id: uid('cab_sep_deck'),
      name: `${cfg.name} — Wieniec rozdzielający`,
      kind: 'panel',
      materialId: cfg.corpusMaterialId,
      width: innerW,
      height: t,
      depth: interiorDepth,
      position: [offsetXmm, separatorCenterY, interiorCenterZ],
      rotation: [0, 0, 0],
      edgeBanding: frontEdge2mm,
      groupId,
    });
  }

  // 6. Vertical Dividers (0 / 1 / 2) — spanning full innerH or upper zone if hybrid; skipped if non-hybrid full-width drawers fill cabinet
  const dividersCount =
    effectiveDrawerCount > 0 && !isHybridCabinet ? 0 : rawDividersCount;
  const bayCount = dividersCount + 1;
  const bayW = Math.floor((innerW - dividersCount * t) / bayCount);
  const bayCentersX: number[] = [];
  const dividerBottomY = isHybridCabinet ? upperZoneBottomY : bodyBottomY + t;
  const dividerH = isHybridCabinet ? upperZoneInnerH : innerH;

  for (let b = 0; b < bayCount; b++) {
    const leftEdge = offsetXmm - innerW / 2 + b * (bayW + t);
    bayCentersX.push(Math.round(leftEdge + bayW / 2));
    if (b < dividersCount) {
      const divX = Math.round(leftEdge + bayW + t / 2);
      parts.push({
        id: uid(`cab_div_${b + 1}`),
        name: `${cfg.name} — Przegroda pionowa ${b + 1}`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: t,
        height: Math.max(80, Math.round(dividerH)),
        depth: interiorDepth,
        position: [divX, Math.round(dividerBottomY + dividerH / 2), interiorCenterZ],
        rotation: [0, 0, 0],
        grainRotated: true,
        edgeBanding: frontEdge2mm,
        system32ShelfHoles: Boolean(cfg.system32Holes),
        groupId,
      });
    }
  }

  // 7. Internal Shelves + Optional Wardrobe Hanging Rod
  const shelvesActive = cfg.shelfCount > 0 && (effectiveDrawerCount === 0 || isHybridCabinet);
  const wantRod = Boolean(cfg.addWardrobeRod) && upperZoneInnerH >= 750 && interiorDepth >= 380;

  if (shelvesActive || wantRod) {
    // If we have 2+ bays and want a wardrobe rod: Bay 0 gets shelves, last bay gets top shelf + hanging rod!
    for (let b = 0; b < bayCount; b++) {
      const bx = bayCentersX[b];
      const isRodBay = wantRod && (bayCount === 1 || b === bayCount - 1);

      if (isRodBay) {
        // Place 1 upper hat shelf ~320mm from top + chrome oval rod 75mm underneath
        const hatShelfY = Math.round(upperZoneBottomY + upperZoneInnerH - 300);
        if (upperZoneInnerH >= 950) {
          parts.push({
            id: uid(`cab_hat_shelf_${b + 1}`),
            name: `${cfg.name} — Półka górna (nad drążkiem)`,
            kind: 'panel',
            materialId: cfg.corpusMaterialId,
            width: bayW,
            height: t,
            depth: interiorDepth,
            position: [bx, hatShelfY, interiorCenterZ],
            rotation: [0, 0, 0],
            edgeBanding: frontEdge2mm,
            groupId,
          });
        }
        const rodY = upperZoneInnerH >= 950 ? hatShelfY - t / 2 - 70 : Math.round(upperZoneBottomY + upperZoneInnerH - 95);
        parts.push({
          id: uid(`cab_rod_${b + 1}`),
          name: `${cfg.name} — Drążek na wieszaki`,
          kind: 'appliance',
          applianceModel: 'wardrobe_rod',
          appliancePricePln: 55,
          materialId: 'steel_galv',
          width: Math.max(120, bayW - 4),
          height: 32,
          depth: 32,
          position: [bx, rodY, interiorCenterZ],
          rotation: [0, 0, 0],
          groupId,
        });
      } else if (shelvesActive) {
        const slots = cfg.shelfCount + 1;
        const usableH = upperZoneInnerH - cfg.shelfCount * t;
        const clearStep = usableH / slots;
        for (let i = 0; i < cfg.shelfCount; i++) {
          const sy = upperZoneBottomY + clearStep * (i + 1) + t * i + t / 2;
          parts.push({
            id: uid(`cab_shelf_${b + 1}_${i + 1}`),
            name:
              bayCount > 1
                ? `${cfg.name} — Półka ${b + 1}.${i + 1}`
                : `${cfg.name} — Półka ${i + 1}`,
            kind: 'panel',
            materialId: cfg.corpusMaterialId,
            width: bayW,
            height: t,
            depth: interiorDepth,
            position: [bx, Math.round(sy), interiorCenterZ],
            rotation: [0, 0, 0],
            edgeBanding: frontEdge2mm,
            groupId,
          });
        }
      }
    }
  }

  // 8. Full Multi-Part Drawers (with exact Blum/GTV −10 mm + recessed grooved HDF bottom +13 mm OR Ball −26 mm)
  let topDrawerFrontTopY: number | null = null;
  if (effectiveDrawerCount > 0) {
    const dCount = effectiveDrawerCount;
    const isUndermount = cfg.slideType === 'undermount_blum';
    const slideClearanceTotal = isUndermount
      ? 10
      : cfg.slideType === 'ball_26mm'
        ? 26
        : 14;
    const boxOuterW = Math.max(100, innerW - slideClearanceTotal);
    const boxThickness = 16;
    const boxInnerW = Math.max(60, boxOuterW - 2 * boxThickness);
    const boxDepth = Math.max(150, Math.min(500, D - backInsetForInterior - 36));
    const boxCenterZ = Math.round(
      offsetZmm + D / 2 - boxDepth / 2 - (cfg.frontType === 'inset' ? t + 6 : 8)
    );

    const drawerZoneExternalH = isHybridCabinet
      ? drawerInteriorZoneH + t + t / 2 - gap
      : cfg.frontType === 'overlay'
        ? bodyH - gap
        : innerH - gap;
    const eachFrontH = Math.max(
      80,
      Math.floor((drawerZoneExternalH - (dCount - 1) * gap) / dCount)
    );
    const frontW = cfg.frontType === 'overlay' ? W - gap : innerW - gap * 2;
    const frontZ =
      cfg.frontType === 'overlay'
        ? offsetZmm + D / 2 + t / 2 + 1
        : offsetZmm + D / 2 - t / 2 - 1;
    const boxH = Math.max(68, Math.min(eachFrontH - 36, 175));

    const undermountGroove = isUndermount
      ? { enabled: true, edge: 'bottom' as const, insetMm: 13, widthMm: 4, depthMm: 7 }
      : undefined;

    for (let i = 0; i < dCount; i++) {
      const frontBottomY =
        (cfg.frontType === 'overlay'
          ? bodyBottomY + gap / 2
          : bodyBottomY + t + gap / 2) +
        i * (eachFrontH + gap);
      const frontCenterY = Math.round(frontBottomY + eachFrontH / 2);
      topDrawerFrontTopY = frontCenterY + eachFrontH / 2;
      const boxCenterY = Math.round(frontBottomY + 18 + boxH / 2);

      // Drawer Front
      parts.push({
        id: uid(`cab_drw_f_${i + 1}`),
        name: `${cfg.name} — Front szuflady ${i + 1}`,
        kind: 'door',
        materialId: cfg.frontMaterialId,
        surfaceFinish: cfg.frontFinish,
        width: frontW,
        height: eachFrontH,
        depth: t,
        position: [offsetXmm, frontCenterY, frontZ],
        rotation: [0, 0, 0],
        handleSide: 'top',
        handleStyle,
        edgeBanding: allEdge08,
        drawerSlideType: cfg.slideType === 'none' ? 'ball_26mm' : cfg.slideType,
        hardwareTag: 'drawer_front',
        groupId,
      });

      // Drawer Box Left & Right sides
      parts.push({
        id: uid(`cab_drw_l_${i + 1}`),
        name: `${cfg.name} — Szuflada ${i + 1} (bok L)`,
        kind: 'panel',
        materialId: 'birch_plywood',
        width: boxThickness,
        height: boxH,
        depth: boxDepth,
        position: [
          offsetXmm - boxOuterW / 2 + boxThickness / 2,
          boxCenterY,
          boxCenterZ,
        ],
        rotation: [0, 0, 0],
        dadoGroove: undermountGroove,
        hardwareTag: 'drawer_box',
        groupId,
      });
      parts.push({
        id: uid(`cab_drw_r_${i + 1}`),
        name: `${cfg.name} — Szuflada ${i + 1} (bok P)`,
        kind: 'panel',
        materialId: 'birch_plywood',
        width: boxThickness,
        height: boxH,
        depth: boxDepth,
        position: [
          offsetXmm + boxOuterW / 2 - boxThickness / 2,
          boxCenterY,
          boxCenterZ,
        ],
        rotation: [0, 0, 0],
        dadoGroove: undermountGroove,
        hardwareTag: 'drawer_box',
        groupId,
      });

      // Drawer Back & Inner Front Stretcher
      parts.push({
        id: uid(`cab_drw_bk_${i + 1}`),
        name: `${cfg.name} — Szuflada ${i + 1} (tył)`,
        kind: 'panel',
        materialId: 'birch_plywood',
        width: boxInnerW,
        height: boxH,
        depth: boxThickness,
        position: [
          offsetXmm,
          boxCenterY,
          Math.round(boxCenterZ - boxDepth / 2 + boxThickness / 2),
        ],
        rotation: [0, 0, 0],
        dadoGroove: undermountGroove,
        hardwareTag: 'drawer_box',
        groupId,
      });
      parts.push({
        id: uid(`cab_drw_fr_${i + 1}`),
        name: `${cfg.name} — Szuflada ${i + 1} (przód korpusu)`,
        kind: 'panel',
        materialId: 'birch_plywood',
        width: boxInnerW,
        height: boxH,
        depth: boxThickness,
        position: [
          offsetXmm,
          boxCenterY,
          Math.round(boxCenterZ + boxDepth / 2 - boxThickness / 2),
        ],
        rotation: [0, 0, 0],
        dadoGroove: undermountGroove,
        hardwareTag: 'drawer_box',
        groupId,
      });

      // Drawer Bottom (HDF 3 mm): recessed +13 mm up in dado groove for Blum/GTV undermount slides, or nailed underneath for ball slides!
      if (isUndermount) {
        parts.push({
          id: uid(`cab_drw_btm_${i + 1}`),
          name: `${cfg.name} — Szuflada ${i + 1} (dno HDF 3mm w nut +13mm)`,
          kind: 'panel',
          materialId: 'hdf_white',
          width: boxInnerW + 10,
          height: 3,
          depth: boxDepth - 2 * boxThickness + 10,
          position: [
            offsetXmm,
            Math.round(boxCenterY - boxH / 2 + 13),
            boxCenterZ,
          ],
          rotation: [0, 0, 0],
          hardwareTag: 'drawer_box',
          groupId,
        });
      } else {
        parts.push({
          id: uid(`cab_drw_btm_${i + 1}`),
          name: `${cfg.name} — Szuflada ${i + 1} (dno HDF 3mm)`,
          kind: 'panel',
          materialId: 'hdf_white',
          width: boxOuterW - 2,
          height: 3,
          depth: boxDepth - 2,
          position: [
            offsetXmm,
            Math.round(boxCenterY - boxH / 2 - 1.5),
            boxCenterZ,
          ],
          rotation: [0, 0, 0],
          hardwareTag: 'drawer_box',
          groupId,
        });
      }
    }
  }

  // 9. Specialized Doors: (A) Sliding Wardrobe Doors, (B) Blind Corner L Kitchen, or (C) Hinged Doors
  if (isSliding) {
    // Top & bottom double aluminum tracks inside the front 90 mm recess
    const trackDepth = 80;
    const trackCenterZ = offsetZmm + D / 2 - trackDepth / 2 - 4;
    const topTrackH = 38;
    const botTrackH = 14;
    parts.push({
      id: uid('cab_track_top'),
      name: `${cfg.name} — Tor górny aluminiowy`,
      kind: 'profile',
      materialId: 'steel_galv',
      width: innerW,
      height: topTrackH,
      depth: trackDepth,
      position: [
        offsetXmm,
        bodyBottomY + bodyH - t - topTrackH / 2,
        trackCenterZ,
      ],
      rotation: [0, 0, 0],
      groupId,
    });
    parts.push({
      id: uid('cab_track_bot'),
      name: `${cfg.name} — Tor dolny aluminiowy`,
      kind: 'profile',
      materialId: 'steel_galv',
      width: innerW,
      height: botTrackH,
      depth: trackDepth,
      position: [
        offsetXmm,
        bodyBottomY + t + botTrackH / 2,
        trackCenterZ,
      ],
      rotation: [0, 0, 0],
      groupId,
    });

    // Two overlapping sliding doors running on separate parallel Z planes (zero collision!)
    const slidingDoorH = Math.max(200, innerH - topTrackH - botTrackH - 8);
    const slidingDoorCenterY = Math.round(
      bodyBottomY + t + botTrackH + 4 + slidingDoorH / 2
    );
    const overlapMm = 24;
    const slidingDoorW = Math.round(innerW / 2 + overlapMm / 2);
    const travelMm = Math.max(120, Math.round(innerW - slidingDoorW - 10));

    // Left door on rear track (slides right), Right door on front track (slides left)
    const rearTrackZ = Math.round(trackCenterZ - 16);
    const frontTrackZ = Math.round(trackCenterZ + 16);
    parts.push({
      id: uid('cab_sdoor_l'),
      name: `${cfg.name} — Skrzydło przesuwne L (tylny tor)`,
      kind: 'door',
      materialId: cfg.frontMaterialId,
      surfaceFinish: cfg.frontFinish,
      width: slidingDoorW,
      height: slidingDoorH,
      depth: t,
      position: [
        Math.round(offsetXmm - innerW / 2 + slidingDoorW / 2),
        slidingDoorCenterY,
        rearTrackZ,
      ],
      rotation: [0, 0, 0],
      handleSide: 'left',
      handleStyle,
      edgeBanding: allEdge08,
      hardwareTag: 'sliding_door',
      slidingDirection: 'right',
      slidingTravelMm: travelMm,
      groupId,
    });
    parts.push({
      id: uid('cab_sdoor_r'),
      name: `${cfg.name} — Skrzydło przesuwne P (przedni tor)`,
      kind: 'door',
      materialId: cfg.frontMaterialId,
      surfaceFinish: cfg.frontFinish,
      width: slidingDoorW,
      height: slidingDoorH,
      depth: t,
      position: [
        Math.round(offsetXmm + innerW / 2 - slidingDoorW / 2),
        slidingDoorCenterY,
        frontTrackZ,
      ],
      rotation: [0, 0, 0],
      handleSide: 'right',
      handleStyle,
      edgeBanding: allEdge08,
      hardwareTag: 'sliding_door',
      slidingDirection: 'left',
      slidingTravelMm: travelMm,
      groupId,
    });
  } else if (isCorner) {
    // Blind Corner L Kitchen Cabinet: left fixed blind panel + corner filler + right hinged door
    const blindW = Math.max(
      260,
      Math.min(W - 320, Math.round(cfg.cornerBlindWidthMm ?? Math.round(W * 0.52)))
    );
    const doorH = bodyH - gap;
    const frontZ = offsetZmm + D / 2 + t / 2 + 1;
    const cornerFillerW = 55;
    const blindPanelW = Math.max(200, blindW - cornerFillerW - gap);
    const activeDoorW = Math.max(240, W - blindW - gap * 2);

    // Fixed blind panel (left side — concealed behind perpendicular kitchen run)
    parts.push({
      id: uid('cab_corner_blind'),
      name: `${cfg.name} — Ślepy panel narożny`,
      kind: 'panel',
      materialId: cfg.corpusMaterialId,
      width: blindPanelW,
      height: doorH,
      depth: t,
      position: [
        Math.round(offsetXmm - W / 2 + gap / 2 + blindPanelW / 2),
        bodyCenterY,
        frontZ,
      ],
      rotation: [0, 0, 0],
      edgeBanding: allEdge08,
      groupId,
    });

    // Corner front filler strip (blenda narożna 55 mm separating blind zone & hinged door)
    parts.push({
      id: uid('cab_corner_filler'),
      name: `${cfg.name} — Blenda narożna`,
      kind: 'panel',
      materialId: cfg.frontMaterialId,
      surfaceFinish: cfg.frontFinish,
      width: cornerFillerW,
      height: doorH,
      depth: t,
      position: [
        Math.round(offsetXmm - W / 2 + blindW - cornerFillerW / 2),
        bodyCenterY,
        frontZ,
      ],
      rotation: [0, 0, 0],
      edgeBanding: allEdge08,
      hardwareTag: 'wall_filler',
      groupId,
    });

    // Active hinged door on the right opening
    const hingesPerDoor = doorH > 1550 ? 4 : doorH > 950 ? 3 : 2;
    parts.push({
      id: uid('cab_corner_door'),
      name: `${cfg.name} — Front narożny`,
      kind: 'door',
      materialId: cfg.frontMaterialId,
      surfaceFinish: cfg.frontFinish,
      width: activeDoorW,
      height: doorH,
      depth: t,
      position: [
        Math.round(offsetXmm + W / 2 - gap / 2 - activeDoorW / 2),
        bodyCenterY,
        frontZ,
      ],
      rotation: [0, 0, 0],
      handleSide: 'left',
      handleStyle,
      hingeSide: 'right',
      hingeCount: hingesPerDoor,
      edgeBanding: allEdge08,
      hardwareTag: 'door_overlay',
      groupId,
    });
  } else if (cfg.doorMode !== 'none' && (effectiveDrawerCount === 0 || isHybridCabinet)) {
    // Standard hinged doors (either full height, or upper zone cleanly above top drawer front + gap in hybrid mode!)
    const hybridDoorBottomY =
      topDrawerFrontTopY !== null
        ? topDrawerFrontTopY + gap
        : separatorCenterY! - t / 2 + gap;
    const doorH = isHybridCabinet
      ? Math.max(180, Math.round(bodyBottomY + bodyH - gap / 2 - hybridDoorBottomY))
      : cfg.frontType === 'overlay'
        ? bodyH - gap
        : innerH - gap * 2;
    const doorCenterY = isHybridCabinet
      ? Math.round(hybridDoorBottomY + doorH / 2)
      : bodyCenterY;
    const doorZ =
      cfg.frontType === 'overlay'
        ? offsetZmm + D / 2 + t / 2 + 1
        : offsetZmm + D / 2 - t / 2 - 1;
    const hingesPerDoor = doorH > 1550 ? 4 : doorH > 950 ? 3 : 2;
    const hwTag = cfg.frontType === 'overlay' ? 'door_overlay' : 'door_inset';

    if (cfg.doorMode === 'single_left' || cfg.doorMode === 'single_right') {
      const doorW = cfg.frontType === 'overlay' ? W - gap : innerW - gap * 2;
      const isLeftHinged = cfg.doorMode === 'single_left';
      parts.push({
        id: uid('cab_door'),
        name: `${cfg.name} — Front`,
        kind: 'door',
        materialId: cfg.frontMaterialId,
        surfaceFinish: cfg.frontFinish,
        width: doorW,
        height: doorH,
        depth: t,
        position: [offsetXmm, doorCenterY, doorZ],
        rotation: [0, 0, 0],
        handleSide: isLeftHinged ? 'right' : 'left',
        handleStyle,
        hingeSide: isLeftHinged ? 'left' : 'right',
        hingeCount: hingesPerDoor,
        edgeBanding: allEdge08,
        hardwareTag: hwTag,
        groupId,
      });
    } else if (cfg.doorMode === 'double') {
      const totalSpan = cfg.frontType === 'overlay' ? W - gap : innerW - gap * 2;
      const doorW = Math.floor((totalSpan - gap) / 2);
      const dx = doorW / 2 + gap / 2;
      parts.push({
        id: uid('cab_door_l'),
        name: `${cfg.name} — Front lewy`,
        kind: 'door',
        materialId: cfg.frontMaterialId,
        surfaceFinish: cfg.frontFinish,
        width: doorW,
        height: doorH,
        depth: t,
        position: [offsetXmm - dx, doorCenterY, doorZ],
        rotation: [0, 0, 0],
        handleSide: 'right',
        handleStyle,
        hingeSide: 'left',
        hingeCount: hingesPerDoor,
        edgeBanding: allEdge08,
        hardwareTag: hwTag,
        groupId,
      });
      parts.push({
        id: uid('cab_door_r'),
        name: `${cfg.name} — Front prawy`,
        kind: 'door',
        materialId: cfg.frontMaterialId,
        surfaceFinish: cfg.frontFinish,
        width: doorW,
        height: doorH,
        depth: t,
        position: [offsetXmm + dx, doorCenterY, doorZ],
        rotation: [0, 0, 0],
        handleSide: 'left',
        handleStyle,
        hingeSide: 'right',
        hingeCount: hingesPerDoor,
        edgeBanding: allEdge08,
        hardwareTag: hwTag,
        groupId,
      });
    }
  }

  // 10. Optional 38mm Kitchen Countertop
  if (cfg.addCountertop) {
    const topH = 38;
    const overhangFront = 25;
    const topDepth = D + overhangFront;
    const leftFillerExtra =
      cfg.wallFillerSide === 'left' || cfg.wallFillerSide === 'both' ? fillerW : 0;
    const rightFillerExtra =
      cfg.wallFillerSide === 'right' || cfg.wallFillerSide === 'both' ? fillerW : 0;
    const topW = W + 4 + leftFillerExtra + rightFillerExtra;
    const topCenterX = offsetXmm + (rightFillerExtra - leftFillerExtra) / 2;
    parts.push({
      id: uid('cab_countertop'),
      name: `${cfg.name} — Blat 38 mm`,
      kind: 'countertop',
      materialId: cfg.countertopMaterialId,
      width: topW,
      height: topH,
      depth: topDepth,
      position: [topCenterX, bodyBottomY + bodyH + topH / 2, offsetZmm + overhangFront / 2],
      rotation: [0, 0, 0],
      edgeBanding: { thicknessMm: 2, top: true, left: true, right: true },
      groupId,
    });
  }

  // 11. Automatically attach physically verified fasteners to the new cabinet
  const fasteners = cfg.autoFasteners
    ? autoDetectJointFasteners(parts, [], cfg.fastenerType)
    : [];

  return { parts, fasteners, groupId };
}

/**
 * Computes the overall bounding box dimensions of a named group in mm.
 */
export function getGroupBoundingSizeMm(
  parts: FurniturePart[],
  groupId: string
): {
  width: number;
  height: number;
  depth: number;
  count: number;
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
} | null {
  const members = parts.filter((p) => p.groupId === groupId);
  if (members.length === 0) return null;

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const p of members) {
    const b = getPartWorldBox(p);
    minX = Math.min(minX, b.minX);
    minY = Math.min(minY, b.minY);
    minZ = Math.min(minZ, b.minZ);
    maxX = Math.max(maxX, b.maxX);
    maxY = Math.max(maxY, b.maxY);
    maxZ = Math.max(maxZ, b.maxZ);
  }

  return {
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    depth: Math.round(maxZ - minZ),
    count: members.length,
    minX,
    minY,
    minZ,
    maxX,
    maxY,
    maxZ,
  };
}

/**
 * Commercial Smart Resize for any grouped cabinet or assembly (like PRO100 / Polyboard):
 * Resizes the entire group to targetW × targetH × targetD while PRESERVING real board
 * thicknesses (e.g. 18 mm walls & 3 mm backs stay 18 mm / 3 mm!) and stretching spans
 * proportionally, keeping the bottom anchored on Y = minY and resyncing all fasteners live!
 */
export function smartResizeGroup(
  parts: FurniturePart[],
  fasteners: Fastener[],
  groupId: string,
  targetW: number,
  targetH: number,
  targetD: number
): { parts: FurniturePart[]; fasteners: Fastener[] } {
  const bounds = getGroupBoundingSizeMm(parts, groupId);
  if (!bounds || bounds.count === 0) return { parts, fasteners };

  const oldW = Math.max(40, bounds.maxX - bounds.minX);
  const oldH = Math.max(40, bounds.maxY - bounds.minY);
  const oldD = Math.max(40, bounds.maxZ - bounds.minZ);

  const newW = Math.max(120, Math.round(targetW));
  const newH = Math.max(120, Math.round(targetH));
  const newD = Math.max(120, Math.round(targetD));

  const dW = newW - oldW;
  const dH = newH - oldH;
  const dD = newD - oldD;
  if (Math.abs(dW) < 0.5 && Math.abs(dH) < 0.5 && Math.abs(dD) < 0.5) {
    return { parts, fasteners };
  }

  const centerX = (bounds.minX + bounds.maxX) / 2;
  const baseY = bounds.minY;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2;
  const changedIds = new Set<string>();

  const nextParts = parts.map((p) => {
    if (p.groupId !== groupId) return p;
    changedIds.add(p.id);

    const isThinX = p.width <= 42 && p.width < p.height && p.width < p.depth;
    const isThinY = p.height <= 42 && p.height < p.width && p.height < p.depth;
    const isThinZ = p.depth <= 42 && p.depth < p.width && p.depth < p.height;
    const isProfileLeg =
      p.hardwareTag === 'leg' ||
      (p.kind === 'profile' && p.width <= 60 && p.depth <= 60);

    let nextW = p.width;
    let nextX = p.position[0];
    if (isThinX || isProfileLeg) {
      const rel = (p.position[0] - centerX) / (oldW / 2);
      nextX = centerX + rel * (newW / 2);
      if (Math.abs(p.position[0] - p.width / 2 - bounds.minX) < 3) {
        nextX = centerX - newW / 2 + p.width / 2;
      } else if (Math.abs(p.position[0] + p.width / 2 - bounds.maxX) < 3) {
        nextX = centerX + newW / 2 - p.width / 2;
      }
    } else if (p.width >= oldW * 0.72) {
      nextW = Math.max(40, Math.round(p.width + dW));
      nextX = centerX + (p.position[0] - centerX);
    } else {
      const ratioX = newW / oldW;
      nextW = Math.max(40, Math.round(p.width * ratioX));
      nextX = centerX + (p.position[0] - centerX) * ratioX;
    }

    let nextH = p.height;
    let nextY = p.position[1];
    if (isThinY) {
      const relY = (p.position[1] - baseY) / oldH;
      nextY = baseY + relY * newH;
      if (Math.abs(p.position[1] - p.height / 2 - baseY) < 3) {
        nextY = baseY + p.height / 2;
      } else if (Math.abs(p.position[1] + p.height / 2 - bounds.maxY) < 3) {
        nextY = baseY + newH - p.height / 2;
      }
    } else if (isProfileLeg || p.name.toLowerCase().includes('cokół')) {
      nextH = p.height;
      nextY = p.position[1];
    } else if (p.height >= oldH * 0.65) {
      nextH = Math.max(40, Math.round(p.height + dH));
      nextY = p.position[1] + dH / 2;
    } else {
      const ratioY = newH / oldH;
      nextH = Math.max(40, Math.round(p.height * ratioY));
      nextY = baseY + (p.position[1] - baseY) * ratioY;
    }

    let nextD = p.depth;
    let nextZ = p.position[2];
    if (isThinZ || isProfileLeg) {
      const relZ = (p.position[2] - centerZ) / (oldD / 2);
      nextZ = centerZ + relZ * (newD / 2);
      if (Math.abs(p.position[2] - p.depth / 2 - bounds.minZ) < 3) {
        nextZ = centerZ - newD / 2 + p.depth / 2;
      } else if (Math.abs(p.position[2] + p.depth / 2 - bounds.maxZ) < 3) {
        nextZ = centerZ + newD / 2 - p.depth / 2;
      }
    } else if (p.depth >= oldD * 0.68) {
      nextD = Math.max(60, Math.round(p.depth + dD));
      nextZ = centerZ + (p.position[2] - centerZ);
    } else {
      const ratioZ = newD / oldD;
      nextD = Math.max(60, Math.round(p.depth * ratioZ));
      nextZ = centerZ + (p.position[2] - centerZ) * ratioZ;
    }

    return {
      ...p,
      width: Math.round(nextW),
      height: Math.round(nextH),
      depth: Math.round(nextD),
      position: [
        Math.round(nextX * 10) / 10,
        Math.max(Math.round(nextH / 2), Math.round(nextY * 10) / 10),
        Math.round(nextZ * 10) / 10,
      ] as [number, number, number],
    };
  });

  const synced = syncFastenersWithParts(parts, nextParts, fasteners, changedIds);
  return { parts: nextParts, fasteners: synced.fasteners };
}
