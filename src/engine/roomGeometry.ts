import {
  DEFAULT_ROOM_STYLE,
  type FurniturePart,
  type RoomConfig,
  type RoomFloorFinish,
  type RoomOpening,
  type RoomOpeningType,
  type RoomStyle,
  type RoomVertex,
  type RoomWallFinish,
  type RoomWallObstacle,
  type RoomWallObstacleType,
} from '../types/furniture';

export interface WallSegment {
  index: number;
  label: string;
  start: RoomVertex;
  end: RoomVertex;
  dx: number;
  dz: number;
  lengthMm: number;
  /** Angle in radians in (X, Z) plane: atan2(dz, dx) */
  angleRad: number;
  /** Unit tangent vector along wall from start -> end */
  tx: number;
  tz: number;
  /** Unit normal pointing INTO the room interior */
  inNx: number;
  inNz: number;
  /** Unit normal pointing OUTWARD (exterior side of wall thickness) */
  outNx: number;
  outNz: number;
  midX: number;
  midZ: number;
}

export interface RoomBoundsXZ {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  widthMm: number;
  depthMm: number;
  centerX: number;
  centerZ: number;
}

export type RoomShapePresetId =
  | 'rectangle'
  | 'alcove'
  | 'l_shape'
  | 'u_shape'
  | 'chamfered';

export const WALL_FINISH_CATALOG: Record<
  RoomWallFinish,
  { label: string; color: string; roughness: number }
> = {
  white_plaster: { label: 'Biały tynk', color: '#F3F4F6', roughness: 0.92 },
  warm_alabaster: { label: 'Ciepły alabaster', color: '#EDEAE2', roughness: 0.9 },
  warm_greige: { label: 'Ciepły greige', color: '#CFC9BE', roughness: 0.88 },
  light_concrete: { label: 'Beton architektoniczny', color: '#BFC4CA', roughness: 0.84 },
  sage_plaster: { label: 'Szałwiowy tynk', color: '#BCC7BC', roughness: 0.9 },
  anthracite_accent: { label: 'Antracyt', color: '#4B5058', roughness: 0.86 },
};

export const FLOOR_FINISH_CATALOG: Record<
  RoomFloorFinish,
  { label: string; swatch: string; accent: string; roughness: number }
> = {
  oak_parquet: {
    label: 'Dąb naturalny',
    swatch: '#C5A276',
    accent: '#A98356',
    roughness: 0.62,
  },
  herringbone_oak: {
    label: 'Jodełka dębowa',
    swatch: '#BA9364',
    accent: '#977245',
    roughness: 0.58,
  },
  concrete_screed: {
    label: 'Wylewka betonowa',
    swatch: '#A7ACB2',
    accent: '#8B9097',
    roughness: 0.78,
  },
  ceramic_tile: {
    label: 'Płytki gresowe',
    swatch: '#D4D1C8',
    accent: '#B5B1A6',
    roughness: 0.42,
  },
  dark_walnut: {
    label: 'Orzech ciemny',
    swatch: '#6F523B',
    accent: '#533B28',
    roughness: 0.56,
  },
};

export const OPENING_PRESETS: Record<
  RoomOpeningType,
  {
    label: string;
    shortLabel: string;
    widthMm: number;
    heightMm: number;
    sillHeightMm: number;
    swingInward: boolean;
    hingeSide: 'left' | 'right';
  }
> = {
  door_single: {
    label: 'Drzwi 90',
    shortLabel: 'Drzwi',
    widthMm: 900,
    heightMm: 2050,
    sillHeightMm: 0,
    swingInward: true,
    hingeSide: 'left',
  },
  door_double: {
    label: 'Drzwi dwuskrzydłowe',
    shortLabel: 'Drzwi 2×',
    widthMm: 1500,
    heightMm: 2050,
    sillHeightMm: 0,
    swingInward: true,
    hingeSide: 'left',
  },
  window: {
    label: 'Okno standardowe',
    shortLabel: 'Okno',
    widthMm: 1400,
    heightMm: 1400,
    sillHeightMm: 880,
    swingInward: true,
    hingeSide: 'left',
  },
  window_balcony: {
    label: 'Okno balkonowe',
    shortLabel: 'Balkon',
    widthMm: 1800,
    heightMm: 2200,
    sillHeightMm: 0,
    swingInward: true,
    hingeSide: 'left',
  },
  arch: {
    label: 'Otwarte przejście',
    shortLabel: 'Przejście',
    widthMm: 1100,
    heightMm: 2150,
    sillHeightMm: 0,
    swingInward: false,
    hingeSide: 'left',
  },
};

