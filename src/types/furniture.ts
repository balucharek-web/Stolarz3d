export type MaterialId =
  | 'osb3'
  | 'oak_craft'
  | 'walnut'
  | 'birch_plywood'
  | 'white_matte'
  | 'anthracite_matte'
  | 'concrete_top'
  | 'steel_black'
  | 'steel_galv'
  | 'glass_clear';

export type PartKind = 'panel' | 'sloped' | 'profile' | 'door' | 'countertop' | 'custom';

export type ScrewType =
  | 'wood_4x45'
  | 'confirmat_7x50'
  | 'bolt_m8'
  | 'dowel_8x35';

export type HandleSide = 'left' | 'right' | 'top' | 'none';

export type EditorTool = 'select' | 'move' | 'rotate' | 'screw';

export type CameraPreset = 'iso' | 'front' | 'back' | 'left' | 'right' | 'side' | 'top';

export type StudioLighting = 'daylight' | 'studio' | 'warm';

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
  /** Rotate texture grain 90 degrees */
  grainRotated?: boolean;
  /** Custom 2D polygon vertices [xMm, yMm] centered around (0, 0) for kind === 'custom' */
  customPolygon?: [number, number][];
  /** Optional edge banding (okleina ABS/PCV) for cut list & sizing */
  edgeBanding?: EdgeBandingConfig;
  /** Optional group name/id so grouped parts move together */
  groupId?: string;
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

export interface FurnitureProject {
  id: string;
  name: string;
  parts: FurniturePart[];
  fasteners: Fastener[];
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

export const MATERIAL_MAP: Record<MaterialId, MaterialMeta> = MATERIAL_CATALOG.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<MaterialId, MaterialMeta>
);

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
};
