import {
  DEFAULT_QUOTE_SETTINGS,
  MATERIAL_MAP,
  SCREW_MAP,
  type ApplianceModel,
  type DadoGrooveConfig,
  type DrawerSlideType,
  type EdgeBandingConfig,
  type EdgeBandingThickness,
  type Fastener,
  type FurniturePart,
  type FurnitureProject,
  type HandleSide,
  type HandleStyle,
  type LedGrooveConfig,
  type MaterialId,
  type MaterialMeta,
  type MaterialsCatalogConfig,
  type MiterEdgesConfig,
  type OffcutRemnant,
  type ParametricCabinetConfig,
  type PartCutout,
  type PartKind,
  type QuoteSettings,
  DEFAULT_ROOM_STYLE,
  type RoomConfig,
  type RoomCutawayMode,
  type RoomFloorFinish,
  type RoomObstacle,
  type RoomObstacleType,
  type RoomOpening,
  type RoomOpeningType,
  type RoomStyle,
  type RoomVertex,
  type RoomWallFinish,
  type RoomWallObstacle,
  type RoomWallObstacleType,
  type ScrewType,
  type SurfaceFinish,
} from '../types/furniture';

const LEGACY_STORAGE_KEY = 'stolarz3d_project_v1';
const PROJECTS_STORAGE_KEY = 'stolarz3d_projects_v2';
const QUOTE_SETTINGS_KEY = 'stolarz3d_quote_settings_v1';
const MATERIALS_CATALOG_KEY = 'stolarz3d_materials_catalog_v1';
const OFFCUTS_STORAGE_KEY = 'stolarz3d_offcuts_v1';

const IDB_NAME = 'stolarz3d_assets_db';
const IDB_VERSION = 1;
const IDB_TEXTURES_STORE = 'custom_textures';

export interface ProjectStoreState {
  activeProjectId: string;
  projects: FurnitureProject[];
}

const VALID_KINDS = new Set<PartKind>([
  'panel',
  'sloped',
  'profile',
  'door',
  'countertop',
  'custom',
  'appliance',
]);

const VALID_APPLIANCES = new Set<ApplianceModel>([
  'wardrobe_rod',
  'induction_hob',
  'kitchen_sink',
  'builtin_oven',
  'wire_cargo',
]);

const VALID_HANDLES = new Set<HandleSide>(['left', 'right', 'top', 'none']);

function toFiniteNumber(value: unknown, fallback: number, min = -100000, max = 100000): number {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, num));
}

function toVec3(
  value: unknown,
  fallback: [number, number, number],
  min = -50000,
  max = 50000
): [number, number, number] {
  if (!Array.isArray(value) || value.length < 3) return fallback;
  return [
    toFiniteNumber(value[0], fallback[0], min, max),
    toFiniteNumber(value[1], fallback[1], min, max),
    toFiniteNumber(value[2], fallback[2], min, max),
  ];
}

function sanitizeEdgeBanding(raw: unknown): EdgeBandingConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const obj = raw as Record<string, unknown>;
  const rawThickness = Number(obj.thicknessMm);
  const thicknessMm: EdgeBandingThickness =
    rawThickness === 2 ? 2 : rawThickness === 0.8 ? 0.8 : 0;
  if (thicknessMm === 0) return undefined;
  return {
    thicknessMm,
    top: Boolean(obj.top),
    bottom: Boolean(obj.bottom),
    left: Boolean(obj.left),
    right: Boolean(obj.right),
  };
}

function sanitizePolygon(raw: unknown): [number, number][] | undefined {
  if (!Array.isArray(raw) || raw.length < 3) return undefined;
  const pts: [number, number][] = [];
  for (const item of raw) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const x = toFiniteNumber(item[0], NaN, -20000, 20000);
    const y = toFiniteNumber(item[1], NaN, -20000, 20000);
    if (Number.isFinite(x) && Number.isFinite(y)) {
      pts.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    }
  }
  return pts.length >= 3 ? pts : undefined;
}

const VALID_FINISHES = new Set<SurfaceFinish>(['matte', 'satin', 'gloss']);
const VALID_HANDLE_STYLES = new Set<HandleStyle>(['bar', 'tip_on', 'gola_j', 'chamfer_45']);
const VALID_SLIDES = new Set<DrawerSlideType>(['none', 'ball_26mm', 'undermount_blum']);
const VALID_HW_TAGS = new Set([
  'leg',
  'drawer_front',
  'drawer_box',
  'door_overlay',
  'door_inset',
  'sliding_door',
  'flap_door',
  'wall_filler',
]);

