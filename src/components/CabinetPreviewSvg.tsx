import React from 'react';
import type { ParametricCabinetConfig } from '../engine/parametric';

interface CabinetSideSectionSvgProps {
  cfg: ParametricCabinetConfig;
  bodyHeightMm: number;
  isHybrid: boolean;
}

export const CabinetSideSectionSvg: React.FC<CabinetSideSectionSvgProps> = ({
  cfg,
  bodyHeightMm,
  isHybrid,
}) => {
  const pad = 115;
  const ctH = cfg.addCountertop ? 38 : 0;
  const ctOverhang = cfg.addCountertop ? 30 : 0;
  const plinthH = cfg.plinthStyle === 'none' ? 0 : cfg.plinthHeightMm;
  const totalH = cfg.heightMm + ctH;
  const totalD = cfg.depthMm + ctOverhang + 22;
  const vbW = totalD + pad * 2;
  const vbH = totalH + pad * 2;
  const t = cfg.boardThicknessMm;
  const xBack = pad;
  const yTop = pad + ctH;
  const hasFront =
    cfg.doorMode !== 'none' || cfg.drawerCount > 0 || cfg.preset === 'sliding_wardrobe';
  const drawerZoneH =
    cfg.drawerCount > 0
      ? isHybrid
        ? bodyHeightMm * 0.42
        : bodyHeightMm
      : 0;
  const upperZoneH = Math.max(0, bodyHeightMm - drawerZoneH);

  return (
    <svg
      viewBox={`0 0 ${vbW} ${vbH}`}
      className="w-full h-auto max-h-[155px] sm:max-h-[240px] rounded-lg bg-[#1A1C22]"
      role="img"
      aria-label={`Przekrój boczny szafki głębokość ${cfg.depthMm} mm`}
    >
      {/* Wall reference line on left (rear) */}
      <line
        x1={xBack - 12}
        y1={pad - 35}
        x2={xBack - 12}
        y2={pad + totalH + 20}
        stroke="#64748B"
        strokeWidth={6}
        strokeDasharray="18 14"
      />

      {/* Countertop with front overhang */}
      {cfg.addCountertop && ctH > 0 && (
        <rect
          x={xBack}
          y={pad}
          width={cfg.depthMm + ctOverhang}
          height={ctH}
          fill="#94A3B8"
          fillOpacity={0.4}
          stroke="#CBD5E1"
          strokeWidth={6}
        />
      )}

      {/* Side carcass profile */}
      <rect
        x={xBack}
        y={yTop}
        width={cfg.depthMm}
        height={bodyHeightMm}
        fill="#27272A"
        stroke="#E4E4E7"
        strokeWidth={6}
      />

      {/* Back panel (HDF grooved / nailed) */}
      {cfg.backType !== 'none' && (
        <rect
          x={cfg.backType === 'hdf_grooved' ? xBack + 14 : xBack - 4}
          y={yTop + (cfg.backType === 'hdf_nailed' ? 0 : t)}
          width={6}
          height={Math.max(
            20,
            bodyHeightMm - (cfg.backType === 'hdf_nailed' ? 0 : t * 2),
          )}
          fill="#38BDF8"
          fillOpacity={0.7}
        />
      )}

      {/* Top & bottom panels */}
      <rect x={xBack} y={yTop} width={cfg.depthMm} height={t} fill="#52525B" />
      <rect
        x={xBack}
        y={yTop + bodyHeightMm - t}
        width={cfg.depthMm}
        height={t}
        fill="#52525B"
      />

      {/* Shelves in depth */}
      {cfg.shelfCount > 0 &&
        upperZoneH > 60 &&
        Array.from({ length: cfg.shelfCount }).map((_, idx) => {
          const sy = yTop + ((idx + 1) / (cfg.shelfCount + 1)) * upperZoneH;
          return (
            <rect
              key={`s_${idx}`}
              x={xBack + 24}
              y={sy - t / 2}
              width={Math.max(40, cfg.depthMm - 42)}
              height={t}
              fill="#F59E0B"
              fillOpacity={0.55}
            />
          );
        })}

      {/* Drawer slide boxes in depth */}
      {cfg.drawerCount > 0 &&
        drawerZoneH > 60 &&
        Array.from({ length: cfg.drawerCount }).map((_, idx) => {
          const eachH = drawerZoneH / cfg.drawerCount;
          const dy = yTop + upperZoneH + idx * eachH;
          const boxDepth = Math.max(180, Math.min(cfg.depthMm - 45, 500));
          return (
            <g key={`dr_${idx}`}>
              <rect
                x={xBack + cfg.depthMm - boxDepth}
                y={dy + 18}
                width={boxDepth - 6}
                height={Math.max(40, eachH - 34)}
                fill="#10B981"
                fillOpacity={0.18}
                stroke="#34D399"
                strokeWidth={5}
              />
              <line
                x1={xBack + cfg.depthMm - boxDepth}
                y1={dy + eachH * 0.65}
                x2={xBack + cfg.depthMm - 6}
                y2={dy + eachH * 0.65}
                stroke="#FBBF24"
                strokeWidth={5}
                strokeDasharray="16 10"
              />
            </g>
          );
        })}

      {/* Front panel thickness (18 mm) */}
      {hasFront && (
        <rect
          x={xBack + cfg.depthMm + 3}
          y={yTop + 2}
          width={18}
          height={Math.max(30, bodyHeightMm - 4)}
          fill="#F59E0B"
          fillOpacity={0.35}
          stroke="#FBBF24"
          strokeWidth={5}
        />
      )}

      {/* Plinth / Toe-kick recessed 55 mm from front */}
      {plinthH > 0 && (
        <rect
          x={xBack + 30}
          y={yTop + bodyHeightMm}
          width={Math.max(40, cfg.depthMm - 85)}
          height={plinthH}
          fill="#52525B"
          fillOpacity={0.5}
          stroke="#71717A"
          strokeWidth={5}
        />
      )}

      {/* Dimension callouts */}
      <text
        x={xBack + cfg.depthMm / 2}
        y={pad + totalH + 68}
        textAnchor="middle"
        fill="#FAFAFA"
        fontSize={Math.max(40, cfg.depthMm * 0.068)}
        fontFamily="JetBrains Mono, monospace"
        fontWeight={700}
      >
        Gł: {cfg.depthMm} mm
      </text>
      <text
        x={xBack - 26}
        y={pad + totalH / 2}
        textAnchor="end"
        fill="#7DD3FC"
        fontSize={Math.max(36, totalH * 0.048)}
        fontFamily="JetBrains Mono, monospace"
        fontWeight={700}
      >
        {totalH}
      </text>
    </svg>
  );
};
