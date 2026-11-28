import * as THREE from 'three';
import {
  SCREW_MAP,
  type Fastener,
  type FurniturePart,
  type HandleSide,
  type RoomConfig,
} from '../types/furniture';
import {
  computeWallSegments,
  findNearestWallSegment,
  getEffectiveRoomWallSlopes,
  getRoomCeilingHeightAtXZ,
  getRoomDoorSwingBox,
  getRoomPolygonPoints,
  getWallObstacleWorldBox,
  pointInPolygonXZ,
} from './roomGeometry';

export interface WorldBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface SnapResult {
  position: [number, number, number];
  snappedAxes: { x: boolean; y: boolean; z: boolean };
}

export interface CollisionPair {
  aId: string;
  bId: string;
  aName: string;
  bName: string;
  overlapMm: number;
}

export interface CollisionReport {
  collidingIds: Set<string>;
  pairs: CollisionPair[];
}

export type FastenerAuditStatus = 'ok' | 'through' | 'air';

export interface FastenerAudit {
  fastenerId: string;
  status: FastenerAuditStatus;
  reason: string;
  targetPartName?: string;
  embedDepthMm?: number;
}

export interface ClearanceGuide {
  direction: 'up' | 'down' | 'left' | 'right' | 'back';
  distanceMm: number;
  startWorld: [number, number, number];
  endWorld: [number, number, number];
  targetName: string;
  targetPartId?: string;
  isSameGroup?: boolean;
}

export interface SawCutAngle {
  label: string;
  interiorDeg: number;
  sawMiterDeg: number;
}

const DEG2RAD = Math.PI / 180;

export function getPartQuaternion(part: FurniturePart): THREE.Quaternion {
  const euler = new THREE.Euler(
    part.rotation[0] * DEG2RAD,
    part.rotation[1] * DEG2RAD,
    part.rotation[2] * DEG2RAD,
    'XYZ'
  );
  return new THREE.Quaternion().setFromEuler(euler);
}

/**
 * Centers and scales a custom 2D polygon to match part.width × part.height (mm),
 * identical to buildPartGeometry in geometry.ts so physics & 3D mesh never drift.
 */
export function getNormalizedCustomPolygon(
  part: FurniturePart
): [number, number][] | null {
  if (part.kind !== 'custom' || !part.customPolygon || part.customPolygon.length < 3) {
    return null;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
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
  const scaleX = Math.max(6, part.width) / rawW;
  const scaleY = Math.max(6, part.height) / rawH;
  return part.customPolygon.map(([px, py]) => [
    (px - cx) * scaleX,
    (py - cy) * scaleY,
  ]);
}

/**
 * Exact world-space AABB for any part (rectangular, sloped, or custom 2D polygon).
 */
export function getPartWorldBox(
  part: FurniturePart,
  overridePosition?: [number, number, number]
): WorldBox {
  const pos = overridePosition ?? part.position;
  const quat = getPartQuaternion(part);
  const hz = part.depth / 2;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  const v = new THREE.Vector3();

  const includeLocal = (lx: number, ly: number, lz: number) => {
    v.set(lx, ly, lz).applyQuaternion(quat);
    const wx = v.x + pos[0];
    const wy = v.y + pos[1];
    const wz = v.z + pos[2];
    if (wx < minX) minX = wx;
    if (wx > maxX) maxX = wx;
    if (wy < minY) minY = wy;
    if (wy > maxY) maxY = wy;
    if (wz < minZ) minZ = wz;
    if (wz > maxZ) maxZ = wz;
  };

  const normalizedPoly = getNormalizedCustomPolygon(part);
  if (normalizedPoly) {
    for (const [px, py] of normalizedPoly) {
      includeLocal(px, py, -hz);
      includeLocal(px, py, hz);
    }
  } else if (part.kind === 'sloped') {
    const hw = part.width / 2;
    const hh = part.height / 2;
    const tl = Math.min(part.height - 20, Math.max(0, part.slopeTopLeft ?? 0));
    const tr = Math.min(part.height - 20, Math.max(0, part.slopeTopRight ?? 0));
    const bl = Math.min(part.height - 20, Math.max(0, part.slopeBottomLeft ?? 0));
    const br = Math.min(part.height - 20, Math.max(0, part.slopeBottomRight ?? 0));
    const corners: [number, number][] = [
      [-hw, -hh + bl],
      [hw, -hh + br],
      [hw, hh - tr],
      [-hw, hh - tl],
    ];
    for (const [cx, cy] of corners) {
      includeLocal(cx, cy, -hz);
      includeLocal(cx, cy, hz);
    }
  } else {
    const hw = part.width / 2;
    const hh = part.height / 2;
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          includeLocal(sx * hw, sy * hh, sz * hz);
        }
      }
    }
  }

  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function pointToSegmentDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) return (px - ax) * (px - ax) + (py - ay) * (py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/**
 * Ray-casting point-in-polygon check with boundary tolerance (mm).
 */
export function isPointInPolygon2D(
  px: number,
  py: number,
  poly: [number, number][],
  toleranceMm = 0.5
): boolean {
  const n = poly.length;
  if (n < 3) return false;
  const tolSq = toleranceMm * toleranceMm;

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (pointToSegmentDistSq(px, py, xj, yj, xi, yi) <= tolSq) {
      return true;
    }
    const intersect =
      yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Checks if a world-space point (mm) lies inside the solid volume of a part.
 * Supports rectangular panels, sloped trapezoids, and arbitrary custom 2D shapes.
 */
export function isWorldPointInsidePart(
  worldPoint: THREE.Vector3,
  part: FurniturePart,
  toleranceMm = 0.5
): boolean {
  const invQuat = getPartQuaternion(part).invert();
  const local = worldPoint
    .clone()
    .sub(new THREE.Vector3(part.position[0], part.position[1], part.position[2]))
    .applyQuaternion(invQuat);

  const hz = part.depth / 2 + toleranceMm;
  if (Math.abs(local.z) > hz) return false;

  const normalizedPoly = getNormalizedCustomPolygon(part);
  if (normalizedPoly) {
    return isPointInPolygon2D(local.x, local.y, normalizedPoly, toleranceMm);
  }

  const hw = part.width / 2;
  const hh = part.height / 2;
  if (Math.abs(local.x) > hw + toleranceMm) return false;

  if (part.kind === 'sloped') {
    const u = Math.max(0, Math.min(1, (local.x + hw) / Math.max(1, part.width)));
    const tl = Math.min(part.height - 20, Math.max(0, part.slopeTopLeft ?? 0));
    const tr = Math.min(part.height - 20, Math.max(0, part.slopeTopRight ?? 0));
    const bl = Math.min(part.height - 20, Math.max(0, part.slopeBottomLeft ?? 0));
    const br = Math.min(part.height - 20, Math.max(0, part.slopeBottomRight ?? 0));
    const yTop = hh - (tl * (1 - u) + tr * u);
    const yBot = -hh + (bl * (1 - u) + br * u);
    return local.y >= yBot - toleranceMm && local.y <= yTop + toleranceMm;
  }

  return Math.abs(local.y) <= hh + toleranceMm;
}

/**
 * Magnetic face-to-face & flush-edge snapping against neighboring boards and floor (Y=0).
 */
export function snapPartToNeighbors(
  movingPart: FurniturePart,
  candidatePos: [number, number, number],
  allParts: FurniturePart[],
  thresholdMm = 28
): SnapResult {
  const myBox = getPartWorldBox(movingPart, candidatePos);
  const myOffsetMinX = myBox.minX - candidatePos[0];
  const myOffsetMaxX = myBox.maxX - candidatePos[0];
  const myOffsetMinY = myBox.minY - candidatePos[1];
  const myOffsetMaxY = myBox.maxY - candidatePos[1];
  const myOffsetMinZ = myBox.minZ - candidatePos[2];
  const myOffsetMaxZ = myBox.maxZ - candidatePos[2];

  let bestDx: number | null = null;
  let bestDy: number | null = null;
  let bestDz: number | null = null;

  const tryX = (delta: number) => {
    if (Math.abs(delta) <= thresholdMm && (bestDx === null || Math.abs(delta) < Math.abs(bestDx))) {
      bestDx = delta;
    }
  };
  const tryY = (delta: number) => {
    if (Math.abs(delta) <= thresholdMm && (bestDy === null || Math.abs(delta) < Math.abs(bestDy))) {
      bestDy = delta;
    }
  };
  const tryZ = (delta: number) => {
    if (Math.abs(delta) <= thresholdMm && (bestDz === null || Math.abs(delta) < Math.abs(bestDz))) {
      bestDz = delta;
    }
  };

  // Floor snap (Y = 0)
  tryY(-myBox.minY);

  const proximity = 180; // mm tolerance on perpendicular axes for relevant neighbor snaps

  for (const other of allParts) {
    if (other.id === movingPart.id) continue;
    if (movingPart.groupId && other.groupId === movingPart.groupId) continue;

    const ob = getPartWorldBox(other);

    const nearX = myBox.maxX >= ob.minX - proximity && myBox.minX <= ob.maxX + proximity;
    const nearY = myBox.maxY >= ob.minY - proximity && myBox.minY <= ob.maxY + proximity;
    const nearZ = myBox.maxZ >= ob.minZ - proximity && myBox.minZ <= ob.maxZ + proximity;

    if (nearY && nearZ) {
      // Face-to-face X
      tryX(ob.maxX - myBox.minX);
      tryX(ob.minX - myBox.maxX);
      // Flush edges X
      tryX(ob.minX - myBox.minX);
      tryX(ob.maxX - myBox.maxX);
    }

    if (nearX && nearZ) {
      // Face-to-face Y (stacking on top / under)
      tryY(ob.maxY - myBox.minY);
      tryY(ob.minY - myBox.maxY);
      // Flush edges Y
      tryY(ob.minY - myBox.minY);
      tryY(ob.maxY - myBox.maxY);
    }

    if (nearX && nearY) {
      // Face-to-face Z
      tryZ(ob.maxZ - myBox.minZ);
      tryZ(ob.minZ - myBox.maxZ);
      // Flush edges Z
      tryZ(ob.minZ - myBox.minZ);
      tryZ(ob.maxZ - myBox.maxZ);
    }
  }

  let finalX = candidatePos[0] + (bestDx ?? 0);
  let finalY = candidatePos[1] + (bestDy ?? 0);
  let finalZ = candidatePos[2] + (bestDz ?? 0);

  // Never sink below floor
  if (finalY + myOffsetMinY < 0) {
    finalY = -myOffsetMinY;
    bestDy = 0;
  }

  // Silence unused offset warnings if any
  void myOffsetMaxX;
  void myOffsetMinX;
  void myOffsetMaxY;
  void myOffsetMinZ;
  void myOffsetMaxZ;

  return {
    position: [
      Math.round(finalX * 10) / 10,
      Math.round(finalY * 10) / 10,
      Math.round(finalZ * 10) / 10,
    ],
    snappedAxes: {
      x: bestDx !== null,
      y: bestDy !== null,
      z: bestDz !== null,
    },
  };
}

/**
 * Real-time collision detection between boards (> toleranceMm overlap in 3D).
 * Handles custom 2D shapes and sloped panels accurately without false positives in cutouts.
 */
export function detectPartCollisions(
  parts: FurniturePart[],
  toleranceMm = 2.0
): CollisionReport {
  const boxes = parts.map((p) => getPartWorldBox(p));
  const collidingIds = new Set<string>();
  const pairs: CollisionPair[] = [];
  const samplePt = new THREE.Vector3();

  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    if (a.kind === 'appliance') continue;
    const ba = boxes[i];

    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      if (b.kind === 'appliance') continue;
      const bb = boxes[j];

      const oxMin = Math.max(ba.minX, bb.minX);
      const oxMax = Math.min(ba.maxX, bb.maxX);
      const oyMin = Math.max(ba.minY, bb.minY);
      const oyMax = Math.min(ba.maxY, bb.maxY);
      const ozMin = Math.max(ba.minZ, bb.minZ);
      const ozMax = Math.min(ba.maxZ, bb.maxZ);

      const dx = oxMax - oxMin;
      const dy = oyMax - oyMin;
      const dz = ozMax - ozMin;

      if (dx <= toleranceMm || dy <= toleranceMm || dz <= toleranceMm) {
        continue;
      }

      // Allow legitimate dado-groove joints (e.g. 3-4mm HDF back or recessed Blum drawer bottom inside a grooved board)
      const isThinHdf = (p: FurniturePart) =>
        Math.min(p.width, p.height, p.depth) <= 4.5 &&
        (p.materialId === 'hdf_white' || p.materialId === 'hdf_black' || /hdf|plecy|dno/i.test(p.name));
      if (
        (isThinHdf(a) && b.dadoGroove?.enabled && Math.min(dx, dy, dz) <= (b.dadoGroove.widthMm ?? 4) + 1) ||
        (isThinHdf(b) && a.dadoGroove?.enabled && Math.min(dx, dy, dz) <= (a.dadoGroove.widthMm ?? 4) + 1)
      ) {
        continue;
      }

      // Check if either part is rotated non-orthogonally, sloped, or custom polygon
      const needsExactSample =
        a.kind === 'custom' ||
        b.kind === 'custom' ||
        a.kind === 'sloped' ||
        b.kind === 'sloped' ||
        a.rotation.some((r) => Math.abs(r % 90) > 0.5) ||
        b.rotation.some((r) => Math.abs(r % 90) > 0.5);

      if (needsExactSample) {
        let hit = false;
        const steps = [0.2, 0.5, 0.8];
        for (const fx of steps) {
          if (hit) break;
          for (const fy of steps) {
            if (hit) break;
            for (const fz of [0.3, 0.7]) {
              samplePt.set(
                oxMin + dx * fx,
                oyMin + dy * fy,
                ozMin + dz * fz
              );
              if (
                isWorldPointInsidePart(samplePt, a, -0.5) &&
                isWorldPointInsidePart(samplePt, b, -0.5)
              ) {
                hit = true;
                break;
              }
            }
          }
        }
        if (!hit) continue;
      }

      collidingIds.add(a.id);
      collidingIds.add(b.id);
      pairs.push({
        aId: a.id,
        bId: b.id,
        aName: a.name,
        bName: b.name,
        overlapMm: Math.round(Math.min(dx, dy, dz)),
      });
    }
  }

  return { collidingIds, pairs };
}

/**
 * Audits a single fastener against all parts in the scene.
 * Shared single source of truth used by both analyzeFasteners and autoDetectJointFasteners.
 */