function sanitizeLedGroove(raw: unknown): LedGrooveConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  if (!g.enabled) return undefined;
  const edge =
    g.edge === 'back' || g.edge === 'left' || g.edge === 'right' ? g.edge : 'front';
  return {
    enabled: true,
    edge,
    insetMm: toFiniteNumber(g.insetMm, 45, 10, 400),
    widthMm: toFiniteNumber(g.widthMm, 10, 6, 30),
    depthMm: toFiniteNumber(g.depthMm, 8, 3, 18),
  };
}
const VALID_OBSTACLE_TYPES = new Set<RoomObstacleType>(['radiator', 'socket', 'pipe', 'window']);
const VALID_OPENING_TYPES = new Set<RoomOpeningType>([
  'door_single',
  'door_double',
  'window',
  'window_balcony',
  'arch',
]);
const VALID_WALL_OBSTACLE_TYPES = new Set<RoomWallObstacleType>([
  'socket',
  'switch',
  'radiator',
  'pipe',
  'vent',
]);
const VALID_WALL_FINISHES = new Set<RoomWallFinish>([
  'white_plaster',
  'warm_alabaster',
  'warm_greige',
  'light_concrete',
  'sage_plaster',
  'anthracite_accent',
]);
const VALID_FLOOR_FINISHES = new Set<RoomFloorFinish>([
  'oak_parquet',
  'herringbone_oak',
  'concrete_screed',
  'ceramic_tile',
  'dark_walnut',
]);
const VALID_CUTAWAY_MODES = new Set<RoomCutawayMode>([
  'smart_cutaway',
  'solid',
  'translucent',
]);

