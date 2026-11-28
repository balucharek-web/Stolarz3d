import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import {
  CameraPreset,
  EditorTool,
  Fastener,
  FurniturePart,
  MeasureSegment,
  RoomConfig,
  ScrewType,
  StudioLighting,
} from '../types/furniture';
import { MaterialLibrary } from '../engine/materials';
import {
  buildApplianceGroup,
  buildDoorHandleGroup,
  buildDoorHingesGroup,
  buildFastenerGroup,
  buildPartGeometry,
  buildPartMachiningGroup,
  M_TO_MM,
  MM_TO_M,
} from '../engine/geometry';
import type { AssemblyPlan } from '../engine/assembly';
import {
  evaluateScrewPlacement,
  getPartQuaternion,
  getPartWorldBox,
  snapPartToNeighbors,
  type ClearanceGuide,
  type FastenerAudit,
  type JointZone,
  type ScrewHoverFeedback,
} from '../engine/carpentry';
import { buildArchitecturalRoom3D } from '../engine/roomMesh3D';
import {
  buildCabinetHardwareScene,
  buildFurnitureLegGroup,
  buildSlidingDoorRollersGroup,
  buildSlidingTrackGroup,
  computeDrawerSlideTravelMap,
  type CabinetHardwareRuntime,
} from '../engine/hardware3D';
import type { ContextMenuTarget } from './ContextMenu';

export interface Viewport3DHandle {
  setCameraPreset: (preset: CameraPreset) => void;
  captureSnapshot: () => string | null;
  focusAll: () => void;
  focusPart: (partId: string) => void;
}

interface Viewport3DProps {
  parts: FurniturePart[];
  fasteners: Fastener[];
  room?: RoomConfig;
  selectedPartId: string | null;
  selectedPartIds: string[];
  selectedFastenerId: string | null;
  tool: EditorTool;
  activeScrewType: ScrewType;
  screwJointsOnly: boolean;
  snapMm: number;
  magneticSnap: boolean;
  showDimensions: boolean;
  xrayMode: boolean;
  showFasteners: boolean;
  ledUnderCabinet: boolean;
  measurements: MeasureSegment[];
  explodedAmount: number;
  openAmount: number;
  assemblyStep: number;
  assemblyPlan: AssemblyPlan | null;
  materialsVersion: number;
  lighting: StudioLighting;
  customTextures: Partial<Record<import('../types/furniture').MaterialId, string>>;
  collidingPartIds: Set<string>;
  fastenerAuditMap: Map<string, FastenerAudit>;
  clearances: ClearanceGuide[];
  jointZones: JointZone[];
  isParametricCabinetSelected?: boolean;
  onSelectPart: (id: string | null, additive?: boolean) => void;
  onSelectFastener: (id: string | null) => void;
  onTransformPart: (
    id: string,
    position: [number, number, number],
    rotation: [number, number, number]
  ) => void;
  onBatchTransformParts?: (
    updates: Array<{
      id: string;
      position: [number, number, number];
      rotation: [number, number, number];
    }>
  ) => void;
  onCloneTransformPart: (
    id: string,
    position: [number, number, number],
    rotation: [number, number, number]
  ) => void;
  onResizePart: (
    id: string,
    dims: { width: number; height: number; depth: number },
    position: [number, number, number]
  ) => void;
  onAddMeasurement: (seg: MeasureSegment) => void;
  onPlaceFastener: (
    partId: string,
    localPosition: [number, number, number],
    localNormal: [number, number, number],
    overrideType?: ScrewType,
    targetPartId?: string
  ) => void;
  onRejectScrewPlacement: (reason: string) => void;
  onContextMenu: (target: ContextMenuTarget | null) => void;
  onDoubleClickPart?: (id: string) => void;
  onSetClearanceDistance?: (
    partId: string,
    guide: ClearanceGuide,
    targetDistanceMm: number
  ) => void;
}

const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _quatA = new THREE.Quaternion();
const _upVec = new THREE.Vector3(0, 1, 0);
const _mat3A = new THREE.Matrix3();
const _pointerNdc = new THREE.Vector2();

function detectSoftwareGl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    size * 0.08,
    size / 2,
    size / 2,
    size * 0.5
  );
  grad.addColorStop(0, 'rgba(20, 24, 30, 0.28)');
  grad.addColorStop(0.55, 'rgba(20, 24, 30, 0.11)');
  grad.addColorStop(1, 'rgba(20, 24, 30, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createClearanceSprite(label: string, editable = false): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = editable ? 284 : 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.beginPath();
  ctx.roundRect(6, 6, canvas.width - 12, 60, 14);
  ctx.fill();
  ctx.strokeStyle = editable ? '#38BDF8' : '#0EA5E9';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#F0F9FF';
  ctx.font = 'bold 27px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, editable ? 124 : 128, 37);

  if (editable) {
    ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
    ctx.beginPath();
    ctx.roundRect(canvas.width - 52, 16, 36, 40, 8);
    ctx.fill();
    ctx.fillStyle = '#7DD3FC';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('✎', canvas.width - 34, 37);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(editable ? 0.245 : 0.22, 0.062, 1);
  sprite.renderOrder = 998;
  sprite.userData.disposeMaterial = true;
  sprite.userData.disposeTexture = tex;
  return sprite;
}

function formatMeasureDistanceMm(mm: number): string {
  return `${Math.round(mm).toLocaleString('pl-PL')} mm`;
}

function buildMeasureVisual(
  startMm: [number, number, number],
  endMm: [number, number, number],
  colorHex = '#38BDF8'
): THREE.Group {
  const g = new THREE.Group();
  const s = new THREE.Vector3(startMm[0] * MM_TO_M, startMm[1] * MM_TO_M, startMm[2] * MM_TO_M);
  const e = new THREE.Vector3(endMm[0] * MM_TO_M, endMm[1] * MM_TO_M, endMm[2] * MM_TO_M);

  const lineGeo = new THREE.BufferGeometry().setFromPoints([s, e]);
  const lineMat = new THREE.LineBasicMaterial({ color: colorHex, depthTest: false });
  const line = new THREE.Line(lineGeo, lineMat);
  line.renderOrder = 998;
  line.userData.disposeMaterial = true;
  g.add(line);

  // Subtle vertical drop-ticks at endpoints for spatial clarity
  const tickLen = 0.045;
  const tickGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(s.x, s.y - tickLen, s.z),
    new THREE.Vector3(s.x, s.y + tickLen, s.z),
    new THREE.Vector3(e.x, e.y - tickLen, e.z),
    new THREE.Vector3(e.x, e.y + tickLen, e.z),
  ]);
  const tickMat = new THREE.LineBasicMaterial({
    color: colorHex,
    depthTest: false,
    transparent: true,
    opacity: 0.7,
  });
  const ticks = new THREE.LineSegments(tickGeo, tickMat);
  ticks.renderOrder = 998;
  ticks.userData.disposeMaterial = true;
  g.add(ticks);

  const dotGeo = new THREE.SphereGeometry(0.016, 14, 12);
  const dotMat = new THREE.MeshBasicMaterial({ color: colorHex, depthTest: false });
  const dot1 = new THREE.Mesh(dotGeo, dotMat);
  dot1.position.copy(s);
  dot1.renderOrder = 999;
  dot1.userData.disposeMaterial = true;
  const dot2 = new THREE.Mesh(dotGeo.clone(), dotMat.clone());
  dot2.position.copy(e);
  dot2.renderOrder = 999;
  dot2.userData.disposeMaterial = true;
  g.add(dot1, dot2);

  return g;
}

function snapWorldPointToPartMm(
  hitWorldM: THREE.Vector3,
  part: FurniturePart | undefined,
  snapMm: number
): [number, number, number] {
  const rawX = hitWorldM.x * M_TO_MM;
  const rawY = hitWorldM.y * M_TO_MM;
  const rawZ = hitWorldM.z * M_TO_MM;

  if (part) {
    const box = getPartWorldBox(part);
    const midX = (box.minX + box.maxX) / 2;
    const midY = (box.minY + box.maxY) / 2;
    const midZ = (box.minZ + box.maxZ) / 2;
    const candidates: [number, number, number][] = [
      // 8 corners
      [box.minX, box.minY, box.minZ],
      [box.maxX, box.minY, box.minZ],
      [box.minX, box.maxY, box.minZ],
      [box.maxX, box.maxY, box.minZ],
      [box.minX, box.minY, box.maxZ],
      [box.maxX, box.minY, box.maxZ],
      [box.minX, box.maxY, box.maxZ],
      [box.maxX, box.maxY, box.maxZ],
      // 6 face centers
      [midX, midY, box.minZ],
      [midX, midY, box.maxZ],
      [box.minX, midY, midZ],
      [box.maxX, midY, midZ],
      [midX, box.minY, midZ],
      [midX, box.maxY, midZ],
    ];
    let best: [number, number, number] | null = null;
    let bestDist = 26;
    for (const c of candidates) {
      const d = Math.hypot(c[0] - rawX, c[1] - rawY, c[2] - rawZ);
      if (d < bestDist) {
        bestDist = d;
        best = c;
      }
    }
    if (best) {
      return [Math.round(best[0]), Math.round(best[1]), Math.round(best[2])];
    }
  }
  const step = snapMm > 0 ? Math.min(5, snapMm) : 1;
  return [
    Math.round(rawX / step) * step,
    Math.max(0, Math.round(rawY / step) * step),
    Math.round(rawZ / step) * step,
  ];
}

function disposeObjectTree(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments || child instanceof THREE.Line) {
      child.geometry?.dispose();
      // Only dispose non-pooled materials (outlines, handles, fasteners, guides)
      if (child.userData.disposeMaterial) {
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else {
          child.material?.dispose();
        }
      }
    } else if (child instanceof THREE.Sprite) {
      if (child.userData.disposeTexture instanceof THREE.Texture) {
        child.userData.disposeTexture.dispose();
      }
      if (child.userData.disposeMaterial) {
        child.material.dispose();
      }
    }
  });
}

const LIGHTING_CONFIGS: Record<
  StudioLighting,
  {
    bg: string;
    keyColor: string;
    keyIntensity: number;
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    rimColor: string;
    rimIntensity: number;
    exposure: number;
    softboxIntensity: number;
    envIntensity: number;
  }
