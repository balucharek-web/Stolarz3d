import * as THREE from 'three';
import { getMaterialMeta, MaterialId, SurfaceFinish } from '../types/furniture';

import texOsbUrl from '../assets/images/tex_osb3_board_1795690459304.jpg';
import texOakUrl from '../assets/images/tex_oak_craft_1795344820546.jpg';
import texWalnutUrl from '../assets/images/tex_walnut_wood_1795344821285.jpg';
import texBirchUrl from '../assets/images/tex_birch_plywood_1795344820360.jpg';
import texConcreteUrl from '../assets/images/tex_concrete_top_1795344822022.jpg';
import texGalvUrl from '../assets/images/tex_steel_galv_1795344820306.jpg';

export type BoardEdgeMode = 'banded' | 'raw';

const DEFAULT_PHOTO_URLS: Partial<Record<MaterialId, string>> = {
  osb3: texOsbUrl,
  oak_craft: texOakUrl,
  walnut: texWalnutUrl,
  birch_plywood: texBirchUrl,
  concrete_top: texConcreteUrl,
  steel_galv: texGalvUrl,
};

interface PhotoPbrProfile {
  /** High-pass detail blur radius (px at derivedSize) separating broad color clouds from real micro-pores */
  highPassRadius: number;
  /** Weight of high-pass micro-pores vs subtle macro height (0..1; higher = flatter color bands, crisper pores) */
  highPassWeight: number;
  /** Sobel strength applied to extracted micro-pore height map */
  normalStrength: number;
  /** Three.js normalScale multiplier */
  normalScale: number;
  /** Minimum linear roughness byte (0..255) on smooth ridges/fibers */
  roughMin: number;
  /** Maximum linear roughness byte (0..255) inside pores/crevices */
  roughMax: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  specularIntensity: number;
  envMapIntensity: number;
  /** Physical UV repeat factor relative to 1250mm baseline so wood grain/strands/crystals match real cm scale */
  tileScale: number;
  /** True for bundled seamless studio scans (zero destructive quilting!) */
  isSeamlessScan: boolean;
  /** Whether board shows ABS edge banding or raw particleboard core on cut edges */
  edgeStyle: 'osb' | 'plywood' | 'melamine' | 'metal';
  /** Base pigment RGB for matching ABS edge-band material */
  edgeRgb: [number, number, number];
}

const DEFAULT_CUSTOM_PROFILE: PhotoPbrProfile = {
  highPassRadius: 5,
  highPassWeight: 0.82,
  normalStrength: 1.2,
  normalScale: 0.24,
  roughMin: 152,
  roughMax: 218,
  metalness: 0.0,
  clearcoat: 0.0,
  clearcoatRoughness: 0.55,
  specularIntensity: 0.45,
  envMapIntensity: 0.68,
  tileScale: 1.0,
  isSeamlessScan: false,
  edgeStyle: 'melamine',
  edgeRgb: [184, 155, 114],
};

const PHOTO_PROFILES: Partial<Record<MaterialId, PhotoPbrProfile>> = {
  osb3: {
    highPassRadius: 6,
    highPassWeight: 0.72,
    normalStrength: 1.75,
    normalScale: 0.38,
    roughMin: 176,
    roughMax: 242,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.65,
    specularIntensity: 0.35,
    envMapIntensity: 0.52,
    tileScale: 1.45, // ~860 mm tile -> authentic 6-10 cm pressed pine/spruce OSB-3 strands
    isSeamlessScan: true,
    edgeStyle: 'osb',
    edgeRgb: [204, 158, 96],
  },
  oak_craft: {
    highPassRadius: 4,
    highPassWeight: 0.88, // Real Egger Feelwood ST37: flat pressed laminate with crisp fine oak pores
    normalStrength: 1.2,
    normalScale: 0.22,
    roughMin: 158,
    roughMax: 220,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.55,
    specularIntensity: 0.45,
    envMapIntensity: 0.65,
    tileScale: 1.0, // 1250 mm oak plank span
    isSeamlessScan: true,
    edgeStyle: 'melamine',
    edgeRgb: [192, 146, 94],
  },
  walnut: {
    highPassRadius: 4,
    highPassWeight: 0.88,
    normalStrength: 1.15,
    normalScale: 0.2,
    roughMin: 140,
    roughMax: 206,
    metalness: 0.0,
    clearcoat: 0.05,
    clearcoatRoughness: 0.52,
    specularIntensity: 0.52,
    envMapIntensity: 0.72,
    tileScale: 1.05,
    isSeamlessScan: true,
    edgeStyle: 'melamine',
    edgeRgb: [96, 66, 46],
  },
  birch_plywood: {
    highPassRadius: 4,
    highPassWeight: 0.9, // Smooth sanded birch veneer face
    normalStrength: 0.9,
    normalScale: 0.14,
    roughMin: 168,
    roughMax: 224,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.6,
    specularIntensity: 0.36,
    envMapIntensity: 0.58,
    tileScale: 1.0,
    isSeamlessScan: true,
    edgeStyle: 'plywood',
    edgeRgb: [228, 206, 174],
  },
  concrete_top: {
    highPassRadius: 5,
    highPassWeight: 0.86, // Smooth architectural micro-cement with tiny pinholes, no lumpy color hills
    normalStrength: 1.35,
    normalScale: 0.26,
    roughMin: 164,
    roughMax: 236,
    metalness: 0.0,
    clearcoat: 0.0,
    clearcoatRoughness: 0.58,
    specularIntensity: 0.42,
    envMapIntensity: 0.6,
    tileScale: 1.15,
    isSeamlessScan: true,
    edgeStyle: 'melamine',
    edgeRgb: [152, 155, 153],
  },
  steel_galv: {
    highPassRadius: 4,
    highPassWeight: 0.84,
    normalStrength: 0.85,
    normalScale: 0.13,
    roughMin: 68,
    roughMax: 148,
    metalness: 0.88,
    clearcoat: 0.0,
    clearcoatRoughness: 0.32,
    specularIntensity: 1.0,
    envMapIntensity: 1.15,
    tileScale: 1.85, // Authentic 1-2 cm zinc spangle crystals
    isSeamlessScan: true,
    edgeStyle: 'metal',
    edgeRgb: [172, 179, 186],
  },
};

function createRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface PBRCanvasSet {
  albedo: HTMLCanvasElement;
  height: HTMLCanvasElement;
  roughness: HTMLCanvasElement;
}

function createCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  return [canvas, ctx];
}

/** Center-crop any landscape/portrait photo into an exact power-of-two square canvas at full sharpness */
function drawSquareCropped(
  img: HTMLImageElement,
  targetSize: number
): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(targetSize);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  const nw = img.naturalWidth || targetSize;
  const nh = img.naturalHeight || targetSize;
  const side = Math.min(nw, nh);
  const sx = Math.floor((nw - side) * 0.5);
  const sy = Math.floor((nh - side) * 0.5);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);
  return canvas;
}

/**
 * Edge-only seamless toroidal border blend strictly for user-uploaded non-seamless photos.
 * Keeps the central 84% of the photograph 100% razor-sharp with zero ghostly patch stamps.
 */
