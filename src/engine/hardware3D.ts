import * as THREE from 'three';
import { DrawerSlideType, FurniturePart } from '../types/furniture';

const MM_TO_M = 0.001;

// Pre-allocated math helpers for zero-GC per-frame kinematic updates
const _vA = new THREE.Vector3();
const _vB = new THREE.Vector3();
const _vC = new THREE.Vector3();
const _vD = new THREE.Vector3();
const _qA = new THREE.Quaternion();
const _fwdZ = new THREE.Vector3(0, 0, 1);

function getPartQuat(part: FurniturePart): THREE.Quaternion {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(part.rotation[0] || 0),
    THREE.MathUtils.degToRad(part.rotation[1] || 0),
    THREE.MathUtils.degToRad(part.rotation[2] || 0),
    'XYZ'
  );
  return new THREE.Quaternion().setFromEuler(euler);
}

function markDisposable(obj: THREE.Object3D) {
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.InstancedMesh) {
      child.userData.disposeMaterial = true;
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
}

function sameCabinetGroup(a: FurniturePart, b: FurniturePart): boolean {
  if (a.groupId && b.groupId) return a.groupId === b.groupId;
  return !a.groupId && !b.groupId;
}

/**
 * Infers which side of a vertical side panel or horizontal deck faces the cabinet interior,
 * preventing dado grooves, LED strips, and System 32 drillings from ever bleeding onto exterior walls.
 */
export function inferInnerFaceDirection(
  part: FurniturePart,
  allParts: FurniturePart[]
): { innerX: -1 | 0 | 1; innerY: -1 | 0 | 1; isMiddleDivider: boolean } {
  const sameGroup = allParts.filter((p) => p.id !== part.id && sameCabinetGroup(p, part));
  const pool = sameGroup.length > 0 ? sameGroup : allParts.filter((p) => p.id !== part.id);

  // If this is a drawer box side, compare against other drawer_box parts at similar Y
  const isDrawerSide = part.hardwareTag === 'drawer_box';
  const relevant = isDrawerSide
    ? pool.filter(
        (p) =>
          p.hardwareTag === 'drawer_box' &&
          Math.abs(p.position[1] - part.position[1]) < Math.max(part.height, 120) &&
          Math.abs(p.position[2] - part.position[2]) < Math.max(part.depth, 250)
      )
    : pool.filter(
        (p) =>
          p.kind !== 'countertop' &&
          p.hardwareTag !== 'leg' &&
          p.hardwareTag !== 'wall_filler'
      );

  if (relevant.length === 0) {
    return { innerX: 1, innerY: 1, isMiddleDivider: false };
  }

  const partQuat = getPartQuat(part);
  const invQuat = partQuat.clone().invert();
  const origin = new THREE.Vector3(part.position[0], part.position[1], part.position[2]);

  let leftCount = 0;
  let rightCount = 0;
  let sumLocalX = 0;
  let sumLocalY = 0;
  let horizMatches = 0;
  let vertMatches = 0;

  for (const other of relevant) {
    const rel = new THREE.Vector3(
      other.position[0] - origin.x,
      other.position[1] - origin.y,
      other.position[2] - origin.z
    ).applyQuaternion(invQuat);

    // Check overlap in Z and Y to evaluate X-side neighbors
    const yOverlap =
      Math.abs(rel.y) < (part.height + other.height) * 0.55;
    const zOverlap =
      Math.abs(rel.z) < (part.depth + other.depth) * 0.65;

    if (yOverlap && zOverlap && Math.abs(rel.x) > part.width * 0.5 + 8) {
      sumLocalX += rel.x;
      horizMatches++;
      if (rel.x < -40) leftCount++;
      if (rel.x > 40) rightCount++;
    }

    const xOverlap =
      Math.abs(rel.x) < (part.width + other.width) * 0.55;
    if (xOverlap && zOverlap && Math.abs(rel.y) > part.height * 0.5 + 8) {
      sumLocalY += rel.y;
      vertMatches++;
    }
  }

  // A vertical panel that has cabinet panels/shelves/drawers substantially on BOTH left and right is a middle divider
  const isMiddleDivider =
    !isDrawerSide &&
    part.width <= part.height &&
    part.width <= part.depth &&
    leftCount >= 2 &&
    rightCount >= 2;

  const innerX: -1 | 0 | 1 =
    horizMatches === 0 ? 1 : sumLocalX >= 0 ? 1 : -1;
  const innerY: -1 | 0 | 1 =
    vertMatches === 0 ? 1 : sumLocalY >= 0 ? 1 : -1;

  return { innerX, innerY, isMiddleDivider };
}

/**
 * Helper: match each drawer front with its drawer box parts (sides, back, inner front, bottom)
 * using local-space containment behind the front panel. Works for both parametric & template cabinets.
 */
interface DrawerAssemblyInfo {
  front: FurniturePart;
  slideType: DrawerSlideType;
  boxParts: FurniturePart[];
  boxDepthMm: number;
  boxOuterWidthMm: number;
  boxHeightMm: number;
  /** Box center in the drawer front's local coordinate frame (mm) */
  boxCenterLocalMm: THREE.Vector3;
  /** Inner faces of left & right carcass walls in front-local X (mm), if found */
  carcassLeftInnerLocalXMm: number;
  carcassRightInnerLocalXMm: number;
  slideDistM: number;
}

function analyzeDrawerAssemblies(parts: FurniturePart[]): DrawerAssemblyInfo[] {
  const fronts = parts.filter(
    (p) =>
      p.hardwareTag === 'drawer_front' ||
      (p.kind === 'door' && p.drawerSlideType && p.drawerSlideType !== 'none')
  );
  const allBoxParts = parts.filter((p) => p.hardwareTag === 'drawer_box');
  const assignedBoxIds = new Set<string>();
  const assemblies: DrawerAssemblyInfo[] = [];

  for (const front of fronts) {
    const frontPos = new THREE.Vector3(front.position[0], front.position[1], front.position[2]);
    const frontQuat = getPartQuat(front);
    const invFrontQuat = frontQuat.clone().invert();

    // Find drawer_box parts belonging to this drawer front
    const matchedBox: FurniturePart[] = [];
    for (const bp of allBoxParts) {
      if (assignedBoxIds.has(bp.id)) continue;
      if (!sameCabinetGroup(front, bp)) continue;

      const rel = new THREE.Vector3(
        bp.position[0] - frontPos.x,
        bp.position[1] - frontPos.y,
        bp.position[2] - frontPos.z
      ).applyQuaternion(invFrontQuat);

      // Drawer box must sit behind the front (-Z), within X width, and vertically aligned with front
      const inX = Math.abs(rel.x) <= front.width * 0.55 + 15;
      const inY = Math.abs(rel.y) <= front.height * 0.55 + 12;
      const inZ = rel.z < -front.depth * 0.3 && rel.z > -680;
      if (inX && inY && inZ) {
        matchedBox.push(bp);
      }
    }
    matchedBox.forEach((b) => assignedBoxIds.add(b.id));

    // Compute exact local bounding box of matched drawer box parts
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;

    if (matchedBox.length > 0) {
      for (const bp of matchedBox) {
        const rel = new THREE.Vector3(
          bp.position[0] - frontPos.x,
          bp.position[1] - frontPos.y,
          bp.position[2] - frontPos.z
        ).applyQuaternion(invFrontQuat);
        // Project bp dimensions into front local space (usually identical rotation)
        minX = Math.min(minX, rel.x - bp.width * 0.5);
        maxX = Math.max(maxX, rel.x + bp.width * 0.5);
        minY = Math.min(minY, rel.y - bp.height * 0.5);
        maxY = Math.max(maxY, rel.y + bp.height * 0.5);
        minZ = Math.min(minZ, rel.z - bp.depth * 0.5);
        maxZ = Math.max(maxZ, rel.z + bp.depth * 0.5);
      }
    } else {
      // Fallback if a user manually created a standalone drawer front without box parts
      const estW = Math.max(120, front.width - 44);
      const estH = Math.max(70, Math.min(160, front.height - 36));
      const estD = 420;
      minX = -estW / 2;
      maxX = estW / 2;
      minY = -estH / 2;
      maxY = estH / 2;
      maxZ = -front.depth / 2 - 2;
      minZ = maxZ - estD;
    }

    const boxOuterWidthMm = Math.max(80, maxX - minX);
    const boxHeightMm = Math.max(40, maxY - minY);
    const boxDepthMm = Math.max(140, maxZ - minZ);
    const boxCenterLocalMm = new THREE.Vector3(
      (minX + maxX) * 0.5,
      (minY + maxY) * 0.5,
      (minZ + maxZ) * 0.5
    );

    const slideType: DrawerSlideType =
      front.drawerSlideType && front.drawerSlideType !== 'none'
        ? front.drawerSlideType
        : 'ball_26mm';
    const nominalClearancePerSide =
      slideType === 'undermount_blum' ? 5 : slideType === 'ball_26mm' ? 13 : 7;

    // Locate left & right vertical carcass walls flanking this drawer in front-local space
    let carcassLeftInnerLocalXMm = minX - nominalClearancePerSide;
    let carcassRightInnerLocalXMm = maxX + nominalClearancePerSide;
    let bestLeftDist = 60;
    let bestRightDist = 60;

    for (const wall of parts) {
      if (wall.id === front.id) continue;
      if (wall.kind !== 'panel') continue;
      if (wall.hardwareTag === 'drawer_box' || wall.hardwareTag === 'wall_filler') continue;
      if (!sameCabinetGroup(front, wall)) continue;
      // Vertical side wall or vertical divider: thin X
      if (!(wall.width <= 40 && wall.height >= 120 && wall.depth >= 180)) continue;

      const rel = new THREE.Vector3(
        wall.position[0] - frontPos.x,
        wall.position[1] - frontPos.y,
        wall.position[2] - frontPos.z
      ).applyQuaternion(invFrontQuat);

      const coversY =
        rel.y - wall.height * 0.5 <= maxY - 10 &&
        rel.y + wall.height * 0.5 >= minY + 10;
      const coversZ = rel.z + wall.depth * 0.5 > maxZ - 80 && rel.z - wall.depth * 0.5 < minZ + 80;
      if (!coversY || !coversZ) continue;

      const innerRightFace = rel.x + wall.width * 0.5;
      const innerLeftFace = rel.x - wall.width * 0.5;

      if (innerRightFace <= minX + 4) {
        const dist = Math.abs(minX - innerRightFace);
        if (dist < bestLeftDist) {
          bestLeftDist = dist;
          carcassLeftInnerLocalXMm = innerRightFace;
        }
      }
      if (innerLeftFace >= maxX - 4) {
        const dist = Math.abs(innerLeftFace - maxX);
        if (dist < bestRightDist) {
          bestRightDist = dist;
          carcassRightInnerLocalXMm = innerLeftFace;
        }
      }
    }

    // Realistic full-extension travel: ~86% of actual drawer box depth, clamped cleanly so drawer never detaches!
    const travelMm = Math.max(150, Math.min(460, Math.round((boxDepthMm - 28) * 0.86)));
    const slideDistM = travelMm * MM_TO_M;

    assemblies.push({
      front,
      slideType,
      boxParts: matchedBox,
      boxDepthMm,
      boxOuterWidthMm,
      boxHeightMm,
      boxCenterLocalMm,
      carcassLeftInnerLocalXMm,
      carcassRightInnerLocalXMm,
      slideDistM,
    });
  }

  return assemblies;
}

