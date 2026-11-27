import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  Check,
  ChevronDown,
  ChevronRight,
  Cloud,
  Copy,
  Eye,
  EyeOff,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  Lock,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Unlock,
  X,
} from 'lucide-react';
import {
  FurniturePart,
  FurnitureProject,
  getMaterialMeta,
  PART_KIND_LABELS,
  type ParametricCabinetConfig,
} from '../types/furniture';
import type { FurnitureTemplateMeta } from '../data/templates';

export type LeftDrawerMode = 'projects' | 'templates' | 'parts' | null;

interface PartsTemplatesDrawerProps {
  mode: LeftDrawerMode;
  projects: FurnitureProject[];
  activeProjectId: string;
  parts: FurniturePart[];
  cabinetConfigs?: Record<string, ParametricCabinetConfig>;
  selectedPartId: string | null;
  selectedPartIds: string[];
  fastenerCountsByPart: Record<string, number>;
  collidingPartIds: Set<string>;
  onClose: () => void;
  onSwitchMode: (mode: 'projects' | 'templates' | 'parts') => void;
  onSwitchProject: (id: string) => void;
  onCreateNewProject: () => void;
  onDuplicateProject: (id: string) => void;
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onLoadTemplate: (project: FurnitureProject) => void;
  templates: FurnitureTemplateMeta[];
  templatesLoading: boolean;
  templatesError?: string | null;
  isCloudSignedIn: boolean;
  canSaveCurrentAsTemplate: boolean;
  onOpenCloud: () => void;
  onRetryTemplates?: () => void;
  onSaveCurrentAsTemplate: () => void;
  onDeleteTemplate: (id: string) => void;
  onRestoreStarterTemplates: () => void;
  onSelectPart: (id: string) => void;
  onSelectGroup: (groupId: string) => void;
  onTogglePartsHidden: (ids: string[], hidden: boolean) => void;
  onTogglePartsLocked: (ids: string[], locked: boolean) => void;
  onDeletePart: (id: string) => void;
  onDeleteParts: (ids: string[]) => void;
}

type TemplateCatFilter = 'all' | FurnitureTemplateMeta['category'];

const TEMPLATE_CATEGORIES: Array<{ id: TemplateCatFilter; label: string }> = [
  { id: 'all', label: 'Wszystkie' },
  { id: 'Ogród i DIY', label: 'Ogród i DIY' },
  { id: 'Kuchenne', label: 'Kuchnia' },
  { id: 'Domowe', label: 'Dom i szafy' },
  { id: 'Magazynowe i OSB', label: 'OSB / Magazyn' },
  { id: 'Warsztat', label: 'Warsztat' },
];

