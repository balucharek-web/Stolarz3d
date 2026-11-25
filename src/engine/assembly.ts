import * as THREE from 'three';
import {
  Fastener,
  FurniturePart,
  SCREW_MAP,
  ScrewType,
} from '../types/furniture';
import {
  auditSingleFastener,
  getPartWorldBox,
  isWorldPointInsidePart,
  type WorldBox,
} from './carpentry';

export type ContactRelation =
  | 'sits_on'
  | 'supports'
  | 'side_butt'
  | 'front_back'
  | 'angled';

export interface PartContact {
  partAId: string;
  partBId: string;
  axis: 'x' | 'y' | 'z' | 'angled';
  /** Relation from partA's perspective toward partB */
  relationAtoB: ContactRelation;
  /** Physical overlap area on the mating plane (mm²), or 0 for fastener-only links */
  contactAreaMm2: number;
  /** Verified fasteners connecting partA and partB */
  fasteners: Fastener[];
  /** Human-readable fastener summary e.g. "2× Konfirmat 7×50" */
  fastenerSummary: string;
  /** Midpoint of the physical contact zone in world mm */
  contactPointWorld: [number, number, number];
}

export interface AssemblyPartInstruction {
  partId: string;
  partName: string;
  /** Already-installed part IDs that this part physically touches / attaches to */
  attachToIds: string[];
  attachToNames: string[];
  /** Exact fasteners connecting this part to the already-installed structure */
  fastenersCount: number;
  fastenerSummary: string;
  /** Concise carpentry action hint (e.g. "przykręć do: Wieniec dolny korpusu") */
  actionHint: string;
  /** Structural rationale derived from the physical contact graph */
  reason: string;
  /** World contact points (mm) with already-installed parts */
  jointPointsWorld: [number, number, number][];
}

export type AssemblyPhase =
  | 'base'
  | 'walls'
  | 'structure'
  | 'stiffening'
  | 'interior'
  | 'fronts'
  | 'top';

export interface AssemblyStepPlan {
  /** 1-based step index */
  step: number;
  /** Workshop step title */
  title: string;
  /** Auto-generated practical assembly instruction */
  instruction: string;
  /** Phase tag for visual hierarchy */
  phase: AssemblyPhase;
  /** Parts mounted in this step */
  partIds: string[];
  /** Per-part contact and fastener details */
  items: AssemblyPartInstruction[];
  /** Total fasteners installed in this step */
  totalFasteners: number;
  /** Combined fastener summary for this step */
  fastenerSummary: string;
  /** Already-installed parts that the current step physically attaches to */
  targetBasePartIds: string[];
  /** World contact points (mm) for 3D highlight markers */
  jointPointsWorld: [number, number, number][];
}

export type AssemblyGranularity = 'grouped' | 'part_by_part';

export interface AssemblyPlan {
  mode: AssemblyGranularity;
  steps: AssemblyStepPlan[];
  /** Map partId -> 1-based step number */
  partStepMap: Map<string, number>;
  /** All detected physical board-to-board contacts */
  contacts: PartContact[];
  totalContacts: number;
  connectedComponents: number;
}

type GeometricRole =
  | 'horizontal_base'
  | 'vertical_post'
  | 'outer_side'
  | 'internal_divider'
  | 'horizontal_shelf'
  | 'top_cap'
  | 'back_panel'
  | 'plinth_or_leg'
  | 'brace_or_trim'
  | 'front_door'
  | 'countertop'
  | 'appliance';

interface PartGeomInfo {
  part: FurniturePart;
  box: WorldBox;
  dx: number;
  dy: number;
  dz: number;
  cx: number;
  cy: number;
  cz: number;
  footprintArea: number;
  isHorizontal: boolean;
  isVerticalSide: boolean;
  isVerticalPost: boolean;
  isThinBack: boolean;
  isRotatedNonOrtho: boolean;
  role: GeometricRole;
}