export function auditSingleFastener(
  f: Fastener,
  parts: FurniturePart[],
  partMap: Map<string, FurniturePart>,
  boxMap: Map<string, WorldBox>
): FastenerAudit | null {
  const host = partMap.get(f.partId);
  if (!host) return null;

  const meta = SCREW_MAP[f.type];
  const lengthMm = meta.lengthMm;
  const hostQuat = getPartQuaternion(host);
  const hostPos = new THREE.Vector3(...host.position);

  const headWorld = new THREE.Vector3(...f.localPosition)
    .applyQuaternion(hostQuat)
    .add(hostPos);

  const outwardNormal = new THREE.Vector3(...f.localNormal)
    .applyQuaternion(hostQuat)
    .normalize();

  const inwardDir = outwardNormal.clone().negate();

  // Candidate neighbors whose AABB is near the screw ray
  const tipWorld = headWorld.clone().addScaledVector(inwardDir, lengthMm);
  const rayMinX = Math.min(headWorld.x, tipWorld.x) - 5;
  const rayMaxX = Math.max(headWorld.x, tipWorld.x) + 5;
  const rayMinY = Math.min(headWorld.y, tipWorld.y) - 5;
  const rayMaxY = Math.max(headWorld.y, tipWorld.y) + 5;
  const rayMinZ = Math.min(headWorld.z, tipWorld.z) - 5;
  const rayMaxZ = Math.max(headWorld.z, tipWorld.z) + 5;

  const candidateNeighbors = parts.filter((p) => {
    if (p.id === host.id) return false;
    const b = boxMap.get(p.id)!;
    return (
      b.maxX >= rayMinX &&
      b.minX <= rayMaxX &&
      b.maxY >= rayMinY &&
      b.minY <= rayMaxY &&
      b.maxZ >= rayMinZ &&
      b.minZ <= rayMaxZ
    );
  });

  const stepMm = 2;
  const neighborHits = new Map<string, number>();
  let tipInsideAny = false;
  const probe = new THREE.Vector3();

  for (let t = 2; t <= lengthMm; t += stepMm) {
    probe.copy(headWorld).addScaledVector(inwardDir, t);
    const inHost = isWorldPointInsidePart(probe, host, 0.8);
    let inNeighbor = false;

    for (const nb of candidateNeighbors) {
      if (isWorldPointInsidePart(probe, nb, 0.8)) {
        inNeighbor = true;
        neighborHits.set(nb.id, (neighborHits.get(nb.id) ?? 0) + stepMm);
      }
    }

    if (t >= lengthMm - stepMm) {
      tipInsideAny = inHost || inNeighbor;
    }
  }

  // Exact tip check at lengthMm - 0.5mm
  probe.copy(headWorld).addScaledVector(inwardDir, Math.max(2, lengthMm - 0.5));
  const tipInHost = isWorldPointInsidePart(probe, host, 0.8);
  let tipInNeighbor = false;
  for (const nb of candidateNeighbors) {
    if (isWorldPointInsidePart(probe, nb, 0.8)) {
      tipInNeighbor = true;
      break;
    }
  }
  tipInsideAny = tipInsideAny && (tipInHost || tipInNeighbor);

  let bestTarget: FurniturePart | undefined;
  let bestEmbedMm = 0;
  for (const [nbId, mm] of neighborHits.entries()) {
    if (mm > bestEmbedMm) {
      bestEmbedMm = mm;
      bestTarget = partMap.get(nbId);
    }
  }

  if (!bestTarget || bestEmbedMm < 6) {
    return {
      fastenerId: f.id,
      status: 'air',
      reason: tipInsideAny
        ? 'Wkręt siedzi tylko w jednej płycie (nie łapie sąsiedniego elementu).'
        : 'Wkręt w powietrzu — nie łapie sąsiedniej płyty i wystaje z tyłu!',
    };
  }
  if (!tipInsideAny) {
    return {
      fastenerId: f.id,
      status: 'through',
      targetPartName: bestTarget.name,
      embedDepthMm: bestEmbedMm,
      reason: `Przelot! ${meta.shortName} przechodzi na wylot przez „${bestTarget.name}”.`,
    };
  }
  return {
    fastenerId: f.id,
    status: 'ok',
    targetPartName: bestTarget.name,
    embedDepthMm: bestEmbedMm,
    reason: `OK — wkręcony w „${bestTarget.name}” na ok. ${bestEmbedMm} mm.`,
  };
}

/**
 * Physical fastener audit: checks whether each screw/confirmat/bolt/dowel
 * actually bites into a neighboring board and doesn't poke out the other side.
 */
export function analyzeFasteners(
  parts: FurniturePart[],
  fasteners: Fastener[]
): Map<string, FastenerAudit> {
  const result = new Map<string, FastenerAudit>();
  const partMap = new Map<string, FurniturePart>();
  const boxMap = new Map<string, WorldBox>();

  for (const p of parts) {
    partMap.set(p.id, p);
    boxMap.set(p.id, getPartWorldBox(p));
  }

  for (const f of fasteners) {
    const audit = auditSingleFastener(f, parts, partMap, boxMap);
    if (audit) {
      result.set(f.id, audit);
    }
  }

  return result;
}

/**
 * Cleans bevel chamfer normals on manual screw clicks and gently snaps a clicked
 * screw onto a touching board behind the face (within 28 mm) so carpentry screws
 * hit the centerline of hidden 18 mm shelves reliably.
 */
export function snapManualFastenerToJoint(
  partId: string,
  rawLocalPos: [number, number, number],
  rawLocalNorm: [number, number, number],
  screwType: Fastener['type'],
  parts: FurniturePart[],
  snapRadiusMm = 28
): { localPosition: [number, number, number]; localNormal: [number, number, number] } {
  const partMap = new Map<string, FurniturePart>();
  const boxMap = new Map<string, WorldBox>();
  for (const p of parts) {
    partMap.set(p.id, p);
    boxMap.set(p.id, getPartWorldBox(p));
  }

  const host = partMap.get(partId);
  if (!host) {
    return { localPosition: rawLocalPos, localNormal: rawLocalNorm };
  }

  // 1. Clean 45° bevel chamfer normals on orthogonal board faces
  let norm: [number, number, number] = [...rawLocalNorm];
  let pos: [number, number, number] = [...rawLocalPos];
  const ax = Math.abs(norm[0]);
  const ay = Math.abs(norm[1]);
  const az = Math.abs(norm[2]);

  if (host.kind === 'panel' || host.kind === 'profile' || host.kind === 'door' || host.kind === 'countertop') {
    if (ax >= ay && ax >= az) {
      const s = norm[0] >= 0 ? 1 : -1;
      norm = [s, 0, 0];
      pos[0] = Number(((s * host.width) / 2).toFixed(1));
    } else if (ay >= ax && ay >= az) {
      const s = norm[1] >= 0 ? 1 : -1;
      norm = [0, s, 0];
      pos[1] = Number(((s * host.height) / 2).toFixed(1));
    } else {
      const s = norm[2] >= 0 ? 1 : -1;
      norm = [0, 0, s];
      pos[2] = Number(((s * host.depth) / 2).toFixed(1));
    }
  } else if (az > 0.65) {
    // Broad front/back face of sloped or custom board
    const s = norm[2] >= 0 ? 1 : -1;
    norm = [0, 0, s];
    pos[2] = Number(((s * host.depth) / 2).toFixed(1));
  }

  const testCandidate = (candPos: [number, number, number]): FastenerAudit | null =>
    auditSingleFastener(
      { id: '__probe__', partId, type: screwType, localPosition: candPos, localNormal: norm },
      parts,
      partMap,
      boxMap
    );

  // 2. Search for a touching neighbor behind the clicked point within snapRadiusMm
  // and always snap onto the thin mating board's exact centerline (e.g. 9 mm in 18 mm board)
  const hostQuat = getPartQuaternion(host);
  const invHostQuat = hostQuat.clone().invert();
  const hostPos = new THREE.Vector3(...host.position);
  const headWorld = new THREE.Vector3(...pos).applyQuaternion(hostQuat).add(hostPos);
  const inwardWorld = new THREE.Vector3(...norm).applyQuaternion(hostQuat).normalize().negate();

  // Probe point just past the back side of the host along inwardWorld
  const screwLen = SCREW_MAP[screwType].lengthMm;
  let bestSnapPos: [number, number, number] | null = null;
  let bestDistSq = snapRadiusMm * snapRadiusMm;

  for (const nb of parts) {
    if (
      nb.id === host.id ||
      nb.kind === 'door' ||
      nb.kind === 'appliance' ||
      nb.materialId === 'glass_clear'
    ) {
      continue;
    }
    const nbox = boxMap.get(nb.id)!;

    // Check if neighbor lies along the inward ray (within screw length + small tolerance)
    const sampleDepth = Math.min(screwLen - 6, Math.max(18, screwLen * 0.65));
    const probeW = headWorld.clone().addScaledVector(inwardWorld, sampleDepth);

    // Closest point on neighbor AABB to probeW
    const clampedX = Math.max(nbox.minX, Math.min(nbox.maxX, probeW.x));
    const clampedY = Math.max(nbox.minY, Math.min(nbox.maxY, probeW.y));
    const clampedZ = Math.max(nbox.minZ, Math.min(nbox.maxZ, probeW.z));

    const dx = clampedX - probeW.x;
    const dy = clampedY - probeW.y;
    const dz = clampedZ - probeW.z;
    const distSq = dx * dx + dy * dy + dz * dz;
    if (distSq > bestDistSq) continue;

    // Pull laterally toward the center of the thin dimension of the neighbor
    const targetW = new THREE.Vector3(
      nbox.maxX - nbox.minX <= 50 ? (nbox.minX + nbox.maxX) / 2 : clampedX,
      nbox.maxY - nbox.minY <= 50 ? (nbox.minY + nbox.maxY) / 2 : clampedY,
      nbox.maxZ - nbox.minZ <= 50 ? (nbox.minZ + nbox.maxZ) / 2 : clampedZ
    );

    // Project lateral offset back onto the host's clicked face plane
    const offsetW = targetW.clone().sub(headWorld);
    const alongNormal = offsetW.dot(inwardWorld);
    offsetW.addScaledVector(inwardWorld, -alongNormal);
    if (offsetW.lengthSq() > bestDistSq) continue;

    const snappedHeadW = headWorld.clone().add(offsetW);
    if (!isWorldPointInsidePart(snappedHeadW, host, 1.5)) continue;

    const relLocal = snappedHeadW.clone().sub(hostPos).applyQuaternion(invHostQuat);
    const candPos: [number, number, number] = [
      Number(relLocal.x.toFixed(1)),
      Number(relLocal.y.toFixed(1)),
      Number(relLocal.z.toFixed(1)),
    ];
    // Preserve exact face depth coordinate
    if (Math.abs(norm[0]) > 0.9) candPos[0] = pos[0];
    if (Math.abs(norm[1]) > 0.9) candPos[1] = pos[1];
    if (Math.abs(norm[2]) > 0.9) candPos[2] = pos[2];

    const check = testCandidate(candPos);
    if (check?.status === 'ok') {
      bestDistSq = offsetW.lengthSq();
      bestSnapPos = candPos;
    }
  }

  return {
    localPosition: bestSnapPos ?? pos,
    localNormal: norm,
  };
}

export interface JointZone {
  id: string;
  hostPartId: string;
  targetPartId: string;
  targetPartName: string;
  axis: 'x' | 'y' | 'z';
  /** Outer host face coordinate along contact axis (mm) */
  faceCoordMm: number;
  /** Outward unit normal in world space */
  normalWorld: [number, number, number];
  /** Center of the mounting strip on the outer host face (world mm) */
  worldCenter: [number, number, number];
  /** Size of the mounting strip [sx, sy, sz] in world mm (thin along contact axis) */
  worldSize: [number, number, number];
  /** Long axis index (0=X, 1=Y, 2=Z) and bounds along the contact patch */
  longAxisIdx: 0 | 1 | 2;
  shortAxisIdx: 0 | 1 | 2;
  longMin: number;
  longMax: number;
  shortMid: number;
  /** Best screw type that fits this joint's thickness */
  recommendedScrew: Fastener['type'];
}

export interface ScrewHoverFeedback {
  partId: string;
  localPosition: [number, number, number];
  localNormal: [number, number, number];
  worldPosition: [number, number, number];
  worldNormal: [number, number, number];
  status: FastenerAuditStatus;
  reason: string;
  targetPartId?: string;
  targetPartName?: string;
  embedDepthMm?: number;
  recommendedType: Fastener['type'];
  snappedToJoint: boolean;
}

function worldToPartLocalPrecise(
  part: FurniturePart,
  worldMm: THREE.Vector3
): [number, number, number] {
  const invQuat = getPartQuaternion(part).invert();
  const rel = worldMm
    .clone()
    .sub(new THREE.Vector3(...part.position))
    .applyQuaternion(invQuat);
  return [
    Number(rel.x.toFixed(1)),
    Number(rel.y.toFixed(1)),
    Number(rel.z.toFixed(1)),
  ];
}

function worldNormalToPartLocalPrecise(
  part: FurniturePart,
  normalWorld: THREE.Vector3
): [number, number, number] {
  const invQuat = getPartQuaternion(part).invert();
  const n = normalWorld.clone().applyQuaternion(invQuat).normalize();
  return [Number(n.x.toFixed(3)), Number(n.y.toFixed(3)), Number(n.z.toFixed(3))];
}

/**
 * Computes all physically valid structural contact patches ("strefy styku")
 * across X, Y, and Z faces so the UI can highlight legal screw mounting strips
 * and synchronize screws automatically when boards move or resize.
 */
