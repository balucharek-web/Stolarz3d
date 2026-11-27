import React from 'react';
import type { ApplianceCategory, ApplianceModel } from '../types/furniture';

/** Compact labels for 2D floorplan toolbar chips (scannable on mobile & desktop) */
export const APPLIANCE_SHORT_LABELS: Record<ApplianceModel, string> = {
  // Kuchnia
  fridge_freezer: 'Lodówka',
  induction_hob: 'Indukcja',
  kitchen_sink: 'Zlew',
  builtin_oven: 'Piekarnik',
  dishwasher_60: 'Zmywarka',
  range_hood: 'Okap',
  microwave_builtin: 'Mikrofala',
  wire_cargo: 'Cargo',
  // Łazienka
  wc_geberit: 'WC Geberit',
  wc_low_cistern: 'WC Kompakt',
  wc_high_cistern: 'WC Górnopłuk',
  bathroom_sink: 'Umywalka',
  shower_cabin: 'Prysznic',
  bathtub_170: 'Wanna',
  washing_machine: 'Pralka',
  tumble_dryer: 'Suszarka',
  towel_radiator: 'Grz. drab.',
  led_mirror: 'Lustro LED',
  // Sypialnia / Garderoba
  wardrobe_rod: 'Drążek',
  bed_double: 'Łóżko 160',
  bed_single: 'Łóżko 90',
  dressing_bench: 'Ławka',
  // Salon / Biuro
  tv_65: 'TV 65"',
  sofa_3seat: 'Sofa 3-os.',
  office_chair: 'Fotel',
  desk_monitor_set: 'Monitor 27"',
  coffee_table: 'Stolik Ø80',
};

export const CATEGORY_ACCENT_HEX: Record<ApplianceCategory, { stroke: string; fill: string }> = {
  bathroom: { stroke: '#38BDF8', fill: '#0C4A6E' },
  kitchen: { stroke: '#F59E0B', fill: '#78350F' },
  wardrobe: { stroke: '#A78BFA', fill: '#4C1D95' },
  living: { stroke: '#34D399', fill: '#065F46' },
};

interface RoomAppliance2DSvgProps {
  model: ApplianceModel;
  category: ApplianceCategory;
  wPx: number;
  dPx: number;
  selected: boolean;
  ghost?: boolean;
  shortLabel?: string;
}

/**
 * Architectural top-down 2D CAD SVG symbol rendered centered around (0, 0).
 * Local -Y = back (wall side, -Z in 3D). Local +Y = front (+Z in 3D).
 * Local -X/+X = left/right (-X/+X in 3D).
 */