export const WALL_OBSTACLE_PRESETS: Record<
  RoomWallObstacleType,
  {
    label: string;
    shortLabel: string;
    widthMm: number;
    heightMm: number;
    depthMm: number;
    elevationMm: number;
  }
> = {
  radiator: {
    label: 'Grzejnik C.O.',
    shortLabel: 'Grzejnik',
    widthMm: 1000,
    heightMm: 600,
    depthMm: 120,
    elevationMm: 150,
  },
  socket: {
    label: 'Gniazdko 230V',
    shortLabel: 'Gniazdko',
    widthMm: 160,
    heightMm: 85,
    depthMm: 22,
    elevationMm: 300,
  },
  switch: {
    label: 'Włącznik światła',
    shortLabel: 'Włącznik',
    widthMm: 85,
    heightMm: 85,
    depthMm: 18,
    elevationMm: 1150,
  },
  pipe: {
    label: 'Pion / rura',
    shortLabel: 'Pion',
    widthMm: 110,
    heightMm: 2600,
    depthMm: 110,
    elevationMm: 0,
  },
  vent: {
    label: 'Kratka wentylacyjna',
    shortLabel: 'Wentylacja',
    widthMm: 180,
    heightMm: 180,
    depthMm: 25,
    elevationMm: 2250,
  },
  wc_geberit: {
    label: 'WC podtynkowe (Geberit)',
    shortLabel: 'WC Geberit',
    widthMm: 500,
    heightMm: 1200,
    depthMm: 720,
    elevationMm: 0,
  },
  wc_low_cistern: {
    label: 'Muszla WC dolnopłukowa',
    shortLabel: 'WC dolnopł.',
    widthMm: 380,
    heightMm: 790,
    depthMm: 650,
    elevationMm: 0,
  },
  wc_high_cistern: {
    label: 'Muszla WC górnopłukowa',
    shortLabel: 'WC górnopł.',
    widthMm: 380,
    heightMm: 2050,
    depthMm: 580,
    elevationMm: 0,
  },
};

export function wallIndexToLabel(index: number): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (index < letters.length) return `Ściana ${letters[index]}`;
  return `Ściana ${index + 1}`;
}

/**
 * Signed area in (X, Z) screen-like coordinates (X right, Z down/front).
 * Positive signed area means clockwise visually (Top -> Right -> Bottom -> Left),
 * so the interior lies to the RIGHT of edge vector (dx, dz): inNormal = (-dz/len, dx/len).
 */
export function computeSignedAreaXZ(points: Pick<RoomVertex, 'xMm' | 'zMm'>[]): number {
  if (points.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.xMm * b.zMm - b.xMm * a.zMm;
  }
  return sum / 2;
}

/**
 * Normalizes polygon vertex winding so signedAreaXZ > 0 (clockwise in top-down X-right Z-down view).
 * This guarantees every edge's right-hand normal (-dz, dx) points strictly INTO the room interior.
 */
export function normalizeRoomPolygonWinding(points: RoomVertex[]): RoomVertex[] {
  if (points.length < 3) return points;
  if (computeSignedAreaXZ(points) < 0) {
    return [...points].reverse();
  }
  return points;
}

export function computeRoomAreaM2(points: Pick<RoomVertex, 'xMm' | 'zMm'>[]): number {
  return Math.abs(computeSignedAreaXZ(points)) / 1_000_000;
}

export function computeRoomPerimeterM(points: Pick<RoomVertex, 'xMm' | 'zMm'>[]): number {
  if (points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    total += Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm);
  }
  return total / 1000;
}

/**
 * Returns active room polygon vertices. Falls back to legacy rectangle if floorPoints not present.
 */
