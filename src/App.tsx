import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Home,
  LayoutPanelTop,
  PenTool,
  Plus,
  X,
} from 'lucide-react';
import {
  AlignMode,
  CameraPreset,
  EditorTool,
  Fastener,
  FurniturePart,
  FurnitureProject,
  MaterialId,
  MaterialsCatalogConfig,
  MeasureSegment,
  QuoteSettings,
  SCREW_MAP,
  ScrewType,
  StudioLighting,
  syncCatalogMaterials,
} from './types/furniture';
import {
  buildAssemblyPlan,
  type AssemblyGranularity,
} from './engine/assembly';
import { FURNITURE_TEMPLATES } from './data/templates';
import {
  autoDetectJointFasteners,
  getProjectDimensionsMm,
} from './engine/geometry';
import {
  alignSelectedParts,
  analyzeFasteners,
  analyzeShelfDeflection,
  auditRoomClearances,
  bindFastenerToJoint,
  computeJointZones,
  computePartClearances,
  createEvenShelfArray,
  detectPartCollisions,
  distributeSelectedParts,
  getPartWorldBox,
  groupSelectedParts,
  mirrorPartX,
  syncFastenersWithParts,
  ungroupSelectedParts,
} from './engine/carpentry';
import {
  getGroupBoundingSizeMm,
  smartResizeGroup,
} from './engine/parametric';
import {
  compressTextureDataUrl,
  loadMaterialsConfig,
  loadProjectStore,
  loadQuoteSettings,
  loadSavedCustomTextures,
  persistCustomTexture,
  saveMaterialsConfig,
  saveProjectStore,
  saveQuoteSettings,
  type ProjectStoreState,
} from './engine/storage';
import { Viewport3D, Viewport3DHandle } from './components/Viewport3D';
import { BottomDock } from './components/BottomDock';
import { InspectorDrawer } from './components/InspectorDrawer';
import { AddPartDrawer } from './components/AddPartDrawer';
import { CabinetBuilderModal } from './components/CabinetBuilderModal';
import { MaterialsManagerModal } from './components/MaterialsManagerModal';
import {
  PartsTemplatesDrawer,
  type LeftDrawerMode,
} from './components/PartsTemplatesDrawer';
import { CutListModal } from './components/CutListModal';
import { ShapeSketchModal } from './components/ShapeSketchModal';
import { RoomSettingsModal } from './components/RoomSettingsModal';
import { ContextMenu, type ContextMenuTarget } from './components/ContextMenu';
import { ViewCube } from './components/ViewCube';

