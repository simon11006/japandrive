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
function roundBox(w, h, d, r = 0.015, segments = 3) {
  r = Math.min(r, w / 2, h / 2, d / 2);
  const g = new T.BoxGeometry(w, h, d, segments, segments, segments),
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
    new T.TubeGeometry(
      curve,
      Math.max(16, points.length, Math.ceil(curve.getLength() / 0.035)),
      r,
      6,
      closed,
    ),
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
      metalness: 0.08,
      roughness: 0.17,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
      envMapIntensity: 0.65,
      side: T.DoubleSide,
    }),
    privacy: new T.MeshPhysicalMaterial({
      name: "rear privacy glass",
      color: "#0c151d",
      metalness: 0.25,
      roughness: 0.1,
      clearcoat: 1,
      envMapIntensity: 0.65,
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
      new T.TorusGeometry(R - 0.001, 0.002, 3, 48),
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
// Tessellated surface patches keep glass, bezels and fascia on the body curve.
// Analytic surface normals avoid the faceted reflections of a triangulated pane.
function mappedPanel(
  parent,
  name,
  outline,
  material,
  map,
  outward,
  holes = [],
  depth = 2,
) {
  const all = [...outline, ...holes.flat()],
    positions = [],
    normals = [];
  const triangles = T.ShapeUtils.triangulateShape(
    outline.map((p) => new T.Vector2(...p)),
    holes.map((h) => h.map((p) => new T.Vector2(...p))),
  );
  const emit = (p) => {
    const a = V(map(...p)),
      du = V(map(p[0] + 0.0001, p[1])).sub(a),
      dv = V(map(p[0], p[1] + 0.0001)).sub(a),
      n = du.cross(dv).normalize();
    if (n.dot(V(outward)) < 0) n.negate();
    positions.push(...a.toArray());
    normals.push(...n.toArray());
  };
  const split = (a, b, c, d) => {
    if (d) {
      const mid = (p, q) => p.map((v, i) => (v + q[i]) / 2),
        ab = mid(a, b),
        bc = mid(b, c),
        ca = mid(c, a);
      split(a, ab, ca, d - 1);
      split(ab, b, bc, d - 1);
      split(ca, bc, c, d - 1);
      split(ab, bc, ca, d - 1);
      return;
    }
    const n = V(map(...b))
      .sub(V(map(...a)))
      .cross(V(map(...c)).sub(V(map(...a))));
    for (const p of n.dot(V(outward)) >= 0 ? [a, b, c] : [a, c, b]) emit(p);
  };
  for (const [a, b, c] of triangles) split(all[a], all[b], all[c], depth);
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("normal", new T.Float32BufferAttribute(normals, 3));
  return mesh(parent, name, g, material);
}
function roundedOutline(points, radius = 0.035) {
  const result = [];
  points.forEach((b, i) => {
    const a = points[(i + points.length - 1) % points.length],
      c = points[(i + 1) % points.length],
      distance = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
    const inT = Math.min(0.22, radius / distance(a, b)),
      outT = Math.min(0.22, radius / distance(c, b));
    const start = b.map((v, k) => lerp(v, a[k], inT)),
      end = b.map((v, k) => lerp(v, c[k], outT));
    for (let j = 0; j <= 4; j++) {
      const t = j / 4;
      result.push(
        b.map(
          (v, k) =>
            (1 - t) ** 2 * start[k] + 2 * t * (1 - t) * v + t * t * end[k],
        ),
      );
    }
  });
  return result;
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
    const windows = p.windows.map((poly) =>
      roundedOutline(poly, id === "alphard" ? 0.045 : 0.028),
    );
    mappedPanel(
      group,
      "painted-cabin-side",
      perimeter,
      m.paint,
      (z, y) => point([z, y], -0.003),
      [side, 0, 0],
      windows,
      2,
    );
    windows.forEach((poly, i) => {
      const pane = mappedPanel(
        group,
        `side-window-${side}-${i}`,
        poly,
        i === 0 ? m.sideGlass : m.privacy,
        (z, y) => point([z, y], 0.004),
        [side, 0, 0],
      );
      pane.castShadow = false;
      pane.receiveShadow = false;
      tube(
        group,
        "window-rubber",
        poly.map((v) => point(v, 0.006)),
        0.004,
        m.piano,
        true,
      );
    });
    // The pillars are part of the painted curved shell. Thin seals follow the
    // glass edge; cylindrical painted bars made the roof look like a roll cage.
    const a = p.windshield;
    tube(
      group,
      "windscreen-edge-seal",
      Array.from({ length: 18 }, (_, i) => {
        const t = i / 17;
        return [
          side * lerp(a.bottom[2], a.top[2], t),
          lerp(a.bottom[1], a.top[1], t),
          lerp(a.bottom[0], a.top[0], t),
        ];
      }),
      0.005,
      m.black,
    );
    const front = p.windows[0],
      rear = p.windows[1];
    mappedPanel(
      group,
      "B-pillar",
      [front.at(-1), front[2], rear[1], rear[0]],
      m.piano,
      (z, y) => point([z, y], 0.005),
      [side, 0, 0],
    );
    mappedPanel(
      group,
      "C-pillar",
      [rear.at(-1), rear.at(-2), p.windows[2][1], p.windows[2][0]],
      m.piano,
      (z, y) => point([z, y], 0.005),
      [side, 0, 0],
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
      "rear-glass-edge-seal",
      Array.from({ length: 18 }, (_, i) => {
        const t = i / 17;
        return [
          side * lerp(d.bottom[2], d.top[2], t),
          lerp(d.bottom[1], d.top[1], t),
          lerp(d.bottom[0], d.top[0], t),
        ];
      }),
      0.005,
      m.black,
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
function fittedLine(points, project, closed = false) {
  const line = closed ? [...points, points[0]] : points,
    result = [];
  for (let i = 1; i < line.length; i++)
    for (let j = 0; j < 3; j++)
      result.push(
        project(line[i - 1].map((n, k) => lerp(n, line[i][k], j / 3))),
      );
  if (!closed) result.push(project(line.at(-1)));
  return result;
}
function addFront(group, m, id, noseZ) {
  const zAt = (x, y) => noseZ(x, y),
    map = (x, y) => [x, y, zAt(x, y)];
  const patch = (name, outline, mat, offset = 0) =>
    mappedPanel(
      group,
      name,
      roundedOutline(outline, 0.016),
      mat,
      (x, y) => [x, y, zAt(x, y) - offset],
      [0, 0, -1],
      [],
      name.includes("grille-recess") ||
        name.includes("intake") ||
        name === "prius-angular-headlight"
        ? 3
        : 2,
    );
  const line = (name, points, r, mat, closed = false) => {
    const outline = closed ? roundedOutline(points, 0.016) : points;
    tube(
      group,
      name,
      fittedLine(
        outline.map(([x, y]) => [x, y, 0]),
        ([x, y]) => [x, y, zAt(x, y) - 0.006],
        closed,
      ),
      r,
      mat,
      closed,
    );
  };
  if (id === "alphard") {
    const grille = [
      [-0.68, 1.035],
      [0.68, 1.035],
      [0.75, 0.91],
      [0.59, 0.29],
      [-0.59, 0.29],
      [-0.75, 0.91],
    ];
    patch("alphard-grille-recess", grille, m.piano);
    line("grille-chrome-outline", grille, 0.007, m.darkChrome, true);
    const tiles = new T.InstancedMesh(
        roundBox(0.123, 0.032, 0.014, 0.006, 2),
        m.chrome,
        54,
      ),
      d = new T.Object3D();
    tiles.name = "alphard-grille-chrome-blocks";
    tiles.castShadow = false;
    for (let row = 0; row < 6; row++)
      for (let col = 0; col < 9; col++) {
        const y = 0.36 + row * 0.112,
          x = (col - 4) * (0.142 + row * 0.003),
          slope = (zAt(x + 0.001, y) - zAt(x - 0.001, y)) / 0.002;
        d.position.set(x, y, zAt(x, y) - 0.008);
        d.rotation.set(0.14, -Math.atan(slope), -0.12);
        d.updateMatrix();
        tiles.setMatrixAt(row * 9 + col, d.matrix);
      }
    group.add(tiles);
    for (const side of [-1, 1]) {
      const lamp = [
        [0.4, 1.075],
        [0.76, 1.1],
        [0.87, 1.09],
        [0.86, 1.015],
        [0.77, 0.994],
        [0.43, 0.996],
      ].map(([x, y]) => [side * x, y]);
      patch("alphard-three-eye-headlight", lamp, m.piano, 0.003);
      line("headlamp-surround", lamp, 0.004, m.darkChrome, true);
      for (let i = 0; i < 3; i++) {
        const x = 0.51 + i * 0.105,
          y = 1.044 + i * 0.004;
        patch(
          "LED-projector",
          [
            [x - 0.035, y - 0.019],
            [x + 0.035, y - 0.019],
            [x + 0.035, y + 0.019],
            [x - 0.035, y + 0.019],
          ].map(([x, y]) => [side * x, y]),
          m.lens,
          0.006,
        );
      }
      line(
        "daytime-running-light",
        [
          [side * 0.44, 1.004],
          [side * 0.77, 1.002],
          [side * 0.855, 1.029],
        ],
        0.005,
        m.led,
      );
      const fog = [
        [0.76, 0.72],
        [0.84, 0.64],
        [0.8, 0.3],
        [0.73, 0.35],
      ].map(([x, y]) => [side * x, y]);
      patch("vertical-fog-recess", fog, m.piano);
      line("fog-chrome-blade", fog.slice(0, 3), 0.007, m.chrome);
      patch(
        "fog-projector",
        [
          [0.755, 0.51],
          [0.793, 0.51],
          [0.793, 0.535],
          [0.755, 0.535],
        ].map(([x, y]) => [side * x, y]),
        m.lens,
        0.006,
      );
    }
    emblem(group, 0, 0.985, zAt(0, 0.985) - 0.015, m);
  } else {
    patch(
      "prius-upper-intake",
      [
        [-0.61, 0.645],
        [0.61, 0.645],
        [0.54, 0.59],
        [-0.54, 0.59],
      ],
      m.piano,
    );
    patch(
      "prius-lower-intake",
      [
        [-0.55, 0.42],
        [0.55, 0.42],
        [0.65, 0.27],
        [-0.65, 0.27],
      ],
      m.black,
    );
    for (let i = 0; i < 5; i++)
      line(
        "intake-horizontal-slat",
        [
          [-0.57, 0.285 + i * 0.024],
          [0, 0.285 + i * 0.024],
          [0.57, 0.285 + i * 0.024],
        ],
        0.005,
        m.piano,
      );
    for (const side of [-1, 1]) {
      // The upper blade sweeps back into the fender; the short outer hook
      // follows the bumper. The actual lens is much smaller than a hood panel.
      const lamp = [
        [0.32, 0.675],
        [0.52, 0.737],
        [0.845, 0.875],
        [0.838, 0.802],
        [0.766, 0.692],
        [0.703, 0.622],
        [0.677, 0.68],
      ].map(([x, y]) => [side * x, y]);
      patch("prius-angular-headlight", lamp, m.lens, 0.003);
      line("headlamp-chrome-outline", lamp, 0.004, m.chrome, true);
      const projector = [
        [0.52, 0.712],
        [0.59, 0.734],
        [0.636, 0.732],
        [0.632, 0.701],
        [0.559, 0.691],
      ].map(([x, y]) => [side * x, y]);
      patch("bi-beam-projector", projector, m.piano, 0.008);
      line(
        "prius-LED-signature",
        [
          [side * 0.34, 0.68],
          [side * 0.52, 0.743],
          [side * 0.837, 0.866],
        ],
        0.004,
        m.led,
      );
      line(
        "prius-headlamp-hook",
        [
          [side * 0.833, 0.8],
          [side * 0.76, 0.69],
          [side * 0.707, 0.634],
        ],
        0.004,
        m.chrome,
      );
      const fog = [
        [0.69, 0.52],
        [0.75, 0.49],
        [0.73, 0.31],
        [0.67, 0.36],
      ].map(([x, y]) => [side * x, y]);
      patch("prius-fog-inset", fog, m.piano);
      line("prius-fog-trim", fog, 0.005, m.chrome, true);
      patch(
        "prius-fog-lens",
        [
          [0.69, 0.42],
          [0.726, 0.42],
          [0.726, 0.447],
          [0.69, 0.447],
        ].map(([x, y]) => [side * x, y]),
        m.lens,
        0.006,
      );
    }
    emblem(group, 0, 0.635, zAt(0, 0.635) - 0.013, m);
  }
}
function addRear(group, p, m, id, rear, rearZ) {
  const patch = (name, points, mat, offset = 0.003) =>
    mappedPanel(
      group,
      name,
      roundedOutline(points, 0.015),
      mat,
      (x, y) => [x, y, rearZ(x, y) + offset],
      [0, 0, 1],
      [],
      name.includes("lamp") ? 2 : 3,
    );
  const line = (name, points, r, mat) =>
    tube(
      group,
      name,
      fittedLine(
        points.map(([x, y]) => [x, y, 0]),
        ([x, y]) => [x, y, rearZ(x, y) + 0.008],
      ),
      r,
      mat,
    );
  if (id === "alphard") {
    patch(
      "rear-black-garnish",
      [
        [-0.78, 1.28],
        [0.78, 1.28],
        [0.71, 1.045],
        [-0.71, 1.045],
      ],
      m.piano,
    );
    for (const side of [-1, 1]) {
      const lamp = [
        [0.33, 1.255],
        [0.75, 1.28],
        [0.85, 1.2],
        [0.81, 1.075],
        [0.43, 1.095],
      ].map(([x, y]) => [side * x, y]);
      patch("alphard-rear-lamp", lamp, m.red, 0.006);
      for (let j = 0; j < 3; j++)
        line(
          "rear-LED-bars",
          [
            [side * 0.43, 1.12 + j * 0.043],
            [side * 0.73, 1.15 + j * 0.037],
            [side * 0.83, 1.185 + j * 0.014],
          ],
          0.006,
          m.red,
        );
      line(
        "lower-bumper-reflector",
        [
          [side * 0.77, 0.34],
          [side * 0.8, 0.53],
        ],
        0.013,
        m.red,
      );
    }
    emblem(group, 0, 1.25, rearZ(0, 1.25) + 0.014, m, true);
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
    patch(
      "prius-lower-hatch-glass",
      [
        [-0.69, 1.12],
        [0.69, 1.12],
        [0.65, 0.94],
        [-0.65, 0.94],
      ],
      m.privacy,
    );
    box(
      group,
      "prius-rear-spoiler",
      [1.45, 0.038, 0.19],
      [0, 1.14, rear - 0.07],
      m.paint,
      0.018,
    );
    for (const side of [-1, 1]) {
      patch(
        "prius-vertical-tail-lamp",
        [
          [0.62, 1.1],
          [0.8, 1.085],
          [0.83, 0.85],
          [0.74, 0.43],
          [0.72, 0.55],
          [0.77, 0.89],
        ].map(([x, y]) => [side * x, y]),
        m.red,
      );
      line(
        "prius-red-light-guide",
        [
          [side * 0.64, 1.095],
          [side * 0.79, 1.065],
          [side * 0.81, 0.85],
          [side * 0.745, 0.47],
        ],
        0.009,
        m.red,
      );
      line(
        "prius-clear-tail-strip",
        [
          [side * 0.79, 1.01],
          [side * 0.8, 0.9],
        ],
        0.008,
        m.lens,
      );
    }
    emblem(group, 0, 0.89, rearZ(0, 0.89) + 0.014, m, true);
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
  line(
    "tailgate-panel-gap",
    [
      [-0.65, y + 0.1],
      [-0.62, 0.44],
      [0, 0.41],
      [0.62, 0.44],
      [0.65, y + 0.1],
    ],
    0.002,
    m.seam,
  );
  box(
    group,
    "tailgate-handle",
    [0.3, 0.025, 0.018],
    [0, y + 0.13, rearZ(0, y + 0.13) + 0.008],
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
    0.006,
    m.black,
  );
  patch(
    "rear-lower-valance",
    [
      [-0.64, 0.28],
      [0.64, 0.28],
      [0.64, 0.21],
      [-0.64, 0.21],
    ],
    m.piano,
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
  const roundEnd = (z, lateral = 1, y = belt(z)) => {
    const radius = z < 0 ? 0.24 : 0.19,
      vertical =
        0.055 * (2 * clamp((y - sill) / (belt(z) - sill), 0, 1) - 1) ** 2;
    return (
      z +
      Math.sign(-z) *
        (radius * Math.abs(lateral) ** 3.2 + vertical) *
        (Math.abs(z) / half) ** 12
    );
  };
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
    const shoulder = 0.1,
      roofHeight = sample(p.roof, z, 1),
      roofWidth = sample(p.roof, z, 2);
    if (y > b) {
      const t = clamp((y - b) / (roofHeight - b - 0.025), 0, 1);
      return lerp(h - shoulder, roofWidth, t) + 0.014 * Math.sin(t * Math.PI);
    }
    if (y > b - 0.14) {
      const t = clamp((y - b + 0.14) / 0.14, 0, 1);
      return h - shoulder * (1 - Math.sqrt(Math.max(0, 1 - t * t)));
    }
    const t = clamp((y - sill) / (b - 0.14 - sill), 0, 1),
      fender = Math.max(
        ...axles.map((a) => Math.exp(-(((z - a) / 0.48) ** 2))),
      );
    return (
      h -
      0.11 * (1 - t) ** 3 -
      0.042 * (1 - fender) * Math.sin(t * Math.PI) ** 2
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
        return [side * sideX(z, y), y, roundEnd(z, 1, y)];
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
      surface(
        group,
        "sculpted-wheel-arch",
        48,
        4,
        (u, v) => {
          const a = lerp(-0.3, Math.PI + 0.3, u),
            rr = r + v * 0.045,
            z = axle + Math.cos(a) * rr,
            y = p.tyre + Math.sin(a) * rr;
          return [side * (sideX(z, y) + 0.004 * Math.sin(v * Math.PI)), y, z];
        },
        m.paint,
        [side, 0, 0],
      );
      tube(
        group,
        "wheel-arch-inner-liner",
        pts.map((v) => [v[0] - side * 0.018, v[1] - 0.012, v[2]]),
        0.008,
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
    90,
    20,
    (u, v) => {
      const z = lerp(-half, half, u),
        t = v * 2 - 1;
      return [
        t * sideX(z, belt(z)),
        belt(z) + 0.065 * (1 - t * t),
        roundEnd(z, t, belt(z) + 0.065 * (1 - t * t)),
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
          y = lerp(sill, belt(end) + 0.065 * (1 - t * t), v);
        return [t * sideX(end, Math.min(y, belt(end))), y, roundEnd(end, t, y)];
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
        belt(z) + 0.065 * (1 - (x / sideX(z, belt(z))) ** 2) + 0.002,
        roundEnd(z, x / w),
      ];
    });
    tube(group, "hood-shut-line", pts, 0.0018, m.seam);
  }
  addCabin(group, p, m, id, sideX);
  // Locate the front skin on the rounded bumper, bonnet and fender before
  // attaching lamps. This keeps lenses flush as they sweep around each corner.
  const endSkin = (end, toward, x, y) => {
    const inside = (z) => {
      const b = belt(z),
        w = sideX(z, Math.min(y, b));
      return Math.abs(x) <= w && y <= b + 0.065 * (1 - (x / sideX(z, b)) ** 2);
    };
    let lo = end,
      hi = toward;
    if (!inside(lo)) {
      for (let i = 0; i < 22; i++) {
        const mid = (lo + hi) / 2;
        if (inside(mid)) hi = mid;
        else lo = mid;
      }
      lo = hi;
    }
    return (
      roundEnd(lo, clamp(x / sideX(lo, Math.min(y, belt(lo))), -1, 1), y) +
      Math.sign(end) * 0.01
    );
  };
  addFront(group, m, id, (x, y) =>
    endSkin(-half, p.windshield.bottom[0], x, y),
  );
  addRear(group, p, m, id, half, (x, y) => endSkin(half, half - 0.85, x, y));
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
