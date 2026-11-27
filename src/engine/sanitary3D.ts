import * as THREE from 'three';

export type SanitaryToiletType = 'wc_geberit' | 'wc_low_cistern' | 'wc_high_cistern';

export function isSanitaryToiletType(type: string): type is SanitaryToiletType {
  return type === 'wc_geberit' || type === 'wc_low_cistern' || type === 'wc_high_cistern';
}

/**
 * Helper to create a rounded oval extruded shape in XZ (centered at X=0, rear at Z=0, extending to +Z)
 * extruded vertically along Y from y=0 to y=thicknessY.
 */
function createOvalBowlGeometry(
  widthM: number,
  lengthM: number,
  thicknessY: number,
  bevelSize = 0.012
): THREE.BufferGeometry {
  const hw = widthM / 2;
  const r = hw;
  const straightLen = Math.max(0.02, lengthM - r);

  // 2D shape in (x, y) where +y maps to +z after rotateX(+PI/2)
  const shape = new THREE.Shape();
  shape.moveTo(-hw, 0);
  shape.lineTo(hw, 0);
  shape.lineTo(hw, straightLen);
  shape.absarc(0, straightLen, r, 0, Math.PI, false);
  shape.lineTo(-hw, 0);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.008, thicknessY - bevelSize * 2),
    bevelEnabled: bevelSize > 0,
    bevelThickness: bevelSize,
    bevelSize: Math.min(bevelSize, hw * 0.25),
    bevelSegments: 3,
    curveSegments: 20,
  });

  // Extrude goes along +Z; rotate so extrusion thickness goes along +Y and shape +Y goes along +Z
  geo.rotateX(Math.PI / 2);
  // After rotateX(+PI/2): old +Y -> +Z, old +Z -> -Y, so shift up by thicknessY - bevelSize
  geo.translate(0, thicknessY - bevelSize, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds realistic multi-part 3D sanitary WC fixtures:
 * - 'wc_geberit': Concealed Geberit drywall frame + chrome dual-flush plate + wall-hung ceramic WC bowl + seat
 * - 'wc_low_cistern': Close-coupled floor-standing WC (dolnopłuk / kompakt) with rear ceramic cistern + dual-flush button
 * - 'wc_high_cistern': Classic freestanding WC bowl + high wall-mounted cistern + chrome flush pipe + pull chain
 *
 * Coordinate convention of returned Group:
 * - X: centered at 0 ([-widthM/2, +widthM/2])
 * - Y: floor sits at Y = 0, extending upward to +heightM
 * - Z: rear wall face sits at Z = 0, extending into the room toward +depthM
 */
export function buildSanitaryToilet3D(
  type: SanitaryToiletType,
  widthM: number,
  heightM: number,
  depthM: number
): THREE.Group {
  const group = new THREE.Group();
  group.name = `sanitary_${type}`;

  const porcelainMat = new THREE.MeshPhysicalMaterial({
    color: '#F8FAFC',
    roughness: 0.14,
    metalness: 0.02,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
  });

  const seatMat = new THREE.MeshPhysicalMaterial({
    color: '#FFFFFF',
    roughness: 0.2,
    metalness: 0.0,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
  });

  const innerBowlMat = new THREE.MeshStandardMaterial({
    color: '#CBD5E1',
    roughness: 0.22,
    metalness: 0.04,
  });

  const chromeMat = new THREE.MeshStandardMaterial({
    color: '#D8DEE6',
    metalness: 0.92,
    roughness: 0.16,
  });

  const darkAccentMat = new THREE.MeshStandardMaterial({
    color: '#475569',
    metalness: 0.5,
    roughness: 0.4,
  });

  const drywallMat = new THREE.MeshStandardMaterial({
    color: '#E9ECF0',
    roughness: 0.82,
    metalness: 0.02,
  });

  const shelfCapMat = new THREE.MeshStandardMaterial({
    color: '#DCE2E8',
    roughness: 0.55,
    metalness: 0.04,
  });

  const materialsToDispose: THREE.Material[] = [
    porcelainMat,
    seatMat,
    innerBowlMat,
    chromeMat,
    darkAccentMat,
    drywallMat,
    shelfCapMat,
  ];

  // Helper to add a contoured porcelain WC bowl + seat + hinges starting at rearZ
  const addWcBowlAssembly = (
    rearZ: number,
    bowlBottomY: number,
    seatTopY: number,
    bowlW: number,
    bowlLen: number,
    isFloorStanding: boolean
  ) => {
    const bowlH = Math.max(0.24, seatTopY - bowlBottomY);
    const upperBowlH = Math.min(0.18, bowlH * 0.55);
    const upperBowlY = seatTopY - upperBowlH;

    // 1. Upper rimmed oval ceramic bowl body
    const upperGeo = createOvalBowlGeometry(bowlW, bowlLen, upperBowlH, 0.014);
    const upperMesh = new THREE.Mesh(upperGeo, porcelainMat);
    upperMesh.position.set(0, upperBowlY, rearZ);
    upperMesh.castShadow = true;
    upperMesh.receiveShadow = true;
    group.add(upperMesh);

    // 2. Tapered lower siphon body (or wall-hung tapered belly)
    const lowerH = Math.max(0.08, upperBowlY - bowlBottomY);
    if (isFloorStanding) {
      // Sculpted ceramic pedestal foot resting solidly on the floor
      const footW = bowlW * 0.72;
      const footLen = bowlLen * 0.68;
      const footGeo = createOvalBowlGeometry(footW, footLen, lowerH + 0.02, 0.01);
      const footMesh = new THREE.Mesh(footGeo, porcelainMat);
      footMesh.position.set(0, bowlBottomY, rearZ + bowlLen * 0.14);
      footMesh.castShadow = true;
      footMesh.receiveShadow = true;
      group.add(footMesh);

      // Rear floor drain trap shroud connecting back to wall
      const trapGeo = new THREE.BoxGeometry(bowlW * 0.58, lowerH + 0.03, bowlLen * 0.36);
      const trapMesh = new THREE.Mesh(trapGeo, porcelainMat);
      trapMesh.position.set(0, bowlBottomY + (lowerH + 0.03) / 2, rearZ + bowlLen * 0.18);
      trapMesh.castShadow = true;
      trapMesh.receiveShadow = true;
      group.add(trapMesh);
    } else {
      // Sleek wall-hung tapered under-bowl curve floating cleanly above floor
      const bellyGeo = createOvalBowlGeometry(bowlW * 0.8, bowlLen * 0.8, lowerH + 0.02, 0.018);
      const bellyMesh = new THREE.Mesh(bellyGeo, porcelainMat);
      bellyMesh.position.set(0, bowlBottomY, rearZ);
      bellyMesh.castShadow = true;
      bellyMesh.receiveShadow = true;
      group.add(bellyMesh);
    }

    // 3. Subtle recessed porcelain basin shadow line under seat (visible around edges)
    const basinGeo = new THREE.CylinderGeometry(
      bowlW * 0.36,
      bowlW * 0.24,
      0.015,
      20
    );
    const basinMesh = new THREE.Mesh(basinGeo, innerBowlMat);
    basinMesh.scale.set(1, 1, 1.25);
    basinMesh.position.set(0, seatTopY - 0.002, rearZ + bowlLen * 0.56);
    group.add(basinMesh);

    // 4. Soft-close toilet seat ring (bottom layer)
    const seatRingGeo = createOvalBowlGeometry(bowlW * 0.96, bowlLen * 0.88, 0.018, 0.005);
    const seatRing = new THREE.Mesh(seatRingGeo, seatMat);
    seatRing.position.set(0, seatTopY + 0.002, rearZ + bowlLen * 0.09);
    seatRing.castShadow = true;
    group.add(seatRing);

    // 5. Sleek slim closed WC lid (top layer)
    const lidGeo = createOvalBowlGeometry(bowlW * 0.98, bowlLen * 0.89, 0.016, 0.006);
    const lid = new THREE.Mesh(lidGeo, seatMat);
    lid.position.set(0, seatTopY + 0.022, rearZ + bowlLen * 0.085);
    lid.castShadow = true;
    lid.receiveShadow = true;
    group.add(lid);

    // 6. Chrome dual seat hinges
    const hingeGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.024, 12);
    for (const side of [-1, 1]) {
      const hinge = new THREE.Mesh(hingeGeo, chromeMat);
      hinge.position.set(side * (bowlW * 0.22), seatTopY + 0.014, rearZ + bowlLen * 0.11);
      group.add(hinge);
    }
  };

  if (type === 'wc_geberit') {
    // Concealed Geberit frame drywall enclosure (zabudowa stelaża)
    const frameDepth = Math.min(Math.max(0.16, depthM * 0.28), 0.24);
    const frameH = Math.max(1.0, heightM);
    const frameW = Math.max(0.42, widthM);

    const enclosureGeo = new THREE.BoxGeometry(frameW, frameH - 0.018, frameDepth);
    const enclosure = new THREE.Mesh(enclosureGeo, drywallMat);
    enclosure.position.set(0, (frameH - 0.018) / 2, frameDepth / 2);
    enclosure.castShadow = true;
    enclosure.receiveShadow = true;
    group.add(enclosure);

    // Finished top ledge / tile cap on Geberit enclosure
    const topCapGeo = new THREE.BoxGeometry(frameW + 0.006, 0.018, frameDepth + 0.006);
    const topCap = new THREE.Mesh(topCapGeo, shelfCapMat);
    topCap.position.set(0, frameH - 0.009, frameDepth / 2 + 0.002);
    topCap.castShadow = true;
    topCap.receiveShadow = true;
    group.add(topCap);

    // Geberit Sigma dual-flush chrome actuator plate (246 × 164 mm) centered at ~1000 mm height
    const plateY = Math.min(frameH - 0.14, 1.0);
    const plateW = Math.min(0.246, frameW * 0.56);
    const plateH = 0.164;
    const plateFrame = new THREE.Mesh(
      new THREE.BoxGeometry(plateW, plateH, 0.012),
      chromeMat
    );
    plateFrame.position.set(0, plateY, frameDepth + 0.006);
    plateFrame.castShadow = true;
    group.add(plateFrame);

    // Subtle dark recessed bezel groove
    const plateBezel = new THREE.Mesh(
      new THREE.BoxGeometry(plateW - 0.014, plateH - 0.014, 0.003),
      darkAccentMat
    );
    plateBezel.position.set(0, plateY, frameDepth + 0.012);
    group.add(plateBezel);

    // Large flush button (left) & eco small flush button (right)
    const bigBtn = new THREE.Mesh(
      new THREE.BoxGeometry(plateW * 0.44, plateH * 0.62, 0.007),
      chromeMat
    );
    bigBtn.position.set(-plateW * 0.16, plateY, frameDepth + 0.014);
    const smallBtn = new THREE.Mesh(
      new THREE.BoxGeometry(plateW * 0.26, plateH * 0.62, 0.007),
      chromeMat
    );
    smallBtn.position.set(plateW * 0.24, plateY, frameDepth + 0.014);
    group.add(bigBtn, smallBtn);

    // Wall-hung rimless porcelain WC bowl mounted to the front of the Geberit frame
    const bowlW = Math.min(0.365, frameW * 0.82);
    const bowlLen = Math.max(0.46, depthM - frameDepth);
    addWcBowlAssembly(frameDepth, 0.09, 0.41, bowlW, bowlLen, false);
  } else if (type === 'wc_low_cistern') {
    // Close-coupled low-cistern WC (kompakt / dolnopłuk)
    const tankDepth = Math.min(0.18, depthM * 0.29);
    const tankW = Math.min(Math.max(0.34, widthM * 0.96), 0.42);
    const seatTopY = 0.4;
    const tankH = Math.max(0.32, heightM - seatTopY);
    const tankBottomY = seatTopY - 0.015;

    // Rear ceramic pedestal support behind/under cistern
    const rearSupport = new THREE.Mesh(
      new THREE.BoxGeometry(tankW * 0.66, seatTopY, tankDepth * 0.9),
      porcelainMat
    );
    rearSupport.position.set(0, seatTopY / 2, tankDepth * 0.55);
    rearSupport.castShadow = true;
    rearSupport.receiveShadow = true;
    group.add(rearSupport);

    // Ceramic low cistern tank body
    const tankBody = new THREE.Mesh(
      new THREE.BoxGeometry(tankW, tankH - 0.028, tankDepth),
      porcelainMat
    );
    tankBody.position.set(0, tankBottomY + (tankH - 0.028) / 2, 0.015 + tankDepth / 2);
    tankBody.castShadow = true;
    tankBody.receiveShadow = true;
    group.add(tankBody);

    // Slightly overhanging sculpted ceramic tank lid
    const tankLid = new THREE.Mesh(
      new THREE.BoxGeometry(tankW + 0.016, 0.028, tankDepth + 0.016),
      porcelainMat
    );
    tankLid.position.set(0, tankBottomY + tankH - 0.014, 0.015 + tankDepth / 2);
    tankLid.castShadow = true;
    tankLid.receiveShadow = true;
    group.add(tankLid);

    // Round chrome dual-flush button on top center of cistern
    const btnRing = new THREE.Mesh(
      new THREE.CylinderGeometry(0.024, 0.026, 0.008, 20),
      chromeMat
    );
    btnRing.position.set(0, tankBottomY + tankH + 0.004, 0.015 + tankDepth / 2);
    const btnSplit = new THREE.Mesh(
      new THREE.BoxGeometry(0.002, 0.009, 0.044),
      darkAccentMat
    );
    btnSplit.position.set(0, tankBottomY + tankH + 0.005, 0.015 + tankDepth / 2);
    group.add(btnRing, btnSplit);

    // Floor-standing porcelain WC bowl directly in front of the cistern
    const bowlW = Math.min(0.37, widthM);
    const bowlRearZ = tankDepth * 0.85;
    const bowlLen = Math.max(0.44, depthM - bowlRearZ);
    addWcBowlAssembly(bowlRearZ, 0, seatTopY, bowlW, bowlLen, true);
  } else {
    // Classic high-cistern WC (muszla górnopłukowa)
    const seatTopY = 0.4;
    const bowlW = Math.min(0.37, widthM);
    const wallGapZ = 0.08;
    const bowlLen = Math.max(0.45, depthM - wallGapZ);

    // 1. Floor-standing WC bowl
    addWcBowlAssembly(wallGapZ, 0, seatTopY, bowlW, bowlLen, true);

    // 2. High wall-mounted ceramic cistern (top at heightM, typically ~2050 mm)
    const tankW = Math.min(0.44, Math.max(0.36, widthM * 1.05));
    const tankH = 0.34;
    const tankD = 0.19;
    const tankTopY = Math.max(1.65, heightM);
    const tankBottomY = tankTopY - tankH;

    const highTank = new THREE.Mesh(
      new THREE.BoxGeometry(tankW, tankH - 0.03, tankD),
      porcelainMat
    );
    highTank.position.set(0, tankBottomY + (tankH - 0.03) / 2, tankD / 2 + 0.01);
    highTank.castShadow = true;
    highTank.receiveShadow = true;
    group.add(highTank);

    // Classic stepped cornice lid on high cistern
    const highLid = new THREE.Mesh(
      new THREE.BoxGeometry(tankW + 0.024, 0.03, tankD + 0.024),
      porcelainMat
    );
    highLid.position.set(0, tankTopY - 0.015, tankD / 2 + 0.01);
    highLid.castShadow = true;
    group.add(highLid);

    // Chrome decorative wall mounting brackets underneath high cistern
    for (const side of [-1, 1]) {
      const bracketV = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.12, 0.012), chromeMat);
      bracketV.position.set(side * (tankW * 0.36), tankBottomY - 0.06, 0.008);
      const bracketH = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.012, tankD * 0.72), chromeMat);
      bracketH.position.set(side * (tankW * 0.36), tankBottomY - 0.006, tankD * 0.38);
      group.add(bracketV, bracketH);
    }

    // 3. Gleaming vertical chrome flush pipe (Ø32 mm) from high cistern down to rear bowl inlet
    const pipeZ = 0.048;
    const pipeBottomY = seatTopY - 0.045;
    const pipeLen = Math.max(0.5, tankBottomY - pipeBottomY);
    const pipeVert = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, pipeLen, 16),
      chromeMat
    );
    pipeVert.position.set(0, pipeBottomY + pipeLen / 2, pipeZ);
    pipeVert.castShadow = true;
    group.add(pipeVert);

    // 90° horizontal inlet stub into rear of WC bowl + rubber/chrome flange collar
    const inletLen = Math.max(0.05, wallGapZ - pipeZ + 0.03);
    const pipeHoriz = new THREE.Mesh(
      new THREE.CylinderGeometry(0.016, 0.016, inletLen, 14),
      chromeMat
    );
    pipeHoriz.rotation.x = Math.PI / 2;
    pipeHoriz.position.set(0, pipeBottomY, pipeZ + inletLen / 2);
    const elbowSphere = new THREE.Mesh(new THREE.SphereGeometry(0.019, 12, 12), chromeMat);
    elbowSphere.position.set(0, pipeBottomY, pipeZ);
    group.add(pipeHoriz, elbowSphere);

    // 2 Chrome wall pipe clamps stabilizing the flush pipe
    for (const clampFrac of [0.32, 0.68]) {
      const clampY = pipeBottomY + pipeLen * clampFrac;
      const collar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.021, 0.021, 0.018, 14),
        chromeMat
      );
      collar.position.set(0, clampY, pipeZ);
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.006, 0.006, pipeZ, 8),
        chromeMat
      );
      stem.rotation.x = Math.PI / 2;
      stem.position.set(0, clampY, pipeZ / 2);
      group.add(collar, stem);
    }

    // 4. Classic side flush lever arm + hanging pull chain with ceramic handle
    const leverX = tankW / 2 + 0.045;
    const leverY = tankTopY - 0.08;
    const leverArm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.1, 8),
      chromeMat
    );
    leverArm.rotation.z = Math.PI / 2;
    leverArm.position.set(tankW / 2 + 0.04, leverY, tankD * 0.55);

    const chainLen = Math.max(0.35, leverY - 1.18);
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0022, 0.0022, chainLen, 8),
      chromeMat
    );
    chain.position.set(leverX + 0.035, leverY - chainLen / 2, tankD * 0.55);

    const pullHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.01, 0.013, 0.075, 14),
      porcelainMat
    );
    pullHandle.position.set(leverX + 0.035, leverY - chainLen - 0.038, tankD * 0.55);
    group.add(leverArm, chain, pullHandle);
  }

  // Mark materials for proper WebGL disposal (mark first mesh using each material)
  const markedMaterials = new Set<THREE.Material>();
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.Material) {
      if (materialsToDispose.includes(obj.material) && !markedMaterials.has(obj.material)) {
        obj.userData.disposeMaterial = true;
        markedMaterials.add(obj.material);
      }
    }
  });

  return group;
}