export function getRoomPolygonPoints(room: RoomConfig): RoomVertex[] {
  if (room.floorPoints && room.floorPoints.length >= 3) {
    return normalizeRoomPolygonWinding(room.floorPoints);
  }
  const halfW = room.widthMm / 2;
  const minZ = room.backWallZMm;
  const maxZ = room.backWallZMm + room.depthMm;
  return [
    { id: 'v_0', xMm: -halfW, zMm: minZ },
    { id: 'v_1', xMm: halfW, zMm: minZ },
    { id: 'v_2', xMm: halfW, zMm: maxZ },
    { id: 'v_3', xMm: -halfW, zMm: maxZ },
  ];
}

export function getRoomStyle(room?: RoomConfig): RoomStyle {
  return {
    ...DEFAULT_ROOM_STYLE,
    ...(room?.style ?? {}),
  };
}

export function computeRoomBoundsXZ(points: Pick<RoomVertex, 'xMm' | 'zMm'>[]): RoomBoundsXZ {
  if (points.length === 0) {
    return {
      minX: -1500,
      maxX: 1500,
      minZ: -340,
      maxZ: 2460,
      widthMm: 3000,
      depthMm: 2800,
      centerX: 0,
      centerZ: 1060,
    };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of points) {
    if (p.xMm < minX) minX = p.xMm;
    if (p.xMm > maxX) maxX = p.xMm;
    if (p.zMm < minZ) minZ = p.zMm;
    if (p.zMm > maxZ) maxZ = p.zMm;
  }
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    widthMm: Math.max(100, Math.round(maxX - minX)),
    depthMm: Math.max(100, Math.round(maxZ - minZ)),
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

/**
 * Computes all architectural wall segments with guaranteed inward-pointing normals.
 */
export function computeWallSegments(rawPoints: RoomVertex[]): WallSegment[] {
  const points = normalizeRoomPolygonWinding(rawPoints);
  const segments: WallSegment[] = [];
  const n = points.length;
  if (n < 3) return segments;

  for (let i = 0; i < n; i++) {
    const start = points[i];
    const end = points[(i + 1) % n];
    const dx = end.xMm - start.xMm;
    const dz = end.zMm - start.zMm;
    const lengthMm = Math.hypot(dx, dz);
    if (lengthMm < 1) {
      segments.push({
        index: i,
        label: wallIndexToLabel(i),
        start,
        end,
        dx: 1,
        dz: 0,
        lengthMm: 1,
        angleRad: 0,
        tx: 1,
        tz: 0,
        inNx: 0,
        inNz: 1,
        outNx: 0,
        outNz: -1,
        midX: start.xMm,
        midZ: start.zMm,
      });
      continue;
    }
    const tx = dx / lengthMm;
    const tz = dz / lengthMm;
    // In X-right, Z-down view with CW polygon (signedAreaXZ > 0),
    // interior is to the right of (tx, tz) -> (-tz, tx)
    const inNx = -tz;
    const inNz = tx;
    segments.push({
      index: i,
      label: wallIndexToLabel(i),
      start,
      end,
      dx,
      dz,
      lengthMm,
      angleRad: Math.atan2(dz, dx),
      tx,
      tz,
      inNx,
      inNz,
      outNx: -inNx,
      outNz: -inNz,
      midX: (start.xMm + end.xMm) / 2,
      midZ: (start.zMm + end.zMm) / 2,
    });
  }
  return segments;
}

/**
 * Ray-casting point-in-polygon check in world XZ plane (mm).
 * Points on boundary within `boundaryEpsMm` count as inside.
 */
export function pointInPolygonXZ(
  xMm: number,
  zMm: number,
  points: Pick<RoomVertex, 'xMm' | 'zMm'>[],
  boundaryEpsMm = 3
): boolean {
  const n = points.length;
  if (n < 3) return true;

  // First check boundary proximity
  for (let i = 0; i < n; i++) {
    const a = points[i];
    const b = points[(i + 1) % n];
    const d = distancePointToSegmentXZ(xMm, zMm, a.xMm, a.zMm, b.xMm, b.zMm);
    if (d <= boundaryEpsMm) return true;
  }

  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = points[i].xMm;
    const zi = points[i].zMm;
    const xj = points[j].xMm;
    const zj = points[j].zMm;
    const intersect =
      zi > zMm !== zj > zMm &&
      xMm < ((xj - xi) * (zMm - zi)) / (zj - zi + 1e-12) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function distancePointToSegmentXZ(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-6) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  const projX = ax + t * dx;
  const projZ = az + t * dz;
  return Math.hypot(px - projX, pz - projZ);
}

export function projectPointOntoWall(
  px: number,
  pz: number,
  seg: WallSegment
): { offsetMm: number; signedInwardDistMm: number; clampedDistMm: number } {
  const vx = px - seg.start.xMm;
  const vz = pz - seg.start.zMm;
  const offsetMm = vx * seg.tx + vz * seg.tz;
  const signedInwardDistMm = vx * seg.inNx + vz * seg.inNz;
  const clampedDistMm = distancePointToSegmentXZ(
    px,
    pz,
    seg.start.xMm,
    seg.start.zMm,
    seg.end.xMm,
    seg.end.zMm
  );
  return { offsetMm, signedInwardDistMm, clampedDistMm };
}

/**
 * Finds the nearest wall segment to a point outside the polygon for accurate collision reporting.
 */
export function findNearestWallSegment(
  px: number,
  pz: number,
  segments: WallSegment[]
): { segment: WallSegment; distanceMm: number } | null {
  let best: { segment: WallSegment; distanceMm: number } | null = null;
  for (const seg of segments) {
    const d = distancePointToSegmentXZ(
      px,
      pz,
      seg.start.xMm,
      seg.start.zMm,
      seg.end.xMm,
      seg.end.zMm
    );
    if (!best || d < best.distanceMm) {
      best = { segment: seg, distanceMm: d };
    }
  }
  return best;
}

/**
 * Computes world-space AABB for a polygon wall obstacle (rotated into world XZ).
 */
export function getWallObstacleWorldBox(
  obs: RoomWallObstacle,
  segments: WallSegment[]
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} | null {
  const seg = segments[obs.wallIndex];
  if (!seg) return null;

  const u0 = Math.max(0, Math.min(seg.lengthMm - 20, obs.offsetMm));
  const u1 = Math.min(seg.lengthMm, u0 + obs.widthMm);
  const d = Math.max(10, obs.depthMm);

  const corners = [
    { x: seg.start.xMm + seg.tx * u0, z: seg.start.zMm + seg.tz * u0 },
    { x: seg.start.xMm + seg.tx * u1, z: seg.start.zMm + seg.tz * u1 },
    {
      x: seg.start.xMm + seg.tx * u0 + seg.inNx * d,
      z: seg.start.zMm + seg.tz * u0 + seg.inNz * d,
    },
    {
      x: seg.start.xMm + seg.tx * u1 + seg.inNx * d,
      z: seg.start.zMm + seg.tz * u1 + seg.inNz * d,
    },
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.z < minZ) minZ = c.z;
    if (c.z > maxZ) maxZ = c.z;
  }

  return {
    minX,
    maxX,
    minY: obs.elevationMm,
    maxY: obs.elevationMm + obs.heightMm,
    minZ,
    maxZ,
  };
}

