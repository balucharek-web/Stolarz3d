import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, PenTool, Plus } from 'lucide-react';
import {
  CameraPreset,
  EditorTool,
  Fastener,
  FurniturePart,
  FurnitureProject,
  MaterialId,
  SCREW_MAP,
  ScrewType,
  StudioLighting,
} from './types/furniture';
import { FURNITURE_TEMPLATES } from './data/templates';
import {
  autoDetectJointFasteners,
  getProjectDimensionsMm,
} from './engine/geometry';
import {
  analyzeFasteners,
  computePartClearances,
  createEvenShelfArray,
  detectPartCollisions,
  mirrorPartX,
} from './engine/carpentry';
import {
  compressTextureDataUrl,
  loadProjectStore,
  loadSavedCustomTextures,
  persistCustomTexture,
  saveProjectStore,
  type ProjectStoreState,
} from './engine/storage';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { BottomDock } from './components/BottomDock';
import { InspectorDrawer } from './components/InspectorDrawer';
import { AddPartDrawer } from './components/AddPartDrawer';
import {
  PartsTemplatesDrawer,
  type LeftDrawerMode,
} from './components/PartsTemplatesDrawer';
import { CutListModal } from './components/CutListModal';
import { ShapeSketchModal } from './components/ShapeSketchModal';

const SNAP_STEPS = [10, 5, 25, 0];
const LIGHTING_ORDER: StudioLighting[] = ['daylight', 'studio', 'warm'];

function createDefaultProject(): FurnitureProject {
  return structuredClone(FURNITURE_TEMPLATES[0].project);
}

