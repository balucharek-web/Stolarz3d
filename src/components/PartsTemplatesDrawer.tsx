import React, { useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronRight,
  Copy,
  FolderPlus,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import {
  FurniturePart,
  FurnitureProject,
  getMaterialMeta,
  PART_KIND_LABELS,
} from '../types/furniture';
import { FURNITURE_TEMPLATES } from '../data/templates';

export type LeftDrawerMode = 'projects' | 'templates' | 'parts' | null;

interface PartsTemplatesDrawerProps {
  mode: LeftDrawerMode;
  projects: FurnitureProject[];
  activeProjectId: string;
  parts: FurniturePart[];
  selectedPartId: string | null;
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
  onSelectPart: (id: string) => void;
  onDeletePart: (id: string) => void;
}

export const PartsTemplatesDrawer: React.FC<PartsTemplatesDrawerProps> = ({
  mode,
  projects,
  activeProjectId,
  parts,
  selectedPartId,
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
  onSelectPart,
  onDeletePart,
}) => {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');

  if (!mode) return null;

  const commitRename = (id: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) {
      onRenameProject(id, trimmed);
    }
    setRenamingId(null);
  };

  return (
    <>
      <div
        className="sm:hidden fixed inset-0 z-30 bg-black/40"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className="fixed inset-x-0 bottom-0 sm:inset-x-auto sm:top-14 sm:left-3 sm:bottom-36 lg:bottom-32 z-40 flex max-h-[78dvh] sm:max-h-[calc(100dvh-160px)] sm:w-[min(356px,calc(100vw-24px))] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl">
        <div className="sm:hidden flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-zinc-700" />
        </div>

        {/* Header with 3-Way Segmented Switch */}
        <div className="flex items-center justify-between gap-2 border-b border-zinc-800 px-3 py-2.5">
          <div className="flex items-center gap-0.5 rounded-lg bg-zinc-900 p-1 border border-zinc-800 min-w-0">
            <button
              type="button"
              onClick={() => onSwitchMode('projects')}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'projects'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Projekty ({projects.length})
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('templates')}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'templates'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Szablony
            </button>
            <button
              type="button"
              onClick={() => onSwitchMode('parts')}
              className={`rounded-md px-2.5 py-1.5 text-[11px] font-medium transition-colors whitespace-nowrap cursor-pointer ${
                mode === 'parts'
                  ? 'bg-amber-500 text-zinc-950 font-semibold'
                  : 'text-zinc-400 hover:text-white'
              }`}
            >
              Płyty ({parts.length})
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
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
                className="flex w-full min-h-[40px] items-center justify-center gap-2 rounded-xl border border-amber-500/50 bg-amber-500/12 px-3 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors cursor-pointer"
              >
                <FolderPlus className="h-4 w-4" />
                <span>Nowy pusty projekt</span>
              </button>

              <p className="text-[11px] text-zinc-500 px-0.5">
                Wszystkie projekty zapisują się automatycznie w pamięci Twojej przeglądarki.
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
                          : 'border-zinc-800 bg-zinc-900/75 hover:border-zinc-700'
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
                            <Check className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-2">
                          <button
                            type="button"
                            onClick={() => onSwitchProject(proj.id)}
                            className="flex-1 min-w-0 text-left cursor-pointer"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-zinc-100 truncate">
                                {proj.name}
                              </span>
                              {isActive && (
                                <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold text-amber-300 shrink-0">
                                  Aktywny
                                </span>
                              )}
                            </div>
                            <div className="mt-1 text-[11px] text-zinc-400 font-mono-num">
                              {proj.parts.length} płyt · {proj.fasteners.length} wkrętów
                            </div>
                          </button>

                          <div className="flex items-center gap-0.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingId(proj.id);
                                setRenameDraft(proj.name);
                              }}
                              title="Zmień nazwę"
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
            <>
              <p className="text-xs text-zinc-400 px-0.5">
                Wczytaj gotowy punkt startowy, a następnie dowolnie przesuwaj płyty, zmieniaj tekstury, dodawaj skosy i wkręty.
              </p>
              {FURNITURE_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.id}
                  type="button"
                  onClick={() => {
                    onLoadTemplate(tpl.project);
                    onClose();
                  }}
                  className="group w-full rounded-xl border border-zinc-800 bg-zinc-900/75 p-3.5 text-left hover:border-amber-500/70 hover:bg-zinc-900 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium text-amber-400">
                        {tpl.category}
                      </div>
                      <div className="mt-0.5 text-sm font-semibold text-zinc-100 group-hover:text-white">
                        {tpl.name}
                      </div>
                      <div className="mt-1 text-xs text-zinc-400 leading-relaxed">
                        {tpl.subtitle}
                      </div>
                      <div className="mt-2 text-[11px] text-zinc-500 font-mono-num">
                        {tpl.project.parts.length} płyt · {tpl.project.fasteners.length} wkrętów
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-zinc-600 group-hover:text-amber-400 mt-1 shrink-0" />
                  </div>
                </button>
              ))}
            </>
          ) : parts.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              Brak elementów w projekcie. Kliknij „Dodaj płytę” lub „Szkic 2D”, aby rozpocząć budowę mebla.
            </div>
          ) : (
            parts.map((part) => {
              const selected = part.id === selectedPartId;
              const colliding = collidingPartIds.has(part.id);
              const mat = getMaterialMeta(part.materialId);
              const fCount = fastenerCountsByPart[part.id] ?? 0;
              return (
                <div
                  key={part.id}
                  className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
                    colliding
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
                      <span className="text-xs font-semibold text-zinc-100 truncate">
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
                        {part.width}×{part.height}×{part.depth} mm
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="truncate font-sans">{mat.shortName}</span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-zinc-500">
                      <span>{PART_KIND_LABELS[part.kind]}</span>
                      {fCount > 0 && <span>· {fCount} wkręt.</span>}
                      {part.groupId && (
                        <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-zinc-300 truncate max-w-[110px]">
                          {part.groupId}
                        </span>
                      )}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => onDeletePart(part.id)}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 hover:bg-red-500/15 hover:text-red-400 cursor-pointer shrink-0"
                    aria-label={`Usuń ${part.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </aside>
    </>
  );
};
