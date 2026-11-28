import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { FurnitureProject, getMaterialMeta, MaterialId } from '../types/furniture';
import {
  buildApplianceGroup,
  buildDoorHandleGroup,
  buildFastenerGroup,
  buildPartGeometry,
  MM_TO_M,
} from './geometry';
import {
  buildCarpentryConnectorDetailGroup,
  buildDoorHingeCupsGroup,
  buildFurnitureLegGroup,
  buildSlidingDoorRollersGroup,
  buildSlidingTrackGroup,
} from './hardware3D';
import { buildArchitecturalRoom3D } from './roomMesh3D';

import texOsbUrl from '../assets/images/tex_osb3_board_1795690459304.jpg';
import texOakUrl from '../assets/images/tex_oak_craft_1795344820546.jpg';
import texWalnutUrl from '../assets/images/tex_walnut_wood_1795344821285.jpg';
import texBirchUrl from '../assets/images/tex_birch_plywood_1795344820360.jpg';
import texConcreteUrl from '../assets/images/tex_concrete_top_1795344822022.jpg';
import texGalvUrl from '../assets/images/tex_steel_galv_1795344820306.jpg';

export type Export3DFormat = 'glb' | 'obj' | 'stl';

export interface Export3DOptions {
  /** Include architectural room (walls, floor, ceiling, slopes, doors/windows) in GLB/OBJ export */
  includeRoom?: boolean;
  /** Include 3D fasteners (screws, confirmat, minifix, dowels) in export */
  includeFasteners?: boolean;
}

const EXPORT_PHOTO_URLS: Partial<Record<MaterialId, string>> = {
  osb3: texOsbUrl,
  oak_craft: texOakUrl,
  walnut: texWalnutUrl,
  birch_plywood: texBirchUrl,
  concrete_top: texConcreteUrl,
  steel_galv: texGalvUrl,
};

