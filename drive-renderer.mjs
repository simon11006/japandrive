import * as THREE from "./vendor/three.module.js";
import {
  roadWidth,
  signalPhase,
  forward,
  synchronizeSignals,
  reverseGuides,
  nearestOnSegment,
  headingBetween,
} from "./simulation.mjs";
import { groundSurface, ribbonSections, surfacePose } from "./road-surface.mjs";
import { buildCockpit } from "./cockpit.mjs";
import { makeCarModel } from "./car-model.mjs";
import { drawNavOverlay } from "./nav-display.mjs";
import { driverEye, verticalFov, viewSettings, lookIntoTurn, GLANCE } from "./driver-view.mjs";
import { steeringLimit } from "./vehicles.mjs";
import {
  makeSky,
  SUN_DIRECTION,
  HAZE,
  asphaltTexture,
  grassTexture,
  concreteTexture,
  facadeTexture,
  WALL_COLORS,
  planarUV,
} from "./graphics.mjs";

const mat = (color, roughness = 0.8, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });
function box(parent, size, pos, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  m.position.set(...pos);
  parent.add(m);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function roundedBox(parent, size, pos, material, radius = 0.02) {
  const [w, h, d] = size,
    r = Math.min(radius, w / 3, h / 3),
    s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  const geometry = new THREE.ExtrudeGeometry(s, {
    depth: d,
    bevelEnabled: true,
    bevelSize: Math.min(0.004, d / 5),
    bevelThickness: Math.min(0.004, d / 5),
    bevelSegments: 2,
    steps: 1,
  });
  geometry.translate(0, 0, -d / 2);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...pos);
  mesh.castShadow = true;
  parent.add(mesh);
  return mesh;
}
function cylinderBetween(parent, a, b, r, material) {
  const av = new THREE.Vector3(...a),
    bv = new THREE.Vector3(...b),
    d = bv.clone().sub(av);
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, d.length(), 8), material);
  mesh.position.copy(av.add(bv).multiplyScalar(0.5));
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  parent.add(mesh);
  return mesh;
}
function cabinBeam(parent, a, b, width, depth, material) {
  const av = new THREE.Vector3(...a),
    bv = new THREE.Vector3(...b),
    direction = bv.clone().sub(av);
  const mesh = box(
    parent,
    [width, direction.length(), depth],
    av.clone().add(bv).multiplyScalar(0.5).toArray(),
    material,
  );
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
  return mesh;
}
function dashboard(parent, width, height, material, tall) {
  const positions = [],
    indices = [],
    profile = [
      [-1.46, 0.01],
      [-1.18, 0.065],
      [-0.7, 0.025],
      [-0.48, -0.02],
      [-0.46, -0.1],
      [-0.57, -0.26],
      [-1.46, -0.3],
    ],
    n = 32;
  for (let i = 0; i <= n; i++) {
    const x = -width / 2 + (width * i) / n,
      bulge = Math.exp(-(((x - 0.4) / 0.29) ** 2)) * (tall ? 0.025 : 0.012),
      curve = 0.08 * Math.cos((x / width) * Math.PI);
    for (const [z, y] of profile) positions.push(x, height + y + bulge, z + curve);
  }
  const count = profile.length;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < count; j++) {
      const a = i * count + j,
        b = (i + 1) * count + j,
        c = (i + 1) * count + ((j + 1) % count),
        d = i * count + ((j + 1) % count);
      indices.push(a, d, b, b, d, c);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}
function canvasTexture(w, h, paint) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext("2d");
  paint?.(context, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { canvas, context, texture };
}
function surfaceTexture(type) {
  return canvasTexture(512, 512, (c, w, h) => {
    c.fillStyle = type === "fabric" ? "#b1b1ac" : "#6f7275";
    c.fillRect(0, 0, w, h);
    let seed = 47;
    for (let i = 0; i < 18000; i++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const x = seed % 512;
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const y = seed % 512;
      c.fillStyle = i % 2 ? "#ffffff13" : "#00000020";
      c.fillRect(x, y, type === "fabric" ? 2 : 1, type === "fabric" ? 1 : 2);
    }
  }).texture;
}
function shapeSolid(parent, points, depth, position, material) {
  const s = new THREE.Shape(points.map((p) => new THREE.Vector2(...p)));
  const g = new THREE.ExtrudeGeometry(s, {
    depth,
    bevelEnabled: true,
    bevelSize: 0.004,
    bevelThickness: 0.003,
    bevelSegments: 3,
  });
  g.translate(0, 0, -depth / 2);
  const m = new THREE.Mesh(g, material);
  m.position.set(...position);
  m.castShadow = true;
  parent.add(m);
  return m;
}
function labelTexture(text, color = "#e9f1e5", bg = "#234758") {
  return canvasTexture(512, 128, (c, w, h) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = color;
    c.textAlign = "center";
    c.font = "bold 48px Malgun Gothic";
    c.fillText(text, w / 2, 83);
  }).texture;
}
function disposeGroup(group) {
  group.traverse((o) => {
    o.geometry?.dispose();
  });
  group.clear();
}

