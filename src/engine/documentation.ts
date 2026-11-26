import * as THREE from 'three';
import {
  Fastener,
  FurniturePart,
  FurnitureProject,
  getMaterialMeta,
  PartCutout,
  QuoteSettings,
  SCREW_MAP,
} from '../types/furniture';
import { computeSawCutAngles, getPartQuaternion, getPartWorldBox } from './carpentry';
import { getProjectDimensionsMm } from './geometry';
import {
  nestLinearProfiles,
  type CarpentryCutSpec,
  type MaterialLinearResult,
  type MaterialNestingResult,
} from './nesting';
import { buildAssemblyPlan } from './assembly';

export interface DrillHole2D {
  id: string;
  /** X coordinate from left edge of the board's primary face (mm) */
  xMm: number;
  /** Y coordinate from bottom edge of the board's primary face (mm) */
  yMm: number;
  diameterMm: number;
  depthMm: number;
  face: 'Lico' | 'Tył/Wnętrze' | 'Krawędź';
  kind:
    | 'screw'
    | 'minifix_cam'
    | 'hinge_cup'
    | 'hinge_plate'
    | 'slide_rail'
    | 'shelf_pin'
    | 'dowel';
  label: string;
}

export interface BoardDrillingMap {
  part: FurniturePart;
  faceWidthMm: number;
  faceHeightMm: number;
  thicknessMm: number;
  thinAxis: 'x' | 'y' | 'z';
  holes: DrillHole2D[];
  cutouts: PartCutout[];
}

export interface HardwareBomSummary {
  hingeCupsCount: number;
  drawerSlidePairs: number;
  ballSlidePairs: number;
  undermountSlidePairs: number;
  handlesCount: number;
  tipOnCount: number;
  golaLinearM: number;
  slidingDoorsCount: number;
  legsCount: number;
  fastenersTotal: number;
  appliancesCount: number;
  appliancesCostPln: number;
}

export interface CommercialQuoteBreakdown {
  hardware: HardwareBomSummary;
  sheetsCostPln: number;
  linearBarsCount: number;
  linearProfilesCostPln: number;
  cuttingLinearM: number;
  cuttingCostPln: number;
  edgeBandingLinearM: number;
  edgeBandingCostPln: number;
  hardwareCostPln: number;
  laborCostPln: number;
  subtotalPln: number;
  marginPln: number;
  netTotalPln: number;
  vatPln: number;
  grossTotalPln: number;
}

function getBoardPrimaryPlane(part: FurniturePart): {
  thinAxis: 'x' | 'y' | 'z';
  faceW: number;
  faceH: number;
  thickness: number;
} {
  if (part.kind === 'custom' || part.kind === 'sloped') {
    return { thinAxis: 'z', faceW: part.width, faceH: part.height, thickness: part.depth };
  }
  if (part.depth <= part.width && part.depth <= part.height) {
    return { thinAxis: 'z', faceW: part.width, faceH: part.height, thickness: part.depth };
  }
  if (part.height <= part.width && part.height <= part.depth) {
    return { thinAxis: 'y', faceW: part.width, faceH: part.depth, thickness: part.height };
  }
  return { thinAxis: 'x', faceW: part.depth, faceH: part.height, thickness: part.width };
}

/**
 * Returns the exact 2D board outer contour vertices [xMm, yMm] in bottom-left origin coordinates
 * (X in [0, faceW], Y in [0, faceH]) for rectangular, sloped trapezoid, and custom polygon parts.
 */
export function getBoardOutline2D(
  part: FurniturePart,
  faceW: number,
  faceH: number
): [number, number][] {
  if (part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3) {
    const pts = part.customPolygon;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const rawW = Math.max(1, maxX - minX);
    const rawH = Math.max(1, maxY - minY);
    return pts.map(([px, py]) => [
      Math.round(((px - minX) / rawW) * faceW * 10) / 10,
      Math.round(((py - minY) / rawH) * faceH * 10) / 10,
    ]);
  }
  if (part.kind === 'sloped') {
    const bl = Math.max(0, Math.min(faceH - 20, part.slopeBottomLeft ?? 0));
    const br = Math.max(0, Math.min(faceH - 20, part.slopeBottomRight ?? 0));
    const tr = Math.max(br + 20, faceH - Math.max(0, part.slopeTopRight ?? 0));
    const tl = Math.max(bl + 20, faceH - Math.max(0, part.slopeTopLeft ?? 0));
    return [
      [0, bl],
      [faceW, br],
      [faceW, tr],
      [0, tl],
    ];
  }
  return [
    [0, 0],
    [faceW, 0],
    [faceW, faceH],
    [0, faceH],
  ];
}

/**
 * Returns the exact 2D dado groove segment in bottom-left board coordinates (X in [0..faceW], Y in [0..faceH]).
 * Correctly places `edge: 'back'` vertically along X = insetMm for vertical side walls (thinAxis === 'x').
 */
export function getDadoGrooveLine2D(
  part: FurniturePart,
  thinAxis: 'x' | 'y' | 'z',
  faceW: number,
  faceH: number
): { x1: number; y1: number; x2: number; y2: number; widthMm: number; depthMm: number } | null {
  if (!part.dadoGroove?.enabled) return null;
  const ins = Math.max(2, part.dadoGroove.insetMm);
  const edge = part.dadoGroove.edge;
  const widthMm = part.dadoGroove.widthMm;
  const depthMm = part.dadoGroove.depthMm;

  if (thinAxis === 'x') {
    // Vertical side wall: X=0 is back (-Z), X=faceW is front (+Z), Y=0..faceH is bottom..top
    if (edge === 'back') {
      return { x1: ins, y1: 0, x2: ins, y2: faceH, widthMm, depthMm };
    }
    if (edge === 'top') {
      const y = Math.max(2, faceH - ins);
      return { x1: 0, y1: y, x2: faceW, y2: y, widthMm, depthMm };
    }
    return { x1: 0, y1: ins, x2: faceW, y2: ins, widthMm, depthMm };
  }
  if (thinAxis === 'y') {
    // Horizontal deck/shelf: X=width, Y=0 is back (-Z), Y=faceH is front (+Z)
    if (edge === 'top') {
      const y = Math.max(2, faceH - ins);
      return { x1: 0, y1: y, x2: faceW, y2: y, widthMm, depthMm };
    }
    return { x1: 0, y1: ins, x2: faceW, y2: ins, widthMm, depthMm };
  }
  // Front/back panel (thinAxis === 'z'): X=width, Y=height
  if (edge === 'top') {
    const y = Math.max(2, faceH - ins);
    return { x1: 0, y1: y, x2: faceW, y2: y, widthMm, depthMm };
  }
  return { x1: 0, y1: ins, x2: faceW, y2: ins, widthMm, depthMm };
}

function localPointToBoard2D(
  localPt: [number, number, number],
  thinAxis: 'x' | 'y' | 'z',
  faceW: number,
  faceH: number
): [number, number] {
  if (thinAxis === 'z') {
    return [
      Math.round((localPt[0] + faceW / 2) * 10) / 10,
      Math.round((localPt[1] + faceH / 2) * 10) / 10,
    ];
  }
  if (thinAxis === 'y') {
    return [
      Math.round((localPt[0] + faceW / 2) * 10) / 10,
      Math.round((localPt[2] + faceH / 2) * 10) / 10,
    ];
  }
  // thinAxis === 'x' -> faceW = depth (Z), faceH = height (Y)
  return [
    Math.round((localPt[2] + faceW / 2) * 10) / 10,
    Math.round((localPt[1] + faceH / 2) * 10) / 10,
  ];
}

/**
 * Extracts a workshop-accurate 2D Drilling Map (X/Y from bottom-left corner of the board)
 * including through-face screws, Minifix Ø15 cam pockets, mating-edge holes, and Ø35 mm cup hinges.
 */