function sanitizeFileName(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return cleaned || 'projekt-stolarz3d';
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/** Loads a bundled JPEG texture onto a 512×512 canvas so GLTFExporter embeds real wood/OSB/concrete PBR maps */
function loadImageTexture(url: string): Promise<THREE.CanvasTexture | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 512;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, size, size);
        const tex = new THREE.CanvasTexture(canvas);
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.RepeatWrapping;
        tex.needsUpdate = true;
        resolve(tex);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function createProceduralWoodTexture(baseHex: string): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, size, size);
  for (let y = 0; y < size; y += 3) {
    const wave = Math.sin(y * 0.14) * 14 + Math.cos(y * 0.05) * 8;
    ctx.fillStyle = wave > 0 ? 'rgba(255,255,255,0.055)' : 'rgba(30,15,5,0.08)';
    ctx.fillRect(0, y, size, 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Builds a clean, self-contained Three.js Group of the current FurnitureProject
 * in true metric meters (1 unit = 1 m) with embedded PBR textures ready for Blender,
 * SketchUp, Fusion 360, AR viewers, or 3D printing slicers.
 */
async function buildExportSceneGroup(
  project: FurnitureProject,
  format: Export3DFormat,
  options?: Export3DOptions
): Promise<{
  root: THREE.Group;
  dispose: () => void;
}> {
  const root = new THREE.Group();
  root.name = project.name || 'Stolarz3D_Project';

  const geometries: THREE.BufferGeometry[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const textures: THREE.Texture[] = [];

  // Preload PBR photo maps for GLB so exported models look photorealistic in external 3D apps
  const loadedTextures = new Map<string, THREE.CanvasTexture>();
  if (format === 'glb') {
    const usedIds = new Set(project.parts.filter((p) => !p.hidden).map((p) => p.materialId));
    await Promise.all(
      Array.from(usedIds).map(async (matId) => {
        const url = EXPORT_PHOTO_URLS[matId];
        if (url) {
          const tex = await loadImageTexture(url);
          if (tex) {
            loadedTextures.set(matId, tex);
            textures.push(tex);
          }
        } else if (
          matId === 'pine_timber' ||
          matId === 'spruce_plank' ||
          matId === 'larch_impregnated'
        ) {
          const meta = getMaterialMeta(matId);
          const tex = createProceduralWoodTexture(meta.swatchFallbackHex || '#D4AC75');
          loadedTextures.set(matId, tex);
          textures.push(tex);
        }
      })
    );
  }

  const getExportMaterial = (
    materialId: string,
    surfaceFinish?: string
  ): THREE.MeshStandardMaterial => {
    const key = `${materialId}__${surfaceFinish || 'matte'}`;
    const cached = materials.get(key);
    if (cached) return cached;
    const meta = getMaterialMeta(materialId);
    const isMetal = meta.category === 'Stal i szkło' && Boolean(meta.barLengthMm);
    const isGlass = materialId === 'glass_clear';
    const tex = loadedTextures.get(materialId) ?? null;
    const baseRoughness = isGlass
      ? 0.08
      : isMetal
        ? 0.32
        : surfaceFinish === 'gloss'
          ? 0.14
          : surfaceFinish === 'satin'
            ? 0.38
            : 0.72;
    const mat = new THREE.MeshStandardMaterial({
      name: meta.name,
      color: tex ? new THREE.Color('#ffffff') : new THREE.Color(meta.swatchFallbackHex || '#C59B5F'),
      map: tex,
      roughness: baseRoughness,
      metalness: isMetal ? 0.85 : 0.0,
      transparent: isGlass,
      opacity: isGlass ? 0.35 : 1,
    });
    materials.set(key, mat);
    return mat;
  };

  const furnitureGroup = new THREE.Group();
  furnitureGroup.name = 'Meble';
  root.add(furnitureGroup);

  const partMap = new Map<string, THREE.Object3D>();

  for (const part of project.parts) {
    if (part.hidden) continue;

    if (part.kind === 'appliance' && part.applianceModel) {
      const appGroup = buildApplianceGroup(part);
      if (appGroup) {
        appGroup.name = part.name;
        appGroup.position.set(
          part.position[0] * MM_TO_M,
          part.position[1] * MM_TO_M,
          part.position[2] * MM_TO_M
        );
        appGroup.rotation.set(
          THREE.MathUtils.degToRad(part.rotation[0]),
          THREE.MathUtils.degToRad(part.rotation[1]),
          THREE.MathUtils.degToRad(part.rotation[2])
        );
        furnitureGroup.add(appGroup);
        continue;
      }
    }

    if (part.hardwareTag === 'leg') {
      const legGroup = buildFurnitureLegGroup(part);
      legGroup.name = part.name;
      legGroup.position.set(
        part.position[0] * MM_TO_M,
        part.position[1] * MM_TO_M,
        part.position[2] * MM_TO_M
      );
      legGroup.rotation.set(
        THREE.MathUtils.degToRad(part.rotation[0]),
        THREE.MathUtils.degToRad(part.rotation[1]),
        THREE.MathUtils.degToRad(part.rotation[2])
      );
      furnitureGroup.add(legGroup);
      continue;
    }

    const trackGroup = part.kind === 'profile' ? buildSlidingTrackGroup(part) : null;
    if (trackGroup) {
      trackGroup.name = part.name;
      trackGroup.position.set(
        part.position[0] * MM_TO_M,
        part.position[1] * MM_TO_M,
        part.position[2] * MM_TO_M
      );
      trackGroup.rotation.set(
        THREE.MathUtils.degToRad(part.rotation[0]),
        THREE.MathUtils.degToRad(part.rotation[1]),
        THREE.MathUtils.degToRad(part.rotation[2])
      );
      furnitureGroup.add(trackGroup);
      continue;
    }

    const geo = buildPartGeometry(part);
    geometries.push(geo);
    const mat = getExportMaterial(part.materialId, part.surfaceFinish);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = part.name;
    mesh.position.set(
      part.position[0] * MM_TO_M,
      part.position[1] * MM_TO_M,
      part.position[2] * MM_TO_M
    );
    mesh.rotation.set(
      THREE.MathUtils.degToRad(part.rotation[0]),
      THREE.MathUtils.degToRad(part.rotation[1]),
      THREE.MathUtils.degToRad(part.rotation[2])
    );

    if (part.kind === 'door') {
      const handleGroup = buildDoorHandleGroup(part);
      if (handleGroup) mesh.add(handleGroup);
      const hingesGroup = buildDoorHingeCupsGroup(part);
      if (hingesGroup) mesh.add(hingesGroup);
      const rollersGroup = buildSlidingDoorRollersGroup(part);
      if (rollersGroup) mesh.add(rollersGroup);
    }

    const connectorDetail = buildCarpentryConnectorDetailGroup(part);
    if (connectorDetail) {
      mesh.add(connectorDetail);
    }

    furnitureGroup.add(mesh);
    partMap.set(part.id, mesh);
  }

  // Optional 3D fasteners (included in GLB/OBJ by default)
  const includeFasteners = options?.includeFasteners ?? format !== 'stl';
  if (includeFasteners && project.fasteners.length > 0) {
    const upAxis = new THREE.Vector3(0, 1, 0);
    for (const f of project.fasteners) {
      const parentObj = partMap.get(f.partId);
      if (!parentObj) continue;
      const fGroup = buildFastenerGroup(f.type, false);
      fGroup.name = `Lacznik_${f.type}`;
      fGroup.position.set(
        f.localPosition[0] * MM_TO_M,
        f.localPosition[1] * MM_TO_M,
        f.localPosition[2] * MM_TO_M
      );
      const norm = new THREE.Vector3(
        f.localNormal[0],
        f.localNormal[1],
        f.localNormal[2]
      ).normalize();
      if (norm.lengthSq() > 0.001) {
        fGroup.quaternion.setFromUnitVectors(upAxis, norm);
      }
      parentObj.add(fGroup);
    }
  }

  // Optional architectural room shell (walls, floor, slopes, doors, windows) for GLB/OBJ
  const includeRoom = options?.includeRoom ?? (format !== 'stl');
  if (includeRoom && project.room?.enabled) {
    const roomGroup = new THREE.Group();
    roomGroup.name = 'Pomieszczenie';
    buildArchitecturalRoom3D(roomGroup, {
      ...project.room,
      style: {
        wallFinish: project.room.style?.wallFinish ?? 'warm_alabaster',
        floorFinish: project.room.style?.floorFinish ?? 'oak_parquet',
        showBaseboards: project.room.style?.showBaseboards ?? true,
        baseboardHeightMm: project.room.style?.baseboardHeightMm ?? 80,
        wallCutawayMode: 'solid',
      },
    });
    root.add(roomGroup);
  }

  root.updateMatrixWorld(true);

  const dispose = () => {
    for (const g of geometries) g.dispose();
    for (const t of textures) t.dispose();
    materials.forEach((m) => m.dispose());
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material) {
          obj.material.dispose();
        }
      }
    });
  };

  return { root, dispose };
}