export default function App() {
  const viewportRef = useRef<Viewport3DHandle | null>(null);

  const [projectStore, setProjectStore] = useState<ProjectStoreState>(() =>
    loadProjectStore(createDefaultProject)
  );
  const [historyPast, setHistoryPast] = useState<FurnitureProject[]>([]);
  const [historyFuture, setHistoryFuture] = useState<FurnitureProject[]>([]);

  const [selectedPartId, setSelectedPartId] = useState<string | null>(null);
  const [selectedFastenerId, setSelectedFastenerId] = useState<string | null>(null);

  const [tool, setTool] = useState<EditorTool>('move');
  const [activeScrewType, setActiveScrewType] = useState<ScrewType>('wood_4x45');
  const [snapIdx, setSnapIdx] = useState<number>(0);
  const [magneticSnap, setMagneticSnap] = useState<boolean>(true);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [xrayMode, setXrayMode] = useState<boolean>(false);
  const [showFasteners, setShowFasteners] = useState<boolean>(true);
  const [explodedAmount, setExplodedAmount] = useState<number>(0);
  const [lighting, setLighting] = useState<StudioLighting>('daylight');
  const [customTextures, setCustomTextures] = useState<Partial<Record<MaterialId, string>>>({});

  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [addPartOpen, setAddPartOpen] = useState<boolean>(false);
  const [sketchOpen, setSketchOpen] = useState<boolean>(false);
  const [sketchEditingPart, setSketchEditingPart] = useState<FurniturePart | null>(null);
  const [leftDrawerMode, setLeftDrawerMode] = useState<LeftDrawerMode>(null);
  const [cutListOpen, setCutListOpen] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const toastTimerRef = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => {
      setToastMsg(null);
    }, 2800);
  }, []);

  const project = useMemo(() => {
    return (
      projectStore.projects.find((p) => p.id === projectStore.activeProjectId) ??
      projectStore.projects[0]
    );
  }, [projectStore]);

  // Load persisted custom textures from IndexedDB on startup
  useEffect(() => {
    let active = true;
    loadSavedCustomTextures().then((saved) => {
      if (active && Object.keys(saved).length > 0) {
        setCustomTextures(saved);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  // Auto-save multi-project store locally for GitHub Pages zero-backend persistence
  useEffect(() => {
    saveProjectStore(projectStore);
  }, [projectStore]);

  const setActiveProjectDirect = useCallback((nextProject: FurnitureProject) => {
    setProjectStore((store) => ({
      ...store,
      projects: store.projects.map((p) =>
        p.id === store.activeProjectId
          ? { ...nextProject, id: p.id, updatedAt: Date.now() }
          : p
      ),
    }));
  }, []);

  const commitProject = useCallback((updater: (prev: FurnitureProject) => FurnitureProject) => {
    setProjectStore((store) => {
      const current =
        store.projects.find((p) => p.id === store.activeProjectId) ?? store.projects[0];
      const next = {
        ...updater(current),
        id: current.id,
        updatedAt: Date.now(),
      };
      setHistoryPast((past) => [...past.slice(-29), current]);
      setHistoryFuture([]);
      return {
        ...store,
        projects: store.projects.map((p) => (p.id === current.id ? next : p)),
      };
    });
  }, []);

  const handleUndo = useCallback(() => {
    setHistoryPast((past) => {
      if (past.length === 0) return past;
      const previous = past[past.length - 1];
      setHistoryFuture((fut) => [project, ...fut.slice(0, 29)]);
      setActiveProjectDirect(previous);
      return past.slice(0, -1);
    });
  }, [project, setActiveProjectDirect]);

  const handleRedo = useCallback(() => {
    setHistoryFuture((fut) => {
      if (fut.length === 0) return fut;
      const next = fut[0];
      setHistoryPast((past) => [...past.slice(-29), project]);
      setActiveProjectDirect(next);
      return fut.slice(1);
    });
  }, [project, setActiveProjectDirect]);

  // Multi-project management handlers
  const handleSwitchProject = useCallback(
    (id: string) => {
      if (id === projectStore.activeProjectId) return;
      setProjectStore((store) => ({ ...store, activeProjectId: id }));
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedPartId(null);
      setSelectedFastenerId(null);
      setInspectorOpen(false);
      setExplodedAmount(0);
      setTimeout(() => viewportRef.current?.focusAll(), 40);
      const target = projectStore.projects.find((p) => p.id === id);
      if (target) showToast(`Przełączono na: ${target.name}`);
    },
    [projectStore.activeProjectId, projectStore.projects, showToast]
  );

  const handleCreateNewProject = useCallback(() => {
    const newProj: FurnitureProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: `Mój projekt #${projectStore.projects.length + 1}`,
      parts: [],
      fasteners: [],
      updatedAt: Date.now(),
    };
    setProjectStore((store) => ({
      activeProjectId: newProj.id,
      projects: [newProj, ...store.projects],
    }));
    setHistoryPast([]);
    setHistoryFuture([]);
    setSelectedPartId(null);
    setSelectedFastenerId(null);
    setInspectorOpen(false);
    setExplodedAmount(0);
    setLeftDrawerMode(null);
    showToast(`Utworzono: ${newProj.name}`);
  }, [projectStore.projects.length, showToast]);

  const handleDuplicateProject = useCallback(
    (id: string) => {
      const src = projectStore.projects.find((p) => p.id === id);
      if (!src) return;
      const copy: FurnitureProject = {
        ...structuredClone(src),
        id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        name: `${src.name} (kopia)`,
        updatedAt: Date.now(),
      };
      setProjectStore((store) => ({
        activeProjectId: copy.id,
        projects: [copy, ...store.projects],
      }));
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedPartId(null);
      setSelectedFastenerId(null);
      showToast(`Zduplikowano: ${copy.name}`);
    },
    [projectStore.projects, showToast]
  );

  const handleRenameProject = useCallback((id: string, name: string) => {
    setProjectStore((store) => ({
      ...store,
      projects: store.projects.map((p) =>
        p.id === id ? { ...p, name, updatedAt: Date.now() } : p
      ),
    }));
  }, []);

  const handleDeleteProject = useCallback(
    (id: string) => {
      setProjectStore((store) => {
        if (store.projects.length <= 1) return store;
        const remaining = store.projects.filter((p) => p.id !== id);
        const nextActive =
          store.activeProjectId === id ? remaining[0].id : store.activeProjectId;
        return { activeProjectId: nextActive, projects: remaining };
      });
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedPartId(null);
      setSelectedFastenerId(null);
      setInspectorOpen(false);
      showToast('Usunięto projekt');
    },
    [showToast]
  );

  const handleSelectPart = useCallback((id: string | null) => {
    setSelectedPartId(id);
    setSelectedFastenerId(null);
    if (!id) {
      setInspectorOpen(false);
    }
  }, []);

  const handleSelectFastener = useCallback((id: string | null) => {
    setSelectedFastenerId(id);
    if (id) {
      setSelectedPartId(null);
      setInspectorOpen(false);
    }
  }, []);

  // Group-aware 3D transform: when moving a grouped part, move all group members by the same delta
  const handleTransformPart = useCallback(
    (
      id: string,
      position: [number, number, number],
      rotation: [number, number, number]
    ) => {
      commitProject((prev) => {
        const target = prev.parts.find((p) => p.id === id);
        if (!target) return prev;
        const dx = position[0] - target.position[0];
        const dy = position[1] - target.position[1];
        const dz = position[2] - target.position[2];
        const groupId = target.groupId;

        return {
          ...prev,
          parts: prev.parts.map((p) => {
            if (p.id === id) {
              return { ...p, position, rotation };
            }
            if (groupId && p.groupId === groupId && (dx !== 0 || dy !== 0 || dz !== 0)) {
              return {
                ...p,
                position: [
                  Math.round((p.position[0] + dx) * 10) / 10,
                  Math.max(10, Math.round((p.position[1] + dy) * 10) / 10),
                  Math.round((p.position[2] + dz) * 10) / 10,
                ],
              };
            }
            return p;
          }),
        };
      });
    },
    [commitProject]
  );

  const handleUpdatePart = useCallback(
    (id: string, patch: Partial<FurniturePart>) => {
      commitProject((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      }));
    },
    [commitProject]
  );

  const handleAddPart = useCallback(
    (blueprint: Omit<FurniturePart, 'id'>) => {
      const newId = `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const newPart: FurniturePart = {
        ...blueprint,
        id: newId,
      };
      commitProject((prev) => ({
        ...prev,
        parts: [...prev.parts, newPart],
      }));
      setSelectedPartId(newId);
      setSelectedFastenerId(null);
      setTool('move');
      setExplodedAmount(0);
      setInspectorOpen(true);
      showToast(`Dodano: ${newPart.name}`);
    },
    [commitProject, showToast]
  );

  const handleDuplicatePart = useCallback(
    (id: string) => {
      const src = project.parts.find((p) => p.id === id);
      if (!src) return;
      const newId = `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const copy: FurniturePart = {
        ...structuredClone(src),
        id: newId,
        name: `${src.name} (kopia)`,
        position: [src.position[0] + 60, src.position[1], src.position[2] + 60],
      };
      commitProject((prev) => ({
        ...prev,
        parts: [...prev.parts, copy],
      }));
      setSelectedPartId(newId);
      showToast('Zduplikowano element');
    },
    [project.parts, commitProject, showToast]
  );

  const handleMirrorPart = useCallback(
    (id: string, asDuplicate: boolean) => {
      const src = project.parts.find((p) => p.id === id);
      if (!src) return;
      const mirrored = mirrorPartX(src, 0, asDuplicate);
      if (asDuplicate) {
        commitProject((prev) => ({
          ...prev,
          parts: [...prev.parts, mirrored],
        }));
        setSelectedPartId(mirrored.id);
        showToast('Utworzono lustrzaną kopię elementu');
      } else {
        commitProject((prev) => ({
          ...prev,
          parts: prev.parts.map((p) => (p.id === id ? mirrored : p)),
        }));
        showToast('Odbito element lustrzanie');
      }
    },
    [project.parts, commitProject, showToast]
  );

  const handleDistributeShelves = useCallback(
    (id: string, count: number, spanHeightMm: number) => {
      const src = project.parts.find((p) => p.id === id);
      if (!src) return;
      const { newParts, clearanceMm } = createEvenShelfArray(src, count, spanHeightMm);
      commitProject((prev) => ({
        ...prev,
        parts: [...prev.parts, ...newParts],
      }));
      showToast(`Dodano ${newParts.length} półek · prześwit w świetle: ${clearanceMm} mm`);
    },
    [project.parts, commitProject, showToast]
  );

  const handleDeletePart = useCallback(
    (id: string) => {
      commitProject((prev) => ({
        ...prev,
        parts: prev.parts.filter((p) => p.id !== id),
        fasteners: prev.fasteners.filter((f) => f.partId !== id),
      }));
      if (selectedPartId === id) {
        setSelectedPartId(null);
        setInspectorOpen(false);
      }
      showToast('Usunięto element');
    },
    [commitProject, selectedPartId, showToast]
  );

  const handlePlaceFastener = useCallback(
    (
      partId: string,
      localPosition: [number, number, number],
      localNormal: [number, number, number]
    ) => {
      const newF: Fastener = {
        id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        partId,
        type: activeScrewType,
        localPosition,
        localNormal,
      };
      commitProject((prev) => ({
        ...prev,
        fasteners: [...prev.fasteners, newF],
      }));
      setShowFasteners(true);
    },
    [activeScrewType, commitProject]
  );

  const handleDeleteFastener = useCallback(
    (id: string) => {
      commitProject((prev) => ({
        ...prev,
        fasteners: prev.fasteners.filter((f) => f.id !== id),
      }));
      if (selectedFastenerId === id) {
        setSelectedFastenerId(null);
      }
    },
    [commitProject, selectedFastenerId]
  );

  const handleClearPartFasteners = useCallback(
    (partId: string) => {
      commitProject((prev) => ({
        ...prev,
        fasteners: prev.fasteners.filter((f) => f.partId !== partId),
      }));
    },
    [commitProject]
  );

  const handleAutoFasteners = useCallback(() => {
    const detected = autoDetectJointFasteners(
      project.parts,
      project.fasteners,
      activeScrewType
    );
    if (detected.length === 0) {
      showToast('Nie znaleziono nowych połączeń stykających się płyt');
      return;
    }
    commitProject((prev) => ({
      ...prev,
      fasteners: [...prev.fasteners, ...detected],
    }));
    setShowFasteners(true);
    showToast(`Dodano automatycznie ${detected.length} łączników na stykach`);
  }, [project.parts, project.fasteners, activeScrewType, commitProject, showToast]);

  const handleLoadTemplate = useCallback(
    (tplProject: FurnitureProject) => {
      commitProject(() => structuredClone(tplProject));
      setSelectedPartId(null);
      setSelectedFastenerId(null);
      setInspectorOpen(false);
      setExplodedAmount(0);
      setTimeout(() => viewportRef.current?.focusAll(), 40);
      showToast(`Wczytano szablon: ${tplProject.name}`);
    },
    [commitProject, showToast]
  );

  const handleSetCustomTexture = useCallback(
    async (id: MaterialId, rawDataUrl: string | null) => {
      const processedUrl = rawDataUrl ? await compressTextureDataUrl(rawDataUrl, 1024, 0.86) : null;
      setCustomTextures((prev) => {
        const next = { ...prev };
        if (processedUrl) next[id] = processedUrl;
        else delete next[id];
        return next;
      });
      await persistCustomTexture(id, processedUrl);
      showToast(
        processedUrl
          ? 'Zapisano własną teksturę (pamięć lokalna)'
          : 'Przywrócono domyślną teksturę'
      );
    },
    [showToast]
  );

  const handleSnapshot = useCallback(() => {
    const dataUrl = viewportRef.current?.captureSnapshot();
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `${project.name.toLowerCase().replace(/\s+/g, '_')}_3d.png`;
    a.click();
    showToast('Zapisano wizualizację 3D (PNG)');
  }, [project.name, showToast]);

  const anyModalOpen = sketchOpen || cutListOpen || addPartOpen;

  // Isolated Keyboard shortcuts for fast desktop CAD workflow
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'Escape') {
        if (sketchOpen) {
          setSketchOpen(false);
          setSketchEditingPart(null);
          return;
        }
        if (cutListOpen) {
          setCutListOpen(false);
          return;
        }
        if (addPartOpen) {
          setAddPartOpen(false);
          return;
        }
        setSelectedPartId(null);
        setSelectedFastenerId(null);
        setInspectorOpen(false);
        setLeftDrawerMode(null);
        return;
      }

      // Block 3D scene shortcuts & destructive Delete while any modal is open
      if (anyModalOpen) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedo();
        else handleUndo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'v':
          setTool('select');
          break;
        case 'g':
          setTool('move');
          break;
        case 'r':
          setTool('rotate');
          break;
        case 'w':
          setTool('screw');
          break;
        case 'm':
          setMagneticSnap((m) => !m);
          break;
        case 'd':
          setShowDimensions((d) => !d);
          break;
        case 'h':
          setDockCollapsed((c) => !c);
          break;
        case 'x':
          setXrayMode((x) => !x);
          break;
        case 'delete':
        case 'backspace':
          if (selectedFastenerId) {
            handleDeleteFastener(selectedFastenerId);
          } else if (selectedPartId) {
            handleDeletePart(selectedPartId);
          }
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    anyModalOpen,
    sketchOpen,
    cutListOpen,
    addPartOpen,
    handleUndo,
    handleRedo,
    selectedPartId,
    selectedFastenerId,
    handleDeletePart,
    handleDeleteFastener,
  ]);

  const selectedPart = useMemo(
    () => project.parts.find((p) => p.id === selectedPartId) ?? null,
    [project.parts, selectedPartId]
  );

  const selectedPartFasteners = useMemo(
    () =>
      selectedPartId
        ? project.fasteners.filter((f) => f.partId === selectedPartId)
        : [],
    [project.fasteners, selectedPartId]
  );

  const selectedFastener = useMemo(
    () => project.fasteners.find((f) => f.id === selectedFastenerId) ?? null,
    [project.fasteners, selectedFastenerId]
  );

  const fastenerCountsByPart = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of project.fasteners) {
      counts[f.partId] = (counts[f.partId] ?? 0) + 1;
    }
    return counts;
  }, [project.fasteners]);

  const overallDims = useMemo(
    () => getProjectDimensionsMm(project.parts),
    [project.parts]
  );

  // Real-time carpentry diagnostics: collisions, fastener physics audit, and clearances
  const collisionReport = useMemo(
    () => detectPartCollisions(project.parts),
    [project.parts]
  );

  const fastenerAuditMap = useMemo(
    () => analyzeFasteners(project.parts, project.fasteners),
    [project.parts, project.fasteners]
  );

  const faultyFastenerCount = useMemo(() => {
    let n = 0;
    fastenerAuditMap.forEach((a) => {
      if (a.status === 'through' || a.status === 'air') n++;
    });
    return n;
  }, [fastenerAuditMap]);

  const selectedClearances = useMemo(
    () => (selectedPart ? computePartClearances(selectedPart, project.parts) : []),
    [selectedPart, project.parts]
  );

  const snapMm = SNAP_STEPS[snapIdx];

  return (
    <div className="relative h-[100dvh] w-screen overflow-hidden bg-[#EAECEF]">
      {/* Minimal 3-Zone Top Bar (Height 48px — stays slim on mobile & desktop) */}
      <header className="fixed top-0 inset-x-0 z-30 flex h-12 items-center justify-between gap-3 sm:gap-6 border-b border-zinc-800 bg-[#141518] px-3.5 sm:px-5 text-zinc-100">
        {/* Zone 1: Single-line Brand Wordmark */}
        <span className="text-sm sm:text-base font-bold tracking-tight text-white whitespace-nowrap shrink-0">
          Stolarz 3D
        </span>

        {/* Zone 2: Clean Single-Line Nav Actions (Desktop) */}
        <nav className="hidden md:flex items-center gap-5 text-xs font-medium text-zinc-300">
          <button
            type="button"
            onClick={() =>
              setLeftDrawerMode((m) => (m === 'projects' ? null : 'projects'))
            }
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              leftDrawerMode === 'projects' ? 'text-amber-400' : ''
            }`}
          >
            Projekty ({projectStore.projects.length})
          </button>
          <button
            type="button"
            onClick={() =>
              setLeftDrawerMode((m) => (m === 'templates' ? null : 'templates'))
            }
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              leftDrawerMode === 'templates' ? 'text-amber-400' : ''
            }`}
          >
            Szablony
          </button>
          <button
            type="button"
            onClick={() =>
              setLeftDrawerMode((m) => (m === 'parts' ? null : 'parts'))
            }
            className={`hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              leftDrawerMode === 'parts' ? 'text-amber-400' : ''
            }`}
          >
            Płyty ({project.parts.length})
          </button>
          <button
            type="button"
            onClick={() => setCutListOpen(true)}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Rozkrój i 2D
          </button>
          <button
            type="button"
            onClick={handleSnapshot}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Zdjęcie PNG
          </button>
        </nav>

        {/* Zone 3: Primary Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setSketchEditingPart(null);
              setSketchOpen(true);
            }}
            className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-2.5 sm:px-3 text-xs font-medium text-zinc-100 hover:border-amber-500/70 hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Narysuj własny kształt płyty 2D"
          >
            <PenTool className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span>Rysuj 2D</span>
          </button>
          <button
            type="button"
            onClick={() => setAddPartOpen(true)}
            className="flex min-h-[34px] items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 sm:px-3.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Dodaj płytę</span>
          </button>
        </div>
      </header>

      {/* Quiet Unboxed Dimension Readout + Actionable Carpentry Warnings */}
      <div className="pointer-events-none fixed top-14 left-3.5 sm:left-5 z-20 flex flex-col gap-0.5 text-zinc-700">
        <button
          type="button"
          onClick={() => setLeftDrawerMode((m) => (m === 'projects' ? null : 'projects'))}
          className="pointer-events-auto text-left text-xs font-semibold text-zinc-900 hover:text-amber-700 truncate max-w-[260px] sm:max-w-md cursor-pointer"
          title="Kliknij, aby zarządzać projektami lub zmienić nazwę"
        >
          {project.name}
        </button>
        <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 font-mono-num">
          <span>
            {overallDims.width} × {overallDims.height} × {overallDims.depth} mm
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-sans">{project.parts.length} elem.</span>
          <span aria-hidden="true">·</span>
          <span className="font-sans">{project.fasteners.length} wkręt.</span>
        </div>

        {(collisionReport.pairs.length > 0 || faultyFastenerCount > 0) && (
          <button
            type="button"
            onClick={() =>
              collisionReport.pairs.length > 0
                ? setLeftDrawerMode('parts')
                : setCutListOpen(true)
            }
            className="pointer-events-auto mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/90 px-2.5 py-1 text-[11px] font-medium text-red-100 shadow-md hover:bg-red-900 cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span>
              {collisionReport.pairs.length > 0 &&
                `${collisionReport.pairs.length} kolizji płyt`}
              {collisionReport.pairs.length > 0 && faultyFastenerCount > 0 && ' · '}
              {faultyFastenerCount > 0 && `${faultyFastenerCount} wkręt. do poprawy`}
            </span>
          </button>
        )}
      </div>

      {/* Subtle Toast Notification */}
      {toastMsg && (
        <div className="pointer-events-none fixed top-15 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-zinc-700 bg-[#141518] px-4 py-2 text-xs font-medium text-zinc-100 shadow-xl whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* Full-Viewport Realistic 3D CAD Canvas */}
      <main className="h-full w-full pt-12">
        <Viewport3D
          ref={viewportRef}
          parts={project.parts}
          fasteners={project.fasteners}
          selectedPartId={selectedPartId}
          selectedFastenerId={selectedFastenerId}
          tool={tool}
          activeScrewType={activeScrewType}
          snapMm={snapMm}
          magneticSnap={magneticSnap}
          showDimensions={showDimensions}
          xrayMode={xrayMode}
          showFasteners={showFasteners}
          explodedAmount={explodedAmount}
          lighting={lighting}
          customTextures={customTextures}
          collidingPartIds={collisionReport.collidingIds}
          fastenerAuditMap={fastenerAuditMap}
          clearances={selectedClearances}
          onSelectPart={handleSelectPart}
          onSelectFastener={handleSelectFastener}
          onTransformPart={handleTransformPart}
          onPlaceFastener={handlePlaceFastener}
        />
      </main>

      {/* Unified Collapsible Bottom Control Dock */}
      <BottomDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        tool={tool}
        onChangeTool={(nextTool) => {
          setTool(nextTool);
          if (nextTool === 'screw') {
            setExplodedAmount(0);
          }
        }}
        activeScrewType={activeScrewType}
        onChangeScrewType={setActiveScrewType}
        snapMm={snapMm}
        onCycleSnap={() => setSnapIdx((i) => (i + 1) % SNAP_STEPS.length)}
        magneticSnap={magneticSnap}
        onToggleMagneticSnap={() => setMagneticSnap((m) => !m)}
        showDimensions={showDimensions}
        onToggleShowDimensions={() => setShowDimensions((d) => !d)}
        xrayMode={xrayMode}
        onToggleXray={() => setXrayMode((x) => !x)}
        showFasteners={showFasteners}
        onToggleShowFasteners={() => setShowFasteners((s) => !s)}
        explodedAmount={explodedAmount}
        onChangeExploded={setExplodedAmount}
        lighting={lighting}
        onCycleLighting={() => {
          setLighting((curr) => {
            const idx = LIGHTING_ORDER.indexOf(curr);
            return LIGHTING_ORDER[(idx + 1) % LIGHTING_ORDER.length];
          });
        }}
        onCameraPreset={(preset: CameraPreset) =>
          viewportRef.current?.setCameraPreset(preset)
        }
        onAutoFasteners={handleAutoFasteners}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        selectedPartName={selectedPart?.name ?? null}
        selectedFastenerLabel={
          selectedFastener ? SCREW_MAP[selectedFastener.type].name : null
        }
        onOpenInspector={() => setInspectorOpen(true)}
        onDeleteSelectedFastener={() => {
          if (selectedFastenerId) handleDeleteFastener(selectedFastenerId);
        }}
        onOpenTemplates={() => setLeftDrawerMode('templates')}
        onOpenPartsList={() => setLeftDrawerMode('parts')}
        onOpenCutList={() => setCutListOpen(true)}
        onSnapshot={handleSnapshot}
      />

      {/* Contextual On-Demand Drawers & Modals */}
      <PartsTemplatesDrawer
        mode={leftDrawerMode}
        projects={projectStore.projects}
        activeProjectId={projectStore.activeProjectId}
        parts={project.parts}
        selectedPartId={selectedPartId}
        fastenerCountsByPart={fastenerCountsByPart}
        collidingPartIds={collisionReport.collidingIds}
        onClose={() => setLeftDrawerMode(null)}
        onSwitchMode={setLeftDrawerMode}
        onSwitchProject={handleSwitchProject}
        onCreateNewProject={handleCreateNewProject}
        onDuplicateProject={handleDuplicateProject}
        onRenameProject={handleRenameProject}
        onDeleteProject={handleDeleteProject}
        onLoadTemplate={handleLoadTemplate}
        onSelectPart={(id) => {
          setSelectedPartId(id);
          setSelectedFastenerId(null);
          setInspectorOpen(true);
          if (window.innerWidth < 640) {
            setLeftDrawerMode(null);
          }
        }}
        onDeletePart={handleDeletePart}
      />

      <InspectorDrawer
        open={inspectorOpen && Boolean(selectedPart)}
        part={selectedPart}
        partFasteners={selectedPartFasteners}
        customTextures={customTextures}
        isColliding={Boolean(selectedPart && collisionReport.collidingIds.has(selectedPart.id))}
        clearances={selectedClearances}
        fastenerAuditMap={fastenerAuditMap}
        onClose={() => setInspectorOpen(false)}
        onUpdatePart={handleUpdatePart}
        onDuplicatePart={handleDuplicatePart}
        onDeletePart={handleDeletePart}
        onDeleteFastener={handleDeleteFastener}
        onClearPartFasteners={handleClearPartFasteners}
        onSetCustomTexture={handleSetCustomTexture}
        onEditPartShape={(part) => {
          setSketchEditingPart(part);
          setSketchOpen(true);
        }}
        onMirrorPart={handleMirrorPart}
        onDistributeShelves={handleDistributeShelves}
      />

      <AddPartDrawer
        open={addPartOpen}
        customTextures={customTextures}
        onClose={() => setAddPartOpen(false)}
        onAddPart={handleAddPart}
        onOpenCustomSketch={() => {
          setSketchEditingPart(null);
          setSketchOpen(true);
        }}
      />

      <ShapeSketchModal
        open={sketchOpen}
        editingPart={sketchEditingPart}
        customTextures={customTextures}
        onClose={() => {
          setSketchOpen(false);
          setSketchEditingPart(null);
        }}
        onSaveNewPart={handleAddPart}
        onUpdateExistingPart={(id, patch) => {
          handleUpdatePart(id, patch);
          showToast('Zaktualizowano kształt 2D');
        }}
      />

      <CutListModal
        open={cutListOpen}
        project={project}
        fastenerAuditMap={fastenerAuditMap}
        collisionCount={collisionReport.pairs.length}
        onClose={() => setCutListOpen(false)}
        onImportProject={(imported) => {
          const importedCopy: FurnitureProject = {
            ...imported,
            id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            updatedAt: Date.now(),
          };
          setProjectStore((store) => ({
            activeProjectId: importedCopy.id,
            projects: [importedCopy, ...store.projects],
          }));
          setHistoryPast([]);
          setHistoryFuture([]);
          setSelectedPartId(null);
          setSelectedFastenerId(null);
          setExplodedAmount(0);
          setTimeout(() => viewportRef.current?.focusAll(), 40);
          showToast(`Zaimportowano jako nowy projekt: ${importedCopy.name}`);
        }}
        onImportError={(msg) => showToast(msg)}
      />
    </div>
  );
}
