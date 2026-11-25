import * as THREE from 'three';
import { getMaterialMeta, MaterialId, SurfaceFinish } from '../types/furniture';

import texOakUrl from '../assets/images/tex_oak_craft_1795344820546.jpg';
import texWalnutUrl from '../assets/images/tex_walnut_wood_1795344821285.jpg';
import texBirchUrl from '../assets/images/tex_birch_plywood_1795344820360.jpg';
import texConcreteUrl from '../assets/images/tex_concrete_top_1795344822022.jpg';
import texGalvUrl from '../assets/images/tex_steel_galv_1795344820306.jpg';

const DEFAULT_PHOTO_URLS: Partial<Record<MaterialId, string>> = {
  osb3: './assets/aistudio/IMG_cb4b1693-a56b-425d-992d-c9125532a319_ca5f93a1.jpg',
  oak_craft: texOakUrl,
  walnut: texWalnutUrl,
  birch_plywood: texBirchUrl,
  concrete_top: texConcreteUrl,
  steel_galv: texGalvUrl,
};

interface PhotoPbrProfile {
  normalStrength: number;
  normalScale: number;
  roughMin: number;
  roughMax: number;
  metalness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  envMapIntensity: number;
  /** Physical UV repeat factor relative to 1250mm synthesized sheet so grain/flakes match real-world cm scale */
  tileScale: number;
  synthesisMode: 'isotropic' | 'directional';
  /** How many source tiles span one synthesized macro sheet (higher = finer flakes/pores across 1.25m) */
  patchDensity: number;
  seed: number;
}

const DEFAULT_CUSTOM_PROFILE: PhotoPbrProfile = {
  normalStrength: 2.4,
  normalScale: 0.72,
  roughMin: 118,
  roughMax: 222,
  metalness: 0.02,
  clearcoat: 0.12,
  clearcoatRoughness: 0.42,
  envMapIntensity: 0.92,
  tileScale: 1.0,
  synthesisMode: 'directional',
  patchDensity: 1.8,
  seed: 7109,
};

