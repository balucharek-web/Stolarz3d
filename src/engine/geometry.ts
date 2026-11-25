import * as THREE from 'three';
import { Fastener, FurniturePart, ScrewType } from '../types/furniture';
import {
  auditSingleFastener,
  computeJointZones,
  getPartWorldBox,
  isWorldPointInsidePart,
  type FastenerAuditStatus,
  type WorldBox,
} from './carpentry';

export const MM_TO_M = 0.001;
export const M_TO_MM = 1000;

function hashPartUvOffset(seedStr?: string): [number, number] {
  if (!seedStr) return [0, 0];
  let h1 = 2166136261;
  let h2 = 16777619;
  for (let i = 0; i < seedStr.length; i++) {
    const c = seedStr.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 16777619);
    h2 = Math.imul(h2 ^ (c + i * 31), 2246822519);
  }
  return [((h1 >>> 0) % 997) / 997, ((h2 >>> 0) % 991) / 991];
}

/**
 * Re-project box-planar UVs onto a BufferGeometry so wood/OSB textures keep real-world scale
 * (1 seamless synthesized sheet tile = 1250mm), each board gets a unique deterministic UV crop
 * (zero cloned look between adjacent shelves/doors!), and thin cut edges show crisp veneer layers.
 */
function applyWorldScaleUVs(
  geometry: THREE.BufferGeometry,
  rotateGrain = false,
  boardDimsM?: [number, number, number],
  forcedThinAxis?: 'x' | 'y' | 'z',
  partId?: string
) {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  if (!pos || !norm) return;

  const uvArray = new Float32Array(pos.count * 2);
  const scale = 1 / 1.25; // 1250mm per seamless synthesized sheet tile
  const [offU, offV] = hashPartUvOffset(partId);

  // Determine which local axis is the thin board thickness (if any)
  const wM = boardDimsM ? boardDimsM[0] : 1;
  const hM = boardDimsM ? boardDimsM[1] : 1;
  const dM = boardDimsM ? boardDimsM[2] : 1;
  const thinAxis =
    forcedThinAxis ??
    (dM <= wM && dM <= hM ? 'z' : hM <= wM && hM <= dM ? 'y' : 'x');
  const thinThickness =
    forcedThinAxis === 'z'
      ? Math.max(0.008, dM)
      : forcedThinAxis === 'y'
        ? Math.max(0.008, hM)
        : forcedThinAxis === 'x'
          ? Math.max(0.008, wM)
          : Math.max(0.008, Math.min(wM, hM, dM));

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);

    const nx = Math.abs(norm.getX(i));
    const ny = Math.abs(norm.getY(i));
    const nz = Math.abs(norm.getZ(i));

    let u: number;
    let v: number;

    if (nz >= nx && nz >= ny) {
      if (thinAxis === 'y') {
        // Horizontal shelf front/back cut edge -> map V across thickness Y
        u = x * scale;
        v = (y / thinThickness) + 0.5;
      } else if (thinAxis === 'x') {
        // Vertical side panel front/back cut edge -> map V across thickness X
        u = y * scale;
        v = (x / thinThickness) + 0.5;
      } else {
        u = x * scale;
        v = y * scale;
      }
    } else if (ny >= nx && ny >= nz) {
      if (thinAxis === 'z') {
        // Top/bottom edge of Z-thin panel -> map V across thickness Z
        u = x * scale;
        v = (z / thinThickness) + 0.5;
      } else if (thinAxis === 'x') {
        u = z * scale;
        v = (x / thinThickness) + 0.5;
      } else {
        u = x * scale;
        v = z * scale;
      }
    } else {
      if (thinAxis === 'z') {
        // Left/right edge of Z-thin panel -> map V across thickness Z
        u = y * scale;
        v = (z / thinThickness) + 0.5;
      } else if (thinAxis === 'y') {
        u = z * scale;
        v = (y / thinThickness) + 0.5;
      } else {
        u = z * scale;
        v = y * scale;
      }
    }

    const isPrimaryFace =
      (thinAxis === 'z' && nz >= nx && nz >= ny) ||
      (thinAxis === 'y' && ny >= nx && ny >= nz) ||
      (thinAxis === 'x' && nx >= ny && nx >= nz);

    if (rotateGrain && isPrimaryFace) {
      uvArray[i * 2] = v + offU;
      uvArray[i * 2 + 1] = u + offV;
    } else if (isPrimaryFace) {
      uvArray[i * 2] = u + offU;
      uvArray[i * 2 + 1] = v + offV;
    } else {
      uvArray[i * 2] = u + offU;
      uvArray[i * 2 + 1] = v;
    }
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
}

/**
 * Group triangles into materialIndex 0 (broad board faces) vs materialIndex 1 (thin cut edges)
 * so multi-material boards like birch plywood and OSB-3 render authentic cut edges on horizontal
 * shelves, vertical side walls, and sloped panels alike.
 */
function assignFaceEdgeGroups(
  geometry: THREE.BufferGeometry,
  dimsM: [number, number, number],
  forcedThinAxis?: 'x' | 'y' | 'z'
) {
  const norm = geometry.attributes.normal;
  if (!norm || geometry.index) return;

  const [wM, hM, dM] = dimsM;
  const thinAxis =
    forcedThinAxis ??
    (dM <= wM && dM <= hM ? 'z' : hM <= wM && hM <= dM ? 'y' : 'x');

  const triCount = Math.floor(norm.count / 3);
  if (triCount === 0) return;

  geometry.clearGroups();
  let runStart = 0;
  let runMat = -1;

  for (let t = 0; t < triCount; t++) {
    const v0 = t * 3;
    const nx = Math.abs(norm.getX(v0) + norm.getX(v0 + 1) + norm.getX(v0 + 2));
    const ny = Math.abs(norm.getY(v0) + norm.getY(v0 + 1) + norm.getY(v0 + 2));
    const nz = Math.abs(norm.getZ(v0) + norm.getZ(v0 + 1) + norm.getZ(v0 + 2));

    const isFace =
      (thinAxis === 'z' && nz >= nx && nz >= ny) ||
      (thinAxis === 'y' && ny >= nx && ny >= nz) ||
      (thinAxis === 'x' && nx >= ny && nx >= nz);

    const matIdx = isFace ? 0 : 1;
    if (runMat === -1) {
      runMat = matIdx;
      runStart = 0;
    } else if (matIdx !== runMat) {
      geometry.addGroup(runStart * 3, (t - runStart) * 3, runMat);
      runStart = t;
      runMat = matIdx;
    }
  }
  if (runMat !== -1) {
    geometry.addGroup(runStart * 3, (triCount - runStart) * 3, runMat);
  }
}

function createRoundedRectShape(
  wM: number,
  hM: number,
  radiusM: number
): THREE.Shape {
  const hw = wM / 2;
  const hh = hM / 2;
  const r = Math.max(0, Math.min(radiusM, hw * 0.48, hh * 0.48));
  const shape = new THREE.Shape();
  if (r <= 0.0005) {
    shape.moveTo(-hw, -hh);
    shape.lineTo(hw, -hh);
    shape.lineTo(hw, hh);
    shape.lineTo(-hw, hh);
    shape.closePath();
    return shape;
  }
  shape.moveTo(-hw + r, -hh);
  shape.lineTo(hw - r, -hh);
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r);
  shape.lineTo(hw, hh - r);
  shape.quadraticCurveTo(hw, hh, hw - r, hh);
  shape.lineTo(-hw + r, hh);
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r);
  shape.lineTo(-hw, -hh + r);
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  shape.closePath();
  return shape;
}

