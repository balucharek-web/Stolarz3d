import * as THREE from 'three';
import type {
  RoomConfig,
  RoomFloorFinish,
  RoomOpening,
  RoomWallObstacle,
} from '../types/furniture';
import {
  FLOOR_FINISH_CATALOG,
  WALL_FINISH_CATALOG,
  computeFlatCeilingPolygon2D,
  computeMiteredWallOuterCorners,
  computeSlopeSurfacePolygons2D,
  computeWallSegments,
  getEffectiveRoomWallSlopes,
  getRoomCeilingHeightAtXZ,
  getRoomPolygonPoints,
  getRoomStyle,
  getWallTopProfileMm,
  type Point2DMm,
  type ResolvedRoomSlope,
  type WallSegment,
} from './roomGeometry';
import { getRoomObstacleWorldBox } from './carpentry';
import { buildSanitaryToilet3D, isSanitaryToiletType } from './sanitary3D';

export interface ArchitecturalRoom3DOptions {
  selectedWallIndex?: number | null;
  selectedSlopeWallIndex?: number | null;
  selectedLegacySlope?: boolean;
  roomEditMode?: boolean;
}

const MM_TO_M = 0.001;

// Cached procedural floor PBR textures keyed by finish so room redraws never leak GPU memory
const floorTextureCache = new Map<RoomFloorFinish, THREE.CanvasTexture>();

