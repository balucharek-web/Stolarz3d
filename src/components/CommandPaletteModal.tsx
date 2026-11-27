import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Box,
  Camera,
  Cloud,
  CornerDownLeft,
  DoorOpen,
  Focus,
  FolderOpen,
  FolderPlus,
  HelpCircle,
  Home,
  Layers,
  LayoutPanelTop,
  Lightbulb,
  ListOrdered,
  Magnet,
  Maximize2,
  MousePointer2,
  Move,
  Palette,
  PenTool,
  Plus,
  RotateCw,
  Ruler,
  Scissors,
  Search,
  Sparkles,
  Wrench,
  X,
} from 'lucide-react';
import type {
  CameraPreset,
  EditorTool,
  FurniturePart,
  FurnitureProject,
} from '../types/furniture';
import type { UiMode } from './BottomDock';

export interface CommandPaletteModalProps {
  open: boolean;
  onClose: () => void;
  projects: FurnitureProject[];
  activeProjectId: string;
  parts: FurniturePart[];
  uiMode: UiMode;
  xrayMode: boolean;
  ledUnderCabinet: boolean;
  showDimensions: boolean;
  magneticSnap: boolean;
  openAmount: number;
  assemblyStep: number;
  onOpenRoom: () => void;
  onOpenCabinetBuilder: () => void;
  onOpenAddPart: () => void;
  onOpenSketch2D: () => void;
  onOpenCutList: () => void;
  onOpenMaterials: () => void;
  onOpenProjects: () => void;
  onOpenTemplates: () => void;
  onOpenPartsList: () => void;
  onOpenCloud: () => void;
  onOpenShortcuts: () => void;
  onOpenStartModal: () => void;
  onCreateNewProject: () => void;
  onSwitchProject: (id: string) => void;
  onSelectAndFocusPart: (id: string) => void;
  onChangeTool: (tool: EditorTool) => void;
  onCameraPreset: (preset: CameraPreset) => void;
  onFocusAll: () => void;
  onToggleXray: () => void;
  onToggleLed: () => void;
  onToggleDimensions: () => void;
  onToggleMagneticSnap: () => void;
  onToggleOpenFronts: () => void;
  onToggleAssembly: () => void;
  onToggleUiMode: () => void;
  onAutoFasteners: () => void;
  onSnapshot: () => void;
}

interface CommandItem {
  id: string;
  group: 'Tworzenie' | 'Projekt i wycena' | 'Narzędzia i widok' | 'Twoje projekty' | 'Elementy w scenie';
  label: string;
  subtitle?: string;
  shortcut?: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
  run: () => void;
}