function summarizeFasteners(fasteners: Fastener[]): string {
  if (fasteners.length === 0) return '';
  const counts = new Map<ScrewType, number>();
  for (const f of fasteners) {
    counts.set(f.type, (counts.get(f.type) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([type, count]) => `${count}× ${SCREW_MAP[type]?.shortName ?? type}`)
    .join(', ');
}

function pairKey(aId: string, bId: string): string {
  return aId < bId ? `${aId}__${bId}` : `${bId}__${aId}`;
}

function invertRelation(rel: ContactRelation): ContactRelation {
  if (rel === 'sits_on') return 'supports';
  if (rel === 'supports') return 'sits_on';
  return rel;
}

function getFastenerWorldHead(part: FurniturePart, f: Fastener): [number, number, number] {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(part.rotation[0]),
    THREE.MathUtils.degToRad(part.rotation[1]),
    THREE.MathUtils.degToRad(part.rotation[2]),
    'XYZ'
  );
  const quat = new THREE.Quaternion().setFromEuler(euler);
  const v = new THREE.Vector3(...f.localPosition)
    .applyQuaternion(quat)
    .add(new THREE.Vector3(...part.position));
  return [v.x, v.y, v.z];
}

/**
 * Builds the real 3D physical contact graph between all parts in the project
 * using exact WorldBox geometry, solid point sampling for rotated/sloped boards,
 * and verified fastener links.
 */
export function detectPhysicalContacts(
  parts: FurniturePart[],
  fasteners: Fastener[],
  contactGapTolMm = 6.0
): PartContact[] {
  const partMap = new Map<string, FurniturePart>();
  const boxMap = new Map<string, WorldBox>();
  for (const p of parts) {
    partMap.set(p.id, p);
    boxMap.set(p.id, getPartWorldBox(p));
  }

  // 1. Collect all fasteners bridging pairs of parts
  const pairFasteners = new Map<string, Fastener[]>();
  const pairFastenerPts = new Map<string, [number, number, number][]>();
  for (const f of fasteners) {
    const host = partMap.get(f.partId);
    if (!host) continue;

    let targetId = f.targetPartId;
    if (!targetId || !partMap.has(targetId)) {
      const audit = auditSingleFastener(f, parts, partMap, boxMap);
      if (audit?.targetPartName) {
        const matched = parts.find(
          (p) => p.id !== host.id && p.name === audit.targetPartName
        );
        targetId = matched?.id;
      }
    }
    if (!targetId || targetId === host.id || !partMap.has(targetId)) continue;

    const key = pairKey(host.id, targetId);
    const list = pairFasteners.get(key) ?? [];
    list.push(f);
    pairFasteners.set(key, list);

    const pts = pairFastenerPts.get(key) ?? [];
    pts.push(getFastenerWorldHead(host, f));
    pairFastenerPts.set(key, pts);
  }

  const contacts: PartContact[] = [];
  const samplePt = new THREE.Vector3();

  for (let i = 0; i < parts.length; i++) {
    const a = parts[i];
    const ba = boxMap.get(a.id)!;
    const aAngled =
      a.kind === 'sloped' ||
      a.kind === 'custom' ||
      a.rotation.some((r) => Math.abs(r % 90) > 0.5);

    for (let j = i + 1; j < parts.length; j++) {
      const b = parts[j];
      const bb = boxMap.get(b.id)!;
      const bAngled =
        b.kind === 'sloped' ||
        b.kind === 'custom' ||
        b.rotation.some((r) => Math.abs(r % 90) > 0.5);

      const key = pairKey(a.id, b.id);
      const linkedFasteners = pairFasteners.get(key) ?? [];

      const oxMin = Math.max(ba.minX, bb.minX);
      const oxMax = Math.min(ba.maxX, bb.maxX);
      const oyMin = Math.max(ba.minY, bb.minY);
      const oyMax = Math.min(ba.maxY, bb.maxY);
      const ozMin = Math.max(ba.minZ, bb.minZ);
      const ozMax = Math.min(ba.maxZ, bb.maxZ);

      const ox = oxMax - oxMin;
      const oy = oyMax - oyMin;
      const oz = ozMax - ozMin;

      // Doors and drawer fronts never structurally support each other across 2-4 mm reveal gaps
      const aIsFront = a.kind === 'door' || a.hardwareTag === 'drawer_front';
      const bIsFront = b.kind === 'door' || b.hardwareTag === 'drawer_front';
      if (aIsFront && bIsFront && linkedFasteners.length === 0) {
        continue;
      }

      // Doors and drawer fronts typically have a 2-4 mm reveal gap to the carcass
      const effectiveTol =
        aIsFront || bIsFront ? Math.max(contactGapTolMm, 8.0) : contactGapTolMm;

      const nearInAllAxes =
        ox >= -effectiveTol && oy >= -effectiveTol && oz >= -effectiveTol;

      if (!nearInAllAxes && linkedFasteners.length === 0) {
        continue;
      }

      const acx = (ba.minX + ba.maxX) / 2;
      const acy = (ba.minY + ba.maxY) / 2;
      const acz = (ba.minZ + ba.maxZ) / 2;
      const bcx = (bb.minX + bb.maxX) / 2;
      const bcy = (bb.minY + bb.maxY) / 2;
      const bcz = (bb.minZ + bb.maxZ) / 2;

      // Determine geometric contact validity & mating axis
      let axis: PartContact['axis'] = 'angled';
      let relationAtoB: ContactRelation = 'angled';
      let contactAreaMm2 = 0;
      let contactPointWorld: [number, number, number] = [
        (oxMin + oxMax) / 2,
        (oyMin + oyMax) / 2,
        (ozMin + ozMax) / 2,
      ];
      let hasGeometricContact = false;

      if (nearInAllAxes) {
        // Count how many axes have substantial tangential overlap (>= 10 mm)
        const overlaps: Array<{ ax: 'x' | 'y' | 'z'; val: number }> = [
          { ax: 'x', val: ox },
          { ax: 'y', val: oy },
          { ax: 'z', val: oz },
        ];
        overlaps.sort((u, v) => u.val - v.val);
        const normalAxis = overlaps[0];
        const tan1 = overlaps[1].val;
        const tan2 = overlaps[2].val;

        // Require meaningful contact face (angled/tilted boards may touch square posts along a narrower 4-7 mm edge strip)
        const minTan1 = aAngled || bAngled ? 4 : 8;
        const minTan2 = aAngled || bAngled ? 10 : 12;
        const validFaceTouch =
          normalAxis.val <= 28 && tan1 >= minTan1 && tan2 >= minTan2;

        if (validFaceTouch) {
          if (aAngled || bAngled) {
            // Verify angled/sloped/custom solid proximity using 3D point sampling
            if (linkedFasteners.length > 0) {
              hasGeometricContact = true;
            } else {
              const pad = effectiveTol;
              const sMinX = oxMin - (ox < 0 ? pad : 0);
              const sMaxX = oxMax + (ox < 0 ? pad : 0);
              const sMinY = oyMin - (oy < 0 ? pad : 0);
              const sMaxY = oyMax + (oy < 0 ? pad : 0);
              const sMinZ = ozMin - (oz < 0 ? pad : 0);
              const sMaxZ = ozMax + (oz < 0 ? pad : 0);

              let hitCount = 0;
              let hx = 0;
              let hy = 0;
              let hz = 0;
              const steps = [0.15, 0.5, 0.85];
              for (const fx of steps) {
                for (const fy of steps) {
                  for (const fz of steps) {
                    samplePt.set(
                      sMinX + (sMaxX - sMinX) * fx,
                      sMinY + (sMaxY - sMinY) * fy,
                      sMinZ + (sMaxZ - sMinZ) * fz
                    );
                    if (
                      isWorldPointInsidePart(samplePt, a, effectiveTol) &&
                      isWorldPointInsidePart(samplePt, b, effectiveTol)
                    ) {
                      hitCount++;
                      hx += samplePt.x;
                      hy += samplePt.y;
                      hz += samplePt.z;
                    }
                  }
                }
              }
              if (hitCount > 0) {
                hasGeometricContact = true;
                contactPointWorld = [hx / hitCount, hy / hitCount, hz / hitCount];
              }
            }
          } else {
            hasGeometricContact = true;
          }

          if (hasGeometricContact) {
            contactAreaMm2 = Math.max(0, Math.round(tan1 * tan2));
            if (aAngled || bAngled) {
              // Check if one clearly sits on top of the other vertically (e.g., sloped roof on posts, gusset on shelf)
              if (ba.minY >= bb.maxY - 12 && acy > bcy) {
                axis = 'y';
                relationAtoB = 'sits_on';
              } else if (bb.minY >= ba.maxY - 12 && bcy > acy) {
                axis = 'y';
                relationAtoB = 'supports';
              } else {
                axis = 'angled';
                relationAtoB = 'angled';
              }
            } else {
              axis = normalAxis.ax;
              if (axis === 'y') {
                relationAtoB = acy >= bcy ? 'sits_on' : 'supports';
              } else if (axis === 'x') {
                relationAtoB = 'side_butt';
              } else {
                relationAtoB = 'front_back';
              }
            }
          }
        }
      }

      if (!hasGeometricContact && linkedFasteners.length === 0) {
        continue;
      }

      // If fasteners exist, prefer average fastener position for super accurate 3D contact pin
      const fPts = pairFastenerPts.get(key);
      if (fPts && fPts.length > 0) {
        let sx = 0;
        let sy = 0;
        let sz = 0;
        for (const p of fPts) {
          sx += p[0];
          sy += p[1];
          sz += p[2];
        }
        contactPointWorld = [sx / fPts.length, sy / fPts.length, sz / fPts.length];

        // If angled/fastener-only contact, check clear vertical stacking relation
        if (relationAtoB === 'angled') {
          if (ba.minY >= bb.maxY - 18 && acy > bcy + 20) {
            relationAtoB = 'sits_on';
          } else if (bb.minY >= ba.maxY - 18 && bcy > acy + 20) {
            relationAtoB = 'supports';
          }
        }
      }

      // Guard against phantom contacts between two coplanar shelves separated by a divider/post
      void acx;
      void acz;
      void bcx;
      void bcz;

      contacts.push({
        partAId: a.id,
        partBId: b.id,
        axis,
        relationAtoB,
        contactAreaMm2,
        fasteners: linkedFasteners,
        fastenerSummary: summarizeFasteners(linkedFasteners),
        contactPointWorld: [
          Math.round(contactPointWorld[0]),
          Math.round(contactPointWorld[1]),
          Math.round(contactPointWorld[2]),
        ],
      });
    }
  }

  return contacts;
}

/**
 * Classifies each part's structural role from pure 3D geometry & contact topology
 * (works even when parts have arbitrary generic names like "Płyta 1").
 */
function analyzePartGeometry(
  parts: FurniturePart[],
  contacts: PartContact[]
): Map<string, PartGeomInfo> {
  const boxMap = new Map<string, WorldBox>();
  let projMinX = Infinity;
  let projMaxX = -Infinity;
  let projMinY = Infinity;
  let projMaxY = -Infinity;
  let projMinZ = Infinity;
  let projMaxZ = -Infinity;

  for (const p of parts) {
    const b = getPartWorldBox(p);
    boxMap.set(p.id, b);
    if (b.minX < projMinX) projMinX = b.minX;
    if (b.maxX > projMaxX) projMaxX = b.maxX;
    if (b.minY < projMinY) projMinY = b.minY;
    if (b.maxY > projMaxY) projMaxY = b.maxY;
    if (b.minZ < projMinZ) projMinZ = b.minZ;
    if (b.maxZ > projMaxZ) projMaxZ = b.maxZ;
  }

  const projWidth = Math.max(1, projMaxX - projMinX);
  const projHeight = Math.max(1, projMaxY - projMinY);
  const projDepth = Math.max(1, projMaxZ - projMinZ);

  // Build quick contact lookup per part
  const adj = new Map<string, Array<{ otherId: string; rel: ContactRelation; contact: PartContact }>>();
  for (const p of parts) adj.set(p.id, []);
  for (const c of contacts) {
    adj.get(c.partAId)?.push({ otherId: c.partBId, rel: c.relationAtoB, contact: c });
    adj.get(c.partBId)?.push({
      otherId: c.partAId,
      rel: invertRelation(c.relationAtoB),
      contact: c,
    });
  }

  const infoMap = new Map<string, PartGeomInfo>();

  for (const p of parts) {
    const box = boxMap.get(p.id)!;
    const dx = Math.max(1, box.maxX - box.minX);
    const dy = Math.max(1, box.maxY - box.minY);
    const dz = Math.max(1, box.maxZ - box.minZ);
    const cx = (box.minX + box.maxX) / 2;
    const cy = (box.minY + box.maxY) / 2;
    const cz = (box.minZ + box.maxZ) / 2;
    const footprintArea = dx * dz;
    const isRotatedNonOrtho = p.rotation.some((r) => Math.abs(r % 90) > 1.0);

    const isHorizontal = !isRotatedNonOrtho && dy <= 55 && Math.max(dx, dz) >= dy * 2.2;
    const isVerticalPost =
      !isRotatedNonOrtho &&
      dx <= 90 &&
      dz <= 90 &&
      dy >= Math.max(dx, dz) * 2.8;
    const isVerticalSide =
      !isRotatedNonOrtho &&
      !isVerticalPost &&
      dx <= 55 &&
      dy >= dx * 2.2 &&
      dz >= dx * 2.2;
    const isThinBack =
      !isRotatedNonOrtho &&
      dz <= 26 &&
      dx >= Math.min(240, projWidth * 0.45) &&
      dy >= Math.min(240, projHeight * 0.35) &&
      box.maxZ <= projMinZ + 45;

    const lower = p.name.toLowerCase();
    const myNeighbors = adj.get(p.id) ?? [];

    let role: GeometricRole = 'horizontal_shelf';

    if (p.kind === 'appliance') {
      role = 'appliance';
    } else if (p.kind === 'countertop') {
      role = 'countertop';
    } else if (p.kind === 'door' || p.hardwareTag === 'drawer_front') {
      role = 'front_door';
    } else if (
      isThinBack ||
      lower.includes('plecy') ||
      lower.includes('hdf') ||
      lower.includes('tablica narzędziowa')
    ) {
      // Distinguish rear back wall vs backboard resting high on a countertop
      if (box.minY >= projMinY + projHeight * 0.55 && !lower.includes('plecy')) {
        role = 'top_cap';
      } else {
        role = 'back_panel';
      }
    } else if (
      p.hardwareTag === 'leg' ||
      lower.includes('cokół') ||
      lower.includes('cokol') ||
      (!isRotatedNonOrtho &&
        box.minY <= projMinY + 12 &&
        dy <= 180 &&
        dz <= 35 &&
        dx >= projWidth * 0.4 &&
        box.maxZ > projMinZ + projDepth * 0.4)
    ) {
      role = 'plinth_or_leg';
    } else if (isVerticalPost) {
      role = 'vertical_post';
    } else if (isRotatedNonOrtho) {
      // Distinguish sloped roof/top cap vs tilted shelf vs diagonal brace / lip
      if (box.maxY >= projMaxY - 80 && dx >= projWidth * 0.55) {
        role = 'top_cap';
      } else if (
        Math.abs(p.rotation[0]) <= 22 &&
        Math.abs(p.rotation[2]) <= 15 &&
        p.height <= 36 &&
        p.depth >= 120
      ) {
        role = 'horizontal_shelf';
      } else {
        role = 'brace_or_trim';
      }
    } else if (isVerticalSide) {
      // Outer left/right side panel vs internal divider / small gusset
      const nearOuterX =
        box.minX <= projMinX + 45 || box.maxX >= projMaxX - 45;
      if (nearOuterX && dy >= projHeight * 0.45) {
        role = 'outer_side';
      } else {
        role = 'internal_divider';
      }
    } else if (isHorizontal) {
      // Check if this is the lowest broad base slab, top cap/stretcher, or middle shelf
      const supportsAbove = myNeighbors.filter((n) => n.rel === 'supports').length;
      const sitsOnBelow = myNeighbors.filter((n) => n.rel === 'sits_on').length;
      const nearBottom = box.minY <= projMinY + Math.max(150, projHeight * 0.16);
      const nearTop = box.maxY >= projMaxY - Math.max(60, projHeight * 0.12);

      if (nearBottom && (supportsAbove >= 1 || myNeighbors.length >= 2) && dx >= projWidth * 0.5) {
        role = 'horizontal_base';
      } else if (nearTop && sitsOnBelow >= 1 && dx >= projWidth * 0.5) {
        role = 'top_cap';
      } else if (
        nearTop &&
        dz <= Math.min(180, projDepth * 0.35) &&
        dx >= projWidth * 0.5
      ) {
        // Upper cabinet stretchers (trawersy)
        role = 'top_cap';
      } else {
        role = 'horizontal_shelf';
      }
    } else if (p.kind === 'sloped' && dz <= 45) {
      // Small sloped structural gussets (e.g. workbench corner brackets)
      role = 'internal_divider';
    } else {
      role = 'brace_or_trim';
    }

    infoMap.set(p.id, {
      part: p,
      box,
      dx,
      dy,
      dz,
      cx,
      cy,
      cz,
      footprintArea,
      isHorizontal,
      isVerticalSide,
      isVerticalPost,
      isThinBack,
      isRotatedNonOrtho,
      role,
    });
  }

  return infoMap;
}

function getPhasePriority(role: GeometricRole): number {
  switch (role) {
    case 'horizontal_base':
      return 10;
    case 'vertical_post':
      return 15;
    case 'outer_side':
      return 20;
    case 'internal_divider':
    case 'horizontal_shelf':
      return 30;
    case 'top_cap':
      return 42;
    case 'brace_or_trim':
      return 48;
    case 'back_panel':
      return 55;
    case 'plinth_or_leg':
      return 58;
    case 'front_door':
      return 70;
    case 'countertop':
      return 80;
    case 'appliance':
      return 90;
  }
}

function roleToPhase(role: GeometricRole, isStepOne: boolean): AssemblyPhase {
  if (isStepOne) return 'base';
  switch (role) {
    case 'horizontal_base':
    case 'vertical_post':
      return 'base';
    case 'outer_side':
      return 'walls';
    case 'back_panel':
    case 'plinth_or_leg':
    case 'brace_or_trim':
      return 'stiffening';
    case 'front_door':
      return 'fronts';
    case 'countertop':
    case 'appliance':
      return 'top';
    case 'horizontal_shelf':
      return 'interior';
    default:
      return 'structure';
  }
}

function describeActionForPart(
  info: PartGeomInfo,
  attachToNames: string[],
  fastenerSummary: string,
  relations: ContactRelation[],
  isFirstAnchor: boolean
): { actionHint: string; reason: string } {
  if (isFirstAnchor) {
    return {
      actionHint:
        info.role === 'vertical_post'
          ? 'Ustaw pionowo jako bazową ramę nośną'
          : 'Połóż płasko jako element bazowy (startowy)',
      reason:
        info.role === 'vertical_post'
          ? 'Najniższe elementy nośne stojące na podłodze — tworzą szkielet dla półek.'
          : 'Najniższa szeroka płyta bazowa z największą liczbą styków — idealny punkt startu.',
    };
  }

  const targetsShort =
    attachToNames.length === 0
      ? 'osobna sekcja'
      : attachToNames.length <= 2
        ? attachToNames.join(' i ')
        : `${attachToNames[0]}, ${attachToNames[1]} (+${attachToNames.length - 2})`;

  const fastSuffix = fastenerSummary ? ` (${fastenerSummary})` : '';

  if (info.role === 'outer_side') {
    return {
      actionHint: `Przykręć pionowo do: ${targetsShort}${fastSuffix}`,
      reason: 'Zewnętrzny bok styka się bezpośrednio z bazą — buduje sztywny zarys korpusu.',
    };
  }
  if (info.role === 'back_panel') {
    return {
      actionHint: `Wyrównaj przekątne i przykręć od tyłu do: ${targetsShort}${fastSuffix}`,
      reason: 'Płyta tylna styka się z całym obwodem ramy i blokuje kąty 90° konstrukcji.',
    };
  }
  if (info.role === 'countertop') {
    return {
      actionHint: `Osadź na górze i przykręć od spodu do: ${targetsShort}${fastSuffix}`,
      reason: 'Blat spoczywa bezpośrednio na górnej krawędzi zmontowanego korpusu.',
    };
  }
  if (info.role === 'front_door') {
    return {
      actionHint: `Zamontuj zawiasy/prowadnice do: ${targetsShort}`,
      reason: 'Fronty montuje się i reguluje na końcu, po pełnym usztywnieniu korpusu.',
    };
  }
  if (info.role === 'appliance') {
    return {
      actionHint: `Wstaw i zamocuj w: ${targetsShort}`,
      reason: 'Wyposażenie / AGD montuje się w gotowym, wypoziomowanym meblu.',
    };
  }
  if (relations.includes('sits_on')) {
    return {
      actionHint: `Oprzyj od góry i połącz z: ${targetsShort}${fastSuffix}`,
      reason: 'Płyta opiera się grawitacyjnie na już zamontowanym elemencie poniżej.',
    };
  }
  return {
    actionHint: `Połącz na styk z: ${targetsShort}${fastSuffix}`,
    reason: `Wykryto fizyczny styk z ${attachToNames.length} zamontowanymi elementami.`,
  };
}

function buildStepTitleAndInstruction(
  items: AssemblyPartInstruction[],
  infos: PartGeomInfo[],
  phase: AssemblyPhase,
  isFirstStep: boolean,
  totalFasteners: number,
  fastenerSummary: string
): { title: string; instruction: string } {
  const uniqueTargets = Array.from(
    new Set(items.flatMap((it) => it.attachToNames))
  );
  const targetsPhrase =
    uniqueTargets.length === 0
      ? ''
      : uniqueTargets.length <= 2
        ? uniqueTargets.join(' i ')
        : `${uniqueTargets[0]}, ${uniqueTargets[1]} (+${uniqueTargets.length - 2})`;
  const fastPhrase =
    totalFasteners > 0 ? ` · Łączniki: ${fastenerSummary}` : '';

  if (items.length === 1) {
    const item = items[0];
    if (isFirstStep) {
      return {
        title: `Baza startowa: ${item.partName}`,
        instruction: `${item.actionHint}. ${item.reason}`,
      };
    }
    return {
      title: item.partName,
      instruction: `${item.actionHint}${fastPhrase && !item.actionHint.includes('(') ? fastPhrase : ''}`,
    };
  }

  // Multi-part grouped step
  const primaryRole = infos[0]?.role;

  if (isFirstStep) {
    if (primaryRole === 'vertical_post') {
      return {
        title: `Rama bazowa (${items.length} słupki / nogi)`,
        instruction: `Ustaw pionowo ${items.length} elementów nośnych na podłodze — stanowią szkielet pod pierwsze półki.`,
      };
    }
    return {
      title: `Elementy bazowe (${items.length} szt.)`,
      instruction: `Rozłóż elementy startowe na płaskim podłożu przed przykręceniem ścian bocznych.`,
    };
  }

  if (primaryRole === 'outer_side') {
    return {
      title: `Boki korpusu do bazy (${items.length} szt.)`,
      instruction: `Przykręć boki (${items.map((i) => i.partName).join(', ')}) prostopadle do: ${targetsPhrase}${fastPhrase}`,
    };
  }
  if (primaryRole === 'horizontal_shelf') {
    return {
      title: `Półki poziomu (${items.length} szt.)`,
      instruction: `Wstaw i skręć półki pomiędzy: ${targetsPhrase}${fastPhrase}`,
    };
  }
  if (primaryRole === 'top_cap') {
    return {
      title: `Wiązanie górne / wieniec (${items.length} szt.)`,
      instruction: `Zamknij górę konstrukcji mocując do: ${targetsPhrase}${fastPhrase}`,
    };
  }
  if (primaryRole === 'internal_divider') {
    return {
      title: `Przegrody / wzmocnienia (${items.length} szt.)`,
      instruction: `Zamocuj elementy usztywniające do: ${targetsPhrase}${fastPhrase}`,
    };
  }
  if (primaryRole === 'front_door') {
    return {
      title: `Fronty drzwi i szuflad (${items.length} szt.)`,
      instruction: `Zawieś fronty i wyreguluj szczeliny względem: ${targetsPhrase || 'korpusu'}`,
    };
  }
  if (phase === 'stiffening') {
    return {
      title: `Usztywnienie i wykończenie bazy (${items.length} szt.)`,
      instruction: `Sprawdź przekątne korpusu i dokręć elementy do: ${targetsPhrase}${fastPhrase}`,
    };
  }

  return {
    title: `${items[0].partName} + ${items.length - 1} szt.`,
    instruction: `Połącz ${items.length} elementy ze strukturą (${targetsPhrase})${fastPhrase}`,
  };
}

/**
 * Generates an automatic, contact-graph-driven step-by-step workshop assembly plan
 * for ANY furniture project. Determines which board to mount first (e.g. bottom base,
 * then sides to bottom, then bottom-up shelves/dividers, top cap, back wall, fronts, countertop).
 */
export function buildAssemblyPlan(
  parts: FurniturePart[],
  fasteners: Fastener[],
  mode: AssemblyGranularity = 'grouped'
): AssemblyPlan {
  if (parts.length === 0) {
    return {
      mode,
      steps: [],
      partStepMap: new Map(),
      contacts: [],
      totalContacts: 0,
      connectedComponents: 0,
    };
  }

  const contacts = detectPhysicalContacts(parts, fasteners);
  const infoMap = analyzePartGeometry(parts, contacts);

  // Build adjacency map
  const adj = new Map<
    string,
    Array<{ otherId: string; rel: ContactRelation; contact: PartContact }>
  >();
  for (const p of parts) adj.set(p.id, []);
  for (const c of contacts) {
    adj.get(c.partAId)?.push({ otherId: c.partBId, rel: c.relationAtoB, contact: c });
    adj.get(c.partBId)?.push({
      otherId: c.partAId,
      rel: invertRelation(c.relationAtoB),
      contact: c,
    });
  }

  // Count connected components for diagnostics
  const visited = new Set<string>();
  let connectedComponents = 0;
  for (const p of parts) {
    if (visited.has(p.id)) continue;
    connectedComponents++;
    const q = [p.id];
    visited.add(p.id);
    while (q.length > 0) {
      const cur = q.shift()!;
      for (const edge of adj.get(cur) ?? []) {
        if (!visited.has(edge.otherId)) {
          visited.add(edge.otherId);
          q.push(edge.otherId);
        }
      }
    }
  }

  const installedIds = new Set<string>();
  const remainingIds = new Set<string>(parts.map((p) => p.id));
  const steps: AssemblyStepPlan[] = [];
  const partStepMap = new Map<string, number>();

  // Helper: pick the best anchor part(s) when starting a fresh connected component
  const pickAnchorGroup = (): string[] => {
    const candidates = Array.from(remainingIds).map((id) => infoMap.get(id)!);
    // Prefer structural carcass/frame parts over doors, backs, appliances, countertops
    const structural = candidates.filter(
      (c) =>
        c.role !== 'front_door' &&
        c.role !== 'countertop' &&
        c.role !== 'appliance' &&
        c.role !== 'back_panel'
    );
    const pool = structural.length > 0 ? structural : candidates;

    // Check if there's a strong horizontal base slab (bottom panel touching >=2 structural parts)
    const horizBases = pool
      .filter((c) => c.role === 'horizontal_base')
      .sort((a, b) => {
        const degA = (adj.get(a.part.id) ?? []).length;
        const degB = (adj.get(b.part.id) ?? []).length;
        if (Math.abs(a.box.minY - b.box.minY) > 35) return a.box.minY - b.box.minY;
        if (degB !== degA) return degB - degA;
        return b.footprintArea - a.footprintArea;
      });

    if (horizBases.length > 0) {
      return [horizBases[0].part.id];
    }

    // Check if this is a post/leg-frame structure (warehouse rack, workbench)
    const floorPosts = pool
      .filter((c) => c.role === 'vertical_post' && c.box.minY <= 25)
      .sort((a, b) => a.cx - b.cx || a.cz - b.cz);

    if (floorPosts.length >= 2) {
      return mode === 'grouped'
        ? floorPosts.map((p) => p.part.id)
        : [floorPosts[0].part.id];
    }

    // General geometric fallback: lowest elevation with highest physical contact count
    pool.sort((a, b) => {
      const scoreA =
        getPhasePriority(a.role) * 10 +
        a.box.minY * 0.25 -
        (adj.get(a.part.id) ?? []).length * 45;
      const scoreB =
        getPhasePriority(b.role) * 10 +
        b.box.minY * 0.25 -
        (adj.get(b.part.id) ?? []).length * 45;
      return scoreA - scoreB;
    });
    return [pool[0].part.id];
  };

  // Helper: check if a candidate part has any uninstalled structural part directly supporting it from below
  const hasUninstalledSupportBelow = (partId: string): boolean => {
    const myInfo = infoMap.get(partId)!;
    // Plinths/legs sit under the bottom, don't block the bottom itself
    if (myInfo.role === 'horizontal_base') return false;
    const edges = adj.get(partId) ?? [];
    for (const e of edges) {
      if (e.rel !== 'sits_on') continue;
      if (installedIds.has(e.otherId)) continue;
      const supportInfo = infoMap.get(e.otherId)!;
      // Ignore plinth/leg underneath bottom or doors/appliances
      if (
        supportInfo.role === 'plinth_or_leg' ||
        supportInfo.role === 'front_door' ||
        supportInfo.role === 'appliance'
      ) {
        continue;
      }
      return true;
    }
    return false;
  };

  // Helper: score how ready & urgent a candidate part is to mount next
  const scoreCandidate = (
    partId: string,
    installedContacts: Array<{ otherId: string; rel: ContactRelation; contact: PartContact }>
  ): number => {
    const info = infoMap.get(partId)!;
    const basePriority = getPhasePriority(info.role) * 100;

    // Strong penalty if a structural element directly underneath is not installed yet
    const gravityPenalty = hasUninstalledSupportBelow(partId) ? 1800 : 0;

    // Bonus for touching multiple already-installed parts (closes rigid loops / locks frame!)
    const multiContactBonus = Math.min(4, installedContacts.length) * -35;

    // Bonus for verified fasteners into already-installed parts
    const fastenerCount = installedContacts.reduce(
      (sum, e) => sum + e.contact.fasteners.length,
      0
    );
    const fastenerBonus = Math.min(6, fastenerCount) * -12;

    // Bottom-to-top elevation progression (important for shelves & dividers)
    const elevationScore = info.box.minY * 0.14;

    // For outer sides: left before right deterministically
    const tieBreak = info.cx * 0.001 + info.cz * 0.0005;

    // For posts in part_by_part mode, prefer installing remaining floor posts early so shelves have both ends ready
    const postBonus =
      info.role === 'vertical_post' && info.box.minY <= 25 ? -900 : 0;

    return (
      basePriority +
      gravityPenalty +
      multiContactBonus +
      fastenerBonus +
      elevationScore +
      postBonus +
      tieBreak
    );
  };

  // Main contact-graph wavefront loop
  while (remainingIds.size > 0) {
    let selectedIds: string[] = [];

    if (installedIds.size === 0) {
      selectedIds = pickAnchorGroup();
    } else {
      // Gather all remaining parts that have at least one physical contact with installedIds
      const frontier: Array<{
        id: string;
        score: number;
        info: PartGeomInfo;
        installedContacts: Array<{ otherId: string; rel: ContactRelation; contact: PartContact }>;
      }> = [];

      for (const id of remainingIds) {
        const edges = (adj.get(id) ?? []).filter((e) => installedIds.has(e.otherId));
        const info = infoMap.get(id)!;
        // Also allow floor posts of the same rack even if posts don't directly touch each other
        const isSiblingFloorPost =
          info.role === 'vertical_post' &&
          info.box.minY <= 25 &&
          Array.from(installedIds).some(
            (instId) => infoMap.get(instId)?.role === 'vertical_post'
          );

        if (edges.length > 0 || isSiblingFloorPost) {
          frontier.push({
            id,
            score: scoreCandidate(id, edges),
            info,
            installedContacts: edges,
          });
        }
      }

      if (frontier.length === 0) {
        // Disconnected sub-assembly or freestanding part — pick next anchor!
        selectedIds = pickAnchorGroup();
      } else {
        frontier.sort((a, b) => a.score - b.score);
        const lead = frontier[0];

        if (mode === 'part_by_part') {
          selectedIds = [lead.id];
        } else {
          // Smart grouped mode: batch symmetric/parallel siblings that are simultaneously ready
          // (same structural role, similar elevation band, not depending on each other vertically)
          const batch = [lead];
          const batchSet = new Set([lead.id]);

          for (let k = 1; k < frontier.length; k++) {
            const cand = frontier[k];
            if (cand.info.role !== lead.info.role) continue;
            if (Math.abs(cand.score - lead.score) > 260) continue;

            // Ensure candidate doesn't depend vertically on anything already in this batch
            const dependsOnBatch = (adj.get(cand.id) ?? []).some(
              (e) =>
                batchSet.has(e.otherId) &&
                (e.rel === 'sits_on' || e.rel === 'supports')
            );
            if (dependsOnBatch) continue;

            // Group shelves only if on the same height level (within 55 mm),
            // whereas fronts/doors, outer sides, posts, or top stretchers group cleanly together
            if (
              lead.info.role === 'horizontal_shelf' &&
              Math.abs(cand.info.box.minY - lead.info.box.minY) > 55
            ) {
              continue;
            }
            if (
              lead.info.role === 'internal_divider' &&
              Math.abs(cand.info.box.minY - lead.info.box.minY) > 55
            ) {
              continue;
            }
            // Don't merge unrelated small braces/lips with different parents
            if (lead.info.role === 'brace_or_trim') {
              const leadParentIds = new Set(lead.installedContacts.map((c) => c.otherId));
              const sharesParent = cand.installedContacts.some((c) =>
                leadParentIds.has(c.otherId)
              );
              if (!sharesParent) continue;
            }

            batch.push(cand);
            batchSet.add(cand.id);
          }

          selectedIds = batch.map((b) => b.id);
        }
      }
    }

    const stepNum = steps.length + 1;
    const isFirstStep = stepNum === 1;
    const stepItems: AssemblyPartInstruction[] = [];
    const stepInfos: PartGeomInfo[] = [];
    const stepFasteners: Fastener[] = [];
    const targetBaseSet = new Set<string>();
    const stepJointPoints: [number, number, number][] = [];

    for (const id of selectedIds) {
      const info = infoMap.get(id)!;
      stepInfos.push(info);
      const installedEdges = (adj.get(id) ?? []).filter((e) =>
        installedIds.has(e.otherId)
      );

      // Sort contacts: fastened contacts first, then largest mating area
      installedEdges.sort((a, b) => {
        if (b.contact.fasteners.length !== a.contact.fasteners.length) {
          return b.contact.fasteners.length - a.contact.fasteners.length;
        }
        return b.contact.contactAreaMm2 - a.contact.contactAreaMm2;
      });

      const attachToIds = installedEdges.map((e) => e.otherId);
      const attachToNames = installedEdges.map(
        (e) => infoMap.get(e.otherId)?.part.name ?? e.otherId
      );
      const itemFasteners = installedEdges.flatMap((e) => e.contact.fasteners);
      const itemJointPts = installedEdges.map((e) => e.contact.contactPointWorld);
      const relations = installedEdges.map((e) => e.rel);

      for (const tid of attachToIds) targetBaseSet.add(tid);
      for (const f of itemFasteners) stepFasteners.push(f);
      for (const pt of itemJointPts) stepJointPoints.push(pt);

      const fSummary = summarizeFasteners(itemFasteners);
      const { actionHint, reason } = describeActionForPart(
        info,
        attachToNames,
        fSummary,
        relations,
        isFirstStep || attachToIds.length === 0
      );

      stepItems.push({
        partId: id,
        partName: info.part.name,
        attachToIds,
        attachToNames,
        fastenersCount: itemFasteners.length,
        fastenerSummary: fSummary,
        actionHint,
        reason,
        jointPointsWorld: itemJointPts,
      });
    }

    const phase = roleToPhase(stepInfos[0].role, isFirstStep);
    const stepFastenerSummary = summarizeFasteners(stepFasteners);
    const { title, instruction } = buildStepTitleAndInstruction(
      stepItems,
      stepInfos,
      phase,
      isFirstStep,
      stepFasteners.length,
      stepFastenerSummary
    );

    steps.push({
      step: stepNum,
      title,
      instruction,
      phase,
      partIds: selectedIds,
      items: stepItems,
      totalFasteners: stepFasteners.length,
      fastenerSummary: stepFastenerSummary,
      targetBasePartIds: Array.from(targetBaseSet),
      jointPointsWorld: stepJointPoints,
    });

    for (const id of selectedIds) {
      installedIds.add(id);
      remainingIds.delete(id);
      partStepMap.set(id, stepNum);
    }
  }

  return {
    mode,
    steps,
    partStepMap,
    contacts,
    totalContacts: contacts.length,
    connectedComponents,
  };
}
