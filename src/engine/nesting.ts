import {
  getMaterialMeta,
  type FurniturePart,
  type MaterialId,
} from '../types/furniture';
import { computePolygonAreaM2 } from './geometry';

export interface CarpentryCutSpec {
  partId: string;
  partName: string;
  materialId: MaterialId;
  /** Nominal finished dimension along wood grain (mm) */
  grainLenMm: number;
  /** Nominal finished dimension across wood grain (mm) */
  crossWidMm: number;
  /** Board thickness (mm) */
  thicknessMm: number;
  /** Saw cut dimension along grain after 2mm ABS deduction (mm) */
  sawLenMm: number;
  /** Saw cut dimension across grain after 2mm ABS deduction (mm) */
  sawWidMm: number;
  /** True if material has directional wood grain (cannot freely rotate 90 deg on sheet) */
  grainLocked: boolean;
  /** Human-readable edge banding summary e.g. "2 mm (L1, S1)" or "Brak" */
  edgeBandingLabel: string;
  /** Total linear meters of edge banding for this part */
  edgeBandingLinearM: number;
  /** Net surface area in m2 */
  areaM2: number;
  /** True if custom 2D shape or sloped panel (needs bounding box on saw + angle cuts) */
  isIrregular: boolean;
}

export interface NestedPlacement {
  partId: string;
  partName: string;
  labelIndex: number;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
  rotated: boolean;
  oversized?: boolean;
  grainLocked: boolean;
}

export interface NestedSheet {
  sheetIndex: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  trimMm: number;
  placements: NestedPlacement[];
  usedAreaM2: number;
  wastePercent: number;
}

export interface MaterialNestingResult {
  /** Unique group key combining materialId and board thickness (e.g. "osb3__22") */
  groupKey: string;
  materialId: MaterialId;
  /** Exact board thickness for this sheet group (mm) */
  thicknessMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  kerfMm: number;
  trimMm: number;
  grainLocked: boolean;
  totalParts: number;
  totalSheets: number;
  totalBoardAreaM2: number;
  totalSheetAreaM2: number;
  wastePercent: number;
  estimatedCostPln: number;
  sheets: NestedSheet[];
}

export interface LinearCutPlacement {
  partId: string;
  partName: string;
  labelIndex: number;
  startMm: number;
  lengthMm: number;
  oversized?: boolean;
}

export interface LinearStockBar {
  barIndex: number;
  stockLengthMm: number;
  usedMm: number;
  wasteMm: number;
  wastePercent: number;
  cuts: LinearCutPlacement[];
}

export interface MaterialLinearResult {
  groupKey: string;
  materialId: MaterialId;
  /** Cross-section label e.g. "40×40 mm" */
  profileSectionLabel: string;
  sectionWidthMm: number;
  sectionDepthMm: number;
  stockLengthMm: number;
  kerfMm: number;
  totalParts: number;
  totalBars: number;
  totalCutLengthM: number;
  totalStockLengthM: number;
  wastePercent: number;
  pricePerLinearMPln: number;
  estimatedCostPln: number;
  bars: LinearStockBar[];
}

const DIRECTIONAL_GRAIN_MATERIALS = new Set<MaterialId>(['oak_craft', 'walnut']);

export function isMaterialGrainDirectional(materialId: MaterialId): boolean {
  if (DIRECTIONAL_GRAIN_MATERIALS.has(materialId)) return true;
  return Boolean(getMaterialMeta(materialId).grainDirectional);
}

/**
 * Computes true carpentry cut specification preserving wood grain orientation
 * and deducting 2 mm per edge when 2 mm ABS edge banding is enabled.
 */