export const RoomAppliance2DSvg: React.FC<RoomAppliance2DSvgProps> = ({
  model,
  category,
  wPx,
  dPx,
  selected,
  ghost = false,
  shortLabel,
}) => {
  const w = Math.max(10, wPx);
  const d = Math.max(8, dPx);
  const hw = w / 2;
  const hd = d / 2;
  const accent = CATEGORY_ACCENT_HEX[category];
  const stroke = selected ? '#FBBF24' : ghost ? '#38BDF8' : accent.stroke;
  const baseFill = selected ? '#451A03' : ghost ? '#0C4A6E' : accent.fill;
  const fillOpacity = ghost ? 0.42 : selected ? 0.72 : 0.48;
  const strokeW = selected ? 2 : 1.25;
  const detailStroke = selected ? '#FDE68A' : ghost ? '#BAE6FD' : '#E2E8F0';

  const renderSymbol = () => {
    switch (model) {
      case 'bathtub_170': {
        const padX = Math.max(2.5, w * 0.08);
        const padY = Math.max(2.5, d * 0.14);
        const innerR = Math.min(w, d) * 0.24;
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={Math.min(6, d * 0.1)}
              fill="#F8FAFC"
              fillOpacity={ghost ? 0.35 : 0.85}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <rect
              x={-hw + padX}
              y={-hd + padY}
              width={Math.max(4, w - padX * 2)}
              height={Math.max(4, d - padY * 2)}
              rx={innerR}
              fill="#E0F2FE"
              fillOpacity={ghost ? 0.25 : 0.7}
              stroke="#64748B"
              strokeWidth={1}
            />
            {/* Drain circle & faucet mark */}
            <circle cx={-hw + padX + innerR * 0.65} cy={0} r={Math.max(1.8, Math.min(4, d * 0.06))} fill="#475569" />
            <line
              x1={-hw + 2}
              y1={0}
              x2={-hw + padX + 4}
              y2={0}
              stroke="#334155"
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </>
        );
      }

      case 'shower_cabin': {
        const pad = Math.max(2, Math.min(w, d) * 0.08);
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={2}
              fill="#E0F2FE"
              fillOpacity={ghost ? 0.28 : 0.45}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            {/* Diagonal tray drainage lines */}
            <line x1={-hw + pad} y1={-hd + pad} x2={hw - pad} y2={hd - pad} stroke="#7DD3FC" strokeWidth={0.75} strokeDasharray="3 3" />
            <line x1={hw - pad} y1={-hd + pad} x2={-hw + pad} y2={hd - pad} stroke="#7DD3FC" strokeWidth={0.75} strokeDasharray="3 3" />
            {/* Rain shower head circle */}
            <circle cx={0} cy={-hd * 0.2} r={Math.max(2.5, Math.min(w, d) * 0.13)} fill="none" stroke="#E0F2FE" strokeWidth={1.2} />
            <circle cx={0} cy={-hd * 0.2} r={Math.max(1, Math.min(w, d) * 0.035)} fill="#E0F2FE" />
            {/* Glass walk-in panel along front edge */}
            <line x1={-hw} y1={hd} x2={hw * 0.45} y2={hd} stroke="#38BDF8" strokeWidth={2.4} />
          </>
        );
      }

      case 'wc_geberit':
      case 'wc_low_cistern':
      case 'wc_high_cistern': {
        const tankH = model === 'wc_geberit' ? d * 0.3 : d * 0.27;
        const bowlStart = model === 'wc_high_cistern' ? -hd + d * 0.14 : -hd + tankH;
        const bowlLen = Math.max(4, hd - bowlStart);
        const bowlCy = bowlStart + bowlLen * 0.5;
        const rx = Math.max(3, Math.min(hw * 0.78, w * 0.44));
        const ry = Math.max(3.5, bowlLen * 0.48);
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={tankH}
              rx={1.5}
              fill={model === 'wc_geberit' ? '#64748B' : '#CBD5E1'}
              fillOpacity={model === 'wc_high_cistern' ? 0.35 : 0.85}
              stroke={stroke}
              strokeWidth={strokeW}
              strokeDasharray={model === 'wc_high_cistern' ? '3 2' : undefined}
            />
            <ellipse
              cx={0}
              cy={bowlCy}
              rx={rx}
              ry={ry}
              fill="#F8FAFC"
              fillOpacity={ghost ? 0.45 : 0.92}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <ellipse
              cx={0}
              cy={bowlCy + ry * 0.06}
              rx={rx * 0.62}
              ry={ry * 0.62}
              fill="none"
              stroke="#64748B"
              strokeWidth={0.9}
            />
          </>
        );
      }

      case 'bathroom_sink': {
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={Math.min(w, d) * 0.22}
              fill="#F8FAFC"
              fillOpacity={ghost ? 0.4 : 0.9}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <ellipse
              cx={0}
              cy={d * 0.06}
              rx={Math.max(3, hw * 0.74)}
              ry={Math.max(2.5, hd * 0.62)}
              fill="#E0F2FE"
              fillOpacity={0.7}
              stroke="#64748B"
              strokeWidth={0.95}
            />
            <circle cx={0} cy={-hd + d * 0.22} r={Math.max(1.5, Math.min(3, d * 0.08))} fill="#334155" />
          </>
        );
      }

      case 'washing_machine':
      case 'tumble_dryer': {
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={2}
              fill="#E2E8F0"
              fillOpacity={ghost ? 0.35 : 0.84}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            {/* Top drum circle */}
            <circle
              cx={0}
              cy={0}
              r={Math.max(3, Math.min(hw, hd) * 0.62)}
              fill={model === 'washing_machine' ? '#BAE6FD' : '#CBD5E1'}
              fillOpacity={0.6}
              stroke="#475569"
              strokeWidth={1.1}
            />
            {/* Front door bulge indicator (+Y = front) */}
            <line
              x1={-hw * 0.55}
              y1={hd}
              x2={hw * 0.55}
              y2={hd}
              stroke={selected ? '#F59E0B' : '#0284C7'}
              strokeWidth={2.4}
              strokeLinecap="round"
            />
          </>
        );
      }

      case 'towel_radiator':
      case 'led_mirror': {
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={1.5}
              fill={model === 'led_mirror' ? '#E0F2FE' : '#475569'}
              fillOpacity={ghost ? 0.45 : 0.9}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <line
              x1={-hw + 2}
              y1={0}
              x2={hw - 2}
              y2={0}
              stroke={model === 'led_mirror' ? '#FDE68A' : '#CBD5E1'}
              strokeWidth={1.4}
            />
          </>
        );
      }

      case 'fridge_freezer': {
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={2}
              fill="#94A3B8"
              fillOpacity={ghost ? 0.35 : 0.78}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            {/* Diagonal "REF" architectural cross */}
            <line x1={-hw} y1={-hd} x2={hw} y2={hd} stroke="#334155" strokeWidth={0.85} />
            <line x1={hw} y1={-hd} x2={-hw} y2={hd} stroke="#334155" strokeWidth={0.85} />
            {/* Front door seam line */}
            <line
              x1={-hw + 2}
              y1={hd - Math.max(2, d * 0.12)}
              x2={hw - 2}
              y2={hd - Math.max(2, d * 0.12)}
              stroke={detailStroke}
              strokeWidth={1.3}
            />
          </>
        );
      }

      case 'induction_hob': {
        const rBig = Math.max(2.2, Math.min(w, d) * 0.18);
        const rSmall = Math.max(1.8, Math.min(w, d) * 0.14);
        const ox = w * 0.24;
        const oy = d * 0.22;
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={2}
              fill="#18181B"
              fillOpacity={ghost ? 0.55 : 0.92}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <circle cx={-ox} cy={-oy} r={rBig} fill="none" stroke="#F59E0B" strokeWidth={1.1} />
            <circle cx={ox} cy={-oy} r={rSmall} fill="none" stroke="#F59E0B" strokeWidth={1.1} />
            <circle cx={-ox} cy={oy} r={rSmall} fill="none" stroke="#F59E0B" strokeWidth={1.1} />
            <circle cx={ox} cy={oy} r={rBig} fill="none" stroke="#F59E0B" strokeWidth={1.1} />
          </>
        );
      }

      case 'kitchen_sink': {
        const padX = Math.max(2, w * 0.1);
        const padY = Math.max(2, d * 0.14);
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={2.5}
              fill="#CBD5E1"
              fillOpacity={ghost ? 0.4 : 0.85}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <rect
              x={-hw + padX}
              y={-hd + padY}
              width={Math.max(4, w - padX * 2)}
              height={Math.max(4, d - padY * 1.8)}
              rx={3}
              fill="#475569"
              fillOpacity={0.75}
              stroke="#E2E8F0"
              strokeWidth={0.95}
            />
            {/* Drain + faucet */}
            <circle cx={0} cy={0} r={Math.max(1.5, Math.min(3.5, d * 0.08))} fill="#CBD5E1" />
            <line x1={0} y1={-hd + 1.5} x2={0} y2={-hd + padY + 3} stroke="#0F172A" strokeWidth={1.8} strokeLinecap="round" />
          </>
        );
      }

      case 'builtin_oven':
      case 'dishwasher_60':
      case 'microwave_builtin':
      case 'range_hood':
      case 'wire_cargo': {
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={2}
              fill={baseFill}
              fillOpacity={fillOpacity}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            {/* Front panel bar indicator (+Y) */}
            <line
              x1={-hw + 2}
              y1={hd - Math.max(2, d * 0.12)}
              x2={hw - 2}
              y2={hd - Math.max(2, d * 0.12)}
              stroke={detailStroke}
              strokeWidth={1.6}
            />
            {model === 'range_hood' && (
              <rect
                x={-w * 0.24}
                y={-hd + 2}
                width={w * 0.48}
                height={d * 0.45}
                fill="none"
                stroke={detailStroke}
                strokeWidth={0.9}
                strokeDasharray="2 2"
              />
            )}
          </>
        );
      }

      case 'bed_double':
      case 'bed_single': {
        const headH = Math.max(3, d * 0.08);
        const pillowH = Math.max(4, d * 0.18);
        const pillowGap = Math.max(2, w * 0.06);
        const isDouble = model === 'bed_double';
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={3}
              fill="#312E81"
              fillOpacity={ghost ? 0.35 : 0.65}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            {/* Headboard at -Y */}
            <rect x={-hw} y={-hd} width={w} height={headH} fill="#6D28D9" fillOpacity={0.85} />
            {/* Pillows */}
            {isDouble ? (
              <>
                <rect
                  x={-hw + pillowGap}
                  y={-hd + headH + 2}
                  width={Math.max(4, hw - pillowGap * 1.5)}
                  height={pillowH}
                  rx={2.5}
                  fill="#EDE9FE"
                  fillOpacity={0.85}
                  stroke="#7C3AED"
                  strokeWidth={0.8}
                />
                <rect
                  x={pillowGap * 0.5}
                  y={-hd + headH + 2}
                  width={Math.max(4, hw - pillowGap * 1.5)}
                  height={pillowH}
                  rx={2.5}
                  fill="#EDE9FE"
                  fillOpacity={0.85}
                  stroke="#7C3AED"
                  strokeWidth={0.8}
                />
              </>
            ) : (
              <rect
                x={-hw + pillowGap}
                y={-hd + headH + 2}
                width={Math.max(4, w - pillowGap * 2)}
                height={pillowH}
                rx={2.5}
                fill="#EDE9FE"
                fillOpacity={0.85}
                stroke="#7C3AED"
                strokeWidth={0.8}
              />
            )}
            {/* Folded blanket crease */}
            <line
              x1={-hw + 2}
              y1={-hd + headH + pillowH + d * 0.14}
              x2={hw - 2}
              y2={-hd + headH + pillowH + d * 0.14}
              stroke="#C4B5FD"
              strokeWidth={1}
            />
          </>
        );
      }

      case 'sofa_3seat': {
        const backH = Math.max(4, d * 0.24);
        const armW = Math.max(4, w * 0.1);
        const seatW = Math.max(6, w - armW * 2);
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={4}
              fill="#064E3B"
              fillOpacity={ghost ? 0.38 : 0.72}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            {/* Backrest & armrests */}
            <rect x={-hw} y={-hd} width={w} height={backH} rx={2} fill="#047857" fillOpacity={0.85} />
            <rect x={-hw} y={-hd} width={armW} height={d} rx={2} fill="#047857" fillOpacity={0.8} />
            <rect x={hw - armW} y={-hd} width={armW} height={d} rx={2} fill="#047857" fillOpacity={0.8} />
            {/* 3 seat cushion dividers */}
            <line x1={-hw + armW + seatW / 3} y1={-hd + backH} x2={-hw + armW + seatW / 3} y2={hd - 1} stroke="#6EE7B7" strokeWidth={0.9} />
            <line x1={-hw + armW + (seatW * 2) / 3} y1={-hd + backH} x2={-hw + armW + (seatW * 2) / 3} y2={hd - 1} stroke="#6EE7B7" strokeWidth={0.9} />
          </>
        );
      }

      case 'coffee_table': {
        const r = Math.max(4, Math.min(hw, hd));
        return (
          <>
            <circle
              cx={0}
              cy={0}
              r={r}
              fill="#92400E"
              fillOpacity={ghost ? 0.35 : 0.65}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <circle cx={0} cy={0} r={r * 0.72} fill="none" stroke="#D97706" strokeWidth={0.7} strokeDasharray="3 2" />
          </>
        );
      }

      case 'office_chair': {
        const r = Math.max(4, Math.min(hw, hd) * 0.85);
        return (
          <>
            <circle
              cx={0}
              cy={0}
              r={r}
              fill="#065F46"
              fillOpacity={ghost ? 0.35 : 0.7}
              stroke={stroke}
              strokeWidth={strokeW}
            />
            {/* Backrest arc at -Y */}
            <path
              d={`M ${-r * 0.75} ${-r * 0.3} Q 0 ${-r * 1.05} ${r * 0.75} ${-r * 0.3}`}
              fill="none"
              stroke="#A7F3D0"
              strokeWidth={2}
              strokeLinecap="round"
            />
          </>
        );
      }

      case 'tv_65':
      case 'desk_monitor_set': {
        return (
          <>
            <rect
              x={-hw}
              y={-hd}
              width={w}
              height={d}
              rx={1.5}
              fill={baseFill}
              fillOpacity={0.32}
              stroke={stroke}
              strokeWidth={1}
              strokeDasharray="3 2"
            />
            {/* Slim screen bar near back (-Y) */}
            <rect
              x={-hw + 2}
              y={-hd + d * 0.16}
              width={Math.max(4, w - 4)}
              height={Math.max(2.5, d * 0.24)}
              rx={1}
              fill="#0F172A"
              stroke="#34D399"
              strokeWidth={1.2}
            />
          </>
        );
      }

      default:
        return (
          <rect
            x={-hw}
            y={-hd}
            width={w}
            height={d}
            rx={2}
            fill={baseFill}
            fillOpacity={fillOpacity}
            stroke={stroke}
            strokeWidth={strokeW}
          />
        );
    }
  };

  // Subtle directional front chevron (+Y) when selected or ghost so rotation is unmistakable
  const showFrontArrow = selected || ghost;
  const showText = w >= 34 && d >= 20 && Boolean(shortLabel);

  return (
    <g>
      {renderSymbol()}
      {showFrontArrow && (
        <polygon
          points={`-4,${hd + 2} 4,${hd + 2} 0,${hd + 7}`}
          fill={selected ? '#FBBF24' : '#38BDF8'}
        />
      )}
      {showText && (
        <text
          x={0}
          y={3}
          textAnchor="middle"
          fill={selected ? '#FEF3C7' : '#F8FAFC'}
          fontSize={Math.max(8, Math.min(10.5, w * 0.16))}
          fontWeight="600"
          pointerEvents="none"
          style={{
            paintOrder: 'stroke',
            stroke: '#09090B',
            strokeWidth: 2.5,
            strokeLinejoin: 'round',
          }}
        >
          {shortLabel}
        </text>
      )}
    </g>
  );
};
