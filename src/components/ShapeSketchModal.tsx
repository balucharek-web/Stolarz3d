import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Check,
  Maximize2,
  MousePointer2,
  PenTool,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  FurniturePart,
  MATERIAL_CATALOG,
  MaterialId,
} from '../types/furniture';
import {
  computePolygonAreaM2,
  ensureCounterClockwise,
  partToEditablePolygon,
} from '../engine/geometry';
import { findSelfIntersectingEdges } from '../engine/carpentry';
import { getMaterialSwatchDataUrl } from '../engine/materials';

interface ShapeSketchModalProps {
  open: boolean;
  /** When provided, edits/converts an existing part instead of creating a new one */
  editingPart: FurniturePart | null;
  customTextures: Partial<Record<MaterialId, string>>;
  onClose: () => void;
  onSaveNewPart: (part: Omit<FurniturePart, 'id'>) => void;
  onUpdateExistingPart: (id: string, patch: Partial<FurniturePart>) => void;
}

type SketchMode = 'draw' | 'edit';
type BoardOrientation = 'vertical' | 'horizontal';

interface QuickShapePreset {
  id: string;
  label: string;
  defaultName: string;
  orientation: BoardOrientation;
  points: [number, number][];
}

const QUICK_SHAPES: QuickShapePreset[] = [
  {
    id: 'l_shape',
    label: 'Kształt L',
    defaultName: 'Płyta narożna L',
    orientation: 'horizontal',
    points: [
      [-500, -400],
      [500, -400],
      [500, 0],
      [0, 0],
      [0, 400],
      [-500, 400],
    ],
  },
  {
    id: 'stairs',
    label: 'Pod schody',
    defaultName: 'Bok regału schodkowy',
    orientation: 'vertical',
    points: [
      [-600, -500],
      [600, -500],
      [600, -150],
      [200, -150],
      [200, 200],
      [-200, 200],
      [-200, 500],
      [-600, 500],
    ],
  },
  {
    id: 'attic',
    label: 'Skos poddasza',
    defaultName: 'Ściana pod skos dachu',
    orientation: 'vertical',
    points: [
      [-600, -600],
      [600, -600],
      [600, 50],
      [50, 600],
      [-600, 600],
    ],
  },
  {
    id: 'u_notch',
    label: 'Wnęka / U',
    defaultName: 'Płyta z wycięciem U',
    orientation: 'vertical',
    points: [
      [-500, -450],
      [500, -450],
      [500, 450],
      [200, 450],
      [200, 50],
      [-200, 50],
      [-200, 450],
      [-500, 450],
    ],
  },
  {
    id: 'hex',
    label: 'Sześciokąt',
    defaultName: 'Półka sześciokątna',
    orientation: 'vertical',
    points: [
      [-250, -430],
      [250, -430],
      [500, 0],
      [250, 430],
      [-250, 430],
      [-500, 0],
    ],
  },
];

const SNAP_OPTIONS = [10, 25, 50, 100, 0];
const THICKNESS_PRESETS = [12, 18, 22, 38];

function getPolyBounds(pts: [number, number][]) {
  if (pts.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 0, height: 0, cx: 0, cy: 0 };
  }
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const [x, y] of pts) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  return {
    minX,
    maxX,
    minY,
    maxY,
    width: Math.round(maxX - minX),
    height: Math.round(maxY - minY),
    cx: (minX + maxX) / 2,
    cy: (minY + maxY) / 2,
  };
}