const PHOTO_PROFILES: Partial<Record<MaterialId, PhotoPbrProfile>> = {
  osb3: {
    normalStrength: 3.3,
    normalScale: 0.95,
    roughMin: 148,
    roughMax: 242,
    metalness: 0.02,
    clearcoat: 0.08,
    clearcoatRoughness: 0.56,
    envMapIntensity: 0.85,
    tileScale: 1.0, // 1250mm seamless stochastic sheet with authentic 4-8cm pressed OSB strands
    synthesisMode: 'isotropic',
    patchDensity: 2.8,
    seed: 1337,
  },
  oak_craft: {
    normalStrength: 2.2,
    normalScale: 0.68,
    roughMin: 108,
    roughMax: 214,
    metalness: 0.02,
    clearcoat: 0.18,
    clearcoatRoughness: 0.38,
    envMapIntensity: 0.95,
    tileScale: 1.0,
    synthesisMode: 'directional',
    patchDensity: 2.0,
    seed: 2411,
  },
  walnut: {
    normalStrength: 2.2,
    normalScale: 0.68,
    roughMin: 95,
    roughMax: 198,
    metalness: 0.03,
    clearcoat: 0.28,
    clearcoatRoughness: 0.32,
    envMapIntensity: 1.05,
    tileScale: 1.0,
    synthesisMode: 'directional',
    patchDensity: 2.0,
    seed: 3527,
  },
  birch_plywood: {
    normalStrength: 1.4,
    normalScale: 0.45,
    roughMin: 128,
    roughMax: 205,
    metalness: 0.01,
    clearcoat: 0.14,
    clearcoatRoughness: 0.44,
    envMapIntensity: 0.9,
    tileScale: 1.0,
    synthesisMode: 'directional',
    patchDensity: 1.9,
    seed: 4639,
  },
  concrete_top: {
    normalStrength: 2.9,
    normalScale: 0.88,
    roughMin: 135,
    roughMax: 245,
    metalness: 0.03,
    clearcoat: 0.1,
    clearcoatRoughness: 0.52,
    envMapIntensity: 0.85,
    tileScale: 1.0,
    synthesisMode: 'isotropic',
    patchDensity: 1.9,
    seed: 5741,
  },
  steel_galv: {
    normalStrength: 1.9,
    normalScale: 0.62,
    roughMin: 48,
    roughMax: 142,
    metalness: 0.88,
    clearcoat: 0.12,
    clearcoatRoughness: 0.24,
    envMapIntensity: 1.4,
    tileScale: 1.0,
    synthesisMode: 'isotropic',
    patchDensity: 3.1,
    seed: 6857,
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

/** Center-crop any landscape/portrait photo into an exact power-of-two square canvas (zero distortion!) */
function drawSquareCropped(
  img: HTMLImageElement,
  targetSize: number
): HTMLCanvasElement {
  const [canvas, ctx] = createCanvas(targetSize);
  const side = Math.min(img.naturalWidth || targetSize, img.naturalHeight || targetSize);
  const sx = Math.floor(((img.naturalWidth || side) - side) * 0.5);
  const sy = Math.floor(((img.naturalHeight || side) - side) * 0.5);
  ctx.drawImage(img, sx, sy, side, side, 0, 0, targetSize, targetSize);
  return canvas;
}

/** Sobel filter converting grayscale luminance/height into a crisp Tangent-Space Normal Map */
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
 * Synthesizes a 100% seamless, non-repetitive studio sheet texture from a high-res material scan.
 * Eliminates visible tile grids & mirror-butterfly seams via toroidal stochastic patch quilting
 * plus organic low-frequency natural tonal clouding (like real 2800x2070mm boards).
 */
function synthesizeSeamlessStudioSheet(
  img: HTMLImageElement,
  profile: PhotoPbrProfile,
  targetSize: number
): HTMLCanvasElement {
  const srcSize = Math.min(512, targetSize);
  const srcCanvas = drawSquareCropped(img, srcSize);
  const [outCanvas, outCtx] = createCanvas(targetSize);
  const rng = createRng(profile.seed);

  // Reusable feathered stamp buffer
  const stampSize = Math.max(96, Math.round(targetSize / Math.max(1.3, profile.patchDensity * 0.72)));
  const [stampCanvas, stampCtx] = createCanvas(stampSize);

  const drawWrapped = (canvas: HTMLCanvasElement, cx: number, cy: number, alpha = 1) => {
    const hw = canvas.width * 0.5;
    const hh = canvas.height * 0.5;
    outCtx.globalAlpha = alpha;
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const dx = cx - hw + ox * targetSize;
        const dy = cy - hh + oy * targetSize;
        if (dx + canvas.width < 0 || dx > targetSize || dy + canvas.height < 0 || dy > targetSize) {
          continue;
        }
        outCtx.drawImage(canvas, dx, dy);
      }
    }
    outCtx.globalAlpha = 1;
  };

  if (profile.synthesisMode === 'isotropic') {
    // 1. Base average fill so zero transparent gaps ever appear
    const baseScale = targetSize / Math.max(1.2, profile.patchDensity);
    for (let gx = 0; gx < Math.ceil(profile.patchDensity) + 1; gx++) {
      for (let gy = 0; gy < Math.ceil(profile.patchDensity) + 1; gy++) {
        outCtx.save();
        outCtx.translate((gx + 0.5) * baseScale, (gy + 0.5) * baseScale);
        outCtx.rotate(Math.floor(rng() * 4) * (Math.PI / 2));
        outCtx.drawImage(srcCanvas, -baseScale * 0.52, -baseScale * 0.52, baseScale * 1.04, baseScale * 1.04);
        outCtx.restore();
      }
    }

    // 2. Stochastic toroidal rotated patches with smooth radial cosine feather mask
    const patchCount = 26;
    for (let p = 0; p < patchCount; p++) {
      const cropFrac = 0.56 + rng() * 0.34;
      const cw = Math.floor(srcSize * cropFrac);
      const sx = Math.floor(rng() * (srcSize - cw));
      const sy = Math.floor(rng() * (srcSize - cw));

      stampCtx.globalCompositeOperation = 'source-over';
      stampCtx.clearRect(0, 0, stampSize, stampSize);
      stampCtx.save();
      stampCtx.translate(stampSize * 0.5, stampSize * 0.5);
      // Random 90-deg orientation + flip breaks all grid repetition
      stampCtx.rotate(Math.floor(rng() * 4) * (Math.PI / 2));
      if (rng() > 0.5) stampCtx.scale(-1, 1);
      stampCtx.drawImage(srcCanvas, sx, sy, cw, cw, -stampSize * 0.5, -stampSize * 0.5, stampSize, stampSize);
      stampCtx.restore();

      // Subtle per-patch natural tonal variation (±4%)
      const tone = rng() > 0.5 ? 'rgba(255,248,236,0.045)' : 'rgba(24,18,12,0.045)';
      stampCtx.fillStyle = tone;
      stampCtx.fillRect(0, 0, stampSize, stampSize);

      // Smooth radial feather mask
      stampCtx.globalCompositeOperation = 'destination-in';
      const grad = stampCtx.createRadialGradient(
        stampSize * 0.5,
        stampSize * 0.5,
        stampSize * 0.14,
        stampSize * 0.5,
        stampSize * 0.5,
        stampSize * 0.5
      );
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.62, 'rgba(0,0,0,0.92)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      stampCtx.fillStyle = grad;
      stampCtx.fillRect(0, 0, stampSize, stampSize);

      drawWrapped(stampCanvas, rng() * targetSize, rng() * targetSize, 0.94);
    }
  } else {
    // Directional wood grain synthesis: preserve authentic longitudinal grain flow with zero seams & zero mirroring
    const tileW = targetSize / Math.max(1.2, profile.patchDensity);
    const cols = Math.ceil(profile.patchDensity) + 1;
    const rows = Math.ceil(profile.patchDensity) + 1;
    for (let gy = 0; gy < rows; gy++) {
      for (let gx = 0; gx < cols; gx++) {
        outCtx.drawImage(srcCanvas, gx * tileW, gy * tileW, tileW + 1, tileW + 1);
      }
    }

    // Layer elongated feathered wood grain strips along X/Y to completely erase seam lines and create natural plank flow
    const stripW = Math.round(targetSize * 0.62);
    const stripH = Math.round(targetSize * 0.34);
    const [stripCanvas, stripCtx] = createCanvas(stripW);
    stripCanvas.height = stripH;

    for (let i = 0; i < 18; i++) {
      const cw = Math.floor(srcSize * (0.65 + rng() * 0.3));
      const ch = Math.floor(srcSize * (0.45 + rng() * 0.35));
      const sx = Math.floor(rng() * (srcSize - cw));
      const sy = Math.floor(rng() * (srcSize - ch));

      stripCtx.globalCompositeOperation = 'source-over';
      stripCtx.clearRect(0, 0, stripW, stripH);
      stripCtx.save();
      stripCtx.translate(stripW * 0.5, stripH * 0.5);
      // Flip 180° occasionally along grain without breaking grain orientation
      if (rng() > 0.5) stripCtx.scale(-1, 1);
      if (rng() > 0.5) stripCtx.scale(1, -1);
      stripCtx.drawImage(srcCanvas, sx, sy, cw, ch, -stripW * 0.5, -stripH * 0.5, stripW, stripH);
      stripCtx.restore();

      // Natural heartwood / sapwood micro-tone shift
      stripCtx.fillStyle = rng() > 0.5 ? 'rgba(255,244,225,0.04)' : 'rgba(28,16,8,0.045)';
      stripCtx.fillRect(0, 0, stripW, stripH);

      // Soft elliptical feather mask
      stripCtx.globalCompositeOperation = 'destination-in';
      stripCtx.save();
      stripCtx.scale(1, stripH / stripW);
      const grad = stripCtx.createRadialGradient(
        stripW * 0.5,
        stripW * 0.5,
        stripW * 0.12,
        stripW * 0.5,
        stripW * 0.5,
        stripW * 0.5
      );
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(0.65, 'rgba(0,0,0,0.88)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      stripCtx.fillStyle = grad;
      stripCtx.fillRect(0, 0, stripW, stripW);
      stripCtx.restore();

      drawWrapped(stripCanvas, rng() * targetSize, rng() * targetSize, 0.9);
    }
  }

  // 3. Subtle periodic macro tonal variation (breaks up large-area uniformity across 1.25m sheets)
  const imgData = outCtx.getImageData(0, 0, targetSize, targetSize);
  const d = imgData.data;
  const phase1 = rng() * Math.PI * 2;
  const phase2 = rng() * Math.PI * 2;
  const invSize = (Math.PI * 2) / targetSize;
  for (let y = 0; y < targetSize; y++) {
    const sy1 = Math.sin(y * invSize + phase1);
    const cy2 = Math.cos(y * invSize * 2 + phase2);
    for (let x = 0; x < targetSize; x++) {
      const wave =
        0.55 * Math.sin(x * invSize + phase2) * sy1 +
        0.45 * Math.cos(x * invSize * 2 - phase1) * cy2;
      const mult = 1 + wave * 0.032; // Gentle ±3.2% organic light-absorption clouding
      const idx = (y * targetSize + x) * 4;
      d[idx] = Math.min(255, Math.max(0, Math.round(d[idx] * mult)));
      d[idx + 1] = Math.min(255, Math.max(0, Math.round(d[idx + 1] * mult)));
      d[idx + 2] = Math.min(255, Math.max(0, Math.round(d[idx + 2] * mult)));
    }
  }
  outCtx.putImageData(imgData, 0, 0);

  return outCanvas;
}

/**
 * Derive non-repeating Synthesized Photographic Albedo, Tangent Normal Map, and Roughness Map
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
  const albedoCanvas = synthesizeSeamlessStudioSheet(img, profile, albedoSize);
  const [lumCanvas, lumCtx] = createCanvas(derivedSize);
  lumCtx.drawImage(albedoCanvas, 0, 0, derivedSize, derivedSize);
  const srcImg = lumCtx.getImageData(0, 0, derivedSize, derivedSize);
  const src = srcImg.data;

  const [roughCanvas, roughCtx] = createCanvas(derivedSize);
  const roughImg = roughCtx.createImageData(derivedSize, derivedSize);
  const rDst = roughImg.data;

  for (let i = 0; i < derivedSize * derivedSize; i++) {
    const idx = i * 4;
    const lum = (0.299 * src[idx] + 0.587 * src[idx + 1] + 0.114 * src[idx + 2]) / 255;
    const hVal = Math.round(lum * 255);
    src[idx] = hVal;
    src[idx + 1] = hVal;
    src[idx + 2] = hVal;
    src[idx + 3] = 255;

    const rVal = Math.round(
      profile.roughMax - lum * (profile.roughMax - profile.roughMin)
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

/** Compressed cross-section edge texture for cut OSB-3 board edges */
function generateOsbEdge(size = 256): PBRCanvasSet {
  const rng = createRng(3099);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  ctx.fillStyle = '#A87D44';
  ctx.fillRect(0, 0, size, size);
  hctx.fillStyle = '#606060';
  hctx.fillRect(0, 0, size, size);
  rctx.fillStyle = '#E8E8E8';
  rctx.fillRect(0, 0, size, size);

  const colors = ['#DFBC82', '#CA9C5E', '#AD7E43', '#E8CB97', '#865C2B'];
  for (let i = 0; i < 650; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const w = 10 + rng() * 34;
    const h = 2 + rng() * 5;
    const col = colors[Math.floor(rng() * colors.length)];
    const hv = Math.floor(70 + rng() * 165);
    ctx.fillStyle = col;
    ctx.fillRect(x, y, w, h);
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.fillRect(x, y, w, h);
  }
  return { albedo, height, roughness };
}

/** Authentic 11-ply laminated birch plywood edge texture */
function generatePlywoodEdge(size = 256): PBRCanvasSet {
  const rng = createRng(4088);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  const plies = 11;
  const plyH = size / plies;

  for (let i = 0; i < plies; i++) {
    const y = i * plyH;
    const isCross = i % 2 === 1;
    ctx.fillStyle = isCross ? '#C39E6F' : '#EDD8B8';
    ctx.fillRect(0, y, size, plyH);

    ctx.fillStyle = '#85603A';
    ctx.fillRect(0, y, size, Math.max(1.2, plyH * 0.08));

    for (let s = 0; s < 32; s++) {
      const sy = y + rng() * plyH;
      ctx.fillStyle = isCross
        ? 'rgba(110, 74, 38, 0.16)'
        : 'rgba(170, 134, 88, 0.14)';
      ctx.fillRect(0, sy, size, 1);
    }

    const hv = isCross ? 115 : 148;
    hctx.fillStyle = `rgb(${hv},${hv},${hv})`;
    hctx.fillRect(0, y, size, plyH);
    hctx.fillStyle = 'rgb(75,75,75)';
    hctx.fillRect(0, y, size, 1.5);

    const rv = isCross ? 205 : 168;
    rctx.fillStyle = `rgb(${rv},${rv},${rv})`;
    rctx.fillRect(0, y, size, plyH);
  }

  return { albedo, height, roughness };
}

/** Fine Egger-style satin melamine or architectural powder-coated steel */
function generateMicroPebblePBR(
  rgb: [number, number, number],
  roughMean: number,
  noiseAmp: number,
  size = 256
): PBRCanvasSet {
  const rng = createRng(rgb[0] * 31 + rgb[1] * 13 + roughMean);
  const [albedo, ctx] = createCanvas(size);
  const [height, hctx] = createCanvas(size);
  const [roughness, rctx] = createCanvas(size);

  const aImg = ctx.createImageData(size, size);
  const hImg = hctx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);

  for (let i = 0; i < size * size; i++) {
    const n = (rng() - 0.5) * noiseAmp;
    const idx = i * 4;
    aImg.data[idx] = Math.max(0, Math.min(255, rgb[0] + n));
    aImg.data[idx + 1] = Math.max(0, Math.min(255, rgb[1] + n));
    aImg.data[idx + 2] = Math.max(0, Math.min(255, rgb[2] + n));
    aImg.data[idx + 3] = 255;

    const hv = Math.floor(128 + (rng() - 0.5) * 44);
    hImg.data[idx] = hv;
    hImg.data[idx + 1] = hv;
    hImg.data[idx + 2] = hv;
    hImg.data[idx + 3] = 255;

    const rv = Math.max(40, Math.min(245, Math.floor(roughMean + (rng() - 0.5) * 24)));
    rImg.data[idx] = rv;
    rImg.data[idx + 1] = rv;
    rImg.data[idx + 2] = rv;
    rImg.data[idx + 3] = 255;
  }

  ctx.putImageData(aImg, 0, 0);
  hctx.putImageData(hImg, 0, 0);
  rctx.putImageData(rImg, 0, 0);
  return { albedo, height, roughness };
}

