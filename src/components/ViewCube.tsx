import React from 'react';
import { Focus } from 'lucide-react';
import { CameraPreset } from '../types/furniture';

interface ViewCubeProps {
  onSelectView: (preset: CameraPreset) => void;
  onFocusAll: () => void;
  cameraProjection?: 'perspective' | 'orthographic';
  onToggleProjection?: () => void;
  inspectorOpen?: boolean;
}

/**
 * Architectural Studio Camera Compass (Desktop/Tablet) tucked cleanly in the top-right corner
 * for 1-click orthographic & isometric camera navigation. Automatically shifts beside
 * InspectorDrawer when open so it never collides or gets covered.
 */
export const ViewCube: React.FC<ViewCubeProps> = ({
  onSelectView,
  onFocusAll,
  cameraProjection = 'perspective',
  onToggleProjection,
  inspectorOpen = false,
}) => {
  const btn =
    'flex h-7 items-center justify-center rounded-lg text-[10px] font-medium tracking-tight text-zinc-300 hover:bg-white/[0.1] hover:text-white active:scale-[0.97] transition-all cursor-pointer select-none';

  return (
    <div
      aria-label="Kompas widoków kamery 3D"
      className={`hidden sm:flex studio-glass fixed top-[62px] z-20 flex-col gap-1 rounded-2xl p-1.5 transition-[right] duration-200 ease-out ${
        inspectorOpen ? 'right-[372px]' : 'right-3.5'
      }`}
    >
      <div className="grid grid-cols-3 gap-1 w-[124px]">
        <button
          type="button"
          onClick={() => onSelectView('iso')}
          className={`${btn} bg-amber-500/15 text-amber-300 hover:bg-amber-500 hover:text-zinc-950 font-semibold`}
          title="Widok izometryczny 3D"
        >
          3D
        </button>
        <button
          type="button"
          onClick={() => onSelectView('top')}
          className={`${btn} bg-white/[0.04]`}
          title="Widok z góry (rzut)"
        >
          Góra
        </button>
        <button
          type="button"
          onClick={onFocusAll}
          className={`${btn} bg-white/[0.04] text-zinc-400`}
          title="Dopasuj cały projekt (F)"
          aria-label="Dopasuj widok"
        >
          <Focus className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onSelectView('left')}
          className={`${btn} bg-white/[0.04]`}
          title="Widok z lewej strony"
        >
          Lewy
        </button>
        <button
          type="button"
          onClick={() => onSelectView('front')}
          className={`${btn} bg-white/[0.1] text-white font-semibold`}
          title="Widok z przodu"
        >
          Przód
        </button>
        <button
          type="button"
          onClick={() => onSelectView('right')}
          className={`${btn} bg-white/[0.04]`}
          title="Widok z prawej strony"
        >
          Prawy
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1 w-[124px]">
        <button
          type="button"
          onClick={() => onSelectView('back')}
          className={`${btn} h-6 bg-white/[0.03] text-zinc-400`}
          title="Widok z tyłu (plecy mebla)"
        >
          Tył
        </button>
        {onToggleProjection && (
          <button
            type="button"
            onClick={onToggleProjection}
            className={`${btn} h-6 font-mono-num ${
              cameraProjection === 'orthographic'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-400/40 font-semibold'
                : 'bg-white/[0.03] text-zinc-400'
            }`}
            title="Przełącz rzut: Perspektywa / Ortograficzny CAD (klawisz P)"
          >
            {cameraProjection === 'orthographic' ? 'Orto' : 'Persp'}
          </button>
        )}
      </div>
    </div>
  );
};
