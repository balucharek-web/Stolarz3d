import { FurniturePart, MaterialId, MaterialMeta, getMaterialMeta } from '../types/furniture';

export type MaterialFamily =
  | 'osb'
  | 'plywood'
  | 'styrofoam'
  | 'mineral_wool'
  | 'roofing'
  | 'timber'
  | 'plank'
  | 'furniture_board'
  | 'hdf'
  | 'countertop'
  | 'steel'
  | 'glass';

export type ElementOrientation = 'vertical' | 'horizontal';

export interface MaterialCatalogParams {
  thicknessMm: number;
  lengthMm: number;
  depthMm: number;
  orientation: ElementOrientation;
}

export interface MaterialFamilyConfig {
  family: MaterialFamily;
  title: string;
  subtitle: string;
  thicknessLabel?: string;
  thicknessOptions?: number[];
  defaultThicknessMm: number;
  lengthLabel?: string;
  lengthOptions?: number[];
  defaultLengthMm: number;
  depthLabel?: string;
  depthOptions?: number[];
  defaultDepthMm: number;
  supportsOrientation?: boolean;
  defaultOrientation: ElementOrientation;
}

export type CatalogItemBadgeTone = 'amber' | 'sky' | 'emerald' | 'zinc';

export interface MaterialPresetItem {
  id: string;
  label: string;
  desc: string;
  badge?: string;
  badgeTone?: CatalogItemBadgeTone;
  /** Icon hint rendered by AddPartDrawer */
  iconKind: 'sheet' | 'panel_vert' | 'beam' | 'plank' | 'insulation' | 'roof' | 'slope' | 'door' | 'countertop' | 'bracket' | 'profile' | 'glass';
  tags: string[];
  /** Material shown when added via global search */
  defaultMaterialId?: MaterialId;
  /** Live dimension label formatted from current params */
  formatDims: (params: MaterialCatalogParams) => string;
  /** Builds the exact FurniturePart blueprint */
  build: (materialId: MaterialId, params: MaterialCatalogParams) => Omit<FurniturePart, 'id'>;
}

export interface MaterialPresetSection {
  id: string;
  title: string;
  subtitle: string;
  items: MaterialPresetItem[];
}

// ==================== 3D CARPENTRY CONNECTOR POLYGONS (mm, CCW) ====================

/** L-shaped galvanized steel angle bracket extruded along depth (Z) */
function makeLBracketPolygon(legX: number, legY: number, wallT = 4): [number, number][] {
  const hx = legX / 2;
  const hy = legY / 2;
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, -hy + wallT],
    [-hx + wallT, -hy + wallT],
    [-hx + wallT, hy],
    [-hx, hy],
  ];
}

/** U-shaped joist hanger / post base saddle extruded along depth (Z) */
function makeUBracketPolygon(outerW: number, outerH: number, wallT = 4): [number, number][] {
  const hx = outerW / 2;
  const hy = outerH / 2;
  return [
    [-hx, -hy],
    [hx, -hy],
    [hx, hy],
    [hx - wallT, hy],
    [hx - wallT, -hy + wallT],
    [-hx + wallT, -hy + wallT],
    [-hx + wallT, hy],
    [-hx, hy],
  ];
}

/** T-shaped flat carpentry joining plate extruded along depth (Z) */
function makeTPlatePolygon(totalW: number, totalH: number, stemW = 40, barH = 40): [number, number][] {
  const hx = totalW / 2;
  const hy = totalH / 2;
  const hs = stemW / 2;
  const barBottom = hy - barH;
  return [
    [-hs, -hy],
    [hs, -hy],
    [hs, barBottom],
    [hx, barBottom],
    [hx, hy],
    [-hx, hy],
    [-hx, barBottom],
    [-hs, barBottom],
  ];
}

// ==================== FAMILY RESOLUTION & PARAMETER SCHEMAS ====================

export function resolveMaterialFamily(meta: MaterialMeta): MaterialFamily {
  switch (meta.id) {
    case 'osb3':
      return 'osb';
    case 'birch_plywood':
      return 'plywood';
    case 'styrofoam_eps':
      return 'styrofoam';
    case 'mineral_wool':
      return 'mineral_wool';
    case 'roof_shingle':
      return 'roofing';
    case 'pine_timber':
    case 'larch_impregnated':
      return 'timber';
    case 'spruce_plank':
      return 'plank';
    case 'hdf_white':
    case 'hdf_black':
      return 'hdf';
    case 'concrete_top':
      return 'countertop';
    case 'steel_black':
    case 'steel_galv':
      return 'steel';
    case 'glass_clear':
      return 'glass';
    default:
      break;
  }

  // Smart fallback for custom user-added warehouse materials
  switch (meta.category) {
    case 'Płyty konstrukcyjne':
      return 'plywood';
    case 'Izolacja i dach':
      return meta.defaultThicknessMm >= 20 ? 'styrofoam' : 'roofing';
    case 'Budowa i ogród':
      return meta.defaultThicknessMm <= 30 && meta.sheetHeightMm >= 120 ? 'plank' : 'timber';
    case 'Blaty':
      return 'countertop';
    case 'Stal i szkło':
      return meta.barLengthMm ? 'steel' : 'glass';
    case 'Płyty meblowe':
    default:
      return meta.defaultThicknessMm <= 6 ? 'hdf' : 'furniture_board';
  }
}

export function getMaterialFamilyConfig(meta: MaterialMeta): MaterialFamilyConfig {
  const family = resolveMaterialFamily(meta);
  const defT = Math.max(3, Math.round(meta.defaultThicknessMm || 18));

  switch (family) {
    case 'osb':
      return {
        family,
        title: 'Płyta OSB-3 — arkusze i formatki',
        subtitle: `Format handlowy ${meta.sheetWidthMm} × ${meta.sheetHeightMm} mm · wybierz grubość płyty`,
        thicknessLabel: 'Grubość OSB-3',
        thicknessOptions: [10, 12, 15, 18, 22, 25],
        defaultThicknessMm: [10, 12, 15, 18, 22, 25].includes(defT) ? defT : 18,
        defaultLengthMm: 2500,
        defaultDepthMm: 1250,
        defaultOrientation: 'horizontal',
      };
    case 'plywood':
      return {
        family,
        title: `${meta.name} — grubości i formatki`,
        subtitle: `Format handlowy ${meta.sheetWidthMm} × ${meta.sheetHeightMm} mm · sklejka suchotrwała / wodoodporna`,
        thicknessLabel: 'Grubość sklejki',
        thicknessOptions: [6, 9, 12, 15, 18, 21, 24],
        defaultThicknessMm: [6, 9, 12, 15, 18, 21, 24].includes(defT) ? defT : 18,
        defaultLengthMm: 2500,
        defaultDepthMm: 1250,
        defaultOrientation: 'horizontal',
      };
    case 'styrofoam':
      return {
        family,
        title: 'Styropian EPS — grubości i płyty izolacyjne',
        subtitle: 'Standard handlowy 1000 × 500 mm · elewacja, ściany, podłoga i dach',
        thicknessLabel: 'Grubość styropianu',
        thicknessOptions: [20, 30, 40, 50, 80, 100, 120, 150, 200],
        defaultThicknessMm: [20, 30, 40, 50, 80, 100, 120, 150, 200].includes(defT) ? defT : 50,
        defaultLengthMm: 1000,
        defaultDepthMm: 500,
        defaultOrientation: 'vertical',
      };
    case 'mineral_wool':
      return {
        family,
        title: 'Wełna mineralna — grubości i płyty',
        subtitle: 'Płyty ścienne 1000 × 600 mm i międzykrokwiowe 1200 × 600 mm',
        thicknessLabel: 'Grubość wełny',
        thicknessOptions: [50, 80, 100, 120, 150, 180, 200],
        defaultThicknessMm: [50, 80, 100, 120, 150, 180, 200].includes(defT) ? defT : 100,
        defaultLengthMm: 1200,
        defaultDepthMm: 600,
        defaultOrientation: 'vertical',
      };
    case 'roofing':
      return {
        family,
        title: 'Papa termozgrzewalna i gont bitumiczny',
        subtitle: 'Pokrycia połaci dachowych, pasy podrynnowe i obróbki kalenicy',
        lengthLabel: 'Długość pasa / połaci',
        lengthOptions: [1000, 1500, 2000, 2500, 3000],
        defaultThicknessMm: 5,
        defaultLengthMm: 2000,
        defaultDepthMm: 1000,
        defaultOrientation: 'horizontal',
      };
    case 'timber':
      return {
        family,
        title: `${meta.name} — przekroje i złącza ciesielskie`,
        subtitle: `Rozkrój liniowy (sztanga ${meta.barLengthMm ?? 3000} mm) · wybierz długość i kierunek`,
        lengthLabel: 'Długość kantówki / belki',
        lengthOptions: [600, 1000, 1500, 2000, 2500, 3000],
        defaultThicknessMm: defT,
        defaultLengthMm: 2000,
        defaultDepthMm: defT,
        supportsOrientation: true,
        defaultOrientation: 'vertical',
      };
    case 'plank':
      return {
        family,
        title: 'Deski elewacyjne, tarasowe i boazeria',
        subtitle: 'Dobierz długość, grubość i układ (poziomo / pionowo)',
        thicknessLabel: 'Grubość deski',
        thicknessOptions: [14, 19, 22, 25, 28],
        defaultThicknessMm: [14, 19, 22, 25, 28].includes(defT) ? defT : 19,
        lengthLabel: 'Długość deski',
        lengthOptions: [1000, 1500, 2000, 2400, 3000],
        defaultLengthMm: 2000,
        defaultDepthMm: 145,
        supportsOrientation: true,
        defaultOrientation: 'horizontal',
      };
    case 'hdf':
      return {
        family,
        title: `${meta.name} — plecy i dna szuflad`,
        subtitle: `Arkusz ${meta.sheetWidthMm} × ${meta.sheetHeightMm} mm · lekkie płyty HDF`,
        thicknessLabel: 'Grubość HDF',
        thicknessOptions: [3, 4, 5],
        defaultThicknessMm: [3, 4, 5].includes(defT) ? defT : 3,
        defaultLengthMm: 2800,
        defaultDepthMm: 2070,
        defaultOrientation: 'vertical',
      };
    case 'countertop':
      return {
        family,
        title: `${meta.name} — blaty kuchenne i robocze`,
        subtitle: 'Standardowe odcinki, wyspy kuchenne i panele przyścienne',
        thicknessLabel: 'Grubość blatu',
        thicknessOptions: [28, 38, 40],
        defaultThicknessMm: [28, 38, 40].includes(defT) ? defT : 38,
        depthLabel: 'Głębokość blatu',
        depthOptions: [600, 650, 800, 900],
        defaultLengthMm: 1200,
        defaultDepthMm: 600,
        defaultOrientation: 'horizontal',
      };
    case 'steel':
      return {
        family,
        title: `${meta.name} — profile stalowe i złącza 3D`,
        subtitle: `Profile zamknięte (sztanga ${meta.barLengthMm ?? 6000} mm) oraz złącza budowlane`,
        lengthLabel: 'Długość profilu',
        lengthOptions: [600, 800, 1000, 1600, 2000, 3000],
        defaultThicknessMm: 40,
        defaultLengthMm: 1600,
        defaultDepthMm: 40,
        supportsOrientation: true,
        defaultOrientation: 'vertical',
      };
    case 'glass':
      return {
        family,
        title: 'Szkło hartowane — tafle, półki i witryny',
        subtitle: 'Wybierz grubość szkła ESG (4–10 mm) i rodzaj formatki',
        thicknessLabel: 'Grubość szkła',
        thicknessOptions: [4, 6, 8, 10],
        defaultThicknessMm: [4, 6, 8, 10].includes(defT) ? defT : 6,
        defaultLengthMm: 1000,
        defaultDepthMm: 500,
        defaultOrientation: 'vertical',
      };
    case 'furniture_board':
    default:
      return {
        family: 'furniture_board',
        title: `${meta.name} — formatki meblowe i fronty`,
        subtitle: `Płyta laminowana ${meta.sheetWidthMm} × ${meta.sheetHeightMm} mm · formatki z okleiną ABS`,
        thicknessLabel: 'Grubość płyty',
        thicknessOptions: [16, 18, 22, 25, 28, 36],
        defaultThicknessMm: [16, 18, 22, 25, 28, 36].includes(defT) ? defT : 18,
        defaultLengthMm: 800,
        defaultDepthMm: 450,
        defaultOrientation: 'horizontal',
      };
  }
}

