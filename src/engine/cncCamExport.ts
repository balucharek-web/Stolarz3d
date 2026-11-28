import {
  FurnitureProject,
  getMaterialMeta,
} from '../types/furniture';
import {
  extractBoardDrillingMap,
  getBoardOutline2D,
  getDadoGrooveLine2D,
  getLedGrooveLine2D,
  type BoardDrillingMap,
} from './documentation';
import { isMaterialGrainDirectional, type CarpentryCutSpec } from './nesting';

export type CncMachineFormat = 'mpr' | 'cix' | 'nc';
export type SawOptimizerFormat = 'rozkroj_pl' | 'cutlist_optimizer' | 'opticut';

function sanitizeFileSlug(raw: string): string {
  const cleaned = raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'element';
}

function fmt(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2).replace(/\.00$/, '');
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

/* ==================== PURE-TS UNCOMPRESSED ZIP (STORE MODE, CRC32) ==================== */

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export function buildZipBlob(entries: Array<{ name: string; content: string }>): Blob {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  const now = new Date();
  const dosTime =
    ((now.getHours() & 0x1f) << 11) |
    ((now.getMinutes() & 0x3f) << 5) |
    ((now.getSeconds() >> 1) & 0x1f);
  const dosDate =
    (((Math.max(1980, now.getFullYear()) - 1980) & 0x7f) << 9) |
    (((now.getMonth() + 1) & 0x0f) << 5) |
    (now.getDate() & 0x1f);

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    const crc = crc32(dataBytes);

    // Local file header (30 bytes + name)
    const lh = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // UTF-8 flag
    lv.setUint16(8, 0, true); // compression: store
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, dataBytes.length, true);
    lv.setUint32(22, dataBytes.length, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    lh.set(nameBytes, 30);

    localParts.push(lh, dataBytes);

    // Central directory header (46 bytes + name)
    const ch = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, dataBytes.length, true);
    cv.setUint32(24, dataBytes.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    ch.set(nameBytes, 46);
    centralParts.push(ch);

    offset += lh.length + dataBytes.length;
  }

  const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const blobParts: BlobPart[] = [
    ...localParts.map((u) => u.buffer as ArrayBuffer),
    ...centralParts.map((u) => u.buffer as ArrayBuffer),
    eocd.buffer as ArrayBuffer,
  ];
  return new Blob(blobParts, { type: 'application/zip' });
}

/* ==================== 1. HOMAG WOODWOP (.mpr) ==================== */