function appendCutoutHoles(
  shape: THREE.Shape,
  cutouts: FurniturePart['cutouts'],
  faceWM: number,
  faceHM: number
) {
  if (!cutouts || cutouts.length === 0) return;
  const maxHalfW = Math.max(0.005, faceWM / 2 - 0.008);
  const maxHalfH = Math.max(0.005, faceHM / 2 - 0.008);

  for (const c of cutouts) {
    const cx = THREE.MathUtils.clamp(c.xMm * MM_TO_M, -maxHalfW + 0.005, maxHalfW - 0.005);
    const cy = THREE.MathUtils.clamp(c.yMm * MM_TO_M, -maxHalfH + 0.005, maxHalfH - 0.005);
    const hole = new THREE.Path();
    if (c.shape === 'circle') {
      const rRaw = ((c.diameterMm ?? c.widthMm) * 0.5) * MM_TO_M;
      const r = Math.max(
        0.004,
        Math.min(
          rRaw,
          maxHalfW - Math.abs(cx),
          maxHalfH - Math.abs(cy)
        )
      );
      if (r < 0.004) continue;
      hole.absarc(cx, cy, r, 0, Math.PI * 2, true);
    } else {
      const hw = Math.max(
        0.005,
        Math.min((c.widthMm * 0.5) * MM_TO_M, maxHalfW - Math.abs(cx))
      );
      const hh = Math.max(
        0.005,
        Math.min((c.heightMm * 0.5) * MM_TO_M, maxHalfH - Math.abs(cy))
      );
      if (hw < 0.005 || hh < 0.005) continue;
      // Clockwise for holes
      hole.moveTo(cx - hw, cy - hh);
      hole.lineTo(cx - hw, cy + hh);
      hole.lineTo(cx + hw, cy + hh);
      hole.lineTo(cx + hw, cy - hh);
      hole.closePath();
    }
    shape.holes.push(hole);
  }
}

/**
 * Build a realistic beveled BufferGeometry for any FurniturePart (panel, sloped/angled board,
 * structural profile, cabinet door, bullnose kitchen countertop, with optional cutouts & rounded corners).
 */
export function buildPartGeometry(part: FurniturePart): THREE.BufferGeometry {
  const w = Math.max(part.width, 6) * MM_TO_M;
  const h = Math.max(part.height, 6) * MM_TO_M;
  const d = Math.max(part.depth, 4) * MM_TO_M;
  const hasCutouts = Boolean(part.cutouts && part.cutouts.length > 0);
  const cornerR = Math.max(0, (part.cornerRadiusMm ?? 0) * MM_TO_M);

  if (part.kind === 'countertop' && !hasCutouts && cornerR <= 0.0005) {
    // Bullnose kitchen worktop cross-section in YZ, extruded along X (width)
    const r = Math.min(h * 0.34, 0.008);
    const shape = new THREE.Shape();
    shape.moveTo(-d / 2, -h / 2);
    shape.lineTo(d / 2 - r, -h / 2);
    shape.quadraticCurveTo(d / 2, -h / 2, d / 2, -h / 2 + r);
    shape.lineTo(d / 2, h / 2 - r);
    shape.quadraticCurveTo(d / 2, h / 2, d / 2 - r, h / 2);
    shape.lineTo(-d / 2, h / 2);
    shape.closePath();

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: w,
      bevelEnabled: false,
      curveSegments: 8,
    });
    geo.rotateY(Math.PI / 2);
    geo.translate(-w / 2, 0, 0);
    geo.computeVertexNormals();
    applyWorldScaleUVs(geo, !!part.grainRotated, [w, h, d], undefined, part.id);
    assignFaceEdgeGroups(geo, [w, h, d]);
    return geo;
  }

  // Horizontal board (shelf, countertop, top/bottom) with internal cutouts or rounded corners -> extrude along Y!
  if (
    (hasCutouts || cornerR > 0.0005) &&
    part.kind !== 'custom' &&
    part.kind !== 'sloped' &&
    h <= w &&
    h <= d
  ) {
    const bevel = Math.min(0.0014, w * 0.04, d * 0.04, h * 0.14);
    const innerW = Math.max(0.004, w - bevel * 2);
    const innerD = Math.max(0.004, d - bevel * 2);
    const innerH = Math.max(0.002, h - bevel * 2);
    const shape = createRoundedRectShape(innerW, innerD, cornerR);
    appendCutoutHoles(shape, part.cutouts, innerW, innerD);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: innerH,
      bevelEnabled: bevel > 0.0002,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 16,
      steps: 1,
    });
    geo.translate(0, 0, -innerH / 2);
    // Rotate so XY shape lies flat in XZ plane (local +Y = thickness)
    geo.rotateX(-Math.PI / 2);
    geo.computeVertexNormals();
    applyWorldScaleUVs(geo, !!part.grainRotated, [w, h, d], 'y', part.id);
    assignFaceEdgeGroups(geo, [w, h, d], 'y');
    return geo;
  }

  // Vertical X-thin side wall with cutouts or rounded corners -> extrude along X!
  if (
    (hasCutouts || cornerR > 0.0005) &&
    part.kind !== 'custom' &&
    part.kind !== 'sloped' &&
    w < h &&
    w < d
  ) {
    const bevel = Math.min(0.0014, h * 0.04, d * 0.04, w * 0.14);
    const innerD = Math.max(0.004, d - bevel * 2);
    const innerH = Math.max(0.004, h - bevel * 2);
    const innerW = Math.max(0.002, w - bevel * 2);
    const shape = createRoundedRectShape(innerD, innerH, cornerR);
    appendCutoutHoles(shape, part.cutouts, innerD, innerH);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: innerW,
      bevelEnabled: bevel > 0.0002,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      curveSegments: 16,
      steps: 1,
    });
    geo.translate(0, 0, -innerW / 2);
    geo.rotateY(Math.PI / 2);
    geo.computeVertexNormals();
    applyWorldScaleUVs(geo, !!part.grainRotated, [w, h, d], 'x', part.id);
    assignFaceEdgeGroups(geo, [w, h, d], 'x');
    return geo;
  }

  // Custom 2D sketched polygon extruded along local Z
  if (
    part.kind === 'custom' &&
    part.customPolygon &&
    part.customPolygon.length >= 3
  ) {
    const pts = ensureCounterClockwise(part.customPolygon);
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
    const rawW = Math.max(10, maxX - minX);
    const rawH = Math.max(10, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;

    const bevel = Math.min(0.0012, w * 0.04, h * 0.04, d * 0.12);
    const innerD = Math.max(0.002, d - bevel * 2);

    // Scale polygon proportionally to match part.width x part.height in meters
    const scaleX = (Math.max(0.01, w - bevel * 2) / rawW);
    const scaleY = (Math.max(0.01, h - bevel * 2) / rawH);

    const shape = new THREE.Shape();
    pts.forEach(([px, py], idx) => {
      const mx = (px - cx) * scaleX;
      const my = (py - cy) * scaleY;
      if (idx === 0) shape.moveTo(mx, my);
      else shape.lineTo(mx, my);
    });
    shape.closePath();
    if (hasCutouts) {
      appendCutoutHoles(shape, part.cutouts, Math.max(0.01, w - bevel * 2), Math.max(0.01, h - bevel * 2));
    }

    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: innerD,
      bevelEnabled: bevel > 0.0002,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 2,
      steps: 1,
    });

    geo.translate(0, 0, -innerD / 2);
    geo.computeVertexNormals();
    // Custom polygons are always extruded along Z: front/back = face (0), all perimeter cuts = edge (1)
    applyWorldScaleUVs(geo, !!part.grainRotated, [w, h, d], 'z', part.id);
    assignFaceEdgeGroups(geo, [w, h, d], 'z');
    return geo;
  }

  // Standard panel, sloped panel, profile, or door
  const minEdge = 0.012; // keep at least 12mm so geometry stays manifold
  const stl = part.kind === 'sloped' ? Math.max(0, (part.slopeTopLeft ?? 0) * MM_TO_M) : 0;
  const str = part.kind === 'sloped' ? Math.max(0, (part.slopeTopRight ?? 0) * MM_TO_M) : 0;
  const sbl = part.kind === 'sloped' ? Math.max(0, (part.slopeBottomLeft ?? 0) * MM_TO_M) : 0;
  const sbr = part.kind === 'sloped' ? Math.max(0, (part.slopeBottomRight ?? 0) * MM_TO_M) : 0;

  const yBottomLeft = -h / 2 + Math.min(sbl, h - minEdge);
  const yTopLeft = Math.max(yBottomLeft + minEdge, h / 2 - stl);

  const yBottomRight = -h / 2 + Math.min(sbr, h - minEdge);
  const yTopRight = Math.max(yBottomRight + minEdge, h / 2 - str);

  const bevel = Math.min(0.0014, w * 0.08, h * 0.08, d * 0.14);
  const innerW = Math.max(0.002, w - bevel * 2);
  const innerD = Math.max(0.002, d - bevel * 2);

  // Shrink slightly on Y for bevel so total outer bounding box matches exact mm dimensions
  const insetY = bevel;
  let shape: THREE.Shape;
  if (part.kind !== 'sloped' && cornerR > 0.0005) {
    shape = createRoundedRectShape(innerW, Math.max(0.004, h - bevel * 2), cornerR);
  } else {
    shape = new THREE.Shape();
    shape.moveTo(-innerW / 2, yBottomLeft + insetY);
    shape.lineTo(innerW / 2, yBottomRight + insetY);
    shape.lineTo(innerW / 2, Math.max(yBottomRight + insetY + 0.002, yTopRight - insetY));
    shape.lineTo(-innerW / 2, Math.max(yBottomLeft + insetY + 0.002, yTopLeft - insetY));
    shape.closePath();
  }
  if (hasCutouts) {
    appendCutoutHoles(shape, part.cutouts, innerW, Math.max(0.01, h - bevel * 2));
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: innerD,
    bevelEnabled: bevel > 0.0002,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    curveSegments: 16,
    steps: 1,
  });

  geo.translate(0, 0, -innerD / 2);
  geo.computeVertexNormals();
  applyWorldScaleUVs(geo, !!part.grainRotated, [w, h, d], undefined, part.id);
  assignFaceEdgeGroups(geo, [w, h, d]);
  return geo;
}

