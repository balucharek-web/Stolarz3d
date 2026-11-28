import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { OBJExporter } from 'three/addons/exporters/OBJExporter.js';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import { FurnitureProject, getMaterialMeta } from '../types/furniture';
import {
  buildApplianceGroup,
  buildDoorHandleGroup,
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

export type Export3DFormat = 'glb' | 'obj' | 'stl';

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

/**
 * Builds a clean, self-contained Three.js Group of the current FurnitureProject
 * in true metric meters (1 unit = 1 m) with PBR materials ready for Blender, SketchUp,
 * Fusion 360, or 3D printing slicers.
 */
function buildExportSceneGroup(project: FurnitureProject): {
  root: THREE.Group;
  dispose: () => void;
} {
  const root = new THREE.Group();
  root.name = project.name || 'Stolarz3D_Project';

  const geometries: THREE.BufferGeometry[] = [];
  const materials = new Map<string, THREE.MeshStandardMaterial>();

  const getExportMaterial = (materialId: string): THREE.MeshStandardMaterial => {
    const cached = materials.get(materialId);
    if (cached) return cached;
    const meta = getMaterialMeta(materialId);
    const isMetal = meta.category === 'Stal i szkło' && Boolean(meta.barLengthMm);
    const isGlass = materialId === 'glass_clear';
    const mat = new THREE.MeshStandardMaterial({
      name: meta.name,
      color: new THREE.Color(meta.swatchFallbackHex || '#C59B5F'),
      roughness: isGlass ? 0.08 : isMetal ? 0.32 : 0.72,
      metalness: isMetal ? 0.85 : 0.0,
      transparent: isGlass,
      opacity: isGlass ? 0.35 : 1,
    });
    materials.set(materialId, mat);
    return mat;
  };

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
        root.add(appGroup);
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
      root.add(legGroup);
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
      root.add(trackGroup);
      continue;
    }

    const geo = buildPartGeometry(part);
    geometries.push(geo);
    const mat = getExportMaterial(part.materialId);
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

    root.add(mesh);
  }

  root.updateMatrixWorld(true);

  const dispose = () => {
    for (const g of geometries) g.dispose();
    materials.forEach((m) => m.dispose());
    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry?.dispose();
        if (Array.isArray(obj.material)) {
          obj.material.forEach((m) => m.dispose());
        } else if (obj.material && !materials.has(obj.material.name)) {
          obj.material.dispose();
        }
      }
    });
  };

  return { root, dispose };
}

/**
 * Exports the entire 3D project to GLB (binary GLTF 2.0), OBJ, or binary STL.
 */
export async function exportProjectTo3D(
  project: FurnitureProject,
  format: Export3DFormat
): Promise<string> {
  const baseName = sanitizeFileName(project.name);
  const { root, dispose } = buildExportSceneGroup(project);

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