export function makeTrafficCar(kind = "sedan", color = "#e8eceb") {
  const g = new THREE.Group(),
    van = kind === "van",
    body = mat(color, 0.28, { metalness: 0.3 }),
    glass = mat("#0f1a1f", 0.08, { metalness: 0.6, envMapIntensity: 1.4, side: THREE.DoubleSide }),
    rubber = mat("#162126");
  const length = van ? 4.9 : 4.3,
    width = van ? 1.85 : 1.72;
  roundedBox(g, [width, 0.52, length], [0, 0.56, 0], body, 0.11);
  const low = 0.79,
    high = van ? 1.69 : 1.4,
    front = van ? -length * 0.31 : -length * 0.16,
    rear = length * 0.24;
  const cabinPoints = [
    [-width * 0.44, low, -length * 0.35],
    [width * 0.44, low, -length * 0.35],
    [width * 0.39, high, front],
    [-width * 0.39, high, front],
    [-width * 0.44, low, length * 0.36],
    [width * 0.44, low, length * 0.36],
    [width * 0.39, high, rear],
    [-width * 0.39, high, rear],
  ];
  const cabinGeometry = new THREE.BufferGeometry();
  cabinGeometry.setAttribute("position", new THREE.Float32BufferAttribute(cabinPoints.flat(), 3));
  cabinGeometry.setIndex([
    0, 1, 2, 0, 2, 3, 1, 5, 6, 1, 6, 2, 5, 4, 7, 5, 7, 6, 4, 0, 3, 4, 3, 7, 3, 2, 6, 3, 6, 7,
  ]);
  cabinGeometry.computeVertexNormals();
  const cabin = new THREE.Mesh(cabinGeometry, glass);
  g.add(cabin);
  roundedBox(
    g,
    [width * 0.8, 0.055, rear - front + 0.06],
    [0, high + 0.008, (rear + front) / 2],
    body,
    0.035,
  );
  for (const side of [-1, 1]) {
    box(g, [0.055, high - low, length * 0.03], [side * width * 0.418, (low + high) / 2, 0.05], body);
    roundedBox(g, [0.12, 0.075, 0.22], [side * (width / 2 + 0.03), low + 0.12, -length * 0.23], body, 0.025);
  }
  box(g, [width, 0.12, 0.3], [0, 0.65, -length * 0.47], mat("#dbe9e5", 0.3));
  const lamps = [];
  for (const x of [-width * 0.34, width * 0.34]) {
    box(
      g,
      [0.31, 0.1, 0.04],
      [x, 0.67, -length / 2 - 0.02],
      mat("#f4f6c8", 0.3, { emissive: "#f2e4a5", emissiveIntensity: 0.3 }),
    );
    const rear = mat("#9f2526", 0.4, { emissive: "#f33325", emissiveIntensity: 0.12 });
    box(g, [0.31, 0.12, 0.04], [x, 0.7, length / 2 + 0.02], rear);
    lamps.push(rear);
    for (const z of [-length * 0.31, length * 0.31]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.17, 12), rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x < 0 ? -width / 2 : width / 2, 0.32, z);
      g.add(wheel);
    }
  }
  box(g, [0.34, 0.12, 0.02], [0, 0.5, length / 2 + 0.03], mat("#ece9dc"));
  g.userData.lamps = lamps;
  g.userData.body = body;
  return g;
}

