import * as T from "./vendor/three.module.js";
import { VEHICLES } from "./vehicles.mjs";

// Original, photo-informed geometry: XW50 Prius and 40-series Alphard.
// Dimensions follow vehicles.mjs; surface curves and details are estimates.
// See references/exterior-model-sources.json. Photographs are not used as skins.
const PROFILES = {
  prius: {
    tyre: 0.31725,
    tyreWidth: 0.195,
    rim: 0.1905,
    paint: "#c2cbce",
    // z, body half width, shoulder height
    body: [
      [-2.27, 0.77, 0.65],
      [-2.18, 0.81, 0.7],
      [-1.85, 0.86, 0.82],
      [-1.35, 0.88, 0.9],
      [-0.85, 0.88, 0.94],
      [0, 0.87, 1.01],
      [0.9, 0.88, 1.08],
      [1.65, 0.87, 1.12],
      [2.19, 0.82, 1.11],
      [2.27, 0.76, 1.04],
    ],
    roof: [
      [-0.34, 1.4, 0.66],
      [0, 1.46, 0.67],
      [0.42, 1.47, 0.67],
      [0.86, 1.41, 0.65],
    ],
    windshield: { bottom: [-1.08, 0.96, 0.8], top: [-0.34, 1.4, 0.66] },
    rearWindow: { bottom: [2.04, 1.15, 0.71], top: [0.86, 1.41, 0.65] },
    windows: [
      [
        [-1.02, 0.97],
        [-0.31, 1.38],
        [0.25, 1.405],
        [0.25, 1.043],
      ],
      [
        [0.33, 1.045],
        [0.33, 1.408],
        [0.84, 1.35],
        [1.28, 1.19],
        [1.32, 1.12],
      ],
      [
        [1.4, 1.125],
        [1.37, 1.18],
        [1.91, 1.15],
      ],
    ],
  },
  alphard: {
    tyre: 0.3636,
    tyreWidth: 0.225,
    rim: 0.2286,
    paint: "#968975",
    body: [
      [-2.4975, 0.84, 1.03],
      [-2.4, 0.89, 1.07],
      [-2.05, 0.917, 1.115],
      [-1.5, 0.925, 1.16],
      [0, 0.925, 1.19],
      [1.4, 0.925, 1.235],
      [2.28, 0.91, 1.25],
      [2.4975, 0.81, 1.21],
    ],
    roof: [
      [-0.96, 1.86, 0.775],
      [-0.65, 1.925, 0.8],
      [0, 1.935, 0.8],
      [1.45, 1.935, 0.8],
      [2.16, 1.88, 0.785],
    ],
    windshield: { bottom: [-1.69, 1.19, 0.855], top: [-0.96, 1.86, 0.775] },
    rearWindow: { bottom: [2.43, 1.34, 0.82], top: [2.16, 1.86, 0.77] },
    windows: [
      [
        [-1.62, 1.19],
        [-0.91, 1.83],
        [0.02, 1.855],
        [0.03, 1.23],
      ],
      [
        [0.12, 1.25],
        [0.12, 1.855],
        [1.43, 1.855],
        [1.46, 1.29],
      ],
      [
        [1.54, 1.29],
        [1.51, 1.855],
        [2.13, 1.815],
        [2.34, 1.31],
      ],
    ],
  },
};
const V = (p) => new T.Vector3(...p),
  lerp = T.MathUtils.lerp,
  clamp = T.MathUtils.clamp;
