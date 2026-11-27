import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Box,
  ChevronRight,
  Cloud,
  FolderOpen,
  Home,
  Layers,
  LayoutPanelTop,
  Loader2,
  PenTool,
  Plus,
  X,
} from 'lucide-react';
import type { FurnitureProject } from '../types/furniture';
import type { FurnitureTemplateMeta } from '../data/templates';

interface StartWorkspaceModalProps {
  open: boolean;
  projects: FurnitureProject[];
  activeProjectId: string;
  templates: FurnitureTemplateMeta[];
  templatesLoading: boolean;
  templatesError?: string | null;
  isCloudSignedIn: boolean;
  skipOnStartup: boolean;
  onToggleSkipOnStartup: (skip: boolean) => void;
  onClose: () => void;
  onOpenCloud: () => void;
  onStartRoom: () => void;
  onStartCabinet: () => void;
  onStartSketch: () => void;
  onStartAddPart: () => void;
  onStartBlank: () => void;
  onSelectTemplate: (template: FurnitureTemplateMeta) => void;
  onResumeProject: (projectId: string) => void;
}

export const StartWorkspaceModal: React.FC<StartWorkspaceModalProps> = ({
  open,
  projects,
  activeProjectId,
  templates,
  templatesLoading,
  templatesError = null,
  isCloudSignedIn,
  skipOnStartup,
  onToggleSkipOnStartup,
  onClose,
  onOpenCloud,
  onStartRoom,
  onStartCabinet,
  onStartSketch,
  onStartAddPart,
  onStartBlank,
  onSelectTemplate,
  onResumeProject,
}) => {
  const [showTemplates, setShowTemplates] = useState(false);

  const nonEmptyProjects = useMemo(() => {
    return projects
      .filter((p) => p.parts.length > 0 || p.room?.enabled)
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
  }, [projects]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-[4px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="studio-sheet animate-studio-pop w-full max-w-3xl max-h-[92dvh] rounded-3xl text-zinc-100 flex flex-col overflow-hidden">
        {/* Clean Architectural Header */}
        <div className="flex items-start justify-between gap-4 border-b border-white/[0.08] px-5 sm:px-7 py-5 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium text-amber-400 mb-1.5">
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                aria-hidden="true"
                className="shrink-0"
              >
                <path
                  d="M3 4.5L10 2L17 4.5V15.5L10 18L3 15.5V4.5Z"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinejoin="round"
                />
                <path
                  d="M10 2V18M3 4.5L10 7.5L17 4.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinejoin="round"
                />
              </svg>
              <span>Stolarz 3D Studio</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-white [text-wrap:balance]">
              Od czego chcesz zacząć projekt?
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400 max-w-xl">
              Rozrysuj pomieszczenie w 2D, skonfiguruj parametryczną szafkę albo otwórz jeden z zapisanych projektów.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Zamknij ekran startowy"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="cad-scroll flex-1 overflow-y-auto px-5 sm:px-7 py-5 space-y-6">
          {/* Focal Primary Anchor + Clean Hairline Secondary Paths */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-3.5">
            {/* Primary Focal Hero Action (5 cols on desktop) */}
            <button
              type="button"
              onClick={onStartRoom}
              className="md:col-span-5 group flex flex-col justify-between rounded-2xl border border-amber-400/35 bg-gradient-to-br from-amber-500/18 via-amber-500/8 to-transparent p-5 text-left hover:border-amber-400/70 hover:from-amber-500/24 transition-all cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 text-zinc-950 shadow-[0_6px_20px_rgba(245,158,11,0.35)] shrink-0">
                  <Home className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-amber-400 transition-transform group-hover:translate-x-1" />
              </div>
              <div className="mt-5">
                <div className="text-base font-semibold text-white tracking-tight">
                  Rysuj pomieszczenie 2D / 3D
                </div>
                <p className="mt-1.5 text-xs text-zinc-300 leading-relaxed">
                  Narysuj ściany, drzwi, okna, grzejniki, skosy i sanitariaty, a potem precyzyjnie wstaw meble.
                </p>
              </div>
            </button>

            {/* Secondary Creation Paths (7 cols — clean hairline list, no competing card boxes) */}
            <div className="md:col-span-7 flex flex-col divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-white/[0.025] overflow-hidden">
              <button
                type="button"
                onClick={onStartCabinet}
                className="group flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.07] text-amber-400 shrink-0 group-hover:bg-amber-500/15 transition-colors">
                  <LayoutPanelTop className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">
                    Zaprojektuj mebel / szafkę
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400 leading-snug">
                    Kreator szafek kuchennych, szaf przesuwnych, komód, regałów i słupków z szufladami.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              <button
                type="button"
                onClick={onStartSketch}
                className="group flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-200 shrink-0 group-hover:text-amber-300 transition-colors">
                  <PenTool className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">
                    Szkic 2D (skosy i wycięcia CNC)
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400 leading-snug">
                    Narysuj płytę ze skosem poddasza, łukiem lub własnym konturem.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>

              <button
                type="button"
                onClick={onStartAddPart}
                className="group flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-200 shrink-0 group-hover:text-amber-300 transition-colors">
                  <Plus className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white">
                    Buduj z pojedynczych płyt, profili i AGD
                  </div>
                  <p className="mt-0.5 text-xs text-zinc-400 leading-snug">
                    Formatki laminatu, OSB, sklejki, kantówki i katalog urządzeń 3D.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-zinc-500 group-hover:text-zinc-200 group-hover:translate-x-0.5 transition-all shrink-0" />
              </button>
            </div>
          </div>

          {/* Secondary Utility Row: Blank Scene & Firestore Templates */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onStartBlank}
              className="flex min-h-[38px] items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 text-xs font-medium text-zinc-200 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            >
              <Box className="h-3.5 w-3.5 text-zinc-400" />
              <span>Pusta scena 3D</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className={`flex min-h-[38px] items-center gap-2 rounded-xl border px-3.5 text-xs font-medium transition-colors cursor-pointer ${
                showTemplates
                  ? 'border-amber-400/45 bg-amber-500/15 text-amber-200'
                  : 'border-white/[0.08] bg-white/[0.04] text-zinc-200 hover:bg-white/[0.08] hover:text-white'
              }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>
                {isCloudSignedIn
                  ? `Szablony z Firestore (${templates.length})`
                  : 'Szablony z Firestore'}
              </span>
            </button>
          </div>

          {/* Expandable Firestore Cloud Templates Grid */}
          {showTemplates && (
            <div className="space-y-3 border-t border-white/[0.08] pt-4">
              <h2 className="text-xs font-semibold text-zinc-300">
                Gotowe projekty startowe z bazy Firestore
              </h2>
              {!isCloudSignedIn ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-4">
                  <p className="text-xs text-zinc-400">
                    Przykładowe szablony 3D są pobierane z Twojej bazy Firestore. Zaloguj się przez Google, aby je wczytać.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCloud();
                    }}
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    <span>Zaloguj przez Google</span>
                  </button>
                </div>
              ) : templatesLoading ? (
                <div className="flex items-center gap-2 py-4 text-xs text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
                  <span>Ładowanie szablonów z Firestore...</span>
                </div>
              ) : templatesError ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4">
                  <p className="text-xs text-zinc-300">
                    Zaktualizuj reguły Firestore (dodaj sekcję <code>templates</code>) w konsoli Firebase, aby wczytać szablony.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCloud();
                    }}
                    className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-3.5 text-xs font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Cloud className="h-3.5 w-3.5" />
                    <span>Pokaż reguły</span>
                  </button>
                </div>
              ) : templates.length === 0 ? (
                <div className="py-3 text-xs text-zinc-500">
                  Brak zapisanych szablonów w Firestore. Możesz je dodać w panelu „Szablony”.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {templates.map((tpl) => (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => onSelectTemplate(tpl)}
                      className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-white/[0.03] px-3.5 py-2.5 text-left hover:border-amber-400/45 hover:bg-white/[0.06] transition-colors cursor-pointer"
                    >
                      <div className="text-xs font-semibold text-zinc-100">
                        {tpl.name}
                      </div>
                      <div className="mt-0.5 text-[11px] text-zinc-400 truncate">
                        {tpl.subtitle}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Recent Saved Projects (unboxed hairline rows) */}
          {nonEmptyProjects.length > 0 && (
            <div className="space-y-2 border-t border-white/[0.08] pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-300">
                  Kontynuuj zapisany projekt
                </h2>
                <span className="text-[11px] text-zinc-500 font-mono-num">
                  {nonEmptyProjects.length}{' '}
                  {nonEmptyProjects.length === 1 ? 'projekt' : 'projektów'}
                </span>
              </div>
              <div className="divide-y divide-white/[0.06]">
                {nonEmptyProjects.slice(0, 4).map((proj) => {
                  const isCurrent = proj.id === activeProjectId;
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => onResumeProject(proj.id)}
                      className="group flex w-full items-center justify-between gap-3 py-2.5 px-2 -mx-2 rounded-xl text-left hover:bg-white/[0.05] transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FolderOpen className="h-4 w-4 text-zinc-400 group-hover:text-amber-400 transition-colors shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-100 truncate">
                            {proj.name}
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono-num">
                            {proj.parts.length} elem.
                            {proj.room?.enabled
                              ? ` · pomieszczenie ${proj.room.widthMm}×${proj.room.depthMm} mm`
                              : ''}
                            {isCurrent ? ' · ostatnio otwarty' : ''}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-amber-400 group-hover:text-amber-300 whitespace-nowrap shrink-0">
                        Otwórz
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 border-t border-white/[0.08] bg-black/25 px-5 sm:px-7 py-3.5 shrink-0">
          <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={skipOnStartup}
              onChange={(e) => onToggleSkipOnStartup(e.target.checked)}
              className="h-4 w-4 accent-amber-500"
            />
            <span>Nie pokazuj przy uruchamianiu</span>
          </label>
          <button
            type="button"
            onClick={onClose}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer whitespace-nowrap"
          >
            Przejdź do obszaru roboczego
          </button>
        </div>
      </div>
    </div>
  );
};