export function generateWoodWopMpr(map: BoardDrillingMap, projectName: string): string {
  const L = map.faceWidthMm;
  const B = map.faceHeightMm;
  const D = map.thicknessMm;
  const lines: string[] = [];

  lines.push('[H');
  lines.push('VERSION="4.0 Alpha"');
  lines.push('WW="6.0"');
  lines.push('OP="1"');
  lines.push('FM="1"');
  lines.push('ML="2000"');
  lines.push('MAT="WEEKE"');
  lines.push(`IN="${projectName.replace(/"/g, '')} - ${map.part.name.replace(/"/g, '')}"`);
  lines.push('');
  lines.push('[001');
  lines.push(`L="${fmt(L)}"`);
  lines.push('KM="Dlugosc formatki (X)"');
  lines.push(`B="${fmt(B)}"`);
  lines.push('KM="Szerokosc formatki (Y)"');
  lines.push(`D="${fmt(D)}"`);
  lines.push('KM="Grubosc plyty (Z)"');
  lines.push('');
  lines.push('<100 \\WerkStck\\');
  lines.push('LA="L"');
  lines.push('BR="B"');
  lines.push('DI="D"');
  lines.push('FNX="0"');
  lines.push('FNY="0"');
  lines.push('AX="0"');
  lines.push('AY="0"');
  lines.push('');

  // Vertical & Horizontal drillings
  for (const h of map.holes) {
    if (h.face === 'Krawędź') {
      // Determine nearest edge for WoodWOP horizontal bore direction (XP / XM / YP / YM)
      const dLeft = h.xMm;
      const dRight = Math.max(0, L - h.xMm);
      const dBottom = h.yMm;
      const dTop = Math.max(0, B - h.yMm);
      const minDist = Math.min(dLeft, dRight, dBottom, dTop);
      let bm = 'XP';
      let xa = h.xMm;
      let ya = h.yMm;
      if (minDist === dLeft) {
        bm = 'XP';
        xa = 0;
      } else if (minDist === dRight) {
        bm = 'XM';
        xa = L;
      } else if (minDist === dBottom) {
        bm = 'YP';
        ya = 0;
      } else {
        bm = 'YM';
        ya = B;
      }
      lines.push('<103 \\BohrHoriz\\');
      lines.push(`XA="${fmt(xa)}"`);
      lines.push(`YA="${fmt(ya)}"`);
      lines.push(`ZA="${fmt(D / 2)}"`);
      lines.push(`DU="${fmt(h.diameterMm)}"`);
      lines.push(`TI="${fmt(h.depthMm)}"`);
      lines.push(`BM="${bm}"`);
      lines.push('AN="1"');
      lines.push(`KM="${h.label.replace(/"/g, '')}"`);
      lines.push('');
    } else {
      const bm = h.depthMm >= D ? 'LSU' : 'LS';
      lines.push('<102 \\BohrVert\\');
      lines.push(`XA="${fmt(h.xMm)}"`);
      lines.push(`YA="${fmt(h.yMm)}"`);
      lines.push(`BM="${bm}"`);
      lines.push(`TI="${fmt(Math.min(D + 2, h.depthMm))}"`);
      lines.push(`DU="${fmt(h.diameterMm)}"`);
      lines.push('AN="1"');
      lines.push(`KM="${h.label.replace(/"/g, '')} (${h.face})"`);
      lines.push('');
    }
  }

  // Dado groove (<109 \Nuten\)
  const dado = getDadoGrooveLine2D(map.part, map.thinAxis, L, B);
  if (dado && map.part.dadoGroove?.enabled) {
    lines.push('<109 \\Nuten\\');
    lines.push(`XA="${fmt(dado.x1)}"`);
    lines.push(`YA="${fmt(dado.y1)}"`);
    lines.push(`XE="${fmt(dado.x2)}"`);
    lines.push(`YE="${fmt(dado.y2)}"`);
    lines.push(`NB="${fmt(dado.widthMm)}"`);
    lines.push(`TI="${fmt(dado.depthMm)}"`);
    lines.push('RK="NOWRK"');
    lines.push('BM="MID"');
    lines.push('KM="Nut pod plecy HDF"');
    lines.push('');
  }

  // Recessed LED channel groove (<109 \Nuten\)
  const led = getLedGrooveLine2D(map.part, map.thinAxis, L, B);
  if (led && map.part.ledGroove?.enabled) {
    lines.push('<109 \\Nuten\\');
    lines.push(`XA="${fmt(led.x1)}"`);
    lines.push(`YA="${fmt(led.y1)}"`);
    lines.push(`XE="${fmt(led.x2)}"`);
    lines.push(`YE="${fmt(led.y2)}"`);
    lines.push(`NB="${fmt(led.widthMm)}"`);
    lines.push(`TI="${fmt(led.depthMm)}"`);
    lines.push('RK="NOWRK"');
    lines.push('BM="MID"');
    lines.push('KM="Frez pod profil LED"');
    lines.push('');
  }

  // Internal cutouts (<112 \Tasche\ pocket / through cutout)
  for (const c of map.cutouts) {
    const cx = L / 2 + c.xMm;
    const cy = B / 2 + c.yMm;
    const cw = c.shape === 'circle' ? c.diameterMm ?? c.widthMm : c.widthMm;
    const ch = c.shape === 'circle' ? c.diameterMm ?? c.heightMm : c.heightMm;
    const rad = c.shape === 'circle' ? cw / 2 : 8;
    lines.push('<112 \\Tasche\\');
    lines.push(`XA="${fmt(cx)}"`);
    lines.push(`YA="${fmt(cy)}"`);
    lines.push(`LA="${fmt(cw)}"`);
    lines.push(`BR="${fmt(ch)}"`);
    lines.push(`RD="${fmt(rad)}"`);
    lines.push(`TI="${fmt(D + 1)}"`);
    lines.push('WI="0"');
    lines.push('T_="101"');
    lines.push(`KM="Wyciecie: ${(c.label || (c.shape === 'circle' ? 'Otwor okragly' : 'Prostokat')).replace(/"/g, '')}"`);
    lines.push('');
  }

  lines.push('!');
  return lines.join('\r\n');
}