/**
 * Exports the entire 3D project to GLB (binary GLTF 2.0 with embedded PBR textures & room),
 * OBJ, or binary STL (furniture-only for 3D printing).
 */
export async function exportProjectTo3D(
  project: FurnitureProject,
  format: Export3DFormat,
  options?: Export3DOptions
): Promise<string> {
  const baseName = sanitizeFileName(project.name);
  const { root, dispose } = await buildExportSceneGroup(project, format, options);

  try {
    if (format === 'glb') {
      const exporter = new GLTFExporter();
      const buffer = await new Promise<ArrayBuffer>((resolve, reject) => {
        exporter.parse(
          root,
          (result) => {
            if (result instanceof ArrayBuffer) {
              resolve(result);
            } else {
              const json = JSON.stringify(result);
              resolve(new TextEncoder().encode(json).buffer);
            }
          },
          (err) => reject(err),
          { binary: true, onlyVisible: true }
        );
      });
      const filename = `${baseName}.glb`;
      triggerBlobDownload(new Blob([buffer], { type: 'model/gltf-binary' }), filename);
      return filename;
    }

    if (format === 'obj') {
      const exporter = new OBJExporter();
      const objText = exporter.parse(root);
      const filename = `${baseName}.obj`;
      triggerBlobDownload(new Blob([objText], { type: 'text/plain;charset=utf-8' }), filename);
      return filename;
    }

    const exporter = new STLExporter();
    const stlResult = exporter.parse(root, { binary: true });
    const filename = `${baseName}.stl`;
    const bytes =
      stlResult instanceof DataView
        ? new Uint8Array(stlResult.buffer, stlResult.byteOffset, stlResult.byteLength)
        : new TextEncoder().encode(String(stlResult));
    triggerBlobDownload(
      new Blob([bytes.slice().buffer], { type: 'model/stl' }),
      filename
    );
    return filename;
  } finally {
    dispose();
  }
}
