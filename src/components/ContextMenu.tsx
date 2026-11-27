import React, { useEffect, useRef } from 'react';
import {
  ArrowDownToLine,
  Copy,
  FlipHorizontal2,
  Focus,
  Group,
  LayoutPanelTop,
  PenTool,
  Plus,
  RotateCw,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  Ungroup,
} from 'lucide-react';

export type ContextMenuTarget =
  | { kind: 'part'; partId: string; partName: string; x: number; y: number }
  | { kind: 'fastener'; fastenerId: string; label: string; x: number; y: number }
  | { kind: 'canvas'; x: number; y: number };

interface ContextMenuProps {
  menu: ContextMenuTarget | null;
  selectedCount: number;
  selectedCanUngroup: boolean;
  canEditParametricCabinet?: boolean;
  onClose: () => void;
  onOpenInspector: (partId: string) => void;
  onEditParametricCabinet?: (partId: string) => void;
  onEditShape2D: (partId: string) => void;
  onDuplicate: (partId: string) => void;
  onMirrorDuplicate: (partId: string) => void;
  onRotate90Y: (partId: string) => void;
  onDropToFloor: (partId: string) => void;
  onAutoFastenPart: (partId: string) => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  onDeletePart: (partId: string) => void;
  onDeleteFastener: (fastenerId: string) => void;
  onAddPart: () => void;
  onSketchNew2D: () => void;
  onAutoFastenAll: () => void;
  onFocusAll: () => void;
}

