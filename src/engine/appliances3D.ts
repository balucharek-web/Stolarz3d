import * as THREE from 'three';
import { ApplianceModel } from '../types/furniture';

/**
 * Helper to create a rounded-rectangle extruded slab in XZ (centered at X=0, Z=0),
 * extending vertically along Y from y=0 to y=heightY.
 */
function createRoundedBoxXZ(
  w: number,
  heightY: number,
  d: number,
  radius: number,
  bevel = 0.008
): THREE.BufferGeometry {
  const hw = Math.max(0.01, w / 2);
  const hd = Math.max(0.01, d / 2);
  const r = Math.min(radius, hw * 0.45, hd * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-hw + r, -hd);
  shape.lineTo(hw - r, -hd);
  shape.quadraticCurveTo(hw, -hd, hw, -hd + r);
  shape.lineTo(hw, hd - r);
  shape.quadraticCurveTo(hw, hd, hw - r, hd);
  shape.lineTo(-hw + r, hd);
  shape.quadraticCurveTo(-hw, hd, -hw, hd - r);
  shape.lineTo(-hw, -hd + r);
  shape.quadraticCurveTo(-hw, -hd, -hw + r, -hd);

  const b = Math.min(bevel, heightY * 0.3, r * 0.4);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.005, heightY - b * 2),
    bevelEnabled: b > 0,
    bevelThickness: b,
    bevelSize: b,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, heightY - b, 0);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Builds rich multi-part procedural 3D PBR models for Kitchen, Bathroom,
 * Wardrobe/Bedroom, and Living/Office equipment.
 *
 * Coordinate convention: centered at (0, 0, 0), spanning [-w/2, +w/2], [-h/2, +h/2], [-d/2, +d/2],
 * with front facing +Z and bottom resting at Y = -h/2.
 */