/**
 * Ensure polygon vertices are ordered counter-clockwise so ExtrudeGeometry faces outward.
 */
export function ensureCounterClockwise(pts: [number, number][]): [number, number][] {
  let signedArea2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    signedArea2 += x1 * y2 - x2 * y1;
  }
  return signedArea2 < 0 ? [...pts].reverse() : pts;
}

/**
 * Compute true polygon surface area in m² (scaled to part.width × part.height if resized).
 */
export function computePolygonAreaM2(
  pts: [number, number][],
  targetWidthMm?: number,
  targetHeightMm?: number
): number {
  if (pts.length < 3) return 0;
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  let area2 = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    area2 += x1 * y2 - x2 * y1;
    if (x1 < minX) minX = x1;
    if (x1 > maxX) maxX = x1;
    if (y1 < minY) minY = y1;
    if (y1 > maxY) maxY = y1;
  }
  const rawAreaMm2 = Math.abs(area2) * 0.5;
  const rawW = Math.max(1, maxX - minX);
  const rawH = Math.max(1, maxY - minY);
  const scaleFactor =
    targetWidthMm && targetHeightMm
      ? (targetWidthMm / rawW) * (targetHeightMm / rawH)
      : 1;
  return (rawAreaMm2 * scaleFactor) / 1_000_000;
}

/**
 * Extract a 2D editable polygon [xMm, yMm] from any existing FurniturePart
 * (used when opening an existing board inside the 2D Sketch Editor).
 */
export function partToEditablePolygon(part: FurniturePart): {
  polygon: [number, number][];
  thicknessMm: number;
  orientation: 'vertical' | 'horizontal';
} {
  if (part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3) {
    // Re-scale stored polygon to current part.width × part.height so edits stay 1:1
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const [px, py] of part.customPolygon) {
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
    }
    const rawW = Math.max(10, maxX - minX);
    const rawH = Math.max(10, maxY - minY);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const scaled: [number, number][] = part.customPolygon.map(([px, py]) => [
      Math.round(((px - cx) / rawW) * part.width),
      Math.round(((py - cy) / rawH) * part.height),
    ]);
    const isHoriz = Math.abs(Math.abs(part.rotation[0]) - 90) < 15;
    return {
      polygon: scaled,
      thicknessMm: part.depth,
      orientation: isHoriz ? 'horizontal' : 'vertical',
    };
  }

  // Convert horizontal shelf (thin Y) into horizontal custom shape (width × depth, thickness = height)
  if (part.kind !== 'sloped' && part.height <= part.width && part.height <= part.depth && part.height <= 60) {
    const hw = Math.round(part.width / 2);
    const hd = Math.round(part.depth / 2);
    return {
      polygon: [
        [-hw, -hd],
        [hw, -hd],
        [hw, hd],
        [-hw, hd],
      ],
      thicknessMm: part.height,
      orientation: 'horizontal',
    };
  }

  // Convert vertical side panel (thin X) into vertical custom shape rotated 90° around Y
  if (part.kind !== 'sloped' && part.width <= part.height && part.width <= part.depth && part.width <= 60) {
    const hd = Math.round(part.depth / 2);
    const hh = Math.round(part.height / 2);
    return {
      polygon: [
        [-hd, -hh],
        [hd, -hh],
        [hd, hh],
        [-hd, hh],
      ],
      thicknessMm: part.width,
      orientation: 'vertical',
    };
  }

  // Standard Z-thin panel or sloped panel
  const hw = Math.round(part.width / 2);
  const hh = Math.round(part.height / 2);
  const stl = part.kind === 'sloped' ? part.slopeTopLeft ?? 0 : 0;
  const str = part.kind === 'sloped' ? part.slopeTopRight ?? 0 : 0;
  const sbl = part.kind === 'sloped' ? part.slopeBottomLeft ?? 0 : 0;
  const sbr = part.kind === 'sloped' ? part.slopeBottomRight ?? 0 : 0;

  return {
    polygon: [
      [-hw, -hh + sbl],
      [hw, -hh + sbr],
      [hw, hh - str],
      [-hw, hh - stl],
    ],
    thicknessMm: part.depth,
    orientation: 'vertical',
  };
}