export function extractBoardDrillingMap(
  part: FurniturePart,
  allParts: FurniturePart[],
  fasteners: Fastener[]
): BoardDrillingMap {
  const { thinAxis, faceW, faceH, thickness } = getBoardPrimaryPlane(part);
  const holes: DrillHole2D[] = [];
  const partMap = new Map(allParts.map((p) => [p.id, p]));

  const invPartQuat = getPartQuaternion(part).invert();
  const partPos = new THREE.Vector3(...part.position);

  for (const f of fasteners) {
    const meta = SCREW_MAP[f.type];
    if (f.partId === part.id) {
      const [xMm, yMm] = localPointToBoard2D(f.localPosition, thinAxis, faceW, faceH);
      holes.push({
        id: `${f.id}_host`,
        xMm: Math.max(0, Math.min(faceW, xMm)),
        yMm: Math.max(0, Math.min(faceH, yMm)),
        diameterMm: f.type === 'minifix_15' ? 5 : meta.diameterMm,
        depthMm: Math.min(thickness, meta.lengthMm),
        face: 'Lico',
        kind: f.type === 'dowel_8x35' ? 'dowel' : 'screw',
        label:
          f.type === 'minifix_15'
            ? 'Trzpień Minifix Ø5'
            : `${meta.shortName} (przelot)`,
      });
    } else if (f.targetPartId === part.id) {
      // Project fastener tip/cam position from host into this mating board's local frame
      const host = partMap.get(f.partId);
      if (!host) continue;
      const hostQuat = getPartQuaternion(host);
      const headW = new THREE.Vector3(...f.localPosition)
        .applyQuaternion(hostQuat)
        .add(new THREE.Vector3(...host.position));
      const inwardW = new THREE.Vector3(...f.localNormal)
        .applyQuaternion(hostQuat)
        .normalize()
        .negate();
      const depthProbe = f.type === 'minifix_15' ? 34 : Math.min(meta.lengthMm * 0.7, 30);
      const hitW = headW.addScaledVector(inwardW, depthProbe);
      const rel = hitW.sub(partPos).applyQuaternion(invPartQuat);
      const [xMm, yMm] = localPointToBoard2D([rel.x, rel.y, rel.z], thinAxis, faceW, faceH);

      holes.push({
        id: `${f.id}_target`,
        xMm: Math.max(0, Math.min(faceW, xMm)),
        yMm: Math.max(0, Math.min(faceH, yMm)),
        diameterMm: f.type === 'minifix_15' ? 15 : meta.diameterMm,
        depthMm: f.type === 'minifix_15' ? 13 : Math.max(12, meta.lengthMm - 18),
        face: f.type === 'minifix_15' ? 'Tył/Wnętrze' : 'Krawędź',
        kind: f.type === 'minifix_15' ? 'minifix_cam' : f.type === 'dowel_8x35' ? 'dowel' : 'screw',
        label:
          f.type === 'minifix_15'
            ? 'Puszka Minifix Ø15×13'
            : `${meta.shortName} (w krawędź)`,
      });
    }
  }

  // Add Ø35 mm cup hinge drillings on cabinet doors
  if (part.kind === 'door' && part.hingeSide && part.hingeSide !== 'none') {
    const count = Math.max(2, Math.min(5, part.hingeCount ?? (part.height > 1500 ? 4 : part.height > 950 ? 3 : 2)));
    const cupInset = 22.5;
    for (let i = 0; i < count; i++) {
      const frac = count === 1 ? 0.5 : i / (count - 1);
      let xMm = faceW / 2;
      let yMm = faceH / 2;
      if (part.hingeSide === 'top') {
        const margin = Math.min(100, faceW * 0.2);
        xMm = Math.round(margin + frac * Math.max(40, faceW - margin * 2));
        yMm = Math.round(faceH - cupInset);
      } else {
        const margin = Math.min(100, faceH * 0.18);
        yMm = Math.round(margin + frac * Math.max(40, faceH - margin * 2));
        xMm = part.hingeSide === 'left' ? cupInset : Math.round((faceW - cupInset) * 10) / 10;
      }
      holes.push({
        id: `${part.id}_hinge_${i}`,
        xMm,
        yMm,
        diameterMm: 35,
        depthMm: 13,
        face: 'Tył/Wnętrze',
        kind: 'hinge_cup',
        label: `Puszka zawiasu Ø35×13 #${i + 1}`,
      });
    }
  }

  // System 32 auto-drilling on vertical side walls (thinAxis === 'x')
  if (thinAxis === 'x' && part.kind === 'panel' && faceW >= 200 && faceH >= 200) {
    const sideBox = getPartWorldBox(part);
    const frontEdgeX = faceW; // local +Z maps to X = faceW on vertical side walls

    // 1. Matching System 32 Hinge Mounting Plates (37 mm from front edge, ±16 mm = 32 mm pitch)
    for (const other of allParts) {
      if (other.id === part.id || other.kind !== 'door') continue;
      if (!other.hingeSide || other.hingeSide === 'none' || other.hingeSide === 'top') continue;
      const ob = getPartWorldBox(other);
      // Door must sit near the front face of this side wall
      if (Math.abs(ob.minZ - sideBox.maxZ) > 35 && Math.abs(ob.maxZ - sideBox.maxZ) > 35) continue;
      const hingeWorldX = other.hingeSide === 'left' ? ob.minX : ob.maxX;
      if (Math.abs(hingeWorldX - part.position[0]) > 35) continue;

      const count = Math.max(
        2,
        Math.min(5, other.hingeCount ?? (other.height > 1500 ? 4 : other.height > 950 ? 3 : 2))
      );
      const margin = Math.min(100, other.height * 0.18);
      for (let i = 0; i < count; i++) {
        const frac = count === 1 ? 0.5 : i / (count - 1);
        const hingeWorldY = ob.minY + margin + frac * Math.max(40, other.height - margin * 2);
        const localY = hingeWorldY - sideBox.minY;
        if (localY < 24 || localY > faceH - 24) continue;
        const px = Math.max(12, Math.round((frontEdgeX - 37) * 10) / 10);
        holes.push(
          {
            id: `${part.id}_hplate_${other.id}_${i}_a`,
            xMm: px,
            yMm: Math.round((localY - 16) * 10) / 10,
            diameterMm: 5,
            depthMm: 12,
            face: 'Tył/Wnętrze',
            kind: 'hinge_plate',
            label: `Prowadnik zawiasu S32 (37mm) #${i + 1}A`,
          },
          {
            id: `${part.id}_hplate_${other.id}_${i}_b`,
            xMm: px,
            yMm: Math.round((localY + 16) * 10) / 10,
            diameterMm: 5,
            depthMm: 12,
            face: 'Tył/Wnętrze',
            kind: 'hinge_plate',
            label: `Prowadnik zawiasu S32 (37mm) #${i + 1}B`,
          }
        );
      }
    }

    // 2. Matching System 32 Drawer Slide Rail Holes (37 mm from front + 32 mm multiples)
    for (const other of allParts) {
      if (other.id === part.id || !other.drawerSlideType || other.drawerSlideType === 'none') continue;
      const ob = getPartWorldBox(other);
      // Drawer must lie within this side wall's vertical range and flank this side in X
      if (ob.maxY < sideBox.minY + 10 || ob.minY > sideBox.maxY - 10) continue;
      const nearSideX =
        Math.abs(ob.minX - sideBox.maxX) <= 45 ||
        Math.abs(ob.maxX - sideBox.minX) <= 45 ||
        Math.abs(ob.minX - sideBox.minX) <= 30 ||
        Math.abs(ob.maxX - sideBox.maxX) <= 30;
      if (!nearSideX) continue;

      const railY = Math.round(
        (other.drawerSlideType === 'undermount_blum'
          ? ob.minY + 28 - sideBox.minY
          : (ob.minY + ob.maxY) / 2 - sideBox.minY) * 10
      ) / 10;
      if (railY < 20 || railY > faceH - 20) continue;

      const railOffsets = [37, 37 + 96, 37 + 224].filter((off) => frontEdgeX - off >= 35);
      railOffsets.forEach((off, idx) => {
        holes.push({
          id: `${part.id}_slide_${other.id}_${idx}`,
          xMm: Math.round((frontEdgeX - off) * 10) / 10,
          yMm: railY,
          diameterMm: 5,
          depthMm: 12,
          face: 'Tył/Wnętrze',
          kind: 'slide_rail',
          label: `Prowadnica S32 (${off}mm od przodu)`,
        });
      });
    }

    // 3. Optional System 32 Adjustable Shelf-Pin Rows (dual Ø5×12 columns, 37 mm from front & rear)
    if (part.system32ShelfHoles) {
      const colFrontX = Math.max(20, frontEdgeX - 37);
      const colRearX = Math.min(colFrontX - 64, 37 + (part.dadoGroove?.enabled ? 20 : 0));
      const startY = 128;
      const endY = faceH - 128;
      let idx = 0;
      for (let y = startY; y <= endY; y += 32) {
        idx++;
        holes.push({
          id: `${part.id}_s32_f_${idx}`,
          xMm: Math.round(colFrontX * 10) / 10,
          yMm: y,
          diameterMm: 5,
          depthMm: 12,
          face: 'Tył/Wnętrze',
          kind: 'shelf_pin',
          label: `System 32 podpórka P #${idx}`,
        });
        if (colRearX >= 25 && colRearX < colFrontX - 40) {
          holes.push({
            id: `${part.id}_s32_r_${idx}`,
            xMm: Math.round(colRearX * 10) / 10,
            yMm: y,
            diameterMm: 5,
            depthMm: 12,
            face: 'Tył/Wnętrze',
            kind: 'shelf_pin',
            label: `System 32 podpórka T #${idx}`,
          });
        }
      }
    }
  }

  return {
    part,
    faceWidthMm: Math.round(faceW),
    faceHeightMm: Math.round(faceH),
    thicknessMm: Math.round(thickness),
    thinAxis,
    holes,
    cutouts: part.cutouts ?? [],
  };
}