/**
 * Computes exact per-part drawer slide travel (in meters) so fronts and their boxes
 * slide together with realistic full-extension travel proportional to actual drawer depth.
 */
export function computeDrawerSlideTravelMap(parts: FurniturePart[]): Map<string, number> {
  const map = new Map<string, number>();
  const assemblies = analyzeDrawerAssemblies(parts);
  for (const a of assemblies) {
    map.set(a.front.id, a.slideDistM);
    for (const bp of a.boxParts) {
      map.set(bp.id, a.slideDistM);
    }
  }
  // Wire cargo baskets & ungrouped drawer-like parts
  for (const p of parts) {
    if (map.has(p.id)) continue;
    if (p.applianceModel === 'wire_cargo') {
      const travelMm = Math.max(180, Math.min(440, Math.round((p.depth - 30) * 0.85)));
      map.set(p.id, travelMm * MM_TO_M);
    } else if (p.hardwareTag === 'drawer_box' || /szuflad|cargo/i.test(p.name)) {
      const travelMm = Math.max(180, Math.min(420, Math.round((p.depth - 30) * 0.82)));
      map.set(p.id, travelMm * MM_TO_M);
    }
  }
  return map;
}

/**
 * Computes standard hinge anchor positions in door-local space (meters) for both door cups and carcass plates.
 */
export function getDoorHingePositionsLocalM(part: FurniturePart): THREE.Vector3[] {
  if (part.kind !== 'door' || !part.hingeSide || part.hingeSide === 'none') {
    return [];
  }
  const count = Math.max(
    2,
    Math.min(5, part.hingeCount ?? (part.height > 1500 ? 4 : part.height > 950 ? 3 : 2))
  );
  const w = part.width * MM_TO_M;
  const h = part.height * MM_TO_M;
  const d = part.depth * MM_TO_M;
  const insetFromEdge = 0.0225; // K=5 mm + Ø35/2 = 22.5 mm from door outer edge
  const positions: THREE.Vector3[] = [];

  for (let i = 0; i < count; i++) {
    const frac = count === 1 ? 0.5 : i / (count - 1);
    if (part.hingeSide === 'top') {
      const margin = Math.min(0.1, w * 0.2);
      const x = -w / 2 + margin + frac * Math.max(0.05, w - margin * 2);
      positions.push(new THREE.Vector3(x, h / 2 - insetFromEdge, -d / 2));
    } else {
      const margin = Math.min(0.1, h * 0.18);
      const y = -h / 2 + margin + frac * Math.max(0.05, h - margin * 2);
      const x = part.hingeSide === 'left' ? -w / 2 + insetFromEdge : w / 2 - insetFromEdge;
      positions.push(new THREE.Vector3(x, y, -d / 2));
    }
  }
  return positions;
}

/**
 * Door-side Ø35 mm concealed hinge cups (recessed strictly inside the back of the 18 mm door).
 * ZERO parts ever protrude past the door's outer edge when closed!
 */
export function buildDoorHingeCupsGroup(part: FurniturePart): THREE.Group | null {
  const positions = getDoorHingePositionsLocalM(part);
  if (positions.length === 0) return null;

  const group = new THREE.Group();
  group.name = 'door_hinge_cups';

  const steelMat = new THREE.MeshStandardMaterial({
    color: '#C8CFD8',
    metalness: 0.91,
    roughness: 0.2,
  });
  const satinSteelMat = new THREE.MeshStandardMaterial({
    color: '#A7B1BD',
    metalness: 0.88,
    roughness: 0.28,
  });
  const darkRecessMat = new THREE.MeshStandardMaterial({
    color: '#232830',
    metalness: 0.4,
    roughness: 0.68,
  });

  const cupGeo = new THREE.CylinderGeometry(0.0175, 0.0175, 0.0105, 22);
  cupGeo.rotateX(Math.PI / 2);
  const innerBowlGeo = new THREE.CylinderGeometry(0.0146, 0.0138, 0.0022, 18);
  innerBowlGeo.rotateX(Math.PI / 2);
  const rimRingGeo = new THREE.TorusGeometry(0.0168, 0.0011, 6, 22);
  const flangeGeo = new THREE.BoxGeometry(0.023, 0.056, 0.0022);
  const screwGeo = new THREE.CylinderGeometry(0.0033, 0.0033, 0.0026, 12);
  screwGeo.rotateX(Math.PI / 2);
  const slotBarGeo = new THREE.BoxGeometry(0.0036, 0.0008, 0.0008);
  const slotBarVGeo = new THREE.BoxGeometry(0.0008, 0.0036, 0.0008);
  const earLugGeo = new THREE.BoxGeometry(0.006, 0.0032, 0.0085);
  const knucklePinGeo = new THREE.CylinderGeometry(0.0024, 0.0024, 0.0155, 10);

  for (const pos of positions) {
    const unit = new THREE.Group();
    unit.position.copy(pos);

    // Ø35 mm pressed-steel cup recessed INTO the door thickness (+Z from rear face -d/2)
    const cup = new THREE.Mesh(cupGeo, steelMat);
    cup.position.z = 0.0046;
    unit.add(cup);

    // Dark recessed stepped interior cup bowl + rolled outer steel lip
    const recess = new THREE.Mesh(innerBowlGeo, darkRecessMat);
    recess.position.z = -0.0003;
    const rim = new THREE.Mesh(rimRingGeo, steelMat);
    rim.position.z = -0.0012;
    unit.add(recess, rim);

    // Internal steel pivot bridge inside the bowl
    const innerBridge = new THREE.Mesh(
      new THREE.BoxGeometry(0.011, 0.014, 0.003),
      satinSteelMat
    );
    innerBridge.position.z = -0.0008;
    unit.add(innerBridge);

    // Mounting flange ears flush on the back face of the door (oriented along hinge axis)
    const flange = new THREE.Mesh(flangeGeo, steelMat);
    if (part.hingeSide === 'top') {
      flange.rotation.z = Math.PI / 2;
    }
    flange.position.z = -0.0012;
    unit.add(flange);

    // 2 countersunk PZ mounting screw heads on the flange (spaced 45 mm apart — Blum standard)
    for (const sOff of [-0.0225, 0.0225]) {
      const scr = new THREE.Mesh(screwGeo, steelMat);
      const sl1 = new THREE.Mesh(slotBarGeo, darkRecessMat);
      const sl2 = new THREE.Mesh(slotBarVGeo, darkRecessMat);
      if (part.hingeSide === 'top') {
        scr.position.set(sOff, 0, -0.0023);
        sl1.position.set(sOff, 0, -0.0035);
        sl2.position.set(sOff, 0, -0.0035);
      } else {
        scr.position.set(0, sOff, -0.0023);
        sl1.position.set(0, sOff, -0.0035);
        sl2.position.set(0, sOff, -0.0035);
      }
      unit.add(scr, sl1, sl2);
    }

    // Twin articulated hinge knuckle lugs + central steel pivot pin tucked strictly inside carcass (-Z)
    const knuckleGroup = new THREE.Group();
    if (part.hingeSide === 'top') {
      knuckleGroup.rotation.z = Math.PI / 2;
    }
    const topLug = new THREE.Mesh(earLugGeo, satinSteelMat);
    topLug.position.set(0, 0.0062, -0.0046);
    const botLug = new THREE.Mesh(earLugGeo, satinSteelMat);
    botLug.position.set(0, -0.0062, -0.0046);
    const pin = new THREE.Mesh(knucklePinGeo, steelMat);
    pin.position.set(0, 0, -0.0065);
    knuckleGroup.add(topLug, botLug, pin);
    unit.add(knuckleGroup);

    group.add(unit);
  }

  markDisposable(group);
  return group;
}

/**
 * Composite realistic adjustable kitchen/furniture leg (mounting flange with 4 countersunk screws,
 * ribbed ABS upper barrel, knurled adjustment collar, threaded leveling spindle, beveled anti-slip foot).
 */
export function buildFurnitureLegGroup(part: FurniturePart): THREE.Group {
  const group = new THREE.Group();
  group.name = 'adjustable_furniture_leg';

  const h = Math.max(0.03, part.height * MM_TO_M);
  const absMat = new THREE.MeshStandardMaterial({
    color: '#1E2127',
    roughness: 0.52,
    metalness: 0.08,
  });
  const absRibMat = new THREE.MeshStandardMaterial({
    color: '#272B33',
    roughness: 0.46,
    metalness: 0.12,
  });
  const matteRubberMat = new THREE.MeshStandardMaterial({
    color: '#111317',
    roughness: 0.9,
    metalness: 0.02,
  });
  const metalScrewMat = new THREE.MeshStandardMaterial({
    color: '#9BA5B2',
    roughness: 0.28,
    metalness: 0.86,
  });

  // 1. Top mounting plate screwed to cabinet bottom deck
  const flangeH = Math.min(0.006, h * 0.12);
  const flange = new THREE.Mesh(new THREE.BoxGeometry(0.054, flangeH, 0.054), absMat);
  flange.position.y = h / 2 - flangeH / 2;
  group.add(flange);

  // 4 corner countersunk metal screw heads on mounting plate
  const bossGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.002, 10);
  for (const [bx, bz] of [
    [-0.02, -0.02],
    [0.02, -0.02],
    [-0.02, 0.02],
    [0.02, 0.02],
  ]) {
    const boss = new THREE.Mesh(bossGeo, metalScrewMat);
    boss.position.set(bx, h / 2 - flangeH - 0.0008, bz);
    group.add(boss);
  }

  // 2. Upper cylindrical ABS sleeve + 4 radial vertical structural reinforcement ribs (żeberka)
  const upperH = Math.max(0.012, h * 0.54);
  const upperCenterY = h / 2 - flangeH - upperH / 2;
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0145, upperH, 16), absMat);
  sleeve.position.y = upperCenterY;
  group.add(sleeve);

  const ribGeo = new THREE.BoxGeometry(0.0028, upperH * 0.88, 0.0075);
  for (let i = 0; i < 4; i++) {
    const ang = (i * Math.PI) / 2 + Math.PI / 4;
    const rib = new THREE.Mesh(ribGeo, absRibMat);
    rib.position.set(Math.cos(ang) * 0.0155, upperCenterY + upperH * 0.04, Math.sin(ang) * 0.0155);
    rib.rotation.y = -ang + Math.PI / 2;
    group.add(rib);
  }

  // 3. Lower threaded leveling stem + visible coarse helical thread rings
  const lowerH = Math.max(0.01, h - flangeH - upperH - 0.008);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0112, 0.0112, lowerH + 0.008, 14), absMat);
  stem.position.y = -h / 2 + 0.008 + lowerH / 2;
  group.add(stem);

  const threadCount = Math.max(3, Math.min(8, Math.floor(lowerH / 0.0055)));
  const threadGeo = new THREE.TorusGeometry(0.0116, 0.0009, 5, 14);
  threadGeo.rotateX(Math.PI / 2);
  const threads = new THREE.InstancedMesh(threadGeo, absRibMat, threadCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < threadCount; i++) {
    const frac = threadCount === 1 ? 0.5 : i / (threadCount - 1);
    dummy.position.set(0, -h / 2 + 0.011 + frac * Math.max(0.004, lowerH - 0.006), 0);
    dummy.rotation.set(0.05, 0, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    threads.setMatrixAt(i, dummy.matrix);
  }
  threads.instanceMatrix.needsUpdate = true;
  group.add(threads);

  // 4. Knurled adjustment collar ring at sleeve/stem junction (with 6 radial grip notches)
  const collarY = h / 2 - flangeH - upperH;
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.0182, 0.0182, 0.0095, 18), absRibMat);
  collar.position.y = collarY;
  group.add(collar);

  const gripGeo = new THREE.BoxGeometry(0.0024, 0.0082, 0.0028);
  const grips = new THREE.InstancedMesh(gripGeo, absMat, 8);
  for (let i = 0; i < 8; i++) {
    const ang = (i / 8) * Math.PI * 2;
    dummy.position.set(Math.cos(ang) * 0.0185, collarY, Math.sin(ang) * 0.0185);
    dummy.rotation.set(0, -ang, 0);
    dummy.scale.set(1, 1, 1);
    dummy.updateMatrix();
    grips.setMatrixAt(i, dummy.matrix);
  }
  grips.instanceMatrix.needsUpdate = true;
  group.add(grips);

  // 5. Wide flared floor-glider foot pad + thin anti-slip rubber sole flush on Y = -h/2
  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0225, 0.0065, 18), absMat);
  foot.position.y = -h / 2 + 0.0052;
  const rubberSole = new THREE.Mesh(new THREE.CylinderGeometry(0.0225, 0.022, 0.0022, 18), matteRubberMat);
  rubberSole.position.y = -h / 2 + 0.0011;
  group.add(foot, rubberSole);

  markDisposable(group);
  return group;
}