export function getCarpentryCutSpec(part: FurniturePart): CarpentryCutSpec {
  const grainLocked = isMaterialGrainDirectional(part.materialId);

  // Identify thickness (smallest axis) and the two board-face dimensions.
  // Preserve which axis corresponds to the UV grain direction (local X unless rotated 90 deg).
  const dims = [
    { axis: 'x' as const, val: Math.round(part.width) },
    { axis: 'y' as const, val: Math.round(part.height) },
    { axis: 'z' as const, val: Math.round(part.depth) },
  ];

  // For custom / sloped panels, depth (Z) is always board thickness and X/Y are face dims
  let thicknessMm: number;
  let facePrimary: number; // along natural grain before grainRotated
  let faceSecondary: number;

  if (part.kind === 'custom' || part.kind === 'sloped') {
    thicknessMm = Math.round(part.depth);
    facePrimary = Math.round(part.width);
    faceSecondary = Math.round(part.height);
  } else {
    // Pick thinnest dimension as board thickness
    const sorted = [...dims].sort((a, b) => a.val - b.val);
    thicknessMm = sorted[0].val;
    const faceAxes = dims.filter((d) => d.axis !== sorted[0].axis);
    // Natural UV U-direction runs along X (if present), else Z (for side panels where X is thickness)
    const firstFace = faceAxes[0];
    const secondFace = faceAxes[1];
    // For horizontal boards (thickness = Y): faceAxes = [X, Z] -> grain runs along X
    // For front/back panels (thickness = Z): faceAxes = [X, Y] -> grain runs along X
    // For vertical side panels (thickness = X): faceAxes = [Y, Z] -> grain runs vertically along Y
    facePrimary = firstFace.val;
    faceSecondary = secondFace.val;
  }

  const grainLenMm = part.grainRotated ? faceSecondary : facePrimary;
  const crossWidMm = part.grainRotated ? facePrimary : faceSecondary;

  // Edge banding calculations
  const eb = part.edgeBanding;
  const ebThickness = eb?.thicknessMm ?? 0;
  const tags: string[] = [];
  let linearMm = 0;
  let deductGrainMm = 0;
  let deductCrossMm = 0;

  if (eb && ebThickness > 0) {
    // L1 (top) & L2 (bottom) run along grainLenMm -> they reduce crossWidMm when 2mm ABS is pre-milled
    // S1 (left) & S2 (right) run along crossWidMm -> they reduce grainLenMm when 2mm ABS is pre-milled
    const deductPerEdge = ebThickness === 2 ? 2 : 0;
    if (eb.top) {
      tags.push('L1');
      linearMm += grainLenMm;
      deductCrossMm += deductPerEdge;
    }
    if (eb.bottom) {
      tags.push('L2');
      linearMm += grainLenMm;
      deductCrossMm += deductPerEdge;
    }
    if (eb.left) {
      tags.push('S1');
      linearMm += crossWidMm;
      deductGrainMm += deductPerEdge;
    }
    if (eb.right) {
      tags.push('S2');
      linearMm += crossWidMm;
      deductGrainMm += deductPerEdge;
    }
  }

  const sawLenMm = Math.max(20, grainLenMm - deductGrainMm);
  const sawWidMm = Math.max(20, crossWidMm - deductCrossMm);

  const areaM2 =
    part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3
      ? computePolygonAreaM2(part.customPolygon)
      : (grainLenMm * crossWidMm) / 1_000_000;

  const edgeBandingLabel =
    tags.length > 0 && ebThickness > 0
      ? `${ebThickness} mm (${tags.join(', ')})`
      : 'Brak';

  return {
    partId: part.id,
    partName: part.name,
    materialId: part.materialId,
    grainLenMm,
    crossWidMm,
    thicknessMm,
    sawLenMm,
    sawWidMm,
    grainLocked,
    edgeBandingLabel,
    edgeBandingLinearM: Math.round((linearMm / 1000) * 100) / 100,
    areaM2,
    isIrregular: part.kind === 'custom' || part.kind === 'sloped',
  };
}

interface FreeRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SheetBuilder {
  sheetWidthMm: number;
  sheetHeightMm: number;
  trimMm: number;
  freeRects: FreeRect[];
  placements: NestedPlacement[];
}

function createSheetBuilder(
  sheetWidthMm: number,
  sheetHeightMm: number,
  trimMm: number
): SheetBuilder {
  const usableW = Math.max(100, sheetWidthMm - trimMm * 2);
  const usableH = Math.max(100, sheetHeightMm - trimMm * 2);
  return {
    sheetWidthMm,
    sheetHeightMm,
    trimMm,
    freeRects: [{ x: trimMm, y: trimMm, w: usableW, h: usableH }],
    placements: [],
  };
}

/**
 * 2D Guillotine Best-Short-Side-Fit placement with saw kerf allowance.
 */