export function getDefaultParamsForMaterial(meta: MaterialMeta): MaterialCatalogParams {
  const cfg = getMaterialFamilyConfig(meta);
  return {
    thicknessMm: cfg.defaultThicknessMm,
    lengthMm: cfg.defaultLengthMm,
    depthMm: cfg.defaultDepthMm,
    orientation: cfg.defaultOrientation,
  };
}

// ==================== SHARED CARPENTRY CONNECTORS (3D GALVANIZED / STEEL) ====================

function buildCarpentryConnectorsSection(
  forceGalv: boolean,
  sectionSubtitle: string
): MaterialPresetSection {
  const pickMat = (selectedMat: MaterialId): MaterialId =>
    forceGalv ? 'steel_galv' : selectedMat;
  const badgeText = forceGalv ? 'Ocynk 3D' : 'Złącze 3D';

  return {
    id: forceGalv ? 'timber_connectors' : 'steel_connectors',
    title: 'Złącza ciesielskie i budowlane (3D)',
    subtitle: sectionSubtitle,
    items: [
      {
        id: 'conn_angle_90',
        label: 'Kątownik ciesielski wzmacniany 90×90×65',
        desc: 'Połączenie kątowe 90° słup–belka, krokwie, rama',
        badge: badgeText,
        badgeTone: 'sky',
        iconKind: 'bracket',
        defaultMaterialId: 'steel_galv',
        tags: ['kątownik', 'ciesielski', 'złącze', 'budowlane', 'narożnik', '90x90', 'ocynk'],
        formatDims: () => '90 × 90 × 65 mm',
        build: (mat) => ({
          name: 'Kątownik ciesielski 90×90×65',
          kind: 'custom',
          materialId: pickMat(mat),
          width: 90,
          height: 90,
          depth: 65,
          customPolygon: makeLBracketPolygon(90, 90, 4),
          position: [0, 45, 0],
          rotation: [0, 0, 0],
        }),
      },
      {
        id: 'conn_angle_60',
        label: 'Kątownik montażowy 60×60×40',
        desc: 'Lekkie łączenia szkieletu, budy, altany i ram',
        badge: badgeText,
        badgeTone: 'sky',
        iconKind: 'bracket',
        defaultMaterialId: 'steel_galv',
        tags: ['kątownik', 'montażowy', 'złącze', 'budowlane', '60x60', 'mały'],
        formatDims: () => '60 × 60 × 40 mm',
        build: (mat) => ({
          name: 'Kątownik montażowy 60×60×40',
          kind: 'custom',
          materialId: pickMat(mat),
          width: 60,
          height: 60,
          depth: 40,
          customPolygon: makeLBracketPolygon(60, 60, 3.5),
          position: [0, 30, 0],
          rotation: [0, 0, 0],
        }),
      },
      {
        id: 'conn_angle_105',
        label: 'Kątownik budowlany ciężki 105×105×90',
        desc: 'Grube belki, płatwie, więźba dachowa i tarasy',
        badge: badgeText,
        badgeTone: 'sky',
        iconKind: 'bracket',
        defaultMaterialId: 'steel_galv',
        tags: ['kątownik', 'duży', 'ciężki', 'złącze', 'ciesielskie', '105x105'],
        formatDims: () => '105 × 105 × 90 mm',
        build: (mat) => ({
          name: 'Kątownik budowlany 105×105×90',
          kind: 'custom',
          materialId: pickMat(mat),
          width: 105,
          height: 105,
          depth: 90,
          customPolygon: makeLBracketPolygon(105, 105, 5),
          position: [0, 53, 0],
          rotation: [0, 0, 0],
        }),
      },
      {
        id: 'conn_joist_hanger_60',
        label: 'Wieszak belki (but ciesielski) 60×120',
        desc: 'Oparcie belki lub legara 50–60 mm w czole',
        badge: badgeText,
        badgeTone: 'sky',
        iconKind: 'bracket',
        defaultMaterialId: 'steel_galv',
        tags: ['wieszak', 'belki', 'but', 'ciesielski', 'złącze', 'legar', 'krokiew'],
        formatDims: () => '68 × 120 × 80 mm',
        build: (mat) => ({
          name: 'Wieszak belki 60×120',
          kind: 'custom',
          materialId: pickMat(mat),
          width: 68,
          height: 120,
          depth: 80,
          customPolygon: makeUBracketPolygon(68, 120, 4),
          position: [0, 60, 0],
          rotation: [0, 0, 0],
        }),
      },
      {
        id: 'conn_post_anchor_80',
        label: 'Podstawa słupa / kotwa U 80×80',
        desc: 'Mocowanie słupa 80×80 mm do betonu lub fundamentu',
        badge: badgeText,
        badgeTone: 'sky',
        iconKind: 'bracket',
        defaultMaterialId: 'steel_galv',
        tags: ['podstawa', 'słupa', 'kotwa', 'złącze', '80x80', 'wiata', 'altana'],
        formatDims: () => '88 × 130 × 80 mm',
        build: (mat) => ({
          name: 'Podstawa słupa kotwa U 80×80',
          kind: 'custom',
          materialId: pickMat(mat),
          width: 88,
          height: 130,
          depth: 80,
          customPolygon: makeUBracketPolygon(88, 130, 4),
          position: [0, 65, 0],
          rotation: [0, 0, 0],
        }),
      },
      {
        id: 'conn_post_anchor_100',
        label: 'Podstawa słupa / kotwa U 100×100',
        desc: 'Mocowanie ciężkiego słupa 100×100 mm do podłoża',
        badge: badgeText,
        badgeTone: 'sky',
        iconKind: 'bracket',
        defaultMaterialId: 'steel_galv',
        tags: ['podstawa', 'słupa', 'kotwa', 'złącze', '100x100', 'taras', 'pergola'],
        formatDims: () => '108 × 140 × 100 mm',
        build: (mat) => ({
          name: 'Podstawa słupa kotwa U 100×100',
          kind: 'custom',
          materialId: pickMat(mat),
          width: 108,
          height: 140,
          depth: 100,
          customPolygon: makeUBracketPolygon(108, 140, 4.5),
          position: [0, 70, 0],
          rotation: [0, 0, 0],
        }),
      },
      {
        id: 'conn_plate_200',
        label: 'Płytka perforowana łącznikowa 200×80',
        desc: 'Płaskie łączenie dwóch kantówek lub belek w linii',
        badge: badgeText,
        badgeTone: 'sky',
        iconKind: 'bracket',
        defaultMaterialId: 'steel_galv',
        tags: ['płytka', 'perforowana', 'łącznik', 'złącze', 'płaskownik', '200x80'],
        formatDims: () => '200 × 80 × 3 mm',
        build: (mat) => ({
          name: 'Płytka perforowana 200×80',
          kind: 'panel',
          materialId: pickMat(mat),
          width: 200,
          height: 80,
          depth: 3,
          position: [0, 40, 0],
          rotation: [0, 0, 0],
        }),
      },
      {
        id: 'conn_t_plate_140',
        label: 'Łącznik płaski T 140×120',
        desc: 'Wzmacnianie połączeń prostopadłych typu T w ramie',
        badge: badgeText,
        badgeTone: 'sky',
        iconKind: 'bracket',
        defaultMaterialId: 'steel_galv',
        tags: ['łącznik', 'teownik', 't', 'złącze', 'płytka', 'rama'],
        formatDims: () => '140 × 120 × 4 mm',
        build: (mat) => ({
          name: 'Łącznik płaski T 140×120',
          kind: 'custom',
          materialId: pickMat(mat),
          width: 140,
          height: 120,
          depth: 4,
          customPolygon: makeTPlatePolygon(140, 120, 40, 40),
          position: [0, 60, 0],
          rotation: [0, 0, 0],
        }),
      },
    ],
  };
}

// ==================== TIMBER / STEEL LINEAR PROFILE HELPER ====================

function makeLinearProfilePreset(opts: {
  id: string;
  label: string;
  desc: string;
  secA: number;
  secB: number;
  badge: string;
  badgeTone: CatalogItemBadgeTone;
  iconKind: 'beam' | 'profile';
  defaultMaterialId: MaterialId;
  tags: string[];
}): MaterialPresetItem {
  return {
    id: opts.id,
    label: opts.label,
    desc: opts.desc,
    badge: opts.badge,
    badgeTone: opts.badgeTone,
    iconKind: opts.iconKind,
    defaultMaterialId: opts.defaultMaterialId,
    tags: opts.tags,
    formatDims: (p) =>
      p.orientation === 'vertical'
        ? `${opts.secA} × ${p.lengthMm} × ${opts.secB} mm`
        : `${p.lengthMm} × ${opts.secB} × ${opts.secA} mm`,
    build: (materialId, p) => {
      const isVert = p.orientation === 'vertical';
      const w = isVert ? opts.secA : p.lengthMm;
      const h = isVert ? p.lengthMm : opts.secB;
      const d = isVert ? opts.secB : opts.secA;
      return {
        name: `${opts.label} (${p.lengthMm} mm)`,
        kind: 'profile',
        materialId,
        width: w,
        height: h,
        depth: d,
        position: [0, Math.round(h / 2), 0],
        rotation: [0, 0, 0],
      };
    },
  };
}

