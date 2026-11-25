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
  type MaterialId,
  type MaterialMeta,
  type MaterialsCatalogConfig,
  type MiterEdgesConfig,
  type PartCutout,
  type PartKind,
  type QuoteSettings,
  type ScrewType,
  type SurfaceFinish,
} from '../types/furniture';

const LEGACY_STORAGE_KEY = 'stolarz3d_project_v1';
const PROJECTS_STORAGE_KEY = 'stolarz3d_projects_v2';
const QUOTE_SETTINGS_KEY = 'stolarz3d_quote_settings_v1';
const MATERIALS_CATALOG_KEY = 'stolarz3d_materials_catalog_v1';

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
const VALID_SLIDES = new Set<DrawerSlideType>(['none', 'ball_26mm', 'undermount_blum']);
const VALID_HW_TAGS = new Set(['leg', 'drawer_front', 'drawer_box', 'door_overlay', 'door_inset']);

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

    const width = toFiniteNumber(p.width, 600, 4, 10000);
    const height = toFiniteNumber(p.height, 400, 4, 10000);
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
      grainRotated: Boolean(p.grainRotated),
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
    updatedAt: typeof obj.updatedAt === 'number' && Number.isFinite(obj.updatedAt) ? obj.updatedAt : Date.now(),
  };

  return { project };
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
        for (const item of parsed.projects) {
          const { project } = sanitizeImportedProject(item);
          if (project) cleanProjects.push(project);
        }
        if (cleanProjects.length > 0) {
          const activeId =
            typeof parsed.activeProjectId === 'string' &&
            cleanProjects.some((p) => p.id === parsed.activeProjectId)
              ? parsed.activeProjectId
              : cleanProjects[0].id;
          return { activeProjectId: activeId, projects: cleanProjects };
        }
      }
    }

    // Migrate legacy single project v1 if present
    const rawV1 = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (rawV1) {
      const { project } = sanitizeImportedProject(JSON.parse(rawV1));
      if (project) {
        const migrated: ProjectStoreState = {
          activeProjectId: project.id,
          projects: [project],
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