function tryPlaceOnSheet(
  sheet: SheetBuilder,
  wMm: number,
  hMm: number,
  allowRotation: boolean,
  kerfMm: number
): { rectIndex: number; rotated: boolean; placeW: number; placeH: number } | null {
  let bestScore = Infinity;
  let bestSecondary = Infinity;
  let bestChoice: { rectIndex: number; rotated: boolean; placeW: number; placeH: number } | null =
    null;

  const orientations: Array<{ w: number; h: number; rotated: boolean }> = [
    { w: wMm, h: hMm, rotated: false },
  ];
  if (allowRotation && wMm !== hMm) {
    orientations.push({ w: hMm, h: wMm, rotated: true });
  }

  for (let i = 0; i < sheet.freeRects.length; i++) {
    const fr = sheet.freeRects[i];
    for (const ori of orientations) {
      if (ori.w <= fr.w && ori.h <= fr.h) {
        const leftoverH = fr.w - ori.w;
        const leftoverV = fr.h - ori.h;
        const shortSide = Math.min(leftoverH, leftoverV);
        const longSide = Math.max(leftoverH, leftoverV);
        if (
          shortSide < bestScore ||
          (shortSide === bestScore && longSide < bestSecondary)
        ) {
          bestScore = shortSide;
          bestSecondary = longSide;
          bestChoice = {
            rectIndex: i,
            rotated: ori.rotated,
            placeW: ori.w,
            placeH: ori.h,
          };
        }
      }
    }
  }

  if (!bestChoice) return null;

  // Guillotine split using Shorter Leftover Axis rule
  const fr = sheet.freeRects.splice(bestChoice.rectIndex, 1)[0];
  const rightW = fr.w - bestChoice.placeW - kerfMm;
  const bottomH = fr.h - bestChoice.placeH - kerfMm;

  if (rightW <= bottomH) {
    // Horizontal cut first (wider bottom strip)
    if (rightW > 15) {
      sheet.freeRects.push({
        x: fr.x + bestChoice.placeW + kerfMm,
        y: fr.y,
        w: rightW,
        h: bestChoice.placeH,
      });
    }
    if (bottomH > 15) {
      sheet.freeRects.push({
        x: fr.x,
        y: fr.y + bestChoice.placeH + kerfMm,
        w: fr.w,
        h: bottomH,
      });
    }
  } else {
    // Vertical cut first (taller right strip)
    if (bottomH > 15) {
      sheet.freeRects.push({
        x: fr.x,
        y: fr.y + bestChoice.placeH + kerfMm,
        w: bestChoice.placeW,
        h: bottomH,
      });
    }
    if (rightW > 15) {
      sheet.freeRects.push({
        x: fr.x + bestChoice.placeW + kerfMm,
        y: fr.y,
        w: rightW,
        h: fr.h,
      });
    }
  }

  return bestChoice;
}

/**
 * Runs real 2D guillotine sheet nesting grouped strictly by material + board thickness.
 * Prevents mixing e.g. 18 mm and 22 mm OSB or 3 mm HDF and 16 mm plywood onto the same sheet.
 */
