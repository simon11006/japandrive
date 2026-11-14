import { t } from "./i18n.mjs";
import {countryProfile,signalLensPositions} from './country-profiles.mjs';
import {prepareSignalLayouts,roadsideSpace,roadJunctions,pedestrianSignalMounts} from "./junctions.mjs";
import {stripPolygon,approachMarkings,maneuverGuides} from './road-markings.mjs';
import { pointInRing } from './map-data.mjs';
import { buildCourseBuildings, buildCourseEnvironment, updateTollObjects } from './course-environment.mjs';
import * as THREE from "./vendor/three.module.js";
import {
  roadWidth,
  signalPhase,
  signalRightArrow,
  forward,
  reverseGuides,
  nearestOnSegment,
  headingBetween,
} from "./simulation.mjs";
import { groundSurface, ribbonSections, surfacePose } from "./road-surface.mjs";
import { buildCockpit } from "./cockpit.mjs";
import { makeCarModel, disposeCarModel } from "./car-model.mjs";
import { drawNavOverlay } from "./nav-display.mjs";
import { navigationScale } from './navigation.mjs';
import {StreetEncounters,pedestrianGreen} from './street-encounters.mjs';
import {PeopleModels} from './people-model.mjs';
import {MenuStage} from './menu-stage.mjs';
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
    c.fillText(t(text), w / 2, 83);
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
    box(g, [0.38, 0.18, 0.05], [x, 0.69, length / 2 + 0.025], rear);
    lamps.push(rear);
    for (const z of [-length * 0.31, length * 0.31]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.17, 12), rubber);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x < 0 ? -width / 2 : width / 2, 0.32, z);
      g.add(wheel);
    }
  }
  // High-mounted stop lamp sits against the sloping rear glass.
  const highStop = mat('#771013', .4, { emissive:'#ff281c', emissiveIntensity:.1 });
  box(g, [.48,.075,.045], [0, high-.1, rear+(length*.36-rear)*(.1/(high-low))+.028], highStop);
  lamps.push(highStop);
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
    this.environmentGroup = new THREE.Group();
    this.scene.add(this.environmentGroup);
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
      c.fillText(t("주변을 직접 확인하세요"), w / 2, 65);
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
  setup({ base, roads, features, coast, elevation, signals, bays, car, projection, course }) {
    this.course = course;
    this.courseRoads = roads;
    this.coastRing = coast?.map(p=>[p.x,p.y]);
    disposeGroup(this.environmentGroup);
    this.tollObjects = [];
    this.ruleSignature = null;
    this.base = { ...base };
    this.surface = groundSurface(elevation || (() => 0));
    this.elevation = this.surface.height;
    this.bays = bays || [];
    this.signals = signals || [];
    this.lastNav = -Infinity;
    this.mapScale = null;
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
    this.encounters=course?new StreetEncounters({...course,roads,signals:this.signals,features}):null;
    this.peopleModels??=new PeopleModels(this.scene);
    if(this.encounters){
      const paint=[];
      for(const c of this.encounters.crossings.filter(c=>!c.signal)){
        const f=forward(c.heading),r={x:Math.cos(c.heading),y:Math.sin(c.heading)};
        const at=(x,y)=>({x:c.x+r.x*x+f.x*y,y:c.y+r.y*x+f.y*y});
        for(let x=-c.width/2+.3;x<c.width/2-.3;x+=.95)paint.push([at(x,-1.45),at(Math.min(x+.5,c.width/2-.2),-1.45),at(Math.min(x+.5,c.width/2-.2),1.45),at(x,1.45)]);
        for(const side of [-1,1])paint.push(stripPolygon(at(side*(-c.width/2+.2),-side*3),at(-side*.1,-side*3),.5));
      }
      this.paintGround(this.environmentGroup,paint,'#fffdef',.25);
    }
    if(course?.maneuvers)this.setManeuvers(course.route,course.maneuvers,roads);
    this.setCar(car);
    if (projection) this.addAerial(projection, course?.aerial);
    if (course) buildCourseEnvironment(this, {...course, roads, features, coast});
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
        if (this.coastRing && !pointInRing([x + step / 2, y + step / 2], this.coastRing)) continue;
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
          const c = new THREE.Color(h > 30 ? "#668563" : "#a8b59a");
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
  addAerial(projection, tiles) {
    tiles ||= Array.from({length:15},(_,i)=>({z:18,x:224191+Math.floor(i/3),y:110898+i%3,path:`references/gsi-18-${224191+Math.floor(i/3)}-${110898+i%3}.jpg`}));
    for (const tile of tiles) {
      const z=tile.z,n=2**z,tx=tile.x,ty=tile.y;
      const geo = (x, y) => [
      (x / n) * 360 - 180,
      (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI,
    ];
        const sw = projection.toLocal(geo(tx, ty + 1)),
          ne = projection.toLocal(geo(tx + 1, ty));
        const width = ne.x - sw.x,
          depth = sw.y - ne.y,
          cx = (sw.x + ne.x) / 2,
          cy = (sw.y + ne.y) / 2;
        const draped = this.surface.drape([{ x: sw.x, y: ne.y }, ne, { x: ne.x, y: sw.y }, sw], 0.008),
          vertices = [],
          uv = [];
        for (let i=0;i<draped.length;i+=3) {
          const triangle=draped.slice(i,i+3),cx=triangle.reduce((n,p)=>n+p.x/3,0),cy=triangle.reduce((n,p)=>n+p.y/3,0);
          if(this.course&&this.coastRing&&!pointInRing([cx,cy],this.coastRing))continue;
          for(const p of triangle){vertices.push(p.x - this.base.x, p.height, p.y - this.base.y);uv.push((p.x - sw.x) / width, 1 - (p.y - ne.y) / depth);}
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
        geometry.computeVertexNormals();
        const key = `${z}-${tx}-${ty}`;
        let texture = this.aerialTextures.get(key);
        if (!texture) {
          texture = new THREE.TextureLoader().load(
            new URL(tile.path, import.meta.url).href,
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
    const junctions=roadJunctions(roads).map(j=>({...j,radius:Math.max(...j.arms.map(a=>a.width/2))+1}));
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
      // Do not carry edge/centre lines straight across a crossing road.
      if(array===mark){
        const nearby=junctions.filter(j=>Math.min(a.x,b.x)-j.radius<=j.x&&Math.max(a.x,b.x)+j.radius>=j.x&&Math.min(a.y,b.y)-j.radius<=j.y&&Math.max(a.y,b.y)+j.radius>=j.y);
        if(nearby.length){
          for(let d=0;d<len;d+=1.5){
            const end=Math.min(d+1.5,len),middle=(d+end)/2/len;
            if(nearby.some(j=>Math.hypot(a.x+dx*middle-j.x,a.y+dz*middle-j.y)<j.radius))continue;
            const aa={x:a.x+dx*d/len,y:a.y+dz*d/len},bb={x:a.x+dx*end/len,y:a.y+dz*end/len};
            const polygon=stripPolygon(aa,bb,width).map(q=>({x:q.x+dz/len*offset,y:q.y-dx/len*offset}));
            addPolygon(array,polygon,lift+.1);
          }
          return;
        }
      }
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
          const laneCount = parseInt(r.tags.lanes,10)||2;
          if (laneCount > 2 || (["yes","1","-1"].includes(r.tags.oneway) && laneCount > 1)) {
            const len=Math.hypot(b.x-a.x,b.y-a.y);
            for(let lane=1;lane<laneCount;lane++)for(let d=0;d<len;d+=9){
              const t=d/len,u=Math.min(d+4,len)/len;
              addQuad(mark,{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t},{x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u},.12,-width/2+width*lane/laneCount,.069);
            }
          }
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
      [mark, new THREE.MeshBasicMaterial({color:'#f4f2e4'}), 0],
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
    if (this.course) {
      buildCourseBuildings(this,features,this.course.theme,this.courseRoads,this.course.nodes,this.course.style);
      return;
    }
    const roof = (this.roofMaterial ??= mat("#ffffff", 0.95, { map: this.textures.concrete }));
    const pick = (id) => {
      let n = 2166136261;
      for (const ch of String(id)) n = Math.imul(n ^ ch.charCodeAt(0), 16777619);
      return (n >>> 0) % this.facades.length;
    };
    // Thousands of real footprints: merge them into one mesh per facade
    // texture (roofs first, walls second) so a city block is a few draw calls.
    const buckets = this.facades.map(() => ({ roofs: [], walls: [] }));
    const seen = new Set();
    for (const f of features) {
      if (!f.tags.building || seen.has(f.id)) continue;
      seen.add(f.id);
      const levels = Number(f.tags["building:levels"]);
      // Massing heights inferred from mapped floor count are approximations;
      // source quality is documented in the data panel, not presented as CAD.
      const height = Math.min(f.height ?? (levels ? levels * 3.1 : 3.1), 200);
      let geometry;
      try {
        const shape = new THREE.Shape(
          f.points.map((p) => new THREE.Vector2(p.x - this.base.x, -(p.y - this.base.y))),
        );
        geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
      } catch {
        continue;
      }
      geometry.rotateX(-Math.PI / 2);
      geometry.translate(0, this.elevation(f.center), 0);
      const g = geometry.index ? geometry.toNonIndexed() : geometry;
      const bucket = buckets[pick(f.id ?? f.center.x)];
      for (const group of g.groups.length ? g.groups : [{ start: 0, count: g.attributes.position.count, materialIndex: 1 }])
        (group.materialIndex === 0 ? bucket.roofs : bucket.walls).push({ g, start: group.start, count: group.count });
      if (f.tags.name?.includes("カンプー"))
        this.signBoard("SUNSET RESORT CANPHOU", f.center, height * 0.76, 0.0, this.buildingGroup);
    }
    buckets.forEach((bucket, i) => {
      const parts = [...bucket.roofs, ...bucket.walls];
      if (!parts.length) return;
      const total = parts.reduce((n, p) => n + p.count, 0);
      const position = new Float32Array(total * 3),
        normal = new Float32Array(total * 3),
        uv = new Float32Array(total * 2);
      let at = 0;
      for (const p of parts) {
        const a = p.g.attributes;
        position.set(a.position.array.subarray(p.start * 3, (p.start + p.count) * 3), at * 3);
        normal.set(a.normal.array.subarray(p.start * 3, (p.start + p.count) * 3), at * 3);
        uv.set(a.uv.array.subarray(p.start * 2, (p.start + p.count) * 2), at * 2);
        at += p.count;
      }
      const roofCount = bucket.roofs.reduce((n, p) => n + p.count, 0);
      const merged = new THREE.BufferGeometry();
      merged.setAttribute("position", new THREE.BufferAttribute(position, 3));
      merged.setAttribute("normal", new THREE.BufferAttribute(normal, 3));
      merged.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
      merged.addGroup(0, roofCount, 0);
      merged.addGroup(roofCount, total - roofCount, 1);
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, [roof, this.facades[i]]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.buildingGroup.add(mesh);
    });
    for (const bucket of buckets) for (const p of [...bucket.roofs, ...bucket.walls]) p.g.dispose();
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
  paintGround(group, polygons, color, lift, opacity=1) {
    const positions=polygons.flatMap(polygon=>this.surface.drape(polygon,lift)
      .flatMap(p=>[p.x-this.base.x,p.height,p.y-this.base.y]));
    if(!positions.length)return;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
    group.add(new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color,side:THREE.DoubleSide,transparent:opacity<1,opacity,depthWrite:opacity===1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})));
  }
  setManeuvers(route, steps, roads) {
    const arrows=[],guides=[];
    for(const guide of maneuverGuides(route,steps,roads)){
      const {position:p,turn}=guide,f=forward(p.heading),r={x:Math.cos(p.heading),y:Math.sin(p.heading)};
      const at=([side,ahead])=>({x:p.x+r.x*side+f.x*ahead,y:p.y+r.y*side+f.y*ahead});
      const uturn=guide.modifier==='uturn';
      const path=uturn?[[.5,-2],[.5,1],[.35,1.5],[-.35,1.5],[-.5,1],[-.5,-.5]]:[[0,-2],[0,.3],[turn*.2,.8],[turn,.8]];
      for(let i=1;i<path.length;i++)arrows.push(stripPolygon(at(path[i-1]),at(path[i]),.2));
      const end=path.at(-1);
      arrows.push(uturn
        ? [at([end[0]-.48,end[1]+.65]),at([end[0]+.48,end[1]+.65]),at([end[0],end[1]-.25])]
        : [at([end[0]-turn*.65,end[1]-.48]),at([end[0]-turn*.65,end[1]+.48]),at([end[0]+turn*.25,end[1]])]);
      // A mint dashed line is route assistance, distinct from white road paint.
      for(let i=1;i<guide.path.length;i+=3)guides.push(stripPolygon(guide.path[i-1],guide.path[Math.min(i+1,guide.path.length-1)],.17));
    }
    this.paintGround(this.roadsGroup,arrows,'#f6f4df',.205);
    this.paintGround(this.roadsGroup,guides,'#70dfcb',.21,.85);
  }
  setParking(bays) {
    disposeGroup(this.parkingGroup);
    for (const [i, b] of bays.entries()) {
      const target = b.target ?? i === 1;
      this.paintGround(this.parkingGroup,[b.points],target?'#48db8a':'#bcc7ad',.23,target?.3:.04);
      const borders=b.points.map((p,i)=>stripPolygon(p,b.points[(i+1)%b.points.length],target?.18:.1));
      this.paintGround(this.parkingGroup,borders,target?'#beffbd':'#f0efdf',.25);
      if(target){
        const f=forward(b.heading),r={x:Math.cos(b.heading),y:Math.sin(b.heading)};
        const at=([x,y])=>({x:b.center.x+r.x*x+f.x*y,y:b.center.y+r.y*x+f.y*y});
        const letter=[[-.35,-.7],[-.35,.7],[.35,.7],[.35,.1],[-.35,.1]];
        this.paintGround(this.parkingGroup,letter.slice(1).map((p,i)=>stripPolygon(at(letter[i]),at(p),.18)),'#e5ffcf',.27);
        const marker=new THREE.Sprite(new THREE.SpriteMaterial({map:labelTexture('P  목표 주차','#d5ffca','#174735'),depthTest:true}));
        marker.position.copy(this.local({x:b.center.x+f.x*b.length/2,y:b.center.y+f.y*b.length/2},2.5));marker.scale.set(3.6,.9,1);
        this.parkingGroup.add(marker);
      }
    }
  }
  setSignals(signals, roads) {
    disposeGroup(this.signalGroup);
    this.signalHeads = [];
    prepareSignalLayouts(signals, roads);
    const metal=mat("#747e7f",.4,{metalness:.5});
    const clear=roadsideSpace(roads);
    const country=this.course?.country||'JP',profile=countryProfile(country),vertical=profile.signalLayout==='vertical';
    const lensPositions=signalLensPositions(country);
    const pedestrianIcons=[false,true].map(walking=>canvasTexture(96,112,c=>{
      c.fillStyle='#060d12';c.fillRect(0,0,96,112);
      c.fillStyle='#fff';c.beginPath();c.arc(walking?51:48,19,8,0,Math.PI*2);c.fill();
      c.strokeStyle='#fff';c.lineWidth=9;c.lineCap='round';c.lineJoin='round';
      const lines=walking?[[[49,35],[42,61]],[[47,37],[32,49],[19,47]],[[48,37],[62,48],[75,42]],[[42,61],[30,80],[17,94]],[[42,61],[59,75],[69,96]]]
        :[[[48,35],[48,64]],[[37,38],[34,63]],[[59,38],[62,63]],[[43,62],[41,96]],[[53,62],[55,96]]];
      for(const line of lines){c.beginPath();line.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.stroke();}
    }).texture);
    const stops=[],backings=[],crossings=[];
    for(const s of signals){
      const heads=[];
      for(const approach of s.approaches){
        const head=new THREE.Group();
        head.position.copy(this.local(approach.head,5.2));
        head.rotation.y=-approach.heading;
        box(head,vertical?[.48,1.35,.30]:[1.35,.48,.30],[0,0,0],mat("#29383d"));
        const bulbs=[];
        for(const [i,color]of ["#32965b","#b59432","#933c39"].entries()){
          const bulb=new THREE.Mesh(new THREE.CircleGeometry(.16,24),new THREE.MeshBasicMaterial({color}));
          const [x,y]=lensPositions[i];bulb.position.set(x,y,.16);head.add(bulb);bulbs.push(bulb);
          // Sun visors leave the lenses visible to an approaching driver.
          box(head,[.35,.035,.20],[x,y+.20,.22],metal);
        }
        let arrow;
        if(s.profile==='arrow'){
          const ax=vertical?.5:.43,ay=vertical?-.43:-.49;
          box(head,[.47,.47,.30],[ax,ay,0],mat('#29383d'));
          const texture=canvasTexture(128,128,c=>{
            c.fillStyle='#080f12';c.fillRect(0,0,128,128);c.strokeStyle='#fff';c.lineWidth=13;c.lineCap='square';c.lineJoin='miter';
            c.beginPath();c.moveTo(25,64);c.lineTo(98,64);c.moveTo(69,35);c.lineTo(98,64);c.lineTo(69,93);c.stroke();
          }).texture;
          arrow=new THREE.Mesh(new THREE.CircleGeometry(.185,32),new THREE.MeshBasicMaterial({map:texture,color:'#55ffc2',toneMapped:false}));
          arrow.position.set(ax,ay,.16);head.add(arrow);
          box(head,[.4,.03,.2],[ax,ay+.24,.22],metal);
        }
        const pedestrians=[];
        if(s.profile!=='flash')for(const mount of pedestrianSignalMounts(approach,clear)){
          const unit=new THREE.Group();unit.position.copy(this.local(mount,3));unit.rotation.y=mount.rotation;
          box(unit,[.44,.91,.24],[0,0,0],mat('#1b2529'));
          const lamps=pedestrianIcons.map((texture,i)=>{
            const lamp=new THREE.Mesh(new THREE.PlaneGeometry(.34,.39),new THREE.MeshBasicMaterial({map:texture,toneMapped:false}));
            lamp.position.set(0,i?-.22:.22,.125);unit.add(lamp);
            box(unit,[.42,.025,.18],[0,(i?-.22:.22)+.22,.18],metal);return lamp;
          });
          cylinderBetween(this.signalGroup,this.local(mount).toArray(),this.local(mount,3.15).toArray(),.055,metal);
          this.signalGroup.add(unit);pedestrians.push(lamps);
        }
        // Pedestrian unit belongs on the roadside support, not in the lane.
        if(approach.pole){
          const foot=this.local(approach.pole),top=this.local(approach.pole,5.6),end=this.local(approach.head,5.6);
          cylinderBetween(this.signalGroup,foot.toArray(),top.toArray(),.09,metal);
          cylinderBetween(this.signalGroup,top.toArray(),end.toArray(),.065,metal);
          cylinderBetween(this.signalGroup,end.toArray(),this.local(approach.head,5.2).toArray(),.05,metal);
        }
        this.signalGroup.add(head);
        heads.push({bulbs,arrow,pedestrians,heading:approach.heading});
        const markings=approachMarkings(approach,profile.crossing);stops.push(markings.stop);backings.push(markings.backing);crossings.push(...markings.crossing);
      }
      this.signalHeads.push({signal:s,heads});
    }
    this.paintGround(this.signalGroup,backings,'#283136',.205);
    this.paintGround(this.signalGroup,stops,'#fffdec',.22);
    this.paintGround(this.signalGroup,crossings,'#f8f5e6',.21);
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
    disposeCarModel(this.externalCar);
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
    const clear=roadsideSpace(roads);
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
      const r={x:Math.cos(best.heading),y:Math.sin(best.heading)},f=forward(best.heading),side=rule.tags.highway==='speed_camera'?1:-1;
      let support;
      for(const extra of [0,3,6,10,16])for(const along of [0,-6,6,-12,12]){
        const p={x:best.point.x+r.x*side*(roadWidth(best.road.tags)/2+1.2+extra)+f.x*along,y:best.point.y+r.y*side*(roadWidth(best.road.tags)/2+1.2+extra)+f.y*along};
        if(!support&&clear(p,.9))support=p;
      }
      if(!support)continue;
      const legacyOffset=side>0?3.8:-3.7;
      const group = new THREE.Group();
      group.position.copy(this.local({x:support.x-r.x*legacyOffset,y:support.y-r.y*legacyOffset}));
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
          const profile=countryProfile(this.course?.country);
          c.fillStyle = "#ba3838";
          c.beginPath();
          if(profile.stopShape==='octagon'){
            for(let i=0;i<8;i++){const a=(i+.5)*Math.PI/4,x=w/2+Math.cos(a)*w*.45,y=h/2+Math.sin(a)*h*.45;i?c.lineTo(x,y):c.moveTo(x,y);}
          }else{
            c.moveTo(w * 0.5, h * 0.91);c.lineTo(w * 0.05, h * 0.1);c.lineTo(w * 0.95, h * 0.1);
          }
          c.closePath();
          c.fill();
          c.strokeStyle = "#fff";
          c.lineWidth = 9;
          c.stroke();
          c.fillStyle = "#fff";
          c.font = "bold 38px sans-serif";
          c.textAlign = "center";
          c.fillText(profile.stopText, w / 2, h * (profile.stopShape==='octagon'?.56:.43));
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
            map: labelTexture(t(side < 0 ? "왼쪽 미러" : "오른쪽 미러"), "#c3d5c9", "#0e1b20"),
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
    const mw = portrait ? Math.min(190, width * 0.28) : Math.min(200, width * 0.145),
      mh = mw * 0.56,
      top = portrait ? Math.min(224, height * 0.31) : width<=700 ? Math.max(64,Math.min(112,height-188-mh)) : height < 600 ? Math.max(112, height * 0.31) : Math.max(135, height * 0.34 - mh / 2),
      glancingLeft = (this.headYaw ?? 0) > 0.4;
    let shown = 0;
    for (const m of this.overlayMirrors) {
      m.group.visible = portrait || this.debugInsets || (m.side < 0 && !glancingLeft);
      if (!m.group.visible) continue;
      shown++;
      m.group.position.set(m.side * (width / 2 - mw / 2 - 14), height / 2 - top - mh / 2, 0);
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
    // Real time, so the screen still updates while the game waits for roads.
    const now = performance.now() / 1000;
    if (now - this.lastNav < 0.1 && blinkState === this.lastBlink) return;
    this.lastNav = now;
    this.lastBlink = blinkState;
    const c = this.nav.context,
      w = this.nav.canvas.width,
      h = this.nav.canvas.height;
    const targetScale=navigationScale(h,speed,navInfo);
    // Ease into a close view; pull back immediately when necessary to keep
    // the next junction visible instead of hiding it behind the turn banner.
    const mapScale=this.mapScale==null?targetScale:Math.min(targetScale,this.mapScale+(targetScale-this.mapScale)*.32);
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
      m.fillText(t("주행 준비"), mw * 0.43, mh * 0.76);
      m.fillText("CHG      ECO      PWR", mw * 0.75, mh * 0.32);
      m.fillStyle = "#3c7167";
      m.fillRect(mw * 0.56, mh * 0.48, mw * 0.35, mh * 0.13);
      m.fillStyle = "#b1dbad";
      m.fillRect(mw * 0.56, mh * 0.48, mw * 0.14, mh * 0.13);
      m.fillStyle = "#b8cfc7";
      m.font = "19px Malgun Gothic";
      m.fillText(t("하이브리드 시스템"), mw * 0.75, mh * 0.87);
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
    m.fillText(t("주행 준비"), mw * 0.18, mh * 0.87);
    m.fillStyle = "#84a6b9";
    m.font = "15px Malgun Gothic";
    m.fillText(t("경제 운전"), mw * 0.8, mh * 0.88);
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
            material = brake ? new THREE.MeshBasicMaterial({ color: "#ffffff", toneMapped:false }) : part.material.clone();
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
            color.set(part.brake ? (car.braking ? "#ff3b22" : "#521014") : car.color);
            part.mesh.setColorAt(i, color);
          }
        }
        part.mesh.instanceMatrix.needsUpdate = true;
        if (part.mesh.instanceColor) part.mesh.instanceColor.needsUpdate = true;
      }
    }
    for (const item of this.signalHeads) {
      for (const head of item.heads) {
        const phase=signalPhase(item.signal,head.heading,time),flashing=phase.startsWith('flash'),
          which=flashing?(Math.floor(time*2)%2===0?(phase==='flash-red'?2:1):-1):{green:0,yellow:1,red:2}[phase];
        if(head.arrow)head.arrow.material.color.set(signalRightArrow(item.signal,head.heading,time)?'#55ffc2':'#18362c');
        const walk=pedestrianGreen({signal:item.signal,heading:head.heading},time);
        for(const lamps of head.pedestrians){
          lamps[0].material.color.set(walk?'#241519':'#ff565b');
          lamps[1].material.color.set(walk?'#72ffb4':'#0e2921');
        }
        head.bulbs.forEach((bulb, i) =>
          bulb.material.color.set(
            i === which ? ["#52ffc4", "#ffcb48", "#ff493b"][i] : ["#164c3a", "#55441d", "#4d2427"][i],
          ),
        );
      }
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
    if (state.tolls) updateTollObjects(this,state.tolls);
    this.syncTraffic(state.traffic || [], state.time);
    this.peopleModels?.update(this.encounters?[...this.encounters.people,...this.encounters.officers]:[],this,state.time,state.position);
    if(state.intro&&(state.menuStep===0||(state.menuStep===2&&state.garageView!=='interior'))){
      this.menuStage??=new MenuStage(this.scene.environment);
      this.menuStage.render(this.renderer,this.car,state.time,w,h);return;
    }
    if(state.intro&&state.menuStep===2&&state.garageView==='interior')
      state={...state,intro:false,speed:0,gear:1,steer:0,parkingBrake:true};
    if (state.intro) {
      this.interior.visible = false;
      this.externalCar.visible = true;
      this.externalCar.position.copy(this.local(state.position));
      this.externalCar.rotation.y = -state.heading;
      // Keep the menu camera above the road; a free orbit cuts through dense
      // city buildings and leaves a wall behind the course picker.
      const center = this.local(state.position, 0.9),
        ahead = new THREE.Vector3(Math.sin(state.heading),0,-Math.cos(state.heading)),
        eye = center.clone().addScaledVector(ahead,-9).add(new THREE.Vector3(0,5,0));
      this.introCamera.position.copy(eye);
      this.introCamera.lookAt(center.clone().addScaledVector(ahead,26));
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
      this.camera.rotation.x = layout.viewPitch - (portrait ? 0.005 : 0);
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