export const PartsTemplatesDrawer: React.FC<PartsTemplatesDrawerProps> = ({
  mode,
  projects,
  activeProjectId,
  parts,
  cabinetConfigs,
  selectedPartId,
  selectedPartIds,
  fastenerCountsByPart,
  collidingPartIds,
  onClose,
  onSwitchMode,
  onSwitchProject,
  onCreateNewProject,
  onDuplicateProject,
  onRenameProject,
  onDeleteProject,
  onLoadTemplate,
  templates,
  templatesLoading,
  templatesError = null,
  isCloudSignedIn,
  canSaveCurrentAsTemplate,
  onOpenCloud,
  onRetryTemplates,
  onSaveCurrentAsTemplate,
  onDeleteTemplate,
  onRestoreStarterTemplates,
  onSelectPart,
  onSelectGroup,
  onTogglePartsHidden,
  onTogglePartsLocked,
  onDeletePart,
  onDeleteParts,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [partSearch, setPartSearch] = useState('');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const [templateCat, setTemplateCat] = useState<TemplateCatFilter>('all');

  const selectedSet = useMemo(() => new Set(selectedPartIds), [selectedPartIds]);

  const hiddenCount = useMemo(
    () => parts.filter((p) => p.hidden).length,
    [parts]
  );

  const filteredTemplates = useMemo(() => {
    if (templateCat === 'all') return templates;
    return templates.filter((t) => t.category === templateCat);
  }, [templateCat, templates]);

  // Build hierarchical scene tree: named groups + ungrouped root items
  const outlinerTree = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    const matchesQuery = (p: FurniturePart, groupLabel?: string) => {
      if (!q) return true;
      const mat = getMaterialMeta(p.materialId);
      const hay = `${p.name} ${mat.name} ${mat.shortName} ${PART_KIND_LABELS[p.kind]} ${groupLabel ?? ''}`.toLowerCase();
      return hay.includes(q);
    };

    const groupMap = new Map<string, { groupId: string; label: string; items: FurniturePart[] }>();
    const ungrouped: FurniturePart[] = [];

    for (const part of parts) {
      if (part.groupId) {
        const label =
          cabinetConfigs?.[part.groupId]?.name ||
          (part.groupId.startsWith('cab_') ? 'Szafka parametryczna' : part.groupId);
        if (!matchesQuery(part, label)) continue;
        const entry = groupMap.get(part.groupId) ?? {
          groupId: part.groupId,
          label,
          items: [],
        };
        entry.items.push(part);
        groupMap.set(part.groupId, entry);
      } else {
        if (!matchesQuery(part)) continue;
        ungrouped.push(part);
      }
    }

    return {
      groups: Array.from(groupMap.values()),
      ungrouped,
    };
  }, [parts, cabinetConfigs, partSearch]);

  if (!mode) return null;

  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenameProject(id, trimmed);
    }
    setRenamingId(null);
  };

  const toggleGroupExpand = (groupId: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const renderPartRow = (part: FurniturePart, indented = false) => {
    const selected = part.id === selectedPartId || selectedSet.has(part.id);
    const colliding = collidingPartIds.has(part.id);
    const mat = getMaterialMeta(part.materialId);
    const fCount = fastenerCountsByPart[part.id] ?? 0;

    return (
      <div
        key={part.id}
        className={`flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-2 transition-colors ${
          indented ? 'ml-3.5' : ''
        } ${
          part.hidden
            ? 'border-zinc-800/60 bg-zinc-950/60 opacity-55'
            : colliding
              ? 'border-red-500/70 bg-red-950/25'
              : selected
                ? 'border-amber-500 bg-amber-500/12'
                : 'border-zinc-800/90 bg-zinc-900/70 hover:border-zinc-700'
        }`}
      >
        <button
          type="button"
          onClick={() => onSelectPart(part.id)}
          className="flex-1 min-w-0 text-left cursor-pointer"
        >
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-zinc-100 truncate">
              {part.name}
            </span>
            {colliding && (
              <AlertTriangle
                className="h-3.5 w-3.5 text-red-400 shrink-0"
                aria-label="Kolizja płyt"
              />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-400 font-mono-num">
            <span>
              {part.width}×{part.height}×{part.depth}
            </span>
            <span aria-hidden="true">·</span>
            <span className="truncate font-sans">{mat.shortName}</span>
            {fCount > 0 && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-sans text-zinc-500">{fCount} wkr.</span>
              </>
            )}
          </div>
        </button>

        <div className="flex items-center gap-0.5 shrink-0">
          <button
            type="button"
            onClick={() => onTogglePartsHidden([part.id], !part.hidden)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
              part.hidden
                ? 'text-amber-400 bg-amber-500/15'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title={part.hidden ? 'Pokaż w 3D' : 'Ukryj w 3D'}
            aria-label={part.hidden ? `Pokaż ${part.name}` : `Ukryj ${part.name}`}
          >
            {part.hidden ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onTogglePartsLocked([part.id], !part.locked)}
            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
              part.locked
                ? 'text-sky-400 bg-sky-500/15'
                : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200'
            }`}
            title={part.locked ? 'Odblokuj ruch' : 'Zablokuj ruch'}
            aria-label={part.locked ? `Odblokuj ${part.name}` : `Zablokuj ${part.name}`}
          >
            {part.locked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
          </button>
          <button
            type="button"
            onClick={() => onDeletePart(part.id)}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
            aria-label={`Usuń ${part.name}`}
            title="Usuń element"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    );
  };

  return (
    <>
      <div
        className="sm:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="studio-sheet animate-studio-sheet fixed inset-x-0 bottom-0 sm:inset-x-auto sm:top-[62px] sm:left-[70px] sm:bottom-20 z-40 flex max-h-[82dvh] sm:max-h-[calc(100dvh-146px)] sm:w-[min(368px,calc(100vw-92px))] flex-col overflow-hidden rounded-t-3xl sm:rounded-2xl text-zinc-100">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-white/20" />
        </div>

        {/* Header with 3-Way Segmented Switch */}
        <div className="flex items-center justify-between gap-2 border-b border-white/[0.08] px-3.5 py-2.5">
          <div className="flex items-center gap-0.5 rounded-xl bg-white/[0.05] p-1 border border-white/[0.08] min-w-0">
            <button
              type="button"
              onClick={() => onSwitchMode('projects')}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'projects'
                  ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Projekty ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('templates')}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'templates'
                  ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Szablony
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('parts')}
              className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'parts'
                  ? 'bg-amber-500 text-zinc-950 font-semibold shadow-sm'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Scena ({parts.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Zamknij"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="cad-scroll flex-1 overflow-y-auto px-3.5 pt-3.5 pb-[max(1rem,env(safe-area-inset-bottom))] space-y-2.5">
          {mode === 'projects' ? (
            <>
              <button
                type="button"
                onClick={onCreateNewProject}
                className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/12 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <FolderPlus className="h-4 w-4" />
                <span>Nowy pusty projekt</span>
              </button>

              <p className="text-[11px] text-zinc-500 px-0.5">
                {isCloudSignedIn
                  ? 'Projekty synchronizują się automatycznie z bazą Firestore.'
                  : 'Zaloguj się w Chmurze, aby synchronizować projekty między PC i telefonem.'}
              </p>

              <div className="space-y-2">
                {projects.map((proj) => {
                  const isActive = proj.id === activeProjectId;
                  const isEditing = renamingId === proj.id;
                  return (
                    <div
                      key={proj.id}
                      className={`rounded-xl border p-3 transition-colors ${
                        isActive
                          ? 'border-amber-500 bg-amber-500/10'
                          : 'border-zinc-800/90 bg-zinc-900/70 hover:border-zinc-700'
                      }`}
                    >
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            autoFocus
                            value={renameDraft}
                            onChange={(e) => setRenameDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') commitRename(proj.id);
                              if (e.key === 'Escape') setRenamingId(null);
                            }}
                            className="flex-1 min-w-0 rounded-lg border border-amber-500 bg-zinc-950 px-2.5 py-1.5 text-xs text-white focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => commitRename(proj.id)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500 text-zinc-950 cursor-pointer shrink-0"
                            aria-label="Zapisz nazwę"
                          >
                            <Check className="h-4 w-4" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              onSwitchProject(proj.id);
                              if (window.innerWidth < 640) onClose();
                            }}
                            className="flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-zinc-100 truncate">
                                {proj.name}
                              </span>
                              {isActive && (
                                <span className="text-[10px] font-medium text-amber-400 shrink-0">
                                  · aktywny
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-400 font-mono-num">
                              {proj.parts.length} elem. · {proj.fasteners.length} wkrętów
                            </div>
                          </button>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingId(proj.id);
                                setRenameDraft(proj.name);
                              }}
                              title="Zmień nazwę projektu"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => onDuplicateProject(proj.id)}
                              title="Duplikuj projekt"
                              className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                            {projects.length > 1 && (
                              <button
                                type="button"
                                onClick={() => onDeleteProject(proj.id)}
                                title="Usuń projekt"
                                className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          ) : mode === 'templates' ? (
            !isCloudSignedIn ? (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/75 p-5 text-center space-y-3">
                <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl border border-sky-500/35 bg-sky-500/12 text-sky-300">
                  <Cloud className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-semibold text-white">
                    Szablony w bazie Firestore
                  </div>
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    Przykładowe projekty 3D i Twoje własne szablony są pobierane bezpośrednio z chmury Firebase. Zaloguj się przez Google, aby je wczytać.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenCloud();
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 transition-colors cursor-pointer"
                >
                  <Cloud className="h-4 w-4" />
                  <span>Zaloguj się przez Google</span>
                </button>
              </div>
            ) : templatesLoading ? (
              <div className="flex flex-col items-center justify-center gap-2.5 py-12 text-xs text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin text-amber-400" />
                <span>Pobieranie szablonów z Firestore...</span>
              </div>
            ) : templatesError ? (
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-4 text-center space-y-3">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl border border-amber-500/40 bg-amber-500/15 text-amber-300">
                  <AlertTriangle className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-semibold text-white">
                    Zaktualizuj reguły Firestore dla szablonów
                  </div>
                  <p className="text-[11px] text-zinc-300 leading-relaxed">
                    Otwórz panel Chmury, skopiuj zaktualizowane reguły (z sekcją <code>templates</code>), kliknij <strong>Publish</strong> w konsoli Firebase, a potem spróbuj ponownie.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCloud();
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer"
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    <span>Otwórz reguły (Chmura)</span>
                  </button>
                  {onRetryTemplates && (
                    <button
                      type="button"
                      onClick={onRetryTemplates}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-xs font-medium text-zinc-200 hover:border-amber-500/50 cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Spróbuj ponownie</span>
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                {canSaveCurrentAsTemplate && (
                  <button
                    type="button"
                    onClick={onSaveCurrentAsTemplate}
                    className="flex w-full min-h-[42px] items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/12 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
                  >
                    <BookmarkPlus className="h-4 w-4" />
                    <span>Zapisz obecny projekt jako szablon</span>
                  </button>
                )}

                {/* Category Filter Strip */}
                <div className="flex items-center gap-1 overflow-x-auto cad-scroll pb-1">
                  {TEMPLATE_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setTemplateCat(cat.id)}
                      className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        templateCat === cat.id
                          ? 'bg-amber-500 text-zinc-950 font-semibold'
                          : 'border border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                {templates.length === 0 ? (
                  <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-center space-y-3">
                    <p className="text-xs text-zinc-400">
                      Brak zapisanych szablonów w Twojej bazie Firestore.
                    </p>
                    <button
                      type="button"
                      onClick={onRestoreStarterTemplates}
                      className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-zinc-700 bg-zinc-900 px-3.5 text-xs font-medium text-zinc-100 hover:border-amber-500/60 hover:text-amber-300 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Załaduj szablony startowe do Firestore</span>
                    </button>
                  </div>
                ) : filteredTemplates.length === 0 ? (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    Brak szablonów w wybranej kategorii.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredTemplates.map((tpl) => (
                      <div
                        key={tpl.id}
                        className="group flex items-start gap-1.5 rounded-xl border border-zinc-800 bg-zinc-900/75 p-3 hover:border-amber-500/70 hover:bg-zinc-900 transition-colors"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onLoadTemplate(tpl.project);
                            onClose();
                          }}
                          className="flex-1 min-w-0 text-left cursor-pointer"
                        >
                          <div className="text-[11px] font-medium text-amber-400">
                            {tpl.category}
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-zinc-100 group-hover:text-white truncate">
                            {tpl.name}
                          </div>
                          <div className="mt-1 text-xs text-zinc-400 leading-relaxed">
                            {tpl.subtitle}
                          </div>
                          <div className="mt-2 text-[11px] text-zinc-500 font-mono-num">
                            {tpl.project.parts.length} elem. · {tpl.project.fasteners.length} wkrętów
                          </div>
                        </button>
                        <div className="flex flex-col items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onDeleteTemplate(tpl.id)}
                            title="Usuń szablon z Firestore"
                            aria-label={`Usuń szablon ${tpl.name}`}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/15 hover:text-red-400 transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                          <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-amber-400" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )
          ) : parts.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              Brak elementów na scenie. Kliknij „Dodaj” lub „Szafka”, aby rozpocząć projekt.
            </div>
          ) : (
            <>
              {/* Outliner Search + Hidden Elements Quick Restore */}
              <div className="flex items-center gap-1.5">
                <div className="relative flex-1 min-w-0">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" />
                  <input
                    type="text"
                    value={partSearch}
                    onChange={(e) => setPartSearch(e.target.value)}
                    placeholder="Szukaj w drzewie sceny..."
                    className="w-full min-h-[36px] rounded-xl border border-zinc-800 bg-zinc-900 pl-8 pr-7 text-xs text-zinc-100 placeholder:text-zinc-500 focus:border-amber-500 focus:outline-none"
                  />
                  {partSearch && (
                    <button
                      type="button"
                      onClick={() => setPartSearch('')}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:text-white cursor-pointer"
                      aria-label="Wyczyść filtr"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {hiddenCount > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      onTogglePartsHidden(
                        parts.filter((p) => p.hidden).map((p) => p.id),
                        false
                      )
                    }
                    className="flex min-h-[36px] items-center gap-1 rounded-xl border border-amber-500/40 bg-amber-500/12 px-2.5 text-[11px] font-medium text-amber-300 hover:bg-amber-500/20 whitespace-nowrap shrink-0 cursor-pointer"
                    title="Pokaż wszystkie ukryte elementy"
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span>Pokaż ({hiddenCount})</span>
                  </button>
                )}
              </div>

              {/* Grouped Folders (Cabinets, Assemblies, Roofs) */}
              <div className="space-y-2">
                {outlinerTree.groups.map((grp) => {
                  const groupIds = grp.items.map((p) => p.id);
                  const allHidden = grp.items.every((p) => p.hidden);
                  const allLocked = grp.items.every((p) => p.locked);
                  const anySelected = grp.items.some((p) => selectedSet.has(p.id));
                  const anyColliding = grp.items.some((p) => collidingPartIds.has(p.id));
                  const isCollapsed = Boolean(collapsedGroups[grp.groupId]);

                  return (
                    <div key={grp.groupId} className="space-y-1.5">
                      <div
                        className={`flex items-center justify-between gap-1.5 rounded-xl border px-2.5 py-2 transition-colors ${
                          allHidden
                            ? 'border-zinc-800/60 bg-zinc-950/60 opacity-60'
                            : anySelected
                              ? 'border-amber-500/80 bg-amber-500/12'
                              : 'border-zinc-800 bg-zinc-900/90 hover:border-zinc-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleGroupExpand(grp.groupId)}
                          className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white shrink-0 cursor-pointer"
                          aria-label={isCollapsed ? 'Rozwiń grupę' : 'Zwiń grupę'}
                        >
                          {isCollapsed ? (
                            <ChevronRight className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectGroup(grp.groupId)}
                          className="flex-1 min-w-0 flex items-center gap-2 text-left cursor-pointer"
                        >
                          {isCollapsed ? (
                            <Folder className="h-4 w-4 text-amber-400 shrink-0" />
                          ) : (
                            <FolderOpen className="h-4 w-4 text-amber-400 shrink-0" />
                          )}
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-white truncate">
                                {grp.label}
                              </span>
                              {anyColliding && (
                                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                              )}
                            </div>
                            <div className="text-[10px] text-zinc-400 font-mono-num">
                              {grp.items.length} elem.
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => onTogglePartsHidden(groupIds, !allHidden)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                              allHidden
                                ? 'text-amber-400 bg-amber-500/15'
                                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                            }`}
                            title={allHidden ? 'Pokaż całą grupę' : 'Ukryj całą grupę'}
                          >
                            {allHidden ? (
                              <EyeOff className="h-3.5 w-3.5" />
                            ) : (
                              <Eye className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onTogglePartsLocked(groupIds, !allLocked)}
                            className={`flex h-8 w-8 items-center justify-center rounded-lg transition-colors cursor-pointer ${
                              allLocked
                                ? 'text-sky-400 bg-sky-500/15'
                                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
                            }`}
                            title={allLocked ? 'Odblokuj grupę' : 'Zablokuj grupę'}
                          >
                            {allLocked ? (
                              <Lock className="h-3.5 w-3.5" />
                            ) : (
                              <Unlock className="h-3.5 w-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => onDeleteParts(groupIds)}
                            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/15 hover:text-red-400 cursor-pointer"
                            title="Usuń całą grupę"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {!isCollapsed && (
                        <div className="space-y-1.5">
                          {grp.items.map((p) => renderPartRow(p, true))}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Ungrouped Root Items */}
                {outlinerTree.ungrouped.map((part) => renderPartRow(part, false))}

                {outlinerTree.groups.length === 0 && outlinerTree.ungrouped.length === 0 && (
                  <div className="py-8 text-center text-xs text-zinc-500">
                    Brak elementów pasujących do „{partSearch}”.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
};