function sanitizeRoomConfig(raw: unknown): RoomConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const rawObstacles = Array.isArray(r.obstacles) ? r.obstacles : [];
  const obstacles: RoomObstacle[] = [];
  for (let i = 0; i < rawObstacles.length; i++) {
    const item = rawObstacles[i];
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const type: RoomObstacleType =
      typeof o.type === 'string' && VALID_OBSTACLE_TYPES.has(o.type as RoomObstacleType)
        ? (o.type as RoomObstacleType)
        : 'socket';
    const wall = o.wall === 'left' || o.wall === 'right' ? o.wall : 'back';
    obstacles.push({
      id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `obs_${i}`,
      type,
      label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 40) : type,
      wall,
      offsetMm: toFiniteNumber(o.offsetMm, 0, -5000, 5000),
      elevationMm: toFiniteNumber(o.elevationMm, 300, 0, 4000),
      widthMm: toFiniteNumber(o.widthMm, 120, 20, 4000),
      heightMm: toFiniteNumber(o.heightMm, 120, 20, 4000),
      depthMm: toFiniteNumber(o.depthMm ?? o.protrusionMm, 60, 10, 600),
    });
  }
  const sc =
    r.slopedCeiling && typeof r.slopedCeiling === 'object'
      ? (r.slopedCeiling as Record<string, unknown>)
      : null;
  const slopedCeiling: RoomConfig['slopedCeiling'] = {
    enabled: Boolean(sc?.enabled),
    side: sc?.side === 'left' ? 'left' : 'right',
    kneeWallHeightMm: toFiniteNumber(sc?.kneeWallHeightMm, 1350, 200, 3500),
    slopeWidthMm: toFiniteNumber(sc?.slopeWidthMm, 1600, 200, 6000),
  };

  let floorPoints: RoomVertex[] | undefined;
  if (Array.isArray(r.floorPoints) && r.floorPoints.length >= 3) {
    const pts: RoomVertex[] = [];
    for (let i = 0; i < Math.min(r.floorPoints.length, 32); i++) {
      const v = r.floorPoints[i];
      if (!v || typeof v !== 'object') continue;
      const vo = v as Record<string, unknown>;
      pts.push({
        id: typeof vo.id === 'string' && vo.id.trim() ? vo.id.trim() : `v_${i}`,
        xMm: toFiniteNumber(vo.xMm, 0, -20000, 20000),
        zMm: toFiniteNumber(vo.zMm, 0, -20000, 20000),
      });
    }
    if (pts.length >= 3) floorPoints = pts;
  }

  const maxWalls = floorPoints ? floorPoints.length : 4;

  const openings: RoomOpening[] = [];
  if (Array.isArray(r.openings)) {
    for (let i = 0; i < Math.min(r.openings.length, 40); i++) {
      const item = r.openings[i];
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const type: RoomOpeningType =
        typeof o.type === 'string' && VALID_OPENING_TYPES.has(o.type as RoomOpeningType)
          ? (o.type as RoomOpeningType)
          : 'window';
      const wallIndex = Math.round(toFiniteNumber(o.wallIndex, 0, 0, Math.max(0, maxWalls - 1)));
      openings.push({
        id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `op_${i}`,
        type,
        label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 40) : type,
        wallIndex,
        offsetMm: toFiniteNumber(o.offsetMm, 200, 0, 20000),
        widthMm: toFiniteNumber(o.widthMm, 900, 300, 6000),
        heightMm: toFiniteNumber(o.heightMm, 2050, 300, 4000),
        sillHeightMm: toFiniteNumber(o.sillHeightMm, type === 'window' ? 880 : 0, 0, 3500),
        swingInward: o.swingInward !== false,
        hingeSide: o.hingeSide === 'right' ? 'right' : 'left',
      });
    }
  }

  const wallObstacles: RoomWallObstacle[] = [];
  if (Array.isArray(r.wallObstacles)) {
    for (let i = 0; i < Math.min(r.wallObstacles.length, 60); i++) {
      const item = r.wallObstacles[i];
      if (!item || typeof item !== 'object') continue;
      const o = item as Record<string, unknown>;
      const type: RoomWallObstacleType =
        typeof o.type === 'string' && VALID_WALL_OBSTACLE_TYPES.has(o.type as RoomWallObstacleType)
          ? (o.type as RoomWallObstacleType)
          : 'socket';
      const wallIndex = Math.round(toFiniteNumber(o.wallIndex, 0, 0, Math.max(0, maxWalls - 1)));
      wallObstacles.push({
        id: typeof o.id === 'string' && o.id.trim() ? o.id.trim() : `wobs_${i}`,
        type,
        label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 40) : type,
        wallIndex,
        offsetMm: toFiniteNumber(o.offsetMm, 200, 0, 20000),
        elevationMm: toFiniteNumber(o.elevationMm, 300, 0, 4000),
        widthMm: toFiniteNumber(o.widthMm, 160, 30, 4000),
        heightMm: toFiniteNumber(o.heightMm, 90, 30, 4000),
        depthMm: toFiniteNumber(o.depthMm, 30, 10, 600),
      });
    }
  }

  const hiddenWallIndices = Array.isArray(r.hiddenWallIndices)
    ? r.hiddenWallIndices
        .map((n) => Math.round(Number(n)))
        .filter((n) => Number.isFinite(n) && n >= 0 && n < maxWalls)
    : [];

  const rawStyle =
    r.style && typeof r.style === 'object' ? (r.style as Record<string, unknown>) : null;
  const style: RoomStyle = {
    wallFinish:
      typeof rawStyle?.wallFinish === 'string' &&
      VALID_WALL_FINISHES.has(rawStyle.wallFinish as RoomWallFinish)
        ? (rawStyle.wallFinish as RoomWallFinish)
        : DEFAULT_ROOM_STYLE.wallFinish,
    floorFinish:
      typeof rawStyle?.floorFinish === 'string' &&
      VALID_FLOOR_FINISHES.has(rawStyle.floorFinish as RoomFloorFinish)
        ? (rawStyle.floorFinish as RoomFloorFinish)
        : DEFAULT_ROOM_STYLE.floorFinish,
    showBaseboards:
      rawStyle?.showBaseboards !== undefined
        ? Boolean(rawStyle.showBaseboards)
        : DEFAULT_ROOM_STYLE.showBaseboards,
    baseboardHeightMm: toFiniteNumber(
      rawStyle?.baseboardHeightMm,
      DEFAULT_ROOM_STYLE.baseboardHeightMm,
      30,
      200
    ),
    wallCutawayMode:
      typeof rawStyle?.wallCutawayMode === 'string' &&
      VALID_CUTAWAY_MODES.has(rawStyle.wallCutawayMode as RoomCutawayMode)
        ? (rawStyle.wallCutawayMode as RoomCutawayMode)
        : DEFAULT_ROOM_STYLE.wallCutawayMode,
  };

  return {
    enabled: Boolean(r.enabled),
    widthMm: toFiniteNumber(r.widthMm, 3400, 600, 20000),
    heightMm: toFiniteNumber(r.heightMm, 2600, 1200, 5000),
    depthMm: toFiniteNumber(r.depthMm, 2800, 400, 20000),
    backWallZMm: toFiniteNumber(r.backWallZMm, -340, -15000, 15000),
    showLeftWall: r.showLeftWall !== false,
    showRightWall: r.showRightWall !== false,
    showBackWall: r.showBackWall !== false,
    showCeiling: Boolean(r.showCeiling),
    slopedCeiling,
    obstacles,
    floorPoints,
    wallThicknessMm: toFiniteNumber(r.wallThicknessMm, 120, 50, 400),
    hiddenWallIndices,
    openings,
    wallObstacles,
    style,
  };
}