export class DriveRenderer {
  constructor(canvas) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.quality = 2;
    this.mirrorEvery = 3;
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = HAZE.clone();
    this.scene.fog = new THREE.FogExp2(HAZE.clone(), 0.00085);
    this.sky = makeSky();
    this.scene.add(this.sky);
    this.textures = {
      asphalt: asphaltTexture(),
      grass: grassTexture(),
      concrete: concreteTexture(),
    };
    this.facades = WALL_COLORS.map((c) => {
      const m = mat("#ffffff", 0.9, { map: facadeTexture(c) });
      return m;
    });
    const skyFaces = Array.from({ length: 6 }, (_, i) => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const p = c.getContext("2d"),
        g = p.createLinearGradient(0, 0, 0, 64);
      g.addColorStop(0, i === 3 ? "#424b50" : "#dce5e7");
      g.addColorStop(1, "#697c81");
      p.fillStyle = g;
      p.fillRect(0, 0, 64, 64);
      return c;
    });
    const environment = new THREE.CubeTexture(skyFaces);
    environment.colorSpace = THREE.SRGBColorSpace;
    environment.needsUpdate = true;
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.55;
    this.scene.add(new THREE.HemisphereLight("#d6ecff", "#6f7a5c", 1.35));
    // The sun and its shadow frustum follow the car so nearby shadows stay
    // crisp wherever the drive goes.
    const sun = new THREE.DirectionalLight("#fff1d6", 3.1);
    sun.position.copy(SUN_DIRECTION).multiplyScalar(220);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -75, right: 75, top: 75, bottom: -75, near: 10, far: 520 });
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    this.world = new THREE.Group();
    this.roadsGroup = new THREE.Group();
    this.buildingGroup = new THREE.Group();
    this.parkingGroup = new THREE.Group();
    this.signalGroup = new THREE.Group();
    this.trafficGroup = new THREE.Group();
    this.scene.add(
      this.world,
      this.roadsGroup,
      this.buildingGroup,
      this.parkingGroup,
      this.signalGroup,
      this.trafficGroup,
    );
    this.terrainGroup = new THREE.Group();
    this.scene.add(this.terrainGroup);
    this.ruleGroup = new THREE.Group();
    this.scene.add(this.ruleGroup);
    const cabinLight = new THREE.PointLight("#e7ecf0", 1.4, 3.5, 1);
    cabinLight.position.set(0.1, 1.5, 0.35);
    this.rigLight = cabinLight;
    this.rig = new THREE.Group();
    this.rig.rotation.order = "YXZ";
    this.scene.add(this.rig);
    this.rig.add(cabinLight);
    this.camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.035, 5000);
    this.rig.add(this.camera);
    this.introCamera = new THREE.PerspectiveCamera(46, innerWidth / innerHeight, 0.1, 6000);
    this.interior = new THREE.Group();
    this.rig.add(this.interior);
    this.externalCar = makeTrafficCar("van");
    this.scene.add(this.externalCar);
    this.base = { x: 0, y: 0 };
    this.elevation = () => 0;
    this.trafficBatches = new Map();
    this.signalHeads = [];
    this.mirrors = [];
    this.lastRoads = "";
    this.lastCar = "";
    this.parked = [];
    this.frame = 0;
    this.aerialTextures = new Map();
    this.nav = canvasTexture(768, 448);
    this.meter = canvasTexture(768, 256);
    this.lastNav = 0;
    this.mirrorOverlay = new THREE.Scene();
    this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
    this.overlayCamera.position.z = 2;
    this.overlayMirrors = [];
    this.reverseTarget = new THREE.WebGLRenderTarget(768, 448);
    this.reverseCamera = new THREE.PerspectiveCamera(74, 768 / 448, 0.12, 200);
    this.reverseGuidesGroup = new THREE.Group();
    this.reverseGuidesGroup.visible = false;
    this.scene.add(this.reverseGuidesGroup);
    this.reverseCamera.layers.enable(31);
    this.reverseCamera.fov = 88;
    this.reverseCamera.updateProjectionMatrix();
    this.reverseTarget.texture.repeat.x = -1;
    this.reverseTarget.texture.offset.x = 1;
    this.guideMaterials = {
      blue: new THREE.MeshBasicMaterial({
        color: "#5cafff",
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      yellow: new THREE.MeshBasicMaterial({
        color: "#ffe058",
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
      red: new THREE.MeshBasicMaterial({
        color: "#ff5147",
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    };
    const warning = canvasTexture(1024, 96, (c, w, h) => {
      c.fillStyle = "#00000080";
      c.fillRect(0, 0, w, h);
      c.textAlign = "center";
      c.font = "38px Malgun Gothic";
      c.fillStyle = "#fff";
      c.fillText("주변을 직접 확인하세요", w / 2, 65);
    });
    warning.texture.repeat.x = -1;
    warning.texture.offset.x = 1;
    const warningMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.9, 0.085),
      new THREE.MeshBasicMaterial({
        map: warning.texture,
        transparent: true,
        depthTest: false,
        depthWrite: false,
      }),
    );
    warningMesh.position.set(0, -0.22, -0.3);
    warningMesh.layers.set(31);
    warningMesh.renderOrder = 100;
    this.reverseCamera.add(warningMesh);
    this.scene.add(this.reverseCamera);
    const ocean = new THREE.Mesh(
      new THREE.PlaneGeometry(200000, 200000),
      mat("#4d9baf", 0.25, { metalness: 0.18 }),
    );
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.y = -0.45;
    this.scene.add(ocean);
    this.ocean = ocean;
  }
  // Automatic quality: shared classroom PCs vary widely, so when frames take
  // too long the renderer steps down instead of stuttering.
  // 2 = full, 1 = medium, 0 = low.
  setQuality(level) {
    this.quality = Math.max(0, Math.min(2, level));
    const ratio = [0.75, 1, Math.min(devicePixelRatio, 1.5)][this.quality],
      shadow = [512, 1024, 2048][this.quality];
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(innerWidth, innerHeight);
    this.sun.shadow.mapSize.set(shadow, shadow);
    this.sun.shadow.map?.dispose();
    this.sun.shadow.map = null;
    this.mirrorEvery = [6, 4, 3][this.quality];
  }
  adaptQuality() {
    const now = performance.now(),
      dt = now - (this.lastRenderAt ?? now);
    this.lastRenderAt = now;
    if (dt <= 0 || dt > 400) return;
    this.frameMs = (this.frameMs ?? 16) * 0.95 + dt * 0.05;
    this.qualityTimer = (this.qualityTimer || 0) + dt;
    if (this.qualityTimer > 3000 && this.frameMs > 36 && this.quality > 0) {
      this.setQuality(this.quality - 1);
      this.qualityTimer = 0;
      this.frameMs = 20;
    }
  }
  setView(settings) {
    this.view = viewSettings(settings);
  }
  local(p, y = 0) {
    return new THREE.Vector3(p.x - this.base.x, this.elevation(p) + y, p.y - this.base.y);
  }
  setup({ base, roads, features, coast, elevation, signals, bays, car, projection }) {
    this.ruleSignature = null;
    this.base = { ...base };
    this.surface = groundSurface(elevation || (() => 0));
    this.elevation = this.surface.height;
    this.bays = bays || [];
    this.signals = signals || [];
    this.lastNav = -Infinity;
    this.ocean.position.x = 0;
    this.ocean.position.z = 0;
    disposeGroup(this.world);
    if (coast?.length) {
      const shape = new THREE.Shape(coast.map((p) => new THREE.Vector2(p.x - base.x, -(p.y - base.y))));
      const land = new THREE.Mesh(
        new THREE.ShapeGeometry(shape),
        mat("#ffffff", 1, { map: this.textures.grass }),
      );
      land.rotation.x = -Math.PI / 2;
      land.position.y = -0.12;
      land.receiveShadow = true;
      this.world.add(land);
    } else {
      const land = new THREE.Mesh(
        new THREE.PlaneGeometry(15000, 15000),
        mat("#ffffff", 1, { map: this.textures.grass }),
      );
      land.rotation.x = -Math.PI / 2;
      land.position.y = -0.08;
      land.receiveShadow = true;
      this.world.add(land);
    }
    this.terrainCenter = null;
    this.setTerrain(base);
    this.lastRoads = "";
    this.setRoads(roads);
    this.setBuildings(features || []);
    this.setParking(this.bays);
    this.setSignals(this.signals, roads);
    this.setCar(car);
    if (projection) this.addAerial(projection);
  }
  setTerrain(focus) {
    const center = { x: Math.round(focus.x / 400) * 400, y: Math.round(focus.y / 400) * 400 };
    if (this.terrainCenter && center.x === this.terrainCenter.x && center.y === this.terrainCenter.y) return;
    this.terrainCenter = center;
    disposeGroup(this.terrainGroup);
    const positions = [],
      colors = [],
      range = 1600,
      step = 25;
    for (let x = center.x - range; x < center.x + range; x += step)
      for (let y = center.y - range; y < center.y + range; y += step) {
        const pts = [
          { x, y },
          { x: x + step, y },
          { x: x + step, y: y + step },
          { x, y: y + step },
        ];
        for (const i of [0, 2, 1, 0, 3, 2]) {
          const h = this.elevation(pts[i]);
          positions.push(pts[i].x - this.base.x, h, pts[i].y - this.base.y);
          // Lowland fields and settlements are paler; hills carry denser forest.
          const c = new THREE.Color(h > 30 ? "#7f9a78" : "#c4c9b1");
          colors.push(c.r, c.g, c.b);
        }
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeVertexNormals();
    planarUV(g, 9);
    const mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, map: this.textures.grass }),
    );
    mesh.receiveShadow = true;
    this.terrainGroup.add(mesh);
  }
  addAerial(projection) {
    const z = 18,
      n = 2 ** z;
    const geo = (x, y) => [
      (x / n) * 360 - 180,
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
    ];
    for (let tx = 224191; tx <= 224195; tx++)
      for (let ty = 110898; ty <= 110900; ty++) {
        const sw = projection.toLocal(geo(tx, ty + 1)),
          ne = projection.toLocal(geo(tx + 1, ty));
        const width = ne.x - sw.x,
          depth = sw.y - ne.y,
          cx = (sw.x + ne.x) / 2,
          cy = (sw.y + ne.y) / 2;
        const draped = this.surface.drape([{ x: sw.x, y: ne.y }, ne, { x: ne.x, y: sw.y }, sw], 0.008),
          vertices = [],
          uv = [];
        for (const p of draped) {
          vertices.push(p.x - this.base.x, p.height, p.y - this.base.y);
          uv.push((p.x - sw.x) / width, 1 - (p.y - ne.y) / depth);
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geometry.computeVertexNormals();
        const key = `${tx}-${ty}`;
        let texture = this.aerialTextures.get(key);
        if (!texture) {
          texture = new THREE.TextureLoader().load(
            new URL(`references/gsi-18-${key}.jpg`, import.meta.url).href,
          );
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = 4;
          this.aerialTextures.set(key, texture);
        }
        // Orthophotos already contain sunlight; light them softly so they do
        // not bleach white under the scene's sun.
        const mesh = new THREE.Mesh(
          geometry,
          new THREE.MeshStandardMaterial({ map: texture, roughness: 1, color: "#b9b9b2", envMapIntensity: 0.2 }),
        );
        mesh.receiveShadow = true;
        this.world.add(mesh);
      }
  }
  setRoads(roads) {
    const signature = roads.map((r) => r.id).join("|");
    if (signature === this.lastRoads) return;
    this.lastRoads = signature;
    disposeGroup(this.roadsGroup);
    const p = [],
      mark = [],
      shoulders = [];
    const addPolygon = (array, polygon, lift) => {
      for (const q of this.surface.drape(polygon, lift))
        array.push(q.x - this.base.x, q.height, q.y - this.base.y);
    };
    const addQuad = (array, a, b, width, offset = 0, lift = 0.04) => {
      const dx = b.x - a.x,
        dz = b.y - a.y,
        len = Math.hypot(dx, dz);
      if (!len) return;
      const nx = dz / len,
        nz = -dx / len;
      const points = [
        [-width / 2, 0],
        [width / 2, 0],
        [width / 2, 1],
        [-width / 2, 1],
      ].map(([side, t]) => ({
        x: a.x + dx * t + nx * (side + offset),
        y: a.y + dz * t + nz * (side + offset),
      }));
      addPolygon(array, points, lift + 0.1);
    };
    for (const r of roads) {
      const width = roadWidth(r.tags);
      for (const quad of ribbonSections(r.points, width + 0.6)) addPolygon(shoulders, quad, 0.075);
      for (const quad of ribbonSections(r.points, width)) addPolygon(p, quad, 0.12);
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1],
          b = r.points[i];
        if (r.tags.highway !== "service") {
          for (const side of [-1, 1]) addQuad(mark, a, b, 0.1, side * (width / 2 - 0.17), 0.065);
          if (width > 5.3 && !["yes", "1", "-1"].includes(r.tags.oneway)) {
            const len = Math.hypot(b.x - a.x, b.y - a.y);
            for (let d = 0; d < len; d += 7) {
              const t = d / len,
                u = Math.min(d + 3, len) / len;
              addQuad(
                mark,
                { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t },
                { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u },
                0.1,
                0,
                0.068,
              );
            }
          }
        }
      }
    }
    for (const [data, material, scale] of [
      [shoulders, mat("#ffffff", 0.95, { map: this.textures.concrete }), 3],
      [p, mat("#ffffff", 0.93, { map: this.textures.asphalt }), 5],
      [mark, mat("#f4f2e4", 0.7), 0],
    ]) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.Float32BufferAttribute(data, 3));
      geo.computeVertexNormals();
      if (scale) planarUV(geo, scale);
      const mesh = new THREE.Mesh(geo, material);
      mesh.receiveShadow = true;
      this.roadsGroup.add(mesh);
    }
  }
  setBuildings(features) {
    disposeGroup(this.buildingGroup);
    const roof = mat("#ffffff", 0.95, { map: this.textures.concrete });
    const pick = (id) => {
      let n = 2166136261;
      for (const ch of String(id)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
      return this.facades[(n >>> 0) % this.facades.length];
    };
    for (const f of features) {
      if (!f.tags.building) continue;
      const levels = Number(f.tags["building:levels"]);
      // Massing heights inferred from mapped floor count are approximations;
      // source quality is documented in the data panel, not presented as CAD.
      const height = f.height ?? (levels ? levels * 3.1 : 3.1);
      const shape = new THREE.Shape(
        f.points.map((p) => new THREE.Vector2(p.x - this.base.x, -(p.y - this.base.y))),
      );
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2);
      // Extruded side walls get metre-scale UVs, so one facade tile is one
      // storey by one window bay.
      const mesh = new THREE.Mesh(geometry, [roof, pick(f.id ?? f.center.x)]);
      mesh.position.y = this.elevation(f.center);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.buildingGroup.add(mesh);
      if (f.tags.name?.includes("カンプー"))
        this.signBoard("SUNSET RESORT CANPHOU", f.center, height * 0.76, 0.0, this.buildingGroup);
    }
    // Surface polygons are geographic map geometry, not invented parking lots.
    for (const f of features.filter((f) => f.tags.amenity === "parking")) {
      const positions = this.surface
        .drape(f.points, 0.025)
        .flatMap((p) => [p.x - this.base.x, p.height, p.y - this.base.y]);
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      g.computeVertexNormals();
      const m = new THREE.Mesh(
        g,
        mat("#8a8b80", 0.98, { transparent: true, opacity: 0.14, depthWrite: false }),
      );
      m.receiveShadow = true;
      this.buildingGroup.add(m);
    }
  }
  signBoard(text, point, height, heading, parent = this.world) {
    const material = new THREE.MeshBasicMaterial({ map: labelTexture(text), side: THREE.DoubleSide });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(8, 1.8), material);
    m.position.copy(this.local(point, height));
    m.rotation.y = heading;
    parent.add(m);
  }
  setParking(bays) {
    disposeGroup(this.parkingGroup);
    for (const [i, b] of bays.entries()) {
      const target = b.target ?? i === 1,
        points = b.points.map((p) => this.local(p, 0.15));
      points.push(points[0].clone());
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({ color: target ? "#b6f5a5" : "#f0efdf" }),
      );
      this.parkingGroup.add(line);
      const positions = this.surface
          .drape(b.points, 0.14)
          .flatMap((p) => [p.x - this.base.x, p.height, p.y - this.base.y]),
        geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const fill = new THREE.Mesh(
        geometry,
        new THREE.MeshBasicMaterial({
          color: "#a2e28c",
          transparent: true,
          opacity: target ? 0.16 : 0.03,
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
      );
      this.parkingGroup.add(fill);
    }
  }
  setSignals(signals, roads) {
    disposeGroup(this.signalGroup);
    this.signalHeads = [];
    for (const s of signals) {
      if (Math.hypot(s.x - this.base.x, s.y - this.base.y) > 1800) continue;
      let nearest = { distance: Infinity, heading: 0 };
      for (const r of roads)
        for (let i = 1; i < r.points.length; i++) {
          const p = r.points[i];
          const d = Math.hypot(p.x - s.x, p.y - s.y);
          if (d < nearest.distance)
            nearest = {
              distance: d,
              heading: Math.atan2(p.x - r.points[i - 1].x, -(p.y - r.points[i - 1].y)),
            };
        }
      s.approachHeading = nearest.heading;
      s.axis = nearest.heading;
      const group = new THREE.Group();
      group.position.copy(this.local(s));
      group.rotation.y = -s.axis;
      const metal = mat("#747e7f", 0.4, { metalness: 0.5 });
      cylinderBetween(group, [4, 0, 0], [4, 5.4, 0], 0.075, metal);
      cylinderBetween(group, [4, 5.2, 0], [0.5, 5.2, 0], 0.055, metal);
      const heads = [];
      for (const turn of [0, Math.PI]) {
        const head = new THREE.Group();
        head.rotation.y = turn;
        head.position.set(0.5, 5.0, 0);
        box(head, [1.15, 0.42, 0.28], [0, 0, 0], mat("#394b50"));
        const bulbs = [];
        for (const [i, color] of ["#32965b", "#b59432", "#933c39"].entries()) {
          const bulb = new THREE.Mesh(
            new THREE.CircleGeometry(0.135, 16),
            new THREE.MeshBasicMaterial({ color }),
          );
          bulb.position.set(-0.37 + i * 0.37, 0, 0.151);
          head.add(bulb);
          bulbs.push(bulb);
        }
        group.add(head);
        heads.push(bulbs);
      }
      this.signalGroup.add(group);
      this.signalHeads.push({ signal: s, heads });
      // Stop line on each approach, at the mapped signal location.
      const stopPolygon = [
        [-3.15, 4.86],
        [-0.05, 4.86],
        [-0.05, 5.14],
        [-3.15, 5.14],
      ].map(([x, z]) => ({
        x: s.x + x * Math.cos(s.axis) - z * Math.sin(s.axis),
        y: s.y + x * Math.sin(s.axis) + z * Math.cos(s.axis),
      }));
      const stopPositions = this.surface
          .drape(stopPolygon, 0.17)
          .flatMap((p) => [p.x - this.base.x, p.height, p.y - this.base.y]),
        stopGeometry = new THREE.BufferGeometry();
      stopGeometry.setAttribute("position", new THREE.Float32BufferAttribute(stopPositions, 3));
      stopGeometry.computeVertexNormals();
      this.signalGroup.add(new THREE.Mesh(stopGeometry, mat("#f3f0df")));
    }
    synchronizeSignals(signals);
  }
  setCar(car) {
    if (this.lastCar === car.id) return;
    this.lastCar = car.id;
    this.car = car;
    disposeGroup(this.interior);
    for (const m of this.mirrors) m.target.dispose();
    this.mirrors = [];
    this.overlayMirrors = [];
    this.meter.texture.dispose();
    this.meter = canvasTexture(car.id === "prius" ? 1024 : 768, car.id === "prius" ? 160 : 256);
    const cockpit = buildCockpit({
      parent: this.interior,
      car,
      navTexture: this.nav.texture,
      meterTexture: this.meter.texture,
    });
    this.steeringWheel = cockpit.wheel;
    this.navigation = cockpit.navigation;
    this.navigationAnchor = cockpit.navigationAnchor;
    this.cockpitLayout = cockpit.layout;
    for (const mount of cockpit.mirrors) {
      // Side mirrors: convex glass, about 42° wide. Cabin mirror: about 44°.
      const target = new THREE.WebGLRenderTarget(512, mount.side ? 288 : 160, {
          generateMipmaps: true,
          minFilter: THREE.LinearMipmapLinearFilter,
          samples: 2,
        }),
        camera = new THREE.PerspectiveCamera(mount.side ? 24 : 15, 512 / (mount.side ? 288 : 160), 0.08, 1500);
      mount.plane.material.map = target.texture;
      this.mirrors.push({ ...mount, target, camera });
    }
    this.scene.remove(this.externalCar);
    // Your own car, seen on the title screen and in the door mirrors.
    this.externalCar = makeCarModel(car.id);
    this.scene.add(this.externalCar);
  }
  setRoadRules(records, roads, focus = this.base) {
    const signature =
      records.length + ":" + roads.length + ":" + Math.floor(focus.x / 500) + ":" + Math.floor(focus.y / 500);
    if (this.ruleSignature === signature) return;
    this.ruleSignature = signature;
    disposeGroup(this.ruleGroup);
    for (const rule of records) {
      if (Math.hypot(rule.x - focus.x, rule.y - focus.y) > 2100) continue;
      let best = { distance: Infinity, heading: 0 };
      for (const road of roads)
        for (let i = 1; i < road.points.length; i++) {
          const match = nearestOnSegment(rule, road.points[i - 1], road.points[i]);
          if (match.distance < best.distance)
            best = { ...match, heading: headingBetween(road.points[i - 1], road.points[i]), road };
        }
      if (best.distance > 16) continue;
      const group = new THREE.Group();
      group.position.copy(this.local(rule));
      group.rotation.y = -best.heading;
      this.ruleGroup.add(group);
      const pole = mat("#9aaba9", 0.5, { metalness: 0.35 });
      if (rule.tags.highway === "speed_camera") {
        cylinderBetween(group, [3.8, 0, 0], [3.8, 3.6, 0], 0.06, pole);
        roundedBox(group, [0.5, 0.36, 0.35], [3.8, 3.3, 0], mat("#d6dcd8"), 0.025);
        for (const x of [3.67, 3.92]) {
          const lens = new THREE.Mesh(
            new THREE.CircleGeometry(0.065, 20),
            mat("#112a36", 0.15, { metalness: 0.65 }),
          );
          lens.position.set(x, 3.3, 0.183);
          group.add(lens);
        }
      } else {
        cylinderBetween(group, [-3.7, 0, 0], [-3.7, 2.5, 0], 0.035, pole);
        const tex = canvasTexture(256, 256, (c, w, h) => {
          c.fillStyle = "#ba3838";
          c.beginPath();
          c.moveTo(w * 0.5, h * 0.91);
          c.lineTo(w * 0.05, h * 0.1);
          c.lineTo(w * 0.95, h * 0.1);
          c.closePath();
          c.fill();
          c.strokeStyle = "#fff";
          c.lineWidth = 9;
          c.stroke();
          c.fillStyle = "#fff";
          c.font = "bold 38px sans-serif";
          c.textAlign = "center";
          c.fillText("止まれ", w / 2, h * 0.43);
        });
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(0.65, 0.65),
          new THREE.MeshBasicMaterial({ map: tex.texture, transparent: true, side: THREE.DoubleSide }),
        );
        sign.position.set(-3.7, 2.35, 0.01);
        group.add(sign);
      }
    }
  }
  createMirror(side, eye) {
    const target = new THREE.WebGLRenderTarget(384, 224);
    const camera = new THREE.PerspectiveCamera(52, 384 / 224, 0.1, 1000);
    const frame = box(
      this.interior,
      [0.28, 0.17, 0.065],
      [side * (this.car.width / 2 + 0.06), eye - 0.23, -1.08],
      mat("#20282b", 0.4),
    );
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(0.25, 0.14),
      new THREE.MeshBasicMaterial({ map: target.texture, side: THREE.DoubleSide }),
    );
    plane.position.set(frame.position.x, frame.position.y, frame.position.z + 0.036);
    plane.scale.x = -1;
    this.interior.add(plane);
    this.mirrors.push({ target, camera, plane, side });
  }
  // Mirror insets drawn over the cockpit view. Portrait phones show both door
  // mirrors; landscape shows only the passenger-side (left) mirror, which a
  // right-hand-drive driver sees about 50° to the left, outside a normal
  // monitor's frame. It hides while the player glances toward it with Q.
  drawMirrorInsets(width, height, portrait) {
    if (this.overlayMirrors.length !== 2) {
      disposeGroup(this.mirrorOverlay);
      this.overlayMirrors = [];
      for (const side of [-1, 1]) {
        const group = new THREE.Group(),
          bg = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: "#0e1b20" }));
        group.add(bg);
        const mirror = this.mirrors.find((m) => m.side === side),
          plane = new THREE.Mesh(
            new THREE.PlaneGeometry(1, 1),
            new THREE.MeshBasicMaterial({ map: mirror.target.texture }),
          );
        plane.position.z = 0.01;
        group.add(plane);
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(1, 1),
          new THREE.MeshBasicMaterial({
            map: labelTexture(side < 0 ? "왼쪽 미러" : "오른쪽 미러", "#c3d5c9", "#0e1b20"),
          }),
        );
        label.position.z = 0.02;
        group.add(label);
        this.mirrorOverlay.add(group);
        this.overlayMirrors.push({ side, group, bg, plane, label });
      }
    }
    Object.assign(this.overlayCamera, { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 });
    this.overlayCamera.updateProjectionMatrix();
    const mw = portrait ? width * 0.39 : Math.min(300, width * 0.2),
      mh = mw * 0.56,
      glancingLeft = (this.headYaw ?? 0) > 0.4;
    let shown = 0;
    for (const m of this.overlayMirrors) {
      m.group.visible = portrait || this.debugInsets || (m.side < 0 && !glancingLeft);
      if (!m.group.visible) continue;
      shown++;
      if (portrait) m.group.position.set(m.side * width * 0.26, height * 0.5 - height * 0.23 - mh / 2, 0);
      else m.group.position.set(m.side * (width / 2 - mw / 2 - 18), height * 0.08, 0);
      m.bg.scale.set(mw + 6, mh + 24, 1);
      // Mirror textures are already mirrored by the camera flip below.
      m.plane.scale.set(-mw, mh, 1);
      m.label.scale.set(mw, 18, 1);
      m.label.position.y = mh / 2 + 4;
    }
    if (!shown) return;
    this.renderer.autoClear = false;
    this.renderer.clearDepth();
    this.renderer.render(this.mirrorOverlay, this.overlayCamera);
    this.renderer.autoClear = true;
  }
  updateDisplays({ speed, gear, steer, navInfo, drawNavigation, parkingBrake, signal, time, blinker, blinkerLit }) {
    this.steeringWheel.rotation.z = -steer * 12;
    const blinkState = blinker && blinkerLit ? blinker : 0;
    if (time - this.lastNav < 0.1 && blinkState === this.lastBlink) return;
    this.lastNav = time;
    this.lastBlink = blinkState;
    const c = this.nav.context,
      w = this.nav.canvas.width,
      h = this.nav.canvas.height;
    const mapScale =
      navInfo?.parkingDistance < 35 ? 7 : navInfo?.distanceToTurn < 70 ? 3.8 : speed > 13 ? 1.8 : 2.8;
    this.mapScale = mapScale;
    drawNavigation(c, w, h, mapScale);
    drawNavOverlay(c, w, h, navInfo);
    this.nav.texture.needsUpdate = true;
    const m = this.meter.context,
      mw = this.meter.canvas.width,
      mh = this.meter.canvas.height,
      tall = this.car.id === "alphard";
    m.fillStyle = "#08121b";
    m.fillRect(0, 0, mw, mh);
    const arrows = () => {
      for (const side of [-1, 1]) {
        const x = mw / 2 + side * mw * 0.46,
          y = mh * 0.2,
          r = mh * 0.09;
        m.beginPath();
        m.moveTo(x + side * r, y);
        m.lineTo(x - side * r * 0.4, y - r);
        m.lineTo(x - side * r * 0.4, y + r);
        m.closePath();
        m.fillStyle = blinkState === side ? "#45f27e" : "#1b2f29";
        m.fill();
      }
    };

    if (!tall) {
      m.textAlign = "center";
      m.fillStyle = "#bdeddd";
      m.font = "92px Segoe UI";
      m.fillText(Math.round(speed * 3.6), mw * 0.255, mh * 0.76);
      m.font = "24px Segoe UI";
      m.fillText("km/h", mw * 0.345, mh * 0.76);
      m.font = "35px Segoe UI";
      m.fillText(parkingBrake ? "P" : gear > 0 ? "D" : "R", mw * 0.085, mh * 0.7);
      m.fillStyle = "#7da798";
      m.font = "21px Malgun Gothic";
      m.fillText("주행 준비", mw * 0.43, mh * 0.76);
      m.fillText("CHG      ECO      PWR", mw * 0.75, mh * 0.32);
      m.fillStyle = "#3c7167";
      m.fillRect(mw * 0.56, mh * 0.48, mw * 0.35, mh * 0.13);
      m.fillStyle = "#b1dbad";
      m.fillRect(mw * 0.56, mh * 0.48, mw * 0.14, mh * 0.13);
      m.fillStyle = "#b8cfc7";
      m.font = "19px Malgun Gothic";
      m.fillText("하이브리드 시스템", mw * 0.75, mh * 0.87);
      arrows();
      this.meter.texture.needsUpdate = true;
      return;
    }
    const gauge = (x, y, r, color) => {
      m.beginPath();
      m.arc(x, y, r, Math.PI * 0.75, Math.PI * 2.25);
      m.strokeStyle = color;
      m.lineWidth = 3;
      m.stroke();
      m.beginPath();
      m.arc(x, y, r - 7, Math.PI * 0.75, Math.PI * 2.25);
      m.strokeStyle = "#36607866";
      m.lineWidth = 8;
      m.stroke();
      for (let i = 0; i < 13; i++) {
        const a = Math.PI * 0.75 + (i / 12) * Math.PI * 1.5;
        m.beginPath();
        m.moveTo(x + Math.cos(a) * (r - 11), y + Math.sin(a) * (r - 11));
        m.lineTo(x + Math.cos(a) * (r - 20), y + Math.sin(a) * (r - 20));
        m.strokeStyle = "#c7dfec";
        m.lineWidth = 1.5;
        m.stroke();
      }
    };
    if (tall) {
      gauge(mw * 0.21, mh * 0.56, 89, "#55afe3");
      gauge(mw * 0.79, mh * 0.56, 89, "#55afe3");
      m.textAlign = "center";
      m.font = "16px Segoe UI";
      m.fillStyle = "#83aec5";
      m.fillText("CHG   ECO   PWR", mw * 0.21, mh * 0.56);
      m.fillText("km/h", mw * 0.79, mh * 0.6);
    } else gauge(mw * 0.54, mh * 0.6, 91, "#6bb8a2");
    m.textAlign = "center";
    m.fillStyle = "#eff8fb";
    m.font = `${tall ? "78" : "82"}px Segoe UI`;
    m.fillText(Math.round(speed * 3.6), mw * (tall ? 0.5 : 0.54), mh * 0.62);
    m.font = "19px Segoe UI";
    m.fillStyle = "#b3c6cd";
    m.fillText("km/h", mw * (tall ? 0.5 : 0.54), mh * 0.77);
    m.fillStyle = "#a3dfbc";
    m.font = "32px Segoe UI";
    m.fillText(
      parkingBrake ? "P" : gear > 0 ? "D" : "R",
      mw * (tall ? 0.5 : 0.18),
      mh * (tall ? 0.25 : 0.58),
    );
    m.font = "15px Malgun Gothic";
    m.fillText("주행 준비", mw * 0.18, mh * 0.87);
    m.fillStyle = "#84a6b9";
    m.font = "15px Malgun Gothic";
    m.fillText("경제 운전", mw * 0.8, mh * 0.88);
    m.fillStyle = "#5caea4";
    m.fillRect(mw * 0.66, mh * 0.14, mw * 0.22, 3);
    arrows();
    this.meter.texture.needsUpdate = true;
  }
  syncTraffic(cars, time) {
    // Batch each shared body part so dense traffic also works on small screens.
    const matrix = new THREE.Matrix4(),
      rotation = new THREE.Quaternion(),
      scale = new THREE.Vector3(1, 1, 1),
      color = new THREE.Color();
    for (const kind of ["sedan", "van"]) {
      const group = cars.filter((c) => c.kind === kind);
      let parts = this.trafficBatches.get(kind);
      if (!parts) {
        const template = makeTrafficCar(kind, "#ffffff");
        template.updateMatrixWorld(true);
        parts = [];
        template.traverse((part) => {
          if (!part.isMesh) return;
          const brake = template.userData.lamps.includes(part.material),
            material = brake ? new THREE.MeshBasicMaterial({ color: "#ffffff" }) : part.material.clone();
          const mesh = new THREE.InstancedMesh(part.geometry, material, 128);
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          this.trafficGroup.add(mesh);
          parts.push({
            mesh,
            local: part.matrixWorld.clone(),
            paint: part.material === template.userData.body,
            brake,
          });
        });
        this.trafficBatches.set(kind, parts);
      }
      const poses = group.map((car) =>
        surfacePose(this.elevation, car, car.heading, car.length * 0.65, car.width * 0.85),
      );
      for (const part of parts) {
        part.mesh.count = group.length;
        for (let i = 0; i < group.length; i++) {
          const car = group[i],
            pose = poses[i],
            position = new THREE.Vector3(car.x - this.base.x, pose.height + 0.125, car.y - this.base.y);
          rotation.setFromEuler(new THREE.Euler(pose.pitch, -car.heading, pose.roll, "YXZ"));
          matrix.compose(position, rotation, scale).multiply(part.local);
          part.mesh.setMatrixAt(i, matrix);
          if (part.paint || part.brake) {
            color.set(part.brake ? (car.braking ? "#ff5845" : "#7b2024") : car.color);
            part.mesh.setColorAt(i, color);
          }
        }
        part.mesh.instanceMatrix.needsUpdate = true;
        if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
      }
    }
    for (const item of this.signalHeads) {
      const phase = signalPhase(item.signal, item.signal.approachHeading, time),
        which = { green: 0, yellow: 1, red: 2 }[phase];
      for (const bulbs of item.heads)
        bulbs.forEach((bulb, i) =>
          bulb.material.color.set(
            i === which ? ["#52ffc4", "#ffcb48", "#ff493b"][i] : ["#164c3a", "#55441d", "#4d2427"][i],
          ),
        );
    }
  }
  updateReverseGuides(state) {
    disposeGroup(this.reverseGuidesGroup);
    const dynamic = reverseGuides(
        { ...state.position, heading: state.heading, steer: state.steer },
        this.car,
        4,
      ),
      fixed = reverseGuides({ ...state.position, heading: state.heading, steer: 0 }, this.car, 4);
    const buffers = { blue: [], yellow: [], red: [] };
    const ribbon = (a, b, color, width = 0.03) => {
      const av = this.local(a, 0.09),
        bv = this.local(b, 0.09),
        dx = bv.x - av.x,
        dz = bv.z - av.z,
        len = Math.hypot(dx, dz) || 1,
        nx = ((dz / len) * width) / 2,
        nz = ((-dx / len) * width) / 2;
      const points = [
          [av.x + nx, av.y, av.z + nz],
          [bv.x + nx, bv.y, bv.z + nz],
          [bv.x - nx, bv.y, bv.z - nz],
          [av.x - nx, av.y, av.z - nz],
        ],
        positions = [];
      for (const i of [0, 1, 2, 0, 2, 3]) positions.push(...points[i]);
      buffers[color].push(...positions);
    };
    for (let i = 6; i < fixed.length; i++)
      for (const side of ["left", "right"]) ribbon(fixed[i - 1][side], fixed[i][side], "blue");
    for (let i = 6; i < dynamic.length; i++)
      for (const side of ["left", "right"]) ribbon(dynamic[i - 1][side], dynamic[i][side], "yellow");
    for (const [i, color] of [
      [5, "red"],
      [10, "yellow"],
    ])
      ribbon(dynamic[i].left, dynamic[i].right, color, 0.045);
    ribbon(fixed[5].left, fixed[5].right, "blue", 0.022);
    for (const [color, positions] of Object.entries(buffers)) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const mesh = new THREE.Mesh(geometry, this.guideMaterials[color]);
      mesh.layers.set(31);
      mesh.renderOrder = 50;
      this.reverseGuidesGroup.add(mesh);
    }
  }
  render(state) {
    this.adaptQuality();
    const w = innerWidth,
      h = innerHeight;
    if (this.width !== w || this.height !== h) {
      this.width = w;
      this.height = h;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.introCamera.aspect = w / h;
      this.introCamera.updateProjectionMatrix();
    }
    if (this.surface) this.setTerrain(state.position);
    this.syncTraffic(state.traffic || [], state.time);
    if (state.intro) {
      this.interior.visible = false;
      this.externalCar.visible = true;
      this.externalCar.position.copy(this.local(state.position));
      this.externalCar.rotation.y = -state.heading;
      // Slow, low cinematic orbit; the car sits in the right third of the
      // frame so the title menu has the left side.
      const t = state.time,
        angle = 0.9 + t * 0.04,
        radius = 12.5 + Math.sin(t * 0.09) * 2,
        lift = 1.25 + (Math.sin(t * 0.06) + 1) * 0.6,
        center = this.local(state.position, 0.9),
        eye = center.clone().add(new THREE.Vector3(Math.cos(angle) * radius, lift, Math.sin(angle) * radius)),
        toCar = center.clone().sub(eye).setY(0).normalize(),
        right = new THREE.Vector3(-toCar.z, 0, toCar.x);
      this.introCamera.position.copy(eye);
      this.introCamera.lookAt(center.clone().addScaledVector(right, -2.2).add(new THREE.Vector3(0, 0.35, 0)));
      this.sun.target.position.copy(center);
      this.sun.position.copy(center).addScaledVector(SUN_DIRECTION, 220);
      this.sky.position.copy(center);
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.introCamera);
      return;
    }
    this.interior.visible = true;
    this.externalCar.visible = false;
    const pose = surfacePose(
      this.elevation,
      state.position,
      state.heading,
      this.car.wheelbase,
      this.car.width * 0.85,
    );
    this.rig.position.set(
      state.position.x - this.base.x,
      pose.height + 0.125,
      state.position.y - this.base.y,
    );
    this.rig.rotation.set(pose.pitch, -state.heading, pose.roll, "YXZ");
    this.sun.target.position.copy(this.rig.position);
    this.sun.position.copy(this.rig.position).addScaledVector(SUN_DIRECTION, 220);
    this.sky.position.copy(this.rig.position);
    const anchor = this.navigationAnchor,
      layout = this.cockpitLayout,
      view = this.view || viewSettings(),
      portrait = this.camera.aspect < 0.85;
    // Head yaw: Q/E glance at a door mirror, otherwise an optional gentle look
    // into slow turns. Smoothed so the head never snaps.
    const targetYaw = state.navZoom
      ? 0
      : state.look
        ? Math.sign(state.look) * GLANCE
        : view.lookIntoTurn
          ? lookIntoTurn(state.steer || 0, state.speed || 0, steeringLimit(this.car))
          : 0;
    this.headYaw = (this.headYaw ?? 0) + (targetYaw - (this.headYaw ?? 0)) * Math.min(1, (state.dt || 1 / 60) * 9);
    this.camera.rotation.y = this.headYaw;
    const eye = driverEye(this.car, layout, view);
    if (state.navZoom) {
      this.camera.rotation.x = -Math.atan2(eye.y - 0.03 - anchor.y, 0.6);
      this.camera.position.set(anchor.x, eye.y - 0.03, anchor.z + 0.6);
      const navFov = this.car.id === "prius" ? 45 : 55;
      this.camera.fov = (2 * Math.atan(Math.tan((navFov * Math.PI) / 360) / this.camera.aspect) * 180) / Math.PI;
    } else {
      // Eyes rest a few degrees below the horizon, as when driving.
      this.camera.rotation.x = portrait ? -0.09 : -0.085;
      if (portrait) this.camera.position.set(eye.x - 0.12, eye.y + 0.02, eye.z + 0.1);
      else this.camera.position.copy(eye);
      this.camera.fov = verticalFov(view, this.camera.aspect);
    }
    this.camera.updateProjectionMatrix();
    this.updateDisplays({ ...state, navInfo: state.navInfo, drawNavigation: state.drawNavigation });
    if (state.gear < 0) {
      const f = forward(state.heading),
        eye = this.local(
          {
            x: state.position.x - f.x * this.car.length * 0.48,
            y: state.position.y - f.y * this.car.length * 0.48,
          },
          0.85,
        );
      this.reverseCamera.position.copy(eye);
      this.reverseCamera.lookAt(eye.clone().add(new THREE.Vector3(-f.x * 3.5, -2, -f.y * 3.5)));
      this.updateReverseGuides(state);
      this.reverseGuidesGroup.visible = true;
      this.interior.visible = false;
      this.renderer.setRenderTarget(this.reverseTarget);
      this.renderer.render(this.scene, this.reverseCamera);
      this.interior.visible = true;
      this.reverseGuidesGroup.visible = false;
      this.navigation.material.map = this.reverseTarget.texture;
    } else this.navigation.material.map = this.nav.texture;
    if (this.frame++ % this.mirrorEvery === 0) {
      this.interior.visible = false;
      this.externalCar.position.copy(this.rig.position);
      this.externalCar.rotation.copy(this.rig.rotation);
      this.rig.updateMatrixWorld(true);
      for (const part of this.externalCar.userData.mirrors || []) part.visible = false;
      for (const m of this.mirrors) {
        this.externalCar.visible = m.side !== 0;
        const source = this.rig.localToWorld(m.mount.clone()),
          // Adjusted as taught: the car's flank just visible on the inner edge.
          direction = new THREE.Vector3(m.side * 0.3, m.side ? -0.05 : -0.03, 1).applyQuaternion(this.rig.quaternion),
          up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.rig.quaternion);
        m.camera.position.copy(source);
        m.camera.up.copy(up);
        m.camera.lookAt(source.clone().addScaledVector(direction, 30));
        this.renderer.setRenderTarget(m.target);
        this.renderer.render(this.scene, m.camera);
      }
      this.externalCar.visible = false;
      for (const part of this.externalCar.userData.mirrors || []) part.visible = true;
      this.interior.visible = true;
    }
    if (state.rear) {
      this.interior.visible = false;
      const rearCamera = this.mirrors[0]?.camera;
      if (rearCamera) {
        rearCamera.position.copy(this.local(state.position, this.car.eyeHeight));
        rearCamera.lookAt(
          this.local(
            {
              x: state.position.x - Math.sin(state.heading) * 20,
              y: state.position.y + Math.cos(state.heading) * 20,
            },
            this.car.eyeHeight,
          ),
        );
        this.renderer.setRenderTarget(null);
        this.renderer.render(this.scene, rearCamera);
      }
      this.interior.visible = true;
    } else {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
      if (!state.navZoom && (portrait || view.mirrorStrip)) this.drawMirrorInsets(w, h, portrait);
    }
  }
}
