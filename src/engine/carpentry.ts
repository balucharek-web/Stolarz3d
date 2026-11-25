import * as THREE from 'three';
import {
  SCREW_MAP,
  type Fastener,
  type FurniturePart,
  type HandleSide,
} from '../types/furniture';

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
  direction: 'up' | 'down' | 'left' | 'right';
  distanceMm: number;
  startWorld: [number, number, number];
  endWorld: [number, number, number];
  targetName: string;
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
    const ba = boxes[i];

    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
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
    if (nb.id === host.id || nb.kind === 'door' || nb.materialId === 'glass_clear') continue;
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
  const tol = 5;

  const partMap = new Map<string, FurniturePart>();
  const boxMap = new Map<string, WorldBox>();
  for (const p of parts) {
    partMap.set(p.id, p);
    boxMap.set(p.id, getPartWorldBox(p));
  }

  const screwOrder: Fastener['type'][] = [
    preferredScrewType,
    ...(['wood_4x45', 'confirmat_7x50', 'minifix_15', 'dowel_8x35', 'bolt_m8'] as Fastener['type'][]).filter(
      (t) => t !== preferredScrewType
    ),
  ];

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
    if (thickA <= 48) candidates.push({ host: a, other: b, bHost: ba, bOther: bb, thick: thickA });
    if (thickB <= 48) candidates.push({ host: b, other: a, bHost: bb, bOther: ba, thick: thickB });
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
      const normalVec = new THREE.Vector3(...normalTuple);

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

        for (const st of screwOrder) {
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
          if (audit && audit.status === 'ok' && audit.targetPartName === other.name) {
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
    if (a.kind === 'door' || a.materialId === 'glass_clear') continue;
    const aAligned =
      Math.abs(a.rotation[0] % 90) < 1 &&
      Math.abs(a.rotation[1] % 90) < 1 &&
      Math.abs(a.rotation[2] % 90) < 1;
    if (!aAligned) continue;
    const ba = boxMap.get(a.id)!;

    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      if (b.kind === 'door' || b.materialId === 'glass_clear') continue;
      const bAligned =
        Math.abs(b.rotation[0] % 90) < 1 &&
        Math.abs(b.rotation[1] % 90) < 1 &&
        Math.abs(b.rotation[2] % 90) < 1;
      if (!bAligned) continue;
      const bb = boxMap.get(b.id)!;

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
 * to the nearest neighboring surfaces (up, down/floor, left, right).
 */
export function computePartClearances(
  selectedPart: FurniturePart,
  allParts: FurniturePart[]
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

  // DOWN (-Y): start with floor Y = 0
  let downDist = sb.minY;
  let downTarget = 'Podłoga';
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
    });
  }

  // UP (+Y)
  let upDist = Infinity;
  let upTarget = '';
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
    });
  }

  // LEFT (-X)
  let leftDist = Infinity;
  let leftTarget = '';
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
      }
    }
  }
  if (leftDist > 1 && leftDist <= 3000) {
    guides.push({
      direction: 'left',
      distanceMm: Math.round(leftDist),
      startWorld: [sb.minX, cy, cz],
      endWorld: [sb.minX - leftDist, cy, cz],
      targetName: leftTarget,
    });
  }

  // RIGHT (+X)
  let rightDist = Infinity;
  let rightTarget = '';
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
      }
    }
  }
  if (rightDist > 1 && rightDist <= 3000) {
    guides.push({
      direction: 'right',
      distanceMm: Math.round(rightDist),
      startWorld: [sb.maxX, cy, cz],
      endWorld: [sb.maxX + rightDist, cy, cz],
      targetName: rightTarget,
    });
  }

  return guides;
}

/**
 * Exact saw/miter angles for sloped boards and custom 2D polygon corners.
 */
export function computeSawCutAngles(part: FurniturePart): SawCutAngle[] {
  const angles: SawCutAngle[] = [];

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

