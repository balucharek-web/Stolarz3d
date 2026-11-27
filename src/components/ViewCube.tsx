import React from 'react';
import { Focus } from 'lucide-react';
import { CameraPreset } from '../types/furniture';

interface ViewCubeProps {
  onSelectView: (preset: CameraPreset) => void;
  onFocusAll: () => void;
  inspectorOpen?: boolean;
}

/**
 * Compact CAD View Compass (Desktop/Tablet) tucked cleanly in the top-right corner
 * for 1-click orthographic & isometric camera navigation. Automatically shifts beside
 * InspectorDrawer when open so it never collides or gets covered.
 */
export const ViewCube: React.FC<ViewCubeProps> = ({
  onSelectView,
  onFocusAll,
  inspectorOpen = false,
}) => {
  const btn =
    'flex h-6 items-center justify-center rounded text-[10px] font-semibold tracking-tight text-zinc-300 hover:bg-amber-500 hover:text-zinc-950 transition-colors cursor-pointer select-none';

  return (
    <div
      aria-label="Kompas widoków kamery 3D"
      className={`hidden sm:flex fixed top-15 z-20 flex-col gap-1 rounded-xl border border-zinc-800/90 bg-[#141518]/92 p-1.5 shadow-xl transition-[right] duration-200 ${
        inspectorOpen ? 'right-[364px]' : 'right-4'
      }`}
    >
      <div className="grid grid-cols-3 gap-0.5 w-[108px]">
        <button
          type="button"
          onClick={() => onSelectView('iso')}
          className={`${btn} bg-zinc-900 text-amber-400`}
          title="Widok izometryczny 3D"
        >
          3D
        </button>
        <button
          type="button"
          onClick={() => onSelectView('top')}
          className={`${btn} bg-zinc-900`}
          title="Widok z góry (rzut)"
        >
          Góra
        </button>
        <button
          type="button"
          onClick={onFocusAll}
          className={`${btn} bg-zinc-900 text-zinc-400`}
          title="Dopasuj cały mebel (F)"
          aria-label="Dopasuj widok"
        >
          <Focus className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={() => onSelectView('left')}
          className={`${btn} bg-zinc-900`}
          title="Widok z lewej strony"
        >
          Lewy
        </button>
        <button
          type="button"
          onClick={() => onSelectView('front')}
          className={`${btn} bg-zinc-800 text-white`}
          title="Widok z przodu"
        >
          Przód
        </button>
        <button
          type="button"
          onClick={() => onSelectView('right')}
          className={`${btn} bg-zinc-900`}
          title="Widok z prawej strony"
        >
          Prawy
        </button>
      </div>
      <button
        type="button"
        onClick={() => onSelectView('back')}
        className={`${btn} w-full h-5 bg-zinc-900/80 text-zinc-400`}
        title="Widok z tyłu (plecy mebla)"
      >
        Tył
      </button>
    </div>
  );
};