/**
 * Procedural cabinet door/drawer opening hardware:
 * - 'bar': classic metallic bar handle
 * - 'tip_on': clean handleless front with internal magnetic push-to-open latch
 * - 'gola_j': anodized brushed aluminum J-channel edge profile
 * - 'chamfer_45': 45° beveled undercut finger-pull groove along the opening edge
 */
export function buildDoorHandleGroup(part: FurniturePart): THREE.Group | null {
  if (part.kind !== 'door') {
    return null;
  }

  const style = part.handleStyle ?? 'bar';
  const side = part.handleSide ?? 'none';

  // Tip-On handleless: sleek exterior + small internal push-latch body behind opening edge
  if (style === 'tip_on') {
    const group = new THREE.Group();
    group.name = 'door_tip_on';
    const w = part.width * MM_TO_M;
    const h = part.height * MM_TO_M;
    const d = part.depth * MM_TO_M;
    const latchMat = new THREE.MeshStandardMaterial({
      color: '#94A3B8',
      metalness: 0.65,
      roughness: 0.35,
    });
    const latch = new THREE.Mesh(
      new THREE.CylinderGeometry(0.005, 0.005, 0.022, 10),
      latchMat
    );
    latch.rotation.x = Math.PI / 2;
    const xPos = side === 'left' ? -w / 2 + 0.025 : side === 'right' ? w / 2 - 0.025 : 0;
    const yPos = side === 'top' ? h / 2 - 0.025 : 0;
    latch.position.set(xPos, yPos, -d / 2 - 0.011);
    group.add(latch);
    return group;
  }

  if (side === 'none') {
    return null;
  }

  const group = new THREE.Group();
  group.name = 'door_handle';

  const w = part.width * MM_TO_M;
  const h = part.height * MM_TO_M;
  const d = part.depth * MM_TO_M;
  const isHorizontal = side === 'top';

  if (style === 'gola_j') {
    // Sleek full-edge brushed aluminum J-profile handle (listwa korytkowa Gola / krawędziowa)
    const aluMat = new THREE.MeshStandardMaterial({
      color: '#C7CDD6',
      metalness: 0.9,
      roughness: 0.22,
    });
    const grooveMat = new THREE.MeshStandardMaterial({
      color: '#1E2126',
      metalness: 0.3,
      roughness: 0.65,
    });
    if (isHorizontal) {
      const stripLen = Math.max(0.08, w - 0.004);
      const lip = new THREE.Mesh(new THREE.BoxGeometry(stripLen, 0.016, d + 0.008), aluMat);
      lip.position.set(0, h / 2 - 0.008, 0.003);
      const shadowGroove = new THREE.Mesh(
        new THREE.BoxGeometry(stripLen - 0.004, 0.007, 0.004),
        grooveMat
      );
      shadowGroove.position.set(0, h / 2 - 0.015, d / 2 + 0.002);
      group.add(lip, shadowGroove);
    } else {
      const stripLen = Math.max(0.12, h - 0.004);
      const sx = side === 'left' ? -w / 2 + 0.008 : w / 2 - 0.008;
      const lip = new THREE.Mesh(new THREE.BoxGeometry(0.016, stripLen, d + 0.008), aluMat);
      lip.position.set(sx, 0, 0.003);
      const shadowGroove = new THREE.Mesh(
        new THREE.BoxGeometry(0.007, stripLen - 0.004, 0.004),
        grooveMat
      );
      shadowGroove.position.set(
        side === 'left' ? -w / 2 + 0.016 : w / 2 - 0.016,
        0,
        d / 2 + 0.002
      );
      group.add(lip, shadowGroove);
    }
    return group;
  }

  if (style === 'chamfer_45') {
    // 45° beveled undercut finger-pull edge (frezowany podchwyt 45°)
    const bevelMat = new THREE.MeshStandardMaterial({
      color: '#2E323A',
      metalness: 0.15,
      roughness: 0.55,
    });
    if (isHorizontal) {
      const stripLen = Math.max(0.08, w - 0.006);
      const bevel = new THREE.Mesh(new THREE.BoxGeometry(stripLen, 0.018, 0.006), bevelMat);
      bevel.rotation.x = Math.PI / 4;
      bevel.position.set(0, h / 2 - 0.009, d / 2 - 0.002);
      group.add(bevel);
    } else {
      const stripLen = Math.max(0.12, h - 0.006);
      const bevel = new THREE.Mesh(new THREE.BoxGeometry(0.018, stripLen, 0.006), bevelMat);
      bevel.rotation.y = side === 'left' ? -Math.PI / 4 : Math.PI / 4;
      bevel.position.set(
        side === 'left' ? -w / 2 + 0.009 : w / 2 - 0.009,
        0,
        d / 2 - 0.002
      );
      group.add(bevel);
    }
    return group;
  }

  // Classic metallic bar handle ('bar')
  const handleMat = new THREE.MeshStandardMaterial({
    color: '#2A2D33',
    metalness: 0.85,
    roughness: 0.28,
  });

  const barLength = Math.min(0.16, (isHorizontal ? w : h) * 0.42);
  const standoffDepth = 0.024;
  const barThickness = 0.009;

  const barGeo = isHorizontal
    ? new THREE.BoxGeometry(barLength, barThickness, barThickness)
    : new THREE.BoxGeometry(barThickness, barLength, barThickness);
  const barMesh = new THREE.Mesh(barGeo, handleMat);
  barMesh.position.set(0, 0, standoffDepth);
  barMesh.castShadow = true;
  group.add(barMesh);

  const legGeo = new THREE.CylinderGeometry(0.0038, 0.0038, standoffDepth, 10);
  legGeo.rotateX(Math.PI / 2);

  const offset = barLength * 0.36;
  const leg1 = new THREE.Mesh(legGeo, handleMat);
  const leg2 = new THREE.Mesh(legGeo, handleMat);
  if (isHorizontal) {
    leg1.position.set(-offset, 0, standoffDepth * 0.5);
    leg2.position.set(offset, 0, standoffDepth * 0.5);
  } else {
    leg1.position.set(0, -offset, standoffDepth * 0.5);
    leg2.position.set(0, offset, standoffDepth * 0.5);
  }
  leg1.castShadow = true;
  leg2.castShadow = true;
  group.add(leg1, leg2);

  const edgeInset = 0.042;
  if (side === 'left') {
    group.position.set(-w / 2 + edgeInset, Math.min(h * 0.22, h / 2 - barLength / 2 - 0.04), d / 2);
  } else if (side === 'right') {
    group.position.set(w / 2 - edgeInset, Math.min(h * 0.22, h / 2 - barLength / 2 - 0.04), d / 2);
  } else if (side === 'top') {
    group.position.set(0, h / 2 - edgeInset, d / 2);
  }

  return group;
}

/**
 * Procedural Ø35 mm concealed cup hinges (zawiasy puszkowe) mounted on the interior face of doors.
 */
