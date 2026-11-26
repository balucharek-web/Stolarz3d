import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  AppWindow,
  Check,
  Columns2,
  Compass,
  Crosshair,
  DoorOpen,
  Eye,
  EyeOff,
  Flame,
  Maximize2,
  MousePointer2,
  Pencil,
  PlugZap,
  Plus,
  RotateCcw,
  Scissors,
  Trash2,
  Undo2,
  Wrench,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  DEFAULT_ROOM_CONFIG,
  DEFAULT_ROOM_STYLE,
  type FurniturePart,
  type RoomConfig,
  type RoomCutawayMode,
  type RoomFloorFinish,
  type RoomOpening,
  type RoomOpeningType,
  type RoomVertex,
  type RoomWallFinish,
  type RoomWallObstacle,
  type RoomWallObstacleType,
} from '../types/furniture';
import {
  analyzeDoorSwingCollisions,
  auditRoomClearances,
  getPartWorldBox,
  type RoomClearanceIssue,
} from '../engine/carpentry';
import {
  FLOOR_FINISH_CATALOG,
  OPENING_PRESETS,
  WALL_FINISH_CATALOG,
  WALL_OBSTACLE_PRESETS,
  buildRoomPreset,
  computeFurnitureFootprintXZ,
  computeRoomAreaM2,
  computeRoomBoundsXZ,
  computeRoomPerimeterM,
  computeWallSegments,
  deleteRoomVertex,
  getRoomPolygonPoints,
  getRoomStyle,
  normalizeRoomPolygonWinding,
  projectPointOntoWall,
  resizeWallSegmentLength,
  splitWallSegment,
  syncRoomWithPolygon,
  type RoomShapePresetId,
  type WallSegment,
} from '../engine/roomGeometry';

interface RoomSettingsModalProps {
  open: boolean;
  parts: FurniturePart[];
  room: RoomConfig | undefined;
  roomIssues: RoomClearanceIssue[];
  onClose: () => void;
  onSaveRoom: (room: RoomConfig) => void;
}

type CanvasTool =
  | 'select'
  | 'draw'
  | 'place_door'
  | 'place_window'
  | 'place_balcony'
  | 'place_arch'
  | 'place_radiator'
  | 'place_socket'
  | 'place_pipe';

type InspectorTab = 'shape' | 'elements' | 'style' | 'audit';

type SelectionTarget =
  | { kind: 'none' }
  | { kind: 'wall'; wallIndex: number }
  | { kind: 'vertex'; vertexIndex: number }
  | { kind: 'opening'; id: string }
  | { kind: 'obstacle'; id: string };

type DragMode =
  | { kind: 'pan'; startClientX: number; startClientY: number; startPanX: number; startPanZ: number }
  | { kind: 'vertex'; vertexIndex: number }
  | {
      kind: 'wall';
      wallIndex: number;
      startWorldX: number;
      startWorldZ: number;
      origPts: RoomVertex[];
      nx: number;
      nz: number;
    }
  | { kind: 'opening'; id: string }
  | { kind: 'obstacle'; id: string };

const PRESET_CARDS: Array<{ id: RoomShapePresetId; label: string; desc: string }> = [
  { id: 'rectangle', label: 'Prostokąt', desc: 'Klasyczny pokój' },
  { id: 'alcove', label: 'Wnęka', desc: 'Pod wymiar mebla' },
  { id: 'l_shape', label: 'Litera L', desc: 'Kuchnia / salon' },
  { id: 'u_shape', label: 'Litera U', desc: 'Zabudowa 3-str.' },
  { id: 'chamfered', label: 'Ze skosem 45°', desc: 'Narożnik ścięty' },
];

const CUTAWAY_MODES: Array<{ id: RoomCutawayMode; label: string; hint: string }> = [
  {
    id: 'smart_cutaway',
    label: 'Inteligentne',
    hint: 'Przednie ściany automatycznie znikają od strony kamery — jak w PRO100',
  },
  {
    id: 'solid',
    label: 'Pełne 3D',
    hint: 'Pełna grubość muru ze wszystkich stron wraz z cieniami',
  },
  {
    id: 'translucent',
    label: 'Szkic CAD',
    hint: 'Półprzezroczyste ściany techniczne',
  },
];

