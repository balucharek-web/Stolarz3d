export type BuiltInMaterialId =
  | 'osb3'
  | 'oak_craft'
  | 'walnut'
  | 'birch_plywood'
  | 'white_matte'
  | 'anthracite_matte'
  | 'hdf_white'
  | 'hdf_black'
  | 'concrete_top'
  | 'steel_black'
  | 'steel_galv'
  | 'glass_clear';

export type MaterialId = BuiltInMaterialId | (string & {});

export type PartKind =
  | 'panel'
  | 'sloped'
  | 'profile'
  | 'door'
  | 'countertop'
  | 'custom'
  | 'appliance';

export type ApplianceModel =
  | 'wardrobe_rod'
  | 'induction_hob'
  | 'kitchen_sink'
  | 'builtin_oven'
  | 'wire_cargo';

export type AlignMode =
  | 'left'
  | 'right'
  | 'centerX'
  | 'bottom'
  | 'top'
  | 'front'
  | 'back';

export type ScrewType =
  | 'wood_4x45'
  | 'confirmat_7x50'
  | 'minifix_15'
  | 'bolt_m8'
  | 'dowel_8x35';

export type HandleSide = 'left' | 'right' | 'top' | 'none';

export type HandleStyle = 'bar' | 'tip_on' | 'gola_j' | 'chamfer_45';

export type SurfaceFinish = 'matte' | 'satin' | 'gloss';

export type DrawerSlideType = 'none' | 'ball_26mm' | 'undermount_blum';

export type EditorTool = 'select' | 'move' | 'rotate' | 'resize' | 'screw' | 'measure';

export type CameraPreset = 'iso' | 'front' | 'back' | 'left' | 'right' | 'side' | 'top';

export type StudioLighting = 'daylight' | 'studio' | 'warm' | 'photoreal';

export interface MaterialMeta {
  id: MaterialId;
  name: string;
  shortName: string;
  category: 'Płyty konstrukcyjne' | 'Płyty meblowe' | 'Blaty' | 'Stal i szkło';
  defaultThicknessMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  pricePerM2Pln: number;
  swatchFallbackHex: string;
  isCustom?: boolean;
  grainDirectional?: boolean;
  /** Standard stock bar length for linear profiles (e.g. 6000 mm steel, 3000 mm timber) */
  barLengthMm?: number;
  /** Price per linear meter (PLN/mb) for 1D linear profile cutting */
  pricePerLinearMPln?: number;
}

export interface BuiltInMaterialOverride {
  pricePerM2Pln?: number;
  sheetWidthMm?: number;
  sheetHeightMm?: number;
  defaultThicknessMm?: number;
}

export interface MaterialsCatalogConfig {
  customMaterials: MaterialMeta[];
  builtInOverrides: Partial<Record<BuiltInMaterialId, BuiltInMaterialOverride>>;
}

export interface ScrewMeta {
  id: ScrewType;
  name: string;
  shortName: string;
  diameterMm: number;
  lengthMm: number;
  usage: string;
  colorHex: string;
}

export type EdgeBandingThickness = 0 | 0.8 | 2;

export interface EdgeBandingConfig {
  thicknessMm: EdgeBandingThickness;
  /** Front / Top / Left / Right edges (L1, L2, W1, W2) */
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
}

/** Internal cutout (sink, induction hob, cable grommet, pipe pass-through) relative to board face center */
export interface PartCutout {
  id: string;
  shape: 'rect' | 'circle';
  /** Offset along the board's primary X/width span from center (mm) */
  xMm: number;
  /** Offset along the board's primary Y/depth span from center (mm) */
  yMm: number;
  /** Width for rectangular cutout (mm) */
  widthMm: number;
  /** Height for rectangular cutout (mm) */
  heightMm: number;
  /** Diameter for circular cutout (mm) */
  diameterMm?: number;
  label?: string;
}

/** Back/bottom dado groove (nut / wpust pod plecy HDF) */
export interface DadoGrooveConfig {
  enabled: boolean;
  edge: 'back' | 'bottom' | 'top';
  /** Distance from outer edge to groove center (mm), e.g. 16 mm */
  insetMm: number;
  /** Groove width (mm), e.g. 4 mm for 3–4 mm HDF */
  widthMm: number;
  /** Groove depth (mm), e.g. 8–10 mm */
  depthMm: number;
}

/** 45-degree miter chamfer edges (zacinanie na 45° / gerung) */
export interface MiterEdgesConfig {
  left?: boolean;
  right?: boolean;
  top?: boolean;
  bottom?: boolean;
}