> = {
  daylight: {
    bg: '#EAECEF',
    keyColor: '#FFF7E8',
    keyIntensity: 2.35,
    hemiSky: '#E6EFFA',
    hemiGround: '#C8BFB4',
    hemiIntensity: 0.72,
    rimColor: '#D6E6FF',
    rimIntensity: 0.58,
    exposure: 1.03,
    softboxIntensity: 0.3,
    envIntensity: 0.82,
  },
  studio: {
    bg: '#F3F4F6',
    keyColor: '#FFFFFF',
    keyIntensity: 2.5,
    hemiSky: '#F4F8FF',
    hemiGround: '#D2D6DC',
    hemiIntensity: 0.82,
    rimColor: '#EAF2FF',
    rimIntensity: 0.72,
    exposure: 1.06,
    softboxIntensity: 0.75,
    envIntensity: 0.92,
  },
  warm: {
    bg: '#E7E2DA',
    keyColor: '#FFE2B5',
    keyIntensity: 2.4,
    hemiSky: '#F3E5CE',
    hemiGround: '#AE9A82',
    hemiIntensity: 0.68,
    rimColor: '#C8D8F0',
    rimIntensity: 0.52,
    exposure: 1.02,
    softboxIntensity: 0.45,
    envIntensity: 0.78,
  },
  photoreal: {
    bg: '#ECEEF2',
    keyColor: '#FFF9EE',
    keyIntensity: 2.7,
    hemiSky: '#EEF4FF',
    hemiGround: '#C5BEB6',
    hemiIntensity: 0.64,
    rimColor: '#D8E8FF',
    rimIntensity: 0.86,
    exposure: 1.07,
    softboxIntensity: 1.85,
    envIntensity: 1.05,
  },
};

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(
  function Viewport3D(props, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const measureOverlayRef = useRef<HTMLDivElement | null>(null);
    const [contextLost, setContextLost] = useState(false);
    const [screwHoverHud, setScrewHoverHud] = useState<{
      x: number;
      y: number;
      feedback: ScrewHoverFeedback;
    } | null>(null);
    const [resizeHud, setResizeHud] = useState<{
      x: number;
      y: number;
      label: string;
    } | null>(null);
    const [rotateHud, setRotateHud] = useState<{
      title: string;
      angles: string;
    } | null>(null);
    const [activeClearanceEdit, setActiveClearanceEdit] = useState<{
      x: number;
      y: number;
      partId: string;
      guide: ClearanceGuide;
      value: string;
    } | null>(null);

    // Close inline 3D clearance editor whenever selection, tool or exploded view changes
    useEffect(() => {
      setActiveClearanceEdit(null);
    }, [props.selectedPartId, props.tool, props.explodedAmount]);

    // Keep latest props in a ref so Three.js event listeners never go stale
    const propsRef = useRef(props);
    propsRef.current = props;

    // Scene runtime refs
    const runtimeRef = useRef<{
      renderer: THREE.WebGLRenderer;
      scene: THREE.Scene;
      camera: THREE.PerspectiveCamera;
      orbit: OrbitControls;
      transform: TransformControls;
      groupPivotProxy: THREE.Group;
      activeGizmoMemberIds: Set<string>;
      materials: MaterialLibrary;
      partsRoot: THREE.Group;
      roomRoot: THREE.Group;
      guidesRoot: THREE.Group;
      jointZonesRoot: THREE.Group;
      ledRoot: THREE.Group;
      resizeHandlesRoot: THREE.Group;
      measureRoot: THREE.Group;
      measureLiveRoot: THREE.Group;
      partNodes: Map<string, THREE.Group>;
      partBasePos: Map<string, THREE.Vector3>;
      partBaseQuat: Map<string, THREE.Quaternion>;
      partExplodeDir: Map<string, THREE.Vector3>;
      partOpenMeta: Map<
        string,
        | { kind: 'door'; axis: 'x' | 'y'; localPivot: THREE.Vector3; maxAngleRad: number; throwZ?: number }
        | { kind: 'drawer'; slideDistM: number }
        | { kind: 'sliding'; slideDistM: number }
      >;
      hardwareRuntime: CabinetHardwareRuntime | null;
      screwPreview: THREE.Group;
      screwPreviewRingMat: THREE.MeshBasicMaterial;
      screwPreviewPinMat: THREE.MeshBasicMaterial;
      keyLight: THREE.DirectionalLight;
      hemiLight: THREE.HemisphereLight;
      rimLight: THREE.DirectionalLight;
      softboxLights: THREE.RectAreaLight[];
      contactShadow: THREE.Mesh;
      isSoftwareGl: boolean;
      clearPendingMeasure: () => void;
      requestRender: () => void;
      startCameraTransition: (pos: THREE.Vector3, target: THREE.Vector3) => void;
      setExplodedTarget: (v: number) => void;
      setOpenTarget: (v: number) => void;
      applyPartAnimations: () => void;
      isDraggingGizmo: boolean;
    } | null>(null);

    // Expose imperative camera & snapshot API
    useImperativeHandle(ref, () => ({
      setCameraPreset(preset: CameraPreset) {
        const rt = runtimeRef.current;
        if (!rt) return;
        const box = new THREE.Box3();
        rt.partsRoot.updateWorldMatrix(true, true);
        if (rt.partsRoot.children.length > 0) {
          box.setFromObject(rt.partsRoot);
        } else {
          box.set(new THREE.Vector3(-0.6, 0, -0.4), new THREE.Vector3(0.6, 1.2, 0.4));
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const radius = Math.max(0.85, size.length() * 0.55);
        const dist = radius * 2.15;

        let pos: THREE.Vector3;
        switch (preset) {
          case 'front':
            pos = new THREE.Vector3(center.x, center.y + 0.05, center.z + dist);
            break;
          case 'back':
            pos = new THREE.Vector3(center.x, center.y + 0.05, center.z - dist);
            break;
          case 'left':
            pos = new THREE.Vector3(center.x - dist, center.y + 0.05, center.z);
            break;
          case 'right':
          case 'side':
            pos = new THREE.Vector3(center.x + dist, center.y + 0.05, center.z);
            break;
          case 'top':
            pos = new THREE.Vector3(center.x, center.y + dist * 1.15, center.z + 0.08);
            break;
          case 'iso':
          default:
            pos = new THREE.Vector3(
              center.x + dist * 0.68,
              center.y + dist * 0.44,
              center.z + dist * 0.72
            );
            break;
        }
        rt.startCameraTransition(pos, center);
      },
      focusAll() {
        const rt = runtimeRef.current;
        if (!rt) return;
        const box = new THREE.Box3();
        rt.partsRoot.updateWorldMatrix(true, true);
        if (rt.partsRoot.children.length > 0) {
          box.setFromObject(rt.partsRoot);
        } else {
          box.set(new THREE.Vector3(-0.6, 0, -0.4), new THREE.Vector3(0.6, 1.2, 0.4));
        }
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(1.8, size.length() * 1.2);
        rt.startCameraTransition(
          new THREE.Vector3(
            center.x + dist * 0.68,
            center.y + dist * 0.42,
            center.z + dist * 0.74
          ),
          center
        );
      },
      focusPart(partId: string) {
        const rt = runtimeRef.current;
        if (!rt) return;
        const node = rt.partNodes.get(partId);
        if (!node) return;
        node.updateWorldMatrix(true, true);
        const box = new THREE.Box3().setFromObject(node);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const dist = Math.max(0.85, size.length() * 1.65);
        const dir = rt.camera.position.clone().sub(rt.orbit.target);
        if (dir.lengthSq() < 0.01) dir.set(0.68, 0.42, 0.74);
        dir.normalize();
        rt.startCameraTransition(center.clone().addScaledVector(dir, dist), center);
      },
      captureSnapshot() {
        const rt = runtimeRef.current;
        if (!rt) return null;
        // Hide gizmo, guides, joint zones, resize handles & previews cleanly for studio photo export
        const helper = (rt.transform as unknown as { getHelper?: () => THREE.Object3D }).getHelper?.();
        const prevHelperVis = helper ? helper.visible : true;
        const prevPreviewVis = rt.screwPreview.visible;
        const prevGuidesVis = rt.guidesRoot.visible;
        const prevJointsVis = rt.jointZonesRoot.visible;
        const prevResizeVis = rt.resizeHandlesRoot.visible;
        const prevMeasureLiveVis = rt.measureLiveRoot.visible;
        if (helper) helper.visible = false;
        rt.screwPreview.visible = false;
        rt.guidesRoot.visible = false;
        rt.jointZonesRoot.visible = false;
        rt.resizeHandlesRoot.visible = false;
        rt.measureLiveRoot.visible = false;

        rt.renderer.render(rt.scene, rt.camera);
        const dataUrl = rt.renderer.domElement.toDataURL('image/png');

        if (helper) helper.visible = prevHelperVis;
        rt.screwPreview.visible = prevPreviewVis;
        rt.guidesRoot.visible = prevGuidesVis;
        rt.jointZonesRoot.visible = prevJointsVis;
        rt.resizeHandlesRoot.visible = prevResizeVis;
        rt.measureLiveRoot.visible = prevMeasureLiveVis;
        rt.requestRender();
        return dataUrl;
      },
    }));

    // Mount Three.js engine once
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = detectSoftwareGl();

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
        preserveDrawingBuffer: false,
      });
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = LIGHTING_CONFIGS.daylight.exposure;
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.style.display = 'block';
      renderer.domElement.style.width = '100%';
      renderer.domElement.style.height = '100%';
      container.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const initialLight = LIGHTING_CONFIGS[propsRef.current.lighting];
      scene.background = new THREE.Color(initialLight.bg);
      scene.fog = new THREE.Fog(initialLight.bg, 7.5, 22);

      // Studio PBR Environment Reflections (on all devices)
      const pmrem = new THREE.PMREMGenerator(renderer);
      const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environment = envTex;
      scene.environmentIntensity = initialLight.envIntensity;
      pmrem.dispose();

      const isTouchDevice =
        (typeof window !== 'undefined' &&
          window.matchMedia?.('(pointer: coarse)').matches) ||
        (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;
      const isPortrait = height > width;
      const camera = new THREE.PerspectiveCamera(isPortrait ? 48 : 42, width / height, 0.05, 60);
      camera.position.set(
        isPortrait ? 2.65 : 2.15,
        isPortrait ? 1.85 : 1.65,
        isPortrait ? 3.15 : 2.35
      );

      const orbit = new OrbitControls(camera, renderer.domElement);
      orbit.target.set(0, 0.85, 0);
      orbit.enableDamping = !isSoftwareGl;
      orbit.dampingFactor = 0.08;
      orbit.rotateSpeed = isTouchDevice ? 0.82 : 1.0;
      orbit.zoomSpeed = isTouchDevice ? 1.1 : 1.0;
      orbit.panSpeed = isTouchDevice ? 0.85 : 1.0;
      orbit.touches = {
        ONE: THREE.TOUCH.ROTATE,
        TWO: THREE.TOUCH.DOLLY_PAN,
      };
      orbit.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.PAN,
        RIGHT: THREE.MOUSE.PAN,
      };
      orbit.maxPolarAngle = Math.PI * 0.495;
      orbit.minDistance = 0.5;
      orbit.maxDistance = 12;
      orbit.screenSpacePanning = true;
      orbit.update();

      // 3-Point Studio Lighting Rig
      const hemiLight = new THREE.HemisphereLight(
        initialLight.hemiSky,
        initialLight.hemiGround,
        initialLight.hemiIntensity
      );
      scene.add(hemiLight);

      const keyLight = new THREE.DirectionalLight(
        initialLight.keyColor,
        initialLight.keyIntensity
      );
      keyLight.position.set(3.4, 5.1, 3.8);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.near = 0.4;
      keyLight.shadow.camera.far = 16;
      const d = 2.2;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.00025;
      keyLight.shadow.normalBias = 0.008;
      keyLight.shadow.radius = 2.6;
      scene.add(keyLight);
      scene.add(keyLight.target);

      const rimLight = new THREE.DirectionalLight(
        initialLight.rimColor,
        initialLight.rimIntensity
      );
      rimLight.position.set(-3.5, 2.8, -3.2);
      scene.add(rimLight);

      // Studio Overhead RectAreaLight Softboxes (GPU-guarded: strictly skipped on software WebGL!)
      const softboxLights: THREE.RectAreaLight[] = [];
      if (!isSoftwareGl) {
        RectAreaLightUniformsLib.init();
        const overheadSoftbox = new THREE.RectAreaLight(
          '#FFFFFF',
          initialLight.softboxIntensity,
          2.6,
          1.4
        );
        overheadSoftbox.position.set(0.4, 3.1, 1.2);
        overheadSoftbox.lookAt(0, 0.7, 0);
        scene.add(overheadSoftbox);

        const sideSoftbox = new THREE.RectAreaLight(
          '#FFF5E6',
          initialLight.softboxIntensity * 0.65,
          1.6,
          2.2
        );
        sideSoftbox.position.set(-2.6, 1.5, 1.8);
        sideSoftbox.lookAt(0, 0.8, 0);
        scene.add(sideSoftbox);

        softboxLights.push(overheadSoftbox, sideSoftbox);
      }

      // Floor + Shadow Catcher + Subtle Metric Grid (100mm minor / 500mm major)
      const floorGeo = new THREE.PlaneGeometry(36, 36);
      const floorMat = new THREE.ShadowMaterial({ opacity: 0.18 });
      const floorMesh = new THREE.Mesh(floorGeo, floorMat);
      floorMesh.rotation.x = -Math.PI / 2;
      floorMesh.position.y = -0.001;
      floorMesh.receiveShadow = true;
      scene.add(floorMesh);

      const contactShadowTex = createContactShadowTexture();
      const contactShadowMat = new THREE.MeshBasicMaterial({
        map: contactShadowTex,
        transparent: true,
        depthWrite: false,
        opacity: 0.75,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      });
      const contactShadow = new THREE.Mesh(
        new THREE.PlaneGeometry(3.2, 2.4),
        contactShadowMat
      );
      contactShadow.rotation.x = -Math.PI / 2;
      contactShadow.position.y = 0.0005;
      scene.add(contactShadow);

      // Metric workshop grid: 6m x 6m with 60 divisions (100mm per cell)
      const gridHelper = new THREE.GridHelper(6, 60, '#B5BCC6', '#D5DAE1');
      gridHelper.position.y = 0.001;
      const gridMats = Array.isArray(gridHelper.material)
        ? gridHelper.material
        : [gridHelper.material];
      gridMats.forEach((m) => {
        m.transparent = true;
        m.opacity = 0.65;
        m.polygonOffset = true;
        m.polygonOffsetFactor = -1;
        m.polygonOffsetUnits = -1;
      });
      scene.add(gridHelper);

      const partsRoot = new THREE.Group();
      scene.add(partsRoot);

      const roomRoot = new THREE.Group();
      scene.add(roomRoot);

      const guidesRoot = new THREE.Group();
      scene.add(guidesRoot);

      const jointZonesRoot = new THREE.Group();
      scene.add(jointZonesRoot);

      const ledRoot = new THREE.Group();
      scene.add(ledRoot);

      const resizeHandlesRoot = new THREE.Group();
      scene.add(resizeHandlesRoot);

      const measureRoot = new THREE.Group();
      scene.add(measureRoot);

      const measureLiveRoot = new THREE.Group();
      scene.add(measureLiveRoot);

      // Screw placement hover preview marker (dynamically tinted Green=OK / Red=Invalid)
      const screwPreview = new THREE.Group();
      screwPreview.visible = false;
      const ringGeo = new THREE.RingGeometry(0.007, 0.012, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#10B981',
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.renderOrder = 999;
      const pinGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.036, 10);
      const pinMat = new THREE.MeshBasicMaterial({
        color: '#10B981',
        depthTest: false,
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.y = 0.018;
      pinMesh.renderOrder = 999;
      screwPreview.add(ringMesh, pinMesh);
      scene.add(screwPreview);

      // TransformControls for interactive Move / Rotate gizmo (larger touch handles on phones)
      const transform = new TransformControls(camera, renderer.domElement);
      transform.setSize(isTouchDevice ? 1.32 : 0.94);
      const transformHelper = (
        transform as unknown as { getHelper?: () => THREE.Object3D }
      ).getHelper
        ? (transform as unknown as { getHelper: () => THREE.Object3D }).getHelper()
        : (transform as unknown as THREE.Object3D);
      scene.add(transformHelper);

      // Shared pivot proxy so rotating or moving a whole cabinet/group transforms ALL panels as one rigid body
      const groupPivotProxy = new THREE.Group();
      groupPivotProxy.name = 'group_pivot_proxy';
      scene.add(groupPivotProxy);
      const activeGizmoMemberIds = new Set<string>();

      const materials = new MaterialLibrary(renderer, isSoftwareGl, () => {
        runtimeRef.current?.requestRender();
      });
      const partNodes = new Map<string, THREE.Group>();
      const partBasePos = new Map<string, THREE.Vector3>();
      const partExplodeDir = new Map<string, THREE.Vector3>();

      // Animation & On-demand Coalesced Render Scheduler
      let frameId = 0;
      let renderBusy = false;
      let renderDirty = false;
      let disposed = false;
      let lastFrameTime = performance.now();

      let camAnimActive = false;
      const camTargetPos = new THREE.Vector3();
      const camTargetLook = new THREE.Vector3();

      let explodedCurrent = propsRef.current.explodedAmount;
      let explodedTarget = propsRef.current.explodedAmount;
      let openCurrent = propsRef.current.openAmount;
      let openTarget = propsRef.current.openAmount;
      const partBaseQuat = new Map<string, THREE.Quaternion>();
      const partOpenMeta = new Map<
        string,
        | { kind: 'door'; axis: 'x' | 'y'; localPivot: THREE.Vector3; maxAngleRad: number; throwZ?: number }
        | { kind: 'drawer'; slideDistM: number }
        | { kind: 'sliding'; slideDistM: number }
      >();

      function afterDraw(cb: () => void) {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        if (typeof gl.fenceSync === 'function') {
          const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
          gl.flush();
          const poll = () => {
            if (disposed) {
              if (sync) gl.deleteSync(sync);
              return;
            }
            const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
            if (state === gl.UNSIGNALED) {
              frameId = window.setTimeout(poll, 5);
            } else {
              if (sync) gl.deleteSync(sync);
              frameId = window.setTimeout(cb, 80);
            }
          };
          frameId = window.setTimeout(poll, 5);
        } else {
          frameId = window.setTimeout(cb, 80);
        }
      }

      function applyPartAnimations() {
        const expAmt = explodedCurrent;
        const opnAmt = openCurrent;
        partNodes.forEach((node, id) => {
          const base = partBasePos.get(id);
          const baseQ = partBaseQuat.get(id);
          const dir = partExplodeDir.get(id);
          if (!base || !baseQ || !dir) return;
          // Do not override actively dragged gizmo object (or any member of an actively dragged cabinet/group)
          if (
            runtimeRef.current?.isDraggingGizmo &&
            (transform.object === node || activeGizmoMemberIds.has(id))
          ) {
            return;
          }
          _vec3A.copy(base).addScaledVector(dir, expAmt * 0.28);
          const meta = partOpenMeta.get(id);
          if (meta && opnAmt > 0.0005) {
            if (meta.kind === 'door') {
              const angle = meta.maxAngleRad * opnAmt;
              const localAxis = meta.axis === 'x' ? _vec3B.set(1, 0, 0) : _vec3B.copy(_upVec);
              const worldAxis = localAxis.applyQuaternion(baseQ).normalize();
              _quatA.setFromAxisAngle(worldAxis, angle);
              const worldPivot = _vec3C.copy(meta.localPivot).applyQuaternion(baseQ).add(_vec3A);
              node.position.copy(_vec3A).sub(worldPivot).applyQuaternion(_quatA).add(worldPivot);
              if (meta.throwZ) {
                const throwAmt = meta.throwZ * Math.sin(Math.min(Math.PI * 0.5, Math.abs(angle)));
                _vec3B.set(0, 0, 1).applyQuaternion(baseQ).normalize();
                node.position.addScaledVector(_vec3B, throwAmt);
              }
              node.quaternion.copy(_quatA).multiply(baseQ);
              return;
            } else if (meta.kind === 'sliding') {
              const slideAxis = _vec3B.set(1, 0, 0).applyQuaternion(baseQ).normalize();
              node.position.copy(_vec3A).addScaledVector(slideAxis, meta.slideDistM * opnAmt);
              node.quaternion.copy(baseQ);
              return;
            } else {
              const slideAxis = _vec3B.set(0, 0, 1).applyQuaternion(baseQ).normalize();
              node.position.copy(_vec3A).addScaledVector(slideAxis, meta.slideDistM * opnAmt);
              node.quaternion.copy(baseQ);
              return;
            }
          }
          node.position.copy(_vec3A);
          node.quaternion.copy(baseQ);
        });
        runtimeRef.current?.hardwareRuntime?.update(opnAmt, expAmt, partNodes);
      }

      function requestRender() {
        if (disposed) return;
        if (renderBusy) {
          renderDirty = true;
          return;
        }
        renderBusy = true;
        frameId = requestAnimationFrame(() => {
          if (disposed) return;
          renderDirty = false;
          const now = performance.now();
          const dt = Math.min(0.05, (now - lastFrameTime) / 1000);
          lastFrameTime = now;

          let needsMoreFrames = false;

          // Smooth camera preset damping
          if (camAnimActive) {
            const lambda = 9;
            camera.position.x = THREE.MathUtils.damp(camera.position.x, camTargetPos.x, lambda, dt);
            camera.position.y = THREE.MathUtils.damp(camera.position.y, camTargetPos.y, lambda, dt);
            camera.position.z = THREE.MathUtils.damp(camera.position.z, camTargetPos.z, lambda, dt);
            orbit.target.x = THREE.MathUtils.damp(orbit.target.x, camTargetLook.x, lambda, dt);
            orbit.target.y = THREE.MathUtils.damp(orbit.target.y, camTargetLook.y, lambda, dt);
            orbit.target.z = THREE.MathUtils.damp(orbit.target.z, camTargetLook.z, lambda, dt);

            if (
              camera.position.distanceToSquared(camTargetPos) < 0.0002 &&
              orbit.target.distanceToSquared(camTargetLook) < 0.0002
            ) {
              camera.position.copy(camTargetPos);
              orbit.target.copy(camTargetLook);
              camAnimActive = false;
            } else {
              needsMoreFrames = true;
            }
          }

          // Smooth exploded-view & open-doors/drawers damping
          let animChanged = false;
          if (Math.abs(explodedCurrent - explodedTarget) > 0.001) {
            explodedCurrent = isSoftwareGl
              ? explodedTarget
              : THREE.MathUtils.damp(explodedCurrent, explodedTarget, 10, dt);
            animChanged = true;
            if (Math.abs(explodedCurrent - explodedTarget) > 0.001) {
              needsMoreFrames = true;
            }
          }
          if (Math.abs(openCurrent - openTarget) > 0.001) {
            openCurrent = isSoftwareGl
              ? openTarget
              : THREE.MathUtils.damp(openCurrent, openTarget, 9, dt);
            animChanged = true;
            if (Math.abs(openCurrent - openTarget) > 0.001) {
              needsMoreFrames = true;
            }
          }
          if (animChanged) {
            applyPartAnimations();
          }

          const orbitMoved = orbit.update();
          if (orbitMoved && orbit.enableDamping) {
            needsMoreFrames = true;
          }

          renderer.render(scene, camera);
          syncMeasureOverlay();

          const done = () => {
            renderBusy = false;
            if (renderDirty || needsMoreFrames) {
              requestRender();
            }
          };

          if (isSoftwareGl) afterDraw(done);
          else done();
        });
      }

      const startCameraTransition = (pos: THREE.Vector3, target: THREE.Vector3) => {
        if (isSoftwareGl) {
          camera.position.copy(pos);
          orbit.target.copy(target);
          camAnimActive = false;
          orbit.update();
          requestRender();
        } else {
          camTargetPos.copy(pos);
          camTargetLook.copy(target);
          camAnimActive = true;
          requestRender();
        }
      };

      const setExplodedTarget = (v: number) => {
        explodedTarget = v;
        if (isSoftwareGl) {
          explodedCurrent = v;
          applyPartAnimations();
        }
        requestRender();
      };

      const setOpenTarget = (v: number) => {
        openTarget = v;
        if (isSoftwareGl) {
          openCurrent = v;
          applyPartAnimations();
        }
        requestRender();
      };

      let pendingMeasureStartMm: [number, number, number] | null = null;
      let pendingMeasureHoverMm: [number, number, number] | null = null;
      const _projVec = new THREE.Vector3();

      const projectMmToScreen = (ptMm: [number, number, number]) => {
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        _projVec.set(ptMm[0] * MM_TO_M, ptMm[1] * MM_TO_M, ptMm[2] * MM_TO_M);
        _projVec.project(camera);
        if (_projVec.z > 1 || _projVec.z < -1) return null;
        return {
          x: (_projVec.x * 0.5 + 0.5) * w,
          y: (-_projVec.y * 0.5 + 0.5) * h,
        };
      };

      const appendMeasureBadge = (
        layer: HTMLDivElement,
        x: number,
        y: number,
        mainText: string,
        subText: string | null,
        isLive: boolean
      ) => {
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        const clampedX = Math.min(Math.max(82, x), Math.max(82, w - 82));
        const clampedY = Math.min(Math.max(28, y), Math.max(28, h - 108));

        const el = document.createElement('div');
        el.style.position = 'absolute';
        el.style.left = `${clampedX}px`;
        el.style.top = `${clampedY}px`;
        el.style.transform = 'translate(-50%, -100%) translateY(-10px)';
        el.style.pointerEvents = 'none';
        el.className = isLive
          ? 'rounded-xl border-2 border-amber-400 bg-[#0B0D14]/95 px-2.5 py-1.5 text-center shadow-[0_8px_28px_rgba(0,0,0,0.65)] backdrop-blur-md'
          : 'rounded-xl border border-sky-400/90 bg-[#090D18]/92 px-2.5 py-1 text-center shadow-[0_6px_22px_rgba(0,0,0,0.58)] backdrop-blur-md';

        const main = document.createElement('div');
        main.className = isLive
          ? 'text-[14px] font-bold leading-tight text-amber-200 font-mono-num whitespace-nowrap'
          : 'text-[13px] font-bold leading-tight text-white font-mono-num whitespace-nowrap';
        main.textContent = mainText;
        el.appendChild(main);

        if (subText) {
          const sub = document.createElement('div');
          sub.className = isLive
            ? 'mt-0.5 text-[10px] font-semibold leading-tight text-amber-300/90 font-mono-num whitespace-nowrap'
            : 'mt-0.5 text-[10px] font-medium leading-tight text-sky-300 font-mono-num whitespace-nowrap';
          sub.textContent = subText;
          el.appendChild(sub);
        }

        layer.appendChild(el);
      };

      const syncMeasureOverlay = () => {
        const layer = measureOverlayRef.current;
        if (!layer) return;
        layer.replaceChildren();

        const segs = propsRef.current.measurements;
        for (const seg of segs) {
          const dx = Math.abs(Math.round(seg.endMm[0] - seg.startMm[0]));
          const dy = Math.abs(Math.round(seg.endMm[1] - seg.startMm[1]));
          const dz = Math.abs(Math.round(seg.endMm[2] - seg.startMm[2]));
          const total = Math.round(
            Math.hypot(
              seg.endMm[0] - seg.startMm[0],
              seg.endMm[1] - seg.startMm[1],
              seg.endMm[2] - seg.startMm[2]
            )
          );
          if (total <= 0) continue;
          const midMm: [number, number, number] = [
            (seg.startMm[0] + seg.endMm[0]) / 2,
            (seg.startMm[1] + seg.endMm[1]) / 2,
            (seg.startMm[2] + seg.endMm[2]) / 2,
          ];
          const scr = projectMmToScreen(midMm);
          if (!scr) continue;
          const cmStr = `${(total / 10).toFixed(1).replace('.', ',')} cm`;
          const axisParts: string[] = [];
          if (dx > 0) axisParts.push(`X:${dx}`);
          if (dy > 0) axisParts.push(`Y:${dy}`);
          if (dz > 0) axisParts.push(`Z:${dz}`);
          const sub =
            axisParts.length > 1 ? `${cmStr} · ${axisParts.join(' ')}` : cmStr;
          appendMeasureBadge(layer, scr.x, scr.y, formatMeasureDistanceMm(total), sub, false);
        }

        if (propsRef.current.tool === 'measure') {
          if (pendingMeasureStartMm) {
            const p1Scr = projectMmToScreen(pendingMeasureStartMm);
            if (p1Scr) {
              const tag = document.createElement('div');
              tag.style.position = 'absolute';
              tag.style.left = `${p1Scr.x}px`;
              tag.style.top = `${p1Scr.y}px`;
              tag.style.transform = 'translate(-50%, -140%)';
              tag.className =
                'rounded-md border border-amber-400 bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-zinc-950 font-mono-num shadow-lg';
              tag.textContent = 'P1';
              layer.appendChild(tag);
            }
          }

          if (pendingMeasureStartMm && pendingMeasureHoverMm) {
            const dx = Math.abs(Math.round(pendingMeasureHoverMm[0] - pendingMeasureStartMm[0]));
            const dy = Math.abs(Math.round(pendingMeasureHoverMm[1] - pendingMeasureStartMm[1]));
            const dz = Math.abs(Math.round(pendingMeasureHoverMm[2] - pendingMeasureStartMm[2]));
            const total = Math.round(
              Math.hypot(
                pendingMeasureHoverMm[0] - pendingMeasureStartMm[0],
                pendingMeasureHoverMm[1] - pendingMeasureStartMm[1],
                pendingMeasureHoverMm[2] - pendingMeasureStartMm[2]
              )
            );
            const midMm: [number, number, number] = [
              (pendingMeasureStartMm[0] + pendingMeasureHoverMm[0]) / 2,
              (pendingMeasureStartMm[1] + pendingMeasureHoverMm[1]) / 2,
              (pendingMeasureStartMm[2] + pendingMeasureHoverMm[2]) / 2,
            ];
            const scr = projectMmToScreen(midMm);
            if (scr && total > 0) {
              const cmStr = `${(total / 10).toFixed(1).replace('.', ',')} cm`;
              const sub = `${cmStr} · ΔX ${dx} · ΔY ${dy} · ΔZ ${dz}`;
              appendMeasureBadge(layer, scr.x, scr.y, formatMeasureDistanceMm(total), sub, true);
            }
          } else if (!pendingMeasureStartMm && pendingMeasureHoverMm) {
            const scr = projectMmToScreen(pendingMeasureHoverMm);
            if (scr) {
              const [hx, hy, hz] = pendingMeasureHoverMm;
              appendMeasureBadge(
                layer,
                scr.x,
                scr.y,
                'Kliknij punkt 1',
                `X:${Math.round(hx)} · Y:${Math.round(hy)} · Z:${Math.round(hz)} mm`,
                true
              );
            }
          }
        }
      };

      const pickMeasurePointMm = (clientX: number, clientY: number): [number, number, number] | null => {
        updateNdc(clientX, clientY);
        raycaster.setFromCamera(_pointerNdc, camera);
        const partMeshes: THREE.Object3D[] = [];
        partNodes.forEach((g) => {
          const m = g.getObjectByName('main_mesh');
          if (m) partMeshes.push(m);
        });
        const partHits = raycaster.intersectObjects(partMeshes, false);
        if (partHits.length > 0) {
          const { partId } = resolveHitIds(partHits[0].object);
          const hitPart = propsRef.current.parts.find((p) => p.id === partId);
          return snapWorldPointToPartMm(partHits[0].point, hitPart, propsRef.current.snapMm);
        }

        // Raycast room walls/floor/obstacles when present so users can measure room niches & walls accurately
        const roomMeshes: THREE.Object3D[] = [];
        roomRoot.traverse((obj) => {
          if ((obj as THREE.Mesh).isMesh && obj.visible) {
            roomMeshes.push(obj);
          }
        });
        if (roomMeshes.length > 0) {
          const roomHits = raycaster.intersectObjects(roomMeshes, false);
          if (roomHits.length > 0) {
            const hitPt = roomHits[0].point;
            const room = propsRef.current.room;
            const rawX = hitPt.x * M_TO_MM;
            const rawY = hitPt.y * M_TO_MM;
            const rawZ = hitPt.z * M_TO_MM;
            const step = propsRef.current.snapMm > 0 ? propsRef.current.snapMm : 1;
            const snapRoomVal = (val: number, targets: number[]) => {
              for (const t of targets) {
                if (Math.abs(val - t) <= 28) return Math.round(t);
              }
              return Math.round(val / step) * step;
            };
            const halfW = room ? room.widthMm / 2 : 0;
            const halfD = room ? room.depthMm / 2 : 0;
            const roomH = room ? room.heightMm : 0;
            return [
              room ? snapRoomVal(rawX, [-halfW, 0, halfW]) : Math.round(rawX / step) * step,
              room ? Math.max(0, snapRoomVal(rawY, [0, roomH])) : Math.max(0, Math.round(rawY / step) * step),
              room ? snapRoomVal(rawZ, [-halfD, 0, halfD]) : Math.round(rawZ / step) * step,
            ];
          }
        }

        if (raycaster.ray.intersectPlane(_floorPlane, _dragHit)) {
          return snapWorldPointToPartMm(_dragHit, undefined, propsRef.current.snapMm);
        }
        return null;
      };

      const clearPendingMeasure = () => {
        pendingMeasureStartMm = null;
        pendingMeasureHoverMm = null;
        disposeObjectTree(measureLiveRoot);
        measureLiveRoot.clear();
        requestRender();
      };

      runtimeRef.current = {
        renderer,
        scene,
        camera,
        orbit,
        transform,
        groupPivotProxy,
        activeGizmoMemberIds,
        materials,
        partsRoot,
        roomRoot,
        guidesRoot,
        jointZonesRoot,
        ledRoot,
        resizeHandlesRoot,
        measureRoot,
        measureLiveRoot,
        partNodes,
        partBasePos,
        partBaseQuat,
        partExplodeDir,
        partOpenMeta,
        hardwareRuntime: null,
        screwPreview,
        screwPreviewRingMat: ringMat,
        screwPreviewPinMat: pinMat,
        keyLight,
        hemiLight,
        rimLight,
        softboxLights,
        contactShadow,
        isSoftwareGl,
        clearPendingMeasure,
        requestRender,
        startCameraTransition,
        setExplodedTarget,
        setOpenTarget,
        applyPartAnimations,
        isDraggingGizmo: false,
      };

      // Cancel camera animation when user manually interacts
      orbit.addEventListener('start', () => {
        camAnimActive = false;
      });
      orbit.addEventListener('change', () => {
        requestRender();
      });

      // Gizmo dragging integration with live Magnetic Face-to-Face Snapping
      let applyingMagneticSnap = false;

      const computeSnappedTransformPos = (
        partId: string,
        rawPosMm: [number, number, number]
      ): [number, number, number] => {
        const snap = propsRef.current.snapMm;
        const roundSnap = (valMm: number) =>
          snap > 0 ? Math.round(valMm / snap) * snap : Math.round(valMm);

        if (propsRef.current.magneticSnap) {
          const movingPart = propsRef.current.parts.find((p) => p.id === partId);
          if (movingPart) {
            const mag = snapPartToNeighbors(
              movingPart,
              rawPosMm,
              propsRef.current.parts,
              26
            );
            return [
              mag.snappedAxes.x ? mag.position[0] : roundSnap(mag.position[0]),
              mag.snappedAxes.y ? mag.position[1] : Math.max(10, roundSnap(mag.position[1])),
              mag.snappedAxes.z ? mag.position[2] : roundSnap(mag.position[2]),
            ];
          }
        }
        return [
          roundSnap(rawPosMm[0]),
          Math.max(10, roundSnap(rawPosMm[1])),
          roundSnap(rawPosMm[2]),
        ];
      };

      const normalizeCleanDeg = (rad: number): number => {
        let deg = THREE.MathUtils.radToDeg(rad);
        deg = ((deg % 360) + 360) % 360;
        if (deg > 180) deg -= 360;
        const rounded = Math.round(deg * 10) / 10;
        return Math.abs(rounded - Math.round(rounded)) < 0.08 ? Math.round(rounded) : rounded;
      };

      const formatSignedDeg = (deg: number): string => {
        const r = Math.round(deg);
        return `${r > 0 ? '+' : ''}${r}°`;
      };

      let groupDragStart: {
        pivotStartPos: THREE.Vector3;
        pivotStartQuatInv: THREE.Quaternion;
        members: Array<{
          id: string;
          node: THREE.Group;
          startPos: THREE.Vector3;
          startQuat: THREE.Quaternion;
        }>;
      } | null = null;
      const _groupDeltaPos = new THREE.Vector3();
      const _groupDeltaQuat = new THREE.Quaternion();
      const _groupRelPos = new THREE.Vector3();
      const _groupTempEuler = new THREE.Euler(0, 0, 0, 'XYZ');

      const syncGroupMembersFromProxy = () => {
        if (!groupDragStart) return;
        _groupDeltaPos.copy(groupPivotProxy.position).sub(groupDragStart.pivotStartPos);
        _groupDeltaQuat.copy(groupPivotProxy.quaternion).multiply(groupDragStart.pivotStartQuatInv);
        for (const m of groupDragStart.members) {
          _groupRelPos.copy(m.startPos).sub(groupDragStart.pivotStartPos);
          _groupRelPos.applyQuaternion(_groupDeltaQuat);
          m.node.position
            .copy(groupDragStart.pivotStartPos)
            .add(_groupRelPos)
            .add(_groupDeltaPos);
          m.node.quaternion.copy(_groupDeltaQuat).multiply(m.startQuat);
          m.node.rotation.setFromQuaternion(m.node.quaternion, 'XYZ');
        }
      };

      transform.addEventListener('dragging-changed', (ev) => {
        const dragging = Boolean((ev as { value?: unknown }).value);
        if (runtimeRef.current) {
          runtimeRef.current.isDraggingGizmo = dragging;
        }
        orbit.enabled = !dragging;

        if (dragging && transform.object === groupPivotProxy) {
          const memberIds = (groupPivotProxy.userData.memberIds as string[] | undefined) ?? [];
          const members: Array<{
            id: string;
            node: THREE.Group;
            startPos: THREE.Vector3;
            startQuat: THREE.Quaternion;
          }> = [];
          for (const id of memberIds) {
            const node = partNodes.get(id);
            if (node) {
              members.push({
                id,
                node,
                startPos: node.position.clone(),
                startQuat: node.quaternion.clone(),
              });
            }
          }
          groupDragStart = {
            pivotStartPos: groupPivotProxy.position.clone(),
            pivotStartQuatInv: groupPivotProxy.quaternion.clone().invert(),
            members,
          };
        }

        if (!dragging) {
          setRotateHud(null);
          if (transform.object === groupPivotProxy && groupDragStart) {
            syncGroupMembersFromProxy();
            const isTranslate = transform.mode === 'translate';
            const snap = propsRef.current.snapMm;
            const snapDelta = (vMm: number) =>
              snap > 0 ? Math.round(vMm / snap) * snap : Math.round(vMm);
            let snappedDxMm = _groupDeltaPos.x * M_TO_MM;
            let snappedDyMm = _groupDeltaPos.y * M_TO_MM;
            let snappedDzMm = _groupDeltaPos.z * M_TO_MM;
            if (isTranslate) {
              snappedDxMm = snapDelta(snappedDxMm);
              snappedDyMm = snapDelta(snappedDyMm);
              snappedDzMm = snapDelta(snappedDzMm);
            }

            const rawUpdates = groupDragStart.members.map((m) => {
              const orig = propsRef.current.parts.find((p) => p.id === m.id);
              const posMm: [number, number, number] = isTranslate && orig
                ? [
                    Math.round((orig.position[0] + snappedDxMm) * 10) / 10,
                    Math.round((orig.position[1] + snappedDyMm) * 10) / 10,
                    Math.round((orig.position[2] + snappedDzMm) * 10) / 10,
                  ]
                : [
                    Math.round(m.node.position.x * M_TO_MM * 10) / 10,
                    Math.round(m.node.position.y * M_TO_MM * 10) / 10,
                    Math.round(m.node.position.z * M_TO_MM * 10) / 10,
                  ];
              _groupTempEuler.setFromQuaternion(m.node.quaternion, 'XYZ');
              const rotDeg: [number, number, number] = isTranslate && orig
                ? orig.rotation
                : [
                    normalizeCleanDeg(_groupTempEuler.x),
                    normalizeCleanDeg(_groupTempEuler.y),
                    normalizeCleanDeg(_groupTempEuler.z),
                  ];
              return { id: m.id, position: posMm, rotation: rotDeg };
            });

            // Floor safety: prevent any rotated/moved cabinet or group from sinking below Y = 0
            let minGroupY = Infinity;
            for (const u of rawUpdates) {
              const orig = propsRef.current.parts.find((p) => p.id === u.id);
              if (!orig) continue;
              const box = getPartWorldBox({
                ...orig,
                position: u.position,
                rotation: u.rotation,
              });
              minGroupY = Math.min(minGroupY, box.minY);
            }
            const floorLift = Number.isFinite(minGroupY) && minGroupY < 0 ? -minGroupY : 0;
            const finalUpdates =
              floorLift > 0
                ? rawUpdates.map((u) => ({
                    ...u,
                    position: [
                      u.position[0],
                      Math.round((u.position[1] + floorLift) * 10) / 10,
                      u.position[2],
                    ] as [number, number, number],
                  }))
                : rawUpdates;

            groupDragStart = null;
            if (propsRef.current.onBatchTransformParts) {
              propsRef.current.onBatchTransformParts(finalUpdates);
            } else if (finalUpdates.length > 0) {
              const first = finalUpdates[0];
              propsRef.current.onTransformPart(first.id, first.position, first.rotation);
            }
          } else if (transform.object) {
            const partId = transform.object.userData.partId as string | undefined;
            if (partId) {
              const rawPosMm: [number, number, number] = [
                transform.object.position.x * M_TO_MM,
                transform.object.position.y * M_TO_MM,
                transform.object.position.z * M_TO_MM,
              ];
              const rot: [number, number, number] = [
                normalizeCleanDeg(transform.object.rotation.x),
                normalizeCleanDeg(transform.object.rotation.y),
                normalizeCleanDeg(transform.object.rotation.z),
              ];
              let pos = computeSnappedTransformPos(partId, rawPosMm);
              const orig = propsRef.current.parts.find((p) => p.id === partId);
              if (orig) {
                const box = getPartWorldBox({ ...orig, position: pos, rotation: rot });
                if (box.minY < 0) {
                  pos = [pos[0], Math.round((pos[1] - box.minY) * 10) / 10, pos[2]];
                }
              }
              propsRef.current.onTransformPart(partId, pos, rot);
            }
          }
        }
        requestRender();
      });

      transform.addEventListener('change', () => {
        if (runtimeRef.current?.isDraggingGizmo && transform.object === groupPivotProxy && groupDragStart) {
          syncGroupMembersFromProxy();
          if (transform.mode === 'rotate') {
            _groupTempEuler.setFromQuaternion(_groupDeltaQuat, 'XYZ');
            const dx = THREE.MathUtils.radToDeg(_groupTempEuler.x);
            const dy = THREE.MathUtils.radToDeg(_groupTempEuler.y);
            const dz = THREE.MathUtils.radToDeg(_groupTempEuler.z);
            const parts: string[] = [];
            if (Math.abs(dy) >= 0.5 || (Math.abs(dx) < 0.5 && Math.abs(dz) < 0.5)) {
              parts.push(`Y: ${formatSignedDeg(dy)}`);
            }
            if (Math.abs(dx) >= 0.5) parts.push(`X: ${formatSignedDeg(dx)}`);
            if (Math.abs(dz) >= 0.5) parts.push(`Z: ${formatSignedDeg(dz)}`);
            setRotateHud({
              title: propsRef.current.isParametricCabinetSelected
                ? 'Obrót całej szafki'
                : `Obrót grupy (${groupDragStart.members.length} elem.)`,
              angles: parts.join(' · '),
            });
          }
          requestRender();
          return;
        }

        if (
          runtimeRef.current?.isDraggingGizmo &&
          transform.object &&
          transform.mode === 'rotate'
        ) {
          const rx = Math.round(normalizeCleanDeg(transform.object.rotation.x));
          const ry = Math.round(normalizeCleanDeg(transform.object.rotation.y));
          const rz = Math.round(normalizeCleanDeg(transform.object.rotation.z));
          setRotateHud({
            title: 'Obrót elementu',
            angles: `X: ${rx}° · Y: ${ry}° · Z: ${rz}°`,
          });
        }

        if (
          !applyingMagneticSnap &&
          runtimeRef.current?.isDraggingGizmo &&
          transform.object &&
          transform.mode === 'translate' &&
          propsRef.current.magneticSnap
        ) {
          const partId = transform.object.userData.partId as string | undefined;
          if (partId) {
            const movingPart = propsRef.current.parts.find((p) => p.id === partId);
            if (movingPart) {
              const rawPosMm: [number, number, number] = [
                transform.object.position.x * M_TO_MM,
                transform.object.position.y * M_TO_MM,
                transform.object.position.z * M_TO_MM,
              ];
              const mag = snapPartToNeighbors(
                movingPart,
                rawPosMm,
                propsRef.current.parts,
                26
              );
              if (mag.snappedAxes.x || mag.snappedAxes.y || mag.snappedAxes.z) {
                applyingMagneticSnap = true;
                if (mag.snappedAxes.x) transform.object.position.x = mag.position[0] * MM_TO_M;
                if (mag.snappedAxes.y) transform.object.position.y = mag.position[1] * MM_TO_M;
                if (mag.snappedAxes.z) transform.object.position.z = mag.position[2] * MM_TO_M;
                applyingMagneticSnap = false;
              }
            }
          }
        }
        requestRender();
      });

      // Pointer / Touch Picking, Direct Board Drag (+Shift Y, +Alt Clone),
      // Right-Click Context Menu, Double-Click Focus & Live Green/Red Screw Placement
      const raycaster = new THREE.Raycaster();
      const activePointers = new Set<number>();
      let gestureWasMultiTouch = false;
      let downX = 0;
      let downY = 0;
      let downTime = 0;
      let downButton = 0;
      let lastMoveRaycast = 0;

      // Interactive 3D Face Resize Drag State (tool === 'resize')
      let resizeDragState: {
        partId: string;
        node: THREE.Group;
        handleMesh: THREE.Mesh;
        axis: 'x' | 'y' | 'z';
        sign: 1 | -1;
        origWidth: number;
        origHeight: number;
        origDepth: number;
        origPosMm: [number, number, number];
        worldAxisDir: THREE.Vector3;
        dragPlane: THREE.Plane;
        startHitPoint: THREE.Vector3;
        handleStartPos: THREE.Vector3;
        liveDims: { width: number; height: number; depth: number };
        livePosMm: [number, number, number];
        moved: boolean;
      } | null = null;
      const _floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

      // Direct mouse drag state for moving selected boards without hunting thin gizmo arrows
      let directDragCandidate: {
        partId: string;
        node: THREE.Group;
        startWorldPos: THREE.Vector3;
        hitPoint: THREE.Vector3;
        planeXZ: THREE.Plane;
        planeY: THREE.Plane;
        offsetXZ: THREE.Vector3;
        offsetY: number;
        cloneOnDrop: boolean;
        active: boolean;
      } | null = null;
      const _dragHit = new THREE.Vector3();

      const updateNdc = (clientX: number, clientY: number) => {
        const rect = renderer.domElement.getBoundingClientRect();
        _pointerNdc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        _pointerNdc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      };

      const collectRaycastTargets = () => {
        const targets: THREE.Object3D[] = [];
        partNodes.forEach((group) => {
          group.children.forEach((ch) => {
            if (ch.userData.raycastKind === 'part_mesh' || ch.userData.raycastKind === 'fastener') {
              targets.push(ch);
            }
          });
        });
        return targets;
      };

      const resolveHitIds = (hitObj: THREE.Object3D) => {
        let obj: THREE.Object3D | null = hitObj;
        let fastenerId: string | null = null;
        let partId: string | null = null;
        while (obj) {
          if (!fastenerId && obj.userData.fastenerId) {
            fastenerId = obj.userData.fastenerId;
          }
          if (!partId && obj.userData.partId) {
            partId = obj.userData.partId;
          }
          obj = obj.parent;
        }
        return { fastenerId, partId };
      };

      const onPointerDown = (e: PointerEvent) => {
        downButton = e.button;
        downX = e.clientX;
        downY = e.clientY;
        downTime = performance.now();

        // Dismiss open context menu on any canvas interaction
        propsRef.current.onContextMenu(null);

        if (e.button === 2 && e.pointerType === 'mouse') {
          return;
        }
        if (e.button !== 0 && e.pointerType === 'mouse') return;

        activePointers.add(e.pointerId);
        if (activePointers.size > 1) {
          gestureWasMultiTouch = true;
          screwPreview.visible = false;
          directDragCandidate = null;
          resizeDragState = null;
          setResizeHud(null);
          return;
        }
        gestureWasMultiTouch = false;

        // 3D Face Resize Handle Drag (works on desktop & touch)
        if (
          propsRef.current.tool === 'resize' &&
          propsRef.current.explodedAmount < 0.01 &&
          resizeHandlesRoot.children.length > 0
        ) {
          updateNdc(e.clientX, e.clientY);
          raycaster.setFromCamera(_pointerNdc, camera);
          const handleHits = raycaster.intersectObjects(resizeHandlesRoot.children, true);
          if (handleHits.length > 0) {
            let hitObj: THREE.Object3D | null = handleHits[0].object;
            while (hitObj && !hitObj.userData.resizeHandle) hitObj = hitObj.parent;
            const meta = hitObj?.userData.resizeHandle as
              | { partId: string; axis: 'x' | 'y' | 'z'; sign: 1 | -1 }
              | undefined;
            if (meta && hitObj instanceof THREE.Mesh) {
              const part = propsRef.current.parts.find((p) => p.id === meta.partId);
              const node = partNodes.get(meta.partId);
              if (part && node) {
                const quat = getPartQuaternion(part);
                const localAxis = new THREE.Vector3(
                  meta.axis === 'x' ? meta.sign : 0,
                  meta.axis === 'y' ? meta.sign : 0,
                  meta.axis === 'z' ? meta.sign : 0
                );
                const worldAxisDir = localAxis.applyQuaternion(quat).normalize();
                // Build a drag plane containing worldAxisDir and facing the camera
                const camDir = new THREE.Vector3();
                camera.getWorldDirection(camDir);
                const planeTan = new THREE.Vector3().crossVectors(worldAxisDir, camDir);
                if (planeTan.lengthSq() < 0.001) {
                  planeTan.set(0, 1, 0).cross(worldAxisDir);
                }
                const planeNormal = new THREE.Vector3()
                  .crossVectors(planeTan, worldAxisDir)
                  .normalize();
                const startHitPoint = handleHits[0].point.clone();
                const dragPlane = new THREE.Plane().setFromNormalAndCoplanarPoint(
                  planeNormal,
                  startHitPoint
                );
                resizeDragState = {
                  partId: part.id,
                  node,
                  handleMesh: hitObj,
                  axis: meta.axis,
                  sign: meta.sign,
                  origWidth: part.width,
                  origHeight: part.height,
                  origDepth: part.depth,
                  origPosMm: [...part.position],
                  worldAxisDir,
                  dragPlane,
                  startHitPoint,
                  handleStartPos: hitObj.position.clone(),
                  liveDims: { width: part.width, height: part.height, depth: part.depth },
                  livePosMm: [...part.position],
                  moved: false,
                };
                orbit.enabled = false;
                return;
              }
            }
          }
        }

        // Desktop Direct Mouse Drag on already-selected board (or any board in Move tool)
        if (
          e.pointerType === 'mouse' &&
          !runtimeRef.current?.isDraggingGizmo &&
          propsRef.current.explodedAmount < 0.01 &&
          (propsRef.current.tool === 'select' || propsRef.current.tool === 'move') &&
          !e.shiftKey
        ) {
          const tcAxis = (transform as unknown as { axis?: string | null }).axis;
          if (!tcAxis) {
            updateNdc(e.clientX, e.clientY);
            raycaster.setFromCamera(_pointerNdc, camera);
            const meshes: THREE.Object3D[] = [];
            partNodes.forEach((g) => {
              const m = g.getObjectByName('main_mesh');
              if (m) meshes.push(m);
            });
            const hits = raycaster.intersectObjects(meshes, false);
            if (hits.length > 0) {
              const { partId } = resolveHitIds(hits[0].object);
              const hitPart = partId
                ? propsRef.current.parts.find((p) => p.id === partId)
                : undefined;
              const canDirectDrag =
                partId &&
                !hitPart?.locked &&
                (propsRef.current.tool === 'move' ||
                  propsRef.current.selectedPartIds.includes(partId) ||
                  propsRef.current.selectedPartId === partId);
              if (canDirectDrag && partId) {
                const node = partNodes.get(partId);
                if (node) {
                  const planeXZ = new THREE.Plane(new THREE.Vector3(0, 1, 0), -hits[0].point.y);
                  const camDir = new THREE.Vector3();
                  camera.getWorldDirection(camDir);
                  camDir.y = 0;
                  if (camDir.lengthSq() < 0.001) camDir.set(0, 0, 1);
                  camDir.normalize();
                  const planeY = new THREE.Plane().setFromNormalAndCoplanarPoint(
                    camDir,
                    hits[0].point
                  );
                  directDragCandidate = {
                    partId,
                    node,
                    startWorldPos: node.position.clone(),
                    hitPoint: hits[0].point.clone(),
                    planeXZ,
                    planeY,
                    offsetXZ: node.position.clone().sub(hits[0].point),
                    offsetY: node.position.y - hits[0].point.y,
                    cloneOnDrop: e.altKey,
                    active: false,
                  };
                  orbit.enabled = false;
                }
              }
            }
          }
        }
      };

      const onPointerCancel = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        if (resizeDragState) {
          resizeDragState.node.scale.set(1, 1, 1);
          resizeDragState.node.position.set(
            resizeDragState.origPosMm[0] * MM_TO_M,
            resizeDragState.origPosMm[1] * MM_TO_M,
            resizeDragState.origPosMm[2] * MM_TO_M
          );
          resizeDragState.handleMesh.position.copy(resizeDragState.handleStartPos);
          resizeDragState = null;
          setResizeHud(null);
          orbit.enabled = true;
          requestRender();
        }
        if (directDragCandidate) {
          directDragCandidate.node.position.copy(directDragCandidate.startWorldPos);
          directDragCandidate = null;
          orbit.enabled = true;
          requestRender();
        }
        if (activePointers.size === 0) {
          gestureWasMultiTouch = false;
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        // Active 3D Face Resize Drag (works on both mouse & touch)
        if (resizeDragState) {
          updateNdc(e.clientX, e.clientY);
          raycaster.setFromCamera(_pointerNdc, camera);
          if (raycaster.ray.intersectPlane(resizeDragState.dragPlane, _dragHit)) {
            const dispM = _dragHit.clone().sub(resizeDragState.startHitPoint);
            const rawDeltaMm = dispM.dot(resizeDragState.worldAxisDir) * M_TO_MM;
            const origDim =
              resizeDragState.axis === 'x'
                ? resizeDragState.origWidth
                : resizeDragState.axis === 'y'
                  ? resizeDragState.origHeight
                  : resizeDragState.origDepth;
            const snap = propsRef.current.snapMm;
            const rawTarget = Math.max(12, origDim + rawDeltaMm);
            const snappedDim =
              snap > 0 ? Math.max(12, Math.round(rawTarget / snap) * snap) : Math.round(rawTarget);
            const appliedDeltaMm = snappedDim - origDim;

            const nextDims = {
              width: resizeDragState.axis === 'x' ? snappedDim : resizeDragState.origWidth,
              height: resizeDragState.axis === 'y' ? snappedDim : resizeDragState.origHeight,
              depth: resizeDragState.axis === 'z' ? snappedDim : resizeDragState.origDepth,
            };
            const shiftMm = resizeDragState.worldAxisDir
              .clone()
              .multiplyScalar(appliedDeltaMm * 0.5);
            const nextPosMm: [number, number, number] = [
              Math.round((resizeDragState.origPosMm[0] + shiftMm.x) * 10) / 10,
              Math.max(10, Math.round((resizeDragState.origPosMm[1] + shiftMm.y) * 10) / 10),
              Math.round((resizeDragState.origPosMm[2] + shiftMm.z) * 10) / 10,
            ];

            resizeDragState.liveDims = nextDims;
            resizeDragState.livePosMm = nextPosMm;
            resizeDragState.moved = appliedDeltaMm !== 0;

            resizeDragState.node.scale.set(
              nextDims.width / resizeDragState.origWidth,
              nextDims.height / resizeDragState.origHeight,
              nextDims.depth / resizeDragState.origDepth
            );
            resizeDragState.node.position.set(
              nextPosMm[0] * MM_TO_M,
              nextPosMm[1] * MM_TO_M,
              nextPosMm[2] * MM_TO_M
            );
            resizeDragState.handleMesh.position
              .copy(resizeDragState.handleStartPos)
              .addScaledVector(resizeDragState.worldAxisDir, appliedDeltaMm * MM_TO_M);

            const rect = renderer.domElement.getBoundingClientRect();
            const axisLabel =
              resizeDragState.axis === 'x'
                ? 'Szer.'
                : resizeDragState.axis === 'y'
                  ? 'Wys.'
                  : 'Gł.';
            setResizeHud({
              x: e.clientX - rect.left,
              y: e.clientY - rect.top,
              label: `${axisLabel} ${snappedDim} mm (${appliedDeltaMm >= 0 ? '+' : ''}${appliedDeltaMm})`,
            });
            requestRender();
          }
          return;
        }

        if (e.pointerType === 'touch') return;

        // Handle active Direct Mouse Drag
        if (directDragCandidate) {
          const movedPx = Math.hypot(e.clientX - downX, e.clientY - downY);
          if (!directDragCandidate.active && movedPx > 5) {
            directDragCandidate.active = true;
          }
          if (directDragCandidate.active) {
            updateNdc(e.clientX, e.clientY);
            raycaster.setFromCamera(_pointerNdc, camera);
            const movingPart = propsRef.current.parts.find(
              (p) => p.id === directDragCandidate!.partId
            );
            let rawX = directDragCandidate.node.position.x * M_TO_MM;
            let rawY = directDragCandidate.node.position.y * M_TO_MM;
            let rawZ = directDragCandidate.node.position.z * M_TO_MM;

            if (e.shiftKey) {
              if (raycaster.ray.intersectPlane(directDragCandidate.planeY, _dragHit)) {
                rawY = (_dragHit.y + directDragCandidate.offsetY) * M_TO_MM;
              }
            } else {
              if (raycaster.ray.intersectPlane(directDragCandidate.planeXZ, _dragHit)) {
                rawX = (_dragHit.x + directDragCandidate.offsetXZ.x) * M_TO_MM;
                rawZ = (_dragHit.z + directDragCandidate.offsetXZ.z) * M_TO_MM;
              }
            }

            const snapped = computeSnappedTransformPos(directDragCandidate.partId, [
              rawX,
              rawY,
              rawZ,
            ]);
            if (movingPart) {
              const dxM = snapped[0] * MM_TO_M - directDragCandidate.node.position.x;
              const dyM = snapped[1] * MM_TO_M - directDragCandidate.node.position.y;
              const dzM = snapped[2] * MM_TO_M - directDragCandidate.node.position.z;
              directDragCandidate.node.position.set(
                snapped[0] * MM_TO_M,
                snapped[1] * MM_TO_M,
                snapped[2] * MM_TO_M
              );
              if (!directDragCandidate.cloneOnDrop) {
                const selectedSet = new Set(propsRef.current.selectedPartIds);
                for (const other of propsRef.current.parts) {
                  if (other.id === movingPart.id) continue;
                  const coMove =
                    (movingPart.groupId && other.groupId === movingPart.groupId) ||
                    (selectedSet.has(movingPart.id) && selectedSet.has(other.id));
                  if (coMove) {
                    const otherNode = partNodes.get(other.id);
                    if (otherNode) {
                      otherNode.position.x += dxM;
                      otherNode.position.y += dyM;
                      otherNode.position.z += dzM;
                    }
                  }
                }
              }
            }
            requestRender();
            return;
          }
        }

        // Live 3D Tape Measure preview cursor & rubber-band segment
        if (propsRef.current.tool === 'measure') {
          const now = performance.now();
          if (now - lastMoveRaycast < 24) return;
          lastMoveRaycast = now;

          const ptMm = pickMeasurePointMm(e.clientX, e.clientY);
          pendingMeasureHoverMm = ptMm;

          disposeObjectTree(measureLiveRoot);
          measureLiveRoot.clear();
          if (ptMm) {
            if (pendingMeasureStartMm) {
              measureLiveRoot.add(buildMeasureVisual(pendingMeasureStartMm, ptMm, '#F59E0B'));
            } else {
              const dotGeo = new THREE.SphereGeometry(0.016, 14, 12);
              const dotMat = new THREE.MeshBasicMaterial({ color: '#F59E0B', depthTest: false });
              const dot = new THREE.Mesh(dotGeo, dotMat);
              dot.position.set(ptMm[0] * MM_TO_M, ptMm[1] * MM_TO_M, ptMm[2] * MM_TO_M);
              dot.renderOrder = 999;
              dot.userData.disposeMaterial = true;
              measureLiveRoot.add(dot);
            }
          }
          requestRender();
          return;
        }

        if (propsRef.current.tool !== 'screw') {
          if (screwPreview.visible) {
            screwPreview.visible = false;
            setScrewHoverHud(null);
            requestRender();
          }
          // Subtle pointer cursor when hovering a clickable 3D clearance dimension sprite
          if (
            propsRef.current.showDimensions &&
            propsRef.current.onSetClearanceDistance &&
            propsRef.current.selectedPartId &&
            propsRef.current.explodedAmount < 0.01
          ) {
            const now = performance.now();
            if (now - lastMoveRaycast >= 55) {
              lastMoveRaycast = now;
              const clearanceSprites = guidesRoot.children.filter(
                (c) => c.userData?.raycastKind === 'clearance'
              );
              if (clearanceSprites.length > 0) {
                updateNdc(e.clientX, e.clientY);
                raycaster.setFromCamera(_pointerNdc, camera);
                const cHits = raycaster.intersectObjects(clearanceSprites, false);
                renderer.domElement.style.cursor = cHits.length > 0 ? 'pointer' : '';
              } else if (renderer.domElement.style.cursor === 'pointer') {
                renderer.domElement.style.cursor = '';
              }
            }
          } else if (renderer.domElement.style.cursor === 'pointer') {
            renderer.domElement.style.cursor = '';
          }
          return;
        }
        if (runtimeRef.current?.isDraggingGizmo) return;

        const now = performance.now();
        if (now - lastMoveRaycast < 35) return;
        lastMoveRaycast = now;

        updateNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(_pointerNdc, camera);
        const meshes: THREE.Object3D[] = [];
        partNodes.forEach((g) => {
          const m = g.getObjectByName('main_mesh');
          if (m) meshes.push(m);
        });
        const hits = raycaster.intersectObjects(meshes, false);
        const hit = hits[0];
        if (hit && hit.face) {
          const { partId } = resolveHitIds(hit.object);
          const parentGroup = partId ? partNodes.get(partId) : undefined;
          if (partId && parentGroup) {
            parentGroup.updateWorldMatrix(true, false);
            _vec3B.copy(hit.point);
            parentGroup.worldToLocal(_vec3B);
            _vec3C.copy(hit.face.normal).normalize();

            const feedback = evaluateScrewPlacement(
              partId,
              [_vec3B.x * M_TO_MM, _vec3B.y * M_TO_MM, _vec3B.z * M_TO_MM],
              [_vec3C.x, _vec3C.y, _vec3C.z],
              propsRef.current.activeScrewType,
              propsRef.current.parts,
              true
            );

            if (feedback) {
              const colorHex = feedback.status === 'ok' ? '#10B981' : '#EF4444';
              ringMat.color.set(colorHex);
              pinMat.color.set(colorHex);

              _vec3A.set(...feedback.worldNormal).normalize();
              screwPreview.position
                .set(
                  feedback.worldPosition[0] * MM_TO_M,
                  feedback.worldPosition[1] * MM_TO_M,
                  feedback.worldPosition[2] * MM_TO_M
                )
                .addScaledVector(_vec3A, 0.002);
              _quatA.setFromUnitVectors(_upVec, _vec3A);
              screwPreview.quaternion.copy(_quatA);
              screwPreview.visible = true;

              const rect = renderer.domElement.getBoundingClientRect();
              setScrewHoverHud({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top,
                feedback,
              });
              requestRender();
              return;
            }
          }
        }
        if (screwPreview.visible) {
          screwPreview.visible = false;
          setScrewHoverHud(null);
          requestRender();
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        const wasMulti = gestureWasMultiTouch;
        if (activePointers.size === 0) {
          gestureWasMultiTouch = false;
        }

        // Complete Interactive 3D Face Resize Drag
        if (resizeDragState) {
          const drag = resizeDragState;
          resizeDragState = null;
          orbit.enabled = true;
          setResizeHud(null);
          drag.node.scale.set(1, 1, 1);
          if (drag.moved) {
            propsRef.current.onResizePart(drag.partId, drag.liveDims, drag.livePosMm);
          } else {
            drag.node.position.set(
              drag.origPosMm[0] * MM_TO_M,
              drag.origPosMm[1] * MM_TO_M,
              drag.origPosMm[2] * MM_TO_M
            );
            drag.handleMesh.position.copy(drag.handleStartPos);
          }
          requestRender();
          return;
        }

        // Complete Direct Mouse Drag if active
        if (directDragCandidate) {
          const drag = directDragCandidate;
          directDragCandidate = null;
          orbit.enabled = true;
          if (drag.active) {
            const finalPos = computeSnappedTransformPos(drag.partId, [
              drag.node.position.x * M_TO_MM,
              drag.node.position.y * M_TO_MM,
              drag.node.position.z * M_TO_MM,
            ]);
            const finalRot: [number, number, number] = [
              Math.round(THREE.MathUtils.radToDeg(drag.node.rotation.x)),
              Math.round(THREE.MathUtils.radToDeg(drag.node.rotation.y)),
              Math.round(THREE.MathUtils.radToDeg(drag.node.rotation.z)),
            ];
            if (drag.cloneOnDrop) {
              drag.node.position.copy(drag.startWorldPos);
              propsRef.current.onCloneTransformPart(drag.partId, finalPos, finalRot);
            } else {
              propsRef.current.onTransformPart(drag.partId, finalPos, finalRot);
            }
            requestRender();
            return;
          }
        }

        // Right-Click Context Menu (only on crisp click, NOT right-drag pan!)
        if (e.button === 2 && downButton === 2 && e.pointerType === 'mouse') {
          const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
          if (dist <= 6) {
            updateNdc(e.clientX, e.clientY);
            raycaster.setFromCamera(_pointerNdc, camera);
            const targets = collectRaycastTargets();
            const hits = raycaster.intersectObjects(targets, true);
            if (hits.length > 0) {
              const { fastenerId, partId } = resolveHitIds(hits[0].object);
              if (fastenerId) {
                propsRef.current.onSelectFastener(fastenerId);
                propsRef.current.onContextMenu({
                  kind: 'fastener',
                  fastenerId,
                  label: 'Zaznaczony łącznik',
                  x: e.clientX,
                  y: e.clientY,
                });
                return;
              }
              if (partId) {
                const part = propsRef.current.parts.find((p) => p.id === partId);
                if (part) {
                  if (!propsRef.current.selectedPartIds.includes(partId)) {
                    propsRef.current.onSelectPart(partId, false);
                  }
                  propsRef.current.onContextMenu({
                    kind: 'part',
                    partId,
                    partName: part.name,
                    x: e.clientX,
                    y: e.clientY,
                  });
                  return;
                }
              }
            }
            propsRef.current.onContextMenu({
              kind: 'canvas',
              x: e.clientX,
              y: e.clientY,
            });
          }
          return;
        }

        if (wasMulti || activePointers.size > 0) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        if (runtimeRef.current?.isDraggingGizmo) return;
        const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
        const elapsed = performance.now() - downTime;
        const maxTapDist = e.pointerType === 'touch' ? 14 : 7;
        if (dist > maxTapDist || elapsed > 500) return;

        // 3D Point-to-Point Tape Measure click handling
        if (propsRef.current.tool === 'measure') {
          const ptMm = pickMeasurePointMm(e.clientX, e.clientY);

          if (ptMm) {
            if (!pendingMeasureStartMm) {
              pendingMeasureStartMm = ptMm;
              pendingMeasureHoverMm = ptMm;
              disposeObjectTree(measureLiveRoot);
              measureLiveRoot.clear();
              const dotGeo = new THREE.SphereGeometry(0.017, 14, 12);
              const dotMat = new THREE.MeshBasicMaterial({ color: '#F59E0B', depthTest: false });
              const dot = new THREE.Mesh(dotGeo, dotMat);
              dot.position.set(ptMm[0] * MM_TO_M, ptMm[1] * MM_TO_M, ptMm[2] * MM_TO_M);
              dot.renderOrder = 999;
              dot.userData.disposeMaterial = true;
              measureLiveRoot.add(dot);
              requestRender();
            } else {
              const seg: MeasureSegment = {
                id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
                startMm: pendingMeasureStartMm,
                endMm: ptMm,
              };
              pendingMeasureStartMm = null;
              pendingMeasureHoverMm = null;
              disposeObjectTree(measureLiveRoot);
              measureLiveRoot.clear();
              propsRef.current.onAddMeasurement(seg);
              requestRender();
            }
          }
          return;
        }

        updateNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(_pointerNdc, camera);

        // Priority hit test: Clickable 3D Clearance Dimension Sprites (inline distance editor)
        if (
          propsRef.current.tool !== 'screw' &&
          propsRef.current.showDimensions &&
          propsRef.current.selectedPartId &&
          propsRef.current.onSetClearanceDistance &&
          propsRef.current.explodedAmount < 0.01
        ) {
          const clearanceSprites = guidesRoot.children.filter(
            (c) => c.userData?.raycastKind === 'clearance'
          );
          if (clearanceSprites.length > 0) {
            const clearanceHits = raycaster.intersectObjects(clearanceSprites, false);
            if (clearanceHits.length > 0) {
              const guide = clearanceHits[0].object.userData
                .clearanceGuide as ClearanceGuide | undefined;
              if (guide) {
                const rect = renderer.domElement.getBoundingClientRect();
                setActiveClearanceEdit({
                  x: e.clientX - rect.left,
                  y: e.clientY - rect.top,
                  partId: propsRef.current.selectedPartId,
                  guide,
                  value: String(guide.distanceMm),
                });
                return;
              }
            }
          }
        }

        setActiveClearanceEdit(null);
        const targets = collectRaycastTargets();
        const hits = raycaster.intersectObjects(targets, true);

        if (hits.length === 0) {
          if (propsRef.current.tool !== 'screw') {
            propsRef.current.onSelectPart(null, false);
            propsRef.current.onSelectFastener(null);
          }
          return;
        }

        const { fastenerId, partId } = resolveHitIds(hits[0].object);

        if (fastenerId) {
          propsRef.current.onSelectFastener(fastenerId);
          return;
        }

        if (propsRef.current.tool === 'screw' && partId && hits[0].face) {
          const parentGroup = partNodes.get(partId);
          if (parentGroup) {
            parentGroup.updateWorldMatrix(true, false);
            _vec3B.copy(hits[0].point);
            parentGroup.worldToLocal(_vec3B);

            const snap = propsRef.current.snapMm;
            _vec3C.copy(hits[0].face.normal).normalize();

            const snapCoord = (vMm: number, normalComp: number) => {
              if (snap <= 0 || Math.abs(normalComp) > 0.7) {
                return Number(vMm.toFixed(1));
              }
              return Math.round(vMm / snap) * snap;
            };

            const localPosMm: [number, number, number] = [
              snapCoord(_vec3B.x * M_TO_MM, _vec3C.x),
              snapCoord(_vec3B.y * M_TO_MM, _vec3C.y),
              snapCoord(_vec3B.z * M_TO_MM, _vec3C.z),
            ];
            const localNorm: [number, number, number] = [
              Number(_vec3C.x.toFixed(3)),
              Number(_vec3C.y.toFixed(3)),
              Number(_vec3C.z.toFixed(3)),
            ];

            const evalResult = evaluateScrewPlacement(
              partId,
              localPosMm,
              localNorm,
              propsRef.current.activeScrewType,
              propsRef.current.parts,
              true
            );

            if (evalResult) {
              if (propsRef.current.screwJointsOnly && evalResult.status !== 'ok') {
                propsRef.current.onRejectScrewPlacement(evalResult.reason);
                return;
              }
              propsRef.current.onPlaceFastener(
                partId,
                evalResult.localPosition,
                evalResult.localNormal,
                evalResult.status === 'ok' ? evalResult.recommendedType : undefined,
                evalResult.targetPartId
              );
            }
          }
          return;
        }

        if (partId) {
          propsRef.current.onSelectPart(partId, e.shiftKey);
        }
      };

      const onContextMenuDom = (e: MouseEvent) => {
        e.preventDefault();
      };

      const onDoubleClick = (e: MouseEvent) => {
        if (propsRef.current.tool === 'screw') return;
        updateNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(_pointerNdc, camera);
        const meshes: THREE.Object3D[] = [];
        partNodes.forEach((g) => {
          const m = g.getObjectByName('main_mesh');
          if (m) meshes.push(m);
        });
        const hits = raycaster.intersectObjects(meshes, false);
        if (hits.length > 0) {
          const { partId } = resolveHitIds(hits[0].object);
          if (partId) {
            if (propsRef.current.onDoubleClickPart) {
              propsRef.current.onDoubleClickPart(partId);
            }
            const node = partNodes.get(partId);
            if (node) {
              node.updateWorldMatrix(true, true);
              const box = new THREE.Box3().setFromObject(node);
              const center = box.getCenter(new THREE.Vector3());
              const size = box.getSize(new THREE.Vector3());
              const dist = Math.max(0.85, size.length() * 1.65);
              const dir = camera.position.clone().sub(orbit.target);
              if (dir.lengthSq() < 0.01) dir.set(0.68, 0.42, 0.74);
              dir.normalize();
              startCameraTransition(center.clone().addScaledVector(dir, dist), center);
              return;
            }
          }
        }
        // Double-click empty canvas -> Focus All
        const box = new THREE.Box3();
        partsRoot.updateWorldMatrix(true, true);
        if (partsRoot.children.length > 0) {
          box.setFromObject(partsRoot);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const dist = Math.max(1.8, size.length() * 1.2);
          startCameraTransition(
            new THREE.Vector3(
              center.x + dist * 0.68,
              center.y + dist * 0.42,
              center.z + dist * 0.74
            ),
            center
          );
        }
      };

      const onPointerLeave = () => {
        if (screwPreview.visible) {
          screwPreview.visible = false;
          setScrewHoverHud(null);
          requestRender();
        }
      };

      const dom = renderer.domElement;
      dom.addEventListener('pointerdown', onPointerDown);
      dom.addEventListener('pointermove', onPointerMove);
      dom.addEventListener('pointerup', onPointerUp);
      dom.addEventListener('pointercancel', onPointerCancel);
      dom.addEventListener('pointerleave', onPointerLeave);
      dom.addEventListener('contextmenu', onContextMenuDom);
      dom.addEventListener('dblclick', onDoubleClick);

      // Context loss protection
      const handleContextLost = (e: Event) => {
        e.preventDefault();
        setContextLost(true);
      };
      const handleContextRestored = () => {
        setContextLost(false);
        requestRender();
      };
      dom.addEventListener('webglcontextlost', handleContextLost);
      dom.addEventListener('webglcontextrestored', handleContextRestored);

      // Resize observer
      const resizeObserver = new ResizeObserver(() => {
        if (!container || disposed) return;
        const w = container.clientWidth || 1;
        const h = container.clientHeight || 1;
        camera.aspect = w / h;
        camera.fov = h > w ? 48 : 42;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h, false);
        requestRender();
      });
      resizeObserver.observe(container);
      renderer.setSize(width, height, false);

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }
      requestRender();

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        dom.removeEventListener('pointerdown', onPointerDown);
        dom.removeEventListener('pointermove', onPointerMove);
        dom.removeEventListener('pointerup', onPointerUp);
        dom.removeEventListener('pointercancel', onPointerCancel);
        dom.removeEventListener('pointerleave', onPointerLeave);
        dom.removeEventListener('contextmenu', onContextMenuDom);
        dom.removeEventListener('dblclick', onDoubleClick);
        dom.removeEventListener('webglcontextlost', handleContextLost);
        dom.removeEventListener('webglcontextrestored', handleContextRestored);

        transform.detach();
        transform.dispose();
        orbit.dispose();
        disposeObjectTree(partsRoot);
        disposeObjectTree(roomRoot);
        disposeObjectTree(guidesRoot);
        disposeObjectTree(jointZonesRoot);
        disposeObjectTree(ledRoot);
        disposeObjectTree(resizeHandlesRoot);
        disposeObjectTree(measureRoot);
        disposeObjectTree(measureLiveRoot);
        materials.dispose();
        floorGeo.dispose();
        floorMat.dispose();
        contactShadow.geometry.dispose();
        contactShadowMat.dispose();
        contactShadowTex.dispose();
        ringGeo.dispose();
        ringMat.dispose();
        pinGeo.dispose();
        pinMat.dispose();
        envTex.dispose();
        renderer.dispose();
        if (dom.parentNode === container) {
          container.removeChild(dom);
        }
        runtimeRef.current = null;
      };
    }, []);

    // Sync lighting preset (including Studio HQ RectAreaLight softboxes & PMREM intensity)
    useEffect(() => {
      const rt = runtimeRef.current;
      if (!rt) return;
      const cfg = LIGHTING_CONFIGS[props.lighting];
      rt.scene.background = new THREE.Color(cfg.bg);
      rt.scene.fog = new THREE.Fog(cfg.bg, 7.5, 22);
      rt.scene.environmentIntensity = cfg.envIntensity;
      rt.keyLight.color.set(cfg.keyColor);
      rt.keyLight.intensity = cfg.keyIntensity;
      rt.hemiLight.color.set(cfg.hemiSky);
      rt.hemiLight.groundColor.set(cfg.hemiGround);
      rt.hemiLight.intensity = cfg.hemiIntensity;
      rt.rimLight.color.set(cfg.rimColor);
      rt.rimLight.intensity = cfg.rimIntensity;
      rt.renderer.toneMappingExposure = cfg.exposure;
      rt.softboxLights.forEach((sb, idx) => {
        sb.intensity = idx === 0 ? cfg.softboxIntensity : cfg.softboxIntensity * 0.65;
      });
      rt.requestRender();
    }, [props.lighting]);

    // Sync saved 3D Tape Measure segments
    useEffect(() => {
      const rt = runtimeRef.current;
      if (!rt) return;
      disposeObjectTree(rt.measureRoot);
      rt.measureRoot.clear();
      for (const seg of props.measurements) {
        rt.measureRoot.add(buildMeasureVisual(seg.startMm, seg.endMm, '#0EA5E9'));
      }
      if (props.tool !== 'measure') {
        rt.clearPendingMeasure();
      }
      rt.requestRender();
    }, [props.measurements, props.tool]);

    // Sync exploded view & animated open-doors/drawers targets
    useEffect(() => {
      runtimeRef.current?.setExplodedTarget(props.explodedAmount);
    }, [props.explodedAmount]);

    useEffect(() => {
      runtimeRef.current?.setOpenTarget(props.openAmount);
    }, [props.openAmount]);

    // Invalidate custom material cache when warehouse catalog changes
    useEffect(() => {
      runtimeRef.current?.materials.invalidateCustomMaterials();
    }, [props.materialsVersion]);

    // Rebuild 3D Room / Alcove Shell, Sloped Attic Ceiling & Wall Obstacles
    useEffect(() => {
      const rt = runtimeRef.current;
      if (!rt) return;
      disposeObjectTree(rt.roomRoot);
      rt.roomRoot.clear();

      const room = props.room;
      if (!room || !room.enabled) {
        rt.requestRender();
        return;
      }

      buildArchitecturalRoom3D(rt.roomRoot, room);
      rt.requestRender();
    }, [props.room]);

    // Rebuild 3D parts & fasteners whenever scene model or custom textures change
    useEffect(() => {
      const rt = runtimeRef.current;
      if (!rt) return;

      rt.materials.syncCustomTextures(props.customTextures);

      // Detach gizmo cleanly before rebuilding
      rt.transform.detach();
      disposeObjectTree(rt.partsRoot);
      rt.partsRoot.clear();
      rt.partNodes.clear();
      rt.partBasePos.clear();
      rt.partBaseQuat.clear();
      rt.partExplodeDir.clear();
      rt.partOpenMeta.clear();
      rt.hardwareRuntime = null;

      // Pre-compute exact per-drawer full-extension travel distances (proportional to real box depth)
      const drawerTravelMap = computeDrawerSlideTravelMap(props.parts);
      const visiblePartIds = new Set<string>();

      // Compute centroid for natural radial exploded-view separation
      const centroid = new THREE.Vector3();
      if (props.parts.length > 0) {
        props.parts.forEach((p) => {
          centroid.x += p.position[0] * MM_TO_M;
          centroid.y += p.position[1] * MM_TO_M;
          centroid.z += p.position[2] * MM_TO_M;
        });
        centroid.divideScalar(props.parts.length);
      }

      // Group fasteners by partId
      const fastenersByPart = new Map<string, Fastener[]>();
      if (props.showFasteners) {
        for (const f of props.fasteners) {
          const list = fastenersByPart.get(f.partId) ?? [];
          list.push(f);
          fastenersByPart.set(f.partId, list);
        }
      }

      const activeStepPlan =
        props.assemblyStep > 0 && props.assemblyPlan
          ? props.assemblyPlan.steps.find((s) => s.step === props.assemblyStep) ?? null
          : null;
      const targetBaseIdSet = new Set<string>(
        activeStepPlan?.targetBasePartIds ?? []
      );

      for (const part of props.parts) {
        if (part.hidden) {
          continue;
        }
        const partStep =
          props.assemblyPlan?.partStepMap.get(part.id) ?? 1;
        if (props.assemblyStep > 0 && partStep > props.assemblyStep) {
          continue;
        }
        visiblePartIds.add(part.id);

        const group = new THREE.Group();
        group.userData.partId = part.id;

        const basePos = new THREE.Vector3(
          part.position[0] * MM_TO_M,
          part.position[1] * MM_TO_M,
          part.position[2] * MM_TO_M
        );
        const baseQuat = getPartQuaternion(part);
        const dir = basePos.clone().sub(centroid);
        if (dir.lengthSq() < 0.0001) {
          dir.set(0, 0.2, 0);
        } else {
          dir.normalize().multiplyScalar(Math.min(1.4, basePos.distanceTo(centroid) + 0.35));
        }

        rt.partBasePos.set(part.id, basePos);
        rt.partBaseQuat.set(part.id, baseQuat);
        rt.partExplodeDir.set(part.id, dir);

        // Register animated kinematics for hinged doors and sliding drawers / cargo baskets
        const isDrawerLike =
          part.hardwareTag === 'drawer_front' ||
          part.hardwareTag === 'drawer_box' ||
          (part.drawerSlideType && part.drawerSlideType !== 'none') ||
          part.applianceModel === 'wire_cargo' ||
          /szuflad|cargo/i.test(part.name);

        if (part.hardwareTag === 'sliding_door') {
          const dirSign = part.slidingDirection === 'left' ? -1 : 1;
          const travelMm = part.slidingTravelMm ?? Math.round(part.width * 0.85);
          rt.partOpenMeta.set(part.id, {
            kind: 'sliding',
            slideDistM: travelMm * MM_TO_M * dirSign,
          });
        } else if (isDrawerLike) {
          rt.partOpenMeta.set(part.id, {
            kind: 'drawer',
            slideDistM: drawerTravelMap.get(part.id) ?? 0.34,
          });
        } else if (part.kind === 'door') {
          if (part.hingeSide === 'top') {
            const pivotY = (part.height * 0.5 - 2) * MM_TO_M;
            const pivotZ = (-part.depth * 0.5 + 2) * MM_TO_M;
            rt.partOpenMeta.set(part.id, {
              kind: 'door',
              axis: 'x',
              localPivot: new THREE.Vector3(0, pivotY, pivotZ),
              maxAngleRad: -THREE.MathUtils.degToRad(88),
              throwZ: 0.004,
            });
          } else {
            const hingeSide =
              part.hingeSide === 'left' || part.hingeSide === 'right'
                ? part.hingeSide
                : part.handleSide === 'left'
                  ? 'right'
                  : 'left';
            const isOverlay = part.hardwareTag !== 'door_inset';
            const edgeOffsetMm = isOverlay ? 3 : 0;
            const pivotX =
              (hingeSide === 'left'
                ? -part.width * 0.5 + edgeOffsetMm
                : part.width * 0.5 - edgeOffsetMm) * MM_TO_M;
            const pivotZ = (-part.depth * 0.5 + (isOverlay ? 3 : 1)) * MM_TO_M;
            rt.partOpenMeta.set(part.id, {
              kind: 'door',
              axis: 'y',
              localPivot: new THREE.Vector3(pivotX, 0, pivotZ),
              maxAngleRad: hingeSide === 'left' ? -THREE.MathUtils.degToRad(102) : THREE.MathUtils.degToRad(102),
              throwZ: isOverlay ? 0.004 : 0.001,
            });
          }
        }

        group.position.copy(basePos);
        group.quaternion.copy(baseQuat);

        let geo: THREE.BufferGeometry;
        const slidingTrackGroup =
          part.kind === 'profile' ? buildSlidingTrackGroup(part) : null;
        if (part.kind === 'appliance' || part.hardwareTag === 'leg' || slidingTrackGroup) {
          geo = new THREE.BoxGeometry(
            Math.max(10, part.width) * MM_TO_M,
            Math.max(10, part.height) * MM_TO_M,
            Math.max(10, part.depth) * MM_TO_M
          );
          const hitMat = new THREE.MeshBasicMaterial({
            transparent: true,
            opacity: 0,
            depthWrite: false,
          });
          const hitMesh = new THREE.Mesh(geo, hitMat);
          hitMesh.name = 'main_mesh';
          hitMesh.userData.partId = part.id;
          hitMesh.userData.raycastKind = 'part_mesh';
          hitMesh.userData.disposeMaterial = true;
          group.add(hitMesh);

          const detailGroup =
            part.kind === 'appliance'
              ? buildApplianceGroup(part)
              : part.hardwareTag === 'leg'
                ? buildFurnitureLegGroup(part)
                : slidingTrackGroup;
          if (detailGroup) {
            detailGroup.traverse((c) => {
              if (c instanceof THREE.Mesh) {
                c.userData.disposeMaterial = true;
                c.userData.partId = part.id;
                c.userData.raycastKind = 'part_mesh';
                c.castShadow = !props.xrayMode;
                c.receiveShadow = true;
              }
            });
            group.add(detailGroup);
          }
        } else {
          geo = buildPartGeometry(part);
          const edgeMode =
            part.edgeBanding && part.edgeBanding.thicknessMm === 0
              ? 'raw'
              : 'banded';
          const mat = rt.materials.getMaterial(
            part.materialId,
            props.xrayMode,
            part.surfaceFinish ?? 'matte',
            edgeMode
          );
          const mesh = new THREE.Mesh(geo, mat);
          mesh.name = 'main_mesh';
          mesh.userData.partId = part.id;
          mesh.userData.raycastKind = 'part_mesh';
          mesh.castShadow = !props.xrayMode && part.materialId !== 'glass_clear';
          mesh.receiveShadow = true;
          group.add(mesh);

          // Cabinet door metallic handle / Tip-On strike plate
          const handleGroup = buildDoorHandleGroup(part);
          if (handleGroup) {
            handleGroup.traverse((c) => {
              if (c instanceof THREE.Mesh) {
                c.userData.disposeMaterial = true;
                c.userData.partId = part.id;
              }
            });
            group.add(handleGroup);
          }

          // Ø35 mm Concealed Cup Hinges (door-side recessed cup + flange)
          const hingesGroup = buildDoorHingesGroup(part);
          if (hingesGroup) {
            hingesGroup.traverse((c) => {
              if (c instanceof THREE.Mesh) {
                c.userData.disposeMaterial = true;
                c.userData.partId = part.id;
              }
            });
            group.add(hingesGroup);
          }

          // Sliding wardrobe door top guide carriages & bottom roller wheels
          const rollersGroup = buildSlidingDoorRollersGroup(part);
          if (rollersGroup) {
            rollersGroup.traverse((c) => {
              if (c instanceof THREE.Mesh) {
                c.userData.disposeMaterial = true;
                c.userData.partId = part.id;
              }
            });
            group.add(rollersGroup);
          }

          // Board Machining visual indicators (Interior-only Dado grooves, LED strips, System 32 Ø5mm holes & 45° miters)
          const machiningGroup = buildPartMachiningGroup(part, props.parts);
          if (machiningGroup) {
            machiningGroup.traverse((c) => {
              if (c instanceof THREE.Mesh || c instanceof THREE.InstancedMesh) {
                c.userData.disposeMaterial = true;
                c.userData.partId = part.id;
              }
            });
            group.add(machiningGroup);
          }
        }

        // Crisp architectural outline for colliding, selected, active assembly step, assembly target base, or X-Ray parts
        const isSelected =
          part.id === props.selectedPartId ||
          props.selectedPartIds.includes(part.id);
        const isColliding = props.collidingPartIds.has(part.id);
        const isActiveAssemblyStep = props.assemblyStep > 0 && partStep === props.assemblyStep;
        const isAssemblyTargetBase =
          props.assemblyStep > 0 && !isActiveAssemblyStep && targetBaseIdSet.has(part.id);
        if (
          isSelected ||
          isColliding ||
          isActiveAssemblyStep ||
          isAssemblyTargetBase ||
          props.xrayMode
        ) {
          const edgesGeo = new THREE.EdgesGeometry(geo, 22);
          const edgesMat = new THREE.LineBasicMaterial({
            color: isColliding
              ? '#EF4444'
              : isSelected
                ? '#F59E0B'
                : isActiveAssemblyStep
                  ? '#10B981'
                  : isAssemblyTargetBase
                    ? '#38BDF8'
                    : '#4B5563',
            transparent:
              !isSelected && !isColliding && !isActiveAssemblyStep && !isAssemblyTargetBase,
            opacity:
              isSelected || isColliding || isActiveAssemblyStep || isAssemblyTargetBase
                ? 1
                : 0.35,
          });
          const edges = new THREE.LineSegments(edgesGeo, edgesMat);
          edges.userData.disposeMaterial = true;
          group.add(edges);
        }

        // Attached fasteners anchored in local board coordinates
        const partFasteners = fastenersByPart.get(part.id) ?? [];
        for (const f of partFasteners) {
          // In Assembly Guide mode, show a fastener only once both host and target boards are mounted
          if (props.assemblyStep > 0 && props.assemblyPlan && f.targetPartId) {
            const targetStep = props.assemblyPlan.partStepMap.get(f.targetPartId);
            if (targetStep && targetStep > props.assemblyStep) {
              continue;
            }
          }
          const audit = props.fastenerAuditMap.get(f.id);
          const fGroup = buildFastenerGroup(
            f.type,
            f.id === props.selectedFastenerId,
            audit?.status
          );
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
          const q = new THREE.Quaternion().setFromUnitVectors(_upVec, norm);
          fGroup.quaternion.copy(q);
          fGroup.userData.fastenerId = f.id;
          fGroup.userData.partId = part.id;
          fGroup.userData.raycastKind = 'fastener';
          fGroup.traverse((c) => {
            if (c instanceof THREE.Mesh) {
              c.userData.disposeMaterial = true;
              c.userData.fastenerId = f.id;
              c.userData.partId = part.id;
              c.userData.raycastKind = 'fastener';
            }
          });
          group.add(fGroup);
        }

        rt.partsRoot.add(group);
        rt.partNodes.set(part.id, group);
      }

      // Build carcass-mounted & articulated 3D hardware (hinge mounting plates + arms, flap gas struts,
      // 3-stage telescopic drawer slides, stationary Tip-On latches, and nickel shelf support pins)
      const hwRuntime = buildCabinetHardwareScene(
        props.parts,
        rt.partBasePos,
        rt.partBaseQuat,
        rt.partExplodeDir,
        drawerTravelMap,
        visiblePartIds
      );
      rt.partsRoot.add(hwRuntime.root);
      rt.hardwareRuntime = hwRuntime;

      // Apply current exploded & open-door/drawer transforms immediately after rebuild
      rt.applyPartAnimations();

      // Fit directional shadow camera frustum tightly around furniture bounds for razor-sharp cabinet interior shadows
      if (props.parts.length > 0) {
        const bounds = new THREE.Box3();
        for (const p of props.parts) {
          const wb = getPartWorldBox(p);
          bounds.expandByPoint(
            new THREE.Vector3(wb.minX * MM_TO_M, wb.minY * MM_TO_M, wb.minZ * MM_TO_M)
          );
          bounds.expandByPoint(
            new THREE.Vector3(wb.maxX * MM_TO_M, wb.maxY * MM_TO_M, wb.maxZ * MM_TO_M)
          );
        }
        const center = bounds.getCenter(new THREE.Vector3());
        const size = bounds.getSize(new THREE.Vector3());
        const halfExtent = Math.max(1.15, Math.min(4.8, size.length() * 0.68 + 0.35));
        rt.keyLight.target.position.copy(center);
        rt.keyLight.target.updateMatrixWorld();
        rt.keyLight.position.set(
          center.x + halfExtent * 1.55,
          center.y + halfExtent * 2.25,
          center.z + halfExtent * 1.65
        );
        rt.keyLight.shadow.camera.left = -halfExtent;
        rt.keyLight.shadow.camera.right = halfExtent;
        rt.keyLight.shadow.camera.top = halfExtent;
        rt.keyLight.shadow.camera.bottom = -halfExtent;
        rt.keyLight.shadow.camera.far = Math.max(14, halfExtent * 8);
        rt.keyLight.shadow.camera.updateProjectionMatrix();
      }

      // Rebuild 3D Clearance Dimension Guides ("Prześwity w świetle") & Assembly Joint Contact Pins
      disposeObjectTree(rt.guidesRoot);
      rt.guidesRoot.clear();
      if (
        props.assemblyStep > 0 &&
        activeStepPlan &&
        activeStepPlan.jointPointsWorld.length > 0 &&
        props.explodedAmount < 0.01
      ) {
        const coreGeo = new THREE.SphereGeometry(0.011, 14, 14);
        const coreMat = new THREE.MeshBasicMaterial({
          color: '#10B981',
          depthTest: false,
          transparent: true,
          opacity: 0.95,
        });
        const haloGeo = new THREE.SphereGeometry(0.022, 14, 14);
        const haloMat = new THREE.MeshBasicMaterial({
          color: '#38BDF8',
          depthTest: false,
          transparent: true,
          opacity: 0.32,
          wireframe: true,
        });
        for (const pt of activeStepPlan.jointPointsWorld) {
          const marker = new THREE.Group();
          marker.position.set(pt[0] * MM_TO_M, pt[1] * MM_TO_M, pt[2] * MM_TO_M);
          const core = new THREE.Mesh(coreGeo, coreMat);
          core.renderOrder = 26;
          const halo = new THREE.Mesh(haloGeo, haloMat);
          halo.renderOrder = 25;
          marker.add(core, halo);
          rt.guidesRoot.add(marker);
        }
      }
      if (props.showDimensions && props.explodedAmount < 0.01 && props.clearances.length > 0) {
        const lineMat = new THREE.LineBasicMaterial({
          color: '#0EA5E9',
          depthTest: false,
          transparent: true,
          opacity: 0.92,
        });
        const dirArrows: Record<ClearanceGuide['direction'], string> = {
          up: '↑',
          down: '↓',
          left: '←',
          right: '→',
          back: '↖',
        };
        const editable = Boolean(props.onSetClearanceDistance);
        for (const g of props.clearances) {
          const s = new THREE.Vector3(
            g.startWorld[0] * MM_TO_M,
            g.startWorld[1] * MM_TO_M,
            g.startWorld[2] * MM_TO_M
          );
          const e = new THREE.Vector3(
            g.endWorld[0] * MM_TO_M,
            g.endWorld[1] * MM_TO_M,
            g.endWorld[2] * MM_TO_M
          );
          const tickSize = 0.018;
          const tickOff =
            g.direction === 'up' || g.direction === 'down' || g.direction === 'back'
              ? new THREE.Vector3(tickSize, 0, 0)
              : new THREE.Vector3(0, tickSize, 0);

          const lineGeo = new THREE.BufferGeometry().setFromPoints([
            s,
            e,
            s.clone().sub(tickOff),
            s.clone().add(tickOff),
            e.clone().sub(tickOff),
            e.clone().add(tickOff),
          ]);
          const lineSeg = new THREE.LineSegments(lineGeo, lineMat.clone());
          lineSeg.renderOrder = 997;
          lineSeg.userData.disposeMaterial = true;
          rt.guidesRoot.add(lineSeg);

          const mid = s.clone().add(e).multiplyScalar(0.5);
          const sprite = createClearanceSprite(
            `${dirArrows[g.direction]} ${g.distanceMm} mm`,
            editable
          );
          sprite.position.copy(mid);
          sprite.userData.raycastKind = 'clearance';
          sprite.userData.clearanceGuide = g;
          rt.guidesRoot.add(sprite);
        }
        lineMat.dispose();
      }

      // Rebuild Live Emerald-Green "Joint X-Ray" Mounting Strips when Screw tool is active
      disposeObjectTree(rt.jointZonesRoot);
      rt.jointZonesRoot.clear();
      if (props.tool === 'screw' && props.explodedAmount < 0.01 && props.jointZones.length > 0) {
        for (const z of props.jointZones) {
          const stripGeo = new THREE.BoxGeometry(
            z.worldSize[0] * MM_TO_M,
            z.worldSize[1] * MM_TO_M,
            z.worldSize[2] * MM_TO_M
          );
          const stripMat = new THREE.MeshBasicMaterial({
            color: '#10B981',
            transparent: true,
            opacity: 0.34,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -2,
          });
          const stripMesh = new THREE.Mesh(stripGeo, stripMat);
          stripMesh.position.set(
            (z.worldCenter[0] + z.normalWorld[0] * 1.4) * MM_TO_M,
            (z.worldCenter[1] + z.normalWorld[1] * 1.4) * MM_TO_M,
            (z.worldCenter[2] + z.normalWorld[2] * 1.4) * MM_TO_M
          );
          stripMesh.userData.disposeMaterial = true;
          stripMesh.renderOrder = 995;
          rt.jointZonesRoot.add(stripMesh);

          const borderGeo = new THREE.EdgesGeometry(stripGeo);
          const borderMat = new THREE.LineBasicMaterial({
            color: '#34D399',
            transparent: true,
            opacity: 0.9,
          });
          const border = new THREE.LineSegments(borderGeo, borderMat);
          border.position.copy(stripMesh.position);
          border.userData.disposeMaterial = true;
          border.renderOrder = 996;
          rt.jointZonesRoot.add(border);
        }
      }

      // Update contact shadow size to match furniture footprint
      if (props.parts.length > 0) {
        const box = new THREE.Box3().setFromObject(rt.partsRoot);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        rt.contactShadow.position.set(center.x, 0.0005, center.z);
        rt.contactShadow.scale.set(
          Math.max(0.6, size.x * 0.72),
          Math.max(0.5, size.z * 0.85),
          1
        );
        rt.contactShadow.visible = true;
      } else {
        rt.contactShadow.visible = false;
      }

      // Rebuild Under-Cabinet Warm 3000K LED Strip Lighting when enabled
      disposeObjectTree(rt.ledRoot);
      rt.ledRoot.clear();
      if (props.ledUnderCabinet && props.explodedAmount < 0.01) {
        const ledCandidates = props.parts
          .map((p) => ({ part: p, box: getPartWorldBox(p) }))
          .filter(
            ({ part, box }) =>
              part.kind !== 'door' &&
              part.kind !== 'profile' &&
              box.minY >= 460 &&
              part.height <= 60 &&
              part.width >= 260 &&
              part.depth >= 150
          )
          .sort((a, b) => b.part.width - a.part.width);

        let pointLightBudget = rt.isSoftwareGl ? 0 : 2;
        for (const { part, box } of ledCandidates) {
          const stripLenM = Math.max(0.18, (part.width - 40) * MM_TO_M);
          const stripGeo = new THREE.BoxGeometry(stripLenM, 0.005, 0.014);
          const stripMat = new THREE.MeshStandardMaterial({
            color: '#FFF1D0',
            emissive: '#FFCC66',
            emissiveIntensity: 2.3,
            roughness: 0.25,
          });
          const stripMesh = new THREE.Mesh(stripGeo, stripMat);
          const centerX = ((box.minX + box.maxX) / 2) * MM_TO_M;
          const underY = (box.minY - 3) * MM_TO_M;
          const stripZ = (box.minZ + (box.maxZ - box.minZ) * 0.35) * MM_TO_M;
          stripMesh.position.set(centerX, underY, stripZ);
          stripMesh.userData.disposeMaterial = true;
          rt.ledRoot.add(stripMesh);

          if (pointLightBudget > 0) {
            const pLight = new THREE.PointLight('#FFD796', 1.45, 2.2, 1.8);
            pLight.position.set(centerX, underY - 0.035, stripZ + 0.04);
            rt.ledRoot.add(pLight);
            pointLightBudget--;
          }
        }
      }

      // Rebuild Interactive 3D Face Resize Handles (when tool === 'resize' on selected part)
      disposeObjectTree(rt.resizeHandlesRoot);
      rt.resizeHandlesRoot.clear();
      if (
        props.tool === 'resize' &&
        props.selectedPartId &&
        props.explodedAmount < 0.01
      ) {
        const part = props.parts.find((p) => p.id === props.selectedPartId);
        if (part && !part.locked && !part.hidden) {
          const quat = getPartQuaternion(part);
          const centerM = new THREE.Vector3(
            part.position[0] * MM_TO_M,
            part.position[1] * MM_TO_M,
            part.position[2] * MM_TO_M
          );
          const faces: Array<{
            axis: 'x' | 'y' | 'z';
            sign: 1 | -1;
            offsetM: THREE.Vector3;
            color: string;
          }> = [
            { axis: 'x', sign: 1, offsetM: new THREE.Vector3((part.width / 2 + 24) * MM_TO_M, 0, 0), color: '#EF4444' },
            { axis: 'x', sign: -1, offsetM: new THREE.Vector3(-(part.width / 2 + 24) * MM_TO_M, 0, 0), color: '#EF4444' },
            { axis: 'y', sign: 1, offsetM: new THREE.Vector3(0, (part.height / 2 + 24) * MM_TO_M, 0), color: '#10B981' },
            { axis: 'y', sign: -1, offsetM: new THREE.Vector3(0, -(part.height / 2 + 24) * MM_TO_M, 0), color: '#10B981' },
            { axis: 'z', sign: 1, offsetM: new THREE.Vector3(0, 0, (part.depth / 2 + 24) * MM_TO_M), color: '#3B82F6' },
            { axis: 'z', sign: -1, offsetM: new THREE.Vector3(0, 0, -(part.depth / 2 + 24) * MM_TO_M), color: '#3B82F6' },
          ];
          for (const f of faces) {
            const worldPos = f.offsetM.clone().applyQuaternion(quat).add(centerM);
            const hGeo = new THREE.SphereGeometry(0.019, 14, 12);
            const hMat = new THREE.MeshBasicMaterial({
              color: f.color,
              depthTest: false,
            });
            const handle = new THREE.Mesh(hGeo, hMat);
            handle.position.copy(worldPos);
            handle.renderOrder = 999;
            handle.userData.disposeMaterial = true;
            handle.userData.resizeHandle = {
              partId: part.id,
              axis: f.axis,
              sign: f.sign,
            };
            rt.resizeHandlesRoot.add(handle);
          }
        }
      }

      // Attach TransformControls gizmo: use shared groupPivotProxy for cabinets/multi-selection
      // so rotating or moving transforms the ENTIRE cabinet/group as one rigid body!
      rt.activeGizmoMemberIds.clear();
      if (
        props.selectedPartId &&
        (props.tool === 'move' || props.tool === 'rotate') &&
        props.explodedAmount < 0.01
      ) {
        const activeIds =
          props.selectedPartIds.length > 0 && props.selectedPartIds.includes(props.selectedPartId)
            ? props.selectedPartIds
            : [props.selectedPartId];
        const unlockedParts = props.parts.filter(
          (p) => activeIds.includes(p.id) && !p.locked && !p.hidden && rt.partNodes.has(p.id)
        );

        const isRotateMode = props.tool === 'rotate';
        rt.transform.setMode(isRotateMode ? 'rotate' : 'translate');
        rt.transform.setTranslationSnap(
          !props.magneticSnap && props.snapMm > 0 ? props.snapMm * MM_TO_M : null
        );
        rt.transform.setRotationSnap(
          props.snapMm > 0 ? THREE.MathUtils.degToRad(15) : null
        );

        // On parametric cabinets in Rotate mode, keep only the clean green Y (horizontal) ring active
        // so users NEVER accidentally tip an entire kitchen cabinet onto its side on touchscreens!
        const lockToHorizontalY = Boolean(isRotateMode && props.isParametricCabinetSelected);
        rt.transform.showX = !lockToHorizontalY;
        rt.transform.showY = true;
        rt.transform.showZ = !lockToHorizontalY;

        if (unlockedParts.length > 1) {
          let minX = Infinity;
          let maxX = -Infinity;
          let minY = Infinity;
          let maxY = -Infinity;
          let minZ = Infinity;
          let maxZ = -Infinity;
          for (const p of unlockedParts) {
            const b = getPartWorldBox(p);
            minX = Math.min(minX, b.minX);
            maxX = Math.max(maxX, b.maxX);
            minY = Math.min(minY, b.minY);
            maxY = Math.max(maxY, b.maxY);
            minZ = Math.min(minZ, b.minZ);
            maxZ = Math.max(maxZ, b.maxZ);
            rt.activeGizmoMemberIds.add(p.id);
          }
          rt.groupPivotProxy.position.set(
            ((minX + maxX) / 2) * MM_TO_M,
            ((minY + maxY) / 2) * MM_TO_M,
            ((minZ + maxZ) / 2) * MM_TO_M
          );
          rt.groupPivotProxy.quaternion.identity();
          rt.groupPivotProxy.rotation.set(0, 0, 0);
          rt.groupPivotProxy.scale.set(1, 1, 1);
          rt.groupPivotProxy.userData.isGroupPivot = true;
          rt.groupPivotProxy.userData.memberIds = unlockedParts.map((p) => p.id);
          rt.transform.attach(rt.groupPivotProxy);
        } else if (unlockedParts.length === 1) {
          const singleNode = rt.partNodes.get(unlockedParts[0].id);
          if (singleNode) {
            rt.activeGizmoMemberIds.add(unlockedParts[0].id);
            rt.transform.attach(singleNode);
          }
        }
      }

      if (props.tool !== 'screw') {
        rt.screwPreview.visible = false;
        setScrewHoverHud(null);
      }

      rt.requestRender();
    }, [
      props.parts,
      props.fasteners,
      props.selectedPartId,
      props.selectedPartIds,
      props.selectedFastenerId,
      props.tool,
      props.snapMm,
      props.magneticSnap,
      props.showDimensions,
      props.xrayMode,
      props.showFasteners,
      props.ledUnderCabinet,
      props.explodedAmount,
      props.assemblyStep,
      props.assemblyPlan,
      props.materialsVersion,
      props.customTextures,
      props.collidingPartIds,
      props.fastenerAuditMap,
      props.clearances,
      props.jointZones,
      props.isParametricCabinetSelected,
    ]);

    return (
      <div className="relative w-full h-full overflow-hidden">
        <div ref={mountRef} className="w-full h-full canvas-touch-lock" />
        {/* Live 3D Rotation Degree HUD */}
        {rotateHud && (
          <div className="pointer-events-none absolute top-16 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-xl border border-amber-400/60 bg-[#101216]/95 px-3.5 py-1.5 text-xs shadow-2xl whitespace-nowrap">
            <span className="font-medium text-zinc-300">{rotateHud.title}</span>
            <span className="font-mono-num font-bold text-amber-300">{rotateHud.angles}</span>
          </div>
        )}
        {/* Live 3D Face Resize HUD near cursor */}
        {resizeHud && (
          <div
            style={{
              left: Math.min(Math.max(12, resizeHud.x + 16), window.innerWidth - 220),
              top: Math.max(12, resizeHud.y - 36),
            }}
            className="pointer-events-none absolute z-20 rounded-lg border border-amber-500/70 bg-[#141518]/95 px-2.5 py-1 text-xs font-semibold font-mono-num text-amber-300 shadow-lg whitespace-nowrap"
          >
            {resizeHud.label}
          </div>
        )}
        {/* Live Green/Red Screw Target HUD near cursor */}
        {props.tool === 'screw' && screwHoverHud && (
          <div
            style={{
              left: Math.min(Math.max(12, screwHoverHud.x + 16), window.innerWidth - 250),
              top: Math.max(12, screwHoverHud.y - 38),
            }}
            className={`pointer-events-none absolute z-20 flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold shadow-lg whitespace-nowrap ${
              screwHoverHud.feedback.status === 'ok'
                ? 'border-emerald-500/60 bg-emerald-950/95 text-emerald-100'
                : 'border-red-500/60 bg-red-950/95 text-red-100'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                screwHoverHud.feedback.status === 'ok' ? 'bg-emerald-400' : 'bg-red-400'
              }`}
            />
            <span>
              {screwHoverHud.feedback.status === 'ok'
                ? `Trafia: ${screwHoverHud.feedback.targetPartName} (${screwHoverHud.feedback.embedDepthMm ?? 18} mm)`
                : screwHoverHud.feedback.status === 'through'
                  ? `Przelot przez: ${screwHoverHud.feedback.targetPartName}`
                  : 'Powietrze — brak płyty za ścianką'}
            </span>
          </div>
        )}
        {/* Fixed-Pixel Screen-Space Projected 3D Tape Measure Labels (Always Razor Sharp at Any Zoom) */}
        <div
          ref={measureOverlayRef}
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
        />
        {/* Inline Clickable 3D Clearance Distance Editor Popover */}
        {activeClearanceEdit && props.onSetClearanceDistance && (
          <form
            onSubmit={(ev) => {
              ev.preventDefault();
              const parsed = Number(activeClearanceEdit.value);
              if (!Number.isNaN(parsed) && parsed >= 0) {
                props.onSetClearanceDistance?.(
                  activeClearanceEdit.partId,
                  activeClearanceEdit.guide,
                  Math.max(0, Math.min(5000, Math.round(parsed)))
                );
              }
              setActiveClearanceEdit(null);
            }}
            onPointerDown={(ev) => ev.stopPropagation()}
            style={{
              left: Math.min(
                Math.max(12, activeClearanceEdit.x - 115),
                Math.max(12, window.innerWidth - 252)
              ),
              top: Math.min(
                Math.max(12, activeClearanceEdit.y - 68),
                Math.max(12, window.innerHeight - 190)
              ),
            }}
            className="absolute z-30 w-[236px] rounded-xl border border-sky-500/70 bg-[#141518] p-2.5 text-zinc-100 shadow-2xl space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold text-sky-300 truncate">
                Prześwit → {activeClearanceEdit.guide.targetName}
              </span>
              <button
                type="button"
                onClick={() => setActiveClearanceEdit(null)}
                className="flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
                aria-label="Zamknij edycję prześwitu"
              >
                ×
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                value={activeClearanceEdit.value}
                onChange={(ev) =>
                  setActiveClearanceEdit((prev) =>
                    prev ? { ...prev, value: ev.target.value } : null
                  )
                }
                onKeyDown={(ev) => {
                  if (ev.key === 'Backspace' || ev.key === 'Delete') {
                    ev.stopPropagation();
                  } else if (ev.key === 'Escape') {
                    ev.stopPropagation();
                    setActiveClearanceEdit(null);
                  }
                }}
                className="w-full min-w-0 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono-num text-white focus:border-sky-400 focus:outline-none"
              />
              <span className="text-[11px] font-mono-num text-zinc-400 shrink-0">mm</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  props.onSetClearanceDistance?.(
                    activeClearanceEdit.partId,
                    activeClearanceEdit.guide,
                    0
                  );
                  setActiveClearanceEdit(null);
                }}
                className="flex-1 min-h-[32px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:border-sky-500/60 hover:text-sky-200 whitespace-nowrap cursor-pointer"
              >
                0 mm (na styk)
              </button>
              <button
                type="submit"
                className="min-h-[32px] rounded-lg bg-sky-500 px-3 text-[11px] font-semibold text-zinc-950 hover:bg-sky-400 whitespace-nowrap cursor-pointer"
              >
                Zastosuj
              </button>
            </div>
            <p className="text-[10px] text-zinc-400 leading-tight">
              {activeClearanceEdit.guide.isSameGroup
                ? 'Przesunie tylko tę płytę wewnątrz modułu.'
                : 'Przesunie zaznaczony moduł / płytę względem celu.'}
            </p>
          </form>
        )}
        {contextLost && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-[#EAECEF] p-6">
            <div className="max-w-sm rounded-xl bg-[#141518] px-6 py-5 text-center text-zinc-100 shadow-lg">
              <p className="text-sm font-semibold">Utracono kontekst graficzny WebGL</p>
              <p className="mt-1.5 text-xs text-zinc-400">
                Przeglądarka wstrzymała renderowanie 3D. Odśwież widok, aby przywrócić scenę.
              </p>
            </div>
          </div>
        )}
      </div>
    );
  }
);