export function computeJointZones(
  parts: FurniturePart[],
  preferredScrewType: Fastener['type'] = 'wood_4x45'
): JointZone[] {
  const zones: JointZone[] = [];
  const tol = 2.5;

  const isThinHdfBackOrBottom = (p: FurniturePart): boolean => {
    const minDim = Math.min(p.width, p.height, p.depth);
    return (
      minDim <= 4.5 &&
      (p.materialId === 'hdf_white' ||
        p.materialId === 'hdf_black' ||
        /hdf|plecy|dno/i.test(p.name))
    );
  };

  const isNonFastenable = (p: FurniturePart): boolean =>
    p.kind === 'door' ||
    p.kind === 'appliance' ||
    p.materialId === 'glass_clear' ||
    p.hardwareTag === 'leg' ||
    p.hardwareTag === 'drawer_front' ||
    p.hardwareTag === 'sliding_door' ||
    isThinHdfBackOrBottom(p);

  const isSteelPart = (p: FurniturePart): boolean =>
    p.materialId === 'steel_black' || p.materialId === 'steel_galv';

  const partMap = new Map<string, FurniturePart>();
  const boxMap = new Map<string, WorldBox>();
  for (const p of parts) {
    partMap.set(p.id, p);
    boxMap.set(p.id, getPartWorldBox(p));
  }

  const baseScrewOrder: Fastener['type'][] = [
    preferredScrewType,
    ...(['wood_4x45', 'confirmat_7x50', 'minifix_15', 'dowel_8x35', 'bolt_m8'] as Fastener['type'][]).filter(
      (t) => t !== preferredScrewType
    ),
  ];

  const getPairScrewOrder = (host: FurniturePart, other: FurniturePart): Fastener['type'][] => {
    if (isSteelPart(host) || isSteelPart(other)) {
      return [
        'bolt_m8',
        ...baseScrewOrder.filter((t) => t !== 'bolt_m8'),
      ];
    }
    if (host.hardwareTag === 'drawer_box' || other.hardwareTag === 'drawer_box') {
      const drwPref: Fastener['type'][] = ['wood_4x45', 'confirmat_7x50', 'dowel_8x35', 'minifix_15'];
      return drwPref;
    }
    return baseScrewOrder;
  };

  const evaluateAxis = (
    a: FurniturePart,
    b: FurniturePart,
    ba: WorldBox,
    bb: WorldBox,
    axis: 'x' | 'y' | 'z',
    oMin: [number, number, number],
    oMax: [number, number, number]
  ) => {
    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    const uIdx = (idx === 0 ? 1 : 0) as 0 | 1 | 2;
    const vIdx = (idx === 2 ? 1 : 2) as 0 | 1 | 2;

    const uSpan = oMax[uIdx] - oMin[uIdx];
    const vSpan = oMax[vIdx] - oMin[vIdx];
    if (uSpan < 10 || vSpan < 10) return;
    if (Math.max(uSpan, vSpan) < 22) return;

    const thickA =
      axis === 'x' ? ba.maxX - ba.minX : axis === 'y' ? ba.maxY - ba.minY : ba.maxZ - ba.minZ;
    const thickB =
      axis === 'x' ? bb.maxX - bb.minX : axis === 'y' ? bb.maxY - bb.minY : bb.maxZ - bb.minZ;

    const candidates: Array<{
      host: FurniturePart;
      other: FurniturePart;
      bHost: WorldBox;
      bOther: WorldBox;
      thick: number;
    }> = [];
    if (thickA <= 48 && a.kind !== 'countertop') {
      candidates.push({ host: a, other: b, bHost: ba, bOther: bb, thick: thickA });
    }
    if (thickB <= 48 && b.kind !== 'countertop') {
      candidates.push({ host: b, other: a, bHost: bb, bOther: ba, thick: thickB });
    }
    if (candidates.length === 0) return;

    candidates.sort((c1, c2) => c1.thick - c2.thick);

    const longAxisIdx = uSpan >= vSpan ? uIdx : vIdx;
    const shortAxisIdx = uSpan >= vSpan ? vIdx : uIdx;
    const longMin = oMin[longAxisIdx];
    const longMax = oMax[longAxisIdx];
    const shortSpan = oMax[shortAxisIdx] - oMin[shortAxisIdx];
    const shortMid = (oMin[shortAxisIdx] + oMax[shortAxisIdx]) / 2;

    for (const cand of candidates) {
      const { host, other, bHost, bOther } = cand;
      const hostCenter =
        axis === 'x'
          ? (bHost.minX + bHost.maxX) / 2
          : axis === 'y'
            ? (bHost.minY + bHost.maxY) / 2
            : (bHost.minZ + bHost.maxZ) / 2;
      const otherCenter =
        axis === 'x'
          ? (bOther.minX + bOther.maxX) / 2
          : axis === 'y'
            ? (bOther.minY + bOther.maxY) / 2
            : (bOther.minZ + bOther.maxZ) / 2;

      const hostBeforeOther = hostCenter < otherCenter;
      const faceCoord =
        axis === 'x'
          ? hostBeforeOther
            ? bHost.minX
            : bHost.maxX
          : axis === 'y'
            ? hostBeforeOther
              ? bHost.minY
              : bHost.maxY
            : hostBeforeOther
              ? bHost.minZ
              : bHost.maxZ;

      const normalTuple: [number, number, number] = [
        axis === 'x' ? (hostBeforeOther ? -1 : 1) : 0,
        axis === 'y' ? (hostBeforeOther ? -1 : 1) : 0,
        axis === 'z' ? (hostBeforeOther ? -1 : 1) : 0,
      ];

      // Countertops may ONLY be fastened upward from underneath (e.g. via kitchen stretchers)
      if (other.kind === 'countertop' && !(axis === 'y' && normalTuple[1] === -1)) {
        continue;
      }

      const normalVec = new THREE.Vector3(...normalTuple);
      const pairScrewOrder = getPairScrewOrder(host, other);
      const minRequiredEmbed = isSteelPart(host) && cand.thick >= 30 ? 10 : 6;

      // Probe 3 points along the long span to confirm at least one valid screw fits
      const testFractions = [0.5, 0.25, 0.75];
      let matchedScrew: Fastener['type'] | null = null;

      for (const frac of testFractions) {
        if (matchedScrew) break;
        const coords: [number, number, number] = [0, 0, 0];
        coords[idx] = faceCoord;
        coords[longAxisIdx] = longMin + (longMax - longMin) * frac;
        coords[shortAxisIdx] = shortMid;
        const headW = new THREE.Vector3(...coords);
        if (!isWorldPointInsidePart(headW, host, 1.5)) continue;

        const localPos = worldToPartLocalPrecise(host, headW);
        const localNorm = worldNormalToPartLocalPrecise(host, normalVec);

        for (const st of pairScrewOrder) {
          const audit = auditSingleFastener(
            {
              id: '__zone_probe__',
              partId: host.id,
              type: st,
              localPosition: localPos,
              localNormal: localNorm,
            },
            parts,
            partMap,
            boxMap
          );
          if (
            audit &&
            audit.status === 'ok' &&
            audit.targetPartName === other.name &&
            (audit.embedDepthMm ?? 0) >= minRequiredEmbed
          ) {
            matchedScrew = st;
            break;
          }
        }
      }

      if (!matchedScrew) continue;

      const center: [number, number, number] = [0, 0, 0];
      center[idx] = faceCoord;
      center[longAxisIdx] = (longMin + longMax) / 2;
      center[shortAxisIdx] = shortMid;

      const size: [number, number, number] = [1.5, 1.5, 1.5];
      size[longAxisIdx] = Math.max(12, longMax - longMin);
      size[shortAxisIdx] = Math.min(28, Math.max(10, shortSpan));

      zones.push({
        id: `jz_${host.id}_${other.id}_${axis}`,
        hostPartId: host.id,
        targetPartId: other.id,
        targetPartName: other.name,
        axis,
        faceCoordMm: faceCoord,
        normalWorld: normalTuple,
        worldCenter: center,
        worldSize: size,
        longAxisIdx,
        shortAxisIdx,
        longMin,
        longMax,
        shortMid,
        recommendedScrew: matchedScrew,
      });
      return;
    }
  };

  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    if (isNonFastenable(a)) continue;
    const aAligned =
      Math.abs(a.rotation[0] % 90) < 1 &&
      Math.abs(a.rotation[1] % 90) < 1 &&
      Math.abs(a.rotation[2] % 90) < 1;
    if (!aAligned) continue;
    const ba = boxMap.get(a.id)!;

    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      if (isNonFastenable(b)) continue;
      const bAligned =
        Math.abs(b.rotation[0] % 90) < 1 &&
        Math.abs(b.rotation[1] % 90) < 1 &&
        Math.abs(b.rotation[2] % 90) < 1;
      if (!bAligned) continue;
      const bb = boxMap.get(b.id)!;

      // Movable drawer boxes must NEVER be screwed/doweled to the cabinet carcass or another drawer!
      if (a.hardwareTag === 'drawer_box' || b.hardwareTag === 'drawer_box') {
        if (a.hardwareTag !== 'drawer_box' || b.hardwareTag !== 'drawer_box') continue;
        if (Math.abs(ba.minY - bb.minY) > 6 || Math.abs(ba.maxY - bb.maxY) > 6) continue;
      }

      const oxMin = Math.max(ba.minX, bb.minX);
      const oxMax = Math.min(ba.maxX, bb.maxX);
      const oyMin = Math.max(ba.minY, bb.minY);
      const oyMax = Math.min(ba.maxY, bb.maxY);
      const ozMin = Math.max(ba.minZ, bb.minZ);
      const ozMax = Math.min(ba.maxZ, bb.maxZ);

      const ox = oxMax - oxMin;
      const oy = oyMax - oyMin;
      const oz = ozMax - ozMin;

      const oMin: [number, number, number] = [oxMin, oyMin, ozMin];
      const oMax: [number, number, number] = [oxMax, oyMax, ozMax];

      if (ox >= -tol && ox <= tol) evaluateAxis(a, b, ba, bb, 'x', oMin, oMax);
      if (oy >= -tol && oy <= tol) evaluateAxis(a, b, ba, bb, 'y', oMin, oMax);
      if (oz >= -tol && oz <= tol) evaluateAxis(a, b, ba, bb, 'z', oMin, oMax);
    }
  }

  return zones;
}

/**
 * Live hover & click evaluation for the Screw tool:
 * snaps cleanly onto nearby joint strips behind the hovered face, verifies
 * real penetration depth, and returns Green ('ok') vs Red ('air'/'through') feedback.
 */
export function evaluateScrewPlacement(
  partId: string,
  rawLocalPos: [number, number, number],
  rawLocalNorm: [number, number, number],
  screwType: Fastener['type'],
  parts: FurniturePart[],
  autoFitLength = true
): ScrewHoverFeedback | null {
  const partMap = new Map<string, FurniturePart>();
  const boxMap = new Map<string, WorldBox>();
  for (const p of parts) {
    partMap.set(p.id, p);
    boxMap.set(p.id, getPartWorldBox(p));
  }

  const host = partMap.get(partId);
  if (!host) return null;

  const snapped = snapManualFastenerToJoint(
    partId,
    rawLocalPos,
    rawLocalNorm,
    screwType,
    parts,
    30
  );

  const snappedToJoint =
    Math.hypot(
      snapped.localPosition[0] - rawLocalPos[0],
      snapped.localPosition[1] - rawLocalPos[1],
      snapped.localPosition[2] - rawLocalPos[2]
    ) > 1.2;

  let chosenType: Fastener['type'] = screwType;
  let audit = auditSingleFastener(
    {
      id: '__hover__',
      partId,
      type: chosenType,
      localPosition: snapped.localPosition,
      localNormal: snapped.localNormal,
    },
    parts,
    partMap,
    boxMap
  );

  // If the clicked/snapped spot hits a board but chosen screw is slightly too short/long, check if a catalog screw fits
  if (autoFitLength && audit && audit.status !== 'ok') {
    const fallbacks = (['wood_4x45', 'confirmat_7x50', 'minifix_15', 'dowel_8x35', 'bolt_m8'] as Fastener['type'][]).filter(
      (t) => t !== screwType
    );
    for (const fb of fallbacks) {
      const fbSnap = snapManualFastenerToJoint(partId, rawLocalPos, rawLocalNorm, fb, parts, 30);
      const fbAudit = auditSingleFastener(
        {
          id: '__hover_fb__',
          partId,
          type: fb,
          localPosition: fbSnap.localPosition,
          localNormal: fbSnap.localNormal,
        },
        parts,
        partMap,
        boxMap
      );
      if (fbAudit?.status === 'ok') {
        chosenType = fb;
        audit = fbAudit;
        snapped.localPosition = fbSnap.localPosition;
        snapped.localNormal = fbSnap.localNormal;
        break;
      }
    }
  }

  const hostQuat = getPartQuaternion(host);
  const hostPos = new THREE.Vector3(...host.position);
  const worldPos = new THREE.Vector3(...snapped.localPosition)
    .applyQuaternion(hostQuat)
    .add(hostPos);
  const worldNorm = new THREE.Vector3(...snapped.localNormal)
    .applyQuaternion(hostQuat)
    .normalize();

  const targetPart = audit?.targetPartName
    ? parts.find((p) => p.id !== host.id && p.name === audit?.targetPartName)
    : undefined;

  return {
    partId,
    localPosition: snapped.localPosition,
    localNormal: snapped.localNormal,
    worldPosition: [worldPos.x, worldPos.y, worldPos.z],
    worldNormal: [worldNorm.x, worldNorm.y, worldNorm.z],
    status: audit?.status ?? 'air',
    reason: audit?.reason ?? 'Brak sąsiedniej płyty za ścianką',
    targetPartId: targetPart?.id,
    targetPartName: audit?.targetPartName,
    embedDepthMm: audit?.embedDepthMm,
    recommendedType: chosenType,
    snappedToJoint,
  };
}

/**
 * Enriches a fastener with relational joint metadata (targetPartId, jointAxis, jointParamU)
 * so future moves/resizes of either board keep the screw automatically synchronized.
 */
export function bindFastenerToJoint(
  fastener: Fastener,
  parts: FurniturePart[],
  zones?: JointZone[]
): Fastener {
  const host = parts.find((p) => p.id === fastener.partId);
  if (!host) return fastener;

  const activeZones = zones ?? computeJointZones(parts, fastener.type);
  const hostQuat = getPartQuaternion(host);
  const headWorld = new THREE.Vector3(...fastener.localPosition)
    .applyQuaternion(hostQuat)
    .add(new THREE.Vector3(...host.position));
  const normWorld = new THREE.Vector3(...fastener.localNormal)
    .applyQuaternion(hostQuat)
    .normalize();

  let bestZone: JointZone | null = null;
  let bestScore = Infinity;

  for (const z of activeZones) {
    if (z.hostPartId !== fastener.partId) continue;
    const dot =
      normWorld.x * z.normalWorld[0] +
      normWorld.y * z.normalWorld[1] +
      normWorld.z * z.normalWorld[2];
    if (dot < 0.85) continue;

    const coords = [headWorld.x, headWorld.y, headWorld.z];
    const axisIdx = z.axis === 'x' ? 0 : z.axis === 'y' ? 1 : 2;
    const dFace = Math.abs(coords[axisIdx] - z.faceCoordMm);
    const dShort = Math.abs(coords[z.shortAxisIdx] - z.shortMid);
    const longVal = coords[z.longAxisIdx];
    const outsideLong =
      longVal < z.longMin - 15
        ? z.longMin - longVal
        : longVal > z.longMax + 15
          ? longVal - z.longMax
          : 0;

    if (dFace > 8 || dShort > 28 || outsideLong > 20) continue;
    const score = dFace * 2 + dShort + outsideLong;
    if (score < bestScore) {
      bestScore = score;
      bestZone = z;
    }
  }

  if (!bestZone) return fastener;

  const coords = [headWorld.x, headWorld.y, headWorld.z];
  const span = Math.max(1, bestZone.longMax - bestZone.longMin);
  const paramU = Math.max(
    0.05,
    Math.min(0.95, (coords[bestZone.longAxisIdx] - bestZone.longMin) / span)
  );

  return {
    ...fastener,
    targetPartId: bestZone.targetPartId,
    jointAxis: bestZone.axis,
    jointParamU: Number(paramU.toFixed(4)),
  };
}

/**
 * Synchronizes all fasteners whenever one or more boards are moved or resized:
 * - Fasteners attached to a joint slide along the host face to follow the mating shelf/panel.
 * - Proportional spacing (`jointParamU`) adapts when boards are widened/deepened.
 * - Screws whose joint was pulled completely apart (no longer touching) are cleanly dropped
 *   so no floating ghost screws remain in mid-air (fully reversible with Undo!).
 */
export function syncFastenersWithParts(
  prevParts: FurniturePart[],
  nextParts: FurniturePart[],
  fasteners: Fastener[],
  changedPartIds: Set<string>
): { fasteners: Fastener[]; movedCount: number; removedCount: number } {
  if (fasteners.length === 0 || changedPartIds.size === 0) {
    return { fasteners, movedCount: 0, removedCount: 0 };
  }

  // First bind any legacy/unbound fasteners against the PREVIOUS geometry so we know who they joined!
  const prevZones = computeJointZones(prevParts);
  const boundFasteners = fasteners.map((f) =>
    f.targetPartId ? f : bindFastenerToJoint(f, prevParts, prevZones)
  );

  const nextZones = computeJointZones(nextParts);
  const nextPartMap = new Map<string, FurniturePart>();
  const nextBoxMap = new Map<string, WorldBox>();
  for (const p of nextParts) {
    nextPartMap.set(p.id, p);
    nextBoxMap.set(p.id, getPartWorldBox(p));
  }

  let movedCount = 0;
  let removedCount = 0;
  const updated: Fastener[] = [];

  for (const f of boundFasteners) {
    const touchesChanged =
      changedPartIds.has(f.partId) ||
      (f.targetPartId ? changedPartIds.has(f.targetPartId) : false);

    if (!touchesChanged || !f.targetPartId) {
      updated.push(f);
      continue;
    }

    // If BOTH host and target moved together by the same rigid delta (group / multiselect),
    // the local position on host is already valid — verify quickly first!
    if (changedPartIds.has(f.partId) && changedPartIds.has(f.targetPartId)) {
      const quickAudit = auditSingleFastener(f, nextParts, nextPartMap, nextBoxMap);
      if (quickAudit?.status === 'ok') {
        updated.push(f);
        continue;
      }
    }

    // Look up the updated joint zone between host and target
    const matchingZone = nextZones.find(
      (z) =>
        z.hostPartId === f.partId &&
        z.targetPartId === f.targetPartId &&
        (!f.jointAxis || z.axis === f.jointAxis)
    );

    if (!matchingZone) {
      // Check if fastener is still physically valid (e.g. sloped roof screw into a post)
      const stillValid = auditSingleFastener(f, nextParts, nextPartMap, nextBoxMap);
      if (stillValid?.status === 'ok') {
        updated.push(f);
      } else {
        // Boards were pulled apart — remove orphaned floating screw cleanly
        removedCount++;
      }
      continue;
    }

    const host = nextPartMap.get(matchingZone.hostPartId);
    if (!host) {
      removedCount++;
      continue;
    }

    const axisIdx =
      matchingZone.axis === 'x' ? 0 : matchingZone.axis === 'y' ? 1 : 2;
    const u = f.jointParamU ?? 0.5;
    const longCoord =
      matchingZone.longMin + (matchingZone.longMax - matchingZone.longMin) * u;

    const coords: [number, number, number] = [0, 0, 0];
    coords[axisIdx] = matchingZone.faceCoordMm;
    coords[matchingZone.longAxisIdx] = longCoord;
    coords[matchingZone.shortAxisIdx] = matchingZone.shortMid;

    const headWorld = new THREE.Vector3(...coords);
    const normWorld = new THREE.Vector3(...matchingZone.normalWorld);
    const newLocalPos = worldToPartLocalPrecise(host, headWorld);
    const newLocalNorm = worldNormalToPartLocalPrecise(host, normWorld);

    const candidate: Fastener = {
      ...f,
      localPosition: newLocalPos,
      localNormal: newLocalNorm,
      jointAxis: matchingZone.axis,
      jointParamU: u,
    };

    const audit = auditSingleFastener(candidate, nextParts, nextPartMap, nextBoxMap);
    if (audit?.status === 'ok') {
      const shifted =
        Math.hypot(
          newLocalPos[0] - f.localPosition[0],
          newLocalPos[1] - f.localPosition[1],
          newLocalPos[2] - f.localPosition[2]
        ) > 0.5;
      if (shifted) movedCount++;
      updated.push(candidate);
    } else {
      // Try the zone's recommended screw length if board thickness changed
      const resizedCandidate: Fastener = {
        ...candidate,
        type: matchingZone.recommendedScrew,
      };
      const retryAudit = auditSingleFastener(
        resizedCandidate,
        nextParts,
        nextPartMap,
        nextBoxMap
      );
      if (retryAudit?.status === 'ok') {
        movedCount++;
        updated.push(resizedCandidate);
      } else {
        removedCount++;
      }
    }
  }

  return { fasteners: updated, movedCount, removedCount };
}

