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

/**
 * Re-project box-planar UVs onto a BufferGeometry so wood/OSB textures keep real-world scale
 * (1 tile = 650mm) AND thin cut-edge faces map cleanly across board thickness (so laminated
 * birch plywood edges show crisp parallel veneer stripes along every edge & slope!).
 */
function applyWorldScaleUVs(
  geometry: THREE.BufferGeometry,
  rotateGrain = false,
  boardDimsM?: [number, number, number],
  forcedThinAxis?: 'x' | 'y' | 'z'
) {
  const pos = geometry.attributes.position;
  const norm = geometry.attributes.normal;
  if (!pos || !norm) return;

  const uvArray = new Float32Array(pos.count * 2);
  const scale = 1 / 0.65; // 650mm per texture tile

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
      uvArray[i * 2] = v;
      uvArray[i * 2 + 1] = u;
    } else {
      uvArray[i * 2] = u;
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

/**
 * Build a realistic beveled BufferGeometry for any FurniturePart (panel, sloped/angled board,
 * structural profile, cabinet door, or bullnose kitchen countertop).
 */
export function buildPartGeometry(part: FurniturePart): THREE.BufferGeometry {
  const w = Math.max(part.width, 6) * MM_TO_M;
  const h = Math.max(part.height, 6) * MM_TO_M;
  const d = Math.max(part.depth, 4) * MM_TO_M;

  if (part.kind === 'countertop') {
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
    // ExtrudeGeometry extrudes along +Z from XY; rotate so cross-section is YZ and length is X
    geo.rotateY(Math.PI / 2);
    geo.translate(-w / 2, 0, 0);
    geo.computeVertexNormals();
    applyWorldScaleUVs(geo, !!part.grainRotated, [w, h, d]);
    assignFaceEdgeGroups(geo, [w, h, d]);
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
    applyWorldScaleUVs(geo, !!part.grainRotated, [w, h, d], 'z');
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
  const shape = new THREE.Shape();
  shape.moveTo(-innerW / 2, yBottomLeft + insetY);
  shape.lineTo(innerW / 2, yBottomRight + insetY);
  shape.lineTo(innerW / 2, Math.max(yBottomRight + insetY + 0.002, yTopRight - insetY));
  shape.lineTo(-innerW / 2, Math.max(yBottomLeft + insetY + 0.002, yTopLeft - insetY));
  shape.closePath();

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
  applyWorldScaleUVs(geo, !!part.grainRotated, [w, h, d]);
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
 * Procedural metallic bar handle for kitchen/cabinet doors (`kind === 'door'`)
 */
export function buildDoorHandleGroup(part: FurniturePart): THREE.Group | null {
  if (part.kind !== 'door' || !part.handleSide || part.handleSide === 'none') {
    return null;
  }

  const group = new THREE.Group();
  group.name = 'door_handle';

  const handleMat = new THREE.MeshStandardMaterial({
    color: '#2A2D33',
    metalness: 0.85,
    roughness: 0.28,
  });

  const w = part.width * MM_TO_M;
  const h = part.height * MM_TO_M;
  const d = part.depth * MM_TO_M;

  const isHorizontal = part.handleSide === 'top';
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
  if (part.handleSide === 'left') {
    group.position.set(-w / 2 + edgeInset, Math.min(h * 0.22, h / 2 - barLength / 2 - 0.04), d / 2);
  } else if (part.handleSide === 'right') {
    group.position.set(w / 2 - edgeInset, Math.min(h * 0.22, h / 2 - barLength / 2 - 0.04), d / 2);
  } else if (part.handleSide === 'top') {
    group.position.set(0, h / 2 - edgeInset, d / 2);
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
    ...(['wood_4x45', 'confirmat_7x50', 'dowel_8x35', 'bolt_m8'] as ScrewType[]).filter(
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
