import {
  CabinetPlacementMode,
  CabinetPresetId,
  DrawerSlideType,
  Fastener,
  FurniturePart,
  HandleStyle,
  MaterialId,
  ParametricCabinetConfig,
  RoomConfig,
  ScrewType,
  SurfaceFinish,
} from '../types/furniture';
import { autoDetectJointFasteners } from './geometry';
import { getPartWorldBox, syncFastenersWithParts } from './carpentry';

export type { CabinetPlacementMode, CabinetPresetId, ParametricCabinetConfig };

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
      verticalDividers: 1,
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
      addLedGroove: true,
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
      verticalDividers: 2,
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
      verticalDividers: 1,
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
  steel_rack: {
    label: 'Regał stal + OSB/drewno',
    desc: '1500 × 1900 × 500 mm · Profile stalowe 40×40, półki 22 mm, śruby M8',
    config: {
      name: 'Regał stalowy 150',
      preset: 'steel_rack',
      widthMm: 1500,
      heightMm: 1900,
      depthMm: 500,
      boardThicknessMm: 22,
      plinthHeightMm: 100,
      elevationYmm: 0,
      plinthStyle: 'none',
      topType: 'full_panel',
      verticalDividers: 1,
      shelfCount: 4,
      drawerCount: 0,
      doorMode: 'none',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'bar',
      backType: 'none',
      slideType: 'none',
      wallFillerSide: 'none',
      wallFillerWidthMm: 45,
      system32Holes: false,
      addWardrobeRod: false,
      corpusMaterialId: 'osb3',
      frontMaterialId: 'steel_black',
      frontFinish: 'matte',
      addCountertop: false,
      countertopMaterialId: 'osb3',
      autoFasteners: true,
      fastenerType: 'bolt_m8',
    },
  },
  oven_tower: {
    label: 'Słupek piekarnik AGD',
    desc: '600 × 2100 × 580 mm · Piekarnik 60, komin wentylacyjny 50 mm, szafki',
    config: {
      name: 'Słupek piekarnik 60',
      preset: 'oven_tower',
      widthMm: 600,
      heightMm: 2100,
      depthMm: 580,
      boardThicknessMm: 18,
      plinthHeightMm: 100,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      topType: 'full_panel',
      verticalDividers: 0,
      shelfCount: 2,
      drawerCount: 0,
      doorMode: 'single_left',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'bar',
      backType: 'hdf_grooved',
      slideType: 'none',
      wallFillerSide: 'none',
      wallFillerWidthMm: 45,
      system32Holes: true,
      addWardrobeRod: false,
      corpusMaterialId: 'white_matte',
      frontMaterialId: 'oak_craft',
      frontFinish: 'satin',
      addCountertop: false,
      countertopMaterialId: 'concrete_top',
      autoFasteners: true,
      fastenerType: 'confirmat_7x50',
    },
  },
  sink_cabinet: {
    label: 'Szafka pod zlew',
    desc: '800 × 820 × 560 mm · Pionowy trawers tylny, syfon, zlew + wycięcie',
    config: {
      name: 'Szafka pod zlew 80',
      preset: 'sink_cabinet',
      widthMm: 800,
      heightMm: 820,
      depthMm: 560,
      boardThicknessMm: 18,
      plinthHeightMm: 100,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      topType: 'stretchers',
      verticalDividers: 0,
      shelfCount: 0,
      drawerCount: 0,
      doorMode: 'double',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'gola_j',
      backType: 'none',
      slideType: 'none',
      wallFillerSide: 'none',
      wallFillerWidthMm: 45,
      system32Holes: false,
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
  dishwasher_bay: {
    label: 'Zabudowa zmywarki',
    desc: '600 × 820 × 560 mm · Front zmywarki, cofnięty cokół, blat i bok',
    config: {
      name: 'Zmywarka 60',
      preset: 'dishwasher_bay',
      widthMm: 600,
      heightMm: 820,
      depthMm: 560,
      boardThicknessMm: 18,
      plinthHeightMm: 100,
      elevationYmm: 0,
      plinthStyle: 'plinth_board',
      topType: 'stretchers',
      verticalDividers: 0,
      shelfCount: 0,
      drawerCount: 0,
      doorMode: 'single_left',
      frontType: 'overlay',
      frontGapMm: 3,
      handleStyle: 'gola_j',
      backType: 'none',
      slideType: 'none',
      wallFillerSide: 'none',
      wallFillerWidthMm: 45,
      system32Holes: false,
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
  offsetZmm = 0,
  existingGroupId?: string
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
  const gap = Math.max(1, Math.min(6, Math.round(cfg.frontGapMm)));
  const isSliding = cfg.preset === 'sliding_wardrobe';
  const isCorner = cfg.preset === 'corner_l';
  const topType = cfg.topType ?? 'full_panel';
  const handleStyle: HandleStyle = cfg.handleStyle ?? 'bar';
  const rawDividersCount = isCorner
    ? 0
    : (Math.max(0, Math.min(2, Math.round(cfg.verticalDividers ?? 0))) as 0 | 1 | 2);
  const effectiveDrawerCount =
    isSliding || isCorner ? 0 : Math.max(0, Math.min(6, Math.round(cfg.drawerCount)));
  const hasUpperZoneContent =
    cfg.shelfCount > 0 || Boolean(cfg.addWardrobeRod) || cfg.doorMode !== 'none';
  const isHybridCabinet = effectiveDrawerCount > 0 && hasUpperZoneContent && bodyH >= 900;
  // Wide commodes & RTV consoles (bay clear span >= 750 mm) use a reinforced 28 mm top deck so it never sags under load
  const topBayClearSpan = Math.floor((innerW - rawDividersCount * t) / (rawDividersCount + 1));
  const topDeckT =
    !isHybridCabinet &&
    effectiveDrawerCount > 0 &&
    topType === 'full_panel' &&
    topBayClearSpan >= 750
      ? Math.max(t, 28)
      : t;
  const innerH = Math.max(100, bodyH - t - topDeckT);

  const groupId =
    existingGroupId ?? `${cfg.name.trim() || 'Szafka'} #${Math.floor(10 + Math.random() * 89)}`;

  // Dedicated Industrial Steel-Frame + Wood/OSB Rack Generator
  if (cfg.preset === 'steel_rack') {
    const postSize = 40;
    const bayCount = (Math.max(0, Math.min(2, Math.round(cfg.verticalDividers ?? 1))) + 1) as 1 | 2 | 3;
    const postPairs = bayCount + 1;
    const totalClearW = Math.max(200 * bayCount, W - postPairs * postSize);
    const bayW = Math.floor(totalClearW / bayCount);
    const actualW = postPairs * postSize + bayCount * bayW;
    const steelMat: MaterialId =
      cfg.frontMaterialId === 'steel_galv' || cfg.frontMaterialId === 'steel_black'
        ? cfg.frontMaterialId
        : 'steel_black';
    const postFrontZ = offsetZmm + D / 2 - postSize / 2;
    const postBackZ = offsetZmm - D / 2 + postSize / 2;

    // 1. Vertical steel corner & intermediate posts (front + back pairs)
    for (let p = 0; p < postPairs; p++) {
      const px = Math.round(offsetXmm - actualW / 2 + postSize / 2 + p * (bayW + postSize));
      const label =
        p === 0 ? 'lewy' : p === postPairs - 1 ? 'prawy' : `środek ${p}`;
      parts.push(
        {
          id: uid(`rack_post_f_${p + 1}`),
          name: `${cfg.name} — Słupek stalowy ${label} przód`,
          kind: 'profile',
          materialId: steelMat,
          width: postSize,
          height: H,
          depth: postSize,
          position: [px, baseY + H / 2, postFrontZ],
          rotation: [0, 0, 0],
          groupId,
        },
        {
          id: uid(`rack_post_b_${p + 1}`),
          name: `${cfg.name} — Słupek stalowy ${label} tył`,
          kind: 'profile',
          materialId: steelMat,
          width: postSize,
          height: H,
          depth: postSize,
          position: [px, baseY + H / 2, postBackZ],
          rotation: [0, 0, 0],
          groupId,
        }
      );
    }

    // 2. Shelves across each bay (bottom deck + top deck + cfg.shelfCount intermediate shelves, or min 2 levels)
    const totalLevels = Math.max(2, Math.min(8, Math.round(cfg.shelfCount) + 1));
    const bottomShelfY = baseY + Math.max(80, Math.min(200, Math.round(cfg.plinthHeightMm || 100))) + t / 2;
    const topShelfY = baseY + H - t / 2;
    const levelSpan = Math.max(120, topShelfY - bottomShelfY);

    for (let b = 0; b < bayCount; b++) {
      const bx = Math.round(
        offsetXmm - actualW / 2 + postSize + b * (bayW + postSize) + bayW / 2
      );
      for (let lv = 0; lv < totalLevels; lv++) {
        const sy =
          totalLevels === 1
            ? bottomShelfY
            : Math.round(bottomShelfY + (lv / (totalLevels - 1)) * levelSpan);
        parts.push({
          id: uid(`rack_shelf_${b + 1}_${lv + 1}`),
          name:
            bayCount > 1
              ? `${cfg.name} — Półka ${b + 1}.${lv + 1}`
              : `${cfg.name} — Półka ${lv + 1}`,
          kind: 'panel',
          materialId: cfg.corpusMaterialId,
          width: bayW,
          height: t,
          depth: D,
          position: [bx, sy, offsetZmm],
          rotation: [0, 0, 0],
          groupId,
        });
      }

      // Optional rear OSB/wood stiffening panel per bay (fits standard sheets cleanly)
      if (cfg.backType !== 'none') {
        const backThick = 18;
        const panelW = bayW + postSize;
        parts.push({
          id: uid(`rack_back_${b + 1}`),
          name: `${cfg.name} — Plecy tylne sekcja ${b + 1}`,
          kind: 'panel',
          materialId: cfg.corpusMaterialId,
          width: panelW,
          height: H,
          depth: backThick,
          position: [bx, baseY + H / 2, offsetZmm - D / 2 - backThick / 2],
          rotation: [0, 0, 0],
          groupId,
        });
      }
    }

    const rackFasteners = cfg.autoFasteners
      ? autoDetectJointFasteners(parts, [], 'bolt_m8')
      : [];
    return { parts, fasteners: rackFasteners, groupId };
  }

  // Dedicated Built-In Kitchen AGD Module 1: High Oven Tower with 50 mm rear ventilation chimney
  if (cfg.preset === 'oven_tower') {
    const bodyBottomY = baseY + plinthH;
    const bodyCenterY = bodyBottomY + bodyH / 2;
    const ventGapMm = 50; // Mandatory 50 mm rear air chimney behind built-in oven
    const shelfDepth = Math.max(420, D - ventGapMm);
    const shelfZ = Math.round(offsetZmm + ventGapMm / 2);
    const frontEdge2 = { thicknessMm: 2 as const, top: true };
    const allEdge08Oven = { thicknessMm: 0.8 as const, top: true, bottom: true, left: true, right: true };

    // Sides, Bottom, Top (top also recessed 35 mm at rear or full depth with vent clearance behind oven)
    parts.push(
      {
        id: uid('oven_side_l'),
        name: `${cfg.name} — Bok lewy`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: t,
        height: bodyH,
        depth: D,
        position: [offsetXmm - W / 2 + t / 2, bodyCenterY, offsetZmm],
        rotation: [0, 0, 0],
        grainRotated: true,
        edgeBanding: frontEdge2,
        system32ShelfHoles: Boolean(cfg.system32Holes),
        groupId,
      },
      {
        id: uid('oven_side_r'),
        name: `${cfg.name} — Bok prawy`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: t,
        height: bodyH,
        depth: D,
        position: [offsetXmm + W / 2 - t / 2, bodyCenterY, offsetZmm],
        rotation: [0, 0, 0],
        grainRotated: true,
        edgeBanding: frontEdge2,
        system32ShelfHoles: Boolean(cfg.system32Holes),
        groupId,
      },
      {
        id: uid('oven_btm'),
        name: `${cfg.name} — Wieniec dolny`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: t,
        depth: D,
        position: [offsetXmm, bodyBottomY + t / 2, offsetZmm],
        rotation: [0, 0, 0],
        edgeBanding: frontEdge2,
        groupId,
      },
      {
        id: uid('oven_top'),
        name: `${cfg.name} — Wieniec górny (szczelina went. 50mm)`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: t,
        depth: shelfDepth,
        position: [offsetXmm, bodyBottomY + bodyH - t / 2, shelfZ],
        rotation: [0, 0, 0],
        edgeBanding: frontEdge2,
        groupId,
      }
    );

    if (plinthH >= 20) {
      parts.push(
        {
          id: uid('oven_plinth_f'),
          name: `${cfg.name} — Cokół przedni (wentylacja dolna)`,
          kind: 'panel',
          materialId: cfg.corpusMaterialId,
          width: innerW,
          height: plinthH,
          depth: t,
          position: [offsetXmm, baseY + plinthH / 2, offsetZmm + D / 2 - 45 - t / 2],
          rotation: [0, 0, 0],
          edgeBanding: { thicknessMm: 0.8, top: true, bottom: true },
          groupId,
        },
        {
          id: uid('oven_plinth_b'),
          name: `${cfg.name} — Cokół tylny`,
          kind: 'panel',
          materialId: cfg.corpusMaterialId,
          width: innerW,
          height: plinthH,
          depth: t,
          position: [offsetXmm, baseY + plinthH / 2, offsetZmm - D / 2 + 45 + t / 2],
          rotation: [0, 0, 0],
          groupId,
        }
      );
    }

    // Oven niche geometry (standard 600 mm oven: 595 mm tall, sits ~760-780 mm from floor)
    const ovenShelfY = Math.round(bodyBottomY + Math.min(680, bodyH * 0.34));
    const ovenNicheH = 600;
    const aboveOvenShelfY = Math.round(ovenShelfY + t / 2 + ovenNicheH + t / 2);

    parts.push(
      {
        id: uid('oven_shelf_btm'),
        name: `${cfg.name} — Wieniec pod piekarnik (komin 50mm)`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: t,
        depth: shelfDepth,
        position: [offsetXmm, ovenShelfY, shelfZ],
        rotation: [0, 0, 0],
        edgeBanding: frontEdge2,
        groupId,
      },
      {
        id: uid('oven_shelf_top'),
        name: `${cfg.name} — Wieniec nad piekarnikiem (komin 50mm)`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: t,
        depth: shelfDepth,
        position: [offsetXmm, aboveOvenShelfY, shelfZ],
        rotation: [0, 0, 0],
        edgeBanding: frontEdge2,
        groupId,
      },
      // 3D Built-in Oven Appliance sitting cleanly inside the 564×600 mm niche
      {
        id: uid('oven_agd'),
        name: `${cfg.name} — Piekarnik do zabudowy 60`,
        kind: 'appliance',
        applianceModel: 'builtin_oven',
        appliancePricePln: 1850,
        materialId: 'anthracite_matte',
        width: Math.min(595, W - 4),
        height: 595,
        depth: Math.min(545, D - 35),
        position: [
          offsetXmm,
          Math.round(ovenShelfY + t / 2 + 298),
          Math.round(offsetZmm + D / 2 - Math.min(545, D - 35) / 2 + 12),
        ],
        rotation: [0, 0, 0],
        groupId,
      }
    );

    // Optional upper internal shelf inside top compartment
    const upperClearBottom = aboveOvenShelfY + t / 2;
    const upperClearTop = bodyBottomY + bodyH - t;
    if (upperClearTop - upperClearBottom >= 380) {
      parts.push({
        id: uid('oven_upper_shelf'),
        name: `${cfg.name} — Półka górna`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: t,
        depth: shelfDepth - 10,
        position: [offsetXmm, Math.round((upperClearBottom + upperClearTop) / 2), shelfZ],
        rotation: [0, 0, 0],
        edgeBanding: frontEdge2,
        groupId,
      });
    }

    // Partial HDF backs ONLY in bottom & top compartments (open behind oven for thermal airflow!)
    const lowHdfH = Math.max(120, Math.round(ovenShelfY - t / 2 - (bodyBottomY + t) - 4));
    const topHdfH = Math.max(120, Math.round(upperClearTop - upperClearBottom - 4));
    parts.push(
      {
        id: uid('oven_hdf_low'),
        name: `${cfg.name} — Plecy HDF 3mm (strefa dolna)`,
        kind: 'panel',
        materialId: 'hdf_white',
        width: W - 6,
        height: lowHdfH,
        depth: 3,
        position: [offsetXmm, Math.round(bodyBottomY + t + lowHdfH / 2 + 2), offsetZmm - D / 2 - 1.5],
        rotation: [0, 0, 0],
        groupId,
      },
      {
        id: uid('oven_hdf_top'),
        name: `${cfg.name} — Plecy HDF 3mm (strefa górna)`,
        kind: 'panel',
        materialId: 'hdf_white',
        width: W - 6,
        height: topHdfH,
        depth: 3,
        position: [offsetXmm, Math.round(upperClearBottom + topHdfH / 2 + 2), offsetZmm - D / 2 - 1.5],
        rotation: [0, 0, 0],
        groupId,
      }
    );

    // Lower & Upper overlay doors cleanly framing the oven faceplate
    const doorZ = offsetZmm + D / 2 + t / 2 + 1;
    const doorW = W - gap;
    const lowDoorBottom = bodyBottomY + gap / 2;
    const lowDoorTop = ovenShelfY + t / 2 - gap;
    const lowDoorH = Math.max(140, Math.round(lowDoorTop - lowDoorBottom));
    const topDoorBottom = aboveOvenShelfY - t / 2 + gap;
    const topDoorTop = bodyBottomY + bodyH - gap / 2;
    const topDoorH = Math.max(140, Math.round(topDoorTop - topDoorBottom));
    const isLeftHinged = cfg.doorMode !== 'single_right';

    parts.push(
      {
        id: uid('oven_door_low'),
        name: `${cfg.name} — Front dolny`,
        kind: 'door',
        materialId: cfg.frontMaterialId,
        surfaceFinish: cfg.frontFinish,
        width: doorW,
        height: lowDoorH,
        depth: t,
        position: [offsetXmm, Math.round(lowDoorBottom + lowDoorH / 2), doorZ],
        rotation: [0, 0, 0],
        grainRotated: lowDoorH > doorW,
        handleSide: isLeftHinged ? 'right' : 'left',
        handleStyle,
        hingeSide: isLeftHinged ? 'left' : 'right',
        hingeCount: 2,
        edgeBanding: allEdge08Oven,
        hardwareTag: 'door_overlay',
        groupId,
      },
      {
        id: uid('oven_door_top'),
        name: `${cfg.name} — Front górny`,
        kind: 'door',
        materialId: cfg.frontMaterialId,
        surfaceFinish: cfg.frontFinish,
        width: doorW,
        height: topDoorH,
        depth: t,
        position: [offsetXmm, Math.round(topDoorBottom + topDoorH / 2), doorZ],
        rotation: [0, 0, 0],
        grainRotated: topDoorH > doorW,
        handleSide: isLeftHinged ? 'right' : 'left',
        handleStyle,
        hingeSide: isLeftHinged ? 'left' : 'right',
        hingeCount: topDoorH > 900 ? 3 : 2,
        edgeBanding: allEdge08Oven,
        hardwareTag: 'door_overlay',
        groupId,
      }
    );

    const ovenFasteners = cfg.autoFasteners
      ? autoDetectJointFasteners(parts, [], cfg.fastenerType)
      : [];
    return { parts, fasteners: ovenFasteners, groupId };
  }

  // Dedicated Built-In Kitchen AGD Module 2: Sink Cabinet (vertical rear rail + open plumbing back + sink cutout)
  if (cfg.preset === 'sink_cabinet') {
    const bodyBottomY = baseY + plinthH;
    const bodyCenterY = bodyBottomY + bodyH / 2;
    const frontEdge2 = { thicknessMm: 2 as const, top: true };
    const allEdge08Sink = { thicknessMm: 0.8 as const, top: true, bottom: true, left: true, right: true };

    parts.push(
      {
        id: uid('sink_side_l'),
        name: `${cfg.name} — Bok lewy`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: t,
        height: bodyH,
        depth: D,
        position: [offsetXmm - W / 2 + t / 2, bodyCenterY, offsetZmm],
        rotation: [0, 0, 0],
        grainRotated: true,
        edgeBanding: frontEdge2,
        groupId,
      },
      {
        id: uid('sink_side_r'),
        name: `${cfg.name} — Bok prawy`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: t,
        height: bodyH,
        depth: D,
        position: [offsetXmm + W / 2 - t / 2, bodyCenterY, offsetZmm],
        rotation: [0, 0, 0],
        grainRotated: true,
        edgeBanding: frontEdge2,
        groupId,
      },
      {
        id: uid('sink_btm'),
        name: `${cfg.name} — Wieniec dolny`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: t,
        depth: D,
        position: [offsetXmm, bodyBottomY + t / 2, offsetZmm],
        rotation: [0, 0, 0],
        edgeBanding: frontEdge2,
        groupId,
      },
      // Front vertical/horizontal narrow stretcher (keeps sink bowl clear!)
      {
        id: uid('sink_rail_f'),
        name: `${cfg.name} — Trawers przedni (pionowy pod zlew)`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: 75,
        depth: t,
        position: [offsetXmm, bodyBottomY + bodyH - 37.5, offsetZmm + D / 2 - t / 2],
        rotation: [0, 0, 0],
        edgeBanding: frontEdge2,
        groupId,
      },
      // Rear vertical stiffening rail (leaves room for faucet hoses & syphon!)
      {
        id: uid('sink_rail_b'),
        name: `${cfg.name} — Trawers tylny pionowy (miejsce na syfon)`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: innerW,
        height: 110,
        depth: t,
        position: [offsetXmm, bodyBottomY + bodyH - 55, offsetZmm - D / 2 + t / 2],
        rotation: [0, 0, 0],
        groupId,
      }
    );

    if (plinthH >= 20) {
      parts.push(
        {
          id: uid('sink_plinth_f'),
          name: `${cfg.name} — Cokół przedni`,
          kind: 'panel',
          materialId: cfg.corpusMaterialId,
          width: innerW,
          height: plinthH,
          depth: t,
          position: [offsetXmm, baseY + plinthH / 2, offsetZmm + D / 2 - 45 - t / 2],
          rotation: [0, 0, 0],
          edgeBanding: { thicknessMm: 0.8, top: true, bottom: true },
          groupId,
        },
        {
          id: uid('sink_plinth_b'),
          name: `${cfg.name} — Cokół tylny`,
          kind: 'panel',
          materialId: cfg.corpusMaterialId,
          width: innerW,
          height: plinthH,
          depth: t,
          position: [offsetXmm, baseY + plinthH / 2, offsetZmm - D / 2 + 45 + t / 2],
          rotation: [0, 0, 0],
          groupId,
        }
      );
    }

    // Double doors (or single if narrow <= 550 mm)
    const doorZ = offsetZmm + D / 2 + t / 2 + 1;
    const doorH = bodyH - gap;
    const useTopPull = handleStyle === 'gola_j' || handleStyle === 'chamfer_45';
    if (W <= 550) {
      parts.push({
        id: uid('sink_door'),
        name: `${cfg.name} — Front pod zlew`,
        kind: 'door',
        materialId: cfg.frontMaterialId,
        surfaceFinish: cfg.frontFinish,
        width: W - gap,
        height: doorH,
        depth: t,
        position: [offsetXmm, bodyCenterY, doorZ],
        rotation: [0, 0, 0],
        grainRotated: doorH > W - gap,
        handleSide: useTopPull ? 'top' : 'right',
        handleStyle,
        hingeSide: 'left',
        hingeCount: 2,
        edgeBanding: allEdge08Sink,
        hardwareTag: 'door_overlay',
        groupId,
      });
    } else {
      const doorW = Math.floor((W - gap * 2) / 2);
      const dx = doorW / 2 + gap / 2;
      parts.push(
        {
          id: uid('sink_door_l'),
          name: `${cfg.name} — Front lewy`,
          kind: 'door',
          materialId: cfg.frontMaterialId,
          surfaceFinish: cfg.frontFinish,
          width: doorW,
          height: doorH,
          depth: t,
          position: [offsetXmm - dx, bodyCenterY, doorZ],
          rotation: [0, 0, 0],
          grainRotated: doorH > doorW,
          handleSide: useTopPull ? 'top' : 'right',
          handleStyle,
          hingeSide: 'left',
          hingeCount: 2,
          edgeBanding: allEdge08Sink,
          hardwareTag: 'door_overlay',
          groupId,
        },
        {
          id: uid('sink_door_r'),
          name: `${cfg.name} — Front prawy`,
          kind: 'door',
          materialId: cfg.frontMaterialId,
          surfaceFinish: cfg.frontFinish,
          width: doorW,
          height: doorH,
          depth: t,
          position: [offsetXmm + dx, bodyCenterY, doorZ],
          rotation: [0, 0, 0],
          grainRotated: doorH > doorW,
          handleSide: useTopPull ? 'top' : 'left',
          handleStyle,
          hingeSide: 'right',
          hingeCount: 2,
          edgeBanding: allEdge08Sink,
          hardwareTag: 'door_overlay',
          groupId,
        }
      );
    }

    // Countertop with pre-cut sink hole (>= 55 mm front & rear bridges!) + 3D Kitchen Sink
    if (cfg.addCountertop) {
      const topH = 38;
      const overhangFront = 25;
      const topDepth = D + overhangFront;
      const sinkW = Math.min(580, Math.max(420, W - 160));
      const sinkD = Math.min(460, topDepth - 125);
      const cutW = sinkW - 30;
      const cutD = sinkD - 30;
      const topY = bodyBottomY + bodyH + topH / 2;
      const topZ = offsetZmm + overhangFront / 2;

      parts.push(
        {
          id: uid('sink_countertop'),
          name: `${cfg.name} — Blat 38 mm (z wycięciem pod zlew)`,
          kind: 'countertop',
          materialId: cfg.countertopMaterialId,
          width: W + 4,
          height: topH,
          depth: topDepth,
          position: [offsetXmm, topY, topZ],
          rotation: [0, 0, 0],
          edgeBanding: { thicknessMm: 2, top: true, left: true, right: true },
          cutouts: [
            {
              id: 'auto_app_sink_init',
              shape: 'rect',
              xMm: 0,
              yMm: 0,
              widthMm: cutW,
              heightMm: cutD,
              label: 'Wycięcie pod zlewozmywak',
            },
          ],
          groupId,
        },
        {
          id: uid('sink_agd'),
          name: `${cfg.name} — Zlewozmywak z baterią`,
          kind: 'appliance',
          applianceModel: 'kitchen_sink',
          appliancePricePln: 890,
          materialId: 'steel_galv',
          width: sinkW,
          height: 210,
          depth: sinkD,
          position: [offsetXmm, Math.round(topY - 40), topZ],
          rotation: [0, 0, 0],
          groupId,
        }
      );
    }

    const sinkFasteners = cfg.autoFasteners
      ? autoDetectJointFasteners(parts, [], cfg.fastenerType)
      : [];
    return { parts, fasteners: sinkFasteners, groupId };
  }

  // Dedicated Built-In Kitchen AGD Module 3: Dishwasher Bay (450/600 mm open niche + overlay front + recessed kickplate)
  if (cfg.preset === 'dishwasher_bay') {
    const bodyBottomY = baseY + plinthH;
    const bodyCenterY = bodyBottomY + bodyH / 2;
    const allEdge08Dw = { thicknessMm: 0.8 as const, top: true, bottom: true, left: true, right: true };
    const frontEdge2 = { thicknessMm: 2 as const, top: true };
    const dwFrontW = W - gap;
    const dwFrontH = bodyH - gap;
    const doorZ = offsetZmm + D / 2 + t / 2 + 1;

    // Standalone overlay dishwasher front (opens downward in real life; mounted to dishwasher door)
    parts.push({
      id: uid('dw_front'),
      name: `${cfg.name} — Front zmywarki ${W} mm`,
      kind: 'door',
      materialId: cfg.frontMaterialId,
      surfaceFinish: cfg.frontFinish,
      width: dwFrontW,
      height: dwFrontH,
      depth: t,
      position: [offsetXmm, bodyCenterY, doorZ],
      rotation: [0, 0, 0],
      grainRotated: dwFrontH > dwFrontW,
      handleSide: 'top',
      handleStyle,
      edgeBanding: allEdge08Dw,
      hardwareTag: 'door_overlay',
      groupId,
    });

    // Recessed kickplate plinth (cofnięty o 65 mm i obniżony o 8 mm pod zawias zmywarki!)
    if (plinthH >= 20) {
      const kickH = Math.max(40, plinthH - 8);
      parts.push({
        id: uid('dw_plinth'),
        name: `${cfg.name} — Cokół podcięty pod zmywarkę`,
        kind: 'panel',
        materialId: cfg.corpusMaterialId,
        width: W,
        height: kickH,
        depth: t,
        position: [offsetXmm, baseY + kickH / 2, offsetZmm + D / 2 - 65 - t / 2],
        rotation: [0, 0, 0],
        edgeBanding: { thicknessMm: 0.8, top: true, bottom: true },
        groupId,
      });
    }

    // End support gable panel supporting the countertop next to the open dishwasher bay
    parts.push({
      id: uid('dw_gable'),
      name: `${cfg.name} — Bok końcowy podpierający blat`,
      kind: 'panel',
      materialId: cfg.frontMaterialId,
      surfaceFinish: cfg.frontFinish,
      width: t,
      height: H,
      depth: D,
      position: [offsetXmm + W / 2 + t / 2, baseY + H / 2, offsetZmm],
      rotation: [0, 0, 0],
      grainRotated: true,
      edgeBanding: frontEdge2,
      groupId,
    });

    if (cfg.addCountertop) {
      const topH = 38;
      const overhangFront = 25;
      parts.push({
        id: uid('dw_countertop'),
        name: `${cfg.name} — Blat 38 mm nad zmywarką`,
        kind: 'countertop',
        materialId: cfg.countertopMaterialId,
        width: W + t + 4,
        height: topH,
        depth: D + overhangFront,
        position: [
          offsetXmm + t / 2,
          bodyBottomY + bodyH + topH / 2,
          offsetZmm + overhangFront / 2,
        ],
        rotation: [0, 0, 0],
        edgeBanding: { thicknessMm: 2, top: true, left: true, right: true },
        groupId,
      });
    }

    const dwFasteners = cfg.autoFasteners
      ? autoDetectJointFasteners(parts, [], cfg.fastenerType)
      : [];
    return { parts, fasteners: dwFasteners, groupId };
  }

  const bodyBottomY = baseY + plinthH;
  const bodyCenterY = bodyBottomY + bodyH / 2;

  const backGroove =
    cfg.backType === 'hdf_grooved'
      ? { enabled: true, edge: 'back' as const, insetMm: 16, widthMm: 4, depthMm: 8 }
      : undefined;
  const bottomLedGroove = cfg.addLedGroove
    ? { enabled: true, edge: 'front' as const, insetMm: 45, widthMm: 10, depthMm: 8 }
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
    ledGroove: bottomLedGroove,
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
      height: topDeckT,
      depth: D,
      position: [offsetXmm, bodyBottomY + bodyH - topDeckT / 2, offsetZmm],
      rotation: [0, 0, 0],
      edgeBanding: frontEdge2mm,
      dadoGroove: backGroove,
      groupId,
    });
  }

  // 3. Back panel (Dedicated 3 mm white HDF — hdf_white — in dado groove OR nailed behind)
  // Automatically splits across vertical dividers (H-profile join) when a single HDF panel would exceed a 2800×2070 mm sheet
  const backInsetForInterior = cfg.backType === 'hdf_grooved' ? 20 : 0;
  const dividersForBack = rawDividersCount;
  if (cfg.backType === 'hdf_grooved' || cfg.backType === 'hdf_nailed') {
    const isGrooved = cfg.backType === 'hdf_grooved';
    const totalHdfW = isGrooved ? Math.min(W - 4, innerW + 12) : W - 4;
    const totalHdfH = isGrooved ? Math.min(bodyH - 4, innerH + 12) : bodyH - 4;
    const hdfCenterY = isGrooved ? Math.round(bodyBottomY + t + innerH / 2) : bodyCenterY;
    const hdfZ = isGrooved ? offsetZmm - D / 2 + 16 : offsetZmm - D / 2 - 1.5;
    const splitBays =
      dividersForBack > 0 && (totalHdfW > 1800 || Math.min(totalHdfW, totalHdfH) > 2020)
        ? dividersForBack + 1
        : 1;

    if (splitBays === 1) {
      parts.push({
        id: uid('cab_back'),
        name: isGrooved ? `${cfg.name} — Plecy HDF 3mm (w nut)` : `${cfg.name} — Plecy HDF 3mm`,
        kind: 'panel',
        materialId: 'hdf_white',
        width: totalHdfW,
        height: totalHdfH,
        depth: 3,
        position: [offsetXmm, hdfCenterY, hdfZ],
        rotation: [0, 0, 0],
        groupId,
      });
    } else {
      const hProfileGap = 2;
      const segW = Math.floor((totalHdfW - (splitBays - 1) * hProfileGap) / splitBays);
      const startLeftX = offsetXmm - (segW * splitBays + (splitBays - 1) * hProfileGap) / 2;
      for (let b = 0; b < splitBays; b++) {
        const segCx = Math.round(startLeftX + b * (segW + hProfileGap) + segW / 2);
        parts.push({
          id: uid(`cab_back_${b + 1}`),
          name: isGrooved
            ? `${cfg.name} — Plecy HDF 3mm cz. ${b + 1} (w nut)`
            : `${cfg.name} — Plecy HDF 3mm cz. ${b + 1}`,
          kind: 'panel',
          materialId: 'hdf_white',
          width: segW,
          height: totalHdfH,
          depth: 3,
          position: [segCx, hdfCenterY, hdfZ],
          rotation: [0, 0, 0],
          groupId,
        });
      }
    }
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
    if (W >= 1000) {
      legCoords.push(
        ['Nóżka ŚP', 0, D / 2 - insetZ],
        ['Nóżka ŚT', 0, -D / 2 + insetZ]
      );
    }
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

  // Height of bottom drawer zone (in mm inside corpus) vs upper shelf/door zone
  let drawerInteriorZoneH = innerH;
  let upperZoneBottomY = bodyBottomY + t;
  let upperZoneInnerH = innerH;
  let separatorCenterY: number | null = null;
  // Wide hybrid wardrobes use a reinforced double-thickness separator deck so 1000+ mm spans never sag
  const separatorT = isHybridCabinet && innerW >= 950 ? Math.max(t, 36) : t;

  if (isHybridCabinet) {
    // Bottom ~38-44% reserved for drawers, separated by a full-width horizontal deck
    const rawDrwH = Math.max(
      effectiveDrawerCount * 155,
      Math.min(Math.round(innerH * 0.42), effectiveDrawerCount * 240)
    );
    drawerInteriorZoneH = Math.min(innerH - 360, rawDrwH);
    separatorCenterY = Math.round(bodyBottomY + t + drawerInteriorZoneH + separatorT / 2);
    upperZoneBottomY = separatorCenterY + separatorT / 2;
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
      height: separatorT,
      depth: interiorDepth,
      position: [offsetXmm, separatorCenterY, interiorCenterZ],
      rotation: [0, 0, 0],
      edgeBanding: frontEdge2mm,
      groupId,
    });
  }

  // 6. Vertical Dividers (0 / 1 / 2) — spanning full innerH (or upper zone in hybrid cabinets)
  const dividersCount = rawDividersCount;
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
        let prevTopY = upperZoneBottomY;
        const cornerSupportX = isCorner
          ? Math.round(
              offsetXmm -
                W / 2 +
                Math.max(
                  260,
                  Math.min(W - 320, Math.round(cfg.cornerBlindWidthMm ?? Math.round(W * 0.52)))
                ) -
                27
            )
          : null;
        for (let i = 0; i < cfg.shelfCount; i++) {
          const sy = Math.round(upperZoneBottomY + clearStep * (i + 1) + t * i + t / 2);
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
            position: [bx, sy, interiorCenterZ],
            rotation: [0, 0, 0],
            edgeBanding: frontEdge2mm,
            groupId,
          });
          // Blind-corner cabinets >850 mm wide need a front support stile under the shelf so it doesn't sag
          if (isCorner && cornerSupportX !== null && bayW >= 800) {
            const stileH = Math.max(40, Math.round(sy - t / 2 - prevTopY));
            const stileDepth = Math.min(80, Math.max(50, Math.round(interiorDepth * 0.2)));
            parts.push({
              id: uid(`cab_corner_stile_${i + 1}`),
              name: `${cfg.name} — Słupek wsporczy półki ${i + 1}`,
              kind: 'panel',
              materialId: cfg.corpusMaterialId,
              width: t,
              height: stileH,
              depth: stileDepth,
              position: [
                cornerSupportX,
                Math.round(prevTopY + stileH / 2),
                Math.round(interiorCenterZ + interiorDepth / 2 - stileDepth / 2),
              ],
              rotation: [0, 0, 0],
              grainRotated: true,
              edgeBanding: frontEdge2mm,
              groupId,
            });
          }
          prevTopY = sy + t / 2;
        }
      }
    }
  }

  // 8. Full Multi-Part Drawers (with exact Blum/GTV −10 mm + recessed grooved HDF bottom +13 mm OR Ball −26 mm)
  let topDrawerFrontTopY: number | null = null;
  if (effectiveDrawerCount > 0) {
    const drawerCols = !isHybridCabinet && dividersCount > 0 ? bayCount : 1;
    const rowsPerCol = Math.max(1, Math.round(effectiveDrawerCount / drawerCols));
    const isUndermount = cfg.slideType === 'undermount_blum';
    const isTandembox = cfg.slideType === 'tandembox_metabox';
    const slideClearanceTotal = isUndermount
      ? 10
      : cfg.slideType === 'ball_26mm'
        ? 26
        : 14;
    const boxThickness = isTandembox ? 13 : 16;
    const boxSideMat = isTandembox ? 'steel_black' : 'birch_plywood';
    const boxBackMat = isTandembox ? cfg.corpusMaterialId : 'birch_plywood';
    const frontZ =
      cfg.frontType === 'overlay'
        ? offsetZmm + D / 2 + t / 2 + 1
        : offsetZmm + D / 2 - t / 2 - 1;
    // Drawer box front sits flush 1 mm behind the inner face of the drawer front (no 9 mm air gap!)
    const frontInnerFaceZ = frontZ - t / 2;
    const maxBoxDepth = Math.max(
      150,
      Math.floor(frontInnerFaceZ - 1 - (offsetZmm - D / 2 + backInsetForInterior + 14))
    );
    const boxDepth = Math.min(500, maxBoxDepth);
    const boxCenterZ = Math.round((frontInnerFaceZ - 1 - boxDepth / 2) * 10) / 10;

    const drawerZoneExternalH = isHybridCabinet
      ? cfg.frontType === 'overlay'
        ? drawerInteriorZoneH + t + separatorT / 2 - gap
        : drawerInteriorZoneH - gap
      : cfg.frontType === 'overlay'
        ? bodyH - gap
        : innerH - gap;
    const eachFrontH = Math.max(
      80,
      Math.floor((drawerZoneExternalH - (rowsPerCol - 1) * gap) / rowsPerCol)
    );
    const drawerZoneCeilingY =
      isHybridCabinet && separatorCenterY !== null
        ? separatorCenterY - separatorT / 2
        : bodyBottomY + bodyH - topDeckT;
    const drawerZoneFloorY = bodyBottomY + t;
    const nominalBoxH = isTandembox
      ? Math.max(68, Math.min(eachFrontH - 42, 115))
      : Math.max(68, Math.min(eachFrontH - 36, 175));

    const undermountGroove = isUndermount
      ? { enabled: true, edge: 'bottom' as const, insetMm: 13, widthMm: 4, depthMm: 7 }
      : undefined;

    let drawerIdx = 0;
    for (let col = 0; col < drawerCols; col++) {
      const bayCenterX = drawerCols > 1 ? bayCentersX[col] : offsetXmm;
      const bayClearW = drawerCols > 1 ? bayW : innerW;
      const boxOuterW = Math.max(100, bayClearW - slideClearanceTotal);
      const boxInnerW = Math.max(60, boxOuterW - 2 * boxThickness);
      const frontW =
        drawerCols > 1
          ? cfg.frontType === 'overlay'
            ? Math.floor((W - (drawerCols + 1) * gap) / drawerCols)
            : bayW - gap * 2
          : cfg.frontType === 'overlay'
            ? W - gap
            : innerW - gap * 2;
      const frontCenterX =
        drawerCols > 1 && cfg.frontType === 'overlay'
          ? Math.round(offsetXmm - W / 2 + gap + frontW / 2 + col * (frontW + gap))
          : bayCenterX;

      for (let i = 0; i < rowsPerCol; i++) {
        drawerIdx += 1;
        const frontBottomY =
          (cfg.frontType === 'overlay'
            ? bodyBottomY + gap / 2
            : bodyBottomY + t + gap / 2) +
          i * (eachFrontH + gap);
        const frontCenterY = Math.round(frontBottomY + eachFrontH / 2);
        topDrawerFrontTopY = Math.max(topDrawerFrontTopY ?? 0, frontCenterY + eachFrontH / 2);

        // Strictly keep drawer box clear of both bottom deck and top/separator deck (zero collisions even with 28 mm top)
        const minBoxBottomY = Math.max(drawerZoneFloorY + 6, Math.round(frontBottomY + 18));
        const maxBoxTopY = Math.min(
          Math.round(frontBottomY + eachFrontH - 12),
          Math.round(drawerZoneCeilingY - 8)
        );
        const thisBoxH = Math.max(56, Math.min(nominalBoxH, maxBoxTopY - minBoxBottomY));
        const boxCenterY = Math.round(minBoxBottomY + thisBoxH / 2);

        // Drawer Front
        parts.push({
          id: uid(`cab_drw_f_${drawerIdx}`),
          name: `${cfg.name} — Front szuflady ${drawerIdx}`,
          kind: 'door',
          materialId: cfg.frontMaterialId,
          surfaceFinish: cfg.frontFinish,
          width: frontW,
          height: eachFrontH,
          depth: t,
          position: [frontCenterX, frontCenterY, frontZ],
          rotation: [0, 0, 0],
          handleSide: 'top',
          handleStyle,
          edgeBanding: allEdge08,
          drawerSlideType: cfg.slideType === 'none' ? 'ball_26mm' : cfg.slideType,
          hardwareTag: 'drawer_front',
          groupId,
        });

        // Drawer Box Left & Right sides (slim steel profiles for Tandembox, 16 mm birch plywood for wooden drawers)
        parts.push({
          id: uid(`cab_drw_l_${drawerIdx}`),
          name: isTandembox
            ? `${cfg.name} — Szuflada ${drawerIdx} (bok metalowy Tandembox L)`
            : `${cfg.name} — Szuflada ${drawerIdx} (bok L)`,
          kind: 'panel',
          materialId: boxSideMat,
          width: boxThickness,
          height: thisBoxH,
          depth: boxDepth,
          position: [
            bayCenterX - boxOuterW / 2 + boxThickness / 2,
            boxCenterY,
            boxCenterZ,
          ],
          rotation: [0, 0, 0],
          dadoGroove: undermountGroove,
          hardwareTag: 'drawer_box',
          groupId,
        });
        parts.push({
          id: uid(`cab_drw_r_${drawerIdx}`),
          name: isTandembox
            ? `${cfg.name} — Szuflada ${drawerIdx} (bok metalowy Tandembox P)`
            : `${cfg.name} — Szuflada ${drawerIdx} (bok P)`,
          kind: 'panel',
          materialId: boxSideMat,
          width: boxThickness,
          height: thisBoxH,
          depth: boxDepth,
          position: [
            bayCenterX + boxOuterW / 2 - boxThickness / 2,
            boxCenterY,
            boxCenterZ,
          ],
          rotation: [0, 0, 0],
          dadoGroove: undermountGroove,
          hardwareTag: 'drawer_box',
          groupId,
        });

        // Drawer Back (and Inner Front Stretcher for wooden boxes; Tandembox clips directly onto drawer front!)
        const backH = isTandembox && eachFrontH >= 200 ? Math.min(maxBoxTopY - minBoxBottomY, thisBoxH + 54) : thisBoxH;
        const backCenterY = Math.round(minBoxBottomY + backH / 2);
        parts.push({
          id: uid(`cab_drw_bk_${drawerIdx}`),
          name: `${cfg.name} — Szuflada ${drawerIdx} (tył)`,
          kind: 'panel',
          materialId: boxBackMat,
          width: boxInnerW,
          height: backH,
          depth: 16,
          position: [
            bayCenterX,
            backCenterY,
            Math.round(boxCenterZ - boxDepth / 2 + 8),
          ],
          rotation: [0, 0, 0],
          dadoGroove: undermountGroove,
          hardwareTag: 'drawer_box',
          groupId,
        });

        if (!isTandembox) {
          parts.push({
            id: uid(`cab_drw_fr_${drawerIdx}`),
            name: `${cfg.name} — Szuflada ${drawerIdx} (przód korpusu)`,
            kind: 'panel',
            materialId: 'birch_plywood',
            width: boxInnerW,
            height: thisBoxH,
            depth: boxThickness,
            position: [
              bayCenterX,
              boxCenterY,
              Math.round(boxCenterZ + boxDepth / 2 - boxThickness / 2),
            ],
            rotation: [0, 0, 0],
            dadoGroove: undermountGroove,
            hardwareTag: 'drawer_box',
            groupId,
          });
        }

        // Drawer Bottom: 16 mm melamine for Tandembox, recessed HDF 3 mm (+13 mm dado) for Blum, or bottom HDF for ball slides
        if (isTandembox) {
          parts.push({
            id: uid(`cab_drw_btm_${drawerIdx}`),
            name: `${cfg.name} — Szuflada ${drawerIdx} (dno płyta 16mm Tandembox)`,
            kind: 'panel',
            materialId: cfg.corpusMaterialId,
            width: boxInnerW,
            height: 16,
            depth: boxDepth - 16,
            position: [
              bayCenterX,
              Math.round(minBoxBottomY + 8),
              Math.round(boxCenterZ + 8),
            ],
            rotation: [0, 0, 0],
            hardwareTag: 'drawer_box',
            groupId,
          });
        } else if (isUndermount) {
          parts.push({
            id: uid(`cab_drw_btm_${drawerIdx}`),
            name: `${cfg.name} — Szuflada ${drawerIdx} (dno HDF 3mm w nut +13mm)`,
            kind: 'panel',
            materialId: 'hdf_white',
            width: boxInnerW + 10,
            height: 3,
            depth: boxDepth - 2 * boxThickness + 10,
            position: [
              bayCenterX,
              Math.round(boxCenterY - thisBoxH / 2 + 13),
              boxCenterZ,
            ],
            rotation: [0, 0, 0],
            hardwareTag: 'drawer_box',
            groupId,
          });
        } else {
          parts.push({
            id: uid(`cab_drw_btm_${drawerIdx}`),
            name: `${cfg.name} — Szuflada ${drawerIdx} (dno HDF 3mm)`,
            kind: 'panel',
            materialId: 'hdf_white',
            width: boxOuterW - 2,
            height: 3,
            depth: boxDepth - 2,
            position: [
              bayCenterX,
              Math.round(boxCenterY - thisBoxH / 2 - 1.5),
              boxCenterZ,
            ],
            rotation: [0, 0, 0],
            hardwareTag: 'drawer_box',
            groupId,
          });
        }
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
      grainRotated: slidingDoorH > slidingDoorW,
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
      grainRotated: slidingDoorH > slidingDoorW,
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
      grainRotated: doorH > activeDoorW,
      handleSide:
        (handleStyle === 'gola_j' || handleStyle === 'chamfer_45') && bodyH <= 1050
          ? 'top'
          : 'left',
      handleStyle,
      hingeSide: 'right',
      hingeCount: hingesPerDoor,
      edgeBanding: allEdge08,
      hardwareTag: 'door_overlay',
      groupId,
    });
  } else if (cfg.doorMode !== 'none' && (effectiveDrawerCount === 0 || isHybridCabinet)) {
    // Standard hinged doors (either full height, or upper zone cleanly above top drawer front / separator deck)
    const hybridDoorBottomY =
      cfg.frontType === 'inset'
        ? upperZoneBottomY + gap
        : topDrawerFrontTopY !== null
          ? topDrawerFrontTopY + gap
          : separatorCenterY! - separatorT / 2 + gap;
    const hybridDoorTopY =
      cfg.frontType === 'inset'
        ? bodyBottomY + bodyH - t - gap
        : bodyBottomY + bodyH - gap / 2;
    const doorH = isHybridCabinet
      ? Math.max(180, Math.round(hybridDoorTopY - hybridDoorBottomY))
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

    const useTopEdgePull =
      (handleStyle === 'gola_j' || handleStyle === 'chamfer_45') &&
      bodyH <= 1050 &&
      !isHybridCabinet;

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
        grainRotated: doorH > doorW,
        handleSide: useTopEdgePull ? 'top' : isLeftHinged ? 'right' : 'left',
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
        grainRotated: doorH > doorW,
        handleSide: useTopEdgePull ? 'top' : 'right',
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
        grainRotated: doorH > doorW,
        handleSide: useTopEdgePull ? 'top' : 'left',
        handleStyle,
        hingeSide: 'right',
        hingeCount: hingesPerDoor,
        edgeBanding: allEdge08,
        hardwareTag: hwTag,
        groupId,
      });
    } else if (cfg.doorMode === 'flap_up') {
      // Upward-opening flap door (klapa na siłownikach gazowych / Blum Aventos)
      // Tall wall cabinets (>= 640 mm) split into 2 stacked flap doors; shorter cabinets use 1 full flap
      const flapW = cfg.frontType === 'overlay' ? W - gap : innerW - gap * 2;
      const flapCount = !isHybridCabinet && doorH >= 640 ? 2 : 1;
      const eachFlapH = Math.floor((doorH - (flapCount - 1) * gap) / flapCount);
      const startBottomY = doorCenterY - doorH / 2;
      const flapHinges = flapW >= 800 ? 3 : 2;
      for (let fi = 0; fi < flapCount; fi++) {
        const cy = Math.round(startBottomY + eachFlapH / 2 + fi * (eachFlapH + gap));
        parts.push({
          id: uid(`cab_flap_${fi + 1}`),
          name:
            flapCount > 1
              ? `${cfg.name} — Klapa uchylna ${fi === 0 ? 'dolna' : 'górna'}`
              : `${cfg.name} — Klapa uchylna (do góry)`,
          kind: 'door',
          materialId: cfg.frontMaterialId,
          surfaceFinish: cfg.frontFinish,
          width: flapW,
          height: eachFlapH,
          depth: t,
          position: [offsetXmm, cy, doorZ],
          rotation: [0, 0, 0],
          grainRotated: false,
          handleSide: 'none',
          handleStyle,
          hingeSide: 'top',
          hingeCount: flapHinges,
          edgeBanding: allEdge08,
          hardwareTag: 'flap_door',
          groupId,
        });
      }
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

/**
 * Computes corpus-only bounding box (excluding countertop 2mm side overhang and 3D appliances)
 * so adjacent kitchen/wardrobe modules snap side-by-side flush without collisions.
 */
function getCorpusBounds(parts: FurniturePart[]): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} | null {
  const structural = parts.filter(
    (p) => p.kind !== 'countertop' && p.kind !== 'appliance'
  );
  const list = structural.length > 0 ? structural : parts;
  if (list.length === 0) return null;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const p of list) {
    const b = getPartWorldBox(p);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * PRO100 / KD Max style smart placement for new parametric cabinets:
 * Automatically aligns a newly inserted module flush next to the selected cabinet
 * (or the rightmost compatible-elevation cabinet in a row), or against the alcove walls.
 */
export function computeSmartCabinetPlacement(
  cfg: ParametricCabinetConfig,
  existingParts: FurniturePart[],
  selectedPartId: string | null,
  room: RoomConfig | undefined,
  mode: CabinetPlacementMode = 'auto'
): { offsetXmm: number; offsetZmm: number; label: string } {
  // Measure new cabinet footprint at origin (including optional wall fillers or dishwasher end gable)
  const preview = buildParametricCabinet({ ...cfg, autoFasteners: false }, 0, 0);
  const newBounds = getCorpusBounds(preview.parts);
  const newMinX = newBounds ? newBounds.minX : -cfg.widthMm / 2;
  const newMaxX = newBounds ? newBounds.maxX : cfg.widthMm / 2;
  const newMinZ = newBounds ? newBounds.minZ : -cfg.depthMm / 2;

  if (mode === 'center') {
    return { offsetXmm: 0, offsetZmm: 0, label: 'Środek sceny (0, 0)' };
  }

  const isWallHanging = cfg.elevationYmm >= 900;
  const backWallZ = room?.enabled && room.showBackWall ? room.backWallZMm : null;

  if (mode === 'back_wall') {
    const targetZ = backWallZ !== null ? Math.round(backWallZ - newMinZ) : 0;
    return {
      offsetXmm: 0,
      offsetZmm: targetZ,
      label: backWallZ !== null ? 'Wyśrodkowana przy ścianie tylnej' : 'Wyśrodkowana (X: 0)',
    };
  }

  // Find anchor assembly (selected group/part first, else rightmost/leftmost compatible row)
  const findAnchor = (preferLeftmost: boolean): { bounds: NonNullable<ReturnType<typeof getCorpusBounds>>; name: string } | null => {
    if (existingParts.length === 0) return null;

    if (selectedPartId) {
      const sel = existingParts.find((p) => p.id === selectedPartId);
      if (sel) {
        const members = sel.groupId
          ? existingParts.filter((p) => p.groupId === sel.groupId)
          : [sel];
        const b = getCorpusBounds(members);
        if (b) {
          const anchorIsWall = b.minY >= 900;
          if (anchorIsWall === isWallHanging || mode === 'right' || mode === 'left') {
            return { bounds: b, name: sel.groupId ?? sel.name };
          }
        }
      }
    }

    // Group existing parts into logical assemblies (by groupId, or standalone)
    const buckets = new Map<string, FurniturePart[]>();
    for (const p of existingParts) {
      const key = p.groupId ?? `__all__`;
      const list = buckets.get(key) ?? [];
      list.push(p);
      buckets.set(key, list);
    }

    let best: { bounds: NonNullable<ReturnType<typeof getCorpusBounds>>; name: string } | null = null;
    for (const [key, list] of buckets.entries()) {
      const b = getCorpusBounds(list);
      if (!b) continue;
      const bucketIsWall = b.minY >= 900;
      if (bucketIsWall !== isWallHanging) continue;
      if (!best) {
        best = { bounds: b, name: key === '__all__' ? 'istniejącej zabudowy' : key };
      } else if (preferLeftmost ? b.minX < best.bounds.minX : b.maxX > best.bounds.maxX) {
        best = { bounds: b, name: key === '__all__' ? 'istniejącej zabudowy' : key };
      }
    }
    return best;
  };

  if (mode === 'left') {
    const anchor = findAnchor(true);
    if (anchor) {
      const offsetXmm = Math.round(anchor.bounds.minX - newMaxX);
      const offsetZmm = Math.round(anchor.bounds.minZ - newMinZ);
      return {
        offsetXmm,
        offsetZmm,
        label: `Obok z lewej: ${anchor.name}`,
      };
    }
  }

  // 'auto' or 'right'
  const anchor = findAnchor(false);
  if (anchor) {
    // Check if placing on the right would exceed the enabled room right wall; if so, try left side in 'auto'
    const rightOffsetX = Math.round(anchor.bounds.maxX - newMinX);
    const alignedZ = Math.round(anchor.bounds.minZ - newMinZ);
    if (
      mode === 'auto' &&
      room?.enabled &&
      room.showRightWall &&
      rightOffsetX + newMaxX > room.widthMm / 2 + 2
    ) {
      const leftAnchor = findAnchor(true);
      if (leftAnchor) {
        const leftOffsetX = Math.round(leftAnchor.bounds.minX - newMaxX);
        if (leftOffsetX + newMinX >= -room.widthMm / 2 - 2) {
          return {
            offsetXmm: leftOffsetX,
            offsetZmm: Math.round(leftAnchor.bounds.minZ - newMinZ),
            label: `Obok z lewej: ${leftAnchor.name} (prawa ściana pełna)`,
          };
        }
      }
    }
    return {
      offsetXmm: rightOffsetX,
      offsetZmm: alignedZ,
      label: `W ciągu z prawej: ${anchor.name}`,
    };
  }

  // No compatible existing cabinets yet — snap cleanly to room alcove walls if enabled
  if (room?.enabled) {
    const offsetZmm = backWallZ !== null ? Math.round(backWallZ - newMinZ) : 0;
    if (room.showLeftWall) {
      const offsetXmm = Math.round(-room.widthMm / 2 - newMinX);
      return {
        offsetXmm,
        offsetZmm,
        label: 'Przy lewej i tylnej ścianie wnęki',
      };
    }
    return {
      offsetXmm: 0,
      offsetZmm,
      label: 'Przy tylnej ścianie wnęki',
    };
  }

  return { offsetXmm: 0, offsetZmm: 0, label: 'Środek sceny (0, 0)' };
}

/**
 * Rebuilds an existing parametric cabinet group in place after the user re-opens
 * it in CabinetBuilderModal (preserving its world X center and rear Z alignment!).
 */
export function rebuildParametricCabinetInPlace(
  existingParts: FurniturePart[],
  existingFasteners: Fastener[],
  groupId: string,
  nextCfg: ParametricCabinetConfig
): { parts: FurniturePart[]; fasteners: Fastener[]; newPartIds: string[] } {
  const oldMembers = existingParts.filter((p) => p.groupId === groupId);
  const oldMemberIds = new Set(oldMembers.map((p) => p.id));
  const oldBounds = getCorpusBounds(oldMembers);

  const preview = buildParametricCabinet({ ...nextCfg, autoFasteners: false }, 0, 0, groupId);
  const newBounds = getCorpusBounds(preview.parts);

  let offsetXmm = 0;
  let offsetZmm = 0;
  if (oldBounds && newBounds) {
    const oldCenterX = (oldBounds.minX + oldBounds.maxX) / 2;
    const newCenterX = (newBounds.minX + newBounds.maxX) / 2;
    offsetXmm = Math.round(oldCenterX - newCenterX);
    // Anchor rear face so depth changes grow forward cleanly away from the wall
    offsetZmm = Math.round(oldBounds.minZ - newBounds.minZ);
  }

  const rebuilt = buildParametricCabinet(nextCfg, offsetXmm, offsetZmm, groupId);

  const keptParts = existingParts.filter((p) => !oldMemberIds.has(p.id));
  const keptFasteners = existingFasteners.filter(
    (f) => !oldMemberIds.has(f.partId) && !(f.targetPartId && oldMemberIds.has(f.targetPartId))
  );

  return {
    parts: [...keptParts, ...rebuilt.parts],
    fasteners: [...keptFasteners, ...rebuilt.fasteners],
    newPartIds: rebuilt.parts.map((p) => p.id),
  };
}