export function buildDoorHingesGroup(part: FurniturePart): THREE.Group | null {
  if (part.kind !== 'door' || !part.hingeSide || part.hingeSide === 'none') {
    return null;
  }
  const count = Math.max(2, Math.min(5, part.hingeCount ?? (part.height > 1500 ? 4 : part.height > 950 ? 3 : 2)));
  const group = new THREE.Group();
  group.name = 'door_hinges';

  const steelMat = new THREE.MeshStandardMaterial({
    color: '#B8C0CA',
    metalness: 0.9,
    roughness: 0.24,
  });

  const w = part.width * MM_TO_M;
  const h = part.height * MM_TO_M;
  const d = part.depth * MM_TO_M;
  const cupRadius = 0.0175; // Ø35 mm cup
  const insetFromEdge = 0.0225; // standard K=5 + 17.5mm = 22.5mm cup center from edge

  for (let i = 0; i < count; i++) {
    const frac = count === 1 ? 0.5 : i / (count - 1);
    const hingeUnit = new THREE.Group();

    const cup = new THREE.Mesh(
      new THREE.CylinderGeometry(cupRadius, cupRadius, 0.008, 18),
      steelMat
    );
    cup.rotation.x = Math.PI / 2;
    cup.position.z = -0.004;
    cup.userData.disposeMaterial = true;
    hingeUnit.add(cup);

    const arm = new THREE.Mesh(
      new THREE.BoxGeometry(0.044, 0.015, 0.012),
      steelMat
    );
    arm.position.set(part.hingeSide === 'left' ? -0.018 : part.hingeSide === 'right' ? 0.018 : 0, 0, -0.012);
    arm.userData.disposeMaterial = true;
    hingeUnit.add(arm);

    if (part.hingeSide === 'top') {
      const margin = Math.min(0.1, w * 0.2);
      const x = -w / 2 + margin + frac * Math.max(0.05, w - margin * 2);
      hingeUnit.position.set(x, h / 2 - insetFromEdge, -d / 2);
    } else {
      const margin = Math.min(0.1, h * 0.18);
      const y = -h / 2 + margin + frac * Math.max(0.05, h - margin * 2);
      const x = part.hingeSide === 'left' ? -w / 2 + insetFromEdge : w / 2 - insetFromEdge;
      hingeUnit.position.set(x, y, -d / 2);
    }
    group.add(hingeUnit);
  }

  return group;
}

/**
 * Visual machining overlay for Dado Grooves (nut pod plecy HDF) & 45° miter chamfers (gerung).
 */
export function buildPartMachiningGroup(part: FurniturePart): THREE.Group | null {
  const hasDado = Boolean(part.dadoGroove?.enabled);
  const hasMiter = Boolean(
    part.miter45 &&
      (part.miter45.left || part.miter45.right || part.miter45.top || part.miter45.bottom)
  );
  if (!hasDado && !hasMiter) return null;

  const group = new THREE.Group();
  group.name = 'part_machining';
  const w = part.width * MM_TO_M;
  const h = part.height * MM_TO_M;
  const d = part.depth * MM_TO_M;

  if (hasDado && part.dadoGroove) {
    const g = part.dadoGroove;
    const grooveW = Math.max(0.003, g.widthMm * MM_TO_M);
    const inset = g.insetMm * MM_TO_M;
    const grooveMat = new THREE.MeshBasicMaterial({
      color: '#1C1917',
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });

    // Place groove strip on the inner face of vertical side walls (X-thin) or horizontal tops/bottoms (Y-thin)
    if (w <= h && w <= d) {
      // Side panel: groove runs vertically near back edge (-Z + inset) on both faces subtly
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.0008, h - 0.004, grooveW),
        grooveMat
      );
      strip.position.set(0, 0, -d / 2 + inset);
      strip.userData.disposeMaterial = true;
      group.add(strip);
    } else if (h <= w && h <= d) {
      // Horizontal shelf/top/bottom: groove runs along X near back edge (-Z + inset)
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.004, h + 0.0008, grooveW),
        grooveMat
      );
      strip.position.set(0, 0, -d / 2 + inset);
      strip.userData.disposeMaterial = true;
      group.add(strip);
    } else {
      const strip = new THREE.Mesh(
        new THREE.BoxGeometry(w - 0.004, grooveW, d + 0.0008),
        grooveMat
      );
      strip.position.set(0, -h / 2 + inset, 0);
      strip.userData.disposeMaterial = true;
      group.add(strip);
    }
  }

  if (hasMiter && part.miter45) {
    const miterMat = new THREE.MeshBasicMaterial({
      color: '#F59E0B',
      transparent: true,
      opacity: 0.55,
    });
    const t = 0.0025;
    if (part.miter45.left) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, h, d + 0.001), miterMat);
      m.position.set(-w / 2, 0, 0);
      m.userData.disposeMaterial = true;
      group.add(m);
    }
    if (part.miter45.right) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(t, h, d + 0.001), miterMat);
      m.position.set(w / 2, 0, 0);
      m.userData.disposeMaterial = true;
      group.add(m);
    }
    if (part.miter45.top) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, d + 0.001), miterMat);
      m.position.set(0, h / 2, 0);
      m.userData.disposeMaterial = true;
      group.add(m);
    }
    if (part.miter45.bottom) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, t, d + 0.001), miterMat);
      m.position.set(0, -h / 2, 0);
      m.userData.disposeMaterial = true;
      group.add(m);
    }
  }

  return group;
}

/**
 * Builds rich, multi-mesh 3D models for wardrobe interiors and built-in kitchen appliances
 * (closet rod with hangers, pull-out wire cargo basket, induction hob, sink with faucet, built-in oven).
 */