/**
 * Computes full commercial carpentry quote (sheets + cutting + ABS edge banding + hardware BOM + labor + margin + VAT).
 */
export function computeCommercialQuote(
  project: FurnitureProject,
  nestingResults: MaterialNestingResult[],
  cutSpecs: Map<string, CarpentryCutSpec>,
  settings: QuoteSettings,
  linearResults?: MaterialLinearResult[]
): CommercialQuoteBreakdown {
  let sheetsCostPln = 0;
  for (const nr of nestingResults) {
    sheetsCostPln += nr.estimatedCostPln;
  }

  const linear = linearResults ?? nestLinearProfiles(project.parts);
  const linearBarsCount = linear.reduce((s, r) => s + r.totalBars, 0);
  const linearProfilesCostPln = linear.reduce((s, r) => s + r.estimatedCostPln, 0);

  let cuttingLinearM = 0;
  let edgeBandingLinearM = 0;
  let hingeCupsCount = 0;
  let ballSlidePairs = 0;
  let undermountSlidePairs = 0;
  let handlesCount = 0;
  let tipOnCount = 0;
  let golaLinearMm = 0;
  let slidingDoorsCount = 0;
  let legsCount = 0;
  let appliancesCount = 0;
  let appliancesCostPln = 0;

  for (const p of project.parts) {
    if (p.kind === 'appliance') {
      appliancesCount += 1;
      appliancesCostPln += Math.round(p.appliancePricePln ?? 0);
      continue;
    }

    const spec = cutSpecs.get(p.id);
    if (spec && p.kind !== 'profile') {
      cuttingLinearM += (spec.sawLenMm + spec.sawWidMm) / 1000;
      edgeBandingLinearM += spec.edgeBandingLinearM;
    }

    if (p.kind === 'door') {
      const style = p.handleStyle ?? 'bar';
      if (style === 'tip_on') {
        tipOnCount += 1;
      } else if (style === 'gola_j' && p.handleSide && p.handleSide !== 'none') {
        golaLinearMm += p.handleSide === 'top' ? p.width : p.height;
      } else if (style === 'bar' && p.handleSide && p.handleSide !== 'none') {
        handlesCount += 1;
      }
      if (p.hingeSide && p.hingeSide !== 'none') {
        hingeCupsCount += p.hingeCount ?? (p.height > 1500 ? 4 : p.height > 950 ? 3 : 2);
      }
      if (p.hardwareTag === 'sliding_door') {
        slidingDoorsCount += 1;
      }
    }
    if (p.drawerSlideType === 'ball_26mm') ballSlidePairs += 1;
    else if (p.drawerSlideType === 'undermount_blum') undermountSlidePairs += 1;

    if (p.hardwareTag === 'leg') legsCount += 1;
  }

  const drawerSlidePairs = ballSlidePairs + undermountSlidePairs;
  const fastenersTotal = project.fasteners.length;
  const golaLinearM = Math.round((golaLinearMm / 1000) * 100) / 100;

  const cuttingCostPln = Math.round(cuttingLinearM * settings.cuttingPricePerMbPln);
  const edgeBandingCostPln = Math.round(edgeBandingLinearM * settings.edgeBandingPricePerMbPln);
  const hardwareCostPln = Math.round(
    hingeCupsCount * settings.hingePricePln +
      drawerSlidePairs * settings.slidePairPricePln +
      handlesCount * settings.handlePricePln +
      tipOnCount * 22 +
      golaLinearM * 68 +
      slidingDoorsCount * 145 +
      legsCount * settings.legPricePln +
      fastenersTotal * settings.fastenerPricePln +
      appliancesCostPln
  );
  const laborCostPln = Math.round(settings.laborHours * settings.laborRatePln);
  const subtotalPln =
    sheetsCostPln +
    linearProfilesCostPln +
    cuttingCostPln +
    edgeBandingCostPln +
    hardwareCostPln +
    laborCostPln;
  const marginPln = Math.round(subtotalPln * (settings.marginPercent / 100));
  const netTotalPln = subtotalPln + marginPln;
  const vatPln = Math.round(netTotalPln * (settings.vatPercent / 100));
  const grossTotalPln = netTotalPln + vatPln;

  return {
    hardware: {
      hingeCupsCount,
      drawerSlidePairs,
      ballSlidePairs,
      undermountSlidePairs,
      handlesCount,
      tipOnCount,
      golaLinearM,
      slidingDoorsCount,
      legsCount,
      fastenersTotal,
      appliancesCount,
      appliancesCostPln,
    },
    sheetsCostPln,
    linearBarsCount,
    linearProfilesCostPln,
    cuttingLinearM: Math.round(cuttingLinearM * 10) / 10,
    cuttingCostPln,
    edgeBandingLinearM: Math.round(edgeBandingLinearM * 100) / 100,
    edgeBandingCostPln,
    hardwareCostPln,
    laborCostPln,
    subtotalPln,
    marginPln,
    netTotalPln,
    vatPln,
    grossTotalPln,
  };
}

/**
 * Generates a standards-compliant AutoCAD R12 ASCII DXF file containing all project boards
 * arranged in a clean 2D production grid with dedicated CAD/CNC layers:
 *   OUTLINE (board contours & rounded corners), CUTOUT (internal holes), DRILL (screw/hinge circles),
 *   GROOVE (dado back grooves), TEXT (part index & dimensions).
 */