export interface FurniturePart {
  id: string;
  name: string;
  kind: PartKind;
  materialId: MaterialId;
  /** Width in mm (local X axis) */
  width: number;
  /** Height in mm (local Y axis) */
  height: number;
  /** Depth / Thickness in mm (local Z axis) */
  depth: number;
  /** Center position in mm (world X, Y, Z; floor is Y = 0) */
  position: [number, number, number];
  /** Euler rotation in degrees [rx, ry, rz] */
  rotation: [number, number, number];
  /** Top-left corner vertical drop in mm (for sloped panels) */
  slopeTopLeft?: number;
  /** Top-right corner vertical drop in mm (for sloped panels) */
  slopeTopRight?: number;
  /** Bottom-left corner vertical lift in mm (for sloped panels) */
  slopeBottomLeft?: number;
  /** Bottom-right corner vertical lift in mm (for sloped panels) */
  slopeBottomRight?: number;
  /** Handle placement for cabinet doors/drawers */
  handleSide?: HandleSide;
  /** Front opening style: classic bar handle, handleless Tip-On, Gola J-profile, or 45° chamfer pull */
  handleStyle?: HandleStyle;
  /** Rotate texture grain 90 degrees */
  grainRotated?: boolean;
  /** Custom 2D polygon vertices [xMm, yMm] centered around (0, 0) for kind === 'custom' */
  customPolygon?: [number, number][];
  /** Optional edge banding (okleina ABS/PCV) for cut list & sizing */
  edgeBanding?: EdgeBandingConfig;
  /** Optional group name/id so grouped parts move & smart-resize together */
  groupId?: string;
  /** Surface lacquer finish for Studio PBR rendering */
  surfaceFinish?: SurfaceFinish;
  /** Rounded corners fillet radius in mm (R) */
  cornerRadiusMm?: number;
  /** Internal rectangular or circular cutouts (sink, hob, cable grommet, pipes) */
  cutouts?: PartCutout[];
  /** Dado groove (nut pod plecy HDF) */
  dadoGroove?: DadoGrooveConfig;
  /** 45-degree mitered edges (gerung) */
  miter45?: MiterEdgesConfig;
  /** Cabinet door hinge side & count (Ø35 mm cup hinges) */
  hingeSide?: HandleSide;
  hingeCount?: number;
  /** Drawer slide hardware specification (counted on drawer front/box) */
  drawerSlideType?: DrawerSlideType;
  /** Optional hardware role tag for BOM counting */
  hardwareTag?:
    | 'leg'
    | 'drawer_front'
    | 'drawer_box'
    | 'door_overlay'
    | 'door_inset'
    | 'sliding_door'
    | 'wall_filler';
  /** Enable dual System 32 (Ø5 mm every 32 mm, 37 mm inset) adjustable shelf-pin drilling rows */
  system32ShelfHoles?: boolean;
  /** Horizontal slide direction and travel (mm) for sliding wardrobe doors */
  slidingDirection?: 'left' | 'right';
  slidingTravelMm?: number;
  /** Procedural 3D interior accessory or kitchen appliance model (when kind === 'appliance') */
  applianceModel?: ApplianceModel;
  /** Optional unit price in PLN for appliance/interior accessory BOM */
  appliancePricePln?: number;
}

export interface Fastener {
  id: string;
  partId: string;
  type: ScrewType;
  /** Position in parent part's local space (mm) */
  localPosition: [number, number, number];
  /** Outward surface normal in parent part's local space */
  localNormal: [number, number, number];
  /** Optional mating board ID this fastener connects into (enables live joint sync!) */
  targetPartId?: string;
  /** Contact axis along which the joint sits */
  jointAxis?: 'x' | 'y' | 'z';
  /** Normalized 0..1 parametric offset along the contact patch's long span */
  jointParamU?: number;
}

export interface MeasureSegment {
  id: string;
  startMm: [number, number, number];
  endMm: [number, number, number];
}

export interface QuoteSettings {
  companyName: string;
  clientName: string;
  cuttingPricePerMbPln: number;
  edgeBandingPricePerMbPln: number;
  hingePricePln: number;
  slidePairPricePln: number;
  handlePricePln: number;
  legPricePln: number;
  fastenerPricePln: number;
  laborHours: number;
  laborRatePln: number;
  marginPercent: number;
  vatPercent: 8 | 23;
  notes: string;
}