/**
 * Extruded dual-channel aluminum sliding wardrobe track (top guide channel or bottom twin runner rail).
 */
export function buildSlidingTrackGroup(part: FurniturePart): THREE.Group | null {
  if (part.kind !== 'profile') return null;
  const isTop = /tor górny/i.test(part.name) || part.id.startsWith('cab_track_top');
  const isBot = /tor dolny/i.test(part.name) || part.id.startsWith('cab_track_bot');
  if (!isTop && !isBot) return null;

  const group = new THREE.Group();
  group.name = isTop ? 'sliding_track_top' : 'sliding_track_bottom';

  const w = Math.max(0.1, part.width * MM_TO_M);
  const h = Math.max(0.008, part.height * MM_TO_M);
  const d = Math.max(0.04, part.depth * MM_TO_M);

  const aluMat = new THREE.MeshStandardMaterial({
    color: '#CDD4DD',
    metalness: 0.88,
    roughness: 0.24,
  });
  const channelShadowMat = new THREE.MeshStandardMaterial({
    color: '#2F3640',
    metalness: 0.4,
    roughness: 0.65,
  });

  if (isTop) {
    // Top double-U extruded aluminum track: solid top web + 3 downward vertical walls creating 2 parallel channels
    const webH = Math.min(0.005, h * 0.22);
    const topWeb = new THREE.Mesh(new THREE.BoxGeometry(w, webH, d), aluMat);
    topWeb.position.y = h / 2 - webH / 2;
    group.add(topWeb);

    const wallThick = 0.003;
    const wallH = h - webH;
    const wallZPositions = [-d / 2 + wallThick / 2, 0, d / 2 - wallThick / 2];
    for (const wz of wallZPositions) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, wallH, wallThick), aluMat);
      wall.position.set(0, -webH / 2, wz);
      group.add(wall);
    }

    // Dark recessed ceiling inside the two parallel guide channels
    const slotDepth = d / 2 - wallThick * 1.6;
    for (const sz of [-d / 4, d / 4]) {
      const slot = new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, 0.002, slotDepth), channelShadowMat);
      slot.position.set(0, h / 2 - webH - 0.001, sz);
      group.add(slot);
    }
  } else {
    // Bottom twin-rail extruded aluminum track: flat base plate + 2 raised convex runner rails + center divider
    const baseH = Math.min(0.004, h * 0.35);
    const base = new THREE.Mesh(new THREE.BoxGeometry(w, baseH, d), aluMat);
    base.position.y = -h / 2 + baseH / 2;
    group.add(base);

    const railH = h - baseH;
    // Front & rear trim lips + 2 raised convex roller rails at z = ±16 mm
    const lipGeo = new THREE.BoxGeometry(w, railH * 0.7, 0.003);
    const frontLip = new THREE.Mesh(lipGeo, aluMat);
    frontLip.position.set(0, -h / 2 + baseH + railH * 0.35, d / 2 - 0.0015);
    const backLip = new THREE.Mesh(lipGeo, aluMat);
    backLip.position.set(0, -h / 2 + baseH + railH * 0.35, -d / 2 + 0.0015);
    group.add(frontLip, backLip);

    const railOffset = Math.min(d * 0.25, 0.016);
    for (const rz of [-railOffset, railOffset]) {
      const runner = new THREE.Mesh(new THREE.BoxGeometry(w, railH, 0.0045), aluMat);
      runner.position.set(0, -h / 2 + baseH + railH / 2, rz);
      const ridge = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0022, 0.0022, w, 8).rotateZ(Math.PI / 2),
        aluMat
      );
      ridge.position.set(0, h / 2, rz);
      group.add(runner, ridge);
    }
  }

  markDisposable(group);
  return group;
}

/**
 * Adds top guide carriages and bottom rolling wheels to sliding wardrobe doors.
 */
export function buildSlidingDoorRollersGroup(part: FurniturePart): THREE.Group | null {
  if (part.hardwareTag !== 'sliding_door') return null;

  const group = new THREE.Group();
  group.name = 'sliding_door_rollers';

  const w = part.width * MM_TO_M;
  const h = part.height * MM_TO_M;
  const d = part.depth * MM_TO_M;

  const steelMat = new THREE.MeshStandardMaterial({
    color: '#BFC7D1',
    metalness: 0.9,
    roughness: 0.24,
  });
  const chromeHubMat = new THREE.MeshStandardMaterial({
    color: '#E6EBF2',
    metalness: 0.96,
    roughness: 0.12,
  });
  const nylonWheelMat = new THREE.MeshStandardMaterial({
    color: '#1E232B',
    metalness: 0.08,
    roughness: 0.65,
  });

  const screwGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.002, 8).rotateX(Math.PI / 2);
  const wheelTireGeo = new THREE.CylinderGeometry(0.0135, 0.0135, 0.0068, 18).rotateX(Math.PI / 2);
  const wheelHubGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.0082, 12).rotateX(Math.PI / 2);
  const axleGeo = new THREE.CylinderGeometry(0.0026, 0.0026, 0.013, 10).rotateX(Math.PI / 2);

  const xInset = Math.min(0.085, w * 0.16);
  for (const sx of [-w / 2 + xInset, w / 2 - xInset]) {
    // Bottom spring-loaded roller carriage: mounting plate + 3 screws + leveling hex bolt + flanged bearing wheel
    const botPlate = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.048, 0.003), steelMat);
    botPlate.position.set(sx, -h / 2 + 0.028, -d / 2 - 0.002);
    const botHousing = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.03, 0.012), steelMat);
    botHousing.position.set(sx, -h / 2 + 0.016, -d / 2 - 0.0075);
    const adjHex = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.008, 6), chromeHubMat);
    adjHex.position.set(sx + 0.018, -h / 2 + 0.042, -d / 2 - 0.006);

    for (const [dx, dy] of [
      [-0.022, 0.016],
      [0.022, 0.016],
      [-0.022, -0.014],
    ]) {
      const scr = new THREE.Mesh(screwGeo, chromeHubMat);
      scr.position.set(sx + dx, -h / 2 + 0.028 + dy, -d / 2 - 0.0038);
      group.add(scr);
    }

    const wheel = new THREE.Mesh(wheelTireGeo, nylonWheelMat);
    wheel.position.set(sx, -h / 2 - 0.002, 0);
    const wheelHub = new THREE.Mesh(wheelHubGeo, chromeHubMat);
    wheelHub.position.set(sx, -h / 2 - 0.002, 0);
    const wheelAxle = new THREE.Mesh(axleGeo, steelMat);
    wheelAxle.position.set(sx, -h / 2 - 0.002, 0);
    group.add(botPlate, botHousing, adjHex, wheel, wheelHub, wheelAxle);

    // Top guide carriage: steel plate + 2 screws + twin coaxial spring-loaded nylon guide wheels
    const topPlate = new THREE.Mesh(new THREE.BoxGeometry(0.058, 0.04, 0.003), steelMat);
    topPlate.position.set(sx, h / 2 - 0.024, -d / 2 - 0.002);
    for (const dx of [-0.02, 0.02]) {
      const scr = new THREE.Mesh(screwGeo, chromeHubMat);
      scr.position.set(sx + dx, h / 2 - 0.024, -d / 2 - 0.0038);
      group.add(scr);
    }
    const guideStem = new THREE.Mesh(new THREE.BoxGeometry(0.028, 0.026, 0.006), steelMat);
    guideStem.position.set(sx, h / 2 + 0.008, 0);
    for (const gx of [-0.011, 0.011]) {
      const gWheel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0088, 0.0088, 0.0072, 12),
        nylonWheelMat
      );
      gWheel.position.set(sx + gx, h / 2 + 0.017, 0);
      const gPin = new THREE.Mesh(
        new THREE.CylinderGeometry(0.0026, 0.0026, 0.0095, 8),
        chromeHubMat
      );
      gPin.position.set(sx + gx, h / 2 + 0.017, 0);
      group.add(gWheel, gPin);
    }
    group.add(topPlate, guideStem);
  }

  markDisposable(group);
  return group;
}

/**
 * Runtime controller for carcass-mounted mechanical hardware that dynamically tracks
 * opening doors, drawers, flap lifts, and Tip-On latches with zero per-frame allocations.
 */
export interface CabinetHardwareRuntime {
  root: THREE.Group;
  update: (opnAmt: number, expAmt: number, partNodes: Map<string, THREE.Group>) => void;
}

interface DynamicSlideRail {
  hostPartId: string;
  node: THREE.Object3D;
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  explodeDir: THREE.Vector3;
  slideAxisWorld: THREE.Vector3;
  slideDistM: number;
  /** 0 = stationary carcass rail, 0.5 = mid telescopic rail, 1.0 = drawer-attached runner */
  travelFactor: number;
}

interface ArticulatedHingeArm {
  doorId: string;
  cupLocalPos: THREE.Vector3;
  plateBaseWorldPos: THREE.Vector3;
  plateExplodeDir: THREE.Vector3;
  plateGroup: THREE.Group;
  armGroup: THREE.Group;
  armMesh: THREE.Mesh;
}

interface TelescopicGasStrut {
  doorId: string;
  doorAttachLocal: THREE.Vector3;
  carcassBaseWorldPos: THREE.Vector3;
  carcassExplodeDir: THREE.Vector3;
  cylinderGroup: THREE.Group;
  pistonGroup: THREE.Group;
  pistonMesh: THREE.Mesh;
}