export function buildApplianceGroup(part: FurniturePart): THREE.Group | null {
  if (part.kind !== 'appliance' || !part.applianceModel) return null;

  const group = new THREE.Group();
  const w = Math.max(0.04, part.width * MM_TO_M);
  const h = Math.max(0.02, part.height * MM_TO_M);
  const d = Math.max(0.02, part.depth * MM_TO_M);

  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#D8DEE6',
    metalness: 0.92,
    roughness: 0.16,
  });
  const darkMetalMat = new THREE.MeshStandardMaterial({
    color: '#1E2228',
    metalness: 0.65,
    roughness: 0.35,
  });
  const glassBlackMat = new THREE.MeshPhysicalMaterial({
    color: '#101216',
    roughness: 0.08,
    metalness: 0.12,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });

  if (part.applianceModel === 'wardrobe_rod') {
    // Oval polished chrome hanging bar
    const bar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.011, 0.011, Math.max(0.08, w - 0.012), 18),
      chromeMat
    );
    bar.rotation.z = Math.PI / 2;
    bar.scale.set(1, 1, 0.62);
    bar.castShadow = true;
    group.add(bar);

    // Left & right mounting rosettes
    const flangeGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.008, 16);
    flangeGeo.rotateZ(Math.PI / 2);
    const fL = new THREE.Mesh(flangeGeo, chromeMat);
    fL.position.x = -w / 2 + 0.004;
    const fR = new THREE.Mesh(flangeGeo.clone(), chromeMat);
    fR.position.x = w / 2 - 0.004;
    group.add(fL, fR);

    // 3 realistic wooden coat hangers suspended on the rod
    const woodMat = new THREE.MeshStandardMaterial({
      color: '#B88956',
      roughness: 0.58,
      metalness: 0.02,
    });
    const hangerCount = w > 0.55 ? 3 : 2;
    for (let i = 0; i < hangerCount; i++) {
      const frac = (i / (hangerCount - 1) - 0.5) * 0.52;
      const hx = w * frac;
      const hook = new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.0025, 8, 16, Math.PI * 1.4), chromeMat);
      hook.position.set(hx, 0.002, 0);
      hook.rotation.y = Math.PI / 2;
      const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.014, 0.19), woodMat);
      leftArm.position.set(hx, -0.055, -0.085);
      leftArm.rotation.x = 0.28;
      const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.014, 0.19), woodMat);
      rightArm.position.set(hx, -0.055, 0.085);
      rightArm.rotation.x = -0.28;
      const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.32, 8), woodMat);
      crossBar.rotation.x = Math.PI / 2;
      crossBar.position.set(hx, -0.082, 0);
      group.add(hook, leftArm, rightArm, crossBar);
    }
  } else if (part.applianceModel === 'induction_hob') {
    // Sleek flush glass ceramic cooktop
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.55, d), darkMetalMat);
    base.position.y = -h * 0.2;
    const topGlass = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.28, d), glassBlackMat);
    topGlass.position.y = h * 0.22;
    topGlass.receiveShadow = true;
    group.add(base, topGlass);

    // 4 etched induction zone rings
    const ringMat = new THREE.MeshBasicMaterial({ color: '#94A3B8', side: THREE.DoubleSide });
    const zones: Array<[number, number, number]> = [
      [-w * 0.24, -d * 0.2, Math.min(w, d) * 0.19],
      [w * 0.24, -d * 0.18, Math.min(w, d) * 0.16],
      [-w * 0.24, d * 0.18, Math.min(w, d) * 0.15],
      [w * 0.24, d * 0.18, Math.min(w, d) * 0.2],
    ];
    for (const [zx, zz, r] of zones) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r - 0.003, r, 28), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(zx, h * 0.37, zz);
      group.add(ring);
    }
    // Red touch-slider control bar
    const ctrl = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.34, 0.012),
      new THREE.MeshBasicMaterial({ color: '#EF4444' })
    );
    ctrl.rotation.x = -Math.PI / 2;
    ctrl.position.set(0, h * 0.37, d * 0.4);
    group.add(ctrl);
  } else if (part.applianceModel === 'kitchen_sink') {
    const steelMat = new THREE.MeshStandardMaterial({
      color: '#C7CDD4',
      metalness: 0.85,
      roughness: 0.26,
    });
    const innerMat = new THREE.MeshStandardMaterial({
      color: '#9BA3AD',
      metalness: 0.82,
      roughness: 0.34,
    });
    // Outer rim deck sitting flush on countertop
    const rimH = 0.012;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(w, rimH, d), steelMat);
    rim.position.y = h / 2 - rimH / 2;
    group.add(rim);

    // Recessed basin walls & floor
    const bw = w * 0.86;
    const bd = d * 0.76;
    const bh = Math.max(0.08, h - rimH);
    const basin = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), innerMat);
    basin.position.set(0, -rimH / 2, d * 0.04);
    group.add(basin);

    // Dark recessed interior top illusion + chrome strainer
    const darkWell = new THREE.Mesh(
      new THREE.PlaneGeometry(bw * 0.96, bd * 0.94),
      new THREE.MeshStandardMaterial({ color: '#4B525C', metalness: 0.7, roughness: 0.4 })
    );
    darkWell.rotation.x = -Math.PI / 2;
    darkWell.position.set(0, h / 2 + 0.001, d * 0.04);
    const drain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.036, 0.036, 0.004, 18),
      chromeMat
    );
    drain.position.set(0, h / 2 + 0.002, d * 0.02);
    group.add(darkWell, drain);

    // Arched gooseneck chrome kitchen faucet
    const tapBaseZ = -d * 0.4;
    const tapPost = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.17, 14), chromeMat);
    tapPost.position.set(0, h / 2 + 0.085, tapBaseZ);
    const tapArch = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.011, 10, 22, Math.PI),
      chromeMat
    );
    tapArch.rotation.y = Math.PI / 2;
    tapArch.position.set(0, h / 2 + 0.17, tapBaseZ + 0.085);
    const tapSpout = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.045, 12), chromeMat);
    tapSpout.position.set(0, h / 2 + 0.15, tapBaseZ + 0.17);
    const lever = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.085, 8), chromeMat);
    lever.rotation.z = -Math.PI / 2.4;
    lever.position.set(0.048, h / 2 + 0.06, tapBaseZ);
    group.add(tapPost, tapArch, tapSpout, lever);
  } else if (part.applianceModel === 'builtin_oven') {
    // Dark metal body
    const body = new THREE.Mesh(new THREE.BoxGeometry(w * 0.96, h * 0.96, d * 0.92), darkMetalMat);
    body.position.z = -d * 0.04;
    // Gloss black glass front door
    const front = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.024), glassBlackMat);
    front.position.z = d / 2 - 0.012;
    front.castShadow = true;
    // Top stainless control bezel
    const bezel = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.17, 0.026), chromeMat);
    bezel.position.set(0, h * 0.415, d / 2 - 0.011);
    // Digital clock display strip
    const display = new THREE.Mesh(
      new THREE.BoxGeometry(w * 0.24, h * 0.065, 0.006),
      new THREE.MeshBasicMaterial({ color: '#0F172A' })
    );
    display.position.set(0, h * 0.415, d / 2 + 0.004);
    const clockGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.15, h * 0.024),
      new THREE.MeshBasicMaterial({ color: '#38BDF8' })
    );
    clockGlow.position.set(0, h * 0.415, d / 2 + 0.008);
    // 2 rotary control knobs
    const knobGeo = new THREE.CylinderGeometry(0.02, 0.022, 0.02, 16);
    knobGeo.rotateX(Math.PI / 2);
    const knobL = new THREE.Mesh(knobGeo, chromeMat);
    knobL.position.set(-w * 0.28, h * 0.415, d / 2 + 0.012);
    const knobR = new THREE.Mesh(knobGeo.clone(), chromeMat);
    knobR.position.set(w * 0.28, h * 0.415, d / 2 + 0.012);
    // Tubular stainless oven handle
    const handleBar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.01, w * 0.78, 12),
      chromeMat
    );
    handleBar.rotation.z = Math.PI / 2;
    handleBar.position.set(0, h * 0.25, d / 2 + 0.038);
    const standGeo = new THREE.CylinderGeometry(0.007, 0.007, 0.034, 8);
    standGeo.rotateX(Math.PI / 2);
    const sL = new THREE.Mesh(standGeo, chromeMat);
    sL.position.set(-w * 0.34, h * 0.25, d / 2 + 0.018);
    const sR = new THREE.Mesh(standGeo.clone(), chromeMat);
    sR.position.set(w * 0.34, h * 0.25, d / 2 + 0.018);
    // Subtle inner viewing window frame
    const win = new THREE.Mesh(
      new THREE.PlaneGeometry(w * 0.74, h * 0.48),
      new THREE.MeshStandardMaterial({ color: '#1F242B', roughness: 0.2, metalness: 0.4 })
    );
    win.position.set(0, -h * 0.08, d / 2 + 0.002);
    group.add(body, front, bezel, display, clockGlow, knobL, knobR, handleBar, sL, sR, win);
  } else if (part.applianceModel === 'wire_cargo') {
    // Pull-out 2-tier chrome wire cargo basket
    const postGeo = new THREE.CylinderGeometry(0.006, 0.006, h, 8);
    const corners: [number, number][] = [
      [-w / 2 + 0.01, -d / 2 + 0.01],
      [w / 2 - 0.01, -d / 2 + 0.01],
      [-w / 2 + 0.01, d / 2 - 0.01],
      [w / 2 - 0.01, d / 2 - 0.01],
    ];
    for (const [cx, cz] of corners) {
      const post = new THREE.Mesh(postGeo, chromeMat);
      post.position.set(cx, 0, cz);
      group.add(post);
    }

    const tiers = [-h * 0.36, h * 0.14];
    for (const ty of tiers) {
      // Perimeter rails (bottom + guard rail)
      for (const railOffY of [0, 0.085]) {
        const frontR = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, w - 0.02, 8), chromeMat);
        frontR.rotation.z = Math.PI / 2;
        frontR.position.set(0, ty + railOffY, d / 2 - 0.01);
        const backR = frontR.clone();
        backR.position.z = -d / 2 + 0.01;
        const leftR = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, d - 0.02, 8), chromeMat);
        leftR.rotation.x = Math.PI / 2;
        leftR.position.set(-w / 2 + 0.01, ty + railOffY, 0);
        const rightR = leftR.clone();
        rightR.position.x = w / 2 - 0.01;
        group.add(frontR, backR, leftR, rightR);
      }
      // Wire grid rods on bottom of basket
      const wireCount = Math.max(4, Math.min(9, Math.round(w / 0.045)));
      for (let i = 0; i < wireCount; i++) {
        const wx = -w / 2 + 0.02 + ((w - 0.04) * i) / (wireCount - 1);
        const wire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0025, 0.0025, d - 0.02, 6),
          chromeMat
        );
        wire.rotation.x = Math.PI / 2;
        wire.position.set(wx, ty, 0);
        group.add(wire);
      }
    }
  }

  return group;
}

