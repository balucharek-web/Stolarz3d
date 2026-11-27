import React from 'react';
import { Keyboard, Mouse, Smartphone, X } from 'lucide-react';

interface ShortcutsHelpModalProps {
  open: boolean;
  onClose: () => void;
}

const TOOL_SHORTCUTS: Array<{ keys: string; desc: string }> = [
  { keys: 'Ctrl+K / ⌘K', desc: 'Szybkie polecenia, narzędzia i wyszukiwarka sceny' },
  { keys: 'V / G / R / S', desc: 'Zaznacz / Przesuń / Obróć / Rozciągnij ścianki' },
  { keys: 'W / T', desc: 'Wkręty i Minifix / Miarka punkt-punkt 3D' },
  { keys: 'O', desc: 'Otwórz lub zamknij fronty i szuflady' },
  { keys: 'F', desc: 'Wycentruj kamerę na elemencie lub całym projekcie' },
  { keys: 'M / D / X', desc: 'Magnes przyciągania / Prześwity / Tryb RTG' },
  { keys: 'L / H', desc: 'Podświetlenie LED / Ukryj dolny panel' },
  { keys: 'Strzałki', desc: 'Przesuń zaznaczenie o 1 mm (Shift: 10 mm, Alt+↑/↓: oś Z)' },
  { keys: 'Ctrl+Z / Ctrl+Y', desc: 'Cofnij / Ponów ostatnią zmianę' },
  { keys: 'Ctrl+D / Del', desc: 'Duplikuj / Usuń zaznaczony element' },
  { keys: 'Shift + Klik', desc: 'Zaznacz wiele płyt (wyrównywanie i grupowanie)' },
];

export const ShortcutsHelpModal: React.FC<ShortcutsHelpModalProps> = ({
  open,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5 backdrop-blur-[3px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="studio-sheet animate-studio-pop w-full max-w-xl max-h-[88dvh] rounded-3xl text-zinc-100 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] px-5 py-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <Keyboard className="h-4 w-4 text-amber-400" />
            <h2 className="text-sm sm:text-base font-semibold text-white">
              Sterowanie i skróty klawiszowe
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl text-zinc-400 hover:bg-white/[0.08] hover:text-white transition-colors cursor-pointer"
            aria-label="Zamknij pomoc"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="cad-scroll flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Camera Controls: PC & Mobile */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-300">
                <Mouse className="h-3.5 w-3.5" />
                <span>Mysz (PC)</span>
              </div>
              <ul className="space-y-1 text-[11px] text-zinc-300">
                <li><strong className="text-white">Lewy przycisk:</strong> obrót kamery / klik w płytę</li>
                <li><strong className="text-white">Prawy przycisk:</strong> przesuwanie widoku lub menu akcji na elemencie</li>
                <li><strong className="text-white">Kółko myszy:</strong> przybliżanie i oddalanie</li>
              </ul>
            </div>

            <div className="rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-sky-300">
                <Smartphone className="h-3.5 w-3.5" />
                <span>Dotyk (Telefon / Tablet)</span>
              </div>
              <ul className="space-y-1 text-[11px] text-zinc-300">
                <li><strong className="text-white">1 palec:</strong> obrót kamery 3D / tapnięcie zaznacza płytę</li>
                <li><strong className="text-white">2 palce (szczypanie):</strong> zoom i przesuwanie w 3D oraz w rzucie 2D</li>
                <li><strong className="text-white">Prawy górny róg:</strong> Szukaj, Cofnij, Wycentruj i Zaznacz wiele</li>
              </ul>
            </div>
          </div>

          {/* Keyboard Shortcuts Table */}
          <div className="space-y-2">
            <h3 className="text-xs font-semibold text-zinc-300">Skróty klawiszowe (PC)</h3>
            <div className="divide-y divide-white/[0.07] rounded-2xl border border-white/[0.08] bg-white/[0.025] overflow-hidden">
              {TOOL_SHORTCUTS.map((item) => (
                <div
                  key={item.keys}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 text-xs"
                >
                  <span className="text-zinc-300">{item.desc}</span>
                  <kbd className="rounded-lg border border-white/[0.1] bg-white/[0.05] px-2 py-0.5 text-[11px] font-mono-num font-semibold text-amber-300 whitespace-nowrap shrink-0">
                    {item.keys}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
