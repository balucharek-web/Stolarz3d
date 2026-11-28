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
  | 'glass_clear'
  | 'pine_timber'
  | 'spruce_plank'
  | 'larch_impregnated'
  | 'styrofoam_eps'
  | 'mineral_wool'
  | 'roof_shingle';

export type MaterialId = BuiltInMaterialId | (string & {});

export type PartKind =
  | 'panel'
  | 'sloped'
  | 'profile'
  | 'door'
  | 'countertop'
  | 'custom'
  | 'appliance';

export type ApplianceCategory = 'kitchen' | 'bathroom' | 'wardrobe' | 'living';

export type ApplianceModel =
  | 'wardrobe_rod'
  | 'induction_hob'
  | 'kitchen_sink'
  | 'builtin_oven'
  | 'wire_cargo'
  | 'fridge_freezer'
  | 'dishwasher_60'
  | 'range_hood'
  | 'microwave_builtin'
  | 'wc_geberit'
  | 'wc_low_cistern'
  | 'wc_high_cistern'
  | 'bathroom_sink'
  | 'shower_cabin'
  | 'bathtub_170'
  | 'washing_machine'
  | 'tumble_dryer'
  | 'towel_radiator'
  | 'led_mirror'
  | 'bed_double'
  | 'bed_single'
  | 'dressing_bench'
  | 'tv_65'
  | 'sofa_3seat'
  | 'office_chair'
  | 'desk_monitor_set'
  | 'coffee_table';

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

export type DrawerSlideType = 'none' | 'ball_26mm' | 'undermount_blum' | 'tandembox_metabox';

export type EditorTool = 'select' | 'move' | 'rotate' | 'resize' | 'screw' | 'measure';

export type CameraPreset = 'iso' | 'front' | 'back' | 'left' | 'right' | 'side' | 'top';

export type StudioLighting = 'daylight' | 'studio' | 'warm' | 'photoreal';

export type SceneBackdropTheme = 'studio_light' | 'workshop_dark' | 'blueprint_sketch';

export type MaterialCategory =
  | 'Płyty konstrukcyjne'
  | 'Płyty meblowe'
  | 'Blaty'
  | 'Budowa i ogród'
  | 'Izolacja i dach'
  | 'Stal i szkło';