// ==================== FAMILY CATALOG BUILDERS ====================

export function getSectionsForMaterial(meta: MaterialMeta): MaterialPresetSection[] {
  const family = resolveMaterialFamily(meta);
  const sheetW = meta.sheetWidthMm || 2500;
  const sheetH = meta.sheetHeightMm || 1250;

  switch (family) {
    // ------------------------------------------------------------------
    // 1. OSB-3
    // ------------------------------------------------------------------
    case 'osb':
      return [
        {
          id: 'osb_sheets',
          title: 'Arkusze handlowe i poszycia OSB-3',
          subtitle: `Standardowe formaty budowlane ${sheetW} × ${sheetH} mm`,
          items: [
            {
              id: 'osb_full_floor',
              label: 'Pełny arkusz OSB-3 (poziomo / podłoga)',
              desc: 'Podłoga, strop, podest, pełna formatka handlowa',
              badge: 'Arkusz',
              badgeTone: 'amber',
              iconKind: 'sheet',
              defaultMaterialId: 'osb3',
              tags: ['osb', 'osb3', 'arkusz', 'pełny', 'podłoga', 'strop', 'płyta'],
              formatDims: (p) => `${sheetW} × ${p.thicknessMm} × ${sheetH} mm`,
              build: (mat, p) => ({
                name: `Arkusz OSB-3 ${p.thicknessMm} mm (poziomy)`,
                kind: 'panel',
                materialId: mat,
                width: sheetW,
                height: p.thicknessMm,
                depth: sheetH,
                position: [0, Math.round(p.thicknessMm / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'osb_full_wall',
              label: 'Pełny arkusz OSB-3 (pionowo / ściana)',
              desc: 'Poszycie ścian szkieletowych, ścianka działowa',
              badge: 'Arkusz',
              badgeTone: 'amber',
              iconKind: 'panel_vert',
              defaultMaterialId: 'osb3',
              tags: ['osb', 'osb3', 'ściana', 'poszycie', 'arkusz', 'pion'],
              formatDims: (p) => `${sheetH} × ${sheetW} × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Ściana OSB-3 ${p.thicknessMm} mm (${sheetH}×${sheetW})`,
                kind: 'panel',
                materialId: mat,
                width: sheetH,
                height: sheetW,
                depth: p.thicknessMm,
                position: [0, Math.round(sheetW / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'osb_half_wall',
              label: 'Pół arkusza OSB-3 (ściana 1250×1250)',
              desc: 'Ścianka budy, zabudowa gospodarcza, garaż',
              badge: '½ arkusza',
              badgeTone: 'zinc',
              iconKind: 'panel_vert',
              defaultMaterialId: 'osb3',
              tags: ['osb', 'pół', 'ściana', 'buda', 'domek', 'formatka'],
              formatDims: (p) => `1250 × 1250 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Płyta OSB-3 ${p.thicknessMm} mm (1250×1250)`,
                kind: 'panel',
                materialId: mat,
                width: 1250,
                height: 1250,
                depth: p.thicknessMm,
                position: [0, 625, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'osb_floor_deck',
              label: 'Płyta podłogowa / podest OSB-3',
              desc: 'Podłoga domku, budy, stół roboczy warsztatowy',
              badge: 'Podłoga',
              badgeTone: 'emerald',
              iconKind: 'sheet',
              defaultMaterialId: 'osb3',
              tags: ['osb', 'podłoga', 'podest', 'dno', 'buda'],
              formatDims: (p) => `1250 × ${p.thicknessMm} × 1000 mm`,
              build: (mat, p) => ({
                name: `Podest OSB-3 ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 1250,
                height: p.thicknessMm,
                depth: 1000,
                position: [0, Math.round(p.thicknessMm / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
          ],
        },
        {
          id: 'osb_cutouts',
          title: 'Formatki docinane i skosy dachowe OSB-3',
          subtitle: 'Gotowe formatki pod regały, skrzynie i dachy',
          items: [
            {
              id: 'osb_cut_horiz',
              label: 'Formatka pozioma / półka OSB-3',
              desc: 'Półka garażowa, regał warsztatowy, dno skrzyni',
              badge: 'Formatka',
              badgeTone: 'zinc',
              iconKind: 'sheet',
              defaultMaterialId: 'osb3',
              tags: ['osb', 'formatka', 'półka', 'regał', 'garaż'],
              formatDims: (p) => `1000 × ${p.thicknessMm} × 600 mm`,
              build: (mat, p) => ({
                name: `Formatka OSB-3 ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: p.thicknessMm,
                depth: 600,
                position: [0, 500, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'osb_cut_side',
              label: 'Bok / ściana boczna OSB-3',
              desc: 'Ściana boczna skrzyni, obudowy lub szkieletu',
              badge: 'Formatka',
              badgeTone: 'zinc',
              iconKind: 'panel_vert',
              defaultMaterialId: 'osb3',
              tags: ['osb', 'bok', 'ściana', 'skrzynia', 'przegroda'],
              formatDims: (p) => `${p.thicknessMm} × 1000 × 600 mm`,
              build: (mat, p) => ({
                name: `Bok OSB-3 ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: p.thicknessMm,
                height: 1000,
                depth: 600,
                position: [0, 500, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'osb_gable_slope',
              label: 'Ściana szczytowa / skos dachowy OSB-3',
              desc: 'Płyta trapezowa na szczyt budy, wiaty lub poddasza',
              badge: 'Skos',
              badgeTone: 'amber',
              iconKind: 'slope',
              defaultMaterialId: 'osb3',
              tags: ['osb', 'skos', 'trapez', 'szczyt', 'dach', 'buda'],
              formatDims: (p) => `1200 × 800 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Szczyt ze skosem OSB-3 ${p.thicknessMm} mm`,
                kind: 'sloped',
                materialId: mat,
                width: 1200,
                height: 800,
                depth: p.thicknessMm,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
                slopeTopLeft: 0,
                slopeTopRight: 320,
              }),
            },
            {
              id: 'osb_gusset',
              label: 'Trójkąt wzmacniający / węzłówka OSB-3',
              desc: 'Usztywnienie naroża ramy lub kratownicy dachowej',
              badge: 'Wzmocnienie',
              badgeTone: 'zinc',
              iconKind: 'slope',
              defaultMaterialId: 'osb3',
              tags: ['osb', 'trójkąt', 'węzłówka', 'zastrzał', 'wzmocnienie'],
              formatDims: (p) => `350 × 350 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Węzłówka OSB-3 ${p.thicknessMm} mm`,
                kind: 'sloped',
                materialId: mat,
                width: 350,
                height: 350,
                depth: p.thicknessMm,
                position: [0, 175, 0],
                rotation: [0, 0, 0],
                slopeBottomRight: 320,
              }),
            },
          ],
        },
      ];

    // ------------------------------------------------------------------
    // 2. SKLEJKA BRZOZOWA
    // ------------------------------------------------------------------
    case 'plywood':
      return [
        {
          id: 'plywood_sheets',
          title: 'Arkusze i formatki ze sklejki',
          subtitle: 'Sklejka stolarska i konstrukcyjna — dokładna grubość z paska powyżej',
          items: [
            {
              id: 'ply_full_horiz',
              label: 'Pełny arkusz sklejki (poziomy)',
              desc: `Format handlowy ${sheetW} × ${sheetH} mm do rozkroju`,
              badge: 'Arkusz',
              badgeTone: 'amber',
              iconKind: 'sheet',
              defaultMaterialId: 'birch_plywood',
              tags: ['sklejka', 'brzozowa', 'arkusz', 'pełny', 'płyta'],
              formatDims: (p) => `${sheetW} × ${p.thicknessMm} × ${sheetH} mm`,
              build: (mat, p) => ({
                name: `Arkusz sklejki ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: sheetW,
                height: p.thicknessMm,
                depth: sheetH,
                position: [0, Math.round(p.thicknessMm / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'ply_full_vert',
              label: 'Pełny arkusz sklejki (pionowy / ściana)',
              desc: 'Okładzina ścienna, zabudowa busa lub campera',
              badge: 'Arkusz',
              badgeTone: 'amber',
              iconKind: 'panel_vert',
              defaultMaterialId: 'birch_plywood',
              tags: ['sklejka', 'ściana', 'camper', 'okładzina', 'pion'],
              formatDims: (p) => `${sheetH} × ${sheetW} × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Ściana ze sklejki ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: sheetH,
                height: sheetW,
                depth: p.thicknessMm,
                position: [0, Math.round(sheetW / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'ply_shelf',
              label: 'Półka / blat ze sklejki',
              desc: 'Formatka pozioma pod biurko, regał lub stół',
              badge: 'Formatka',
              badgeTone: 'zinc',
              iconKind: 'sheet',
              defaultMaterialId: 'birch_plywood',
              tags: ['sklejka', 'półka', 'blat', 'stolik', 'formatka'],
              formatDims: (p) => `1000 × ${p.thicknessMm} × 500 mm`,
              build: (mat, p) => ({
                name: `Półka ze sklejki ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: p.thicknessMm,
                depth: 500,
                position: [0, 600, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'ply_side',
              label: 'Bok / przegroda ze sklejki',
              desc: 'Ściana boczna korpusu, skrzyni lub szafy',
              badge: 'Formatka',
              badgeTone: 'zinc',
              iconKind: 'panel_vert',
              defaultMaterialId: 'birch_plywood',
              tags: ['sklejka', 'bok', 'przegroda', 'korpus'],
              formatDims: (p) => `${p.thicknessMm} × 1200 × 500 mm`,
              build: (mat, p) => ({
                name: `Bok ze sklejki ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: p.thicknessMm,
                height: 1200,
                depth: 500,
                position: [0, 600, 0],
                rotation: [0, 0, 0],
                grainRotated: true,
              }),
            },
            {
              id: 'ply_drawer_bottom',
              label: 'Dno szuflady / plecy ze sklejki',
              desc: 'Sztywne dno szuflady lub plecy korpusu (6–12 mm)',
              badge: 'Dno / Plecy',
              badgeTone: 'emerald',
              iconKind: 'sheet',
              defaultMaterialId: 'birch_plywood',
              tags: ['sklejka', 'dno', 'szuflada', 'plecy'],
              formatDims: (p) => `600 × ${p.thicknessMm} × 450 mm`,
              build: (mat, p) => ({
                name: `Dno ze sklejki ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 600,
                height: p.thicknessMm,
                depth: 450,
                position: [0, 150, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'ply_front',
              label: 'Front ze sklejki z uchwytem',
              desc: 'Naturalny front meblowy z frezowaną krawędzią',
              badge: 'Front',
              badgeTone: 'sky',
              iconKind: 'door',
              defaultMaterialId: 'birch_plywood',
              tags: ['sklejka', 'front', 'drzwiczki', 'szafka'],
              formatDims: (p) => `596 × 714 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Front ze sklejki ${p.thicknessMm} mm`,
                kind: 'door',
                materialId: mat,
                width: 596,
                height: 714,
                depth: p.thicknessMm,
                position: [0, 460, 260],
                rotation: [0, 0, 0],
                handleSide: 'right',
                grainRotated: true,
              }),
            },
            {
              id: 'ply_sloped',
              label: 'Formatka ze skosem ze sklejki',
              desc: 'Zabudowa pod schodami, poddasze, skos dachu',
              badge: 'Skos',
              badgeTone: 'amber',
              iconKind: 'slope',
              defaultMaterialId: 'birch_plywood',
              tags: ['sklejka', 'skos', 'trapez', 'poddasze'],
              formatDims: (p) => `900 × 800 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Sklejka ze skosem ${p.thicknessMm} mm`,
                kind: 'sloped',
                materialId: mat,
                width: 900,
                height: 800,
                depth: p.thicknessMm,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
                slopeTopLeft: 0,
                slopeTopRight: 300,
              }),
            },
          ],
        },
      ];

    // ------------------------------------------------------------------
    // 3. STYROPIAN EPS
    // ------------------------------------------------------------------
    case 'styrofoam':
      return [
        {
          id: 'eps_standard',
          title: 'Płyty styropianowe EPS (1000 × 500 mm)',
          subtitle: 'Standardowe formaty elewacyjne, ścienne i podłogowe',
          items: [
            {
              id: 'eps_wall_front',
              label: 'Płyta EPS elewacyjna / ścienna (pion)',
              desc: 'Pełna płyta styropianowa 1000 × 500 mm na ścianę',
              badge: 'EPS 1000×500',
              badgeTone: 'sky',
              iconKind: 'insulation',
              defaultMaterialId: 'styrofoam_eps',
              tags: ['styropian', 'eps', 'ocieplenie', 'elewacja', 'ściana', 'izolacja', 'płyta'],
              formatDims: (p) => `1000 × 500 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Styropian EPS ${p.thicknessMm} mm (1000×500)`,
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: 500,
                depth: p.thicknessMm,
                position: [0, 250, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'eps_floor_horiz',
              label: 'Płyta EPS podłogowa / pozioma',
              desc: 'Ocieplenie posadzki, podłogi budy lub stropu',
              badge: 'Podłoga',
              badgeTone: 'emerald',
              iconKind: 'insulation',
              defaultMaterialId: 'styrofoam_eps',
              tags: ['styropian', 'eps', 'podłoga', 'posadzka', 'pozioma', 'izolacja'],
              formatDims: (p) => `1000 × ${p.thicknessMm} × 500 mm`,
              build: (mat, p) => ({
                name: `Styropian podłogowy EPS ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: p.thicknessMm,
                depth: 500,
                position: [0, Math.round(p.thicknessMm / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'eps_wall_side',
              label: 'Płyta EPS boczna (w osi Z)',
              desc: 'Ocieplenie ścianki bocznej ustawione prostopadle',
              badge: 'Ściana boczna',
              badgeTone: 'zinc',
              iconKind: 'insulation',
              defaultMaterialId: 'styrofoam_eps',
              tags: ['styropian', 'eps', 'bok', 'ściana', 'ocieplenie'],
              formatDims: (p) => `${p.thicknessMm} × 500 × 1000 mm`,
              build: (mat, p) => ({
                name: `Styropian boczny EPS ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: p.thicknessMm,
                height: 500,
                depth: 1000,
                position: [0, 250, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'eps_half',
              label: 'Połówka płyty EPS (500 × 500 mm)',
              desc: 'Formatka między słupki szkieletu co 50 cm',
              badge: 'Docinka ½',
              badgeTone: 'zinc',
              iconKind: 'insulation',
              defaultMaterialId: 'styrofoam_eps',
              tags: ['styropian', 'eps', 'połówka', 'docinka', '500x500'],
              formatDims: (p) => `500 × 500 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Styropian EPS ${p.thicknessMm} mm (500×500)`,
                kind: 'panel',
                materialId: mat,
                width: 500,
                height: 500,
                depth: p.thicknessMm,
                position: [0, 250, 0],
                rotation: [0, 0, 0],
              }),
            },
          ],
        },
        {
          id: 'eps_special',
          title: 'Formatki specjalne i skosy EPS',
          subtitle: 'Docinki dachowe, ościeża i większe płyty podłogowe',
          items: [
            {
              id: 'eps_strip',
              label: 'Pas dociepleniowy / ościeże EPS',
              desc: 'Wąski pas na wieniec, nadproże lub cokół',
              badge: 'Pas 250 mm',
              badgeTone: 'zinc',
              iconKind: 'insulation',
              defaultMaterialId: 'styrofoam_eps',
              tags: ['styropian', 'pas', 'ościeże', 'cokół', 'wieniec'],
              formatDims: (p) => `1000 × 250 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Pas EPS ${p.thicknessMm} mm (1000×250)`,
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: 250,
                depth: p.thicknessMm,
                position: [0, 125, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'eps_large_floor',
              label: 'Płyta EPS 100 duży format (1200×600)',
              desc: 'Twardy styropian pod podłogę, taras lub fundament',
              badge: 'EPS 100',
              badgeTone: 'amber',
              iconKind: 'insulation',
              defaultMaterialId: 'styrofoam_eps',
              tags: ['styropian', 'eps100', 'podłoga', 'duży', 'fundament'],
              formatDims: (p) => `1200 × ${p.thicknessMm} × 600 mm`,
              build: (mat, p) => ({
                name: `Styropian EPS 100 (${p.thicknessMm} mm)`,
                kind: 'panel',
                materialId: mat,
                width: 1200,
                height: p.thicknessMm,
                depth: 600,
                position: [0, Math.round(p.thicknessMm / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'eps_sloped',
              label: 'Płyta EPS ze skosem (szczyt / dach)',
              desc: 'Docinka styropianowa pod połać dachu skośnego',
              badge: 'Skos',
              badgeTone: 'amber',
              iconKind: 'slope',
              defaultMaterialId: 'styrofoam_eps',
              tags: ['styropian', 'skos', 'dach', 'szczyt', 'buda'],
              formatDims: (p) => `1000 × 500 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Styropian ze skosem EPS ${p.thicknessMm} mm`,
                kind: 'sloped',
                materialId: mat,
                width: 1000,
                height: 500,
                depth: p.thicknessMm,
                position: [0, 250, 0],
                rotation: [0, 0, 0],
                slopeTopLeft: 0,
                slopeTopRight: 220,
              }),
            },
          ],
        },
      ];

    // ------------------------------------------------------------------
    // 4. WEŁNA MINERALNA
    // ------------------------------------------------------------------
    case 'mineral_wool':
      return [
        {
          id: 'wool_batts',
          title: 'Płyty i maty z wełny mineralnej',
          subtitle: 'Izolacja termiczna i akustyczna ścian, dachów oraz stropów',
          items: [
            {
              id: 'wool_wall_1000',
              label: 'Płyta wełny skalnej ścienna (1000×600)',
              desc: 'Wypełnienie ścian szkieletowych (rozstaw słupków 60 cm)',
              badge: 'Ściana',
              badgeTone: 'amber',
              iconKind: 'insulation',
              defaultMaterialId: 'mineral_wool',
              tags: ['wełna', 'mineralna', 'skalna', 'ściana', 'ocieplenie', 'izolacja'],
              formatDims: (p) => `1000 × 600 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Wełna ścienna ${p.thicknessMm} mm (1000×600)`,
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: 600,
                depth: p.thicknessMm,
                position: [0, 300, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'wool_rafter_1200',
              label: 'Płyta wełny międzykrokwiowa (1200×600)',
              desc: 'Izolacja dachu skośnego i poddasza między krokwiami',
              badge: 'Dach / Poddasze',
              badgeTone: 'sky',
              iconKind: 'insulation',
              defaultMaterialId: 'mineral_wool',
              tags: ['wełna', 'krokiew', 'międzykrokwiowa', 'dach', 'poddasze'],
              formatDims: (p) => `1200 × 600 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Wełna dachowa ${p.thicknessMm} mm (1200×600)`,
                kind: 'panel',
                materialId: mat,
                width: 1200,
                height: 600,
                depth: p.thicknessMm,
                position: [0, 300, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'wool_floor_horiz',
              label: 'Płyta wełny pozioma (strop / legary)',
              desc: 'Izolacja akustyczna i cieplna między legarami podłogi',
              badge: 'Strop',
              badgeTone: 'emerald',
              iconKind: 'insulation',
              defaultMaterialId: 'mineral_wool',
              tags: ['wełna', 'strop', 'podłoga', 'legary', 'pozioma'],
              formatDims: (p) => `1200 × ${p.thicknessMm} × 600 mm`,
              build: (mat, p) => ({
                name: `Wełna stropowa ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 1200,
                height: p.thicknessMm,
                depth: 600,
                position: [0, Math.round(p.thicknessMm / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'wool_acoustic',
              label: 'Płyta akustyczna działowa (1250×600)',
              desc: 'Wygłuszenie ścianek działowych GK i OSB',
              badge: 'Akustyczna',
              badgeTone: 'zinc',
              iconKind: 'insulation',
              defaultMaterialId: 'mineral_wool',
              tags: ['wełna', 'akustyczna', 'działowa', 'wygłuszenie'],
              formatDims: (p) => `600 × 1250 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Wełna akustyczna ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 600,
                height: 1250,
                depth: p.thicknessMm,
                position: [0, 625, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'wool_sloped',
              label: 'Docinka wełny ze skosem',
              desc: 'Wypełnienie trójkątów szczytowych i skosów dachu',
              badge: 'Skos',
              badgeTone: 'amber',
              iconKind: 'slope',
              defaultMaterialId: 'mineral_wool',
              tags: ['wełna', 'skos', 'trapez', 'dach', 'szczyt'],
              formatDims: (p) => `1000 × 600 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Wełna ze skosem ${p.thicknessMm} mm`,
                kind: 'sloped',
                materialId: mat,
                width: 1000,
                height: 600,
                depth: p.thicknessMm,
                position: [0, 300, 0],
                rotation: [0, 0, 0],
                slopeTopLeft: 0,
                slopeTopRight: 260,
              }),
            },
            {
              id: 'wool_strip',
              label: 'Pas wełny docinany (1000×300)',
              desc: 'Wąskie pola między słupkami i nadprożami',
              badge: 'Pas 300 mm',
              badgeTone: 'zinc',
              iconKind: 'insulation',
              defaultMaterialId: 'mineral_wool',
              tags: ['wełna', 'pas', 'docinka', 'wąska'],
              formatDims: (p) => `1000 × 300 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Pas wełny ${p.thicknessMm} mm (1000×300)`,
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: 300,
                depth: p.thicknessMm,
                position: [0, 150, 0],
                rotation: [0, 0, 0],
              }),
            },
          ],
        },
      ];

    // ------------------------------------------------------------------
    // 5. PAPA / GONT BITUMICZNY
    // ------------------------------------------------------------------
    case 'roofing':
      return [
        {
          id: 'roofing_sheets',
          title: 'Pokrycia dachowe (papa i gont)',
          subtitle: 'Dobierz długość pasa z paska powyżej — szerokość zgodna z rolkami',
          items: [
            {
              id: 'roof_felt_roll',
              label: 'Pas papy termozgrzewalnej (szer. 1000 mm)',
              desc: 'Krycie płaskie i skośne na deskowanie lub OSB',
              badge: 'Rolka 1 m',
              badgeTone: 'amber',
              iconKind: 'roof',
              defaultMaterialId: 'roof_shingle',
              tags: ['papa', 'termozgrzewalna', 'dach', 'pokrycie', 'rolka'],
              formatDims: (p) => `${p.lengthMm} × 5 × 1000 mm`,
              build: (mat, p) => ({
                name: `Pas papy (${p.lengthMm}×1000)`,
                kind: 'panel',
                materialId: mat,
                width: p.lengthMm,
                height: 5,
                depth: 1000,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'roof_shingle_strip',
              label: 'Pas gontu bitumicznego (1000 × 330 mm)',
              desc: 'Pojedynczy moduł gontu na dach budy, altany lub wiaty',
              badge: 'Gont',
              badgeTone: 'sky',
              iconKind: 'roof',
              defaultMaterialId: 'roof_shingle',
              tags: ['gont', 'bitumiczny', 'dach', 'buda', 'altana'],
              formatDims: () => '1000 × 5 × 330 mm',
              build: (mat) => ({
                name: 'Pas gontu bitumicznego 1000×330',
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: 5,
                depth: 330,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'roof_full_slope',
              label: 'Połać dachowa z gontu / papy (szer. 1250 mm)',
              desc: 'Gotowy arkusz pokrycia pod standardowy arkusz OSB',
              badge: 'Połać',
              badgeTone: 'emerald',
              iconKind: 'roof',
              defaultMaterialId: 'roof_shingle',
              tags: ['połać', 'dach', 'papa', 'gont', 'pokrycie'],
              formatDims: (p) => `${p.lengthMm} × 6 × 1250 mm`,
              build: (mat, p) => ({
                name: `Połać dachowa (${p.lengthMm}×1250)`,
                kind: 'panel',
                materialId: mat,
                width: p.lengthMm,
                height: 6,
                depth: 1250,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'roof_eaves_strip',
              label: 'Pas podrynnowy / okapowy',
              desc: 'Zabezpieczenie okapu i krawędzi startowej dachu',
              badge: 'Okap',
              badgeTone: 'zinc',
              iconKind: 'roof',
              defaultMaterialId: 'roof_shingle',
              tags: ['okap', 'pas', 'podrynnowy', 'papa', 'gont'],
              formatDims: (p) => `${p.lengthMm} × 6 × 250 mm`,
              build: (mat, p) => ({
                name: `Pas okapowy (${p.lengthMm}×250)`,
                kind: 'panel',
                materialId: mat,
                width: p.lengthMm,
                height: 6,
                depth: 250,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'roof_ridge',
              label: 'Pas kalenicowy / gąsior bitumiczny',
              desc: 'Uszczelnienie kalenicy dachu dwuspadowego',
              badge: 'Kalenica',
              badgeTone: 'zinc',
              iconKind: 'roof',
              defaultMaterialId: 'roof_shingle',
              tags: ['kalenica', 'gąsior', 'gont', 'dach'],
              formatDims: (p) => `${p.lengthMm} × 8 × 250 mm`,
              build: (mat, p) => ({
                name: `Pas kalenicowy (${p.lengthMm} mm)`,
                kind: 'panel',
                materialId: mat,
                width: p.lengthMm,
                height: 8,
                depth: 250,
                position: [0, 500, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'roof_sloped_cut',
              label: 'Arkusz dachowy ze skosem',
              desc: 'Docinka pokrycia na dach wielospadowy lub daszek',
              badge: 'Skos',
              badgeTone: 'amber',
              iconKind: 'slope',
              defaultMaterialId: 'roof_shingle',
              tags: ['papa', 'gont', 'skos', 'dach'],
              formatDims: () => '1200 × 800 × 5 mm',
              build: (mat) => ({
                name: 'Pokrycie dachowe ze skosem',
                kind: 'sloped',
                materialId: mat,
                width: 1200,
                height: 800,
                depth: 5,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
                slopeTopLeft: 0,
                slopeTopRight: 300,
              }),
            },
          ],
        },
      ];

    // ------------------------------------------------------------------
    // 6. BUDOWA / KANTÓWKI C24 & IMPREGNOWANE + ZŁĄCZA CIESIELSKIE
    // ------------------------------------------------------------------
    case 'timber':
      return [
        {
          id: 'timber_square_posts',
          title: 'Kantówki kwadratowe (słupki i szkielet C24)',
          subtitle: 'Długość i orientacja (pion / poziom) ustawiane na pasku powyżej',
          items: [
            makeLinearProfilePreset({
              id: 'tim_40x40',
              label: 'Kantówka 40 × 40 mm',
              desc: 'Lekki szkielet budy, ramy, regału i ścianek',
              badge: '40×40',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['kantówka', '40x40', 'drewno', 'c24', 'szkielet', 'buda'],
              secA: 40,
              secB: 40,
            }),
            makeLinearProfilePreset({
              id: 'tim_50x50',
              label: 'Kantówka 50 × 50 mm',
              desc: 'Uniwersalny szkielet ścian, domku narzędziowego',
              badge: '50×50',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['kantówka', '50x50', 'drewno', 'c24', 'słupek', 'szkielet'],
              secA: 50,
              secB: 50,
            }),
            makeLinearProfilePreset({
              id: 'tim_60x60',
              label: 'Kantówka 60 × 60 mm',
              desc: 'Rama konstrukcyjna, balustrada, mała pergola',
              badge: '60×60',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['kantówka', '60x60', 'drewno', 'c24', 'pergola', 'rama'],
              secA: 60,
              secB: 60,
            }),
            makeLinearProfilePreset({
              id: 'tim_70x70',
              label: 'Kantówka 70 × 70 mm',
              desc: 'Słupek ogrodzeniowy, podpora małego zadaszenia',
              badge: '70×70',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['kantówka', '70x70', 'słupek', 'ogrodzenie', 'c24'],
              secA: 70,
              secB: 70,
            }),
            makeLinearProfilePreset({
              id: 'tim_80x80',
              label: 'Kantówka 80 × 80 mm',
              desc: 'Słup nośny altany, tarasu i wiaty ogrodowej',
              badge: '80×80',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['kantówka', '80x80', 'słup', 'altana', 'wiata', 'c24'],
              secA: 80,
              secB: 80,
            }),
            makeLinearProfilePreset({
              id: 'tim_100x100',
              label: 'Kantówka 100 × 100 mm',
              desc: 'Główny słup konstrukcyjny wiaty, pergoli, tarasu',
              badge: '100×100',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['kantówka', '100x100', 'słup', 'konstrukcyjny', 'wiata', 'taras'],
              secA: 100,
              secB: 100,
            }),
            makeLinearProfilePreset({
              id: 'tim_120x120',
              label: 'Kantówka 120 × 120 mm',
              desc: 'Masywny słup nośny, garaż drewniany i ciężka wiata',
              badge: '120×120',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['kantówka', '120x120', 'słup', 'garaż', 'c24'],
              secA: 120,
              secB: 120,
            }),
          ],
        },
        {
          id: 'timber_beams_battens',
          title: 'Belki, krokwie, łaty i zastrzały',
          subtitle: 'Przekroje prostokątne pod dachy, legary i stropy',
          items: [
            makeLinearProfilePreset({
              id: 'tim_batten_40x50',
              label: 'Łata dachowa 40 × 50 mm',
              desc: 'Łacenie dachu, ruszt pod elewację i podłogę',
              badge: 'Łata',
              badgeTone: 'emerald',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['łata', 'dachowa', '40x50', 'ruszt', 'listwa'],
              secA: 40,
              secB: 50,
            }),
            makeLinearProfilePreset({
              id: 'tim_counter_25x50',
              label: 'Kontrłata 25 × 50 mm',
              desc: 'Dystans wentylacyjny na krokwiach i elewacji',
              badge: 'Kontrłata',
              badgeTone: 'emerald',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['kontrłata', 'łata', '25x50', 'wentylacja', 'listwa'],
              secA: 25,
              secB: 50,
            }),
            makeLinearProfilePreset({
              id: 'tim_joist_50x100',
              label: 'Belka / legar 50 × 100 mm',
              desc: 'Legar tarasowy, rygiel ścienny, mała krokiew',
              badge: 'Legar',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['belka', 'legar', '50x100', 'taras', 'rygiel', 'krokiew'],
              secA: 50,
              secB: 100,
            }),
            makeLinearProfilePreset({
              id: 'tim_rafter_60x120',
              label: 'Krokiew dachowa 60 × 120 mm',
              desc: 'Więźba dachowa wiaty, altany i zadaszenia',
              badge: 'Krokiew',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['krokiew', 'belka', '60x120', 'dach', 'więźba'],
              secA: 60,
              secB: 120,
            }),
            makeLinearProfilePreset({
              id: 'tim_purlin_80x160',
              label: 'Belka nośna / płatew 80 × 160 mm',
              desc: 'Główna belka stropowa, płatew i murłata nośna',
              badge: 'Płatew',
              badgeTone: 'amber',
              iconKind: 'beam',
              defaultMaterialId: 'pine_timber',
              tags: ['płatew', 'belka', 'nośna', '80x160', 'strop', 'murłata'],
              secA: 80,
              secB: 160,
            }),
            {
              id: 'tim_brace_45',
              label: 'Zastrzał / miecz narożny 45°',
              desc: 'Usztywnienie kątowe połączenia słup–płatew',
              badge: 'Miecz 45°',
              badgeTone: 'zinc',
              iconKind: 'slope',
              defaultMaterialId: 'pine_timber',
              tags: ['zastrzał', 'miecz', '45', 'wzmocnienie', 'słup', 'altana'],
              formatDims: () => '450 × 450 × 60 mm',
              build: (mat) => ({
                name: 'Zastrzał ciesielski 45°',
                kind: 'sloped',
                materialId: mat,
                width: 450,
                height: 450,
                depth: 60,
                position: [0, 225, 0],
                rotation: [0, 0, 0],
                slopeBottomRight: 400,
              }),
            },
          ],
        },
        buildCarpentryConnectorsSection(
          true,
          'Wstawiane automatycznie ze stali ocynkowanej — gotowe do montażu na kantówkach'
        ),
      ];

    // ------------------------------------------------------------------
    // 7. DESKA ELEWACYJNA / BOAZERIA
    // ------------------------------------------------------------------
    case 'plank': {
      const makePlankItem = (opts: {
        id: string;
        label: string;
        desc: string;
        faceW: number;
        flatOnFloor?: boolean;
        badge: string;
        badgeTone: CatalogItemBadgeTone;
        tags: string[];
      }): MaterialPresetItem => ({
        id: opts.id,
        label: opts.label,
        desc: opts.desc,
        badge: opts.badge,
        badgeTone: opts.badgeTone,
        iconKind: 'plank',
        defaultMaterialId: 'spruce_plank',
        tags: opts.tags,
        formatDims: (p) => {
          if (opts.flatOnFloor) {
            return `${p.lengthMm} × ${p.thicknessMm} × ${opts.faceW} mm`;
          }
          return p.orientation === 'horizontal'
            ? `${p.lengthMm} × ${opts.faceW} × ${p.thicknessMm} mm`
            : `${opts.faceW} × ${p.lengthMm} × ${p.thicknessMm} mm`;
        },
        build: (mat, p) => {
          if (opts.flatOnFloor) {
            return {
              name: `${opts.label} ${p.thicknessMm} mm`,
              kind: 'profile',
              materialId: mat,
              width: p.lengthMm,
              height: p.thicknessMm,
              depth: opts.faceW,
              position: [0, Math.round(p.thicknessMm / 2), 0],
              rotation: [0, 0, 0],
            };
          }
          const isHoriz = p.orientation === 'horizontal';
          const w = isHoriz ? p.lengthMm : opts.faceW;
          const h = isHoriz ? opts.faceW : p.lengthMm;
          return {
            name: `${opts.label} ${p.thicknessMm} mm`,
            kind: 'profile',
            materialId: mat,
            width: w,
            height: h,
            depth: p.thicknessMm,
            position: [0, Math.round(h / 2), 0],
            rotation: [0, 0, 0],
            grainRotated: !isHoriz,
          };
        },
      });

      return [
        {
          id: 'planks_cladding',
          title: 'Deski elewacyjne, tarasowe i boazeria',
          subtitle: 'Grubość, długość i kierunek (poziom/pion) dopasowywane powyżej',
          items: [
            makePlankItem({
              id: 'plank_facade_145',
              label: 'Deska elewacyjna / boazeria 145 mm',
              desc: 'Obicie ścian domku, budy, elewacji drewnianej',
              faceW: 145,
              badge: 'Elewacja',
              badgeTone: 'amber',
              tags: ['deska', 'elewacyjna', 'boazeria', '145', 'ściana', 'buda'],
            }),
            makePlankItem({
              id: 'plank_boazeria_96',
              label: 'Boazeria wąska (pióro-wpust) 96 mm',
              desc: 'Podsufitka dachowa, podbitka i boazeria ścienna',
              faceW: 96,
              badge: 'Podbitka',
              badgeTone: 'amber',
              tags: ['boazeria', 'podbitka', 'podsufitka', 'pióro', '96'],
            }),
            makePlankItem({
              id: 'plank_decking_145',
              label: 'Deska tarasowa (pozioma) 145 mm',
              desc: 'Pokład tarasu, podest ogrodowy, stopień schodowy',
              faceW: 145,
              flatOnFloor: true,
              badge: 'Taras',
              badgeTone: 'emerald',
              tags: ['deska', 'tarasowa', 'taras', 'podest', 'podłoga'],
            }),
            makePlankItem({
              id: 'plank_floor_120',
              label: 'Deska podłogowa (pozioma) 120 mm',
              desc: 'Podłoga drewniana układana na legarach',
              faceW: 120,
              flatOnFloor: true,
              badge: 'Podłoga',
              badgeTone: 'emerald',
              tags: ['deska', 'podłogowa', 'podłoga', 'legary'],
            }),
            makePlankItem({
              id: 'plank_formwork_150',
              label: 'Deska konstrukcyjna / szalunkowa 150 mm',
              desc: 'Deskowanie dachu, skrzynie, donice ogrodowe',
              faceW: 150,
              badge: 'Deskowanie',
              badgeTone: 'zinc',
              tags: ['deska', 'szalunkowa', 'deskowanie', 'dach', 'skrzynia'],
            }),
            makePlankItem({
              id: 'plank_picket_90',
              label: 'Sztacheta ogrodzeniowa 90 mm',
              desc: 'Płot drewniany, barierka tarasowa, balustrada',
              faceW: 90,
              badge: 'Ogrodzenie',
              badgeTone: 'zinc',
              tags: ['sztacheta', 'płot', 'ogrodzenie', 'balustrada'],
            }),
            makePlankItem({
              id: 'plank_trim_45',
              label: 'Listwa wykończeniowa / narożna 45 mm',
              desc: 'Opaska okienna, listwa maskująca narożniki',
              faceW: 45,
              badge: 'Wykończenie',
              badgeTone: 'zinc',
              tags: ['listwa', 'narożna', 'opaska', 'maskująca'],
            }),
          ],
        },
        {
          id: 'planks_connectors',
          title: 'Złącza do montażu desek (stal ocynk)',
          subtitle: 'Podstawowe okucia montażowe do szkieletu pod boazerię',
          items: buildCarpentryConnectorsSection(true, '').items.slice(0, 4),
        },
      ];
    }

    // ------------------------------------------------------------------
    // 8. PŁYTY HDF 3 MM
    // ------------------------------------------------------------------
    case 'hdf':
      return [
        {
          id: 'hdf_panels',
          title: 'Formatki HDF (plecy szafek i dna szuflad)',
          subtitle: 'Cienka płyta HDF pod nutowanie (wpust) lub przybijanie',
          items: [
            {
              id: 'hdf_base_back',
              label: 'Plecy szafki dolnej HDF',
              desc: 'Formatka tylna pod standardowy korpus 600 × 720 mm',
              badge: 'Plecy',
              badgeTone: 'amber',
              iconKind: 'panel_vert',
              defaultMaterialId: 'hdf_white',
              tags: ['hdf', 'plecy', 'szafka', 'tył', '3mm'],
              formatDims: (p) => `596 × 716 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Plecy szafki HDF ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 596,
                height: 716,
                depth: p.thicknessMm,
                position: [0, 460, -260],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'hdf_wardrobe_back',
              label: 'Plecy szafy wysokiej HDF',
              desc: 'Tylna płyta szafy ubraniowej lub słupka AGD',
              badge: 'Szafa',
              badgeTone: 'amber',
              iconKind: 'panel_vert',
              defaultMaterialId: 'hdf_white',
              tags: ['hdf', 'plecy', 'szafa', 'słupek', 'wysoka'],
              formatDims: (p) => `796 × 2096 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Plecy szafy HDF ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 796,
                height: 2096,
                depth: p.thicknessMm,
                position: [0, 1050, -280],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'hdf_drawer_bottom',
              label: 'Dno szuflady HDF',
              desc: 'Lekkie dno skrzyni szufladowej (do wpustu 4 mm)',
              badge: 'Szuflada',
              badgeTone: 'emerald',
              iconKind: 'sheet',
              defaultMaterialId: 'hdf_white',
              tags: ['hdf', 'dno', 'szuflada', '3mm'],
              formatDims: (p) => `540 × ${p.thicknessMm} × 450 mm`,
              build: (mat, p) => ({
                name: `Dno szuflady HDF ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 540,
                height: p.thicknessMm,
                depth: 450,
                position: [0, 200, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'hdf_sloped',
              label: 'Plecy ze skosem HDF (poddasze)',
              desc: 'Formatka tylna pod szafę wnękową ze skosem',
              badge: 'Skos',
              badgeTone: 'sky',
              iconKind: 'slope',
              defaultMaterialId: 'hdf_white',
              tags: ['hdf', 'skos', 'poddasze', 'plecy'],
              formatDims: (p) => `900 × 800 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Plecy ze skosem HDF ${p.thicknessMm} mm`,
                kind: 'sloped',
                materialId: mat,
                width: 900,
                height: 800,
                depth: p.thicknessMm,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
                slopeTopLeft: 0,
                slopeTopRight: 300,
              }),
            },
            {
              id: 'hdf_full_sheet',
              label: 'Pełny arkusz HDF (2800 × 2070)',
              desc: 'Pełny format hurtowy płyty HDF',
              badge: 'Arkusz',
              badgeTone: 'zinc',
              iconKind: 'sheet',
              defaultMaterialId: 'hdf_white',
              tags: ['hdf', 'arkusz', 'pełny'],
              formatDims: (p) => `${sheetW} × ${sheetH} × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Arkusz HDF ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: sheetW,
                height: sheetH,
                depth: p.thicknessMm,
                position: [0, Math.round(sheetH / 2), 0],
                rotation: [0, 0, 0],
              }),
            },
          ],
        },
      ];

    // ------------------------------------------------------------------
    // 9. BLATY KUCHENNE I ROBOCZE
    // ------------------------------------------------------------------
    case 'countertop':
      return [
        {
          id: 'countertops_main',
          title: 'Blaty kuchenne, wyspowe i panele przyścienne',
          subtitle: 'Grubość i głębokość blatu ustawiane powyżej (z zaokrąglonym noskiem)',
          items: [
            {
              id: 'top_1200',
              label: 'Blat kuchenny prosty 1200 mm',
              desc: 'Odcinek roboczy na 2 szafki 60 cm',
              badge: 'Postforming',
              badgeTone: 'amber',
              iconKind: 'countertop',
              defaultMaterialId: 'concrete_top',
              tags: ['blat', 'kuchenny', 'roboczy', '1200', 'beton'],
              formatDims: (p) => `1200 × ${p.thicknessMm} × ${p.depthMm} mm`,
              build: (mat, p) => ({
                name: `Blat kuchenny ${p.thicknessMm} mm (1200)`,
                kind: 'countertop',
                materialId: mat,
                width: 1200,
                height: p.thicknessMm,
                depth: p.depthMm,
                position: [0, 840, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'top_2400',
              label: 'Blat kuchenny długi 2400 mm',
              desc: 'Ciąg zabudowy kuchennej (4 moduły 60 cm)',
              badge: 'Ciąg 2,4 m',
              badgeTone: 'amber',
              iconKind: 'countertop',
              defaultMaterialId: 'concrete_top',
              tags: ['blat', 'kuchenny', 'długi', '2400'],
              formatDims: (p) => `2400 × ${p.thicknessMm} × ${p.depthMm} mm`,
              build: (mat, p) => ({
                name: `Blat kuchenny ${p.thicknessMm} mm (2400)`,
                kind: 'countertop',
                materialId: mat,
                width: 2400,
                height: p.thicknessMm,
                depth: p.depthMm,
                position: [0, 840, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'top_3050',
              label: 'Pełna sztanga blatu 3050 mm',
              desc: 'Standardowa pełna długość handlowa 3,05 m',
              badge: 'Sztanga',
              badgeTone: 'sky',
              iconKind: 'countertop',
              defaultMaterialId: 'concrete_top',
              tags: ['blat', 'sztanga', '3050', 'pełny'],
              formatDims: (p) => `3050 × ${p.thicknessMm} × ${p.depthMm} mm`,
              build: (mat, p) => ({
                name: `Blat pełny ${p.thicknessMm} mm (3050)`,
                kind: 'countertop',
                materialId: mat,
                width: 3050,
                height: p.thicknessMm,
                depth: p.depthMm,
                position: [0, 840, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'top_island',
              label: 'Blat wyspy / półwyspu 1800 mm',
              desc: 'Szeroki blat na wyspę kuchenną lub stół jadalniany',
              badge: 'Wyspa',
              badgeTone: 'emerald',
              iconKind: 'countertop',
              defaultMaterialId: 'concrete_top',
              tags: ['blat', 'wyspa', 'półwysep', 'stół', '1800'],
              formatDims: (p) => `1800 × ${p.thicknessMm} × ${Math.max(p.depthMm, 800)} mm`,
              build: (mat, p) => ({
                name: `Blat wyspy ${p.thicknessMm} mm`,
                kind: 'countertop',
                materialId: mat,
                width: 1800,
                height: p.thicknessMm,
                depth: Math.max(p.depthMm, 800),
                position: [0, 840, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'top_corner_ext',
              label: 'Dostawka narożna / biurko 900 mm',
              desc: 'Krótki odcinek boczny do kuchni w kształcie L',
              badge: 'Odcinek L',
              badgeTone: 'zinc',
              iconKind: 'countertop',
              defaultMaterialId: 'concrete_top',
              tags: ['blat', 'narożny', 'dostawka', 'biurko', '900'],
              formatDims: (p) => `900 × ${p.thicknessMm} × ${p.depthMm} mm`,
              build: (mat, p) => ({
                name: `Blat boczny ${p.thicknessMm} mm (900)`,
                kind: 'countertop',
                materialId: mat,
                width: 900,
                height: p.thicknessMm,
                depth: p.depthMm,
                position: [0, 840, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'top_backsplash',
              label: 'Panel przyścienny (fartuch) 1200×550',
              desc: 'Ścianka między szafkami dolnymi a wiszącymi',
              badge: 'Fartuch',
              badgeTone: 'zinc',
              iconKind: 'panel_vert',
              defaultMaterialId: 'concrete_top',
              tags: ['panel', 'przyścienny', 'fartuch', 'ściana', 'blat'],
              formatDims: () => '1200 × 550 × 18 mm',
              build: (mat) => ({
                name: 'Panel przyścienny 1200×550',
                kind: 'panel',
                materialId: mat,
                width: 1200,
                height: 550,
                depth: 18,
                position: [0, 1135, -290],
                rotation: [0, 0, 0],
              }),
            },
          ],
        },
      ];

    // ------------------------------------------------------------------
    // 10. STAL CZARNA / STAL OCYNKOWANA + ZŁĄCZA BUDOWLANE
    // ------------------------------------------------------------------
    case 'steel':
      return [
        {
          id: 'steel_profiles',
          title: 'Profile stalowe zamknięte i płaskowniki',
          subtitle: 'Długość i orientacja (słupek pionowy / belka pozioma) ustawiane powyżej',
          items: [
            makeLinearProfilePreset({
              id: 'st_20x20',
              label: 'Profil kwadratowy 20 × 20 mm',
              desc: 'Lekka konstrukcja loft, wsporniki półek, ramki',
              badge: '20×20',
              badgeTone: 'amber',
              iconKind: 'profile',
              defaultMaterialId: 'steel_black',
              tags: ['profil', 'stal', '20x20', 'loft', 'rama'],
              secA: 20,
              secB: 20,
            }),
            makeLinearProfilePreset({
              id: 'st_30x30',
              label: 'Profil kwadratowy 30 × 30 mm',
              desc: 'Stelaż biurka, konsoli, regału loftowego',
              badge: '30×30',
              badgeTone: 'amber',
              iconKind: 'profile',
              defaultMaterialId: 'steel_black',
              tags: ['profil', 'stal', '30x30', 'biurko', 'stelaż'],
              secA: 30,
              secB: 30,
            }),
            makeLinearProfilePreset({
              id: 'st_40x40',
              label: 'Profil kwadratowy 40 × 40 mm',
              desc: 'Noga stołu, słupek regału loft, rama główna',
              badge: '40×40',
              badgeTone: 'amber',
              iconKind: 'profile',
              defaultMaterialId: 'steel_black',
              tags: ['profil', 'stal', '40x40', 'noga', 'słupek', 'loft'],
              secA: 40,
              secB: 40,
            }),
            makeLinearProfilePreset({
              id: 'st_60x60',
              label: 'Profil kwadratowy 60 × 60 mm',
              desc: 'Słup nośny wiaty, bramy, schodów lub antresoli',
              badge: '60×60',
              badgeTone: 'amber',
              iconKind: 'profile',
              defaultMaterialId: 'steel_black',
              tags: ['profil', 'stal', '60x60', 'słup', 'wiata', 'brama'],
              secA: 60,
              secB: 60,
            }),
            makeLinearProfilePreset({
              id: 'st_60x40',
              label: 'Profil prostokątny 60 × 40 mm',
              desc: 'Belka nośna stołu, rama tarasowa, przęsło',
              badge: '60×40',
              badgeTone: 'sky',
              iconKind: 'profile',
              defaultMaterialId: 'steel_black',
              tags: ['profil', 'prostokątny', '60x40', 'belka', 'rama'],
              secA: 40,
              secB: 60,
            }),
            makeLinearProfilePreset({
              id: 'st_80x40',
              label: 'Profil prostokątny 80 × 40 mm',
              desc: 'Ciężka rama stołu, schody stalowe, konstrukcja nośna',
              badge: '80×40',
              badgeTone: 'sky',
              iconKind: 'profile',
              defaultMaterialId: 'steel_black',
              tags: ['profil', 'prostokątny', '80x40', 'schody', 'stół'],
              secA: 40,
              secB: 80,
            }),
            makeLinearProfilePreset({
              id: 'st_flat_40x5',
              label: 'Płaskownik stalowy 40 × 5 mm',
              desc: 'Wspornik, listwa montażowa, wzmocnienie okuć',
              badge: 'Płaskownik',
              badgeTone: 'zinc',
              iconKind: 'profile',
              defaultMaterialId: 'steel_black',
              tags: ['płaskownik', 'stal', '40x5', 'listwa', 'wspornik'],
              secA: 40,
              secB: 5,
            }),
          ],
        },
        buildCarpentryConnectorsSection(
          false,
          'Złącza 3D w wybranym wykończeniu stali (czarny loft lub ocynk)'
        ),
      ];

    // ------------------------------------------------------------------
    // 11. SZKŁO HARTOWANE
    // ------------------------------------------------------------------
    case 'glass':
      return [
        {
          id: 'glass_panels',
          title: 'Tafle, półki i fronty ze szkła hartowanego',
          subtitle: 'Grubość szkła ESG (4–10 mm) wybierana powyżej',
          items: [
            {
              id: 'glass_shelf',
              label: 'Półka szklana hartowana',
              desc: 'Półka do witryny, regału lub łazienki',
              badge: 'ESG',
              badgeTone: 'sky',
              iconKind: 'glass',
              defaultMaterialId: 'glass_clear',
              tags: ['szkło', 'półka', 'witryna', 'hartowane'],
              formatDims: (p) => `764 × ${p.thicknessMm} × 350 mm`,
              build: (mat, p) => ({
                name: `Półka szklana ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 764,
                height: p.thicknessMm,
                depth: 350,
                position: [0, 900, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'glass_vert',
              label: 'Tafla szkła pionowa (witryna / przeszklenie)',
              desc: 'Przeszklenie boczne, ścianka działowa loft',
              badge: 'Witryna',
              badgeTone: 'sky',
              iconKind: 'glass',
              defaultMaterialId: 'glass_clear',
              tags: ['szkło', 'tafla', 'szyba', 'witryna', 'ścianka'],
              formatDims: (p) => `500 × 1200 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Tafla szkła ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 500,
                height: 1200,
                depth: p.thicknessMm,
                position: [0, 600, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'glass_door',
              label: 'Front szklany / drzwiczki witryny',
              desc: 'Drzwiczki przeszklone z uchwytem',
              badge: 'Front',
              badgeTone: 'amber',
              iconKind: 'door',
              defaultMaterialId: 'glass_clear',
              tags: ['szkło', 'drzwi', 'front', 'witryna'],
              formatDims: (p) => `496 × 714 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Front szklany ${p.thicknessMm} mm`,
                kind: 'door',
                materialId: mat,
                width: 496,
                height: 714,
                depth: p.thicknessMm,
                position: [0, 600, 260],
                rotation: [0, 0, 0],
                handleSide: 'right',
              }),
            },
            {
              id: 'glass_walkin',
              label: 'Ścianka prysznicowa Walk-In (900×2000)',
              desc: 'Bezpieczna tafla łazienkowa ze szkła 8–10 mm',
              badge: 'Walk-In',
              badgeTone: 'emerald',
              iconKind: 'glass',
              defaultMaterialId: 'glass_clear',
              tags: ['szkło', 'prysznic', 'walk-in', 'szyba', 'łazienka'],
              formatDims: (p) => `900 × 2000 × ${Math.max(p.thicknessMm, 8)} mm`,
              build: (mat, p) => ({
                name: `Ścianka Walk-In ${Math.max(p.thicknessMm, 8)} mm`,
                kind: 'panel',
                materialId: mat,
                width: 900,
                height: 2000,
                depth: Math.max(p.thicknessMm, 8),
                position: [0, 1000, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'glass_tabletop',
              label: 'Blat szklany stolika kawowego',
              desc: 'Pozioma tafla na stelaż stalowy lub drewniany',
              badge: 'Blat',
              badgeTone: 'zinc',
              iconKind: 'glass',
              defaultMaterialId: 'glass_clear',
              tags: ['szkło', 'blat', 'stolik', 'ława'],
              formatDims: (p) => `1000 × ${Math.max(p.thicknessMm, 8)} × 600 mm`,
              build: (mat, p) => ({
                name: `Blat szklany ${Math.max(p.thicknessMm, 8)} mm`,
                kind: 'panel',
                materialId: mat,
                width: 1000,
                height: Math.max(p.thicknessMm, 8),
                depth: 600,
                position: [0, 450, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'glass_sloped',
              label: 'Szyba ze skosem (balustrada / poddasze)',
              desc: 'Formatka szklana trapezowa pod skos schodów',
              badge: 'Skos',
              badgeTone: 'zinc',
              iconKind: 'slope',
              defaultMaterialId: 'glass_clear',
              tags: ['szkło', 'skos', 'balustrada', 'schody'],
              formatDims: (p) => `800 × 700 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Szyba ze skosem ${p.thicknessMm} mm`,
                kind: 'sloped',
                materialId: mat,
                width: 800,
                height: 700,
                depth: p.thicknessMm,
                position: [0, 350, 0],
                rotation: [0, 0, 0],
                slopeTopLeft: 0,
                slopeTopRight: 260,
              }),
            },
          ],
        },
      ];

    // ------------------------------------------------------------------
    // 12. PŁYTY MEBLOWE LAMINOWANE (Dąb Craft, Orzech, Biały Mat, Antracyt, własne)
    // ------------------------------------------------------------------
    case 'furniture_board':
    default:
      return [
        {
          id: 'furn_corpus',
          title: 'Formatki korpusowe (półki, boki, wieńce)',
          subtitle: 'Płyta meblowa gotowa do rozkroju 2D i okleinowania ABS',
          items: [
            {
              id: 'furn_shelf',
              label: 'Półka / wieniec poziomy',
              desc: 'Półka, dno lub wieniec górny korpusu (okleina przód)',
              badge: 'ABS 0.8',
              badgeTone: 'amber',
              iconKind: 'sheet',
              defaultMaterialId: 'oak_craft',
              tags: ['półka', 'wieniec', 'dno', 'płyta', 'meblowa', 'formatka'],
              formatDims: (p) => `800 × ${p.thicknessMm} × 450 mm`,
              build: (mat, p) => ({
                name: `Półka / wieniec ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 800,
                height: p.thicknessMm,
                depth: 450,
                position: [0, 600, 0],
                rotation: [0, 0, 0],
                edgeBanding: { thicknessMm: 0.8, bottom: true },
              }),
            },
            {
              id: 'furn_side',
              label: 'Bok / przegroda pionowa',
              desc: 'Ściana boczna szafy, komody lub przegroda wewnętrzna',
              badge: 'ABS 0.8',
              badgeTone: 'amber',
              iconKind: 'panel_vert',
              defaultMaterialId: 'oak_craft',
              tags: ['bok', 'przegroda', 'ściana', 'korpus', 'szafa'],
              formatDims: (p) => `${p.thicknessMm} × 1200 × 500 mm`,
              build: (mat, p) => ({
                name: `Bok korpusu ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: p.thicknessMm,
                height: 1200,
                depth: 500,
                position: [0, 600, 0],
                rotation: [0, 0, 0],
                grainRotated: true,
                edgeBanding: { thicknessMm: 0.8, right: true },
              }),
            },
            {
              id: 'furn_full_back',
              label: 'Ścianka tylna / przegroda pełna',
              desc: 'Sztywna ściana tylna z pełnej płyty meblowej',
              badge: 'Korpus',
              badgeTone: 'zinc',
              iconKind: 'panel_vert',
              defaultMaterialId: 'oak_craft',
              tags: ['plecy', 'ścianka', 'tył', 'przegroda', 'płyta'],
              formatDims: (p) => `800 × 720 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Ścianka pełna ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 800,
                height: 720,
                depth: p.thicknessMm,
                position: [0, 360, 0],
                rotation: [0, 0, 0],
              }),
            },
            {
              id: 'furn_plinth',
              label: 'Cokół meblowy dolny',
              desc: 'Listwa cokołowa pod szafki kuchenne lub szafę',
              badge: 'Cokół',
              badgeTone: 'zinc',
              iconKind: 'plank',
              defaultMaterialId: 'oak_craft',
              tags: ['cokół', 'listwa', 'dolna', 'kuchnia', 'szafka'],
              formatDims: (p) => `800 × 100 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Cokół meblowy ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 800,
                height: 100,
                depth: p.thicknessMm,
                position: [0, 50, 220],
                rotation: [0, 0, 0],
                edgeBanding: { thicknessMm: 0.8, top: true, bottom: true },
              }),
            },
            {
              id: 'furn_filler',
              label: 'Blenda / listwa przyścienna',
              desc: 'Listwa maskująca szczelinę przy krzywej ścianie',
              badge: 'Blenda',
              badgeTone: 'zinc',
              iconKind: 'panel_vert',
              defaultMaterialId: 'oak_craft',
              tags: ['blenda', 'listwa', 'maskująca', 'przyścienna'],
              formatDims: (p) => `100 × 720 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Blenda przyścienna ${p.thicknessMm} mm`,
                kind: 'panel',
                materialId: mat,
                width: 100,
                height: 720,
                depth: p.thicknessMm,
                position: [0, 460, 260],
                rotation: [0, 0, 0],
                grainRotated: true,
                edgeBanding: { thicknessMm: 0.8, left: true, right: true },
              }),
            },
            {
              id: 'furn_sloped',
              label: 'Formatka ze skosem (poddasze / schody)',
              desc: 'Płyta trapezowa do szaf wnękowych pod skos',
              badge: 'Skos',
              badgeTone: 'sky',
              iconKind: 'slope',
              defaultMaterialId: 'oak_craft',
              tags: ['skos', 'trapez', 'poddasze', 'schody', 'szafa'],
              formatDims: (p) => `900 × 800 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Formatka ze skosem ${p.thicknessMm} mm`,
                kind: 'sloped',
                materialId: mat,
                width: 900,
                height: 800,
                depth: p.thicknessMm,
                position: [0, 400, 0],
                rotation: [0, 0, 0],
                slopeTopLeft: 0,
                slopeTopRight: 320,
              }),
            },
          ],
        },
        {
          id: 'furn_fronts_tops',
          title: 'Fronty z okleiną ABS, szuflady i blaty',
          subtitle: 'Gotowe skrzydła drzwiowe, fronty szuflad i blaty biurkowe',
          items: [
            {
              id: 'furn_door_std',
              label: 'Front szafki z uchwytem (60 cm)',
              desc: 'Drzwiczki z okleiną ABS dookoła i uchwytem',
              badge: 'Front ABS',
              badgeTone: 'emerald',
              iconKind: 'door',
              defaultMaterialId: 'oak_craft',
              tags: ['front', 'drzwi', 'drzwiczki', 'szafka', 'uchwyt'],
              formatDims: (p) => `596 × 714 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Front meblowy ${p.thicknessMm} mm`,
                kind: 'door',
                materialId: mat,
                width: 596,
                height: 714,
                depth: p.thicknessMm,
                position: [0, 460, 280],
                rotation: [0, 0, 0],
                handleSide: 'right',
                grainRotated: true,
                edgeBanding: { thicknessMm: 0.8, top: true, bottom: true, left: true, right: true },
              }),
            },
            {
              id: 'furn_drawer_front',
              label: 'Front szuflady (60 cm)',
              desc: 'Poziomy front szuflady z uchwytem górnym',
              badge: 'Szuflada',
              badgeTone: 'emerald',
              iconKind: 'door',
              defaultMaterialId: 'oak_craft',
              tags: ['front', 'szuflada', 'komoda', 'kuchnia'],
              formatDims: (p) => `596 × 176 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Front szuflady ${p.thicknessMm} mm`,
                kind: 'door',
                materialId: mat,
                width: 596,
                height: 176,
                depth: p.thicknessMm,
                position: [0, 300, 280],
                rotation: [0, 0, 0],
                handleSide: 'top',
                edgeBanding: { thicknessMm: 0.8, top: true, bottom: true, left: true, right: true },
              }),
            },
            {
              id: 'furn_tall_door',
              label: 'Front wysoki (szafa / słupek)',
              desc: 'Wysokie skrzydło drzwiowe 496 × 2000 mm',
              badge: 'Szafa',
              badgeTone: 'emerald',
              iconKind: 'door',
              defaultMaterialId: 'oak_craft',
              tags: ['front', 'szafa', 'wysoki', 'słupek', 'drzwi'],
              formatDims: (p) => `496 × 2000 × ${p.thicknessMm} mm`,
              build: (mat, p) => ({
                name: `Front szafy ${p.thicknessMm} mm`,
                kind: 'door',
                materialId: mat,
                width: 496,
                height: 2000,
                depth: p.thicknessMm,
                position: [0, 1000, 280],
                rotation: [0, 0, 0],
                handleSide: 'right',
                grainRotated: true,
                edgeBanding: { thicknessMm: 2, top: true, bottom: true, left: true, right: true },
              }),
            },
            {
              id: 'furn_desk_top',
              label: 'Blat biurkowy / komodowy',
              desc: 'Grubszy blat roboczy z okleiną 2 mm dookoła',
              badge: 'Blat',
              badgeTone: 'amber',
              iconKind: 'countertop',
              defaultMaterialId: 'oak_craft',
              tags: ['blat', 'biurko', 'komoda', 'stół'],
              formatDims: (p) => `1400 × ${Math.max(p.thicknessMm, 28)} × 650 mm`,
              build: (mat, p) => {
                const t = Math.max(p.thicknessMm, 28);
                return {
                  name: `Blat biurkowy ${t} mm`,
                  kind: 'countertop',
                  materialId: mat,
                  width: 1400,
                  height: t,
                  depth: 650,
                  position: [0, 750, 0],
                  rotation: [0, 0, 0],
                  edgeBanding: { thicknessMm: 2, top: true, bottom: true, left: true, right: true },
                };
              },
            },
          ],
        },
      ];
  }
}

// ==================== GLOBAL SEARCH INDEX ACROSS ALL MATERIAL FAMILIES ====================

export interface SearchableCatalogEntry {
  key: string;
  item: MaterialPresetItem;
  materialId: MaterialId;
  materialShortName: string;
  params: MaterialCatalogParams;
  dimsText: string;
  haystack: string;
}

const REPRESENTATIVE_MATERIALS: MaterialId[] = [
  'osb3',
  'birch_plywood',
  'styrofoam_eps',
  'mineral_wool',
  'roof_shingle',
  'pine_timber',
  'spruce_plank',
  'oak_craft',
  'hdf_white',
  'concrete_top',
  'steel_black',
  'glass_clear',
];

export function buildGlobalPresetSearchIndex(): SearchableCatalogEntry[] {
  const seenIds = new Set<string>();
  const entries: SearchableCatalogEntry[] = [];

  for (const matId of REPRESENTATIVE_MATERIALS) {
    const meta = getMaterialMeta(matId);
    const params = getDefaultParamsForMaterial(meta);
    const sections = getSectionsForMaterial(meta);

    for (const section of sections) {
      for (const item of section.items) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
        const resolvedMatId = item.defaultMaterialId ?? matId;
        const resolvedMeta = getMaterialMeta(resolvedMatId);
        const dimsText = item.formatDims(params);
        entries.push({
          key: `${resolvedMatId}_${item.id}`,
          item,
          materialId: resolvedMatId,
          materialShortName: resolvedMeta.shortName,
          params,
          dimsText,
          haystack: `${item.label} ${item.desc} ${item.badge ?? ''} ${dimsText} ${resolvedMeta.name} ${resolvedMeta.shortName} ${section.title} ${item.tags.join(' ')}`.toLowerCase(),
        });
      }
    }
  }

  return entries;
}