interface DynamicTipOnLatch {
  doorId: string;
  latchGroup: THREE.Group;
  plungerMesh: THREE.Mesh;
  baseWorldPos: THREE.Vector3;
  explodeDir: THREE.Vector3;
  basePlungerZ: number;
}

/**
 * Builds all carcass-mounted & articulated 3D carpentry hardware for the entire project:
 * - Cruciform hinge mounting plates (prowadniki) + articulating hinge arms
 * - Pneumatic gas struts (siłowniki gazowe) for upward-opening flap doors
 * - 3D drawer slides (ball-bearing telescopic, Blum Movento undermount + locking clips, Tandembox metal sides & rails)
 * - Stationary Tip-On push-to-open magnetic latches
 * - Nickel-plated Ø5 mm shelf support pins underneath interior shelves
 */
export function buildCabinetHardwareScene(
  parts: FurniturePart[],
  partBasePos: Map<string, THREE.Vector3>,
  partBaseQuat: Map<string, THREE.Quaternion>,
  partExplodeDir: Map<string, THREE.Vector3>,
  drawerTravelMap: Map<string, number>,
  visiblePartIds?: Set<string>
): CabinetHardwareRuntime {
  const root = new THREE.Group();
  root.name = 'cabinet_hardware_root';

  const visibleParts = visiblePartIds
    ? parts.filter((p) => visiblePartIds.has(p.id))
    : parts;

  // Shared materials (all marked disposeMaterial on their meshes for clean teardown)
  const galvanizedSteelMat = new THREE.MeshStandardMaterial({
    color: '#BFC7D1',
    metalness: 0.9,
    roughness: 0.25,
  });
  const brushedNickelMat = new THREE.MeshStandardMaterial({
    color: '#D2D8E0',
    metalness: 0.92,
    roughness: 0.18,
  });
  const darkPolymerMat = new THREE.MeshStandardMaterial({
    color: '#1F242B',
    metalness: 0.12,
    roughness: 0.65,
  });
  const blumOrangeMat = new THREE.MeshStandardMaterial({
    color: '#E86A17',
    metalness: 0.08,
    roughness: 0.48,
  });
  const tandemAnthraciteMat = new THREE.MeshStandardMaterial({
    color: '#343942',
    metalness: 0.72,
    roughness: 0.34,
  });
  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#E5EAF0',
    metalness: 0.96,
    roughness: 0.12,
  });

  const dynamicRails: DynamicSlideRail[] = [];
  const articulatedHinges: ArticulatedHingeArm[] = [];
  const gasStruts: TelescopicGasStrut[] = [];
  const tipOnLatches: DynamicTipOnLatch[] = [];

  // =========================================================================
  // 1. CONCEALED CUP HINGE MOUNTING PLATES + ARTICULATING ARMS + FLAP STRUTS
  // =========================================================================
  for (const door of visibleParts) {
    if (door.kind !== 'door' || !door.hingeSide || door.hingeSide === 'none') continue;
    if (door.hardwareTag === 'drawer_front' || door.hardwareTag === 'sliding_door') continue;

    const doorBasePos = partBasePos.get(door.id);
    const doorQuat = partBaseQuat.get(door.id);
    const doorExplode = partExplodeDir.get(door.id) ?? new THREE.Vector3();
    if (!doorBasePos || !doorQuat) continue;

    const invDoorQuat = doorQuat.clone().invert();
    const hingeLocals = getDoorHingePositionsLocalM(door);
    const isOverlay = door.hardwareTag !== 'door_inset';
    const w = door.width * MM_TO_M;
    const h = door.height * MM_TO_M;
    const d = door.depth * MM_TO_M;

    // Locate mating carcass side wall (for left/right hinge) or top deck (for top flap)
    let platePlaneLocal =
      door.hingeSide === 'left'
        ? isOverlay
          ? -w / 2 + 0.017
          : -w / 2 - 0.002
        : door.hingeSide === 'right'
          ? isOverlay
            ? w / 2 - 0.017
            : w / 2 + 0.002
          : isOverlay
            ? h / 2 - 0.017
            : h / 2 + 0.002;
    let matingExplode = doorExplode.clone();
    let bestWallDist = 0.055;

    for (const candidate of visibleParts) {
      if (candidate.id === door.id || candidate.kind !== 'panel') continue;
      if (!sameCabinetGroup(door, candidate)) continue;
      const cPos = partBasePos.get(candidate.id);
      if (!cPos) continue;
      const rel = cPos.clone().sub(doorBasePos).applyQuaternion(invDoorQuat);

      if (door.hingeSide === 'left' || door.hingeSide === 'right') {
        if (!(candidate.width <= 40 && candidate.depth >= 150)) continue;
        const innerFaceLocalX =
          door.hingeSide === 'left'
            ? rel.x + (candidate.width * MM_TO_M) / 2
            : rel.x - (candidate.width * MM_TO_M) / 2;
        const targetX = door.hingeSide === 'left' ? -w / 2 + 0.016 : w / 2 - 0.016;
        const dist = Math.abs(innerFaceLocalX - targetX);
        if (dist < bestWallDist && rel.z < 0) {
          bestWallDist = dist;
          platePlaneLocal = innerFaceLocalX;
          matingExplode = (partExplodeDir.get(candidate.id) ?? doorExplode).clone();
        }
      } else if (door.hingeSide === 'top') {
        if (!(candidate.height <= 40 && candidate.depth >= 150)) continue;
        const innerFaceLocalY = rel.y - (candidate.height * MM_TO_M) / 2;
        const targetY = h / 2 - 0.016;
        const dist = Math.abs(innerFaceLocalY - targetY);
        if (dist < bestWallDist && rel.z < 0) {
          bestWallDist = dist;
          platePlaneLocal = innerFaceLocalY;
          matingExplode = (partExplodeDir.get(candidate.id) ?? doorExplode).clone();
        }
      }
    }

    for (const cupLocal of hingeLocals) {
      // System 32 mounting plate sits 37 mm behind the front edge of the carcass side wall
      const plateLocal = new THREE.Vector3();
      if (door.hingeSide === 'top') {
        plateLocal.set(cupLocal.x, platePlaneLocal, -d / 2 - 0.038);
      } else {
        plateLocal.set(platePlaneLocal, cupLocal.y, -d / 2 - 0.038);
      }

      const plateWorld = plateLocal.clone().applyQuaternion(doorQuat).add(doorBasePos);
      const plateGroup = new THREE.Group();
      plateGroup.position.copy(plateWorld);
      plateGroup.quaternion.copy(doorQuat);

      // Cruciform mounting plate (prowadnik krzyżakowy Blum System 32) flat against inner carcass wall
      const sign = door.hingeSide === 'left' ? 1 : door.hingeSide === 'right' ? -1 : -1;
      if (door.hingeSide === 'top') {
        const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.0035, 0.017), galvanizedSteelMat);
        crossBar.position.set(0, -0.0018, 0);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.0075, 0.042), galvanizedSteelMat);
        spine.position.set(0, -0.005, 0.003);
        const euroGeo = new THREE.CylinderGeometry(0.0035, 0.0035, 0.0028, 10);
        const slotGeo = new THREE.BoxGeometry(0.0034, 0.0007, 0.0008);
        for (const sx of [-0.016, 0.016]) {
          const es = new THREE.Mesh(euroGeo, brushedNickelMat);
          es.position.set(sx, -0.0042, 0);
          const sl = new THREE.Mesh(slotGeo, darkPolymerMat);
          sl.position.set(sx, -0.0056, 0);
          plateGroup.add(es, sl);
        }
        // Central height cam adjuster screw
        const camScr = new THREE.Mesh(new THREE.CylinderGeometry(0.0032, 0.0032, 0.0024, 10), chromeMat);
        camScr.position.set(0, -0.009, 0.006);
        plateGroup.add(crossBar, spine, camScr);
      } else {
        const crossBar = new THREE.Mesh(new THREE.BoxGeometry(0.0035, 0.048, 0.017), galvanizedSteelMat);
        crossBar.position.set(sign * 0.0018, 0, 0);
        const spine = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.017, 0.042), galvanizedSteelMat);
        spine.position.set(sign * 0.0052, 0, 0.003);
        // 2 Euro screw heads spaced 32 mm vertically with PZ slots
        const euroGeo = new THREE.CylinderGeometry(0.0036, 0.0036, 0.0028, 10).rotateZ(Math.PI / 2);
        const slotHGeo = new THREE.BoxGeometry(0.0007, 0.0038, 0.0008);
        const slotVGeo = new THREE.BoxGeometry(0.0007, 0.0008, 0.0038);
        for (const sy of [-0.016, 0.016]) {
          const scr = new THREE.Mesh(euroGeo, brushedNickelMat);
          scr.position.set(sign * 0.0042, sy, 0);
          const sl1 = new THREE.Mesh(slotHGeo, darkPolymerMat);
          sl1.position.set(sign * 0.0056, sy, 0);
          const sl2 = new THREE.Mesh(slotVGeo, darkPolymerMat);
          sl2.position.set(sign * 0.0056, sy, 0);
          plateGroup.add(scr, sl1, sl2);
        }
        // Central cam height adjuster screw on mounting plate spine
        const camScr = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0032, 0.0032, 0.0022, 10).rotateZ(Math.PI / 2),
          chromeMat
        );
        camScr.position.set(sign * 0.0096, 0, -0.006);
        plateGroup.add(crossBar, spine, camScr);
      }

      // Articulating 4-bar Blum CLIP top hinge arm: sculpted cover housing + 2 visible 3D adjustment screws
      // + rear spring CLIP release tab + dynamically extending linkage bar!
      const armGroup = new THREE.Group();
      armGroup.position.copy(plateWorld);

      // Dynamic telescopic inner bridge link scaled strictly from 0..dist in update()
      const armGeo = new THREE.BoxGeometry(0.0085, 0.009, 1);
      armGeo.translate(0, 0, 0.5);
      const armMesh = new THREE.Mesh(armGeo, galvanizedSteelMat);
      armGroup.add(armMesh);

      // Sculpted brushed-nickel CLIP top hinge arm body sitting at the plate side (never stretched)
      const armBody = new THREE.Mesh(
        new THREE.BoxGeometry(0.0145, 0.0145, 0.034),
        brushedNickelMat
      );
      armBody.position.set(0, 0, 0.014);
      // Top bevel cap ridge on hinge arm
      const armCap = new THREE.Mesh(
        new THREE.BoxGeometry(0.0115, 0.003, 0.03),
        chromeMat
      );
      armCap.position.set(0, 0.008, 0.014);
      // Rear spring-loaded CLIP-on release latch tab
      const clipTab = new THREE.Mesh(
        new THREE.BoxGeometry(0.012, 0.009, 0.009),
        galvanizedSteelMat
      );
      clipTab.position.set(0, 0, -0.006);
      // 2 iconic visible 3D adjustment screws: front overlay screw + rear eccentric depth cam screw
      const adjScrewGeo = new THREE.CylinderGeometry(0.0032, 0.0032, 0.0035, 10);
      const overlayScrew = new THREE.Mesh(adjScrewGeo, chromeMat);
      overlayScrew.position.set(0, 0.0098, 0.022);
      const overlaySlot = new THREE.Mesh(new THREE.BoxGeometry(0.0034, 0.0008, 0.0009), darkPolymerMat);
      overlaySlot.position.set(0, 0.0116, 0.022);

      const depthCam = new THREE.Mesh(new THREE.CylinderGeometry(0.0038, 0.0038, 0.003, 12), chromeMat);
      depthCam.position.set(0, 0.0096, 0.008);
      const depthSlot = new THREE.Mesh(new THREE.BoxGeometry(0.0009, 0.0008, 0.0038), darkPolymerMat);
      depthSlot.position.set(0, 0.0112, 0.008);

      armGroup.add(armBody, armCap, clipTab, overlayScrew, overlaySlot, depthCam, depthSlot);

      markDisposable(plateGroup);
      markDisposable(armGroup);
      root.add(plateGroup, armGroup);

      articulatedHinges.push({
        doorId: door.id,
        cupLocalPos: cupLocal.clone().add(new THREE.Vector3(0, 0, -0.004)),
        plateBaseWorldPos: plateWorld,
        plateExplodeDir: matingExplode,
        plateGroup,
        armGroup,
        armMesh,
      });
    }

    // Pneumatic Gas Struts (siłowniki gazowe 80N) for upward-opening flap doors
    if (door.hingeSide === 'top') {
      const strutInsetX = Math.max(0.02, w / 2 - 0.024);
      const doorAttachY = Math.max(-h / 2 + 0.04, h / 2 - Math.min(0.11, h * 0.34));
      const carcassY = Math.max(-h / 2 + 0.03, h / 2 - Math.min(0.21, h * 0.62));
      const carcassZ = -d / 2 - 0.145;

      for (const sideSign of [-1, 1]) {
        const doorAttachLocal = new THREE.Vector3(sideSign * strutInsetX, doorAttachY, -d / 2 - 0.006);
        const carcassLocal = new THREE.Vector3(sideSign * (w / 2 - 0.022), carcassY, carcassZ);
        const carcassWorld = carcassLocal.clone().applyQuaternion(doorQuat).add(doorBasePos);

        // Stationary ball-stud mounting plate + dark anodized pneumatic barrel + rubber seal collar
        const cylinderGroup = new THREE.Group();
        cylinderGroup.position.copy(carcassWorld);
        const mountBase = new THREE.Mesh(new THREE.CylinderGeometry(0.0115, 0.0115, 0.0045, 14), galvanizedSteelMat);
        mountBase.rotation.z = Math.PI / 2;
        const ballSocket = new THREE.Mesh(new THREE.SphereGeometry(0.0062, 10, 8), darkPolymerMat);
        ballSocket.position.z = 0.004;
        const cylGeo = new THREE.CylinderGeometry(0.0074, 0.0074, 0.108, 14);
        cylGeo.rotateX(Math.PI / 2);
        cylGeo.translate(0, 0, 0.06);
        const cylMesh = new THREE.Mesh(cylGeo, tandemAnthraciteMat);
        // Rubber oil-seal collar ring at mouth of cylinder
        const sealCollar = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0066, 0.0076, 0.007, 12).rotateX(Math.PI / 2),
          darkPolymerMat
        );
        sealCollar.position.z = 0.116;
        cylinderGroup.add(mountBase, ballSocket, cylMesh, sealCollar);

        // Chrome telescoping piston rod + far-end ball-socket clevis head
        const pistonGroup = new THREE.Group();
        pistonGroup.position.copy(carcassWorld);
        const pistonGeo = new THREE.CylinderGeometry(0.0033, 0.0033, 1, 10);
        pistonGeo.rotateX(Math.PI / 2);
        pistonGeo.translate(0, 0, 0.5);
        const pistonMesh = new THREE.Mesh(pistonGeo, chromeMat);
        pistonGroup.add(pistonMesh);

        markDisposable(cylinderGroup);
        markDisposable(pistonGroup);
        root.add(cylinderGroup, pistonGroup);

        gasStruts.push({
          doorId: door.id,
          doorAttachLocal,
          carcassBaseWorldPos: carcassWorld,
          carcassExplodeDir: matingExplode,
          cylinderGroup,
          pistonGroup,
          pistonMesh,
        });
      }
    }
  }

  // =========================================================================
  // 2. 3D DRAWER SLIDES (BALL-BEARING / BLUM UNDERMOUNT / TANDEMBOX METAL)
  // =========================================================================
  const drawerAssemblies = analyzeDrawerAssemblies(visibleParts);

  const slotMat = new THREE.MeshStandardMaterial({
    color: '#191D23',
    metalness: 0.25,
    roughness: 0.78,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  for (const drw of drawerAssemblies) {
    const frontPos = partBasePos.get(drw.front.id);
    const frontQuat = partBaseQuat.get(drw.front.id);
    const frontExplode = partExplodeDir.get(drw.front.id) ?? new THREE.Vector3();
    if (!frontPos || !frontQuat) continue;

    const slideAxisWorld = new THREE.Vector3(0, 0, 1).applyQuaternion(frontQuat).normalize();
    const boxLenM = Math.max(0.14, drw.boxDepthMm * MM_TO_M);
    const railLenM = Math.max(0.14, boxLenM - 0.01);
    const boxCenterM = drw.boxCenterLocalMm.clone().multiplyScalar(MM_TO_M);
    const boxBottomYM = boxCenterM.y - (drw.boxHeightMm * MM_TO_M) / 2;
    const boxHalfWM = (drw.boxOuterWidthMm * MM_TO_M) / 2;
    const leftWallX = drw.carcassLeftInnerLocalXMm * MM_TO_M;
    const rightWallX = drw.carcassRightInnerLocalXMm * MM_TO_M;
    const boxLeftX = boxCenterM.x - boxHalfWM;
    const boxRightX = boxCenterM.x + boxHalfWM;

    for (const sideSign of [-1, 1] as const) {
      const wallX = sideSign === -1 ? leftWallX : rightWallX;
      const boxEdgeX = sideSign === -1 ? boxLeftX : boxRightX;
      const inward = -sideSign; // +1 for left side (points right into bay), -1 for right side

      if (drw.slideType === 'ball_26mm') {
        // --- 45 mm Full-Extension Telescopic Ball-Bearing Slide (GTV / Hettich) ---
        const railY = boxCenterM.y - Math.min(0.012, drw.boxHeightMm * MM_TO_M * 0.12);
        const railZ = boxCenterM.z;

        // (A) Stationary Outer C-Channel screwed to cabinet side wall + oblong mounting slots + rear bumper
        const outerLocal = new THREE.Vector3(wallX + inward * 0.0025, railY, railZ);
        const outerGroup = new THREE.Group();
        const outerWeb = new THREE.Mesh(new THREE.BoxGeometry(0.0022, 0.044, railLenM), galvanizedSteelMat);
        const outerTopLip = new THREE.Mesh(new THREE.BoxGeometry(0.0085, 0.0032, railLenM), galvanizedSteelMat);
        outerTopLip.position.set(inward * 0.0035, 0.0205, 0);
        const outerBotLip = new THREE.Mesh(new THREE.BoxGeometry(0.0085, 0.0032, railLenM), galvanizedSteelMat);
        outerBotLip.position.set(inward * 0.0035, -0.0205, 0);
        // Rear black rubber end-stop bumper
        const rearStop = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.026, 0.012), darkPolymerMat);
        rearStop.position.set(inward * 0.0035, 0, -railLenM * 0.48);
        outerGroup.add(outerWeb, outerTopLip, outerBotLip, rearStop);

        // Oblong mounting slots (fasolki) + 3 Euro mounting screw heads along carcass rail
        const slotGeo = new THREE.BoxGeometry(0.0026, 0.0046, 0.012);
        const scrGeo = new THREE.CylinderGeometry(0.0028, 0.0028, 0.0026, 8).rotateZ(Math.PI / 2);
        for (const frac of [-0.36, -0.18, 0, 0.18, 0.36]) {
          const sl = new THREE.Mesh(slotGeo, slotMat);
          sl.position.set(inward * 0.0004, 0, railLenM * frac);
          outerGroup.add(sl);
        }
        for (const frac of [-0.36, 0, 0.36]) {
          const scr = new THREE.Mesh(scrGeo, brushedNickelMat);
          scr.position.set(inward * 0.002, 0, railLenM * frac);
          outerGroup.add(scr);
        }

        const outerWorld = outerLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        outerGroup.position.copy(outerWorld);
        outerGroup.quaternion.copy(frontQuat);
        markDisposable(outerGroup);
        root.add(outerGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: outerGroup,
          basePos: outerWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 0,
        });

        // (B) Intermediate Telescopic Ball-Cage Rail with visible gleaming chrome steel ball bearings (0.5x!)
        const midX = (wallX + boxEdgeX) * 0.5;
        const midLocal = new THREE.Vector3(midX, railY, railZ);
        const midGroup = new THREE.Group();
        const midRail = new THREE.Mesh(
          new THREE.BoxGeometry(0.004, 0.032, railLenM * 0.94),
          brushedNickelMat
        );
        const ballCageTop = new THREE.Mesh(
          new THREE.BoxGeometry(0.0046, 0.0044, railLenM * 0.84),
          darkPolymerMat
        );
        ballCageTop.position.y = 0.0152;
        const ballCageBot = new THREE.Mesh(
          new THREE.BoxGeometry(0.0046, 0.0044, railLenM * 0.84),
          darkPolymerMat
        );
        ballCageBot.position.y = -0.0152;
        midGroup.add(midRail, ballCageTop, ballCageBot);

        // Visible bright chrome steel ball bearings seated in top & bottom raceways (1 instanced draw call!)
        const ballsPerTrack = Math.max(5, Math.min(8, Math.round(railLenM * 18)));
        const ballGeo = new THREE.SphereGeometry(0.0023, 8, 6);
        const ballInst = new THREE.InstancedMesh(ballGeo, chromeMat, ballsPerTrack * 2);
        const bDummy = new THREE.Object3D();
        let bIdx = 0;
        for (const yOff of [0.0152, -0.0152]) {
          for (let bi = 0; bi < ballsPerTrack; bi++) {
            const frac = ballsPerTrack === 1 ? 0 : -0.38 + (bi / (ballsPerTrack - 1)) * 0.76;
            bDummy.position.set(inward * 0.0014, yOff, railLenM * frac);
            bDummy.rotation.set(0, 0, 0);
            bDummy.scale.set(1, 1, 1);
            bDummy.updateMatrix();
            ballInst.setMatrixAt(bIdx++, bDummy.matrix);
          }
        }
        ballInst.instanceMatrix.needsUpdate = true;
        midGroup.add(ballInst);

        const midWorld = midLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        midGroup.position.copy(midWorld);
        midGroup.quaternion.copy(frontQuat);
        markDisposable(midGroup);
        root.add(midGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: midGroup,
          basePos: midWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 0.5,
        });

        // (C) Inner Runner Profile screwed to drawer box side + oblong slots + sculpted black release trigger (1.0x!)
        const innerLocal = new THREE.Vector3(boxEdgeX - inward * 0.0022, railY, railZ);
        const innerGroup = new THREE.Group();
        const innerBar = new THREE.Mesh(
          new THREE.BoxGeometry(0.0036, 0.022, railLenM * 0.96),
          galvanizedSteelMat
        );
        for (const frac of [-0.34, -0.08, 0.34]) {
          const sl = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.0042, 0.011), slotMat);
          sl.position.set(0, 0, railLenM * frac);
          innerGroup.add(sl);
        }
        // Sculpted black polymer quick-disconnect trigger lever
        const releaseBase = new THREE.Mesh(
          new THREE.BoxGeometry(0.0046, 0.011, 0.036),
          darkPolymerMat
        );
        releaseBase.position.set(-inward * 0.0012, 0, railLenM * 0.21);
        const releaseTab = new THREE.Mesh(
          new THREE.BoxGeometry(0.0056, 0.0075, 0.016),
          darkPolymerMat
        );
        releaseTab.position.set(-inward * 0.002, 0.0025, railLenM * 0.24);
        releaseTab.rotation.x = 0.22;
        innerGroup.add(innerBar, releaseBase, releaseTab);

        const innerWorld = innerLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        innerGroup.position.copy(innerWorld);
        innerGroup.quaternion.copy(frontQuat);
        markDisposable(innerGroup);
        root.add(innerGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: innerGroup,
          basePos: innerWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 1.0,
        });
      } else if (drw.slideType === 'undermount_blum') {
        // --- Blum Movento / Tandem Concealed Undermount Slide + Hydraulic Soft-Close Damper + Front Clutches ---
        const runnerY = boxBottomYM + 0.006; // tucks cleanly into the 13 mm under-bottom recess
        const railZ = boxCenterM.z;

        // (A) Stationary Heavy-Duty Carcass L-Runner + Blumotion Hydraulic Damper + Chrome Piston
        const outerLocal = new THREE.Vector3(wallX + inward * 0.009, runnerY, railZ);
        const outerGroup = new THREE.Group();
        const wallPlate = new THREE.Mesh(
          new THREE.BoxGeometry(0.0028, 0.038, railLenM),
          galvanizedSteelMat
        );
        wallPlate.position.set(-inward * 0.0075, 0.008, 0);
        // Oblong mounting holes + 3 Euro screws on wall plate
        for (const frac of [-0.35, 0, 0.35]) {
          const sl = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.005, 0.012), slotMat);
          sl.position.set(-inward * 0.0075, 0.014, railLenM * frac);
          const scr = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0028, 0.0028, 0.0026, 8).rotateZ(Math.PI / 2),
            brushedNickelMat
          );
          scr.position.set(-inward * 0.0056, 0.014, railLenM * frac);
          outerGroup.add(sl, scr);
        }
        const baseLedge = new THREE.Mesh(
          new THREE.BoxGeometry(0.023, 0.0042, railLenM),
          galvanizedSteelMat
        );
        baseLedge.position.set(inward * 0.002, -0.008, 0);
        // Sculpted Blumotion soft-close hydraulic cylinder + chrome damper rod + orange catch hook
        const damperBody = new THREE.Mesh(
          new THREE.BoxGeometry(0.012, 0.013, 0.112),
          darkPolymerMat
        );
        damperBody.position.set(inward * 0.004, -0.001, -railLenM * 0.26);
        const damperPiston = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0024, 0.0024, 0.055, 8).rotateX(Math.PI / 2),
          chromeMat
        );
        damperPiston.position.set(inward * 0.004, 0.001, -railLenM * 0.14);
        const damperAccent = new THREE.Mesh(
          new THREE.BoxGeometry(0.0135, 0.007, 0.028),
          blumOrangeMat
        );
        damperAccent.position.set(inward * 0.004, 0.0015, -railLenM * 0.08);
        // Rear steel hook pin engaging back of wooden drawer
        const rearHook = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0026, 0.0026, 0.014, 8).rotateX(Math.PI / 2),
          chromeMat
        );
        rearHook.position.set(inward * 0.006, 0.006, -railLenM * 0.47);
        outerGroup.add(wallPlate, baseLedge, damperBody, damperPiston, damperAccent, rearHook);

        const outerWorld = outerLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        outerGroup.position.copy(outerWorld);
        outerGroup.quaternion.copy(frontQuat);
        markDisposable(outerGroup);
        root.add(outerGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: outerGroup,
          basePos: outerWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 0,
        });

        // (B) Synchronized Intermediate Undermount Runner + twin Delrin roller guides (0.5x!)
        const midLocal = new THREE.Vector3(boxEdgeX + inward * 0.012, boxBottomYM + 0.002, railZ);
        const midGroup = new THREE.Group();
        const midRail = new THREE.Mesh(
          new THREE.BoxGeometry(0.0145, 0.011, railLenM * 0.92),
          brushedNickelMat
        );
        const rollerGeo = new THREE.CylinderGeometry(0.0048, 0.0048, 0.006, 10).rotateZ(Math.PI / 2);
        for (const rFrac of [-0.36, 0.36]) {
          const roller = new THREE.Mesh(rollerGeo, darkPolymerMat);
          roller.position.set(0, 0.002, railLenM * rFrac);
          midGroup.add(roller);
        }
        midGroup.add(midRail);

        const midWorld = midLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        midGroup.position.copy(midWorld);
        midGroup.quaternion.copy(frontQuat);
        markDisposable(midGroup);
        root.add(midGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: midGroup,
          basePos: midWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 0.5,
        });

        // (C) Drawer-Mounted Upper Carrier Profile + Ergonomic Orange Blum Front Locking Clutch (1.0x!)
        const innerLocal = new THREE.Vector3(boxEdgeX + inward * 0.018, boxBottomYM + 0.006, railZ);
        const innerGroup = new THREE.Group();
        const carrierRail = new THREE.Mesh(
          new THREE.BoxGeometry(0.0155, 0.0075, railLenM * 0.94),
          galvanizedSteelMat
        );
        // Signature orange Blum front locking clutch under the drawer floor near front
        const clutch = new THREE.Mesh(
          new THREE.BoxGeometry(0.034, 0.011, 0.058),
          blumOrangeMat
        );
        clutch.position.set(inward * 0.016, 0.001, railLenM * 0.41);
        const clutchHandle = new THREE.Mesh(
          new THREE.BoxGeometry(0.024, 0.0065, 0.028),
          darkPolymerMat
        );
        clutchHandle.position.set(inward * 0.023, -0.003, railLenM * 0.45);
        clutchHandle.rotation.y = inward * 0.18;
        // Side height-adjustment thumbwheel on clutch
        const adjWheel = new THREE.Mesh(
          new THREE.CylinderGeometry(0.0062, 0.0062, 0.0045, 12),
          blumOrangeMat
        );
        adjWheel.position.set(inward * 0.034, -0.001, railLenM * 0.39);
        innerGroup.add(carrierRail, clutch, clutchHandle, adjWheel);

        const innerWorld = innerLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        innerGroup.position.copy(innerWorld);
        innerGroup.quaternion.copy(frontQuat);
        markDisposable(innerGroup);
        root.add(innerGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: innerGroup,
          basePos: innerWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 1.0,
        });
      } else {
        // --- Tandembox / Antaro / Metabox Metal Double-Wall Drawer System ---
        const runnerY = boxBottomYM + 0.014;
        const railZ = boxCenterM.z;

        // (A) Stationary Cabinet Runner with oblong mounting slots & soft-close damper (0x)
        const outerLocal = new THREE.Vector3(wallX + inward * 0.006, runnerY, railZ);
        const outerGroup = new THREE.Group();
        const cabRail = new THREE.Mesh(
          new THREE.BoxGeometry(0.0095, 0.034, railLenM),
          galvanizedSteelMat
        );
        for (const frac of [-0.34, 0, 0.34]) {
          const sl = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.005, 0.012), slotMat);
          sl.position.set(0, 0.006, railLenM * frac);
          outerGroup.add(sl);
        }
        const tDamper = new THREE.Mesh(new THREE.BoxGeometry(0.011, 0.012, 0.095), darkPolymerMat);
        tDamper.position.set(inward * 0.003, -0.006, -railLenM * 0.24);
        outerGroup.add(cabRail, tDamper);
        const outerWorld = outerLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        outerGroup.position.copy(outerWorld);
        outerGroup.quaternion.copy(frontQuat);
        markDisposable(outerGroup);
        root.add(outerGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: outerGroup,
          basePos: outerWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 0,
        });

        // (B) Mid Synchronized Runner (0.5x)
        const midLocal = new THREE.Vector3(wallX + inward * 0.013, runnerY, railZ);
        const midGroup = new THREE.Group();
        const midBar = new THREE.Mesh(
          new THREE.BoxGeometry(0.007, 0.02, railLenM * 0.92),
          brushedNickelMat
        );
        midGroup.add(midBar);
        const midWorld = midLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        midGroup.position.copy(midWorld);
        midGroup.quaternion.copy(frontQuat);
        markDisposable(midGroup);
        root.add(midGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: midGroup,
          basePos: midWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 0.5,
        });

        // (C) Tandembox Side Branding Cover Cap + Rear Bracket + Top Gallery Reling on tall drawers (1.0x)
        const boxH = drw.boxHeightMm * MM_TO_M;
        const accentLocal = new THREE.Vector3(boxEdgeX + inward * 0.007, boxCenterM.y, railZ);
        const accentGroup = new THREE.Group();
        // Signature Tandembox flush metallic cover cap with dark bezel trim on outer face of metal side
        const capBezel = new THREE.Mesh(
          new THREE.BoxGeometry(0.0022, 0.019, 0.056),
          darkPolymerMat
        );
        capBezel.position.set(-inward * 0.0074, boxH * 0.14, railLenM * 0.24);
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(0.0028, 0.015, 0.05),
          brushedNickelMat
        );
        cap.position.set(-inward * 0.0078, boxH * 0.14, railLenM * 0.24);
        // Rear steel back-panel corner bracket
        const rearBracket = new THREE.Mesh(
          new THREE.BoxGeometry(0.014, boxH * 0.84, 0.014),
          tandemAnthraciteMat
        );
        rearBracket.position.set(inward * 0.004, 0, -railLenM * 0.47);
        accentGroup.add(capBezel, cap, rearBracket);

        // Tall Tandembox drawers (>= 200 mm front) get a sleek cylindrical top gallery rail (reling podłużny)
        if (drw.front.height >= 200) {
          const relingY = Math.min(boxH * 0.5 + 0.05, (drw.front.height * MM_TO_M) * 0.36);
          const relingBar = new THREE.Mesh(
            new THREE.CylinderGeometry(0.0046, 0.0046, railLenM * 0.96, 10).rotateX(Math.PI / 2),
            tandemAnthraciteMat
          );
          relingBar.position.set(0, relingY, 0);
          const frontSocket = new THREE.Mesh(
            new THREE.CylinderGeometry(0.007, 0.007, 0.012, 10).rotateX(Math.PI / 2),
            brushedNickelMat
          );
          frontSocket.position.set(0, relingY, railLenM * 0.47);
          const rearPost = new THREE.Mesh(
            new THREE.BoxGeometry(0.01, relingY - boxH * 0.4 + 0.012, 0.018),
            tandemAnthraciteMat
          );
          rearPost.position.set(0, (relingY + boxH * 0.4) * 0.5, -railLenM * 0.46);
          accentGroup.add(relingBar, frontSocket, rearPost);
        }

        const accentWorld = accentLocal.clone().applyQuaternion(frontQuat).add(frontPos);
        accentGroup.position.copy(accentWorld);
        accentGroup.quaternion.copy(frontQuat);
        markDisposable(accentGroup);
        root.add(accentGroup);
        dynamicRails.push({
          hostPartId: drw.front.id,
          node: accentGroup,
          basePos: accentWorld,
          baseQuat: frontQuat.clone(),
          explodeDir: frontExplode.clone(),
          slideAxisWorld,
          slideDistM: drw.slideDistM,
          travelFactor: 1.0,
        });
      }
    }
  }

  // =========================================================================
  // 3. STATIONARY TIP-ON MAGNETIC PUSH LATCHES (MOUNTED ON CARCASS, NOT DOOR)
  // =========================================================================
  const tipOnBodyMat = new THREE.MeshStandardMaterial({
    color: '#7A838F',
    metalness: 0.22,
    roughness: 0.5,
  });

  for (const door of visibleParts) {
    if (door.kind !== 'door' || door.handleStyle !== 'tip_on') continue;
    const doorPos = partBasePos.get(door.id);
    const doorQuat = partBaseQuat.get(door.id);
    const doorExplode = partExplodeDir.get(door.id) ?? new THREE.Vector3();
    if (!doorPos || !doorQuat) continue;

    const w = door.width * MM_TO_M;
    const h = door.height * MM_TO_M;
    const d = door.depth * MM_TO_M;
    const openSide =
      door.handleSide && door.handleSide !== 'none'
        ? door.handleSide
        : door.hingeSide === 'left'
          ? 'right'
          : door.hingeSide === 'right'
            ? 'left'
            : 'top';

    const localX =
      openSide === 'left' ? -w / 2 + 0.024 : openSide === 'right' ? w / 2 - 0.024 : 0;
    const localY = openSide === 'top' ? h / 2 - 0.024 : 0;
    // Sits tucked behind the closed door inside the carcass
    const latchLocal = new THREE.Vector3(localX, localY, -d / 2 - 0.032);
    const latchWorld = latchLocal.clone().applyQuaternion(doorQuat).add(doorPos);

    const latchGroup = new THREE.Group();
    latchGroup.position.copy(latchWorld);
    latchGroup.quaternion.copy(doorQuat);

    // Sculpted Blum Tip-On adapter mounting plate + cylindrical housing barrel + magnetic plunger tip
    const adapterPlate = new THREE.Mesh(new THREE.BoxGeometry(0.017, 0.018, 0.056), tipOnBodyMat);
    const barrel = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0056, 0.0056, 0.052, 12).rotateX(Math.PI / 2),
      tipOnBodyMat
    );
    barrel.position.z = 0.004;
    // Movable magnetic plunger tip pointing +Z toward back of door
    const plunger = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0044, 0.0044, 0.024, 12).rotateX(Math.PI / 2),
      brushedNickelMat
    );
    const magHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0052, 0.0048, 0.004, 12).rotateX(Math.PI / 2),
      darkPolymerMat
    );
    magHead.position.z = 0.011;
    plunger.add(magHead);
    const basePlungerZ = 0.022;
    plunger.position.z = basePlungerZ;
    latchGroup.add(adapterPlate, barrel, plunger);

    markDisposable(latchGroup);
    root.add(latchGroup);

    tipOnLatches.push({
      doorId: door.id,
      latchGroup,
      plungerMesh: plunger,
      baseWorldPos: latchWorld,
      explodeDir: doorExplode.clone(),
      basePlungerZ,
    });
  }

  // =========================================================================
  // 4. METAL Ø5 mm L-SPOON SHELF SUPPORT PINS (PODPÓRKI PÓŁEK) UNDER INTERIOR SHELVES
  // =========================================================================
  const shelfPinPositions: THREE.Matrix4[] = [];
  const shelfPinQuat = new THREE.Quaternion();
  const shelfPinScale = new THREE.Vector3(1, 1, 1);

  for (const shelf of visibleParts) {
    if (shelf.kind !== 'panel') continue;
    if (shelf.hardwareTag === 'drawer_box' || shelf.hardwareTag === 'wall_filler') continue;
    // Horizontal interior shelf: thin Y, reasonably wide/deep, named shelf/półka or sitting between vertical walls
    if (!(shelf.height >= 12 && shelf.height <= 30 && shelf.width >= 150 && shelf.depth >= 150)) continue;
    if (!/półk|shelf/i.test(shelf.name)) continue;

    const shelfPos = partBasePos.get(shelf.id);
    const shelfQuat = partBaseQuat.get(shelf.id);
    if (!shelfPos || !shelfQuat) continue;

    const sw = shelf.width * MM_TO_M;
    const sh = shelf.height * MM_TO_M;
    const sd = shelf.depth * MM_TO_M;
    const zInset = Math.min(0.042, sd * 0.22);

    // 4 nickel L-spoon shelf pins tucked right under the 4 left/right corners of the shelf
    const corners: [number, number, number][] = [
      [-sw / 2 + 0.005, sd / 2 - zInset, 1],
      [-sw / 2 + 0.005, -sd / 2 + zInset, 1],
      [sw / 2 - 0.005, sd / 2 - zInset, -1],
      [sw / 2 - 0.005, -sd / 2 + zInset, -1],
    ];
    for (const [cx, cz, dirX] of corners) {
      const worldPin = new THREE.Vector3(cx, -sh / 2 - 0.0035, cz)
        .applyQuaternion(shelfQuat)
        .add(shelfPos);
      shelfPinQuat.copy(shelfQuat);
      if (dirX < 0) {
        shelfPinQuat.multiply(_qA.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      }
      const mat4 = new THREE.Matrix4().compose(worldPin, shelfPinQuat, shelfPinScale);
      shelfPinPositions.push(mat4);
    }
  }

  if (shelfPinPositions.length > 0) {
    // Instanced sculpted L-spoon nickel shelf support pins (single draw call for all shelves!)
    const pinShape = new THREE.Shape();
    pinShape.moveTo(-0.006, 0.0035);
    pinShape.lineTo(0.007, 0.0035);
    pinShape.lineTo(0.007, 0.0005);
    pinShape.lineTo(-0.0025, 0.0005);
    pinShape.lineTo(-0.0025, -0.0065);
    pinShape.lineTo(-0.006, -0.0065);
    pinShape.closePath();
    const pinGeo = new THREE.ExtrudeGeometry(pinShape, {
      depth: 0.011,
      bevelEnabled: true,
      bevelThickness: 0.0006,
      bevelSize: 0.0005,
      bevelSegments: 1,
    });
    pinGeo.translate(0, 0, -0.0055);
    pinGeo.computeVertexNormals();

    const pinInst = new THREE.InstancedMesh(pinGeo, brushedNickelMat, shelfPinPositions.length);
    pinInst.name = 'shelf_support_pins';
    for (let i = 0; i < shelfPinPositions.length; i++) {
      pinInst.setMatrixAt(i, shelfPinPositions[i]);
    }
    pinInst.instanceMatrix.needsUpdate = true;
    pinInst.computeBoundingSphere();
    pinInst.userData.disposeMaterial = true;
    pinInst.castShadow = true;
    pinInst.receiveShadow = true;
    root.add(pinInst);
  }

  // =========================================================================
  // ZERO-GC KINEMATIC UPDATE LOOP
  // =========================================================================
  function update(opnAmt: number, expAmt: number, partNodes: Map<string, THREE.Group>) {
    // 1. Update telescopic drawer slides (0x stationary, 0.5x mid rail, 1.0x drawer runner)
    for (let i = 0; i < dynamicRails.length; i++) {
      const r = dynamicRails[i];
      _vA.copy(r.basePos).addScaledVector(r.explodeDir, expAmt * 0.28);
      if (r.travelFactor > 0 && opnAmt > 0.0005) {
        _vA.addScaledVector(r.slideAxisWorld, r.slideDistM * r.travelFactor * opnAmt);
      }
      r.node.position.copy(_vA);
      r.node.quaternion.copy(r.baseQuat);
    }

    // 2. Update articulated hinge arms connecting stationary carcass plate -> moving door cup
    for (let i = 0; i < articulatedHinges.length; i++) {
      const h = articulatedHinges[i];
      const doorNode = partNodes.get(h.doorId);
      if (!doorNode) continue;

      // Plate world position (follows exploded view cleanly)
      _vA.copy(h.plateBaseWorldPos).addScaledVector(h.plateExplodeDir, expAmt * 0.28);
      h.plateGroup.position.copy(_vA);
      h.armGroup.position.copy(_vA);

      // Door cup current world position
      _vB.copy(h.cupLocalPos).applyQuaternion(doorNode.quaternion).add(doorNode.position);

      // Vector from plate anchor to door cup
      _vC.copy(_vB).sub(_vA);
      const dist = _vC.length();
      if (dist > 0.004) {
        _vD.copy(_vC).divideScalar(dist);
        _qA.setFromUnitVectors(_fwdZ, _vD);
        h.armGroup.quaternion.copy(_qA);
        h.armMesh.scale.set(1, 1, dist);
        h.armGroup.visible = true;
      } else {
        h.armGroup.visible = false;
      }
    }

    // 3. Update pneumatic flap gas struts (cylinder points to moving door bracket, chrome piston telescopes!)
    for (let i = 0; i < gasStruts.length; i++) {
      const s = gasStruts[i];
      const doorNode = partNodes.get(s.doorId);
      if (!doorNode) continue;

      _vA.copy(s.carcassBaseWorldPos).addScaledVector(s.carcassExplodeDir, expAmt * 0.28);
      _vB.copy(s.doorAttachLocal).applyQuaternion(doorNode.quaternion).add(doorNode.position);

      _vC.copy(_vB).sub(_vA);
      const dist = _vC.length();
      if (dist > 0.01) {
        _vD.copy(_vC).divideScalar(dist);
        _qA.setFromUnitVectors(_fwdZ, _vD);
        s.cylinderGroup.position.copy(_vA);
        s.cylinderGroup.quaternion.copy(_qA);
        s.pistonGroup.position.copy(_vA);
        s.pistonGroup.quaternion.copy(_qA);
        s.pistonMesh.scale.set(1, 1, dist);
      }
    }

    // 4. Update Tip-On carcass latch plunger extension when front opens
    for (let i = 0; i < tipOnLatches.length; i++) {
      const t = tipOnLatches[i];
      _vA.copy(t.baseWorldPos).addScaledVector(t.explodeDir, expAmt * 0.28);
      t.latchGroup.position.copy(_vA);
      const push = Math.min(1, opnAmt * 3.5) * 0.016;
      t.plungerMesh.position.z = t.basePlungerZ + push;
    }
  }

  return { root, update };
}