/**
 * Intelligent 100% seamless procedural wood-grain PBR synthesis for custom user warehouse boards
 * (periodic annual growth rings, cathedral curves, dark wood pores, and matching normal/roughness maps).
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

  const aImg = ctx.createImageData(size, size);
  const hImg = hctx.createImageData(size, size);
  const rImg = rctx.createImageData(size, size);

  const p1 = rng() * Math.PI * 2;
  const p2 = rng() * Math.PI * 2;
  const p3 = rng() * Math.PI * 2;
  const tau = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Seamless periodic domain warp for organic timber rings along X
      const warp =
        0.18 * Math.sin(u * tau * 2 + p1) * Math.cos(v * tau + p2) +
        0.09 * Math.sin(u * tau * 4 - v * tau * 2 + p3) +
        0.045 * Math.cos(u * tau * 7 + v * tau * 3 + p1);
      const ringCoord = (v * 9.5 + warp * 3.8);
      const ring = 0.5 + 0.5 * Math.sin(ringCoord * tau);
      const sharpRing = Math.pow(ring, 2.2);

      // Fine longitudinal wood fibers & pores
      const fiber =
        0.5 +
        0.5 * Math.sin(v * tau * 48 + Math.sin(u * tau * 3 + p2) * 2.4) *
          Math.cos(u * tau * 5 + p3);
      const poreMask =
        Math.sin(v * tau * 31 + warp * 12) > 0.88 && Math.sin(u * tau * 14 + v * tau * 19 + p1) > 0.65
          ? 1
          : 0;

      // Subtle macro sapwood/heartwood tonal wave
      const macro = 1 + 0.05 * Math.sin(v * tau + p2) * Math.cos(u * tau + p1);
      const shade = (0.86 + sharpRing * 0.16 + fiber * 0.05 - poreMask * 0.24) * macro;

      const idx = (y * size + x) * 4;
      aImg.data[idx] = Math.min(255, Math.max(0, Math.round(rgb[0] * shade)));
      aImg.data[idx + 1] = Math.min(255, Math.max(0, Math.round(rgb[1] * shade * 0.98)));
      aImg.data[idx + 2] = Math.min(255, Math.max(0, Math.round(rgb[2] * shade * 0.95)));
      aImg.data[idx + 3] = 255;

      const hv = Math.min(255, Math.max(0, Math.round(135 + sharpRing * 42 + fiber * 18 - poreMask * 95)));
      hImg.data[idx] = hv;
      hImg.data[idx + 1] = hv;
      hImg.data[idx + 2] = hv;
      hImg.data[idx + 3] = 255;

      const rv = Math.min(245, Math.max(85, Math.round(168 - sharpRing * 38 + poreMask * 56)));
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
    canvas = generateMicroPebblePBR([245, 244, 240], 118, 5, 64).albedo;
  } else if (id === 'anthracite_matte') {
    canvas = generateMicroPebblePBR([48, 52, 58], 130, 6, 64).albedo;
  } else if (id === 'steel_black') {
    canvas = generateMicroPebblePBR([36, 39, 44], 96, 8, 64).albedo;
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
      : generateMicroPebblePBR(rgb, 125, 9, 64).albedo;
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
  anthracite_matte: '#34383F',
  hdf_white: '#F0EFEA',
  hdf_black: '#2C2E33',
  concrete_top: '#A0A3A2',
  steel_black: '#26292E',
  steel_galv: '#AEB5BC',
  glass_clear: '#D4ECEE',
};

export class MaterialLibrary {
  private standardMaterials = new Map<MaterialId, THREE.Material | THREE.Material[]>();
  private finishMaterials = new Map<string, THREE.Material | THREE.Material[]>();
  private xrayMaterials = new Map<MaterialId, THREE.MeshStandardMaterial>();
  private customUrls: Partial<Record<MaterialId, string>> = {};
  private textures = new Set<THREE.Texture>();
  private texturesByMaterial = new Map<MaterialId, THREE.Texture[]>();
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

  private disposeMaterialTextures(id: MaterialId) {
    const owned = this.texturesByMaterial.get(id);
    if (owned) {
      for (const tex of owned) {
        tex.dispose();
        this.textures.delete(tex);
      }
      this.texturesByMaterial.delete(id);
    }
  }

  private registerTexture(tex: THREE.Texture, ownerId?: MaterialId) {
    this.textures.add(tex);
    if (ownerId) {
      const list = this.texturesByMaterial.get(ownerId) ?? [];
      list.push(tex);
      this.texturesByMaterial.set(ownerId, list);
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
        this.buildGeneration.set(id, (this.buildGeneration.get(id) ?? 0) + 1);
        this.disposeMaterialTextures(id);
        const old = this.standardMaterials.get(id);
        if (old) {
          if (Array.isArray(old)) old.forEach((m) => m.dispose());
          else old.dispose();
          this.standardMaterials.delete(id);
        }
        (['satin', 'gloss'] as const).forEach((fin) => {
          const fk = `${id}_${fin}`;
          const oldFin = this.finishMaterials.get(fk);
          if (oldFin) {
            if (Array.isArray(oldFin)) oldFin.forEach((m) => m.dispose());
            else oldFin.dispose();
            this.finishMaterials.delete(fk);
          }
        });
        const oldX = this.xrayMaterials.get(id);
        if (oldX) {
          oldX.dispose();
          this.xrayMaterials.delete(id);
        }
      }
    });
    this.customUrls = { ...nextUrls };
    if (changed) {
      this.onTextureLoaded?.();
    }
  }

  /** Invalidates cached GPU material entries (used when user edits custom warehouse board colors) */
  invalidateCustomMaterials() {
    for (const id of Array.from(this.standardMaterials.keys())) {
      if (!(id in FALLBACK_COLORS)) {
        this.buildGeneration.set(id, (this.buildGeneration.get(id) ?? 0) + 1);
        this.disposeMaterialTextures(id);
        const old = this.standardMaterials.get(id);
        if (old) {
          if (Array.isArray(old)) old.forEach((m) => m.dispose());
          else old.dispose();
          this.standardMaterials.delete(id);
        }
        (['satin', 'gloss'] as const).forEach((fin) => {
          const fk = `${id}_${fin}`;
          const oldFin = this.finishMaterials.get(fk);
          if (oldFin) {
            if (Array.isArray(oldFin)) oldFin.forEach((m) => m.dispose());
            else oldFin.dispose();
            this.finishMaterials.delete(fk);
          }
        });
      }
    }
  }

  private configureTexture(
    tex: THREE.Texture,
    isColor: boolean,
    mirrorWrap = false,
    tileScale = 1,
    ownerId?: MaterialId
  ): THREE.Texture {
    const wrap = mirrorWrap ? THREE.MirroredRepeatWrapping : THREE.RepeatWrapping;
    tex.wrapS = wrap;
    tex.wrapT = wrap;
    tex.repeat.set(tileScale, tileScale);
    tex.anisotropy = this.maxAnisotropy;
    tex.generateMipmaps = true;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    if (isColor) {
      tex.colorSpace = THREE.SRGBColorSpace;
    }
    tex.needsUpdate = true;
    this.registerTexture(tex, ownerId);
    return tex;
  }

  private createCanvasTex(
    canvas: HTMLCanvasElement,
    isColor: boolean,
    mirrorWrap = false,
    tileScale = 1,
    ownerId?: MaterialId
  ): THREE.CanvasTexture {
    const tex = new THREE.CanvasTexture(canvas);
    this.configureTexture(tex, isColor, mirrorWrap, tileScale, ownerId);
    return tex;
  }

  private buildProceduralPbrMat(
    ownerId: MaterialId,
    set: PBRCanvasSet,
    opts: {
      normalStrength: number;
      normalScale: number;
      roughness: number;
      metalness: number;
      clearcoat?: number;
      clearcoatRoughness?: number;
      envMapIntensity?: number;
    }
  ): THREE.MeshPhysicalMaterial {
    const normalCanvas = heightToNormalCanvas(set.height, opts.normalStrength);
    return new THREE.MeshPhysicalMaterial({
      map: this.createCanvasTex(set.albedo, true, false, 1, ownerId),
      normalMap: this.createCanvasTex(normalCanvas, false, false, 1, ownerId),
      normalScale: new THREE.Vector2(opts.normalScale, opts.normalScale),
      roughnessMap: this.createCanvasTex(set.roughness, false, false, 1, ownerId),
      roughness: opts.roughness,
      metalness: opts.metalness,
      clearcoat: opts.clearcoat ?? 0,
      clearcoatRoughness: opts.clearcoatRoughness ?? 0.4,
      envMapIntensity: opts.envMapIntensity ?? 1.0,
    });
  }

  private buildPhotoPbrMat(
    id: MaterialId,
    url: string,
    profile: PhotoPbrProfile
  ): THREE.MeshPhysicalMaterial {
    const gen = this.buildGeneration.get(id) ?? 0;
    const mat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(FALLBACK_COLORS[id] ?? getMaterialMeta(id).swatchFallbackHex),
      roughness: 0.72,
      metalness: profile.metalness,
      clearcoat: profile.clearcoat,
      clearcoatRoughness: profile.clearcoatRoughness,
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
        false,
        profile.tileScale,
        id
      );
      const normalTex = this.createCanvasTex(
        normalCanvas,
        false,
        false,
        profile.tileScale,
        id
      );
      const roughTex = this.createCanvasTex(
        roughnessCanvas,
        false,
        false,
        profile.tileScale,
        id
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
        const cached = this.finishMaterials.get(`${id}_${fin}`);
        if (!cached) return;
        const primary = (Array.isArray(cached) ? cached[0] : cached) as THREE.MeshPhysicalMaterial;
        primary.color.set('#FFFFFF');
        primary.map = albedoTex;
        primary.normalMap = normalTex;
        primary.normalScale = new THREE.Vector2(profile.normalScale * (fin === 'gloss' ? 0.35 : 0.7), profile.normalScale * (fin === 'gloss' ? 0.35 : 0.7));
        primary.roughnessMap = fin === 'gloss' ? null : roughTex;
        primary.roughness = fin === 'gloss' ? 0.14 : 0.55;
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
    finish: SurfaceFinish = 'matte'
  ): THREE.Material | THREE.Material[] {
    if (xray) {
      if (!this.xrayMaterials.has(id)) {
        const base = this.getMaterial(id, false);
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

    if (finish !== 'matte' && id !== 'glass_clear') {
      const fKey = `${id}_${finish}`;
      if (!this.finishMaterials.has(fKey)) {
        const base = this.getMaterial(id, false, 'matte');
        const applyFinish = (m: THREE.Material, isEdge = false): THREE.Material => {
          const clone = m.clone();
          if (clone instanceof THREE.MeshPhysicalMaterial && !isEdge) {
            if (finish === 'gloss') {
              clone.clearcoat = 1.0;
              clone.clearcoatRoughness = 0.04;
              clone.roughness = 0.14;
              clone.roughnessMap = null;
              clone.envMapIntensity = 1.6;
              clone.reflectivity = 1.0;
              if (clone.normalScale) clone.normalScale = clone.normalScale.clone().multiplyScalar(0.35);
            } else if (finish === 'satin') {
              clone.clearcoat = 0.52;
              clone.clearcoatRoughness = 0.22;
              clone.roughness = Math.min(clone.roughness, 0.52);
              clone.envMapIntensity = 1.2;
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

    if (this.standardMaterials.has(id)) {
      return this.standardMaterials.get(id)!;
    }

    let result: THREE.Material | THREE.Material[];
    const photoUrl = this.customUrls[id] || DEFAULT_PHOTO_URLS[id];
    const photoProfile = PHOTO_PROFILES[id] || DEFAULT_CUSTOM_PROFILE;

    if (photoUrl) {
      const faceMat = this.buildPhotoPbrMat(id, photoUrl, photoProfile);
      if (id === 'osb3') {
        const edgeMat = this.buildProceduralPbrMat(id, generateOsbEdge(256), {
          normalStrength: 4.0,
          normalScale: 1.15,
          roughness: 1.0,
          metalness: 0.0,
          envMapIntensity: 0.65,
        });
        result = [faceMat, edgeMat];
      } else if (id === 'birch_plywood') {
        const edgeMat = this.buildProceduralPbrMat(id, generatePlywoodEdge(256), {
          normalStrength: 2.2,
          normalScale: 0.75,
          roughness: 0.95,
          metalness: 0.01,
          envMapIntensity: 0.8,
        });
        result = [faceMat, edgeMat];
      } else {
        result = faceMat;
      }
    } else if (id === 'white_matte') {
      result = this.buildProceduralPbrMat(
        id,
        generateMicroPebblePBR([245, 244, 240], 122, 5, 256),
        {
          normalStrength: 0.65,
          normalScale: 0.28,
          roughness: 0.95,
          metalness: 0.01,
          clearcoat: 0.1,
          clearcoatRoughness: 0.45,
          envMapIntensity: 0.85,
        }
      );
    } else if (id === 'anthracite_matte') {
      result = this.buildProceduralPbrMat(
        id,
        generateMicroPebblePBR([48, 52, 58], 132, 6, 256),
        {
          normalStrength: 0.75,
          normalScale: 0.32,
          roughness: 0.95,
          metalness: 0.04,
          clearcoat: 0.12,
          clearcoatRoughness: 0.42,
          envMapIntensity: 0.95,
        }
      );
    } else if (id === 'steel_black') {
      result = this.buildProceduralPbrMat(
        id,
        generateMicroPebblePBR([36, 39, 44], 102, 8, 256),
        {
          normalStrength: 1.4,
          normalScale: 0.5,
          roughness: 0.92,
          metalness: 0.8,
          clearcoat: 0.16,
          clearcoatRoughness: 0.36,
          envMapIntensity: 1.2,
        }
      );
    } else if (id === 'glass_clear') {
      result = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color('#D4ECEE'),
        roughness: 0.05,
        metalness: 0.05,
        transmission: this.isSoftwareGl ? 0 : 0.88,
        transparent: true,
        opacity: this.isSoftwareGl ? 0.34 : 1,
        ior: 1.52,
        thickness: 0.012,
        clearcoat: 1.0,
        clearcoatRoughness: 0.05,
        depthWrite: false,
      });
    } else {
      // Custom user warehouse board — realistic procedural wood grain or architectural matte melamine PBR
      const meta = getMaterialMeta(id);
      const rgb = hexToRgbTuple(meta.swatchFallbackHex);
      const seed = rgb[0] * 17 + rgb[1] * 31 + rgb[2] * 13 + id.length * 7;
      const pbrSet = meta.grainDirectional
        ? generateProceduralWoodPBR(rgb, seed, this.isSoftwareGl ? 256 : 512)
        : generateMicroPebblePBR(rgb, 128, 8, 256);
      result = this.buildProceduralPbrMat(id, pbrSet, {
        normalStrength: meta.grainDirectional ? 2.1 : 1.0,
        normalScale: meta.grainDirectional ? 0.62 : 0.36,
        roughness: 0.9,
        metalness: meta.category === 'Stal i szkło' ? 0.65 : 0.02,
        clearcoat: meta.grainDirectional ? 0.16 : 0.12,
        clearcoatRoughness: 0.4,
        envMapIntensity: 0.94,
      });
    }

    this.standardMaterials.set(id, result);
    return result;
  }

  dispose() {
    this.disposed = true;
    this.standardMaterials.forEach((m) => {
      if (Array.isArray(m)) m.forEach((sub) => sub.dispose());
      else m.dispose();
    });
    this.finishMaterials.forEach((m) => {
      if (Array.isArray(m)) m.forEach((sub) => sub.dispose());
      else m.dispose();
    });
    this.xrayMaterials.forEach((m) => m.dispose());
    this.textures.forEach((t) => t.dispose());
    this.standardMaterials.clear();
    this.finishMaterials.clear();
    this.xrayMaterials.clear();
    this.textures.clear();
    this.texturesByMaterial.clear();
    this.buildGeneration.clear();
  }
}