function sample(rows, z, k) {
  if (z <= rows[0][0]) return rows[0][k];
  if (z >= rows.at(-1)[0]) return rows.at(-1)[k];
  const i = rows.findIndex((r, j) => j && z <= r[0]),
    a = rows[i - 1],
    b = rows[i],
    t = (z - a[0]) / (b[0] - a[0]);
  const before = rows[Math.max(0, i - 2)],
    after = rows[Math.min(rows.length - 1, i + 1)],
    span = b[0] - a[0];
  const m0 = ((b[k] - before[k]) / (b[0] - before[0])) * span,
    m1 = ((after[k] - a[k]) / (after[0] - a[0])) * span;
  return (
    (2 * t ** 3 - 3 * t * t + 1) * a[k] +
    (t ** 3 - 2 * t * t + t) * m0 +
    (-2 * t ** 3 + 3 * t * t) * b[k] +
    (t ** 3 - t * t) * m1
  );
}
function mesh(parent, name, g, m) {
  const o = new T.Mesh(g, m);
  o.name = name;
  o.castShadow = true;
  o.receiveShadow = true;
  parent.add(o);
  return o;
}
function roundBox(w, h, d, r = 0.015) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new T.BoxGeometry(w, h, d, 3, 3, 3),
    p = g.attributes.position,
    n = g.attributes.normal;
  const core = new T.Vector3(w / 2 - r, h / 2 - r, d / 2 - r),
    neg = core.clone().negate(),
    q = new T.Vector3(),
    a = new T.Vector3();
  for (let i = 0; i < p.count; i++) {
    a.fromBufferAttribute(p, i);
    q.copy(a).clamp(neg, core);
    a.sub(q).normalize();
    n.setXYZ(i, a.x, a.y, a.z);
    a.multiplyScalar(r).add(q);
    p.setXYZ(i, a.x, a.y, a.z);
  }
  return g;
}
function box(parent, name, size, pos, mat, r = 0.015) {
  const o = mesh(parent, name, roundBox(...size, r), mat);
  o.position.set(...pos);
  return o;
}
function tube(parent, name, points, r, mat, closed = false) {
  const curve = new T.CurvePath(),
    list = closed ? [...points, points[0]] : points;
  for (let i = 1; i < list.length; i++)
    curve.add(new T.LineCurve3(V(list[i - 1]), V(list[i])));
  const o = mesh(
    parent,
    name,
    new T.TubeGeometry(curve, Math.max(16, points.length * 3), r, 6, closed),
    mat,
  );
  // Sub-centimetre trim must not cast offset, jagged shadows over the paint.
  o.castShadow = r > 0.025;
  o.receiveShadow = false;
  return o;
}
function surface(parent, name, nu, nv, fn, mat, outward) {
  const ps = [],
    uv = [],
    idx = [];
  for (let v = 0; v <= nv; v++)
    for (let u = 0; u <= nu; u++) {
      ps.push(...fn(u / nu, v / nv));
      uv.push(u / nu, v / nv);
    }
  const point = (i) => new T.Vector3().fromArray(ps, i * 3);
  for (let v = 0; v < nv; v++)
    for (let u = 0; u < nu; u++) {
      const a = v * (nu + 1) + u,
        b = a + 1,
        c = a + nu + 1,
        d = c + 1,
        n = point(b)
          .sub(point(a))
          .cross(point(c).sub(point(a)));
      if (n.dot(V(outward)) > 0) idx.push(a, b, c, b, d, c);
      else idx.push(a, c, b, b, c, d);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(ps, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return mesh(parent, name, g, mat);
}
function panel(parent, name, points, mat, normal, holes = []) {
  const side = Math.abs(normal[0]) > 0.5,
    project = (p) => new T.Vector2(side ? p[2] : p[0], p[1]),
    all = [...points, ...holes.flat()],
    idx = [];
  for (const [a, b, c] of T.ShapeUtils.triangulateShape(
    points.map(project),
    holes.map((h) => h.map(project)),
  )) {
    const n = V(all[b])
      .sub(V(all[a]))
      .cross(V(all[c]).sub(V(all[a])));
    idx.push(...(n.dot(V(normal)) > 0 ? [a, b, c] : [a, c, b]));
  }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(all.flat(), 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return mesh(parent, name, g, mat);
}
function ellipse(parent, name, x, y, z, rx, ry, r, mat) {
  return tube(
    parent,
    name,
    Array.from({ length: 40 }, (_, i) => {
      const a = (i / 40) * Math.PI * 2;
      return [x + Math.cos(a) * rx, y + Math.sin(a) * ry, z];
    }),
    r,
    mat,
    true,
  );
}
function emblem(parent, x, y, z, m, rear = false) {
  const sign = rear ? 1 : -1,
    base = mesh(
      parent,
      "toyota-emblem-base",
      new T.SphereGeometry(1, 24, 12),
      m.badge,
    );
  base.scale.set(0.098, 0.064, 0.012);
  base.position.set(x, y, z);
  ellipse(
    parent,
    "toyota-emblem",
    x,
    y,
    z + sign * 0.014,
    0.087,
    0.055,
    0.006,
    m.chrome,
  );
  ellipse(
    parent,
    "toyota-emblem-inner",
    x,
    y + 0.005,
    z + sign * 0.017,
    0.029,
    0.049,
    0.0045,
    m.chrome,
  );
  ellipse(
    parent,
    "toyota-emblem-cross",
    x,
    y + 0.018,
    z + sign * 0.017,
    0.07,
    0.019,
    0.0045,
    m.chrome,
  );
}
function plateTexture(id) {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const x = c.getContext("2d");
  x.fillStyle = "#e8eae6";
  x.fillRect(0, 0, 512, 256);
  x.fillStyle = "#444e50";
  x.textAlign = "center";
  x.font = "600 48px Arial";
  x.fillText(id.toUpperCase(), 256, 155);
  const t = new T.CanvasTexture(c);
  t.colorSpace = T.SRGBColorSpace;
  return t;
}
function makeMaterials(id, paint) {
  return {
    paint: new T.MeshPhysicalMaterial({
      name: "multi-coat automotive paint",
      color: paint,
      metalness: id === "alphard" ? 0.52 : 0.28,
      roughness: 0.24,
      clearcoat: 1,
      clearcoatRoughness: 0.075,
      envMapIntensity: 1.1,
    }),
    glass: new T.MeshPhysicalMaterial({
      name: "laminated front glass",
      color: "#253d41",
      metalness: 0.12,
      roughness: 0.11,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      transparent: true,
      opacity: 0.87,
      depthWrite: false,
      envMapIntensity: 0.8,
      side: T.DoubleSide,
    }),
    sideGlass: new T.MeshPhysicalMaterial({
      name: "tinted side glass",
      color: "#16282e",
      metalness: 0.28,
      roughness: 0.12,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 1,
      side: T.DoubleSide,
    }),
    privacy: new T.MeshPhysicalMaterial({
      name: "rear privacy glass",
      color: "#0c151d",
      metalness: 0.25,
      roughness: 0.1,
      clearcoat: 1,
      envMapIntensity: 1,
      side: T.DoubleSide,
    }),
    black: new T.MeshStandardMaterial({ color: "#12161b", roughness: 0.8 }),
    piano: new T.MeshPhysicalMaterial({
      color: "#11151c",
      roughness: 0.19,
      clearcoat: 1,
      metalness: 0.25,
    }),
    chrome: new T.MeshStandardMaterial({
      color: "#dce2e6",
      roughness: 0.19,
      metalness: 1,
      envMapIntensity: 1.3,
    }),
    darkChrome: new T.MeshStandardMaterial({
      color: "#aab1b8",
      roughness: 0.2,
      metalness: 0.94,
      envMapIntensity: 1.5,
    }),
    rubber: new T.MeshStandardMaterial({ color: "#15171a", roughness: 0.91 }),
    seam: new T.MeshStandardMaterial({ color: "#24272a", roughness: 0.66 }),
    seat: new T.MeshStandardMaterial({
      color: id === "alphard" ? "#382d27" : "#272c31",
      roughness: 0.91,
    }),
    badge: new T.MeshPhysicalMaterial({
      color: "#17354b",
      roughness: 0.2,
      clearcoat: 1,
      metalness: 0.4,
    }),
    lens: new T.MeshPhysicalMaterial({
      color: "#bdd8e3",
      metalness: 0.32,
      roughness: 0.12,
      clearcoat: 1,
    }),
    led: new T.MeshStandardMaterial({
      color: "#e7f3ff",
      emissive: "#dbedff",
      emissiveIntensity: 1.7,
      roughness: 0.2,
    }),
    red: new T.MeshPhysicalMaterial({
      color: "#95151d",
      emissive: "#9d0914",
      emissiveIntensity: 0.55,
      roughness: 0.2,
      clearcoat: 1,
    }),
    brake: new T.MeshStandardMaterial({
      color: "#434b50",
      metalness: 0.83,
      roughness: 0.38,
    }),
  };
}
function makeWheel(p, m, id, faceSide) {
  const g = new T.Group(),
    R = p.tyre,
    W = p.tyreWidth;
  const profile = [
    [p.rim * 0.94, -W * 0.5],
    [R * 0.86, -W * 0.53],
    [R * 0.97, -W * 0.41],
    [R, -W * 0.3],
    [R, W * 0.3],
    [R * 0.97, W * 0.41],
    [R * 0.86, W * 0.53],
    [p.rim * 0.94, W * 0.5],
  ];
  const tyre = mesh(
    g,
    "rounded-tyre",
    new T.LatheGeometry(
      profile.map(([r, y]) => new T.Vector2(r, y)),
      64,
    ),
    m.rubber,
  );
  tyre.rotation.z = Math.PI / 2;
  for (const x of [-0.07, -0.025, 0.025, 0.07]) {
    if (Math.abs(x) > W * 0.4) continue;
    const o = mesh(
      g,
      "tread-groove",
      new T.TorusGeometry(R - 0.001, 0.002, 4, 64),
      m.black,
    );
    o.rotation.y = Math.PI / 2;
    o.position.x = x;
  }
  for (const s of [faceSide]) {
    const face = s * (W / 2 + 0.001);
    for (const [name, r, t, mat] of [
      ["rim-barrel", p.rim, 0.025, m.black],
      ["ventilated-disc", p.rim * 0.82, 0.012, m.brake],
    ]) {
      const o = mesh(g, name, new T.CylinderGeometry(r, r, t, 48), mat);
      o.rotation.z = Math.PI / 2;
      o.position.x = face - s * (name === "rim-barrel" ? 0.027 : 0.022);
    }
    const ring = mesh(
      g,
      "machined-rim-lip",
      new T.TorusGeometry(p.rim * 0.96, 0.009, 8, 64),
      m.chrome,
    );
    ring.rotation.y = Math.PI / 2;
    ring.position.x = face + s * 0.009;
    const n = id === "alphard" ? 20 : 10,
      spokes = new T.InstancedMesh(
        roundBox(0.018, p.rim * 0.78, id === "alphard" ? 0.021 : 0.038, 0.006),
        m.chrome,
        n,
      ),
      dummy = new T.Object3D();
    spokes.name = id === "alphard" ? "multi-spoke-alloy" : "aero-wheel-spokes";
    spokes.castShadow = true;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (k % 2 ? 0.035 : 0);
      dummy.position.set(
        face + s * 0.012,
        Math.cos(a) * p.rim * 0.52,
        Math.sin(a) * p.rim * 0.52,
      );
      dummy.rotation.set(a, 0, 0);
      dummy.updateMatrix();
      spokes.setMatrixAt(k, dummy.matrix);
    }
    g.add(spokes);
    const hub = mesh(
      g,
      "wheel-centre",
      new T.CylinderGeometry(p.rim * 0.25, p.rim * 0.25, 0.027, 24),
      m.darkChrome,
    );
    hub.rotation.z = Math.PI / 2;
    hub.position.x = face + s * 0.021;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const bolt = mesh(
        g,
        "wheel-bolt",
        new T.SphereGeometry(0.009, 8, 6),
        m.chrome,
      );
      bolt.position.set(
        face + s * 0.04,
        Math.cos(a) * p.rim * 0.17,
        Math.sin(a) * p.rim * 0.17,
      );
    }
    box(
      g,
      "brake-caliper",
      [0.025, 0.11, 0.045],
      [face - s * 0.03, 0.018, p.rim * 0.65],
      m.darkChrome,
      0.009,
    );
  }
  return g;
}
function addCabin(group, p, m, id, sideX) {
  const roof = surface(
    group,
    "painted-roof",
    24,
    12,
    (u, v) => {
      const z = lerp(p.roof[0][0], p.roof.at(-1)[0], u),
        t = v * 2 - 1;
      return [
        t * sample(p.roof, z, 2),
        sample(p.roof, z, 1) - 0.034 * t * t,
        z,
      ];
    },
    m.paint,
    [0, 1, 0],
  );
  roof.userData.exteriorShell = true;
  for (const [name, data, mat, normal] of [
    ["windshield", p.windshield, m.glass, [0, 0.5, -1]],
    ["rear-window", p.rearWindow, m.privacy, [0, 0.4, 1]],
  ]) {
    const pane = surface(
      group,
      name,
      18,
      12,
      (u, v) => {
        const a = data.bottom,
          b = data.top,
          t = u * 2 - 1;
        return [
          t * lerp(a[2], b[2], v),
          lerp(a[1], b[1], v) + 0.012 * (1 - t * t),
          lerp(a[0], b[0], v) +
            (name === "windshield" ? -0.018 : 0.015) *
              (1 - t * t) *
              Math.sin(v * Math.PI),
        ];
      },
      mat,
      normal,
    );
    pane.castShadow = false;
    pane.receiveShadow = false;
    const a = data.bottom,
      b = data.top;
    tube(
      group,
      name + "-lower-seal",
      [
        [-a[2], a[1], a[0]],
        [0, a[1] + 0.012, a[0]],
        [a[2], a[1], a[0]],
      ],
      0.014,
      m.black,
    );
    tube(
      group,
      name + "-upper-seal",
      [
        [-b[2], b[1], b[0]],
        [0, b[1] + 0.01, b[0]],
        [b[2], b[1], b[0]],
      ],
      0.012,
      m.black,
    );
  }
  for (const side of [-1, 1]) {
    const point = ([z, y], offset = 0) => [side * (sideX(z, y) + offset), y, z];
    for (const [name, data] of [
      ["front-pillar-shoulder", p.windshield],
      ["rear-pillar-shoulder", p.rearWindow],
    ]) {
      surface(
        group,
        name,
        24,
        3,
        (u, v) => {
          const a = data.bottom,
            b = data.top,
            z = lerp(a[0], b[0], u),
            y = lerp(a[1], b[1], u);
          return [
            side * lerp(lerp(a[2], b[2], u), sideX(z, y), v),
            y + 0.003 * Math.sin(v * Math.PI),
            z,
          ];
        },
        m.paint,
        [0, 1, name.startsWith("front") ? -1 : 1],
      );
    }
    surface(
      group,
      "roof-shoulder",
      24,
      3,
      (u, v) => {
        const z = lerp(p.roof[0][0], p.roof.at(-1)[0], u),
          y = sample(p.roof, z, 1);
        return [
          side * lerp(sample(p.roof, z, 2), sideX(z, y - 0.025), v),
          lerp(y - 0.034, y - 0.025, v),
          z,
        ];
      },
      m.paint,
      [0, 1, 0],
    );
    const perimeter = [
      p.windshield.bottom.slice(0, 2),
      ...p.roof.map(([z, y]) => [z, y - 0.025]),
      p.rearWindow.bottom.slice(0, 2),
      ...p.body
        .filter(
          ([z]) => z > p.windshield.bottom[0] && z < p.rearWindow.bottom[0],
        )
        .reverse()
        .map(([z, , y]) => [z, y - 0.008]),
    ];
    panel(
      group,
      "painted-cabin-side",
      perimeter.map((v) => point(v, -0.003)),
      m.paint,
      [side, 0, 0],
      p.windows.map((poly) => poly.map((v) => point(v, -0.003))),
    );
    p.windows.forEach((poly, i) => {
      const points = poly.map((v) => point(v, 0.009));
      const pane = panel(
        group,
        `side-window-${side}-${i}`,
        points,
        i === 0 ? m.sideGlass : m.privacy,
        [side, 0, 0],
      );
      pane.castShadow = false;
      pane.receiveShadow = false;
      tube(group, "window-rubber", points, 0.006, m.piano, true);
    });
    const a = p.windshield;
    tube(
      group,
      "painted-A-pillar",
      [
        [side * a.bottom[2], a.bottom[1], a.bottom[0]],
        [side * (a.top[2] + 0.015), a.top[1] - 0.015, a.top[0]],
      ],
      id === "alphard" ? 0.043 : 0.038,
      m.paint,
    );
    const front = p.windows[0],
      rear = p.windows[1];
    panel(
      group,
      "B-pillar",
      [
        point(front.at(-1), 0.006),
        point(front[2], 0.006),
        point(rear[1], 0.006),
        point(rear[0], 0.006),
      ],
      m.piano,
      [side, 0, 0],
    );
    panel(
      group,
      "C-pillar",
      [
        point(rear.at(-1), 0.005),
        point(rear.at(-2), 0.005),
        point(p.windows[2][1], 0.005),
        point(p.windows[2][0], 0.005),
      ],
      m.piano,
      [side, 0, 0],
    );
    tube(
      group,
      "roof-side-rail",
      p.roof.map(([z, y]) => point([z, y - 0.03])),
      0.022,
      m.paint,
    );
    const lower = p.windows
      .flatMap((a) => [a[0], a.at(-1)])
      .sort((a, b) => a[0] - b[0]);
    tube(
      group,
      id === "alphard" ? "chrome-window-belt" : "black-window-belt",
      lower.map((v) => point(v, 0.008)),
      id === "alphard" ? 0.008 : 0.01,
      id === "alphard" ? m.chrome : m.piano,
    );
    const d = p.rearWindow;
    tube(
      group,
      "rear-quarter-pillar",
      [
        [side * d.top[2], d.top[1], d.top[0]],
        [side * d.bottom[2], d.bottom[1], d.bottom[0]],
      ],
      id === "alphard" ? 0.052 : 0.043,
      m.paint,
    );
  }
  box(
    group,
    "interior-dash",
    [1.5, 0.13, 0.42],
    [0, id === "alphard" ? 1.12 : 0.84, id === "alphard" ? -1.3 : -0.86],
    m.black,
    0.055,
  );
  for (const side of [-1, 1])
    for (const row of [0, 1]) {
      const y = id === "alphard" ? 1.14 : 0.84,
        z =
          (id === "alphard" ? -0.35 : -0.12) +
          row * (id === "alphard" ? 0.92 : 0.83);
      box(
        group,
        "seat-back",
        [0.43, 0.49, 0.16],
        [side * 0.4, y, z],
        m.seat,
        0.065,
      );
      box(
        group,
        "head-rest",
        [0.24, 0.18, 0.13],
        [side * 0.4, y + 0.31, z],
        m.seat,
        0.055,
      );
    }
  const wheel = mesh(
    group,
    "cabin-steering-wheel",
    new T.TorusGeometry(0.17, 0.018, 8, 28),
    m.black,
  );
  wheel.position.set(
    0.41,
    id === "alphard" ? 1.19 : 0.96,
    id === "alphard" ? -0.99 : -0.65,
  );
  wheel.rotation.x = -0.3;
  for (const side of [-1, 1]) {
    const a = p.windshield.bottom,
      z = a[0] - 0.006,
      y = a[1] + 0.023;
    tube(
      group,
      "wiper-arm",
      [
        [side * 0.18, y, z],
        [side * 0.43, y + 0.03, z + 0.025],
      ],
      0.008,
      m.black,
    );
    tube(
      group,
      "wiper-blade",
      [
        [side * 0.25, y + 0.032, z + 0.015],
        [side * 0.65, y + 0.035, z + 0.03],
      ],
      0.012,
      m.black,
    );
  }
}
function fittedLamp(group, points, material, project) {
  const base = panel(
    group,
    "prius-angular-headlight",
    points,
    material,
    [0, 0, -1],
  );
  const positions = [],
    indices = base.geometry.index;
  const subdivide = (a, b, c, depth) => {
    if (!depth) {
      positions.push(...project(a), ...project(b), ...project(c));
      return;
    }
    const midpoint = (p, q) => p.map((v, i) => (v + q[i]) / 2);
    const ab = midpoint(a, b),
      bc = midpoint(b, c),
      ca = midpoint(c, a);
    subdivide(a, ab, ca, depth - 1);
    subdivide(ab, b, bc, depth - 1);
    subdivide(ca, bc, c, depth - 1);
    subdivide(ab, bc, ca, depth - 1);
  };
  for (let i = 0; i < indices.count; i += 3)
    subdivide(
      points[indices.getX(i)],
      points[indices.getX(i + 1)],
      points[indices.getX(i + 2)],
      3,
    );
  base.geometry.dispose();
  base.geometry = new T.BufferGeometry();
  base.geometry.setAttribute(
    "position",
    new T.Float32BufferAttribute(positions, 3),
  );
  base.geometry.computeVertexNormals();
  return base;
}
function fittedLine(points, project, closed = false) {
  const line = closed ? [...points, points[0]] : points,
    result = [];
  for (let i = 1; i < line.length; i++)
    for (let j = 0; j < 8; j++)
      result.push(
        project(line[i - 1].map((n, k) => lerp(n, line[i][k], j / 8))),
      );
  if (!closed) result.push(project(line.at(-1)));
  return result;
}
function addFront(group, p, m, id, front, bonnetHeight) {
  const zAt = (x) =>
      front -
      0.028 +
      0.08 * (Math.abs(x) / (id === "alphard" ? 0.84 : 0.77)) ** 4,
    map = (points) => points.map(([x, y]) => [x, y, zAt(x)]);
  if (id === "alphard") {
    const points = map([
      [-0.68, 1.045],
      [0.68, 1.045],
      [0.75, 0.91],
      [0.59, 0.29],
      [-0.59, 0.29],
      [-0.75, 0.91],
    ]);
    panel(group, "alphard-grille-recess", points, m.piano, [0, 0, -1]);
    tube(group, "grille-chrome-outline", points, 0.012, m.darkChrome, true);
    const tiles = new T.InstancedMesh(
        roundBox(0.123, 0.043, 0.026, 0.008),
        m.chrome,
        54,
      ),
      d = new T.Object3D();
    tiles.name = "alphard-grille-chrome-blocks";
    tiles.castShadow = true;
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 9; col++) {
        const y = 0.36 + row * 0.112,
          x = (col - 4) * (0.142 + row * 0.003);
        d.position.set(x, y, zAt(x) - 0.012);
        d.rotation.set(0.12, 0, -0.1);
        d.updateMatrix();
        tiles.setMatrixAt(row * 9 + col, d.matrix);
      }
    group.add(tiles);
    for (let row = 0; row < 7; row++)
      tube(
        group,
        "grille-shadow-slat",
        [
          [-0.59 - row * 0.014, 0.31 + row * 0.11, zAt(0.5) + 0.001],
          [0, 0.31 + row * 0.11, front - 0.02],
          [0.59 + row * 0.014, 0.31 + row * 0.11, zAt(0.5) + 0.001],
        ],
        0.009,
        m.black,
      );
    for (const side of [-1, 1]) {
      const lamp = [
        [side * 0.38, 1.075, front - 0.035],
        [side * 0.78, 1.09, front - 0.03],
        [side * 0.91, 1.07, front + 0.19],
        [side * 0.91, 0.985, front + 0.18],
        [side * 0.78, 0.965, front - 0.035],
        [side * 0.43, 0.96, front - 0.035],
      ];
      panel(group, "alphard-three-eye-headlight", lamp, m.piano, [0, 0, -1]);
      tube(group, "headlamp-surround", lamp, 0.009, m.chrome, true);
      for (let i = 0; i < 3; i++)
        box(
          group,
          "LED-projector",
          [0.072, 0.043, 0.038],
          [side * (0.55 + i * 0.095), 1.024, front - 0.058],
          m.lens,
          0.015,
        );
      tube(
        group,
        "daytime-running-light",
        [
          [side * 0.43, 0.975, front - 0.055],
          [side * 0.78, 0.975, front - 0.055],
          [side * 0.9, 1.005, front + 0.14],
        ],
        0.009,
        m.led,
      );
      const fog = [
        [side * 0.75, 0.73, zAt(0.75)],
        [side * 0.83, 0.65, zAt(0.83)],
        [side * 0.8, 0.28, zAt(0.8)],
        [side * 0.72, 0.34, zAt(0.72)],
      ];
      panel(group, "vertical-fog-recess", fog, m.piano, [0, 0, -1]);
      tube(
        group,
        "fog-chrome-blade",
        [fog[0], fog[1], fog[2]],
        0.012,
        m.chrome,
      );
      box(
        group,
        "fog-projector",
        [0.048, 0.034, 0.025],
        [side * 0.78, 0.52, zAt(0.78) - 0.017],
        m.led,
        0.012,
      );
    }
    emblem(group, 0, 0.99, front - 0.047, m);
  } else {
    panel(
      group,
      "prius-upper-intake",
      map([
        [-0.66, 0.645],
        [0.66, 0.645],
        [0.54, 0.57],
        [-0.54, 0.57],
      ]),
      m.piano,
      [0, 0, -1],
    );
    panel(
      group,
      "prius-lower-intake",
      map([
        [-0.58, 0.42],
        [0.58, 0.42],
        [0.72, 0.25],
        [-0.72, 0.25],
      ]),
      m.black,
      [0, 0, -1],
    );
    for (let i = 0; i < 5; i++)
      tube(
        group,
        "intake-horizontal-slat",
        [
          [-0.6, 0.27 + i * 0.027, front + 0.004],
          [0, 0.27 + i * 0.027, front - 0.02],
          [0.6, 0.27 + i * 0.027, front + 0.004],
        ],
        0.007,
        m.piano,
      );
    for (const side of [-1, 1]) {
      const lamp = [
        [side * 0.31, 0.68, front - 0.035],
        [side * 0.5, 0.75, front + 0.14],
        [side * 0.865, 0.87, front + 0.62],
        [side * 0.875, 0.735, front + 0.4],
        [side * 0.7, 0.6, front - 0.03],
      ];
      // The swept lamps conform to the curved bonnet instead of intersecting it.
      const fit = ([x, y, z]) => [
        x,
        z >= front && Math.abs(x) <= sample(p.body, z, 1) + 0.004
          ? Math.max(y, bonnetHeight(x, z) + 0.008)
          : y,
        z,
      ];
      fittedLamp(group, lamp, m.piano, fit);
      tube(
        group,
        "headlamp-chrome-outline",
        fittedLine(lamp, fit, true),
        0.006,
        m.chrome,
        true,
      );
      const lens = mesh(
        group,
        "bi-beam-projector",
        new T.SphereGeometry(0.048, 20, 12),
        m.lens,
      );
      lens.scale.z = 0.4;
      lens.position.set(side * 0.6, 0.727, front + 0.065);
      ellipse(
        group,
        "projector-ring",
        side * 0.6,
        0.727,
        front + 0.044,
        0.045,
        0.041,
        0.006,
        m.chrome,
      );
      tube(
        group,
        "prius-LED-signature",
        [
          [side * 0.33, 0.689, front - 0.046],
          [side * 0.5, 0.757, front + 0.13],
          [side * 0.866, 0.871, front + 0.61],
        ],
        0.008,
        m.led,
      );
      const fog = map([
        [side * 0.69, 0.53],
        [side * 0.75, 0.49],
        [side * 0.73, 0.3],
        [side * 0.66, 0.36],
      ]);
      panel(group, "prius-fog-inset", fog, m.piano, [0, 0, -1]);
      tube(group, "prius-fog-trim", fog, 0.007, m.chrome, true);
      box(
        group,
        "prius-fog-lens",
        [0.05, 0.035, 0.025],
        [side * 0.71, 0.43, zAt(0.71) - 0.018],
        m.lens,
        0.01,
      );
    }
    emblem(group, 0, 0.64, front - 0.044, m);
  }
}
function addRear(group, p, m, id, rear) {
  if (id === "alphard") {
    panel(
      group,
      "rear-black-garnish",
      [
        [-0.81, 1.29, rear + 0.026],
        [0.81, 1.29, rear + 0.026],
        [0.72, 1.03, rear + 0.026],
        [-0.72, 1.03, rear + 0.026],
      ],
      m.piano,
      [0, 0, 1],
    );
    for (const s of [-1, 1]) {
      const points = [
        [s * 0.33, 1.255, rear + 0.02],
        [s * 0.81, 1.29, rear - 0.01],
        [s * 0.89, 1.22, rear - 0.14],
        [s * 0.83, 1.065, rear - 0.09],
        [s * 0.43, 1.095, rear + 0.02],
      ];
      panel(group, "alphard-rear-lamp", points, m.red, [0, 0, 1]);
      for (let j = 0; j < 3; j++)
        tube(
          group,
          "rear-LED-bars",
          [
            [s * 0.43, 1.12 + j * 0.045, rear + 0.031],
            [s * 0.73, 1.15 + j * 0.043, rear + 0.027],
            [s * 0.84, 1.19 + j * 0.025, rear - 0.08],
          ],
          0.009,
          m.red,
        );
      tube(
        group,
        "lower-bumper-reflector",
        [
          [s * 0.79, 0.32, rear - 0.01],
          [s * 0.83, 0.56, rear - 0.02],
        ],
        0.018,
        m.red,
      );
    }
    emblem(group, 0, 1.255, rear + 0.027, m, true);
    box(
      group,
      "roof-spoiler",
      [1.56, 0.055, 0.3],
      [0, 1.895, rear - 0.17],
      m.paint,
      0.025,
    );
    box(
      group,
      "high-mounted-stop-light",
      [0.38, 0.025, 0.025],
      [0, 1.87, rear - 0.001],
      m.red,
      0.008,
    );
  } else {
    panel(
      group,
      "prius-lower-hatch-glass",
      [
        [-0.72, 1.12, rear + 0.031],
        [0.72, 1.12, rear + 0.031],
        [0.67, 0.94, rear + 0.031],
        [-0.67, 0.94, rear + 0.031],
      ],
      m.privacy,
      [0, 0, 1],
    );
    box(
      group,
      "prius-rear-spoiler",
      [1.48, 0.038, 0.19],
      [0, 1.14, rear - 0.07],
      m.paint,
      0.018,
    );
    for (const s of [-1, 1]) {
      const outline = [
        [s * 0.62, 1.14, rear - 0.075],
        [s * 0.82, 1.15, rear - 0.05],
        [s * 0.85, 0.86, rear - 0.035],
        [s * 0.74, 0.43, rear - 0.025],
        [s * 0.73, 0.56, rear + 0.01],
        [s * 0.78, 0.89, rear + 0.024],
      ];
      panel(group, "prius-vertical-tail-lamp", outline, m.red, [0, 0, 1]);
      tube(
        group,
        "prius-red-light-guide",
        [
          [s * 0.64, 1.14, rear - 0.055],
          [s * 0.81, 1.12, rear - 0.032],
          [s * 0.83, 0.87, rear - 0.012],
          [s * 0.75, 0.48, rear - 0.005],
        ],
        0.012,
        m.red,
      );
      tube(
        group,
        "prius-clear-tail-strip",
        [
          [s * 0.78, 1.06, rear - 0.013],
          [s * 0.81, 0.9, rear + 0.013],
        ],
        0.011,
        m.lens,
      );
    }
    emblem(group, 0, 0.89, rear + 0.024, m, true);
    box(
      group,
      "high-mounted-stop-light",
      [0.35, 0.018, 0.025],
      [0, 1.133, rear + 0.01],
      m.red,
      0.007,
    );
  }
  const y = id === "alphard" ? 0.94 : 0.68;
  tube(
    group,
    "tailgate-panel-gap",
    [
      [-0.68, y + 0.1, rear - 0.005],
      [-0.64, 0.44, rear + 0.006],
      [0, 0.41, rear + 0.012],
      [0.64, 0.44, rear + 0.006],
      [0.68, y + 0.1, rear - 0.005],
    ],
    0.003,
    m.seam,
  );
  box(
    group,
    "tailgate-handle",
    [0.3, 0.025, 0.018],
    [0, y + 0.13, rear + 0.026],
    m.piano,
    0.007,
  );
  const rw = p.rearWindow.bottom;
  tube(
    group,
    "rear-wiper",
    [
      [0.02, rw[1] + 0.025, rw[0] + 0.012],
      [0.43, rw[1] + 0.035, rw[0] + 0.006],
    ],
    0.009,
    m.black,
  );
  box(
    group,
    "rear-lower-valance",
    [1.35, 0.1, 0.055],
    [0, 0.235, rear - 0.018],
    m.piano,
    0.025,
  );
}
// Each car owns these resources; the environment belongs to its scene.
export function disposeCarModel(car) {
  if (!car) return;
  const resources = new Set();
  car.traverse((o) => {
    if (o.geometry) resources.add(o.geometry);
    if (o.isInstancedMesh) resources.add(o);
    for (const material of [o.material].flat().filter(Boolean)) {
      resources.add(material);
      if (material.map) resources.add(material.map);
    }
  });
  for (const resource of resources) resource.dispose();
}