/* ==================== 2. BIESSE bSolid / BiesseWorks (.cix) ==================== */

export function generateBiesseCix(map: BoardDrillingMap, projectName: string): string {
  const L = map.faceWidthMm;
  const B = map.faceHeightMm;
  const D = map.thicknessMm;
  const lines: string[] = [];

  lines.push('BEGIN ID CID3');
  lines.push('  REL= 5.0');
  lines.push('END ID');
  lines.push('');
  lines.push('BEGIN MAINDATA');
  lines.push(`  LPX=${fmt(L)}`);
  lines.push(`  LPY=${fmt(B)}`);
  lines.push(`  LPZ=${fmt(D)}`);
  lines.push('  ORLST="1"');
  lines.push('  SIMMETRY=1');
  lines.push('  TLCHK=0');
  lines.push(`  TOOLING="${projectName.replace(/"/g, '')} - ${map.part.name.replace(/"/g, '')}"`);
  lines.push('  CUSTSTR=$B$KBsRug$');
  lines.push('  FCN=1.000000');
  lines.push('  XCUT=0');
  lines.push('  YCUT=0');
  lines.push('  JIGTH=0');
  lines.push('  CKOP=0');
  lines.push('  UNIQUE=0');
  lines.push('  MATERIAL="wood"');
  lines.push('END MAINDATA');
  lines.push('');

  let opIdx = 1;

  for (const h of map.holes) {
    const isEdge = h.face === 'Krawędź';
    if (isEdge) {
      const dLeft = h.xMm;
      const dRight = Math.max(0, L - h.xMm);
      const dBottom = h.yMm;
      const dTop = Math.max(0, B - h.yMm);
      const minDist = Math.min(dLeft, dRight, dBottom, dTop);
      // Biesse side index: 1=Left(-X), 2=Top(+Y), 3=Right(+X), 4=Bottom(-Y)
      const side = minDist === dLeft ? 1 : minDist === dTop ? 2 : minDist === dRight ? 3 : 4;
      lines.push('BEGIN MACRO');
      lines.push('  NAME=BH');
      lines.push(`  PARAM,NAME=ID,VALUE="BH_${opIdx++}"`);
      lines.push(`  PARAM,NAME=SIDE,VALUE=${side}`);
      lines.push('  PARAM,NAME=CRN,VALUE="1"');
      lines.push(`  PARAM,NAME=X,VALUE=${fmt(h.xMm)}`);
      lines.push(`  PARAM,NAME=Y,VALUE=${fmt(h.yMm)}`);
      lines.push(`  PARAM,NAME=Z,VALUE=${fmt(D / 2)}`);
      lines.push(`  PARAM,NAME=DP,VALUE=${fmt(h.depthMm)}`);
      lines.push(`  PARAM,NAME=DIA,VALUE=${fmt(h.diameterMm)}`);
      lines.push('  PARAM,NAME=THR,VALUE=NO');
      lines.push('  PARAM,NAME=OPT,VALUE=YES');
      lines.push('END MACRO');
      lines.push('');
    } else {
      lines.push('BEGIN MACRO');
      lines.push('  NAME=BG');
      lines.push(`  PARAM,NAME=ID,VALUE="BG_${opIdx++}"`);
      lines.push('  PARAM,NAME=SIDE,VALUE=0');
      lines.push('  PARAM,NAME=CRN,VALUE="1"');
      lines.push(`  PARAM,NAME=X,VALUE=${fmt(h.xMm)}`);
      lines.push(`  PARAM,NAME=Y,VALUE=${fmt(h.yMm)}`);
      lines.push('  PARAM,NAME=Z,VALUE=0');
      lines.push(`  PARAM,NAME=DP,VALUE=${fmt(Math.min(D + 2, h.depthMm))}`);
      lines.push(`  PARAM,NAME=DIA,VALUE=${fmt(h.diameterMm)}`);
      lines.push(`  PARAM,NAME=THR,VALUE=${h.depthMm >= D ? 'YES' : 'NO'}`);
      lines.push('  PARAM,NAME=RTY,VALUE=rpNO');
      lines.push('  PARAM,NAME=OPT,VALUE=YES');
      lines.push('END MACRO');
      lines.push('');
    }
  }

  // Dado & LED grooves via CUT_G macro
  const grooves = [
    { line: getDadoGrooveLine2D(map.part, map.thinAxis, L, B), enabled: Boolean(map.part.dadoGroove?.enabled), tag: 'DADO' },
    { line: getLedGrooveLine2D(map.part, map.thinAxis, L, B), enabled: Boolean(map.part.ledGroove?.enabled), tag: 'LED' },
  ];
  for (const g of grooves) {
    if (!g.enabled || !g.line) continue;
    lines.push('BEGIN MACRO');
    lines.push('  NAME=CUT_G');
    lines.push(`  PARAM,NAME=ID,VALUE="${g.tag}_${opIdx++}"`);
    lines.push('  PARAM,NAME=SIDE,VALUE=0');
    lines.push('  PARAM,NAME=CRN,VALUE="1"');
    lines.push(`  PARAM,NAME=X,VALUE=${fmt(g.line.x1)}`);
    lines.push(`  PARAM,NAME=Y,VALUE=${fmt(g.line.y1)}`);
    lines.push(`  PARAM,NAME=XE,VALUE=${fmt(g.line.x2)}`);
    lines.push(`  PARAM,NAME=YE,VALUE=${fmt(g.line.y2)}`);
    lines.push(`  PARAM,NAME=DP,VALUE=${fmt(g.line.depthMm)}`);
    lines.push(`  PARAM,NAME=TH,VALUE=${fmt(g.line.widthMm)}`);
    lines.push('  PARAM,NAME=CRC,VALUE=0');
    lines.push('END MACRO');
    lines.push('');
  }

  // Internal cutouts via GEO + ROUT
  for (const c of map.cutouts) {
    const geoId = `CUT_${opIdx++}`;
    const cx = L / 2 + c.xMm;
    const cy = B / 2 + c.yMm;
    lines.push('BEGIN MACRO');
    lines.push('  NAME=GEO');
    lines.push(`  PARAM,NAME=ID,VALUE="${geoId}"`);
    lines.push('  PARAM,NAME=SIDE,VALUE=0');
    lines.push('  PARAM,NAME=CRN,VALUE="1"');
    lines.push(`  PARAM,NAME=DP,VALUE=${fmt(D + 1)}`);
    lines.push('END MACRO');

    if (c.shape === 'circle') {
      const r = (c.diameterMm ?? c.widthMm) / 2;
      lines.push('BEGIN MACRO');
      lines.push('  NAME=CIRCLE_CR');
      lines.push(`  PARAM,NAME=XC,VALUE=${fmt(cx)}`);
      lines.push(`  PARAM,NAME=YC,VALUE=${fmt(cy)}`);
      lines.push(`  PARAM,NAME=R,VALUE=${fmt(r)}`);
      lines.push('  PARAM,NAME=DIR,VALUE=dirCW');
      lines.push('END MACRO');
    } else {
      const x0 = cx - c.widthMm / 2;
      const y0 = cy - c.heightMm / 2;
      const x1 = cx + c.widthMm / 2;
      const y1 = cy + c.heightMm / 2;
      lines.push('BEGIN MACRO');
      lines.push('  NAME=START_POINT');
      lines.push(`  PARAM,NAME=X,VALUE=${fmt(x0)}`);
      lines.push(`  PARAM,NAME=Y,VALUE=${fmt(y0)}`);
      lines.push('END MACRO');
      for (const [tx, ty] of [
        [x1, y0],
        [x1, y1],
        [x0, y1],
        [x0, y0],
      ]) {
        lines.push('BEGIN MACRO');
        lines.push('  NAME=LINE_EP');
        lines.push(`  PARAM,NAME=XE,VALUE=${fmt(tx)}`);
        lines.push(`  PARAM,NAME=YE,VALUE=${fmt(ty)}`);
        lines.push('END MACRO');
      }
    }

    lines.push('BEGIN MACRO');
    lines.push('  NAME=ENDPATH');
    lines.push('END MACRO');
    lines.push('BEGIN MACRO');
    lines.push('  NAME=ROUT');
    lines.push(`  PARAM,NAME=ID,VALUE="ROUT_${opIdx++}"`);
    lines.push(`  PARAM,NAME=GID,VALUE="${geoId}"`);
    lines.push('  PARAM,NAME=SIDE,VALUE=0');
    lines.push(`  PARAM,NAME=DP,VALUE=${fmt(D + 1)}`);
    lines.push('  PARAM,NAME=CRC,VALUE=2');
    lines.push('  PARAM,NAME=DIA,VALUE=8');
    lines.push('  PARAM,NAME=THR,VALUE=YES');
    lines.push('END MACRO');
    lines.push('');
  }

  return lines.join('\r\n');
}

