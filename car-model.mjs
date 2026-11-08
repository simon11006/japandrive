import * as THREE from "./vendor/three.module.js";

// Exterior models of the two drivable cars, lofted from side-profile stations.
// Overall length, width, height, wheelbase and tyre sizes follow Toyota's
// published 2025 specifications; the curves between them are traced by eye
// from official photographs, so this is a recognisable likeness, not CAD.
//
// Station: [z, sill, beltline, roof|null, bodyHalfWidth, roofHalfWidth]
// z runs from the front bumper (-length/2) to the rear (+length/2).
const PROFILES = {
  prius: {
    length: 4.6,
    width: 1.78,
    tyre: 0.333, // 195/60R17
    axles: [-1.37, 1.38],
    paint: "#e9ecec",
    stations: [
      [-2.3, 0.36, 0.5, null, 0.7],
      [-2.26, 0.26, 0.6, null, 0.82],
      [-2.1, 0.2, 0.68, null, 0.87],
      [-1.7, 0.18, 0.74, null, 0.885],
      [-1.2, 0.18, 0.8, null, 0.89],
      [-0.85, 0.18, 0.85, 0.85, 0.89, 0.72],
      [-0.4, 0.18, 0.88, 1.18, 0.89, 0.66],
      [0.0, 0.18, 0.9, 1.4, 0.89, 0.62],
      [0.55, 0.18, 0.92, 1.36, 0.89, 0.61],
      [1.15, 0.19, 0.94, 1.17, 0.88, 0.58],
      [1.72, 0.21, 0.97, 0.98, 0.86, 0.52],
      [2.08, 0.26, 0.96, null, 0.82],
      [2.3, 0.36, 0.9, null, 0.72],
    ],
  },
  alphard: {
    length: 4.995,
    width: 1.85,
    tyre: 0.364, // 225/60R18
    roofSkin: 0.17,
    axles: [-1.48, 1.52],
    paint: "#f2f1ec",
    stations: [
      [-2.5, 0.36, 0.72, null, 0.8],
      [-2.45, 0.27, 0.9, null, 0.9],
      [-2.25, 0.23, 1.02, null, 0.92],
      [-1.95, 0.22, 1.1, null, 0.925],
      [-1.72, 0.22, 1.13, 1.13, 0.925, 0.8],
      [-1.3, 0.22, 1.14, 1.68, 0.925, 0.82],
      [-0.95, 0.22, 1.14, 1.9, 0.925, 0.84],
      [0.4, 0.22, 1.15, 1.93, 0.925, 0.845],
      [1.8, 0.22, 1.16, 1.93, 0.925, 0.845],
      [2.3, 0.24, 1.16, 1.89, 0.92, 0.84],
      [2.46, 0.3, 1.12, 1.8, 0.9, 0.8],
      [2.5, 0.4, 1.05, 1.05, 0.86, 0.78],
    ],
  },
};

function interpolate(stations, z) {
  for (let i = 1; i < stations.length; i++) {
    const a = stations[i - 1],
      b = stations[i];
    if (z <= b[0] + 1e-9) {
      const t = (z - a[0]) / (b[0] - a[0] || 1),
        lerp = (k) => a[k] + (b[k] - a[k]) * t;
      const roof = a[3] != null && b[3] != null ? lerp(3) : null;
      const roofWidth = a[5] != null && b[5] != null ? lerp(5) : null;
      return { z, sill: lerp(1), belt: lerp(2), roof, half: lerp(4), roofHalf: roofWidth };
    }
  }
  const s = stations.at(-1);
  return { z, sill: s[1], belt: s[2], roof: s[3], half: s[4], roofHalf: s[5] };
}

// Superellipse ring: rounded-rectangle cross-section.
function ring(cx, cy, hw, hh, n = 28, power = 4.5, topHalf = null) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2,
      c = Math.cos(a),
      s = Math.sin(a),
      u = Math.sign(c) * Math.abs(c) ** (2 / power),
      v = Math.sign(s) * Math.abs(s) ** (2 / power),
      w = topHalf == null ? hw : hw + (topHalf - hw) * ((v + 1) / 2);
    pts.push([cx + u * w, cy + v * hh]);
  }
  return pts;
}

