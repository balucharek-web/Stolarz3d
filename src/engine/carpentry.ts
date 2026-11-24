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

  if (part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3) {
    for (const [px, py] of part.customPolygon) {
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

  if (part.kind === 'custom' && part.customPolygon && part.customPolygon.length >= 3) {
    return isPointInPolygon2D(local.x, local.y, part.customPolygon, toleranceMm);
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
    const host = partMap.get(f.partId);
    if (!host) continue;

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
      result.set(f.id, {
        fastenerId: f.id,
        status: 'air',
        reason: tipInsideAny
          ? 'Wkręt siedzi tylko w jednej płycie (nie łapie sąsiedniego elementu).'
          : 'Wkręt w powietrzu — nie łapie sąsiedniej płyty i wystaje z tyłu!',
      });
    } else if (!tipInsideAny) {
      result.set(f.id, {
        fastenerId: f.id,
        status: 'through',
        targetPartName: bestTarget.name,
        embedDepthMm: bestEmbedMm,
        reason: `Przelot! ${meta.shortName} przechodzi na wylot przez „${bestTarget.name}”.`,
      });
    } else {
      result.set(f.id, {
        fastenerId: f.id,
        status: 'ok',
        targetPartName: bestTarget.name,
        embedDepthMm: bestEmbedMm,
        reason: `OK — wkręcony w „${bestTarget.name}” na ok. ${bestEmbedMm} mm.`,
      });
    }
  }

  return result;
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