/**
 * Adds authentic stamped perforated nail/bolt hole grids (Ø5 mm & Ø11 mm) and embossed 45°
 * corner stiffening ribs (przetłoczenia wzmacniające) to galvanized/steel carpentry connectors:
 * - L-brackets (Kątownik ciesielski / montażowy / budowlany)
 * - U-brackets (Wieszak belki / Podstawa słupa kotwa U)
 * - Flat perforated nail plates & T-plates (Płytka perforowana / Łącznik płaski T)
 * Rendered via InstancedMesh (1-2 draw calls per bracket) with polygonOffset to guarantee zero Z-fighting.
 */
export function buildCarpentryConnectorDetailGroup(part: FurniturePart): THREE.Group | null {
  const isMetal = part.materialId === 'steel_galv' || part.materialId === 'steel_black';
  if (!isMetal) return null;

  const isLBracket = /kątownik/i.test(part.name) && part.kind === 'custom';
  const isUBracket = /(wieszak|podstawa słupa|kotwa u)/i.test(part.name) && part.kind === 'custom';
  const isTPlate = /łącznik płaski t/i.test(part.name) && part.kind === 'custom';
  const isFlatPlate = /płytka perforowana/i.test(part.name) && part.kind === 'panel';

  if (!isLBracket && !isUBracket && !isTPlate && !isFlatPlate) {
    return null;
  }

  const group = new THREE.Group();
  group.name = 'carpentry_connector_details';

  const w = Math.max(0.02, part.width * MM_TO_M);
  const h = Math.max(0.02, part.height * MM_TO_M);
  const d = Math.max(0.002, part.depth * MM_TO_M);
  const hx = w / 2;
  const hy = h / 2;
  const hz = d / 2;

  const holeDarkMat = new THREE.MeshStandardMaterial({
    color: '#191D23',
    metalness: 0.3,
    roughness: 0.82,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  const ribSteelMat = new THREE.MeshStandardMaterial({
    color: part.materialId === 'steel_black' ? '#323842' : '#CDD5DF',
    metalness: 0.92,
    roughness: 0.22,
  });

  interface HoleTransform {
    pos: THREE.Vector3;
    rot: THREE.Euler;
    scale: number;
  }
  const smallHoles: HoleTransform[] = [];
  const bigHoles: HoleTransform[] = [];

  if (isLBracket) {
    const wallT = Math.min(0.0055, Math.max(0.003, Math.min(w, h) * 0.055));

    // Stamped 45° triangular stiffening reinforcement rib (przetłoczenie wzmacniające) in the inner bend
    const ribLen = Math.min(w, h) * 0.34;
    const ribWidth = Math.min(d * 0.24, 0.015);
    const ribShape = new THREE.Shape();
    ribShape.moveTo(0, 0);
    ribShape.lineTo(ribLen, 0);
    ribShape.lineTo(0, ribLen);
    ribShape.closePath();
    const ribGeo = new THREE.ExtrudeGeometry(ribShape, {
      depth: ribWidth,
      bevelEnabled: true,
      bevelThickness: 0.0012,
      bevelSize: 0.001,
      bevelSegments: 1,
    });
    ribGeo.translate(0, 0, -ribWidth / 2);
    ribGeo.computeVertexNormals();
    const ribMesh = new THREE.Mesh(ribGeo, ribSteelMat);
    ribMesh.position.set(-hx + wallT - 0.0005, -hy + wallT - 0.0005, 0);
    group.add(ribMesh);

    // Perforated Ø5 mm nail holes & Ø11 mm bolt holes on vertical leg (outer -X & inner -hx+wallT faces)
    const zCount = Math.max(2, Math.min(4, Math.round(d / 0.022)));
    const legRows = Math.max(2, Math.min(4, Math.round((h - wallT) / 0.022)));
    const rotFaceX = new THREE.Euler(0, 0, Math.PI / 2);
    for (let r = 0; r < legRows; r++) {
      const yFrac = (r + 0.85) / (legRows + 0.55);
      const py = -hy + wallT + yFrac * (h - wallT - 0.008);
      for (let c = 0; c < zCount; c++) {
        const zFrac = zCount === 1 ? 0 : (c / (zCount - 1) - 0.5) * 0.72;
        const pz = zFrac * d;
        // Skip holes colliding with the central stiffening rib
        if (Math.abs(pz) < ribWidth * 0.72 && py < -hy + wallT + ribLen * 0.82) continue;
        const isBig = r === Math.floor(legRows / 2) && Math.abs(pz) < d * 0.16 && d >= 0.055;
        const target = isBig ? bigHoles : smallHoles;
        target.push({ pos: new THREE.Vector3(-hx - 0.0003, py, pz), rot: rotFaceX, scale: 1 });
        target.push({ pos: new THREE.Vector3(-hx + wallT + 0.0003, py, pz), rot: rotFaceX, scale: 1 });
      }
    }

    // Perforated Ø5 mm nail holes & Ø11 mm bolt holes on horizontal leg (outer -Y & inner -hy+wallT faces)
    const rotFaceY = new THREE.Euler(0, 0, 0);
    for (let r = 0; r < legRows; r++) {
      const xFrac = (r + 0.85) / (legRows + 0.55);
      const px = -hx + wallT + xFrac * (w - wallT - 0.008);
      for (let c = 0; c < zCount; c++) {
        const zFrac = zCount === 1 ? 0 : (c / (zCount - 1) - 0.5) * 0.72;
        const pz = zFrac * d;
        if (Math.abs(pz) < ribWidth * 0.72 && px < -hx + wallT + ribLen * 0.82) continue;
        const isBig = r === Math.floor(legRows / 2) && Math.abs(pz) < d * 0.16 && d >= 0.055;
        const target = isBig ? bigHoles : smallHoles;
        target.push({ pos: new THREE.Vector3(px, -hy - 0.0003, pz), rot: rotFaceY, scale: 1 });
        target.push({ pos: new THREE.Vector3(px, -hy + wallT + 0.0003, pz), rot: rotFaceY, scale: 1 });
      }
    }
  } else if (isUBracket) {
    const wallT = Math.min(0.0055, Math.max(0.0035, w * 0.05));
    const rotFaceX = new THREE.Euler(0, 0, Math.PI / 2);
    const rotFaceY = new THREE.Euler(0, 0, 0);

    // Staggered nail & bolt holes on both left & right vertical U-flanges
    const yRows = Math.max(3, Math.min(5, Math.round(h / 0.028)));
    const zCols = Math.max(2, Math.min(3, Math.round(d / 0.032)));
    for (const side of [-1, 1] as const) {
      const outerX = side * (hx + 0.0003);
      const innerX = side * (hx - wallT - 0.0003);
      for (let r = 0; r < yRows; r++) {
        const py = -hy + wallT + 0.016 + (r / Math.max(1, yRows - 1)) * Math.max(0.02, h - wallT - 0.032);
        for (let c = 0; c < zCols; c++) {
          const pz = zCols === 1 ? 0 : ((c / (zCols - 1)) - 0.5) * (d * 0.62);
          const isBig = r === 1 && c === Math.floor(zCols / 2);
          const target = isBig ? bigHoles : smallHoles;
          target.push({ pos: new THREE.Vector3(outerX, py, pz), rot: rotFaceX, scale: 1 });
          target.push({ pos: new THREE.Vector3(innerX, py, pz), rot: rotFaceX, scale: 1 });
        }
      }
    }
    // 2 anchor bolt holes in the bottom U-saddle base
    for (const pz of [-d * 0.22, d * 0.22]) {
      bigHoles.push({ pos: new THREE.Vector3(0, -hy - 0.0003, pz), rot: rotFaceY, scale: 1 });
      bigHoles.push({ pos: new THREE.Vector3(0, -hy + wallT + 0.0003, pz), rot: rotFaceY, scale: 1 });
    }
  } else if (isTPlate) {
    const rotFaceZ = new THREE.Euler(Math.PI / 2, 0, 0);
    // Horizontal top crossbar holes
    const topY = hy - h * 0.165;
    for (const xFrac of [-0.38, -0.22, 0, 0.22, 0.38]) {
      const px = xFrac * w;
      for (const dy of [-0.009, 0.009]) {
        const isBig = Math.abs(xFrac) < 0.01 && dy > 0;
        const target = isBig ? bigHoles : smallHoles;
        target.push({ pos: new THREE.Vector3(px, topY + dy, hz + 0.0003), rot: rotFaceZ, scale: 1 });
        target.push({ pos: new THREE.Vector3(px, topY + dy, -hz - 0.0003), rot: rotFaceZ, scale: 1 });
      }
    }
    // Vertical center stem holes
    for (const yFrac of [-0.36, -0.18, 0.0]) {
      const py = yFrac * h;
      for (const dx of [-0.009, 0.009]) {
        smallHoles.push({ pos: new THREE.Vector3(dx, py, hz + 0.0003), rot: rotFaceZ, scale: 1 });
        smallHoles.push({ pos: new THREE.Vector3(dx, py, -hz - 0.0003), rot: rotFaceZ, scale: 1 });
      }
    }
  } else if (isFlatPlate) {
    const rotFaceZ = new THREE.Euler(Math.PI / 2, 0, 0);
    const cols = Math.max(4, Math.min(8, Math.round(w / 0.026)));
    const rows = Math.max(2, Math.min(4, Math.round(h / 0.024)));
    for (let r = 0; r < rows; r++) {
      const py = rows === 1 ? 0 : ((r / (rows - 1)) - 0.5) * (h * 0.66);
      for (let c = 0; c < cols; c++) {
        const px = cols === 1 ? 0 : ((c / (cols - 1)) - 0.5) * (w * 0.84);
        const isBig = r === Math.floor(rows / 2) && (c === 1 || c === cols - 2);
        const target = isBig ? bigHoles : smallHoles;
        target.push({ pos: new THREE.Vector3(px, py, hz + 0.0003), rot: rotFaceZ, scale: 1 });
        target.push({ pos: new THREE.Vector3(px, py, -hz - 0.0003), rot: rotFaceZ, scale: 1 });
      }
    }
  }

  const dummy = new THREE.Object3D();
  if (smallHoles.length > 0) {
    const smallGeo = new THREE.CylinderGeometry(0.0026, 0.0026, 0.0008, 10);
    const inst = new THREE.InstancedMesh(smallGeo, holeDarkMat, smallHoles.length);
    for (let i = 0; i < smallHoles.length; i++) {
      dummy.position.copy(smallHoles[i].pos);
      dummy.rotation.copy(smallHoles[i].rot);
      dummy.scale.setScalar(smallHoles[i].scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  if (bigHoles.length > 0) {
    const bigGeo = new THREE.CylinderGeometry(0.0052, 0.0052, 0.0009, 12);
    const inst = new THREE.InstancedMesh(bigGeo, holeDarkMat, bigHoles.length);
    for (let i = 0; i < bigHoles.length; i++) {
      dummy.position.copy(bigHoles[i].pos);
      dummy.rotation.copy(bigHoles[i].rot);
      dummy.scale.setScalar(bigHoles[i].scale);
      dummy.updateMatrix();
      inst.setMatrixAt(i, dummy.matrix);
    }
    inst.instanceMatrix.needsUpdate = true;
    group.add(inst);
  }

  markDisposable(group);
  return group;
}