function makeEdgeBlendedSeamless(
  srcCanvas: HTMLCanvasElement
): HTMLCanvasElement {
  const size = srcCanvas.width;
  const srcCtx = srcCanvas.getContext('2d', { willReadFrequently: true })!;
  const src = srcCtx.getImageData(0, 0, size, size).data;

  const [outCanvas, outCtx] = createCanvas(size);
  const outImg = outCtx.createImageData(size, size);
  const dst = outImg.data;

  const half = size >> 1;
  const blendBand = Math.max(8, Math.round(size * 0.09));

  const smoothstep = (t: number) => {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  };

  for (let y = 0; y < size; y++) {
    const distY = Math.min(y, size - 1 - y);
    const wy = distY < blendBand ? 1 - smoothstep(distY / blendBand) : 0;
    const sy = (y + half) % size;

    for (let x = 0; x < size; x++) {
      const distX = Math.min(x, size - 1 - x);
      const wx = distX < blendBand ? 1 - smoothstep(distX / blendBand) : 0;
      const w = Math.max(wx, wy) * 0.5;

      const idx = (y * size + x) * 4;
      if (w <= 0.001) {
        dst[idx] = src[idx];
        dst[idx + 1] = src[idx + 1];
        dst[idx + 2] = src[idx + 2];
        dst[idx + 3] = 255;
      } else {
        const sx = (x + half) % size;
        const sIdx = (sy * size + sx) * 4;
        const inv = 1 - w;
        dst[idx] = Math.round(src[idx] * inv + src[sIdx] * w);
        dst[idx + 1] = Math.round(src[idx + 1] * inv + src[sIdx + 1] * w);
        dst[idx + 2] = Math.round(src[idx + 2] * inv + src[sIdx + 2] * w);
        dst[idx + 3] = 255;
      }
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return outCanvas;
}

/** Fast toroidal separable box blur on a 1D Float32Array luminance buffer (O(N) regardless of radius) */
function separableToroidalBlur(
  src: Float32Array,
  size: number,
  radius: number
): Float32Array {
  if (radius <= 0) return src.slice();
  const temp = new Float32Array(size * size);
  const dst = new Float32Array(size * size);
  const windowSize = radius * 2 + 1;
  const invWindow = 1 / windowSize;

  // Horizontal pass
  for (let y = 0; y < size; y++) {
    const rowOff = y * size;
    let sum = 0;
    for (let dx = -radius; dx <= radius; dx++) {
      const wx = (dx + size) % size;
      sum += src[rowOff + wx];
    }
    for (let x = 0; x < size; x++) {
      temp[rowOff + x] = sum * invWindow;
      const removeX = (x - radius + size) % size;
      const addX = (x + radius + 1) % size;
      sum += src[rowOff + addX] - src[rowOff + removeX];
    }
  }

  // Vertical pass
  for (let x = 0; x < size; x++) {
    let sum = 0;
    for (let dy = -radius; dy <= radius; dy++) {
      const wy = (dy + size) % size;
      sum += temp[wy * size + x];
    }
    for (let y = 0; y < size; y++) {
      dst[y * size + x] = sum * invWindow;
      const removeY = (y - radius + size) % size;
      const addY = (y + radius + 1) % size;
      sum += temp[addY * size + x] - temp[removeY * size + x];
    }
  }

  return dst;
}

/** Sobel filter converting a normalized height buffer/canvas into a crisp Tangent-Space Normal Map */
function heightToNormalCanvas(
  heightCanvas: HTMLCanvasElement,
  strength: number
): HTMLCanvasElement {
  const w = heightCanvas.width;
  const h = heightCanvas.height;
  const srcCtx = heightCanvas.getContext('2d', { willReadFrequently: true })!;
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  const [outCanvas, outCtx] = createCanvas(w);
  outCanvas.height = h;
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sampleH = (x: number, y: number) => {
    const wx = ((x % w) + w) % w;
    const wy = ((y % h) + h) % h;
    return srcData[(wy * w + wx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * strength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * strength;
      const dZ = 1.0;

      const invLen = 1 / Math.sqrt(dX * dX + dY * dY + dZ * dZ);
      const idx = (y * w + x) * 4;
      dst[idx] = Math.round((-dX * invLen * 0.5 + 0.5) * 255);
      dst[idx + 1] = Math.round((-dY * invLen * 0.5 + 0.5) * 255);
      dst[idx + 2] = Math.round((dZ * invLen * 0.5 + 0.5) * 255);
      dst[idx + 3] = 255;
    }
  }

  outCtx.putImageData(outImg, 0, 0);
  return outCanvas;
}

/**
 * Physically-calibrated PBR map extractor:
 * - Preserves 100% razor-sharp photographic Albedo (no destructive patch quilting!)
 * - Extracts High-Pass micro-pores / fibers / pinholes for Tangent-Space Normals so broad
 *   dark color clouds & knots never become bumpy plastic craters!
 * - Builds physically-grounded Roughness maps (micro-pores rougher, smooth ridges/crystals cleaner).
 */
function buildPhotoMapsFromImage(
  img: HTMLImageElement,
  profile: PhotoPbrProfile,
  albedoSize: number,
  derivedSize: number
): {
  albedoCanvas: HTMLCanvasElement;
  normalCanvas: HTMLCanvasElement;
  roughnessCanvas: HTMLCanvasElement;
} {
  const rawSquare = drawSquareCropped(img, albedoSize);
  const albedoCanvas = profile.isSeamlessScan
    ? rawSquare
    : makeEdgeBlendedSeamless(rawSquare);

  const [lumCanvas, lumCtx] = createCanvas(derivedSize);
  lumCtx.imageSmoothingEnabled = true;
  lumCtx.imageSmoothingQuality = 'high';
  lumCtx.drawImage(albedoCanvas, 0, 0, derivedSize, derivedSize);
  const srcImg = lumCtx.getImageData(0, 0, derivedSize, derivedSize);
  const src = srcImg.data;

  const pixelCount = derivedSize * derivedSize;
  const lumArr = new Float32Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    lumArr[i] = (0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2]) / 255;
  }

  // Broad color field removed via fast separable toroidal blur -> isolates true surface micro-relief!
  const blurRadius = Math.max(2, Math.round((profile.highPassRadius * derivedSize) / 512));
  const lowFreq = separableToroidalBlur(lumArr, derivedSize, blurRadius);

  const [roughCanvas, roughCtx] = createCanvas(derivedSize);
  const roughImg = roughCtx.createImageData(derivedSize, derivedSize);
  const rDst = roughImg.data;

  const hpW = profile.highPassWeight;
  const macroW = 1 - hpW;
  const roughSpan = profile.roughMax - profile.roughMin;

  for (let i = 0; i < pixelCount; i++) {
    const lum = lumArr[i];
    const hp = lum - lowFreq[i]; // negative in micro-pores/cracks, positive on fine ridges

    // Height: mostly high-pass micro-pores + gentle macro grounding
    const hNorm = Math.max(0, Math.min(1, 0.5 + hp * 2.4 * hpW + (lum - 0.5) * macroW));
    const hVal = Math.round(hNorm * 255);
    const idx = i * 4;
    src[idx] = hVal;
    src[idx + 1] = hVal;
    src[idx + 2] = hVal;
    src[idx + 3] = 255;

    // Roughness: micro-pores & crevices are noticeably rougher; smooth ridges/zinc spangles reflect cleanly
    const poreRoughBoost = Math.max(0, -hp * 2.8) * 0.45;
    const baseRoughFactor = Math.max(0, Math.min(1, 1 - lum * 0.65 + poreRoughBoost));
    const rVal = Math.round(
      Math.max(profile.roughMin, Math.min(profile.roughMax, profile.roughMin + baseRoughFactor * roughSpan))
    );
    rDst[idx] = rVal;
    rDst[idx + 1] = rVal;
    rDst[idx + 2] = rVal;
    rDst[idx + 3] = 255;
  }

  lumCtx.putImageData(srcImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);

  const normalCanvas = heightToNormalCanvas(lumCanvas, profile.normalStrength);
  return { albedoCanvas, normalCanvas, roughnessCanvas: roughCanvas };
}

/** Compressed cross-section edge texture for cut OSB-3 board edges (color-matched to golden pine/spruce OSB-3) */
function generateOsbEdge(size = 256): PBRCanvasSet {
  const rng = createRng(3099);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  ctx.fillStyle = '#B8894B';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#6E6E6E';
  hctx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#E6E6E6';
  rctx.fillRect(0, 0, size, size);

  const colors = ['#E5C48B', '#D4A564', '#BA8748', '#EDD19F', '#946530', '#704920'];
  for (let i = 0; i < 820; i++) {
    const x = rng() * size;
    const y = rng() * size;
    // Outer skins have slightly tighter horizontal strands, core has denser mixed chips
    const distFromCenter = Math.abs(y / size - 0.5) * 2;
    const w = (12 + rng() * 38) * (0.7 + distFromCenter * 0.5);
    const h = 1.5 + rng() * 4.5;
    const col = colors[Math.floor(rng() * colors.length)];
    const hv = Math.floor(72 + rng() * 150);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    if (x + w > size) ctx.fillRect(x - size, y, w, h);
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.fillRect(x, y, w, h);
    if (x + w > size) hctx.fillRect(x - size, y, w, h);
  }
  return { albedo, height, roughness };
}

/** Authentic 13-ply laminated Baltic birch plywood edge texture with phenolic glue lines & end-grain pores */
function generatePlywoodEdge(size = 256): PBRCanvasSet {
  const rng = createRng(4088);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  const plies = 13;
  const plyH = size / plies;

  for (let i = 0; i < plies; i++) {
    const y = i * plyH;
    const isCross = i % 2 === 1;
    const jitter = Math.round((rng() - 0.5) * 10);
    const r = (isCross ? 196 : 235) + jitter;
    const g = (isCross ? 160 : 213) + jitter;
    const b = (isCross ? 116 : 178) + jitter;
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(0, y, size, plyH);

    // Thin dark-brown phenolic resin glue line between plies
    ctx.fillStyle = 'rgba(116, 80, 44, 0.85)';
    ctx.fillRect(0, y, size, Math.max(1.1, plyH * 0.085));

    // Longitudinal fiber streaks or fine end-grain dots depending on ply orientation
    if (isCross) {
      for (let d = 0; d < 120; d++) {
        const dx = rng() * size;
        const dy = y + 1 + rng() * Math.max(1, plyH - 2);
        ctx.fillStyle = 'rgba(118, 82, 46, 0.22)';
        ctx.fillRect(dx, dy, 1.5, 1.5);
      }
    } else {
      for (let s = 0; s < 28; s++) {
        const sy = y + rng() * plyH;
        ctx.fillStyle = 'rgba(168, 132, 86, 0.16)';
        ctx.fillRect(0, sy, size, 1);
      }
    }

    const hv = isCross ? 122 : 146;
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.fillRect(0, y, size, plyH);
    hctx.fillStyle = 'rgb(84,84,84)';
    hctx.fillRect(0, y, size, 1.2);

    const rv = isCross ? 212 : 174;
    rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rctx.fillRect(0, y, size, plyH);
  }

  return { albedo, height, roughness };
}

/**
 * Realistic ABS/PCV factory edge-band texture (0.8 mm – 2 mm) for laminated furniture panels.
 * Features matched decor pigment, fine longitudinal satin grain, and ultra-subtle hairline
 * adhesive seam right at the top/bottom 3.5% of board thickness (as seen in Egger/PRO100 renders).
 */
function generateAbsEdgeBandPBR(
  rgb: [number, number, number],
  hasWoodStreaks: boolean,
  size = 256
): PBRCanvasSet {
  const rng = createRng(rgb[0] * 41 + rgb[1] * 29 + rgb[2] * 17 + (hasWoodStreaks ? 13 : 0));
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  // Slightly deeper natural edge tone (~97% luminance) so edges separate softly from broad faces
  const baseR = Math.round(rgb[0] * 0.97);
  const baseG = Math.round(rgb[1] * 0.97);
  const baseB = Math.round(rgb[2] * 0.97);

  ctx.fillStyle = `rgb(${baseR},${baseG},${baseB})`;
  ctx.fillRect(0, 0, size, size);

  hctx.fillStyle = 'rgb(134,134,134)';
  hctx.fillRect(0, 0, size, size);

  rctx.fillStyle = 'rgb(142,142,142)';
  rctx.fillRect(0, 0, size, size);

  if (hasWoodStreaks) {
    for (let i = 0; i < 65; i++) {
      const y = rng() * size;
      const h = 1 + rng() * 3.5;
      const dark = rng() > 0.42;
      ctx.fillStyle = dark ? 'rgba(38, 22, 10, 0.14)' : 'rgba(255, 244, 226, 0.08)';
      ctx.fillRect(0, y, size, h);
    }
  }

  // Ultra-subtle hairline PUR glue seam right along the top & bottom 3.5% of the 18mm edge
  const isLight = (baseR + baseG + baseB) / 3 > 165;
  const seamColor = isLight ? 'rgba(90, 94, 102, 0.16)' : 'rgba(12, 14, 18, 0.24)';
  const seamBand = Math.max(2, Math.round(size * 0.032));
  ctx.fillStyle = seamColor;
  ctx.fillRect(0, 0, size, seamBand);
  ctx.fillRect(0, size - seamBand, size, seamBand);

  hctx.fillStyle = 'rgb(104,104,104)';
  hctx.fillRect(0, 0, size, seamBand);
  hctx.fillRect(0, size - seamBand, size, seamBand);

  return { albedo, height, roughness };
}

/**
 * Authentic 3-layer raw Kronospan/Egger P2 particleboard core edge (fine dense outer skins,
 * coarser pressed wood chip center) shown on explicitly unbanded cut edges (thicknessMm === 0).
 */
function generateRawChipboardEdgePBR(size = 256): PBRCanvasSet {
  const rng = createRng(9127);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  ctx.fillStyle = '#BEA076';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = 'rgb(122,122,122)';
  hctx.fillRect(0, 0, size, size);
  rctx.fillStyle = 'rgb(228,228,228)';
  rctx.fillRect(0, 0, size, size);

  const chipPalette = ['#D9BE94', '#C6A77A', '#9E7E52', '#82633B', '#E3CCA6', '#6F5230'];
  for (let i = 0; i < 2400; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const coreFactor = 1 - Math.abs(y / size - 0.5) * 2; // 1 in center, 0 near laminate skin
    const w = 1.5 + rng() * (2.5 + coreFactor * 5.5);
    const h = 1.2 + rng() * (1.8 + coreFactor * 2.8);
    ctx.fillStyle = chipPalette[Math.floor(rng() * chipPalette.length)];
    ctx.fillRect(x, y, w, h);

    const hv = Math.floor(80 + rng() * (90 + coreFactor * 60));
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.fillRect(x, y, w, h);
  }

  // Thin crisp melamine skin lines at top and bottom of the cut
  ctx.fillStyle = 'rgba(245, 242, 236, 0.35)';
  ctx.fillRect(0, 0, size, 3);
  ctx.fillRect(0, size - 3, size, 3);

  return { albedo, height, roughness };
}

/**
 * Smooth micro-orange-peel Egger ST9 Smoothtouch Matt / fine architectural powder-coat PBR set.
 * Uses smooth low-frequency value noise tiled at 8x–10x (0.6 mm micro-grain instead of 5 mm TV static!)
 * with clean pigment fidelity and physically calibrated roughness.
 */
function generateArchitecturalMattePBR(
  rgb: [number, number, number],
  roughMean: number,
  roughVar: number,
  pebbleAmp: number,
  colorJitter: number,
  size = 256
): PBRCanvasSet {
  const rng = createRng(rgb[0] * 31 + rgb[1] * 17 + rgb[2] * 7 + roughMean);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  // Build smooth periodic 2D grid noise (coarse + fine octaves) -> authentic satin micro-pebble, zero TV static
  const gridA = 32;
  const gridB = 64;
  const noiseA = new Float32Array(gridA * gridA);
  const noiseB = new Float32Array(gridB * gridB);
  for (let i = 0; i < noiseA.length; i++) noiseA[i] = rng() * 2 - 1;
  for (let i = 0; i < noiseB.length; i++) noiseB[i] = rng() * 2 - 1;

  const sampleBilinear = (grid: Float32Array, gSize: number, u: number, v: number) => {
    const fx = u * gSize;
    const fy = v * gSize;
    const x0 = Math.floor(fx) % gSize;
    const y0 = Math.floor(fy) % gSize;
    const x1 = (x0 + 1) % gSize;
    const y1 = (y0 + 1) % gSize;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v00 = grid[y0 * gSize + x0];
    const v10 = grid[y0 * gSize + x1];
    const v01 = grid[y1 * gSize + x0];
    const v11 = grid[y1 * gSize + x1];
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
  };

  const aImg = ctx.createImageData(size, size);
  const hImg = hctx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const nSmooth =
        sampleBilinear(noiseA, gridA, u, v) * 0.62 +
        sampleBilinear(noiseB, gridB, u, v) * 0.38;

      const idx = (y * size + x) * 4;
      const cDelta = nSmooth * colorJitter;
      aImg.data[idx] = Math.max(0, Math.min(255, Math.round(rgb[0] + cDelta)));
      aImg.data[idx + 1] = Math.max(0, Math.min(255, Math.round(rgb[1] + cDelta)));
      aImg.data[idx + 2] = Math.max(0, Math.min(255, Math.round(rgb[2] + cDelta)));
      aImg.data[idx + 3] = 255;

      const hv = Math.max(0, Math.min(255, Math.round(128 + nSmooth * pebbleAmp)));
      hImg.data[idx] = hv;
      hImg.data[idx + 1] = hv;
      hImg.data[idx + 2] = hv;
      hImg.data[idx + 3] = 255;

      const rv = Math.max(30, Math.min(248, Math.round(roughMean + nSmooth * roughVar)));
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(aImg, 0, 0);
  hctx.putImageData(hImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  return { albedo, height, roughness };
}

/**
 * Natural organic procedural wood-grain PBR synthesis for user-added custom warehouse boards.
 * Uses multi-octave toroidal fBm value noise, stretched longitudinal wood vessels, subtle
 * warm/cool heartwood modulation, and pore-only micro-height (no synthetic zebra sine-stripes!).
 */
function generateProceduralWoodPBR(
  rgb: [number, number, number],
  seed: number,
  size = 512
): PBRCanvasSet {
  const rng = createRng(seed);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  // Toroidal periodic value noise grids (stretched horizontally for natural wood grain along U)
  const makeGrid = (gw: number, gh: number) => {
    const arr = new Float32Array(gw * gh);
    for (let i = 0; i < arr.length; i++) arr[i] = rng();
    return { arr, gw, gh };
  };
  const gWarp = makeGrid(6, 12);
  const gFine = makeGrid(16, 96);
  const gPore = makeGrid(48, 128);
  const gTone = makeGrid(4, 8);

  const sampleGrid = (
    g: { arr: Float32Array; gw: number; gh: number },
    u: number,
    v: number
  ) => {
    const fx = ((u % 1) + 1) % 1 * g.gw;
    const fy = ((v % 1) + 1) % 1 * g.gh;
    const x0 = Math.floor(fx) % g.gw;
    const y0 = Math.floor(fy) % g.gh;
    const x1 = (x0 + 1) % g.gw;
    const y1 = (y0 + 1) % g.gh;
    const tx = fx - Math.floor(fx);
    const ty = fy - Math.floor(fy);
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);
    const v00 = g.arr[y0 * g.gw + x0];
    const v10 = g.arr[y0 * g.gw + x1];
    const v01 = g.arr[y1 * g.gw + x0];
    const v11 = g.arr[y1 * g.gw + x1];
    return (v00 * (1 - sx) + v10 * sx) * (1 - sy) + (v01 * (1 - sx) + v11 * sx) * sy;
  };

  const aImg = ctx.createImageData(size, size);
  const hImg = hctx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);
  const tau = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;

      const warp =
        (sampleGrid(gWarp, u, v) - 0.5) * 1.4 +
        (sampleGrid(gWarp, u * 2, v * 2) - 0.5) * 0.45;

      // Irregular organic earlywood/latewood ring density (non-uniform spacing!)
      const ringPhase = (v * 7.0 + warp * 1.65);
      const ringWave = 0.5 + 0.5 * Math.sin(ringPhase * tau + Math.sin(ringPhase * tau * 0.5) * 0.7);
      const latewood = Math.pow(ringWave, 3.2);

      // Fine longitudinal wood fibers and scattered open pores
      const fiber = sampleGrid(gFine, u, v + warp * 0.06);
      const poreVal = sampleGrid(gPore, u, v + warp * 0.04);
      const pore = poreVal > 0.84 ? (poreVal - 0.84) / 0.16 : 0;

      // Subtle sapwood/heartwood plank band tone
      const tone = 0.93 + sampleGrid(gTone, u, v) * 0.14;
      const shade = (0.94 - latewood * 0.17 + (fiber - 0.5) * 0.09 - pore * 0.22) * tone;

      const idx = (y * size + x) * 4;
      aImg.data[idx] = Math.min(255, Math.max(0, Math.round(rgb[0] * shade)));
      aImg.data[idx + 1] = Math.min(255, Math.max(0, Math.round(rgb[1] * shade * 0.985)));
      aImg.data[idx + 2] = Math.min(255, Math.max(0, Math.round(rgb[2] * shade * 0.96)));
      aImg.data[idx + 3] = 255;

      // Pore-focused micro height (keeps broad wood rings flat like pressed furniture board!)
      const hv = Math.min(255, Math.max(0, Math.round(138 + (fiber - 0.5) * 26 - pore * 72)));
      hImg.data[idx] = hv;
      hImg.data[idx + 1] = hv;
      hImg.data[idx + 2] = hv;
      hImg.data[idx + 3] = 255;

      const rv = Math.min(232, Math.max(145, Math.round(172 + pore * 48 - latewood * 14)));
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(aImg, 0, 0);
  hctx.putImageData(hImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  return { albedo, height, roughness };
}

/**
 * Authentic Expanded Polystyrene (EPS Styrofoam) PBR texture:
 * Toroidal Voronoi fused foam beads (4-7 mm scale) with micro-crevice normal relief.
 */
function generateStyrofoamEpsPBR(size = 256): PBRCanvasSet {
  const rng = createRng(7741);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  // Jittered toroidal Voronoi grid (16x16 beads per tile -> crisp unmistakable EPS styrofoam cells)
  const cells = 16;
  const ptsX = new Float32Array(cells * cells);
  const ptsY = new Float32Array(cells * cells);
  const cellTint = new Float32Array(cells * cells);
  for (let cy = 0; cy < cells; cy++) {
    for (let cx = 0; cx < cells; cx++) {
      const i = cy * cells + cx;
      ptsX[i] = cx + 0.18 + rng() * 0.64;
      ptsY[i] = cy + 0.18 + rng() * 0.64;
      cellTint[i] = (rng() - 0.5) * 10;
    }
  }

  const aImg = ctx.createImageData(size, size);
  const hImg = hctx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);

  for (let y = 0; y < size; y++) {
    const gy = (y / size) * cells;
    const cy0 = Math.floor(gy);
    for (let x = 0; x < size; x++) {
      const gx = (x / size) * cells;
      const cx0 = Math.floor(gx);

      let d1 = 999;
      let d2 = 999;
      let bestIdx = 0;

      for (let oy = -1; oy <= 1; oy++) {
        const ny = ((cy0 + oy) % cells + cells) % cells;
        for (let ox = -1; ox <= 1; ox++) {
          const nx = ((cx0 + ox) % cells + cells) % cells;
          const idxCell = ny * cells + nx;
          let px = ptsX[idxCell] - gx;
          let py = ptsY[idxCell] - gy;
          if (px > cells * 0.5) px -= cells;
          else if (px < -cells * 0.5) px += cells;
          if (py > cells * 0.5) py -= cells;
          else if (py < -cells * 0.5) py += cells;
          const dist = Math.sqrt(px * px + py * py);
          if (dist < d1) {
            d2 = d1;
            d1 = dist;
            bestIdx = idxCell;
          } else if (dist < d2) {
            d2 = dist;
          }
        }
      }

      // Edge distance between adjacent fused beads (0 right at seam, >0.14 inside flat bead)
      const edgeDist = Math.min(1, (d2 - d1) * 5.2);
      const beadDome = Math.pow(edgeDist, 0.45);
      const seamShadow = edgeDist < 0.25 ? (0.25 - edgeDist) * 140 : 0;
      const tint = cellTint[bestIdx];

      const idx = (y * size + x) * 4;
      const r = Math.max(198, Math.min(252, Math.round(244 + tint - seamShadow)));
      const g = Math.max(202, Math.min(253, Math.round(246 + tint - seamShadow * 0.96)));
      const b = Math.max(208, Math.min(255, Math.round(250 + tint - seamShadow * 0.9)));
      aImg.data[idx] = r;
      aImg.data[idx + 1] = g;
      aImg.data[idx + 2] = b;
      aImg.data[idx + 3] = 255;

      const hv = Math.max(20, Math.min(245, Math.round(55 + beadDome * 182)));
      hImg.data[idx] = hv;
      hImg.data[idx + 1] = hv;
      hImg.data[idx + 2] = hv;
      hImg.data[idx + 3] = 255;

      const rv = Math.max(175, Math.min(245, Math.round(196 + (1 - beadDome) * 42)));
      rImg.data[idx] = rv;
      rImg.data[idx + 1] = rv;
      rImg.data[idx + 2] = rv;
      rImg.data[idx + 3] = 255;
    }
  }

  ctx.putImageData(aImg, 0, 0);
  hctx.putImageData(hImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  return { albedo, height, roughness };
}

/** Fibrous golden-ochre mineral / rock wool insulation mat PBR */
function generateMineralWoolPBR(size = 256): PBRCanvasSet {
  const rng = createRng(6219);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  ctx.fillStyle = '#CFAF52';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#808080';
  hctx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#F2F2F2';
  rctx.fillRect(0, 0, size, size);

  const woolColors = [
    'rgba(232, 206, 120, 0.42)',
    'rgba(196, 162, 68, 0.38)',
    'rgba(164, 132, 54, 0.34)',
    'rgba(244, 224, 152, 0.32)',
    'rgba(136, 108, 44, 0.28)',
  ];

  for (let i = 0; i < 1400; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = 10 + rng() * 36;
    const ang = (rng() - 0.5) * Math.PI * 2;
    const x2 = x + Math.cos(ang) * len;
    const y2 = y + Math.sin(ang) * len;
    const lw = 0.8 + rng() * 2.2;
    ctx.strokeStyle = woolColors[Math.floor(rng() * woolColors.length)];
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    const hv = Math.floor(70 + rng() * 140);
    hctx.strokeStyle = `rgba(${hv},${hv},${hv},0.5)`;
    hctx.lineWidth = lw;
    hctx.beginPath();
    hctx.moveTo(x, y);
    hctx.lineTo(x2, y2);
    hctx.stroke();
  }

  return { albedo, height, roughness };
}

/** Bitumen roof shingle / asphalt felt (papa / gont bitumiczny) with staggered courses & mineral grit */
function generateRoofShinglePBR(size = 256): PBRCanvasSet {
  const rng = createRng(8843);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  ctx.fillStyle = '#2B2E33';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#909090';
  hctx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#DCDBD8';
  rctx.fillRect(0, 0, size, size);

  const rows = 4;
  const cols = 3;
  const rowH = size / rows;
  const colW = size / cols;

  for (let r = 0; r < rows; r++) {
    const y = r * rowH;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const x = c * colW + offset;
      const shade = Math.round(38 + rng() * 14);
      ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
      ctx.fillRect(x + 1, y + 1, colW - 2, rowH - 2);

      // Subtle overlapping shadow line at bottom of each shingle tab
      ctx.fillStyle = 'rgba(10, 11, 13, 0.72)';
      ctx.fillRect(x, y + rowH - 3, colW, 3);
      // Vertical cutout slot between tabs
      ctx.fillStyle = 'rgba(12, 13, 16, 0.78)';
      ctx.fillRect(x, y, 2.5, rowH);

      hctx.fillStyle = 'rgb(168,168,168)';
      hctx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
      hctx.fillStyle = 'rgb(54,54,54)';
      hctx.fillRect(x, y + rowH - 3, colW, 3);
      hctx.fillRect(x, y, 2.5, rowH);
    }
  }

  // Coarse basalt mineral roofing granules
  for (let i = 0; i < 3600; i++) {
    const gx = rng() * size;
    const gy = rng() * size;
    const v = Math.floor(24 + rng() * 58);
    ctx.fillStyle = `rgba(${v},${v + 2},${v + 5},0.55)`;
    ctx.fillRect(gx, gy, 1.6, 1.6);

    const hv = Math.floor(90 + rng() * 140);
    hctx.fillStyle = `rgba(${hv},${hv},${hv},0.55)`;
    hctx.fillRect(gx, gy, 1.5, 1.5);

    const rv = Math.floor(170 + rng() * 75);
    rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rctx.fillRect(gx, gy, 1.6, 1.6);
  }

  return { albedo, height, roughness };
}

