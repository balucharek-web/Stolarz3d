import {
  DrawerSlideType,
  Fastener,
  FurniturePart,
  MaterialId,
  ScrewType,
  SurfaceFinish,
} from '../types/furniture';
import { autoDetectJointFasteners } from './geometry';
import { getPartWorldBox, syncFastenersWithParts } from './carpentry';

export type CabinetPresetId =
  | 'base_kitchen'
  | 'wall_cabinet'
  | 'drawer_chest'
  | 'wardrobe'
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
  shelfCount: number;
  drawerCount: number;
  doorMode: 'none' | 'single_left' | 'single_right' | 'double';
  frontType: 'overlay' | 'inset';
  frontGapMm: number;
  backType: 'hdf_grooved' | 'hdf_nailed' | 'none';
  slideType: DrawerSlideType;
  corpusMaterialId: MaterialId;
  frontMaterialId: MaterialId;
  frontFinish: SurfaceFinish;
  addCountertop: boolean;
  countertopMaterialId: MaterialId;
  autoFasteners: boolean;
  fastenerType: ScrewType;
}

export const CABINET_PRESETS: Record<CabinetPresetId, { label: string; desc: string; config: ParametricCabinetConfig }> = {
  base_kitchen: {
    label: 'Szafka dolna kuchenna',
    desc: '800 × 820 × 560 mm · Cokół 100 mm, blat, 2 fronty',
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
      shelfCount: 1,
      drawerCount: 0,
      doorMode: 'double',
      frontType: 'overlay',
      frontGapMm: 3,
      backType: 'hdf_grooved',
      slideType: 'ball_26mm',
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
    desc: '900 × 860 × 450 mm · 4 szuflady z prowadnicami',
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
      shelfCount: 0,
      drawerCount: 4,
      doorMode: 'none',
      frontType: 'overlay',
      frontGapMm: 3,
      backType: 'hdf_grooved',
      slideType: 'undermount_blum',
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
    desc: '800 × 720 × 320 mm · Podwieszana, 2 półki, połysk',
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
      shelfCount: 2,
      drawerCount: 0,
      doorMode: 'double',
      frontType: 'overlay',
      frontGapMm: 3,
      backType: 'hdf_grooved',
      slideType: 'none',
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
    label: 'Szafa / Regał wysoki',
    desc: '1000 × 2100 × 580 mm · 4 półki, 2 szuflady, fronty',
    config: {
      name: 'Szafa 100',
      preset: 'wardrobe',
      widthMm: 1000,
      heightMm: 2100,
      depthMm: 580,
      boardThicknessMm: 18,
      plinthHeightMm: 80,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      shelfCount: 4,
      drawerCount: 0,
      doorMode: 'double',
      frontType: 'overlay',
      frontGapMm: 3,
      backType: 'hdf_grooved',
      slideType: 'ball_26mm',
      corpusMaterialId: 'oak_craft',
      frontMaterialId: 'white_matte',
      frontFinish: 'satin',
      addCountertop: false,
      countertopMaterialId: 'oak_craft',
      autoFasteners: true,
      fastenerType: 'confirmat_7x50',
    },
  },
  tv_console: {
    label: 'Szafka RTV niska',
    desc: '1600 × 480 × 420 mm · Nóżki, 2 szuflady, połysk',
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
      shelfCount: 1,
      drawerCount: 2,
      doorMode: 'none',
      frontType: 'overlay',
      frontGapMm: 3,
      backType: 'hdf_grooved',
      slideType: 'undermount_blum',
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
 * Generates a collision-free, workshop-accurate parametric cabinet assembly
 * (sides, top/bottom, shelves, grooved/nailed HDF back, plinth/legs, doors with Ø35mm cup hinges,
 * full multi-part drawers with slide clearance, optional countertop, and synchronized fasteners).
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
  const plinthH = cfg.plinthStyle === 'none' ? 0 : Math.max(0, Math.min(200, Math.round(cfg.plinthHeightMm)));
  const baseY = Math.max(0, Math.round(cfg.elevationYmm));
  const bodyH = Math.max(160, H - plinthH);
  const innerW = Math.max(120, W - 2 * t);
  const innerH = Math.max(100, bodyH - 2 * t);
  const gap = Math.max(1, Math.min(6, Math.round(cfg.frontGapMm)));

  const groupId = `${cfg.name.trim() || 'Szafka'} #${Math.floor(10 + Math.random() * 89)}`;
  const bodyBottomY = baseY + plinthH;
  const bodyCenterY = bodyBottomY + bodyH / 2;

  const backGroove =
    cfg.backType === 'hdf_grooved'
      ? { enabled: true, edge: 'back' as const, insetMm: 16, widthMm: 4, depthMm: 8 }
      : undefined;

  const frontEdge2mm = { thicknessMm: 2 as const, top: true };
  const allEdge08 = { thicknessMm: 0.8 as const, top: true, bottom: true, left: true, right: true };

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
    groupId,
  });

  // 2. Bottom & Top decks (between sides — classic European cabinet construction)
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

  // 3. Back panel (HDF 4mm in dado groove OR nailed behind)
  const backInsetForInterior = cfg.backType === 'hdf_grooved' ? 20 : cfg.backType === 'hdf_nailed' ? 0 : 0;
  if (cfg.backType === 'hdf_grooved') {
    const hdfW = innerW + 12; // sits 6mm into each side groove
    const hdfH = innerH + 12;
    parts.push({
      id: uid('cab_back'),
      name: `${cfg.name} — Plecy HDF 4mm (w nut)`,
      kind: 'panel',
      materialId: 'birch_plywood',
      width: Math.min(W - 4, hdfW),
      height: Math.min(bodyH - 4, hdfH),
      depth: 4,
      position: [offsetXmm, bodyCenterY, offsetZmm - D / 2 + 16],
      rotation: [0, 0, 0],
      groupId,
    });
  } else if (cfg.backType === 'hdf_nailed') {
    parts.push({
      id: uid('cab_back'),
      name: `${cfg.name} — Plecy HDF 4mm`,
      kind: 'panel',
      materialId: 'birch_plywood',
      width: W - 4,
      height: bodyH - 4,
      depth: 4,
      position: [offsetXmm, bodyCenterY, offsetZmm - D / 2 - 2],
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

  // 5. Internal shelves (if drawerCount === 0, divide entire height; otherwise place in upper zone if needed)
  const shelfDepth = Math.max(120, D - backInsetForInterior - (cfg.frontType === 'inset' ? t + 4 : 12));
  const shelfCenterZ = offsetZmm - D / 2 + backInsetForInterior + shelfDepth / 2 + 2;

  if (cfg.shelfCount > 0 && cfg.drawerCount === 0) {
    const slots = cfg.shelfCount + 1;
    const usableH = innerH - cfg.shelfCount * t;
    const clearStep = usableH / slots;
    for (let i = 0; i < cfg.shelfCount; i++) {
      const sy = bodyBottomY + t + clearStep * (i + 1) + t * i + t / 2;
      parts.push({
        id: uid(`cab_shelf_${i + 1}`),
        name: `${cfg.name} — Półka ${i + 1}`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: t,
        depth: shelfDepth,
        position: [offsetXmm, Math.round(sy), Math.round(shelfCenterZ)],
        rotation: [0, 0, 0],
        edgeBanding: frontEdge2mm,
        groupId,
      });
    }
  }

  // 6. Full multi-part drawers with exact slide clearance (Ball-bearing 26mm or Blum/GTV undermount 10mm)
  if (cfg.drawerCount > 0) {
    const dCount = Math.max(1, Math.min(6, Math.round(cfg.drawerCount)));
    const slideClearanceTotal =
      cfg.slideType === 'undermount_blum' ? 10 : cfg.slideType === 'ball_26mm' ? 26 : 14;
    const boxOuterW = Math.max(100, innerW - slideClearanceTotal);
    const boxThickness = 16;
    const boxInnerW = Math.max(60, boxOuterW - 2 * boxThickness);
    const boxDepth = Math.max(150, Math.min(500, D - backInsetForInterior - 35));
    const boxCenterZ = offsetZmm + D / 2 - boxDepth / 2 - (cfg.frontType === 'inset' ? t + 6 : 8);

    const totalFrontZoneH = cfg.frontType === 'overlay' ? bodyH - gap : innerH - gap;
    const eachFrontH = Math.max(80, Math.floor((totalFrontZoneH - (dCount - 1) * gap) / dCount));
    const frontW = cfg.frontType === 'overlay' ? W - gap : innerW - gap * 2;
    const frontZ =
      cfg.frontType === 'overlay'
        ? offsetZmm + D / 2 + t / 2 + 1
        : offsetZmm + D / 2 - t / 2 - 1;
    const boxH = Math.max(65, Math.min(eachFrontH - 36, 175));

    for (let i = 0; i < dCount; i++) {
      const frontBottomY =
        (cfg.frontType === 'overlay' ? bodyBottomY + gap / 2 : bodyBottomY + t + gap / 2) +
        i * (eachFrontH + gap);
      const frontCenterY = Math.round(frontBottomY + eachFrontH / 2);
      const boxCenterY = Math.round(frontBottomY + 18 + boxH / 2);

      // Drawer Front (tagged with drawerSlideType for Hardware BOM!)
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
        position: [offsetXmm - boxOuterW / 2 + boxThickness / 2, boxCenterY, Math.round(boxCenterZ)],
        rotation: [0, 0, 0],
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
        position: [offsetXmm + boxOuterW / 2 - boxThickness / 2, boxCenterY, Math.round(boxCenterZ)],
        rotation: [0, 0, 0],
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
        position: [offsetXmm, boxCenterY, Math.round(boxCenterZ - boxDepth / 2 + boxThickness / 2)],
        rotation: [0, 0, 0],
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
        position: [offsetXmm, boxCenterY, Math.round(boxCenterZ + boxDepth / 2 - boxThickness / 2)],
        rotation: [0, 0, 0],
        hardwareTag: 'drawer_box',
        groupId,
      });

      // Drawer Bottom (HDF 4mm)
      parts.push({
        id: uid(`cab_drw_btm_${i + 1}`),
        name: `${cfg.name} — Szuflada ${i + 1} (dno HDF)`,
        kind: 'panel',
        materialId: 'birch_plywood',
        width: boxOuterW - 2,
        height: 4,
        depth: boxDepth - 2,
        position: [offsetXmm, Math.round(boxCenterY - boxH / 2 - 2), Math.round(boxCenterZ)],
        rotation: [0, 0, 0],
        hardwareTag: 'drawer_box',
        groupId,
      });
    }
  }

  // 7. Cabinet Doors with exact overlay/inset gap math & Ø35 mm cup hinges
  if (cfg.doorMode !== 'none' && cfg.drawerCount === 0) {
    const doorH = cfg.frontType === 'overlay' ? bodyH - gap : innerH - gap * 2;
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
        position: [offsetXmm, bodyCenterY, doorZ],
        rotation: [0, 0, 0],
        handleSide: isLeftHinged ? 'right' : 'left',
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
        position: [offsetXmm - dx, bodyCenterY, doorZ],
        rotation: [0, 0, 0],
        handleSide: 'right',
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
        position: [offsetXmm + dx, bodyCenterY, doorZ],
        rotation: [0, 0, 0],
        handleSide: 'left',
        hingeSide: 'right',
        hingeCount: hingesPerDoor,
        edgeBanding: allEdge08,
        hardwareTag: hwTag,
        groupId,
      });
    }
  }

  // 8. Optional 38mm Kitchen Countertop
  if (cfg.addCountertop) {
    const topH = 38;
    const overhangFront = 25;
    const topDepth = D + overhangFront;
    parts.push({
      id: uid('cab_countertop'),
      name: `${cfg.name} — Blat 38 mm`,
      kind: 'countertop',
      materialId: cfg.countertopMaterialId,
      width: W + 4,
      height: topH,
      depth: topDepth,
      position: [offsetXmm, bodyBottomY + bodyH + topH / 2, offsetZmm + overhangFront / 2],
      rotation: [0, 0, 0],
      edgeBanding: { thicknessMm: 2, top: true, left: true, right: true },
      groupId,
    });
  }

  // 9. Automatically attach physically verified fasteners to the new cabinet
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
 * thicknesses (e.g. 18 mm walls & 4 mm backs stay 18 mm / 4 mm!) and stretching spans
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

    // Heuristic for which dimensions are structural board thickness (stay FIXED) vs span (stretch)
    const isThinX = p.width <= 42 && p.width < p.height && p.width < p.depth;
    const isThinY = p.height <= 42 && p.height < p.width && p.height < p.depth;
    const isThinZ = p.depth <= 42 && p.depth < p.width && p.depth < p.height;
    const isProfileLeg = p.hardwareTag === 'leg' || (p.kind === 'profile' && p.width <= 60 && p.depth <= 60);

    // X axis resize (centered around centerX)
    let nextW = p.width;
    let nextX = p.position[0];
    if (isThinX || isProfileLeg) {
      // Shift proportionally relative to centerX without distorting board thickness
      const rel = (p.position[0] - centerX) / (oldW / 2);
      nextX = centerX + rel * (newW / 2);
      // Snap outer flush walls cleanly so they touch exact new outer faces
      if (Math.abs(p.position[0] - p.width / 2 - bounds.minX) < 3) {
        nextX = centerX - newW / 2 + p.width / 2;
      } else if (Math.abs(p.position[0] + p.width / 2 - bounds.maxX) < 3) {
        nextX = centerX + newW / 2 - p.width / 2;
      }
    } else if (p.width >= oldW * 0.72) {
      // Full-span board (shelves, top/bottom, back, single door, countertop): add exact dW!
      nextW = Math.max(40, Math.round(p.width + dW));
      nextX = centerX + (p.position[0] - centerX);
    } else {
      // Split-span board (e.g. double doors): scale width and offset proportionally
      const ratioX = newW / oldW;
      nextW = Math.max(40, Math.round(p.width * ratioX));
      nextX = centerX + (p.position[0] - centerX) * ratioX;
    }

    // Y axis resize (anchored at bottom = baseY)
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
      // Keep plinth/leg height fixed and anchored at floor!
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

    // Z axis resize (centered around centerZ)
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
