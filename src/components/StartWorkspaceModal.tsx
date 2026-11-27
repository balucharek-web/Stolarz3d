import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Box,
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-3 sm:p-5 backdrop-blur-[2px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-3xl max-h-[92dvh] rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-zinc-800 px-5 sm:px-6 py-4 shrink-0">
          <div className="min-w-0">
            <h1 className="text-lg sm:text-xl font-semibold tracking-tight text-white">
              Od czego chcesz zacząć?
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-zinc-400">
              Narysuj najpierw pomieszczenie, wygeneruj szafkę parametryczną, zbuduj mebel z płyt albo wybierz gotowy szablon.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Zamknij ekran startowy"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="cad-scroll flex-1 overflow-y-auto px-5 sm:px-6 py-5 space-y-6">
          {/* Primary Start Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Primary Anchor: Draw Room 2D/3D */}
            <button
              type="button"
              onClick={onStartRoom}
              className="group flex flex-col justify-between rounded-xl border border-amber-500/50 bg-amber-500/10 p-4 text-left hover:border-amber-400 hover:bg-amber-500/15 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-zinc-950 shrink-0">
                  <Home className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-amber-400 transition-transform group-hover:translate-x-0.5" />
              </div>
              <div className="mt-3.5">
                <div className="text-sm font-semibold text-white">
                  Rysuj pomieszczenie 2D / 3D
                </div>
                <p className="mt-1 text-xs text-zinc-300 leading-relaxed">
                  Narysuj ściany, wstaw drzwi, okna, grzejniki, gniazdka i WC (Geberit / kompakt), a potem ustaw mebel.
                </p>
              </div>
            </button>

            {/* Parametric Furniture / Cabinet Builder */}
            <button
              type="button"
              onClick={onStartCabinet}
              className="group flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-left hover:border-emerald-500/60 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 shrink-0">
                  <LayoutPanelTop className="h-5 w-5" />
                </div>
                <ArrowRight className="h-4 w-4 text-zinc-500 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-300" />
              </div>
              <div className="mt-3.5">
                <div className="text-sm font-semibold text-white">
                  Zaprojektuj mebel / szafkę
                </div>
                <p className="mt-1 text-xs text-zinc-400 leading-relaxed">
                  Kreator szafek kuchennych, szaf przesuwnych, komód, regałów i słupków z szufladami oraz okuciami.
                </p>
              </div>
            </button>

            {/* 2D Shape Sketcher */}
            <button
              type="button"
              onClick={onStartSketch}
              className="group flex items-start gap-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-left hover:border-zinc-700 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-amber-300 shrink-0">
                <PenTool className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-semibold text-white">
                  Szkic 2D (skosy i wycięcia)
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Narysuj płytę ze skosem poddasza, łukiem lub wycięciem CNC.
                </p>
              </div>
            </button>

            {/* Build From Individual Boards / Profiles */}
            <button
              type="button"
              onClick={onStartAddPart}
              className="group flex items-start gap-3.5 rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 text-left hover:border-zinc-700 hover:bg-zinc-900 transition-colors cursor-pointer"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-zinc-800 text-sky-300 shrink-0">
                <Plus className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs sm:text-sm font-semibold text-white">
                  Buduj z pojedynczych płyt i profili
                </div>
                <p className="mt-0.5 text-xs text-zinc-400">
                  Dodawaj formatki OSB, laminatu, sklejki i profile stalowe krok po kroku.
                </p>
              </div>
            </button>
          </div>

          {/* Secondary Row: Blank 3D Scene & Ready Templates Toggle */}
          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={onStartBlank}
              className="flex min-h-[38px] items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3.5 text-xs font-medium text-zinc-200 hover:border-zinc-700 hover:text-white transition-colors cursor-pointer"
            >
              <Box className="h-3.5 w-3.5 text-zinc-400" />
              <span>Pusta scena 3D</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              className={`flex min-h-[38px] items-center gap-2 rounded-lg border px-3.5 text-xs font-medium transition-colors cursor-pointer ${
                showTemplates
                  ? 'border-amber-500/50 bg-amber-500/10 text-amber-300'
                  : 'border-zinc-800 bg-zinc-900 text-zinc-200 hover:border-zinc-700 hover:text-white'
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
            <div className="space-y-2.5 border-t border-zinc-800 pt-4">
              <h2 className="text-xs font-semibold text-zinc-300">
                Gotowe projekty startowe z bazy Firestore
              </h2>
              {!isCloudSignedIn ? (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/70 p-3.5">
                  <p className="text-xs text-zinc-400">
                    Przykładowe szablony 3D są pobierane z Twojej bazy Firestore. Zaloguj się przez Google, aby je wczytać.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenCloud();
                    }}
                    className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 text-xs font-semibold text-zinc-950 hover:bg-amber-400 whitespace-nowrap shrink-0 cursor-pointer"
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
                      className="flex flex-col justify-between rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-2.5 text-left hover:border-amber-500/50 hover:bg-zinc-900 transition-colors cursor-pointer"
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

          {/* Recent Saved Projects (only when user has existing projects with content) */}
          {nonEmptyProjects.length > 0 && (
            <div className="space-y-2.5 border-t border-zinc-800 pt-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold text-zinc-300">
                  Kontynuuj zapisany projekt
                </h2>
                <span className="text-[11px] text-zinc-500 tabular-nums">
                  {nonEmptyProjects.length}{' '}
                  {nonEmptyProjects.length === 1 ? 'projekt' : 'projektów'}
                </span>
              </div>
              <div className="space-y-1.5">
                {nonEmptyProjects.slice(0, 4).map((proj) => {
                  const isCurrent = proj.id === activeProjectId;
                  return (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => onResumeProject(proj.id)}
                      className="flex w-full items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/50 px-3.5 py-2.5 text-left hover:border-zinc-700 hover:bg-zinc-900 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <FolderOpen className="h-4 w-4 text-zinc-400 shrink-0" />
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-100 truncate">
                            {proj.name}
                          </div>
                          <div className="text-[11px] text-zinc-500 tabular-nums">
                            {proj.parts.length} elem.
                            {proj.room?.enabled
                              ? ` · pomieszczenie ${proj.room.widthMm}×${proj.room.depthMm} mm`
                              : ''}
                            {isCurrent ? ' · ostatnio otwarty' : ''}
                          </div>
                        </div>
                      </div>
                      <span className="text-xs font-medium text-amber-400 whitespace-nowrap shrink-0">
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
        <div className="flex items-center justify-between gap-3 border-t border-zinc-800 bg-[#121317] px-5 sm:px-6 py-3 shrink-0">
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
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer whitespace-nowrap"
          >
            Przejdź do obszaru roboczego
          </button>
        </div>
      </div>
    </div>
  );
};