/**
 * Computes interior clearances ("prześwity w świetle") from the selected part
 * to the nearest neighboring surfaces (up, down/floor, left, right, back)
 * including enabled room walls & ceiling so dimensions can be clicked and edited directly in 3D.
 */
export function computePartClearances(
  selectedPart: FurniturePart,
  allParts: FurniturePart[],
  room?: RoomConfig
): ClearanceGuide[] {
  const sb = getPartWorldBox(selectedPart);
  const cx = (sb.minX + sb.maxX) / 2;
  const cy = (sb.minY + sb.maxY) / 2;
  const cz = (sb.minZ + sb.maxZ) / 2;

  const guides: ClearanceGuide[] = [];
  const otherBoxes = allParts
    .filter((p) => p.id !== selectedPart.id)
    .map((p) => ({ part: p, box: getPartWorldBox(p) }));

  const overlaps1D = (aMin: number, aMax: number, bMin: number, bMax: number) =>
    Math.min(aMax, bMax) - Math.max(aMin, bMin) > 8;

  const isSameGroupPart = (other?: FurniturePart) =>
    Boolean(selectedPart.groupId && other?.groupId && other.groupId === selectedPart.groupId);

  // DOWN (-Y): start with floor Y = 0
  let downDist = sb.minY;
  let downTarget = 'Podłoga';
  let downTargetPart: FurniturePart | undefined;
  for (const { part, box } of otherBoxes) {
    if (
      overlaps1D(sb.minX, sb.maxX, box.minX, box.maxX) &&
      overlaps1D(sb.minZ, sb.maxZ, box.minZ, box.maxZ) &&
      box.maxY <= sb.minY + 0.5
    ) {
      const gap = sb.minY - box.maxY;
      if (gap < downDist) {
        downDist = gap;
        downTarget = part.name;
        downTargetPart = part;
      }
    }
  }
  if (downDist > 1 && downDist <= 3000) {
    guides.push({
      direction: 'down',
      distanceMm: Math.round(downDist),
      startWorld: [cx, sb.minY, cz],
      endWorld: [cx, sb.minY - downDist, cz],
      targetName: downTarget,
      targetPartId: downTargetPart?.id,
      isSameGroup: isSameGroupPart(downTargetPart),
    });
  }

  // UP (+Y): boards above or room ceiling
  let upDist = Infinity;
  let upTarget = '';
  let upTargetPart: FurniturePart | undefined;
  if (room?.enabled && room.showCeiling && room.heightMm >= sb.maxY - 0.5) {
    upDist = room.heightMm - sb.maxY;
    upTarget = 'Sufit';
  }
  for (const { part, box } of otherBoxes) {
    if (
      overlaps1D(sb.minX, sb.maxX, box.minX, box.maxX) &&
      overlaps1D(sb.minZ, sb.maxZ, box.minZ, box.maxZ) &&
      box.minY >= sb.maxY - 0.5
    ) {
      const gap = box.minY - sb.maxY;
      if (gap < upDist) {
        upDist = gap;
        upTarget = part.name;
        upTargetPart = part;
      }
    }
  }
  if (upDist > 1 && upDist <= 3000) {
    guides.push({
      direction: 'up',
      distanceMm: Math.round(upDist),
      startWorld: [cx, sb.maxY, cz],
      endWorld: [cx, sb.maxY + upDist, cz],
      targetName: upTarget,
      targetPartId: upTargetPart?.id,
      isSameGroup: isSameGroupPart(upTargetPart),
    });
  }

  // LEFT (-X): boards or room left wall
  let leftDist = Infinity;
  let leftTarget = '';
  let leftTargetPart: FurniturePart | undefined;
  if (room?.enabled && room.showLeftWall) {
    const wallX = -room.widthMm / 2;
    if (wallX <= sb.minX + 0.5) {
      leftDist = sb.minX - wallX;
      leftTarget = 'Ściana lewa';
    }
  }
  for (const { part, box } of otherBoxes) {
    if (
      overlaps1D(sb.minY, sb.maxY, box.minY, box.maxY) &&
      overlaps1D(sb.minZ, sb.maxZ, box.minZ, box.maxZ) &&
      box.maxX <= sb.minX + 0.5
    ) {
      const gap = sb.minX - box.maxX;
      if (gap < leftDist) {
        leftDist = gap;
        leftTarget = part.name;
        leftTargetPart = part;
      }
    }
  }
  if (leftDist > 1 && leftDist <= 3500) {
    guides.push({
      direction: 'left',
      distanceMm: Math.round(leftDist),
      startWorld: [sb.minX, cy, cz],
      endWorld: [sb.minX - leftDist, cy, cz],
      targetName: leftTarget,
      targetPartId: leftTargetPart?.id,
      isSameGroup: isSameGroupPart(leftTargetPart),
    });
  }

  // RIGHT (+X): boards or room right wall
  let rightDist = Infinity;
  let rightTarget = '';
  let rightTargetPart: FurniturePart | undefined;
  if (room?.enabled && room.showRightWall) {
    const wallX = room.widthMm / 2;
    if (wallX >= sb.maxX - 0.5) {
      rightDist = wallX - sb.maxX;
      rightTarget = 'Ściana prawa';
    }
  }
  for (const { part, box } of otherBoxes) {
    if (
      overlaps1D(sb.minY, sb.maxY, box.minY, box.maxY) &&
      overlaps1D(sb.minZ, sb.maxZ, box.minZ, box.maxZ) &&
      box.minX >= sb.maxX - 0.5
    ) {
      const gap = box.minX - sb.maxX;
      if (gap < rightDist) {
        rightDist = gap;
        rightTarget = part.name;
        rightTargetPart = part;
      }
    }
  }
  if (rightDist > 1 && rightDist <= 3500) {
    guides.push({
      direction: 'right',
      distanceMm: Math.round(rightDist),
      startWorld: [sb.maxX, cy, cz],
      endWorld: [sb.maxX + rightDist, cy, cz],
      targetName: rightTarget,
      targetPartId: rightTargetPart?.id,
      isSameGroup: isSameGroupPart(rightTargetPart),
    });
  }

  // BACK (-Z): distance to back wall when room is enabled (useful for pipe clearance or wall alignment)
  if (room?.enabled && room.showBackWall && room.backWallZMm <= sb.minZ + 0.5) {
    let backDist = sb.minZ - room.backWallZMm;
    let backTarget = 'Ściana tylna';
    let backTargetPart: FurniturePart | undefined;
    for (const { part, box } of otherBoxes) {
      if (
        overlaps1D(sb.minX, sb.maxX, box.minX, box.maxX) &&
        overlaps1D(sb.minY, sb.maxY, box.minY, box.maxY) &&
        box.maxZ <= sb.minZ + 0.5
      ) {
        const gap = sb.minZ - box.maxZ;
        if (gap < backDist) {
          backDist = gap;
          backTarget = part.name;
          backTargetPart = part;
        }
      }
    }
    if (backDist > 1 && backDist <= 2500) {
      guides.push({
        direction: 'back',
        distanceMm: Math.round(backDist),
        startWorld: [cx, cy, sb.minZ],
        endWorld: [cx, cy, sb.minZ - backDist],
        targetName: backTarget,
        targetPartId: backTargetPart?.id,
        isSameGroup: isSameGroupPart(backTargetPart),
      });
    }
  }

  return guides;
}

/**
 * Exact saw/miter angles for sloped boards and custom 2D polygon corners.
 */
export function computeSawCutAngles(part: FurniturePart): SawCutAngle[] {
  const angles: SawCutAngle[] = [];

  if (part.kind === 'profile') {
    const startDeg = Math.abs(part.beamCutStartDeg ?? 0);
    const endDeg = Math.abs(part.beamCutEndDeg ?? 0);
    if (startDeg > 0.4) {
      angles.push({
        label: 'Zacios start',
        interiorDeg: Math.round((90 - startDeg) * 10) / 10,
        sawMiterDeg: Math.round(startDeg * 10) / 10,
      });
    }
    if (endDeg > 0.4) {
      angles.push({
        label: 'Zacios koniec',
        interiorDeg: Math.round((90 - endDeg) * 10) / 10,
        sawMiterDeg: Math.round(endDeg * 10) / 10,
      });
    }
    return angles;
  }

  if (part.kind === 'sloped') {
    const tl = Math.max(0, part.slopeTopLeft ?? 0);
    const tr = Math.max(0, part.slopeTopRight ?? 0);
    const bl = Math.max(0, part.slopeBottomLeft ?? 0);
    const br = Math.max(0, part.slopeBottomRight ?? 0);
    const w = Math.max(1, part.width);

    if (Math.abs(tl - tr) > 1) {
      const slopeDeg = (Math.atan2(Math.abs(tl - tr), w) * 180) / Math.PI;
      angles.push({
        label: 'Skos górny',
        interiorDeg: Math.round((90 - slopeDeg) * 10) / 10,
        sawMiterDeg: Math.round(slopeDeg * 10) / 10,
      });
    }
    if (Math.abs(bl - br) > 1) {
      const slopeDeg = (Math.atan2(Math.abs(bl - br), w) * 180) / Math.PI;
      angles.push({
        label: 'Skos dolny',
        interiorDeg: Math.round((90 - slopeDeg) * 10) / 10,
        sawMiterDeg: Math.round(slopeDeg * 10) / 10,
      });
    }
    return angles;
  }

  if (part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3) {
    const pts = part.customPolygon;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const prev = pts[(i - 1 + n) % n];
      const curr = pts[i];
      const next = pts[(i + 1) % n];
      const v1x = prev[0] - curr[0];
      const v1y = prev[1] - curr[1];
      const v2x = next[0] - curr[0];
      const v2y = next[1] - curr[1];
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 < 1 || l2 < 1) continue;
      const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
      const angleDeg = (Math.acos(dot) * 180) / Math.PI;
      if (Math.abs(angleDeg - 90) > 0.6 && Math.abs(angleDeg - 180) > 0.6) {
        const miter = Math.round(Math.abs(90 - angleDeg) * 10) / 10;
        angles.push({
          label: `Narożnik P${i + 1}`,
          interiorDeg: Math.round(angleDeg * 10) / 10,
          sawMiterDeg: miter,
        });
      }
    }
  }

  return angles;
}

/**
 * Checks 2D polygon edges for self-intersection (crossed/bowtie contours).
 * Returns indices of edges involved in any intersection.
 */
function orient2D(a: [number, number], b: [number, number], c: [number, number]): number {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function segmentsProperlyIntersect(
  a: [number, number],
  b: [number, number],
  c: [number, number],
  d: [number, number]
): boolean {
  const eps = 1e-4;
  const o1 = orient2D(a, b, c);
  const o2 = orient2D(a, b, d);
  const o3 = orient2D(c, d, a);
  const o4 = orient2D(c, d, b);

  if (
    ((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
    ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))
  ) {
    return true;
  }
  return false;
}

export function findSelfIntersectingEdges(
  points: [number, number][],
  closed: boolean
): Set<number> {
  const bad = new Set<number>();
  const n = points.length;
  const edgeCount = closed ? n : n - 1;
  if (edgeCount < 3) return bad;

  for (let i = 0; i < edgeCount; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];

    for (let j = i + 2; j < edgeCount; j++) {
      // Skip adjacent edges (including closing edge to edge 0)
      if (closed && i === 0 && j === edgeCount - 1) continue;
      const c = points[j];
      const d = points[(j + 1) % n];
      if (segmentsProperlyIntersect(a, b, c, d)) {
        bad.add(i);
        bad.add(j);
      }
    }
  }

  return bad;
}

/**
 * Mirrors a part cleanly across a vertical X plane (default X = 0):
 * flips slopes, door handles, edge banding L/R, rotations, and custom 2D shapes.
 */
export function mirrorPartX(
  part: FurniturePart,
  pivotX = 0,
  asDuplicate = false
): FurniturePart {
  const flipHandle = (h?: HandleSide): HandleSide | undefined => {
    if (h === 'left') return 'right';
    if (h === 'right') return 'left';
    return h;
  };

  let mirroredPoly: [number, number][] | undefined = part.customPolygon;
  if (part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3) {
    // Flip X and reverse order to preserve counter-clockwise winding
    mirroredPoly = part.customPolygon
      .map(([x, y]) => [-x, y] as [number, number])
      .reverse();
  }

  const mirroredEdge = part.edgeBanding
    ? {
        ...part.edgeBanding,
        left: part.edgeBanding.right,
        right: part.edgeBanding.left,
      }
    : undefined;

  return {
    ...part,
    id: asDuplicate ? `part-${Date.now()}-${Math.floor(Math.random() * 10000)}` : part.id,
    name: asDuplicate ? `${part.name} (lustro)` : part.name,
    position: [
      Math.round((2 * pivotX - part.position[0]) * 10) / 10,
      part.position[1],
      part.position[2],
    ],
    rotation: [part.rotation[0], -part.rotation[1], -part.rotation[2]],
    slopeTopLeft: part.slopeTopRight,
    slopeTopRight: part.slopeTopLeft,
    slopeBottomLeft: part.slopeBottomRight,
    slopeBottomRight: part.slopeBottomLeft,
    handleSide: flipHandle(part.handleSide),
    edgeBanding: mirroredEdge,
    customPolygon: mirroredPoly,
  };
}

/**
 * Duplicates a shelf vertically into `count` total shelves distributed across `spanHeightMm`
 * so every gap ("prześwit w świetle") between shelves is identical.
 * Returns only the newly created shelves (excluding the original base shelf).
 */
export function createEvenShelfArray(
  basePart: FurniturePart,
  newCopiesCount: number,
  totalSpanHeightMm: number
): { newParts: FurniturePart[]; clearanceMm: number } {
  const count = Math.max(1, Math.min(10, Math.round(newCopiesCount)));
  const box = getPartWorldBox(basePart);
  const thickness = Math.max(4, box.maxY - box.minY);
  const usableSpan = Math.max(thickness * (count + 1) + 40, totalSpanHeightMm);

  // Distribute evenly from basePart.position[1] upward across usableSpan
  const stepCenterY = usableSpan / count;
  const clearanceMm = Math.round(stepCenterY - thickness);

  const newParts: FurniturePart[] = [];
  for (let i = 1; i <= count; i++) {
    newParts.push({
      ...basePart,
      id: `part-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
      name: `${basePart.name} #${i + 1}`,
      position: [
        basePart.position[0],
        Math.round((basePart.position[1] + stepCenterY * i) * 10) / 10,
        basePart.position[2],
      ],
      customPolygon: basePart.customPolygon
        ? basePart.customPolygon.map(([x, y]) => [x, y] as [number, number])
        : undefined,
      edgeBanding: basePart.edgeBanding ? { ...basePart.edgeBanding } : undefined,
    });
  }

  return { newParts, clearanceMm };
}

/**
 * Aligns 2+ selected boards to a common Left/Right/CenterX/Bottom/Top/Front/Back edge
 * while preserving exact geometry and resyncing relational fasteners.
 */
