import React, { useMemo, useState } from 'react';
import { AlertTriangle, Check, Plus, Trash2, X } from 'lucide-react';
import {
  DEFAULT_ROOM_CONFIG,
  type FurniturePart,
  type RoomConfig,
  type RoomObstacle,
  type RoomObstacleType,
} from '../types/furniture';
import {
  analyzeDoorSwingCollisions,
  auditRoomClearances,
  type RoomClearanceIssue,
} from '../engine/carpentry';

interface RoomSettingsModalProps {
  open: boolean;
  parts: FurniturePart[];
  room: RoomConfig | undefined;
  roomIssues: RoomClearanceIssue[];
  onClose: () => void;
  onSaveRoom: (room: RoomConfig) => void;
}

const OBSTACLE_PRESETS: Record<
  RoomObstacleType,
  { label: string; widthMm: number; heightMm: number; protrusionMm: number; elevationMm: number }
> = {
  socket: {
    label: 'Gniazdko 230V',
    widthMm: 160,
    heightMm: 90,
    protrusionMm: 25,
    elevationMm: 300,
  },
  pipe: {
    label: 'Rura / pion',
    widthMm: 110,
    heightMm: 2400,
    protrusionMm: 110,
    elevationMm: 0,
  },
  radiator: {
    label: 'Grzejnik C.O.',
    widthMm: 900,
    heightMm: 600,
    protrusionMm: 130,
    elevationMm: 150,
  },
  window: {
    label: 'Okno / wnęka',
    widthMm: 1200,
    heightMm: 1300,
    protrusionMm: 60,
    elevationMm: 900,
  },
};