function createInitialDraft(room: RoomConfig | undefined, parts: FurniturePart[]): RoomConfig {
  if (room && room.floorPoints && room.floorPoints.length >= 3) {
    return syncRoomWithPolygon(structuredClone(room));
  }
  if (room && room.enabled) {
    // Migrate legacy rectangle room into polygon while preserving obstacles & dims
    return syncRoomWithPolygon(structuredClone(room));
  }
  const preset = buildRoomPreset('rectangle', parts, DEFAULT_ROOM_CONFIG.heightMm);
  return syncRoomWithPolygon({
    ...structuredClone(DEFAULT_ROOM_CONFIG),
    enabled: true,
    floorPoints: preset.floorPoints,
    openings: preset.openings,
    wallObstacles: preset.wallObstacles,
    style: { ...DEFAULT_ROOM_STYLE },
  });
}

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  open,
  parts,
  room,
  roomIssues,
  onClose,
  onSaveRoom,
}) => {
  const [draft, setDraft] = useState<RoomConfig>(() => createInitialDraft(room, parts));
  const [history, setHistory] = useState<RoomConfig[]>([]);
  const [lastOpen, setLastOpen] = useState(false);

  const [tool, setTool] = useState<CanvasTool>('select');
  const [tab, setTab] = useState<InspectorTab>('shape');
  const [selection, setSelection] = useState<SelectionTarget>({ kind: 'none' });

  // Blueprint viewport state (world mm centered at viewCenter, pxPerMm scale)
  const [viewCenter, setViewCenter] = useState<{ x: number; z: number }>({ x: 0, z: 900 });
  const [pxPerMm, setPxPerMm] = useState<number>(0.13);
  const [snapMm, setSnapMm] = useState<number>(50);
  const [orthoSnap, setOrthoSnap] = useState<boolean>(true);

  // Drawing custom polygon state
  const [drawPoints, setDrawPoints] = useState<RoomVertex[]>([]);
  const [cursorWorld, setCursorWorld] = useState<{ x: number; z: number } | null>(null);
  const [snapGuides, setSnapGuides] = useState<{ x?: number; z?: number }>({});

  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgSize, setSvgSize] = useState<{ w: number; h: number }>({ w: 800, h: 560 });
  const dragRef = useRef<DragMode | null>(null);
  const dragSnapshotRef = useRef<RoomConfig | null>(null);

  const fitViewToRoom = useCallback(
    (targetRoom: RoomConfig, containerW: number, containerH: number) => {
      const pts = getRoomPolygonPoints(targetRoom);
      const rb = computeRoomBoundsXZ(pts);
      const fb = computeFurnitureFootprintXZ(parts);
      const minX = fb ? Math.min(rb.minX, fb.minX) : rb.minX;
      const maxX = fb ? Math.max(rb.maxX, fb.maxX) : rb.maxX;
      const minZ = fb ? Math.min(rb.minZ, fb.minZ) : rb.minZ;
      const maxZ = fb ? Math.max(rb.maxZ, fb.maxZ) : rb.maxZ;
      const spanX = Math.max(1200, maxX - minX + 1200);
      const spanZ = Math.max(1200, maxZ - minZ + 1200);
      const scale = Math.max(
        0.04,
        Math.min(0.32, Math.min((containerW - 60) / spanX, (containerH - 60) / spanZ))
      );
      setViewCenter({ x: (minX + maxX) / 2, z: (minZ + maxZ) / 2 });
      setPxPerMm(scale);
    },
    [parts]
  );

  // Reset state cleanly when modal opens
  if (open && !lastOpen) {
    setLastOpen(true);
    const next = createInitialDraft(room, parts);
    setDraft(next);
    setHistory([]);
    setTool('select');
    setSelection({ kind: 'none' });
    setDrawPoints([]);
    setSnapGuides({});
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  // Track SVG canvas container size & auto-fit on open
  useEffect(() => {
    if (!open) return;
    const el = svgRef.current;
    if (!el) return;
    const updateSize = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 50 && rect.height > 50) {
        setSvgSize({ w: rect.width, h: rect.height });
      }
    };
    updateSize();
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (open && svgSize.w > 100 && svgSize.h > 100) {
      fitViewToRoom(draft, svgSize.w, svgSize.h);
    }
    // Only auto-fit once when modal opens or canvas first measures
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, svgSize.w > 100]);

  const points = useMemo(() => getRoomPolygonPoints(draft), [draft]);
  const segments = useMemo(() => computeWallSegments(points), [points]);
  const areaM2 = useMemo(() => computeRoomAreaM2(points), [points]);
  const perimeterM = useMemo(() => computeRoomPerimeterM(points), [points]);
  const style = useMemo(() => getRoomStyle(draft), [draft]);
  const wallThicknessMm = draft.wallThicknessMm ?? 120;
  const hiddenSet = useMemo(
    () => new Set<number>(draft.hiddenWallIndices ?? []),
    [draft.hiddenWallIndices]
  );

  const furnitureBoxes = useMemo(() => {
    if (!open) return [];
    return parts.map((p) => {
      const b = getPartWorldBox(p);
      return {
        id: p.id,
        name: p.name,
        kind: p.kind,
        minX: b.minX,
        maxX: b.maxX,
        minZ: b.minZ,
        maxZ: b.maxZ,
      };
    });
  }, [open, parts]);

  const furnitureOverall = useMemo(
    () => computeFurnitureFootprintXZ(parts),
    [parts]
  );

  const liveIssues = useMemo(
    () => (open ? auditRoomClearances(parts, draft) : roomIssues),
    [open, parts, draft, roomIssues]
  );

  const liveSwingIssues = useMemo(
    () => (open ? analyzeDoorSwingCollisions(parts, draft) : []),
    [open, parts, draft]
  );

  // Undo-aware room mutation
  const commitDraft = useCallback(
    (updater: (prev: RoomConfig) => RoomConfig) => {
      setDraft((prev) => {
        setHistory((h) => [...h.slice(-24), prev]);
        return syncRoomWithPolygon(updater(prev));
      });
    },
    []
  );

  const handleUndo = useCallback(() => {
    if (tool === 'draw' && drawPoints.length > 0) {
      setDrawPoints((pts) => pts.slice(0, -1));
      return;
    }
    setHistory((h) => {
      if (h.length === 0) return h;
      const previous = h[h.length - 1];
      setDraft(previous);
      return h.slice(0, -1);
    });
  }, [tool, drawPoints.length]);

  // Coordinate conversions: world mm <-> SVG viewport px
  const worldToScreen = useCallback(
    (xMm: number, zMm: number) => ({
      sx: svgSize.w / 2 + (xMm - viewCenter.x) * pxPerMm,
      sy: svgSize.h / 2 + (zMm - viewCenter.z) * pxPerMm,
    }),
    [svgSize, viewCenter, pxPerMm]
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, z: 0 };
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      return {
        x: viewCenter.x + (sx - svgSize.w / 2) / pxPerMm,
        z: viewCenter.z + (sy - svgSize.h / 2) / pxPerMm,
      };
    },
    [svgSize, viewCenter, pxPerMm]
  );

  const snapCoord = useCallback(
    (val: number) => (snapMm > 0 ? Math.round(val / snapMm) * snapMm : Math.round(val)),
    [snapMm]
  );

  // Snap cursor point for drawing mode (grid + 90/45 deg ortho + close-to-first-vertex magnet)
  const getSnappedDrawPoint = useCallback(
    (raw: { x: number; z: number }): { x: number; z: number; closing: boolean } => {
      if (drawPoints.length >= 3) {
        const first = drawPoints[0];
        const distPx = Math.hypot(raw.x - first.xMm, raw.z - first.zMm) * pxPerMm;
        if (distPx < 18) {
          return { x: first.xMm, z: first.zMm, closing: true };
        }
      }

      let x = snapCoord(raw.x);
      let z = snapCoord(raw.z);

      if (orthoSnap && drawPoints.length > 0) {
        const prev = drawPoints[drawPoints.length - 1];
        const dx = raw.x - prev.xMm;
        const dz = raw.z - prev.zMm;
        const len = Math.hypot(dx, dz);
        if (len > 20) {
          const angle = Math.atan2(dz, dx);
          // Snap to nearest 45 deg increment (0, 45, 90, 135, 180...)
          const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
          if (Math.abs(angle - snappedAngle) < 0.2) {
            const snappedLen = snapCoord(len);
            x = Math.round(prev.xMm + Math.cos(snappedAngle) * snappedLen);
            z = Math.round(prev.zMm + Math.sin(snappedAngle) * snappedLen);
          }
        }
      }

      // Align with first vertex X or Z for easy right-angle room closure
      if (drawPoints.length >= 2) {
        const first = drawPoints[0];
        if (Math.abs(x - first.xMm) * pxPerMm < 12) x = first.xMm;
        if (Math.abs(z - first.zMm) * pxPerMm < 12) z = first.zMm;
      }

      return { x, z, closing: false };
    },
    [drawPoints, pxPerMm, snapCoord, orthoSnap]
  );

  // Find closest wall segment to cursor for placing doors/windows/obstacles
  const hoverWallPlacement = useMemo(() => {
    if (!cursorWorld || tool === 'select' || tool === 'draw') return null;
    let bestSeg: WallSegment | null = null;
    let bestDist = Infinity;
    let bestOffset = 0;

    for (const seg of segments) {
      const proj = projectPointOntoWall(cursorWorld.x, cursorWorld.z, seg);
      if (proj.clampedDistMm < bestDist) {
        bestDist = proj.clampedDistMm;
        bestSeg = seg;
        bestOffset = proj.offsetMm;
      }
    }

    if (!bestSeg || bestDist * pxPerMm > 34) return null;

    const isOpening =
      tool === 'place_door' ||
      tool === 'place_window' ||
      tool === 'place_balcony' ||
      tool === 'place_arch';

    const openingTypeMap: Record<string, RoomOpeningType> = {
      place_door: 'door_single',
      place_window: 'window',
      place_balcony: 'window_balcony',
      place_arch: 'arch',
    };
    const obsTypeMap: Record<string, RoomWallObstacleType> = {
      place_radiator: 'radiator',
      place_socket: 'socket',
      place_pipe: 'pipe',
    };

    const itemWidth = isOpening
      ? Math.min(OPENING_PRESETS[openingTypeMap[tool]].widthMm, Math.max(300, bestSeg.lengthMm - 80))
      : Math.min(WALL_OBSTACLE_PRESETS[obsTypeMap[tool]].widthMm, Math.max(40, bestSeg.lengthMm - 40));

    const rawStart = bestOffset - itemWidth / 2;
    const clampedStart = Math.max(
      0,
      Math.min(bestSeg.lengthMm - itemWidth, snapCoord(rawStart))
    );

    return {
      seg: bestSeg,
      isOpening,
      openingType: isOpening ? openingTypeMap[tool] : undefined,
      obsType: !isOpening ? obsTypeMap[tool] : undefined,
      offsetMm: clampedStart,
      widthMm: itemWidth,
      remainingRightMm: Math.max(0, Math.round(bestSeg.lengthMm - clampedStart - itemWidth)),
    };
  }, [cursorWorld, tool, segments, pxPerMm, snapCoord]);

  const finishDrawingPolygon = useCallback(() => {
    if (drawPoints.length < 3) return;
    const normalized = normalizeRoomPolygonWinding(drawPoints);
    commitDraft((prev) => ({
      ...prev,
      enabled: true,
      floorPoints: normalized,
      openings: [],
      wallObstacles: [],
      hiddenWallIndices: [],
    }));
    setDrawPoints([]);
    setTool('select');
    setSelection({ kind: 'none' });
  }, [drawPoints, commitDraft]);

  // Keyboard shortcuts inside modal (Esc, Enter, Delete, Ctrl+Z)
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA')) {
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
      } else if (e.key === 'Escape') {
        if (tool === 'draw') {
          setDrawPoints([]);
          setTool('select');
        } else if (tool !== 'select') {
          setTool('select');
        } else {
          setSelection({ kind: 'none' });
        }
      } else if (e.key === 'Enter' && tool === 'draw' && drawPoints.length >= 3) {
        e.preventDefault();
        finishDrawingPolygon();
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && tool === 'select') {
        if (selection.kind === 'opening') {
          commitDraft((prev) => ({
            ...prev,
            openings: (prev.openings ?? []).filter((o) => o.id !== selection.id),
          }));
          setSelection({ kind: 'none' });
        } else if (selection.kind === 'obstacle') {
          commitDraft((prev) => ({
            ...prev,
            wallObstacles: (prev.wallObstacles ?? []).filter((o) => o.id !== selection.id),
          }));
          setSelection({ kind: 'none' });
        } else if (selection.kind === 'vertex' && points.length > 3) {
          commitDraft((prev) => deleteRoomVertex(prev, selection.vertexIndex));
          setSelection({ kind: 'none' });
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, tool, drawPoints.length, selection, points.length, handleUndo, finishDrawingPolygon, commitDraft]);

  const handleApplyPreset = (presetId: RoomShapePresetId) => {
    const preset = buildRoomPreset(presetId, parts, draft.heightMm);
    const nextRoom = syncRoomWithPolygon({
      ...draft,
      enabled: true,
      floorPoints: preset.floorPoints,
      openings: preset.openings,
      wallObstacles: preset.wallObstacles,
      hiddenWallIndices: [],
    });
    commitDraft(() => nextRoom);
    setTool('select');
    setDrawPoints([]);
    setSelection({ kind: 'none' });
    fitViewToRoom(nextRoom, svgSize.w, svgSize.h);
  };

  const handleFitRoomToFurniture = () => {
    const fb = furnitureOverall;
    if (!fb) return;
    const rb = computeRoomBoundsXZ(points);
    // Translate polygon so its back wall (minZ) sits cleanly 15 mm behind furniture back and centered on furniture X
    const shiftX = Math.round((fb.centerX - rb.centerX) / 10) * 10;
    const shiftZ = Math.round((fb.minZ - 15 - rb.minZ) / 10) * 10;
    const shifted = points.map((v) => ({
      ...v,
      xMm: v.xMm + shiftX,
      zMm: v.zMm + shiftZ,
    }));
    const nextRoom = syncRoomWithPolygon({ ...draft, enabled: true, floorPoints: shifted });
    commitDraft(() => nextRoom);
    fitViewToRoom(nextRoom, svgSize.w, svgSize.h);
  };

  const addOpeningOnWall = (wallIndex: number, type: RoomOpeningType, customOffsetMm?: number) => {
    const seg = segments[wallIndex];
    if (!seg) return;
    const preset = OPENING_PRESETS[type];
    const widthMm = Math.min(preset.widthMm, Math.max(300, Math.round(seg.lengthMm - 80)));
    const offsetMm =
      customOffsetMm !== undefined
        ? Math.max(0, Math.min(seg.lengthMm - widthMm, Math.round(customOffsetMm)))
        : Math.max(0, Math.round((seg.lengthMm - widthMm) / 2));
    const maxH = Math.max(400, draft.heightMm - preset.sillHeightMm - 80);
    const op: RoomOpening = {
      id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type,
      label: preset.label,
      wallIndex,
      offsetMm,
      widthMm,
      heightMm: Math.min(preset.heightMm, maxH),
      sillHeightMm: preset.sillHeightMm,
      swingInward: preset.swingInward,
      hingeSide: preset.hingeSide,
    };
    commitDraft((prev) => ({
      ...prev,
      enabled: true,
      openings: [...(prev.openings ?? []), op],
    }));
    setSelection({ kind: 'opening', id: op.id });
    setTab('elements');
  };

  const addWallObstacleOnWall = (
    wallIndex: number,
    type: RoomWallObstacleType,
    customOffsetMm?: number
  ) => {
    const seg = segments[wallIndex];
    if (!seg) return;
    const preset = WALL_OBSTACLE_PRESETS[type];
    const widthMm = Math.min(preset.widthMm, Math.max(50, Math.round(seg.lengthMm - 40)));
    const offsetMm =
      customOffsetMm !== undefined
        ? Math.max(0, Math.min(seg.lengthMm - widthMm, Math.round(customOffsetMm)))
        : Math.max(0, Math.round((seg.lengthMm - widthMm) / 2));
    const obs: RoomWallObstacle = {
      id: `wobs_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type,
      label: preset.label,
      wallIndex,
      offsetMm,
      elevationMm: type === 'pipe' ? 0 : preset.elevationMm,
      widthMm,
      heightMm: type === 'pipe' ? draft.heightMm : preset.heightMm,
      depthMm: preset.depthMm,
    };
    commitDraft((prev) => ({
      ...prev,
      enabled: true,
      wallObstacles: [...(prev.wallObstacles ?? []), obs],
    }));
    setSelection({ kind: 'obstacle', id: obs.id });
    setTab('elements');
  };

  // Pointer handlers on 2D CAD Blueprint Canvas
  const handleCanvasPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button === 2) return;
    const world = screenToWorld(e.clientX, e.clientY);

    if (tool === 'draw') {
      const snapped = getSnappedDrawPoint(world);
      if (snapped.closing && drawPoints.length >= 3) {
        finishDrawingPolygon();
        return;
      }
      // Avoid duplicate point at identical coords
      const last = drawPoints[drawPoints.length - 1];
      if (last && Math.hypot(snapped.x - last.xMm, snapped.z - last.zMm) < 60) {
        return;
      }
      setDrawPoints((prev) => [
        ...prev,
        { id: `dv_${Date.now()}_${prev.length}`, xMm: snapped.x, zMm: snapped.z },
      ]);
      return;
    }

    if (tool !== 'select') {
      if (hoverWallPlacement) {
        if (hoverWallPlacement.isOpening && hoverWallPlacement.openingType) {
          addOpeningOnWall(
            hoverWallPlacement.seg.index,
            hoverWallPlacement.openingType,
            hoverWallPlacement.offsetMm
          );
        } else if (hoverWallPlacement.obsType) {
          addWallObstacleOnWall(
            hoverWallPlacement.seg.index,
            hoverWallPlacement.obsType,
            hoverWallPlacement.offsetMm
          );
        }
        setTool('select');
      }
      return;
    }

    // Empty background drag = pan blueprint
    setSelection({ kind: 'none' });
    dragRef.current = {
      kind: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      startPanX: viewCenter.x,
      startPanZ: viewCenter.z,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const world = screenToWorld(e.clientX, e.clientY);
    setCursorWorld(world);

    const drag = dragRef.current;
    if (!drag) return;

    if (drag.kind === 'pan') {
      const dxPx = e.clientX - drag.startClientX;
      const dzPx = e.clientY - drag.startClientY;
      setViewCenter({
        x: drag.startPanX - dxPx / pxPerMm,
        z: drag.startPanZ - dzPx / pxPerMm,
      });
      return;
    }

    if (drag.kind === 'vertex') {
      let nx = snapCoord(world.x);
      let nz = snapCoord(world.z);
      const guides: { x?: number; z?: number } = {};

      if (orthoSnap) {
        // Magnetic alignment to neighboring vertices
        const n = points.length;
        const prevV = points[(drag.vertexIndex - 1 + n) % n];
        const nextV = points[(drag.vertexIndex + 1) % n];
        for (const neighbor of [prevV, nextV]) {
          if (Math.abs(nx - neighbor.xMm) * pxPerMm < 11) {
            nx = neighbor.xMm;
            guides.x = neighbor.xMm;
          }
          if (Math.abs(nz - neighbor.zMm) * pxPerMm < 11) {
            nz = neighbor.zMm;
            guides.z = neighbor.zMm;
          }
        }
      }
      setSnapGuides(guides);

      setDraft((prev) => {
        const curPts = getRoomPolygonPoints(prev);
        const nextPts = curPts.map((v, idx) =>
          idx === drag.vertexIndex ? { ...v, xMm: nx, zMm: nz } : v
        );
        return syncRoomWithPolygon({ ...prev, floorPoints: nextPts });
      });
      return;
    }

    if (drag.kind === 'wall') {
      // Shift wall cleanly along its normal axis
      const deltaX = world.x - drag.startWorldX;
      const deltaZ = world.z - drag.startWorldZ;
      const projNormal = deltaX * drag.nx + deltaZ * drag.nz;
      const snappedShift = snapCoord(projNormal);
      const sx = Math.round(drag.nx * snappedShift);
      const sz = Math.round(drag.nz * snappedShift);

      const n = drag.origPts.length;
      const i0 = drag.wallIndex;
      const i1 = (drag.wallIndex + 1) % n;
      const nextPts = drag.origPts.map((v, idx) =>
        idx === i0 || idx === i1 ? { ...v, xMm: v.xMm + sx, zMm: v.zMm + sz } : v
      );
      setDraft((prev) => syncRoomWithPolygon({ ...prev, floorPoints: nextPts }));
      return;
    }

    if (drag.kind === 'opening') {
      setDraft((prev) => {
        const op = (prev.openings ?? []).find((o) => o.id === drag.id);
        if (!op) return prev;
        const seg = segments[op.wallIndex];
        if (!seg) return prev;
        const proj = projectPointOntoWall(world.x, world.z, seg);
        const nextOffset = Math.max(
          0,
          Math.min(seg.lengthMm - op.widthMm, snapCoord(proj.offsetMm - op.widthMm / 2))
        );
        return {
          ...prev,
          openings: (prev.openings ?? []).map((o) =>
            o.id === drag.id ? { ...o, offsetMm: nextOffset } : o
          ),
        };
      });
      return;
    }

    if (drag.kind === 'obstacle') {
      setDraft((prev) => {
        const obs = (prev.wallObstacles ?? []).find((o) => o.id === drag.id);
        if (!obs) return prev;
        const seg = segments[obs.wallIndex];
        if (!seg) return prev;
        const proj = projectPointOntoWall(world.x, world.z, seg);
        const nextOffset = Math.max(
          0,
          Math.min(seg.lengthMm - obs.widthMm, snapCoord(proj.offsetMm - obs.widthMm / 2))
        );
        return {
          ...prev,
          wallObstacles: (prev.wallObstacles ?? []).map((o) =>
            o.id === drag.id ? { ...o, offsetMm: nextOffset } : o
          ),
        };
      });
    }
  };

  const handleCanvasPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (dragRef.current && dragRef.current.kind !== 'pan' && dragSnapshotRef.current) {
      const snapBefore = dragSnapshotRef.current;
      setHistory((h) => [...h.slice(-24), snapBefore]);
    }
    dragRef.current = null;
    dragSnapshotRef.current = null;
    setSnapGuides({});
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const handleCanvasWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    setPxPerMm((prev) => Math.max(0.035, Math.min(0.6, prev * factor)));
  };

  const startElementDrag = (e: React.PointerEvent, mode: DragMode, nextSel: SelectionTarget) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    setSelection(nextSel);
    if (nextSel.kind === 'opening' || nextSel.kind === 'obstacle') {
      setTab('elements');
    } else if (nextSel.kind === 'wall' || nextSel.kind === 'vertex') {
      setTab('shape');
    }
    dragSnapshotRef.current = structuredClone(draft);
    dragRef.current = mode;
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  // Compute grid lines for blueprint background
  const gridLines = useMemo(() => {
    const halfWmm = svgSize.w / 2 / pxPerMm;
    const halfHmm = svgSize.h / 2 / pxPerMm;
    const minX = viewCenter.x - halfWmm;
    const maxX = viewCenter.x + halfWmm;
    const minZ = viewCenter.z - halfHmm;
    const maxZ = viewCenter.z + halfHmm;

    const minorStep = pxPerMm < 0.08 ? 500 : 100;
    const majorStep = 1000;

    const xs: Array<{ mm: number; major: boolean }> = [];
    const startX = Math.floor(minX / minorStep) * minorStep;
    for (let x = startX; x <= maxX; x += minorStep) {
      xs.push({ mm: x, major: Math.abs(x % majorStep) < 1 });
    }
    const zs: Array<{ mm: number; major: boolean }> = [];
    const startZ = Math.floor(minZ / minorStep) * minorStep;
    for (let z = startZ; z <= maxZ; z += minorStep) {
      zs.push({ mm: z, major: Math.abs(z % majorStep) < 1 });
    }
    return { xs, zs };
  }, [svgSize, viewCenter, pxPerMm]);

  if (!open) return null;

  const selectedWall =
    selection.kind === 'wall' ? segments[selection.wallIndex] ?? null : null;
  const selectedVertex =
    selection.kind === 'vertex' ? points[selection.vertexIndex] ?? null : null;
  const selectedOpening =
    selection.kind === 'opening'
      ? (draft.openings ?? []).find((o) => o.id === selection.id) ?? null
      : null;
  const selectedObstacle =
    selection.kind === 'obstacle'
      ? (draft.wallObstacles ?? []).find((o) => o.id === selection.id) ?? null
      : null;

  const slope = draft.slopedCeiling ?? {
    enabled: false,
    side: 'right' as const,
    kneeWallHeightMm: 1350,
    slopeWidthMm: 1600,
  };

  const patchDraft = (next: Partial<RoomConfig>) =>
    commitDraft((prev) => ({ ...prev, ...next }));

  const patchStyle = (next: Partial<NonNullable<RoomConfig['style']>>) =>
    commitDraft((prev) => ({
      ...prev,
      style: { ...getRoomStyle(prev), ...next },
    }));

  const patchSlope = (next: Partial<NonNullable<RoomConfig['slopedCeiling']>>) =>
    commitDraft((prev) => ({
      ...prev,
      slopedCeiling: {
        enabled: prev.slopedCeiling?.enabled ?? false,
        side: prev.slopedCeiling?.side ?? 'right',
        kneeWallHeightMm: prev.slopedCeiling?.kneeWallHeightMm ?? 1350,
        slopeWidthMm: prev.slopedCeiling?.slopeWidthMm ?? 1600,
        ...next,
      },
    }));

  const updateOpening = (id: string, patch: Partial<RoomOpening>) => {
    commitDraft((prev) => ({
      ...prev,
      openings: (prev.openings ?? []).map((o) => (o.id === id ? { ...o, ...patch } : o)),
    }));
  };

  const updateWallObstacle = (id: string, patch: Partial<RoomWallObstacle>) => {
    commitDraft((prev) => ({
      ...prev,
      wallObstacles: (prev.wallObstacles ?? []).map((o) =>
        o.id === id ? { ...o, ...patch } : o
      ),
    }));
  };

  const totalIssues = liveIssues.length + liveSwingIssues.length;

  const snappedCursorDraw =
    tool === 'draw' && cursorWorld ? getSnappedDrawPoint(cursorWorld) : null;
  const drawPreviewLenMm =
    tool === 'draw' && drawPoints.length > 0 && snappedCursorDraw
      ? Math.round(
          Math.hypot(
            snappedCursorDraw.x - drawPoints[drawPoints.length - 1].xMm,
            snappedCursorDraw.z - drawPoints[drawPoints.length - 1].zMm
          )
        )
      : 0;
  const drawPreviewAngleDeg =
    tool === 'draw' && drawPoints.length > 0 && snappedCursorDraw
      ? Math.round(
          ((Math.atan2(
            snappedCursorDraw.z - drawPoints[drawPoints.length - 1].zMm,
            snappedCursorDraw.x - drawPoints[drawPoints.length - 1].xMm
          ) *
            180) /
            Math.PI +
            360) %
            360
        )
      : 0;

  const floorPolySvgPoints = points
    .map((v) => {
      const { sx, sy } = worldToScreen(v.xMm, v.zMm);
      return `${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(' ');

  const roomCentroid = (() => {
    const cx = points.reduce((s, p) => s + p.xMm, 0) / Math.max(1, points.length);
    const cz = points.reduce((s, p) => s + p.zMm, 0) / Math.max(1, points.length);
    return worldToScreen(cx, cz);
  })();

  const handleSave = () => {
    const finalRoom = syncRoomWithPolygon(draft);
    onSaveRoom(finalRoom);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-0 sm:p-3 lg:p-5">
      <div className="w-full h-[100dvh] sm:h-[94dvh] sm:max-w-[1380px] sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-4 sm:px-5 py-3 shrink-0 bg-[#141518]">
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-semibold text-white truncate">
              Konfigurator pomieszczenia 2D / 3D
            </h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-zinc-400 tabular-nums">
              <span>{areaM2.toFixed(2).replace('.', ',')} m²</span>
              <span aria-hidden="true">·</span>
              <span>Obwód {perimeterM.toFixed(2).replace('.', ',')} m</span>
              <span aria-hidden="true">·</span>
              <span>Wys. {draft.heightMm} mm</span>
              <span aria-hidden="true">·</span>
              <span>{segments.length} ścian</span>
              {totalIssues > 0 && draft.enabled && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-400 font-medium">
                    {totalIssues} {totalIssues === 1 ? 'kolizja' : 'kolizji'}
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {furnitureOverall && (
              <button
                type="button"
                onClick={handleFitRoomToFurniture}
                className="hidden md:flex min-h-[36px] items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:border-amber-500/60 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Dosuń tylną ścianę pokoju za aktualny mebel i wyśrodkuj"
              >
                <Crosshair className="h-3.5 w-3.5" />
                <span>Dopasuj do mebla</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => patchDraft({ enabled: !draft.enabled })}
              className={`min-h-[36px] rounded-lg px-3 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                draft.enabled
                  ? 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
                  : 'border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white'
              }`}
            >
              {draft.enabled ? 'Widoczne w 3D' : 'Ukryte w 3D'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
              aria-label="Zamknij konfigurator pomieszczenia"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Main Workspace Split: Left 2D Architectural Blueprint + Right Inspector */}
        <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden">
          {/* Left: 2D CAD Blueprint Workspace */}
          <div className="flex-1 min-w-0 min-h-[300px] lg:min-h-0 flex flex-col bg-[#0D0F13] border-b lg:border-b-0 lg:border-r border-zinc-800">
            {/* CAD Tool Ribbon */}
            <div className="flex items-center justify-between gap-2 border-b border-zinc-800/90 bg-[#121419] px-3 py-2 overflow-x-auto cad-scroll shrink-0">
              {/* Primary Tools */}
              <div className="flex items-center gap-1 shrink-0">
                {(
                  [
                    { id: 'select', label: 'Edytuj', icon: MousePointer2 },
                    { id: 'draw', label: 'Rysuj ściany', icon: Pencil },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = tool === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTool(item.id);
                        if (item.id === 'draw') {
                          setDrawPoints([]);
                          setSelection({ kind: 'none' });
                        }
                      }}
                      className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-700 hover:text-white'
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}

                <div className="h-5 w-px bg-zinc-800 mx-1 shrink-0" />

                {/* Architectural Placement Tools */}
                {(
                  [
                    { id: 'place_door', label: 'Drzwi', icon: DoorOpen },
                    { id: 'place_window', label: 'Okno', icon: AppWindow },
                    { id: 'place_balcony', label: 'Balkon', icon: Columns2 },
                    { id: 'place_arch', label: 'Przejście', icon: Maximize2 },
                    { id: 'place_radiator', label: 'Grzejnik', icon: Flame },
                    { id: 'place_socket', label: 'Gniazdko', icon: PlugZap },
                    { id: 'place_pipe', label: 'Pion', icon: Wrench },
                  ] as const
                ).map((item) => {
                  const Icon = item.icon;
                  const active = tool === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setTool(active ? 'select' : item.id);
                        setDrawPoints([]);
                      }}
                      className={`flex min-h-[34px] items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                        active
                          ? 'bg-sky-500 text-zinc-950 font-semibold'
                          : 'bg-zinc-900/80 text-zinc-300 border border-zinc-800 hover:border-sky-500/50 hover:text-sky-300'
                      }`}
                      title={`Kliknij wybraną ścianę, aby wstawić: ${item.label}`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Snap & Zoom Utilities */}
              <div className="flex items-center gap-1 shrink-0 pl-2">
                <button
                  type="button"
                  onClick={handleUndo}
                  disabled={history.length === 0 && drawPoints.length === 0}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-35 cursor-pointer"
                  title="Cofnij (Ctrl+Z)"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setSnapMm((s) => (s === 50 ? 10 : s === 10 ? 0 : 50))}
                  className="min-h-[32px] rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-[11px] font-mono tabular-nums text-zinc-300 hover:text-white whitespace-nowrap shrink-0 cursor-pointer"
                  title="Skok siatki przyciągania"
                >
                  {snapMm > 0 ? `Siatka ${snapMm}` : 'Swobodnie'}
                </button>
                <button
                  type="button"
                  onClick={() => setOrthoSnap((o) => !o)}
                  className={`flex min-h-[32px] items-center gap-1 rounded-lg border px-2 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                    orthoSnap
                      ? 'border-sky-500/50 bg-sky-500/15 text-sky-300'
                      : 'border-zinc-800 bg-zinc-900 text-zinc-400'
                  }`}
                  title="Przyciąganie do kątów 90° / 45°"
                >
                  <Compass className="h-3.5 w-3.5" />
                  <span>90°</span>
                </button>
                <button
                  type="button"
                  onClick={() => setPxPerMm((z) => Math.max(0.035, z / 1.2))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white cursor-pointer"
                  title="Oddal"
                >
                  <ZoomOut className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setPxPerMm((z) => Math.min(0.6, z * 1.2))}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white cursor-pointer"
                  title="Przybliż"
                >
                  <ZoomIn className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => fitViewToRoom(draft, svgSize.w, svgSize.h)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white cursor-pointer"
                  title="Dopasuj widok rzutu"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Interactive SVG 2D Floorplan Stage */}
            <div className="relative flex-1 min-h-0 overflow-hidden select-none">
              <svg
                ref={svgRef}
                className={`w-full h-full touch-none ${
                  tool === 'draw'
                    ? 'cursor-crosshair'
                    : tool !== 'select'
                      ? 'cursor-copy'
                      : 'cursor-grab active:cursor-grabbing'
                }`}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onWheel={handleCanvasWheel}
              >
                {/* Blueprint Grid */}
                <g>
                  {gridLines.xs.map((g) => {
                    const { sx } = worldToScreen(g.mm, 0);
                    return (
                      <line
                        key={`gx_${g.mm}`}
                        x1={sx}
                        y1={0}
                        x2={sx}
                        y2={svgSize.h}
                        stroke={g.mm === 0 ? '#334155' : g.major ? '#1E2430' : '#141820'}
                        strokeWidth={g.mm === 0 ? 1.2 : 1}
                      />
                    );
                  })}
                  {gridLines.zs.map((g) => {
                    const { sy } = worldToScreen(0, g.mm);
                    return (
                      <line
                        key={`gz_${g.mm}`}
                        x1={0}
                        y1={sy}
                        x2={svgSize.w}
                        y2={sy}
                        stroke={g.mm === 0 ? '#334155' : g.major ? '#1E2430' : '#141820'}
                        strokeWidth={g.mm === 0 ? 1.2 : 1}
                      />
                    );
                  })}
                </g>

                {/* Magnetic Alignment Guides while dragging vertex */}
                {snapGuides.x !== undefined && (
                  <line
                    x1={worldToScreen(snapGuides.x, 0).sx}
                    y1={0}
                    x2={worldToScreen(snapGuides.x, 0).sx}
                    y2={svgSize.h}
                    stroke="#38BDF8"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                )}
                {snapGuides.z !== undefined && (
                  <line
                    x1={0}
                    y1={worldToScreen(0, snapGuides.z).sy}
                    x2={svgSize.w}
                    y2={worldToScreen(0, snapGuides.z).sy}
                    stroke="#38BDF8"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                  />
                )}

                {/* Existing Room Floor Polygon (dimmed while drawing a new one) */}
                <g opacity={tool === 'draw' ? 0.3 : 1}>
                  <polygon
                    points={floorPolySvgPoints}
                    fill={FLOOR_FINISH_CATALOG[style.floorFinish].swatch}
                    fillOpacity={0.14}
                    stroke="none"
                  />

                  {/* Room Center Area Label */}
                  <g pointerEvents="none">
                    <text
                      x={roomCentroid.sx}
                      y={roomCentroid.sy - 4}
                      textAnchor="middle"
                      fill="#94A3B8"
                      fontSize="13"
                      fontWeight="600"
                      className="tabular-nums"
                    >
                      {areaM2.toFixed(2).replace('.', ',')} m²
                    </text>
                    <text
                      x={roomCentroid.sx}
                      y={roomCentroid.sy + 12}
                      textAnchor="middle"
                      fill="#64748B"
                      fontSize="10"
                      className="tabular-nums"
                    >
                      H: {draft.heightMm} mm
                    </text>
                  </g>

                  {/* Live Furniture Footprint Overlay */}
                  <g pointerEvents="none">
                    {furnitureBoxes.map((fb) => {
                      const tl = worldToScreen(fb.minX, fb.minZ);
                      const br = worldToScreen(fb.maxX, fb.maxZ);
                      const rw = Math.max(2, br.sx - tl.sx);
                      const rh = Math.max(2, br.sy - tl.sy);
                      return (
                        <rect
                          key={fb.id}
                          x={tl.sx}
                          y={tl.sy}
                          width={rw}
                          height={rh}
                          fill="#F59E0B"
                          fillOpacity={fb.kind === 'door' ? 0.22 : 0.14}
                          stroke="#F59E0B"
                          strokeOpacity={0.55}
                          strokeWidth={0.85}
                        />
                      );
                    })}
                    {furnitureOverall && (
                      <>
                        {(() => {
                          const tl = worldToScreen(furnitureOverall.minX, furnitureOverall.minZ);
                          const br = worldToScreen(furnitureOverall.maxX, furnitureOverall.maxZ);
                          const cx = (tl.sx + br.sx) / 2;
                          const cy = (tl.sy + br.sy) / 2;
                          return (
                            <g>
                              <rect
                                x={tl.sx}
                                y={tl.sy}
                                width={Math.max(4, br.sx - tl.sx)}
                                height={Math.max(4, br.sy - tl.sy)}
                                fill="none"
                                stroke="#FBBF24"
                                strokeWidth={1.2}
                                strokeDasharray="4 3"
                              />
                              <text
                                x={cx}
                                y={cy + 3}
                                textAnchor="middle"
                                fill="#FDE68A"
                                fontSize="10"
                                fontWeight="600"
                                className="tabular-nums"
                              >
                                MEBEL ({furnitureOverall.widthMm}×{furnitureOverall.depthMm})
                              </text>
                            </g>
                          );
                        })()}
                      </>
                    )}
                  </g>

                  {/* Architectural Wall Segments */}
                  {segments.map((seg) => {
                    const isSelected =
                      selection.kind === 'wall' && selection.wallIndex === seg.index;
                    const isHidden = hiddenSet.has(seg.index);
                    const isHoveredForPlacement =
                      hoverWallPlacement?.seg.index === seg.index;

                    const t = wallThicknessMm;
                    const p0 = worldToScreen(seg.start.xMm, seg.start.zMm);
                    const p1 = worldToScreen(seg.end.xMm, seg.end.zMm);
                    const p2 = worldToScreen(
                      seg.end.xMm + seg.outNx * t,
                      seg.end.zMm + seg.outNz * t
                    );
                    const p3 = worldToScreen(
                      seg.start.xMm + seg.outNx * t,
                      seg.start.zMm + seg.outNz * t
                    );

                    const wallPoly = `${p0.sx},${p0.sy} ${p1.sx},${p1.sy} ${p2.sx},${p2.sy} ${p3.sx},${p3.sy}`;

                    // Exterior architectural dimension chain offset
                    const dimOff = t + Math.max(160, 26 / pxPerMm);
                    const d0 = worldToScreen(
                      seg.start.xMm + seg.outNx * dimOff,
                      seg.start.zMm + seg.outNz * dimOff
                    );
                    const d1 = worldToScreen(
                      seg.end.xMm + seg.outNx * dimOff,
                      seg.end.zMm + seg.outNz * dimOff
                    );
                    const dimMidX = (d0.sx + d1.sx) / 2;
                    const dimMidY = (d0.sy + d1.sy) / 2;
                    let textAngle = (Math.atan2(d1.sy - d0.sy, d1.sx - d0.sx) * 180) / Math.PI;
                    if (textAngle > 90 || textAngle < -90) textAngle += 180;

                    return (
                      <g key={`wall_${seg.index}`}>
                        {/* Solid Architectural Wall Band */}
                        <polygon
                          points={wallPoly}
                          fill={
                            isSelected
                              ? '#F59E0B'
                              : isHoveredForPlacement
                                ? '#0EA5E9'
                                : isHidden
                                  ? '#1E293B'
                                  : '#334155'
                          }
                          fillOpacity={isHidden ? 0.4 : isSelected ? 0.55 : 0.88}
                          stroke={
                            isSelected
                              ? '#FBBF24'
                              : isHoveredForPlacement
                                ? '#38BDF8'
                                : '#94A3B8'
                          }
                          strokeWidth={isSelected ? 1.8 : 1.1}
                          strokeDasharray={isHidden ? '5 4' : undefined}
                          className={tool === 'select' ? 'cursor-move' : undefined}
                          onPointerDown={(e) => {
                            if (tool !== 'select') return;
                            const w = screenToWorld(e.clientX, e.clientY);
                            startElementDrag(
                              e,
                              {
                                kind: 'wall',
                                wallIndex: seg.index,
                                startWorldX: w.x,
                                startWorldZ: w.z,
                                origPts: points.map((v) => ({ ...v })),
                                nx: seg.outNx,
                                nz: seg.outNz,
                              },
                              { kind: 'wall', wallIndex: seg.index }
                            );
                          }}
                        />

                        {/* Architectural Exterior Dimension Chain */}
                        <g
                          className="cursor-pointer"
                          onPointerDown={(e) => {
                            if (tool !== 'select') return;
                            e.stopPropagation();
                            setSelection({ kind: 'wall', wallIndex: seg.index });
                            setTab('shape');
                          }}
                        >
                          <line
                            x1={d0.sx}
                            y1={d0.sy}
                            x2={d1.sx}
                            y2={d1.sy}
                            stroke={isSelected ? '#F59E0B' : '#475569'}
                            strokeWidth={1}
                          />
                          <rect
                            x={dimMidX - 31}
                            y={dimMidY - 9}
                            width={62}
                            height={18}
                            rx={4}
                            fill={isSelected ? '#F59E0B' : '#14171F'}
                            stroke={isSelected ? '#FBBF24' : '#334155'}
                            strokeWidth={0.9}
                            transform={`rotate(${textAngle}, ${dimMidX}, ${dimMidY})`}
                          />
                          <text
                            x={dimMidX}
                            y={dimMidY + 3.5}
                            textAnchor="middle"
                            fill={isSelected ? '#09090B' : '#E2E8F0'}
                            fontSize="10"
                            fontWeight={isSelected ? '700' : '500'}
                            className="tabular-nums"
                            transform={`rotate(${textAngle}, ${dimMidX}, ${dimMidY})`}
                          >
                            {Math.round(seg.lengthMm)} mm
                          </text>
                        </g>
                      </g>
                    );
                  })}

                  {/* Architectural Openings (Doors with 90° Swing Arcs, Windows, Balconies, Arches) */}
                  {(draft.openings ?? []).map((op) => {
                    const seg = segments[op.wallIndex];
                    if (!seg) return null;
                    const isSelected = selection.kind === 'opening' && selection.id === op.id;
                    const t = wallThicknessMm;

                    const u0 = op.offsetMm;
                    const u1 = op.offsetMm + op.widthMm;
                    const aIn = worldToScreen(seg.start.xMm + seg.tx * u0, seg.start.zMm + seg.tz * u0);
                    const bIn = worldToScreen(seg.start.xMm + seg.tx * u1, seg.start.zMm + seg.tz * u1);
                    const bOut = worldToScreen(
                      seg.start.xMm + seg.tx * u1 + seg.outNx * t,
                      seg.start.zMm + seg.tz * u1 + seg.outNz * t
                    );
                    const aOut = worldToScreen(
                      seg.start.xMm + seg.tx * u0 + seg.outNx * t,
                      seg.start.zMm + seg.tz * u0 + seg.outNz * t
                    );
                    const breakPoly = `${aIn.sx},${aIn.sy} ${bIn.sx},${bIn.sy} ${bOut.sx},${bOut.sy} ${aOut.sx},${aOut.sy}`;

                    const isDoor = op.type === 'door_single' || op.type === 'door_double';
                    const isWindow = op.type === 'window' || op.type === 'window_balcony';

                    // Door swing geometry in world mm
                    const swingSign = op.swingInward !== false ? 1 : -1;
                    const renderDoorLeafSvg = (
                      hingeU: number,
                      leafLenMm: number,
                      dirSign: 1 | -1
                    ) => {
                      const baseOffset = swingSign > 0 ? 0 : t;
                      const hx = seg.start.xMm + seg.tx * hingeU + seg.outNx * baseOffset;
                      const hz = seg.start.zMm + seg.tz * hingeU + seg.outNz * baseOffset;
                      // Closed tip along wall
                      const cx = hx + seg.tx * (dirSign * leafLenMm);
                      const cz = hz + seg.tz * (dirSign * leafLenMm);
                      // Open 90 deg tip along inward/outward normal
                      const ox = hx + seg.inNx * (swingSign * leafLenMm);
                      const oz = hz + seg.inNz * (swingSign * leafLenMm);

                      const hp = worldToScreen(hx, hz);
                      const cp = worldToScreen(cx, cz);
                      const op90 = worldToScreen(ox, oz);
                      const rPx = leafLenMm * pxPerMm;

                      // Determine SVG sweep-flag using cross product of (closed - hinge) x (open - hinge)
                      const v1x = cp.sx - hp.sx;
                      const v1y = cp.sy - hp.sy;
                      const v2x = op90.sx - hp.sx;
                      const v2y = op90.sy - hp.sy;
                      const sweepFlag = v1x * v2y - v1y * v2x > 0 ? 1 : 0;

                      return (
                        <g key={`leaf_${hingeU}_${dirSign}`}>
                          <path
                            d={`M ${cp.sx} ${cp.sy} A ${rPx} ${rPx} 0 0 ${sweepFlag} ${op90.sx} ${op90.sy}`}
                            fill="none"
                            stroke={isSelected ? '#F59E0B' : '#D97706'}
                            strokeWidth={1.1}
                            strokeDasharray="4 3"
                          />
                          <line
                            x1={hp.sx}
                            y1={hp.sy}
                            x2={op90.sx}
                            y2={op90.sy}
                            stroke={isSelected ? '#FBBF24' : '#F59E0B'}
                            strokeWidth={2.4}
                            strokeLinecap="round"
                          />
                        </g>
                      );
                    };

                    return (
                      <g
                        key={op.id}
                        className={tool === 'select' ? 'cursor-grab' : undefined}
                        onPointerDown={(e) =>
                          startElementDrag(e, { kind: 'opening', id: op.id }, { kind: 'opening', id: op.id })
                        }
                      >
                        {/* Cut wall break */}
                        <polygon
                          points={breakPoly}
                          fill="#0D0F13"
                          stroke={isSelected ? '#F59E0B' : isWindow ? '#38BDF8' : '#F59E0B'}
                          strokeWidth={isSelected ? 2 : 1.2}
                        />
                        {isWindow && (
                          <>
                            <line
                              x1={(aIn.sx + aOut.sx) / 2}
                              y1={(aIn.sy + aOut.sy) / 2}
                              x2={(bIn.sx + bOut.sx) / 2}
                              y2={(bIn.sy + bOut.sy) / 2}
                              stroke="#38BDF8"
                              strokeWidth={2.2}
                            />
                            <line
                              x1={aIn.sx}
                              y1={aIn.sy}
                              x2={bIn.sx}
                              y2={bIn.sy}
                              stroke="#7DD3FC"
                              strokeWidth={1}
                            />
                          </>
                        )}
                        {op.type === 'arch' && (
                          <line
                            x1={(aIn.sx + aOut.sx) / 2}
                            y1={(aIn.sy + aOut.sy) / 2}
                            x2={(bIn.sx + bOut.sx) / 2}
                            y2={(bIn.sy + bOut.sy) / 2}
                            stroke="#A78BFA"
                            strokeWidth={1.6}
                            strokeDasharray="5 3"
                          />
                        )}
                        {isDoor &&
                          (op.type === 'door_double' ? (
                            <>
                              {renderDoorLeafSvg(u0, op.widthMm / 2, 1)}
                              {renderDoorLeafSvg(u1, op.widthMm / 2, -1)}
                            </>
                          ) : op.hingeSide === 'right' ? (
                            renderDoorLeafSvg(u1, op.widthMm, -1)
                          ) : (
                            renderDoorLeafSvg(u0, op.widthMm, 1)
                          ))}
                      </g>
                    );
                  })}

                  {/* Wall Obstacles (Radiators, Sockets, Switches, Pipes, Vents) */}
                  {(draft.wallObstacles ?? []).map((obs) => {
                    const seg = segments[obs.wallIndex];
                    if (!seg) return null;
                    const isSelected = selection.kind === 'obstacle' && selection.id === obs.id;
                    const u0 = obs.offsetMm;
                    const u1 = obs.offsetMm + obs.widthMm;
                    const d = Math.max(45, obs.depthMm);

                    const p0 = worldToScreen(seg.start.xMm + seg.tx * u0, seg.start.zMm + seg.tz * u0);
                    const p1 = worldToScreen(seg.start.xMm + seg.tx * u1, seg.start.zMm + seg.tz * u1);
                    const p2 = worldToScreen(
                      seg.start.xMm + seg.tx * u1 + seg.inNx * d,
                      seg.start.zMm + seg.tz * u1 + seg.inNz * d
                    );
                    const p3 = worldToScreen(
                      seg.start.xMm + seg.tx * u0 + seg.inNx * d,
                      seg.start.zMm + seg.tz * u0 + seg.inNz * d
                    );

                    const color =
                      obs.type === 'radiator'
                        ? '#EF4444'
                        : obs.type === 'socket'
                          ? '#FACC15'
                          : obs.type === 'pipe'
                            ? '#94A3B8'
                            : '#38BDF8';

                    return (
                      <g
                        key={obs.id}
                        className={tool === 'select' ? 'cursor-grab' : undefined}
                        onPointerDown={(e) =>
                          startElementDrag(e, { kind: 'obstacle', id: obs.id }, { kind: 'obstacle', id: obs.id })
                        }
                      >
                        {obs.type === 'pipe' ? (
                          <circle
                            cx={(p0.sx + p2.sx) / 2}
                            cy={(p0.sy + p2.sy) / 2}
                            r={Math.max(5, (obs.widthMm / 2) * pxPerMm)}
                            fill={color}
                            fillOpacity={0.75}
                            stroke={isSelected ? '#FFFFFF' : '#CBD5E1'}
                            strokeWidth={isSelected ? 2 : 1.2}
                          />
                        ) : (
                          <polygon
                            points={`${p0.sx},${p0.sy} ${p1.sx},${p1.sy} ${p2.sx},${p2.sy} ${p3.sx},${p3.sy}`}
                            fill={color}
                            fillOpacity={0.75}
                            stroke={isSelected ? '#FFFFFF' : '#1E293B'}
                            strokeWidth={isSelected ? 2 : 1}
                          />
                        )}
                      </g>
                    );
                  })}

                  {/* Placement Hover Ghost on Nearest Wall */}
                  {hoverWallPlacement && (
                    <g pointerEvents="none">
                      {(() => {
                        const { seg, offsetMm, widthMm, isOpening, remainingRightMm } =
                          hoverWallPlacement;
                        const u0 = offsetMm;
                        const u1 = offsetMm + widthMm;
                        const depth = isOpening ? wallThicknessMm : 80;
                        const dirX = isOpening ? seg.outNx : seg.inNx;
                        const dirZ = isOpening ? seg.outNz : seg.inNz;
                        const q0 = worldToScreen(seg.start.xMm + seg.tx * u0, seg.start.zMm + seg.tz * u0);
                        const q1 = worldToScreen(seg.start.xMm + seg.tx * u1, seg.start.zMm + seg.tz * u1);
                        const q2 = worldToScreen(
                          seg.start.xMm + seg.tx * u1 + dirX * depth,
                          seg.start.zMm + seg.tz * u1 + dirZ * depth
                        );
                        const q3 = worldToScreen(
                          seg.start.xMm + seg.tx * u0 + dirX * depth,
                          seg.start.zMm + seg.tz * u0 + dirZ * depth
                        );
                        const mx = (q0.sx + q1.sx) / 2;
                        const my = (q0.sy + q1.sy) / 2;
                        return (
                          <>
                            <polygon
                              points={`${q0.sx},${q0.sy} ${q1.sx},${q1.sy} ${q2.sx},${q2.sy} ${q3.sx},${q3.sy}`}
                              fill="#38BDF8"
                              fillOpacity={0.55}
                              stroke="#E0F2FE"
                              strokeWidth={1.6}
                            />
                            <rect
                              x={mx - 58}
                              y={my - 28}
                              width={116}
                              height={20}
                              rx={4}
                              fill="#0F172A"
                              stroke="#38BDF8"
                              strokeWidth={1}
                            />
                            <text
                              x={mx}
                              y={my - 14.5}
                              textAnchor="middle"
                              fill="#E0F2FE"
                              fontSize="10"
                              fontWeight="600"
                              className="tabular-nums"
                            >
                              L:{Math.round(offsetMm)} · P:{remainingRightMm}
                            </text>
                          </>
                        );
                      })()}
                    </g>
                  )}

                  {/* Draggable Corner Vertex Handles */}
                  {tool === 'select' &&
                    points.map((v, idx) => {
                      const { sx, sy } = worldToScreen(v.xMm, v.zMm);
                      const isSel = selection.kind === 'vertex' && selection.vertexIndex === idx;
                      return (
                        <g
                          key={v.id}
                          className="cursor-move"
                          onPointerDown={(e) =>
                            startElementDrag(
                              e,
                              { kind: 'vertex', vertexIndex: idx },
                              { kind: 'vertex', vertexIndex: idx }
                            )
                          }
                        >
                          <circle cx={sx} cy={sy} r={13} fill="transparent" />
                          <circle
                            cx={sx}
                            cy={sy}
                            r={isSel ? 6.5 : 5}
                            fill={isSel ? '#F59E0B' : '#0F172A'}
                            stroke={isSel ? '#FEF3C7' : '#F8FAFC'}
                            strokeWidth={2}
                          />
                        </g>
                      );
                    })}
                </g>

                {/* Active Freehand Wall Drawing Overlay */}
                {tool === 'draw' && (
                  <g>
                    {drawPoints.length > 1 && (
                      <polyline
                        points={drawPoints
                          .map((p) => {
                            const s = worldToScreen(p.xMm, p.zMm);
                            return `${s.sx},${s.sy}`;
                          })
                          .join(' ')}
                        fill="none"
                        stroke="#F59E0B"
                        strokeWidth={3}
                        strokeLinejoin="round"
                      />
                    )}
                    {drawPoints.length > 0 && snappedCursorDraw && (
                      <>
                        {(() => {
                          const prevS = worldToScreen(
                            drawPoints[drawPoints.length - 1].xMm,
                            drawPoints[drawPoints.length - 1].zMm
                          );
                          const curS = worldToScreen(snappedCursorDraw.x, snappedCursorDraw.z);
                          const mx = (prevS.sx + curS.sx) / 2;
                          const my = (prevS.sy + curS.sy) / 2;
                          return (
                            <>
                              <line
                                x1={prevS.sx}
                                y1={prevS.sy}
                                x2={curS.sx}
                                y2={curS.sy}
                                stroke={snappedCursorDraw.closing ? '#10B981' : '#38BDF8'}
                                strokeWidth={2.5}
                                strokeDasharray="6 4"
                              />
                              <rect
                                x={mx - 48}
                                y={my - 11}
                                width={96}
                                height={22}
                                rx={4}
                                fill="#0F172A"
                                stroke={snappedCursorDraw.closing ? '#10B981' : '#38BDF8'}
                                strokeWidth={1}
                              />
                              <text
                                x={mx}
                                y={my + 3.5}
                                textAnchor="middle"
                                fill="#F8FAFC"
                                fontSize="10.5"
                                fontWeight="600"
                                className="tabular-nums"
                              >
                                {drawPreviewLenMm} mm · {drawPreviewAngleDeg}°
                              </text>
                            </>
                          );
                        })()}
                      </>
                    )}
                    {drawPoints.map((p, idx) => {
                      const s = worldToScreen(p.xMm, p.zMm);
                      const isFirst = idx === 0;
                      const canClose = isFirst && drawPoints.length >= 3;
                      return (
                        <g key={p.id}>
                          {canClose && (
                            <circle
                              cx={s.sx}
                              cy={s.sy}
                              r={14}
                              fill="#10B981"
                              fillOpacity={0.22}
                              stroke="#10B981"
                              strokeWidth={1.5}
                            />
                          )}
                          <circle
                            cx={s.sx}
                            cy={s.sy}
                            r={isFirst ? 6 : 4.5}
                            fill={isFirst ? '#10B981' : '#F59E0B'}
                            stroke="#09090B"
                            strokeWidth={1.5}
                          />
                        </g>
                      );
                    })}
                  </g>
                )}
              </svg>

              {/* Contextual Floating Action Bar when Drawing */}
              {tool === 'draw' && (
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-xl border border-zinc-700 bg-[#141518]/95 px-3 py-2 shadow-xl backdrop-blur-sm">
                  <span className="text-xs text-zinc-300 whitespace-nowrap">
                    {drawPoints.length === 0
                      ? 'Kliknij na siatce, aby rozpocząć pierwszą ścianę'
                      : drawPoints.length < 3
                        ? `Dodano ${drawPoints.length} pkt — wskaż kolejne narożniki`
                        : `Kliknij zielony punkt startowy lub zamknij (${drawPoints.length} naroż.)`}
                  </span>
                  {drawPoints.length >= 3 && (
                    <button
                      type="button"
                      onClick={finishDrawingPolygon}
                      className="min-h-[30px] rounded-lg bg-emerald-500 px-2.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 whitespace-nowrap cursor-pointer"
                    >
                      Zamknij obrys
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setDrawPoints([]);
                      setTool('select');
                    }}
                    className="min-h-[30px] rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs text-zinc-300 hover:text-white whitespace-nowrap cursor-pointer"
                  >
                    Anuluj
                  </button>
                </div>
              )}

              {/* Subtle Bottom-Left Scale & Mode Hint */}
              {tool !== 'draw' && (
                <div className="pointer-events-none absolute bottom-2.5 left-3 flex items-center gap-3 text-[11px] text-zinc-400 bg-[#0D0F13]/85 px-2.5 py-1 rounded-md border border-zinc-800/80">
                  <span className="flex items-center gap-1.5 font-mono tabular-nums">
                    <span
                      className="inline-block h-1.5 border-b border-l border-r border-zinc-400"
                      style={{ width: `${Math.max(24, Math.min(120, Math.round(1000 * pxPerMm)))}px` }}
                    />
                    <span>1,0 m</span>
                  </span>
                  <span className="hidden sm:inline text-zinc-500">
                    {tool === 'select'
                      ? 'Przeciągaj narożniki, ściany, drzwi i okna · Kółko = zoom'
                      : 'Kliknij dowolną ścianę, aby wstawić wybrany element'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right: Tabbed Architectural Inspector */}
          <div className="w-full lg:w-[356px] shrink-0 flex flex-col bg-[#141518] max-h-[42dvh] lg:max-h-none">
            {/* Inspector Tabs */}
            <div className="grid grid-cols-4 border-b border-zinc-800 px-2 pt-2 gap-1 shrink-0 bg-[#121317]">
              {(
                [
                  { id: 'shape', label: 'Kształt' },
                  { id: 'elements', label: 'Elementy' },
                  { id: 'style', label: 'Styl 3D' },
                  { id: 'audit', label: totalIssues > 0 ? `Kolizje (${totalIssues})` : 'Kolizje' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={`min-h-[36px] rounded-t-lg px-2 text-xs font-medium transition-colors whitespace-nowrap truncate cursor-pointer border-b-2 ${
                    tab === t.id
                      ? 'border-amber-500 bg-[#141518] text-white'
                      : 'border-transparent text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* Inspector Scroll Body */}
            <div className="cad-scroll flex-1 overflow-y-auto p-4 space-y-5">
              {/* TAB 1: SHAPE, PRESETS & SELECTED WALL/VERTEX */}
              {tab === 'shape' && (
                <>
                  {/* Contextual Selected Wall Editor */}
                  {selectedWall && (
                    <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-300">
                          {selectedWall.label}
                        </span>
                        <span className="text-[11px] font-mono tabular-nums text-zinc-400">
                          {Math.round(selectedWall.lengthMm)} mm
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Długość ściany (mm)</span>
                          <input
                            type="number"
                            min={300}
                            max={20000}
                            step={50}
                            value={Math.round(selectedWall.lengthMm)}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (!Number.isFinite(val) || val < 300) return;
                              commitDraft((prev) => ({
                                ...prev,
                                floorPoints: resizeWallSegmentLength(
                                  getRoomPolygonPoints(prev),
                                  selectedWall.index,
                                  val
                                ),
                              }));
                            }}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-mono tabular-nums text-white focus:border-amber-500 focus:outline-none"
                          />
                        </label>
                        <div className="flex flex-col justify-end">
                          <button
                            type="button"
                            onClick={() => {
                              commitDraft((prev) => splitWallSegment(prev, selectedWall.index));
                              setSelection({ kind: 'vertex', vertexIndex: selectedWall.index + 1 });
                            }}
                            className="flex min-h-[34px] items-center justify-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 text-xs font-medium text-zinc-200 hover:border-amber-500/60 hover:text-amber-300 cursor-pointer"
                            title="Wstaw narożnik w połowie ściany, aby zrobić wnękę lub filar"
                          >
                            <Scissors className="h-3.5 w-3.5" />
                            <span>Podziel ścianę</span>
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() => addOpeningOnWall(selectedWall.index, 'door_single')}
                          className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Drzwi
                        </button>
                        <button
                          type="button"
                          onClick={() => addOpeningOnWall(selectedWall.index, 'window')}
                          className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Okno
                        </button>
                        <button
                          type="button"
                          onClick={() => addWallObstacleOnWall(selectedWall.index, 'radiator')}
                          className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Grzejnik
                        </button>
                        <button
                          type="button"
                          onClick={() => addWallObstacleOnWall(selectedWall.index, 'socket')}
                          className="flex min-h-[30px] items-center gap-1 rounded-md border border-zinc-700 bg-zinc-900 px-2 text-[11px] text-zinc-200 hover:border-sky-500/60 hover:text-sky-300 cursor-pointer"
                        >
                          <Plus className="h-3 w-3" /> Gniazdko
                        </button>
                      </div>

                      <label className="flex items-center justify-between pt-1 text-xs text-zinc-300 cursor-pointer">
                        <span className="flex items-center gap-1.5">
                          {hiddenSet.has(selectedWall.index) ? (
                            <EyeOff className="h-3.5 w-3.5 text-zinc-500" />
                          ) : (
                            <Eye className="h-3.5 w-3.5 text-emerald-400" />
                          )}
                          <span>Widoczna w podglądzie 3D</span>
                        </span>
                        <input
                          type="checkbox"
                          checked={!hiddenSet.has(selectedWall.index)}
                          onChange={(e) => {
                            const nextHidden = new Set(draft.hiddenWallIndices ?? []);
                            if (e.target.checked) nextHidden.delete(selectedWall.index);
                            else nextHidden.add(selectedWall.index);
                            patchDraft({ hiddenWallIndices: Array.from(nextHidden) });
                          }}
                          className="h-4 w-4 accent-amber-500"
                        />
                      </label>
                    </div>
                  )}

                  {/* Contextual Selected Vertex Editor */}
                  {selectedVertex && selection.kind === 'vertex' && (
                    <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-300">
                          Narożnik #{selection.vertexIndex + 1}
                        </span>
                        {points.length > 3 && (
                          <button
                            type="button"
                            onClick={() => {
                              commitDraft((prev) => deleteRoomVertex(prev, selection.vertexIndex));
                              setSelection({ kind: 'none' });
                            }}
                            className="flex items-center gap-1 text-[11px] text-red-400 hover:text-red-300 cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Usuń</span>
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Współrzędna X (mm)</span>
                          <input
                            type="number"
                            step={50}
                            value={Math.round(selectedVertex.xMm)}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (!Number.isFinite(val)) return;
                              commitDraft((prev) => ({
                                ...prev,
                                floorPoints: getRoomPolygonPoints(prev).map((v, i) =>
                                  i === selection.vertexIndex ? { ...v, xMm: val } : v
                                ),
                              }));
                            }}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Współrzędna Z (mm)</span>
                          <input
                            type="number"
                            step={50}
                            value={Math.round(selectedVertex.zMm)}
                            onChange={(e) => {
                              const val = Number(e.target.value);
                              if (!Number.isFinite(val)) return;
                              commitDraft((prev) => ({
                                ...prev,
                                floorPoints: getRoomPolygonPoints(prev).map((v, i) =>
                                  i === selection.vertexIndex ? { ...v, zMm: val } : v
                                ),
                              }));
                            }}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 py-2 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Quick Shape Presets */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-200">Gotowe kształty rzutu</h3>
                      <button
                        type="button"
                        onClick={() => {
                          setTool('draw');
                          setDrawPoints([]);
                          setSelection({ kind: 'none' });
                        }}
                        className="text-[11px] font-medium text-amber-400 hover:text-amber-300 cursor-pointer"
                      >
                        Rysuj od zera
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-1.5">
                      {PRESET_CARDS.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => handleApplyPreset(p.id)}
                          className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2 text-left hover:border-amber-500/50 hover:bg-zinc-900 transition-colors cursor-pointer"
                        >
                          <div className="text-xs font-medium text-zinc-100">{p.label}</div>
                          <div className="text-[10px] text-zinc-500">{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Global Room Height & Wall Thickness */}
                  <div className="space-y-2.5 border-t border-zinc-800 pt-4">
                    <h3 className="text-xs font-semibold text-zinc-200">Parametry bryły</h3>
                    <div className="grid grid-cols-2 gap-2.5">
                      <label className="block">
                        <span className="text-[11px] text-zinc-400">Wysokość (mm)</span>
                        <input
                          type="number"
                          min={1600}
                          max={4500}
                          step={50}
                          value={draft.heightMm}
                          onChange={(e) =>
                            patchDraft({ heightMm: Math.max(1600, Number(e.target.value) || 2600) })
                          }
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono tabular-nums text-white focus:border-amber-500 focus:outline-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] text-zinc-400">Grubość ścian (mm)</span>
                        <input
                          type="number"
                          min={60}
                          max={360}
                          step={20}
                          value={wallThicknessMm}
                          onChange={(e) =>
                            patchDraft({
                              wallThicknessMm: Math.max(
                                60,
                                Math.min(360, Number(e.target.value) || 120)
                              ),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono tabular-nums text-white focus:border-amber-500 focus:outline-none"
                        />
                      </label>
                    </div>
                  </div>

                  {/* Wall Lengths Table */}
                  <div className="space-y-2 border-t border-zinc-800 pt-4">
                    <h3 className="text-xs font-semibold text-zinc-200">
                      Lista ścian ({segments.length})
                    </h3>
                    <div className="space-y-1">
                      {segments.map((seg) => {
                        const isSel =
                          selection.kind === 'wall' && selection.wallIndex === seg.index;
                        return (
                          <div
                            key={seg.index}
                            onClick={() => setSelection({ kind: 'wall', wallIndex: seg.index })}
                            className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-xs cursor-pointer transition-colors ${
                              isSel
                                ? 'bg-amber-500/15 text-amber-200'
                                : 'bg-zinc-900/50 text-zinc-300 hover:bg-zinc-900'
                            }`}
                          >
                            <span className="font-medium truncate">{seg.label}</span>
                            <span className="font-mono tabular-nums text-zinc-400">
                              {Math.round(seg.lengthMm)} mm
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {/* TAB 2: DOORS, WINDOWS & WALL OBSTACLES */}
              {tab === 'elements' && (
                <>
                  {/* Selected Opening Editor */}
                  {selectedOpening && (
                    <div className="space-y-3 rounded-xl border border-sky-500/40 bg-sky-500/5 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-sky-300">
                          {selectedOpening.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            commitDraft((prev) => ({
                              ...prev,
                              openings: (prev.openings ?? []).filter(
                                (o) => o.id !== selectedOpening.id
                              ),
                            }));
                            setSelection({ kind: 'none' });
                          }}
                          className="text-zinc-400 hover:text-red-400 p-1 cursor-pointer"
                          title="Usuń otwór"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Typ otworu</span>
                          <select
                            value={selectedOpening.type}
                            onChange={(e) => {
                              const nextType = e.target.value as RoomOpeningType;
                              const preset = OPENING_PRESETS[nextType];
                              updateOpening(selectedOpening.id, {
                                type: nextType,
                                label: preset.label,
                                sillHeightMm: preset.sillHeightMm,
                                heightMm: Math.min(preset.heightMm, draft.heightMm - preset.sillHeightMm - 60),
                              });
                            }}
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                          >
                            <option value="door_single">Drzwi pojedyncze</option>
                            <option value="door_double">Drzwi dwuskrzydłowe</option>
                            <option value="window">Okno standardowe</option>
                            <option value="window_balcony">Okno balkonowe</option>
                            <option value="arch">Otwarte przejście</option>
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Ściana</span>
                          <select
                            value={selectedOpening.wallIndex}
                            onChange={(e) =>
                              updateOpening(selectedOpening.id, {
                                wallIndex: Number(e.target.value) || 0,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                          >
                            {segments.map((s) => (
                              <option key={s.index} value={s.index}>
                                {s.label} ({Math.round(s.lengthMm)} mm)
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Od początku ściany</span>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={Math.round(selectedOpening.offsetMm)}
                            onChange={(e) =>
                              updateOpening(selectedOpening.id, {
                                offsetMm: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Szerokość (mm)</span>
                          <input
                            type="number"
                            min={400}
                            max={5000}
                            step={50}
                            value={Math.round(selectedOpening.widthMm)}
                            onChange={(e) =>
                              updateOpening(selectedOpening.id, {
                                widthMm: Math.max(400, Number(e.target.value) || 900),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Wysokość (mm)</span>
                          <input
                            type="number"
                            min={400}
                            max={draft.heightMm}
                            step={50}
                            value={Math.round(selectedOpening.heightMm)}
                            onChange={(e) =>
                              updateOpening(selectedOpening.id, {
                                heightMm: Math.max(400, Number(e.target.value) || 2050),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Parapet / próg (mm)</span>
                          <input
                            type="number"
                            min={0}
                            max={2000}
                            step={50}
                            value={Math.round(selectedOpening.sillHeightMm)}
                            onChange={(e) =>
                              updateOpening(selectedOpening.id, {
                                sillHeightMm: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                      </div>

                      {(selectedOpening.type === 'door_single' ||
                        selectedOpening.type === 'door_double') && (
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() =>
                              updateOpening(selectedOpening.id, {
                                swingInward: !(selectedOpening.swingInward !== false),
                              })
                            }
                            className="min-h-[32px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:border-amber-500/60 cursor-pointer"
                          >
                            {selectedOpening.swingInward !== false
                              ? 'Otwierane do wewnątrz'
                              : 'Otwierane na zewnątrz'}
                          </button>
                          {selectedOpening.type === 'door_single' && (
                            <button
                              type="button"
                              onClick={() =>
                                updateOpening(selectedOpening.id, {
                                  hingeSide:
                                    selectedOpening.hingeSide === 'right' ? 'left' : 'right',
                                })
                              }
                              className="min-h-[32px] rounded-lg border border-zinc-700 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-200 hover:border-amber-500/60 cursor-pointer"
                            >
                              Zawiasy: {selectedOpening.hingeSide === 'right' ? 'Prawe' : 'Lewe'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Selected Wall Obstacle Editor */}
                  {selectedObstacle && (
                    <div className="space-y-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-amber-300">
                          {selectedObstacle.label}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            commitDraft((prev) => ({
                              ...prev,
                              wallObstacles: (prev.wallObstacles ?? []).filter(
                                (o) => o.id !== selectedObstacle.id
                              ),
                            }));
                            setSelection({ kind: 'none' });
                          }}
                          className="text-zinc-400 hover:text-red-400 p-1 cursor-pointer"
                          title="Usuń instalację"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Ściana</span>
                          <select
                            value={selectedObstacle.wallIndex}
                            onChange={(e) =>
                              updateWallObstacle(selectedObstacle.id, {
                                wallIndex: Number(e.target.value) || 0,
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs text-white"
                          >
                            {segments.map((s) => (
                              <option key={s.index} value={s.index}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Od startu (mm)</span>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={Math.round(selectedObstacle.offsetMm)}
                            onChange={(e) =>
                              updateWallObstacle(selectedObstacle.id, {
                                offsetMm: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Od podłogi (mm)</span>
                          <input
                            type="number"
                            min={0}
                            step={50}
                            value={Math.round(selectedObstacle.elevationMm)}
                            onChange={(e) =>
                              updateWallObstacle(selectedObstacle.id, {
                                elevationMm: Math.max(0, Number(e.target.value) || 0),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Odstaje (mm)</span>
                          <input
                            type="number"
                            min={10}
                            max={500}
                            step={10}
                            value={Math.round(selectedObstacle.depthMm)}
                            onChange={(e) =>
                              updateWallObstacle(selectedObstacle.id, {
                                depthMm: Math.max(10, Number(e.target.value) || 30),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Szerokość (mm)</span>
                          <input
                            type="number"
                            min={40}
                            step={20}
                            value={Math.round(selectedObstacle.widthMm)}
                            onChange={(e) =>
                              updateWallObstacle(selectedObstacle.id, {
                                widthMm: Math.max(40, Number(e.target.value) || 120),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Wysokość (mm)</span>
                          <input
                            type="number"
                            min={40}
                            step={20}
                            value={Math.round(selectedObstacle.heightMm)}
                            onChange={(e) =>
                              updateWallObstacle(selectedObstacle.id, {
                                heightMm: Math.max(40, Number(e.target.value) || 120),
                              })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Openings List */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-200">
                        Drzwi i okna ({(draft.openings ?? []).length})
                      </h3>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setTool('place_door')}
                          className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                        >
                          + Drzwi
                        </button>
                        <span className="text-zinc-600">·</span>
                        <button
                          type="button"
                          onClick={() => setTool('place_window')}
                          className="text-[11px] text-sky-400 hover:text-sky-300 cursor-pointer"
                        >
                          + Okno
                        </button>
                      </div>
                    </div>

                    {(draft.openings ?? []).length === 0 ? (
                      <p className="text-xs text-zinc-500">
                        Wybierz narzędzie Drzwi lub Okno nad rzutem i kliknij dowolną ścianę.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(draft.openings ?? []).map((op) => {
                          const isSel = selection.kind === 'opening' && selection.id === op.id;
                          return (
                            <div
                              key={op.id}
                              onClick={() => setSelection({ kind: 'opening', id: op.id })}
                              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                                isSel
                                  ? 'bg-sky-500/15 text-sky-200 border border-sky-500/40'
                                  : 'bg-zinc-900/60 text-zinc-300 hover:bg-zinc-900 border border-transparent'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate">{op.label}</div>
                                <div className="text-[10px] text-zinc-500 tabular-nums">
                                  {segments[op.wallIndex]?.label ?? 'Ściana'} · {op.widthMm}×{op.heightMm} mm
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitDraft((prev) => ({
                                    ...prev,
                                    openings: (prev.openings ?? []).filter((o) => o.id !== op.id),
                                  }));
                                  if (isSel) setSelection({ kind: 'none' });
                                }}
                                className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Wall Obstacles List */}
                  <div className="space-y-2 border-t border-zinc-800 pt-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-semibold text-zinc-200">
                        Instalacje i przeszkody ({(draft.wallObstacles ?? []).length})
                      </h3>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => setTool('place_radiator')}
                          className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                        >
                          + Grzejnik
                        </button>
                        <span className="text-zinc-600">·</span>
                        <button
                          type="button"
                          onClick={() => setTool('place_socket')}
                          className="text-[11px] text-amber-400 hover:text-amber-300 cursor-pointer"
                        >
                          + Gniazdko
                        </button>
                      </div>
                    </div>

                    {(draft.wallObstacles ?? []).length === 0 ? (
                      <p className="text-xs text-zinc-500">
                        Dodaj grzejniki, gniazdka 230V lub piony kanalizacyjne, aby wykrywać kolizje z meblem.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {(draft.wallObstacles ?? []).map((obs) => {
                          const isSel = selection.kind === 'obstacle' && selection.id === obs.id;
                          return (
                            <div
                              key={obs.id}
                              onClick={() => setSelection({ kind: 'obstacle', id: obs.id })}
                              className={`flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs cursor-pointer transition-colors ${
                                isSel
                                  ? 'bg-amber-500/15 text-amber-200 border border-amber-500/40'
                                  : 'bg-zinc-900/60 text-zinc-300 hover:bg-zinc-900 border border-transparent'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="font-medium truncate">{obs.label}</div>
                                <div className="text-[10px] text-zinc-500 tabular-nums">
                                  {segments[obs.wallIndex]?.label ?? 'Ściana'} · wys. od podł. {obs.elevationMm} mm
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitDraft((prev) => ({
                                    ...prev,
                                    wallObstacles: (prev.wallObstacles ?? []).filter(
                                      (o) => o.id !== obs.id
                                    ),
                                  }));
                                  if (isSel) setSelection({ kind: 'none' });
                                }}
                                className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* TAB 3: ARCHITECTURAL FINISHES, CUTAWAY & SLOPED CEILING */}
              {tab === 'style' && (
                <>
                  {/* 3D Wall Cutaway Mode */}
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold text-zinc-200">Tryb ścian w 3D</h3>
                    <div className="grid grid-cols-3 gap-1.5">
                      {CUTAWAY_MODES.map((m) => {
                        const active = style.wallCutawayMode === m.id;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => patchStyle({ wallCutawayMode: m.id })}
                            className={`min-h-[34px] rounded-lg px-2 text-xs font-medium transition-colors cursor-pointer ${
                              active
                                ? 'bg-amber-500 text-zinc-950 font-semibold'
                                : 'border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                            }`}
                          >
                            {m.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[11px] text-zinc-400">
                      {CUTAWAY_MODES.find((m) => m.id === style.wallCutawayMode)?.hint}
                    </p>
                  </div>

                  {/* Wall Finish Swatches */}
                  <div className="space-y-2 border-t border-zinc-800 pt-4">
                    <h3 className="text-xs font-semibold text-zinc-200">Wykończenie ścian</h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(WALL_FINISH_CATALOG) as RoomWallFinish[]).map((fid) => {
                        const meta = WALL_FINISH_CATALOG[fid];
                        const active = style.wallFinish === fid;
                        return (
                          <button
                            key={fid}
                            type="button"
                            onClick={() => patchStyle({ wallFinish: fid })}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                              active
                                ? 'border-amber-500 bg-amber-500/10 text-white'
                                : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                            }`}
                          >
                            <span
                              className="h-4 w-4 rounded border border-white/20 shrink-0"
                              style={{ backgroundColor: meta.color }}
                            />
                            <span className="truncate">{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Floor Finish Swatches */}
                  <div className="space-y-2 border-t border-zinc-800 pt-4">
                    <h3 className="text-xs font-semibold text-zinc-200">Podłoga</h3>
                    <div className="grid grid-cols-2 gap-1.5">
                      {(Object.keys(FLOOR_FINISH_CATALOG) as RoomFloorFinish[]).map((fid) => {
                        const meta = FLOOR_FINISH_CATALOG[fid];
                        const active = style.floorFinish === fid;
                        return (
                          <button
                            key={fid}
                            type="button"
                            onClick={() => patchStyle({ floorFinish: fid })}
                            className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors cursor-pointer ${
                              active
                                ? 'border-amber-500 bg-amber-500/10 text-white'
                                : 'border-zinc-800 bg-zinc-900/60 text-zinc-300 hover:border-zinc-700'
                            }`}
                          >
                            <span
                              className="h-4 w-4 rounded border border-white/20 shrink-0"
                              style={{
                                background: `linear-gradient(135deg, ${meta.swatch} 55%, ${meta.accent} 100%)`,
                              }}
                            />
                            <span className="truncate">{meta.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Baseboards & Ceiling */}
                  <div className="space-y-3 border-t border-zinc-800 pt-4">
                    <label className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer">
                      <span>Listwy przypodłogowe</span>
                      <input
                        type="checkbox"
                        checked={style.showBaseboards}
                        onChange={(e) => patchStyle({ showBaseboards: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                    </label>
                    {style.showBaseboards && (
                      <label className="flex items-center justify-between gap-3 text-xs text-zinc-400">
                        <span>Wysokość listwy (mm)</span>
                        <input
                          type="number"
                          min={40}
                          max={160}
                          step={10}
                          value={style.baseboardHeightMm}
                          onChange={(e) =>
                            patchStyle({
                              baseboardHeightMm: Math.max(
                                40,
                                Math.min(160, Number(e.target.value) || 80)
                              ),
                            })
                          }
                          className="w-24 rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs font-mono tabular-nums text-white"
                        />
                      </label>
                    )}

                    <label className="flex items-center justify-between text-xs text-zinc-200 cursor-pointer">
                      <span>Pokaż sufit w 3D</span>
                      <input
                        type="checkbox"
                        checked={draft.showCeiling}
                        onChange={(e) => patchDraft({ showCeiling: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                    </label>
                  </div>

                  {/* Sloped Attic Ceiling */}
                  <div className="space-y-2.5 border-t border-zinc-800 pt-4">
                    <label className="flex items-center justify-between text-xs font-semibold text-amber-300 cursor-pointer">
                      <span>Skos dachu / poddasze</span>
                      <input
                        type="checkbox"
                        checked={slope.enabled}
                        onChange={(e) => patchSlope({ enabled: e.target.checked })}
                        className="h-4 w-4 accent-amber-500"
                      />
                    </label>
                    {slope.enabled && (
                      <div className="grid grid-cols-1 gap-2">
                        <label className="block">
                          <span className="text-[11px] text-zinc-400">Strona skosu</span>
                          <select
                            value={slope.side}
                            onChange={(e) =>
                              patchSlope({ side: e.target.value as 'left' | 'right' })
                            }
                            className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1.5 text-xs text-white"
                          >
                            <option value="right">Prawa ściana</option>
                            <option value="left">Lewa ściana</option>
                          </select>
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[11px] text-zinc-400">Kolankowa (mm)</span>
                            <input
                              type="number"
                              min={300}
                              max={draft.heightMm - 100}
                              step={50}
                              value={slope.kneeWallHeightMm}
                              onChange={(e) =>
                                patchSlope({ kneeWallHeightMm: Number(e.target.value) || 1100 })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[11px] text-zinc-400">Szer. skosu (mm)</span>
                            <input
                              type="number"
                              min={300}
                              max={draft.widthMm}
                              step={50}
                              value={slope.slopeWidthMm}
                              onChange={(e) =>
                                patchSlope({ slopeWidthMm: Number(e.target.value) || 1400 })
                              }
                              className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-xs font-mono tabular-nums text-white"
                            />
                          </label>
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* TAB 4: LIVE COLLISION & CLEARANCE AUDIT */}
              {tab === 'audit' && (
                <div className="space-y-4">
                  {totalIssues === 0 ? (
                    <div className="rounded-xl border border-emerald-500/35 bg-emerald-950/25 p-4 text-xs text-emerald-200 space-y-1">
                      <div className="font-semibold">Brak kolizji z pomieszczeniem</div>
                      <p className="text-emerald-200/80">
                        Wszystkie elementy mebla mieszczą się wewnątrz narysowanych ścian, pod sufitem i poza strefą otwierania drzwi.
                      </p>
                    </div>
                  ) : (
                    <>
                      {liveIssues.length > 0 && (
                        <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-3.5 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-red-200">
                            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                            <span>Kolizje ze ścianami i instalacjami ({liveIssues.length})</span>
                          </div>
                          <ul className="space-y-1 text-[11px] text-red-200/90 pl-4 list-disc">
                            {liveIssues.slice(0, 12).map((iss, idx) => (
                              <li key={`${iss.partId}_${idx}`}>{iss.message}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {liveSwingIssues.length > 0 && (
                        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 p-3.5 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                            <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                            <span>Kolizje przy otwieraniu frontów ({liveSwingIssues.length})</span>
                          </div>
                          <ul className="space-y-1.5 text-[11px] text-amber-100/90 pl-4 list-disc">
                            {liveSwingIssues.slice(0, 10).map((sw, idx) => (
                              <li key={`${sw.doorId}_${idx}`}>
                                <strong>{sw.doorName}</strong> uderza przy {sw.hitAngleDeg}° o{' '}
                                <strong>{sw.hitLabel}</strong> — {sw.recommendation}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-[#141518] px-4 sm:px-5 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))] shrink-0">
          <div className="hidden sm:block text-xs text-zinc-400 tabular-nums truncate">
            Wymiary gabarytowe rzutu: {draft.widthMm} × {draft.depthMm} mm · ściany {wallThicknessMm} mm
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-medium text-zinc-200 hover:bg-zinc-800 cursor-pointer whitespace-nowrap"
            >
              Anuluj
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer whitespace-nowrap"
            >
              <Check className="h-4 w-4" />
              <span>Zastosuj pomieszczenie w 3D</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
