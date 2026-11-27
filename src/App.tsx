import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckSquare,
  ChevronLeft,
  ChevronRight,
  Cloud,
  CloudOff,
  Focus,
  Home,
  LayoutPanelTop,
  Plus,
  RefreshCw,
  Undo2,
  X,
} from 'lucide-react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { auth, googleProvider } from './firebase';
import {
  deleteCloudProject,
  deleteCloudTemplate,
  ensureWorkspaceProfile,
  sanitizeFirestoreId,
  saveCloudProject,
  saveCloudTemplate,
  saveCloudWorkspaceSettings,
  seedStarterTemplatesToCloud,
  subscribeCloudProjects,
  subscribeCloudSettings,
  subscribeCloudTemplates,
} from './engine/cloudSync';
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
  ParametricCabinetConfig,
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
import {
  FURNITURE_TEMPLATES,
  type FurnitureTemplateMeta,
} from './data/templates';
import {
  autoDetectJointFasteners,
  getProjectDimensionsMm,
} from './engine/geometry';
import {
  alignSelectedParts,
  analyzeCountertopCutouts,
  analyzeDoorSwingCollisions,
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
  mergeCountertopsForRow,
  mirrorPartX,
  syncApplianceCutoutsOnCountertops,
  syncFastenersWithParts,
  ungroupSelectedParts,
  type ClearanceGuide,
} from './engine/carpentry';
import {
  getGroupBoundingSizeMm,
  rebuildParametricCabinetInPlace,
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
import {
  BottomDock,
  type SelectionScope,
  type UiMode,
} from './components/BottomDock';
import { PrecisionNudgePad } from './components/PrecisionNudgePad';
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
import { PWAInstallButton, PWAStatusOverlays } from './components/PWAControls';
import { StartWorkspaceModal } from './components/StartWorkspaceModal';
import { ShortcutsHelpModal } from './components/ShortcutsHelpModal';
import {
  CloudAccountModal,
  type CloudSyncStatus,
} from './components/CloudAccountModal';
import { usePWAUpdate } from './hooks/usePWAUpdate';

const SNAP_STEPS = [10, 5, 25, 0];
const LIGHTING_ORDER: StudioLighting[] = ['daylight', 'studio', 'warm', 'photoreal'];
const SKIP_START_MODAL_KEY = 'stolarz3d_skip_start_modal';
const UI_MODE_STORAGE_KEY = 'stolarz3d_ui_mode';

function createDefaultProject(): FurnitureProject {
  return {
    id: 'proj_initial',
    name: 'Nowy projekt',
    parts: [],
    fasteners: [],
    updatedAt: Date.now(),
  };
}

export default function App() {
  const viewportRef = useRef<Viewport3DHandle | null>(null);
  const pwa = usePWAUpdate();

  const [projectStore, setProjectStore] = useState<ProjectStoreState>(() => {
    const loaded = loadProjectStore(createDefaultProject);
    let showStart = true;
    try {
      showStart = window.localStorage.getItem(SKIP_START_MODAL_KEY) !== '1';
    } catch {
      showStart = true;
    }
    if (!showStart) return loaded;

    // Keep the 3D canvas completely clean behind the startup modal until the user picks an action
    const existingBlank = loaded.projects.find(
      (p) => p.parts.length === 0 && !p.room?.enabled
    );
    if (existingBlank) {
      return { ...loaded, activeProjectId: existingBlank.id };
    }
    const freshBlank: FurnitureProject = {
      id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: 'Nowy projekt',
      parts: [],
      fasteners: [],
      updatedAt: Date.now(),
    };
    return {
      activeProjectId: freshBlank.id,
      projects: [freshBlank, ...loaded.projects],
    };
  });
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
  const [editingCabinetGroupId, setEditingCabinetGroupId] = useState<string | null>(null);
  const [materialsModalOpen, setMaterialsModalOpen] = useState<boolean>(false);
  const [roomModalOpen, setRoomModalOpen] = useState<boolean>(false);
  const [sketchOpen, setSketchOpen] = useState<boolean>(false);
  const [sketchEditingPart, setSketchEditingPart] = useState<FurniturePart | null>(null);
  const [leftDrawerMode, setLeftDrawerMode] = useState<LeftDrawerMode>(null);
  const [cutListOpen, setCutListOpen] = useState<boolean>(false);
  const [skipStartModal, setSkipStartModal] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SKIP_START_MODAL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [startModalOpen, setStartModalOpen] = useState<boolean>(() => {
    try {
      return window.localStorage.getItem(SKIP_START_MODAL_KEY) !== '1';
    } catch {
      return true;
    }
  });
  const [contextMenu, setContextMenu] = useState<ContextMenuTarget | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState<boolean>(false);
  const [multiSelectMode, setMultiSelectMode] = useState<boolean>(false);
  const [uiMode, setUiMode] = useState<UiMode>(() => {
    try {
      const saved = window.localStorage.getItem(UI_MODE_STORAGE_KEY);
      return saved === 'expert' ? 'expert' : 'simple';
    } catch {
      return 'simple';
    }
  });
  const [selectionScope, setSelectionScope] = useState<SelectionScope>('group');
  const [activeGroupEditId, setActiveGroupEditId] = useState<string | null>(null);
  const [nudgePadOpen, setNudgePadOpen] = useState<boolean>(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Firebase Cloud Auth & Real-Time Sync State
  const [cloudModalOpen, setCloudModalOpen] = useState<boolean>(false);
  const [cloudUser, setCloudUser] = useState<User | null>(null);
  const [cloudAuthReady, setCloudAuthReady] = useState<boolean>(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatus>('signed_out');
  const [cloudSyncError, setCloudSyncError] = useState<string | null>(null);
  const [cloudProjectsCount, setCloudProjectsCount] = useState<number>(0);
  const [cloudTemplates, setCloudTemplates] = useState<FurnitureTemplateMeta[]>([]);
  const [cloudTemplatesLoading, setCloudTemplatesLoading] = useState<boolean>(false);
  const [lastCloudSyncedAt, setLastCloudSyncedAt] = useState<number | null>(null);

  const cloudKnownIdsRef = useRef<Set<string>>(new Set());
  const cloudSyncedProjectStampRef = useRef<Map<string, number>>(new Map());
  const cloudSettingsStampRef = useRef<number>(0);
  const cloudInitialMergeDoneRef = useRef<boolean>(false);
  const cloudProfileReadyRef = useRef<boolean>(false);
  const cloudTemplatesSeededRef = useRef<boolean>(false);
  const projectStoreRef = useRef<ProjectStoreState>(projectStore);
  projectStoreRef.current = projectStore;
  const materialsConfigRef = useRef<MaterialsCatalogConfig>(materialsConfig);
  materialsConfigRef.current = materialsConfig;
  const quoteSettingsRef = useRef<QuoteSettings>(quoteSettings);
  quoteSettingsRef.current = quoteSettings;

  const handleChangeUiMode = useCallback((next: UiMode) => {
    setUiMode(next);
    try {
      window.localStorage.setItem(UI_MODE_STORAGE_KEY, next);
    } catch {
      // ignore storage errors
    }
  }, []);

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

  const formatCloudError = useCallback((err: unknown): string => {
    const raw = err instanceof Error ? err.message : String(err);
    if (raw.includes('Quota exceeded')) {
      return 'Przekroczono dzienny darmowy limit odczytów/zapisów Firebase (Spark). Limit odnowi się jutro.';
    }
    return raw;
  }, []);

  // Listen to Firebase Authentication state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setCloudUser(user);
      setCloudAuthReady(true);
      if (!user) {
        cloudKnownIdsRef.current = new Set();
        cloudSyncedProjectStampRef.current = new Map();
        cloudSettingsStampRef.current = 0;
        cloudInitialMergeDoneRef.current = false;
        cloudProfileReadyRef.current = false;
        cloudTemplatesSeededRef.current = false;
        setCloudProjectsCount(0);
        setCloudTemplates([]);
        setCloudTemplatesLoading(false);
        setCloudSyncStatus('signed_out');
        setCloudSyncError(null);
      }
    });
    return () => unsub();
  }, []);

  // Subscribe to Firestore projects, settings & templates when signed in
  useEffect(() => {
    if (!cloudAuthReady || !cloudUser) return;

    let cancelled = false;
    let unsubProjects: (() => void) | null = null;
    let unsubSettings: (() => void) | null = null;
    let unsubTemplates: (() => void) | null = null;

    const uid = cloudUser.uid;
    setCloudSyncStatus('connecting');
    setCloudSyncError(null);
    setCloudTemplatesLoading(true);
    cloudInitialMergeDoneRef.current = false;
    cloudProfileReadyRef.current = false;
    cloudTemplatesSeededRef.current = false;

    void (async () => {
      try {
        await ensureWorkspaceProfile(cloudUser);
        if (cancelled) return;
        cloudProfileReadyRef.current = true;

        unsubProjects = subscribeCloudProjects(
          uid,
          (cloudProjects, cloudIds) => {
            if (cancelled) return;
            cloudKnownIdsRef.current = cloudIds;
            setCloudProjectsCount(cloudProjects.length);
            setLastCloudSyncedAt(Date.now());
            setCloudSyncStatus('synced');
            setCloudSyncError(null);

            for (const cp of cloudProjects) {
              cloudSyncedProjectStampRef.current.set(cp.id, cp.updatedAt ?? 0);
            }

            const localNow = projectStoreRef.current.projects;
            const toUploadOnFirstSync: FurnitureProject[] = [];

            if (!cloudInitialMergeDoneRef.current) {
              cloudInitialMergeDoneRef.current = true;
              const cloudById = new Map(cloudProjects.map((p) => [p.id, p]));
              for (const lp of localNow) {
                const safeId = sanitizeFirestoreId(lp.id);
                const hasContent =
                  lp.parts.length > 0 ||
                  Boolean(lp.room?.enabled) ||
                  lp.name !== 'Nowy projekt';
                const cloudMatch = cloudById.get(safeId);
                const localTs = lp.updatedAt ?? 0;
                const cloudTs = cloudMatch?.updatedAt ?? 0;
                if (hasContent && (!cloudMatch || localTs > cloudTs + 1500)) {
                  toUploadOnFirstSync.push({ ...lp, id: safeId, updatedAt: localTs || Date.now() });
                }
              }
            }

            setProjectStore((prev) => {
              const mergedMap = new Map<string, FurnitureProject>();
              for (const lp of prev.projects) {
                const safeId = sanitizeFirestoreId(lp.id);
                mergedMap.set(safeId, safeId === lp.id ? lp : { ...lp, id: safeId });
              }
              let changed = false;
              for (const cp of cloudProjects) {
                const existingLocal = mergedMap.get(cp.id);
                if (!existingLocal || (cp.updatedAt ?? 0) > (existingLocal.updatedAt ?? 0)) {
                  mergedMap.set(cp.id, cp);
                  changed = true;
                }
              }
              if (!changed && prev.projects.length === mergedMap.size) {
                return prev;
              }
              const mergedList = Array.from(mergedMap.values()).sort(
                (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
              );
              const safeActiveId = sanitizeFirestoreId(prev.activeProjectId);
              const activeId = mergedList.some((p) => p.id === safeActiveId)
                ? safeActiveId
                : mergedList[0]?.id ?? prev.activeProjectId;
              return { activeProjectId: activeId, projects: mergedList };
            });

            if (toUploadOnFirstSync.length > 0) {
              setCloudSyncStatus('syncing');
              void Promise.all(
                toUploadOnFirstSync.map(async (proj) => {
                  const savedId = await saveCloudProject(uid, proj, cloudKnownIdsRef.current);
                  cloudSyncedProjectStampRef.current.set(savedId, proj.updatedAt ?? Date.now());
                })
              )
                .then(() => {
                  if (!cancelled) {
                    setCloudSyncStatus('synced');
                    setLastCloudSyncedAt(Date.now());
                  }
                })
                .catch((err) => {
                  if (!cancelled) {
                    setCloudSyncStatus('error');
                    setCloudSyncError(formatCloudError(err));
                  }
                });
            }
          },
          (err) => {
            if (cancelled) return;
            setCloudSyncStatus('error');
            setCloudSyncError(formatCloudError(err));
          }
        );

        unsubSettings = subscribeCloudSettings(
          uid,
          (remote) => {
            if (cancelled) return;
            if (!remote) {
              const localMat = materialsConfigRef.current;
              const hasCustom =
                localMat.customMaterials.length > 0 ||
                Object.keys(localMat.builtInOverrides || {}).length > 0;
              if (hasCustom) {
                const ts = Date.now();
                cloudSettingsStampRef.current = ts;
                void saveCloudWorkspaceSettings(uid, localMat, quoteSettingsRef.current, ts).catch(
                  (err) => {
                    if (!cancelled) {
                      setCloudSyncStatus('error');
                      setCloudSyncError(formatCloudError(err));
                    }
                  }
                );
              }
              return;
            }

            if (remote.clientUpdatedAt > cloudSettingsStampRef.current) {
              cloudSettingsStampRef.current = remote.clientUpdatedAt;
              syncCatalogMaterials(remote.materialsConfig);
              saveMaterialsConfig(remote.materialsConfig);
              setMaterialsConfig(remote.materialsConfig);
              setMaterialsVersion((v) => v + 1);
              setQuoteSettings(remote.quoteSettings);
            }
          },
          (err) => {
            if (cancelled) return;
            setCloudSyncStatus('error');
            setCloudSyncError(formatCloudError(err));
          }
        );

        unsubTemplates = subscribeCloudTemplates(
          uid,
          (tpls) => {
            if (cancelled) return;
            if (tpls.length === 0 && !cloudTemplatesSeededRef.current) {
              cloudTemplatesSeededRef.current = true;
              setCloudTemplatesLoading(true);
              void seedStarterTemplatesToCloud(uid, FURNITURE_TEMPLATES).catch((err) => {
                if (!cancelled) {
                  setCloudTemplatesLoading(false);
                  setCloudSyncStatus('error');
                  setCloudSyncError(formatCloudError(err));
                }
              });
              return;
            }
            setCloudTemplates(tpls);
            setCloudTemplatesLoading(false);
          },
          (err) => {
            if (cancelled) return;
            setCloudTemplatesLoading(false);
            setCloudSyncStatus('error');
            setCloudSyncError(formatCloudError(err));
          }
        );
      } catch (err) {
        if (!cancelled) {
          setCloudTemplatesLoading(false);
          setCloudSyncStatus('error');
          setCloudSyncError(formatCloudError(err));
        }
      }
    })();

    return () => {
      cancelled = true;
      unsubProjects?.();
      unsubSettings?.();
      unsubTemplates?.();
    };
  }, [cloudAuthReady, cloudUser, formatCloudError]);

  // Debounced background auto-save of the active project to Firestore
  useEffect(() => {
    if (!cloudUser || !cloudProfileReadyRef.current) return;
    const safeId = sanitizeFirestoreId(project.id);
    const projUpdatedAt = project.updatedAt ?? 0;
    const lastSynced = cloudSyncedProjectStampRef.current.get(safeId) ?? 0;
    if (projUpdatedAt <= lastSynced) return;
    const isEmptyTransient =
      project.parts.length === 0 &&
      !project.room?.enabled &&
      project.name === 'Nowy projekt' &&
      !cloudKnownIdsRef.current.has(safeId);
    if (isEmptyTransient) return;

    const uid = cloudUser.uid;
    const snapshot = project;
    const timer = window.setTimeout(() => {
      setCloudSyncStatus('syncing');
      void saveCloudProject(uid, snapshot, cloudKnownIdsRef.current)
        .then((savedId) => {
          cloudSyncedProjectStampRef.current.set(savedId, snapshot.updatedAt ?? Date.now());
          setCloudSyncStatus('synced');
          setLastCloudSyncedAt(Date.now());
          setCloudSyncError(null);
        })
        .catch((err) => {
          setCloudSyncStatus('error');
          setCloudSyncError(formatCloudError(err));
        });
    }, 1200);

    return () => window.clearTimeout(timer);
  }, [cloudUser, project, formatCloudError]);

  // Debounced auto-save of quoteSettings to Firestore when signed in
  const quoteHydratedRef = useRef(false);
  useEffect(() => {
    if (!quoteHydratedRef.current) {
      quoteHydratedRef.current = true;
      return;
    }
    if (!cloudUser || !cloudProfileReadyRef.current) return;
    const uid = cloudUser.uid;
    const ts = Date.now();
    const timer = window.setTimeout(() => {
      cloudSettingsStampRef.current = ts;
      void saveCloudWorkspaceSettings(uid, materialsConfigRef.current, quoteSettings, ts)
        .then(() => setLastCloudSyncedAt(Date.now()))
        .catch((err) => {
          setCloudSyncStatus('error');
          setCloudSyncError(formatCloudError(err));
        });
    }, 800);
    return () => window.clearTimeout(timer);
  }, [cloudUser, quoteSettings, formatCloudError]);

  const handleCloudSignInGoogle = useCallback(async () => {
    setCloudSyncError(null);
    try {
      await signInWithPopup(auth, googleProvider);
      showToast('Zalogowano przez Google — uruchamiam synchronizację');
    } catch (err) {
      const msg = formatCloudError(err);
      setCloudSyncStatus('error');
      setCloudSyncError(msg);
      showToast('Nie udało się zalogować — sprawdź ustawienia konsoli Firebase');
    }
  }, [formatCloudError, showToast]);

  const handleCloudSignOut = useCallback(async () => {
    try {
      await signOut(auth);
      showToast('Wylogowano z chmury (projekty pozostają lokalnie)');
    } catch (err) {
      setCloudSyncError(formatCloudError(err));
    }
  }, [formatCloudError, showToast]);

  const handleCloudForceUploadAll = useCallback(async () => {
    if (!cloudUser) return;
    const uid = cloudUser.uid;
    setCloudSyncStatus('syncing');
    setCloudSyncError(null);
    try {
      await ensureWorkspaceProfile(cloudUser);
      cloudProfileReadyRef.current = true;
      const toUpload = projectStoreRef.current.projects.filter(
        (p) =>
          p.parts.length > 0 ||
          Boolean(p.room?.enabled) ||
          p.name !== 'Nowy projekt' ||
          projectStoreRef.current.projects.length === 1
      );
      for (const proj of toUpload) {
        const savedId = await saveCloudProject(uid, proj, cloudKnownIdsRef.current);
        cloudSyncedProjectStampRef.current.set(savedId, proj.updatedAt ?? Date.now());
      }
      const ts = Date.now();
      cloudSettingsStampRef.current = ts;
      await saveCloudWorkspaceSettings(
        uid,
        materialsConfigRef.current,
        quoteSettingsRef.current,
        ts
      );
      setCloudSyncStatus('synced');
      setLastCloudSyncedAt(Date.now());
      showToast(`Zapisano ${toUpload.length} proj. i katalog materiałów w chmurze`);
    } catch (err) {
      setCloudSyncStatus('error');
      setCloudSyncError(formatCloudError(err));
      showToast('Błąd zapisu do Firebase — sprawdź szczegóły w panelu Chmury');
    }
  }, [cloudUser, formatCloudError, showToast]);

  const handleSaveCurrentAsTemplate = useCallback(async () => {
    if (!cloudUser || project.parts.length === 0) return;
    try {
      await ensureWorkspaceProfile(cloudUser);
      cloudProfileReadyRef.current = true;
      const dims = getProjectDimensionsMm(project.parts);
      const tpl: FurnitureTemplateMeta = {
        id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        name: project.name.trim() || 'Własny szablon 3D',
        subtitle: `${dims.width} × ${dims.height} × ${dims.depth} mm · ${project.parts.length} elem.`,
        category: 'Domowe',
        project: structuredClone(project),
      };
      await saveCloudTemplate(cloudUser.uid, tpl);
      setLastCloudSyncedAt(Date.now());
      showToast(`Zapisano szablon „${tpl.name}” w Firestore`);
    } catch (err) {
      setCloudSyncStatus('error');
      setCloudSyncError(formatCloudError(err));
      showToast('Nie udało się zapisać szablonu w Firestore — sprawdź reguły w panelu Chmury');
    }
  }, [cloudUser, project, formatCloudError, showToast]);

  const handleDeleteCloudTemplate = useCallback(
    async (templateId: string) => {
      if (!cloudUser) return;
      try {
        await deleteCloudTemplate(cloudUser.uid, templateId);
        setLastCloudSyncedAt(Date.now());
        showToast('Usunięto szablon z Firestore');
      } catch (err) {
        setCloudSyncStatus('error');
        setCloudSyncError(formatCloudError(err));
        showToast('Błąd usuwania szablonu z Firestore');
      }
    },
    [cloudUser, formatCloudError, showToast]
  );

  const handleRestoreStarterTemplates = useCallback(async () => {
    if (!cloudUser) return;
    setCloudTemplatesLoading(true);
    try {
      await ensureWorkspaceProfile(cloudUser);
      cloudProfileReadyRef.current = true;
      await seedStarterTemplatesToCloud(cloudUser.uid, FURNITURE_TEMPLATES);
      setLastCloudSyncedAt(Date.now());
      showToast('Załadowano szablony startowe do Firestore');
    } catch (err) {
      setCloudTemplatesLoading(false);
      setCloudSyncStatus('error');
      setCloudSyncError(formatCloudError(err));
      showToast('Nie udało się wgrać szablonów do Firestore — sprawdź reguły w panelu Chmury');
    }
  }, [cloudUser, formatCloudError, showToast]);

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
      setActiveGroupEditId(null);
      setNudgePadOpen(false);
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
    setActiveGroupEditId(null);
    setNudgePadOpen(false);
    setContextMenu(null);
    setInspectorOpen(false);
    setExplodedAmount(0);
    setLeftDrawerMode(null);
    showToast(`Utworzono: ${newProj.name}`);
  }, [projectStore.projects.length, showToast]);

  // Ensures a clean empty project when starting a new workflow from the startup launcher
  const ensureCleanProjectForStart = useCallback(
    (defaultName: string) => {
      const hasExistingContent = project.parts.length > 0 || Boolean(project.room?.enabled);
      if (hasExistingContent) {
        const newProj: FurnitureProject = {
          id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: `${defaultName} #${projectStore.projects.length + 1}`,
          parts: [],
          fasteners: [],
          updatedAt: Date.now(),
        };
        setProjectStore((store) => ({
          activeProjectId: newProj.id,
          projects: [newProj, ...store.projects],
        }));
      }
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedPartId(null);
      setSelectedPartIds([]);
      setSelectedFastenerId(null);
      setActiveGroupEditId(null);
      setNudgePadOpen(false);
      setContextMenu(null);
      setInspectorOpen(false);
      setExplodedAmount(0);
      setLeftDrawerMode(null);
    },
    [project.parts.length, project.room?.enabled, projectStore.projects.length]
  );

  const handleToggleSkipStartModal = useCallback((skip: boolean) => {
    setSkipStartModal(skip);
    try {
      window.localStorage.setItem(SKIP_START_MODAL_KEY, skip ? '1' : '0');
    } catch {
      // Ignore private browsing storage errors
    }
  }, []);

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
      setActiveGroupEditId(null);
      setNudgePadOpen(false);
      setContextMenu(null);
      showToast(`Zduplikowano: ${copy.name}`);
    },
    [projectStore.projects, showToast]
  );

  const handleRenameProject = useCallback(
    (id: string, name: string) => {
      const trimmed = name.trim().slice(0, 80);
      if (!trimmed) return;
      const now = Date.now();
      const target = projectStoreRef.current.projects.find((p) => p.id === id);
      setProjectStore((store) => ({
        ...store,
        projects: store.projects.map((p) =>
          p.id === id ? { ...p, name: trimmed, updatedAt: now } : p
        ),
      }));
      if (
        cloudUser &&
        cloudProfileReadyRef.current &&
        target &&
        id !== projectStoreRef.current.activeProjectId
      ) {
        const updated = { ...target, name: trimmed, updatedAt: now };
        void saveCloudProject(cloudUser.uid, updated, cloudKnownIdsRef.current)
          .then((savedId) => {
            cloudSyncedProjectStampRef.current.set(savedId, now);
            setLastCloudSyncedAt(Date.now());
          })
          .catch((err) => {
            setCloudSyncStatus('error');
            setCloudSyncError(formatCloudError(err));
          });
      }
    },
    [cloudUser, formatCloudError]
  );

  const handleDeleteProject = useCallback(
    (id: string) => {
      if (projectStoreRef.current.projects.length <= 1) return;
      setProjectStore((store) => {
        if (store.projects.length <= 1) return store;
        const remaining = store.projects.filter((p) => p.id !== id);
        const nextActive =
          store.activeProjectId === id ? remaining[0].id : store.activeProjectId;
        return { activeProjectId: nextActive, projects: remaining };
      });
      if (cloudUser && cloudProfileReadyRef.current) {
        const safeId = sanitizeFirestoreId(id);
        cloudKnownIdsRef.current.delete(safeId);
        cloudSyncedProjectStampRef.current.delete(safeId);
        void deleteCloudProject(cloudUser.uid, safeId).catch((err) => {
          setCloudSyncStatus('error');
          setCloudSyncError(formatCloudError(err));
        });
      }
      setHistoryPast([]);
      setHistoryFuture([]);
      setSelectedPartId(null);
      setSelectedPartIds([]);
      setSelectedFastenerId(null);
      setActiveGroupEditId(null);
      setNudgePadOpen(false);
      setContextMenu(null);
      setInspectorOpen(false);
      showToast('Usunięto projekt');
    },
    [cloudUser, formatCloudError, showToast]
  );

  const handleSelectPart = useCallback(
    (id: string | null, additive = false) => {
      setSelectedFastenerId(null);
      if (!id) {
        setSelectedPartId(null);
        setSelectedPartIds([]);
        setActiveGroupEditId(null);
        setInspectorOpen(false);
        setNudgePadOpen(false);
        return;
      }
      const clicked = project.parts.find((p) => p.id === id);
      if (additive || multiSelectMode) {
        setSelectedPartIds((prev) => {
          const exists = prev.includes(id);
          const next = exists ? prev.filter((x) => x !== id) : [...prev, id];
          setSelectedPartId(next.length > 0 ? next[next.length - 1] : null);
          return next;
        });
        return;
      }

      // SketchUp / PRO100 group selection: 1 click selects entire group unless drilled into it
      if (
        selectionScope === 'group' &&
        clicked?.groupId &&
        clicked.groupId !== activeGroupEditId
      ) {
        const groupMembers = project.parts
          .filter((p) => p.groupId === clicked.groupId && !p.hidden)
          .map((p) => p.id);
        setActiveGroupEditId(null);
        setSelectedPartId(id);
        setSelectedPartIds(groupMembers.length > 0 ? groupMembers : [id]);
        return;
      }

      if (activeGroupEditId && clicked?.groupId !== activeGroupEditId) {
        setActiveGroupEditId(null);
      }
      setSelectedPartId(id);
      setSelectedPartIds([id]);
    },
    [multiSelectMode, project.parts, selectionScope, activeGroupEditId]
  );

  const handleDoubleClickPart = useCallback(
    (id: string) => {
      const clicked = project.parts.find((p) => p.id === id);
      if (!clicked) return;
      if (clicked.groupId && selectionScope === 'group' && activeGroupEditId !== clicked.groupId) {
        setActiveGroupEditId(clicked.groupId);
        setSelectedPartId(id);
        setSelectedPartIds([id]);
        showToast('Edycja pojedynczej płyty w grupie (kliknij tło, aby wyjść)');
      }
    },
    [project.parts, selectionScope, activeGroupEditId, showToast]
  );

  const handleSelectGroup = useCallback(
    (groupId: string) => {
      const members = project.parts.filter((p) => p.groupId === groupId);
      if (members.length === 0) return;
      setSelectedFastenerId(null);
      setActiveGroupEditId(null);
      setSelectedPartId(members[0].id);
      setSelectedPartIds(members.map((p) => p.id));
    },
    [project.parts]
  );

  const handleTogglePartsHidden = useCallback(
    (ids: string[], hidden: boolean) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      commitProject((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => (idSet.has(p.id) ? { ...p, hidden } : p)),
      }));
      if (hidden && selectedPartId && idSet.has(selectedPartId)) {
        setSelectedPartId(null);
        setSelectedPartIds([]);
        setNudgePadOpen(false);
      }
      showToast(hidden ? `Ukryto (${ids.length})` : `Pokazano (${ids.length})`);
    },
    [commitProject, selectedPartId, showToast]
  );

  const handleTogglePartsLocked = useCallback(
    (ids: string[], locked: boolean) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      commitProject((prev) => ({
        ...prev,
        parts: prev.parts.map((p) => (idSet.has(p.id) ? { ...p, locked } : p)),
      }));
      showToast(locked ? `Zablokowano ruch (${ids.length})` : `Odblokowano (${ids.length})`);
    },
    [commitProject, showToast]
  );

  const handleSelectFastener = useCallback((id: string | null) => {
    setSelectedFastenerId(id);
    if (id) {
      setSelectedPartId(null);
      setSelectedPartIds([]);
      setInspectorOpen(false);
      setNudgePadOpen(false);
    }
  }, []);

  // Group + Multiselect aware 3D transform with LIVE relational fastener synchronization & lock respect
  const handleTransformPart = useCallback(
    (
      id: string,
      position: [number, number, number],
      rotation: [number, number, number]
    ) => {
      commitProject((prev) => {
        const target = prev.parts.find((p) => p.id === id);
        if (!target || target.locked) return prev;
        const dx = position[0] - target.position[0];
        const dy = position[1] - target.position[1];
        const dz = position[2] - target.position[2];
        const multiSet = new Set(selectedPartIds.includes(id) ? selectedPartIds : [id]);
        const changedIds = new Set<string>([id]);

        const nextParts = prev.parts.map((p) => {
          if (p.id === id) {
            return { ...p, position, rotation };
          }
          const shouldCoMove = multiSet.has(p.id) && !p.locked;
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

  const handleBatchUpdateParts = useCallback(
    (
      ids: string[],
      updater: Partial<FurniturePart> | ((p: FurniturePart) => Partial<FurniturePart>)
    ) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      commitProject((prev) => {
        let affectsGeometry = false;
        const nextParts = prev.parts.map((p) => {
          if (!idSet.has(p.id)) return p;
          const patch = typeof updater === 'function' ? updater(p) : updater;
          if (
            patch.width !== undefined ||
            patch.height !== undefined ||
            patch.depth !== undefined ||
            patch.position !== undefined ||
            patch.rotation !== undefined ||
            patch.customPolygon !== undefined
          ) {
            affectsGeometry = true;
          }
          return { ...p, ...patch };
        });
        const synced = affectsGeometry
          ? syncFastenersWithParts(prev.parts, nextParts, prev.fasteners, idSet)
          : { fasteners: prev.fasteners };
        return {
          ...prev,
          parts: nextParts,
          fasteners: synced.fasteners,
        };
      });
      showToast(`Zaktualizowano ${ids.length} zaznaczonych elementów`);
    },
    [commitProject, showToast]
  );

  const handleResizePart = useCallback(
    (
      id: string,
      dims: { width: number; height: number; depth: number },
      position: [number, number, number]
    ) => {
      commitProject((prev) => {
        const target = prev.parts.find((p) => p.id === id);
        if (!target || target.locked) return prev;
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
    (
      newParts: FurniturePart[],
      newFasteners: Fastener[],
      groupName: string,
      config: ParametricCabinetConfig
    ) => {
      commitProject((prev) => ({
        ...prev,
        parts: [...prev.parts, ...newParts],
        fasteners: [...prev.fasteners, ...newFasteners],
        cabinetConfigs: {
          ...(prev.cabinetConfigs ?? {}),
          [groupName]: structuredClone(config),
        },
      }));
      const ids = newParts.map((p) => p.id);
      setSelectedPartIds(ids);
      setSelectedPartId(ids[0] ?? null);
      setSelectedFastenerId(null);
      setExplodedAmount(0);
      setShowFasteners(true);
      setTimeout(() => viewportRef.current?.focusAll(), 45);
      showToast(
        `Wstawiono moduł: ${groupName} (${newParts.length} płyt, ${newFasteners.length} łączników)`
      );
    },
    [commitProject, showToast]
  );

  const handleUpdateParametricCabinet = useCallback(
    (groupId: string, nextCfg: ParametricCabinetConfig) => {
      let nextSelectedIds: string[] = [];
      commitProject((prev) => {
        const rebuilt = rebuildParametricCabinetInPlace(
          prev.parts,
          prev.fasteners,
          groupId,
          nextCfg
        );
        nextSelectedIds = rebuilt.newPartIds;
        return {
          ...prev,
          parts: rebuilt.parts,
          fasteners: rebuilt.fasteners,
          cabinetConfigs: {
            ...(prev.cabinetConfigs ?? {}),
            [groupId]: structuredClone(nextCfg),
          },
        };
      });
      if (nextSelectedIds.length > 0) {
        setSelectedPartIds(nextSelectedIds);
        setSelectedPartId(nextSelectedIds[0]);
      }
      setEditingCabinetGroupId(null);
      showToast(`Zaktualizowano parametrycznie: ${nextCfg.name}`);
    },
    [commitProject, showToast]
  );

  const handleOpenParametricEditorForPart = useCallback(
    (partId?: string | null) => {
      const targetId = partId ?? selectedPartId;
      if (!targetId) return;
      const target = project.parts.find((p) => p.id === targetId);
      if (!target?.groupId || !project.cabinetConfigs?.[target.groupId]) return;
      setEditingCabinetGroupId(target.groupId);
      setCabinetBuilderOpen(true);
    },
    [project.parts, project.cabinetConfigs, selectedPartId]
  );

  const handleSetClearanceDistance = useCallback(
    (partId: string, guide: ClearanceGuide, targetDistanceMm: number) => {
      const target = project.parts.find((p) => p.id === partId);
      if (!target) return;
      const clampedTarget = Math.max(0, Math.min(5000, Math.round(targetDistanceMm)));
      let dx = 0;
      let dy = 0;
      let dz = 0;
      if (guide.direction === 'left') dx = clampedTarget - guide.distanceMm;
      else if (guide.direction === 'right') dx = guide.distanceMm - clampedTarget;
      else if (guide.direction === 'down') dy = clampedTarget - guide.distanceMm;
      else if (guide.direction === 'up') dy = guide.distanceMm - clampedTarget;
      else if (guide.direction === 'back') dz = clampedTarget - guide.distanceMm;

      if (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05 && Math.abs(dz) < 0.05) {
        showToast(`Prześwit już wynosi ${clampedTarget} mm`);
        return;
      }

      const nextPos: [number, number, number] = [
        Math.round((target.position[0] + dx) * 10) / 10,
        Math.max(5, Math.round((target.position[1] + dy) * 10) / 10),
        Math.round((target.position[2] + dz) * 10) / 10,
      ];

      if (guide.isSameGroup) {
        handleUpdatePart(partId, { position: nextPos });
      } else {
        handleTransformPart(partId, nextPos, target.rotation);
      }
      showToast(`Ustawiono prześwit: ${clampedTarget} mm (${guide.targetName})`);
    },
    [project.parts, handleUpdatePart, handleTransformPart, showToast]
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
        const existingCfg = prev.cabinetConfigs?.[groupId];
        return {
          ...prev,
          parts: resized.parts,
          fasteners: resized.fasteners,
          cabinetConfigs: existingCfg
            ? {
                ...(prev.cabinetConfigs ?? {}),
                [groupId]: {
                  ...existingCfg,
                  widthMm,
                  heightMm,
                  depthMm,
                },
              }
            : prev.cabinetConfigs,
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

  const handleDeleteParts = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const toRemove = new Set(ids);
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
        setNudgePadOpen(false);
      }
      showToast(
        toRemove.size > 1 ? `Usunięto ${toRemove.size} elementów` : 'Usunięto element'
      );
    },
    [commitProject, selectedPartId, showToast]
  );

  const handleDeletePart = useCallback(
    (id: string) => {
      const ids =
        selectedPartIds.length > 1 && selectedPartIds.includes(id)
          ? selectedPartIds
          : [id];
      handleDeleteParts(ids);
    },
    [selectedPartIds, handleDeleteParts]
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
      if (target.locked) {
        showToast('Element jest zablokowany — odblokuj, aby przesunąć');
        return;
      }
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
    [selectedPartId, project.parts, handleTransformPart, showToast]
  );

  // Group-aware 90-degree Y rotation around shared XZ center
  const handleRotate90Y = useCallback(
    (partId: string) => {
      const ids =
        selectedPartIds.length > 1 && selectedPartIds.includes(partId)
          ? selectedPartIds
          : [partId];
      const targets = project.parts.filter((p) => ids.includes(p.id) && !p.locked);
      if (targets.length === 0) {
        showToast('Element jest zablokowany — odblokuj, aby obrócić');
        return;
      }
      if (targets.length === 1) {
        const target = targets[0];
        const nextY = (target.rotation[1] + 90) % 360;
        handleUpdatePart(target.id, {
          rotation: [target.rotation[0], nextY, target.rotation[2]],
        });
        showToast('Obrócono element o 90°');
        return;
      }
      // Compute shared XZ center across all selected group members
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (const p of targets) {
        const b = getPartWorldBox(p);
        minX = Math.min(minX, b.minX);
        maxX = Math.max(maxX, b.maxX);
        minZ = Math.min(minZ, b.minZ);
        maxZ = Math.max(maxZ, b.maxZ);
      }
      const cx = (minX + maxX) / 2;
      const cz = (minZ + maxZ) / 2;
      const idSet = new Set(targets.map((p) => p.id));

      commitProject((prev) => {
        const nextParts = prev.parts.map((p) => {
          if (!idSet.has(p.id)) return p;
          const relX = p.position[0] - cx;
          const relZ = p.position[2] - cz;
          // Three.js +90° around Y: x' = z, z' = -x
          const nextX = Math.round((cx + relZ) * 10) / 10;
          const nextZ = Math.round((cz - relX) * 10) / 10;
          return {
            ...p,
            position: [nextX, p.position[1], nextZ] as [number, number, number],
            rotation: [p.rotation[0], (p.rotation[1] + 90) % 360, p.rotation[2]] as [
              number,
              number,
              number,
            ],
          };
        });
        const synced = syncFastenersWithParts(prev.parts, nextParts, prev.fasteners, idSet);
        return { ...prev, parts: nextParts, fasteners: synced.fasteners };
      });
      showToast(`Obrócono grupę (${targets.length} elem.) o 90°`);
    },
    [project.parts, selectedPartIds, handleUpdatePart, commitProject, showToast]
  );

  const handleDropToFloor = useCallback(
    (partId: string) => {
      const target = project.parts.find((p) => p.id === partId);
      if (!target || target.locked) return;
      const ids =
        selectedPartIds.length > 1 && selectedPartIds.includes(partId)
          ? selectedPartIds
          : [partId];
      const targets = project.parts.filter((p) => ids.includes(p.id));
      let minY = Infinity;
      for (const p of targets) {
        minY = Math.min(minY, getPartWorldBox(p).minY);
      }
      if (!Number.isFinite(minY)) return;
      const nextY = Math.round((target.position[1] - minY) * 10) / 10;
      handleTransformPart(
        partId,
        [target.position[0], nextY, target.position[2]],
        target.rotation
      );
      showToast(
        targets.length > 1
          ? 'Postawiono całą grupę na podłodze (Y = 0)'
          : 'Postawiono element na podłodze (Y = 0)'
      );
    },
    [project.parts, selectedPartIds, handleTransformPart, showToast]
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
      if (cloudUser && cloudProfileReadyRef.current) {
        const ts = Date.now();
        cloudSettingsStampRef.current = ts;
        setCloudSyncStatus('syncing');
        void saveCloudWorkspaceSettings(cloudUser.uid, next, quoteSettingsRef.current, ts)
          .then(() => {
            setCloudSyncStatus('synced');
            setLastCloudSyncedAt(Date.now());
          })
          .catch((err) => {
            setCloudSyncStatus('error');
            setCloudSyncError(formatCloudError(err));
          });
      }
      showToast('Zapisano katalog płyt i cennik z hurtowni');
    },
    [cloudUser, formatCloudError, showToast]
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
    roomModalOpen ||
    shortcutsOpen ||
    cloudModalOpen;

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
        if (cloudModalOpen) {
          setCloudModalOpen(false);
          return;
        }
        if (shortcutsOpen) {
          setShortcutsOpen(false);
          return;
        }
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
          setEditingCabinetGroupId(null);
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
        setActiveGroupEditId(null);
        setNudgePadOpen(false);
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
        case '?':
          setShortcutsOpen((s) => !s);
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
    cloudModalOpen,
    shortcutsOpen,
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

  const selectedParts = useMemo(() => {
    const idSet = new Set(selectedPartIds);
    return project.parts.filter((p) => idSet.has(p.id));
  }, [project.parts, selectedPartIds]);

  const selectedHasParametricConfig = Boolean(
    selectedPart?.groupId && project.cabinetConfigs?.[selectedPart.groupId]
  );

  const contextMenuCanEditParametric = useMemo(() => {
    if (!contextMenu || contextMenu.kind !== 'part') return false;
    const p = project.parts.find((x) => x.id === contextMenu.partId);
    return Boolean(p?.groupId && project.cabinetConfigs?.[p.groupId]);
  }, [contextMenu, project.parts, project.cabinetConfigs]);

  const editingCabinetProp = useMemo(() => {
    if (!editingCabinetGroupId) return null;
    const cfg = project.cabinetConfigs?.[editingCabinetGroupId];
    return cfg ? { groupId: editingCabinetGroupId, config: cfg } : null;
  }, [editingCabinetGroupId, project.cabinetConfigs]);

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

  const doorSwingCollisions = useMemo(
    () => analyzeDoorSwingCollisions(project.parts, project.room),
    [project.parts, project.room]
  );

  const countertopBridgeIssues = useMemo(
    () => analyzeCountertopCutouts(project.parts),
    [project.parts]
  );

  const countertopCount = useMemo(
    () => project.parts.filter((p) => p.kind === 'countertop').length,
    [project.parts]
  );

  const handleMergeCountertops = useCallback(() => {
    let mergedCount = 0;
    let needsMiterJoint = false;
    commitProject((prev) => {
      const res = mergeCountertopsForRow(prev.parts);
      mergedCount = res.mergedCount;
      needsMiterJoint = res.needsMiterJoint;
      if (mergedCount === 0) return prev;
      const syncedParts = syncApplianceCutoutsOnCountertops(res.parts).parts;
      return { ...prev, parts: syncedParts };
    });
    if (mergedCount > 0) {
      showToast(
        needsMiterJoint
          ? `Połączono ${mergedCount} blaty w ciąg (>3050 mm — wymagane śruby rzymskie)`
          : `Połączono ${mergedCount} sąsiednie blaty w 1 ciągły blat`
      );
    } else {
      showToast('Brak sąsiadujących blatów tej samej wysokości i głębokości do połączenia');
    }
  }, [commitProject, showToast]);

  const handleSyncApplianceCutouts = useCallback(() => {
    let syncedCount = 0;
    commitProject((prev) => {
      const res = syncApplianceCutoutsOnCountertops(prev.parts);
      syncedCount = res.cutoutsSynced;
      if (syncedCount === 0) return prev;
      return { ...prev, parts: res.parts };
    });
    if (syncedCount > 0) {
      showToast(`Zsynchronizowano ${syncedCount} otwór(ów) w blacie pod zlew / indukcję`);
    } else {
      showToast('Brak zlewu lub płyty indukcyjnej nad blatem do wycięcia');
    }
  }, [commitProject, showToast]);

  const selectedClearances = useMemo(
    () => (selectedPart ? computePartClearances(selectedPart, project.parts, project.room) : []),
    [selectedPart, project.parts, project.room]
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
      {/* Minimal 3-Zone Top Bar (Height 48px — stays slim & overflow-safe on mobile & desktop) */}
      <header className="fixed top-0 inset-x-0 z-30 flex h-12 max-w-full items-center justify-between gap-2 lg:gap-4 border-b border-zinc-800 bg-[#141518] px-2.5 sm:px-4 text-zinc-100 overflow-hidden">
        {/* Zone 1: Single-line Brand Wordmark (opens Start Launcher) */}
        <button
          type="button"
          onClick={() => setStartModalOpen(true)}
          className="text-sm sm:text-base font-bold tracking-tight text-white hover:text-amber-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          title="Ekran startowy — pomieszczenie, nowy mebel, szkic lub szablon"
        >
          Stolarz 3D
        </button>

        {/* Zone 2: Clean Single-Line Nav Actions (Desktop — flex-1 min-w-0 prevents right-side clipping on PC) */}
        <nav className="hidden md:flex flex-1 min-w-0 items-center justify-center gap-2.5 lg:gap-4 xl:gap-5 overflow-x-auto cad-scroll text-[11px] lg:text-xs font-medium text-zinc-300">
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
            Scena ({project.parts.length})
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
            Rozkrój
          </button>
        </nav>

        {/* Zone 3: Clean Primary Actions (spacious on mobile, complete on desktop) */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setCloudModalOpen(true)}
            className={`flex min-h-[34px] items-center gap-1.5 rounded-lg border px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              cloudSyncStatus === 'error'
                ? 'border-red-500/60 bg-red-500/15 text-red-300 hover:bg-red-500/25'
                : cloudUser
                  ? 'border-emerald-500/50 bg-emerald-500/12 text-emerald-300 hover:bg-emerald-500/20'
                  : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-sky-500/60 hover:text-sky-300'
            }`}
            title={
              cloudUser
                ? `Chmura Firebase: ${cloudUser.email || 'zalogowano'}`
                : 'Zaloguj się przez Google, aby zapisywać projekty i materiały w chmurze Firebase'
            }
          >
            {cloudSyncStatus === 'syncing' || cloudSyncStatus === 'connecting' ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin shrink-0" />
            ) : cloudUser ? (
              <Cloud className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <CloudOff className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
            )}
            <span className="hidden sm:inline">
              {cloudUser ? 'Chmura' : 'Zaloguj'}
            </span>
          </button>
          <PWAInstallButton
            needRefresh={pwa.needRefresh}
            checkStatus={pwa.checkStatus}
            onApplyUpdate={() => void pwa.applyUpdate()}
            onCheckForUpdate={() => void pwa.checkForUpdate()}
          />
          <button
            type="button"
            onClick={() => setRoomModalOpen(true)}
            className={`flex min-h-[34px] items-center gap-1 rounded-lg border px-2 sm:px-2.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              project.room?.enabled
                ? 'border-sky-500/70 bg-sky-500/20 text-sky-200 hover:bg-sky-500/30 font-semibold'
                : 'border-zinc-700 bg-zinc-900 text-zinc-200 hover:border-sky-500/50 hover:text-sky-300'
            }`}
            title="Konfigurator pomieszczenia 2D/3D: rysowanie ścian, drzwi, okien, sanitariatów i przeszkód"
          >
            <Home className="h-3.5 w-3.5 shrink-0" />
            <span className="xl:hidden">Rzut 2D</span>
            <span className="hidden xl:inline">Pomieszczenie 2D</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingCabinetGroupId(null);
              setCabinetBuilderOpen(true);
            }}
            className="hidden sm:flex min-h-[34px] items-center gap-1 rounded-lg border border-emerald-500/50 bg-emerald-500/12 px-2.5 text-xs font-medium text-emerald-300 hover:bg-emerald-500/20 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Kreator parametrycznej szafki, szuflad i frontów"
          >
            <LayoutPanelTop className="h-3.5 w-3.5 shrink-0" />
            <span>Szafka</span>
          </button>
          <button
            type="button"
            onClick={() => setAddPartOpen(true)}
            className="flex min-h-[34px] items-center gap-1 rounded-lg bg-amber-500 px-2.5 sm:px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>Dodaj</span>
          </button>
        </div>
      </header>

      {/* Quiet Unboxed Dimension Readout + Actionable Carpentry Warnings (offset right of Left CAD Rail on desktop) */}
      <div className="pointer-events-none fixed top-14 left-3.5 md:left-16 z-20 flex flex-col gap-0.5 text-zinc-700">
        <button
          type="button"
          onClick={() => setLeftDrawerMode((m) => (m === 'projects' ? null : 'projects'))}
          className="pointer-events-auto text-left text-xs font-semibold text-zinc-900 hover:text-amber-700 truncate max-w-[220px] sm:max-w-md cursor-pointer"
          title="Kliknij, aby zarządzać projektami lub zmienić nazwę"
        >
          {project.name}
        </button>
        {project.parts.length === 0 ? (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 font-mono-num">
            {project.room?.enabled ? (
              <>
                <span>
                  Pokój {project.room.widthMm} × {project.room.depthMm} × {project.room.heightMm} mm
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-sans">brak elementów</span>
              </>
            ) : (
              <span className="font-sans">Pusta scena · dodaj pokój, szafkę lub element</span>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-1.5 text-[11px] text-zinc-600 font-mono-num">
            <span>
              {overallDims.width} × {overallDims.height} × {overallDims.depth} mm
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-sans">{project.parts.length} elem.</span>
            {project.fasteners.length > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-sans">{project.fasteners.length} wkręt.</span>
              </>
            )}
          </div>
        )}

        {(collisionReport.pairs.length > 0 ||
          faultyFastenerCount > 0 ||
          criticalSagCount > 0 ||
          roomIssues.length > 0 ||
          doorSwingCollisions.length > 0 ||
          countertopBridgeIssues.length > 0) && (
          <button
            type="button"
            onClick={() =>
              roomIssues.length > 0 || doorSwingCollisions.length > 0
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
                doorSwingCollisions.length > 0 ? `${doorSwingCollisions.length} otwieranie frontu` : null,
                countertopBridgeIssues.length > 0 ? `${countertopBridgeIssues.length} mostek blatu` : null,
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

      {/* Mobile Always-Accessible Floating Quick Pill: Undo, Focus Camera, Multi-Select Toggle */}
      {!anyModalOpen && !startModalOpen && (
        <div className="md:hidden fixed top-14 right-2.5 z-20 flex flex-col gap-1 rounded-xl border border-zinc-800/90 bg-[#141518]/90 p-1 shadow-lg">
          <button
            type="button"
            onClick={handleUndo}
            disabled={historyPast.length === 0}
            aria-label="Cofnij ostatnią zmianę"
            title="Cofnij"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-200 active:bg-zinc-800 disabled:opacity-30"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => viewportRef.current?.focusAll()}
            aria-label="Dopasuj widok kamery do projektu"
            title="Dopasuj widok"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-200 active:bg-zinc-800"
          >
            <Focus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              setMultiSelectMode((prev) => {
                const next = !prev;
                showToast(
                  next
                    ? 'Tryb zaznaczania wielu płyt włączony — tapnij kolejne elementy'
                    : 'Wyłączono zaznaczanie wielu płyt'
                );
                return next;
              });
            }}
            aria-label="Zaznacz wiele elementów"
            title="Zaznacz wiele"
            className={`relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              multiSelectMode
                ? 'bg-amber-500 text-zinc-950'
                : 'text-zinc-200 active:bg-zinc-800'
            }`}
          >
            <CheckSquare className="h-4 w-4" />
            {selectedPartIds.length > 1 && (
              <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-sky-500 px-1 text-[9px] font-bold text-white font-mono-num">
                {selectedPartIds.length}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Quiet Empty-Scene Action CTA (guides next step after creating a room or blank project) */}
      {project.parts.length === 0 && !anyModalOpen && !startModalOpen && !leftDrawerMode && (
        <div className="fixed bottom-[66px] md:bottom-[124px] left-1/2 z-20 -translate-x-1/2 flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-zinc-800 bg-[#141518]/[0.94] px-2.5 py-2 shadow-xl max-w-[calc(100vw-20px)]">
          <button
            type="button"
            onClick={() => {
              setEditingCabinetGroupId(null);
              setCabinetBuilderOpen(true);
            }}
            className="flex min-h-[34px] items-center gap-1.5 rounded-xl bg-emerald-500/20 border border-emerald-500/50 px-3 text-xs font-semibold text-emerald-200 hover:bg-emerald-500/30 transition-colors whitespace-nowrap cursor-pointer"
          >
            <LayoutPanelTop className="h-3.5 w-3.5" />
            <span>+ Kreator szafki</span>
          </button>
          <button
            type="button"
            onClick={() => setAddPartOpen(true)}
            className="flex min-h-[34px] items-center gap-1.5 rounded-xl bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors whitespace-nowrap cursor-pointer"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>Płyty i urządzenia</span>
          </button>
          {!project.room?.enabled && (
            <button
              type="button"
              onClick={() => setRoomModalOpen(true)}
              className="flex min-h-[34px] items-center gap-1.5 rounded-xl bg-sky-500/15 border border-sky-500/45 px-3 text-xs font-semibold text-sky-200 hover:bg-sky-500/25 transition-colors whitespace-nowrap cursor-pointer"
            >
              <Home className="h-3.5 w-3.5" />
              <span>Rysuj pokój 2D</span>
            </button>
          )}
        </div>
      )}

      {/* Compact CAD View Compass (Desktop/Tablet) */}
      <ViewCube
        inspectorOpen={inspectorOpen && Boolean(selectedPart)}
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
          onDoubleClickPart={handleDoubleClickPart}
          onSetClearanceDistance={handleSetClearanceDistance}
        />
      </main>

      {/* Floating Thumb-Friendly Precision Nudge Pad (Mobile & Desktop) */}
      <PrecisionNudgePad
        open={nudgePadOpen && Boolean(selectedPart) && !anyModalOpen && !inspectorOpen}
        label={selectedPart?.name ?? ''}
        selectedCount={selectedPartIds.length}
        locked={Boolean(selectedPart?.locked)}
        onNudge={handleNudgeSelected}
        onRotate90={() => {
          if (selectedPartId) handleRotate90Y(selectedPartId);
        }}
        onDropToFloor={() => {
          if (selectedPartId) handleDropToFloor(selectedPartId);
        }}
        onToggleLock={() => {
          const ids = selectedPartIds.length > 0 ? selectedPartIds : selectedPartId ? [selectedPartId] : [];
          if (ids.length > 0) {
            handleTogglePartsLocked(ids, !Boolean(selectedPart?.locked));
          }
        }}
        onClose={() => setNudgePadOpen(false)}
      />

      {/* Right-Click Commercial CAD Context Menu */}
      <ContextMenu
        menu={contextMenu}
        selectedCount={selectedPartIds.length}
        selectedCanUngroup={selectedCanUngroup}
        canEditParametricCabinet={contextMenuCanEditParametric}
        onClose={() => setContextMenu(null)}
        onOpenInspector={(id) => {
          setSelectedPartId(id);
          setSelectedPartIds([id]);
          setInspectorOpen(true);
        }}
        onEditParametricCabinet={(id) => handleOpenParametricEditorForPart(id)}
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

      {/* Commercial CAD Left Tool Rail + Slim View Dock + 3-Tab Mobile Sheet */}
      <BottomDock
        collapsed={dockCollapsed}
        onToggleCollapse={() => setDockCollapsed((c) => !c)}
        uiMode={uiMode}
        onChangeUiMode={(mode) => {
          handleChangeUiMode(mode);
          showToast(
            mode === 'expert'
              ? 'Tryb Ekspert: odblokowano wkręty, miarkę 3D, RTG i obróbki CNC'
              : 'Tryb Prosty: uproszczony interfejs projektowania'
          );
        }}
        selectionScope={selectionScope}
        onToggleSelectionScope={() => {
          setSelectionScope((prev) => {
            const next = prev === 'group' ? 'part' : 'group';
            setActiveGroupEditId(null);
            showToast(
              next === 'group'
                ? 'Klik zaznacza całą szafkę / grupę (2× klik = pojedyncza płyta)'
                : 'Klik zaznacza zawsze pojedynczą płytę'
            );
            return next;
          });
        }}
        activeGroupEditLabel={
          activeGroupEditId
            ? project.cabinetConfigs?.[activeGroupEditId]?.name ||
              (activeGroupEditId.startsWith('cab_') ? 'Szafka' : activeGroupEditId)
            : null
        }
        onExitGroupEdit={() => {
          if (activeGroupEditId) {
            handleSelectGroup(activeGroupEditId);
          }
          setActiveGroupEditId(null);
        }}
        selectedInGroup={Boolean(selectedPart?.groupId)}
        onSelectWholeGroup={() => {
          if (selectedPart?.groupId) {
            handleSelectGroup(selectedPart.groupId);
          }
        }}
        onEnterSinglePartEdit={() => {
          if (selectedPart?.groupId) {
            setActiveGroupEditId(selectedPart.groupId);
            setSelectedPartIds([selectedPart.id]);
            showToast(`Edycja pojedynczej płyty: ${selectedPart.name}`);
          }
        }}
        nudgePadOpen={nudgePadOpen}
        onToggleNudgePad={() => setNudgePadOpen((v) => !v)}
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
        canEditParametricCabinet={selectedHasParametricConfig}
        selectedFastenerLabel={
          selectedFastener ? SCREW_MAP[selectedFastener.type].name : null
        }
        onAlignSelected={handleAlignSelected}
        onDistributeSelected={handleDistributeSelected}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
        onOpenInspector={() => setInspectorOpen(true)}
        onEditParametricCabinet={() => handleOpenParametricEditorForPart(selectedPartId)}
        onRotateSelected90={() => {
          if (selectedPartId) handleRotate90Y(selectedPartId);
        }}
        onDuplicateSelected={() => {
          if (selectedPartId) handleDuplicatePart(selectedPartId);
        }}
        onDropSelectedToFloor={() => {
          if (selectedPartId) handleDropToFloor(selectedPartId);
        }}
        onDeleteSelected={() => {
          if (selectedPartId) handleDeletePart(selectedPartId);
        }}
        onDeleteSelectedFastener={() => {
          if (selectedFastenerId) handleDeleteFastener(selectedFastenerId);
        }}
        onOpenProjects={() => setLeftDrawerMode('projects')}
        onOpenTemplates={() => setLeftDrawerMode('templates')}
        onOpenPartsList={() => setLeftDrawerMode('parts')}
        onOpenMaterials={() => setMaterialsModalOpen(true)}
        onOpenCabinetBuilder={() => {
          setEditingCabinetGroupId(null);
          setCabinetBuilderOpen(true);
        }}
        onOpenCutList={() => setCutListOpen(true)}
        onOpenSketch2D={() => {
          setSketchEditingPart(null);
          setSketchOpen(true);
        }}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onSnapshot={handleSnapshot}
      />

      {/* Contextual On-Demand Scene Outliner, Templates & Projects Drawer */}
      <PartsTemplatesDrawer
        mode={leftDrawerMode}
        projects={projectStore.projects}
        activeProjectId={projectStore.activeProjectId}
        parts={project.parts}
        cabinetConfigs={project.cabinetConfigs}
        selectedPartId={selectedPartId}
        selectedPartIds={selectedPartIds}
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
        templates={cloudTemplates}
        templatesLoading={cloudTemplatesLoading}
        isCloudSignedIn={Boolean(cloudUser)}
        canSaveCurrentAsTemplate={project.parts.length > 0}
        onOpenCloud={() => setCloudModalOpen(true)}
        onSaveCurrentAsTemplate={() => void handleSaveCurrentAsTemplate()}
        onDeleteTemplate={(id) => void handleDeleteCloudTemplate(id)}
        onRestoreStarterTemplates={() => void handleRestoreStarterTemplates()}
        onSelectPart={(id) => {
          const p = project.parts.find((x) => x.id === id);
          if (p?.groupId) {
            setActiveGroupEditId(p.groupId);
          }
          setSelectedPartId(id);
          setSelectedPartIds([id]);
          setSelectedFastenerId(null);
          setInspectorOpen(true);
          if (window.innerWidth < 640) {
            setLeftDrawerMode(null);
          }
        }}
        onSelectGroup={(groupId) => {
          handleSelectGroup(groupId);
          setInspectorOpen(true);
          if (window.innerWidth < 640) {
            setLeftDrawerMode(null);
          }
        }}
        onTogglePartsHidden={handleTogglePartsHidden}
        onTogglePartsLocked={handleTogglePartsLocked}
        onDeletePart={handleDeletePart}
        onDeleteParts={handleDeleteParts}
      />

      <InspectorDrawer
        open={inspectorOpen && Boolean(selectedPart)}
        uiMode={uiMode}
        part={selectedPart}
        selectedParts={selectedParts}
        allParts={project.parts}
        partFasteners={selectedPartFasteners}
        hasParametricConfig={selectedHasParametricConfig}
        materialsVersion={materialsVersion}
        customTextures={customTextures}
        isColliding={Boolean(selectedPart && collisionReport.collidingIds.has(selectedPart.id))}
        clearances={selectedClearances}
        fastenerAuditMap={fastenerAuditMap}
        shelfDeflection={selectedPart ? shelfDeflectionMap.get(selectedPart.id) : undefined}
        doorSwingCollision={
          selectedPart
            ? doorSwingCollisions.find((c) => c.doorId === selectedPart.id)
            : undefined
        }
        countertopBridgeIssues={
          selectedPart
            ? countertopBridgeIssues.filter((i) => i.partId === selectedPart.id)
            : []
        }
        countertopCount={countertopCount}
        groupBounds={selectedGroupBounds}
        onSmartResizeGroup={handleSmartResizeGroup}
        onClose={() => setInspectorOpen(false)}
        onUpdatePart={handleUpdatePart}
        onBatchUpdateParts={handleBatchUpdateParts}
        onSelectPartIds={(ids) => {
          setSelectedPartIds(ids);
          setSelectedPartId(ids[0] ?? null);
          setSelectedFastenerId(null);
        }}
        onSetClearanceDistance={handleSetClearanceDistance}
        onOpenParametricEditor={() => handleOpenParametricEditorForPart(selectedPartId)}
        onGroupSelected={handleGroupSelected}
        onUngroupSelected={handleUngroupSelected}
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
        onMergeCountertops={handleMergeCountertops}
        onSyncApplianceCutouts={handleSyncApplianceCutouts}
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
        onOpenCabinetBuilder={() => {
          setEditingCabinetGroupId(null);
          setCabinetBuilderOpen(true);
        }}
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
        existingParts={project.parts}
        selectedPartId={selectedPartId}
        room={project.room}
        editingCabinet={editingCabinetProp}
        onClose={() => {
          setCabinetBuilderOpen(false);
          setEditingCabinetGroupId(null);
        }}
        onInsertCabinet={handleInsertCabinet}
        onUpdateCabinet={handleUpdateParametricCabinet}
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
        onSaveRoom={(nextRoom, nextParts) => {
          const prevPartsCount = project.parts.length;
          commitProject((prev) => ({
            ...prev,
            room: nextRoom,
            parts: nextParts ?? prev.parts,
          }));
          if (nextParts && nextParts.length > 0 && prevPartsCount === 0) {
            setTimeout(() => viewportRef.current?.focusAll(), 50);
          }
          const appCount = (nextParts ?? project.parts).filter(
            (p) => p.kind === 'appliance'
          ).length;
          showToast(
            nextRoom.enabled
              ? appCount > 0
                ? `Zapisano pomieszczenie ${nextRoom.widthMm}×${nextRoom.depthMm} mm (${appCount} szt. wyposażenia 3D)`
                : `Zapisano pomieszczenie ${nextRoom.widthMm}×${nextRoom.depthMm} mm (wys. ${nextRoom.heightMm} mm)`
              : 'Wyłączono podgląd pomieszczenia 3D'
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
        doorSwingCollisions={doorSwingCollisions}
        countertopBridgeIssues={countertopBridgeIssues}
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

      <StartWorkspaceModal
        open={startModalOpen}
        projects={projectStore.projects}
        activeProjectId={projectStore.activeProjectId}
        templates={cloudTemplates}
        templatesLoading={cloudTemplatesLoading}
        isCloudSignedIn={Boolean(cloudUser)}
        skipOnStartup={skipStartModal}
        onToggleSkipOnStartup={handleToggleSkipStartModal}
        onClose={() => setStartModalOpen(false)}
        onOpenCloud={() => setCloudModalOpen(true)}
        onStartRoom={() => {
          ensureCleanProjectForStart('Projekt pomieszczenia');
          setStartModalOpen(false);
          setRoomModalOpen(true);
        }}
        onStartCabinet={() => {
          ensureCleanProjectForStart('Projekt mebla');
          setStartModalOpen(false);
          setEditingCabinetGroupId(null);
          setCabinetBuilderOpen(true);
        }}
        onStartSketch={() => {
          ensureCleanProjectForStart('Projekt ze szkicu');
          setStartModalOpen(false);
          setSketchEditingPart(null);
          setSketchOpen(true);
        }}
        onStartAddPart={() => {
          ensureCleanProjectForStart('Własny mebel');
          setStartModalOpen(false);
          setAddPartOpen(true);
        }}
        onStartBlank={() => {
          ensureCleanProjectForStart('Nowy projekt');
          setStartModalOpen(false);
        }}
        onSelectTemplate={(tpl) => {
          setStartModalOpen(false);
          if (project.parts.length > 0 || project.room?.enabled) {
            const tplCopy: FurnitureProject = {
              ...structuredClone(tpl.project),
              id: `proj_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              updatedAt: Date.now(),
            };
            setProjectStore((store) => ({
              activeProjectId: tplCopy.id,
              projects: [tplCopy, ...store.projects],
            }));
            setHistoryPast([]);
            setHistoryFuture([]);
            setSelectedPartId(null);
            setSelectedPartIds([]);
            setSelectedFastenerId(null);
            setContextMenu(null);
            setInspectorOpen(false);
            setExplodedAmount(0);
            setTimeout(() => viewportRef.current?.focusAll(), 40);
            showToast(`Wczytano szablon: ${tpl.project.name}`);
          } else {
            handleLoadTemplate(tpl.project);
          }
        }}
        onResumeProject={(id) => {
          setStartModalOpen(false);
          handleSwitchProject(id);
        }}
      />

      <ShortcutsHelpModal
        open={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      <CloudAccountModal
        open={cloudModalOpen}
        user={cloudUser}
        authReady={cloudAuthReady}
        syncStatus={cloudSyncStatus}
        syncError={cloudSyncError}
        cloudProjectsCount={cloudProjectsCount}
        cloudTemplatesCount={cloudTemplates.length}
        localProjectsCount={projectStore.projects.length}
        customMaterialsCount={materialsConfig.customMaterials.length}
        lastSyncedAt={lastCloudSyncedAt}
        onClose={() => setCloudModalOpen(false)}
        onSignInGoogle={handleCloudSignInGoogle}
        onSignOut={handleCloudSignOut}
        onForceUploadAll={handleCloudForceUploadAll}
      />

      <PWAStatusOverlays
        needRefresh={pwa.needRefresh}
        offlineReady={pwa.offlineReady}
        isUpdating={pwa.isUpdating}
        isOnline={pwa.isOnline}
        onApplyUpdate={() => void pwa.applyUpdate()}
        onDismissUpdate={pwa.dismissUpdate}
        onDismissOfflineReady={pwa.dismissOfflineReady}
      />
    </div>
  );
}
