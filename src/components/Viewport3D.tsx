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
import {
  CameraPreset,
  EditorTool,
  Fastener,
  FurniturePart,
  ScrewType,
  StudioLighting,
} from '../types/furniture';
import { MaterialLibrary } from '../engine/materials';
import {
  buildDoorHandleGroup,
  buildFastenerGroup,
  buildPartGeometry,
  M_TO_MM,
  MM_TO_M,
} from '../engine/geometry';
import {
  snapPartToNeighbors,
  type ClearanceGuide,
  type FastenerAudit,
} from '../engine/carpentry';

export interface Viewport3DHandle {
  setCameraPreset: (preset: CameraPreset) => void;
  captureSnapshot: () => string | null;
  focusAll: () => void;
}

interface Viewport3DProps {
  parts: FurniturePart[];
  fasteners: Fastener[];
  selectedPartId: string | null;
  selectedFastenerId: string | null;
  tool: EditorTool;
  activeScrewType: ScrewType;
  snapMm: number;
  magneticSnap: boolean;
  showDimensions: boolean;
  xrayMode: boolean;
  showFasteners: boolean;
  explodedAmount: number;
  lighting: StudioLighting;
  customTextures: Partial<Record<import('../types/furniture').MaterialId, string>>;
  collidingPartIds: Set<string>;
  fastenerAuditMap: Map<string, FastenerAudit>;
  clearances: ClearanceGuide[];
  onSelectPart: (id: string | null) => void;
  onSelectFastener: (id: string | null) => void;
  onTransformPart: (
    id: string,
    position: [number, number, number],
    rotation: [number, number, number]
  ) => void;
  onPlaceFastener: (
    partId: string,
    localPosition: [number, number, number],
    localNormal: [number, number, number]
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

function createClearanceSprite(label: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 72;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 56, 14);
  ctx.fill();
  ctx.strokeStyle = '#0EA5E9';
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.fillStyle = '#F0F9FF';
  ctx.font = 'bold 28px "JetBrains Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 128, 37);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    depthTest: false,
    transparent: true,
  });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(0.22, 0.062, 1);
  sprite.renderOrder = 998;
  sprite.userData.disposeMaterial = true;
  sprite.userData.disposeTexture = tex;
  return sprite;
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
  }
> = {
  daylight: {
    bg: '#EAECEF',
    keyColor: '#FFF8EC',
    keyIntensity: 2.1,
    hemiSky: '#E6F0FA',
    hemiGround: '#D0C8BE',
    hemiIntensity: 1.05,
    rimColor: '#DDEAFF',
    rimIntensity: 0.75,
    exposure: 1.08,
  },
  studio: {
    bg: '#F4F5F7',
    keyColor: '#FFFFFF',
    keyIntensity: 2.35,
    hemiSky: '#F7FAFF',
    hemiGround: '#DCDFE4',
    hemiIntensity: 1.2,
    rimColor: '#F0F6FF',
    rimIntensity: 0.9,
    exposure: 1.12,
  },
  warm: {
    bg: '#E7E2DA',
    keyColor: '#FFE4BC',
    keyIntensity: 2.25,
    hemiSky: '#F5E7D2',
    hemiGround: '#BAA78F',
    hemiIntensity: 0.92,
    rimColor: '#C8D8F0',
    rimIntensity: 0.65,
    exposure: 1.04,
  },
};