export function makeCarModel(id = "prius", paint) {
  const car = VEHICLES.find((v) => v.id === id) || VEHICLES[0];
  id = car.id;
  const p = PROFILES[id],
    m = makeMaterials(id, paint || p.paint),
    group = new T.Group(),
    half = car.length / 2,
    axles = [-car.wheelbase / 2, car.wheelbase / 2];
  group.name = `${id}-exterior`;
  group.userData.body = m.paint;
  group.userData.mirrors = [];
  group.userData.wheels = [];
  const belt = (z) => sample(p.body, z, 2),
    halfWidth = (z) => Math.min(car.width / 2, sample(p.body, z, 1)),
    sill = 0.2;
  // The front/rear corners share one mapping across deck, sides and caps.
  // This rounds the bumper in plan without leaving disconnected corner seams.
  const roundEnd = (z, lateral = 1) =>
    z +
    (z < 0 ? 0.08 : -0.1) * (Math.abs(z) / half) ** 12 * Math.abs(lateral) ** 4;
  const archBottom = (z) => {
    let h = sill;
    for (const a of axles) {
      const dz = z - a,
        r = p.tyre + 0.047;
      if (Math.abs(dz) < r)
        h = Math.max(h, p.tyre + Math.sqrt(r * r - dz * dz));
    }
    return h;
  };
  const sideX = (z, y) => {
    const b = belt(z),
      h = halfWidth(z);
    if (y > b)
      return (
        h -
        0.014 -
        clamp((y - b) / (id === "alphard" ? 0.68 : 0.49), 0, 1) *
          (id === "alphard" ? 0.105 : 0.195)
      );
    const t = clamp((y - sill) / (b - sill), 0, 1);
    return Math.min(
      h,
      h -
        0.075 * (1 - t) -
        0.045 * Math.sin(t * Math.PI) +
        0.014 * Math.exp(-(((t - 0.85) / 0.12) ** 2)),
    );
  };
  for (const side of [-1, 1]) {
    const o = surface(
      group,
      "body-side-" + side,
      150,
      16,
      (u, v) => {
        const z = lerp(-half, half, u),
          y = lerp(archBottom(z), belt(z), v);
        return [side * sideX(z, y), y, roundEnd(z)];
      },
      m.paint,
      [side, 0, 0],
    );
    o.userData.exteriorShell = true;
    for (const axle of axles) {
      const r = p.tyre + 0.047,
        pts = Array.from({ length: 33 }, (_, i) => {
          const a = lerp(-0.35, Math.PI + 0.35, i / 32),
            z = axle + Math.cos(a) * r,
            y = p.tyre + Math.sin(a) * r;
          return [side * (sideX(z, y) + 0.005), y, z];
        });
      tube(group, "sculpted-wheel-arch", pts, 0.014, m.paint);
      tube(
        group,
        "wheel-arch-inner-liner",
        pts.map((v) => [v[0] - side * 0.018, v[1] - 0.012, v[2]]),
        0.018,
        m.black,
      );
    }
    tube(
      group,
      "rocker-chrome",
      [
        [side * 0.84, 0.23, -0.96],
        [side * 0.86, 0.23, 0.2],
        [side * 0.84, 0.26, 0.99],
      ],
      id === "alphard" ? 0.012 : 0.006,
      id === "alphard" ? m.chrome : m.piano,
    );
    const doors =
      id === "alphard"
        ? [
            [-1.48, 0.06],
            [0.1, 1.42],
          ]
        : [
            [-1.0, 0.28],
            [0.3, 1.35],
          ];
    for (const [a, b] of doors) {
      const corners = [
          [a, belt(a) - 0.01],
          [a + 0.04, 0.35],
          [a + 0.15, 0.27],
          [b - 0.08, 0.27],
          [b, 0.35],
          [b, belt(b) - 0.012],
        ],
        pts = [];
      for (let j = 1; j < corners.length; j++)
        for (let k = 0; k <= 8; k++) {
          const z = lerp(corners[j - 1][0], corners[j][0], k / 8),
            y = lerp(corners[j - 1][1], corners[j][1], k / 8);
          pts.push([side * (sideX(z, y) + 0.001), y, z]);
        }
      tube(group, "door-panel-gap", pts, 0.0016, m.seam);
      const z = b - 0.18,
        y = belt(z) - 0.1,
        x = side * (sideX(z, y) + 0.01);
      box(
        group,
        "door-handle-pocket",
        [0.012, 0.043, 0.17],
        [x, y, z],
        m.piano,
        0.012,
      );
      box(
        group,
        "door-handle",
        [0.024, 0.022, 0.14],
        [x + side * 0.014, y + 0.007, z],
        id === "alphard" ? m.chrome : m.paint,
        0.01,
      );
    }
    if (id === "alphard")
      tube(
        group,
        "sliding-door-track",
        [
          [side * 0.929, 1.2, 1.45],
          [side * 0.923, 1.21, 2.15],
        ],
        0.008,
        m.piano,
      );
    const fz = 1.54,
      fy = belt(fz) - 0.13;
    if (side === -1)
      tube(
        group,
        "fuel-door",
        [
          [side * (sideX(fz, fy) + 0.004), fy + 0.08, fz - 0.1],
          [side * (sideX(fz, fy) + 0.004), fy + 0.08, fz + 0.1],
          [side * (sideX(fz, fy) + 0.004), fy - 0.08, fz + 0.1],
          [side * (sideX(fz, fy) + 0.004), fy - 0.08, fz - 0.1],
        ],
        0.0025,
        m.seam,
        true,
      );
  }
  const deck = surface(
    group,
    "body-deck",
    120,
    24,
    (u, v) => {
      const z = lerp(-half, half, u),
        t = v * 2 - 1;
      return [
        t * sideX(z, belt(z)),
        belt(z) + 0.045 * (1 - t * t),
        roundEnd(z, t),
      ];
    },
    m.paint,
    [0, 1, 0],
  );
  deck.userData.exteriorShell = true;
  for (const [end, normal] of [
    [-half, -1],
    [half, 1],
  ]) {
    const o = surface(
      group,
      normal < 0 ? "front-bumper" : "rear-bumper",
      24,
      16,
      (u, v) => {
        const t = u * 2 - 1,
          y = lerp(sill, belt(end) + 0.045 * (1 - t * t), v);
        return [t * sideX(end, Math.min(y, belt(end))), y, roundEnd(end, t)];
      },
      m.paint,
      [0, 0, normal],
    );
    o.userData.exteriorShell = true;
  }
  box(
    group,
    "underbody",
    [1.48, 0.035, car.length - 0.25],
    [0, 0.2, 0],
    m.black,
    0.01,
  );
  const hoodZ = p.windshield.bottom[0];
  for (const side of [-1, 1]) {
    const pts = Array.from({ length: 28 }, (_, i) => {
      const t = i / 27,
        z = lerp(-half + 0.08, hoodZ, t),
        x = side * lerp(0.34, 0.72, t),
        w = halfWidth(z);
      return [
        x,
        belt(z) + 0.045 * (1 - (x / w) ** 2) + 0.002,
        roundEnd(z, x / w),
      ];
    });
    tube(group, "hood-shut-line", pts, 0.0018, m.seam);
  }
  addCabin(group, p, m, id, sideX);
  addFront(
    group,
    p,
    m,
    id,
    -half,
    (x, z) => belt(z) + 0.045 * (1 - (x / halfWidth(z)) ** 2),
  );
  addRear(group, p, m, id, half);
  for (const axle of axles)
    for (const side of [-1, 1]) {
      const w = makeWheel(p, m, id, side);
      w.name = `wheel-${axle < 0 ? "front" : "rear"}-${side}`;
      w.position.set(
        side * (car.width / 2 - p.tyreWidth / 2 - 0.014),
        p.tyre,
        axle,
      );
      group.add(w);
      group.userData.wheels.push(w);
    }
  for (const side of [-1, 1]) {
    const mirror = new T.Group(),
      z = p.windshield.bottom[0] + 0.12,
      y = belt(z) + 0.09;
    mirror.position.set(side * (car.width / 2 + 0.085), y, z);
    mirror.name = "door-mirror-" + side;
    box(
      mirror,
      "mirror-stalk",
      [0.15, 0.05, 0.08],
      [-side * 0.1, -0.035, 0.035],
      m.piano,
      0.02,
    );
    box(
      mirror,
      "mirror-lower-housing",
      [0.23, 0.1, 0.17],
      [0, -0.012, 0],
      m.piano,
      0.045,
    );
    box(
      mirror,
      "painted-mirror-cap",
      [0.24, 0.095, 0.18],
      [0, 0.029, -0.018],
      m.paint,
      0.045,
    );
    box(
      mirror,
      "mirror-glass",
      [0.192, 0.073, 0.012],
      [0, 0.015, 0.085],
      m.chrome,
      0.022,
    );
    box(
      mirror,
      "mirror-indicator",
      [0.17, 0.01, 0.014],
      [side * 0.013, 0.001, -0.106],
      m.lens,
      0.005,
    );
    group.add(mirror);
    group.userData.mirrors.push(mirror);
  }
  const plateMat = new T.MeshStandardMaterial({
    color: "#e4e8e2",
    roughness: 0.43,
    map: plateTexture(id),
  });
  for (const [z, y, rear] of [
    [-half - 0.04, id === "alphard" ? 0.54 : 0.46, false],
    [half + 0.042, id === "alphard" ? 0.93 : 0.68, true],
  ]) {
    box(
      group,
      "registration-plate-frame",
      [0.35, 0.182, 0.024],
      [0, y, z],
      m.piano,
      0.009,
    );
    const plate = mesh(
      group,
      "display-plate",
      new T.PlaneGeometry(0.33, 0.165),
      plateMat,
    );
    plate.position.set(0, y, z + (rear ? 0.014 : -0.014));
    if (!rear) plate.rotation.y = Math.PI;
  }
  const fin = box(
    group,
    "shark-fin-aerial",
    [0.055, 0.075, 0.15],
    [
      0,
      sample(p.roof, p.roof.at(-1)[0] - 0.15, 1) + 0.02,
      p.roof.at(-1)[0] - 0.15,
    ],
    m.paint,
    0.025,
  );
  fin.rotation.x = -0.12;
  return group;
}