export function alignSelectedParts(
  parts: FurniturePart[],
  fasteners: Fastener[],
  selectedIds: string[],
  mode: import('../types/furniture').AlignMode
): { parts: FurniturePart[]; fasteners: Fastener[] } {
  const idSet = new Set(selectedIds);
  const targets = parts.filter((p) => idSet.has(p.id));
  if (targets.length < 2) return { parts, fasteners };

  const boxes = new Map<string, WorldBox>();
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;

  for (const p of targets) {
    const b = getPartWorldBox(p);
    boxes.set(p.id, b);
    minX = Math.min(minX, b.minX);
    maxX = Math.max(maxX, b.maxX);
    minY = Math.min(minY, b.minY);
    maxY = Math.max(maxY, b.maxY);
    minZ = Math.min(minZ, b.minZ);
    maxZ = Math.max(maxZ, b.maxZ);
  }
  const midX = (minX + maxX) / 2;

  const nextParts = parts.map((p) => {
    if (!idSet.has(p.id)) return p;
    const b = boxes.get(p.id)!;
    let dx = 0,
      dy = 0,
      dz = 0;
    if (mode === 'left') dx = minX - b.minX;
    else if (mode === 'right') dx = maxX - b.maxX;
    else if (mode === 'centerX') dx = midX - (b.minX + b.maxX) / 2;
    else if (mode === 'bottom') dy = minY - b.minY;
    else if (mode === 'top') dy = maxY - b.maxY;
    else if (mode === 'front') dz = maxZ - b.maxZ;
    else if (mode === 'back') dz = minZ - b.minZ;

    if (Math.abs(dx) < 0.1 && Math.abs(dy) < 0.1 && Math.abs(dz) < 0.1) return p;
    return {
      ...p,
      position: [
        Math.round((p.position[0] + dx) * 10) / 10,
        Math.max(10, Math.round((p.position[1] + dy) * 10) / 10),
        Math.round((p.position[2] + dz) * 10) / 10,
      ] as [number, number, number],
    };
  });

  const synced = syncFastenersWithParts(parts, nextParts, fasteners, idSet);
  return { parts: nextParts, fasteners: synced.fasteners };
}

/**
 * Evenly distributes 3+ selected boards along X, Y, or Z with identical clear gaps between them.
 */
export function distributeSelectedParts(
  parts: FurniturePart[],
  fasteners: Fastener[],
  selectedIds: string[],
  axis: 'x' | 'y' | 'z'
): { parts: FurniturePart[]; fasteners: Fastener[] } {
  const idSet = new Set(selectedIds);
  const items = parts
    .filter((p) => idSet.has(p.id))
    .map((p) => {
      const b = getPartWorldBox(p);
      const min = axis === 'x' ? b.minX : axis === 'y' ? b.minY : b.minZ;
      const max = axis === 'x' ? b.maxX : axis === 'y' ? b.maxY : b.maxZ;
      return { part: p, min, max, size: max - min, center: (min + max) / 2 };
    })
    .sort((a, b) => a.center - b.center);

  if (items.length < 3) return { parts, fasteners };

  const first = items[0];
  const last = items[items.length - 1];
  const totalSpan = last.max - first.min;
  const totalOccupied = items.reduce((s, it) => s + it.size, 0);
  const gap = (totalSpan - totalOccupied) / (items.length - 1);

  const deltaById = new Map<string, number>();
  let cursor = first.min;
  for (const it of items) {
    const targetCenter = cursor + it.size / 2;
    deltaById.set(it.part.id, targetCenter - it.center);
    cursor += it.size + gap;
  }

  const nextParts = parts.map((p) => {
    const d = deltaById.get(p.id);
    if (d === undefined || Math.abs(d) < 0.1) return p;
    const pos: [number, number, number] = [...p.position];
    const idx = axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
    pos[idx] = Math.round((pos[idx] + d) * 10) / 10;
    if (idx === 1) pos[1] = Math.max(10, pos[1]);
    return { ...p, position: pos };
  });

  const synced = syncFastenersWithParts(parts, nextParts, fasteners, idSet);
  return { parts: nextParts, fasteners: synced.fasteners };
}

export function groupSelectedParts(
  parts: FurniturePart[],
  selectedIds: string[]
): { parts: FurniturePart[]; groupId: string } {
  const idSet = new Set(selectedIds);
  const groupId = `grp_${Date.now().toString(36)}`;
  return {
    groupId,
    parts: parts.map((p) => (idSet.has(p.id) ? { ...p, groupId } : p)),
  };
}

export function ungroupSelectedParts(
  parts: FurniturePart[],
  selectedIds: string[]
): FurniturePart[] {
  const idSet = new Set(selectedIds);
  const targetGroups = new Set<string>();
  for (const p of parts) {
    if (idSet.has(p.id) && p.groupId) targetGroups.add(p.groupId);
  }
  return parts.map((p) =>
    idSet.has(p.id) || (p.groupId && targetGroups.has(p.groupId))
      ? { ...p, groupId: undefined }
      : p
  );
}

export type CarpentryJoinMode =
  | 'corner_l'
  | 't_joint'
  | 'stack_top'
  | 'side_by_side'
  | 'in_line';

type AxisKey = 'x' | 'y' | 'z';

function getBoxSpan(b: WorldBox, axis: AxisKey): { min: number; max: number; size: number; center: number } {
  const min = axis === 'x' ? b.minX : axis === 'y' ? b.minY : b.minZ;
  const max = axis === 'x' ? b.maxX : axis === 'y' ? b.maxY : b.maxZ;
  return { min, max, size: max - min, center: (min + max) / 2 };
}

function getLongestWorldAxis(b: WorldBox): AxisKey {
  const sx = b.maxX - b.minX;
  const sy = b.maxY - b.minY;
  const sz = b.maxZ - b.minZ;
  if (sy >= sx && sy >= sz) return 'y';
  if (sx >= sy && sx >= sz) return 'x';
  return 'z';
}

function getLocalLongestAxis(p: FurniturePart): AxisKey {
  if (p.height >= p.width && p.height >= p.depth) return 'y';
  if (p.width >= p.height && p.width >= p.depth) return 'x';
  return 'z';
}

/**
 * Returns a clean 90-degree Euler rotation [rx, ry, rz] that orients `part`'s
 * longest local dimension along `targetAxis`.
 */
function rotationToAlignLongestAxis(
  part: FurniturePart,
  targetAxis: AxisKey
): [number, number, number] {
  const localLong = getLocalLongestAxis(part);
  if (localLong === targetAxis) return [0, 0, 0];
  if (localLong === 'y' && targetAxis === 'x') return [0, 0, 90];
  if (localLong === 'y' && targetAxis === 'z') return [90, 0, 0];
  if (localLong === 'x' && targetAxis === 'y') return [0, 0, 90];
  if (localLong === 'x' && targetAxis === 'z') return [0, 90, 0];
  if (localLong === 'z' && targetAxis === 'x') return [0, 90, 0];
  if (localLong === 'z' && targetAxis === 'y') return [90, 0, 0];
  return [0, 0, 0];
}

function roundMm(val: number): number {
  return Math.round(val * 10) / 10;
}

/**
 * Commercial CAD carpentry mate / join engine for 2+ selected parts (e.g. kantówki, beams, panels).
 * Preserves the first selected part as the stationary anchor and aligns/orients the second part
 * to an exact 0 mm flush joint (Corner 90° L, T-Joint, Stack on Top, Side-by-Side, or Collinear In-Line).
 */
export function joinSelectedParts(
  parts: FurniturePart[],
  fasteners: Fastener[],
  selectedIds: string[],
  mode: CarpentryJoinMode
): { parts: FurniturePart[]; fasteners: Fastener[]; summary: string } {
  const orderedSelected = selectedIds
    .map((id) => parts.find((p) => p.id === id))
    .filter((p): p is FurniturePart => Boolean(p && !p.locked && !p.hidden));

  if (orderedSelected.length < 2) {
    return { parts, fasteners, summary: 'Zaznacz co najmniej 2 odblokowane elementy' };
  }

  // Side-by-side supports 2 OR MORE parts chained cleanly in one straight flush row (0 mm gap)
  if (mode === 'side_by_side') {
    const anchor = orderedSelected[0];
    const anchorBox = getPartWorldBox(anchor);
    const anchorMinY = anchorBox.minY;
    const anchorCenterZ = (anchorBox.minZ + anchorBox.maxZ) / 2;

    // Sort remaining items left-to-right relative to their current X or preserve selection order
    const rest = orderedSelected.slice(1);
    const updates = new Map<string, { position: [number, number, number]; rotation: [number, number, number] }>();
    let cursorX = anchorBox.maxX;

    for (const p of rest) {
      const b = getPartWorldBox(p);
      const dx = cursorX - b.minX;
      const dy = anchorMinY - b.minY;
      const dz = anchorCenterZ - (b.minZ + b.maxZ) / 2;
      const nextPos: [number, number, number] = [
        roundMm(p.position[0] + dx),
        roundMm(p.position[1] + dy),
        roundMm(p.position[2] + dz),
      ];
      updates.set(p.id, { position: nextPos, rotation: p.rotation });
      cursorX += b.maxX - b.minX;
    }

    const changedIds = new Set(updates.keys());
    const nextParts = parts.map((p) => {
      const u = updates.get(p.id);
      return u ? { ...p, position: u.position, rotation: u.rotation } : p;
    });
    const synced = syncFastenersWithParts(parts, nextParts, fasteners, changedIds);
    return {
      parts: nextParts,
      fasteners: synced.fasteners,
      summary: `Ustawiono ${orderedSelected.length} elem. obok siebie w jednej linii (styk 0 mm)`,
    };
  }

  // 2-element carpentry mate joints: 1st selected = base anchor, 2nd selected = mated part
  let basePart = orderedSelected[0];
  let movePart = orderedSelected[1];
  let baseBox = getPartWorldBox(basePart);
  let moveBox = getPartWorldBox(movePart);

  // Smart ergonomic override for stack_top: if user selected a floating beam first and a standing post second,
  // place the beam cleanly ON TOP of the standing post instead of stacking the post onto the floating beam!
  if (mode === 'stack_top' && baseBox.minY > moveBox.minY + 80) {
    const tmpP = basePart;
    basePart = movePart;
    movePart = tmpP;
    const tmpB = baseBox;
    baseBox = moveBox;
    moveBox = tmpB;
  }

  let nextRot: [number, number, number] = [...movePart.rotation];
  let orientedMove: FurniturePart = { ...movePart, rotation: nextRot };
  let mBox = moveBox;

  const baseLong = getLongestWorldAxis(baseBox);
  let moveLong = getLongestWorldAxis(mBox);

  let dx = 0;
  let dy = 0;
  let dz = 0;
  let summary = '';

  if (mode === 'corner_l' || mode === 't_joint') {
    // Ensure perpendicular orientation if both elements are currently parallel
    if (moveLong === baseLong) {
      const targetPerp: AxisKey =
        baseLong === 'y' ? 'x' : baseLong === 'x' ? 'z' : 'x';
      nextRot = rotationToAlignLongestAxis(movePart, targetPerp);
      orientedMove = { ...movePart, rotation: nextRot };
      mBox = getPartWorldBox(orientedMove);
      moveLong = getLongestWorldAxis(mBox);
    }

    const axes: AxisKey[] = ['x', 'y', 'z'];
    const sharedAxis =
      axes.find((a) => a !== baseLong && a !== moveLong) ?? 'z';

    const baseShared = getBoxSpan(baseBox, sharedAxis);
    const moveShared = getBoxSpan(mBox, sharedAxis);
    const deltaShared = baseShared.center - moveShared.center;

    const baseAlongMove = getBoxSpan(baseBox, moveLong);
    const moveAlongMove = getBoxSpan(mBox, moveLong);
    // Snap near end of movePart flush to the side of basePart it is currently closer to
    const onNegativeSide = moveAlongMove.center < baseAlongMove.center;
    const deltaAlongMove = onNegativeSide
      ? baseAlongMove.min - moveAlongMove.max
      : baseAlongMove.max - moveAlongMove.min;

    const baseAlongBase = getBoxSpan(baseBox, baseLong);
    const moveAlongBase = getBoxSpan(mBox, baseLong);
    let deltaAlongBase = 0;
    if (mode === 'corner_l') {
      // Flush outer corner: snap top-to-top (or max-to-max) if closer to max end, else min-to-min
      const closerToMax = moveAlongBase.center >= baseAlongBase.center;
      deltaAlongBase = closerToMax
        ? baseAlongBase.max - moveAlongBase.max
        : baseAlongBase.min - moveAlongBase.min;
      summary = 'Połączono pod kątem prostym — narożnik L (90°, styk 0 mm)';
    } else {
      // T-joint: center movePart cleanly along the middle of basePart
      deltaAlongBase = baseAlongBase.center - moveAlongBase.center;
      summary = 'Połączono w literę T (środek, 90°, styk 0 mm)';
    }

    const deltas: Record<AxisKey, number> = { x: 0, y: 0, z: 0 };
    deltas[sharedAxis] = deltaShared;
    deltas[moveLong] = deltaAlongMove;
    deltas[baseLong] = deltaAlongBase;
    dx = deltas.x;
    dy = deltas.y;
    dz = deltas.z;
  } else if (mode === 'stack_top') {
    // Rest movePart 0 mm flush ON TOP of basePart
    dy = baseBox.maxY - mBox.minY;
    dz = (baseBox.minZ + baseBox.maxZ) / 2 - (mBox.minZ + mBox.maxZ) / 2;

    const bCenterX = (baseBox.minX + baseBox.maxX) / 2;
    const mCenterX = (mBox.minX + mBox.maxX) / 2;
    const bSpanX = baseBox.maxX - baseBox.minX;
    const mSpanX = mBox.maxX - mBox.minX;

    // If a long horizontal beam is sitting on a narrower post, flush its outer edge or center nicely
    if (mSpanX > bSpanX * 1.4 && Math.abs(mCenterX - bCenterX) > bSpanX * 0.45) {
      dx = mCenterX < bCenterX ? baseBox.maxX - mBox.maxX : baseBox.minX - mBox.minX;
    } else {
      dx = bCenterX - mCenterX;
    }
    summary = 'Ustawiono idealnie na górze (styk 0 mm)';
  } else if (mode === 'in_line') {
    // Collinear end-to-end splice along basePart's longest axis
    nextRot = rotationToAlignLongestAxis(movePart, baseLong);
    orientedMove = { ...movePart, rotation: nextRot };
    mBox = getPartWorldBox(orientedMove);

    const deltas: Record<AxisKey, number> = { x: 0, y: 0, z: 0 };
    for (const axis of ['x', 'y', 'z'] as AxisKey[]) {
      const bSpan = getBoxSpan(baseBox, axis);
      const mSpan = getBoxSpan(mBox, axis);
      if (axis === baseLong) {
        const beforeBase = mSpan.center < bSpan.center;
        deltas[axis] = beforeBase ? bSpan.min - mSpan.max : bSpan.max - mSpan.min;
      } else {
        deltas[axis] = bSpan.center - mSpan.center;
      }
    }
    dx = deltas.x;
    dy = deltas.y;
    dz = deltas.z;
    summary = 'Połączono w jednej linii (czoło do czoła, styk 0 mm)';
  }

  let nextPos: [number, number, number] = [
    roundMm(movePart.position[0] + dx),
    roundMm(movePart.position[1] + dy),
    roundMm(movePart.position[2] + dz),
  ];

  // Floor safety: prevent the joined element from dipping below floor Y = 0
  const finalBox = getPartWorldBox({ ...movePart, position: nextPos, rotation: nextRot });
  if (finalBox.minY < 0) {
    nextPos = [nextPos[0], roundMm(nextPos[1] - finalBox.minY), nextPos[2]];
  }

  const changedIds = new Set<string>([movePart.id]);
  const nextParts = parts.map((p) =>
    p.id === movePart.id ? { ...p, position: nextPos, rotation: nextRot } : p
  );
  const synced = syncFastenersWithParts(parts, nextParts, fasteners, changedIds);
  return { parts: nextParts, fasteners: synced.fasteners, summary };
}

/**
 * Automatically computes the inside 90° corner between two selected timber/steel elements
 * and builds a properly sized, flush-aligned 3D galvanized steel carpentry L-bracket.
 */