/* ==================== 3. ISO G-CODE (.nc) ==================== */

export function generateIsoGCode(map: BoardDrillingMap, projectName: string): string {
  const L = map.faceWidthMm;
  const B = map.faceHeightMm;
  const D = map.thicknessMm;
  const safeZ = 20;
  const retractZ = 5;
  const lines: string[] = [];

  lines.push('%');
  lines.push(`(STOLARZ3D PROJEKT - ISO G-CODE CNC)`);
  lines.push(`(PROJEKT: ${projectName.toUpperCase().replace(/[()]/g, '')})`);
  lines.push(`(FORMATKA: ${map.part.name.replace(/[()]/g, '')} | ${fmt(L)}x${fmt(B)}x${fmt(D)} mm)`);
  lines.push(`(ZERO DETALU G54: LEWY DOLNY ROG X0 Y0, GORA PLYTY Z0)`);
  lines.push('G21 G90 G17 G40 G49 G80');
  lines.push('G54');
  lines.push(`G00 Z${fmt(safeZ)}`);
  lines.push('');

  // Group vertical holes by diameter so tool changes are minimized
  const verticalByDia = new Map<number, typeof map.holes>();
  for (const h of map.holes) {
    if (h.face === 'Krawędź') continue;
    const d = Math.round(h.diameterMm * 10) / 10;
    const arr = verticalByDia.get(d) ?? [];
    arr.push(h);
    verticalByDia.set(d, arr);
  }

  let toolNum = 1;
  for (const [dia, holes] of Array.from(verticalByDia.entries()).sort((a, b) => a[0] - b[0])) {
    const rpm = dia >= 25 ? 6000 : dia >= 12 ? 9000 : 14000;
    const feed = dia >= 25 ? 600 : 1200;
    lines.push(`(WIERCENIE PIONOWE FI ${fmt(dia)} mm - ${holes.length} OTW.)`);
    lines.push(`T${String(toolNum).padStart(2, '0')} M06`);
    lines.push(`S${rpm} M03`);
    lines.push(`G00 Z${fmt(safeZ)}`);

    for (const h of holes) {
      const zDepth = -Math.min(D + 1.5, h.depthMm);
      lines.push(`(OTWOR: ${h.label.replace(/[()]/g, '')})`);
      lines.push(`G00 X${fmt(h.xMm)} Y${fmt(h.yMm)}`);
      lines.push(`G83 X${fmt(h.xMm)} Y${fmt(h.yMm)} Z${fmt(zDepth)} R${fmt(retractZ)} Q6 F${feed}`);
    }
    lines.push('G80');
    lines.push(`G00 Z${fmt(safeZ)}`);
    lines.push('M05');
    lines.push('');
    toolNum++;
  }

  // Grooves (Dado + LED) & Cutouts via Endmill
  const dado = getDadoGrooveLine2D(map.part, map.thinAxis, L, B);
  const led = getLedGrooveLine2D(map.part, map.thinAxis, L, B);
  const hasRouting =
    (dado && map.part.dadoGroove?.enabled) ||
    (led && map.part.ledGroove?.enabled) ||
    map.cutouts.length > 0 ||
    map.part.kind === 'sloped' ||
    map.part.kind === 'custom';

  if (hasRouting) {
    lines.push(`(FREZOWANIE NUTOW, LED I WYCINANIE KONTUROW - FREZ PALCOWY FI 6 mm)`);
    lines.push(`T${String(toolNum).padStart(2, '0')} M06`);
    lines.push('S18000 M03');
    lines.push(`G00 Z${fmt(safeZ)}`);

    const emitSlot = (
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      depth: number,
      comment: string
    ) => {
      lines.push(`(${comment})`);
      lines.push(`G00 X${fmt(x1)} Y${fmt(y1)}`);
      lines.push(`G00 Z${fmt(retractZ)}`);
      const passes = Math.max(1, Math.ceil(depth / 5));
      for (let p = 1; p <= passes; p++) {
        const z = -(depth * p) / passes;
        const rev = p % 2 === 0;
        lines.push(`G01 Z${fmt(z)} F900`);
        lines.push(`G01 X${fmt(rev ? x1 : x2)} Y${fmt(rev ? y1 : y2)} F2400`);
      }
      lines.push(`G00 Z${fmt(safeZ)}`);
    };

    if (dado && map.part.dadoGroove?.enabled) {
      emitSlot(dado.x1, dado.y1, dado.x2, dado.y2, dado.depthMm, `NUT HDF ${dado.widthMm}x${dado.depthMm} mm`);
    }
    if (led && map.part.ledGroove?.enabled) {
      emitSlot(led.x1, led.y1, led.x2, led.y2, led.depthMm, `FREZ PROFIL LED ${led.widthMm}x${led.depthMm} mm`);
    }

    for (const c of map.cutouts) {
      const cx = L / 2 + c.xMm;
      const cy = B / 2 + c.yMm;
      const cutDepth = D + 0.8;
      const passes = Math.max(2, Math.ceil(cutDepth / 6));
      lines.push(`(WYCIECIE WEWNETRZNE: ${(c.label || c.shape).replace(/[()]/g, '')})`);
      if (c.shape === 'circle') {
        const r = Math.max(3, (c.diameterMm ?? c.widthMm) / 2 - 3);
        lines.push(`G00 X${fmt(cx + r)} Y${fmt(cy)}`);
        lines.push(`G00 Z${fmt(retractZ)}`);
        for (let p = 1; p <= passes; p++) {
          const z = -(cutDepth * p) / passes;
          lines.push(`G01 Z${fmt(z)} F800`);
          lines.push(`G02 X${fmt(cx + r)} Y${fmt(cy)} I${fmt(-r)} J0 F2000`);
        }
      } else {
        const x0 = cx - c.widthMm / 2 + 3;
        const y0 = cy - c.heightMm / 2 + 3;
        const x1 = cx + c.widthMm / 2 - 3;
        const y1 = cy + c.heightMm / 2 - 3;
        lines.push(`G00 X${fmt(x0)} Y${fmt(y0)}`);
        lines.push(`G00 Z${fmt(retractZ)}`);
        for (let p = 1; p <= passes; p++) {
          const z = -(cutDepth * p) / passes;
          lines.push(`G01 Z${fmt(z)} F800`);
          lines.push(`G01 X${fmt(x1)} Y${fmt(y0)} F2200`);
          lines.push(`G01 X${fmt(x1)} Y${fmt(y1)}`);
          lines.push(`G01 X${fmt(x0)} Y${fmt(y1)}`);
          lines.push(`G01 X${fmt(x0)} Y${fmt(y0)}`);
        }
      }
      lines.push(`G00 Z${fmt(safeZ)}`);
    }

    // Sloped or custom 2D contour outline
    if (map.part.kind === 'sloped' || map.part.kind === 'custom') {
      const poly = getBoardOutline2D(map.part, L, B);
      if (poly.length >= 3) {
        const cutDepth = D + 0.8;
        const passes = Math.max(2, Math.ceil(cutDepth / 6));
        lines.push(`(KONTUR ZEWNETRZNY SKOS / KSZTALT 2D)`);
        lines.push(`G00 X${fmt(poly[0][0])} Y${fmt(poly[0][1])}`);
        lines.push(`G00 Z${fmt(retractZ)}`);
        for (let p = 1; p <= passes; p++) {
          const z = -(cutDepth * p) / passes;
          lines.push(`G01 Z${fmt(z)} F800`);
          for (let i = 1; i < poly.length; i++) {
            lines.push(`G01 X${fmt(poly[i][0])} Y${fmt(poly[i][1])} F2400`);
          }
          lines.push(`G01 X${fmt(poly[0][0])} Y${fmt(poly[0][1])}`);
        }
        lines.push(`G00 Z${fmt(safeZ)}`);
      }
    }

    lines.push('M05');
  }

  lines.push('G00 X0 Y0');
  lines.push('M30');
  lines.push('%');
  return lines.join('\r\n');
}

