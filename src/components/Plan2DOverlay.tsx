import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Box,
  Download,
  Maximize2,
  Printer,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  FurniturePart,
  getMaterialMeta,
  RoomConfig,
} from '../types/furniture';
import { getPartWorldBox } from '../engine/carpentry';

interface Plan2DOverlayProps {
  projectName: string;
  parts: FurniturePart[];
  room?: RoomConfig;
  selectedPartId: string | null;
  selectedPartIds: string[];
  snapMm: number;
  onSelectPart: (id: string | null, additive?: boolean) => void;
  onMoveParts2D: (
    updates: Array<{ id: string; position: [number, number, number]; rotation: [number, number, number] }>
  ) => void;
  onSwitchTo3D: () => void;
}

interface TopFootprint {
  id: string;
  name: string;
  groupId?: string;
  materialHex: string;
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  widthMm: number;
  depthMm: number;
  part: FurniturePart;
}

function roundSnap(val: number, step: number): number {
  const s = Math.max(1, step);
  return Math.round(val / s) * s;
}

export const Plan2DOverlay: React.FC<Plan2DOverlayProps> = ({
  projectName,
  parts,
  room,
  selectedPartId,
  selectedPartIds,
  snapMm,
  onSelectPart,
  onMoveParts2D,
  onSwitchTo3D,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [panMm, setPanMm] = useState<{ x: number; z: number }>({ x: 0, z: 0 });
  const [dragState, setDragState] = useState<
    | null
    | {
        mode: 'pan';
        startClientX: number;
        startClientY: number;
        origPanX: number;
        origPanZ: number;
      }
    | {
        mode: 'move';
        startWorldX: number;
        startWorldZ: number;
        movingParts: FurniturePart[];
        currentDx: number;
        currentDz: number;
      }
  >(null);

  const visibleParts = useMemo(() => parts.filter((p) => !p.hidden), [parts]);

  // Compute exact 2D top-down world bounding footprints (X, Z)
  const footprints = useMemo<TopFootprint[]>(() => {
    const list: TopFootprint[] = [];
    for (const p of visibleParts) {
      const box = getPartWorldBox(p);
      const meta = getMaterialMeta(p.materialId);
      list.push({
        id: p.id,
        name: p.name,
        groupId: p.groupId,
        materialHex: p.kind === 'appliance' ? '#64748B' : meta.swatchFallbackHex || '#C59B5F',
        minX: box.minX,
        maxX: box.maxX,
        minZ: box.minZ,
        maxZ: box.maxZ,
        widthMm: Math.round(box.maxX - box.minX),
        depthMm: Math.round(box.maxZ - box.minZ),
        part: p,
      });
    }
    return list;
  }, [visibleParts]);

  // Collapse grouped cabinets into clean top-level labels for architectural chain dimensions
  const chainItems = useMemo(() => {
    const byKey = new Map<
      string,
      { key: string; label: string; minX: number; maxX: number; minZ: number; maxZ: number }
    >();
    for (const fp of footprints) {
      const key = fp.groupId ? `grp:${fp.groupId}` : fp.id;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, {
          key,
          label: fp.name,
          minX: fp.minX,
          maxX: fp.maxX,
          minZ: fp.minZ,
          maxZ: fp.maxZ,
        });
      } else {
        existing.minX = Math.min(existing.minX, fp.minX);
        existing.maxX = Math.max(existing.maxX, fp.maxX);
        existing.minZ = Math.min(existing.minZ, fp.minZ);
        existing.maxZ = Math.max(existing.maxZ, fp.maxZ);
      }
    }
    return Array.from(byKey.values());
  }, [footprints]);

  // Compute scene bounding box including room walls (mm)
  const bounds = useMemo(() => {
    let minX = -1200;
    let maxX = 1200;
    let minZ = -900;
    let maxZ = 900;
    let hasAny = false;

    const expand = (x0: number, x1: number, z0: number, z1: number) => {
      if (!hasAny) {
        minX = x0;
        maxX = x1;
        minZ = z0;
        maxZ = z1;
        hasAny = true;
      } else {
        minX = Math.min(minX, x0);
        maxX = Math.max(maxX, x1);
        minZ = Math.min(minZ, z0);
        maxZ = Math.max(maxZ, z1);
      }
    };

    if (room?.enabled && room.floorPoints && room.floorPoints.length >= 3) {
      for (const pt of room.floorPoints) {
        expand(pt.xMm, pt.xMm, pt.zMm, pt.zMm);
      }
    } else if (room?.enabled) {
      const hw = room.widthMm / 2;
      expand(-hw, hw, room.backWallZMm, room.backWallZMm + room.depthMm);
    }

    for (const fp of footprints) {
      expand(fp.minX, fp.maxX, fp.minZ, fp.maxZ);
    }

    const padX = Math.max(450, (maxX - minX) * 0.25);
    const padZ = Math.max(450, (maxZ - minZ) * 0.25);
    return {
      minX: minX - padX,
      maxX: maxX + padX,
      minZ: minZ - padZ,
      maxZ: maxZ + padZ,
      rawMinX: hasAny ? minX : -600,
      rawMaxX: hasAny ? maxX : 600,
      rawMinZ: hasAny ? minZ : -400,
      rawMaxZ: hasAny ? maxZ : 400,
      hasAny,
    };
  }, [footprints, room]);

  const viewWidthMm = (bounds.maxX - bounds.minX) / zoom;
  const viewHeightMm = (bounds.maxZ - bounds.minZ) / zoom;
  const centerX = (bounds.minX + bounds.maxX) / 2 + panMm.x;
  const centerZ = (bounds.minZ + bounds.maxZ) / 2 + panMm.z;
  const vbMinX = centerX - viewWidthMm / 2;
  const vbMinZ = centerZ - viewHeightMm / 2;

  // Dynamic font / stroke scale so text stays crisp at every zoom level
  const mmPerUnit = Math.max(viewWidthMm, viewHeightMm) / 900;

  const clientToWorldMm = useCallback(
    (clientX: number, clientY: number): { x: number; z: number } => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, z: 0 };
      const rect = svg.getBoundingClientRect();
      const nx = (clientX - rect.left) / Math.max(1, rect.width);
      const ny = (clientY - rect.top) / Math.max(1, rect.height);
      // Preserve meet aspect ratio mapping
      const svgAspect = rect.width / Math.max(1, rect.height);
      const vbAspect = viewWidthMm / Math.max(1, viewHeightMm);
      let renderW = viewWidthMm;
      let renderH = viewHeightMm;
      let offX = 0;
      let offZ = 0;
      if (svgAspect > vbAspect) {
        renderW = viewHeightMm * svgAspect;
        offX = (renderW - viewWidthMm) / 2;
      } else {
        renderH = viewWidthMm / svgAspect;
        offZ = (renderH - viewHeightMm) / 2;
      }
      return {
        x: vbMinX - offX + nx * renderW,
        z: vbMinZ - offZ + ny * renderH,
      };
    },
    [vbMinX, vbMinZ, viewWidthMm, viewHeightMm]
  );

  // Selected footprint (single or group) + live clearance distances to nearest neighbors & room walls
  const selectedBox = useMemo(() => {
    const activeIds = new Set(
      selectedPartIds.length > 0 ? selectedPartIds : selectedPartId ? [selectedPartId] : []
    );
    if (activeIds.size === 0) return null;
    const activeFps = footprints.filter((fp) => activeIds.has(fp.id));
    if (activeFps.length === 0) return null;
    const dx = dragState?.mode === 'move' ? dragState.currentDx : 0;
    const dz = dragState?.mode === 'move' ? dragState.currentDz : 0;
    const minX = Math.min(...activeFps.map((f) => f.minX)) + dx;
    const maxX = Math.max(...activeFps.map((f) => f.maxX)) + dx;
    const minZ = Math.min(...activeFps.map((f) => f.minZ)) + dz;
    const maxZ = Math.max(...activeFps.map((f) => f.maxZ)) + dz;
    return { activeIds, minX, maxX, minZ, maxZ };
  }, [footprints, selectedPartId, selectedPartIds, dragState]);

  const liveDistanceGuides = useMemo(() => {
    if (!selectedBox) return [];
    const guides: Array<{
      id: string;
      x1: number;
      z1: number;
      x2: number;
      z2: number;
      distMm: number;
    }> = [];

    const cx = (selectedBox.minX + selectedBox.maxX) / 2;
    const cz = (selectedBox.minZ + selectedBox.maxZ) / 2;

    // Candidate boundaries from other parts & room walls
    let nearestLeft: number | null = null;
    let nearestRight: number | null = null;
    let nearestBack: number | null = null;
    let nearestFront: number | null = null;

    if (room?.enabled) {
      const rMinX = room.floorPoints?.length
        ? Math.min(...room.floorPoints.map((p) => p.xMm))
        : -room.widthMm / 2;
      const rMaxX = room.floorPoints?.length
        ? Math.max(...room.floorPoints.map((p) => p.xMm))
        : room.widthMm / 2;
      const rMinZ = room.floorPoints?.length
        ? Math.min(...room.floorPoints.map((p) => p.zMm))
        : room.backWallZMm;
      const rMaxZ = room.floorPoints?.length
        ? Math.max(...room.floorPoints.map((p) => p.zMm))
        : room.backWallZMm + room.depthMm;

      if (rMinX <= selectedBox.minX) nearestLeft = rMinX;
      if (rMaxX >= selectedBox.maxX) nearestRight = rMaxX;
      if (rMinZ <= selectedBox.minZ) nearestBack = rMinZ;
      if (rMaxZ >= selectedBox.maxZ) nearestFront = rMaxZ;
    }

    for (const fp of footprints) {
      if (selectedBox.activeIds.has(fp.id)) continue;
      // Overlap in Z for left/right gaps
      if (fp.maxZ > selectedBox.minZ - 80 && fp.minZ < selectedBox.maxZ + 80) {
        if (fp.maxX <= selectedBox.minX + 1) {
          if (nearestLeft === null || fp.maxX > nearestLeft) nearestLeft = fp.maxX;
        }
        if (fp.minX >= selectedBox.maxX - 1) {
          if (nearestRight === null || fp.minX < nearestRight) nearestRight = fp.minX;
        }
      }
      // Overlap in X for back/front gaps
      if (fp.maxX > selectedBox.minX - 80 && fp.minX < selectedBox.maxX + 80) {
        if (fp.maxZ <= selectedBox.minZ + 1) {
          if (nearestBack === null || fp.maxZ > nearestBack) nearestBack = fp.maxZ;
        }
        if (fp.minZ >= selectedBox.maxZ - 1) {
          if (nearestFront === null || fp.minZ < nearestFront) nearestFront = fp.minZ;
        }
      }
    }

    if (nearestLeft !== null) {
      const d = Math.round(selectedBox.minX - nearestLeft);
      if (d > 2) guides.push({ id: 'left', x1: nearestLeft, z1: cz, x2: selectedBox.minX, z2: cz, distMm: d });
    }
    if (nearestRight !== null) {
      const d = Math.round(nearestRight - selectedBox.maxX);
      if (d > 2) guides.push({ id: 'right', x1: selectedBox.maxX, z1: cz, x2: nearestRight, z2: cz, distMm: d });
    }
    if (nearestBack !== null) {
      const d = Math.round(selectedBox.minZ - nearestBack);
      if (d > 2) guides.push({ id: 'back', x1: cx, z1: nearestBack, x2: cx, z2: selectedBox.minZ, distMm: d });
    }
    if (nearestFront !== null) {
      const d = Math.round(nearestFront - selectedBox.maxZ);
      if (d > 2) guides.push({ id: 'front', x1: cx, z1: selectedBox.maxZ, x2: cx, z2: nearestFront, distMm: d });
    }

    return guides;
  }, [selectedBox, footprints, room]);

  // Architectural horizontal chain dimensions sorted left-to-right
  const xChainSegments = useMemo(() => {
    const sorted = [...chainItems].sort((a, b) => a.minX - b.minX);
    const segs: Array<{ x1: number; x2: number; label: string; isGap: boolean }> = [];
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const w = Math.round(item.maxX - item.minX);
      if (w >= 15) {
        segs.push({ x1: item.minX, x2: item.maxX, label: `${w}`, isGap: false });
      }
      const next = sorted[i + 1];
      if (next && next.minX - item.maxX > 15) {
        const gap = Math.round(next.minX - item.maxX);
        segs.push({ x1: item.maxX, x2: next.minX, label: `${gap}`, isGap: true });
      }
    }
    return segs;
  }, [chainItems]);

  const handlePointerDownBg = (e: React.PointerEvent<SVGSVGElement>) => {
    if ((e.target as Element).getAttribute?.('data-role') === 'part') return;
    onSelectPart(null);
    setDragState({
      mode: 'pan',
      startClientX: e.clientX,
      startClientY: e.clientY,
      origPanX: panMm.x,
      origPanZ: panMm.z,
    });
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerDownPart = (e: React.PointerEvent<SVGGElement>, fp: TopFootprint) => {
    e.stopPropagation();
    const additive = e.shiftKey || e.metaKey || e.ctrlKey;
    const alreadySelected = selectedPartIds.includes(fp.id) || selectedPartId === fp.id;
    if (!alreadySelected || additive) {
      onSelectPart(fp.id, additive);
    }

    // Move entire group if part belongs to a group (e.g. parametric cabinet), or all selected parts
    const movingParts =
      fp.groupId
        ? parts.filter((p) => p.groupId === fp.groupId && !p.locked)
        : alreadySelected && selectedPartIds.length > 1
          ? parts.filter((p) => selectedPartIds.includes(p.id) && !p.locked)
          : fp.part.locked
            ? []
            : [fp.part];

    if (movingParts.length === 0) return;

    const world = clientToWorldMm(e.clientX, e.clientY);
    setDragState({
      mode: 'move',
      startWorldX: world.x,
      startWorldZ: world.z,
      movingParts,
      currentDx: 0,
      currentDz: 0,
    });
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    if (dragState.mode === 'pan') {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = Math.max(viewWidthMm / Math.max(1, rect.width), viewHeightMm / Math.max(1, rect.height));
      setPanMm({
        x: dragState.origPanX - (e.clientX - dragState.startClientX) * scale,
        z: dragState.origPanZ - (e.clientY - dragState.startClientY) * scale,
      });
    } else if (dragState.mode === 'move') {
      const world = clientToWorldMm(e.clientX, e.clientY);
      const rawDx = world.x - dragState.startWorldX;
      const rawDz = world.z - dragState.startWorldZ;
      const step = e.shiftKey ? 1 : Math.max(1, snapMm);
      setDragState({
        ...dragState,
        currentDx: roundSnap(rawDx, step),
        currentDz: roundSnap(rawDz, step),
      });
    }
  };

  const handlePointerUp = () => {
    if (!dragState) return;
    if (
      dragState.mode === 'move' &&
      (Math.abs(dragState.currentDx) > 0 || Math.abs(dragState.currentDz) > 0)
    ) {
      onMoveParts2D(
        dragState.movingParts.map((p) => ({
          id: p.id,
          position: [
            Math.round(p.position[0] + dragState.currentDx),
            p.position[1],
            Math.round(p.position[2] + dragState.currentDz),
          ],
          rotation: p.rotation,
        }))
      );
    }
    setDragState(null);
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.12;
    setZoom((z) => Math.max(0.35, Math.min(6, z * factor)));
  };

  const handleExportSvg = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'plan-2d'}.svg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handlePrintPlanPdf = () => {
    const svgEl = svgRef.current;
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const svgMarkup = serializer.serializeToString(svgEl);
    const safeName = projectName
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    const html = `<!DOCTYPE html>
<html lang="pl">
<head>
  <meta charset="UTF-8" />
  <title>Rzut 2D — ${safeName}</title>
  <style>
    @page { size: A4 landscape; margin: 10mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, -apple-system, sans-serif; color: #0F172A; background: #fff; display: flex; flex-direction: column; height: 100vh; }
    .hdr { display: flex; justify-content: space-between; align-items: baseline; border-bottom: 1.5px solid #0F172A; padding-bottom: 6px; margin-bottom: 8px; }
    .hdr h1 { margin: 0; font-size: 15px; }
    .hdr span { font-family: monospace; font-size: 11px; color: #475569; }
    .canvas { flex: 1; border: 1px solid #CBD5E1; border-radius: 6px; overflow: hidden; display: flex; align-items: center; justify-content: center; background: #F8FAFC; }
    .canvas svg { width: 100%; height: 100%; max-height: 175mm; }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>Rzut architektoniczny 2D — ${safeName}</h1>
    <span>Gabaryt: ${totalW} × ${totalD} mm · Data: ${new Date().toLocaleDateString('pl-PL')}</span>
  </div>
  <div class="canvas">${svgMarkup}</div>
</body>
</html>`;
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();
      setTimeout(() => {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
        setTimeout(() => iframe.remove(), 1200);
      }, 250);
    } else {
      iframe.remove();
    }
  };

  const movingIdSet = useMemo(() => {
    if (dragState?.mode !== 'move') return new Set<string>();
    return new Set(dragState.movingParts.map((p) => p.id));
  }, [dragState]);

  const totalW = Math.round(bounds.rawMaxX - bounds.rawMinX);
  const totalD = Math.round(bounds.rawMaxZ - bounds.rawMinZ);

  // Room polygon path for 2D architectural outline
  const roomPolygonPoints = useMemo(() => {
    if (!room?.enabled) return null;
    if (room.floorPoints && room.floorPoints.length >= 3) {
      return room.floorPoints.map((pt) => `${pt.xMm},${pt.zMm}`).join(' ');
    }
    const hw = room.widthMm / 2;
    const z0 = room.backWallZMm;
    const z1 = z0 + room.depthMm;
    return `${-hw},${z0} ${hw},${z0} ${hw},${z1} ${-hw},${z1}`;
  }, [room]);

  const dimLineZOuter = bounds.rawMinZ - Math.max(190, 95 * mmPerUnit);
  const dimLineZChain = bounds.rawMinZ - Math.max(95, 48 * mmPerUnit);
  const dimLineXOuter = bounds.rawMaxX + Math.max(130, 65 * mmPerUnit);

  return (
    <div className="fixed inset-0 top-12 md:top-[52px] z-20 flex flex-col bg-[#F5F7FA] text-slate-900 select-none">
      {/* Top 2D Plan Architectural Strip */}
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-3 sm:px-4 py-2 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xs font-semibold text-slate-900 truncate">
            Rzut architektoniczny 2D (z góry)
          </span>
          <span className="hidden sm:inline text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="hidden sm:inline text-xs font-mono-num text-slate-600">
            Obrys: {totalW} × {totalD} mm
          </span>
          <span className="hidden md:inline text-xs text-slate-400" aria-hidden="true">
            ·
          </span>
          <span className="hidden md:inline text-xs text-slate-500">
            Przeciągnij element, aby przesunąć w osi X/Z (skok {snapMm} mm)
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(6, z * 1.25))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Przybliż rzut 2D"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.35, z * 0.8))}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Oddal rzut 2D"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setZoom(1);
              setPanMm({ x: 0, z: 0 });
            }}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Dopasuj widok"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Dopasuj</span>
          </button>
          <button
            type="button"
            onClick={handleExportSvg}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Pobierz rzut 2D jako plik SVG"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">SVG</span>
          </button>
          <button
            type="button"
            onClick={handlePrintPlanPdf}
            className="flex h-8 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-medium text-slate-700 hover:bg-slate-100 cursor-pointer"
            title="Drukuj rzut architektoniczny 2D (PDF A4 poziomo)"
          >
            <Printer className="h-3.5 w-3.5 text-amber-600" />
            <span className="hidden sm:inline">PDF</span>
          </button>
          <button
            type="button"
            onClick={onSwitchTo3D}
            className="flex h-8 items-center gap-1.5 rounded-lg bg-slate-900 px-3 text-xs font-semibold text-white hover:bg-slate-800 cursor-pointer"
          >
            <Box className="h-3.5 w-3.5 text-amber-400" />
            <span>Wróć do 3D</span>
          </button>
        </div>
      </div>

      {/* Interactive 2D CAD Blueprint Canvas */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        <svg
          ref={svgRef}
          viewBox={`${vbMinX} ${vbMinZ} ${viewWidthMm} ${viewHeightMm}`}
          className="h-full w-full touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={handlePointerDownBg}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <defs>
            <pattern
              id="planGrid100"
              width="100"
              height="100"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 100 0 L 0 0 0 100"
                fill="none"
                stroke="#E2E8F0"
                strokeWidth={Math.max(1, 0.7 * mmPerUnit)}
              />
            </pattern>
            <pattern
              id="planGrid500"
              width="500"
              height="500"
              patternUnits="userSpaceOnUse"
            >
              <rect width="500" height="500" fill="url(#planGrid100)" />
              <path
                d="M 500 0 L 0 0 0 500"
                fill="none"
                stroke="#CBD5E1"
                strokeWidth={Math.max(1.2, 1.1 * mmPerUnit)}
              />
            </pattern>
          </defs>

          {/* Infinite Architectural Millimeter Grid */}
          <rect
            x={vbMinX - viewWidthMm}
            y={vbMinZ - viewHeightMm}
            width={viewWidthMm * 3}
            height={viewHeightMm * 3}
            fill="url(#planGrid500)"
          />

          {/* Origin Crosshair */}
          <line
            x1={-120}
            y1={0}
            x2={120}
            y2={0}
            stroke="#94A3B8"
            strokeWidth={1.2 * mmPerUnit}
            strokeDasharray={`${6 * mmPerUnit} ${4 * mmPerUnit}`}
          />
          <line
            x1={0}
            y1={-120}
            x2={0}
            y2={120}
            stroke="#94A3B8"
            strokeWidth={1.2 * mmPerUnit}
            strokeDasharray={`${6 * mmPerUnit} ${4 * mmPerUnit}`}
          />

          {/* Room Walls Outline */}
          {roomPolygonPoints && (
            <polygon
              points={roomPolygonPoints}
              fill="#FFFFFF"
              fillOpacity={0.85}
              stroke="#1E293B"
              strokeWidth={Math.max(14, (room?.wallThicknessMm ?? 120) * 0.25)}
              strokeLinejoin="miter"
            />
          )}

          {/* Furniture & Construction Part Footprints */}
          {footprints.map((fp) => {
            const isSel = selectedPartIds.includes(fp.id) || selectedPartId === fp.id;
            const isMoving = movingIdSet.has(fp.id);
            const tx = isMoving && dragState?.mode === 'move' ? dragState.currentDx : 0;
            const tz = isMoving && dragState?.mode === 'move' ? dragState.currentDz : 0;
            const x = fp.minX + tx;
            const z = fp.minZ + tz;
            const w = Math.max(8, fp.maxX - fp.minX);
            const d = Math.max(8, fp.maxZ - fp.minZ);
            return (
              <g
                key={fp.id}
                data-role="part"
                onPointerDown={(e) => handlePointerDownPart(e, fp)}
                className="cursor-move"
              >
                <rect
                  data-role="part"
                  x={x}
                  y={z}
                  width={w}
                  height={d}
                  fill={fp.materialHex}
                  fillOpacity={isSel ? 0.92 : 0.72}
                  stroke={isSel ? '#D97706' : '#334155'}
                  strokeWidth={(isSel ? 3.2 : 1.4) * mmPerUnit}
                  rx={Math.min(4, w * 0.08, d * 0.08)}
                />
                {w > 90 * mmPerUnit && d > 55 * mmPerUnit && (
                  <text
                    x={x + w / 2}
                    y={z + d / 2}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize={Math.min(13 * mmPerUnit, w * 0.16, d * 0.34)}
                    fontWeight={600}
                    fill="#0F172A"
                    style={{ pointerEvents: 'none' }}
                  >
                    {fp.widthMm}×{fp.depthMm}
                  </text>
                )}
              </g>
            );
          })}

          {/* Architectural Chain Dimensions (Top X) */}
          {bounds.hasAny && xChainSegments.length > 0 && (
            <g style={{ pointerEvents: 'none' }}>
              {/* Overall width dimension */}
              <line
                x1={bounds.rawMinX}
                y1={dimLineZOuter}
                x2={bounds.rawMaxX}
                y2={dimLineZOuter}
                stroke="#0F172A"
                strokeWidth={1.6 * mmPerUnit}
              />
              <line
                x1={bounds.rawMinX}
                y1={bounds.rawMinZ}
                x2={bounds.rawMinX}
                y2={dimLineZOuter - 14 * mmPerUnit}
                stroke="#94A3B8"
                strokeWidth={1 * mmPerUnit}
              />
              <line
                x1={bounds.rawMaxX}
                y1={bounds.rawMinZ}
                x2={bounds.rawMaxX}
                y2={dimLineZOuter - 14 * mmPerUnit}
                stroke="#94A3B8"
                strokeWidth={1 * mmPerUnit}
              />
              <rect
                x={(bounds.rawMinX + bounds.rawMaxX) / 2 - 42 * mmPerUnit}
                y={dimLineZOuter - 12 * mmPerUnit}
                width={84 * mmPerUnit}
                height={22 * mmPerUnit}
                rx={4 * mmPerUnit}
                fill="#0F172A"
              />
              <text
                x={(bounds.rawMinX + bounds.rawMaxX) / 2}
                y={dimLineZOuter}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12 * mmPerUnit}
                fontWeight={700}
                fill="#FFFFFF"
                fontFamily="JetBrains Mono, monospace"
              >
                {totalW} mm
              </text>

              {/* Segment chain */}
              {xChainSegments.map((seg, idx) => (
                <g key={`xseg_${idx}`}>
                  <line
                    x1={seg.x1}
                    y1={dimLineZChain}
                    x2={seg.x2}
                    y2={dimLineZChain}
                    stroke={seg.isGap ? '#0284C7' : '#475569'}
                    strokeWidth={1.2 * mmPerUnit}
                    strokeDasharray={seg.isGap ? `${5 * mmPerUnit} ${3 * mmPerUnit}` : undefined}
                  />
                  <line
                    x1={seg.x1}
                    y1={dimLineZChain - 8 * mmPerUnit}
                    x2={seg.x1}
                    y2={dimLineZChain + 8 * mmPerUnit}
                    stroke="#475569"
                    strokeWidth={1.4 * mmPerUnit}
                  />
                  <line
                    x1={seg.x2}
                    y1={dimLineZChain - 8 * mmPerUnit}
                    x2={seg.x2}
                    y2={dimLineZChain + 8 * mmPerUnit}
                    stroke="#475569"
                    strokeWidth={1.4 * mmPerUnit}
                  />
                  {seg.x2 - seg.x1 > 45 * mmPerUnit && (
                    <text
                      x={(seg.x1 + seg.x2) / 2}
                      y={dimLineZChain - 10 * mmPerUnit}
                      textAnchor="middle"
                      fontSize={11 * mmPerUnit}
                      fontWeight={600}
                      fill={seg.isGap ? '#0284C7' : '#334155'}
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {seg.label}
                    </text>
                  )}
                </g>
              ))}

              {/* Overall depth dimension (Right Z) */}
              <line
                x1={dimLineXOuter}
                y1={bounds.rawMinZ}
                x2={dimLineXOuter}
                y2={bounds.rawMaxZ}
                stroke="#0F172A"
                strokeWidth={1.6 * mmPerUnit}
              />
              <line
                x1={bounds.rawMaxX}
                y1={bounds.rawMinZ}
                x2={dimLineXOuter + 14 * mmPerUnit}
                y2={bounds.rawMinZ}
                stroke="#94A3B8"
                strokeWidth={1 * mmPerUnit}
              />
              <line
                x1={bounds.rawMaxX}
                y1={bounds.rawMaxZ}
                x2={dimLineXOuter + 14 * mmPerUnit}
                y2={bounds.rawMaxZ}
                stroke="#94A3B8"
                strokeWidth={1 * mmPerUnit}
              />
              <rect
                x={dimLineXOuter - 42 * mmPerUnit}
                y={(bounds.rawMinZ + bounds.rawMaxZ) / 2 - 11 * mmPerUnit}
                width={84 * mmPerUnit}
                height={22 * mmPerUnit}
                rx={4 * mmPerUnit}
                fill="#0F172A"
              />
              <text
                x={dimLineXOuter}
                y={(bounds.rawMinZ + bounds.rawMaxZ) / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={12 * mmPerUnit}
                fontWeight={700}
                fill="#FFFFFF"
                fontFamily="JetBrains Mono, monospace"
              >
                {totalD} mm
              </text>
            </g>
          )}

          {/* Live Distance Callouts from Selected Element to Walls & Neighbors */}
          {liveDistanceGuides.map((g) => {
            const mx = (g.x1 + g.x2) / 2;
            const mz = (g.z1 + g.z2) / 2;
            return (
              <g key={g.id} style={{ pointerEvents: 'none' }}>
                <line
                  x1={g.x1}
                  y1={g.z1}
                  x2={g.x2}
                  y2={g.z2}
                  stroke="#D97706"
                  strokeWidth={2 * mmPerUnit}
                  strokeDasharray={`${6 * mmPerUnit} ${3 * mmPerUnit}`}
                />
                <rect
                  x={mx - 34 * mmPerUnit}
                  y={mz - 10 * mmPerUnit}
                  width={68 * mmPerUnit}
                  height={20 * mmPerUnit}
                  rx={4 * mmPerUnit}
                  fill="#D97706"
                />
                <text
                  x={mx}
                  y={mz}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={11 * mmPerUnit}
                  fontWeight={700}
                  fill="#FFFFFF"
                  fontFamily="JetBrains Mono, monospace"
                >
                  {g.distMm} mm
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};