function sanitizeCutouts(raw: unknown): PartCutout[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: PartCutout[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (!item || typeof item !== 'object') continue;
    const c = item as Record<string, unknown>;
    const shape = c.shape === 'circle' ? 'circle' : 'rect';
    out.push({
      id: typeof c.id === 'string' && c.id.trim() ? c.id.trim() : `cut_${i}`,
      shape,
      xMm: toFiniteNumber(c.xMm, 0, -5000, 5000),
      yMm: toFiniteNumber(c.yMm, 0, -5000, 5000),
      widthMm: toFiniteNumber(c.widthMm, 120, 10, 4000),
      heightMm: toFiniteNumber(c.heightMm, 120, 10, 4000),
      diameterMm: shape === 'circle' ? toFiniteNumber(c.diameterMm, 60, 10, 2000) : undefined,
      label: typeof c.label === 'string' ? c.label.slice(0, 40) : undefined,
    });
  }
  return out.length > 0 ? out : undefined;
}

function sanitizeDadoGroove(raw: unknown): DadoGrooveConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  if (!g.enabled) return undefined;
  const edge = g.edge === 'bottom' || g.edge === 'top' ? g.edge : 'back';
  return {
    enabled: true,
    edge,
    insetMm: toFiniteNumber(g.insetMm, 16, 4, 80),
    widthMm: toFiniteNumber(g.widthMm, 4, 2, 20),
    depthMm: toFiniteNumber(g.depthMm, 8, 2, 16),
  };
}

function sanitizeMiter45(raw: unknown): MiterEdgesConfig | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const m = raw as Record<string, unknown>;
  const res: MiterEdgesConfig = {
    left: Boolean(m.left),
    right: Boolean(m.right),
    top: Boolean(m.top),
    bottom: Boolean(m.bottom),
  };
  return res.left || res.right || res.top || res.bottom ? res : undefined;
}