// Join rings (one per station along z) into a closed tube with end caps.
function loft(rings, zs, material) {
  const n = rings[0].length,
    positions = [],
    index = [];
  rings.forEach((r, i) => r.forEach(([x, y]) => positions.push(x, y, zs[i])));
  for (let i = 0; i < rings.length - 1; i++)
    for (let j = 0; j < n; j++) {
      const a = i * n + j,
        b = i * n + ((j + 1) % n),
        c = (i + 1) * n + j,
        d = (i + 1) * n + ((j + 1) % n);
      // Rings run anticlockwise seen from +z and stations advance along +z,
      // so (a, b, c) / (b, d, c) face outward.
      index.push(a, b, c, b, d, c);
    }
  for (const [i, flip] of [
    [0, true],
    [rings.length - 1, false],
  ]) {
    const centre = positions.length / 3,
      r = rings[i];
    positions.push(r.reduce((s, p) => s + p[0], 0) / n, r.reduce((s, p) => s + p[1], 0) / n, zs[i]);
    for (let j = 0; j < n; j++) {
      const a = i * n + j,
        b = i * n + ((j + 1) % n);
      // Front cap faces -z, rear cap +z.
      flip ? index.push(centre, b, a) : index.push(centre, a, b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(index);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function wheel(radius, width, rimColor) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, width, 32),
    new THREE.MeshStandardMaterial({ color: "#151719", roughness: 0.92 }),
  );
  tyre.rotation.z = Math.PI / 2;
  tyre.castShadow = true;
  g.add(tyre);
  const rimMaterial = new THREE.MeshStandardMaterial({ color: rimColor, roughness: 0.32, metalness: 0.85 });
  const face = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.7, radius * 0.7, width + 0.012, 32), rimMaterial);
  face.rotation.z = Math.PI / 2;
  g.add(face);
  const dark = new THREE.MeshStandardMaterial({ color: "#2a2e31", roughness: 0.5, metalness: 0.4 });
  for (const side of [-1, 1]) {
    const well = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.6, radius * 0.6, 0.01, 32), dark);
    well.rotation.z = Math.PI / 2;
    well.position.x = side * (width / 2 + 0.008);
    g.add(well);
    for (let k = 0; k < 5; k++) {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.02, radius * 1.15, 0.07), rimMaterial);
      spoke.position.x = side * (width / 2 + 0.012);
      spoke.rotation.x = (k / 5) * Math.PI * 2;
      g.add(spoke);
    }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.13, radius * 0.13, 0.02, 16), rimMaterial);
    hub.rotation.z = Math.PI / 2;
    hub.position.x = side * (width / 2 + 0.018);
    g.add(hub);
  }
  return g;
}

function lamp(parent, size, position, color, emissive, intensity) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(...size),
    new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.25 }),
  );
  m.position.set(...position);
  parent.add(m);
  return m;
}