export function exportSingleBoardCnc(
  map: BoardDrillingMap,
  projectName: string,
  format: CncMachineFormat,
  boardIndex: number
): string {
  const code =
    format === 'mpr'
      ? generateWoodWopMpr(map, projectName)
      : format === 'cix'
        ? generateBiesseCix(map, projectName)
        : generateIsoGCode(map, projectName);
  const filename = `${String(boardIndex).padStart(2, '0')}_${sanitizeFileSlug(map.part.name)}_${map.faceWidthMm}x${map.faceHeightMm}.${format}`;
  triggerDownload(new Blob([code], { type: 'text/plain;charset=utf-8' }), filename);
  return filename;
}

export function exportProjectCncZip(
  project: FurnitureProject,
  format: CncMachineFormat
): { filename: string; boardCount: number } {
  const boards = project.parts.filter((p) => p.kind !== 'appliance' && p.kind !== 'profile');
  const entries: Array<{ name: string; content: string }> = [];

  const manifestLines: string[] = [
    `STOLARZ3D PROJEKT — PACZKA CNC (${format.toUpperCase()})`,
    `Projekt: ${project.name}`,
    `Data: ${new Date().toLocaleString('pl-PL')}`,
    `Format maszyn: ${
      format === 'mpr'
        ? 'HOMAG / Weeke WoodWOP (.mpr)'
        : format === 'cix'
          ? 'Biesse bSolid / BiesseWorks (.cix)'
          : 'ISO G-Code (.nc)'
    }`,
    '',
    'Lista programow CNC:',
  ];

  boards.forEach((part, idx) => {
    const map = extractBoardDrillingMap(part, project.parts, project.fasteners);
    const code =
      format === 'mpr'
        ? generateWoodWopMpr(map, project.name)
        : format === 'cix'
          ? generateBiesseCix(map, project.name)
          : generateIsoGCode(map, project.name);
    const fileName = `${String(idx + 1).padStart(2, '0')}_${sanitizeFileSlug(part.name)}_${map.faceWidthMm}x${map.faceHeightMm}.${format}`;
    entries.push({ name: fileName, content: code });
    manifestLines.push(
      `  ${fileName}  |  ${getMaterialMeta(part.materialId).shortName} ${map.thicknessMm} mm  |  ${map.holes.length} otw., ${map.cutouts.length} wyc.`
    );
  });

  entries.unshift({ name: 'README_CNC.txt', content: manifestLines.join('\r\n') });

  const zipBlob = buildZipBlob(entries);
  const filename = `${sanitizeFileSlug(project.name)}_cnc_${format}.zip`;
  triggerDownload(zipBlob, filename);
  return { filename, boardCount: boards.length };
}