export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  companyName: 'Moja Pracownia Stolarska',
  clientName: 'Klient indywidualny',
  cuttingPricePerMbPln: 3.5,
  edgeBandingPricePerMbPln: 7.5,
  hingePricePln: 18,
  slidePairPricePln: 85,
  handlePricePln: 24,
  legPricePln: 8,
  fastenerPricePln: 0.45,
  laborHours: 8,
  laborRatePln: 110,
  marginPercent: 20,
  vatPercent: 23,
  notes: 'Cena obejmuje materiał, rozkrój, okleinowanie ABS, okucia oraz montaż próbny na warsztacie.',
};

export type RoomObstacleType = 'socket' | 'pipe' | 'radiator' | 'window';

export interface RoomObstacle {
  id: string;
  type: RoomObstacleType;
  label: string;
  wall: 'back' | 'left' | 'right';
  /** Horizontal offset along the wall from its left/back edge (mm) */
  offsetMm: number;
  /** Height of obstacle bottom from floor (mm) */
  elevationMm: number;
  widthMm: number;
  heightMm: number;
  /** Protrusion out from wall into the room (mm) */
  depthMm: number;
}

export interface RoomSlopedCeiling {
  enabled: boolean;
  side: 'left' | 'right';
  /** Knee wall height where slope starts (mm), e.g. 1350 mm */
  kneeWallHeightMm: number;
  /** Horizontal run of the ceiling slope into the room (mm) */
  slopeWidthMm: number;
}

export interface RoomConfig {
  enabled: boolean;
  /** Total room / alcove width (X, centered around 0, mm) */
  widthMm: number;
  /** Ceiling height (Y from floor, mm) */
  heightMm: number;
  /** Distance from back wall to front of alcove (mm); back wall sits at Z = backWallZMm */
  depthMm: number;
  /** World Z coordinate of the inner face of the back wall (mm), default -320 */
  backWallZMm: number;
  showBackWall: boolean;
  showLeftWall: boolean;
  showRightWall: boolean;
  showCeiling: boolean;
  slopedCeiling: RoomSlopedCeiling;
  obstacles: RoomObstacle[];
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  enabled: false,
  widthMm: 2200,
  heightMm: 2500,
  depthMm: 1000,
  backWallZMm: -310,
  showBackWall: true,
  showLeftWall: true,
  showRightWall: true,
  showCeiling: false,
  slopedCeiling: {
    enabled: false,
    side: 'right',
    kneeWallHeightMm: 1350,
    slopeWidthMm: 1600,
  },
  obstacles: [],
};

export interface FurnitureProject {
  id: string;
  name: string;
  parts: FurniturePart[];
  fasteners: Fastener[];
  room?: RoomConfig;
  updatedAt?: number;
}