export const ContextMenu: React.FC<ContextMenuProps> = ({
  menu,
  selectedCount,
  selectedCanUngroup,
  canEditParametricCabinet = false,
  onClose,
  onOpenInspector,
  onEditParametricCabinet,
  onEditShape2D,
  onDuplicate,
  onMirrorDuplicate,
  onRotate90Y,
  onDropToFloor,
  onAutoFastenPart,
  onGroupSelected,
  onUngroupSelected,
  onDeletePart,
  onDeleteFastener,
  onAddPart,
  onSketchNew2D,
  onAutoFastenAll,
  onFocusAll,
}) => {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menu) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const menuW = 248;
  const menuH =
    menu.kind === 'part'
      ? canEditParametricCabinet
        ? 364
        : 324
      : menu.kind === 'canvas'
        ? 190
        : 88;
  const left = Math.max(8, Math.min(window.innerWidth - menuW - 8, menu.x));
  const top = Math.max(54, Math.min(window.innerHeight - menuH - 12, menu.y));

  const itemCls =
    'flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-zinc-200 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer';

  return (
    <div
      ref={ref}
      role="menu"
      onContextMenu={(e) => e.preventDefault()}
      style={{ left, top, width: menuW }}
      className="studio-glass animate-studio-pop fixed z-50 rounded-2xl p-1.5 text-zinc-100 select-none"
    >
      {menu.kind === 'part' && (
        <>
          <div className="mb-1 border-b border-white/[0.08] px-2.5 py-1.5">
            <p className="truncate text-[11px] font-semibold text-amber-400">
              {canEditParametricCabinet
                ? 'Szafka parametryczna'
                : selectedCount > 1
                  ? `Zaznaczono: ${selectedCount} płyty`
                  : menu.partName}
            </p>
          </div>
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onOpenInspector(menu.partId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-amber-400" />
              Właściwości i wymiary
            </span>
          </button>
          {canEditParametricCabinet && onEditParametricCabinet && (
            <button
              type="button"
              className={itemCls}
              onClick={() => {
                onEditParametricCabinet(menu.partId);
                onClose();
              }}
            >
              <span className="flex items-center gap-2 text-emerald-300">
                <LayoutPanelTop className="h-3.5 w-3.5 text-emerald-400" />
                Edytuj szafkę w kreatorze
              </span>
            </button>
          )}
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onEditShape2D(menu.partId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <PenTool className="h-3.5 w-3.5 text-zinc-400" />
              Edytuj kształt 2D
            </span>
          </button>
          <div className="my-1 h-px bg-zinc-800" />
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onDuplicate(menu.partId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <Copy className="h-3.5 w-3.5 text-zinc-400" />
              Duplikuj
            </span>
            <span className="text-[10px] text-zinc-500 font-mono-num">Ctrl+D</span>
          </button>
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onMirrorDuplicate(menu.partId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <FlipHorizontal2 className="h-3.5 w-3.5 text-zinc-400" />
              Odbij lustrzanie (kopia)
            </span>
          </button>
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onRotate90Y(menu.partId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <RotateCw className="h-3.5 w-3.5 text-zinc-400" />
              Obróć o 90°
            </span>
          </button>
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onDropToFloor(menu.partId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <ArrowDownToLine className="h-3.5 w-3.5 text-zinc-400" />
              Postaw na podłodze (Y=0)
            </span>
          </button>
          <div className="my-1 h-px bg-zinc-800" />
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onAutoFastenPart(menu.partId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2 text-emerald-300">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              Wkręć łączniki w styki płyty
            </span>
          </button>
          {!canEditParametricCabinet && selectedCount >= 2 && (
            <button
              type="button"
              className={itemCls}
              onClick={() => {
                onGroupSelected();
                onClose();
              }}
            >
              <span className="flex items-center gap-2 text-sky-300">
                <Group className="h-3.5 w-3.5 text-sky-400" />
                Połącz zaznaczone w grupę ({selectedCount})
              </span>
            </button>
          )}
          {!canEditParametricCabinet && selectedCanUngroup && (
            <button
              type="button"
              className={itemCls}
              onClick={() => {
                onUngroupSelected();
                onClose();
              }}
            >
              <span className="flex items-center gap-2 text-zinc-200">
                <Ungroup className="h-3.5 w-3.5 text-zinc-400" />
                Rozgrupuj moduł
              </span>
            </button>
          )}
          <div className="my-1 h-px bg-zinc-800" />
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-red-300 hover:bg-red-950/70 hover:text-red-200 transition-colors cursor-pointer"
            onClick={() => {
              onDeletePart(menu.partId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
              {canEditParametricCabinet
                ? 'Usuń szafkę'
                : selectedCount > 1
                  ? `Usuń zaznaczone (${selectedCount})`
                  : 'Usuń płytę'}
            </span>
            <span className="text-[10px] text-red-400/70 font-mono-num">Del</span>
          </button>
        </>
      )}

      {menu.kind === 'fastener' && (
        <>
          <div className="mb-1 border-b border-zinc-800 px-2.5 py-1.5">
            <p className="truncate text-[11px] font-semibold text-amber-400">
              {menu.label}
            </p>
          </div>
          <button
            type="button"
            className="flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs font-medium text-red-300 hover:bg-red-950/70 hover:text-red-200 transition-colors cursor-pointer"
            onClick={() => {
              onDeleteFastener(menu.fastenerId);
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <Trash2 className="h-3.5 w-3.5 text-red-400" />
              Usuń łącznik
            </span>
            <span className="text-[10px] text-red-400/70 font-mono-num">Del</span>
          </button>
        </>
      )}

      {menu.kind === 'canvas' && (
        <>
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onAddPart();
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <Plus className="h-3.5 w-3.5 text-amber-400" />
              Dodaj płytę / profil
            </span>
          </button>
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onSketchNew2D();
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <PenTool className="h-3.5 w-3.5 text-amber-400" />
              Rysuj własny kształt 2D
            </span>
          </button>
          <div className="my-1 h-px bg-zinc-800" />
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onAutoFastenAll();
              onClose();
            }}
          >
            <span className="flex items-center gap-2 text-emerald-300">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              Auto-wkręty (cały mebel)
            </span>
          </button>
          <button
            type="button"
            className={itemCls}
            onClick={() => {
              onFocusAll();
              onClose();
            }}
          >
            <span className="flex items-center gap-2">
              <Focus className="h-3.5 w-3.5 text-zinc-400" />
              Dopasuj widok
            </span>
            <span className="text-[10px] text-zinc-500 font-mono-num">F</span>
          </button>
        </>
      )}
    </div>
  );
};