export function buildCornerBracketForPair(
  parts: FurniturePart[],
  selectedIds: string[]
): { bracket: Omit<FurniturePart, 'id'>; summary: string } | null {
  const pair = selectedIds
    .map((id) => parts.find((p) => p.id === id))
    .filter((p): p is FurniturePart => Boolean(p && !p.hidden));
  if (pair.length < 2) return null;

  const boxA = getPartWorldBox(pair[0]);
  const boxB = getPartWorldBox(pair[1]);

  const spanA = {
    x: boxA.maxX - boxA.minX,
    y: boxA.maxY - boxA.minY,
    z: boxA.maxZ - boxA.minZ,
  };
  const spanB = {
    x: boxB.maxX - boxB.minX,
    y: boxB.maxY - boxB.minY,
    z: boxB.maxZ - boxB.minZ,
  };

  const minSection = Math.min(
    Math.min(spanA.x, spanA.y, spanA.z),
    Math.min(spanB.x, spanB.y, spanB.z)
  );
  const leg = minSection <= 55 ? 60 : minSection <= 90 ? 90 : 105;
  const widthD = minSection <= 55 ? 40 : minSection <= 90 ? 65 : 90;
  const wallT = leg >= 105 ? 5 : leg >= 90 ? 4 : 3.5;

  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
  const cAx = (boxA.minX + boxA.maxX) / 2;
  const cAy = (boxA.minY + boxA.maxY) / 2;
  const cAz = (boxA.minZ + boxA.maxZ) / 2;
  const cBx = (boxB.minX + boxB.maxX) / 2;
  const cBy = (boxB.minY + boxB.maxY) / 2;
  const cBz = (boxB.minZ + boxB.maxZ) / 2;

  const contactX = (clamp(cBx, boxA.minX, boxA.maxX) + clamp(cAx, boxB.minX, boxB.maxX)) / 2;
  const contactY = (clamp(cBy, boxA.minY, boxA.maxY) + clamp(cAy, boxB.minY, boxB.maxY)) / 2;
  const contactZ = (clamp(cBz, boxA.minZ, boxA.maxZ) + clamp(cAz, boxB.minZ, boxB.maxZ)) / 2;

  const axisA = getLongestWorldAxis(boxA);
  const axisB = getLongestWorldAxis(boxB);

  const half = leg / 2;
  const lPoly: [number, number][] = [
    [-half, -half],
    [half, -half],
    [half, -half + wallT],
    [-half + wallT, -half + wallT],
    [-half + wallT, half],
    [-half, half],
  ];

  let rotation: [number, number, number] = [0, 0, 0];
  let posX = contactX;
  let posY = contactY;
  let posZ = contactZ;

  const pairAxes = new Set<AxisKey>([axisA, axisB]);
  if (pairAxes.has('x') && pairAxes.has('z')) {
    const dirX = cAx + cBx - 2 * contactX >= 0 ? 1 : -1;
    const dirZ = cAz + cBz - 2 * contactZ >= 0 ? 1 : -1;
    posX = contactX + dirX * (half * 0.72);
    posZ = contactZ + dirZ * (half * 0.72);
    const ry = dirX > 0 && dirZ > 0 ? 0 : dirX < 0 && dirZ > 0 ? 90 : dirX < 0 && dirZ < 0 ? 180 : -90;
    rotation = [90, ry, 0];
  } else if (pairAxes.has('y') && pairAxes.has('z')) {
    const dirY = cAy + cBy - 2 * contactY >= 0 ? 1 : -1;
    const dirZ = cAz + cBz - 2 * contactZ >= 0 ? 1 : -1;
    posY = contactY + dirY * (half * 0.72);
    posZ = contactZ + dirZ * (half * 0.72);
    const rz = dirY > 0 ? (dirZ > 0 ? 0 : 90) : dirZ > 0 ? -90 : 180;
    rotation = [0, 90, rz];
  } else {
    const dirX = cAx + cBx - 2 * contactX >= 0 ? 1 : -1;
    const dirY = cAy + cBy - 2 * contactY >= 0 ? 1 : -1;
    posX = contactX + dirX * (half * 0.72);
    posY = contactY + dirY * (half * 0.72);
    const rz = dirX > 0 && dirY > 0 ? 0 : dirX < 0 && dirY > 0 ? 90 : dirX < 0 && dirY < 0 ? 180 : -90;
    rotation = [0, 0, rz];
  }

  const safeY = Math.max(half, roundMm(posY));
  const bracket: Omit<FurniturePart, 'id'> = {
    name: `Kątownik ciesielski ${leg}×${leg}×${widthD}`,
    kind: 'custom',
    materialId: 'steel_galv',
    width: leg,
    height: leg,
    depth: widthD,
    customPolygon: lPoly,
    position: [roundMm(posX), safeY, roundMm(posZ)],
    rotation,
  };

  return {
    bracket,
    summary: `Wstawiono kątownik ${leg}×${leg}×${widthD} mm w narożnik połączenia`,
  };
}

export type ShelfLoadStatus = 'ok' | 'warning' | 'critical';

export interface ShelfDeflectionAudit {
  partId: string;
  partName: string;
  /** Longest unsupported clear span between physical vertical supports (mm) */
  maxUnsupportedSpanMm: number;
  thicknessMm: number;
  depthMm: number;
  /** Assumed uniform distributed load (kg per linear meter, e.g. 30 kg/m books) */
  loadKgPerM: number;
  /** Total load on that unsupported span (kg) */
  spanLoadKg: number;
  /** Estimated mid-span sag under load (mm) using Euler-Bernoulli beam formula */
  deflectionMm: number;
  /** Safe recommended max load on this span keeping sag <= 2.0 mm (kg) */
  safeMaxLoadKg: number;
  status: ShelfLoadStatus;
  recommendation: string;
}

function getMaterialElasticModulusMpa(materialId: string): number {
  switch (materialId) {
    case 'steel_black':
    case 'steel_galv':
      return 200_000;
    case 'glass_clear':
      return 70_000;
    case 'birch_plywood':
      return 7200;
    case 'osb3':
      return 3800;
    case 'concrete_top':
      return 12_000;
    case 'hdf_white':
    case 'hdf_black':
      return 3200;
    default:
      // EN 312 P2 melamine-faced furniture board / MDF short-term elastic modulus (creep applied once below)
      return 2800;
  }
}

/**
 * Real-world carpentry Shelf Deflection (Sag) Analyzer.
 * Finds every horizontal shelf/deck in the project, detects physical vertical supports
 * underneath or flanking it (sides, dividers, posts, legs, plinths), computes the longest unsupported
 * clear span L, and evaluates mid-span deflection δ = 5 w L⁴ / (384 E I).
 */
export function analyzeShelfDeflection(
  parts: FurniturePart[],
  loadKgPerM = 25
): Map<string, ShelfDeflectionAudit> {
  const result = new Map<string, ShelfDeflectionAudit>();
  const boxes = new Map<string, WorldBox>();
  for (const p of parts) {
    boxes.set(p.id, getPartWorldBox(p));
  }

  for (const p of parts) {
    if (
      p.kind === 'appliance' ||
      p.kind === 'door' ||
      p.kind === 'profile' ||
      p.hardwareTag === 'drawer_box' ||
      p.hardwareTag === 'leg'
    ) {
      continue;
    }

    const b = boxes.get(p.id)!;
    const dx = b.maxX - b.minX;
    const dy = b.maxY - b.minY;
    const dz = b.maxZ - b.minZ;

    // Only evaluate horizontal shelves/tops (not floor-resting base boards sitting on Y=0)
    const isHorizontalBoard =
      Math.abs(p.rotation[2] % 90) < 2 &&
      dy <= 44 &&
      dx >= 320 &&
      dz >= 140 &&
      b.minY > 35;

    if (!isHorizontalBoard) continue;

    // Collect X positions of all vertical structural supports underneath or abutting this shelf
    const supportIntervals: Array<[number, number]> = [];
    let continuousPlinthUnderCount = 0;

    for (const other of parts) {
      if (
        other.id === p.id ||
        other.kind === 'door' ||
        other.kind === 'appliance' ||
        other.hardwareTag === 'drawer_box'
      ) {
        continue;
      }
      const ob = boxes.get(other.id)!;
      const ody = ob.maxY - ob.minY;
      const odx = ob.maxX - ob.minX;
      // Ignore thin horizontal boards; keep vertical walls, dividers, posts, legs, plinths
      if (ody < 45) continue;

      const zOverlap = Math.min(b.maxZ, ob.maxZ) - Math.max(b.minZ, ob.minZ);
      if (zOverlap < 14) continue;

      // Support either sits directly underneath (ob.maxY ≈ b.minY), suspends from above (vertical divider on bottom deck), OR flanks the shelf vertically
      const supportsUnder = ob.maxY >= b.minY - 8 && ob.maxY <= b.minY + 12 && ob.minY < b.minY - 20;
      const supportsAbove =
        ob.minY >= b.maxY - 12 &&
        ob.minY <= b.maxY + 8 &&
        ob.maxY > b.maxY + 120 &&
        odx <= 90 &&
        ob.maxX >= b.minX - 8 &&
        ob.minX <= b.maxX + 8;
      const flanksVertical =
        ob.minY <= b.minY + 12 &&
        ob.maxY >= b.maxY - 12 &&
        odx <= 90 &&
        ob.maxX >= b.minX - 8 &&
        ob.minX <= b.maxX + 8;

      if (supportsUnder || supportsAbove || flanksVertical) {
        // Ignore thin rear HDF/back wall (it does not prevent front-edge shelf sag)
        const isRearBackWall =
          ob.maxZ - ob.minZ <= 24 && ob.maxZ <= b.minZ + 32 && !supportsUnder;
        if (isRearBackWall) continue;

        // Full-width plinth board running directly underneath bottom deck stiffens it continuously along X
        if (supportsUnder && odx >= dx * 0.7 && b.minY <= 220) {
          continuousPlinthUnderCount += 1;
        }

        const clampedMin = Math.max(b.minX, ob.minX);
        const clampedMax = Math.min(b.maxX, ob.maxX);
        if (clampedMax >= clampedMin - 8) {
          supportIntervals.push([clampedMin, clampedMax]);
        }
      }
    }

    // Bottom deck supported continuously by front+back plinths (or full-width plinth) does not sag as a free shelf
    if (continuousPlinthUnderCount >= 1) {
      continue;
    }

    // Sort & merge overlapping support intervals along X to compute true longest clear unsupported gap
    supportIntervals.sort((u, v) => u[0] - v[0]);
    const merged: Array<[number, number]> = [];
    for (const iv of supportIntervals) {
      if (merged.length === 0 || iv[0] > merged[merged.length - 1][1]) {
        merged.push([iv[0], iv[1]]);
      } else {
        merged[merged.length - 1][1] = Math.max(merged[merged.length - 1][1], iv[1]);
      }
    }

    let maxSpanMm = dx;
    if (merged.length > 0) {
      let longest = 0;
      longest = Math.max(longest, merged[0][0] - b.minX);
      for (let i = 0; i < merged.length - 1; i++) {
        longest = Math.max(longest, merged[i + 1][0] - merged[i][1]);
      }
      longest = Math.max(longest, b.maxX - merged[merged.length - 1][1]);
      maxSpanMm = Math.max(120, Math.round(longest));
    } else {
      maxSpanMm = Math.round(dx);
    }

    // Euler-Bernoulli simply-supported beam deflection: δ = 5 * w * L⁴ / (384 * E * I)
    // Units: N and mm (1 MPa = 1 N/mm²). w [N/mm] = (loadKgPerM * 9.81) / 1000
    const E = getMaterialElasticModulusMpa(p.materialId);
    const thicknessMm = Math.max(4, Math.round(p.height));
    const depthMm = Math.max(80, Math.round(p.depth));
    const I = (depthMm * Math.pow(thicknessMm, 3)) / 12; // mm⁴
    const wNPerMm = (loadKgPerM * 9.81) / 1000;
    const L = maxSpanMm;

    // Long-term wood creep factor (~1.35× immediate elastic sag for furniture boards)
    const creepFactor = p.materialId.startsWith('steel') || p.materialId === 'glass_clear' ? 1.0 : 1.35;
    const rawDeflectionMm =
      ((5 * wNPerMm * Math.pow(L, 4)) / (384 * E * I)) * creepFactor;
    const deflectionMm = Math.round(rawDeflectionMm * 100) / 100;
    const spanLoadKg = Math.round((loadKgPerM * (L / 1000)) * 10) / 10;

    // Max safe load keeping deflection <= 2.0 mm
    const safeMaxLoadKg =
      rawDeflectionMm > 0.001
        ? Math.min(250, Math.round((spanLoadKg * (2.0 / rawDeflectionMm)) * 10) / 10)
        : 250;

    const limitWarn = Math.min(2.2, L / 320);
    const limitCrit = Math.min(3.8, L / 200);

    let status: ShelfLoadStatus = 'ok';
    let recommendation = `Sztywność OK — ugięcie ~${deflectionMm.toFixed(1)} mm przy ${spanLoadKg} kg (udźwig bezpieczny ok. ${safeMaxLoadKg} kg).`;
    if (deflectionMm >= limitCrit) {
      status = 'critical';
      recommendation = `Ryzyko ugięcia (${deflectionMm.toFixed(1)} mm na rozpiętości ${L} mm)! Dodaj przegrodę pionową lub zwiększ grubość płyty do min. 22–25 mm.`;
    } else if (deflectionMm >= limitWarn) {
      status = 'warning';
      recommendation = `Graniczna rozpiętość (${L} mm, ugięcie ~${deflectionMm.toFixed(1)} mm). Pod ciężkie książki/narzędzia warto dodać podparcie pośrodku.`;
    }

    result.set(p.id, {
      partId: p.id,
      partName: p.name,
      maxUnsupportedSpanMm: L,
      thicknessMm,
      depthMm,
      loadKgPerM,
      spanLoadKg,
      deflectionMm,
      safeMaxLoadKg,
      status,
      recommendation,
    });
  }

  return result;
}

export interface RoomClearanceIssue {
  partId: string;
  partName: string;
  kind: 'wall_out' | 'ceiling_out' | 'slope_hit' | 'obstacle_hit';
  message: string;
}

/**
 * Computes exact world-space AABB (mm) for a room obstacle mounted on back, left, or right wall.
 */