export function sanitizeImportedProject(
  raw: unknown
): { project: FurnitureProject | null; error?: string } {
  if (!raw || typeof raw !== 'object') {
    return { project: null, error: 'Plik JSON nie zawiera poprawnego obiektu projektu.' };
  }
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.parts)) {
    return { project: null, error: 'Brak tablicy elementów (parts) w pliku projektu.' };
  }

  const sanitizedParts: FurniturePart[] = [];
  const seenPartIds = new Set<string>();

  for (let i = 0; i < obj.parts.length; i++) {
    const rawPart = obj.parts[i];
    if (!rawPart || typeof rawPart !== 'object') continue;
    const p = rawPart as Record<string, unknown>;

    const rawId = typeof p.id === 'string' && p.id.trim() ? p.id.trim() : `part-${Date.now()}-${i}`;
    const id = seenPartIds.has(rawId) ? `${rawId}-${i}` : rawId;
    seenPartIds.add(id);

    const name =
      typeof p.name === 'string' && p.name.trim()
        ? p.name.trim().slice(0, 80)
        : `Element ${i + 1}`;

    const rawKind = typeof p.kind === 'string' ? (p.kind as PartKind) : 'panel';
    const customPolygon = sanitizePolygon(p.customPolygon);
    const kind: PartKind = VALID_KINDS.has(rawKind)
      ? rawKind === 'custom' && !customPolygon
        ? 'panel'
        : rawKind
      : 'panel';

    const rawMat = typeof p.materialId === 'string' ? (p.materialId as MaterialId) : 'osb3';
    const materialId: MaterialId =
      rawMat in MATERIAL_MAP || rawMat.startsWith('custom_mat_') ? rawMat : 'osb3';

    const width = toFiniteNumber(p.width, 600, 2, 10000);
    const height = toFiniteNumber(p.height, 400, 2, 10000);
    const depth = toFiniteNumber(p.depth, 18, 2, 10000);
    const position = toVec3(p.position, [0, height / 2, 0], -20000, 20000);
    const rotation = toVec3(p.rotation, [0, 0, 0], -360, 360);

    const handleSide =
      typeof p.handleSide === 'string' && VALID_HANDLES.has(p.handleSide as HandleSide)
        ? (p.handleSide as HandleSide)
        : undefined;

    const part: FurniturePart = {
      id,
      name,
      kind,
      materialId,
      width,
      height,
      depth,
      position,
      rotation,
      slopeTopLeft: p.slopeTopLeft !== undefined ? toFiniteNumber(p.slopeTopLeft, 0, 0, height - 10) : undefined,
      slopeTopRight: p.slopeTopRight !== undefined ? toFiniteNumber(p.slopeTopRight, 0, 0, height - 10) : undefined,
      slopeBottomLeft: p.slopeBottomLeft !== undefined ? toFiniteNumber(p.slopeBottomLeft, 0, 0, height - 10) : undefined,
      slopeBottomRight: p.slopeBottomRight !== undefined ? toFiniteNumber(p.slopeBottomRight, 0, 0, height - 10) : undefined,
      handleSide,
      handleStyle:
        typeof p.handleStyle === 'string' && VALID_HANDLE_STYLES.has(p.handleStyle as HandleStyle)
          ? (p.handleStyle as HandleStyle)
          : undefined,
      grainRotated: Boolean(p.grainRotated),
      system32ShelfHoles: p.system32ShelfHoles ? true : undefined,
      slidingDirection:
        p.slidingDirection === 'left' || p.slidingDirection === 'right'
          ? p.slidingDirection
          : undefined,
      slidingTravelMm:
        p.slidingTravelMm !== undefined
          ? toFiniteNumber(p.slidingTravelMm, 400, 40, 3000)
          : undefined,
      customPolygon: kind === 'custom' ? customPolygon : undefined,
      edgeBanding: sanitizeEdgeBanding(p.edgeBanding),
      groupId:
        typeof p.groupId === 'string' && p.groupId.trim()
          ? p.groupId.trim().slice(0, 40)
          : undefined,
      surfaceFinish:
        typeof p.surfaceFinish === 'string' && VALID_FINISHES.has(p.surfaceFinish as SurfaceFinish)
          ? (p.surfaceFinish as SurfaceFinish)
          : undefined,
      cornerRadiusMm:
        p.cornerRadiusMm !== undefined
          ? toFiniteNumber(p.cornerRadiusMm, 0, 0, 250) || undefined
          : undefined,
      cutouts: sanitizeCutouts(p.cutouts),
      dadoGroove: sanitizeDadoGroove(p.dadoGroove),
      ledGroove: sanitizeLedGroove(p.ledGroove),
      miter45: sanitizeMiter45(p.miter45),
      hingeSide:
        typeof p.hingeSide === 'string' && VALID_HANDLES.has(p.hingeSide as HandleSide)
          ? (p.hingeSide as HandleSide)
          : undefined,
      hingeCount:
        p.hingeCount !== undefined
          ? Math.round(toFiniteNumber(p.hingeCount, 0, 0, 6)) || undefined
          : undefined,
      drawerSlideType:
        typeof p.drawerSlideType === 'string' &&
        VALID_SLIDES.has(p.drawerSlideType as DrawerSlideType)
          ? (p.drawerSlideType as DrawerSlideType)
          : undefined,
      hardwareTag:
        typeof p.hardwareTag === 'string' && VALID_HW_TAGS.has(p.hardwareTag)
          ? (p.hardwareTag as FurniturePart['hardwareTag'])
          : undefined,
      applianceModel:
        typeof p.applianceModel === 'string' &&
        VALID_APPLIANCES.has(p.applianceModel as ApplianceModel)
          ? (p.applianceModel as ApplianceModel)
          : undefined,
      appliancePricePln:
        p.appliancePricePln !== undefined
          ? toFiniteNumber(p.appliancePricePln, 0, 0, 100000)
          : undefined,
    };

    sanitizedParts.push(part);
  }

  const sanitizedFasteners: Fastener[] = [];
  if (Array.isArray(obj.fasteners)) {
    const seenFastenerIds = new Set<string>();
    for (let i = 0; i < obj.fasteners.length; i++) {
      const rawF = obj.fasteners[i];
      if (!rawF || typeof rawF !== 'object') continue;
      const f = rawF as Record<string, unknown>;
      const partId = typeof f.partId === 'string' ? f.partId : '';
      if (!seenPartIds.has(partId)) continue;

      const rawType = typeof f.type === 'string' ? (f.type as ScrewType) : 'wood_4x45';
      const type: ScrewType = rawType in SCREW_MAP ? rawType : 'wood_4x45';

      const rawId = typeof f.id === 'string' && f.id.trim() ? f.id.trim() : `f-${Date.now()}-${i}`;
      const id = seenFastenerIds.has(rawId) ? `${rawId}-${i}` : rawId;
      seenFastenerIds.add(id);

      const localPosition = toVec3(f.localPosition, [0, 0, 0], -10000, 10000);
      const localNormal = toVec3(f.localNormal, [0, 0, 1], -1, 1);
      const nLen = Math.hypot(localNormal[0], localNormal[1], localNormal[2]);
      const normalizedNormal: [number, number, number] =
        nLen > 1e-4 ? [localNormal[0] / nLen, localNormal[1] / nLen, localNormal[2] / nLen] : [0, 0, 1];

      const targetPartId =
        typeof f.targetPartId === 'string' && seenPartIds.has(f.targetPartId)
          ? f.targetPartId
          : undefined;
      const jointAxis =
        f.jointAxis === 'x' || f.jointAxis === 'y' || f.jointAxis === 'z'
          ? f.jointAxis
          : undefined;
      const jointParamU =
        typeof f.jointParamU === 'number' && Number.isFinite(f.jointParamU)
          ? Math.max(0, Math.min(1, f.jointParamU))
          : undefined;

      sanitizedFasteners.push({
        id,
        partId,
        type,
        localPosition,
        localNormal: normalizedNormal,
        targetPartId,
        jointAxis,
        jointParamU,
      });
    }
  }

  const activeGroupIds = new Set(
    sanitizedParts.map((p) => p.groupId).filter((g): g is string => Boolean(g))
  );
  let cabinetConfigs: Record<string, ParametricCabinetConfig> | undefined;
  if (obj.cabinetConfigs && typeof obj.cabinetConfigs === 'object') {
    const rawMap = obj.cabinetConfigs as Record<string, unknown>;
    const cleaned: Record<string, ParametricCabinetConfig> = {};
    for (const [gid, rawCfg] of Object.entries(rawMap)) {
      if (!activeGroupIds.has(gid) || !rawCfg || typeof rawCfg !== 'object') continue;
      const c = rawCfg as Partial<ParametricCabinetConfig>;
      if (typeof c.preset === 'string' && typeof c.widthMm === 'number' && typeof c.heightMm === 'number') {
        cleaned[gid] = {
          ...(c as ParametricCabinetConfig),
          name: typeof c.name === 'string' ? c.name.slice(0, 60) : gid,
          widthMm: toFiniteNumber(c.widthMm, 800, 200, 4000),
          heightMm: toFiniteNumber(c.heightMm, 820, 200, 3200),
          depthMm: toFiniteNumber(c.depthMm, 560, 180, 1200),
          boardThicknessMm: toFiniteNumber(c.boardThicknessMm, 18, 12, 38),
        };
      }
    }
    if (Object.keys(cleaned).length > 0) {
      cabinetConfigs = cleaned;
    }
  }

  const project: FurnitureProject = {
    id:
      typeof obj.id === 'string' && obj.id.trim()
        ? obj.id.trim().slice(0, 80)
        : `proj-${Date.now()}`,
    name:
      typeof obj.name === 'string' && obj.name.trim()
        ? obj.name.trim().slice(0, 80)
        : 'Zaimportowany projekt',
    parts: sanitizedParts,
    fasteners: sanitizedFasteners,
    room: sanitizeRoomConfig(obj.room),
    cabinetConfigs,
    updatedAt: typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt) ? obj.updatedAt : Date.now(),
  };

  return { project };
}