export function generateProjectDxf(
  parts: FurniturePart[],
  fasteners: Fastener[]
): string {
  const lines: string[] = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$INSUNITS', '70', '4', // Millimeters
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'ENTITIES',
  ];

  const addLine = (layer: string, x1: number, y1: number, x2: number, y2: number) => {
    lines.push(
      '0', 'LINE',
      '8', layer,
      '10', x1.toFixed(2),
      '20', y1.toFixed(2),
      '11', x2.toFixed(2),
      '21', y2.toFixed(2)
    );
  };

  const addCircle = (layer: string, cx: number, cy: number, r: number) => {
    lines.push(
      '0', 'CIRCLE',
      '8', layer,
      '10', cx.toFixed(2),
      '20', cy.toFixed(2),
      '40', r.toFixed(2)
    );
  };

  const addText = (layer: string, x: number, y: number, height: number, text: string) => {
    const clean = text.replace(/[^\x20-\x7E]/g, (ch) => {
      const map: Record<string, string> = {
        ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z',
        Ą: 'A', Ć: 'C', Ę: 'E', Ł: 'L', Ń: 'N', Ó: 'O', Ś: 'S', Ź: 'Z', Ż: 'Z',
        Ø: 'fi', '×': 'x', '—': '-',
      };
      return map[ch] ?? '';
    });
    lines.push(
      '0', 'TEXT',
      '8', layer,
      '10', x.toFixed(2),
      '20', y.toFixed(2),
      '40', height.toFixed(1),
      '1', clean
    );
  };

  let cursorX = 0;
  let cursorY = 0;
  let rowMaxH = 0;
  const maxRowW = 3600;
  const gap = 120;

  parts.filter((p) => p.kind !== 'appliance').forEach((part, idx) => {
    const map = extractBoardDrillingMap(part, parts, fasteners);
    const w = map.faceWidthMm;
    const h = map.faceHeightMm;

    if (cursorX > 0 && cursorX + w > maxRowW) {
      cursorX = 0;
      cursorY += rowMaxH + gap;
      rowMaxH = 0;
    }

    const ox = cursorX;
    const oy = cursorY;

    // 1. Outer contour on layer OUTLINE (exact polygon for sloped trapezoids & custom 2D shapes!)
    const outlinePts = getBoardOutline2D(part, w, h);
    for (let i = 0; i < outlinePts.length; i++) {
      const [x1, y1] = outlinePts[i];
      const [x2, y2] = outlinePts[(i + 1) % outlinePts.length];
      addLine('OUTLINE', ox + x1, oy + y1, ox + x2, oy + y2);
    }

    // 2. Internal cutouts on layer CUTOUT
    for (const c of map.cutouts) {
      const cx = ox + w / 2 + c.xMm;
      const cy = oy + h / 2 + c.yMm;
      if (c.shape === 'circle') {
        addCircle('CUTOUT', cx, cy, (c.diameterMm ?? c.widthMm) / 2);
      } else {
        const hw = c.widthMm / 2;
        const hh = c.heightMm / 2;
        addLine('CUTOUT', cx - hw, cy - hh, cx + hw, cy - hh);
        addLine('CUTOUT', cx + hw, cy - hh, cx + hw, cy + hh);
        addLine('CUTOUT', cx + hw, cy + hh, cx - hw, cy + hh);
        addLine('CUTOUT', cx - hw, cy + hh, cx - hw, cy - hh);
      }
    }

    // 3. Drill holes on layer DRILL
    for (const hole of map.holes) {
      addCircle('DRILL', ox + hole.xMm, oy + hole.yMm, Math.max(1.5, hole.diameterMm / 2));
    }

    // 4. Dado groove on layer GROOVE (respects vertical side wall X-axis vs horizontal Y-axis)
    const groove = getDadoGrooveLine2D(part, map.thinAxis, w, h);
    if (groove) {
      addLine('GROOVE', ox + groove.x1, oy + groove.y1, ox + groove.x2, oy + groove.y2);
    }

    // 5. Part label on layer TEXT
    addText(
      'TEXT',
      ox + 12,
      oy + h + 18,
      20,
      `#${idx + 1} ${part.name} (${w}x${h}x${map.thicknessMm}mm)`
    );

    cursorX += w + gap;
    rowMaxH = Math.max(rowMaxH, h + 60);
  });

  lines.push('0', 'ENDSEC', '0', 'EOF');
  return lines.join('\n');
}

function getPartLocalVertices3D(part: FurniturePart): THREE.Vector3[] {
  const hw = part.width / 2;
  const hh = part.height / 2;
  const hd = part.depth / 2;

  if (part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3) {
    const pts = part.customPolygon;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [px, py] of pts) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const rawW = Math.max(1, maxX - minX);
    const rawH = Math.max(1, maxY - minY);
    const verts: THREE.Vector3[] = [];
    for (const [px, py] of pts) {
      const lx = ((px - minX) / rawW - 0.5) * part.width;
      const ly = ((py - minY) / rawH - 0.5) * part.height;
      verts.push(new THREE.Vector3(lx, ly, -hd), new THREE.Vector3(lx, ly, hd));
    }
    return verts;
  }

  if (part.kind === 'sloped') {
    const yBL = -hh + Math.max(0, Math.min(part.height - 20, part.slopeBottomLeft ?? 0));
    const yBR = -hh + Math.max(0, Math.min(part.height - 20, part.slopeBottomRight ?? 0));
    const yTL = Math.max(yBL + 20, hh - Math.max(0, part.slopeTopLeft ?? 0));
    const yTR = Math.max(yBR + 20, hh - Math.max(0, part.slopeTopRight ?? 0));
    return [
      new THREE.Vector3(-hw, yBL, -hd),
      new THREE.Vector3(hw, yBR, -hd),
      new THREE.Vector3(hw, yTR, -hd),
      new THREE.Vector3(-hw, yTL, -hd),
      new THREE.Vector3(-hw, yBL, hd),
      new THREE.Vector3(hw, yBR, hd),
      new THREE.Vector3(hw, yTR, hd),
      new THREE.Vector3(-hw, yTL, hd),
    ];
  }

  return [
    new THREE.Vector3(-hw, -hh, -hd),
    new THREE.Vector3(hw, -hh, -hd),
    new THREE.Vector3(hw, hh, -hd),
    new THREE.Vector3(-hw, hh, -hd),
    new THREE.Vector3(-hw, -hh, hd),
    new THREE.Vector3(hw, -hh, hd),
    new THREE.Vector3(hw, hh, hd),
    new THREE.Vector3(-hw, hh, hd),
  ];
}

function convexHull2D(points: [number, number][]): [number, number][] {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);

  const lower: [number, number][] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: [number, number][] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return [...lower, ...upper];
}

/**
 * Builds crisp 2D Orthographic Projection SVGs (Front XY, Side ZY, Top XZ) of the whole furniture piece.
 * Projects exact 3D vertices + 2D convex hull so rotated roofs, tilted shelves, and sloped panels draw accurately.
 */
export function buildOrthographicSvg(
  parts: FurniturePart[],
  view: 'front' | 'side' | 'top'
): string {
  if (parts.length === 0) {
    return '<svg viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg"></svg>';
  }

  let minU = Infinity,
    maxU = -Infinity,
    minV = Infinity,
    maxV = -Infinity;

  const shapes = parts.map((part) => {
    const quat = getPartQuaternion(part);
    const pos = new THREE.Vector3(...part.position);
    const projected: [number, number][] = getPartLocalVertices3D(part).map((v) => {
      const w = v.applyQuaternion(quat).add(pos);
      const u = view === 'side' ? w.z : w.x;
      const vv = view === 'top' ? w.z : w.y;
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
      if (vv < minV) minV = vv;
      if (vv > maxV) maxV = vv;
      return [u, vv];
    });
    const hull = convexHull2D(projected);
    return { part, hull };
  });

  const spanU = Math.max(100, maxU - minU);
  const spanV = Math.max(100, maxV - minV);
  const pad = Math.max(140, Math.max(spanU, spanV) * 0.14);
  const vbW = spanU + pad * 2;
  const vbH = spanV + pad * 2;
  const sw = Math.max(2, Math.max(spanU, spanV) * 0.004);
  const fs = Math.max(24, Math.max(spanU, spanV) * 0.042);

  const mapU = (u: number) => pad + (u - minU);
  const mapV = (v: number) => (view === 'top' ? pad + (v - minV) : pad + (maxV - v));

  const bodyPolys = shapes
    .map(({ part, hull }) => {
      const fill =
        part.kind === 'door'
          ? '#FDE68A'
          : part.kind === 'countertop'
            ? '#E5E7EB'
            : part.kind === 'profile'
              ? '#CBD5E1'
              : '#F8FAFC';
      const ptsStr = hull
        .map(([u, v]) => `${mapU(u).toFixed(1)},${mapV(v).toFixed(1)}`)
        .join(' ');
      return `<polygon points="${ptsStr}" fill="${fill}" fill-opacity="0.76" stroke="#18181B" stroke-width="${sw.toFixed(1)}" stroke-linejoin="round" />`;
    })
    .join('');

  // Overall width & height dimension lines
  const dimBottomY = pad + spanV + pad * 0.52;
  const dimRightX = pad + spanU + pad * 0.52;

  return `<svg viewBox="0 0 ${vbW.toFixed(0)} ${vbH.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:220px;background:#FFFFFF;border:1px solid #E4E4E7;border-radius:8px;">
    ${bodyPolys}
    <line x1="${pad}" y1="${dimBottomY}" x2="${pad + spanU}" y2="${dimBottomY}" stroke="#D97706" stroke-width="${sw}" />
    <text x="${pad + spanU / 2}" y="${dimBottomY + fs * 1.05}" text-anchor="middle" fill="#18181B" font-size="${fs.toFixed(0)}" font-family="monospace" font-weight="700">${Math.round(spanU)} mm</text>
    <line x1="${dimRightX}" y1="${pad}" x2="${dimRightX}" y2="${pad + spanV}" stroke="#D97706" stroke-width="${sw}" />
    <text x="${dimRightX + fs * 0.35}" y="${pad + spanV / 2}" text-anchor="start" fill="#18181B" font-size="${fs.toFixed(0)}" font-family="monospace" font-weight="700">${Math.round(spanV)} mm</text>
  </svg>`;
}