/**
 * Computes inward-swinging room door sweep AABB so we warn if a cabinet blocks the entrance door!
 */
export function getRoomDoorSwingBox(
  op: RoomOpening,
  segments: WallSegment[]
): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
} | null {
  if ((op.type !== 'door_single' && op.type !== 'door_double') || !op.swingInward) {
    return null;
  }
  const seg = segments[op.wallIndex];
  if (!seg) return null;

  const u0 = Math.max(0, op.offsetMm);
  const u1 = Math.min(seg.lengthMm, u0 + op.widthMm);
  const leafDepth = op.type === 'door_double' ? op.widthMm / 2 : op.widthMm;

  const corners = [
    { x: seg.start.xMm + seg.tx * u0, z: seg.start.zMm + seg.tz * u0 },
    { x: seg.start.xMm + seg.tx * u1, z: seg.start.zMm + seg.tz * u1 },
    {
      x: seg.start.xMm + seg.tx * u0 + seg.inNx * leafDepth,
      z: seg.start.zMm + seg.tz * u0 + seg.inNz * leafDepth,
    },
    {
      x: seg.start.xMm + seg.tx * u1 + seg.inNx * leafDepth,
      z: seg.start.zMm + seg.tz * u1 + seg.inNz * leafDepth,
    },
  ];

  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const c of corners) {
    if (c.x < minX) minX = c.x;
    if (c.x > maxX) maxX = c.x;
    if (c.z < minZ) minZ = c.z;
    if (c.z > maxZ) maxZ = c.z;
  }

  return {
    minX,
    maxX,
    minY: op.sillHeightMm,
    maxY: op.sillHeightMm + op.heightMm,
    minZ,
    maxZ,
  };
}