function isAutoSeededWarehouseStarter(project: FurnitureProject): boolean {
  if (project.id !== 'proj_warehouse_sloped') return false;
  if (project.room?.enabled) return false;
  return project.name === 'Regał magazynowy ze skosem OSB';
}

export function loadProjectStore(defaultFactory: () => FurnitureProject): ProjectStoreState {
  try {
    const rawV2 = localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as {
        activeProjectId?: unknown;
        projects?: unknown[];
      };
      if (Array.isArray(parsed.projects) && parsed.projects.length > 0) {
        const cleanProjects: FurnitureProject[] = [];
        let cleanedLegacyStarter = false;
        for (const item of parsed.projects) {
          const { project } = sanitizeImportedProject(item);
          if (!project) continue;
          if (isAutoSeededWarehouseStarter(project)) {
            cleanedLegacyStarter = true;
            continue;
          }
          cleanProjects.push(project);
        }
        if (cleanProjects.length > 0) {
          const activeId =
            typeof parsed.activeProjectId === 'string' &&
            cleanProjects.some((p) => p.id === parsed.activeProjectId)
              ? parsed.activeProjectId
              : cleanProjects[0].id;
          const store: ProjectStoreState = { activeProjectId: activeId, projects: cleanProjects };
          if (cleanedLegacyStarter) {
            saveProjectStore(store);
          }
          return store;
        }
        if (cleanedLegacyStarter) {
          const blank = defaultFactory();
          blank.updatedAt = Date.now();
          const blankStore: ProjectStoreState = {
            activeProjectId: blank.id,
            projects: [blank],
          };
          saveProjectStore(blankStore);
          return blankStore;
        }
      }
    }

    // Migrate legacy single project v1 if present
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const { project } = sanitizeImportedProject(JSON.parse(rawV1));
      if (project) {
        const finalProject = isAutoSeededWarehouseStarter(project)
          ? { ...defaultFactory(), updatedAt: Date.now() }
          : project;
        const migrated: ProjectStoreState = {
          activeProjectId: finalProject.id,
          projects: [finalProject],
        };
        saveProjectStore(migrated);
        return migrated;
      }
    }
  } catch {
    // fallback to default
  }

  const initial = defaultFactory();
  initial.updatedAt = Date.now();
  return {
    activeProjectId: initial.id,
    projects: [initial],
  };
}