export function getRoomObstacleWorldBox(
  obs: import('../types/furniture').RoomObstacle,
  room: import('../types/furniture').RoomConfig
): WorldBox {
  const halfW = room.widthMm / 2;
  const minY = obs.elevationMm;
  const maxY = obs.elevationMm + obs.heightMm;

  if (obs.wall === 'back') {
    const minX = -halfW + obs.offsetMm;
    const maxX = minX + obs.widthMm;
    const minZ = room.backWallZMm;
    const maxZ = room.backWallZMm + obs.depthMm;
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }
  if (obs.wall === 'left') {
    const minX = -halfW;
    const maxX = -halfW + obs.depthMm;
    const minZ = room.backWallZMm + obs.offsetMm;
    const maxZ = minZ + obs.widthMm;
    return { minX, maxX, minY, maxY, minZ, maxZ };
  }
  // right wall
  const maxX = halfW;
  const minX = halfW - obs.depthMm;
  const minZ = room.backWallZMm + obs.offsetMm;
  const maxZ = minZ + obs.widthMm;
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/**
 * Evaluates maximum allowable ceiling height at world X inside a room with optional attic slope.
 */
export function getRoomCeilingHeightAtX(
  xMm: number,
  room: import('../types/furniture').RoomConfig,
  zMm = 0
): number {
  return getRoomCeilingHeightAtXZ(xMm, zMm, room);
}

/**
 * Audits all furniture parts against enabled Room / Alcove walls, attic ceiling slope,
 * and placed obstacles (radiators, electrical sockets, pipes, windows).
 */
export function auditRoomClearances(
  parts: FurniturePart[],
  room?: import('../types/furniture').RoomConfig
): RoomClearanceIssue[] {
  if (!room || !room.enabled) return [];
  const issues: RoomClearanceIssue[] = [];
  const tol = 3; // 3 mm tolerance

  const hasCustomPolygon = Boolean(room.floorPoints && room.floorPoints.length >= 3);
  const polyPts = getRoomPolygonPoints(room);
  const wallSegments = computeWallSegments(polyPts);
  const hiddenSet = new Set<number>(room.hiddenWallIndices ?? []);
  const halfW = room.widthMm / 2;

  const obstacleBoxes: Array<{ label: string; box: WorldBox }> = [
    ...room.obstacles.map((o) => ({
      label: o.label,
      box: getRoomObstacleWorldBox(o, room),
    })),
  ];

  for (const wobs of room.wallObstacles ?? []) {
    const wb = getWallObstacleWorldBox(wobs, wallSegments);
    if (wb) obstacleBoxes.push({ label: wobs.label, box: wb });
  }

  const roomDoorZones = (room.openings ?? [])
    .map((op) => ({ op, box: getRoomDoorSwingBox(op, wallSegments) }))
    .filter((entry): entry is { op: NonNullable<RoomConfig['openings']>[number]; box: WorldBox } => entry.box !== null);

  for (const p of parts) {
    const b = getPartWorldBox(p);

    if (hasCustomPolygon) {
      // Check all 4 XZ footprint corners of part against exact room polygon
      const corners: Array<[number, number]> = [
        [b.minX, b.minZ],
        [b.maxX, b.minZ],
        [b.maxX, b.maxZ],
        [b.minX, b.maxZ],
      ];
      let worstDist = 0;
      let worstWallLabel = '';
      let worstWallIdx = -1;
      for (const [cx, cz] of corners) {
        if (!pointInPolygonXZ(cx, cz, polyPts, tol)) {
          const nearest = findNearestWallSegment(cx, cz, wallSegments);
          if (nearest && nearest.distanceMm > worstDist) {
            worstDist = nearest.distanceMm;
            worstWallLabel = nearest.segment.label;
            worstWallIdx = nearest.segment.index;
          }
        }
      }
      if (worstDist > tol && !hiddenSet.has(worstWallIdx)) {
        issues.push({
          partId: p.id,
          partName: p.name,
          kind: 'wall_out',
          message: `„${p.name}” wchodzi w ścianę (${worstWallLabel}) o ${Math.round(worstDist)} mm.`,
        });
      }
    } else {
      if (room.showLeftWall && b.minX < -halfW - tol) {
        issues.push({
          partId: p.id,
          partName: p.name,
          kind: 'wall_out',
          message: `„${p.name}” wchodzi w lewą ścianę wnęki o ${Math.round(-halfW - b.minX)} mm.`,
        });
      }
      if (room.showRightWall && b.maxX > halfW + tol) {
        issues.push({
          partId: p.id,
          partName: p.name,
          kind: 'wall_out',
          message: `„${p.name}” wchodzi w prawą ścianę wnęki o ${Math.round(b.maxX - halfW)} mm.`,
        });
      }
      if (room.showBackWall && b.minZ < room.backWallZMm - tol) {
        issues.push({
          partId: p.id,
          partName: p.name,
          kind: 'wall_out',
          message: `„${p.name}” przekracza tylną ścianę o ${Math.round(room.backWallZMm - b.minZ)} mm.`,
        });
      }
    }

    if (b.maxY > room.heightMm + tol) {
      issues.push({
        partId: p.id,
        partName: p.name,
        kind: 'ceiling_out',
        message: `„${p.name}” przekracza wysokość sufitu (${room.heightMm} mm) o ${Math.round(b.maxY - room.heightMm)} mm.`,
      });
    }

    const activeSlopes = getEffectiveRoomWallSlopes(room, wallSegments);
    if (activeSlopes.length > 0) {
      // Check actual 3D top corners + center against all active wall roof slopes
      const checkPts: Array<[number, number]> = [
        [b.minX, b.minZ],
        [b.maxX, b.minZ],
        [b.maxX, b.maxZ],
        [b.minX, b.maxZ],
        [(b.minX + b.maxX) / 2, (b.minZ + b.maxZ) / 2],
      ];
      for (const [cx, cz] of checkPts) {
        const ceilAtXZ = getRoomCeilingHeightAtXZ(cx, cz, room, activeSlopes);
        if (b.maxY > ceilAtXZ + tol) {
          const probe = new THREE.Vector3(cx, ceilAtXZ + tol + 2, cz);
          if (isWorldPointInsidePart(probe, p, 2)) {
            issues.push({
              partId: p.id,
              partName: p.name,
              kind: 'slope_hit',
              message: `„${p.name}” koliduje ze skosem dachu poddasza (wysokość skosu w tym miejscu: ${Math.round(ceilAtXZ)} mm).`,
            });
            break;
          }
        }
      }
    }

    for (const { label, box: ob } of obstacleBoxes) {
      const ox = Math.min(b.maxX, ob.maxX) - Math.max(b.minX, ob.minX);
      const oy = Math.min(b.maxY, ob.maxY) - Math.max(b.minY, ob.minY);
      const oz = Math.min(b.maxZ, ob.maxZ) - Math.max(b.minZ, ob.minZ);
      if (ox > tol && oy > tol && oz > tol) {
        issues.push({
          partId: p.id,
          partName: p.name,
          kind: 'obstacle_hit',
          message: `„${p.name}” zasłania / koliduje z przeszkodą: ${label}.`,
        });
      }
    }

    for (const { op, box: db } of roomDoorZones) {
      const ox = Math.min(b.maxX, db.maxX) - Math.max(b.minX, db.minX);
      const oy = Math.min(b.maxY, db.maxY) - Math.max(b.minY, db.minY);
      const oz = Math.min(b.maxZ, db.maxZ) - Math.max(b.minZ, db.minZ);
      if (ox > 15 && oy > 15 && oz > 15) {
        issues.push({
          partId: p.id,
          partName: p.name,
          kind: 'obstacle_hit',
          message: `„${p.name}” wchodzi w strefę otwierania drzwi pomieszczenia (${op.label}).`,
        });
      }
    }
  }

  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. DYNAMIC DOOR SWING COLLISION ANALYZER (95°–105° sweep vs walls, obstacles, adjacent cabinets)
// ═══════════════════════════════════════════════════════════════════════════

export interface DoorSwingCollision {
  doorId: string;
  doorName: string;
  hitAngleDeg: number;
  hitKind: 'wall' | 'obstacle' | 'cabinet' | 'ceiling';
  hitLabel: string;
  recommendation: string;
}

/**
 * Sweeps every hinged door (left, right, or upward flap) in 10° steps from 12° to 100°
 * (including handle clearance protrusion) and detects dynamic collisions against room walls,
 * ceiling/attic slope, room obstacles (radiator, window, pipe), and neighboring cabinets.
 */
export function analyzeDoorSwingCollisions(
  parts: FurniturePart[],
  room?: import('../types/furniture').RoomConfig
): DoorSwingCollision[] {
  const results: DoorSwingCollision[] = [];
  const boxMap = new Map<string, WorldBox>();
  for (const p of parts) {
    boxMap.set(p.id, getPartWorldBox(p));
  }

  const hasCustomPolygon = Boolean(room?.enabled && room.floorPoints && room.floorPoints.length >= 3);
  const polyPts = room && room.enabled ? getRoomPolygonPoints(room) : [];
  const wallSegments = room && room.enabled ? computeWallSegments(polyPts) : [];

  const obstacleBoxes: Array<{ label: string; box: WorldBox }> =
    room && room.enabled
      ? [
          ...room.obstacles.map((obs) => ({
            label: obs.label,
            box: getRoomObstacleWorldBox(obs, room),
          })),
          ...(room.wallObstacles ?? [])
            .map((wobs) => ({
              label: wobs.label,
              box: getWallObstacleWorldBox(wobs, wallSegments),
            }))
            .filter((x): x is { label: string; box: WorldBox } => x.box !== null),
        ]
      : [];

  for (const door of parts) {
    if (
      door.kind !== 'door' ||
      door.hardwareTag === 'drawer_front' ||
      door.hardwareTag === 'sliding_door'
    ) {
      continue;
    }
    const hingeSide =
      door.hingeSide && door.hingeSide !== 'none'
        ? door.hingeSide
        : door.handleSide === 'left'
          ? 'right'
          : door.handleSide === 'right'
            ? 'left'
            : null;
    if (!hingeSide) continue;

    const handleProtrusionMm =
      door.handleStyle === 'bar' || !door.handleStyle ? 28 : 4;
    const halfW = door.width / 2;
    const halfH = door.height / 2;
    const halfD = door.depth / 2;
    const baseQuat = getPartQuaternion(door);
    const basePos = new THREE.Vector3(...door.position);

    const isFlap = hingeSide === 'top';
    const maxSweepDeg = isFlap ? 90 : 100;

    // Pivot in door's local space (outer hinge edge)
    const pivotLocal = isFlap
      ? new THREE.Vector3(0, halfH, -halfD)
      : new THREE.Vector3(hingeSide === 'left' ? -halfW : halfW, 0, -halfD);

    // Sample points on the swinging leaf (far edge corners + midpoints + handle tip)
    const localSamples: THREE.Vector3[] = isFlap
      ? [
          new THREE.Vector3(-halfW + 12, -halfH, halfD + handleProtrusionMm),
          new THREE.Vector3(0, -halfH, halfD + handleProtrusionMm),
          new THREE.Vector3(halfW - 12, -halfH, halfD + handleProtrusionMm),
          new THREE.Vector3(-halfW + 12, 0, halfD),
          new THREE.Vector3(halfW - 12, 0, halfD),
        ]
      : [
          new THREE.Vector3(hingeSide === 'left' ? halfW : -halfW, -halfH + 15, halfD + handleProtrusionMm),
          new THREE.Vector3(hingeSide === 'left' ? halfW : -halfW, 0, halfD + handleProtrusionMm),
          new THREE.Vector3(hingeSide === 'left' ? halfW : -halfW, halfH - 15, halfD + handleProtrusionMm),
          new THREE.Vector3(0, 0, halfD + handleProtrusionMm),
        ];

    let foundHit: DoorSwingCollision | null = null;

    for (let deg = 12; deg <= maxSweepDeg && !foundHit; deg += 8) {
      const rad = THREE.MathUtils.degToRad(deg);
      const swingQuat = isFlap
        ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -rad)
        : new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            hingeSide === 'left' ? -rad : rad
          );

      for (const ls of localSamples) {
        const rel = ls.clone().sub(pivotLocal).applyQuaternion(swingQuat).add(pivotLocal);
        const worldPt = rel.applyQuaternion(baseQuat).add(basePos);

        // 1. Check Room Walls & Ceiling / Attic Slope
        if (room && room.enabled) {
          if (hasCustomPolygon) {
            if (!pointInPolygonXZ(worldPt.x, worldPt.z, polyPts, 0)) {
              const nearest = findNearestWallSegment(worldPt.x, worldPt.z, wallSegments);
              const wallName = nearest ? nearest.segment.label : 'Ściana pomieszczenia';
              foundHit = {
                doorId: door.id,
                doorName: door.name,
                hitAngleDeg: deg,
                hitKind: 'wall',
                hitLabel: wallName,
                recommendation: `Front uderza w ścianę (${wallName}) przy ~${deg}° — dodaj blendę przyścienną min. 45 mm lub ogranicznik kąta 86°.`,
              };
              break;
            }
          } else {
            const halfRoomW = room.widthMm / 2;
            if (room.showLeftWall && worldPt.x < -halfRoomW + 4) {
              foundHit = {
                doorId: door.id,
                doorName: door.name,
                hitAngleDeg: deg,
                hitKind: 'wall',
                hitLabel: 'Lewa ściana wnęki',
                recommendation: `Front uderza w lewą ścianę przy ~${deg}° — dodaj blendę przyścienną min. 45 mm lub ogranicznik kąta 86°.`,
              };
              break;
            }
            if (room.showRightWall && worldPt.x > halfRoomW - 4) {
              foundHit = {
                doorId: door.id,
                doorName: door.name,
                hitAngleDeg: deg,
                hitKind: 'wall',
                hitLabel: 'Prawa ściana wnęki',
                recommendation: `Front uderza w prawą ścianę przy ~${deg}° — dodaj blendę przyścienną min. 45 mm lub ogranicznik kąta 86°.`,
              };
              break;
            }
          }
          const ceilY = getRoomCeilingHeightAtX(worldPt.x, room);
          if (worldPt.y > ceilY - 5) {
            foundHit = {
              doorId: door.id,
              doorName: door.name,
              hitAngleDeg: deg,
              hitKind: 'ceiling',
              hitLabel: room.slopedCeiling.enabled ? 'Skos dachu / sufit' : 'Sufit pomieszczenia',
              recommendation: `Klapa uderza w sufit/skos przy ~${deg}° — zastosuj ogranicznik podnośnika ${Math.max(60, deg - 12)}° lub obniż szafkę.`,
            };
            break;
          }

          // 2. Check Room Obstacles (radiator, window, pipe, wallObstacles)
          for (const { label, box: ob } of obstacleBoxes) {
            if (
              worldPt.x >= ob.minX - 4 &&
              worldPt.x <= ob.maxX + 4 &&
              worldPt.y >= ob.minY - 4 &&
              worldPt.y <= ob.maxY + 4 &&
              worldPt.z >= ob.minZ - 4 &&
              worldPt.z <= ob.maxZ + 4
            ) {
              foundHit = {
                doorId: door.id,
                doorName: door.name,
                hitAngleDeg: deg,
                hitKind: 'obstacle',
                hitLabel: label,
                recommendation: `Front koliduje przy ~${deg}° z „${label}” — zastosuj blendę dystansową, odwróć stronę zawiasów lub ogranicznik kąta.`,
              };
              break;
            }
          }
          if (foundHit) break;
        }

        // 3. Check Neighboring Cabinets / Protruding Panels from OTHER groups (e.g. L-corner perpendicular cabinet)
        for (const other of parts) {
          if (other.id === door.id) continue;
          // Skip parts belonging to the same cabinet carcass
          if (door.groupId && other.groupId === door.groupId) continue;
          if (other.hardwareTag === 'leg') continue;
          const ob = boxMap.get(other.id)!;
          if (
            worldPt.x >= ob.minX + 3 &&
            worldPt.x <= ob.maxX - 3 &&
            worldPt.y >= ob.minY + 3 &&
            worldPt.y <= ob.maxY - 3 &&
            worldPt.z >= ob.minZ + 3 &&
            worldPt.z <= ob.maxZ - 3
          ) {
            foundHit = {
              doorId: door.id,
              doorName: door.name,
              hitAngleDeg: deg,
              hitKind: 'cabinet',
              hitLabel: other.name,
              recommendation: `Front uderza w „${other.name}” przy ~${deg}° — odsuń szafkę blendą narożną min. 45 mm lub zmień kierunek otwierania.`,
            };
            break;
          }
        }
        if (foundHit) break;
      }
    }

    if (foundHit) {
      results.push(foundHit);
    }
  }

  return results;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. SHARED COUNTERTOP MERGER & AUTO APPLIANCE CUTOUTS (+ 50 mm BRIDGE AUDIT)
// ═══════════════════════════════════════════════════════════════════════════

export interface CountertopBridgeIssue {
  partId: string;
  partName: string;
  cutoutId: string;
  cutoutLabel: string;
  frontBridgeMm: number;
  backBridgeMm: number;
  sideBridgeMm: number;
  status: 'ok' | 'warning' | 'critical';
  message: string;
}

/**
 * Merges horizontally adjacent aligned kitchen countertops (same Y ±10 mm, depth ±30 mm, gap <= 40 mm)
 * into a single continuous shared countertop, preserving & re-centering any existing cutouts.
 */
export function mergeCountertopsForRow(parts: FurniturePart[]): {
  parts: FurniturePart[];
  mergedCount: number;
  needsMiterJoint: boolean;
} {
  const countertops = parts.filter(
    (p) => p.kind === 'countertop' && Math.abs(p.rotation[1] % 180) < 2
  );
  if (countertops.length < 2) {
    return { parts, mergedCount: 0, needsMiterJoint: false };
  }

  // Group countertops into contiguous horizontal runs
  const sorted = [...countertops].sort((a, b) => a.position[0] - b.position[0]);
  const clusters: FurniturePart[][] = [];

  for (const ct of sorted) {
    const b = getPartWorldBox(ct);
    let addedToCluster = false;
    for (const cluster of clusters) {
      const last = cluster[cluster.length - 1];
      const lb = getPartWorldBox(last);
      const sameY = Math.abs(ct.position[1] - last.position[1]) <= 12;
      const sameZ = Math.abs(ct.position[2] - last.position[2]) <= 35;
      const sameD = Math.abs(ct.depth - last.depth) <= 35;
      const xGap = b.minX - lb.maxX;
      if (sameY && sameZ && sameD && xGap >= -25 && xGap <= 45) {
        cluster.push(ct);
        addedToCluster = true;
        break;
      }
    }
    if (!addedToCluster) {
      clusters.push([ct]);
    }
  }

  const removeIds = new Set<string>();
  const mergedParts: FurniturePart[] = [];
  let mergedCount = 0;
  let needsMiterJoint = false;

  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    mergedCount += cluster.length;

    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    let sumY = 0;
    let maxH = 38;

    for (const ct of cluster) {
      const b = getPartWorldBox(ct);
      minX = Math.min(minX, b.minX);
      maxX = Math.max(maxX, b.maxX);
      minZ = Math.min(minZ, b.minZ);
      maxZ = Math.max(maxZ, b.maxZ);
      sumY += ct.position[1];
      maxH = Math.max(maxH, ct.height);
      removeIds.add(ct.id);
    }

    const totalW = Math.round(maxX - minX);
    const totalD = Math.round(maxZ - minZ);
    const centerX = Math.round((minX + maxX) / 2);
    const centerY = Math.round(sumY / cluster.length);
    const centerZ = Math.round((minZ + maxZ) / 2);
    const base = cluster[0];

    if (totalW > 3050) needsMiterJoint = true;

    // Preserve and re-center existing cutouts onto the shared countertop coordinate frame
    const mergedCutouts: import('../types/furniture').PartCutout[] = [];
    for (const ct of cluster) {
      if (!ct.cutouts) continue;
      for (const cut of ct.cutouts) {
        mergedCutouts.push({
          ...cut,
          xMm: Math.round(cut.xMm + (ct.position[0] - centerX)),
          yMm: Math.round(cut.yMm + (ct.position[2] - centerZ)),
        });
      }
    }

    mergedParts.push({
      ...base,
      id: `ct_shared_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name:
        totalW > 3050
          ? `Blat wspólny ${totalW} mm (łączenie na śruby rzymskie)`
          : `Blat wspólny ciągu (${totalW}×${totalD} mm)`,
      width: totalW,
      height: maxH,
      depth: totalD,
      position: [centerX, centerY, centerZ],
      rotation: [0, 0, 0],
      cutouts: mergedCutouts.length > 0 ? mergedCutouts : undefined,
      groupId: undefined,
    });
  }

  if (mergedCount === 0) {
    return { parts, mergedCount: 0, needsMiterJoint: false };
  }

  const nextParts = [
    ...parts.filter((p) => !removeIds.has(p.id)),
    ...mergedParts,
  ];
  return { parts: nextParts, mergedCount, needsMiterJoint };
}

/**
 * Automatically creates or updates exact rectangular cutouts on countertops
 * underneath placed kitchen sinks (`kitchen_sink`) and induction hobs (`induction_hob`).
 */
export function syncApplianceCutoutsOnCountertops(parts: FurniturePart[]): {
  parts: FurniturePart[];
  cutoutsSynced: number;
} {
  const appliances = parts.filter(
    (p) =>
      p.kind === 'appliance' &&
      (p.applianceModel === 'kitchen_sink' || p.applianceModel === 'induction_hob')
  );
  if (appliances.length === 0) return { parts, cutoutsSynced: 0 };

  let cutoutsSynced = 0;

  const nextParts = parts.map((part) => {
    if (part.kind !== 'countertop') return part;
    const ctBox = getPartWorldBox(part);
    const manualCutouts = (part.cutouts ?? []).filter((c) => !c.id.startsWith('auto_app_'));
    const autoCutouts: import('../types/furniture').PartCutout[] = [];

    for (const app of appliances) {
      const ab = getPartWorldBox(app);
      const xOverlap = Math.min(ctBox.maxX, ab.maxX) - Math.max(ctBox.minX, ab.minX);
      const zOverlap = Math.min(ctBox.maxZ, ab.maxZ) - Math.max(ctBox.minZ, ab.minZ);
      const yDist = Math.abs(ab.maxY - ctBox.maxY);
      if (xOverlap < 120 || zOverlap < 120 || yDist > 360) continue;

      const isHob = app.applianceModel === 'induction_hob';
      const cutW = isHob ? Math.min(560, Math.round(app.width - 30)) : Math.round(app.width - 30);
      const cutH = isHob ? Math.min(490, Math.round(app.depth - 30)) : Math.round(app.depth - 30);

      const relX = Math.round(app.position[0] - part.position[0]);
      const relY = Math.round(app.position[2] - part.position[2]);

      autoCutouts.push({
        id: `auto_app_${app.id}`,
        shape: 'rect',
        xMm: relX,
        yMm: relY,
        widthMm: Math.max(120, cutW),
        heightMm: Math.max(120, cutH),
        label: isHob ? 'Wycięcie pod płytę indukcyjną' : 'Wycięcie pod zlewozmywak',
      });
      cutoutsSynced += 1;
    }

    if (autoCutouts.length === 0 && manualCutouts.length === (part.cutouts?.length ?? 0)) {
      return part;
    }
    const combined = [...manualCutouts, ...autoCutouts];
    return {
      ...part,
      cutouts: combined.length > 0 ? combined : undefined,
    };
  });

  return { parts: nextParts, cutoutsSynced };
}

/**
 * Audits all countertop cutouts against the real-world carpentry minimum bridge rule
 * (minimum 50 mm front and rear bridge so laminate/HPL countertops don't snap during transport/installation).
 */
export function analyzeCountertopCutouts(parts: FurniturePart[]): CountertopBridgeIssue[] {
  const issues: CountertopBridgeIssue[] = [];
  for (const part of parts) {
    if (part.kind !== 'countertop' || !part.cutouts || part.cutouts.length === 0) continue;
    const halfW = part.width / 2;
    const halfD = part.depth / 2;
    for (const cut of part.cutouts) {
      const cw = cut.shape === 'circle' ? (cut.diameterMm ?? cut.widthMm) : cut.widthMm;
      const ch = cut.shape === 'circle' ? (cut.diameterMm ?? cut.heightMm) : cut.heightMm;
      const frontBridgeMm = Math.round(halfD - (cut.yMm + ch / 2));
      const backBridgeMm = Math.round(halfD + (cut.yMm - ch / 2));
      const leftBridgeMm = Math.round(halfW + (cut.xMm - cw / 2));
      const rightBridgeMm = Math.round(halfW - (cut.xMm + cw / 2));
      const sideBridgeMm = Math.min(leftBridgeMm, rightBridgeMm);
      const minFB = Math.min(frontBridgeMm, backBridgeMm);

      if (minFB < 35 || sideBridgeMm < 40) {
        issues.push({
          partId: part.id,
          partName: part.name,
          cutoutId: cut.id,
          cutoutLabel: cut.label || 'Otwór w blacie',
          frontBridgeMm,
          backBridgeMm,
          sideBridgeMm,
          status: 'critical',
          message: `Krytycznie cienki mostek blatu (${minFB} mm przód/tył, zalecane min. 50 mm) — ryzyko pęknięcia blatu przy montażu!`,
        });
      } else if (minFB < 50) {
        issues.push({
          partId: part.id,
          partName: part.name,
          cutoutId: cut.id,
          cutoutLabel: cut.label || 'Otwór w blacie',
          frontBridgeMm,
          backBridgeMm,
          sideBridgeMm,
          status: 'warning',
          message: `Wąski mostek blatu (przód: ${frontBridgeMm} mm, tył: ${backBridgeMm} mm — bezpieczne minimum to 50 mm).`,
        });
      }
    }
  }
  return issues;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. PART & FURNITURE WEIGHT CALCULATOR + HARDWARE LOAD SIZING (FLAPS / HINGES / SLIDES)
// ═══════════════════════════════════════════════════════════════════════════

export function getMaterialDensityKgM3(materialId: string): number {
  switch (materialId) {
    case 'osb3':
      return 640;
    case 'birch_plywood':
      return 680;
    case 'hdf_white':
    case 'hdf_black':
      return 860;
    case 'concrete_top':
      return 760; // 38 mm laminated postforming particleboard core
    case 'glass_clear':
      return 2500;
    case 'steel_black':
    case 'steel_galv':
      return 7850;
    case 'pine_timber':
      return 480; // Kiln-dried C24 pine/spruce structural timber
    case 'spruce_plank':
      return 470;
    case 'larch_impregnated':
      return 590;
    case 'styrofoam_eps':
      return 20; // Expanded polystyrene EPS 70/80
    case 'mineral_wool':
      return 45; // Stone / glass wool insulation slab
    case 'roof_shingle':
      return 1150; // Bitumen asphalt shingle / felt
    default:
      // Standard 18 mm furniture particleboard / MDF laminated
      return 690;
  }
}

/**
 * Computes realistic mass of a single part in kilograms (kg),
 * accounting for hollow steel tube wall thickness (2 mm), sloped trapezoids, custom polygons, and cutouts.
 */
export function computePartWeightKg(part: FurniturePart): number {
  if (part.kind === 'appliance') {
    switch (part.applianceModel) {
      case 'builtin_oven':
        return 34;
      case 'fridge_freezer':
        return 66;
      case 'dishwasher_60':
        return 42;
      case 'range_hood':
        return 14;
      case 'microwave_builtin':
        return 18;
      case 'induction_hob':
        return 11.5;
      case 'kitchen_sink':
        return 7.5;
      case 'wire_cargo':
        return 6.2;
      case 'wardrobe_rod':
        return 1.2;
      case 'wc_geberit':
        return 38;
      case 'wc_low_cistern':
        return 32;
      case 'wc_high_cistern':
        return 30;
      case 'bathroom_sink':
        return 12;
      case 'shower_cabin':
        return 52;
      case 'bathtub_170':
        return 36;
      case 'washing_machine':
        return 68;
      case 'tumble_dryer':
        return 49;
      case 'towel_radiator':
        return 11;
      case 'led_mirror':
        return 8.5;
      case 'bed_double':
        return 64;
      case 'bed_single':
        return 38;
      case 'dressing_bench':
        return 12;
      case 'tv_65':
        return 22;
      case 'sofa_3seat':
        return 56;
      case 'office_chair':
        return 16;
      case 'desk_monitor_set':
        return 6.5;
      case 'coffee_table':
        return 14;
      default:
        return 4;
    }
  }

  const density = getMaterialDensityKgM3(part.materialId);

  // Hollow rectangular steel tube (2 mm wall thickness) instead of solid steel bar!
  if (part.kind === 'profile' && (part.materialId === 'steel_black' || part.materialId === 'steel_galv')) {
    const dims = [part.width, part.height, part.depth].sort((a, b) => a - b);
    const a = dims[0];
    const b = dims[1];
    const len = dims[2];
    const wall = Math.min(2, a * 0.25);
    const crossAreaMm2 = a * b - Math.max(0, a - 2 * wall) * Math.max(0, b - 2 * wall);
    const volM3 = (crossAreaMm2 * len) / 1_000_000_000;
    return Math.round(volM3 * density * 100) / 100;
  }

  let volMm3 = part.width * part.height * part.depth;

  // Adjust for sloped trapezoid area
  if (part.kind === 'sloped') {
    const leftH = Math.max(10, part.height - (part.slopeTopLeft ?? 0) - (part.slopeBottomLeft ?? 0));
    const rightH = Math.max(10, part.height - (part.slopeTopRight ?? 0) - (part.slopeBottomRight ?? 0));
    volMm3 = ((leftH + rightH) / 2) * part.width * part.depth;
  } else if (part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3) {
    let area2 = 0;
    const pts = part.customPolygon;
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      area2 += x1 * y2 - x2 * y1;
    }
    volMm3 = Math.abs(area2 * 0.5) * part.depth;
  }

  // Subtract internal cutouts (sink, hob, cable grommet)
  if (part.cutouts && part.cutouts.length > 0) {
    const thickness = Math.min(part.width, part.height, part.depth);
    for (const c of part.cutouts) {
      const cutAreaMm2 =
        c.shape === 'circle'
          ? Math.PI * Math.pow((c.diameterMm ?? c.widthMm) / 2, 2)
          : c.widthMm * c.heightMm;
      volMm3 = Math.max(0, volMm3 - cutAreaMm2 * thickness);
    }
  }

  // Gloss MDF fronts are ~10% denser than standard chipboard
  const finishFactor = part.surfaceFinish === 'gloss' ? 1.09 : 1.0;
  const kg = (volMm3 / 1_000_000_000) * density * finishFactor;
  return Math.round(kg * 100) / 100;
}

export interface FlapHardwareRecommendation {
  partId: string;
  partName: string;
  weightKg: number;
  powerFactorLF: number;
  recommendedLift: string;
}

export interface HingeWeightRecommendation {
  partId: string;
  partName: string;
  weightKg: number;
  currentHinges: number;
  recommendedHinges: number;
  needsMoreHinges: boolean;
}

export interface DrawerSlideLoadRecommendation {
  partId: string;
  partName: string;
  widthMm: number;
  recommendedLoadKg: 30 | 40 | 60;
  note: string;
}

export interface ProjectWeightSummary {
  totalWeightKg: number;
  boardsWeightKg: number;
  appliancesWeightKg: number;
  heaviestPart: { id: string; name: string; weightKg: number } | null;
  partWeights: Map<string, number>;
  flapRecommendations: FlapHardwareRecommendation[];
  hingeRecommendations: HingeWeightRecommendation[];
  drawerRecommendations: DrawerSlideLoadRecommendation[];
}

/**
 * Computes complete project mass breakdown (kg) and real carpentry hardware load recommendations
 * (gas-strut/Aventos power factor LF, Ø35 hinge counts by weight, and drawer slide load classes 30/40/60 kg).
 */
export function computeProjectWeightSummary(parts: FurniturePart[]): ProjectWeightSummary {
  const partWeights = new Map<string, number>();
  let boardsWeightKg = 0;
  let appliancesWeightKg = 0;
  let heaviestPart: { id: string; name: string; weightKg: number } | null = null;
  const flapRecommendations: FlapHardwareRecommendation[] = [];
  const hingeRecommendations: HingeWeightRecommendation[] = [];
  const drawerRecommendations: DrawerSlideLoadRecommendation[] = [];

  for (const part of parts) {
    const kg = computePartWeightKg(part);
    partWeights.set(part.id, kg);
    if (part.kind === 'appliance') {
      appliancesWeightKg += kg;
    } else {
      boardsWeightKg += kg;
    }
    if (!heaviestPart || kg > heaviestPart.weightKg) {
      heaviestPart = { id: part.id, name: part.name, weightKg: kg };
    }

    if (part.kind === 'door' && part.hingeSide === 'top') {
      // Blum Aventos power factor LF = corpus/front height (mm) × front weight including handle (kg)
      const weightWithHandle = kg + 0.35;
      const lf = Math.round(part.height * weightWithHandle);
      const recommendedLift =
        lf <= 960
          ? '2 × siłownik gazowy 60N (lub Aventos HK-XS)'
          : lf <= 1800
            ? '2 × siłownik gazowy 80N (lub Aventos HK-S)'
            : lf <= 3200
              ? '2 × siłownik gazowy 100N (lub Aventos HK top 22K2500)'
              : 'Blum Aventos HK top 22K2700 / 2900 (ciężka klapa)';
      flapRecommendations.push({
        partId: part.id,
        partName: part.name,
        weightKg: kg,
        powerFactorLF: lf,
        recommendedLift,
      });
    } else if (
      part.kind === 'door' &&
      (part.hingeSide === 'left' || part.hingeSide === 'right')
    ) {
      const currentHinges =
        part.hingeCount ?? (part.height > 1500 ? 4 : part.height > 950 ? 3 : 2);
      const byWeight = kg > 19 ? 5 : kg > 14 ? 4 : kg > 9 ? 3 : 2;
      const byHeight = part.height > 1900 ? 5 : part.height > 1500 ? 4 : part.height > 950 ? 3 : 2;
      const recommendedHinges = Math.max(byWeight, byHeight);
      hingeRecommendations.push({
        partId: part.id,
        partName: part.name,
        weightKg: kg,
        currentHinges,
        recommendedHinges,
        needsMoreHinges: currentHinges < recommendedHinges,
      });
    }

    if (part.hardwareTag === 'drawer_front') {
      const recommendedLoadKg: 30 | 40 | 60 =
        part.width >= 900 ? 60 : part.width >= 650 ? 40 : 30;
      drawerRecommendations.push({
        partId: part.id,
        partName: part.name,
        widthMm: part.width,
        recommendedLoadKg,
        note:
          recommendedLoadKg === 60
            ? 'Szeroka szuflada ≥900 mm — wymagane prowadnice 60 kg (np. Blum Movento 60 / Tandembox)'
            : recommendedLoadKg === 40
              ? 'Zalecane prowadnice o udźwigu 40 kg (talerze / garnki)'
              : 'Standardowe prowadnice 30 kg wystarczające',
      });
    }
  }

  return {
    totalWeightKg: Math.round((boardsWeightKg + appliancesWeightKg) * 10) / 10,
    boardsWeightKg: Math.round(boardsWeightKg * 10) / 10,
    appliancesWeightKg: Math.round(appliancesWeightKg * 10) / 10,
    heaviestPart,
    partWeights,
    flapRecommendations,
    hingeRecommendations,
    drawerRecommendations,
  };
}