export const CommandPaletteModal: React.FC<CommandPaletteModalProps> = ({
  open,
  onClose,
  projects,
  activeProjectId,
  parts,
  uiMode,
  xrayMode,
  ledUnderCabinet,
  showDimensions,
  magneticSnap,
  openAmount,
  assemblyStep,
  onOpenRoom,
  onOpenCabinetBuilder,
  onOpenAddPart,
  onOpenSketch2D,
  onOpenCutList,
  onOpenMaterials,
  onOpenProjects,
  onOpenTemplates,
  onOpenPartsList,
  onOpenCloud,
  onOpenShortcuts,
  onOpenStartModal,
  onCreateNewProject,
  onSwitchProject,
  onSelectAndFocusPart,
  onChangeTool,
  onCameraPreset,
  onFocusAll,
  onToggleXray,
  onToggleLed,
  onToggleDimensions,
  onToggleMagneticSnap,
  onToggleOpenFronts,
  onToggleAssembly,
  onToggleUiMode,
  onAutoFasteners,
  onSnapshot,
}) => {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActiveIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const allItems = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = [
      // Creation
      {
        id: 'create-cabinet',
        group: 'Tworzenie',
        label: 'Kreator szafki parametrycznej',
        subtitle: 'Szafki kuchenne, szafy, komody, szuflady, fronty',
        keywords: 'szafka mebel kreator kuchnia szafa komoda regał',
        icon: LayoutPanelTop,
        accent: true,
        run: onOpenCabinetBuilder,
      },
      {
        id: 'create-room',
        group: 'Tworzenie',
        label: 'Konfigurator pomieszczenia 2D / 3D',
        subtitle: 'Ściany, drzwi, okna, grzejniki, skosy, WC',
        keywords: 'pokój pomieszczenie rzut 2d ściany okno drzwi łazienka kuchnia',
        icon: Home,
        run: onOpenRoom,
      },
      {
        id: 'create-part',
        group: 'Tworzenie',
        label: 'Biblioteka płyt, profili i urządzeń AGD',
        subtitle: 'Formatki, kantówki, lodówki, pralki, wanny, sofy',
        keywords: 'dodaj płyta półka profil agd pralka lodówka zlew kanapa wanna',
        icon: Plus,
        run: onOpenAddPart,
      },
      {
        id: 'create-sketch',
        group: 'Tworzenie',
        label: 'Szkic płyty 2D (skosy i wycięcia CNC)',
        subtitle: 'Narysuj dowolny kontur płyty pod poddasze lub łuk',
        keywords: 'szkic 2d skos cnc wycięcie kształt rysuj',
        icon: PenTool,
        run: onOpenSketch2D,
      },
      {
        id: 'create-blank',
        group: 'Tworzenie',
        label: 'Nowy pusty projekt',
        subtitle: 'Utwórz czystą scenę roboczą',
        keywords: 'nowy projekt pusty utwórz',
        icon: FolderPlus,
        run: onCreateNewProject,
      },

      // Project & Production
      {
        id: 'open-cutlist',
        group: 'Projekt i wycena',
        label: 'Rozkrój płyt, BOM i wycena PDF',
        subtitle: 'Arkusz rozkroju, obrzeża, wkręty, eksport PDF / CSV / JSON',
        keywords: 'rozkrój wycena pdf bom lista cięcia formatki kosztorys',
        icon: Scissors,
        run: onOpenCutList,
      },
      {
        id: 'open-materials',
        group: 'Projekt i wycena',
        label: 'Materiały, dekory i własne ceny',
        subtitle: 'Płyty laminowane, drewno, blaty, własne tekstury',
        keywords: 'materiały dekory tekstury płyta ceny dąb biały mdf osb',
        icon: Palette,
        run: onOpenMaterials,
      },
      {
        id: 'open-parts',
        group: 'Projekt i wycena',
        label: 'Drzewo sceny i warstwy',
        subtitle: `${parts.length} elementów w bieżącym projekcie`,
        keywords: 'scena elementy drzewo lista warstwy grupy',
        icon: Layers,
        run: onOpenPartsList,
      },
      {
        id: 'open-templates',
        group: 'Projekt i wycena',
        label: 'Szablony z bazy Firestore',
        subtitle: 'Gotowe projekty startowe i własne szablony w chmurze',
        keywords: 'szablony gotowe projekty firestore chmura diy',
        icon: FolderOpen,
        run: onOpenTemplates,
      },
      {
        id: 'open-projects',
        group: 'Projekt i wycena',
        label: 'Menedżer projektów',
        subtitle: `${projects.length} zapisanych projektów`,
        keywords: 'projekty lista zmień nazwę duplikuj',
        icon: FolderOpen,
        run: onOpenProjects,
      },
      {
        id: 'open-cloud',
        group: 'Projekt i wycena',
        label: 'Konto i chmura Firebase',
        subtitle: 'Logowanie Google i synchronizacja między urządzeniami',
        keywords: 'chmura firebase google logowanie synchronizacja',
        icon: Cloud,
        run: onOpenCloud,
      },
      {
        id: 'open-start',
        group: 'Projekt i wycena',
        label: 'Ekran startowy Stolarz 3D',
        subtitle: 'Szybki wybór ścieżki projektowania',
        keywords: 'start ekran główny launcher',
        icon: Sparkles,
        run: onOpenStartModal,
      },
      {
        id: 'snapshot',
        group: 'Projekt i wycena',
        label: 'Zapisz zrzut wizualizacji PNG',
        subtitle: 'Eksportuj aktualny kadr 3D jako obraz',
        keywords: 'png zrzut zdjęcie wizualizacja render eksport',
        icon: Camera,
        run: onSnapshot,
      },

      // Tools & View
      {
        id: 'tool-select',
        group: 'Narzędzia i widok',
        label: 'Narzędzie: Zaznacz',
        shortcut: 'V',
        keywords: 'zaznacz kursor select',
        icon: MousePointer2,
        run: () => onChangeTool('select'),
      },
      {
        id: 'tool-move',
        group: 'Narzędzia i widok',
        label: 'Narzędzie: Przesuń',
        shortcut: 'G',
        keywords: 'przesuń ruch move gizmo',
        icon: Move,
        run: () => onChangeTool('move'),
      },
      {
        id: 'tool-rotate',
        group: 'Narzędzia i widok',
        label: 'Narzędzie: Obróć',
        shortcut: 'R',
        keywords: 'obróć rotacja rotate',
        icon: RotateCw,
        run: () => onChangeTool('rotate'),
      },
      {
        id: 'tool-resize',
        group: 'Narzędzia i widok',
        label: 'Narzędzie: Rozciągnij',
        shortcut: 'S',
        keywords: 'rozciągnij skaluj wymiary resize',
        icon: Maximize2,
        run: () => onChangeTool('resize'),
      },
      {
        id: 'tool-screw',
        group: 'Narzędzia i widok',
        label: 'Narzędzie: Wkręty i konfirmaty',
        shortcut: 'W',
        keywords: 'wkręty konfirmaty kołki mimośrody łączniki',
        icon: Wrench,
        run: () => onChangeTool('screw'),
      },
      {
        id: 'tool-measure',
        group: 'Narzędzia i widok',
        label: 'Narzędzie: Miarka 3D',
        shortcut: 'T',
        keywords: 'miarka pomiar dystans wymiar 3d',
        icon: Ruler,
        run: () => onChangeTool('measure'),
      },
      {
        id: 'action-autofasteners',
        group: 'Narzędzia i widok',
        label: 'Automatycznie wkręć łączniki w styki',
        subtitle: 'Wykrywa połączenia płyt i wstawia wkręty',
        keywords: 'auto wkręty łączniki konfirmaty styki',
        icon: Sparkles,
        run: onAutoFasteners,
      },
      {
        id: 'view-focus',
        group: 'Narzędzia i widok',
        label: 'Dopasuj kamerę do całego projektu',
        shortcut: 'F',
        keywords: 'kamera dopasuj wyśrodkuj focus zoom',
        icon: Focus,
        run: onFocusAll,
      },
      {
        id: 'view-iso',
        group: 'Narzędzia i widok',
        label: 'Widok kamery: 3D Izometryczny',
        keywords: 'kamera widok 3d izometryczny perspektywa',
        icon: Box,
        run: () => onCameraPreset('iso'),
      },
      {
        id: 'view-front',
        group: 'Narzędzia i widok',
        label: 'Widok kamery: Przód',
        keywords: 'kamera widok przód elewacja front',
        icon: Box,
        run: () => onCameraPreset('front'),
      },
      {
        id: 'view-top',
        group: 'Narzędzia i widok',
        label: 'Widok kamery: Góra (rzut)',
        keywords: 'kamera widok góra rzut plan top',
        icon: Box,
        run: () => onCameraPreset('top'),
      },
      {
        id: 'view-side',
        group: 'Narzędzia i widok',
        label: 'Widok kamery: Bok',
        keywords: 'kamera widok bok profil prawy lewy',
        icon: Box,
        run: () => onCameraPreset('side'),
      },
      {
        id: 'toggle-fronts',
        group: 'Narzędzia i widok',
        label: openAmount > 0.1 ? 'Zamknij fronty i szuflady' : 'Otwórz fronty i wysuń szuflady',
        shortcut: 'O',
        keywords: 'otwórz zamknij fronty drzwi szuflady',
        icon: DoorOpen,
        run: onToggleOpenFronts,
      },
      {
        id: 'toggle-magnet',
        group: 'Narzędzia i widok',
        label: `Magnes przyciągania krawędzi: ${magneticSnap ? 'Wyłącz' : 'Włącz'}`,
        shortcut: 'M',
        keywords: 'magnes snap przyciąganie',
        icon: Magnet,
        run: onToggleMagneticSnap,
      },
      {
        id: 'toggle-xray',
        group: 'Narzędzia i widok',
        label: `Tryb RTG (przeźroczystość): ${xrayMode ? 'Wyłącz' : 'Włącz'}`,
        shortcut: 'X',
        keywords: 'rtg xray przeźroczystość podgląd wnętrza',
        icon: Layers,
        run: onToggleXray,
      },
      {
        id: 'toggle-led',
        group: 'Narzędzia i widok',
        label: `Oświetlenie podszafkowe LED: ${ledUnderCabinet ? 'Wyłącz' : 'Włącz'}`,
        shortcut: 'L',
        keywords: 'led światło podszafkowe pasek',
        icon: Lightbulb,
        run: onToggleLed,
      },
      {
        id: 'toggle-dims',
        group: 'Narzędzia i widok',
        label: `Prześwity i wymiary w świetle: ${showDimensions ? 'Ukryj' : 'Pokaż'}`,
        shortcut: 'D',
        keywords: 'prześwity wymiary światło odległości',
        icon: Ruler,
        run: onToggleDimensions,
      },
      {
        id: 'toggle-assembly',
        group: 'Narzędzia i widok',
        label:
          assemblyStep > 0
            ? 'Zamknij instrukcję montażu krok po kroku'
            : 'Uruchom instrukcję montażu krok po kroku',
        keywords: 'montaż instrukcja kroki skręcanie',
        icon: ListOrdered,
        run: onToggleAssembly,
      },
      {
        id: 'toggle-uimode',
        group: 'Narzędzia i widok',
        label:
          uiMode === 'expert'
            ? 'Przełącz na tryb Prosty'
            : 'Przełącz na tryb Ekspert (wkręty, RTG, CNC)',
        keywords: 'tryb prosty ekspert interfejs zaawansowany',
        icon: Sparkles,
        run: onToggleUiMode,
      },
      {
        id: 'open-shortcuts',
        group: 'Narzędzia i widok',
        label: 'Pomoc, skróty klawiszowe i gesty',
        shortcut: '?',
        keywords: 'pomoc skróty klawisze gesty instrukcja',
        icon: HelpCircle,
        run: onOpenShortcuts,
      },
    ];

    // Add switchable projects
    for (const proj of projects) {
      if (proj.id === activeProjectId) continue;
      items.push({
        id: `proj-${proj.id}`,
        group: 'Twoje projekty',
        label: proj.name,
        subtitle: `${proj.parts.length} elem.${proj.room?.enabled ? ` · pokój ${proj.room.widthMm}×${proj.room.depthMm} mm` : ''}`,
        keywords: `projekt otwórz ${proj.name}`,
        icon: FolderOpen,
        run: () => onSwitchProject(proj.id),
      });
    }

    // Add scene parts when user searches or has parts
    for (const p of parts.slice(0, 60)) {
      items.push({
        id: `part-${p.id}`,
        group: 'Elementy w scenie',
        label: p.name,
        subtitle: `${p.width} × ${p.height} × ${p.depth} mm`,
        keywords: `element płyta znajdź ${p.name} ${p.kind}`,
        icon: Box,
        run: () => onSelectAndFocusPart(p.id),
      });
    }

    return items;
  }, [
    projects,
    activeProjectId,
    parts,
    uiMode,
    xrayMode,
    ledUnderCabinet,
    showDimensions,
    magneticSnap,
    openAmount,
    assemblyStep,
    onOpenRoom,
    onOpenCabinetBuilder,
    onOpenAddPart,
    onOpenSketch2D,
    onOpenCutList,
    onOpenMaterials,
    onOpenProjects,
    onOpenTemplates,
    onOpenPartsList,
    onOpenCloud,
    onOpenShortcuts,
    onOpenStartModal,
    onCreateNewProject,
    onSwitchProject,
    onSelectAndFocusPart,
    onChangeTool,
    onCameraPreset,
    onFocusAll,
    onToggleXray,
    onToggleLed,
    onToggleDimensions,
    onToggleMagneticSnap,
    onToggleOpenFronts,
    onToggleAssembly,
    onToggleUiMode,
    onAutoFasteners,
    onSnapshot,
  ]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Keep default palette clean & scannable: show top creation, project, tools, and up to 3 other projects
      return allItems.filter((item) => item.group !== 'Elementy w scenie');
    }
    const tokens = q.split(/\s+/).filter(Boolean);
    return allItems.filter((item) => {
      const hay = `${item.label} ${item.subtitle ?? ''} ${item.keywords} ${item.group}`.toLowerCase();
      return tokens.every((tok) => hay.includes(tok));
    });
  }, [allItems, query]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((idx) => (filteredItems.length === 0 ? 0 : (idx + 1) % filteredItems.length));
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((idx) =>
          filteredItems.length === 0
            ? 0
            : (idx - 1 + filteredItems.length) % filteredItems.length
        );
        return;
      }
      if (e.key === 'Enter') {
        const selected = filteredItems[activeIndex];
        if (selected) {
          e.preventDefault();
          onClose();
          selected.run();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, filteredItems, activeIndex, onClose]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-cmd-idx="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  if (!open) return null;

  // Group filtered items preserving order
  const groupsOrder: CommandItem['group'][] = [
    'Tworzenie',
    'Projekt i wycena',
    'Narzędzia i widok',
    'Twoje projekty',
    'Elementy w scenie',
  ];

  let runningIdx = 0;
  const grouped = groupsOrder
    .map((groupName) => {
      const entries = filteredItems
        .filter((item) => item.group === groupName)
        .map((item) => ({ item, flatIndex: runningIdx++ }));
      return { groupName, entries };
    })
    .filter((g) => g.entries.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-[3px] p-3 pt-[8vh] sm:pt-[11vh]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Szybkie polecenia"
    >
      <div className="studio-sheet animate-studio-pop w-full max-w-xl rounded-2xl text-zinc-100 overflow-hidden flex flex-col max-h-[76dvh]">
        {/* Search Header */}
        <div className="flex items-center gap-2.5 border-b border-white/[0.08] px-4 py-3">
          <Search className="h-4 w-4 text-amber-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Wpisz polecenie, szafkę, narzędzie, projekt lub element..."
            className="flex-1 min-w-0 bg-transparent text-sm text-white placeholder:text-zinc-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 hover:bg-white/[0.06] hover:text-white cursor-pointer"
              aria-label="Wyczyść"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="hidden sm:flex items-center rounded-md border border-white/[0.09] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono-num text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            Esc
          </button>
        </div>

        {/* Results */}
        <div ref={listRef} className="cad-scroll flex-1 overflow-y-auto px-2 py-2 space-y-3">
          {grouped.length === 0 ? (
            <div className="py-10 text-center text-xs text-zinc-500">
              Brak pasujących poleceń dla „{query}”
            </div>
          ) : (
            grouped.map(({ groupName, entries }) => (
              <div key={groupName}>
                <div className="px-2.5 pb-1 text-[11px] font-medium text-zinc-500">
                  {groupName}
                </div>
                <div className="space-y-0.5">
                  {entries.map(({ item, flatIndex }) => {
                    const Icon = item.icon;
                    const isActive = flatIndex === activeIndex;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        data-cmd-idx={flatIndex}
                        onMouseEnter={() => setActiveIndex(flatIndex)}
                        onClick={() => {
                          onClose();
                          item.run();
                        }}
                        className={`flex w-full min-h-[44px] items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-left transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-white/[0.08] text-white'
                            : 'text-zinc-300 hover:bg-white/[0.05]'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${
                              item.accent
                                ? 'bg-amber-500/20 text-amber-300'
                                : isActive
                                  ? 'bg-white/[0.08] text-amber-300'
                                  : 'bg-white/[0.04] text-zinc-400'
                            }`}
                          >
                            <Icon className="h-4 w-4" />
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs sm:text-[13px] font-medium text-zinc-100 truncate">
                              {item.label}
                            </div>
                            {item.subtitle && (
                              <div className="text-[11px] text-zinc-500 truncate">
                                {item.subtitle}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.shortcut && (
                            <kbd className="rounded-md border border-white/[0.09] bg-white/[0.04] px-1.5 py-0.5 text-[10px] font-mono-num text-zinc-400">
                              {item.shortcut}
                            </kbd>
                          )}
                          {isActive && (
                            <CornerDownLeft className="h-3.5 w-3.5 text-amber-400" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Minimal Footer Hint */}
        <div className="hidden sm:flex items-center justify-between border-t border-white/[0.08] px-4 py-2 text-[11px] text-zinc-500">
          <span>↑↓ Nawigacja · Enter Uruchom</span>
          <span className="font-mono-num">Ctrl+K</span>
        </div>
      </div>
    </div>
  );
};