function getFloorTexture(finish: RoomFloorFinish): THREE.CanvasTexture {
  const cached = floorTextureCache.get(finish);
  if (cached) return cached;

  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const meta = FLOOR_FINISH_CATALOG[finish];

  ctx.fillStyle = meta.swatch;
  ctx.fillRect(0, 0, size, size);

  if (finish === 'oak_parquet' || finish === 'dark_walnut') {
    const plankCount = 8;
    const plankH = size / plankCount;
    for (let i = 0; i < plankCount; i++) {
      const y = i * plankH;
      const shade = ((i * 37) % 14) - 7;
      ctx.fillStyle = adjustHex(meta.swatch, shade);
      ctx.fillRect(0, y, size, plankH);

      // Subtle wood grain streaks
      ctx.strokeStyle = adjustHex(meta.accent, -8);
      ctx.globalAlpha = 0.22;
      for (let g = 0; g < 6; g++) {
        ctx.beginPath();
        const gy = y + (g + 0.5) * (plankH / 6);
        ctx.moveTo(0, gy);
        ctx.bezierCurveTo(
          size * 0.33,
          gy + ((i + g) % 2 === 0 ? 3 : -3),
          size * 0.66,
          gy + ((i + g) % 2 === 0 ? -2 : 2),
          size,
          gy
        );
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      // Plank seams
      ctx.fillStyle = adjustHex(meta.accent, -24);
      ctx.fillRect(0, y, size, 1.5);
      const staggerX = ((i * 193) % size);
      ctx.fillRect(staggerX, y, 1.5, plankH);
    }
  } else if (finish === 'herringbone_oak') {
    const step = 64;
    ctx.strokeStyle = adjustHex(meta.accent, -22);
    ctx.lineWidth = 1.5;
    for (let y = -size; y < size * 2; y += step) {
      for (let x = -size; x < size * 2; x += step) {
        const even = ((Math.floor(x / step) + Math.floor(y / step)) & 1) === 0;
        ctx.fillStyle = adjustHex(meta.swatch, even ? 6 : -6);
        ctx.beginPath();
        if (even) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + step, y + step * 0.5);
          ctx.lineTo(x + step, y + step * 1.5);
          ctx.lineTo(x, y + step);
        } else {
          ctx.moveTo(x, y + step * 0.5);
          ctx.lineTo(x + step, y);
          ctx.lineTo(x + step, y + step);
          ctx.lineTo(x, y + step * 1.5);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  } else if (finish === 'ceramic_tile') {
    const tiles = 2;
    const tileS = size / tiles;
    for (let row = 0; row < tiles; row++) {
      for (let col = 0; col < tiles; col++) {
        ctx.fillStyle = adjustHex(meta.swatch, (row + col) % 2 === 0 ? 3 : -3);
        ctx.fillRect(col * tileS + 2, row * tileS + 2, tileS - 4, tileS - 4);
      }
    }
    ctx.strokeStyle = '#9CA0A6';
    ctx.lineWidth = 3;
    for (let i = 0; i <= tiles; i++) {
      const p = i * tileS;
      ctx.beginPath();
      ctx.moveTo(p, 0);
      ctx.lineTo(p, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, p);
      ctx.lineTo(size, p);
      ctx.stroke();
    }
  } else {
    // Concrete screed: subtle troweled mineral mottling
    for (let i = 0; i < 420; i++) {
      const rx = ((i * 73) % 512);
      const ry = ((i * 151) % 512);
      const rad = 10 + ((i * 19) % 36);
      ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.035)' : 'rgba(20,24,30,0.04)';
      ctx.beginPath();
      ctx.arc(rx, ry, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  // Repeat 1 tile per 1.2 meters for architectural scale
  tex.repeat.set(0.85, 0.85);
  tex.needsUpdate = true;
  floorTextureCache.set(finish, tex);
  return tex;
}

function adjustHex(hex: string, delta: number): string {
  const clean = hex.replace('#', '');
  const n = parseInt(clean, 16);
  const r = Math.max(0, Math.min(255, ((n >> 16) & 255) + delta));
  const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + delta));
  const b = Math.max(0, Math.min(255, (n & 255) + delta));
  return `rgb(${r},${g},${b})`;
}

/**
 * Populates `roomRoot` with the complete 3D architectural room:
 * textured polygon floor, mitered roof-clipped walls with real cut-out doors/windows,
 * casings, glazing, sills, baseboards, wall obstacles, polygon-clipped ceiling & roof slopes.
 */
export function buildArchitecturalRoom3D(
  roomRoot: THREE.Group,
  room: RoomConfig,
  options?: ArchitecturalRoom3DOptions
): void {
  const pts = getRoomPolygonPoints(room);
  const segments = computeWallSegments(pts);
  if (segments.length < 3) return;

  const style = getRoomStyle(room);
  const wallMeta = WALL_FINISH_CATALOG[style.wallFinish];
  const floorMeta = FLOOR_FINISH_CATALOG[style.floorFinish];
  const hM = room.heightMm * MM_TO_M;
  const wallThickMm = Math.max(50, Math.min(400, room.wallThicknessMm ?? 120));
  const wallThickM = wallThickMm * MM_TO_M;
  const hiddenSet = new Set<number>(room.hiddenWallIndices ?? []);

  // Legacy rectangular wall toggle compatibility when polygon is untouched 4-wall rect
  const hasCustomPolygon = Boolean(room.floorPoints && room.floorPoints.length >= 3);
  if (!hasCustomPolygon && segments.length === 4) {
    if (!room.showBackWall) hiddenSet.add(0);
    if (!room.showRightWall) hiddenSet.add(1);
    hiddenSet.add(2); // legacy alcove had open front
    if (!room.showLeftWall) hiddenSet.add(3);
  }

  const slopes = getEffectiveRoomWallSlopes(room, segments);
  const miterOuterCorners = computeMiteredWallOuterCorners(segments, wallThickMm);

  // 1. ARCHITECTURAL POLYGON FLOOR
  const floorShape = new THREE.Shape();
  pts.forEach((v, idx) => {
    const x = v.xMm * MM_TO_M;
    const y = -v.zMm * MM_TO_M;
    if (idx === 0) floorShape.moveTo(x, y);
    else floorShape.lineTo(x, y);
  });
  floorShape.closePath();

  const floorGeo = new THREE.ShapeGeometry(floorShape);
  const floorMat = new THREE.MeshStandardMaterial({
    map: getFloorTexture(style.floorFinish),
    roughness: floorMeta.roughness,
    metalness: 0.02,
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.rotation.x = -Math.PI / 2;
  floorMesh.position.y = 0.0015;
  floorMesh.receiveShadow = true;
  floorMesh.userData.disposeMaterial = true;
  roomRoot.add(floorMesh);

  // Subtle architectural perimeter outline on floor
  const outlinePts = pts.map((v) => new THREE.Vector3(v.xMm * MM_TO_M, 0.004, v.zMm * MM_TO_M));
  outlinePts.push(outlinePts[0].clone());
  const outlineGeo = new THREE.BufferGeometry().setFromPoints(outlinePts);
  const outlineMat = new THREE.LineBasicMaterial({
    color: options?.roomEditMode
      ? '#F59E0B'
      : style.wallCutawayMode === 'translucent'
        ? '#0EA5E9'
        : '#64748B',
    transparent: true,
    opacity: options?.roomEditMode ? 0.9 : style.wallCutawayMode === 'translucent' ? 0.85 : 0.45,
  });
  const outlineLine = new THREE.Line(outlineGeo, outlineMat);
  outlineLine.userData.disposeMaterial = true;
  roomRoot.add(outlineLine);

  // 2. POLYGON WALLS (MITERED CORNERS + CLIPPED UNDER ROOF SLOPES + OPENINGS + OBSTACLES)
  const openings = room.openings ?? [];
  const wallObstacles = room.wallObstacles ?? [];
  const nSegs = segments.length;

  for (const seg of segments) {
    const isSelectedWall = options?.selectedWallIndex === seg.index;
    const isHidden = hiddenSet.has(seg.index);
    // If hidden in normal mode, skip; if in roomEditMode, show faint clickable ghost curb so user can unhide it in 3D!
    if (isHidden && !options?.roomEditMode) continue;

    const wallOpenings = isHidden ? [] : openings.filter((o) => o.wallIndex === seg.index);
    const segObstacles = isHidden ? [] : wallObstacles.filter((o) => o.wallIndex === seg.index);
    const outerStart = miterOuterCorners[seg.index] ?? {
      xMm: seg.start.xMm + seg.outNx * wallThickMm,
      zMm: seg.start.zMm + seg.outNz * wallThickMm,
    };
    const outerEnd = miterOuterCorners[(seg.index + 1) % nSegs] ?? {
      xMm: seg.end.xMm + seg.outNx * wallThickMm,
      zMm: seg.end.zMm + seg.outNz * wallThickMm,
    };

    buildWallSegment3D(
      roomRoot,
      room,
      seg,
      slopes,
      outerStart,
      outerEnd,
      wallThickM,
      wallMeta.color,
      wallMeta.roughness,
      isHidden ? 'translucent' : style.wallCutawayMode,
      style.showBaseboards && !isHidden,
      style.baseboardHeightMm * MM_TO_M,
      wallOpenings,
      segObstacles,
      isSelectedWall,
      isHidden,
      Boolean(options?.roomEditMode)
    );
  }

  // 3. POLYGON-CLIPPED FLAT CEILING PLATEAU (trimmed around all active roof slopes!)
  if (room.showCeiling) {
    const flatPoly =
      slopes.length > 0
        ? computeFlatCeilingPolygon2D(room, slopes)
        : pts.map((v) => ({ xMm: v.xMm, zMm: v.zMm }));
    if (flatPoly.length >= 3) {
      const flatShape = new THREE.Shape();
      flatPoly.forEach((v, idx) => {
        const x = v.xMm * MM_TO_M;
        const y = -v.zMm * MM_TO_M;
        if (idx === 0) flatShape.moveTo(x, y);
        else flatShape.lineTo(x, y);
      });
      flatShape.closePath();

      const ceilGeo = new THREE.ShapeGeometry(flatShape);
      const ceilMat = new THREE.MeshStandardMaterial({
        color: '#F8FAFC',
        roughness: 0.94,
        metalness: 0,
        transparent: style.wallCutawayMode !== 'solid',
        opacity: style.wallCutawayMode === 'solid' ? 1 : 0.22,
        side: THREE.FrontSide, // Looking down from above you see THROUGH ceiling into the room!
        depthWrite: style.wallCutawayMode === 'solid',
      });
      const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
      ceilMesh.rotation.x = Math.PI / 2;
      ceilMesh.position.y = hM;
      ceilMesh.userData.disposeMaterial = true;
      roomRoot.add(ceilMesh);
    }
  }

  // 4. TRUE POLYGON-CLIPPED SLOPED ATTIC ROOF PLANES (zero wall bleed-through on L/U/custom rooms!)
  if (slopes.length > 0) {
    const slopeSurfaces = computeSlopeSurfacePolygons2D(room, slopes);
    for (const { slope, polygon } of slopeSurfaces) {
      const isSelectedSlope = slope.isLegacy
        ? Boolean(options?.selectedLegacySlope) ||
          (slope.wallIndex !== null && options?.selectedSlopeWallIndex === slope.wallIndex)
        : options?.selectedSlopeWallIndex === slope.wallIndex;

      buildClippedSlopeSlab3D(
        roomRoot,
        room,
        slope,
        slopes,
        polygon,
        wallMeta.color,
        wallMeta.roughness,
        style.wallCutawayMode,
        isSelectedSlope,
        Boolean(options?.roomEditMode)
      );
    }
  }

  // 5. LEGACY RECTANGULAR OBSTACLES (backward compatibility for older saved projects)
  for (const obs of room.obstacles) {
    const box = getRoomObstacleWorldBox(obs, room);
    const sx = Math.max(0.02, (box.maxX - box.minX) * MM_TO_M);
    const sy = Math.max(0.02, (box.maxY - box.minY) * MM_TO_M);
    const sz = Math.max(0.02, (box.maxZ - box.minZ) * MM_TO_M);
    const cx = ((box.minX + box.maxX) / 2) * MM_TO_M;
    const cy = ((box.minY + box.maxY) / 2) * MM_TO_M;
    const cz = ((box.minZ + box.maxZ) / 2) * MM_TO_M;

    const colorMap: Record<typeof obs.type, string> = {
      radiator: '#E2E8F0',
      socket: '#FACC15',
      pipe: '#94A3B8',
      window: '#38BDF8',
    };
    const edgeColorMap: Record<typeof obs.type, string> = {
      radiator: '#475569',
      socket: '#CA8A04',
      pipe: '#334155',
      window: '#0284C7',
    };

    const geo =
      obs.type === 'pipe'
        ? new THREE.CylinderGeometry(Math.min(sx, sz) / 2, Math.min(sx, sz) / 2, sy, 18)
        : new THREE.BoxGeometry(sx, sy, sz);
    const mat = new THREE.MeshStandardMaterial({
      color: colorMap[obs.type],
      roughness: obs.type === 'window' ? 0.15 : 0.45,
      metalness: obs.type === 'pipe' || obs.type === 'radiator' ? 0.45 : 0.05,
      transparent: obs.type === 'window',
      opacity: obs.type === 'window' ? 0.35 : 0.92,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(cx, cy, cz);
    mesh.userData.disposeMaterial = true;
    roomRoot.add(mesh);

    const edgesGeo = new THREE.EdgesGeometry(geo, 24);
    const edgesMat = new THREE.LineBasicMaterial({ color: edgeColorMap[obs.type] });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.position.copy(mesh.position);
    edges.userData.disposeMaterial = true;
    roomRoot.add(edges);
  }
}

/**
 * Helper to append a triangle (v0, v1, v2) into a raw position float array.
 */
function pushTri(
  out: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number]
): void {
  out.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
}

function pushQuad(
  out: number[],
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number]
): void {
  pushTri(out, a, b, c);
  pushTri(out, a, c, d);
}

/**
 * Builds a true polygon-clipped 3D attic roof slope slab that conforms strictly
 * to ANY L-shape, U-shape, chamfered, or arbitrary room polygon with zero overhang.
 */
function buildClippedSlopeSlab3D(
  roomRoot: THREE.Group,
  room: RoomConfig,
  slope: ResolvedRoomSlope,
  allSlopes: ResolvedRoomSlope[],
  polygon: Point2DMm[],
  wallColor: string,
  wallRoughness: number,
  cutawayMode: 'smart_cutaway' | 'solid' | 'translucent',
  isSelected: boolean,
  roomEditMode: boolean
): void {
  if (polygon.length < 3) return;

  const contour2D = polygon.map((p) => new THREE.Vector2(p.xMm * MM_TO_M, p.zMm * MM_TO_M));
  const tris = THREE.ShapeUtils.triangulateShape(contour2D, []);
  if (tris.length === 0) return;

  // Compute exact 3D bottom points on the roof underside plane
  const rise = Math.max(10, slope.ceilingHeightMm - slope.kneeWallHeightMm);
  const run = Math.max(100, slope.slopeDepthMm);
  const upNormal = new THREE.Vector3(-slope.inNx * rise, run, -slope.inNz * rise).normalize();
  const slabThickM = 0.042;

  const botPts: Array<[number, number, number]> = polygon.map((p) => [
    p.xMm * MM_TO_M,
    getRoomCeilingHeightAtXZ(p.xMm, p.zMm, room, allSlopes) * MM_TO_M,
    p.zMm * MM_TO_M,
  ]);
  const topPts: Array<[number, number, number]> = botPts.map((p) => [
    p[0] + upNormal.x * slabThickM,
    p[1] + upNormal.y * slabThickM,
    p[2] + upNormal.z * slabThickM,
  ]);

  const underPos: number[] = [];
  const fullPos: number[] = [];

  for (const [i0, i1, i2] of tris) {
    const a = botPts[i0];
    const b = botPts[i1];
    const c = botPts[i2];
    // Verify triangle normal Y sign so underside points DOWN (y < 0) into the room interior
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const abz = b[2] - a[2];
    const acx = c[0] - a[0];
    const acy = c[1] - a[1];
    const acz = c[2] - a[2];
    const ny = abz * acx - abx * acz;

    if (ny < 0) {
      pushTri(underPos, a, b, c);
      pushTri(fullPos, a, b, c);
      pushTri(fullPos, topPts[i0], topPts[i2], topPts[i1]);
    } else {
      pushTri(underPos, a, c, b);
      pushTri(fullPos, a, c, b);
      pushTri(fullPos, topPts[i0], topPts[i1], topPts[i2]);
    }
  }

  // Add perimeter rim quads to the thick slab
  const n = polygon.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    pushQuad(fullPos, botPts[i], botPts[j], topPts[j], topPts[i]);
  }

  const isTranslucent = cutawayMode === 'translucent';
  const isSmartCutaway = cutawayMode === 'smart_cutaway';

  // In smart_cutaway mode (when not highlighted), use underside FrontSide so looking down from above
  // lets you see cleanly into the room, while looking from inside shows a solid realistic roof slope!
  const useCutawayPlane = isSmartCutaway && !isSelected && !roomEditMode;
  const geo = new THREE.BufferGeometry();
  geo.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(useCutawayPlane ? underPos : fullPos, 3)
  );
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    color: isSelected
      ? '#F59E0B'
      : isTranslucent
        ? '#F59E0B'
        : wallColor,
    emissive: isSelected ? '#B45309' : '#000000',
    emissiveIntensity: isSelected ? 0.35 : 0,
    roughness: isTranslucent || isSelected ? 0.72 : Math.min(0.95, wallRoughness + 0.04),
    metalness: 0.02,
    transparent: isTranslucent || (isSmartCutaway && roomEditMode) || isSelected,
    opacity: isSelected
      ? 0.48
      : isTranslucent
        ? 0.28
        : isSmartCutaway && roomEditMode
          ? 0.34
          : 1,
    side: useCutawayPlane ? THREE.FrontSide : THREE.DoubleSide,
    depthWrite: !isTranslucent && !isSelected && !(isSmartCutaway && roomEditMode),
  });

  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = !isTranslucent;
  mesh.userData.disposeMaterial = true;
  mesh.userData.raycastKind = 'room_slope';
  mesh.userData.slopeWallIndex = slope.wallIndex;
  mesh.userData.slopeId = slope.id;
  mesh.userData.isLegacySlope = slope.isLegacy;
  roomRoot.add(mesh);

  // Crisp perimeter outline along the exact clipped roof boundary (eave, gable rakes & ridge)
  const loopPts = botPts.map((p) => new THREE.Vector3(p[0], p[1] - 0.002, p[2]));
  loopPts.push(loopPts[0].clone());
  const loopGeo = new THREE.BufferGeometry().setFromPoints(loopPts);
  const loopMat = new THREE.LineBasicMaterial({
    color: isSelected ? '#FBBF24' : isTranslucent ? '#D97706' : '#64748B',
    transparent: true,
    opacity: isSelected ? 1 : isTranslucent ? 0.92 : 0.52,
  });
  const loopLine = new THREE.Line(loopGeo, loopMat);
  loopLine.userData.disposeMaterial = true;
  roomRoot.add(loopLine);
}