/** Planed tongue-and-groove spruce cladding / boazeria boards with V-groove shadow seams */
function generatePlankCladdingPBR(
  rgb: [number, number, number],
  seed: number,
  size = 256
): PBRCanvasSet {
  const base = generateProceduralWoodPBR(rgb, seed, size);
  const ctx = base.albedo.getContext('2d')!;
  const hctx = base.height.getContext('2d')!;
  const rctx = base.roughness.getContext('2d')!;
  const rng = createRng(seed + 99);

  const planks = 4;
  const plankH = size / planks;
  for (let i = 0; i < planks; i++) {
    const y = i * plankH;
    // Slight warm/cool plank-to-plank variation
    const alpha = (rng() - 0.5) * 0.14;
    if (alpha > 0) {
      ctx.fillStyle = `rgba(255, 240, 210, ${alpha.toFixed(3)})`;
      ctx.fillRect(0, y, size, plankH);
    } else {
      ctx.fillStyle = `rgba(55, 34, 14, ${Math.abs(alpha).toFixed(3)})`;
      ctx.fillRect(0, y, size, plankH);
    }

    // Crisp V-groove bevel seam between tongue-and-groove cladding planks
    const seamH = Math.max(2, Math.round(size * 0.012));
    ctx.fillStyle = 'rgba(42, 26, 12, 0.72)';
    ctx.fillRect(0, y, size, seamH);
    ctx.fillStyle = 'rgba(255, 236, 200, 0.18)';
    ctx.fillRect(0, y + seamH, size, Math.max(1, seamH * 0.6));

    hctx.fillStyle = 'rgb(36,36,36)';
    hctx.fillRect(0, y, size, seamH + 1);
    rctx.fillStyle = 'rgb(235,235,235)';
    rctx.fillRect(0, y, size, seamH + 1);
  }

  return base;
}