export function nestMaterialSheets(
  parts: FurniturePart[],
  kerfMm = 4,
  trimMm = 10
): MaterialNestingResult[] {
  const byGroup = new Map<
    string,
    { materialId: MaterialId; thicknessMm: number; specs: CarpentryCutSpec[] }
  >();

  for (const part of parts) {
    // Steel linear profiles and 3D appliances/accessories are excluded from flat sheet nesting
    if (part.kind === 'profile' || part.kind === 'appliance') continue;
    const spec = getCarpentryCutSpec(part);
    const groupKey = `${part.materialId}__${spec.thicknessMm}`;
    const bucket = byGroup.get(groupKey) ?? {
      materialId: part.materialId,
      thicknessMm: spec.thicknessMm,
      specs: [],
    };
    bucket.specs.push(spec);
    byGroup.set(groupKey, bucket);
  }

  const results: MaterialNestingResult[] = [];

  for (const [groupKey, { materialId, thicknessMm, specs }] of byGroup.entries()) {
    const meta = getMaterialMeta(materialId);
    const sheetW = meta.sheetWidthMm;
    const sheetH = meta.sheetHeightMm;
    const grainLocked = isMaterialGrainDirectional(materialId);
    const allowRotation = !grainLocked;

    // Sort largest side first, then area descending for tightest guillotine packing
    const sorted = specs
      .map((s, idx) => ({ spec: s, labelIndex: idx + 1 }))
      .sort((a, b) => {
        const maxA = Math.max(a.spec.sawLenMm, a.spec.sawWidMm);
        const maxB = Math.max(b.spec.sawLenMm, b.spec.sawWidMm);
        if (maxB !== maxA) return maxB - maxA;
        return b.spec.sawLenMm * b.spec.sawWidMm - a.spec.sawLenMm * a.spec.sawWidMm;
      });

    const builders: SheetBuilder[] = [];
    const usableW = Math.max(100, sheetW - trimMm * 2);
    const usableH = Math.max(100, sheetH - trimMm * 2);

    for (const item of sorted) {
      const { spec, labelIndex } = item;
      const w = spec.sawLenMm;
      const h = spec.sawWidMm;

      let placed = false;
      for (const builder of builders) {
        const frBefore = [...builder.freeRects];
        const hit = tryPlaceOnSheet(builder, w, h, allowRotation, kerfMm);
        if (hit) {
          const placedRect = frBefore[hit.rectIndex];
          builder.placements.push({
            partId: spec.partId,
            partName: spec.partName,
            labelIndex,
            xMm: placedRect.x,
            yMm: placedRect.y,
            wMm: hit.placeW,
            hMm: hit.placeH,
            rotated: hit.rotated,
            grainLocked,
          });
          placed = true;
          break;
        }
      }

      if (!placed) {
        const fresh = createSheetBuilder(sheetW, sheetH, trimMm);
        const frBefore = [...fresh.freeRects];
        const hit = tryPlaceOnSheet(fresh, w, h, allowRotation, kerfMm);
        if (hit) {
          const placedRect = frBefore[hit.rectIndex];
          fresh.placements.push({
            partId: spec.partId,
            partName: spec.partName,
            labelIndex,
            xMm: placedRect.x,
            yMm: placedRect.y,
            wMm: hit.placeW,
            hMm: hit.placeH,
            rotated: hit.rotated,
            grainLocked,
          });
        } else {
          // Oversized piece larger than standard sheet — place flagged on its own sheet
          fresh.placements.push({
            partId: spec.partId,
            partName: spec.partName,
            labelIndex,
            xMm: trimMm,
            yMm: trimMm,
            wMm: Math.min(w, usableW),
            hMm: Math.min(h, usableH),
            rotated: false,
            oversized: true,
            grainLocked,
          });
        }
        builders.push(fresh);
      }
    }

    const singleSheetAreaM2 = (sheetW * sheetH) / 1_000_000;
    const sheets: NestedSheet[] = builders.map((b, idx) => {
      const usedM2 = b.placements.reduce(
        (sum, p) => sum + (p.wMm * p.hMm) / 1_000_000,
        0
      );
      const wastePercent = Math.max(
        0,
        Math.min(99, Math.round((1 - usedM2 / singleSheetAreaM2) * 100))
      );
      return {
        sheetIndex: idx + 1,
        sheetWidthMm: sheetW,
        sheetHeightMm: sheetH,
        trimMm,
        placements: b.placements,
        usedAreaM2: Math.round(usedM2 * 100) / 100,
        wastePercent,
      };
    });

    const totalBoardAreaM2 = specs.reduce((sum, s) => sum + s.areaM2, 0);
    const totalSheetAreaM2 = sheets.length * singleSheetAreaM2;
    const totalWastePercent =
      totalSheetAreaM2 > 0
        ? Math.max(
            0,
            Math.min(99, Math.round((1 - totalBoardAreaM2 / totalSheetAreaM2) * 100))
          )
        : 0;

    results.push({
      groupKey,
      materialId,
      thicknessMm,
      sheetWidthMm: sheetW,
      sheetHeightMm: sheetH,
      kerfMm,
      trimMm,
      grainLocked,
      totalParts: specs.length,
      totalSheets: sheets.length,
      totalBoardAreaM2: Math.round(totalBoardAreaM2 * 100) / 100,
      totalSheetAreaM2: Math.round(totalSheetAreaM2 * 100) / 100,
      wastePercent: totalWastePercent,
      estimatedCostPln: Math.round(totalSheetAreaM2 * meta.pricePerM2Pln),
      sheets,
    });
  }

  return results;
}

/**
 * 1D Linear Bar Cutting Optimization (Best-Fit-Decreasing) for steel profiles,
 * aluminum tracks, and wooden battens (`kind === 'profile'`).
 * Groups by material + cross-section (e.g. 40×40 mm) onto standard stock lengths (6000 mm / 3000 mm).
 */