export interface MaterialMeta {
  id: MaterialId;
  name: string;
  shortName: string;
  category: MaterialCategory;
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
  barLengthMm?: number;
  pricePerLinearMPln?: number;
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

/** Recessed aluminum LED strip groove (frez pod profil LED np. 10×8 mm) */
export interface LedGrooveConfig {
  enabled: boolean;
  edge: 'front' | 'back' | 'left' | 'right';
  /** Distance from edge to LED groove center (mm), e.g. 45 mm */
  insetMm: number;
  /** Channel width (mm), e.g. 10 or 12 mm */
  widthMm: number;
  /** Channel depth (mm), e.g. 8 mm */
  depthMm: number;
}

/** Workshop offcut / scrap board remnant available for 2D nesting before buying fresh sheets */
export interface OffcutRemnant {
  id: string;
  materialId: MaterialId;
  thicknessMm: number;
  /** Length along grain (mm) */
  lengthMm: number;
  /** Width across grain (mm) */
  widthMm: number;
  quantity: number;
  label?: string;
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
  /** Angled saw miter cut at start end of timber/steel profile (-45..45 deg) */
  beamCutStartDeg?: number;
  /** Angled saw miter cut at far end of timber/steel profile (-45..45 deg) */
  beamCutEndDeg?: number;
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
  /** Recessed aluminum LED strip channel groove (frez pod profil LED) */
  ledGroove?: LedGrooveConfig;
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
    | 'flap_door'
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
  /** Outliner visibility toggle (when true, hidden from 3D viewport & raycasting) */
  hidden?: boolean;
  /** Outliner lock toggle (when true, cannot be moved, rotated, or resized) */
  locked?: boolean;
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
  flapLiftPricePln?: number;
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
  flapLiftPricePln: 145,
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

export interface RoomVertex {
  id: string;
  /** World X coordinate in mm */
  xMm: number;
  /** World Z coordinate in mm */
  zMm: number;
}

export type RoomOpeningType =
  | 'door_single'
  | 'door_double'
  | 'window'
  | 'window_balcony'
  | 'arch';

export interface RoomOpening {
  id: string;
  type: RoomOpeningType;
  label: string;
  /** Index of wall segment floorPoints[wallIndex] -> floorPoints[(wallIndex+1)%n] */
  wallIndex: number;
  /** Distance along wall from start vertex to opening start edge (mm) */
  offsetMm: number;
  /** Opening clear width (mm) */
  widthMm: number;
  /** Opening clear height (mm) */
  heightMm: number;
  /** Sill height from floor (mm): 0 for doors/balcony/arch, ~850-900 for windows */
  sillHeightMm: number;
  /** For hinged doors: opens into the room (true) or outward (false) */
  swingInward?: boolean;
  /** For single doors: hinge side looking from inside the room */
  hingeSide?: 'left' | 'right';
}

export type RoomWallObstacleType =
  | 'socket'
  | 'switch'
  | 'radiator'
  | 'pipe'
  | 'vent'
  | 'wc_geberit'
  | 'wc_low_cistern'
  | 'wc_high_cistern';

export interface RoomWallObstacle {
  id: string;
  type: RoomWallObstacleType;
  label: string;
  /** Index of wall segment floorPoints[wallIndex] -> floorPoints[(wallIndex+1)%n] */
  wallIndex: number;
  /** Distance along wall from start vertex to obstacle left edge (mm) */
  offsetMm: number;
  /** Height of obstacle bottom from floor (mm) */
  elevationMm: number;
  widthMm: number;
  heightMm: number;
  /** Protrusion into room from inner wall surface (mm) */
  depthMm: number;
}

export type RoomWallFinish =
  | 'white_plaster'
  | 'warm_alabaster'
  | 'warm_greige'
  | 'light_concrete'
  | 'sage_plaster'
  | 'anthracite_accent';

export type RoomFloorFinish =
  | 'oak_parquet'
  | 'herringbone_oak'
  | 'concrete_screed'
  | 'ceramic_tile'
  | 'dark_walnut';

export type RoomCutawayMode = 'smart_cutaway' | 'solid' | 'translucent';

export interface RoomStyle {
  wallFinish: RoomWallFinish;
  floorFinish: RoomFloorFinish;
  showBaseboards: boolean;
  baseboardHeightMm: number;
  wallCutawayMode: RoomCutawayMode;
}

export const DEFAULT_ROOM_STYLE: RoomStyle = {
  wallFinish: 'warm_alabaster',
  floorFinish: 'oak_parquet',
  showBaseboards: true,
  baseboardHeightMm: 80,
  wallCutawayMode: 'smart_cutaway',
};

export interface RoomSlopedCeiling {
  enabled: boolean;
  side: 'left' | 'right';
  /** Knee wall height where slope starts (mm), e.g. 1350 mm */
  kneeWallHeightMm: number;
  /** Horizontal run of the ceiling slope into the room (mm) */
  slopeWidthMm: number;
}

export interface RoomWallSlope {
  /** Polygon wall segment index where the knee wall sits */
  wallIndex: number;
  /** Knee wall height along this wall (mm), e.g. 1200 mm */
  kneeWallHeightMm: number;
  /** Horizontal run of the roof slope inward from this wall (mm), e.g. 1600 mm */
  slopeDepthMm: number;
}

export interface RoomConfig {
  enabled: boolean;
  /** Total room / alcove width (X, centered around 0, mm) — synced with polygon bounds */
  widthMm: number;
  /** Ceiling height (Y from floor, mm) */
  heightMm: number;
  /** Distance from back wall to front of room (mm) — synced with polygon bounds */
  depthMm: number;
  /** World Z coordinate of the inner face of the back wall (mm), default -320 */
  backWallZMm: number;
  showBackWall: boolean;
  showLeftWall: boolean;
  showRightWall: boolean;
  showCeiling: boolean;
  slopedCeiling: RoomSlopedCeiling;
  /** Per-wall roof slopes attached to any polygon wall segment(s) */
  wallSlopes?: RoomWallSlope[];
  /** Legacy rectangular wall obstacles (kept for backward compatibility) */
  obstacles: RoomObstacle[];
  /** Custom 2D architectural floorplan polygon vertices in world (xMm, zMm) */
  floorPoints?: RoomVertex[];
  /** Architectural wall thickness (mm), default 120 */
  wallThicknessMm?: number;
  /** Optional wall segment indices manually hidden in 3D */
  hiddenWallIndices?: number[];
  /** Doors, windows, balcony doors, and open passages placed on polygon walls */
  openings?: RoomOpening[];
  /** Radiators, sockets, pipes, switches, vents mounted on polygon walls */
  wallObstacles?: RoomWallObstacle[];
  /** Visual architectural finish & 3D cutaway display style */
  style?: RoomStyle;
}

export const DEFAULT_ROOM_CONFIG: RoomConfig = {
  enabled: false,
  widthMm: 3400,
  heightMm: 2600,
  depthMm: 2800,
  backWallZMm: -340,
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
  floorPoints: [
    { id: 'v_0', xMm: -1700, zMm: -340 },
    { id: 'v_1', xMm: 1700, zMm: -340 },
    { id: 'v_2', xMm: 1700, zMm: 2460 },
    { id: 'v_3', xMm: -1700, zMm: 2460 },
  ],
  wallThicknessMm: 120,
  hiddenWallIndices: [],
  openings: [],
  wallObstacles: [],
  style: { ...DEFAULT_ROOM_STYLE },
};

export type CabinetPresetId =
  | 'base_kitchen'
  | 'corner_l'
  | 'wall_corner_l'
  | 'drawer_chest'
  | 'wall_cabinet'
  | 'wardrobe'
  | 'sliding_wardrobe'
  | 'tv_console'
  | 'steel_rack'
  | 'oven_tower'
  | 'sink_cabinet'
  | 'dishwasher_bay'
  | 'tall_pantry'
  | 'fridge_tower'
  | 'kitchen_island';

export type CabinetPlacementMode = 'auto' | 'right' | 'left' | 'back_wall' | 'center';

export interface ParametricCabinetConfig {
  name: string;
  preset: CabinetPresetId;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  boardThicknessMm: number;
  /** Floor clearance / plinth height (0 = sitting flat on floor, e.g. 100mm for kitchen legs/plinth) */
  plinthHeightMm: number;
  /** Elevation from floor (e.g. 1400mm for hanging wall cabinet) */
  elevationYmm: number;
  plinthStyle: 'plinth_board' | 'legs' | 'none';
  /** Full top deck vs 2 upper stretchers (trawersy) for kitchen base cabinets */
  topType: 'full_panel' | 'stretchers';
  /** Internal vertical dividers (0, 1, or 2 bays) */
  verticalDividers: 0 | 1 | 2;
  shelfCount: number;
  drawerCount: number;
  doorMode: 'none' | 'single_left' | 'single_right' | 'double' | 'flap_up';
  frontType: 'overlay' | 'inset';
  frontGapMm: number;
  handleStyle: HandleStyle;
  backType: 'hdf_grooved' | 'hdf_nailed' | 'none';
  slideType: DrawerSlideType;
  /** Optional wall filler strip (blenda przyścienna) for flush installation against uneven walls */
  wallFillerSide: 'none' | 'left' | 'right' | 'both';
  wallFillerWidthMm: number;
  /** Enable System 32 shelf-pin Ø5 drilling rows on vertical walls */
  system32Holes: boolean;
  /** Blind panel width for L-corner blind kitchen cabinet */
  cornerBlindWidthMm?: number;
  /** Include oval chrome wardrobe hanging rod inside upper bay */
  addWardrobeRod?: boolean;
  /** Include recessed 10×8 mm LED aluminum strip groove in bottom deck (wall cabinets) or sides */
  addLedGroove?: boolean;
  corpusMaterialId: MaterialId;
  frontMaterialId: MaterialId;
  frontFinish: SurfaceFinish;
  addCountertop: boolean;
  countertopMaterialId: MaterialId;
  autoFasteners: boolean;
  fastenerType: ScrewType;
}

export interface FurnitureProject {
  id: string;
  name: string;
  parts: FurniturePart[];
  fasteners: Fastener[];
  room?: RoomConfig;
  /** Saved parametric generator configurations keyed by groupId so cabinets can be re-edited later */
  cabinetConfigs?: Record<string, ParametricCabinetConfig>;
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
  // ==================== BUDOWA I OGRÓD (KANTÓWKI, DESKI, IZOLACJA, DACH) ====================
  {
    id: 'pine_timber',
    name: 'Kantówka sosnowa C24',
    shortName: 'Kantówka C24',
    category: 'Budowa i ogród',
    defaultThicknessMm: 50,
    sheetWidthMm: 3000,
    sheetHeightMm: 100,
    pricePerM2Pln: 95,
    swatchFallbackHex: '#DAB57E',
    grainDirectional: true,
    barLengthMm: 3000,
    pricePerLinearMPln: 14,
  },
  {
    id: 'spruce_plank',
    name: 'Deska elewacyjna / Boazeria',
    shortName: 'Deska / Boaz.',
    category: 'Budowa i ogród',
    defaultThicknessMm: 19,
    sheetWidthMm: 2400,
    sheetHeightMm: 145,
    pricePerM2Pln: 68,
    swatchFallbackHex: '#CCA068',
    grainDirectional: true,
    barLengthMm: 2400,
    pricePerLinearMPln: 11,
  },
  {
    id: 'larch_impregnated',
    name: 'Drewno impregnowane (modrzew)',
    shortName: 'Impregnowane',
    category: 'Budowa i ogród',
    defaultThicknessMm: 28,
    sheetWidthMm: 3000,
    sheetHeightMm: 140,
    pricePerM2Pln: 115,
    swatchFallbackHex: '#9C6D3E',
    grainDirectional: true,
    barLengthMm: 3000,
    pricePerLinearMPln: 19,
  },
  {
    id: 'styrofoam_eps',
    name: 'Styropian EPS 50 mm',
    shortName: 'Styropian EPS',
    category: 'Izolacja i dach',
    defaultThicknessMm: 50,
    sheetWidthMm: 1000,
    sheetHeightMm: 500,
    pricePerM2Pln: 26,
    swatchFallbackHex: '#F2F4F7',
  },
  {
    id: 'mineral_wool',
    name: 'Wełna mineralna 50 mm',
    shortName: 'Wełna min.',
    category: 'Izolacja i dach',
    defaultThicknessMm: 50,
    sheetWidthMm: 1200,
    sheetHeightMm: 600,
    pricePerM2Pln: 28,
    swatchFallbackHex: '#D8B85C',
  },
  {
    id: 'roof_shingle',
    name: 'Papa / Gont bitumiczny',
    shortName: 'Papa / Gont',
    category: 'Izolacja i dach',
    defaultThicknessMm: 4,
    sheetWidthMm: 1000,
    sheetHeightMm: 1000,
    pricePerM2Pln: 39,
    swatchFallbackHex: '#2E3136',
  },
];

export const DEFAULT_MATERIAL_CATALOG: MaterialMeta[] = MATERIAL_CATALOG.map((m) => ({
  ...m,
  grainDirectional:
    m.grainDirectional ??
    (m.id === 'oak_craft' ||
      m.id === 'walnut' ||
      m.id === 'pine_timber' ||
      m.id === 'spruce_plank' ||
      m.id === 'larch_impregnated'),
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
          barLengthMm: ov.barLengthMm ?? base.barLengthMm,
          pricePerLinearMPln: ov.pricePerLinearMPln ?? base.pricePerLinearMPln,
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
  category: ApplianceCategory;
  name: string;
  desc: string;
  mountHint: string;
  width: number;
  height: number;
  depth: number;
  defaultY: number;
  defaultPricePln: number;
  slidesOut?: boolean;
  tags?: string[];
}

export const APPLIANCE_CATALOG: ApplianceMeta[] = [
  // ==================== KUCHNIA (AGD & WYPOSAŻENIE) ====================
  {
    id: 'fridge_freezer',
    category: 'kitchen',
    name: 'Lodówka wolnostojąca No-Frost',
    desc: 'Stal szczotkowana inox, 2 skrzydła, wyświetlacz LED',
    mountHint: 'Wolnostojąca',
    width: 600,
    height: 1860,
    depth: 650,
    defaultY: 930,
    defaultPricePln: 2690,
    tags: ['chłodziarka', 'zamrażarka', 'inox', 'agd'],
  },
  {
    id: 'induction_hob',
    category: 'kitchen',
    name: 'Płyta indukcyjna 60 cm',
    desc: 'Szkło ceramiczne, 4 pola grzewcze, sterowanie dotykowe',
    mountHint: 'W blat',
    width: 590,
    height: 45,
    depth: 520,
    defaultY: 855,
    defaultPricePln: 1450,
    tags: ['indukcja', 'kuchenka', 'palniki', 'blat'],
  },
  {
    id: 'kitchen_sink',
    category: 'kitchen',
    name: 'Zlewozmywak z baterią',
    desc: 'Komora stalowa 1-komorowa + wysoka bateria łukowa',
    mountHint: 'W blat',
    width: 580,
    height: 210,
    depth: 480,
    defaultY: 790,
    defaultPricePln: 890,
    tags: ['zlew', 'kran', 'bateria', 'woda'],
  },
  {
    id: 'builtin_oven',
    category: 'kitchen',
    name: 'Piekarnik do zabudowy 60',
    desc: 'Front czarne szkło + stal, pokrętła i zegar LED',
    mountHint: 'Zabudowa 60',
    width: 595,
    height: 595,
    depth: 550,
    defaultY: 500,
    defaultPricePln: 1850,
    tags: ['piec', 'słupek', 'agd'],
  },
  {
    id: 'dishwasher_60',
    category: 'kitchen',
    name: 'Zmywarka 60 cm',
    desc: 'Panel sterowania, wyświetlacz czasu i cofnięty cokół',
    mountHint: 'Pod blat / wolnostojąca',
    width: 598,
    height: 845,
    depth: 600,
    defaultY: 423,
    defaultPricePln: 1990,
    tags: ['zmywanie', 'agd', '60'],
  },
  {
    id: 'range_hood',
    category: 'kitchen',
    name: 'Okap kominowy 60 cm',
    desc: 'Komin ze stali inox, filtry tłuszczu i 2 punkty LED',
    mountHint: 'Na ścianę',
    width: 600,
    height: 760,
    depth: 480,
    defaultY: 1880,
    defaultPricePln: 980,
    tags: ['pochłaniacz', 'wyciąg', 'wentylacja'],
  },
  {
    id: 'microwave_builtin',
    category: 'kitchen',
    name: 'Mikrofalówka do zabudowy',
    desc: 'Czarne szkło z ramką i panelem dotykowym',
    mountHint: 'Zabudowa 60',
    width: 595,
    height: 385,
    depth: 390,
    defaultY: 1380,
    defaultPricePln: 1190,
    tags: ['mikrofala', 'słupek', 'agd'],
  },
  {
    id: 'wire_cargo',
    category: 'kitchen',
    name: 'Kosz cargo wysuwany',
    desc: '2 poziomy chromowane, wysuwa się razem z suwakiem Otwórz',
    mountHint: 'Wnętrze szafki',
    width: 360,
    height: 520,
    depth: 460,
    defaultY: 420,
    defaultPricePln: 340,
    slidesOut: true,
    tags: ['koszyk', 'szafka', 'wysuwany'],
  },

  // ==================== ŁAZIENKA (SANITARIATY & PRALNIA) ====================
  {
    id: 'wc_geberit',
    category: 'bathroom',
    name: 'WC podtynkowe (Geberit)',
    desc: 'Zabudowa stelaża, przycisk dwudzielny i miska wisząca',
    mountHint: 'Przy ścianie',
    width: 500,
    height: 1200,
    depth: 720,
    defaultY: 600,
    defaultPricePln: 1950,
    tags: ['toaleta', 'kibel', 'stelaż', 'miska', 'sanitariat'],
  },
  {
    id: 'wc_low_cistern',
    category: 'bathroom',
    name: 'Muszla WC dolnopłukowa (kompakt)',
    desc: 'Klasyczny kompakt stojący ze spłuczką ceramiczną',
    mountHint: 'Stojąca',
    width: 380,
    height: 790,
    depth: 650,
    defaultY: 395,
    defaultPricePln: 790,
    tags: ['toaleta', 'kompakt', 'dolnopłuk', 'muszla'],
  },
  {
    id: 'wc_high_cistern',
    category: 'bathroom',
    name: 'Muszla WC górnopłukowa',
    desc: 'Muszla stojąca + wysoka spłuczka z chromowaną rurą',
    mountHint: 'Stojąca + ściana',
    width: 380,
    height: 2050,
    depth: 580,
    defaultY: 1025,
    defaultPricePln: 980,
    tags: ['toaleta', 'górnopłuk', 'retro', 'spłuczka'],
  },
  {
    id: 'bathroom_sink',
    category: 'bathroom',
    name: 'Umywalka nablatowa z baterią',
    desc: 'Ceramiczna misa z korkiem klik-klak i baterią sztorcową',
    mountHint: 'Na blat / szafkę',
    width: 520,
    height: 260,
    depth: 410,
    defaultY: 960,
    defaultPricePln: 680,
    tags: ['umywalka', 'zlew', 'bateria', 'ceramika'],
  },
  {
    id: 'shower_cabin',
    category: 'bathroom',
    name: 'Kabina prysznicowa Walk-In 90×90',
    desc: 'Niski brodzik z odpływem, szkło hartowane i deszczownica',
    mountHint: 'Narożna',
    width: 900,
    height: 2050,
    depth: 900,
    defaultY: 1025,
    defaultPricePln: 2250,
    tags: ['prysznic', 'brodzik', 'natrysk', 'deszczownica'],
  },
  {
    id: 'bathtub_170',
    category: 'bathroom',
    name: 'Wanna prostokątna 170×75',
    desc: 'Akrylowa wanna z wyprofilowanym wnętrzem i baterią',
    mountHint: 'Stojąca / przy ścianie',
    width: 1700,
    height: 580,
    depth: 750,
    defaultY: 290,
    defaultPricePln: 1690,
    tags: ['wanna', 'kąpiel', 'akryl'],
  },
  {
    id: 'washing_machine',
    category: 'bathroom',
    name: 'Pralka 60 cm (ładowana od frontu)',
    desc: 'Przeszklony bulaj z bębnem inox, szuflada i pokrętło',
    mountHint: 'Wolnostojąca',
    width: 600,
    height: 850,
    depth: 560,
    defaultY: 425,
    defaultPricePln: 1890,
    tags: ['pranie', 'pralnia', 'agd'],
  },
  {
    id: 'tumble_dryer',
    category: 'bathroom',
    name: 'Suszarka bębnowa 60 cm',
    desc: 'Dopasowana wymiarem do ustawienia w słupku na pralce',
    mountHint: 'Wolnostojąca / słupek',
    width: 600,
    height: 850,
    depth: 600,
    defaultY: 425,
    defaultPricePln: 2290,
    tags: ['suszenie', 'pralnia', 'słupek', 'agd'],
  },
  {
    id: 'towel_radiator',
    category: 'bathroom',
    name: 'Grzejnik łazienkowy drabinkowy',
    desc: 'Antracytowa drabinka 50×120 cm z zaworami dolnymi',
    mountHint: 'Na ścianę',
    width: 500,
    height: 1200,
    depth: 95,
    defaultY: 1350,
    defaultPricePln: 590,
    tags: ['kaloryfer', 'grzejnik', 'drabinka', 'ręczniki'],
  },
  {
    id: 'led_mirror',
    category: 'bathroom',
    name: 'Lustro łazienkowe LED 80×70',
    desc: 'Bezramowa tafla lustrzana z ciepłym podświetleniem tylnym',
    mountHint: 'Na ścianę',
    width: 800,
    height: 700,
    depth: 35,
    defaultY: 1520,
    defaultPricePln: 490,
    tags: ['lustro', 'światło', 'led', 'nad umywalkę'],
  },

  // ==================== GARDEROBA I SYPIALNIA ====================
  {
    id: 'wardrobe_rod',
    category: 'wardrobe',
    name: 'Drążek na wieszaki (chrom)',
    desc: 'Owalny drążek z rozetami bocznymi i 3 wieszakami',
    mountHint: 'Wnętrze szafy',
    width: 764,
    height: 35,
    depth: 35,
    defaultY: 1650,
    defaultPricePln: 65,
    tags: ['szafa', 'wieszak', 'ubrania'],
  },
  {
    id: 'bed_double',
    category: 'wardrobe',
    name: 'Łóżko dwuosobowe 160×200',
    desc: 'Tapicerowany zagłówek, materac, 2 poduszki i narzuta',
    mountHint: 'Stojące',
    width: 1680,
    height: 950,
    depth: 2120,
    defaultY: 475,
    defaultPricePln: 2850,
    tags: ['sypialnia', 'materac', 'małżeńskie'],
  },
  {
    id: 'bed_single',
    category: 'wardrobe',
    name: 'Łóżko jednoosobowe 90×200',
    desc: 'Kompaktowe łóżko z zagłówkiem, materacem i poduszką',
    mountHint: 'Stojące',
    width: 980,
    height: 880,
    depth: 2100,
    defaultY: 440,
    defaultPricePln: 1590,
    tags: ['sypialnia', 'pokój dziecięcy', 'materac'],
  },
  {
    id: 'dressing_bench',
    category: 'wardrobe',
    name: 'Ławka / Pufa do garderoby',
    desc: 'Stalowa podstawa loft + tapicerowane siedzisko',
    mountHint: 'Stojąca',
    width: 900,
    height: 450,
    depth: 380,
    defaultY: 225,
    defaultPricePln: 480,
    tags: ['przedpokój', 'siedzisko', 'pufa', 'garderoba'],
  },

  // ==================== SALON I BIURO ====================
  {
    id: 'tv_65',
    category: 'living',
    name: 'Telewizor 65" OLED / QLED',
    desc: 'Ultracienka ramka, szklana matryca i metalowa podstawa',
    mountHint: 'Na szafkę RTV / ścianę',
    width: 1450,
    height: 860,
    depth: 240,
    defaultY: 950,
    defaultPricePln: 4990,
    tags: ['tv', 'ekran', 'rtv', 'kino'],
  },
  {
    id: 'sofa_3seat',
    category: 'living',
    name: 'Sofa 3-osobowa (210 cm)',
    desc: 'Nowoczesna kanapa z 3 poduchami na dębowych nóżkach',
    mountHint: 'Stojąca',
    width: 2100,
    height: 820,
    depth: 920,
    defaultY: 410,
    defaultPricePln: 3690,
    tags: ['kanapa', 'wypoczynek', 'salon'],
  },
  {
    id: 'office_chair',
    category: 'living',
    name: 'Fotel biurowy ergonomiczny',
    desc: 'Podstawa na kółkach, wyprofilowane oparcie i podłokietniki',
    mountHint: 'Stojący',
    width: 640,
    height: 1120,
    depth: 640,
    defaultY: 560,
    defaultPricePln: 990,
    tags: ['krzesło', 'biurko', 'praca', 'gabinet'],
  },
  {
    id: 'desk_monitor_set',
    category: 'living',
    name: 'Monitor 27" + klawiatura i mysz',
    desc: 'Cienkoramkowy ekran na stopce + zestaw bezprzewodowy',
    mountHint: 'Na biurko',
    width: 620,
    height: 450,
    depth: 260,
    defaultY: 975,
    defaultPricePln: 1350,
    tags: ['komputer', 'biurko', 'ekran', 'praca'],
  },
  {
    id: 'coffee_table',
    category: 'living',
    name: 'Stolik kawowy okrągły Ø80',
    desc: 'Okrągły blat dębowy + czarna stalowa podstawa',
    mountHint: 'Stojący',
    width: 800,
    height: 420,
    depth: 800,
    defaultY: 210,
    defaultPricePln: 640,
    tags: ['ława', 'stolik', 'salon'],
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