export function buildExtendedAppliance3D(
  model: ApplianceModel,
  w: number,
  h: number,
  d: number
): THREE.Group | null {
  const group = new THREE.Group();
  group.name = `appliance_${model}`;

  // Shared PBR material palette (varied roughness/metalness per surface)
  const whiteEnamel = new THREE.MeshPhysicalMaterial({
    color: '#F5F7FA',
    roughness: 0.24,
    metalness: 0.04,
    clearcoat: 0.55,
    clearcoatRoughness: 0.16,
  });
  const porcelain = new THREE.MeshPhysicalMaterial({
    color: '#F8FAFC',
    roughness: 0.14,
    metalness: 0.02,
    clearcoat: 0.88,
    clearcoatRoughness: 0.1,
  });
  const brushedSteel = new THREE.MeshStandardMaterial({
    color: '#C7CFD8',
    metalness: 0.86,
    roughness: 0.28,
  });
  const chrome = new THREE.MeshStandardMaterial({
    color: '#E2E8F0',
    metalness: 0.94,
    roughness: 0.14,
  });
  const matteBlack = new THREE.MeshStandardMaterial({
    color: '#1E2126',
    metalness: 0.52,
    roughness: 0.44,
  });
  const darkMetal = new THREE.MeshStandardMaterial({
    color: '#2B3038',
    metalness: 0.72,
    roughness: 0.34,
  });
  const glossBlackGlass = new THREE.MeshPhysicalMaterial({
    color: '#0D1014',
    roughness: 0.07,
    metalness: 0.15,
    clearcoat: 1.0,
    clearcoatRoughness: 0.04,
  });
  const smokedGlass = new THREE.MeshPhysicalMaterial({
    color: '#1E293B',
    roughness: 0.08,
    metalness: 0.1,
    transparent: true,
    opacity: 0.52,
    clearcoat: 0.9,
  });
  const showerGlass = new THREE.MeshPhysicalMaterial({
    color: '#DCEEF5',
    roughness: 0.08,
    metalness: 0.05,
    transparent: true,
    opacity: 0.28,
    clearcoat: 0.9,
    depthWrite: false,
  });
  const oakWood = new THREE.MeshStandardMaterial({
    color: '#B6834D',
    roughness: 0.62,
    metalness: 0.02,
  });
  const fabricWarmGray = new THREE.MeshStandardMaterial({
    color: '#7A7D82',
    roughness: 0.92,
    metalness: 0.0,
  });
  const fabricBeige = new THREE.MeshStandardMaterial({
    color: '#D6CFC4',
    roughness: 0.9,
    metalness: 0.0,
  });
  const mattressWhite = new THREE.MeshStandardMaterial({
    color: '#F4F3EF',
    roughness: 0.88,
    metalness: 0.0,
  });
  const throwAccent = new THREE.MeshStandardMaterial({
    color: '#52616B',
    roughness: 0.92,
    metalness: 0.0,
  });
  const ledCyan = new THREE.MeshBasicMaterial({ color: '#38BDF8' });
  const ledWarm = new THREE.MeshBasicMaterial({ color: '#FDE68A' });

  const addBox = (
    bw: number,
    bh: number,
    bd: number,
    mat: THREE.Material,
    x: number,
    y: number,
    z: number,
    cast = true
  ) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat);
    m.position.set(x, y, z);
    m.castShadow = cast;
    m.receiveShadow = true;
    group.add(m);
    return m;
  };

  let built = true;

  switch (model) {
    // =========================================================================
    // KITCHEN APPLIANCES
    // =========================================================================
    case 'fridge_freezer': {
      const footH = 0.025;
      const bodyH = h - footH;
      const bodyD = d - 0.045;
      const doorT = 0.042;
      const freezerH = bodyH * 0.33;
      const fridgeH = bodyH - freezerH - 0.012;

      // Rear dark steel chassis
      addBox(w * 0.98, bodyH, bodyD, darkMetal, 0, footH / 2, -doorT / 2);

      // Bottom leveling feet
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.022, footH, 12), matteBlack);
          foot.position.set(sx * (w * 0.42), -h / 2 + footH / 2, sz * (d * 0.4));
          group.add(foot);
        }
      }

      // Upper fridge door (brushed stainless steel)
      const fridgeCenterY = -h / 2 + footH + freezerH + 0.012 + fridgeH / 2;
      addBox(w, fridgeH, doorT, brushedSteel, 0, fridgeCenterY, d / 2 - doorT / 2);

      // Lower freezer door
      const freezerCenterY = -h / 2 + footH + freezerH / 2;
      addBox(w, freezerH, doorT, brushedSteel, 0, freezerCenterY, d / 2 - doorT / 2);

      // Vertical brushed tubular handles on left edge
      const handleX = -w / 2 + 0.045;
      for (const [cy, len] of [
        [fridgeCenterY - fridgeH * 0.14, Math.min(0.42, fridgeH * 0.45)],
        [freezerCenterY + freezerH * 0.12, Math.min(0.28, freezerH * 0.45)],
      ]) {
        const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, len, 12), chrome);
        bar.position.set(handleX, cy, d / 2 + 0.026);
        bar.castShadow = true;
        group.add(bar);
        for (const sy of [-1, 1]) {
          const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.026, 8), chrome);
          stand.rotation.x = Math.PI / 2;
          stand.position.set(handleX, cy + sy * (len * 0.38), d / 2 + 0.013);
          group.add(stand);
        }
      }

      // Sleek black glass temperature LED panel on upper door
      addBox(w * 0.28, 0.11, 0.006, glossBlackGlass, 0, fridgeCenterY + fridgeH * 0.16, d / 2 + 0.002, false);
      addBox(w * 0.16, 0.016, 0.002, ledCyan, 0, fridgeCenterY + fridgeH * 0.18, d / 2 + 0.006, false);
      addBox(w * 0.12, 0.012, 0.002, ledCyan, 0, fridgeCenterY + fridgeH * 0.14, d / 2 + 0.006, false);
      break;
    }

    case 'dishwasher_60': {
      const plinthH = 0.095;
      const bodyH = h - plinthH;
      const panelH = 0.115;

      // Recessed dark bottom kickplate
      addBox(w * 0.96, plinthH, d * 0.86, matteBlack, 0, -h / 2 + plinthH / 2, -d * 0.05);
      // Main insulated body
      addBox(w * 0.98, bodyH, d - 0.026, brushedSteel, 0, plinthH / 2, -0.013);
      // Front door panel
      addBox(w, bodyH - panelH - 0.006, 0.026, brushedSteel, 0, -h / 2 + plinthH + (bodyH - panelH - 0.006) / 2, d / 2 - 0.013);
      // Top control fascia
      const fasciaY = h / 2 - panelH / 2;
      addBox(w, panelH, 0.028, darkMetal, 0, fasciaY, d / 2 - 0.014);
      // Recessed pocket handle in center
      addBox(w * 0.34, 0.045, 0.012, matteBlack, 0, fasciaY - 0.01, d / 2 - 0.002, false);
      // Digital time display + status LEDs
      addBox(0.085, 0.032, 0.005, glossBlackGlass, w * 0.28, fasciaY, d / 2 + 0.001, false);
      addBox(0.048, 0.012, 0.002, ledCyan, w * 0.28, fasciaY, d / 2 + 0.004, false);
      for (let i = 0; i < 4; i++) {
        addBox(0.016, 0.014, 0.004, chrome, -w * 0.38 + i * 0.034, fasciaY, d / 2 + 0.002, false);
      }
      break;
    }

    case 'range_hood': {
      const canopyH = Math.min(0.075, h * 0.12);
      const chimneyW = Math.min(0.28, w * 0.46);
      const chimneyD = Math.min(0.26, d * 0.52);
      const chimneyH = Math.max(0.25, h - canopyH);

      // Vertical brushed steel chimney flue at rear
      addBox(chimneyW, chimneyH, chimneyD, brushedSteel, 0, canopyH / 2, -d / 2 + chimneyD / 2);
      // Lower horizontal T-shape canopy
      const canopyY = -h / 2 + canopyH / 2;
      addBox(w, canopyH, d, brushedSteel, 0, canopyY, 0);
      // Front black glass touch control strip
      addBox(w * 0.56, canopyH * 0.52, 0.005, glossBlackGlass, 0, canopyY, d / 2 + 0.002, false);
      for (let i = -2; i <= 2; i++) {
        addBox(0.012, 0.008, 0.002, ledCyan, i * 0.032, canopyY, d / 2 + 0.005, false);
      }
      // Dual aluminum mesh grease filters underneath
      for (const sx of [-1, 1]) {
        addBox(w * 0.42, 0.008, d * 0.66, darkMetal, sx * (w * 0.23), -h / 2 - 0.002, 0.02, false);
      }
      // 2 warm LED downlight spots underneath front edge
      for (const sx of [-1, 1]) {
        const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.005, 16), ledWarm);
        lamp.position.set(sx * (w * 0.32), -h / 2 - 0.002, -d * 0.32);
        group.add(lamp);
      }
      break;
    }

    case 'microwave_builtin': {
      // Rear chassis
      addBox(w * 0.94, h * 0.92, d * 0.92, darkMetal, 0, 0, -d * 0.04);
      // Gloss black flush front frame
      addBox(w, h, 0.024, glossBlackGlass, 0, 0, d / 2 - 0.012);
      // Stainless steel top & bottom hairline trim
      addBox(w, 0.012, 0.026, brushedSteel, 0, h / 2 - 0.006, d / 2 - 0.011, false);
      addBox(w, 0.012, 0.026, brushedSteel, 0, -h / 2 + 0.006, d / 2 - 0.011, false);
      // Viewing door window (left 72%)
      addBox(w * 0.66, h * 0.72, 0.004, darkMetal, -w * 0.11, 0, d / 2 + 0.001, false);
      // Right touch panel & green/cyan LED clock
      addBox(w * 0.18, h * 0.16, 0.004, matteBlack, w * 0.34, h * 0.22, d / 2 + 0.002, false);
      addBox(w * 0.11, h * 0.055, 0.002, ledCyan, w * 0.34, h * 0.22, d / 2 + 0.005, false);
      // Door open button
      addBox(w * 0.14, h * 0.11, 0.008, brushedSteel, w * 0.34, -h * 0.24, d / 2 + 0.003, false);
      break;
    }

    // =========================================================================
    // BATHROOM FIXTURES & LAUNDRY
    // =========================================================================
    case 'bathroom_sink': {
      // Countertop ceramic basin (sits at bottom -h/2, faucet rises to +h/2)
      const basinH = Math.min(0.145, h * 0.56);
      const basinD = d * 0.84;
      const basinZ = d * 0.06;

      // Outer rounded porcelain shell
      const outerGeo = createRoundedBoxXZ(w, basinH, basinD, Math.min(w, basinD) * 0.24, 0.014);
      const outer = new THREE.Mesh(outerGeo, porcelain);
      outer.position.set(0, -h / 2, basinZ);
      outer.castShadow = true;
      outer.receiveShadow = true;
      group.add(outer);

      // Subtle recessed inner basin cavity (darker shadow tint for crisp visual depth)
      const cavityMat = new THREE.MeshStandardMaterial({
        color: '#DCE3EC',
        roughness: 0.22,
        metalness: 0.04,
      });
      const cavityGeo = createRoundedBoxXZ(w * 0.84, 0.018, basinD * 0.78, Math.min(w, basinD) * 0.2, 0.004);
      const cavity = new THREE.Mesh(cavityGeo, cavityMat);
      cavity.position.set(0, -h / 2 + basinH - 0.015, basinZ);
      group.add(cavity);

      // Chrome click-clack drain plug
      const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.024, 0.006, 20), chrome);
      drain.position.set(0, -h / 2 + basinH + 0.002, basinZ);
      group.add(drain);

      // Tall chrome deck-mounted bathroom faucet behind basin
      const tapZ = -d / 2 + 0.036;
      const tapH = Math.max(0.18, h - 0.02);
      const tapBody = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.021, tapH, 16), chrome);
      tapBody.position.set(0, -h / 2 + tapH / 2, tapZ);
      tapBody.castShadow = true;
      group.add(tapBody);

      // Forward-angled spout
      const spout = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.012, 0.13, 12), chrome);
      spout.rotation.x = Math.PI / 2.25;
      spout.position.set(0, -h / 2 + tapH - 0.032, tapZ + 0.06);
      spout.castShadow = true;
      group.add(spout);

      // Top single-lever handle
      const lever = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.008, 0.095), chrome);
      lever.position.set(0, -h / 2 + tapH + 0.012, tapZ + 0.028);
      group.add(lever);
      break;
    }

    case 'shower_cabin': {
      const trayH = 0.045;
      const glassH = h - trayH;
      const glassT = 0.008;
      const frameT = 0.024;

      // Low-profile white conglomerate shower tray
      addBox(w, trayH, d, porcelain, 0, -h / 2 + trayH / 2, 0);
      // Recessed linear stainless drain channel near rear wall
      addBox(w * 0.62, 0.004, 0.052, chrome, 0, -h / 2 + trayH + 0.002, -d / 2 + 0.14, false);

      // Walk-In tempered glass front-left screen + right side glass panel
      const frontGlassW = w * 0.68;
      const glassY = -h / 2 + trayH + glassH / 2;

      // Left wall aluminum profile + front glass panel (leaves walk-in entry gap on right!)
      addBox(frameT, glassH, frameT, matteBlack, -w / 2 + frameT / 2, glassY, d / 2 - frameT / 2);
      addBox(frontGlassW, glassH - 0.01, glassT, showerGlass, -w / 2 + frontGlassW / 2, glassY, d / 2 - frameT / 2, false);
      // Vertical black edge trim on open glass edge
      addBox(0.014, glassH, 0.014, matteBlack, -w / 2 + frontGlassW, glassY, d / 2 - frameT / 2);
      // Horizontal matte-black stabilizer bar from front glass back to rear wall
      addBox(0.014, 0.014, d - 0.04, matteBlack, -w / 2 + frontGlassW, h / 2 - 0.06, 0);

      // Right side return glass wall
      addBox(glassT, glassH - 0.01, d, showerGlass, w / 2 - frameT / 2, glassY, 0, false);
      addBox(frameT, glassH, frameT, matteBlack, w / 2 - frameT / 2, glassY, -d / 2 + frameT / 2);
      addBox(frameT, glassH, frameT, matteBlack, w / 2 - frameT / 2, glassY, d / 2 - frameT / 2);
      addBox(frameT, 0.02, d, matteBlack, w / 2 - frameT / 2, h / 2 - 0.01, 0);

      // Matte-black thermostatic shower column + rain head on rear wall
      const colZ = -d / 2 + 0.055;
      const mixerY = -h / 2 + 1.05;
      // Thermostatic bar mixer
      const mixer = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.26, 16), matteBlack);
      mixer.rotation.z = Math.PI / 2;
      mixer.position.set(0, mixerY, colZ);
      group.add(mixer);
      // Vertical riser rail up to overhead rain shower
      const riserH = Math.max(0.75, h - 1.18);
      const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, riserH, 12), matteBlack);
      riser.position.set(0, mixerY + riserH / 2, colZ);
      group.add(riser);
      // Overhead horizontal arm + wide square rain showerhead (250×250 mm)
      const armY = mixerY + riserH;
      addBox(0.02, 0.02, 0.34, matteBlack, 0, armY, colZ + 0.17);
      addBox(0.25, 0.012, 0.25, matteBlack, 0, armY - 0.016, colZ + 0.32);
      addBox(0.22, 0.004, 0.22, chrome, 0, armY - 0.023, colZ + 0.32, false);
      break;
    }

    case 'bathtub_170': {
      const rimH = 0.045;
      const wallT = 0.075;
      const innerH = h - rimH - 0.06;

      // Outer acrylic tub body walls (hollowed interior so it looks genuinely deep!)
      const tubFloorH = 0.075;
      addBox(w, tubFloorH, d, porcelain, 0, -h / 2 + tubFloorH / 2, 0);
      // Front & Back long walls
      addBox(w, h - tubFloorH, wallT, porcelain, 0, tubFloorH / 2, d / 2 - wallT / 2);
      addBox(w, h - tubFloorH, wallT, porcelain, 0, tubFloorH / 2, -d / 2 + wallT / 2);
      // Left & Right end walls
      addBox(wallT, h - tubFloorH, d - wallT * 2, porcelain, -w / 2 + wallT / 2, tubFloorH / 2, 0);
      addBox(wallT, h - tubFloorH, d - wallT * 2, porcelain, w / 2 - wallT / 2, tubFloorH / 2, 0);

      // Sloped ergonomic backrest ramp on the right inner end
      const slopeLen = Math.min(0.45, innerH * 1.1);
      const backrest = new THREE.Mesh(
        new THREE.BoxGeometry(slopeLen, 0.03, d - wallT * 2 - 0.01),
        porcelain
      );
      backrest.rotation.z = 0.85;
      backrest.position.set(w / 2 - wallT - 0.11, -h / 2 + tubFloorH + innerH * 0.42, 0);
      group.add(backrest);

      // Subtle light-blue/slate inner bottom shadow plane + chrome drain & overflow
      const drain = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.008, 20), chrome);
      drain.position.set(-w * 0.32, -h / 2 + tubFloorH + 0.004, 0);
      const overflow = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.008, 18), chrome);
      overflow.rotation.z = Math.PI / 2;
      overflow.position.set(-w / 2 + wallT + 0.004, h / 2 - 0.11, 0);
      group.add(drain, overflow);

      // Deck-mounted chrome bath mixer faucet on rear rim
      const faucetX = -w * 0.28;
      const faucetZ = -d / 2 + wallT * 0.5;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.14, 14), chrome);
      post.position.set(faucetX, h / 2 + 0.07, faucetZ);
      const spout = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.016, 0.15), chrome);
      spout.position.set(faucetX, h / 2 + 0.12, faucetZ + 0.07);
      group.add(post, spout);
      break;
    }

    case 'washing_machine':
    case 'tumble_dryer': {
      const isDryer = model === 'tumble_dryer';
      const footH = 0.02;
      const bodyH = h - footH;
      const panelH = 0.135;

      // 4 rubber leveling feet
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, footH, 12), matteBlack);
          foot.position.set(sx * (w * 0.41), -h / 2 + footH / 2, sz * (d * 0.41));
          group.add(foot);
        }
      }

      // Main white enameled cabinet
      addBox(w, bodyH, d, whiteEnamel, 0, footH / 2, 0);
      // Top counter lid slight overhang
      addBox(w + 0.004, 0.024, d + 0.012, whiteEnamel, 0, h / 2 - 0.012, 0.004);

      // Front upper control panel fascia
      const fasciaY = h / 2 - 0.024 - panelH / 2;
      addBox(w - 0.008, panelH - 0.008, 0.008, isDryer ? darkMetal : whiteEnamel, 0, fasciaY, d / 2 + 0.002, false);
      // Detergent drawer / condensate tank seam on top-left
      addBox(w * 0.28, panelH * 0.72, 0.012, isDryer ? matteBlack : porcelain, -w * 0.31, fasciaY, d / 2 + 0.005, false);
      // Central rotary program selector knob
      const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.03, 0.022, 20), chrome);
      knob.rotation.x = Math.PI / 2;
      knob.position.set(0, fasciaY, d / 2 + 0.012);
      group.add(knob);
      // Right LED digital display
      addBox(w * 0.28, panelH * 0.56, 0.006, glossBlackGlass, w * 0.3, fasciaY, d / 2 + 0.005, false);
      addBox(w * 0.14, 0.018, 0.002, isDryer ? ledWarm : ledCyan, w * 0.3, fasciaY, d / 2 + 0.009, false);

      // Circular front porthole door (bulaj)
      const doorY = -h / 2 + footH + (bodyH - panelH) * 0.52;
      const outerR = Math.min(w, bodyH - panelH) * 0.37;
      // Outer ring bezel
      const bezel = new THREE.Mesh(
        new THREE.TorusGeometry(outerR, 0.036, 14, 32),
        isDryer ? chrome : matteBlack
      );
      bezel.position.set(0, doorY, d / 2 + 0.018);
      bezel.castShadow = true;
      group.add(bezel);
      // Inner metallic drum recess visible behind glass
      const drum = new THREE.Mesh(
        new THREE.CylinderGeometry(outerR * 0.88, outerR * 0.88, 0.012, 24),
        brushedSteel
      );
      drum.rotation.x = Math.PI / 2;
      drum.position.set(0, doorY, d / 2 + 0.004);
      group.add(drum);
      // Smoked curved glass dome
      const glassDisc = new THREE.Mesh(
        new THREE.CylinderGeometry(outerR * 0.9, outerR * 0.9, 0.016, 24),
        smokedGlass
      );
      glassDisc.rotation.x = Math.PI / 2;
      glassDisc.position.set(0, doorY, d / 2 + 0.026);
      group.add(glassDisc);
      break;
    }

    case 'towel_radiator': {
      // Modern anthracite ladder towel radiator
      const colR = 0.016;
      const rungR = 0.01;
      const zFront = d / 2 - 0.02;

      // Left & right vertical collector manifolds
      for (const sx of [-1, 1]) {
        const col = new THREE.Mesh(new THREE.CylinderGeometry(colR, colR, h - 0.04, 14), matteBlack);
        col.position.set(sx * (w / 2 - colR), 0.02, zFront);
        col.castShadow = true;
        group.add(col);
        // Bottom chrome thermostatic connection valves
        const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 12), chrome);
        valve.position.set(sx * (w / 2 - colR), -h / 2 + 0.02, zFront);
        group.add(valve);
        // Wall mounting standoffs
        for (const sy of [-0.36, 0.36]) {
          const bracket = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, d - 0.02, 10), matteBlack);
          bracket.rotation.x = Math.PI / 2;
          bracket.position.set(sx * (w / 2 - colR), h * sy, 0);
          group.add(bracket);
        }
      }

      // Grouped horizontal ladder rungs (with realistic gaps for hanging towels)
      const rungCount = Math.max(8, Math.min(18, Math.round(h / 0.085)));
      for (let i = 0; i < rungCount; i++) {
        // Skip 2 spaces to create 3 towel hanging zones
        if (i === Math.floor(rungCount * 0.35) || i === Math.floor(rungCount * 0.7)) continue;
        const frac = i / (rungCount - 1);
        const ry = -h / 2 + 0.09 + frac * (h - 0.14);
        const rung = new THREE.Mesh(new THREE.CylinderGeometry(rungR, rungR, w - colR * 2, 12), matteBlack);
        rung.rotation.z = Math.PI / 2;
        rung.position.set(0, ry, zFront);
        rung.castShadow = true;
        group.add(rung);
      }
      break;
    }

    case 'led_mirror': {
      // Rear aluminum mounting chassis
      addBox(w - 0.06, h - 0.06, d * 0.62, darkMetal, 0, 0, -d * 0.18, false);
      // Warm backlit halo strip peeking out behind mirror edge
      addBox(w - 0.02, h - 0.02, 0.008, ledWarm, 0, 0, d * 0.08, false);
      // High-gloss reflective mirror front glass
      const mirrorMat = new THREE.MeshPhysicalMaterial({
        color: '#DCE4EC',
        metalness: 0.96,
        roughness: 0.04,
        clearcoat: 1.0,
        clearcoatRoughness: 0.02,
      });
      addBox(w, h, 0.008, mirrorMat, 0, 0, d / 2 - 0.004);
      // Front frosted LED light frame border + touch power icon ring
      const touchRing = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.015, 20), ledCyan);
      touchRing.position.set(0, -h * 0.36, d / 2 + 0.001);
      group.add(touchRing);
      break;
    }

    // =========================================================================
    // WARDROBE & BEDROOM
    // =========================================================================
    case 'bed_double':
    case 'bed_single': {
      const isDouble = model === 'bed_double';
      const footH = 0.08;
      const baseH = 0.24;
      const headboardT = 0.11;
      const mattressH = 0.22;
      const mattressLen = d - headboardT - 0.05;
      const mattressW = w - 0.07;

      // 4 solid oak corner legs
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.016, footH, 12), oakWood);
          leg.position.set(sx * (w / 2 - 0.07), -h / 2 + footH / 2, sz * (d / 2 - 0.07));
          leg.castShadow = true;
          group.add(leg);
        }
      }

      // Upholstered platform base frame
      addBox(w, baseH, d - headboardT, fabricWarmGray, 0, -h / 2 + footH + baseH / 2, headboardT / 2);

      // Tall padded headboard at rear (-Z)
      const headGeo = createRoundedBoxXZ(w, h - footH, headboardT, 0.03, 0.012);
      const headboard = new THREE.Mesh(headGeo, fabricWarmGray);
      headboard.position.set(0, -h / 2 + footH, -d / 2 + headboardT / 2);
      headboard.castShadow = true;
      headboard.receiveShadow = true;
      group.add(headboard);

      // Mattress resting cleanly inside frame
      const mattressY = -h / 2 + footH + baseH - 0.04;
      const matGeo = createRoundedBoxXZ(mattressW, mattressH, mattressLen, 0.05, 0.022);
      const mattress = new THREE.Mesh(matGeo, mattressWhite);
      mattress.position.set(0, mattressY, headboardT / 2);
      mattress.castShadow = true;
      mattress.receiveShadow = true;
      group.add(mattress);

      // Folded duvet / throw blanket over foot half of bed
      const throwLen = mattressLen * 0.44;
      const throwGeo = createRoundedBoxXZ(mattressW + 0.02, mattressH * 0.28, throwLen, 0.04, 0.014);
      const throwMesh = new THREE.Mesh(throwGeo, throwAccent);
      throwMesh.position.set(0, mattressY + mattressH - 0.02, d / 2 - throwLen / 2 - 0.03);
      throwMesh.castShadow = true;
      group.add(throwMesh);

      // Pillows (2 for double, 1 for single)
      const pillowPositions = isDouble ? [-w * 0.23, w * 0.23] : [0];
      const pillowW = isDouble ? w * 0.38 : w * 0.62;
      for (const px of pillowPositions) {
        const pGeo = createRoundedBoxXZ(pillowW, 0.12, 0.42, 0.06, 0.035);
        const pillow = new THREE.Mesh(pGeo, fabricBeige);
        pillow.position.set(px, mattressY + mattressH - 0.01, -d / 2 + headboardT + 0.28);
        pillow.castShadow = true;
        group.add(pillow);
      }
      break;
    }

    case 'dressing_bench': {
      const cushionH = 0.09;
      const frameH = h - cushionH;
      const tube = 0.024;

      // Matte black welded loft steel leg frames (left & right rectangles + lower stretcher)
      for (const sx of [-1, 1]) {
        const lx = sx * (w / 2 - 0.045);
        addBox(tube, frameH, tube, matteBlack, lx, -h / 2 + frameH / 2, -d / 2 + 0.035);
        addBox(tube, frameH, tube, matteBlack, lx, -h / 2 + frameH / 2, d / 2 - 0.035);
        addBox(tube, tube, d - 0.07, matteBlack, lx, -h / 2 + 0.08, 0);
        addBox(tube, tube, d - 0.07, matteBlack, lx, -h / 2 + frameH - tube / 2, 0);
      }
      addBox(w - 0.09, tube, tube, matteBlack, 0, -h / 2 + 0.08, 0);

      // Plush upholstered rounded seat cushion
      const seatGeo = createRoundedBoxXZ(w, cushionH, d, 0.04, 0.022);
      const seat = new THREE.Mesh(seatGeo, fabricBeige);
      seat.position.set(0, h / 2 - cushionH, 0);
      seat.castShadow = true;
      seat.receiveShadow = true;
      group.add(seat);
      break;
    }

    // =========================================================================
    // LIVING ROOM & OFFICE
    // =========================================================================
    case 'tv_65': {
      const standH = 0.085;
      const screenH = h - standH;
      const screenT = 0.028;

      // Brushed metal weighted table stand base + neck
      addBox(w * 0.34, 0.014, d, darkMetal, 0, -h / 2 + 0.007, 0);
      addBox(w * 0.09, standH + 0.06, 0.032, darkMetal, 0, -h / 2 + standH / 2 + 0.03, -0.02);

      // Ultra-slim TV outer black frame + rear housing
      const screenY = -h / 2 + standH + screenH / 2;
      addBox(w, screenH, screenT, matteBlack, 0, screenY, 0);
      addBox(w * 0.72, screenH * 0.52, 0.024, darkMetal, 0, screenY - screenH * 0.14, -screenT / 2 - 0.012);

      // High-gloss OLED screen panel face
      addBox(w - 0.016, screenH - 0.016, 0.004, glossBlackGlass, 0, screenY, screenT / 2 + 0.002, false);
      break;
    }

    case 'sofa_3seat': {
      const legH = 0.13;
      const baseH = 0.16;
      const armW = 0.15;
      const seatH = 0.16;
      const backT = 0.17;

      // 4 tapered oak legs
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.015, legH, 12), oakWood);
          leg.position.set(sx * (w / 2 - 0.09), -h / 2 + legH / 2, sz * (d / 2 - 0.09));
          leg.castShadow = true;
          group.add(leg);
        }
      }

      // Base deck frame
      addBox(w, baseH, d, fabricWarmGray, 0, -h / 2 + legH + baseH / 2, 0);
      // Left & right armrests
      const armH = 0.36;
      for (const sx of [-1, 1]) {
        const armGeo = createRoundedBoxXZ(armW, armH, d, 0.035, 0.018);
        const arm = new THREE.Mesh(armGeo, fabricWarmGray);
        arm.position.set(sx * (w / 2 - armW / 2), -h / 2 + legH + baseH, 0);
        arm.castShadow = true;
        arm.receiveShadow = true;
        group.add(arm);
      }
      // Solid rear backrest shell
      const backShellH = h - legH - baseH;
      addBox(w - armW * 2, backShellH, backT, fabricWarmGray, 0, -h / 2 + legH + baseH + backShellH / 2, -d / 2 + backT / 2);

      // 3 individual plush seat cushions & 3 slightly angled back cushions
      const innerW = w - armW * 2 - 0.02;
      const cushW = innerW / 3 - 0.012;
      const seatD = d - backT - 0.02;
      for (let i = -1; i <= 1; i++) {
        const cx = i * (innerW / 3);
        const seatGeo = createRoundedBoxXZ(cushW, seatH, seatD, 0.045, 0.024);
        const seat = new THREE.Mesh(seatGeo, fabricWarmGray);
        seat.position.set(cx, -h / 2 + legH + baseH, backT / 2 + 0.01);
        seat.castShadow = true;
        seat.receiveShadow = true;
        group.add(seat);

        const backCushH = Math.max(0.36, backShellH - 0.06);
        const bcGeo = createRoundedBoxXZ(cushW * 0.96, backCushH, 0.16, 0.045, 0.026);
        const bc = new THREE.Mesh(bcGeo, fabricBeige);
        bc.position.set(cx, -h / 2 + legH + baseH + seatH - 0.02, -d / 2 + backT + 0.075);
        bc.rotation.x = -0.14;
        bc.castShadow = true;
        group.add(bc);
      }
      break;
    }

    case 'office_chair': {
      const wheelR = 0.025;
      const starY = -h / 2 + wheelR * 2 + 0.015;
      const seatY = -h / 2 + 0.46;

      // 5-star caster base
      for (let i = 0; i < 5; i++) {
        const ang = (i * Math.PI * 2) / 5;
        const armLen = Math.min(w, d) * 0.44;
        const legArm = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.024, armLen), darkMetal);
        legArm.rotation.y = ang;
        legArm.position.set(Math.sin(ang) * (armLen / 2), starY, Math.cos(ang) * (armLen / 2));
        group.add(legArm);

        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(wheelR, wheelR, 0.024, 12), matteBlack);
        wheel.rotation.z = Math.PI / 2;
        wheel.position.set(Math.sin(ang) * (armLen - 0.015), -h / 2 + wheelR, Math.cos(ang) * (armLen - 0.015));
        group.add(wheel);
      }

      // Pneumatic central gas cylinder
      const cylH = seatY - starY;
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, cylH, 16), chrome);
      cyl.position.set(0, starY + cylH / 2, 0);
      group.add(cyl);

      // Contoured ergonomic seat cushion
      const seatGeo = createRoundedBoxXZ(w * 0.78, 0.075, d * 0.76, 0.06, 0.02);
      const seat = new THREE.Mesh(seatGeo, matteBlack);
      seat.position.set(0, seatY, 0.02);
      seat.castShadow = true;
      group.add(seat);

      // T-shaped armrests
      for (const sx of [-1, 1]) {
        const ax = sx * (w * 0.44);
        addBox(0.024, 0.21, 0.032, darkMetal, ax, seatY + 0.12, 0.0);
        const padGeo = createRoundedBoxXZ(0.065, 0.024, 0.25, 0.02, 0.008);
        const pad = new THREE.Mesh(padGeo, matteBlack);
        pad.position.set(ax, seatY + 0.22, 0.02);
        group.add(pad);
      }

      // Curved ergonomic backrest + headrest
      const backH = Math.max(0.46, h * 0.45);
      addBox(0.055, backH * 0.72, 0.03, darkMetal, 0, seatY + backH * 0.35, -d * 0.36);
      const backGeo = createRoundedBoxXZ(w * 0.72, backH, 0.055, 0.06, 0.016);
      const back = new THREE.Mesh(backGeo, fabricWarmGray);
      back.position.set(0, seatY + 0.08, -d * 0.33);
      back.rotation.x = -0.1;
      back.castShadow = true;
      group.add(back);

      // Headrest pillow at top
      const headGeo = createRoundedBoxXZ(w * 0.42, 0.13, 0.055, 0.04, 0.016);
      const headrest = new THREE.Mesh(headGeo, matteBlack);
      headrest.position.set(0, h / 2 - 0.14, -d * 0.35);
      group.add(headrest);
      break;
    }

    case 'desk_monitor_set': {
      // 27" monitor + slim wireless keyboard & mouse
      const screenW = Math.min(w, 0.62);
      const screenH = Math.min(h * 0.76, 0.36);
      const monitorZ = -d * 0.22;

      // Monitor stand base & slender neck
      addBox(0.22, 0.01, 0.17, brushedSteel, 0, -h / 2 + 0.005, monitorZ);
      addBox(0.042, h * 0.56, 0.018, brushedSteel, 0, -h / 2 + h * 0.28, monitorZ - 0.045);

      // Ultrathin screen frame + dark glossy display face
      const screenY = h / 2 - screenH / 2;
      addBox(screenW, screenH, 0.018, matteBlack, 0, screenY, monitorZ);
      addBox(screenW - 0.014, screenH - 0.022, 0.004, glossBlackGlass, 0, screenY + 0.003, monitorZ + 0.01, false);

      // Wireless slim aluminum keyboard in front of monitor
      const kbZ = d * 0.28;
      addBox(0.36, 0.012, 0.125, brushedSteel, -0.055, -h / 2 + 0.006, kbZ);
      addBox(0.33, 0.004, 0.1, matteBlack, -0.055, -h / 2 + 0.014, kbZ, false);

      // Ergonomic mouse to the right of keyboard
      const mouseGeo = createRoundedBoxXZ(0.064, 0.028, 0.11, 0.028, 0.012);
      const mouse = new THREE.Mesh(mouseGeo, matteBlack);
      mouse.position.set(0.21, -h / 2, kbZ);
      group.add(mouse);
      break;
    }

    case 'coffee_table': {
      const topT = 0.032;
      const r = Math.min(w, d) / 2;
      const legH = h - topT;

      // Round beveled natural oak tabletop
      const topMesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.985, topT, 36), oakWood);
      topMesh.position.set(0, h / 2 - topT / 2, 0);
      topMesh.castShadow = true;
      topMesh.receiveShadow = true;
      group.add(topMesh);

      // Crossed matte-black steel X-frame base with 4 vertical legs
      const legR = r * 0.72;
      const tube = 0.022;
      for (const ang of [Math.PI / 4, (3 * Math.PI) / 4]) {
        const botBar = new THREE.Mesh(new THREE.BoxGeometry(legR * 2, tube, tube), matteBlack);
        botBar.rotation.y = ang;
        botBar.position.set(0, -h / 2 + tube / 2, 0);
        botBar.castShadow = true;
        group.add(botBar);

        const topBar = botBar.clone();
        topBar.position.y = h / 2 - topT - tube / 2;
        group.add(topBar);
      }
      for (let i = 0; i < 4; i++) {
        const ang = Math.PI / 4 + (i * Math.PI) / 2;
        const vLeg = new THREE.Mesh(new THREE.BoxGeometry(tube, legH, tube), matteBlack);
        vLeg.position.set(Math.cos(ang) * legR, -h / 2 + legH / 2, Math.sin(ang) * legR);
        vLeg.castShadow = true;
        group.add(vLeg);
      }
      break;
    }

    default:
      built = false;
      break;
  }

  if (!built) {
    // Clean up unused local materials if model isn't handled here
    [
      whiteEnamel,
      porcelain,
      brushedSteel,
      chrome,
      matteBlack,
      darkMetal,
      glossBlackGlass,
      smokedGlass,
      showerGlass,
      oakWood,
      fabricWarmGray,
      fabricBeige,
      mattressWhite,
      throwAccent,
      ledCyan,
      ledWarm,
    ].forEach((m) => m.dispose());
    return null;
  }

  // Mark each used material once for WebGL teardown; dispose unused materials immediately
  const usedMaterials = new Set<THREE.Material>();
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh && obj.material instanceof THREE.Material) {
      if (!usedMaterials.has(obj.material)) {
        usedMaterials.add(obj.material);
        obj.userData.disposeMaterial = true;
      }
    }
  });

  const allCreated: THREE.Material[] = [
    whiteEnamel,
    porcelain,
    brushedSteel,
    chrome,
    matteBlack,
    darkMetal,
    glossBlackGlass,
    smokedGlass,
    showerGlass,
    oakWood,
    fabricWarmGray,
    fabricBeige,
    mattressWhite,
    throwAccent,
    ledCyan,
    ledWarm,
  ];
  for (const m of allCreated) {
    if (!usedMaterials.has(m)) {
      m.dispose();
    }
  }

  return group;
}