/**
 * Evaluates wall local top height (m) at horizontal coordinate `uM` from `profileM`.
 */
function sampleWallProfileHeightM(
  profileM: Array<{ uM: number; yM: number }>,
  uM: number
): number {
  if (profileM.length === 0) return 2.6;
  if (uM <= profileM[0].uM) return profileM[0].yM;
  for (let i = 0; i < profileM.length - 1; i++) {
    const a = profileM[i];
    const b = profileM[i + 1];
    if (uM <= b.uM) {
      const span = Math.max(1e-6, b.uM - a.uM);
      const t = (uM - a.uM) / span;
      return a.yM + t * (b.yM - a.yM);
    }
  }
  return profileM[profileM.length - 1].yM;
}

/**
 * Builds a single clean watertight mitered 3D wall geometry (inner face + mitered outer face
 * + sloped/flat top cap + bottom + miter end caps + opening reveal jambs) with ZERO corner overlaps!
 */
function buildMiteredWallGeometry(
  innerShape: THREE.Shape,
  outerShape: THREE.Shape,
  innerProfileM: Array<{ uM: number; yM: number }>,
  outerProfileM: Array<{ uM: number; yM: number }>,
  validOpenings: Array<{ u0: number; u1: number; y0: number; y1: number }>,
  wallThickM: number
): THREE.BufferGeometry {
  const pos: number[] = [];

  const appendShapeFace = (shape: THREE.Shape, z: number, flipWinding: boolean) => {
    const g = new THREE.ShapeGeometry(shape);
    const nonIdx = g.index ? g.toNonIndexed() : g;
    const pAttr = nonIdx.getAttribute('position');
    for (let i = 0; i < pAttr.count; i += 3) {
      const a: [number, number, number] = [pAttr.getX(i), pAttr.getY(i), z];
      const b: [number, number, number] = [pAttr.getX(i + 1), pAttr.getY(i + 1), z];
      const c: [number, number, number] = [pAttr.getX(i + 2), pAttr.getY(i + 2), z];
      if (flipWinding) pushTri(pos, a, c, b);
      else pushTri(pos, a, b, c);
    }
    if (nonIdx !== g) nonIdx.dispose();
    g.dispose();
  };

  // 1. Inner face (+Z) and Mitered Outer face (-Z)
  appendShapeFace(innerShape, 0, false);
  appendShapeFace(outerShape, -wallThickM, true);

  // 2. Top cap strip following exact roof-clipped profile
  const kMax = Math.min(innerProfileM.length, outerProfileM.length);
  for (let i = 0; i < kMax - 1; i++) {
    const iA = innerProfileM[i];
    const iB = innerProfileM[i + 1];
    const oA = outerProfileM[i];
    const oB = outerProfileM[i + 1];
    pushQuad(
      pos,
      [iA.uM, iA.yM, 0],
      [iB.uM, iB.yM, 0],
      [oB.uM, oB.yM, -wallThickM],
      [oA.uM, oA.yM, -wallThickM]
    );
  }

  // 3. Bottom floor contact quad
  const iStart = innerProfileM[0];
  const iEnd = innerProfileM[innerProfileM.length - 1];
  const oStart = outerProfileM[0];
  const oEnd = outerProfileM[outerProfileM.length - 1];
  pushQuad(
    pos,
    [iStart.uM, 0, 0],
    [oStart.uM, 0, -wallThickM],
    [oEnd.uM, 0, -wallThickM],
    [iEnd.uM, 0, 0]
  );

  // 4. Start & End miter end-caps (watertight when a neighbor wall is hidden)
  pushQuad(
    pos,
    [oStart.uM, 0, -wallThickM],
    [iStart.uM, 0, 0],
    [iStart.uM, iStart.yM, 0],
    [oStart.uM, oStart.yM, -wallThickM]
  );
  pushQuad(
    pos,
    [iEnd.uM, 0, 0],
    [oEnd.uM, 0, -wallThickM],
    [oEnd.uM, oEnd.yM, -wallThickM],
    [iEnd.uM, iEnd.yM, 0]
  );

  // 5. Window & door opening reveal jambs (inner wall thickness lining)
  for (const op of validOpenings) {
    const holeY0 = op.y0 <= 0.002 ? 0.004 : op.y0;
    // Left jamb
    pushQuad(
      pos,
      [op.u0, holeY0, 0],
      [op.u0, op.y1, 0],
      [op.u0, op.y1, -wallThickM],
      [op.u0, holeY0, -wallThickM]
    );
    // Right jamb
    pushQuad(
      pos,
      [op.u1, holeY0, -wallThickM],
      [op.u1, op.y1, -wallThickM],
      [op.u1, op.y1, 0],
      [op.u1, holeY0, 0]
    );
    // Top lintel soffit
    pushQuad(
      pos,
      [op.u0, op.y1, 0],
      [op.u1, op.y1, 0],
      [op.u1, op.y1, -wallThickM],
      [op.u0, op.y1, -wallThickM]
    );
    // Bottom sill reveal
    if (op.y0 > 0.002) {
      pushQuad(
        pos,
        [op.u0, holeY0, -wallThickM],
        [op.u1, holeY0, -wallThickM],
        [op.u1, holeY0, 0],
        [op.u0, holeY0, 0]
      );
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}

function buildWallSegment3D(
  roomRoot: THREE.Group,
  room: RoomConfig,
  seg: WallSegment,
  slopes: ResolvedRoomSlope[],
  outerStartMm: Point2DMm,
  outerEndMm: Point2DMm,
  wallThickM: number,
  wallColor: string,
  wallRoughness: number,
  cutawayMode: 'smart_cutaway' | 'solid' | 'translucent',
  showBaseboards: boolean,
  baseboardHM: number,
  openings: RoomOpening[],
  obstacles: RoomWallObstacle[],
  isSelectedWall: boolean,
  isHiddenGhost: boolean,
  roomEditMode: boolean
): void {
  const lenM = seg.lengthMm * MM_TO_M;
  if (lenM < 0.05) return;

  // Wall local group:
  // +X = along wall from start -> end
  // +Y = up
  // +Z = inward into the room interior
  // -Z = outward wall thickness
  const wallGroup = new THREE.Group();
  wallGroup.position.set(seg.start.xMm * MM_TO_M, 0, seg.start.zMm * MM_TO_M);
  wallGroup.rotation.y = -Math.atan2(seg.tz, seg.tx);

  // Exact roof-clipped top profile along this wall (forms authentic sloped gable & knee walls!)
  const innerProfileM = getWallTopProfileMm(seg, room, slopes).map((p) => ({
    uM: p.uMm * MM_TO_M,
    yM: Math.max(0.15, p.yMm * MM_TO_M),
  }));

  // Compute mitered outer face start/end U coordinates so corners join cleanly at 45° miters
  const uOuterStartM =
    ((outerStartMm.xMm - seg.start.xMm) * seg.tx +
      (outerStartMm.zMm - seg.start.zMm) * seg.tz) *
    MM_TO_M;
  const uOuterEndM =
    ((outerEndMm.xMm - seg.start.xMm) * seg.tx +
      (outerEndMm.zMm - seg.start.zMm) * seg.tz) *
    MM_TO_M;

  // Guard degenerate ultra-short outer segments on tiny reflex walls
  const safeOuterStartM = uOuterEndM - uOuterStartM >= 0.04 ? uOuterStartM : 0;
  const safeOuterEndM = uOuterEndM - uOuterStartM >= 0.04 ? uOuterEndM : lenM;

  const outerProfileM = innerProfileM.map((p, idx) => {
    if (idx === 0) {
      return {
        uM: safeOuterStartM,
        yM: Math.max(
          0.15,
          getRoomCeilingHeightAtXZ(outerStartMm.xMm, outerStartMm.zMm, room, slopes) * MM_TO_M
        ),
      };
    }
    if (idx === innerProfileM.length - 1) {
      return {
        uM: safeOuterEndM,
        yM: Math.max(
          0.15,
          getRoomCeilingHeightAtXZ(outerEndMm.xMm, outerEndMm.zMm, room, slopes) * MM_TO_M
        ),
      };
    }
    const clampedU = Math.max(safeOuterStartM + 0.01, Math.min(safeOuterEndM - 0.01, p.uM));
    const wx = seg.start.xMm + seg.tx * (clampedU / MM_TO_M) + seg.outNx * (wallThickM / MM_TO_M);
    const wz = seg.start.zMm + seg.tz * (clampedU / MM_TO_M) + seg.outNz * (wallThickM / MM_TO_M);
    return {
      uM: clampedU,
      yM: Math.max(0.15, getRoomCeilingHeightAtXZ(wx, wz, room, slopes) * MM_TO_M),
    };
  });

  // Build inner & outer elevation shapes with clipped roof silhouette
  const buildProfileShape = (profile: Array<{ uM: number; yM: number }>) => {
    const sh = new THREE.Shape();
    sh.moveTo(profile[0].uM, 0);
    sh.lineTo(profile[profile.length - 1].uM, 0);
    for (let i = profile.length - 1; i >= 0; i--) {
      sh.lineTo(profile[i].uM, profile[i].yM);
    }
    sh.closePath();
    return sh;
  };

  const innerWallShape = buildProfileShape(innerProfileM);
  const outerWallShape = buildProfileShape(outerProfileM);

  const validOpenings: Array<{
    op: RoomOpening;
    u0: number;
    u1: number;
    y0: number;
    y1: number;
  }> = [];

  const minHoleU = Math.max(0.02, safeOuterStartM + 0.02);
  const maxHoleU = Math.min(lenM - 0.02, safeOuterEndM - 0.02);

  for (const op of openings) {
    const u0 = Math.max(minHoleU, Math.min(maxHoleU - 0.14, op.offsetMm * MM_TO_M));
    const u1 = Math.min(maxHoleU, u0 + op.widthMm * MM_TO_M);
    // Clamp opening top strictly beneath the lowest point of the sloped ceiling across [u0, u1]!
    const roofAtU0 = sampleWallProfileHeightM(innerProfileM, u0);
    const roofAtU1 = sampleWallProfileHeightM(innerProfileM, u1);
    const roofAtMid = sampleWallProfileHeightM(innerProfileM, (u0 + u1) / 2);
    const maxWallHAtOpening = Math.min(roofAtU0, roofAtU1, roofAtMid);

    const y0 = Math.max(0, Math.min(maxWallHAtOpening - 0.18, op.sillHeightMm * MM_TO_M));
    const y1 = Math.min(maxWallHAtOpening - 0.04, y0 + op.heightMm * MM_TO_M);
    if (u1 - u0 < 0.12 || y1 - y0 < 0.15) continue;

    // For floor-level openings (sill === 0), nudge hole bottom slightly above 0 so Shape hole stays strictly interior
    const holeY0 = y0 <= 0.002 ? 0.004 : y0;
    const makeHole = () => {
      const hole = new THREE.Path();
      hole.moveTo(u0, holeY0);
      hole.lineTo(u0, y1);
      hole.lineTo(u1, y1);
      hole.lineTo(u1, holeY0);
      hole.closePath();
      return hole;
    };
    innerWallShape.holes.push(makeHole());
    outerWallShape.holes.push(makeHole());

    validOpenings.push({ op, u0, u1, y0, y1 });
  }

  const tagWallMesh = (mesh: THREE.Mesh) => {
    mesh.userData.disposeMaterial = true;
    mesh.userData.raycastKind = 'room_wall';
    mesh.userData.wallIndex = seg.index;
  };

  if (cutawayMode === 'smart_cutaway') {
    // Industry-standard architectural cutaway (PRO100 / IKEA / Planner 5D):
    // Interior wall plane uses FrontSide (+Z facing INTO the room), so walls between the
    // camera and furniture become cleanly transparent/invisible automatically, while walls
    // behind the furniture render as 100% solid architectural plaster with shadows!
    const innerGeo = new THREE.ShapeGeometry(innerWallShape);
    const innerMat = new THREE.MeshStandardMaterial({
      color: isSelectedWall ? '#FDE68A' : wallColor,
      emissive: isSelectedWall ? '#D97706' : '#000000',
      emissiveIntensity: isSelectedWall ? 0.28 : 0,
      roughness: wallRoughness,
      metalness: 0.02,
      side: roomEditMode && isSelectedWall ? THREE.DoubleSide : THREE.FrontSide,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.receiveShadow = true;
    tagWallMesh(innerMesh);
    wallGroup.add(innerMesh);

    // Mitered low floor curb so room footprint stays crisp and clickable even from behind cutaway walls
    const curbPos: number[] = [];
    const curbH = 0.048;
    pushQuad(
      curbPos,
      [0, curbH, 0],
      [lenM, curbH, 0],
      [safeOuterEndM, curbH, -wallThickM],
      [safeOuterStartM, curbH, -wallThickM]
    );
    pushQuad(
      curbPos,
      [safeOuterEndM, 0, -wallThickM],
      [safeOuterStartM, 0, -wallThickM],
      [safeOuterStartM, curbH, -wallThickM],
      [safeOuterEndM, curbH, -wallThickM]
    );
    const curbGeo = new THREE.BufferGeometry();
    curbGeo.setAttribute('position', new THREE.Float32BufferAttribute(curbPos, 3));
    curbGeo.computeVertexNormals();
    const curbMat = new THREE.MeshStandardMaterial({
      color: isSelectedWall ? '#F59E0B' : '#475569',
      roughness: 0.78,
      metalness: 0.05,
      transparent: !isSelectedWall,
      opacity: isSelectedWall ? 1 : 0.58,
      side: THREE.DoubleSide,
    });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    tagWallMesh(curb);
    wallGroup.add(curb);

    // Crisp vertical corner line at wall start (trimmed to exact clipped corner height!)
    const startCornerH = innerProfileM[0]?.yM ?? 2.6;
    const cornerLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.002),
      new THREE.Vector3(0, startCornerH, 0.002),
    ]);
    const cornerLineMat = new THREE.LineBasicMaterial({
      color: isSelectedWall ? '#F59E0B' : '#94A3B8',
      transparent: true,
      opacity: isSelectedWall ? 0.95 : 0.35,
    });
    const cornerLine = new THREE.Line(cornerLineGeo, cornerLineMat);
    cornerLine.userData.disposeMaterial = true;
    wallGroup.add(cornerLine);

    if (isSelectedWall) {
      const topLinePts = innerProfileM.map((p) => new THREE.Vector3(p.uM, p.yM, 0.004));
      topLinePts.push(new THREE.Vector3(lenM, 0, 0.004));
      topLinePts.push(new THREE.Vector3(0, 0, 0.004));
      topLinePts.push(new THREE.Vector3(0, innerProfileM[0].yM, 0.004));
      const selOutlineGeo = new THREE.BufferGeometry().setFromPoints(topLinePts);
      const selOutlineMat = new THREE.LineBasicMaterial({ color: '#F59E0B' });
      const selOutline = new THREE.Line(selOutlineGeo, selOutlineMat);
      selOutline.userData.disposeMaterial = true;
      wallGroup.add(selOutline);
    }
  } else {
    const miterWallGeo = buildMiteredWallGeometry(
      innerWallShape,
      outerWallShape,
      innerProfileM,
      outerProfileM,
      validOpenings,
      wallThickM
    );
    const isTranslucent = cutawayMode === 'translucent';
    const wallMat = new THREE.MeshStandardMaterial({
      color: isSelectedWall
        ? '#F59E0B'
        : isHiddenGhost
          ? '#64748B'
          : isTranslucent
            ? '#CBD5E1'
            : wallColor,
      emissive: isSelectedWall ? '#B45309' : '#000000',
      emissiveIntensity: isSelectedWall ? 0.3 : 0,
      roughness: wallRoughness,
      metalness: 0.02,
      transparent: isTranslucent || isHiddenGhost,
      opacity: isHiddenGhost ? 0.12 : isSelectedWall && isTranslucent ? 0.42 : isTranslucent ? 0.22 : 1,
      depthWrite: !isTranslucent && !isHiddenGhost,
    });
    const wallMesh = new THREE.Mesh(miterWallGeo, wallMat);
    wallMesh.receiveShadow = !isTranslucent && !isHiddenGhost;
    wallMesh.castShadow = !isTranslucent && !isHiddenGhost;
    tagWallMesh(wallMesh);
    wallGroup.add(wallMesh);

    const edgesGeo = new THREE.EdgesGeometry(miterWallGeo, 22);
    const edgesMat = new THREE.LineBasicMaterial({
      color: isSelectedWall ? '#FBBF24' : isTranslucent ? '#64748B' : '#94A3B8',
      transparent: true,
      opacity: isSelectedWall ? 1 : isHiddenGhost ? 0.35 : isTranslucent ? 0.55 : 0.26,
    });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.userData.disposeMaterial = true;
    wallGroup.add(edges);
  }

  // 3. ARCHITECTURAL BASEBOARDS (Listwy przypodłogowe) — split cleanly around floor-level openings!
  if (showBaseboards && cutawayMode !== 'translucent' && baseboardHM > 0.02) {
    const floorBreaks = validOpenings
      .filter((vo) => vo.y0 < baseboardHM + 0.02)
      .sort((a, b) => a.u0 - b.u0);

    const spans: Array<[number, number]> = [];
    let cursor = 0;
    for (const br of floorBreaks) {
      if (br.u0 - cursor > 0.03) spans.push([cursor, br.u0]);
      cursor = Math.max(cursor, br.u1);
    }
    if (lenM - cursor > 0.03) spans.push([cursor, lenM]);

    const bbThick = 0.014;
    for (const [s0, s1] of spans) {
      const spanLen = s1 - s0;
      const bbGeo = new THREE.BoxGeometry(spanLen, baseboardHM, bbThick);
      const bbMat = new THREE.MeshStandardMaterial({
        color: '#F8FAFC',
        roughness: 0.45,
        metalness: 0.02,
      });
      const bbMesh = new THREE.Mesh(bbGeo, bbMat);
      bbMesh.position.set((s0 + s1) / 2, baseboardHM / 2, bbThick / 2);
      bbMesh.receiveShadow = true;
      bbMesh.userData.disposeMaterial = true;
      wallGroup.add(bbMesh);
    }
  }

  // 4. ARCHITECTURAL DOORS, WINDOWS, BALCONIES & ARCHES
  for (const { op, u0, u1, y0, y1 } of validOpenings) {
    const ow = u1 - u0;
    const oh = y1 - y0;
    const cx = (u0 + u1) / 2;
    const cy = (y0 + y1) / 2;
    const frameDepth = Math.min(wallThickM + 0.018, 0.16);
    const frameZ = -wallThickM / 2;

    if (op.type === 'window' || op.type === 'window_balcony') {
      const frameThick = 0.055;
      const frameColor = '#F1F5F9';
      const addFrameBar = (bx: number, by: number, bw: number, bh: number, bd = frameDepth, bz = frameZ) => {
        const g = new THREE.BoxGeometry(bw, bh, bd);
        const m = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.35, metalness: 0.05 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(bx, by, bz);
        mesh.userData.disposeMaterial = true;
        wallGroup.add(mesh);
      };

      // Outer window frame (top, bottom, left, right)
      addFrameBar(cx, y1 - frameThick / 2, ow, frameThick);
      addFrameBar(cx, y0 + frameThick / 2, ow, frameThick);
      addFrameBar(u0 + frameThick / 2, cy, frameThick, oh);
      addFrameBar(u1 - frameThick / 2, cy, frameThick, oh);

      // Center mullion for wide windows (>= 1100 mm)
      if (ow >= 1.1) {
        addFrameBar(cx, cy, 0.045, oh - frameThick * 2, frameDepth * 0.72, frameZ);
      }

      // Window sill (parapet wewnętrzny) for standard windows
      if (op.type === 'window' && y0 > 0.1) {
        const sillGeo = new THREE.BoxGeometry(ow + 0.09, 0.028, wallThickM + 0.07);
        const sillMat = new THREE.MeshStandardMaterial({
          color: '#E5E1D8',
          roughness: 0.38,
          metalness: 0.02,
        });
        const sillMesh = new THREE.Mesh(sillGeo, sillMat);
        sillMesh.position.set(cx, y0 - 0.008, -wallThickM / 2 + 0.032);
        sillMesh.receiveShadow = true;
        sillMesh.userData.disposeMaterial = true;
        wallGroup.add(sillMesh);
      }

      // Glass pane
      const glassGeo = new THREE.PlaneGeometry(
        Math.max(0.05, ow - frameThick * 2),
        Math.max(0.05, oh - frameThick * 2)
      );
      const glassMat = new THREE.MeshPhysicalMaterial({
        color: '#CFE8F7',
        roughness: 0.08,
        metalness: 0.05,
        transmission: 0.35,
        transparent: true,
        opacity: 0.38,
        side: THREE.DoubleSide,
      });
      const glassMesh = new THREE.Mesh(glassGeo, glassMat);
      glassMesh.position.set(cx, cy, frameZ);
      glassMesh.userData.disposeMaterial = true;
      wallGroup.add(glassMesh);
    } else if (op.type === 'door_single' || op.type === 'door_double') {
      const casingW = 0.065;
      const casingMatColor = '#E7E2D8';
      const addCasing = (bx: number, by: number, bw: number, bh: number) => {
        const g = new THREE.BoxGeometry(bw, bh, wallThickM + 0.024);
        const m = new THREE.MeshStandardMaterial({ color: casingMatColor, roughness: 0.48 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(bx, by, -wallThickM / 2);
        mesh.userData.disposeMaterial = true;
        wallGroup.add(mesh);
      };
      // Left, right, and top jambs
      addCasing(u0 + casingW / 2, cy, casingW, oh);
      addCasing(u1 - casingW / 2, cy, casingW, oh);
      addCasing(cx, y1 - casingW / 2, ow, casingW);

      // Slightly ajar architectural door leaf (28 deg) + floor swing arc indicator
      const isDouble = op.type === 'door_double';
      const leafW = isDouble ? (ow - casingW * 2) / 2 - 0.004 : ow - casingW * 2;
      const leafH = oh - casingW - 0.008;
      const swingDir = op.swingInward !== false ? 1 : -1;

      const buildDoorLeaf = (hingeU: number, isRightHinge: boolean) => {
        const pivot = new THREE.Group();
        pivot.position.set(hingeU, 0.006, swingDir > 0 ? 0.004 : -wallThickM - 0.004);
        const openAngleRad = THREE.MathUtils.degToRad(26);
        // Right-hand rotation around +Y:
        // If hinge is left (leaf extends +X): rotating by -angle moves tip toward +Z (inward)!
        // If hinge is right (leaf extends -X): rotating by +angle moves tip toward +Z (inward)!
        pivot.rotation.y = isRightHinge
          ? swingDir * openAngleRad
          : -swingDir * openAngleRad;

        const leafGeo = new THREE.BoxGeometry(leafW, leafH, 0.04);
        const leafMat = new THREE.MeshStandardMaterial({
          color: '#DDD5C7',
          roughness: 0.55,
          metalness: 0.02,
        });
        const leafMesh = new THREE.Mesh(leafGeo, leafMat);
        leafMesh.position.set(isRightHinge ? -leafW / 2 : leafW / 2, leafH / 2, 0);
        leafMesh.castShadow = true;
        leafMesh.receiveShadow = true;
        leafMesh.userData.disposeMaterial = true;
        pivot.add(leafMesh);

        // Door lever handle
        const handleGeo = new THREE.BoxGeometry(0.11, 0.018, 0.09);
        const handleMat = new THREE.MeshStandardMaterial({
          color: '#27272A',
          roughness: 0.3,
          metalness: 0.7,
        });
        const handleMesh = new THREE.Mesh(handleGeo, handleMat);
        handleMesh.position.set(
          isRightHinge ? -leafW + 0.09 : leafW - 0.09,
          1.02,
          0
        );
        handleMesh.userData.disposeMaterial = true;
        pivot.add(handleMesh);
        wallGroup.add(pivot);

        // Floor 90° door swing clearance arc
        const arcPts: THREE.Vector3[] = [];
        const steps = 18;
        for (let s = 0; s <= steps; s++) {
          const a = (s / steps) * (Math.PI / 2);
          const lx = isRightHinge ? hingeU - Math.cos(a) * leafW : hingeU + Math.cos(a) * leafW;
          const lz = swingDir * Math.sin(a) * leafW + (swingDir > 0 ? 0 : -wallThickM);
          arcPts.push(new THREE.Vector3(lx, 0.006, lz));
        }
        const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPts);
        const arcMat = new THREE.LineBasicMaterial({
          color: '#F59E0B',
          transparent: true,
          opacity: 0.55,
        });
        const arcLine = new THREE.Line(arcGeo, arcMat);
        arcLine.userData.disposeMaterial = true;
        wallGroup.add(arcLine);
      };

      if (isDouble) {
        buildDoorLeaf(u0 + casingW, false);
        buildDoorLeaf(u1 - casingW, true);
      } else {
        const rightHinge = op.hingeSide === 'right';
        buildDoorLeaf(rightHinge ? u1 - casingW : u0 + casingW, rightHinge);
      }
    } else if (op.type === 'arch') {
      // Clean finished portal reveal casing
      const trim = 0.032;
      const matColor = '#E2E8F0';
      const addTrim = (bx: number, by: number, bw: number, bh: number) => {
        const g = new THREE.BoxGeometry(bw, bh, wallThickM + 0.01);
        const m = new THREE.MeshStandardMaterial({ color: matColor, roughness: 0.7 });
        const mesh = new THREE.Mesh(g, m);
        mesh.position.set(bx, by, -wallThickM / 2);
        mesh.userData.disposeMaterial = true;
        wallGroup.add(mesh);
      };
      addTrim(u0 + trim / 2, cy, trim, oh);
      addTrim(u1 - trim / 2, cy, trim, oh);
      addTrim(cx, y1 - trim / 2, ow, trim);
    }
  }

  // 5. WALL-MOUNTED OBSTACLES (Radiators, 230V Sockets, Switches, Pipes, Vents)
  for (const obs of obstacles) {
    const ow = obs.widthMm * MM_TO_M;
    const oh = obs.heightMm * MM_TO_M;
    const od = obs.depthMm * MM_TO_M;
    const cx = obs.offsetMm * MM_TO_M + ow / 2;
    const cy = obs.elevationMm * MM_TO_M + oh / 2;
    const cz = od / 2;

    if (isSanitaryToiletType(obs.type)) {
      const wcGroup = buildSanitaryToilet3D(obs.type, ow, oh, od);
      wcGroup.position.set(cx, obs.elevationMm * MM_TO_M, 0);
      wallGroup.add(wcGroup);
    } else if (obs.type === 'radiator') {
      // Main panel radiator body + vertical fin ribs
      const bodyGeo = new THREE.BoxGeometry(ow, oh, od);
      const bodyMat = new THREE.MeshStandardMaterial({
        color: '#F1F5F9',
        roughness: 0.32,
        metalness: 0.25,
      });
      const body = new THREE.Mesh(bodyGeo, bodyMat);
      body.position.set(cx, cy, cz);
      body.castShadow = true;
      body.receiveShadow = true;
      body.userData.disposeMaterial = true;
      wallGroup.add(body);

      const ribs = Math.max(4, Math.min(28, Math.round(obs.widthMm / 55)));
      const ribMat = new THREE.MeshStandardMaterial({
        color: '#CBD5E1',
        roughness: 0.4,
        metalness: 0.3,
      });
      for (let r = 1; r < ribs; r++) {
        const rx = obs.offsetMm * MM_TO_M + (r / ribs) * ow;
        const ribGeo = new THREE.BoxGeometry(0.008, oh - 0.03, 0.008);
        const rib = new THREE.Mesh(ribGeo, ribMat);
        rib.position.set(rx, cy, od + 0.002);
        rib.userData.disposeMaterial = r === 1; // share material across ribs
        wallGroup.add(rib);
      }
    } else if (obs.type === 'pipe') {
      const radius = Math.max(0.025, Math.min(ow, od) / 2);
      const pipeGeo = new THREE.CylinderGeometry(radius, radius, oh, 18);
      const pipeMat = new THREE.MeshStandardMaterial({
        color: '#94A3B8',
        roughness: 0.38,
        metalness: 0.55,
      });
      const pipeMesh = new THREE.Mesh(pipeGeo, pipeMat);
      pipeMesh.position.set(cx, cy, radius);
      pipeMesh.castShadow = true;
      pipeMesh.userData.disposeMaterial = true;
      wallGroup.add(pipeMesh);
    } else {
      // Socket / Switch / Vent plate
      const color =
        obs.type === 'socket'
          ? '#FEF08A'
          : obs.type === 'switch'
            ? '#F8FAFC'
            : '#CBD5E1';
      const plateGeo = new THREE.BoxGeometry(ow, oh, Math.max(0.015, od));
      const plateMat = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.35,
        metalness: 0.08,
      });
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(cx, cy, Math.max(0.015, od) / 2);
      plate.userData.disposeMaterial = true;
      wallGroup.add(plate);

      const edgesGeo = new THREE.EdgesGeometry(plateGeo);
      const edgesMat = new THREE.LineBasicMaterial({
        color: obs.type === 'socket' ? '#CA8A04' : '#475569',
      });
      const edges = new THREE.LineSegments(edgesGeo, edgesMat);
      edges.position.copy(plate.position);
      edges.userData.disposeMaterial = true;
      wallGroup.add(edges);
    }
  }

  roomRoot.add(wallGroup);
}