export const ShapeSketchModal: React.FC<ShapeSketchModalProps> = ({
  open,
  editingPart,
  customTextures,
  onClose,
  onSaveNewPart,
  onUpdateExistingPart,
}) => {
  const [points, setPoints] = useState<[number, number][]>([]);
  const [isClosed, setIsClosed] = useState(false);
  const [mode, setMode] = useState<SketchMode>('draw');
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [hoverWorld, setHoverWorld] = useState<[number, number] | null>(null);

  // Part settings
  const [partName, setPartName] = useState('Własna płyta 2D');
  const [materialId, setMaterialId] = useState<MaterialId>('osb3');
  const [thicknessMm, setThicknessMm] = useState(18);
  const [orientation, setOrientation] = useState<BoardOrientation>('vertical');
  const [snapMm, setSnapMm] = useState(25);
  const [angleLock, setAngleLock] = useState<'off' | '90' | '45'>('off');
  const [stepLenMm, setStepLenMm] = useState(400);

  // 2D Canvas Camera (world mm -> SVG px)
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [svgSize, setSvgSize] = useState({ width: 640, height: 420 });
  const svgSizeRef = useRef(svgSize);
  svgSizeRef.current = svgSize;
  const [viewCenter, setViewCenter] = useState<[number, number]>([0, 0]);
  const [zoom, setZoom] = useState(0.32); // px per mm (0.32 => 1000mm = 320px)

  // Dragging & 2-finger mobile pinch-zoom refs
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{
    active: boolean;
    startDist: number;
    startZoom: number;
    startMidX: number;
    startMidY: number;
    startCenter: [number, number];
  }>({
    active: false,
    startDist: 1,
    startZoom: 0.32,
    startMidX: 0,
    startMidY: 0,
    startCenter: [0, 0],
  });
  const dragRef = useRef<{
    type: 'vertex' | 'pan' | null;
    vertexIdx: number;
    startClientX: number;
    startClientY: number;
    startCenter: [number, number];
  }>({
    type: null,
    vertexIdx: -1,
    startClientX: 0,
    startClientY: 0,
    startCenter: [0, 0],
  });

  const swatches = useMemo(() => {
    const map: Partial<Record<MaterialId, string>> = {};
    for (const m of MATERIAL_CATALOG) {
      map[m.id] = getMaterialSwatchDataUrl(m.id, customTextures);
    }
    return map;
  }, [customTextures]);

  const fitViewToPoints = useCallback(
    (pts: [number, number][], canvasW?: number, canvasH?: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      const w = canvasW ?? (rect && rect.width > 20 ? rect.width : svgSizeRef.current.width);
      const h = canvasH ?? (rect && rect.height > 20 ? rect.height : svgSizeRef.current.height);
      if (pts.length === 0) {
        setViewCenter([0, 0]);
        setZoom(Math.min(w, h) / 1600);
        return;
      }
      const b = getPolyBounds(pts);
      const padW = Math.max(400, b.width * 1.45);
      const padH = Math.max(400, b.height * 1.45);
      const nextZoom = Math.max(
        0.08,
        Math.min(1.6, Math.min(w / padW, h / padH))
      );
      setViewCenter([b.cx, b.cy]);
      setZoom(nextZoom);
    },
    []
  );

  // Initialize state ONLY when modal opens or editingPart changes (never on resize!)
  useEffect(() => {
    if (!open) return;
    if (editingPart) {
      const extracted = partToEditablePolygon(editingPart);
      setPoints(extracted.polygon);
      setIsClosed(true);
      setMode('edit');
      setSelectedIdx(null);
      setHoverWorld(null);
      setPartName(editingPart.name);
      setMaterialId(editingPart.materialId);
      setThicknessMm(Math.max(4, Math.round(extracted.thicknessMm)));
      setOrientation(extracted.orientation);
      requestAnimationFrame(() => {
        fitViewToPoints(extracted.polygon);
      });
    } else {
      setPoints([]);
      setIsClosed(false);
      setMode('draw');
      setSelectedIdx(null);
      setHoverWorld(null);
      setPartName('Własna płyta 2D');
      setMaterialId('osb3');
      setThicknessMm(18);
      setOrientation('vertical');
      requestAnimationFrame(() => {
        fitViewToPoints([]);
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editingPart]);

  // Keep SVG dimensions updated
  useEffect(() => {
    if (!open) return;
    const svg = svgRef.current;
    if (!svg) return;
    const update = () => {
      const r = svg.getBoundingClientRect();
      if (r.width > 20 && r.height > 20) {
        setSvgSize({ width: r.width, height: r.height });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(svg);
    return () => ro.disconnect();
  }, [open]);

  const worldToScreen = useCallback(
    (wx: number, wy: number): [number, number] => {
      const sx = (wx - viewCenter[0]) * zoom + svgSize.width / 2;
      const sy = (viewCenter[1] - wy) * zoom + svgSize.height / 2;
      return [sx, sy];
    },
    [viewCenter, zoom, svgSize]
  );

  const screenToWorld = useCallback(
    (clientX: number, clientY: number, applySnap = true): [number, number] => {
      const svg = svgRef.current;
      if (!svg) return [0, 0];
      const rect = svg.getBoundingClientRect();
      const sx = clientX - rect.left;
      const sy = clientY - rect.top;
      let wx = (sx - rect.width / 2) / zoom + viewCenter[0];
      let wy = viewCenter[1] - (sy - rect.height / 2) / zoom;
      if (applySnap && snapMm > 0) {
        wx = Math.round(wx / snapMm) * snapMm;
        wy = Math.round(wy / snapMm) * snapMm;
      } else {
        wx = Math.round(wx);
        wy = Math.round(wy);
      }
      return [wx, wy];
    },
    [viewCenter, zoom, snapMm]
  );

  const applyAngleConstraint = useCallback(
    (rawPt: [number, number], anchor?: [number, number]): [number, number] => {
      if (!anchor || angleLock === 'off') return rawPt;
      const dx = rawPt[0] - anchor[0];
      const dy = rawPt[1] - anchor[1];
      const len = Math.hypot(dx, dy);
      if (len < 1) return rawPt;
      const stepRad = angleLock === '90' ? Math.PI / 2 : Math.PI / 4;
      const snappedAngle = Math.round(Math.atan2(dy, dx) / stepRad) * stepRad;
      let nx = anchor[0] + Math.cos(snappedAngle) * len;
      let ny = anchor[1] + Math.sin(snappedAngle) * len;
      if (snapMm > 0) {
        // Snap projected length to grid step for crisp carpentry lengths
        const snappedLen = Math.max(snapMm, Math.round(len / snapMm) * snapMm);
        nx = anchor[0] + Math.cos(snappedAngle) * snappedLen;
        ny = anchor[1] + Math.sin(snappedAngle) * snappedLen;
      }
      return [Math.round(nx), Math.round(ny)];
    },
    [angleLock, snapMm]
  );

  const bounds = useMemo(() => getPolyBounds(points), [points]);
  const areaM2 = useMemo(
    () => (isClosed && points.length >= 3 ? computePolygonAreaM2(points) : 0),
    [points, isClosed]
  );
  const selfIntersectingEdges = useMemo(
    () => findSelfIntersectingEdges(points, isClosed),
    [points, isClosed]
  );
  const hasSelfIntersection = selfIntersectingEdges.size > 0;
  const canSave =
    isClosed &&
    !hasSelfIntersection &&
    points.length >= 3 &&
    bounds.width >= 20 &&
    bounds.height >= 20 &&
    areaM2 > 0.0005;

  const cornerAngles = useMemo(() => {
    if (!isClosed || points.length < 3) return new Map<number, number>();
    const map = new Map<number, number>();
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const prev = points[(i - 1 + n) % n];
      const curr = points[i];
      const next = points[(i + 1) % n];
      const v1x = prev[0] - curr[0];
      const v1y = prev[1] - curr[1];
      const v2x = next[0] - curr[0];
      const v2y = next[1] - curr[1];
      const l1 = Math.hypot(v1x, v1y);
      const l2 = Math.hypot(v2x, v2y);
      if (l1 < 5 || l2 < 5) continue;
      const dot = Math.max(-1, Math.min(1, (v1x * v2x + v1y * v2y) / (l1 * l2)));
      const deg = Math.round((Math.acos(dot) * 180) / Math.PI);
      if (Math.abs(deg - 90) > 1 && Math.abs(deg - 180) > 1) {
        map.set(i, deg);
      }
    }
    return map;
  }, [points, isClosed]);

  const handleStepDirection = (dxSign: number, dySign: number) => {
    const len = Math.max(10, Math.round(stepLenMm));
    setPoints((prev) => {
      const last = prev.length > 0 ? prev[prev.length - 1] : ([0, 0] as [number, number]);
      const nextPt: [number, number] = [last[0] + dxSign * len, last[1] + dySign * len];
      return prev.length === 0 ? [[0, 0], nextPt] : [...prev, nextPt];
    });
  };

  const handleLoadQuickShape = (preset: QuickShapePreset) => {
    setPoints(preset.points.map(([x, y]) => [x, y]));
    setIsClosed(true);
    setMode('edit');
    setSelectedIdx(null);
    if (!editingPart) {
      setPartName(preset.defaultName);
      setOrientation(preset.orientation);
    }
    fitViewToPoints(preset.points);
  };

  const handleClearCanvas = () => {
    setPoints([]);
    setIsClosed(false);
    setMode('draw');
    setSelectedIdx(null);
    setHoverWorld(null);
  };

  const handleUndoPoint = () => {
    if (points.length === 0) return;
    if (isClosed) {
      setIsClosed(false);
      setMode('draw');
      return;
    }
    setPoints((prev) => prev.slice(0, -1));
  };

  const handleClosePolygon = () => {
    if (points.length >= 3) {
      setIsClosed(true);
      setMode('edit');
      setHoverWorld(null);
    }
  };

  const handleSvgPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Start 2-finger mobile pinch-to-zoom & pan
    if (activePointersRef.current.size === 2) {
      dragRef.current.type = null;
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.max(10, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      pinchRef.current = {
        active: true,
        startDist: dist,
        startZoom: zoom,
        startMidX: (pts[0].x + pts[1].x) / 2,
        startMidY: (pts[0].y + pts[1].y) / 2,
        startCenter: [...viewCenter],
      };
      return;
    }

    if (pinchRef.current.active) return;

    if (mode === 'draw' && !isClosed) {
      const rawPt = screenToWorld(e.clientX, e.clientY, true);
      const [wx, wy] = applyAngleConstraint(
        rawPt,
        points.length > 0 ? points[points.length - 1] : undefined
      );

      // Check if clicking near the first point to close shape (>= 3 points)
      if (points.length >= 3) {
        const [fSx, fSy] = worldToScreen(points[0][0], points[0][1]);
        const rect = svgRef.current?.getBoundingClientRect();
        if (rect) {
          const clickX = e.clientX - rect.left;
          const clickY = e.clientY - rect.top;
          if (Math.hypot(clickX - fSx, clickY - fSy) <= 24) {
            handleClosePolygon();
            return;
          }
        }
      }

      // Avoid adding duplicate identical point right on top of the previous point
      if (points.length > 0) {
        const last = points[points.length - 1];
        if (Math.hypot(wx - last[0], wy - last[1]) < 5) return;
      }

      setPoints((prev) => [...prev, [wx, wy]]);
      return;
    }

    // In edit mode, dragging empty background pans the 2D board
    setSelectedIdx(null);
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      type: 'pan',
      vertexIdx: -1,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCenter: [...viewCenter],
    };
  };

  const handleVertexPointerDown = (idx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    if (pinchRef.current.active || activePointersRef.current.size >= 2) return;
    if (mode === 'draw' && !isClosed) {
      if (idx === 0 && points.length >= 3) {
        handleClosePolygon();
      }
      return;
    }
    setSelectedIdx(idx);
    svgRef.current?.setPointerCapture(e.pointerId);
    dragRef.current = {
      type: 'vertex',
      vertexIdx: idx,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startCenter: [...viewCenter],
    };
  };

  const handleSplitEdge = (edgeIdx: number, e: React.PointerEvent) => {
    e.stopPropagation();
    const p1 = points[edgeIdx];
    const p2 = points[(edgeIdx + 1) % points.length];
    const midX = Math.round((p1[0] + p2[0]) / 2);
    const midY = Math.round((p1[1] + p2[1]) / 2);
    const next = [...points];
    next.splice(edgeIdx + 1, 0, [midX, midY]);
    setPoints(next);
    setSelectedIdx(edgeIdx + 1);
  };

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointersRef.current.has(e.pointerId)) {
      activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (pinchRef.current.active && activePointersRef.current.size >= 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.max(10, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
      const scale = dist / pinchRef.current.startDist;
      const nextZoom = Math.max(0.08, Math.min(2.2, pinchRef.current.startZoom * scale));
      const midX = (pts[0].x + pts[1].x) / 2;
      const midY = (pts[0].y + pts[1].y) / 2;
      const dx = midX - pinchRef.current.startMidX;
      const dy = midY - pinchRef.current.startMidY;
      setZoom(nextZoom);
      setViewCenter([
        pinchRef.current.startCenter[0] - dx / nextZoom,
        pinchRef.current.startCenter[1] + dy / nextZoom,
      ]);
      return;
    }

    if (dragRef.current.type === 'vertex') {
      const [wx, wy] = screenToWorld(e.clientX, e.clientY, true);
      const idx = dragRef.current.vertexIdx;
      setPoints((prev) => {
        if (idx < 0 || idx >= prev.length) return prev;
        const copy = [...prev];
        copy[idx] = [wx, wy];
        return copy;
      });
      return;
    }

    if (dragRef.current.type === 'pan') {
      const dx = e.clientX - dragRef.current.startClientX;
      const dy = e.clientY - dragRef.current.startClientY;
      setViewCenter([
        dragRef.current.startCenter[0] - dx / zoom,
        dragRef.current.startCenter[1] + dy / zoom,
      ]);
      return;
    }

    if (mode === 'draw' && !isClosed && e.pointerType === 'mouse') {
      const rawPt = screenToWorld(e.clientX, e.clientY, true);
      setHoverWorld(
        applyAngleConstraint(
          rawPt,
          points.length > 0 ? points[points.length - 1] : undefined
        )
      );
    }
  };

  const handleSvgPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) {
      pinchRef.current.active = false;
    }
    if (dragRef.current.type) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if not captured
      }
      dragRef.current.type = null;
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.14 : 1 / 1.14;
    setZoom((z) => Math.max(0.08, Math.min(2.2, z * factor)));
  };

  const handleDeleteSelectedVertex = () => {
    if (selectedIdx === null || points.length <= 3) return;
    setPoints((prev) => prev.filter((_, i) => i !== selectedIdx));
    setSelectedIdx(null);
  };

  const handleConfirm = () => {
    if (!canSave) return;
    const b = getPolyBounds(points);
    // Re-center polygon around (0, 0) in mm and ensure CCW winding
    const centered = ensureCounterClockwise(
      points.map(([x, y]) => [Math.round(x - b.cx), Math.round(y - b.cy)])
    );
    const width = Math.max(20, b.width);
    const height = Math.max(20, b.height);
    const depth = Math.max(4, Math.round(thicknessMm));

    if (editingPart) {
      const nextRot: [number, number, number] =
        orientation === 'horizontal'
          ? [-90, editingPart.rotation[1], editingPart.rotation[2]]
          : [0, editingPart.rotation[1], editingPart.rotation[2]];

      onUpdateExistingPart(editingPart.id, {
        name: partName.trim() || 'Własna płyta 2D',
        kind: 'custom',
        materialId,
        width,
        height,
        depth,
        rotation: nextRot,
        customPolygon: centered,
      });
    } else {
      const rotation: [number, number, number] =
        orientation === 'horizontal' ? [-90, 0, 0] : [0, 0, 0];
      const posY =
        orientation === 'horizontal'
          ? 750
          : Math.round(height / 2);

      onSaveNewPart({
        name: partName.trim() || 'Własna płyta 2D',
        kind: 'custom',
        materialId,
        width,
        height,
        depth,
        position: [0, posY, 0],
        rotation,
        customPolygon: centered,
      });
    }
    onClose();
  };

  // Compute adaptive SVG grid lines
  const gridLines = useMemo(() => {
    const stepMm = zoom > 0.55 ? 50 : zoom > 0.22 ? 100 : 200;
    const majorEvery = stepMm * 5;
    const halfW = svgSize.width / 2 / zoom;
    const halfH = svgSize.height / 2 / zoom;
    const startX = Math.floor((viewCenter[0] - halfW) / stepMm) * stepMm;
    const endX = Math.ceil((viewCenter[0] + halfW) / stepMm) * stepMm;
    const startY = Math.floor((viewCenter[1] - halfH) / stepMm) * stepMm;
    const endY = Math.ceil((viewCenter[1] + halfH) / stepMm) * stepMm;

    const verticals: { x: number; sx: number; major: boolean; origin: boolean }[] = [];
    for (let x = startX; x <= endX; x += stepMm) {
      const [sx] = worldToScreen(x, 0);
      verticals.push({
        x,
        sx,
        major: x % majorEvery === 0,
        origin: x === 0,
      });
    }
    const horizontals: { y: number; sy: number; major: boolean; origin: boolean }[] = [];
    for (let y = startY; y <= endY; y += stepMm) {
      const [, sy] = worldToScreen(0, y);
      horizontals.push({
        y,
        sy,
        major: y % majorEvery === 0,
        origin: y === 0,
      });
    }
    return { verticals, horizontals, stepMm };
  }, [viewCenter, zoom, svgSize, worldToScreen]);

  if (!open) return null;

  const screenPoints = points.map(([x, y]) => worldToScreen(x, y));
  const polygonStr = screenPoints.map(([sx, sy]) => `${sx},${sy}`).join(' ');
  const hoverScreen = hoverWorld ? worldToScreen(hoverWorld[0], hoverWorld[1]) : null;
  const edgeCount = isClosed ? points.length : Math.max(0, points.length - 1);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0F1013] text-zinc-100">
      {/* Top Bar */}
      <header className="flex h-12 shrink-0 items-center justify-between gap-2 border-b border-zinc-800 bg-[#141518] px-3 sm:px-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <PenTool className="h-4 w-4 text-amber-400 shrink-0" />
          <h2 className="text-sm font-semibold text-white truncate">
            {editingPart ? 'Edycja kształtu 2D' : 'Szkicownik własnych kształtów 2D'}
          </h2>
          {isClosed && (
            <span className="hidden sm:inline text-xs text-zinc-400 font-mono-num">
              {bounds.width} × {bounds.height} mm · {areaM2.toFixed(2)} m²
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
          aria-label="Zamknij szkicownik"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      {/* Main Split Area: Interactive 2D Drafting Board + Compact Settings Sidebar/Sheet */}
      <div className="flex flex-1 min-h-0 flex-col lg:flex-row">
        {/* Left/Top: 2D CAD Drawing Board */}
        <div className="relative flex flex-1 min-h-[46vh] flex-col bg-[#111317]">
          {/* Compact 2D Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-zinc-800/80 bg-[#141518] px-2.5 py-1.5">
            <div className="flex items-center gap-1">
              {/* Mode Switch */}
              <div className="flex items-center rounded-lg border border-zinc-800 bg-zinc-900 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    if (isClosed) {
                      setPoints([]);
                      setIsClosed(false);
                    }
                    setMode('draw');
                    setSelectedIdx(null);
                  }}
                  className={`flex min-h-[34px] items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer ${
                    mode === 'draw'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <PenTool className="h-3.5 w-3.5" />
                  <span>Rysuj</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (points.length >= 3) {
                      setIsClosed(true);
                      setMode('edit');
                    }
                  }}
                  disabled={points.length < 3}
                  className={`flex min-h-[34px] items-center gap-1 rounded-md px-2.5 text-xs font-medium transition-colors cursor-pointer disabled:opacity-35 ${
                    mode === 'edit'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  <MousePointer2 className="h-3.5 w-3.5" />
                  <span>Edytuj</span>
                </button>
              </div>

              {mode === 'draw' && !isClosed && (
                <button
                  type="button"
                  onClick={handleClosePolygon}
                  disabled={points.length < 3}
                  className={`flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    points.length >= 3
                      ? 'bg-emerald-500 text-zinc-950 hover:bg-emerald-400 cursor-pointer'
                      : 'border border-zinc-800 bg-zinc-900 text-zinc-500 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  <span>Zamknij</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleUndoPoint}
                disabled={points.length === 0}
                title="Cofnij ostatni punkt"
                className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white disabled:opacity-35 cursor-pointer"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={handleClearCanvas}
                disabled={points.length === 0}
                title="Wyczyść szkic"
                className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-red-400 disabled:opacity-35 cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Snap + Angle Lock + Zoom controls */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() =>
                  setAngleLock((cur) => (cur === 'off' ? '90' : cur === '90' ? '45' : 'off'))
                }
                className={`min-h-[34px] rounded-lg border px-2 text-[11px] font-medium font-mono-num cursor-pointer whitespace-nowrap transition-colors ${
                  angleLock !== 'off'
                    ? 'border-amber-500/70 bg-amber-500/15 text-amber-300'
                    : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white'
                }`}
                title="Blokada kąta odcinków podczas rysowania"
              >
                Kąt: {angleLock === 'off' ? 'Wolny' : `${angleLock}°`}
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = SNAP_OPTIONS.indexOf(snapMm);
                  setSnapMm(SNAP_OPTIONS[(idx + 1) % SNAP_OPTIONS.length]);
                }}
                className="min-h-[34px] rounded-lg border border-zinc-800 bg-zinc-900 px-2 text-[11px] font-medium text-zinc-300 hover:text-white font-mono-num cursor-pointer whitespace-nowrap"
                title="Skok przyciągania do siatki"
              >
                Siatka: {snapMm > 0 ? `${snapMm} mm` : 'Wył.'}
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.2, z * 1.25))}
                aria-label="Przybliż"
                className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white cursor-pointer"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.08, z / 1.25))}
                aria-label="Oddal"
                className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white cursor-pointer"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => fitViewToPoints(points)}
                aria-label="Dopasuj widok"
                title="Dopasuj widok"
                className="flex min-h-[34px] min-w-[34px] items-center justify-center rounded-lg border border-zinc-800 bg-zinc-900 text-zinc-300 hover:text-white cursor-pointer"
              >
                <Maximize2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Quick-start starter shapes strip */}
          <div className="flex items-center gap-1.5 overflow-x-auto border-b border-zinc-800/60 bg-[#121317] px-2.5 py-1.5">
            <span className="text-[11px] text-zinc-500 whitespace-nowrap shrink-0">
              Gotowe bazy:
            </span>
            {QUICK_SHAPES.map((qs) => (
              <button
                key={qs.id}
                type="button"
                onClick={() => handleLoadQuickShape(qs)}
                className="rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 hover:border-amber-500/70 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                {qs.label}
              </button>
            ))}
          </div>

          {/* Interactive SVG CAD Canvas */}
          <div className="relative flex-1 min-h-0 overflow-hidden select-none">
            <svg
              ref={svgRef}
              onPointerDown={handleSvgPointerDown}
              onPointerMove={handleSvgPointerMove}
              onPointerUp={handleSvgPointerUp}
              onPointerCancel={handleSvgPointerUp}
              onPointerLeave={() => setHoverWorld(null)}
              onWheel={handleWheel}
              className="h-full w-full canvas-touch-lock cursor-crosshair"
            >
              {/* Grid lines */}
              <g pointerEvents="none">
                {gridLines.verticals.map((v) => (
                  <line
                    key={`vx_${v.x}`}
                    x1={v.sx}
                    y1={0}
                    x2={v.sx}
                    y2={svgSize.height}
                    stroke={
                      v.origin
                        ? 'rgba(245, 158, 11, 0.35)'
                        : v.major
                          ? 'rgba(255, 255, 255, 0.11)'
                          : 'rgba(255, 255, 255, 0.045)'
                    }
                    strokeWidth={v.origin ? 1.5 : 1}
                  />
                ))}
                {gridLines.horizontals.map((h) => (
                  <line
                    key={`hy_${h.y}`}
                    x1={0}
                    y1={h.sy}
                    x2={svgSize.width}
                    y2={h.sy}
                    stroke={
                      h.origin
                        ? 'rgba(245, 158, 11, 0.35)'
                        : h.major
                          ? 'rgba(255, 255, 255, 0.11)'
                          : 'rgba(255, 255, 255, 0.045)'
                    }
                    strokeWidth={h.origin ? 1.5 : 1}
                  />
                ))}
              </g>

              {/* Filled closed polygon OR open polyline */}
              {isClosed && screenPoints.length >= 3 ? (
                <polygon
                  points={polygonStr}
                  fill={hasSelfIntersection ? 'rgba(239, 68, 68, 0.16)' : 'rgba(245, 158, 11, 0.18)'}
                  stroke={hasSelfIntersection ? '#EF4444' : '#F59E0B'}
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              ) : screenPoints.length >= 2 ? (
                <polyline
                  points={polygonStr}
                  fill="none"
                  stroke="#F59E0B"
                  strokeWidth={2.5}
                  strokeLinejoin="round"
                />
              ) : null}

              {/* Highlight self-intersecting edges explicitly in crisp red */}
              {hasSelfIntersection &&
                Array.from(selfIntersectingEdges).map((edgeIdx) => {
                  const a = screenPoints[edgeIdx];
                  const b = screenPoints[(edgeIdx + 1) % screenPoints.length];
                  if (!a || !b) return null;
                  return (
                    <line
                      key={`bad_edge_${edgeIdx}`}
                      x1={a[0]}
                      y1={a[1]}
                      x2={b[0]}
                      y2={b[1]}
                      stroke="#EF4444"
                      strokeWidth={3.5}
                      strokeDasharray="8 4"
                      pointerEvents="none"
                    />
                  );
                })}

              {/* Live dashed preview segment while drawing */}
              {mode === 'draw' && !isClosed && points.length > 0 && hoverScreen && hoverWorld && (
                <g pointerEvents="none">
                  <line
                    x1={screenPoints[screenPoints.length - 1][0]}
                    y1={screenPoints[screenPoints.length - 1][1]}
                    x2={hoverScreen[0]}
                    y2={hoverScreen[1]}
                    stroke="#FBBF24"
                    strokeWidth={1.75}
                    strokeDasharray="6 5"
                  />
                  {(() => {
                    const last = points[points.length - 1];
                    const len = Math.round(
                      Math.hypot(hoverWorld[0] - last[0], hoverWorld[1] - last[1])
                    );
                    if (len < 10) return null;
                    const mx = (screenPoints[screenPoints.length - 1][0] + hoverScreen[0]) / 2;
                    const my = (screenPoints[screenPoints.length - 1][1] + hoverScreen[1]) / 2;
                    return (
                      <g transform={`translate(${mx}, ${my - 10})`}>
                        <rect
                          x={-28}
                          y={-10}
                          width={56}
                          height={18}
                          rx={4}
                          fill="#141518"
                          stroke="#F59E0B"
                          strokeWidth={1}
                        />
                        <text
                          textAnchor="middle"
                          y={3}
                          fill="#FDE68A"
                          fontSize={10}
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {len} mm
                        </text>
                      </g>
                    );
                  })()}
                </g>
              )}

              {/* Edge Dimension Labels + Split Midpoint (+) Handles */}
              {Array.from({ length: edgeCount }).map((_, idx) => {
                const nextIdx = (idx + 1) % points.length;
                const p1 = points[idx];
                const p2 = points[nextIdx];
                const [s1x, s1y] = screenPoints[idx];
                const [s2x, s2y] = screenPoints[nextIdx];
                const lenMm = Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]));
                const screenLen = Math.hypot(s2x - s1x, s2y - s1y);
                const mx = (s1x + s2x) / 2;
                const my = (s1y + s2y) / 2;

                // Outward offset for label so it doesn't sit on top of the '+' handle
                const nx = -(s2y - s1y) / Math.max(1, screenLen);
                const ny = (s2x - s1x) / Math.max(1, screenLen);

                return (
                  <g key={`edge_${idx}`}>
                    {screenLen > 34 && (
                      <g
                        transform={`translate(${mx + nx * 16}, ${my + ny * 16})`}
                        pointerEvents="none"
                      >
                        <rect
                          x={-26}
                          y={-9}
                          width={52}
                          height={17}
                          rx={4}
                          fill="rgba(20, 21, 24, 0.9)"
                        />
                        <text
                          textAnchor="middle"
                          y={3}
                          fill="#E4E4E7"
                          fontSize={10}
                          fontFamily="JetBrains Mono, monospace"
                        >
                          {lenMm}
                        </text>
                      </g>
                    )}

                    {/* Midpoint "+" button to add a new corner/notch in Edit mode */}
                    {mode === 'edit' && isClosed && screenLen > 38 && (
                      <g
                        transform={`translate(${mx}, ${my})`}
                        onPointerDown={(e) => handleSplitEdge(idx, e)}
                        className="cursor-pointer"
                      >
                        <circle r={18} fill="transparent" />
                        <circle
                          r={8}
                          fill="#18181B"
                          stroke="#71717A"
                          strokeWidth={1.5}
                        />
                        <line x1={-3.5} y1={0} x2={3.5} y2={0} stroke="#E4E4E7" strokeWidth={1.5} />
                        <line x1={0} y1={-3.5} x2={0} y2={3.5} stroke="#E4E4E7" strokeWidth={1.5} />
                      </g>
                    )}
                  </g>
                );
              })}

              {/* Draggable Vertex Handles */}
              {screenPoints.map(([sx, sy], idx) => {
                const isFirstCloseTarget =
                  mode === 'draw' && !isClosed && idx === 0 && points.length >= 3;
                const isSelected = selectedIdx === idx;
                return (
                  <g
                    key={`v_${idx}`}
                    transform={`translate(${sx}, ${sy})`}
                    onPointerDown={(e) => handleVertexPointerDown(idx, e)}
                    className={mode === 'edit' ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'}
                  >
                    {/* Generous invisible hit circle for effortless finger dragging on phones */}
                    <circle r={24} fill="transparent" />
                    {isFirstCloseTarget && (
                      <circle
                        r={14}
                        fill="rgba(16, 185, 129, 0.22)"
                        stroke="#10B981"
                        strokeWidth={1.5}
                      />
                    )}
                    <circle
                      r={isSelected ? 8 : 6.5}
                      fill={
                        isFirstCloseTarget
                          ? '#10B981'
                          : isSelected
                            ? '#FFFFFF'
                            : '#F59E0B'
                      }
                      stroke={isSelected ? '#F59E0B' : '#141518'}
                      strokeWidth={2.5}
                    />
                  </g>
                );
              })}
              {/* Corner Cut Angle Badges (for non-90 deg corners) */}
              {isClosed &&
                screenPoints.map(([sx, sy], idx) => {
                  const deg = cornerAngles.get(idx);
                  if (deg === undefined) return null;
                  return (
                    <g
                      key={`ang_${idx}`}
                      transform={`translate(${sx + 14}, ${sy - 14})`}
                      pointerEvents="none"
                    >
                      <rect
                        x={-16}
                        y={-9}
                        width={32}
                        height={16}
                        rx={4}
                        fill="rgba(14, 116, 144, 0.92)"
                      />
                      <text
                        textAnchor="middle"
                        y={2.5}
                        fill="#ECFEFF"
                        fontSize={9.5}
                        fontFamily="JetBrains Mono, monospace"
                      >
                        {deg}°
                      </text>
                    </g>
                  );
                })}
            </svg>

            {/* Self-Intersection Warning Banner */}
            {hasSelfIntersection && (
              <div className="pointer-events-none absolute top-2 right-2.5 flex items-center gap-1.5 rounded-lg border border-red-500/60 bg-red-950/90 px-2.5 py-1.5 text-[11px] font-medium text-red-200 shadow-lg">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span>Krawędzie się krzyżują — popraw narożniki</span>
              </div>
            )}

            {/* Directional Exact-Length Entry Bar in Draw Mode */}
            {mode === 'draw' && !isClosed && (
              <div className="absolute top-2 left-2.5 flex items-center gap-1 rounded-xl border border-zinc-700/90 bg-[#141518]/95 px-2 py-1 text-xs shadow-lg">
                <input
                  type="number"
                  min={10}
                  max={5000}
                  step={10}
                  value={stepLenMm}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) setStepLenMm(Math.max(10, Math.min(5000, Math.round(v))));
                  }}
                  aria-label="Długość kolejnego odcinka w mm"
                  className="w-14 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
                <span className="text-[10px] text-zinc-400 mr-0.5">mm</span>
                <button
                  type="button"
                  onClick={() => handleStepDirection(-1, 0)}
                  title="Dodaj odcinek w lewo"
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-200 hover:bg-amber-500 hover:text-zinc-950 cursor-pointer"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStepDirection(0, 1)}
                  title="Dodaj odcinek w górę"
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-200 hover:bg-amber-500 hover:text-zinc-950 cursor-pointer"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStepDirection(0, -1)}
                  title="Dodaj odcinek w dół"
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-200 hover:bg-amber-500 hover:text-zinc-950 cursor-pointer"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleStepDirection(1, 0)}
                  title="Dodaj odcinek w prawo"
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-zinc-800 text-zinc-200 hover:bg-amber-500 hover:text-zinc-950 cursor-pointer"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Quiet Bottom-Left Helper Hint */}
            <div className="pointer-events-none absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
              <span className="rounded-lg bg-[#141518]/90 px-2.5 py-1 border border-zinc-800/90 truncate">
                {mode === 'draw' && !isClosed
                  ? points.length < 3
                    ? `Kliknij na siatce lub wpisz odcinek w mm (${points.length}/3 min.)`
                    : 'Kliknij zielony pierwszy punkt lub „Zamknij”'
                  : 'Przeciągnij narożnik · Kliknij „+” aby dodać wcięcie · 2 palce = zoom'}
              </span>
              <span className="hidden sm:inline rounded-lg bg-[#141518]/90 px-2 py-1 border border-zinc-800/90 font-mono-num shrink-0">
                1 kratka = {gridLines.stepMm} mm
              </span>
            </div>

            {/* Selected Vertex Precision Bar (Edit Mode) */}
            {mode === 'edit' && selectedIdx !== null && points[selectedIdx] && (
              <div className="absolute top-2 left-2.5 flex items-center gap-2 rounded-xl border border-zinc-700 bg-[#141518]/95 px-2.5 py-1.5 text-xs shadow-xl">
                <span className="text-[11px] font-semibold text-amber-400 whitespace-nowrap">
                  Pkt #{selectedIdx + 1}
                </span>
                <label className="flex items-center gap-1">
                  <span className="text-[11px] text-zinc-400">X</span>
                  <input
                    type="number"
                    value={points[selectedIdx][0]}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isNaN(val)) return;
                      setPoints((prev) => {
                        const next = [...prev];
                        next[selectedIdx] = [Math.round(val), next[selectedIdx][1]];
                        return next;
                      });
                    }}
                    className="w-16 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="flex items-center gap-1">
                  <span className="text-[11px] text-zinc-400">Y</span>
                  <input
                    type="number"
                    value={points[selectedIdx][1]}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      if (Number.isNaN(val)) return;
                      setPoints((prev) => {
                        const next = [...prev];
                        next[selectedIdx] = [next[selectedIdx][0], Math.round(val)];
                        return next;
                      });
                    }}
                    className="w-16 rounded-md border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-center text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleDeleteSelectedVertex}
                  disabled={points.length <= 3}
                  title="Usuń ten narożnik"
                  className="flex h-7 w-7 items-center justify-center rounded-md bg-red-500/20 text-red-300 hover:bg-red-500/35 disabled:opacity-30 cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right / Bottom Settings Column */}
        <aside className="flex w-full lg:w-[320px] shrink-0 flex-col border-t lg:border-t-0 lg:border-l border-zinc-800 bg-[#141518] max-h-[42vh] lg:max-h-none">
          <div className="cad-scroll flex-1 overflow-y-auto px-4 py-3.5 space-y-4">
            {/* Name */}
            <label className="block">
              <span className="text-xs font-medium text-zinc-300">Nazwa elementu</span>
              <input
                type="text"
                value={partName}
                onChange={(e) => setPartName(e.target.value)}
                className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
              />
            </label>

            {/* 3D Orientation */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-300">Ustawienie w 3D</span>
              <div className="grid grid-cols-2 gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
                <button
                  type="button"
                  onClick={() => setOrientation('vertical')}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    orientation === 'vertical'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Pionowo (ściana)
                </button>
                <button
                  type="button"
                  onClick={() => setOrientation('horizontal')}
                  className={`rounded-md py-1.5 text-xs font-medium transition-colors cursor-pointer ${
                    orientation === 'horizontal'
                      ? 'bg-amber-500 text-zinc-950 font-semibold'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  Poziomo (półka/blat)
                </button>
              </div>
            </div>

            {/* Board Thickness */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-zinc-300">Grubość płyty (mm)</span>
                <input
                  type="number"
                  min={4}
                  max={120}
                  value={thicknessMm}
                  onChange={(e) => {
                    const v = Number(e.target.value);
                    if (!Number.isNaN(v)) setThicknessMm(Math.max(4, Math.min(120, Math.round(v))));
                  }}
                  className="w-16 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 text-right text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {THICKNESS_PRESETS.map((th) => (
                  <button
                    key={th}
                    type="button"
                    onClick={() => setThicknessMm(th)}
                    className={`rounded-lg border py-1.5 text-xs font-mono-num transition-colors cursor-pointer ${
                      thicknessMm === th
                        ? 'border-amber-500 bg-amber-500/15 text-amber-300 font-semibold'
                        : 'border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-700'
                    }`}
                  >
                    {th} mm
                  </button>
                ))}
              </div>
            </div>

            {/* Material Swatches */}
            <div className="space-y-1.5">
              <span className="text-xs font-medium text-zinc-300">Materiał i tekstura</span>
              <div className="grid grid-cols-2 gap-1.5">
                {MATERIAL_CATALOG.map((mat) => {
                  const active = materialId === mat.id;
                  return (
                    <button
                      key={mat.id}
                      type="button"
                      onClick={() => setMaterialId(mat.id)}
                      className={`flex items-center gap-2 rounded-lg border p-1.5 text-left transition-colors cursor-pointer ${
                        active
                          ? 'border-amber-500 bg-amber-500/12 text-white'
                          : 'border-zinc-800 bg-zinc-900/70 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      <img
                        src={swatches[mat.id]}
                        alt={mat.name}
                        referrerPolicy="no-referrer"
                        className="h-7 w-7 rounded-md object-cover border border-white/10 shrink-0"
                      />
                      <span className="text-[11px] font-medium truncate">
                        {mat.shortName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Sticky Confirm Footer */}
          <div className="border-t border-zinc-800 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-zinc-400 font-mono-num">
              <span>
                {isClosed
                  ? `${bounds.width} × ${bounds.height} × ${thicknessMm} mm`
                  : 'Narysuj min. 3 narożniki'}
              </span>
              <span>{isClosed ? `${areaM2.toFixed(2)} m² · ${points.length} pkt` : ''}</span>
            </div>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!canSave}
              className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>
                {editingPart ? 'Zapisz zmieniony kształt w 3D' : 'Wstaw własny kształt do 3D'}
              </span>
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
};