/**
 * Shared geometries & materials for realistic 3D fasteners (screws, confirmats, M8 bolts, dowels).
 * Convention: Origin [0,0,0] is the board surface; +Y points outward along the surface normal;
 * shaft penetrates inward along -Y.
 */
export function buildFastenerGroup(
  type: ScrewType,
  selected: boolean,
  auditStatus?: FastenerAuditStatus
): THREE.Group {
  const group = new THREE.Group();

  const isWarn = auditStatus === 'through' || auditStatus === 'air';
  const highlightColor = '#F59E0B';
  const warnColor = '#EF4444';
  const activeColor = (base: string) =>
    selected ? highlightColor : isWarn ? warnColor : base;
  const activeEmissive = selected
    ? new THREE.Color('#92400E')
    : isWarn
      ? new THREE.Color('#991B1B')
      : new THREE.Color('#000000');

  if (type === 'wood_4x45') {
    const headMat = new THREE.MeshStandardMaterial({
      color: activeColor('#D4A84B'),
      metalness: 0.85,
      roughness: 0.26,
      emissive: activeEmissive,
    });
    const slotMat = new THREE.MeshStandardMaterial({
      color: '#3A2E14',
      metalness: 0.4,
      roughness: 0.7,
    });

    // Countersunk head slightly proud by 1.2mm for crisp visibility
    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0055, 0.0022, 0.0038, 16),
      headMat
    );
    head.position.y = -0.0005;
    group.add(head);

    // Cross recess (Phillips)
    const slot1 = new THREE.Mesh(new THREE.BoxGeometry(0.006, 0.0008, 0.0014), slotMat);
    slot1.position.y = 0.0016;
    const slot2 = new THREE.Mesh(new THREE.BoxGeometry(0.0014, 0.0008, 0.006), slotMat);
    slot2.position.y = 0.0016;
    group.add(slot1, slot2);

    // Shaft penetrating 45mm into the joint
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0021, 0.0014, 0.044, 10),
      headMat
    );
    shaft.position.y = -0.023;
    group.add(shaft);
  } else if (type === 'confirmat_7x50') {
    const mat = new THREE.MeshStandardMaterial({
      color: activeColor('#D2D8E0'),
      metalness: 0.88,
      roughness: 0.24,
      emissive: activeEmissive,
    });
    const hexMat = new THREE.MeshStandardMaterial({
      color: '#2B303A',
      metalness: 0.5,
      roughness: 0.6,
    });

    const head = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0065, 0.0065, 0.0026, 18),
      mat
    );
    head.position.y = 0.0006;
    group.add(head);

    const hex = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.001, 6), hexMat);
    hex.position.y = 0.0018;
    group.add(hex);

    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0034, 0.0031, 0.05, 12),
      mat
    );
    shaft.position.y = -0.025;
    group.add(shaft);
  } else if (type === 'minifix_15') {
    const zincMat = new THREE.MeshStandardMaterial({
      color: activeColor('#AEB8C4'),
      metalness: 0.9,
      roughness: 0.22,
      emissive: activeEmissive,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: '#2B303A',
      metalness: 0.5,
      roughness: 0.6,
    });

    // Threaded dowel bolt anchored in host board & extending 34mm into mating board
    const pin = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0032, 0.0032, 0.042, 12),
      zincMat
    );
    pin.position.y = -0.021;
    group.add(pin);

    // Ø15 mm eccentric cam lock drum seated 34mm deep inside mating board
    const camDrum = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0075, 0.0075, 0.012, 18),
      zincMat
    );
    camDrum.rotation.x = Math.PI / 2;
    camDrum.position.y = -0.034;
    group.add(camDrum);

    // Subtle flush entry collar marking the Minifix axis on host face
    const collar = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0046, 0.0046, 0.0014, 14),
      darkMat
    );
    collar.position.y = 0.0005;
    group.add(collar);
  } else if (type === 'bolt_m8') {
    const mat = new THREE.MeshStandardMaterial({
      color: activeColor('#5D6570'),
      metalness: 0.86,
      roughness: 0.3,
      emissive: activeEmissive,
    });

    // Washer
    const washer = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0095, 0.0095, 0.0016, 18),
      mat
    );
    washer.position.y = 0.0008;
    group.add(washer);

    // Hex bolt head
    const hexHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0072, 0.0072, 0.0055, 6),
      mat
    );
    hexHead.position.y = 0.0042;
    group.add(hexHead);

    // M8 bolt shaft
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.054, 12),
      mat
    );
    shaft.position.y = -0.027;
    group.add(shaft);
  } else {
    // Beechwood dowel 8x35
    const mat = new THREE.MeshStandardMaterial({
      color: activeColor('#C79B63'),
      roughness: 0.72,
      metalness: 0.02,
      emissive: activeEmissive,
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0042, 0.0042, 0.036, 14),
      mat
    );
    body.position.y = -0.016;
    group.add(body);
  }

  if (isWarn) {
    const ringGeo = new THREE.RingGeometry(0.0085, 0.012, 20);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#EF4444',
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.0022;
    group.add(ring);
  }

  return group;
}

/**
 * Compute axis-aligned bounding box in mm for a part (accounting for its rotation)
 */
export function getPartWorldBoundsMm(part: FurniturePart): {
  min: [number, number, number];
  max: [number, number, number];
} {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(part.rotation[0]),
    THREE.MathUtils.degToRad(part.rotation[1]),
    THREE.MathUtils.degToRad(part.rotation[2]),
    'XYZ'
  );
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const hx = part.width / 2;
  const hy = part.height / 2;
  const hz = part.depth / 2;

  const corners = [
    new THREE.Vector3(-hx, -hy, -hz),
    new THREE.Vector3(hx, -hy, -hz),
    new THREE.Vector3(-hx, hy, -hz),
    new THREE.Vector3(hx, hy, -hz),
    new THREE.Vector3(-hx, -hy, hz),
    new THREE.Vector3(hx, -hy, hz),
    new THREE.Vector3(-hx, hy, hz),
    new THREE.Vector3(hx, hy, hz),
  ];

  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const c of corners) {
    c.applyQuaternion(quat);
    const wx = c.x + part.position[0];
    const wy = c.y + part.position[1];
    const wz = c.z + part.position[2];
    if (wx < minX) minX = wx;
    if (wy < minY) minY = wy;
    if (wz < minZ) minZ = wz;
    if (wx > maxX) maxX = wx;
    if (wy > maxY) maxY = wy;
    if (wz > maxZ) maxZ = wz;
  }

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
  };
}