export const MATERIAL_CATALOG: MaterialMeta[] = [
  {
    id: 'osb3',
    name: 'Płyta OSB-3',
    shortName: 'OSB-3',
    category: 'Płyty konstrukcyjne',
    defaultThicknessMm: 18,
    sheetWidthMm: 2500,
    sheetHeightMm: 1250,
    pricePerM2Pln: 42,
    swatchFallbackHex: '#C59B5F',
  },
  {
    id: 'birch_plywood',
    name: 'Sklejka Brzozowa',
    shortName: 'Sklejka',
    category: 'Płyty konstrukcyjne',
    defaultThicknessMm: 18,
    sheetWidthMm: 2500,
    sheetHeightMm: 1250,
    pricePerM2Pln: 115,
    swatchFallbackHex: '#E0C79E',
  },
  {
    id: 'oak_craft',
    name: 'Dąb Craft Złoty',
    shortName: 'Dąb Craft',
    category: 'Płyty meblowe',
    defaultThicknessMm: 18,
    sheetWidthMm: 2800,
    sheetHeightMm: 2070,
    pricePerM2Pln: 78,
    swatchFallbackHex: '#B6834D',
  },
  {
    id: 'walnut',
    name: 'Orzech Ciemny',
    shortName: 'Orzech',
    category: 'Płyty meblowe',
    defaultThicknessMm: 18,
    sheetWidthMm: 2800,
    sheetHeightMm: 2070,
    pricePerM2Pln: 89,
    swatchFallbackHex: '#5D4032',
  },
  {
    id: 'white_matte',
    name: 'Płyta Biały Mat',
    shortName: 'Biały Mat',
    category: 'Płyty meblowe',
    defaultThicknessMm: 18,
    sheetWidthMm: 2800,
    sheetHeightMm: 2070,
    pricePerM2Pln: 58,
    swatchFallbackHex: '#F3F2EE',
  },
  {
    id: 'anthracite_matte',
    name: 'Płyta Antracyt Mat',
    shortName: 'Antracyt',
    category: 'Płyty meblowe',
    defaultThicknessMm: 18,
    sheetWidthMm: 2800,
    sheetHeightMm: 2070,
    pricePerM2Pln: 68,
    swatchFallbackHex: '#35383E',
  },
  {
    id: 'hdf_white',
    name: 'Płyta HDF Biała 3 mm',
    shortName: 'HDF Biały 3mm',
    category: 'Płyty meblowe',
    defaultThicknessMm: 3,
    sheetWidthMm: 2800,
    sheetHeightMm: 2070,
    pricePerM2Pln: 24,
    swatchFallbackHex: '#F0EFEA',
  },
  {
    id: 'hdf_black',
    name: 'Płyta HDF Czarna 3 mm',
    shortName: 'HDF Czarny 3mm',
    category: 'Płyty meblowe',
    defaultThicknessMm: 3,
    sheetWidthMm: 2800,
    sheetHeightMm: 2070,
    pricePerM2Pln: 26,
    swatchFallbackHex: '#2C2E33',
  },
  {
    id: 'concrete_top',
    name: 'Blat Beton Architektoniczny',
    shortName: 'Beton Blat',
    category: 'Blaty',
    defaultThicknessMm: 38,
    sheetWidthMm: 3050,
    sheetHeightMm: 600,
    pricePerM2Pln: 210,
    swatchFallbackHex: '#9A9C9A',
  },
  {
    id: 'steel_black',
    name: 'Stal Czarna Proszkowa',
    shortName: 'Stal Czarna',
    category: 'Stal i szkło',
    defaultThicknessMm: 30,
    sheetWidthMm: 2000,
    sheetHeightMm: 1000,
    pricePerM2Pln: 140,
    swatchFallbackHex: '#25272B',
    barLengthMm: 6000,
    pricePerLinearMPln: 32,
  },
  {
    id: 'steel_galv',
    name: 'Stal Ocynkowana',
    shortName: 'Stal Ocynk',
    category: 'Stal i szkło',
    defaultThicknessMm: 30,
    sheetWidthMm: 2000,
    sheetHeightMm: 1000,
    pricePerM2Pln: 125,
    swatchFallbackHex: '#ADB4BC',
    barLengthMm: 6000,
    pricePerLinearMPln: 28,
  },
  {
    id: 'glass_clear',
    name: 'Szkło Hartowane',
    shortName: 'Szkło',
    category: 'Stal i szkło',
    defaultThicknessMm: 6,
    sheetWidthMm: 2000,
    sheetHeightMm: 1000,
    pricePerM2Pln: 195,
    swatchFallbackHex: '#BFD6D8',
  },
];

export const DEFAULT_MATERIAL_CATALOG: MaterialMeta[] = MATERIAL_CATALOG.map((m) => ({
  ...m,
  grainDirectional: m.id === 'oak_craft' || m.id === 'walnut',
}));

export const MATERIAL_MAP: Record<string, MaterialMeta> = MATERIAL_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<string, MaterialMeta>
);

/** Safe material metadata lookup (handles built-in, custom warehouse boards, and unknown fallbacks) */
export function getMaterialMeta(id: MaterialId): MaterialMeta {
  return MATERIAL_MAP[id] ?? MATERIAL_MAP['osb3'];
}

/** Synchronizes in-place MATERIAL_CATALOG and MATERIAL_MAP with user warehouse overrides & custom boards */
export function syncCatalogMaterials(config: MaterialsCatalogConfig): void {
  const rebuilt: MaterialMeta[] = DEFAULT_MATERIAL_CATALOG.map((base) => {
    const ov = config.builtInOverrides[base.id as BuiltInMaterialId];
    return ov
      ? {
          ...base,
          pricePerM2Pln: ov.pricePerM2Pln ?? base.pricePerM2Pln,
          sheetWidthMm: ov.sheetWidthMm ?? base.sheetWidthMm,
          sheetHeightMm: ov.sheetHeightMm ?? base.sheetHeightMm,
          defaultThicknessMm: ov.defaultThicknessMm ?? base.defaultThicknessMm,
        }
      : { ...base };
  });

  for (const cm of config.customMaterials) {
    rebuilt.push({ ...cm, isCustom: true });
  }

  MATERIAL_CATALOG.length = 0;
  MATERIAL_CATALOG.push(...rebuilt);

  for (const key of Object.keys(MATERIAL_MAP)) {
    delete MATERIAL_MAP[key];
  }
  for (const item of rebuilt) {
    MATERIAL_MAP[item.id] = item;
  }
}

export interface ApplianceMeta {
  id: ApplianceModel;
  name: string;
  desc: string;
  width: number;
  height: number;
  depth: number;
  defaultY: number;
  defaultPricePln: number;
  slidesOut?: boolean;
}

