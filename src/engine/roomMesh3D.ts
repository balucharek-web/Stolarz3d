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
  computeRoomBoundsXZ,
  computeWallSegments,
  getRoomPolygonPoints,
  getRoomStyle,
  type WallSegment,
} from './roomGeometry';
import { getRoomObstacleWorldBox } from './carpentry';

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
 * textured polygon floor, extruded walls with real cut-out doors/windows,
 * casings, glazing, sills, baseboards, wall obstacles, optional ceiling, and attic slope.
 */
export function buildArchitecturalRoom3D(
  roomRoot: THREE.Group,
  room: RoomConfig
): void {
  const pts = getRoomPolygonPoints(room);
  const segments = computeWallSegments(pts);
  if (segments.length < 3) return;

  const style = getRoomStyle(room);
  const wallMeta = WALL_FINISH_CATALOG[style.wallFinish];
  const floorMeta = FLOOR_FINISH_CATALOG[style.floorFinish];
  const hM = room.heightMm * MM_TO_M;
  const wallThickM = Math.max(0.05, Math.min(0.4, (room.wallThicknessMm ?? 120) * MM_TO_M));
  const hiddenSet = new Set<number>(room.hiddenWallIndices ?? []);

  // Legacy rectangular wall toggle compatibility when polygon is untouched 4-wall rect
  const hasCustomPolygon = Boolean(room.floorPoints && room.floorPoints.length >= 3);
  if (!hasCustomPolygon && segments.length === 4) {
    if (!room.showBackWall) hiddenSet.add(0);
    if (!room.showRightWall) hiddenSet.add(1);
    hiddenSet.add(2); // legacy alcove had open front
    if (!room.showLeftWall) hiddenSet.add(3);
  }

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
    color: style.wallCutawayMode === 'translucent' ? '#0EA5E9' : '#64748B',
    transparent: true,
    opacity: style.wallCutawayMode === 'translucent' ? 0.85 : 0.45,
  });
  const outlineLine = new THREE.Line(outlineGeo, outlineMat);
  outlineLine.userData.disposeMaterial = true;
  roomRoot.add(outlineLine);

  // 2. POLYGON WALLS WITH CUTOUT OPENINGS, FRAMES, BASEBOARDS & WALL OBSTACLES
  const openings = room.openings ?? [];
  const wallObstacles = room.wallObstacles ?? [];

  for (const seg of segments) {
    if (hiddenSet.has(seg.index)) continue;
    const wallOpenings = openings.filter((o) => o.wallIndex === seg.index);
    const segObstacles = wallObstacles.filter((o) => o.wallIndex === seg.index);
    buildWallSegment3D(
      roomRoot,
      seg,
      hM,
      wallThickM,
      wallMeta.color,
      wallMeta.roughness,
      style.wallCutawayMode,
      style.showBaseboards,
      style.baseboardHeightMm * MM_TO_M,
      wallOpenings,
      segObstacles
    );
  }

  // 3. OPTIONAL FLAT CEILING (polygon matched)
  if (room.showCeiling && !room.slopedCeiling?.enabled) {
    const ceilGeo = new THREE.ShapeGeometry(floorShape);
    const ceilMat = new THREE.MeshStandardMaterial({
      color: '#F8FAFC',
      roughness: 0.94,
      metalness: 0,
      transparent: style.wallCutawayMode !== 'solid',
      opacity: style.wallCutawayMode === 'solid' ? 1 : 0.18,
      side: THREE.FrontSide, // Looking down from above you see THROUGH ceiling into the room!
      depthWrite: style.wallCutawayMode === 'solid',
    });
    const ceilMesh = new THREE.Mesh(ceilGeo, ceilMat);
    ceilMesh.rotation.x = Math.PI / 2;
    ceilMesh.position.y = hM;
    ceilMesh.userData.disposeMaterial = true;
    roomRoot.add(ceilMesh);
  }

  // 4. OPTIONAL SLOPED ATTIC CEILING (bounded to polygon XZ extents)
  if (room.slopedCeiling?.enabled) {
    const bounds = computeRoomBoundsXZ(pts);
    const minX = bounds.minX * MM_TO_M;
    const maxX = bounds.maxX * MM_TO_M;
    const wM = bounds.widthMm * MM_TO_M;
    const dM = bounds.depthMm * MM_TO_M;
    const centerZ = bounds.centerZ * MM_TO_M;

    const kneeH = Math.min(room.heightMm, Math.max(150, room.slopedCeiling.kneeWallHeightMm)) * MM_TO_M;
    const slopeW = Math.min(bounds.widthMm, Math.max(200, room.slopedCeiling.slopeWidthMm)) * MM_TO_M;
    const rise = Math.max(0.05, hM - kneeH);
    const slopeLen = Math.hypot(slopeW, rise);
    const angle = Math.atan2(rise, slopeW);

    const slopeGeo = new THREE.BoxGeometry(slopeLen, 0.035, dM);
    const slopeMat = new THREE.MeshStandardMaterial({
      color: '#F59E0B',
      roughness: 0.78,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
    });
    const slopeMesh = new THREE.Mesh(slopeGeo, slopeMat);
    const isRight = room.slopedCeiling.side === 'right';
    slopeMesh.position.set(
      isRight ? maxX - slopeW / 2 : minX + slopeW / 2,
      kneeH + rise / 2,
      centerZ
    );
    slopeMesh.rotation.z = isRight ? -angle : angle;
    slopeMesh.userData.disposeMaterial = true;
    roomRoot.add(slopeMesh);

    const slopeEdgesGeo = new THREE.EdgesGeometry(slopeGeo);
    const slopeEdgesMat = new THREE.LineBasicMaterial({ color: '#D97706' });
    const slopeEdges = new THREE.LineSegments(slopeEdgesGeo, slopeEdgesMat);
    slopeEdges.position.copy(slopeMesh.position);
    slopeEdges.rotation.copy(slopeMesh.rotation);
    slopeEdges.userData.disposeMaterial = true;
    roomRoot.add(slopeEdges);

    if (room.showCeiling) {
      const flatW = Math.max(0.05, wM - slopeW);
      if (flatW > 0.08) {
        const flatGeo = new THREE.PlaneGeometry(flatW, dM);
        const flatMat = new THREE.MeshStandardMaterial({
          color: '#E2E8F0',
          roughness: 0.9,
          transparent: true,
          opacity: 0.22,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        const flatMesh = new THREE.Mesh(flatGeo, flatMat);
        flatMesh.rotation.x = Math.PI / 2;
        flatMesh.position.set(
          isRight ? minX + flatW / 2 : maxX - flatW / 2,
          hM,
          centerZ
        );
        flatMesh.userData.disposeMaterial = true;
        roomRoot.add(flatMesh);
      }
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

function buildWallSegment3D(
  roomRoot: THREE.Group,
  seg: WallSegment,
  hM: number,
  wallThickM: number,
  wallColor: string,
  wallRoughness: number,
  cutawayMode: 'smart_cutaway' | 'solid' | 'translucent',
  showBaseboards: boolean,
  baseboardHM: number,
  openings: RoomOpening[],
  obstacles: RoomWallObstacle[]
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

  // Build wall elevation shape in (x: 0..lenM, y: 0..hM) with real rectangular holes for openings
  const wallShape = new THREE.Shape();
  wallShape.moveTo(0, 0);
  wallShape.lineTo(lenM, 0);
  wallShape.lineTo(lenM, hM);
  wallShape.lineTo(0, hM);
  wallShape.closePath();

  const validOpenings: Array<{
    op: RoomOpening;
    u0: number;
    u1: number;
    y0: number;
    y1: number;
  }> = [];

  for (const op of openings) {
    const u0 = Math.max(0.02, Math.min(lenM - 0.1, op.offsetMm * MM_TO_M));
    const u1 = Math.min(lenM - 0.02, u0 + op.widthMm * MM_TO_M);
    const y0 = Math.max(0, Math.min(hM - 0.15, op.sillHeightMm * MM_TO_M));
    const y1 = Math.min(hM - 0.04, y0 + op.heightMm * MM_TO_M);
    if (u1 - u0 < 0.12 || y1 - y0 < 0.15) continue;

    // For floor-level openings (sill === 0), nudge hole bottom slightly above 0 so Shape hole stays strictly interior
    const holeY0 = y0 <= 0.002 ? 0.004 : y0;
    const hole = new THREE.Path();
    hole.moveTo(u0, holeY0);
    hole.lineTo(u0, y1);
    hole.lineTo(u1, y1);
    hole.lineTo(u1, holeY0);
    hole.closePath();
    wallShape.holes.push(hole);

    validOpenings.push({ op, u0, u1, y0, y1 });
  }

  if (cutawayMode === 'smart_cutaway') {
    // Industry-standard architectural cutaway (PRO100 / IKEA / Planner 5D):
    // Interior wall plane uses FrontSide (+Z facing INTO the room), so walls between the
    // camera and furniture become cleanly transparent/invisible automatically, while walls
    // behind the furniture render as 100% solid architectural plaster with shadows!
    const innerGeo = new THREE.ShapeGeometry(wallShape);
    const innerMat = new THREE.MeshStandardMaterial({
      color: wallColor,
      roughness: wallRoughness,
      metalness: 0.02,
      side: THREE.FrontSide,
    });
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.receiveShadow = true;
    innerMesh.userData.disposeMaterial = true;
    wallGroup.add(innerMesh);

    // Subtle thin architectural top cap & low floor curb so room boundaries stay crisp from outside
    const curbGeo = new THREE.BoxGeometry(lenM + wallThickM, 0.045, wallThickM);
    const curbMat = new THREE.MeshStandardMaterial({
      color: '#475569',
      roughness: 0.8,
      metalness: 0.05,
      transparent: true,
      opacity: 0.55,
    });
    const curb = new THREE.Mesh(curbGeo, curbMat);
    curb.position.set(lenM / 2, 0.0225, -wallThickM / 2);
    curb.userData.disposeMaterial = true;
    wallGroup.add(curb);

    // Crisp subtle vertical corner line at wall start
    const cornerLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0, 0.002),
      new THREE.Vector3(0, hM, 0.002),
    ]);
    const cornerLineMat = new THREE.LineBasicMaterial({
      color: '#94A3B8',
      transparent: true,
      opacity: 0.35,
    });
    const cornerLine = new THREE.Line(cornerLineGeo, cornerLineMat);
    cornerLine.userData.disposeMaterial = true;
    wallGroup.add(cornerLine);
  } else {
    const extrudeGeo = new THREE.ExtrudeGeometry(wallShape, {
      depth: wallThickM,
      bevelEnabled: false,
    });
    const isTranslucent = cutawayMode === 'translucent';
    const wallMat = new THREE.MeshStandardMaterial({
      color: isTranslucent ? '#CBD5E1' : wallColor,
      roughness: wallRoughness,
      metalness: 0.02,
      transparent: isTranslucent,
      opacity: isTranslucent ? 0.24 : 1,
      depthWrite: !isTranslucent,
    });
    const wallMesh = new THREE.Mesh(extrudeGeo, wallMat);
    wallMesh.position.z = -wallThickM;
    wallMesh.receiveShadow = !isTranslucent;
    wallMesh.castShadow = !isTranslucent;
    wallMesh.userData.disposeMaterial = true;
    wallGroup.add(wallMesh);

    const edgesGeo = new THREE.EdgesGeometry(extrudeGeo, 25);
    const edgesMat = new THREE.LineBasicMaterial({
      color: isTranslucent ? '#64748B' : '#94A3B8',
      transparent: true,
      opacity: isTranslucent ? 0.55 : 0.28,
    });
    const edges = new THREE.LineSegments(edgesGeo, edgesMat);
    edges.position.copy(wallMesh.position);
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

    if (obs.type === 'radiator') {
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