export function saveProjectStore(store: ProjectStoreState): boolean {
  try {
    localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(store));
    return true;
  } catch {
    return false;
  }
}

export function loadQuoteSettings(): QuoteSettings {
  try {
    const raw = localStorage.getItem(QUOTE_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_QUOTE_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<QuoteSettings>;
    return {
      ...DEFAULT_QUOTE_SETTINGS,
      ...parsed,
      vatPercent: parsed.vatPercent === 8 ? 8 : 23,
    };
  } catch {
    return { ...DEFAULT_QUOTE_SETTINGS };
  }
}

export function saveQuoteSettings(settings: QuoteSettings): void {
  try {
    localStorage.setItem(QUOTE_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage quota errors
  }
}

/* ==================== IndexedDB for Custom Textures ==================== */

function openTexturesDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_TEXTURES_STORE)) {
          db.createObjectStore(IDB_TEXTURES_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

export async function loadSavedCustomTextures(): Promise<Partial<Record<MaterialId, string>>> {
  const db = await openTexturesDb();
  if (!db) return {};
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_TEXTURES_STORE, 'readonly');
      const store = tx.objectStore(IDB_TEXTURES_STORE);
      const req = store.openCursor();
      const result: Partial<Record<MaterialId, string>> = {};
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          const key = String(cursor.key) as MaterialId;
          if ((key in MATERIAL_MAP || key.startsWith('custom_mat_')) && typeof cursor.value === 'string') {
            result[key] = cursor.value;
          }
          cursor.continue();
        } else {
          db.close();
          resolve(result);
        }
      };
      req.onerror = () => {
        db.close();
        resolve({});
      };
    } catch {
      db.close();
      resolve({});
    }
  });
}

export async function persistCustomTexture(
  materialId: MaterialId,
  dataUrl: string | null
): Promise<void> {
  const db = await openTexturesDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_TEXTURES_STORE, 'readwrite');
      const store = tx.objectStore(IDB_TEXTURES_STORE);
      if (dataUrl) {
        store.put(dataUrl, materialId);
      } else {
        store.delete(materialId);
      }
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}