/**
 * Syncs legacy bounding fields (`widthMm`, `depthMm`, `backWallZMm`) from `floorPoints`
 * and clamps openings/wallObstacles to valid wall lengths.
 */
export function syncRoomWithPolygon(room: RoomConfig): RoomConfig {
  const pts = getRoomPolygonPoints(room);
  const bounds = computeRoomBoundsXZ(pts);
  const segments = computeWallSegments(pts);

  const openings = (room.openings ?? [])
    .filter((o) => o.wallIndex >= 0 && o.wallIndex < segments.length)
    .map((o) => {
      const segLen = segments[o.wallIndex].lengthMm;
      const widthMm = Math.max(300, Math.min(o.widthMm, Math.max(300, segLen - 80)));
      const maxOffset = Math.max(0, segLen - widthMm);
      const offsetMm = Math.round(Math.max(0, Math.min(o.offsetMm, maxOffset)));
      const sillHeightMm = Math.max(0, Math.min(o.sillHeightMm, room.heightMm - 300));
      const heightMm = Math.max(300, Math.min(o.heightMm, room.heightMm - sillHeightMm));
      return { ...o, widthMm, offsetMm, sillHeightMm, heightMm };
    });

  const wallObstacles = (room.wallObstacles ?? [])
    .filter((o) => o.wallIndex >= 0 && o.wallIndex < segments.length)
    .map((o) => {
      const segLen = segments[o.wallIndex].lengthMm;
      const widthMm = Math.max(40, Math.min(o.widthMm, Math.max(40, segLen)));
      const maxOffset = Math.max(0, segLen - widthMm);
      const offsetMm = Math.round(Math.max(0, Math.min(o.offsetMm, maxOffset)));
      return { ...o, widthMm, offsetMm };
    });

  const hiddenWallIndices = (room.hiddenWallIndices ?? []).filter(
    (idx) => idx >= 0 && idx < segments.length
  );

  return {
    ...room,
    floorPoints: pts,
    widthMm: bounds.widthMm,
    depthMm: bounds.depthMm,
    backWallZMm: Math.round(bounds.minZ),
    wallThicknessMm: room.wallThicknessMm ?? 120,
    hiddenWallIndices,
    openings,
    wallObstacles,
    style: getRoomStyle(room),
  };
}

/**
 * Computes approximate XZ bounding box of all current furniture parts so room presets
 * automatically align around the user's furniture!
 */
export function computeFurnitureFootprintXZ(
  parts: FurniturePart[]
): RoomBoundsXZ | null {
  if (parts.length === 0) return null;
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of parts) {
    const hw = Math.abs(p.width) / 2;
    const hd = Math.abs(p.depth) / 2;
    const rad = Math.hypot(hw, hd);
    // Use tight axis-aligned approx if unrotated around Y, else conservative
    const rotY = Math.abs(p.rotation[1] % (Math.PI * 2));
    const near0 = rotY < 0.05 || Math.abs(rotY - Math.PI) < 0.05;
    const near90 =
      Math.abs(rotY - Math.PI / 2) < 0.05 || Math.abs(rotY - (3 * Math.PI) / 2) < 0.05;
    const extX = near0 ? hw : near90 ? hd : rad;
    const extZ = near0 ? hd : near90 ? hw : rad;
    minX = Math.min(minX, p.position[0] - extX);
    maxX = Math.max(maxX, p.position[0] + extX);
    minZ = Math.min(minZ, p.position[2] - extZ);
    maxZ = Math.max(maxZ, p.position[2] + extZ);
  }
  if (!Number.isFinite(minX)) return null;
  return {
    minX,
    maxX,
    minZ,
    maxZ,
    widthMm: Math.round(maxX - minX),
    depthMm: Math.round(maxZ - minZ),
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
  };
}

/**
 * Generates clean architectural polygon presets automatically positioned around the user's furniture!
 */