const SNAP_STEPS = [10, 5, 25, 0];
const LIGHTING_ORDER: StudioLighting[] = ['daylight', 'studio', 'warm', 'photoreal'];

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
  const [selectedPartIds, setSelectedPartIds] = useState<string[]>([]);
  const [selectedFastenerId, setSelectedFastenerId] = useState<string | null>(null);

  const [tool, setTool] = useState<EditorTool>('move');
  const [activeScrewType, setActiveScrewType] = useState<ScrewType>('wood_4x45');
  const [screwJointsOnly, setScrewJointsOnly] = useState<boolean>(true);
  const [snapIdx, setSnapIdx] = useState<number>(0);
  const [magneticSnap, setMagneticSnap] = useState<boolean>(true);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [xrayMode, setXrayMode] = useState<boolean>(false);
  const [showFasteners, setShowFasteners] = useState<boolean>(true);
  const [ledUnderCabinet, setLedUnderCabinet] = useState<boolean>(false);
  const [measurements, setMeasurements] = useState<MeasureSegment[]>([]);
  const [quoteSettings, setQuoteSettings] = useState<QuoteSettings>(() => loadQuoteSettings());
  const [materialsConfig, setMaterialsConfig] = useState<MaterialsCatalogConfig>(() => {
    const cfg = loadMaterialsConfig();
    syncCatalogMaterials(cfg);
    return cfg;
  });
  const [materialsVersion, setMaterialsVersion] = useState<number>(0);
  const [explodedAmount, setExplodedAmount] = useState<number>(0);
  const [openAmount, setOpenAmount] = useState<number>(0);
  const [assemblyStep, setAssemblyStep] = useState<number>(0);
  const [assemblyGranularity, setAssemblyGranularity] =
    useState<AssemblyGranularity>('grouped');
  const [lighting, setLighting] = useState<StudioLighting>('daylight');
  const [customTextures, setCustomTextures] = useState<Partial<Record<MaterialId, string>>>({});

  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [inspectorOpen, setInspectorOpen] = useState<boolean>(false);
  const [addPartOpen, setAddPartOpen] = useState<boolean>(false);
  const [cabinetBuilderOpen, setCabinetBuilderOpen] = useState<boolean>(false);
  const [materialsModalOpen, setMaterialsModalOpen] = useState<boolean>(false);
  const [roomModalOpen, setRoomModalOpen] = useState<boolean>(false);
  const [sketchOpen, setSketchOpen] = useState<boolean>(false);
  const [sketchEditingPart, setSketchEditingPart] = useState<FurniturePart | null>(null);
  const [leftDrawerMode, setLeftDrawerMode] = useState<LeftDrawerMode>(null);
  const [cutListOpen, setCutListOpen] = useState<boolean>(false);
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
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

  // Auto-save multi-project store & commercial quote settings locally
  useEffect(() => {
    saveProjectStore(projectStore);
  }, [projectStore]);

  useEffect(() => {
    saveQuoteSettings(quoteSettings);
  }, [quoteSettings]);

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
      setSelectedPartIds([]);
      setSelectedFastenerId(null);
      setContextMenu(null);
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
    setSelectedPartIds([]);
    setSelectedFastenerId(null);
    setContextMenu(null);
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
      setSelectedPartIds([]);
      setSelectedFastenerId(null);
      setContextMenu(null);
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
      setSelectedPartIds([]);
      setSelectedFastenerId(null);
      setContextMenu(null);
      setInspectorOpen(false);
      showToast('Usunięto projekt');
    },
    [showToast]
  );

  const handleSelectPart = useCallback((id: string | null, additive = false) => {
    setSelectedFastenerId(null);
    if (!id) {
      setSelectedPartId(null);
      setSelectedPartIds([]);
      setInspectorOpen(false);
      return;
    }
    if (additive) {
      setSelectedPartIds((prev) => {
        const exists = prev.includes(id);
        const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
        setSelectedPartId(next.length > 0 ? next[next.length - 1] : null);
        return next;
      });
    } else {
      setSelectedPartId(id);
      setSelectedPartIds([id]);
    }
  }, []);

  const handleSelectFastener = useCallback((id: string | null) => {
    setSelectedFastenerId(id);
    if (id) {
      setSelectedPartId(null);
      setSelectedPartIds([]);
      setInspectorOpen(false);
    }
  }, []);

  // Group + Multiselect aware 3D transform with LIVE relational fastener synchronization!
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
        const multiSet = new Set(selectedPartIds.includes(id) ? selectedPartIds : [id]);
        const changedIds = new Set<string>([id]);

        const nextParts = prev.parts.map((p) => {
          if (p.id === id) {
            return { ...p, position, rotation };
          }
          const shouldCoMove =
            (groupId && p.groupId === groupId) || multiSet.has(p.id);
          if (shouldCoMove && (dx !== 0 || dy !== 0 || dz !== 0)) {
            changedIds.add(p.id);
            return {
              ...p,
              position: [
                Math.round((p.position[0] + dx) * 10) / 10,
                Math.max(10, Math.round((p.position[1] + dy) * 10) / 10),
                Math.round((p.position[2] + dz) * 10) / 10,
              ] as [number, number, number],
            };
          }
          return p;
        });

        const synced = syncFastenersWithParts(
          prev.parts,
          nextParts,
          prev.fasteners,
          changedIds
        );

        return {
          ...prev,
          parts: nextParts,
          fasteners: synced.fasteners,
        };
      });
    },
    [commitProject, selectedPartIds]
  );

  // Alt + Drag instant clone-and-place
  const handleCloneTransformPart = useCallback(
    (
      id: string,
      position: [number, number, number],
      rotation: [number, number, number]
    ) => {
      const src = project.parts.find((p) => p.id === id);
      if (!src) return;
      const newId = `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const copy: FurniturePart = {
        ...structuredClone(src),
        id: newId,
        name: `${src.name} (kopia)`,
        position,
        rotation,
      };
      commitProject((prev) => ({
        ...prev,
        parts: [...prev.parts, copy],
      }));
      setSelectedPartId(newId);
      setSelectedPartIds([newId]);
      showToast(`Sklonowano (Alt+przeciągnij): ${copy.name}`);
    },
    [project.parts, commitProject, showToast]
  );

  const handleUpdatePart = useCallback(
    (id: string, patch: Partial<FurniturePart>) => {
      commitProject((prev) => {
        const nextParts = prev.parts.map((p) => (p.id === id ? { ...p, ...patch } : p));
        const affectsGeometry =
          patch.width !== undefined ||
          patch.height !== undefined ||
          patch.depth !== undefined ||
          patch.position !== undefined ||
          patch.rotation !== undefined ||
          patch.customPolygon !== undefined;
        const synced = affectsGeometry
          ? syncFastenersWithParts(prev.parts, nextParts, prev.fasteners, new Set([id]))
          : { fasteners: prev.fasteners };
        return {
          ...prev,
          parts: nextParts,
          fasteners: synced.fasteners,
        };
      });
    },
    [commitProject]
  );

  const handleResizePart = useCallback(
    (
      id: string,
      dims: { width: number; height: number; depth: number },
      position: [number, number, number]
    ) => {
      commitProject((prev) => {
        const nextParts = prev.parts.map((p) =>
          p.id === id
            ? {
                ...p,
                width: dims.width,
                height: dims.height,
                depth: dims.depth,
                position,
              }
            : p
        );
        const synced = syncFastenersWithParts(
          prev.parts,
          nextParts,
          prev.fasteners,
          new Set([id])
        );
        return {
          ...prev,
          parts: nextParts,
          fasteners: synced.fasteners,
        };
      });
    },
    [commitProject]
  );

  const handleInsertCabinet = useCallback(
    (newParts: FurniturePart[], newFasteners: Fastener[], groupName: string) => {
      commitProject((prev) => ({
        ...prev,
        parts: [...prev.parts, ...newParts],
        fasteners: [...prev.fasteners, ...newFasteners],
      }));
      const ids = newParts.map((p) => p.id);
      setSelectedPartIds(ids);
      setSelectedPartId(ids[0] ?? null);
      setSelectedFastenerId(null);
      setExplodedAmount(0);
      setShowFasteners(true);
      setTimeout(() => viewportRef.current?.focusAll(), 45);
      showToast(`Wstawiono moduł: ${groupName} (${newParts.length} płyt, ${newFasteners.length} łączników)`);
    },
    [commitProject, showToast]
  );

  const handleSmartResizeGroup = useCallback(
    (groupId: string, widthMm: number, heightMm: number, depthMm: number) => {
      commitProject((prev) => {
        const resized = smartResizeGroup(
          prev.parts,
          prev.fasteners,
          groupId,
          widthMm,
          heightMm,
          depthMm
        );
        return {
          ...prev,
          parts: resized.parts,
          fasteners: resized.fasteners,
        };
      });
      showToast(`Przeskalowano szafkę na ${widthMm} × ${heightMm} × ${depthMm} mm`);
    },
    [commitProject, showToast]
  );

  const handleAddMeasurement = useCallback(
    (seg: MeasureSegment) => {
      setMeasurements((prev) => [...prev, seg]);
      const d = Math.round(
        Math.hypot(
          seg.endMm[0] - seg.startMm[0],
          seg.endMm[1] - seg.startMm[1],
          seg.endMm[2] - seg.startMm[2]
        )
      );
      showToast(`Pomiar 3D: ${d} mm`);
    },
    [showToast]
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
      setSelectedPartIds([newId]);
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
      const idsToCopy =
        selectedPartIds.length > 1 && selectedPartIds.includes(id)
          ? selectedPartIds
          : [id];
      const copies: FurniturePart[] = [];
      for (const srcId of idsToCopy) {
        const src = project.parts.find((p) => p.id === srcId);
        if (!src) continue;
        const newId = `part_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        copies.push({
          ...structuredClone(src),
          id: newId,
          name: `${src.name} (kopia)`,
          position: [src.position[0] + 60, src.position[1], src.position[2] + 60],
        });
      }
      if (copies.length === 0) return;
      commitProject((prev) => ({
        ...prev,
        parts: [...prev.parts, ...copies],
      }));
      const newIds = copies.map((c) => c.id);
      setSelectedPartIds(newIds);
      setSelectedPartId(newIds[newIds.length - 1]);
      showToast(
        copies.length > 1
          ? `Zduplikowano ${copies.length} elementów`
          : 'Zduplikowano element'
      );
    },
    [project.parts, selectedPartIds, commitProject, showToast]
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
        setSelectedPartIds([mirrored.id]);
        showToast('Utworzono lustrzaną kopię elementu');
      } else {
        commitProject((prev) => {
          const nextParts = prev.parts.map((p) => (p.id === id ? mirrored : p));
          const synced = syncFastenersWithParts(
            prev.parts,
            nextParts,
            prev.fasteners,
            new Set([id])
          );
          return {
            ...prev,
            parts: nextParts,
            fasteners: synced.fasteners,
          };
        });
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
      const toRemove = new Set(
        selectedPartIds.length > 1 && selectedPartIds.includes(id)
          ? selectedPartIds
          : [id]
      );
      commitProject((prev) => ({
        ...prev,
        parts: prev.parts.filter((p) => !toRemove.has(p.id)),
        fasteners: prev.fasteners.filter(
          (f) => !toRemove.has(f.partId) && !(f.targetPartId && toRemove.has(f.targetPartId))
        ),
      }));
      if (selectedPartId && toRemove.has(selectedPartId)) {
        setSelectedPartId(null);
        setSelectedPartIds([]);
        setInspectorOpen(false);
      }
      showToast(
        toRemove.size > 1 ? `Usunięto ${toRemove.size} elementów` : 'Usunięto element'
      );
    },
    [commitProject, selectedPartId, selectedPartIds, showToast]
  );

  const handlePlaceFastener = useCallback(
    (
      partId: string,
      localPosition: [number, number, number],
      localNormal: [number, number, number],
      overrideType?: ScrewType,
      targetPartId?: string
    ) => {
      const usedType = overrideType ?? activeScrewType;
      commitProject((prev) => {
        const rawF: Fastener = {
          id: `f_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          partId,
          type: usedType,
          localPosition,
          localNormal,
          targetPartId,
        };
        const bound = bindFastenerToJoint(rawF, prev.parts);
        return {
          ...prev,
          fasteners: [...prev.fasteners, bound],
        };
      });
      setShowFasteners(true);
      if (overrideType && overrideType !== activeScrewType) {
        showToast(`Dobrano ${SCREW_MAP[overrideType].shortName}, aby idealnie złapał drugą płytę`);
      }
    },
    [activeScrewType, commitProject, showToast]
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

  const handleAutoFasteners = useCallback(
    (filterPartId?: string) => {
      const detected = autoDetectJointFasteners(
        project.parts,
        project.fasteners,
        activeScrewType,
        filterPartId
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
      showToast(
        filterPartId
          ? `Wkręcono ${detected.length} łączników w styki tej płyty`
          : `Dodano automatycznie ${detected.length} łączników na stykach`
      );
    },
    [project.parts, project.fasteners, activeScrewType, commitProject, showToast]
  );

  const handleNudgeSelected = useCallback(
    (dx: number, dy: number, dz: number) => {
      if (!selectedPartId) return;
      const target = project.parts.find((p) => p.id === selectedPartId);
      if (!target) return;
      handleTransformPart(
        target.id,
        [
          Math.round((target.position[0] + dx) * 10) / 10,
          Math.max(10, Math.round((target.position[1] + dy) * 10) / 10),
          Math.round((target.position[2] + dz) * 10) / 10,
        ],
        target.rotation
      );
    },
    [selectedPartId, project.parts, handleTransformPart]
  );

  const handleRotate90Y = useCallback(
    (partId: string) => {
      const target = project.parts.find((p) => p.id === partId);
      if (!target) return;
      const nextY = (target.rotation[1] + 90) % 360;
      handleUpdatePart(partId, {
        rotation: [target.rotation[0], nextY, target.rotation[2]],
      });
      showToast('Obrócono płytę o 90°');
    },
    [project.parts, handleUpdatePart, showToast]
  );

  const handleDropToFloor = useCallback(
    (partId: string) => {
      const target = project.parts.find((p) => p.id === partId);
      if (!target) return;
      const box = getPartWorldBox(target);
      const nextY = Math.round((target.position[1] - box.minY) * 10) / 10;
      handleTransformPart(
        partId,
        [target.position[0], nextY, target.position[2]],
        target.rotation
      );
      showToast('Postawiono płytę na podłodze (Y = 0)');
    },
    [project.parts, handleTransformPart, showToast]
  );

  const handleLoadTemplate = useCallback(
    (tplProject: FurnitureProject) => {
      commitProject(() => structuredClone(tplProject));
      setSelectedPartId(null);
      setSelectedPartIds([]);
      setSelectedFastenerId(null);
      setContextMenu(null);
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

  const handleChangeMaterialsConfig = useCallback(
    (next: MaterialsCatalogConfig) => {
      syncCatalogMaterials(next);
      saveMaterialsConfig(next);
      setMaterialsConfig(next);
      setMaterialsVersion((v) => v + 1);
      showToast('Zapisano katalog płyt i cennik z hurtowni');
    },
    [showToast]
  );

  const handleAlignSelected = useCallback(
    (mode: AlignMode) => {
      if (selectedPartIds.length < 2) return;
      commitProject((prev) => {
        const res = alignSelectedParts(prev.parts, prev.fasteners, selectedPartIds, mode);
        return { ...prev, parts: res.parts, fasteners: res.fasteners };
      });
      showToast('Wyrównano zaznaczone elementy');
    },
    [commitProject, selectedPartIds, showToast]
  );

  const handleDistributeSelected = useCallback(
    (axis: 'x' | 'y' | 'z') => {
      if (selectedPartIds.length < 3) return;
      commitProject((prev) => {
        const res = distributeSelectedParts(prev.parts, prev.fasteners, selectedPartIds, axis);
        return { ...prev, parts: res.parts, fasteners: res.fasteners };
      });
      showToast(`Rozmieszczono równomiernie w osi ${axis.toUpperCase()}`);
    },
    [commitProject, selectedPartIds, showToast]
  );

  const handleGroupSelected = useCallback(() => {
    if (selectedPartIds.length < 2) return;
    commitProject((prev) => ({
      ...prev,
      parts: groupSelectedParts(prev.parts, selectedPartIds).parts,
    }));
    showToast(`Połączono ${selectedPartIds.length} elementy w jedną grupę`);
  }, [commitProject, selectedPartIds, showToast]);

  const handleUngroupSelected = useCallback(() => {
    if (selectedPartIds.length === 0) return;
    commitProject((prev) => ({
      ...prev,
      parts: ungroupSelectedParts(prev.parts, selectedPartIds),
    }));
    showToast('Rozgrupowano wybrane elementy');
  }, [commitProject, selectedPartIds, showToast]);

  const anyModalOpen =
    sketchOpen ||
    cutListOpen ||
    addPartOpen ||
    cabinetBuilderOpen ||
    materialsModalOpen ||
    roomModalOpen;

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
        if (roomModalOpen) {
          setRoomModalOpen(false);
          return;
        }
        if (materialsModalOpen) {
          setMaterialsModalOpen(false);
          return;
        }
        if (cabinetBuilderOpen) {
          setCabinetBuilderOpen(false);
          return;
        }
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
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (assemblyStep > 0) {
          setAssemblyStep(0);
          return;
        }
        setSelectedPartId(null);
        setSelectedPartIds([]);
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
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        if (selectedPartId) {
          e.preventDefault();
          handleDuplicatePart(selectedPartId);
        }
        return;
      }

      // Precision arrow-key nudging (1 mm, or 10 mm with Shift; Alt+Up/Down for Z depth)
      if (
        selectedPartId &&
        (e.key === 'ArrowLeft' ||
          e.key === 'ArrowRight' ||
          e.key === 'ArrowUp' ||
          e.key === 'ArrowDown')
      ) {
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        if (e.key === 'ArrowLeft') handleNudgeSelected(-step, 0, 0);
        else if (e.key === 'ArrowRight') handleNudgeSelected(step, 0, 0);
        else if (e.key === 'ArrowUp') {
          if (e.altKey) handleNudgeSelected(0, 0, -step);
          else handleNudgeSelected(0, step, 0);
        } else if (e.key === 'ArrowDown') {
          if (e.altKey) handleNudgeSelected(0, 0, step);
          else handleNudgeSelected(0, -step, 0);
        }
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
        case 's':
          setTool('resize');
          break;
        case 'w':
          setTool('screw');
          break;
        case 't':
          setTool('measure');
          break;
        case 'l':
          setLedUnderCabinet((v) => !v);
          break;
        case 'o':
          setOpenAmount((v) => (v > 0.1 ? 0 : 1));
          break;
        case 'm':
          setMagneticSnap((m) => !m);
          break;
        case 'd':
          setShowDimensions((d) => !d);
          break;
        case 'f':
          if (selectedPartId) viewportRef.current?.focusPart(selectedPartId);
          else viewportRef.current?.focusAll();
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
    roomModalOpen,
    materialsModalOpen,
    cabinetBuilderOpen,
    sketchOpen,
    cutListOpen,
    addPartOpen,
    contextMenu,
    assemblyStep,
    handleUndo,
    handleRedo,
    handleDuplicatePart,
    handleNudgeSelected,
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

  const shelfDeflectionMap = useMemo(
    () => analyzeShelfDeflection(project.parts),
    [project.parts]
  );

  const criticalSagCount = useMemo(() => {
    let n = 0;
    shelfDeflectionMap.forEach((a) => {
      if (a.status === 'critical') n++;
    });
    return n;
  }, [shelfDeflectionMap]);

  const roomIssues = useMemo(
    () => auditRoomClearances(project.parts, project.room),
    [project.parts, project.room]
  );

  const selectedClearances = useMemo(
    () => (selectedPart ? computePartClearances(selectedPart, project.parts) : []),
    [selectedPart, project.parts]
  );

  const jointZones = useMemo(
    () => computeJointZones(project.parts, activeScrewType),
    [project.parts, activeScrewType]
  );

  const selectedGroupBounds = useMemo(() => {
    if (!selectedPart?.groupId) return null;
    return getGroupBoundingSizeMm(project.parts, selectedPart.groupId);
  }, [selectedPart, project.parts]);

  const selectedCanUngroup = useMemo(
    () =>
      selectedPartIds.length > 0 &&
      project.parts.some((p) => selectedPartIds.includes(p.id) && Boolean(p.groupId)),
    [project.parts, selectedPartIds]
  );

  const assemblyPlan = useMemo(
    () =>
      buildAssemblyPlan(
        project.parts,
        project.fasteners,
        assemblyGranularity
      ),
    [project.parts, project.fasteners, assemblyGranularity]
  );

  const clampedAssemblyStep =
    assemblyStep > 0 && assemblyPlan.steps.length > 0
      ? Math.min(assemblyStep, assemblyPlan.steps.length)
      : 0;

  const activeAssemblyStepPlan =
    clampedAssemblyStep > 0
      ? assemblyPlan.steps[clampedAssemblyStep - 1] ?? assemblyPlan.steps[0] ?? null
      : null;

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
            onClick={() => setMaterialsModalOpen(true)}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Materiały
          </button>
          <button
            type="button"
            onClick={() => setCutListOpen(true)}
            className="hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Rozkrój / Wycena
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
            onClick={() => setRoomModalOpen(true)}
            className={`flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              project.room?.enabled
                ? 'border-sky-500/60 bg-sky-500/15 text-sky-300 hover:bg-sky-500/25'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-sky-500/50 hover:text-sky-300'
            }`}
            title="Wnęka, ściany pokoju, skos poddasza i przeszkody (grzejniki, rury, gniazdka)"
          >
            <Home className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden lg:inline">Wnęka</span>
          </button>
          <button
            type="button"
            onClick={() => setCabinetBuilderOpen(true)}
            className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-emerald-500/50 bg-emerald-500/12 px-2.5 sm:px-3 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Kreator parametrycznej szafki, szuflad i frontów"
          >
            <LayoutPanelTop className="h-3.5 w-3.5 shrink-0" />
            <span className="hidden sm:inline">Szafka</span>
          </button>
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
            <span className="hidden sm:inline">Rysuj 2D</span>
          </button>
          <button
            type="button"
            onClick={() => setAddPartOpen(true)}
            className="flex min-h-[34px] items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 sm:px-3.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Dodaj</span>
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

        {(collisionReport.pairs.length > 0 ||
          faultyFastenerCount > 0 ||
          criticalSagCount > 0 ||
          roomIssues.length > 0) && (
          <button
            type="button"
            onClick={() =>
              roomIssues.length > 0
                ? setRoomModalOpen(true)
                : collisionReport.pairs.length > 0
                  ? setLeftDrawerMode('parts')
                  : setCutListOpen(true)
            }
            className="pointer-events-auto mt-1 inline-flex w-fit items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-950/90 px-2.5 py-1 text-[11px] font-medium text-red-100 shadow-md hover:bg-red-900 cursor-pointer"
          >
            <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            <span>
              {[
                collisionReport.pairs.length > 0 ? `${collisionReport.pairs.length} kolizji` : null,
                faultyFastenerCount > 0 ? `${faultyFastenerCount} wkręt.` : null,
                criticalSagCount > 0 ? `${criticalSagCount} ugięcie półki` : null,
                roomIssues.length > 0 ? `${roomIssues.length} wnęka/skos` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        )}
      </div>

      {/* Physical Contact-Graph Step-by-Step Workshop Assembly Guide */}
      {activeAssemblyStepPlan && (
        <div className="fixed top-14 left-1/2 z-30 -translate-x-1/2 w-[min(660px,calc(100vw-24px))] rounded-xl border border-emerald-500/50 bg-[#141518]/[0.97] px-3.5 py-2.5 text-zinc-100 shadow-2xl">
          {/* Top navigation & granularity row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button
                type="button"
                disabled={clampedAssemblyStep <= 1}
                onClick={() => setAssemblyStep((s) => Math.max(1, s - 1))}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 disabled:opacity-35 cursor-pointer"
                aria-label="Poprzedni krok montażu"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>

              {assemblyPlan.steps.length <= 10 ? (
                assemblyPlan.steps.map((s) => (
                  <button
                    key={s.step}
                    type="button"
                    onClick={() => setAssemblyStep(s.step)}
                    title={`Krok ${s.step}: ${s.title}`}
                    className={`flex h-7 min-w-[26px] px-1 items-center justify-center rounded-md text-xs font-mono-num font-semibold cursor-pointer ${
                      clampedAssemblyStep === s.step
                        ? 'bg-emerald-500 text-zinc-950'
                        : s.step < clampedAssemblyStep
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-zinc-900 text-zinc-400 hover:text-white'
                    }`}
                  >
                    {s.step}
                  </button>
                ))
              ) : (
                <div className="flex items-center gap-2 px-1.5">
                  <span className="text-xs font-mono-num font-semibold text-emerald-300 whitespace-nowrap">
                    {clampedAssemblyStep} / {assemblyPlan.steps.length}
                  </span>
                  <input
                    type="range"
                    min={1}
                    max={assemblyPlan.steps.length}
                    value={clampedAssemblyStep}
                    onChange={(e) => setAssemblyStep(Number(e.target.value))}
                    className="w-28 sm:w-36 accent-emerald-500 cursor-pointer"
                    aria-label="Suwak kroków montażu"
                  />
                </div>
              )}

              <button
                type="button"
                disabled={clampedAssemblyStep >= assemblyPlan.steps.length}
                onClick={() =>
                  setAssemblyStep((s) =>
                    Math.min(assemblyPlan.steps.length, s + 1)
                  )
                }
                className="flex h-7 w-7 items-center justify-center rounded-md border border-zinc-700 bg-zinc-900 text-zinc-200 hover:bg-zinc-800 disabled:opacity-35 cursor-pointer"
                aria-label="Następny krok montażu"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="flex items-center rounded-md border border-zinc-800 bg-zinc-950 p-0.5 text-[10px]">
                <button
                  type="button"
                  onClick={() => {
                    setAssemblyGranularity('grouped');
                    setAssemblyStep(1);
                  }}
                  className={`rounded px-2 py-0.5 font-medium cursor-pointer transition-colors ${
                    assemblyGranularity === 'grouped'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  Etapy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAssemblyGranularity('part_by_part');
                    setAssemblyStep(1);
                  }}
                  className={`rounded px-2 py-0.5 font-medium cursor-pointer transition-colors ${
                    assemblyGranularity === 'part_by_part'
                      ? 'bg-emerald-500/20 text-emerald-300'
                      : 'text-zinc-400 hover:text-zinc-200'
                  }`}
                >
                  1 po 1
                </button>
              </div>
              <span className="hidden sm:inline text-[10px] font-mono-num text-zinc-400">
                {assemblyPlan.totalContacts} styków
              </span>
              <button
                type="button"
                onClick={() => setAssemblyStep(0)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
                title="Zakończ przewodnik montażu"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Step title & auto-generated carpentry instruction */}
          <div className="mt-2 border-t border-zinc-800/80 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs font-semibold text-emerald-300">
                Krok {activeAssemblyStepPlan.step}/{assemblyPlan.steps.length}:{' '}
                {activeAssemblyStepPlan.title}
              </div>
              {activeAssemblyStepPlan.totalFasteners > 0 && (
                <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-mono-num font-medium text-amber-300">
                  {activeAssemblyStepPlan.fastenerSummary}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-zinc-300">
              {activeAssemblyStepPlan.instruction}
            </p>

            {/* Per-board contact breakdown (clickable to focus/select board in 3D) */}
            <div className="mt-2 flex max-h-24 flex-col gap-1 overflow-y-auto pr-1">
              {activeAssemblyStepPlan.items.map((item) => (
                <button
                  key={item.partId}
                  type="button"
                  onClick={() => {
                    handleSelectPart(item.partId, false);
                    viewportRef.current?.focusPart(item.partId);
                  }}
                  className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 rounded-md border border-zinc-800 bg-zinc-900/80 px-2 py-1 text-left text-[11px] hover:border-emerald-500/60 hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  <span className="flex items-center gap-1.5 font-medium text-zinc-100">
                    <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 shrink-0" />
                    {item.partName}
                  </span>
                  <span className="text-[10px] text-sky-300 truncate max-w-full sm:max-w-[340px]">
                    {item.attachToNames.length > 0
                      ? `→ do: ${item.attachToNames.slice(0, 2).join(', ')}${
                          item.attachToNames.length > 2
                            ? ` (+${item.attachToNames.length - 2})`
                            : ''
                        }`
                      : '→ element startowy'}
                    {item.fastenerSummary ? ` · ${item.fastenerSummary}` : ''}
                  </span>
                </button>
              ))}
            </div>

            {/* Compact 3D highlight color key */}
            <div className="mt-1.5 flex items-center gap-3 text-[10px] text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-xs bg-emerald-400" />
                Montujesz teraz
              </span>
              {activeAssemblyStepPlan.targetBasePartIds.length > 0 && (
                <span className="inline-flex items-center gap-1">
                  <span className="h-2 w-2 rounded-xs bg-sky-400" />
                  Baza styku ({activeAssemblyStepPlan.targetBasePartIds.length})
                </span>
              )}
              <span className="ml-auto hidden sm:inline text-zinc-500">
                Kolejność wykryta automatycznie ze styków 3D
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Subtle Toast Notification */}
      {toastMsg && (
        <div className="pointer-events-none fixed top-15 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-zinc-700 bg-[#141518] px-4 py-2 text-xs font-medium text-zinc-100 shadow-xl whitespace-nowrap">
          {toastMsg}
        </div>
      )}

      {/* Compact CAD View Compass (Desktop/Tablet) */}
      <ViewCube
        onSelectView={(preset) => viewportRef.current?.setCameraPreset(preset)}
        onFocusAll={() => viewportRef.current?.focusAll()}
      />

      {/* Full-Viewport Realistic 3D CAD Canvas */}
      <main className="h-full w-full pt-12">
        <Viewport3D
          ref={viewportRef}
          parts={project.parts}
          fasteners={project.fasteners}
          room={project.room}
          selectedPartId={selectedPartId}
          selectedPartIds={selectedPartIds}
          selectedFastenerId={selectedFastenerId}
          tool={tool}
          activeScrewType={activeScrewType}
          screwJointsOnly={screwJointsOnly}
          snapMm={snapMm}
          magneticSnap={magneticSnap}
          showDimensions={showDimensions}
          xrayMode={xrayMode}
          showFasteners={showFasteners}
          ledUnderCabinet={ledUnderCabinet}
          measurements={measurements}
          explodedAmount={explodedAmount}
          openAmount={openAmount}
          assemblyStep={clampedAssemblyStep}
          assemblyPlan={clampedAssemblyStep > 0 ? assemblyPlan : null}
          materialsVersion={materialsVersion}
          lighting={lighting}
          customTextures={customTextures}
          collidingPartIds={collisionReport.collidingIds}
          fastenerAuditMap={fastenerAuditMap}
          clearances={selectedClearances}
          jointZones={jointZones}
          onSelectPart={handleSelectPart}
          onSelectFastener={handleSelectFastener}
          onTransformPart={handleTransformPart}
          onCloneTransformPart={handleCloneTransformPart}
          onResizePart={handleResizePart}
          onAddMeasurement={handleAddMeasurement}
          onPlaceFastener={handlePlaceFastener}
          onRejectScrewPlacement={(reason) =>
            showToast(`Wkręt zablokowany: ${reason} (wyłącz „Styki”, aby wymusić)`)
          }
          onContextMenu={setContextMenu}
        />
      </main>

      {/* Right-Click Commercial CAD Context Menu */}
      <ContextMenu
        menu={contextMenu}
        selectedCount={selectedPartIds.length}
        selectedCanUngroup={selectedCanUngroup}
        onClose={() => setContextMenu(null)}
        onOpenInspector={(id) => {
          setSelectedPartId(id);
          setSelectedPartIds([id]);
          setInspectorOpen(true);
        }}
        onEditShape2D={(id) => {
          const p = project.parts.find((x) => x.id === id);
          if (p) {
            setSketchEditingPart(p);
            setSketchOpen(true);
          }
        }}
        onDuplicate={handleDuplicatePart}
        onMirrorDuplicate={(id) => handleMirrorPart(id, true)}
        onRotate90Y={handleRotate90Y}
        onDropToFloor={handleDropToFloor}
        onAutoFastenPart={(id) => handleAutoFasteners(id)}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        onDeletePart={handleDeletePart}
        onDeleteFastener={handleDeleteFastener}
        onAddPart={() => setAddPartOpen(true)}
        onSketchNew2D={() => {
          setSketchEditingPart(null);
          setSketchOpen(true);
        }}
        onAutoFastenAll={() => handleAutoFasteners()}
        onFocusAll={() => viewportRef.current?.focusAll()}
      />

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
        screwJointsOnly={screwJointsOnly}
        onToggleScrewJointsOnly={() => setScrewJointsOnly((v) => !v)}
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
        ledUnderCabinet={ledUnderCabinet}
        onToggleLedUnderCabinet={() => setLedUnderCabinet((l) => !l)}
        measurementsCount={measurements.length}
        onClearMeasurements={() => {
          setMeasurements([]);
          showToast('Wyczyszczono pomiary 3D');
        }}
        explodedAmount={explodedAmount}
        onChangeExploded={setExplodedAmount}
        openAmount={openAmount}
        onChangeOpenAmount={setOpenAmount}
        assemblyStep={assemblyStep}
        onToggleAssemblyMode={() => setAssemblyStep((s) => (s > 0 ? 0 : 1))}
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
        onAutoFasteners={() => handleAutoFasteners()}
        canUndo={historyPast.length > 0}
        canRedo={historyFuture.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        selectedPartName={selectedPart?.name ?? null}
        selectedCount={selectedPartIds.length}
        selectedCanUngroup={selectedCanUngroup}
        selectedFastenerLabel={
          selectedFastener ? SCREW_MAP[selectedFastener.type].name : null
        }
        onAlignSelected={handleAlignSelected}
        onDistributeSelected={handleDistributeSelected}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
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
          setSelectedPartIds([id]);
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
        materialsVersion={materialsVersion}
        customTextures={customTextures}
        isColliding={Boolean(selectedPart && collisionReport.collidingIds.has(selectedPart.id))}
        clearances={selectedClearances}
        fastenerAuditMap={fastenerAuditMap}
        shelfDeflection={selectedPart ? shelfDeflectionMap.get(selectedPart.id) : undefined}
        groupBounds={selectedGroupBounds}
        onSmartResizeGroup={handleSmartResizeGroup}
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
        materialsVersion={materialsVersion}
        customTextures={customTextures}
        onClose={() => setAddPartOpen(false)}
        onAddPart={handleAddPart}
        onOpenCustomSketch={() => {
          setSketchEditingPart(null);
          setSketchOpen(true);
        }}
        onOpenCabinetBuilder={() => setCabinetBuilderOpen(true)}
        onOpenMaterialsManager={() => setMaterialsModalOpen(true)}
      />

      <MaterialsManagerModal
        open={materialsModalOpen}
        config={materialsConfig}
        materialsVersion={materialsVersion}
        customTextures={customTextures}
        onClose={() => setMaterialsModalOpen(false)}
        onChangeConfig={handleChangeMaterialsConfig}
        onSetCustomTexture={handleSetCustomTexture}
      />

      <CabinetBuilderModal
        open={cabinetBuilderOpen}
        onClose={() => setCabinetBuilderOpen(false)}
        onInsertCabinet={handleInsertCabinet}
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

      <RoomSettingsModal
        open={roomModalOpen}
        parts={project.parts}
        room={project.room}
        roomIssues={roomIssues}
        onClose={() => setRoomModalOpen(false)}
        onSaveRoom={(nextRoom) => {
          commitProject((prev) => ({
            ...prev,
            room: nextRoom,
          }));
          showToast(
            nextRoom.enabled
              ? `Zapisano wnękę ${nextRoom.widthMm}×${nextRoom.heightMm}×${nextRoom.depthMm} mm`
              : 'Wyłączono podgląd wnęki'
          );
        }}
      />

      <CutListModal
        open={cutListOpen}
        project={project}
        materialsVersion={materialsVersion}
        fastenerAuditMap={fastenerAuditMap}
        shelfDeflectionMap={shelfDeflectionMap}
        roomIssues={roomIssues}
        collisionCount={collisionReport.pairs.length}
        quoteSettings={quoteSettings}
        onChangeQuoteSettings={setQuoteSettings}
        onCaptureSnapshot={() => viewportRef.current?.captureSnapshot() ?? null}
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
          setSelectedPartIds([]);
          setSelectedFastenerId(null);
          setContextMenu(null);
          setExplodedAmount(0);
          setTimeout(() => viewportRef.current?.focusAll(), 40);
          showToast(`Zaimportowano jako nowy projekt: ${importedCopy.name}`);
        }}
        onImportError={(msg) => showToast(msg)}
      />
    </div>
  );
}