const PDF_NEST_COLORS = [
  '#D97706',
  '#0284C7',
  '#059669',
  '#7C3AED',
  '#DB2777',
  '#EA580C',
  '#0D9488',
  '#4F46E5',
];

function buildPdfNestingSectionHtml(
  nestingResults: MaterialNestingResult[],
  linearResults: MaterialLinearResult[]
): string {
  if (nestingResults.length === 0 && linearResults.length === 0) return '';

  const sheetsHtml = nestingResults
    .map((nr) => {
      const meta = getMaterialMeta(nr.materialId);
      const sheetSvgs = nr.sheets
        .map((sheet) => {
          const w = sheet.sheetWidthMm;
          const h = sheet.sheetHeightMm;
          const pieces = sheet.placements
            .map((pl, idx) => {
              const color = pl.oversized
                ? '#DC2626'
                : PDF_NEST_COLORS[idx % PDF_NEST_COLORS.length];
              const fontSize = Math.max(24, Math.min(54, Math.min(pl.wMm, pl.hMm) * 0.22));
              const showDims = pl.wMm >= 140 && pl.hMm >= 90;
              return `<g>
                <rect x="${pl.xMm}" y="${pl.yMm}" width="${pl.wMm}" height="${pl.hMm}" fill="${color}" fill-opacity="0.18" stroke="${color}" stroke-width="5" />
                <text x="${pl.xMm + pl.wMm / 2}" y="${pl.yMm + pl.hMm / 2 - (showDims ? fontSize * 0.25 : 0)}" text-anchor="middle" dominant-baseline="middle" fill="#18181B" font-size="${fontSize.toFixed(0)}" font-family="monospace" font-weight="700">#${pl.labelIndex}</text>
                ${
                  showDims
                    ? `<text x="${pl.xMm + pl.wMm / 2}" y="${pl.yMm + pl.hMm / 2 + fontSize * 0.78}" text-anchor="middle" dominant-baseline="middle" fill="#3F3F46" font-size="${(fontSize * 0.62).toFixed(0)}" font-family="monospace">${pl.wMm}×${pl.hMm}${pl.rotated ? ' ↻' : ''}</text>`
                    : ''
                }
              </g>`;
            })
            .join('');

          return `<div class="nest-card">
            <div class="nest-head">
              <strong>${escapeHtml(meta.name)} (${nr.thicknessMm} mm) — Arkusz #${sheet.sheetIndex}</strong>
              <span>${w} × ${h} mm · ${sheet.placements.length} szt. · Odpad ${sheet.wastePercent}%${nr.grainLocked ? ' · Słój →' : ''}</span>
            </div>
            <svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:200px;background:#FAFAFA;border:1px solid #D4D4D8;border-radius:4px;">
              <rect x="0" y="0" width="${w}" height="${h}" fill="#F4F4F5" stroke="#52525B" stroke-width="6" />
              ${pieces}
            </svg>
          </div>`;
        })
        .join('');
      return sheetSvgs;
    })
    .join('');

  const barsHtml = linearResults
    .map((lr) => {
      const meta = getMaterialMeta(lr.materialId);
      return lr.bars
        .map((bar) => {
          const L = bar.stockLengthMm;
          const barH = 260;
          const cutsSvg = bar.cuts
            .map((c, idx) => {
              const color = c.oversized
                ? '#DC2626'
                : PDF_NEST_COLORS[idx % PDF_NEST_COLORS.length];
              return `<g>
                <rect x="${c.startMm}" y="30" width="${c.lengthMm}" height="${barH - 60}" fill="${color}" fill-opacity="0.22" stroke="${color}" stroke-width="8" />
                <text x="${c.startMm + c.lengthMm / 2}" y="${barH / 2 - 14}" text-anchor="middle" fill="#18181B" font-size="68" font-family="monospace" font-weight="700">#${c.labelIndex}</text>
                <text x="${c.startMm + c.lengthMm / 2}" y="${barH / 2 + 54}" text-anchor="middle" fill="#3F3F46" font-size="54" font-family="monospace">${c.lengthMm} mm</text>
              </g>`;
            })
            .join('');
          return `<div class="nest-card">
            <div class="nest-head">
              <strong>${escapeHtml(meta.name)} (${lr.profileSectionLabel}) — Sztanga 1D #${bar.barIndex}</strong>
              <span>Sztanga ${L} mm · Wykorzystano ${bar.usedMm} mm · Odpad ${bar.wasteMm} mm (${bar.wastePercent}%)</span>
            </div>
            <svg viewBox="0 0 ${L} ${barH}" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:auto;max-height:64px;background:#FAFAFA;border:1px solid #D4D4D8;border-radius:4px;">
              <rect x="0" y="20" width="${L}" height="${barH - 40}" fill="#F4F4F5" stroke="#52525B" stroke-width="8" />
              ${cutsSvg}
            </svg>
          </div>`;
        })
        .join('');
    })
    .join('');

  return `<div class="page-break"></div>
  <h2>4. Mapy rozkroju 2D (arkusze) i 1D (sztangi liniowe)</h2>
  ${sheetsHtml}
  ${barsHtml}`;
}

/**
 * Generates a complete, workshop-ready printable Technical Documentation & Client Offer PDF pack
 * via a hidden iframe (never triggers blocked window.open popups).
 */