/** UI Swatch URLs — supports custom uploaded photos as well as built-in studio scans */
const swatchCache = new Map<MaterialId, string>();

function hexToRgbTuple(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const n = parseInt(clean.length === 6 ? clean : 'B89B72', 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function getMaterialSwatchDataUrl(
  id: MaterialId,
  customOverrides?: Partial<Record<MaterialId, string>>
): string {
  const custom = customOverrides?.[id];
  if (custom) return custom;

  const photoUrl = DEFAULT_PHOTO_URLS[id];
  if (photoUrl) return photoUrl;

  const meta = getMaterialMeta(id);
  const cacheKey = `${id}_${meta.swatchFallbackHex}`;
  const cached = swatchCache.get(cacheKey);
  if (cached) return cached;

  let canvas: HTMLCanvasElement;
  if (id === 'white_matte') {
    canvas = generateArchitecturalMattePBR([244, 243, 239], 162, 10, 6, 1.5, 64).albedo;
  } else if (id === 'anthracite_matte') {
    canvas = generateArchitecturalMattePBR([46, 50, 56], 168, 12, 8, 2, 64).albedo;
  } else if (id === 'hdf_white') {
    canvas = generateArchitecturalMattePBR([241, 240, 235], 150, 8, 5, 1, 64).albedo;
  } else if (id === 'hdf_black') {
    canvas = generateArchitecturalMattePBR([40, 43, 48], 156, 8, 5, 1.5, 64).albedo;
  } else if (id === 'steel_black') {
    canvas = generateArchitecturalMattePBR([34, 37, 42], 116, 16, 16, 3, 64).albedo;
  } else if (id === 'pine_timber') {
    canvas = generateProceduralWoodPBR([218, 181, 126], 5101, 64).albedo;
  } else if (id === 'spruce_plank') {
    canvas = generatePlankCladdingPBR([204, 160, 104], 5207, 64).albedo;
  } else if (id === 'larch_impregnated') {
    canvas = generateProceduralWoodPBR([156, 109, 62], 5313, 64).albedo;
  } else if (id === 'styrofoam_eps') {
    canvas = generateStyrofoamEpsPBR(64).albedo;
  } else if (id === 'mineral_wool') {
    canvas = generateMineralWoolPBR(64).albedo;
  } else if (id === 'roof_shingle') {
    canvas = generateRoofShinglePBR(64).albedo;
  } else if (id === 'glass_clear') {
    const [c, ctx] = createCanvas(64);
    const g = ctx.createLinearGradient(0, 0, 64, 64);
    g.addColorStop(0, '#DFF0F2');
    g.addColorStop(0.5, '#A7C7CC');
    g.addColorStop(1, '#ECF6F7');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    canvas = c;
  } else {
    const rgb = hexToRgbTuple(meta.swatchFallbackHex);
    canvas = meta.grainDirectional
      ? generateProceduralWoodPBR(rgb, rgb[0] * 17 + rgb[1] * 31 + rgb[2] * 13, 64).albedo
      : generateArchitecturalMattePBR(rgb, 164, 10, 8, 2, 64).albedo;
  }

  const url = canvas.toDataURL('image/png');
  swatchCache.set(cacheKey, url);
  return url;
}

const FALLBACK_COLORS: Record<string, string> = {
  osb3: '#CEAA70',
  oak_craft: '#C19054',
  walnut: '#5A3B28',
  birch_plywood: '#E8D1AF',
  white_matte: '#F4F3EF',
  anthracite_matte: '#2E3238',
  hdf_white: '#F1F0EB',
  hdf_black: '#282B30',
  concrete_top: '#9C9F9E',
  steel_black: '#22252A',
  steel_galv: '#AEB5BC',
  glass_clear: '#D4ECEE',
  pine_timber: '#DAB57E',
  spruce_plank: '#CCA068',
  larch_impregnated: '#9C6D3E',
  styrofoam_eps: '#F2F4F7',
  mineral_wool: '#D8B85C',
  roof_shingle: '#2E3136',
};

export class MaterialLibrary {
  private standardMaterials = new Map<string, THREE.Material | THREE.Material[]>();
  private finishMaterials = new Map<string, THREE.Material | THREE.Material[]>();
  private xrayMaterials = new Map<MaterialId, THREE.MeshStandardMaterial>();
  private sharedRawChipboardEdge: THREE.MeshPhysicalMaterial | null = null;
  private customUrls: Partial<Record<MaterialId, string>> = {};
  private textures = new Set<THREE.Texture>();
  private texturesByMaterial = new Map<string, THREE.Texture[]>();
  private buildGeneration = new Map<MaterialId, number>();
  private maxAnisotropy: number;
  private isSoftwareGl: boolean;
  private isMobileGpu: boolean;
  private onTextureLoaded?: () => void;
  private disposed = false;

  constructor(
    renderer: THREE.WebGLRenderer,
    isSoftwareGl: boolean,
    onTextureLoaded?: () => void
  ) {
    this.maxAnisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 16);
    this.isSoftwareGl = isSoftwareGl;
    this.isMobileGpu =
      typeof navigator !== 'undefined' &&
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    this.onTextureLoaded = onTextureLoaded;
  }

  private disposeMaterialTextures(ownerKey: string) {
    const owned = this.texturesByMaterial.get(ownerKey);
    if (owned) {
      for (const tex of owned) {
        tex.dispose();
        this.textures.delete(tex);
      }
      this.texturesByMaterial.delete(ownerKey);
    }
  }

  private registerTexture(tex: THREE.Texture, ownerKey?: string) {
    this.textures.add(tex);
    if (ownerKey) {
      const list = this.texturesByMaterial.get(ownerKey) ?? [];
      list.push(tex);
      this.texturesByMaterial.set(ownerKey, list);
    }
  }

  private disposeMaterialEntry(m: THREE.Material | THREE.Material[]) {
    if (Array.isArray(m)) {
      m.forEach((sub) => {
        if (sub !== this.sharedRawChipboardEdge) sub.dispose();
      });
    } else if (m !== this.sharedRawChipboardEdge) {
      m.dispose();
    }
  }

  private evictMaterialId(id: MaterialId) {
    this.buildGeneration.set(id, (this.buildGeneration.get(id) ?? 0) + 1);
    for (const edgeMode of ['banded', 'raw'] as const) {
      const baseKey = `${id}_${edgeMode}`;
      this.disposeMaterialTextures(baseKey);
      const old = this.standardMaterials.get(baseKey);
      if (old) {
        this.disposeMaterialEntry(old);
        this.standardMaterials.delete(baseKey);
      }
      for (const fin of ['satin', 'gloss'] as const) {
        const fk = `${baseKey}_${fin}`;
        const oldFin = this.finishMaterials.get(fk);
        if (oldFin) {
          this.disposeMaterialEntry(oldFin);
          this.finishMaterials.delete(fk);
        }
      }
    }
    this.disposeMaterialTextures(id);
    const oldX = this.xrayMaterials.get(id);
    if (oldX) {
      oldX.dispose();
      this.xrayMaterials.delete(id);
    }
  }

  /** Sync user-uploaded custom texture photos and rebuild only changed materials (with full GPU disposal) */
  syncCustomTextures(nextUrls: Partial<Record<MaterialId, string>>) {
    const allIds = new Set<MaterialId>([
      ...(Object.keys(this.customUrls) as MaterialId[]),
      ...(Object.keys(nextUrls) as MaterialId[]),
    ]);
    let changed = false;
    allIds.forEach((id) => {
      if (this.customUrls[id] !== nextUrls[id]) {
        changed = true;
        this.evictMaterialId(id);
      }
    });
    this.customUrls = { ...nextUrls };
    if (changed) {
      this.onTextureLoaded?.();
    }
  }

  /** Invalidates cached GPU material entries (used when user edits custom warehouse board colors) */
  invalidateCustomMaterials() {
    const customIds = new Set<MaterialId>();
    for (const key of this.standardMaterials.keys()) {
      const id = key.replace(/_(banded|raw)$/, '') as MaterialId;
      if (!(id in FALLBACK_COLORS)) {
        customIds.add(id);
      }
    }
    customIds.forEach((id) => this.evictMaterialId(id));
  }

  private configureTexture(
    tex: THREE.Texture,
    isColor: boolean,
    tileScaleX = 1,
    tileScaleY = tileScaleX,
    ownerKey?: string
  ): THREE.Texture {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(tileScaleX, tileScaleY);
    tex.anisotropy = this.maxAnisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    this.registerTexture(tex, ownerKey);
    return tex;
  }

  private createCanvasTex(
    canvas: HTMLCanvasElement,
    isColor: boolean,
    tileScaleX = 1,
    tileScaleY = tileScaleX,
    ownerKey?: string
  ): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    this.configureTexture(tex, isColor, tileScaleX, tileScaleY, ownerKey);
    return tex;
  }

  private getRawChipboardEdgeMat(): THREE.MeshPhysicalMaterial {
    if (!this.sharedRawChipboardEdge) {
      const set = generateRawChipboardEdgePBR(256);
      const normalCanvas = heightToNormalCanvas(set.height, 2.2);
      this.sharedRawChipboardEdge = new THREE.MeshPhysicalMaterial({
        map: this.createCanvasTex(set.albedo, true, 4.0, 1.0, '__shared_raw_edge'),
        normalMap: this.createCanvasTex(normalCanvas, false, 4.0, 1.0, '__shared_raw_edge'),
        normalScale: new THREE.Vector2(0.42, 0.42),
        roughnessMap: this.createCanvasTex(set.roughness, false, 4.0, 1.0, '__shared_raw_edge'),
        roughness: 1.0,
        metalness: 0.0,
        clearcoat: 0.0,
        specularIntensity: 0.25,
        envMapIntensity: 0.48,
      });
    }
    return this.sharedRawChipboardEdge;
  }

  private buildProceduralPbrMat(
    ownerKey: string,
    set: PBRCanvasSet,
    opts: {
      normalStrength: number;
      normalScale: number;
      roughness: number;
      metalness: number;
      clearcoat?: number;
      clearcoatRoughness?: number;
      specularIntensity?: number;
      envMapIntensity?: number;
      tileScaleX?: number;
      tileScaleY?: number;
    }
  ): THREE.MeshPhysicalMaterial {
    const normalCanvas = heightToNormalCanvas(set.height, opts.normalStrength);
    const tx = opts.tileScaleX ?? 1;
    const ty = opts.tileScaleY ?? tx;
    return new THREE.MeshPhysicalMaterial({
      map: this.createCanvasTex(set.albedo, true, tx, ty, ownerKey),
      normalMap: this.createCanvasTex(normalCanvas, false, tx, ty, ownerKey),
      normalScale: new THREE.Vector2(opts.normalScale, opts.normalScale),
      roughnessMap: this.createCanvasTex(set.roughness, false, tx, ty, ownerKey),
      roughness: opts.roughness,
      metalness: opts.metalness,
      clearcoat: opts.clearcoat ?? 0,
      clearcoatRoughness: opts.clearcoatRoughness ?? 0.5,
      specularIntensity: opts.specularIntensity ?? 0.5,
      envMapIntensity: opts.envMapIntensity ?? 0.72,
    });
  }

  private buildPhotoPbrMat(
    id: MaterialId,
    ownerKey: string,
    url: string,
    profile: PhotoPbrProfile
  ): THREE.MeshPhysicalMaterial {
    const gen = this.buildGeneration.get(id) ?? 0;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(FALLBACK_COLORS[id] ?? getMaterialMeta(id).swatchFallbackHex),
      roughness: 0.74,
      metalness: profile.metalness,
      clearcoat: profile.clearcoat,
      clearcoatRoughness: profile.clearcoatRoughness,
      specularIntensity: profile.specularIntensity,
      envMapIntensity: profile.envMapIntensity,
    });

    const img = new Image();
    img.decoding = 'async';
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (this.disposed) return;
      if ((this.buildGeneration.get(id) ?? 0) !== gen) return;

      const albedoSize = this.isSoftwareGl ? 512 : this.isMobileGpu ? 512 : 1024;
      const derivedSize = this.isSoftwareGl ? 256 : this.isMobileGpu ? 384 : 512;

      const { albedoCanvas, normalCanvas, roughnessCanvas } =
        buildPhotoMapsFromImage(img, profile, albedoSize, derivedSize);

      const albedoTex = this.createCanvasTex(
        albedoCanvas,
        true,
        profile.tileScale,
        profile.tileScale,
        ownerKey
      );
      const normalTex = this.createCanvasTex(
        normalCanvas,
        false,
        profile.tileScale,
        profile.tileScale,
        ownerKey
      );
      const roughTex = this.createCanvasTex(
        roughnessCanvas,
        false,
        profile.tileScale,
        profile.tileScale,
        ownerKey
      );

      mat.color.set('#FFFFFF');
      mat.map = albedoTex;
      mat.normalMap = normalTex;
      mat.normalScale = new THREE.Vector2(profile.normalScale, profile.normalScale);
      mat.roughnessMap = roughTex;
      mat.roughness = 1.0;
      mat.needsUpdate = true;

      const xMat = this.xrayMaterials.get(id);
      if (xMat) {
        xMat.color.set('#FFFFFF');
        xMat.map = albedoTex;
        xMat.needsUpdate = true;
      }

      // Propagate loaded photo maps to any cached satin/gloss finish variants
      (['satin', 'gloss'] as const).forEach((fin) => {
        const cached = this.finishMaterials.get(`${ownerKey}_${fin}`);
        if (!cached) return;
        const primary = (Array.isArray(cached) ? cached[0] : cached) as THREE.MeshPhysicalMaterial;
        primary.color.set('#FFFFFF');
        primary.map = albedoTex;
        primary.normalMap = normalTex;
        primary.normalScale = new THREE.Vector2(
          profile.normalScale * (fin === 'gloss' ? 0.25 : 0.65),
          profile.normalScale * (fin === 'gloss' ? 0.25 : 0.65)
        );
        primary.roughnessMap = fin === 'gloss' ? null : roughTex;
        primary.roughness = fin === 'gloss' ? 0.12 : 0.52;
        primary.needsUpdate = true;
      });

      this.onTextureLoaded?.();
    };
    img.src = url;

    return mat;
  }

  getMaterial(
    id: MaterialId,
    xray: boolean,
    finish: SurfaceFinish = 'matte',
    edgeMode: BoardEdgeMode = 'banded'
  ): THREE.Material | THREE.Material[] {
    if (xray) {
      if (!this.xrayMaterials.has(id)) {
        const base = this.getMaterial(id, false, 'matte', 'banded');
        const primary = (Array.isArray(base) ? base[0] : base) as THREE.MeshStandardMaterial;
        const xMat = new THREE.MeshStandardMaterial({
          color: primary.map
            ? new THREE.Color('#FFFFFF')
            : new THREE.Color(FALLBACK_COLORS[id] ?? getMaterialMeta(id).swatchFallbackHex),
          map: primary.map ?? null,
          roughness: 0.55,
          metalness: 0.05,
          transparent: true,
          opacity: id === 'glass_clear' ? 0.16 : 0.28,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        this.xrayMaterials.set(id, xMat);
      }
      return this.xrayMaterials.get(id)!;
    }

    const effectiveEdgeMode: BoardEdgeMode =
      id === 'osb3' ||
      id === 'birch_plywood' ||
      id === 'steel_black' ||
      id === 'steel_galv' ||
      id === 'glass_clear' ||
      id === 'hdf_white' ||
      id === 'hdf_black' ||
      id === 'pine_timber' ||
      id === 'spruce_plank' ||
      id === 'larch_impregnated' ||
      id === 'styrofoam_eps' ||
      id === 'mineral_wool' ||
      id === 'roof_shingle'
        ? 'banded'
        : edgeMode;

    const baseKey = `${id}_${effectiveEdgeMode}`;

    if (finish !== 'matte' && id !== 'glass_clear') {
      const fKey = `${baseKey}_${finish}`;
      if (!this.finishMaterials.has(fKey)) {
        const base = this.getMaterial(id, false, 'matte', effectiveEdgeMode);
        const applyFinish = (m: THREE.Material, isEdge = false): THREE.Material => {
          if (isEdge && m === this.sharedRawChipboardEdge) return m;
          const clone = m.clone();
          if (clone instanceof THREE.MeshPhysicalMaterial && !isEdge) {
            if (finish === 'gloss') {
              clone.clearcoat = 1.0;
              clone.clearcoatRoughness = 0.04;
              clone.roughness = 0.12;
              clone.roughnessMap = null;
              clone.envMapIntensity = 1.45;
              clone.specularIntensity = 1.0;
              if (clone.normalScale) clone.normalScale = clone.normalScale.clone().multiplyScalar(0.25);
            } else if (finish === 'satin') {
              clone.clearcoat = 0.42;
              clone.clearcoatRoughness = 0.24;
              clone.roughness = Math.min(clone.roughness, 0.48);
              clone.envMapIntensity = 1.05;
              clone.specularIntensity = 0.72;
            }
            clone.needsUpdate = true;
          }
          return clone;
        };
        const variant = Array.isArray(base)
          ? base.map((sub, i) => applyFinish(sub, i > 0))
          : applyFinish(base, false);
        this.finishMaterials.set(fKey, variant);
      }
      return this.finishMaterials.get(fKey)!;
    }

    if (this.standardMaterials.has(baseKey)) {
      return this.standardMaterials.get(baseKey)!;
    }

    let result: THREE.Material | THREE.Material[];
    const customPhotoUrl = this.customUrls[id];
    const photoUrl = customPhotoUrl || DEFAULT_PHOTO_URLS[id];
    const basePhotoProfile = PHOTO_PROFILES[id] || DEFAULT_CUSTOM_PROFILE;
    const photoProfile: PhotoPbrProfile = customPhotoUrl
      ? {
          ...basePhotoProfile,
          isSeamlessScan: false,
          edgeRgb: hexToRgbTuple(getMaterialMeta(id).swatchFallbackHex),
        }
      : basePhotoProfile;

    if (photoUrl) {
      const faceMat = this.buildPhotoPbrMat(id, baseKey, photoUrl, photoProfile);
      if (photoProfile.edgeStyle === 'osb') {
        const edgeMat = this.buildProceduralPbrMat(baseKey, generateOsbEdge(256), {
          normalStrength: 2.2,
          normalScale: 0.46,
          roughness: 1.0,
          metalness: 0.0,
          specularIntensity: 0.28,
          envMapIntensity: 0.5,
          tileScaleX: 4.0,
          tileScaleY: 1.0,
        });
        result = [faceMat, edgeMat];
      } else if (photoProfile.edgeStyle === 'plywood') {
        const edgeMat = this.buildProceduralPbrMat(baseKey, generatePlywoodEdge(256), {
          normalStrength: 1.5,
          normalScale: 0.28,
          roughness: 0.92,
          metalness: 0.0,
          specularIntensity: 0.35,
          envMapIntensity: 0.58,
          tileScaleX: 3.5,
          tileScaleY: 1.0,
        });
        result = [faceMat, edgeMat];
      } else if (photoProfile.edgeStyle === 'melamine') {
        const edgeMat =
          effectiveEdgeMode === 'raw'
            ? this.getRawChipboardEdgeMat()
            : this.buildProceduralPbrMat(
                baseKey,
                generateAbsEdgeBandPBR(
                  photoProfile.edgeRgb,
                  id === 'oak_craft' || id === 'walnut' || Boolean(getMaterialMeta(id).grainDirectional),
                  256
                ),
                {
                  normalStrength: 0.7,
                  normalScale: 0.12,
                  roughness: 0.85,
                  metalness: 0.0,
                  clearcoat: 0.06,
                  clearcoatRoughness: 0.42,
                  specularIntensity: 0.48,
                  envMapIntensity: 0.65,
                  tileScaleX: 2.5,
                  tileScaleY: 1.0,
                }
              );
        result = [faceMat, edgeMat];
      } else {
        result = faceMat;
      }
    } else if (id === 'white_matte') {
      // Egger W980 ST9 Smoothtouch Matt White (smooth micro-satin @ 8x tile = 0.6mm scale, zero 5mm static!)
      const faceMat = this.buildProceduralPbrMat(
        baseKey,
        generateArchitecturalMattePBR([244, 243, 239], 162, 10, 8, 1.2, 256),
        {
          normalStrength: 0.35,
          normalScale: 0.045,
          roughness: 1.0,
          metalness: 0.0,
          clearcoat: 0.0,
          specularIntensity: 0.42,
          envMapIntensity: 0.64,
          tileScaleX: 8.0,
          tileScaleY: 8.0,
        }
      );
      const edgeMat =
        effectiveEdgeMode === 'raw'
          ? this.getRawChipboardEdgeMat()
          : this.buildProceduralPbrMat(
              baseKey,
              generateAbsEdgeBandPBR([240, 239, 235], false, 256),
              {
                normalStrength: 0.45,
                normalScale: 0.08,
                roughness: 0.82,
                metalness: 0.0,
                clearcoat: 0.06,
                clearcoatRoughness: 0.4,
                specularIntensity: 0.46,
                envMapIntensity: 0.64,
                tileScaleX: 2.0,
                tileScaleY: 1.0,
              }
            );
      result = [faceMat, edgeMat];
    } else if (id === 'anthracite_matte') {
      // Egger U961 ST9 Graphite/Anthracite Matte
      const faceMat = this.buildProceduralPbrMat(
        baseKey,
        generateArchitecturalMattePBR([46, 50, 56], 168, 12, 9, 1.5, 256),
        {
          normalStrength: 0.4,
          normalScale: 0.055,
          roughness: 1.0,
          metalness: 0.0,
          clearcoat: 0.0,
          specularIntensity: 0.46,
          envMapIntensity: 0.72,
          tileScaleX: 8.0,
          tileScaleY: 8.0,
        }
      );
      const edgeMat =
        effectiveEdgeMode === 'raw'
          ? this.getRawChipboardEdgeMat()
          : this.buildProceduralPbrMat(
              baseKey,
              generateAbsEdgeBandPBR([43, 47, 53], false, 256),
              {
                normalStrength: 0.45,
                normalScale: 0.08,
                roughness: 0.84,
                metalness: 0.0,
                clearcoat: 0.06,
                clearcoatRoughness: 0.4,
                specularIntensity: 0.48,
                envMapIntensity: 0.7,
                tileScaleX: 2.0,
                tileScaleY: 1.0,
              }
            );
      result = [faceMat, edgeMat];
    } else if (id === 'hdf_white') {
      result = this.buildProceduralPbrMat(
        baseKey,
        generateArchitecturalMattePBR([241, 240, 235], 150, 8, 6, 1.0, 256),
        {
          normalStrength: 0.28,
          normalScale: 0.035,
          roughness: 1.0,
          metalness: 0.0,
          specularIntensity: 0.45,
          envMapIntensity: 0.62,
          tileScaleX: 8.0,
          tileScaleY: 8.0,
        }
      );
    } else if (id === 'hdf_black') {
      result = this.buildProceduralPbrMat(
        baseKey,
        generateArchitecturalMattePBR([40, 43, 48], 158, 10, 6, 1.2, 256),
        {
          normalStrength: 0.32,
          normalScale: 0.04,
          roughness: 1.0,
          metalness: 0.0,
          specularIntensity: 0.44,
          envMapIntensity: 0.66,
          tileScaleX: 8.0,
          tileScaleY: 8.0,
        }
      );
    } else if (id === 'steel_black') {
      // Fine architectural matte-black powder-coated loft steel (RAL 9005 Fine Structure @ 10x micro-scale)
      result = this.buildProceduralPbrMat(
        baseKey,
        generateArchitecturalMattePBR([34, 37, 42], 118, 16, 18, 2.2, 256),
        {
          normalStrength: 0.65,
          normalScale: 0.1,
          roughness: 1.0,
          metalness: 0.62,
          clearcoat: 0.06,
          clearcoatRoughness: 0.44,
          specularIntensity: 0.85,
          envMapIntensity: 1.08,
          tileScaleX: 10.0,
          tileScaleY: 10.0,
        }
      );
    } else if (id === 'glass_clear') {
      result = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#D4ECEE'),
        roughness: 0.05,
        metalness: 0.04,
        transmission: this.isSoftwareGl ? 0 : 0.88,
        transparent: true,
        opacity: this.isSoftwareGl ? 0.34 : 1,
        ior: 1.52,
        thickness: 0.012,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        depthWrite: false,
      });
    } else if (id === 'pine_timber') {
      result = this.buildProceduralPbrMat(
        baseKey,
        generateProceduralWoodPBR([218, 181, 126], 5101, this.isSoftwareGl ? 256 : 512),
        {
          normalStrength: 1.25,
          normalScale: 0.24,
          roughness: 1.0,
          metalness: 0.0,
          specularIntensity: 0.36,
          envMapIntensity: 0.56,
          tileScaleX: 1.2,
          tileScaleY: 1.2,
        }
      );
    } else if (id === 'spruce_plank') {
      result = this.buildProceduralPbrMat(
        baseKey,
        generatePlankCladdingPBR([204, 160, 104], 5207, this.isSoftwareGl ? 256 : 512),
        {
          normalStrength: 1.55,
          normalScale: 0.32,
          roughness: 1.0,
          metalness: 0.0,
          specularIntensity: 0.35,
          envMapIntensity: 0.56,
          tileScaleX: 1.35,
          tileScaleY: 1.35,
        }
      );
    } else if (id === 'larch_impregnated') {
      result = this.buildProceduralPbrMat(
        baseKey,
        generateProceduralWoodPBR([156, 109, 62], 5313, this.isSoftwareGl ? 256 : 512),
        {
          normalStrength: 1.3,
          normalScale: 0.25,
          roughness: 0.96,
          metalness: 0.0,
          specularIntensity: 0.4,
          envMapIntensity: 0.6,
          tileScaleX: 1.2,
          tileScaleY: 1.2,
        }
      );
    } else if (id === 'styrofoam_eps') {
      result = this.buildProceduralPbrMat(
        baseKey,
        generateStyrofoamEpsPBR(this.isSoftwareGl ? 192 : 256),
        {
          normalStrength: 1.85,
          normalScale: 0.34,
          roughness: 1.0,
          metalness: 0.0,
          specularIntensity: 0.28,
          envMapIntensity: 0.48,
          tileScaleX: 6.5,
          tileScaleY: 6.5,
        }
      );
    } else if (id === 'mineral_wool') {
      result = this.buildProceduralPbrMat(
        baseKey,
        generateMineralWoolPBR(this.isSoftwareGl ? 192 : 256),
        {
          normalStrength: 2.1,
          normalScale: 0.42,
          roughness: 1.0,
          metalness: 0.0,
          specularIntensity: 0.12,
          envMapIntensity: 0.34,
          tileScaleX: 3.5,
          tileScaleY: 3.5,
        }
      );
    } else if (id === 'roof_shingle') {
      result = this.buildProceduralPbrMat(
        baseKey,
        generateRoofShinglePBR(this.isSoftwareGl ? 256 : 384),
        {
          normalStrength: 2.2,
          normalScale: 0.46,
          roughness: 1.0,
          metalness: 0.0,
          specularIntensity: 0.24,
          envMapIntensity: 0.44,
          tileScaleX: 2.2,
          tileScaleY: 2.2,
        }
      );
    } else {
      // Custom user warehouse board / timber / insulation
      const meta = getMaterialMeta(id);
      const rgb = hexToRgbTuple(meta.swatchFallbackHex);
      const seed = rgb[0] * 17 + rgb[1] * 31 + rgb[2] * 13 + id.length * 7;
      const isSteel = meta.category === 'Stal i szkło';
      const isSolidConstruction =
        meta.category === 'Budowa i ogród' || meta.category === 'Izolacja i dach';
      const pbrSet = meta.grainDirectional
        ? generateProceduralWoodPBR(rgb, seed, this.isSoftwareGl ? 256 : 512)
        : generateArchitecturalMattePBR(
            rgb,
            isSteel ? 116 : isSolidConstruction ? 196 : 164,
            isSteel ? 16 : 12,
            isSteel ? 16 : isSolidConstruction ? 14 : 8,
            isSteel ? 2.2 : 1.8,
            256
          );
      const faceMat = this.buildProceduralPbrMat(baseKey, pbrSet, {
        normalStrength: meta.grainDirectional ? 1.15 : isSteel ? 0.6 : 0.42,
        normalScale: meta.grainDirectional ? 0.2 : isSteel ? 0.1 : 0.08,
        roughness: 1.0,
        metalness: isSteel ? 0.62 : 0.0,
        clearcoat: isSteel ? 0.06 : 0.0,
        clearcoatRoughness: 0.46,
        specularIntensity: isSteel ? 0.82 : isSolidConstruction ? 0.3 : 0.45,
        envMapIntensity: isSteel ? 1.05 : isSolidConstruction ? 0.5 : 0.66,
        tileScaleX: meta.grainDirectional ? 1.0 : 8.0,
        tileScaleY: meta.grainDirectional ? 1.0 : 8.0,
      });

      if (isSteel || isSolidConstruction) {
        result = faceMat;
      } else {
        const edgeMat =
          effectiveEdgeMode === 'raw'
            ? this.getRawChipboardEdgeMat()
            : this.buildProceduralPbrMat(
                baseKey,
                generateAbsEdgeBandPBR(rgb, Boolean(meta.grainDirectional), 256),
                {
                  normalStrength: 0.55,
                  normalScale: 0.1,
                  roughness: 0.85,
                  metalness: 0.0,
                  clearcoat: 0.05,
                  clearcoatRoughness: 0.42,
                  specularIntensity: 0.46,
                  envMapIntensity: 0.65,
                  tileScaleX: 2.5,
                  tileScaleY: 1.0,
                }
              );
        result = [faceMat, edgeMat];
      }
    }

    this.standardMaterials.set(baseKey, result);
    return result;
  }

  dispose() {
    this.disposed = true;
    this.standardMaterials.forEach((m) => this.disposeMaterialEntry(m));
    this.finishMaterials.forEach((m) => this.disposeMaterialEntry(m));
    this.xrayMaterials.forEach((m) => m.dispose());
    this.sharedRawChipboardEdge?.dispose();
    this.sharedRawChipboardEdge = null;
    this.textures.forEach((t) => t.dispose());
    this.standardMaterials.clear();
    this.finishMaterials.clear();
    this.xrayMaterials.clear();
    this.textures.clear();
    this.texturesByMaterial.clear();
    this.buildGeneration.clear();
  }
}