export function buildRoomPreset(
  preset: RoomShapePresetId,
  parts: FurniturePart[],
  heightMm = 2600
): {
  floorPoints: RoomVertex[];
  openings: RoomOpening[];
  wallObstacles: RoomWallObstacle[];
} {
  const fb = computeFurnitureFootprintXZ(parts);
  const snap50 = (v: number) => Math.round(v / 50) * 50;

  const backZ = fb ? snap50(fb.minZ - 20) : -340;
  const cx = fb ? snap50(fb.centerX) : 0;
  const furnW = fb ? Math.max(1200, fb.widthMm) : 1600;
  const furnD = fb ? Math.max(500, fb.depthMm) : 600;

  if (preset === 'alcove') {
    const w = snap50(Math.max(1400, furnW + 120));
    const d = snap50(Math.max(1200, furnD + 600));
    const x0 = snap50(cx - w / 2);
    const x1 = x0 + w;
    return {
      floorPoints: [
        { id: 'v_0', xMm: x0, zMm: backZ },
        { id: 'v_1', xMm: x1, zMm: backZ },
        { id: 'v_2', xMm: x1, zMm: backZ + d },
        { id: 'v_3', xMm: x0, zMm: backZ + d },
      ],
      openings: [],
      wallObstacles: [],
    };
  }

  if (preset === 'l_shape') {
    const w = snap50(Math.max(3600, furnW + 1600));
    const d = snap50(Math.max(3000, furnD + 2000));
    const cutW = snap50(w * 0.42);
    const cutD = snap50(d * 0.45);
    const x0 = snap50(cx - w / 2);
    const x1 = x0 + w;
    return {
      floorPoints: [
        { id: 'v_0', xMm: x0, zMm: backZ },
        { id: 'v_1', xMm: x1, zMm: backZ },
        { id: 'v_2', xMm: x1, zMm: backZ + d - cutD },
        { id: 'v_3', xMm: x1 - cutW, zMm: backZ + d - cutD },
        { id: 'v_4', xMm: x1 - cutW, zMm: backZ + d },
        { id: 'v_5', xMm: x0, zMm: backZ + d },
      ],
      openings: [
        {
          id: 'op_door_1',
          type: 'door_single',
          label: 'Drzwi wejściowe',
          wallIndex: 4,
          offsetMm: Math.max(150, Math.round((w - cutW - 900) / 2)),
          widthMm: 900,
          heightMm: Math.min(2050, heightMm - 200),
          sillHeightMm: 0,
          swingInward: true,
          hingeSide: 'left',
        },
        {
          id: 'op_win_1',
          type: 'window',
          label: 'Okno',
          wallIndex: 1,
          offsetMm: Math.max(150, Math.round((d - cutD - 1200) / 2)),
          widthMm: Math.min(1200, Math.max(600, d - cutD - 300)),
          heightMm: Math.min(1400, heightMm - 1050),
          sillHeightMm: 880,
        },
      ],
      wallObstacles: [],
    };
  }

  if (preset === 'u_shape') {
    const w = snap50(Math.max(3800, furnW + 1400));
    const d = snap50(Math.max(3200, furnD + 2200));
    const wingW = snap50(w * 0.3);
    const notchD = snap50(d * 0.38);
    const x0 = snap50(cx - w / 2);
    const x1 = x0 + w;
    return {
      floorPoints: [
        { id: 'v_0', xMm: x0, zMm: backZ },
        { id: 'v_1', xMm: x1, zMm: backZ },
        { id: 'v_2', xMm: x1, zMm: backZ + d },
        { id: 'v_3', xMm: x1 - wingW, zMm: backZ + d },
        { id: 'v_4', xMm: x1 - wingW, zMm: backZ + d - notchD },
        { id: 'v_5', xMm: x0 + wingW, zMm: backZ + d - notchD },
        { id: 'v_6', xMm: x0 + wingW, zMm: backZ + d },
        { id: 'v_7', xMm: x0, zMm: backZ + d },
      ],
      openings: [
        {
          id: 'op_arch_1',
          type: 'arch',
          label: 'Przejście',
          wallIndex: 4,
          offsetMm: Math.max(100, Math.round((w - wingW * 2 - 1000) / 2)),
          widthMm: Math.min(1000, Math.max(600, w - wingW * 2 - 200)),
          heightMm: Math.min(2150, heightMm - 150),
          sillHeightMm: 0,
        },
      ],
      wallObstacles: [],
    };
  }

  if (preset === 'chamfered') {
    const w = snap50(Math.max(3600, furnW + 1600));
    const d = snap50(Math.max(3000, furnD + 2000));
    const chamf = 900;
    const x0 = snap50(cx - w / 2);
    const x1 = x0 + w;
    return {
      floorPoints: [
        { id: 'v_0', xMm: x0, zMm: backZ },
        { id: 'v_1', xMm: x1 - chamf, zMm: backZ },
        { id: 'v_2', xMm: x1, zMm: backZ + chamf },
        { id: 'v_3', xMm: x1, zMm: backZ + d },
        { id: 'v_4', xMm: x0, zMm: backZ + d },
      ],
      openings: [
        {
          id: 'op_win_chamf',
          type: 'window',
          label: 'Okno narożne',
          wallIndex: 1,
          offsetMm: 180,
          widthMm: 900,
          heightMm: Math.min(1400, heightMm - 1050),
          sillHeightMm: 880,
        },
      ],
      wallObstacles: [],
    };
  }

  // Default: modern standard rectangular room aligned behind furniture
  const w = snap50(Math.max(3400, furnW + 1400));
  const d = snap50(Math.max(2800, furnD + 1800));
  const x0 = snap50(cx - w / 2);
  const x1 = x0 + w;
  return {
    floorPoints: [
      { id: 'v_0', xMm: x0, zMm: backZ },
      { id: 'v_1', xMm: x1, zMm: backZ },
      { id: 'v_2', xMm: x1, zMm: backZ + d },
      { id: 'v_3', xMm: x0, zMm: backZ + d },
    ],
    openings: [
      {
        id: 'op_win_default',
        type: 'window',
        label: 'Okno',
        wallIndex: 1,
        offsetMm: Math.max(200, Math.round((d - 1400) / 2)),
        widthMm: Math.min(1400, d - 400),
        heightMm: Math.min(1400, heightMm - 1050),
        sillHeightMm: 880,
      },
      {
        id: 'op_door_default',
        type: 'door_single',
        label: 'Drzwi wejściowe',
        wallIndex: 2,
        offsetMm: 300,
        widthMm: 900,
        heightMm: Math.min(2050, heightMm - 200),
        sillHeightMm: 0,
        swingInward: true,
        hingeSide: 'left',
      },
    ],
    wallObstacles: [],
  };
}