/**
 * Compute overall furniture dimensions in mm
 */
export function getProjectDimensionsMm(parts: FurniturePart[]): {
  width: number;
  height: number;
  depth: number;
} {
  if (parts.length === 0) return { width: 0, height: 0, depth: 0 };
  let minX = Infinity,
    minY = Infinity,
    minZ = Infinity;
  let maxX = -Infinity,
    maxY = -Infinity,
    maxZ = -Infinity;

  for (const part of parts) {
    const b = getPartWorldBoundsMm(part);
    minX = Math.min(minX, b.min[0]);
    minY = Math.min(minY, b.min[1]);
    minZ = Math.min(minZ, b.min[2]);
    maxX = Math.max(maxX, b.max[0]);
    maxY = Math.max(maxY, b.max[1]);
    maxZ = Math.max(maxZ, b.max[2]);
  }

  return {
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    depth: Math.round(maxZ - minZ),
  };
}

/**
 * Automatically detects structural joints between touching boards along X, Y, and Z faces
 * and generates ONLY physically valid, relationally bound fasteners verified by auditSingleFastener.
 * Pass `filterPartId` to auto-fasten only the joints touching one specific board (e.g. from context menu).
 */
export function autoDetectJointFasteners(
  parts: FurniturePart[],
  existing: Fastener[],
  screwType: ScrewType,
  filterPartId?: string
): Fastener[] {
  const added: Fastener[] = [];
  const zones = computeJointZones(parts, screwType);

  const partMap = new Map<string, FurniturePart>();
  const boxMap = new Map<string, WorldBox>();
  for (const p of parts) {
    partMap.set(p.id, p);
    boxMap.set(p.id, getPartWorldBox(p));
  }

  // Precompute world positions of existing fasteners so we never double-fasten the same joint spot
  const placedWorldPoints: THREE.Vector3[] = [];
  for (const f of existing) {
    const host = partMap.get(f.partId);
    if (!host) continue;
    placedWorldPoints.push(partLocalToWorld(host, f.localPosition));
  }

  const isNearAnyFastener = (worldPt: THREE.Vector3) => {
    for (const pt of placedWorldPoints) {
      if (pt.distanceToSquared(worldPt) < 34 * 34) return true;
    }
    return false;
  };

  const screwOrder: ScrewType[] = [
    screwType,
    ...(['wood_4x45', 'confirmat_7x50', 'minifix_15', 'dowel_8x35', 'bolt_m8'] as ScrewType[]).filter(
      (t) => t !== screwType
    ),
  ];

  for (const z of zones) {
    if (filterPartId && z.hostPartId !== filterPartId && z.targetPartId !== filterPartId) {
      continue;
    }

    const host = partMap.get(z.hostPartId);
    const other = partMap.get(z.targetPartId);
    if (!host || !other) continue;

    const longSpan = z.longMax - z.longMin;
    const count =
      longSpan > 900 ? 4 : longSpan > 380 ? 3 : longSpan > 90 ? 2 : 1;
    const margin = count === 1 ? longSpan * 0.5 : Math.min(55, longSpan * 0.22);
    const axisIdx = z.axis === 'x' ? 0 : z.axis === 'y' ? 1 : 2;
    const normalWorld = new THREE.Vector3(...z.normalWorld);

    for (let k = 0; k < count; k++) {
      const longCoord =
        count === 1
          ? z.longMin + longSpan * 0.5
          : z.longMin + margin + (k / (count - 1)) * (longSpan - margin * 2);

      const paramU =
        longSpan > 1 ? (longCoord - z.longMin) / longSpan : 0.5;

      const coords: [number, number, number] = [0, 0, 0];
      coords[axisIdx] = z.faceCoordMm;
      coords[z.longAxisIdx] = longCoord;
      coords[z.shortAxisIdx] = z.shortMid;

      const headWorld = new THREE.Vector3(coords[0], coords[1], coords[2]);
      if (!isWorldPointInsidePart(headWorld, host, 1.5)) continue;
      if (isNearAnyFastener(headWorld)) continue;

      const localPos = worldToPartLocal(host, headWorld);
      const localNorm = worldNormalToPartLocal(host, normalWorld);

      let validType: ScrewType | null = null;
      for (const candidateType of screwOrder) {
        const probeFastener: Fastener = {
          id: '__auto_probe__',
          partId: host.id,
          type: candidateType,
          localPosition: localPos,
          localNormal: localNorm,
        };
        const audit = auditSingleFastener(probeFastener, parts, partMap, boxMap);
        if (audit && audit.status === 'ok' && audit.targetPartName === other.name) {
          validType = candidateType;
          break;
        }
      }

      if (!validType) continue;

      added.push({
        id: `f_auto_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        partId: host.id,
        type: validType,
        localPosition: localPos,
        localNormal: localNorm,
        targetPartId: other.id,
        jointAxis: z.axis,
        jointParamU: Number(paramU.toFixed(4)),
      });
      placedWorldPoints.push(headWorld);
    }
  }

  return added;
}

function partLocalToWorld(
  part: FurniturePart,
  localMm: [number, number, number]
): THREE.Vector3 {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(part.rotation[0]),
    THREE.MathUtils.degToRad(part.rotation[1]),
    THREE.MathUtils.degToRad(part.rotation[2]),
    'XYZ'
  );
  const quat = new THREE.Quaternion().setFromEuler(euler);
  return new THREE.Vector3(localMm[0], localMm[1], localMm[2])
    .applyQuaternion(quat)
    .add(new THREE.Vector3(...part.position));
}

function worldToPartLocal(part: FurniturePart, worldMm: THREE.Vector3): [number, number, number] {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(part.rotation[0]),
    THREE.MathUtils.degToRad(part.rotation[1]),
    THREE.MathUtils.degToRad(part.rotation[2]),
    'XYZ'
  );
  const invQuat = new THREE.Quaternion().setFromEuler(euler).invert();
  const rel = worldMm.clone().sub(new THREE.Vector3(...part.position)).applyQuaternion(invQuat);
  return [
    Number(rel.x.toFixed(1)),
    Number(rel.y.toFixed(1)),
    Number(rel.z.toFixed(1)),
  ];
}

function worldNormalToPartLocal(part: FurniturePart, normalWorld: THREE.Vector3): [number, number, number] {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(part.rotation[0]),
    THREE.MathUtils.degToRad(part.rotation[1]),
    THREE.MathUtils.degToRad(part.rotation[2]),
    'XYZ'
  );
  const invQuat = new THREE.Quaternion().setFromEuler(euler).invert();
  const n = normalWorld.clone().applyQuaternion(invQuat).normalize();
  return [Number(n.x.toFixed(3)), Number(n.y.toFixed(3)), Number(n.z.toFixed(3))];
}