export const APPLIANCE_CATALOG: ApplianceMeta[] = [
  {
    id: 'wardrobe_rod',
    name: 'Drążek na wieszaki (chrom)',
    desc: '764 × 35 × 35 mm · Z rozetami i 3 wieszakami',
    width: 764,
    height: 35,
    depth: 35,
    defaultY: 1650,
    defaultPricePln: 65,
  },
  {
    id: 'wire_cargo',
    name: 'Kosz cargo / wysuwany',
    desc: '360 × 520 × 460 mm · 2 poziomy, wysuwa się z szufladami',
    width: 360,
    height: 520,
    depth: 460,
    defaultY: 420,
    defaultPricePln: 340,
    slidesOut: true,
  },
  {
    id: 'induction_hob',
    name: 'Płyta indukcyjna 60 cm',
    desc: '590 × 45 × 520 mm · Szkło ceramiczne, 4 pola grzewcze',
    width: 590,
    height: 45,
    depth: 520,
    defaultY: 855,
    defaultPricePln: 1450,
  },
  {
    id: 'kitchen_sink',
    name: 'Zlewozmywak z baterią',
    desc: '580 × 210 × 480 mm · Komora stalowa + bateria łukowa',
    width: 580,
    height: 210,
    depth: 480,
    defaultY: 790,
    defaultPricePln: 890,
  },
  {
    id: 'builtin_oven',
    name: 'Piekarnik do zabudowy 60',
    desc: '595 × 595 × 550 mm · Front czarny + stal, wyświetlacz',
    width: 595,
    height: 595,
    depth: 550,
    defaultY: 500,
    defaultPricePln: 1850,
  },
];

export const ASSEMBLY_STEPS: Array<{ step: number; title: string; desc: string }> = [
  { step: 1, title: 'Korpus główny', desc: 'Skręcenie boków, wieńców, przegród i stelaża nośnego' },
  { step: 2, title: 'Podstawa i plecy', desc: 'Montaż nóżek/cokołu oraz wbicie lub wsunięcie pleców HDF' },
  { step: 3, title: 'Wnętrze, półki i szuflady', desc: 'Osadzenie półek, prowadnic, szuflad, cargo i drążków' },
  { step: 4, title: 'Fronty i drzwiczki', desc: 'Zawieszenie frontów na zawiasach Ø35 i przykręcenie frontów szuflad' },
  { step: 5, title: 'Blat i AGD', desc: 'Osadzenie blatu roboczego, zlewu, płyty grzewczej i piekarnika' },
];

export const SCREW_CATALOG: ScrewMeta[] = [
  {
    id: 'wood_4x45',
    name: 'Wkręt do drewna 4×45 mm',
    shortName: 'Wkręt 4×45',
    diameterMm: 4,
    lengthMm: 45,
    usage: 'Płyty OSB, sklejka, drewno',
    colorHex: '#D4A84B',
  },
  {
    id: 'confirmat_7x50',
    name: 'Konfirmat 7×50 mm',
    shortName: 'Konfirmat 7×50',
    diameterMm: 7,
    lengthMm: 50,
    usage: 'Korpusy z płyt meblowych 18 mm',
    colorHex: '#C5CBD3',
  },
  {
    id: 'minifix_15',
    name: 'Mimośród Minifix Ø15 + trzpień 34 mm',
    shortName: 'Minifix Ø15',
    diameterMm: 15,
    lengthMm: 42,
    usage: 'Niewidoczne złącza meblowe bez łbów na boku',
    colorHex: '#A7B1BC',
  },
  {
    id: 'bolt_m8',
    name: 'Śruba zamkowa / M8×55',
    shortName: 'Śruba M8',
    diameterMm: 8,
    lengthMm: 55,
    usage: 'Regały stalowe i profile magazynowe',
    colorHex: '#6E7580',
  },
  {
    id: 'dowel_8x35',
    name: 'Kołek bukowy 8×35 mm',
    shortName: 'Kołek 8×35',
    diameterMm: 8,
    lengthMm: 35,
    usage: 'Połączenia niewidoczne w płytach',
    colorHex: '#C89E6C',
  },
];

export const SCREW_MAP: Record<ScrewType, ScrewMeta> = SCREW_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<ScrewType, ScrewMeta>
);

export const PART_KIND_LABELS: Record<PartKind, string> = {
  panel: 'Płyta prostokątna',
  sloped: 'Płyta ze skosem',
  profile: 'Profil / Belka',
  door: 'Front z uchwytem',
  countertop: 'Blat kuchenny',
  custom: 'Własny kształt (2D)',
  appliance: 'Wnętrze / AGD 3D',
};