/**
 * Sets a specific wall's length (mm) by shifting its end vertex along the wall's axis
 * (and if the room is orthogonal, keeps the adjacent corner square when possible).
 */
export function resizeWallSegmentLength(
  points: RoomVertex[],
  wallIndex: number,
  targetLengthMm: number
): RoomVertex[] {
  const n = points.length;
  if (n < 3 || wallIndex < 0 || wallIndex >= n) return points;
  const clampedLen = Math.max(300, Math.min(20000, Math.round(targetLengthMm)));
  const a = points[wallIndex];
  const nextIdx = (wallIndex + 1) % n;
  const b = points[nextIdx];
  const dx = b.xMm - a.xMm;
  const dz = b.zMm - a.zMm;
  const curLen = Math.hypot(dx, dz);
  if (curLen < 1) return points;

  const shiftX = (dx / curLen) * (clampedLen - curLen);
  const shiftZ = (dz / curLen) * (clampedLen - curLen);

  // If this is a clean axis-aligned rectangle (4 vertices, all 90 deg), shift BOTH vertices
  // on the moving side so the rectangle stays perfectly square!
  const next = points.map((v) => ({ ...v }));
  const isHoriz = Math.abs(dz) < 1;
  const isVert = Math.abs(dx) < 1;

  if (n === 4 && (isHoriz || isVert)) {
    const nextNextIdx = (wallIndex + 2) % n;
    const b2 = next[nextNextIdx];
    const adjIsPerp = isHoriz
      ? Math.abs(b2.xMm - b.xMm) < 1
      : Math.abs(b2.zMm - b.zMm) < 1;
    if (adjIsPerp) {
      next[nextIdx].xMm = Math.round(next[nextIdx].xMm + shiftX);
      next[nextIdx].zMm = Math.round(next[nextIdx].zMm + shiftZ);
      next[nextNextIdx].xMm = Math.round(next[nextNextIdx].xMm + shiftX);
      next[nextNextIdx].zMm = Math.round(next[nextNextIdx].zMm + shiftZ);
      return next;
    }
  }

  next[nextIdx].xMm = Math.round(b.xMm + shiftX);
  next[nextIdx].zMm = Math.round(b.zMm + shiftZ);
  return next;
}