export function nestLinearProfiles(
  parts: FurniturePart[],
  kerfMm = 3,
  endTrimMm = 20
): MaterialLinearResult[] {
  const groups = new Map<
    string,
    {
      materialId: MaterialId;
      secW: number;
      secD: number;
      items: Array<{ partId: string; partName: string; lengthMm: number }>;
    }
  >();

  for (const p of parts) {
    if (p.kind !== 'profile') continue;
    const dims = [Math.round(p.width), Math.round(p.height), Math.round(p.depth)].sort(
      (a, b) => a - b
    );
    const secW = dims[0];
    const secD = dims[1];
    const lengthMm = dims[2];
    const key = `${p.materialId}__${secW}x${secD}`;
    const bucket = groups.get(key) ?? {
      materialId: p.materialId,
      secW,
      secD,
      items: [],
    };
    bucket.items.push({ partId: p.id, partName: p.name, lengthMm });
    groups.set(key, bucket);
  }

  const results: MaterialLinearResult[] = [];

  for (const [groupKey, g] of groups.entries()) {
    const meta = getMaterialMeta(g.materialId);
    const isSteel =
      g.materialId === 'steel_black' ||
      g.materialId === 'steel_galv' ||
      meta.category === 'Stal i szkło';
    const stockLengthMm = meta.barLengthMm ?? (isSteel ? 6000 : 3000);
    const pricePerLinearMPln =
      meta.pricePerLinearMPln ?? (isSteel ? 30 : Math.max(12, Math.round(meta.pricePerM2Pln * 0.25)));

    const usableLen = Math.max(200, stockLengthMm - endTrimMm * 2);

    // Sort longest pieces first for Best-Fit-Decreasing 1D bin packing
    const sorted = g.items
      .map((it, idx) => ({ ...it, labelIndex: idx + 1 }))
      .sort((a, b) => b.lengthMm - a.lengthMm);

    const openBars: Array<{
      cursorMm: number;
      remainingMm: number;
      cuts: LinearCutPlacement[];
    }> = [];

    for (const piece of sorted) {
      const needMm = piece.lengthMm;
      let bestBarIdx = -1;
      let bestLeftover = Infinity;

      for (let i = 0; i < openBars.length; i++) {
        const bar = openBars[i];
        const extraKerf = bar.cuts.length > 0 ? kerfMm : 0;
        const required = needMm + extraKerf;
        if (required <= bar.remainingMm) {
          const leftover = bar.remainingMm - required;
          if (leftover < bestLeftover) {
            bestLeftover = leftover;
            bestBarIdx = i;
          }
        }
      }

      if (bestBarIdx >= 0) {
        const bar = openBars[bestBarIdx];
        const startMm = bar.cursorMm + (bar.cuts.length > 0 ? kerfMm : 0);
        bar.cuts.push({
          partId: piece.partId,
          partName: piece.partName,
          labelIndex: piece.labelIndex,
          startMm,
          lengthMm: needMm,
        });
        bar.cursorMm = startMm + needMm;
        bar.remainingMm = Math.max(0, stockLengthMm - endTrimMm - bar.cursorMm);
      } else {
        const oversized = needMm > usableLen;
        openBars.push({
          cursorMm: endTrimMm + Math.min(needMm, usableLen),
          remainingMm: Math.max(0, usableLen - needMm),
          cuts: [
            {
              partId: piece.partId,
              partName: piece.partName,
              labelIndex: piece.labelIndex,
              startMm: endTrimMm,
              lengthMm: needMm,
              oversized,
            },
          ],
        });
      }
    }

    const bars: LinearStockBar[] = openBars.map((b, idx) => {
      const usedMm = b.cuts.reduce((s, c) => s + c.lengthMm, 0);
      const wasteMm = Math.max(0, stockLengthMm - usedMm);
      const wastePercent = Math.max(
        0,
        Math.min(99, Math.round((wasteMm / stockLengthMm) * 100))
      );
      return {
        barIndex: idx + 1,
        stockLengthMm,
        usedMm,
        wasteMm,
        wastePercent,
        cuts: b.cuts,
      };
    });

    const totalCutMm = g.items.reduce((s, it) => s + it.lengthMm, 0);
    const totalStockMm = bars.length * stockLengthMm;
    const totalWastePercent =
      totalStockMm > 0
        ? Math.max(0, Math.min(99, Math.round(((totalStockMm - totalCutMm) / totalStockMm) * 100)))
        : 0;
    const totalStockLengthM = Math.round((totalStockMm / 1000) * 100) / 100;

    results.push({
      groupKey,
      materialId: g.materialId,
      profileSectionLabel: `${g.secW}×${g.secD} mm`,
      sectionWidthMm: g.secW,
      sectionDepthMm: g.secD,
      stockLengthMm,
      kerfMm,
      totalParts: g.items.length,
      totalBars: bars.length,
      totalCutLengthM: Math.round((totalCutMm / 1000) * 100) / 100,
      totalStockLengthM,
      wastePercent: totalWastePercent,
      pricePerLinearMPln,
      estimatedCostPln: Math.round(totalStockLengthM * pricePerLinearMPln),
      bars,
    });
  }

  return results;
}
