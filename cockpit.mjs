import * as T from "./vendor/three.module.js";
import { COCKPITS } from "./cockpit-layout.mjs";
const material = (color, roughness = 0.7, extra = {}) =>
  new T.MeshPhysicalMaterial({ color, roughness, metalness: 0, clearcoat: 0.04, ...extra });
function texture(w, h, paint) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  paint(c.getContext("2d"), w, h);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}
function roundShape(w, h, r) {
  const s = new T.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return s;
}
function solid(parent, shape, depth, pos, mat, bevel = 0.003) {
  const g = new T.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 4,
    curveSegments: 12,
  });
  g.translate(0, 0, -depth / 2);
  const m = new T.Mesh(g, mat);
  m.position.set(...pos);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
function rounded(parent, size, pos, mat, r = 0.018) {
  return solid(
    parent,
    roundShape(size[0], size[1], Math.min(r, size[0] / 3, size[1] / 3)),
    size[2],
    pos,
    mat,
  );
}
function polygon(parent, points, depth, pos, mat, bevel = 0.003) {
  const s = new T.Shape(points.map((p) => new T.Vector2(...p)));
  return solid(parent, s, depth, pos, mat, bevel);
}
function tube(parent, points, radius, mat, closed = false) {
  const curve = new T.CatmullRomCurve3(
      points.map((p) => new T.Vector3(...p)),
      closed,
      "centripetal",
    ),
    g = new T.TubeGeometry(curve, Math.max(24, points.length * 12), radius, 8, closed),
    m = new T.Mesh(g, mat);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function sweep(parent, points, section, mat, widths = null, axis = [1, 0, 0]) {
  const curve = new T.CatmullRomCurve3(points.map((p) => new T.Vector3(...p))),
    n = 56,
    m = section.length,
    positions = [],
    indices = [];
  for (let i = 0; i <= n; i++) {
    const p = curve.getPointAt(i / n),
      t = curve.getTangentAt(i / n),
      u = new T.Vector3(...axis);
    u.addScaledVector(t, -u.dot(t)).normalize();
    const v = new T.Vector3().crossVectors(t, u).normalize(),
      scale = widths ? widths[0] + ((widths[1] - widths[0]) * i) / n : 1;
    for (const [x, y] of section) {
      const q = p
        .clone()
        .addScaledVector(u, x * scale)
        .addScaledVector(v, y);
      positions.push(q.x, q.y, q.z);
    }
  }
  for (let i = 0; i < n; i++)
    for (let j = 0; j < m; j++) {
      const a = i * m + j,
        b = i * m + ((j + 1) % m),
        c = (i + 1) * m + j,
        d = (i + 1) * m + ((j + 1) % m);
      indices.push(a, b, c, b, d, c);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mesh = new T.Mesh(g, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function fabric() {
  return texture(512, 512, (c, w, h) => {
    c.fillStyle = "#888";
    c.fillRect(0, 0, w, h);
    let s = 9487;
    for (let i = 0; i < 32000; i++) {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      const x = s & 511,
        y = (s >>> 10) & 511;
      c.fillStyle = i % 2 ? "#ffffff13" : "#00000019";
      c.fillRect(x, y, 1, i % 3 ? 1 : 2);
    }
  });
}
function wood() {
  return texture(1024, 128, (c, w, h) => {
    c.fillStyle = "#50362b";
    c.fillRect(0, 0, w, h);
    for (let y = 0; y < 150; y++) {
      c.beginPath();
      c.strokeStyle = y % 3 ? "#b0956c1d" : "#080a0a60";
      c.lineWidth = (y % 4) * 0.35 + 0.4;
      for (let x = 0; x <= w; x += 6) {
        const v = y * 0.9 + Math.sin(x * 0.009 + y * 0.3) * 2.1 + Math.sin(x * 0.037) * 0.3;
        x ? c.lineTo(x, v) : c.moveTo(x, v);
      }
      c.stroke();
    }
  });
}
function stitch(parent, points, mat) {
  tube(parent, points, 0.00075, mat);
}
function knob(parent, x, y, z, r, black, silver) {
  const outer = new T.Mesh(new T.CylinderGeometry(r, r, 0.011, 40), silver);
  outer.rotation.x = Math.PI / 2;
  outer.position.set(x, y, z);
  parent.add(outer);
  const inner = new T.Mesh(new T.CylinderGeometry(r * 0.84, r * 0.84, 0.014, 40), black);
  inner.rotation.x = Math.PI / 2;
  inner.position.set(x, y, z + 0.004);
  parent.add(inner);
  return outer;
}
function panelTexture(kind) {
  return texture(512, 320, (c, w, h) => {
    c.fillStyle = "#131519";
    c.fillRect(0, 0, w, h);
    c.fillStyle = "#d5dbdf";
    c.strokeStyle = "#959ca4";
    c.lineWidth = 2;
    c.textAlign = "center";
    if (kind === "prius-left") {
      c.font = "31px sans-serif";
      c.fillText("▢", 130, 47);
      c.fillText("♧", 345, 47);
      c.beginPath();
      c.moveTo(25, 75);
      c.lineTo(480, 75);
      c.stroke();
      c.font = "33px sans-serif";
      c.fillText("⌃", 255, 114);
      c.fillText("‹", 80, 169);
      c.fillText("›", 430, 169);
      c.fillText("⌄", 255, 220);
      c.fillStyle = "#0c0d10";
      c.fillRect(180, 135, 150, 57);
      c.fillStyle = "#e5e8e8";
      c.font = "25px sans-serif";
      c.fillText("OK", 255, 173);
      c.font = "26px sans-serif";
      c.fillText("−    ♪    +", 255, 280);
    } else if (kind === "prius-right") {
      c.font = "31px sans-serif";
      c.fillText("⏱", 140, 52);
      c.fillText("+", 370, 52);
      c.font = "28px sans-serif";
      c.fillText("RES +", 260, 125);
      c.fillText("− SET", 260, 200);
      c.fillText("▰     ◁ ▷", 260, 285);
    } else {
      c.font = "30px sans-serif";
      c.fillText(kind === "left" ? "‹   OK   ›" : "RES  +", 255, 80);
      c.font = "27px sans-serif";
      c.fillText(kind === "left" ? "⌃         ⌄" : "−  SET", 255, 175);
      c.beginPath();
      c.moveTo(35, 225);
      c.lineTo(475, 225);
      c.stroke();
      c.fillText(kind === "left" ? "−   ♪   +" : "▰   ◁ ▷", 255, 286);
    }
  });
}
function face(parent, w, h, pos, map, rotation = 0) {
  const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map }));
  m.position.set(...pos);
  m.rotation.x = rotation;
  parent.add(m);
  return m;
}
function glassGeometry(shape, w, h) {
  const g = new T.ShapeGeometry(shape),
    p = g.attributes.position,
    uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

function makeWheel(root, car, cfg, mats) {
  const tall = car.id === "alphard",
    wheel = new T.Group();
  wheel.position.set(cfg.eyeX, car.eyeHeight - cfg.wheelDrop, cfg.wheelZ);
  wheel.rotation.x = -0.23;
  root.add(wheel);
  const radial = 128,
    cross = 16,
    positions = [],
    uv = [],
    indices = [],
    r = cfg.wheelRadius;
  for (let i = 0; i <= radial; i++) {
    const a = (i / radial) * Math.PI * 2,
      cx = Math.cos(a) * r,
      cy = Math.sin(a) * r,
      grip = 0.017 + (Math.abs(Math.cos(a)) > 0.85 && Math.sin(a) > 0.05 ? 0.004 : 0);
    for (let j = 0; j <= cross; j++) {
      const b = (j / cross) * Math.PI * 2,
        dr = Math.cos(b) * grip;
      positions.push(cx + Math.cos(a) * dr, cy + Math.sin(a) * dr, Math.sin(b) * grip);
      uv.push((i / radial) * 6, j / cross);
    }
  }
  for (let i = 0; i < radial; i++)
    for (let j = 0; j < cross; j++) {
      const a = i * (cross + 1) + j,
        b = a + cross + 1;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  g.setAttribute("uv", new T.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  const rim = new T.Mesh(g, mats.leather);
  rim.castShadow = true;
  wheel.add(rim);
  if (tall) {
    const arc = new T.Mesh(new T.TorusGeometry(r, 0.0175, 16, 80, Math.PI * 0.82), mats.wood);
    arc.rotation.z = Math.PI * 0.09;
    arc.position.z = 0.0008;
    wheel.add(arc);
  }
  const hw = tall ? 0.087 : 0.074,
    horn = new T.Shape();
  horn.moveTo(-hw, 0.044);
  horn.bezierCurveTo(-hw * 0.65, 0.063, hw * 0.65, 0.063, hw, 0.044);
  horn.bezierCurveTo(hw + 0.005, 0.015, hw * 0.75, -0.044, hw * 0.58, -0.069);
  horn.quadraticCurveTo(0, -0.084, -hw * 0.58, -0.069);
  horn.bezierCurveTo(-hw * 0.75, -0.044, -hw - 0.005, 0.015, -hw, 0.044);
  solid(wheel, horn, 0.03, [0, -0.002, 0.007], mats.leather, 0.011);
  rounded(wheel, [tall ? 0.157 : 0.137, 0.026, 0.025], [0, 0.042, 0.022], mats.leather, 0.011);
  for (const side of [-1, 1]) {
    const pts = tall
      ? [
          [0.063, 0.035],
          [0.155, 0.037],
          [0.151, -0.038],
          [0.075, -0.061],
        ]
      : [
          [0.059, 0.038],
          [0.154, 0.034],
          [0.148, -0.018],
          [0.067, -0.03],
        ];
    polygon(
      wheel,
      pts.map(([x, y]) => [side * x, y]),
      0.021,
      [0, 0, -0.004],
      tall ? mats.black : mats.silver,
      0.005,
    );
    tube(
      wheel,
      [
        [side * 0.069, 0.044, 0.009],
        [side * 0.113, 0.05, 0.009],
        [side * 0.151, 0.036, 0.006],
      ],
      0.0024,
      mats.silver,
    );
    const controls = panelTexture(
      tall ? (side < 0 ? "left" : "right") : side < 0 ? "prius-left" : "prius-right",
    );
    const pad = face(
      wheel,
      tall ? 0.067 : 0.06,
      tall ? 0.065 : 0.036,
      [side * (tall ? 0.115 : 0.109), tall ? -0.008 : 0.007, 0.02],
      controls,
    );
    pad.rotation.z = tall ? side * -0.1 : side * -0.04;
  }
  if (tall) {
    polygon(
      wheel,
      [
        [-0.041, -0.055],
        [-0.028, -0.155],
        [0.028, -0.155],
        [0.041, -0.055],
      ],
      0.02,
      [0, 0, -0.007],
      mats.black,
    );
    tube(
      wheel,
      [
        [-0.033, -0.075, 0.007],
        [-0.023, -0.144, 0.007],
        [0, -0.155, 0.007],
        [0.023, -0.144, 0.007],
        [0.033, -0.075, 0.007],
      ],
      0.0026,
      mats.silver,
    );
  } else {
    polygon(
      wheel,
      [
        [-0.025, -0.063],
        [-0.039, -0.153],
        [0, -0.164],
        [0.039, -0.153],
        [0.025, -0.063],
      ],
      0.019,
      [0, 0, -0.008],
      mats.black,
      0.005,
    );
    tube(
      wheel,
      [
        [-0.026, -0.074, 0.008],
        [-0.03, -0.143, 0.008],
        [0, -0.154, 0.008],
        [0.03, -0.143, 0.008],
        [0.026, -0.074, 0.008],
      ],
      0.0035,
      mats.silver,
    );
  }
  const logo = new T.Group();
  logo.position.set(0, 0.003, 0.042);
  wheel.add(logo);
  for (const [rx, ry, dy] of [
    [0.023, 0.015, 0],
    [0.008, 0.015, 0],
    [0.017, 0.006, 0.005],
  ]) {
    const pts = [];
    for (let i = 0; i <= 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      pts.push([Math.cos(a) * rx, dy + Math.sin(a) * ry, 0]);
    }
    tube(logo, pts, 0.0012, mats.silver);
  }
  face(
    wheel,
    0.05,
    0.008,
    [0, -0.037, 0.041],
    texture(256, 48, (c, w, h) => {
      c.clearRect(0, 0, w, h);
      c.fillStyle = "#6e7377";
      c.font = "19px sans-serif";
      c.textAlign = "center";
      c.fillText("SRS AIRBAG", w / 2, 33);
    }),
  );
  for (const side of [-1, 1]) {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const a = (side < 0 ? 0.6 : 1.6) * Math.PI + (i / 40) * 0.7 * Math.PI;
      pts.push([Math.cos(a) * (r - 0.011), Math.max(-r * 0.89, Math.sin(a) * (r - 0.011)), 0.01]);
    }
    stitch(wheel, pts, mats.thread);
  }
  // Shaped steering column and real stalk locations sit behind the rim.
  rounded(
    root,
    [0.13, 0.12, 0.26],
    [cfg.eyeX, car.eyeHeight - cfg.wheelDrop - 0.045, cfg.wheelZ - 0.14],
    mats.black,
    0.035,
  );
  for (const side of [-1, 1]) {
    const stalk = tube(
      root,
      [
        [cfg.eyeX + side * 0.055, car.eyeHeight - cfg.wheelDrop + 0.018, cfg.wheelZ - 0.11],
        [cfg.eyeX + side * 0.14, car.eyeHeight - cfg.wheelDrop + 0.042, cfg.wheelZ - 0.13],
      ],
      0.01,
      mats.black,
    );
    rounded(
      root,
      [0.047, 0.024, 0.035],
      [cfg.eyeX + side * 0.146, car.eyeHeight - cfg.wheelDrop + 0.045, cfg.wheelZ - 0.13],
      mats.black,
      0.008,
    );
  }
  return wheel;
}

function makeCenterStack(root, car, cfg, mats, navTexture) {
  const tall = car.id === "alphard",
    eye = car.eyeHeight,
    group = new T.Group();
  group.name = tall ? "alphard-integrated-display-and-climate" : "prius-vertical-center-stack";
  group.position.set(cfg.screenX, eye - cfg.screenDrop, cfg.screenZ);
  group.rotation.x = -0.08;
  root.add(group);
  const gloss = material("#07090e", 0.22, { clearcoat: 0.7, clearcoatRoughness: 0.22 }),
    ivory = material("#e6e6de", 0.37, { clearcoat: 0.32 });
  const outline = tall
    ? [
        [-0.181, -0.272],
        [0.181, -0.272],
        [0.18, 0.111],
        [-0.18, 0.111],
      ]
    : [
        [-0.145, -0.178],
        [0.145, -0.178],
        [0.127, -0.08],
        [0.102, 0.123],
        [0.075, 0.15],
        [-0.075, 0.15],
        [-0.102, 0.123],
        [-0.127, -0.08],
      ];
  const shell = polygon(group, outline, 0.029, [0, 0, -0.017], gloss, 0.009);
  shell.name = "center-stack-shell";
  for (const side of [-1, 1])
    tube(
      group,
      tall
        ? [
            [side * 0.183, 0.109, -0.002],
            [side * 0.188, -0.12, 0.003],
            [side * 0.174, -0.272, 0.012],
          ]
        : [
            [side * 0.078, 0.148, 0.003],
            [side * 0.104, 0.112, 0.007],
            [side * 0.132, -0.08, 0.006],
            [side * 0.146, -0.173, 0.005],
          ],
      tall ? 0.006 : 0.0027,
      tall ? mats.leather : mats.silver,
    );
  const navigation = new T.Mesh(
    new T.PlaneGeometry(cfg.screenWidth, cfg.screenHeight),
    new T.MeshBasicMaterial({ map: navTexture }),
  );
  navigation.name = "live-navigation-display";
  navigation.position.set(0, tall ? 0.01 : 0.019, 0.008);
  group.add(navigation);
  const vent = (x, y, w, h, z = 0.027) => {
    rounded(group, [w, h, 0.02], [x, y, z], mats.black, 0.006);
    for (let i = 0; i < 3; i++)
      rounded(group, [w - 0.008, 0.0018, 0.009], [x, y - h * 0.3 + i * h * 0.3, z + 0.014], mats.soft, 0.001);
    rounded(group, [0.014, 0.003, 0.004], [x, y, z + 0.022], mats.silver, 0.001);
  };
  if (tall) {
    const climate = face(
      group,
      0.313,
      0.093,
      [0, -0.132, 0.013],
      texture(1024, 300, (c, w, h) => {
        c.fillStyle = "#07090e";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#ced9df";
        c.font = "26px sans-serif";
        c.textAlign = "center";
        c.fillText("FRONT    REAR               Climate               ↗", w / 2, 50);
        c.font = "29px sans-serif";
        c.fillText("−     ● ━━━ ●     +", w / 2, 135);
        c.font = "25px sans-serif";
        c.fillText("OFF             AUTO             A/C", w / 2, 232);
      }),
    );
    climate.name = "integrated-climate-controls";
    for (const side of [-1, 1]) {
      knob(group, side * 0.124, -0.176, 0.022, 0.023, mats.black, mats.silver);
      face(
        group,
        0.036,
        0.036,
        [side * 0.124, -0.176, 0.036],
        texture(128, 128, (c, w, h) => {
          const g = c.createLinearGradient(0, 0, w, h);
          g.addColorStop(0, "#176bda");
          g.addColorStop(1, "#b92132");
          c.fillStyle = g;
          c.beginPath();
          c.arc(64, 64, 59, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = "#fff";
          c.textAlign = "center";
          c.font = "33px sans-serif";
          c.fillText("22.0", 64, 77);
        }),
      );
    }
    for (const side of [-1, 1]) {
      rounded(group, [0.113, 0.016, 0.008], [side * 0.094, -0.226, 0.024], mats.soft, 0.002);
      face(
        group,
        0.104,
        0.011,
        [side * 0.094, -0.226, 0.03],
        texture(512, 60, (c, w, h) => {
          c.fillStyle = "#929da8";
          c.font = "25px sans-serif";
          c.textAlign = "center";
          c.fillText(side < 0 ? "VIEW    ◻" : "FRONT   REAR", w / 2, 43);
        }),
      );
    }
    knob(group, 0, -0.224, 0.029, 0.011, mats.black, mats.silver);
    for (const side of [-1, 1]) vent(side * 0.083, -0.288, 0.139, 0.038, 0.025);
    rounded(group, [0.027, 0.037, 0.012], [0, -0.288, 0.047], mats.soft, 0.003);
    polygon(
      group,
      [
        [-0.007, -0.004],
        [0.007, -0.004],
        [0, 0.009],
      ],
      0.001,
      [0, -0.288, 0.055],
      material("#b44742"),
      0,
    );
    for (const side of [-1, 1]) {
      const edge = [
        [cfg.screenX + side * 0.19, eye - cfg.screenDrop + 0.1, cfg.screenZ - 0.025],
        [cfg.screenX + side * 0.19, eye - 0.49, cfg.screenZ + 0.025],
        [side * 0.155, eye - 0.66, -0.39],
        [side * 0.15, eye - 0.69, 0.18],
      ];
      tube(root, edge, 0.013, mats.leather);
      stitch(
        root,
        edge.map(([x, y, z]) => [x - side * 0.008, y + 0.004, z + 0.004]),
        mats.thread,
      );
    }
  } else {
    for (const side of [-1, 1]) vent(side * 0.045, 0.118, 0.073, 0.025, 0.018);
    face(
      group,
      0.213,
      0.054,
      [0, -0.102, 0.02],
      texture(1024, 230, (c, w, h) => {
        c.fillStyle = "#080a10";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#c5d1d5";
        c.textAlign = "center";
        c.font = "37px sans-serif";
        c.fillText("22.0       ↗       22.0", w / 2, 72);
        c.font = "30px sans-serif";
        c.fillText("AUTO    −    FAN    +    A/C", w / 2, 157);
      }),
    );
    for (const side of [-1, 1])
      for (let i = 0; i < 4; i++) {
        rounded(group, [0.012, 0.01, 0.006], [side * 0.113, 0.052 - i * 0.027, 0.018], mats.black, 0.002);
        rounded(group, [0.006, 0.001, 0.001], [side * 0.113, 0.052 - i * 0.027, 0.023], mats.silver, 0.0002);
      }
    const plate = polygon(
      group,
      [
        [-0.145, -0.03],
        [-0.135, 0.034],
        [0.135, 0.034],
        [0.145, -0.03],
        [0.1, -0.051],
        [-0.1, -0.051],
      ],
      0.03,
      [0, -0.212, 0.019],
      ivory,
      0.011,
    );
    plate.name = "prius-white-gear-panel";
    knob(group, -0.107, -0.21, 0.044, 0.014, mats.black, mats.silver);
    face(
      group,
      0.015,
      0.015,
      [-0.107, -0.21, 0.058],
      texture(96, 96, (c, w, h) => {
        c.fillStyle = "#0c1117";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#dbe9ec";
        c.font = "bold 60px sans-serif";
        c.textAlign = "center";
        c.fillText("P", w / 2, 68);
      }),
    );
    const blue = material("#18587e", 0.24, { metalness: 0.22, clearcoat: 0.5 });
    rounded(group, [0.06, 0.035, 0.023], [-0.03, -0.211, 0.045], mats.black, 0.01);
    tube(
      group,
      [
        [-0.03, -0.211, 0.047],
        [-0.035, -0.203, 0.084],
      ],
      0.008,
      mats.black,
    );
    rounded(group, [0.035, 0.027, 0.025], [-0.035, -0.198, 0.091], blue, 0.008);
    knob(group, 0.098, -0.211, 0.043, 0.018, blue, mats.silver);
    face(
      group,
      0.027,
      0.027,
      [0.098, -0.211, 0.059],
      texture(128, 128, (c, w, h) => {
        c.fillStyle = "#113e60";
        c.beginPath();
        c.arc(64, 64, 62, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = "#d6edff";
        c.textAlign = "center";
        c.font = "46px sans-serif";
        c.fillText("⏻", 64, 74);
      }),
    );
    face(
      group,
      0.035,
      0.018,
      [0.019, -0.213, 0.045],
      texture(180, 90, (c, w, h) => {
        c.fillStyle = "#dce1dd";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#27343c";
        c.textAlign = "center";
        c.font = "29px sans-serif";
        c.fillText("R N D B", w / 2, 59);
      }),
    );
  }
  return { navigation, navigationAnchor: new T.Vector3(cfg.screenX, eye - cfg.screenDrop, cfg.screenZ) };
}

export function buildCockpit({ parent, car, navTexture, meterTexture }) {
  const cfg = COCKPITS[car.id],
    tall = car.id === "alphard",
    eye = car.eyeHeight,
    half = car.width / 2 - 0.075,
    roof = car.height - 0.09,
    bump = fabric();
  const mats = {
    black: material("#080b10", 0.65),
    leather: material("#121419", 0.79, { bumpMap: bump, bumpScale: 0.00035 }),
    soft: material("#171a20", 0.86, { bumpMap: bump, bumpScale: 0.00025 }),
    silver: material("#a8adb2", 0.28, { metalness: 0.84, clearcoat: 0.28 }),
    rubber: material("#04060a", 0.95),
    wood: material("#776451", 0.3, { map: wood(), clearcoat: 0.7, clearcoatRoughness: 0.25 }),
    thread: material("#6c6a62", 0.9),
    headliner: material(tall ? "#9f9d95" : "#7e8284", 0.96, { bumpMap: bump, bumpScale: 0.0003 }),
    glass: material("#a4ced7", 0.15, { transparent: true, opacity: 0.028, depthWrite: false }),
  };
  mats.wheelLeather = mats.leather;
  if (tall) {
    mats.leather = material("#a36d4d", 0.54, { bumpMap: bump, bumpScale: 0.00035, clearcoat: 0.12 });
    mats.thread = material("#d0b396", 0.9);
    mats.wood.color.set("#c4a690");
    mats.headliner.color.set("#8e9192");
  }
  const root = new T.Group();
  root.name = car.id + "-photo-reconstructed-cockpit";
  parent.add(root);
  // Enclosed footwell: the road must never show through below the wheel.
  rounded(root, [2 * half, 0.065, 2.32], [0, tall ? 0.33 : 0.13, 0.1], mats.rubber, 0.025);
  rounded(root, [0.48, 0.26, 0.28], [cfg.eyeX, eye - 0.615, -0.57], mats.black, 0.038);
  for (const [x, w] of [
    [cfg.eyeX - 0.075, 0.085],
    [cfg.eyeX + 0.095, 0.047],
  ]) {
    const pedal = rounded(root, [w, 0.1, 0.023], [x, tall ? 0.48 : 0.27, -0.6], mats.rubber, 0.008);
    pedal.rotation.x = -0.3;
    for (let i = 0; i < 4; i++)
      rounded(pedal, [w * 0.8, 0.003, 0.002], [0, -0.032 + i * 0.02, 0.014], mats.soft, 0.001);
  }
  // Lofted dashboard has a rolled leading edge and a curved vertical fascia.
  const section = [
      [-1.43, -0.335],
      [-1.14, -0.318],
      [-0.81, -0.327],
      [-0.62, -0.353],
      [-0.51, -0.383],
      [-0.49, -0.455],
      [-0.57, -0.568],
      [-0.73, -0.643],
      [-1.39, -0.643],
    ],
    nx = 72,
    n = section.length,
    positions = [],
    indices = [];
  for (let i = 0; i <= nx; i++) {
    const x = -half + (2 * half * i) / nx,
      center = Math.exp(-Math.pow(x / 0.24, 2)),
      driver = Math.exp(-Math.pow((x - cfg.eyeX) / 0.29, 2)),
      recess = Math.max(0, Math.min(1, (0.215 - Math.abs(x)) / 0.03));
    for (const [z, y] of section) {
      const front = z > -0.8 ? 1 : 0;
      positions.push(
        x,
        eye + y + (tall ? 0.012 : 0.018) * driver - (z > -0.97 ? 0.235 : 0) * recess,
        z + (tall ? 0.055 : 0.025) * center * front + 0.045 * Math.cos(((x / half) * Math.PI) / 2) * front,
      );
    }
  }
  const dg = new T.BufferGeometry(),
    faces = [[], []];
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < n; j++) {
      const a = i * n + j,
        b = (i + 1) * n + j,
        c = (i + 1) * n + ((j + 1) % n),
        d = i * n + ((j + 1) % n);
      faces[tall && j >= 4 && j <= 6 ? 1 : 0].push(a, d, b, b, d, c);
    }
  indices.push(...faces[0], ...faces[1]);
  dg.addGroup(0, faces[0].length, 0);
  if (faces[1].length) dg.addGroup(faces[0].length, faces[1].length, 1);
  dg.setAttribute("position", new T.Float32BufferAttribute(positions, 3));
  dg.setIndex(indices);
  dg.computeVertexNormals();
  const dash = new T.Mesh(dg, [mats.soft, mats.leather]);
  dash.castShadow = true;
  dash.receiveShadow = true;
  root.add(dash);
  // Separate stitched fascia, glovebox and continuous accent band.
  for (const [a, b] of [
    [-half, -0.205],
    [0.205, half],
  ]) {
    const line = [];
    for (let i = 0; i <= 20; i++) {
      const x = a + ((b - a) * i) / 20;
      line.push([x, eye - 0.392, -0.475 + 0.04 * Math.cos(((x / half) * Math.PI) / 2)]);
    }
    if (tall)
      sweep(
        root,
        line,
        [
          [-0.019, -0.005],
          [0.019, -0.005],
          [0.019, 0.005],
          [-0.019, 0.005],
        ],
        mats.wood,
        null,
        [0, 1, 0],
      );
    else tube(root, line, 0.003, material("#37677d", 0.3, { metalness: 0.5 }));
    stitch(
      root,
      line.map(([x, y, z]) => [x, y + 0.023, z - 0.002]),
      mats.thread,
    );
  }
  rounded(
    root,
    [half - 0.25, 0.17, 0.13],
    [-(half + 0.25) / 2, eye - 0.565, -0.593],
    tall ? mats.leather : mats.black,
    0.028,
  );
  stitch(
    root,
    [
      [-half + 0.1, eye - 0.484, -0.516],
      [-0.52, eye - 0.489, -0.499],
      [-0.19, eye - 0.489, -0.487],
    ],
    mats.thread,
  );
  knob(root, -0.21, eye - 0.527, -0.519, 0.009, mats.black, mats.black);
  const { navigation, navigationAnchor } = makeCenterStack(root, car, cfg, mats, navTexture);
  const my = eye - cfg.meterDrop,
    mx = cfg.meterX ?? cfg.eyeX,
    mz = cfg.meterZ,
    mw = cfg.meterWidth,
    mh = cfg.meterHeight;
  if (tall) {
    const hood = polygon(
      root,
      [
        [-0.202, -0.075],
        [-0.203, 0.018],
        [-0.172, 0.09],
        [-0.11, 0.126],
        [0, 0.14],
        [0.11, 0.126],
        [0.172, 0.09],
        [0.203, 0.018],
        [0.202, -0.075],
      ],
      0.18,
      [mx, my - 0.02, mz - 0.045],
      mats.wheelLeather,
      0.009,
    );
    hood.name = "alphard-instrument-binnacle";
    stitch(
      root,
      [
        [mx - 0.18, my + 0.03, mz + 0.05],
        [mx - 0.13, my + 0.095, mz + 0.05],
        [mx, my + 0.117, mz + 0.05],
        [mx + 0.13, my + 0.095, mz + 0.05],
        [mx + 0.18, my + 0.03, mz + 0.05],
      ],
      mats.thread,
    );
  } else {
    polygon(
      root,
      [
        [-0.247, -0.15],
        [0.247, -0.15],
        [0.239, -0.03],
        [-0.239, -0.03],
      ],
      0.25,
      [mx, my, mz - 0.14],
      mats.soft,
      0.004,
    );
    const hood = polygon(
      root,
      [
        [-0.246, -0.039],
        [0.246, -0.039],
        [0.239, 0.029],
        [0.19, 0.049],
        [-0.188, 0.049],
        [-0.239, 0.029],
      ],
      0.075,
      [mx, my, mz - 0.016],
      mats.black,
      0.006,
    );
    hood.name = "prius-central-instrument-hood";
    tube(
      root,
      [
        [-0.233, my + 0.041, mz + 0.016],
        [mx, my + 0.046, mz + 0.018],
        [0.243, my + 0.041, mz + 0.016],
      ],
      0.002,
      mats.soft,
    );
  }
  const meter = new T.Mesh(new T.PlaneGeometry(mw, mh), new T.MeshBasicMaterial({ map: meterTexture }));
  meter.name = "live-instrument-display";
  meter.position.set(mx, my, mz + (tall ? 0.065 : 0.031));
  root.add(meter);
  // Each console follows its reference: Alphard's broad glossy tunnel and
  // Prius's narrow armrest with its shifter on the white centre fascia.
  rounded(root, [tall ? 0.31 : 0.23, 0.235, 1.0], [-0.035, eye - 0.755, -0.03], mats.leather, 0.035);
  const tunnel = rounded(
    root,
    [tall ? 0.285 : 0.211, 0.035, 0.68],
    [-0.035, eye - 0.619, -0.12],
    tall ? mats.wood : mats.black,
    0.021,
  );
  tunnel.rotation.x = -0.05;
  if (tall) {
    rounded(
      root,
      [0.252, 0.022, 0.4],
      [-0.035, eye - 0.586, -0.2],
      material("#0b0c11", 0.19, { clearcoat: 0.7 }),
      0.02,
    );
    tube(
      root,
      [
        [-0.162, eye - 0.57, -0.39],
        [-0.165, eye - 0.57, -0.12],
        [-0.145, eye - 0.57, 0.02],
        [0.074, eye - 0.57, 0.02],
        [0.1, eye - 0.57, -0.12],
        [0.094, eye - 0.57, -0.39],
      ],
      0.003,
      mats.silver,
    );
    rounded(root, [0.074, 0.023, 0.15], [0.016, eye - 0.564, -0.28], mats.black, 0.012);
    const boot = rounded(root, [0.052, 0.072, 0.061], [0.021, eye - 0.524, -0.29], mats.wheelLeather, 0.014);
    boot.rotation.x = -0.26;
    rounded(root, [0.031, 0.046, 0.063], [0.026, eye - 0.478, -0.3], mats.soft, 0.012);
    tube(
      root,
      [
        [0.022, eye - 0.455, -0.265],
        [0.022, eye - 0.478, -0.26],
        [0.022, eye - 0.5, -0.255],
      ],
      0.002,
      mats.silver,
    );
    face(
      root,
      0.052,
      0.104,
      [-0.054, eye - 0.548, -0.285],
      texture(256, 512, (c, w, h) => {
        c.fillStyle = "#080c12";
        c.fillRect(0, 0, w, h);
        c.fillStyle = "#cbdce9";
        c.font = "42px sans-serif";
        c.textAlign = "center";
        ["P", "R", "N", "D", "B"].forEach((s, i) => c.fillText(s, w / 2, 60 + i * 95));
      }),
      -Math.PI * 0.37,
    );
    for (let i = 0; i < 3; i++)
      rounded(root, [0.041, 0.009, 0.031], [0.059, eye - 0.553, -0.16 + i * 0.04], mats.black, 0.004);
  } else {
    const tray = rounded(
      root,
      [0.191, 0.025, 0.265],
      [-0.035, eye - 0.607, -0.21],
      material("#dedfd7", 0.5),
      0.025,
    );
    rounded(root, [0.164, 0.027, 0.205], [-0.035, eye - 0.592, -0.21], mats.rubber, 0.018);
  }
  for (const z of [0.035, 0.176]) {
    const well = new T.Mesh(new T.CylinderGeometry(0.035, 0.029, 0.05, 40), mats.black);
    well.position.set(-0.035, eye - 0.603, z);
    root.add(well);
    const edge = new T.Mesh(new T.TorusGeometry(0.036, 0.0018, 8, 48), mats.silver);
    edge.rotation.x = Math.PI / 2;
    edge.position.set(-0.035, eye - 0.577, z);
    root.add(edge);
  }
  rounded(root, [tall ? 0.28 : 0.22, 0.08, 0.31], [-0.035, eye - 0.6, 0.42], mats.leather, 0.03);
  stitch(
    root,
    [
      [-0.035, eye - 0.557, 0.28],
      [-0.035, eye - 0.557, 0.42],
      [-0.035, eye - 0.557, 0.55],
    ],
    mats.thread,
  );
  // Front doors curve into the fascia rather than floating beside the driver.
  for (const side of [-1, 1]) {
    const x = side * (half + 0.025),
      panel = rounded(root, [0.075, 0.49, 1.4], [x, eye - 0.47, 0.03], mats.black, 0.03);
    rounded(root, [0.06, 0.1, 1.3], [x - side * 0.009, eye - 0.23, -0.015], mats.leather, 0.022);
    tube(
      root,
      [
        [x - side * 0.035, eye - 0.277, -0.64],
        [x - side * 0.035, eye - 0.279, -0.15],
        [x - side * 0.035, eye - 0.29, 0.52],
      ],
      tall ? 0.011 : 0.003,
      tall ? mats.wood : mats.silver,
    );
    rounded(root, [0.025, 0.074, 0.2], [x - side * 0.04, eye - 0.35, -0.26], mats.black, 0.018);
    tube(
      root,
      [
        [x - side * 0.055, eye - 0.342, -0.345],
        [x - side * 0.068, eye - 0.357, -0.27],
        [x - side * 0.057, eye - 0.346, -0.19],
      ],
      0.0055,
      mats.silver,
    );
    rounded(root, [0.11, 0.04, 0.33], [x - side * 0.075, eye - 0.51, -0.02], mats.leather, 0.025);
    for (let i = 0; i < 4; i++)
      rounded(
        root,
        [0.026, 0.009, 0.036],
        [x - side * 0.075, eye - 0.485, -0.125 + i * 0.058],
        mats.black,
        0.004,
      );
    stitch(
      root,
      [
        [x - side * 0.045, eye - 0.42, -0.53],
        [x - side * 0.045, eye - 0.44, -0.03],
        [x - side * 0.045, eye - 0.44, 0.55],
      ],
      mats.thread,
    );
    // Swept corner vents; the long axis follows the door/dash junction.
    const vx = side * (half - (tall ? 0.13 : 0.1)),
      vy = eye - (tall ? 0.405 : 0.38),
      vz = tall ? -0.44 : -0.53,
      vw = tall ? 0.114 : 0.084,
      vh = tall ? 0.065 : 0.045;
    const vent = rounded(root, [vw, vh, 0.028], [vx, vy, vz], mats.black, 0.011);
    vent.rotation.y = side * 0.25;
    for (let j = 0; j < 4; j++)
      rounded(
        root,
        [vw - 0.018, 0.002, 0.009],
        [vx, vy - vh * 0.36 + j * vh * 0.24, vz + 0.019],
        mats.soft,
        0.001,
      );
    rounded(root, [0.018, 0.003, 0.005], [vx, vy, vz + 0.027], mats.silver, 0.001);
  }
  // Tapered, fabric-covered A-pillars and continuous window seals.
  const ellipse = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ellipse.push([
      Math.sign(Math.cos(a)) * Math.sqrt(Math.abs(Math.cos(a))) * 0.5,
      Math.sign(Math.sin(a)) * Math.sqrt(Math.abs(Math.sin(a))) * 0.022,
    ]);
  }
  for (const side of [-1, 1]) {
    const pillar = [
      [side * (half + 0.015), eye - 0.325, cfg.glassBottom],
      [side * (half + 0.012), eye - 0.04, (cfg.glassBottom + cfg.glassTop) * 0.5],
      [side * (half - 0.005), roof - 0.02, cfg.glassTop],
    ];
    sweep(root, pillar, ellipse, mats.headliner, [cfg.pillarBaseWidth, cfg.pillarTopWidth]);
    tube(
      root,
      pillar.map(([x, y, z]) => [x + side * 0.026, y, z - 0.008]),
      0.009,
      mats.rubber,
    );
    tube(
      root,
      [
        [side * half, roof - 0.025, cfg.glassTop],
        [side * half, roof - 0.025, 0.5],
        [side * half, roof - 0.025, 1.15],
      ],
      0.029,
      mats.headliner,
    );
    rounded(root, [0.077, 0.77, 0.11], [side * half, roof - 0.4, 1.12], mats.headliner, 0.02);
    const window = new T.Mesh(new T.PlaneGeometry(1.6, roof - eye + 0.26), mats.glass);
    window.position.set(side * (half + 0.025), (roof + eye - 0.26) / 2, 0.2);
    window.rotation.y = Math.PI / 2;
    window.material.side = T.DoubleSide;
    root.add(window);
  }
  rounded(root, [2 * half, 0.047, 2.05], [0, roof, (cfg.glassTop + 1.4) / 2], mats.headliner, 0.02);
  tube(
    root,
    [
      [-half, roof - 0.015, cfg.glassTop],
      [0, roof - 0.015, cfg.glassTop - 0.015],
      [half, roof - 0.015, cfg.glassTop],
    ],
    0.025,
    mats.headliner,
  );
  for (const side of [-1, 1])
    rounded(
      root,
      [0.29, 0.022, 0.14],
      [side * 0.4, roof - 0.045, cfg.glassTop + 0.15],
      mats.headliner,
      0.018,
    );
  rounded(
    root,
    [tall ? 0.22 : 0.11, 0.018, tall ? 0.235 : 0.14],
    [0, roof - 0.019, cfg.glassTop + 0.11],
    mats.headliner,
    0.008,
  );
  face(
    root,
    tall ? 0.168 : 0.085,
    tall ? 0.16 : 0.1,
    [0, roof - 0.031, cfg.glassTop + 0.11],
    texture(320, 400, (c, w, h) => {
      c.fillStyle = tall ? "#161c22" : "#8a8f90";
      c.fillRect(0, 0, w, h);
      c.fillStyle = "#bec6ca";
      c.fillRect(16, 25, 65, 125);
      c.fillRect(w - 81, 25, 65, 125);
      c.fillStyle = "#626c71";
      for (let i = 0; i < 6; i++) c.fillRect(110 + (i % 2) * 62, 45 + Math.floor(i / 2) * 87, 45, 37);
      c.fillStyle = "#b6c5cf";
      c.font = "22px sans-serif";
      c.textAlign = "center";
      c.fillText("DOOR   OPEN", w / 2, h - 26);
    }),
    Math.PI / 2,
  );
  // Rear headrests are visible when glancing back and in the cabin mirror.
  for (const side of [-1, 1]) {
    rounded(root, [0.46, 0.69, 0.22], [side * 0.4, 0.77, 1.05], mats.leather, 0.06);
    rounded(root, [0.25, 0.2, 0.12], [side * 0.4, 1.2, 0.99], mats.leather, 0.04);
  }
  const wheel = makeWheel(root, car, cfg, { ...mats, leather: mats.wheelLeather }),
    mirrorMounts = [];
  for (const side of [-1, 1]) {
    const w = cfg.mirrorWidth,
      h = cfg.mirrorHeight,
      group = new T.Group(),
      x = side * (car.width / 2 + (cfg.mirrorOut ?? 0.085)),
      y = eye - cfg.mirrorDrop,
      z = cfg.mirrorZ;
    group.position.set(x, y, z);
    // Door mirrors are angled to show the car's flank from the driver's eye.
    group.rotation.y = side * (cfg.mirrorYaw ?? 0.12);
    group.userData.mirrorHousing = true;
    root.add(group);
    const outline = [
      [-w * 0.49, -h * 0.32],
      [-w * 0.35, -h * 0.48],
      [w * 0.4, -h * 0.43],
      [w * 0.5, -h * 0.22],
      [w * 0.48, h * 0.34],
      [w * 0.35, h * 0.48],
      [-w * 0.34, h * 0.45],
      [-w * 0.5, h * 0.25],
    ];
    polygon(group, outline, 0.044, [0, 0, 0], mats.black, 0.009);
    // The arm and its door base sit outside the glass on the door skin, below
    // and behind the housing, so they never cover the mirror from inside.
    const baseX = -side * (x - side * (car.width / 2 + 0.012));
    const arm = tube(
      group,
      [
        [-side * w * 0.3, -h * 0.32, -0.02],
        [baseX, -h * 0.5, -0.035],
      ],
      0.015,
      mats.black,
    );
    arm.name = "door-mirror-arm";
    const base = rounded(group, [0.04, 0.035, 0.1], [baseX, -h * 0.52, -0.05], mats.black, 0.012);
    base.name = "door-mirror-base";
    const shape = new T.Shape(outline.map(([x, y]) => new T.Vector2(x * 0.88, y * 0.85))),
      plane = new T.Mesh(
        glassGeometry(shape, w * 0.88, h * 0.85),
        new T.MeshBasicMaterial({ side: T.DoubleSide }),
      );
    // In front of the housing's 9 mm bevel so the glass never z-fights it.
    plane.position.z = 0.036;
    plane.scale.x = -1;
    group.add(plane);
    mirrorMounts.push({
      side,
      plane,
      mount: new T.Vector3(x, y, z + 0.04),
      width: w * 0.88,
      height: h * 0.85,
    });
  }
  const innerY = roof - 0.124,
    innerZ = cfg.glassTop + 0.085;
  rounded(root, [0.23, 0.083, 0.028], [-0.115, innerY, innerZ], mats.black, 0.017);
  tube(
    root,
    [
      [-0.115, roof - 0.01, innerZ - 0.02],
      [-0.115, innerY + 0.03, innerZ],
    ],
    0.008,
    mats.black,
  );
  const innerPlane = new T.Mesh(
    glassGeometry(roundShape(0.209, 0.063, 0.009), 0.209, 0.063),
    new T.MeshBasicMaterial(),
  );
  innerPlane.position.set(-0.115, innerY, innerZ + 0.021);
  innerPlane.scale.x = -1;
  root.add(innerPlane);
  mirrorMounts.push({
    side: 0,
    plane: innerPlane,
    mount: new T.Vector3(-0.115, innerY, innerZ + 0.03),
    width: 0.209,
    height: 0.063,
  });
  return { root, wheel, navigation, meter, mirrors: mirrorMounts, layout: cfg, navigationAnchor };
}