/**
 * Splits wall `wallIndex` by inserting a new corner vertex at its midpoint,
 * updating opening & obstacle wall indices cleanly.
 */
export function splitWallSegment(
  room: RoomConfig,
  wallIndex: number
): RoomConfig {
  const pts = getRoomPolygonPoints(room);
  const n = pts.length;
  if (wallIndex < 0 || wallIndex >= n || n >= 24) return room;

  const a = pts[wallIndex];
  const b = pts[(wallIndex + 1) % n];
  const midVertex: RoomVertex = {
    id: `v_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    xMm: Math.round((a.xMm + b.xMm) / 2),
    zMm: Math.round((a.zMm + b.zMm) / 2),
  };

  const nextPts = [
    ...pts.slice(0, wallIndex + 1),
    midVertex,
    ...pts.slice(wallIndex + 1),
  ];

  const halfLen = Math.hypot(b.xMm - a.xMm, b.zMm - a.zMm) / 2;

  const nextOpenings = (room.openings ?? []).map((o) => {
    if (o.wallIndex > wallIndex) return { ...o, wallIndex: o.wallIndex + 1 };
    if (o.wallIndex === wallIndex && o.offsetMm + o.widthMm / 2 > halfLen) {
      return {
        ...o,
        wallIndex: wallIndex + 1,
        offsetMm: Math.max(0, Math.round(o.offsetMm - halfLen)),
      };
    }
    return o;
  });

  const nextObstacles = (room.wallObstacles ?? []).map((o) => {
    if (o.wallIndex > wallIndex) return { ...o, wallIndex: o.wallIndex + 1 };
    if (o.wallIndex === wallIndex && o.offsetMm + o.widthMm / 2 > halfLen) {
      return {
        ...o,
        wallIndex: wallIndex + 1,
        offsetMm: Math.max(0, Math.round(o.offsetMm - halfLen)),
      };
    }
    return o;
  });

  const nextHidden = (room.hiddenWallIndices ?? []).map((idx) =>
    idx > wallIndex ? idx + 1 : idx
  );

  return syncRoomWithPolygon({
    ...room,
    floorPoints: nextPts,
    openings: nextOpenings,
    wallObstacles: nextObstacles,
    hiddenWallIndices: nextHidden,
  });
}

/**
 * Deletes a corner vertex (requires >= 4 vertices) and updates wall indices.
 */
export function deleteRoomVertex(room: RoomConfig, vertexIndex: number): RoomConfig {
  const pts = getRoomPolygonPoints(room);
  if (pts.length <= 3 || vertexIndex < 0 || vertexIndex >= pts.length) return room;

  const nextPts = pts.filter((_, i) => i !== vertexIndex);
  const remapWall = (w: number): number | null => {
    if (w === vertexIndex) return null;
    if (w > vertexIndex) return w - 1;
    return w;
  };

  const nextOpenings = (room.openings ?? [])
    .map((o) => {
      const nw = remapWall(o.wallIndex);
      return nw === null ? null : { ...o, wallIndex: nw };
    })
    .filter((o): o is RoomOpening => o !== null);

  const nextObstacles = (room.wallObstacles ?? [])
    .map((o) => {
      const nw = remapWall(o.wallIndex);
      return nw === null ? null : { ...o, wallIndex: nw };
    })
    .filter((o): o is RoomWallObstacle => o !== null);

  const nextHidden = (room.hiddenWallIndices ?? [])
    .map(remapWall)
    .filter((w): w is number => w !== null);

  return syncRoomWithPolygon({
    ...room,
    floorPoints: nextPts,
    openings: nextOpenings,
    wallObstacles: nextObstacles,
    hiddenWallIndices: nextHidden,
  });
}