export const Viewport3D = forwardRef<Viewport3DHandle, Viewport3DProps>(
  function Viewport3D(props, ref) {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const [contextLost, setContextLost] = useState(false);

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
      materials: MaterialLibrary;
      partsRoot: THREE.Group;
      guidesRoot: THREE.Group;
      partNodes: Map<string, THREE.Group>;
      partBasePos: Map<string, THREE.Vector3>;
      partExplodeDir: Map<string, THREE.Vector3>;
      screwPreview: THREE.Group;
      keyLight: THREE.DirectionalLight;
      hemiLight: THREE.HemisphereLight;
      rimLight: THREE.DirectionalLight;
      contactShadow: THREE.Mesh;
      requestRender: () => void;
      startCameraTransition: (pos: THREE.Vector3, target: THREE.Vector3) => void;
      setExplodedTarget: (v: number) => void;
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
      captureSnapshot() {
        const rt = runtimeRef.current;
        if (!rt) return null;
        // Hide gizmo, guides & screw preview cleanly for studio photo export
        const helper = (rt.transform as unknown as { getHelper?: () => THREE.Object3D }).getHelper?.();
        const prevHelperVis = helper ? helper.visible : true;
        const prevPreviewVis = rt.screwPreview.visible;
        const prevGuidesVis = rt.guidesRoot.visible;
        if (helper) helper.visible = false;
        rt.screwPreview.visible = false;
        rt.guidesRoot.visible = false;

        rt.renderer.render(rt.scene, rt.camera);
        const dataUrl = rt.renderer.domElement.toDataURL('image/png');

        if (helper) helper.visible = prevHelperVis;
        rt.screwPreview.visible = prevPreviewVis;
        rt.guidesRoot.visible = prevGuidesVis;
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
      keyLight.position.set(3.2, 5.4, 3.6);
      keyLight.castShadow = !isSoftwareGl;
      keyLight.shadow.mapSize.set(2048, 2048);
      keyLight.shadow.camera.near = 0.5;
      keyLight.shadow.camera.far = 16;
      const d = 2.6;
      keyLight.shadow.camera.left = -d;
      keyLight.shadow.camera.right = d;
      keyLight.shadow.camera.top = d;
      keyLight.shadow.camera.bottom = -d;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
      scene.add(keyLight);

      const rimLight = new THREE.DirectionalLight(
        initialLight.rimColor,
        initialLight.rimIntensity
      );
      rimLight.position.set(-3.5, 2.8, -3.2);
      scene.add(rimLight);

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

      const guidesRoot = new THREE.Group();
      scene.add(guidesRoot);

      // Screw placement hover preview marker
      const screwPreview = new THREE.Group();
      screwPreview.visible = false;
      const ringGeo = new THREE.RingGeometry(0.007, 0.0115, 24);
      ringGeo.rotateX(-Math.PI / 2);
      const ringMat = new THREE.MeshBasicMaterial({
        color: '#F59E0B',
        side: THREE.DoubleSide,
        depthTest: false,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.renderOrder = 999;
      const pinGeo = new THREE.CylinderGeometry(0.0018, 0.0018, 0.032, 10);
      const pinMat = new THREE.MeshBasicMaterial({
        color: '#F59E0B',
        depthTest: false,
      });
      const pinMesh = new THREE.Mesh(pinGeo, pinMat);
      pinMesh.position.y = 0.016;
      pinMesh.renderOrder = 999;
      screwPreview.add(ringMesh, pinMesh);
      scene.add(screwPreview);

      // TransformControls for interactive Move / Rotate gizmo (larger touch handles on phones)
      const transform = new TransformControls(camera, renderer.domElement);
      transform.setSize(isTouchDevice ? 1.28 : 0.88);
      const transformHelper = (
        transform as unknown as { getHelper?: () => THREE.Object3D }
      ).getHelper
        ? (transform as unknown as { getHelper: () => THREE.Object3D }).getHelper()
        : (transform as unknown as THREE.Object3D);
      scene.add(transformHelper);

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

      function applyExplodedOffsets(amount: number) {
        partNodes.forEach((node, id) => {
          const base = partBasePos.get(id);
          const dir = partExplodeDir.get(id);
          if (!base || !dir) return;
          // Do not override actively dragged gizmo object
          if (runtimeRef.current?.isDraggingGizmo && transform.object === node) {
            return;
          }
          node.position.copy(base).addScaledVector(dir, amount * 0.28);
        });
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

          // Smooth exploded-view damping
          if (Math.abs(explodedCurrent - explodedTarget) > 0.001) {
            explodedCurrent = isSoftwareGl
              ? explodedTarget
              : THREE.MathUtils.damp(explodedCurrent, explodedTarget, 10, dt);
            applyExplodedOffsets(explodedCurrent);
            if (Math.abs(explodedCurrent - explodedTarget) > 0.001) {
              needsMoreFrames = true;
            }
          }

          const orbitMoved = orbit.update();
          if (orbitMoved && orbit.enableDamping) {
            needsMoreFrames = true;
          }

          renderer.render(scene, camera);

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
          applyExplodedOffsets(v);
        }
        requestRender();
      };

      runtimeRef.current = {
        renderer,
        scene,
        camera,
        orbit,
        transform,
        materials,
        partsRoot,
        guidesRoot,
        partNodes,
        partBasePos,
        partExplodeDir,
        screwPreview,
        keyLight,
        hemiLight,
        rimLight,
        contactShadow,
        requestRender,
        startCameraTransition,
        setExplodedTarget,
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

      transform.addEventListener('dragging-changed', (ev) => {
        const dragging = Boolean((ev as { value?: unknown }).value);
        if (runtimeRef.current) {
          runtimeRef.current.isDraggingGizmo = dragging;
        }
        orbit.enabled = !dragging;
        if (!dragging && transform.object) {
          const partId = transform.object.userData.partId as string | undefined;
          if (partId) {
            const rawPosMm: [number, number, number] = [
              transform.object.position.x * M_TO_MM,
              transform.object.position.y * M_TO_MM,
              transform.object.position.z * M_TO_MM,
            ];
            const pos = computeSnappedTransformPos(partId, rawPosMm);
            const rot: [number, number, number] = [
              Math.round(THREE.MathUtils.radToDeg(transform.object.rotation.x)),
              Math.round(THREE.MathUtils.radToDeg(transform.object.rotation.y)),
              Math.round(THREE.MathUtils.radToDeg(transform.object.rotation.z)),
            ];
            propsRef.current.onTransformPart(partId, pos, rot);
          }
        }
        requestRender();
      });
      transform.addEventListener('change', () => {
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

      // Pointer / Touch Picking & Screw Surface Placement (with multi-touch pinch guard)
      const raycaster = new THREE.Raycaster();
      const activePointers = new Set<number>();
      let gestureWasMultiTouch = false;
      let downX = 0;
      let downY = 0;
      let downTime = 0;
      let lastMoveRaycast = 0;

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

      const onPointerDown = (e: PointerEvent) => {
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        activePointers.add(e.pointerId);
        if (activePointers.size > 1) {
          gestureWasMultiTouch = true;
          screwPreview.visible = false;
          return;
        }
        gestureWasMultiTouch = false;
        downX = e.clientX;
        downY = e.clientY;
        downTime = performance.now();
      };

      const onPointerCancel = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0) {
          gestureWasMultiTouch = false;
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        if (e.pointerType === 'touch') return;
        if (propsRef.current.tool !== 'screw') {
          if (screwPreview.visible) {
            screwPreview.visible = false;
            requestRender();
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
          const hitObj = hit.object;
          _mat3A.getNormalMatrix(hitObj.matrixWorld);
          _vec3A.copy(hit.face.normal).applyMatrix3(_mat3A).normalize();
          screwPreview.position.copy(hit.point).addScaledVector(_vec3A, 0.0015);
          _quatA.setFromUnitVectors(_upVec, _vec3A);
          screwPreview.quaternion.copy(_quatA);
          screwPreview.visible = true;
          requestRender();
        } else if (screwPreview.visible) {
          screwPreview.visible = false;
          requestRender();
        }
      };

      const onPointerUp = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        const wasMulti = gestureWasMultiTouch;
        if (activePointers.size === 0) {
          gestureWasMultiTouch = false;
        }
        if (wasMulti || activePointers.size > 0) return;
        if (e.button !== 0 && e.pointerType === 'mouse') return;
        if (runtimeRef.current?.isDraggingGizmo) return;
        const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
        const elapsed = performance.now() - downTime;
        const maxTapDist = e.pointerType === 'touch' ? 14 : 7;
        // Distinguish intentional click/tap from orbit drag
        if (dist > maxTapDist || elapsed > 500) return;

        updateNdc(e.clientX, e.clientY);
        raycaster.setFromCamera(_pointerNdc, camera);
        const targets = collectRaycastTargets();
        const hits = raycaster.intersectObjects(targets, true);

        if (hits.length === 0) {
          if (propsRef.current.tool !== 'screw') {
            propsRef.current.onSelectPart(null);
            propsRef.current.onSelectFastener(null);
          }
          return;
        }

        // Check if user tapped an existing fastener
        let obj: THREE.Object3D | null = hits[0].object;
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

        if (fastenerId) {
          propsRef.current.onSelectFastener(fastenerId);
          return;
        }

        if (propsRef.current.tool === 'screw' && partId && hits[0].face) {
          const parentGroup = partNodes.get(partId);
          if (parentGroup) {
            parentGroup.updateWorldMatrix(true, false);
            // Convert hit world point to parent local coordinates (mm)
            _vec3B.copy(hits[0].point);
            parentGroup.worldToLocal(_vec3B);

            const snap = propsRef.current.snapMm;
            // Face normal in local space
            _vec3C.copy(hits[0].face.normal).normalize();

            // Snap coordinates parallel to the surface so screws align neatly
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

            propsRef.current.onPlaceFastener(partId, localPosMm, localNorm);
          }
          return;
        }

        if (partId) {
          propsRef.current.onSelectPart(partId);
        }
      };

      const dom = renderer.domElement;
      dom.addEventListener('pointerdown', onPointerDown);
      dom.addEventListener('pointermove', onPointerMove);
      dom.addEventListener('pointerup', onPointerUp);
      dom.addEventListener('pointercancel', onPointerCancel);

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
        dom.removeEventListener('webglcontextlost', handleContextLost);
        dom.removeEventListener('webglcontextrestored', handleContextRestored);

        transform.detach();
        transform.dispose();
        orbit.dispose();
        disposeObjectTree(partsRoot);
        disposeObjectTree(guidesRoot);
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

    // Sync lighting preset
    useEffect(() => {
      const rt = runtimeRef.current;
      if (!rt) return;
      const cfg = LIGHTING_CONFIGS[props.lighting];
      rt.scene.background = new THREE.Color(cfg.bg);
      rt.scene.fog = new THREE.Fog(cfg.bg, 7.5, 22);
      rt.keyLight.color.set(cfg.keyColor);
      rt.keyLight.intensity = cfg.keyIntensity;
      rt.hemiLight.color.set(cfg.hemiSky);
      rt.hemiLight.groundColor.set(cfg.hemiGround);
      rt.hemiLight.intensity = cfg.hemiIntensity;
      rt.rimLight.color.set(cfg.rimColor);
      rt.rimLight.intensity = cfg.rimIntensity;
      rt.renderer.toneMappingExposure = cfg.exposure;
      rt.requestRender();
    }, [props.lighting]);

    // Sync exploded view target
    useEffect(() => {
      runtimeRef.current?.setExplodedTarget(props.explodedAmount);
    }, [props.explodedAmount]);

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
      rt.partExplodeDir.clear();

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

      for (const part of props.parts) {
        const group = new THREE.Group();
        group.userData.partId = part.id;

        const basePos = new THREE.Vector3(
          part.position[0] * MM_TO_M,
          part.position[1] * MM_TO_M,
          part.position[2] * MM_TO_M
        );
        const dir = basePos.clone().sub(centroid);
        if (dir.lengthSq() < 0.0001) {
          dir.set(0, 0.2, 0);
        } else {
          dir.normalize().multiplyScalar(Math.min(1.4, basePos.distanceTo(centroid) + 0.35));
        }

        rt.partBasePos.set(part.id, basePos);
        rt.partExplodeDir.set(part.id, dir);

        group.position.copy(basePos).addScaledVector(dir, props.explodedAmount * 0.28);
        group.rotation.set(
          THREE.MathUtils.degToRad(part.rotation[0]),
          THREE.MathUtils.degToRad(part.rotation[1]),
          THREE.MathUtils.degToRad(part.rotation[2]),
          'XYZ'
        );

        const geo = buildPartGeometry(part);
        const mat = rt.materials.getMaterial(part.materialId, props.xrayMode);
        const mesh = new THREE.Mesh(geo, mat);
        mesh.name = 'main_mesh';
        mesh.userData.partId = part.id;
        mesh.userData.raycastKind = 'part_mesh';
        mesh.castShadow = !props.xrayMode && part.materialId !== 'glass_clear';
        mesh.receiveShadow = true;
        group.add(mesh);

        // Cabinet door metallic handle
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

        // Crisp architectural outline for colliding, selected, or X-Ray parts
        const isSelected = part.id === props.selectedPartId;
        const isColliding = props.collidingPartIds.has(part.id);
        if (isSelected || isColliding || props.xrayMode) {
          const edgesGeo = new THREE.EdgesGeometry(geo, 22);
          const edgesMat = new THREE.LineBasicMaterial({
            color: isColliding ? '#EF4444' : isSelected ? '#F59E0B' : '#4B5563',
            transparent: !isSelected && !isColliding,
            opacity: isSelected || isColliding ? 1 : 0.35,
          });
          const edges = new THREE.LineSegments(edgesGeo, edgesMat);
          edges.userData.disposeMaterial = true;
          group.add(edges);
        }

        // Attached fasteners anchored in local board coordinates
        const partFasteners = fastenersByPart.get(part.id) ?? [];
        for (const f of partFasteners) {
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

      // Rebuild 3D Clearance Dimension Guides ("Prześwity w świetle")
      disposeObjectTree(rt.guidesRoot);
      rt.guidesRoot.clear();
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
        };
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
          const isVertical = g.direction === 'up' || g.direction === 'down';
          const tickOff = isVertical
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
          const sprite = createClearanceSprite(`${dirArrows[g.direction]} ${g.distanceMm} mm`);
          sprite.position.copy(mid);
          rt.guidesRoot.add(sprite);
        }
        lineMat.dispose();
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

      // Attach TransformControls gizmo if Move or Rotate tool is active on a selected part
      if (
        props.selectedPartId &&
        (props.tool === 'move' || props.tool === 'rotate') &&
        props.explodedAmount < 0.01
      ) {
        const selectedNode = rt.partNodes.get(props.selectedPartId);
        if (selectedNode) {
          rt.transform.setMode(props.tool === 'move' ? 'translate' : 'rotate');
          rt.transform.setTranslationSnap(
            !props.magneticSnap && props.snapMm > 0 ? props.snapMm * MM_TO_M : null
          );
          rt.transform.setRotationSnap(
            props.snapMm > 0 ? THREE.MathUtils.degToRad(15) : null
          );
          rt.transform.attach(selectedNode);
        }
      }

      if (props.tool !== 'screw') {
        rt.screwPreview.visible = false;
      }

      rt.requestRender();
    }, [
      props.parts,
      props.fasteners,
      props.selectedPartId,
      props.selectedFastenerId,
      props.tool,
      props.snapMm,
      props.magneticSnap,
      props.showDimensions,
      props.xrayMode,
      props.showFasteners,
      props.explodedAmount,
      props.customTextures,
      props.collidingPartIds,
      props.fastenerAuditMap,
      props.clearances,
    ]);

    return (
      <div className="relative w-full h-full overflow-hidden">
        <div ref={mountRef} className="w-full h-full canvas-touch-lock" />
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