export function printTechnicalDocumentation(params: {
  project: FurnitureProject;
  cutSpecs: Map<string, CarpentryCutSpec>;
  nestingResults: MaterialNestingResult[];
  linearResults?: MaterialLinearResult[];
  quote: CommercialQuoteBreakdown;
  quoteSettings: QuoteSettings;
  kerfMm: number;
  snapshotDataUrl: string | null;
}) {
  const { project, cutSpecs, nestingResults, quote, quoteSettings, kerfMm, snapshotDataUrl } = params;
  const linearResults = params.linearResults ?? nestLinearProfiles(project.parts, kerfMm);
  const overall = getProjectDimensionsMm(project.parts);
  const dateStr = new Date().toLocaleDateString('pl-PL');

  const frontSvg = buildOrthographicSvg(project.parts, 'front');
  const sideSvg = buildOrthographicSvg(project.parts, 'side');
  const topSvg = buildOrthographicSvg(project.parts, 'top');

  const boardParts = project.parts.filter((p) => p.kind !== 'appliance');
  const drillingMaps = boardParts
    .map((p, idx) => ({ idx: idx + 1, map: extractBoardDrillingMap(p, project.parts, project.fasteners) }))
    .filter((item) => item.map.holes.length > 0 || item.map.cutouts.length > 0 || item.map.part.dadoGroove?.enabled);

  const cutRowsHtml = boardParts
    .map((p, i) => {
      const spec = cutSpecs.get(p.id);
      const isProfile = p.kind === 'profile';
      const sortedProfileDims = isProfile
        ? [Math.round(p.width), Math.round(p.height), Math.round(p.depth)].sort((a, b) => a - b)
        : null;
      const machiningNotes: string[] = [];
      const sawAngles = computeSawCutAngles(p);
      if (sawAngles.length > 0) machiningNotes.push(`Skos ${sawAngles.map((a) => `${a.interiorDeg}°`).join('/')}`);
      if (p.cornerRadiusMm) machiningNotes.push(`R${p.cornerRadiusMm}`);
      if (p.cutouts?.length) machiningNotes.push(`${p.cutouts.length} wyc.`);
      if (p.dadoGroove?.enabled) machiningNotes.push(`Nut ${p.dadoGroove.widthMm}×${p.dadoGroove.depthMm}`);
      if (p.hingeSide && p.hingeSide !== 'none') machiningNotes.push(`Zawias Ø35 (${p.hingeCount ?? 2} szt)`);
      const finishedDim = isProfile && sortedProfileDims
        ? `Profil ${sortedProfileDims[0]}×${sortedProfileDims[1]} × ${sortedProfileDims[2]}`
        : spec
          ? `${spec.grainLenMm} × ${spec.crossWidMm} × ${spec.thicknessMm}`
          : `${p.width} × ${p.height} × ${p.depth}`;
      const sawDim = isProfile && sortedProfileDims
        ? `1D: ${sortedProfileDims[2]} mm`
        : spec
          ? `${spec.sawLenMm} × ${spec.sawWidMm}`
          : '-';
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${escapeHtml(p.name)}</strong></td>
        <td>${escapeHtml(getMaterialMeta(p.materialId).shortName)}</td>
        <td class="num">${finishedDim}</td>
        <td class="num">${sawDim}</td>
        <td class="num">${isProfile ? '—' : spec ? escapeHtml(spec.edgeBandingLabel) : 'Brak'}</td>
        <td>${escapeHtml(machiningNotes.join(', ') || '—')}</td>
      </tr>`;
    })
    .join('');

  const nestingSectionHtml = buildPdfNestingSectionHtml(nestingResults, linearResults);

  const drillCardsHtml = drillingMaps
    .map(({ idx, map }) => {
      const pad = 65;
      const vw = map.faceWidthMm + pad * 2;
      const vh = map.faceHeightMm + pad * 2;
      const fs = Math.max(18, Math.max(map.faceWidthMm, map.faceHeightMm) * 0.036);
      const outlinePts = getBoardOutline2D(map.part, map.faceWidthMm, map.faceHeightMm)
        .map(([x, y]) => `${(pad + x).toFixed(1)},${(pad + map.faceHeightMm - y).toFixed(1)}`)
        .join(' ');
      const groove = getDadoGrooveLine2D(map.part, map.thinAxis, map.faceWidthMm, map.faceHeightMm);
      const grooveSvg = groove
        ? `<line x1="${(pad + groove.x1).toFixed(1)}" y1="${(pad + map.faceHeightMm - groove.y1).toFixed(1)}" x2="${(pad + groove.x2).toFixed(1)}" y2="${(pad + map.faceHeightMm - groove.y2).toFixed(1)}" stroke="#0284C7" stroke-width="${Math.max(4, groove.widthMm)}" stroke-dasharray="14 8" />`
        : '';
      const cutoutsSvg = map.cutouts
        .map((c) => {
          const cx = pad + map.faceWidthMm / 2 + c.xMm;
          const cy = pad + map.faceHeightMm - (map.faceHeightMm / 2 + c.yMm);
          if (c.shape === 'circle') {
            return `<circle cx="${cx}" cy="${cy}" r="${(c.diameterMm ?? c.widthMm) / 2}" fill="#FEF2F2" stroke="#DC2626" stroke-width="3" stroke-dasharray="10 6" />`;
          }
          return `<rect x="${cx - c.widthMm / 2}" y="${cy - c.heightMm / 2}" width="${c.widthMm}" height="${c.heightMm}" fill="#FEF2F2" stroke="#DC2626" stroke-width="3" stroke-dasharray="10 6" />`;
        })
        .join('');
      const holesSvg = map.holes
        .map((h, hi) => {
          const hx = pad + h.xMm;
          const hy = pad + map.faceHeightMm - h.yMm;
          const r = Math.max(5, h.diameterMm / 2);
          const stroke =
            h.kind === 'hinge_cup'
              ? '#2563EB'
              : h.kind === 'hinge_plate'
                ? '#0284C7'
                : h.kind === 'slide_rail'
                  ? '#059669'
                  : h.kind === 'shelf_pin'
                    ? '#64748B'
                    : h.kind === 'minifix_cam'
                      ? '#7C3AED'
                      : '#D97706';
          return `<circle cx="${hx}" cy="${hy}" r="${r}" fill="none" stroke="${stroke}" stroke-width="3" />
            ${h.kind === 'shelf_pin' ? '' : `<text x="${hx + r + 5}" y="${hy + fs * 0.3}" font-size="${(fs * 0.85).toFixed(0)}" fill="#18181B" font-family="monospace">O${hi + 1}</text>`}`;
        })
        .join('');
      const holeTable = map.holes
        .map(
          (h, hi) =>
            `<tr><td>O${hi + 1}</td><td>${escapeHtml(h.label)}</td><td>${h.face}</td><td class="num">${h.xMm}</td><td class="num">${h.yMm}</td><td class="num">Ø${h.diameterMm} × ${h.depthMm}</td></tr>`
        )
        .join('');

      return `<div class="drill-card">
        <div class="drill-head">
          <strong>#${idx} ${escapeHtml(map.part.name)}</strong>
          <span>${map.faceWidthMm} × ${map.faceHeightMm} × ${map.thicknessMm} mm (${escapeHtml(getMaterialMeta(map.part.materialId).shortName)})</span>
        </div>
        <div class="drill-grid">
          <svg viewBox="0 0 ${vw} ${vh}" style="width:100%;max-height:190px;background:#FAFAFA;border:1px solid #E4E4E7;border-radius:6px;">
            <polygon points="${outlinePts}" fill="#FFFFFF" stroke="#18181B" stroke-width="4" stroke-linejoin="round" />
            ${grooveSvg}
            ${cutoutsSvg}
            ${holesSvg}
            <text x="${pad + map.faceWidthMm / 2}" y="${pad - 18}" text-anchor="middle" font-size="${fs.toFixed(0)}" fill="#18181B" font-family="monospace">${map.faceWidthMm} mm</text>
            <text x="${pad - 16}" y="${pad + map.faceHeightMm / 2}" text-anchor="end" font-size="${fs.toFixed(0)}" fill="#18181B" font-family="monospace">${map.faceHeightMm}</text>
          </svg>
          <table>
            <thead><tr><th>Otw.</th><th>Opis</th><th>Strona</th><th class="num">X [mm]</th><th class="num">Y [mm]</th><th class="num">Wymiar</th></tr></thead>
            <tbody>${holeTable || '<tr><td colspan="6">Tylko wycięcia / nutowanie</td></tr>'}</tbody>
          </table>
        </div>
      </div>`;
    })
    .join('');

  const assemblyPlan = buildAssemblyPlan(project.parts, project.fasteners, 'grouped');
  const assemblyRowsHtml = assemblyPlan.steps
    .map((s) => {
      const partsList = s.items
        .map((it) => {
          const target =
            it.attachToNames.length > 0
              ? ` <span style="color:#0369A1;">(→ ${escapeHtml(it.attachToNames.slice(0, 2).join(', '))}${it.attachToNames.length > 2 ? ` +${it.attachToNames.length - 2}` : ''})</span>`
              : ' <span style="color:#047857;">(baza startowa)</span>';
          return `<div>• <strong>${escapeHtml(it.partName)}</strong>${target}</div>`;
        })
        .join('');
      return `<tr>
        <td class="num"><strong>${s.step}</strong></td>
        <td><strong>${escapeHtml(s.title)}</strong><div style="color:#52525B;margin-top:2px;">${escapeHtml(s.instruction)}</div></td>
        <td>${partsList}</td>
        <td>${escapeHtml(s.fastenerSummary || '—')}</td>
      </tr>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <title>Dokumentacja Techniczna — ${escapeHtml(project.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #18181B; margin: 0; padding: 24px; font-size: 12px; line-height: 1.45; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    h2 { font-size: 14px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #F59E0B; }
    .meta { color: #52525B; font-size: 11px; margin-bottom: 14px; }
    .header-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px; border: 1px solid #E4E4E7; border-radius: 8px; padding: 12px; background: #FAFAFA; }
    .preview-img { width: 100%; max-height: 260px; object-fit: contain; border: 1px solid #E4E4E7; border-radius: 8px; background: #F4F4F5; margin-bottom: 14px; }
    .ortho-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 14px; }
    .ortho-box { text-align: center; }
    .ortho-box div { font-size: 11px; font-weight: 600; margin-bottom: 4px; color: #3F3F46; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border-bottom: 1px solid #E4E4E7; padding: 5px 6px; text-align: left; }
    th { background: #F4F4F5; font-weight: 600; color: #3F3F46; }
    .num { text-align: right; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    .quote-total { font-size: 14px; font-weight: 700; background: #FFFBEB; }
    .nest-card { border: 1px solid #E4E4E7; border-radius: 8px; padding: 8px 10px; margin-bottom: 10px; page-break-inside: avoid; }
    .nest-head { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 11px; color: #3F3F46; }
    .drill-card { border: 1px solid #E4E4E7; border-radius: 8px; padding: 10px; margin-bottom: 10px; page-break-inside: avoid; }
    .drill-head { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 12px; }
    .drill-grid { display: grid; grid-template-columns: 230px 1fr; gap: 12px; align-items: start; }
    .page-break { page-break-before: always; }
    @media print { body { padding: 0; } }
  </style>
</head>
<body>
  <div class="header-grid">
    <div>
      <h1>${escapeHtml(project.name)}</h1>
      <div class="meta">Wykonawca: <strong>${escapeHtml(quoteSettings.companyName)}</strong> · Data: ${dateStr}</div>
      <div class="meta">Klient: <strong>${escapeHtml(quoteSettings.clientName)}</strong></div>
    </div>
    <div style="text-align:right;">
      <div style="font-size:11px;color:#52525B;">Gabaryt całkowity (S × W × G)</div>
      <div style="font-size:16px;font-weight:700;font-family:monospace;">${overall.width} × ${overall.height} × ${overall.depth} mm</div>
      <div style="font-size:11px;color:#52525B;margin-top:4px;">${boardParts.length} elementów · ${project.fasteners.length} łączników · ${nestingResults.reduce((s, n) => s + n.totalSheets, 0)} arkuszy${quote.linearBarsCount > 0 ? ` · ${quote.linearBarsCount} sztang 1D` : ''}</div>
    </div>
  </div>

  ${snapshotDataUrl ? `<img class="preview-img" src="${snapshotDataUrl}" alt="Wizualizacja 3D" />` : ''}

  <h2>1. Rzuty techniczne 2D z wymiarowaniem</h2>
  <div class="ortho-grid">
    <div class="ortho-box"><div>Widok z przodu (X × Y)</div>${frontSvg}</div>
    <div class="ortho-box"><div>Widok z boku (Z × Y)</div>${sideSvg}</div>
    <div class="ortho-box"><div>Rzut z góry (X × Z)</div>${topSvg}</div>
  </div>

  <h2>2. Kosztorys ofertowy dla klienta</h2>
  <table>
    <thead><tr><th>Pozycja</th><th>Zakres / Ilość</th><th class="num">Wartość netto [zł]</th></tr></thead>
    <tbody>
      <tr><td>Materiał płytowy (arkusze 2D wg grubości, rzaz ${kerfMm} mm)</td><td>${nestingResults.reduce((s, n) => s + n.totalSheets, 0)} ark.</td><td class="num">${quote.sheetsCostPln} zł</td></tr>
      ${quote.linearBarsCount > 0 ? `<tr><td>Profile liniowe / sztangi 1D</td><td>${quote.linearBarsCount} sztang</td><td class="num">${quote.linearProfilesCostPln} zł</td></tr>` : ''}
      <tr><td>Usługa rozkroju na pile formatowej</td><td>${quote.cuttingLinearM} mb × ${quoteSettings.cuttingPricePerMbPln} zł</td><td class="num">${quote.cuttingCostPln} zł</td></tr>
      <tr><td>Okleinowanie krawędzi ABS/PCV</td><td>${quote.edgeBandingLinearM} mb × ${quoteSettings.edgeBandingPricePerMbPln} zł</td><td class="num">${quote.edgeBandingCostPln} zł</td></tr>
      <tr><td>Okucia i akcesoria meblowe</td><td>Zawiasy: ${quote.hardware.hingeCupsCount} · Prowadnice: ${quote.hardware.drawerSlidePairs} kpl · Uchwyty: ${quote.hardware.handlesCount}${quote.hardware.tipOnCount > 0 ? ` · Tip-On: ${quote.hardware.tipOnCount} szt.` : ''}${quote.hardware.golaLinearM > 0 ? ` · Gola J: ${quote.hardware.golaLinearM} mb` : ''}${quote.hardware.slidingDoorsCount > 0 ? ` · System przesuwny: ${quote.hardware.slidingDoorsCount} skrz.` : ''} · Nóżki: ${quote.hardware.legsCount} · Wkręty: ${quote.hardware.fastenersTotal}</td><td class="num">${quote.hardwareCostPln} zł</td></tr>
      <tr><td>Robocizna i montaż warsztatowy</td><td>${quoteSettings.laborHours} h × ${quoteSettings.laborRatePln} zł/h</td><td class="num">${quote.laborCostPln} zł</td></tr>
      <tr><td>Marża pracowni (${quoteSettings.marginPercent}%)</td><td></td><td class="num">${quote.marginPln} zł</td></tr>
      <tr><td><strong>RAZEM NETTO</strong></td><td></td><td class="num"><strong>${quote.netTotalPln} zł</strong></td></tr>
      <tr><td>Podatek VAT (${quoteSettings.vatPercent}%)</td><td></td><td class="num">${quote.vatPln} zł</td></tr>
      <tr class="quote-total"><td>DO ZAPŁATY BRUTTO</td><td></td><td class="num">${quote.grossTotalPln} zł</td></tr>
    </tbody>
  </table>
  ${quoteSettings.notes ? `<p class="meta" style="margin-top:8px;">Uwagi: ${escapeHtml(quoteSettings.notes)}</p>` : ''}

  <div class="page-break"></div>
  <h2>3. Lista rozkroju na piłę formatową i cięcie profili 1D</h2>
  <table>
    <thead>
      <tr><th>#</th><th>Element</th><th>Materiał</th><th class="num">Gotowy [mm]</th><th class="num">Cięcie piłą</th><th class="num">Okleina</th><th>Obróbki</th></tr>
    </thead>
    <tbody>${cutRowsHtml}</tbody>
  </table>

  ${nestingSectionHtml}

  ${
    drillingMaps.length > 0
      ? `<div class="page-break"></div>
  <h2>5. Karty wierceń 2D i wycięć (współrzędne X/Y od lewego dolnego narożnika)</h2>
  ${drillCardsHtml}`
      : ''
  }

  ${
    assemblyPlan.steps.length > 0
      ? `<div class="page-break"></div>
  <h2>6. Kolejność montażu (wykryta automatycznie ze styków fizycznych: ${assemblyPlan.totalContacts} styków)</h2>
  <table>
    <thead>
      <tr><th class="num">Krok</th><th>Etap i wskazówka warsztatowa</th><th>Elementy i baza styku</th><th>Łączniki</th></tr>
    </thead>
    <tbody>${assemblyRowsHtml}</tbody>
  </table>`
      : ''
  }
</body>
</html>`;

  printHtmlViaHiddenIframe(html);
}

function printHtmlViaHiddenIframe(html: string) {
  const iframe = document.createElement('iframe');
  iframe.style.position = 'fixed';
  iframe.style.right = '0';
  iframe.style.bottom = '0';
  iframe.style.width = '0';
  iframe.style.height = '0';
  iframe.style.border = '0';
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc || !iframe.contentWindow) {
    document.body.removeChild(iframe);
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  setTimeout(() => {
    iframe.contentWindow?.focus();
    iframe.contentWindow?.print();
    setTimeout(() => {
      if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    }, 1500);
  }, 250);
}

/**
 * Classifies any furniture part into a logical 5-step workshop assembly order:
 * 1: Korpus główny -> 2: Podstawa i plecy -> 3: Półki, szuflady, wnętrze -> 4: Fronty -> 5: Blat i AGD
 */
export function classifyAssemblyStep(part: FurniturePart): 1 | 2 | 3 | 4 | 5 {
  const lower = part.name.toLowerCase();
  if (part.kind === 'countertop') return 5;
  if (part.kind === 'appliance') {
    if (part.applianceModel === 'wardrobe_rod' || part.applianceModel === 'wire_cargo') {
      return 3;
    }
    return 5;
  }
  if (part.kind === 'door' || part.hardwareTag === 'drawer_front') return 4;
  if (
    part.hardwareTag === 'drawer_box' ||
    lower.includes('szuflad') ||
    lower.includes('półk') ||
    lower.includes('polk')
  ) {
    return 3;
  }
  if (
    part.hardwareTag === 'leg' ||
    lower.includes('cokół') ||
    lower.includes('cokol') ||
    lower.includes('nóżk') ||
    lower.includes('nozk') ||
    lower.includes('plecy') ||
    lower.includes('hdf') ||
    (part.depth <= 6 && part.width > 120 && part.height > 120)
  ) {
    return 2;
  }
  return 1;
}

/**
 * Generates an A4 printable workshop board sticker sheet (3 columns × 7 rows)
 * with board index, saw vs finished dims, CNC notes, and visual ABS edge-banding bars.
 */
export function printBoardLabels(
  project: FurnitureProject,
  cutSpecs: Map<string, CarpentryCutSpec>
) {
  const boardParts = project.parts.filter((p) => p.kind !== 'appliance');
  const cardsHtml = boardParts
    .map((p, idx) => {
      const spec = cutSpecs.get(p.id);
      const meta = getMaterialMeta(p.materialId);

      // Dedicated linear profile sticker (cross-section + cut length, no fake ABS edge banding)
      if (p.kind === 'profile') {
        const dims = [Math.round(p.width), Math.round(p.height), Math.round(p.depth)].sort(
          (a, b) => a - b
        );
        const secLabel = `${dims[0]}×${dims[1]} mm`;
        const lenMm = dims[2];
        return `<div class="label">
          <div class="l-head">
            <span class="badge">#${idx + 1}</span>
            <span class="proj">${escapeHtml(project.name)}</span>
            <span class="thick">PROFIL 1D</span>
          </div>
          <div class="l-name">${escapeHtml(p.name)}</div>
          <div class="l-mat">${escapeHtml(meta.name)}</div>
          <div class="l-body">
            <div class="l-dims">
              <div><span class="lbl">Przekrój:</span> <strong>${secLabel}</strong></div>
              <div><span class="lbl">Cięcie 1D:</span> <strong>${lenMm} mm</strong></div>
              <div class="cnc">Sztanga / cięcie na długość</div>
            </div>
            <svg viewBox="0 0 76 52" class="eb-svg">
              <rect x="6" y="19" width="64" height="14" rx="2" fill="#E2E8F0" stroke="#334155" stroke-width="2" />
              <text x="38" y="29" text-anchor="middle" font-size="8.5" font-family="monospace" font-weight="700" fill="#0F172A">${lenMm}</text>
            </svg>
          </div>
        </div>`;
      }

      const eb = p.edgeBanding;
      const hasEb = eb && eb.thicknessMm > 0;
      const ebColor = eb?.thicknessMm === 2 ? '#D97706' : '#0284C7';
      const topStroke = hasEb && eb.top ? ebColor : '#CBD5E1';
      const bottomStroke = hasEb && eb.bottom ? ebColor : '#CBD5E1';
      const leftStroke = hasEb && eb.left ? ebColor : '#CBD5E1';
      const rightStroke = hasEb && eb.right ? ebColor : '#CBD5E1';
      const topW = hasEb && eb.top ? 5 : 1.5;
      const bottomW = hasEb && eb.bottom ? 5 : 1.5;
      const leftW = hasEb && eb.left ? 5 : 1.5;
      const rightW = hasEb && eb.right ? 5 : 1.5;

      const cncTags: string[] = [];
      const sawAngles = computeSawCutAngles(p);
      if (sawAngles.length > 0) {
        cncTags.push(`Skos ${sawAngles.map((a) => `${a.interiorDeg}°`).join('/')}`);
      }
      if (p.cornerRadiusMm) cncTags.push(`R${p.cornerRadiusMm}`);
      if (p.cutouts?.length) cncTags.push(`${p.cutouts.length} wyc.`);
      if (p.dadoGroove?.enabled) cncTags.push(`Nut ${p.dadoGroove.widthMm}×${p.dadoGroove.depthMm}`);
      if (p.hingeSide && p.hingeSide !== 'none') cncTags.push(`Ø35 ×${p.hingeCount ?? 2}`);
      if (p.system32ShelfHoles) cncTags.push('Sys32 Ø5');
      if (p.kind === 'door' && p.handleStyle === 'gola_j') cncTags.push('Gola J');
      if (p.kind === 'door' && p.handleStyle === 'chamfer_45') cncTags.push('Frez 45°');
      if (p.kind === 'door' && p.handleStyle === 'tip_on') cncTags.push('Tip-On');
      if (p.surfaceFinish === 'gloss') cncTags.push('POŁYSK');

      return `<div class="label">
        <div class="l-head">
          <span class="badge">#${idx + 1}</span>
          <span class="proj">${escapeHtml(project.name)}</span>
          <span class="thick">${spec ? spec.thicknessMm : p.depth} mm</span>
        </div>
        <div class="l-name">${escapeHtml(p.name)}</div>
        <div class="l-mat">${escapeHtml(meta.name)}</div>
        <div class="l-body">
          <div class="l-dims">
            <div><span class="lbl">Gotowy:</span> <strong>${spec ? `${spec.grainLenMm} × ${spec.crossWidMm}` : `${p.width} × ${p.height}`}</strong> mm</div>
            <div><span class="lbl">Piła:</span> <strong>${spec ? `${spec.sawLenMm} × ${spec.sawWidMm}` : '-'}</strong> mm</div>
            <div><span class="lbl">ABS:</span> ${escapeHtml(spec?.edgeBandingLabel || 'Brak')}</div>
            ${cncTags.length ? `<div class="cnc">${escapeHtml(cncTags.join(' · '))}</div>` : ''}
          </div>
          <svg viewBox="0 0 76 52" class="eb-svg">
            <rect x="8" y="8" width="60" height="36" fill="#F8FAFC" />
            <line x1="8" y1="8" x2="68" y2="8" stroke="${topStroke}" stroke-width="${topW}" />
            <line x1="8" y1="44" x2="68" y2="44" stroke="${bottomStroke}" stroke-width="${bottomW}" />
            <line x1="8" y1="8" x2="8" y2="44" stroke="${leftStroke}" stroke-width="${leftW}" />
            <line x1="68" y1="8" x2="68" y2="44" stroke="${rightStroke}" stroke-width="${rightW}" />
            <text x="38" y="29" text-anchor="middle" font-size="9" font-family="monospace" fill="#475569">${spec ? spec.grainLenMm : p.width}</text>
          </svg>
        </div>
      </div>`;
    })
    .join('');

  const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <title>Etykiety na formatki — ${escapeHtml(project.name)}</title>
  <style>
    @page { size: A4 portrait; margin: 8mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, -apple-system, sans-serif; color: #111827; background: #fff; }
    .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 3mm; }
    .label { border: 1px dashed #94A3B8; border-radius: 3px; padding: 2.8mm; height: 37.5mm; display: flex; flex-direction: column; justify-content: space-between; page-break-inside: avoid; }
    .l-head { display: flex; align-items: center; justify-content: space-between; gap: 4px; font-size: 8px; }
    .badge { background: #18181B; color: #F59E0B; font-weight: 700; padding: 1px 5px; border-radius: 3px; font-family: monospace; font-size: 9px; }
    .proj { color: #64748B; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; }
    .thick { font-family: monospace; font-weight: 700; color: #0F172A; }
    .l-name { font-size: 10px; font-weight: 700; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
    .l-mat { font-size: 8px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .l-body { display: flex; align-items: center; justify-content: space-between; gap: 4px; margin-top: 2px; }
    .l-dims { font-size: 8.5px; line-height: 1.35; font-family: monospace; }
    .lbl { font-family: Inter, sans-serif; color: #64748B; }
    .cnc { color: #B45309; font-weight: 700; font-size: 7.5px; }
    .eb-svg { width: 52px; height: 36px; flex-shrink: 0; }
  </style>
</head>
<body>
  <div class="grid">${cardsHtml}</div>
</body>
</html>`;

  printHtmlViaHiddenIframe(html);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