/**
 * Downscales large phone camera photos (e.g. 4000x3000) to <= 1024px JPEG
 * so GPU VRAM and IndexedDB stay fast on mobile browsers.
 */
export function compressTextureDataUrl(
  rawDataUrl: string,
  maxDimension = 1024,
  quality = 0.86
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        resolve(rawDataUrl);
        return;
      }
      const scale = Math.min(1, maxDimension / Math.max(w, h));
      const targetW = Math.max(64, Math.round(w * scale));
      const targetH = Math.max(64, Math.round(h * scale));
      const canvas = document.createElement('canvas');
      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(rawDataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, targetW, targetH);
      try {
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch {
        resolve(rawDataUrl);
      }
    };
    img.onerror = () => resolve(rawDataUrl);
    img.src = rawDataUrl;
  });
}

/** Loads persisted user warehouse materials & built-in price/sheet overrides */
export function loadMaterialsConfig(): MaterialsCatalogConfig {
  try {
    const raw = localStorage.getItem(MATERIALS_CATALOG_KEY);
    if (!raw) return { customMaterials: [], builtInOverrides: {} };
    const parsed = JSON.parse(raw) as Partial<MaterialsCatalogConfig>;
    const customMaterials: MaterialMeta[] = Array.isArray(parsed.customMaterials)
      ? parsed.customMaterials
          .filter(
            (m): m is MaterialMeta =>
              Boolean(m && typeof m.id === 'string' && typeof m.name === 'string')
          )
          .map((m) => ({
            id: m.id,
            name: String(m.name).slice(0, 60),
            shortName: String(m.shortName || m.name).slice(0, 22),
            category:
              m.category === 'Płyty konstrukcyjne' ||
              m.category === 'Blaty' ||
              m.category === 'Stal i szkło'
                ? m.category
                : 'Płyty meblowe',
            defaultThicknessMm: toFiniteNumber(m.defaultThicknessMm, 18, 3, 60),
            sheetWidthMm: toFiniteNumber(m.sheetWidthMm, 2800, 500, 6000),
            sheetHeightMm: toFiniteNumber(m.sheetHeightMm, 2070, 500, 4000),
            pricePerM2Pln: toFiniteNumber(m.pricePerM2Pln, 85, 1, 5000),
            swatchFallbackHex:
              typeof m.swatchFallbackHex === 'string' && /^#[0-9A-Fa-f]{6}$/.test(m.swatchFallbackHex)
                ? m.swatchFallbackHex
                : '#B89B72',
            isCustom: true,
            grainDirectional: Boolean(m.grainDirectional),
          }))
      : [];
    const builtInOverrides =
      parsed.builtInOverrides && typeof parsed.builtInOverrides === 'object'
        ? parsed.builtInOverrides
        : {};
    return { customMaterials, builtInOverrides };
  } catch {
    return { customMaterials: [], builtInOverrides: {} };
  }
}

export function saveMaterialsConfig(config: MaterialsCatalogConfig): void {
  try {
    localStorage.setItem(MATERIALS_CATALOG_KEY, JSON.stringify(config));
  } catch {
    // Ignore quota errors
  }
}

/** Loads persisted workshop offcut remnants (magazyn odpadów płytowych) */
export function loadOffcuts(): OffcutRemnant[] {
  try {
    const raw = localStorage.getItem(OFFCUTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item, idx) => ({
        id: typeof item.id === 'string' && item.id.trim() ? item.id : `offcut_${idx}_${Date.now()}`,
        materialId: (typeof item.materialId === 'string' ? item.materialId : 'white_matte') as MaterialId,
        thicknessMm: Math.round(toFiniteNumber(item.thicknessMm, 18, 3, 60)),
        lengthMm: Math.round(toFiniteNumber(item.lengthMm, 1000, 120, 6000)),
        widthMm: Math.round(toFiniteNumber(item.widthMm, 600, 80, 3000)),
        quantity: Math.round(toFiniteNumber(item.quantity, 1, 1, 50)),
        label: typeof item.label === 'string' && item.label.trim() ? item.label.trim().slice(0, 40) : undefined,
      }));
  } catch {
    return [];
  }
}

export function saveOffcuts(offcuts: OffcutRemnant[]): void {
  try {
    localStorage.setItem(OFFCUTS_STORAGE_KEY, JSON.stringify(offcuts));
  } catch {
    // Ignore quota errors
  }
}