/* ==================== 4. COMMERCIAL PANEL SAW OPTIMIZER CSV EXPORTS ==================== */

export function exportPanelSawCsv(
  project: FurnitureProject,
  cutSpecs: Map<string, CarpentryCutSpec>,
  format: SawOptimizerFormat
): string {
  const boards = project.parts.filter((p) => p.kind !== 'appliance' && p.kind !== 'profile');
  const slug = sanitizeFileSlug(project.name);

  if (format === 'cutlist_optimizer') {
    // Official CutListOptimizer.com CSV import columns: Length,Width,Qty,Material,Label,Enabled
    const header = 'Length,Width,Qty,Material,Label,Enabled';
    const rows = boards.map((p, idx) => {
      const spec = cutSpecs.get(p.id);
      const meta = getMaterialMeta(p.materialId);
      const len = spec ? spec.sawLenMm : Math.round(Math.max(p.width, p.height));
      const wid = spec ? spec.sawWidMm : Math.round(Math.min(p.width, p.height));
      const matLabel = `${meta.shortName} ${spec?.thicknessMm ?? p.depth}mm`.replace(/,/g, ' ');
      const label = `#${idx + 1} ${p.name}`.replace(/,/g, ' ');
      return `${len},${wid},1,"${matLabel}","${label}",true`;
    });
    const csv = '\uFEFF' + [header, ...rows].join('\r\n');
    const filename = `${slug}_cutlist_optimizer.csv`;
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
    return filename;
  }

  if (format === 'opticut') {
    // OptiCut / PRO100 Rozkrój compatible semicolon CSV
    const header = 'Nazwa;Material;Grubosc;Dlugosc;Szerokosc;Ilosc;Obrot;Okleina_G;Okleina_D;Okleina_L;Okleina_P';
    const rows = boards.map((p, idx) => {
      const spec = cutSpecs.get(p.id);
      const meta = getMaterialMeta(p.materialId);
      const grainLocked = isMaterialGrainDirectional(p.materialId);
      const eb = p.edgeBanding;
      const t = eb && eb.thicknessMm > 0 ? String(eb.thicknessMm) : '';
      return [
        `"#${idx + 1} ${p.name.replace(/"/g, '""')}"`,
        `"${meta.name.replace(/"/g, '""')}"`,
        spec?.thicknessMm ?? Math.round(p.depth),
        spec?.sawLenMm ?? Math.round(p.width),
        spec?.sawWidMm ?? Math.round(p.height),
        1,
        grainLocked ? 'N' : 'T',
        eb?.top ? t : '',
        eb?.bottom ? t : '',
        eb?.left ? t : '',
        eb?.right ? t : '',
      ].join(';');
    });
    const csv = '\uFEFF' + [header, ...rows].join('\r\n');
    const filename = `${slug}_opticut_pro100.csv`;
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
    return filename;
  }

  // Rozkrój.pl / eRozkrój / Kronospan / Egger Polish saw-service order sheet
  const header =
    'Lp;Nazwa formatki;Material;Grubosc [mm];Dlugosc pila [mm];Szerokosc pila [mm];Szt;Sloj;Okleina L1 (gora);Okleina L2 (dol);Okleina W1 (lewo);Okleina W2 (prawo);Uwagi CNC';
  const rows = boards.map((p, idx) => {
    const spec = cutSpecs.get(p.id);
    const meta = getMaterialMeta(p.materialId);
    const grainLocked = isMaterialGrainDirectional(p.materialId);
    const eb = p.edgeBanding;
    const ebVal = eb && eb.thicknessMm > 0 ? `ABS ${eb.thicknessMm}mm` : '';
    const notes: string[] = [];
    if (p.dadoGroove?.enabled) notes.push(`Nut ${p.dadoGroove.widthMm}x${p.dadoGroove.depthMm}`);
    if (p.ledGroove?.enabled) notes.push(`Frez LED ${p.ledGroove.widthMm}x${p.ledGroove.depthMm}`);
    if (p.hingeSide && p.hingeSide !== 'none') notes.push(`Zawiasy fi35 x${p.hingeCount ?? 2}`);
    if (p.cutouts?.length) notes.push(`Wyciecia: ${p.cutouts.length}`);
    if (p.cornerRadiusMm) notes.push(`Zaokraglenie R${p.cornerRadiusMm}`);
    return [
      idx + 1,
      `"${p.name.replace(/"/g, '""')}"`,
      `"${meta.name.replace(/"/g, '""')}"`,
      spec?.thicknessMm ?? Math.round(p.depth),
      spec?.sawLenMm ?? Math.round(p.width),
      spec?.sawWidMm ?? Math.round(p.height),
      1,
      grainLocked ? 'TAK' : 'NIE',
      eb?.top ? ebVal : '',
      eb?.bottom ? ebVal : '',
      eb?.left ? ebVal : '',
      eb?.right ? ebVal : '',
      `"${notes.join(', ')}"`,
    ].join(';');
  });
  const csv = '\uFEFF' + [header, ...rows].join('\r\n');
  const filename = `${slug}_rozkroj_hurtownia.csv`;
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename);
  return filename;
}