export function makeCarModel(id = "prius", paint) {
  const p = PROFILES[id] || PROFILES.prius,
    group = new THREE.Group(),
    half = p.length / 2,
    body = new THREE.MeshPhysicalMaterial({
      color: paint || p.paint,
      roughness: 0.38,
      metalness: 0.05,
      clearcoat: 0.6,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.45,
    }),
    glass = new THREE.MeshPhysicalMaterial({
      color: "#070d10",
      roughness: 0.28,
      metalness: 0,
      specularIntensity: 0.35,
      envMapIntensity: 0.15,
    }),
    trim = new THREE.MeshStandardMaterial({ color: "#121416", roughness: 0.6 });
  group.userData.body = body;
  // Resample stations every 4 cm and cut wheel arches into the sill line.
  const zs = [];
  for (let z = -half; z <= half + 1e-9; z += 0.04) zs.push(Math.min(z, half));
  const archR = p.tyre + 0.05;
  const sections = zs.map((z) => {
    const s = interpolate(p.stations, z);
    for (const axle of p.axles) {
      const dz = z - axle;
      if (Math.abs(dz) < archR) s.sill = Math.max(s.sill, p.tyre + Math.sqrt(archR * archR - dz * dz));
    }
    return s;
  });
  // Lower body: sill to beltline, a little fuller than the glasshouse.
  group.add(
    loft(
      sections.map((s) => ring(0, (s.sill + s.belt) / 2, s.half, Math.max(0.01, (s.belt - s.sill) / 2), 28, 5)),
      zs,
      body,
    ),
  );
  // Black lower cladding band to read the arches and sills.
  // Kept below the beltline so it never wraps over the bonnet at the arches.
  const cladding = sections.map((s) => {
    const room = s.belt - s.sill;
    return ring(0, s.sill + Math.min(0.05, room * 0.25), s.half + 0.004, Math.min(0.055, room * 0.25), 28, 6);
  });
  group.add(loft(cladding, zs, trim));
  // Glasshouse (tinted glass) and a painted roof skin over it.
  const cabin = sections.filter((s) => s.roof != null);
  if (cabin.length > 1) {
    const cz = cabin.map((s) => s.z);
    group.add(
      loft(
        cabin.map((s) =>
          ring(0, (s.belt + s.roof) / 2, s.half * 0.97, Math.max(0.005, (s.roof - s.belt) / 2), 28, id === "alphard" ? 6 : 3.4, s.roofHalf),
        ),
        cz,
        glass,
      ),
    );
    // Paint only the flat roof, not the sloping windshield or rear glass.
    const top = Math.max(...cabin.map((s) => s.roof)),
      roof = cabin.filter((s) => s.roof > top - (id === "alphard" ? 0.08 : 0.12));
    if (roof.length > 1)
      group.add(
        loft(
          roof.map((s) => {
            const skin = p.roofSkin || 0.03;
            return ring(0, s.roof - skin / 2 + 0.006, s.roofHalf + 0.004, skin / 2, 24, 6);
          }),
          roof.map((s) => s.z),
          body,
        ),
      );
  }
  // Wheels.
  for (const axle of p.axles)
    for (const side of [-1, 1]) {
      const w = wheel(p.tyre, id === "alphard" ? 0.225 : 0.195, id === "alphard" ? "#b9bec2" : "#3b4044");
      w.position.set(side * (p.width / 2 - 0.13), p.tyre, axle);
      group.add(w);
    }
  // Lamps, grille and plates.
  const front = -half,
    rear = half;
  if (id === "alphard") {
    const chrome = new THREE.MeshStandardMaterial({ color: "#d9dde0", roughness: 0.15, metalness: 1 });
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 0.05), trim);
    grille.position.set(0, 0.68, front + 0.03);
    group.add(grille);
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.022, 0.03), chrome);
      bar.position.set(0, 0.46 + i * 0.09, front + 0.0);
      group.add(bar);
    }
    for (const side of [-1, 1]) {
      lamp(group, [0.36, 0.08, 0.05], [side * 0.62, 0.98, front + 0.08], "#f4f6ff", "#e8f0ff", 0.9);
      lamp(group, [0.08, 0.5, 0.05], [side * 0.7, 1.15, rear - 0.01], "#5a0c10", "#ff2a22", 0.5);
    }
  } else {
    // Prius "hammerhead" thin full-width daytime light and rear light bar.
    lamp(group, [1.2, 0.025, 0.04], [0, 0.56, front + 0.02], "#f6f8ff", "#eef4ff", 1.2);
    for (const side of [-1, 1]) lamp(group, [0.28, 0.06, 0.04], [side * 0.62, 0.6, front + 0.1], "#dfe6ee", "#cfe0ff", 0.4);
    lamp(group, [1.2, 0.035, 0.04], [0, 0.8, rear + 0.005], "#5a0c10", "#ff2a22", 0.6);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.16, 0.05), trim);
    intake.position.set(0, 0.36, front + 0.04);
    group.add(intake);
  }
  // Japanese white registration plates (blank: no invented plate numbers).
  const plate = new THREE.MeshStandardMaterial({ color: "#f3f4ee", roughness: 0.5 });
  for (const [z, y] of [
    [front - 0.005, 0.45],
    [rear + 0.005, id === "alphard" ? 0.62 : 0.5],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.165, 0.012), plate);
    m.position.set(0, y, z);
    group.add(m);
  }
  // Door mirrors (hidden while the cockpit renders its own mirror views).
  group.userData.mirrors = [];
  const mirrorZ = (p.stations.find((s) => s[3] != null)?.[0] ?? -0.8) + 0.12;
  for (const side of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 0.2), body);
    const s = interpolate(p.stations, mirrorZ);
    m.position.set(side * (s.half + 0.08), s.belt + 0.06, mirrorZ);
    group.add(m);
    group.userData.mirrors.push(m);
  }
  return group;
}