export const RoomSettingsModal: React.FC<RoomSettingsModalProps> = ({
  open,
  parts,
  room,
  roomIssues,
  onClose,
  onSaveRoom,
}) => {
  const [draft, setDraft] = useState<RoomConfig>(() =>
    structuredClone(room ?? DEFAULT_ROOM_CONFIG)
  );
  const [lastOpen, setLastOpen] = useState(false);

  if (open && !lastOpen) {
    setLastOpen(true);
    setDraft(structuredClone(room ?? DEFAULT_ROOM_CONFIG));
  } else if (!open && lastOpen) {
    setLastOpen(false);
  }

  const [newObsType, setNewObsType] = useState<RoomObstacleType>('socket');
  const [newObsWall, setNewObsWall] = useState<'back' | 'left' | 'right'>('back');
  const [newObsOffset, setNewObsOffset] = useState<number>(300);

  const liveIssues = useMemo(
    () => (open ? auditRoomClearances(parts, draft) : roomIssues),
    [open, parts, draft, roomIssues]
  );

  const liveSwingIssues = useMemo(
    () => (open ? analyzeDoorSwingCollisions(parts, draft) : []),
    [open, parts, draft]
  );

  if (!open) return null;

  const patch = (next: Partial<RoomConfig>) =>
    setDraft((prev) => ({ ...prev, ...next }));

  const patchSlope = (
    next: Partial<NonNullable<RoomConfig['slopedCeiling']>>
  ) =>
    setDraft((prev) => ({
      ...prev,
      slopedCeiling: {
        enabled: prev.slopedCeiling?.enabled ?? false,
        side: prev.slopedCeiling?.side ?? 'right',
        kneeWallHeightMm: prev.slopedCeiling?.kneeWallHeightMm ?? 1100,
        slopeWidthMm: prev.slopedCeiling?.slopeWidthMm ?? 1200,
        ...next,
      },
    }));

  const addObstacle = () => {
    const preset = OBSTACLE_PRESETS[newObsType];
    const obs: RoomObstacle = {
      id: `obs_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      type: newObsType,
      label: preset.label,
      wall: newObsWall,
      offsetMm: newObsOffset,
      elevationMm: preset.elevationMm,
      widthMm: preset.widthMm,
      heightMm: newObsType === 'pipe' ? draft.heightMm : preset.heightMm,
      depthMm: preset.protrusionMm,
    };
    setDraft((prev) => ({
      ...prev,
      enabled: true,
      obstacles: [...prev.obstacles, obs],
    }));
  };

  const updateObstacle = (id: string, p: Partial<RoomObstacle>) => {
    setDraft((prev) => ({
      ...prev,
      obstacles: prev.obstacles.map((o) => (o.id === id ? { ...o, ...p } : o)),
    }));
  };

  const deleteObstacle = (id: string) => {
    setDraft((prev) => ({
      ...prev,
      obstacles: prev.obstacles.filter((o) => o.id !== id),
    }));
  };

  const handleSave = () => {
    onSaveRoom(draft);
    onClose();
  };

  const slope = draft.slopedCeiling ?? {
    enabled: false,
    side: 'right' as const,
    kneeWallHeightMm: 1100,
    slopeWidthMm: 1200,
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4">
      <div className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-2xl border border-zinc-800 bg-[#141518] text-zinc-100 shadow-2xl flex flex-col max-h-[90dvh]">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-zinc-800 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-white truncate">
              Wnęka, ściany, skos poddasza i przeszkody
            </h2>
            <p className="mt-0.5 text-xs text-zinc-400">
              Sprawdzaj w 3D, czy mebel mieści się we wnęce, pod skosem i omija grzejniki, rury oraz gniazdka
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-800 hover:text-white cursor-pointer shrink-0"
            aria-label="Zamknij ustawienia wnęki"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="cad-scroll flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Enable Switch */}
          <div className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900/70 px-4 py-3">
            <div>
              <div className="text-xs font-semibold text-white">
                Pokaż ściany pomieszczenia / wnęki w 3D
              </div>
              <div className="text-[11px] text-zinc-400">
                Włącza półprzezroczyste ściany, podłogę wnęki i automatyczną kontrolę kolizji
              </div>
            </div>
            <button
              type="button"
              onClick={() => patch({ enabled: !draft.enabled })}
              className={`min-h-[34px] rounded-lg px-3.5 text-xs font-semibold transition-colors cursor-pointer ${
                draft.enabled
                  ? 'bg-emerald-500 text-zinc-950'
                  : 'border border-zinc-700 bg-zinc-800 text-zinc-300 hover:text-white'
              }`}
            >
              {draft.enabled ? 'Włączona' : 'Wyłączona'}
            </button>
          </div>

          {liveIssues.length > 0 && draft.enabled && (
            <div className="rounded-xl border border-red-500/40 bg-red-950/35 px-3.5 py-2.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-red-200">
                <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                <span>Wykryte kolizje z wnęką ({liveIssues.length}):</span>
              </div>
              <ul className="space-y-0.5 text-[11px] text-red-200/90 pl-5 list-disc">
                {liveIssues.slice(0, 6).map((iss, idx) => (
                  <li key={`${iss.partId}_${idx}`}>{iss.message}</li>
                ))}
              </ul>
            </div>
          )}

          {liveSwingIssues.length > 0 && (
            <div className="rounded-xl border border-amber-500/45 bg-amber-950/35 px-3.5 py-2.5 space-y-1">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span>Kolizje przy otwieraniu frontów 95°–105° ({liveSwingIssues.length}):</span>
              </div>
              <ul className="space-y-1 text-[11px] text-amber-100/90 pl-5 list-disc">
                {liveSwingIssues.slice(0, 6).map((sw, idx) => (
                  <li key={`${sw.doorId}_${idx}`}>
                    <strong>{sw.doorName}</strong> uderza przy {sw.hitAngleDeg}° o{' '}
                    <strong>{sw.hitLabel}</strong> — {sw.recommendation}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Room Dimensions */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-semibold text-zinc-200">
              Wymiary wnęki / pokoju (mm)
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <label className="block">
                <span className="text-[11px] text-zinc-400">Szerokość (X)</span>
                <input
                  type="number"
                  min={600}
                  max={8000}
                  step={50}
                  value={draft.widthMm}
                  onChange={(e) => patch({ widthMm: Number(e.target.value) || 2600 })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-400">Wysokość (Y)</span>
                <input
                  type="number"
                  min={1200}
                  max={4200}
                  step={50}
                  value={draft.heightMm}
                  onChange={(e) => patch({ heightMm: Number(e.target.value) || 2500 })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-400">Głębokość (Z)</span>
                <input
                  type="number"
                  min={400}
                  max={6000}
                  step={50}
                  value={draft.depthMm}
                  onChange={(e) => patch({ depthMm: Number(e.target.value) || 1600 })}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-400">Ściana tylna Z</span>
                <input
                  type="number"
                  min={-3000}
                  max={1000}
                  step={20}
                  value={draft.backWallZMm}
                  onChange={(e) => {
                    const v = e.target.value === '' ? 0 : Number(e.target.value);
                    if (Number.isFinite(v)) patch({ backWallZMm: v });
                  }}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
            </div>

            <div className="flex flex-wrap gap-3 pt-1 text-xs text-zinc-300">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showBackWall}
                  onChange={(e) => patch({ showBackWall: e.target.checked })}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Ściana tylna</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showLeftWall}
                  onChange={(e) => patch({ showLeftWall: e.target.checked })}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Ściana lewa</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showRightWall}
                  onChange={(e) => patch({ showRightWall: e.target.checked })}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Ściana prawa</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.showCeiling}
                  onChange={(e) => patch({ showCeiling: e.target.checked })}
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Sufit</span>
              </label>
            </div>
          </div>

          {/* Sloped Attic Ceiling */}
          <div className="space-y-2.5 border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-amber-300">
                Skos dachu / poddasze
              </h3>
              <label className="flex items-center gap-2 text-xs text-zinc-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={slope.enabled}
                  onChange={(e) =>
                    patchSlope({ enabled: e.target.checked })
                  }
                  className="h-4 w-4 accent-amber-500"
                />
                <span>Aktywny skos</span>
              </label>
            </div>

            {slope.enabled && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Strona skosu</span>
                  <select
                    value={slope.side}
                    onChange={(e) =>
                      patchSlope({ side: e.target.value as 'left' | 'right' })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                  >
                    <option value="right">Prawa ściana</option>
                    <option value="left">Lewa ściana</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Ścianka kolankowa (mm)</span>
                  <input
                    type="number"
                    min={300}
                    max={draft.heightMm - 100}
                    step={50}
                    value={slope.kneeWallHeightMm}
                    onChange={(e) =>
                      patchSlope({ kneeWallHeightMm: Number(e.target.value) || 1100 })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="text-[11px] text-zinc-400">Szerokość skosu (mm)</span>
                  <input
                    type="number"
                    min={300}
                    max={draft.widthMm}
                    step={50}
                    value={slope.slopeWidthMm}
                    onChange={(e) =>
                      patchSlope({ slopeWidthMm: Number(e.target.value) || 1200 })
                    }
                    className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                  />
                </label>
              </div>
            )}
          </div>

          {/* Wall Obstacles (Sockets, Pipes, Radiators, Windows) */}
          <div className="space-y-3 border-t border-zinc-800 pt-4">
            <h3 className="text-xs font-semibold text-zinc-200">
              Przeszkody na ścianach ({draft.obstacles.length})
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
              <label className="block">
                <span className="text-[11px] text-zinc-400">Typ przeszkody</span>
                <select
                  value={newObsType}
                  onChange={(e) => setNewObsType(e.target.value as RoomObstacleType)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="socket">Gniazdko 230V</option>
                  <option value="radiator">Grzejnik C.O.</option>
                  <option value="pipe">Rura / pion</option>
                  <option value="window">Okno / wnęka</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-400">Ściana</span>
                <select
                  value={newObsWall}
                  onChange={(e) =>
                    setNewObsWall(e.target.value as 'back' | 'left' | 'right')
                  }
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-2 text-xs text-white focus:border-amber-500 focus:outline-none"
                >
                  <option value="back">Tylna</option>
                  <option value="left">Lewa</option>
                  <option value="right">Prawa</option>
                </select>
              </label>
              <label className="block">
                <span className="text-[11px] text-zinc-400">Od lewej/tyłu (mm)</span>
                <input
                  type="number"
                  step={50}
                  value={newObsOffset}
                  onChange={(e) => setNewObsOffset(Number(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-zinc-800 bg-zinc-900 px-2.5 py-2 text-xs font-mono-num text-white focus:border-amber-500 focus:outline-none"
                />
              </label>
              <button
                type="button"
                onClick={addObstacle}
                className="flex min-h-[34px] items-center justify-center gap-1 rounded-lg bg-amber-500/15 border border-amber-500/50 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/25 cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Dodaj</span>
              </button>
            </div>

            {draft.obstacles.length > 0 && (
              <div className="space-y-2">
                {draft.obstacles.map((obs) => (
                  <div
                    key={obs.id}
                    className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-white">
                        {obs.label}{' '}
                        <span className="text-[10px] text-zinc-400">
                          (ściana: {obs.wall === 'back' ? 'tylna' : obs.wall === 'left' ? 'lewa' : 'prawa'})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteObstacle(obs.id)}
                        className="text-zinc-500 hover:text-red-400 p-1 cursor-pointer"
                        aria-label="Usuń przeszkodę"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-5 gap-1.5">
                      <label>
                        <span className="text-[10px] text-zinc-500">Poz.</span>
                        <input
                          type="number"
                          step={20}
                          value={obs.offsetMm}
                          onChange={(e) =>
                            updateObstacle(obs.id, { offsetMm: Number(e.target.value) || 0 })
                          }
                          className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-500">Od pod.</span>
                        <input
                          type="number"
                          min={0}
                          step={20}
                          value={obs.elevationMm}
                          onChange={(e) =>
                            updateObstacle(obs.id, { elevationMm: Number(e.target.value) || 0 })
                          }
                          className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-500">Szer.</span>
                        <input
                          type="number"
                          min={20}
                          step={20}
                          value={obs.widthMm}
                          onChange={(e) =>
                            updateObstacle(obs.id, { widthMm: Number(e.target.value) || 80 })
                          }
                          className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-500">Wys.</span>
                        <input
                          type="number"
                          min={20}
                          step={20}
                          value={obs.heightMm}
                          onChange={(e) =>
                            updateObstacle(obs.id, { heightMm: Number(e.target.value) || 80 })
                          }
                          className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                        />
                      </label>
                      <label>
                        <span className="text-[10px] text-zinc-500">Odstaje</span>
                        <input
                          type="number"
                          min={10}
                          step={10}
                          value={obs.depthMm}
                          onChange={(e) =>
                            updateObstacle(obs.id, { depthMm: Number(e.target.value) || 30 })
                          }
                          className="w-full rounded border border-zinc-800 bg-zinc-950 px-1.5 py-1 text-[11px] font-mono-num text-white"
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-zinc-800 px-5 pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] rounded-xl border border-zinc-700 bg-zinc-900 px-4 text-xs font-medium text-zinc-200 hover:bg-zinc-800 cursor-pointer"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-semibold text-zinc-950 hover:bg-amber-400 cursor-pointer"
          >
            <Check className="h-4 w-4" />
            <span>Zastosuj wnękę w 3D</span>
          </button>
        </div>
      </div>
    </div>
  );
};
