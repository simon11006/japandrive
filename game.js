import { startTranslation, t, LANG, setLanguage } from "./i18n.mjs";
import {approachFor,roadJunctions} from './junctions.mjs';
import {
  REGIONS,
  projection,
  normalizePois,
  poiQuery,
  RoadStore,
  BuildingStore,
  validateRoute,
  routeProgress,
  pointInRing,
} from "./map-data.mjs";
import { VEHICLES, integrateVehicle, steeringLimit, selectGear } from "./vehicles.mjs";
import { DrivingInput, bindDriveAction } from './drive-input.mjs';
import { NAV_ANCHOR, nextNavigationStep } from './navigation.mjs';
import { sceneFeatures, drawSceneMap } from "./scene-features.mjs";
import { DriveRenderer } from "./drive-renderer.mjs";
import { drawNavMap, drawCarMarker } from "./nav-display.mjs";
import { loadViewSettings, saveViewSettings, viewSettings, VIEW_DEFAULTS } from "./driver-view.mjs";
import { loadTerrain } from "./terrain.mjs";
import {
  mappedSpeedLimit,
  DrivingScore,
  stopSignApplies,
  turnSide,
  playerAtFault,
  BLINKER_LEAD_METRES,
  VIOLATIONS,
  leftTrafficStatus,
} from "./driving-rules.mjs";
import { DriveAudio } from "./audio.mjs";
import { COURSE_STEPS, canVisitStep, courseTime, stars, courseRoadStore, courseParking, drawCourseMap, TollSession } from './courses.mjs';
import {courseElevation} from './course-surface.mjs';
import {
  TrafficSimulation,
  DIFFICULTIES,
  bayFromGeo,
  parkingStatus,
  insidePolygon,
  vehicleCorners,
  rectanglesOverlap,
  blocksMove,
  nearestOnSegment,
  signalPhase,
  signalRightArrow,
  forward,
  headingBetween,
  distance,
  roadWidth,
} from "./simulation.mjs";

const $ = (s) => document.querySelector(s);
startTranslation();
document.querySelectorAll("[data-set-lang]").forEach((b) => {
  b.classList.toggle("on", b.dataset.setLang === LANG);
  b.addEventListener("click", () => b.dataset.setLang !== LANG && setLanguage(b.dataset.setLang));
});
const canvas = $("#world"),
  ctx = canvas.getContext("2d"),
  miniCanvas = $("#map"),
  mc = miniCanvas.getContext("2d");
const overview = $("#overview"),
  oc = overview.getContext("2d");
const kindNames = {
  stay: "숙소",
  food: "식당",
  sight: "관광지",
  shop: "쇼핑·휴게소",
  transport: "공항·렌터카",
};
const areaNames = { south: "남부", central: "중부", north: "북부" };
let region,
  proj,
  ring,
  coast,
  allPois = [],
  documentPois = [],
  displayed = [],
  selected,
  departure;
let store,
  route = [],
  routeInfo,
  steps = [],
  visibleRoads = [],
  roadBusy = false,
  roadError = "",
  lastRoadCheck = 0,
  lastHud = 0;
let active = false,
  paused = false,
  rear = false,
  mapMode = false,
  done = false,
  busy = false,
  pageSize = 24;
let pos = { x: 0, y: 0 },
  heading = 0,
  speed = 0,
  gear = 1,
  session = 0;
let car = VEHICLES[1],
  steer = 0;
let features = [],
  visibleFeatures = [],
  nearFeatures = [],
  buildings = null;
// Fixed scene features (test areas, destination lots) plus streamed real
// buildings around the car.
const sceneList = () => (buildings?.features.length ? [...features, ...buildings.features] : features);
const featuresNear = (radius) => sceneList().filter((f) => Math.hypot(f.center.x - pos.x, f.center.y - pos.y) < radius);
// Map footprints are approximate (±0.5 m), so a streamed building only counts
// as hit when a car corner is clearly inside it.
const hitsBuilding = (f, p) =>
  insidePolygon(p, f.points) &&
  (!f.streamed || f.points.every((q, i) => nearestOnSegment(p, f.points[i ? i - 1 : f.points.length - 1], q).distance > 0.6));
function refreshNearFeatures() {
  // The nav map only needs the neighbourhood; collisions only the next metres.
  visibleFeatures = featuresNear(450);
  nearFeatures = visibleFeatures.filter((f) => Math.hypot(f.center.x - pos.x, f.center.y - pos.y) < 250);
}
let destinationSites = [];
let driver,
  elevation = () => 0,
  signalRecords = [],
  signals = [],
  bays = [],
  parkingGoal = null,
  parkingBrake = false,
  parkedSeconds = 0,
  simulationTime = 0,
  traffic = null,
  navZoom = false,
  intro = true,
  trainingMode = "drive",
  feedback = "",
  feedbackUntil = 0,
  safetyScore = 100,
  lastCollision = 0,
  lastSignalViolation = -10,
  navInfo = {};
let difficulty = DIFFICULTIES[0],
  wizardStep = 1,
  maxReachedStep = 1,
  placeRole = "departure",
  carouselIndex = 0,
  carouselDrag = false,
  regionReady = false,
  carouselTimer,
  driveAbort,
  driveAttempt = 0,
  prepareStarted = 0,
  prepareTimer,
  prepareStage = 0;
let roadRules = [],
  scoreCard = new DrivingScore(),
  drivenDistance = 0,
  currentLimit = { value: null },
  ruleTick = 0,
  stopHistory = new Map(),
  passedCameras = new Set(),
  warningUntil = 0;
let courses=[], selectedCourse=null, courseBundle=null, courseFilter='all', courseTerrain={courses:{}}, tollSession=null, tollAction=false;
let courseWorld=null;
let lastWallContact=null;
const courseCache=new Map();
const touchDisplay=matchMedia('(any-pointer: coarse)');
function refreshDriveLayout(){
  document.body.dataset.driveLayout=(touchDisplay.matches||innerWidth<=1100)
    ? (innerWidth/innerHeight<.85?'portrait':'landscape') : 'desktop';
}
window.addEventListener('resize',refreshDriveLayout);
touchDisplay.addEventListener('change',refreshDriveLayout);
refreshDriveLayout();
try {
  difficulty = DIFFICULTIES.find((d) => d.id === localStorage.getItem("drive-difficulty")) || difficulty;
} catch {}
const sceneCanvas = $("#scene");
try {
  driver = new DriveRenderer(sceneCanvas);
  driver.setView(loadViewSettings());
} catch (error) {
  $("#engine-error").textContent =
    "입체 화면을 열지 못했습니다. 브라우저의 그래픽 가속을 켜고 다시 시도해 주세요.";
}
const keys = new DrivingInput();
let shiftHoldUntil = 0;
let laneAdvice='',ruleRoads=null,ruleJunctions=[];
// Pedal positions ramp like a foot pressing a pedal: a tap is gentle, a held
// key reaches full travel. Blinker: -1 left, 0 off, 1 right.
let gasLevel = 0,
  brakeLevel = 0,
  blinker = 0,
  blinkerSince = 0,
  blinkerArmed = false;
const checkedTurns = new Set();
const sound = new DriveAudio();
function setBlinker(side) {
  if (!active || done) return;
  blinker = blinker === side ? 0 : side;
  blinkerSince = simulationTime;
  blinkerArmed = false;
}
const distanceText = (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)} km` : `${Math.round(n)} m`);

function renderVehicles() {
  $("#vehicles").replaceChildren(
    ...VEHICLES.map((v) => {
      const button = document.createElement("button");
      button.className = `vehicle-card${v.id === car.id ? " selected" : ""}`;
      button.setAttribute("aria-pressed", String(v.id === car.id));
      const silhouette =
        v.id === "prius"
          ? "M8 39 L18 28 L46 13 L77 15 L101 33 L112 38 L112 51 L7 51 Z"
          : "M8 32 L27 12 L99 12 L111 25 L113 51 L7 51 Z";
      button.innerHTML = `<svg viewBox="0 0 120 65" aria-hidden="true"><path d="${silhouette}" fill="#d1dbd8" stroke="#c8eece" stroke-width="1.5"/><path d="${v.id === "prius" ? "M23 28 L47 17 L75 19 L91 30 Z" : "M30 16 L96 16 L104 29 L20 29 Z"}" fill="#35525b"/><circle cx="29" cy="49" r="9" fill="#0d1922"/><circle cx="93" cy="49" r="9" fill="#0d1922"/><circle cx="29" cy="49" r="4" fill="#6a8188"/><circle cx="93" cy="49" r="4" fill="#6a8188"/></svg><div><strong>${v.name}</strong><small>${v.trim}</small><span class="specs">전장 ${(v.length * 1000).toFixed(0)} · 전폭 ${(v.width * 1000).toFixed(0)} mm<br>축거 ${(v.wheelbase * 1000).toFixed(0)} mm · 최소 회전 반경 ${v.turningRadius.toFixed(1)} m</span><div class="stat-bars">${[
        ["차체 길이", v.length / 5.2, `${v.length.toFixed(2)} m`],
        ["차폭", v.width / 2.0, `${v.width.toFixed(2)} m`],
        ["차 높이", v.height / 2.0, `${v.height.toFixed(2)} m`],
        ["최소 회전 반경", v.turningRadius / 6.5, `${v.turningRadius.toFixed(1)} m`],
      ]
        .map(([n, f, t]) => `<div><span>${n}</span><i><b style="width:${Math.round(f * 100)}%"></b></i><span>${t}</span></div>`)
        .join("")}</div></div>`;
      button.onclick = () => {
        car = v;
        renderVehicles();
        driver?.setCar(car);
        updateWizard();
      };
      return button;
    }),
  );
}

// The game works two ways. With its own server (start-game.bat or the
// classroom server) map requests go through it. Opened as plain web pages
// (GitHub Pages, any static host) each browser handles them itself
// (direct-map.mjs). No installation is needed in that case.
let serverOk = null;
const serverReady = fetch("api/health", { cache: "no-store" })
  .then((r) => r.json())
  .then((d) => (serverOk = d.app === "japan-drive"))
  .catch(() => (serverOk = false));
let directMap = null;
const direct = () => (directMap ??= import("./direct-map.mjs"));
// Abort after `timeout` ms and translate failures into player-friendly text.
async function guarded(task, signal, timeout) {
  const controller = new AbortController(),
    abort = () => controller.abort();
  signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("timeout", "TimeoutError")), timeout);
  try {
    return await task(controller.signal);
  } catch (error) {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
    if (controller.signal.aborted)
      throw new Error("지도 서비스가 제한 시간 안에 응답하지 않았습니다. 다시 시도하거나 추천 코스를 선택해 주세요.");
    if (error instanceof TypeError) throw new Error("지도 연결이 끊겼습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
async function mapRoute(start, end, signal) {
  await serverReady;
  if (serverOk) return json("api/route?" + new URLSearchParams({ start, end }), signal);
  const { route } = await direct();
  return guarded((s) => route(start, end, s), signal, 45000);
}
async function searchPlaces(q, options = {}, signal) {
  await serverReady;
  if (serverOk) {
    const params = new URLSearchParams({ q });
    if (Number.isFinite(options.lat)) params.set("lat", options.lat), params.set("lon", options.lon);
    if (options.online === false) params.set("online", "0");
    return json("api/places?" + params, signal, 20000);
  }
  const { places } = await direct();
  return guarded((s) => places(q, options, s), signal, 20000);
}
async function json(url, signal, timeout = 30000) {
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    const data = await response.json();
    if (!response.ok || data.error)
      throw new Error(data.error || `데이터를 불러오지 못했습니다 (${response.status})`);
    return data;
  } catch (error) {
    if (timedOut || (error.name !== "AbortError" && /timeout|timed out/i.test(error.message)))
      throw new Error(
        "지도 서비스가 제한 시간 안에 응답하지 않았습니다. 다시 시도하거나 추천 코스를 선택해 주세요.",
      );
    if (error instanceof TypeError)
      throw new Error("지도 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도해 주세요.");
    if (error instanceof SyntaxError) throw new Error("지도 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
// Road and parking lookups can need a server fallback, so allow more time.
const overpass = async (query, signal) => {
  await serverReady;
  if (serverOk) return json("api/overpass?" + new URLSearchParams({ data: query }), signal, 90000);
  const { mapQuery } = await direct();
  return guarded((s) => mapQuery(query, s), signal, 90000);
};

function renderRegions() {
  $("#regions").replaceChildren(
    ...[...REGIONS]
      .sort((a, b) => Number(b.island || false) - Number(a.island || false))
      .map((r) => {
        const button = document.createElement("button");
        button.className = region?.id === r.id ? "active" : "";
        button.append(document.createTextNode(r.name));
        const small = document.createElement("small");
        small.textContent = r.island ? "남부 · 중부 · 북부" : r.description;
        button.append(small);
        button.setAttribute("aria-pressed", String(region?.id === r.id));
        button.onclick = () => {
          if (region?.id !== r.id || !regionReady) loadRegion(r);
        };
        return button;
      }),
  );
}

async function loadRegion(next) {
  cancelDrivePreparation();
  maxReachedStep = 2;
  const id = ++session;
  regionReady = false;
  region = next;
  proj = projection(region.origin);
  selected = null;
  route = [];
  departure = null;
  active = false;
  ring = null;
  coast = null;
  documentPois = [];
  allPois = [];
  features = [];
  visibleFeatures = [];
  nearFeatures = [];
  destinationSites = [];
  signalRecords = [];
  signals = [];
  bays = [];
  roadRules = [];
  elevation = () => 0;
  $("#planner").hidden = true;
  $("#loading").textContent = `${region.name} 지도와 목적지를 불러오는 중…`;
  renderRegions();
  updateWizard();
  try {
    if (region.island) {
      const [
        boundary,
        pois,
        extras,
        catalog,
        scene,
        parkingData,
        signalData,
        terrain,
        ruleData,
        sites,
        aquaScene,
      ] = await Promise.all([
        json("./data/okinawa-main-island.geojson"),
        json("./data/okinawa-pois.json"),
        json("./data/okinawa-extra-pois.json"),
        json("./data/places.json"),
        json("./data/preview-scene.json"),
        json("./data/parking-sites.json"),
        json("./data/okinawa-signals.json"),
        loadTerrain(proj),
        json("./data/okinawa-road-rules.json"),
        json("./data/destination-sites.json"),
        json("./data/aqua-scene.json"),
      ]);
      if (id !== session) return;
      ring = boundary.geometry.coordinates[0];
      coast = ring.map(proj.toLocal);
      features = [...sceneFeatures(scene, proj), ...sceneFeatures(aquaScene, proj)];
      destinationSites = sites.sites.map((s) => {
        const points = s.polygon.map(proj.toLocal),
          center = points.reduce((a, p) => ({ x: a.x + p.x / points.length, y: a.y + p.y / points.length }), {
            x: 0,
            y: 0,
          });
        return { ...s, points, center, heading: 0 };
      });
      bays = bayFromGeo(parkingData, proj.toLocal);
      elevation = terrain;
      signalRecords = signalData.elements.map((s) => ({ ...s, ...proj.toLocal([s.lon, s.lat]) }));
      roadRules = ruleData.elements
        .filter((e) => e.type === "node" && pointInRing([e.lon, e.lat], ring))
        .map((e) => ({ ...e, ...proj.toLocal([e.lon, e.lat]) }));
      allPois = normalizePois(pois, ring);
      const elements = [...pois.elements, ...extras.elements];
      const byId = new Map(elements.map((e) => [`${e.type}/${e.id}`, e]));
      documentPois = catalog.places.map((p) => {
        const pattern = p.match ? new RegExp(p.match, "i") : null;
        const e = p.osm
          ? byId.get(p.osm)
          : elements.find(
              (e) =>
                pattern &&
                Object.entries(e.tags || {}).some(([k, v]) => k.startsWith("name") && pattern.test(v)),
            );
        const lat = p.lat ?? e?.lat ?? e?.center?.lat,
          lon = p.lon ?? e?.lon ?? e?.center?.lon;
        return {
          ...p,
          lat,
          lon,
          resolved: Number.isFinite(lat) && Number.isFinite(lon),
          source: p.source || (e ? `https://www.openstreetmap.org/${e.type}/${e.id}` : null),
        };
      });
      for (const p of documentPois) {
        if (p.sharedWith && !p.resolved) {
          const shared = documentPois.find((other) => other.id === p.sharedWith);
          if (shared?.resolved)
            Object.assign(p, { lat: shared.lat, lon: shared.lon, resolved: true, source: shared.source });
        }
      }
      $("#source-filter").value = "document";
      $("#scope-note").textContent = "남부부터 북부까지, 숙소·식당·관광지를 골라 직접 운전하고 주차하세요.";
    } else {
      const data = await overpass(poiQuery(region));
      if (id !== session) return;
      allPois = normalizePois(data);
      $("#source-filter").value = "all";
      $("#scope-note").textContent = region.description + " · 기본 지도 테스트 범위";
    }
    if (id !== session) return;
    store = new RoadStore(proj, overpass);
    buildings = region.island ? new BuildingStore(proj, overpass) : null;
    $("#quick-test").hidden = !region.island;
    $("#region-caption").textContent = "일본 첫 운전 연습";
    $("#region-title").textContent = region.name;
    $("#source-filter").disabled = !region.island;
    $("#area-filter").disabled = !region.island;
    $("#kind-filter").value = "all";
    $("#area-filter").value = "all";
    $("#search").value = "";
    const options = region.island ? documentPois.filter((p) => p.resolved) : allPois;
    $("#departure").replaceChildren(
      ...options.map((p) => {
        const o = document.createElement("option");
        o.value = p.id;
        o.textContent = p.name;
        return o;
      }),
    );
    departure = options[0];
    if (region.island) departure = options.find((p) => p.id === "canphou") || options[0];
    if (departure) $("#departure").value = departure.id;
    regionReady = true;
    $("#loading").textContent = "";
    $("#trip-status").textContent = "목록에서 목적지를 고르면 경로를 계산할 수 있습니다.";
    $("#chosen").textContent = "목적지를 선택하세요";
    $("#start").disabled = true;
    pageSize = 24;
    renderPlaces();
    drawOverview();
    showWizardStep(wizardStep, false);
    if (region.island) {
      const cached = await json("./data/preview-cache.json");
      const previewRoads = cached.roads.elements.map((e) => ({
        id: String(e.id),
        points: e.geometry.map((p) => proj.toLocal([p.lon, p.lat])),
        tags: e.tags || {},
      }));
      const position = proj.toLocal(cached.route.routes[0].geometry.coordinates[0]);
      store.seed(cached.roads, position);
      const signalRoadCache = await json("./data/signal-roads.json");
      const trainingRoutes = await json("./data/training-routes.json");
      const signalRoute = trainingRoutes.routes.find((r) => r.name === "signals");
      store.seed(signalRoadCache.roads, proj.toLocal(signalRoute.data.routes[0].geometry.coordinates[0]));
      signals = signalRecords.filter((s) => distance(s, position) < 1800);
      driver?.setup({
        base: position,
        roads: previewRoads,
        features,
        coast,
        elevation,
        signals,
        bays,
        car,
        projection: proj,
      });
      driver?.setRoadRules(roadRules, store.roads);
      const cinema = cached.route.routes[0].geometry.coordinates;
      pos = proj.toLocal(cinema[Math.min(9, cinema.length - 2)]);
      heading = headingBetween(pos, proj.toLocal(cinema[Math.min(10, cinema.length - 1)]));
      // Park the title car on the left shoulder so passing traffic flows by.
      pos = { x: pos.x - Math.cos(heading) * 3.4, y: pos.y - Math.sin(heading) * 3.4 };
      traffic = new TrafficSimulation(store.roads, signals, position, difficulty.cars);
      $("#intro-status").textContent = "";
      drawIntroMap();
    }
  } catch (error) {
    if (id === session) {
      regionReady = false;
      updateWizard();
      $("#loading").textContent = error.message + " · 지역 버튼을 눌러 다시 시도해 주세요.";
    }
  }
}

function renderPlaces() {
  clearTimeout(carouselTimer);
  const source = $("#source-filter").value === "document" ? documentPois : allPois;
  const search = $("#search").value.trim().toLocaleLowerCase();
  displayed = source.filter(
    (p) =>
      (placeRole === "departure" || p.id !== departure?.id) &&
      ($("#kind-filter").value === "all" || p.kind === $("#kind-filter").value) &&
      ($("#area-filter").value === "all" || p.section === $("#area-filter").value) &&
      (!search || `${p.name} ${p.originalName || ""}`.toLocaleLowerCase().includes(search)),
  );
  if (source === documentPois) pageSize = Math.max(pageSize, displayed.length);
  $("#place-count").textContent =
    `${displayed.length}개 장소${source === documentPois ? " · 추천 드라이브" : " · 전체 지역 검색"}`;
  const picked = placeRole === "departure" ? departure : selected;
  $("#places").replaceChildren(
    ...displayed.slice(0, pageSize).map((p, index) => {
      const b = document.createElement("button");
      const resolved = p.resolved !== false;
      b.className = `place${picked?.id === p.id ? " chosen" : ""}${resolved ? "" : " unresolved"}`;
      b.dataset.id = p.id;
      b.setAttribute("aria-pressed", String(picked?.id === p.id));
      b.disabled = !resolved;
      const visual = document.createElement("canvas");
      visual.width = 560;
      visual.height = 240;
      visual.className = "place-map";
      visual.setAttribute("aria-hidden", "true");
      drawPlaceMap(visual, p);
      const kind = document.createElement("span");
      kind.className = "kind";
      kind.textContent = `${kindNames[p.kind]} / ${areaNames[p.section] || region.name}`;
      const name = document.createElement("strong");
      name.textContent = p.name;
      const detail = document.createElement("span");
      detail.className = "detail";
      detail.textContent = resolved
        ? p.extension
          ? "대교로 연결되는 고우리섬"
          : p.sharedWith
            ? "시설 공용 주차장으로 안내"
            : "출발지·목적지로 선택"
        : "위치 확인 중";
      const number = document.createElement("span");
      number.className = "place-number";
      number.textContent = String(index + 1).padStart(2, "0");
      b.append(visual, number, kind, name, detail);
      b.onclick = () => {
        if (carouselDrag) return;
        choosePlace(p);
        centerPlace(index);
      };
      return b;
    }),
  );
  if (!displayed.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "검색 조건에 맞는 장소가 없습니다.";
    $("#places").append(p);
  }
  $("#more").hidden = displayed.length <= pageSize;
  carouselIndex = Math.max(
    0,
    displayed.slice(0, pageSize).findIndex((p) => p.id === picked?.id),
  );
  requestAnimationFrame(() => centerPlace(carouselIndex, false));
  updateCarousel();
  updateWizard();
}

function drawPlaceMap(canvas, place) {
  const c = canvas.getContext("2d"),
    w = canvas.width,
    h = canvas.height;
  c.fillStyle = "#112f38";
  c.fillRect(0, 0, w, h);
  c.strokeStyle = "#b9f3cc0a";
  c.lineWidth = 1;
  for (let x = 0; x < w; x += 35) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  for (let y = 0; y < h; y += 35) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  const pts = coast || allPois.slice(0, 200).map((p) => proj.toLocal([p.lon, p.lat]));
  if (!pts.length) return;
  const bounds = pts.reduce(
    (b, p) => [Math.min(b[0], p.x), Math.min(b[1], p.y), Math.max(b[2], p.x), Math.max(b[3], p.y)],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const scale = Math.min((w - 100) / (bounds[2] - bounds[0] || 1), (h - 36) / (bounds[3] - bounds[1] || 1));
  const cv = (p) => [
    w / 2 + (p.x - (bounds[0] + bounds[2]) / 2) * scale,
    h / 2 + (p.y - (bounds[1] + bounds[3]) / 2) * scale,
  ];
  if (coast) {
    c.beginPath();
    pts.forEach((p, i) => {
      if (i % 20 !== 0 && i !== pts.length - 1) return;
      const [x, y] = cv(p);
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.closePath();
    c.fillStyle = "#315b57";
    c.fill();
    c.strokeStyle = "#679a86";
    c.stroke();
  }
  if (place.resolved !== false) {
    const [x, y] = cv(proj.toLocal([place.lon, place.lat]));
    c.fillStyle = "#c7f1ae33";
    c.beginPath();
    c.arc(x, y, 15, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#d5efb5";
    c.beginPath();
    c.arc(x, y, 6, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#d5efb5";
    c.beginPath();
    c.moveTo(x + 18, y);
    c.lineTo(x + 48, y);
    c.stroke();
  }
  c.fillStyle = "#a2c8bf";
  c.font = "16px Malgun Gothic";
  c.fillText("N ↑", 22, 28);
  c.fillText(t(region.name), 22, h - 20);
}
function choosePlace(p) {
  if (!p || p.resolved === false) return;
  if (placeRole === "departure") {
    departure = p;
    $("#departure").value = p.id;
    if (selected?.id === p.id) {
      selected = null;
      maxReachedStep = Math.min(maxReachedStep, 4);
    }
  } else selected = p;
  route = [];
  $("#chosen").textContent = selected?.name || "목적지를 선택하세요";
  $("#trip-status").className = "muted";
  $("#trip-status").textContent = "내비게이션을 따라 목적지 주차장까지 이동합니다.";
  for (const b of $("#places").querySelectorAll(".place")) {
    const yes = b.dataset.id === p.id;
    b.classList.toggle("chosen", yes);
    b.setAttribute("aria-pressed", String(yes));
  }
  updateStart();
  drawOverview();
  updateCarousel();
}
function centerPlace(index, smooth = true) {
  const list = $("#places"),
    cards = list.querySelectorAll(".place");
  if (!cards.length) return;
  carouselIndex = Math.max(0, Math.min(cards.length - 1, index));
  const card = cards[carouselIndex];
  list.scrollTo({
    left:
      list.scrollLeft +
      card.getBoundingClientRect().left -
      list.getBoundingClientRect().left -
      (list.clientWidth - card.clientWidth) / 2,
    behavior: smooth ? "smooth" : "instant",
  });
  updateCarousel();
}
function updateCarousel() {
  const total = Math.min(displayed.length, pageSize),
    picked = placeRole === "departure" ? departure : selected;
  $("#place-prev").disabled = carouselIndex <= 0;
  $("#place-next").disabled = carouselIndex >= total - 1;
  $("#place-selection").textContent = total
    ? `${carouselIndex + 1} / ${total}   ·   ${picked?.name || "장소를 선택하세요"}`
    : "검색 조건을 바꿔 주세요";
}
$("#place-prev").onclick = () => centerPlace(carouselIndex - 1);
$("#place-next").onclick = () => centerPlace(carouselIndex + 1);
$("#places").addEventListener(
  "scroll",
  () => {
    clearTimeout(carouselTimer);
    carouselTimer = setTimeout(() => {
      if (wizardStep !== 3 && wizardStep !== 4) return;
      const list = $("#places"),
        cards = [...list.querySelectorAll(".place")];
      if (!cards.length) return;
      const center = list.getBoundingClientRect().left + list.clientWidth / 2;
      const delta = (card) => Math.abs(card.getBoundingClientRect().left + card.clientWidth / 2 - center);
      carouselIndex = cards.reduce((best, card, i) => (delta(card) < delta(cards[best]) ? i : best), 0);
      choosePlace(displayed[carouselIndex]);
    }, 140);
  },
  { passive: true },
);
$("#places").addEventListener("keydown", (e) => {
  if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
    e.preventDefault();
    centerPlace(carouselIndex + (e.key === "ArrowRight" ? 1 : -1));
  }
});
let dragStart = null;
$("#places").addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "mouse") return;
  dragStart = { x: e.clientX, left: $("#places").scrollLeft };
  carouselDrag = false;
});
window.addEventListener("pointermove", (e) => {
  if (!dragStart) return;
  const dx = e.clientX - dragStart.x;
  if (Math.abs(dx) > 6) {
    carouselDrag = true;
    $("#places").classList.add("dragging");
    $("#places").scrollLeft = dragStart.left - dx;
  }
});
window.addEventListener("pointerup", () => {
  dragStart = null;
  $("#places").classList.remove("dragging");
  setTimeout(() => (carouselDrag = false), 0);
});

const wizardLabels = COURSE_STEPS;
async function loadCourses(){
  const [catalog,terrain]=await Promise.all([json('./data/driving-courses.json'),json('./data/course-terrain.json').catch(()=>({courses:{}}))]);
  courses=catalog.courses;courseTerrain=terrain;
  maxReachedStep=1;
  renderCourses();
  await chooseCourse(courses[0]);
  if(selectedCourse.id===courses[0].id&&courseBundle){
    prepareCourseWorld();
    active=false;intro=true;speed=0;
    $('#loading').textContent='';
    $('#intro-status').textContent='';
  }
}
function renderCourses(){
  const visible=courses.filter(c=>courseFilter==='all'||(courseFilter==='city'&&['city','urban'].includes(c.theme))||(courseFilter==='nature'&&['coast','mountain'].includes(c.theme))||(courseFilter==='beginner'&&c.stars===1)||courseFilter===c.theme);
  $('#course-cards').replaceChildren(...visible.map((c,i)=>{
    const button=document.createElement('button');button.className=`course-card theme-${c.theme}${selectedCourse?.id===c.id?' selected':''}`;button.dataset.course=c.id;button.setAttribute('aria-pressed',String(selectedCourse?.id===c.id));
    const picture=document.createElement('div');picture.className='course-picture';
    const canvas=document.createElement('canvas');canvas.setAttribute('aria-hidden','true');picture.append(canvas);
    const over=document.createElement('span');over.className='course-kicker';over.textContent=`${c.region} / ${c.category}`;picture.append(over);
    const no=document.createElement('b');no.className='course-number';no.textContent=String(courses.indexOf(c)+1).padStart(2,'0');picture.append(no);
    const body=document.createElement('div');body.className='course-card-body';
    const title=document.createElement('h2');title.textContent=c.name;const copy=document.createElement('p');copy.textContent=c.subtitle;
    const meta=document.createElement('div');meta.className='course-meta';const time=document.createElement('strong');time.textContent=`${courseTime(c)}`;const rating=document.createElement('span');rating.className='course-stars';rating.textContent=stars(c);rating.setAttribute('aria-label',`난이도 5단계 중 ${c.stars}단계`);meta.append(time,rating);
    const tags=document.createElement('div');tags.className='course-tags';for(const feature of c.features){const tag=document.createElement('span');tag.textContent=feature;tags.append(tag);}
    const footer=document.createElement('small');footer.textContent=`${distanceText(c.distance)} · 주차 포함`;
    body.append(meta,title,copy,tags,footer);button.append(picture,body);button.onclick=()=>chooseCourse(c);
    requestAnimationFrame(()=>drawCourseMap(canvas,c,courseCache.get(c.id)));return button;
  }));
  updateCourseSelection();
}
function updateCourseSelection(){
  for(const button of $('#course-cards').children){
    const chosen=button.dataset.course===selectedCourse?.id;
    button.classList.toggle('selected',chosen);button.setAttribute('aria-pressed',String(chosen));
    if(chosen&&courseBundle){const course=selectedCourse,bundle=courseBundle;requestAnimationFrame(()=>drawCourseMap(button.querySelector('canvas'),course,bundle));}
  }
  const detail=$('#course-detail');detail.replaceChildren();if(!selectedCourse)return;
  const text=document.createElement('div');const strong=document.createElement('strong');strong.textContent=`선택한 코스 · ${selectedCourse.name}`;const p=document.createElement('p');p.textContent=selectedCourse.assessment.join(' · ');text.append(strong,p);
  const note=document.createElement('span');note.textContent=selectedCourse.reconstructed?'실제 E58 선형 참고 · 진입·출구를 연습용으로 구성':'실제 도로·건물 배치 참고 · 신호와 교통은 연습용';detail.append(text,note);
}
async function chooseCourse(c){
  if(busy)cancelDrivePreparation();selectedCourse=c;courseBundle=null;updateCourseSelection();updateStart();
  $('#loading').textContent='선택한 코스의 도로와 주차장을 불러오는 중…';
  try{
    const bundle=courseCache.get(c.id)||await json(c.bundle);courseCache.set(c.id,bundle);
    const nextProjection=projection(bundle.origin);
    const [terrain,boundary]=await Promise.all([loadTerrain(nextProjection),c.region==='오키나와'?json('./data/okinawa-main-island.geojson'):Promise.resolve(null)]);
    if(selectedCourse.id!==c.id)return;
    courseWorld={projection:nextProjection,elevation:terrain,coast:boundary?.geometry.coordinates[0].map(nextProjection.toLocal)||null};
    regionReady=true;
    courseBundle=bundle;
    const start=bundle.route.geometry.coordinates[0],end=bundle.route.geometry.coordinates.at(-1);
    departure={id:c.id+'-start',name:c.startLabel,lon:start[0],lat:start[1],resolved:true};
    selected={id:c.id+'-finish',name:c.finishLabel,lon:end[0],lat:end[1],resolved:true};
    $('#chosen').textContent=selected.name;$('#trip-status').className='muted';$('#trip-status').textContent='코스 준비 완료 · 신호를 지키며 목적지에 도착해 주차하세요.';$('#quick-test').hidden=true;
    $('#loading').textContent='';updateCourseSelection();updateStart();drawOverview();drawIntroMap();
  }catch(error){if(selectedCourse.id===c.id)$('#loading').textContent='코스를 불러오지 못했습니다. 카드를 눌러 다시 시도해 주세요.';}
}
for(const b of document.querySelectorAll('#course-filters button'))b.onclick=()=>{courseFilter=b.dataset.filter;for(const button of document.querySelectorAll('#course-filters button'))button.setAttribute('aria-pressed',String(button===b));renderCourses();};
for(const [id,direction]of [['#course-prev',-1],['#course-next',1]])$(id).onclick=()=>$('#course-cards').scrollBy({left:direction*($('#course-cards').clientWidth*.8),behavior:'smooth'});
function prepareCourseWorld(){
  // Courses already contain their scenery; keep long-drive streaming separate.
  buildings=null;
  proj=courseWorld.projection;elevation=courseWorld.elevation;coast=courseWorld.coast;
  region={id:selectedCourse.area,name:selectedCourse.region,origin:courseBundle.origin,island:selectedCourse.region==='오키나와'};
  const bundle=courseBundle;store=courseRoadStore(bundle,proj);routeInfo=bundle.route;route=routeInfo.geometry.coordinates.map(proj.toLocal);
  features=sceneFeatures(bundle.scene,proj);
  parkingGoal=courseParking(bundle.parking,proj);bays=[parkingGoal];
  const nodes=bundle.scene.elements.filter(e=>e.type==='node').map(e=>({...e,...proj.toLocal([e.lon,e.lat])}));
  signalRecords=bundle.signals.map(e=>{const p=proj.toLocal([e.lon,e.lat]);let best={distance:Infinity,heading:0};for(let i=1;i<route.length;i++){const m=nearestOnSegment(p,route[i-1],route[i]);if(m.distance<best.distance)best={...m,heading:headingBetween(route[i-1],route[i])};}return {...e,...p,courseHeading:best.heading};});signals=signalRecords;
  roadRules=bundle.rules.map(e=>({...e,...proj.toLocal([e.lon,e.lat])}));
  steps=routeInfo.legs.flatMap(l=>l.steps).filter((s,i,a)=>s.maneuver.type!=='arrive'||i===a.length-1).map(s=>{const point=proj.toLocal(s.maneuver.location);return {...s,point,atDistance:routeProgress(route,point,routeInfo.distance).travelled};});
  resetPosition();
  const mode=document.querySelector('[name="toll-mode"]:checked').value;
  tollSession=new TollSession(bundle.tolls.map(g=>({...g,...proj.toLocal(g.geo),mode})),mode);
  const graded=courseElevation(elevation,store.roads,tollSession.gates,parkingGoal);
  driver?.setup({base:pos,roads:store.roads,features,coast,elevation:graded,signals,bays,car,projection:proj,
    course:{theme:selectedCourse.theme,style:selectedCourse.style||'okinawa',nodes,route,maneuvers:steps,tolls:tollSession.gates,aerial:courseTerrain.courses[selectedCourse.id]||[]}});
  driver?.setRoadRules(roadRules,store.roads);
  traffic=new TrafficSimulation(store.roads.filter(r=>!r.id.startsWith('practice-')),signals,pos,difficulty.cars);
  traffic.pedestrianStop=vehicle=>driver?.encounters?.stopDistance(vehicle)??Infinity;
}
async function startCourse(){
  if(!courseBundle||busy)return;
  sound.start();busy=true;updateStart();$('#start').textContent='운전석을 준비하는 중…';
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  try{
    prepareCourseWorld();trainingMode='drive';roadError='';done=false;paused=false;rear=false;active=true;intro=false;navZoom=false;parkedSeconds=0;simulationTime=0;lastCollision=-10;lastSignalViolation=-10;feedbackUntil=0;keys.clear();scoreCard=new DrivingScore();drivenDistance=0;stopHistory.clear();passedCameras.clear();checkedTurns.clear();warningUntil=0;tollAction=false;
    $('#violation-warning').hidden=true;$('#driving-car').textContent=`${car.name} · 우핸들`;$('#destination').textContent=selected.name;
    for(const id of ['#nav','#hud','#hint','#menu'])$(id).hidden=false;
    for(const id of ['#select','#result','#splash'])$(id).hidden=true;
    setTitle(false);document.body.classList.remove('in-menu');document.body.classList.add('driving');window.scrollTo(0,0);
    $('#course-drive-name').textContent=selectedCourse.name;
  }catch(error){$('#trip-status').textContent='코스를 준비하지 못했습니다. '+error.message;$('#trip-status').className='muted error';}
  finally{busy=false;$('#start').textContent='운전 시작';updateStart();}
}
$('#toll-action').onclick=()=>{tollAction=true;};
window.addEventListener('keydown',e=>{if(e.key==='Enter'&&active&&!paused&&!done&&!$('#toll-prompt').hidden){e.preventDefault();tollAction=true;}});
const wizardTitles = [
  "오늘의 드라이브를 고르세요.",
  "함께 달릴 차량은?",
  "교통량을 맞춰 보세요.",
  "이제 출발할 준비가 됐어요.",
];
const wizardDescriptions = [
  "별점과 예상 시간, 코스의 특징을 확인하세요. 도착 후 주차까지 이어집니다.",
  "두 차량의 크기와 회전 반경 차이를 익혀 보세요.",
  "여유로운 도로부터 차량이 많은 도심까지, 세 단계로 조절합니다.",
  "선택한 코스를 확인하고 천천히 출발하세요.",
];
function showWizardStep(step, focus = true) {
  if (busy && step !== wizardStep) cancelDrivePreparation();
  wizardStep = Math.max(1, Math.min(4, step));
  $("#select").dataset.step = wizardStep;
  $("#regions").hidden = true;
  $("#course-panel").hidden = wizardStep !== 1;
  $(".vehicle-section").hidden = wizardStep !== 2;
  $("#planner").hidden = wizardStep !== 4;
  $(".places-panel").hidden = true;
  $(".trip-panel").hidden = wizardStep !== 4;
  $("#difficulty-panel").hidden = wizardStep !== 3;
  $("#toll-options").hidden = selectedCourse?.theme !== 'expressway';
  $("#step-caption").textContent = `STEP ${wizardStep} / 4 · ${wizardLabels[wizardStep - 1]}`;
  $("#step-title").textContent = wizardTitles[wizardStep - 1];
  // Replay the sign-plate entrance and a menu sound on every step change.
  $("#step-title").style.animation = "none";
  void $("#step-title").offsetWidth;
  $("#step-title").style.animation = "";
  if (!$("#select").hidden) uiBlip();
  $("#step-description").textContent = wizardDescriptions[wizardStep - 1];
  $("#step-progress").replaceChildren(
    ...wizardLabels.map((name, i) => {
      const li = document.createElement("li"),
        button = document.createElement("button"),
        number = document.createElement("span"),
        label = document.createElement("span");
      li.className = i + 1 < wizardStep ? "passed" : i + 1 === wizardStep ? "current" : "";
      number.textContent = i + 1;
      number.className = "step-number";
      label.textContent = name;
      button.append(number, label);
      button.dataset.step = i + 1;
      button.disabled = !canVisitStep(i+1,maxReachedStep);
      button.setAttribute(
        "aria-label",
        `${i + 1}단계 ${name}${button.disabled ? " · 이전 단계를 먼저 완료하세요" : ""}`,
      );
      if (i + 1 === wizardStep) button.setAttribute("aria-current", "step");
      button.onclick = () => showWizardStep(i + 1);
      li.append(button);
      return li;
    }),
  );
  if (wizardStep === 3) renderDifficulties();
  updateWizard();
  drawOverview();
  if (focus) {
    $("#step-title").focus({ preventScroll: true });
    $("#select").scrollTo({ top: 0, behavior: "instant" });
  }
}
function updateWizard() {
  for (const b of document.querySelectorAll("#step-progress button"))
    b.disabled = Number(b.dataset.step) > maxReachedStep;
  const labels = [
    selectedCourse?.name,
    car.name,
    difficulty.description,
    "안전하게 출발하세요",
  ];
  $("#step-selection").textContent = labels[wizardStep - 1] || "선택해 주세요";
  $("#step-back").textContent = wizardStep === 1 ? "← 타이틀" : "← 이전";
  $("#step-next").hidden = wizardStep === 4;
  $("#step-next").textContent = `${wizardLabels[wizardStep] || "출발"} →`;
  $("#step-next").disabled =
    !regionReady || busy || !selectedCourse || !courseBundle;
  $("#departure-name").textContent = departure?.name || "출발지를 선택하세요";
  $("#drive-summary").textContent = `${car.name} · ${difficulty.name} · ${difficulty.description}`;
  $("#review-course-title").textContent=selectedCourse?.name||'';
  $("#review-course-meta").textContent=selectedCourse?`${selectedCourse.region} · ${stars(selectedCourse)} · 예상 ${courseTime(selectedCourse)} · 주차 포함`:'';
}
$("#step-back").onclick = () => (wizardStep === 1 ? returnToTitle() : showWizardStep(wizardStep - 1));
$("#step-next").onclick = () => {
  if (!$("#step-next").disabled) {
    maxReachedStep = Math.max(maxReachedStep, wizardStep + 1);
    showWizardStep(wizardStep + 1);
  }
};
function cancelDrivePreparation() {
  driveAttempt++;
  driveAbort?.abort();
  driveAbort = null;
  busy = false;
  clearInterval(prepareTimer);
  $("#route-preparation").hidden = true;
  $("#start").textContent = "운전 시작";
  $("#intro-status").textContent = regionReady ? "" : "지도를 불러오는 중…";
  updateStart();
}
function preparationStage(stage) {
  prepareStage = stage;
  for (const [i, li] of [...$("#preparation-stages").children].entries()) {
    li.className = i < stage ? "complete" : i === stage ? "working" : "";
    li.setAttribute("aria-current", i === stage ? "step" : "false");
  }
  updatePreparationTime();
}
function updatePreparationTime() {
  const elapsed = Math.floor((performance.now() - prepareStarted) / 1000);
  $("#preparation-detail").textContent =
    `${["주차장 진입 위치 확인 중", "주행 경로 계산 중", "도로와 운전석 준비 중"][prepareStage]} · ${elapsed}초${elapsed >= 10 ? " · 지도 서비스 응답을 기다리고 있습니다" : ""}`;
}
$("#prepare-cancel").onclick = () => {
  cancelDrivePreparation();
  $("#trip-status").textContent = "준비를 취소했습니다. 코스를 바꾸거나 다시 시작할 수 있습니다.";
};
function renderDifficulties() {
  $("#difficulties").replaceChildren(
    ...DIFFICULTIES.map((d, index) => {
      const b = document.createElement("button");
      b.className = `difficulty-card${difficulty.id === d.id ? " selected" : ""}`;
      b.dataset.difficulty = d.id;
      b.setAttribute("aria-pressed", String(difficulty.id === d.id));
      const visual = document.createElement("div");
      visual.className = "traffic-visual";
      for (let i = 0; i < [3, 10, 25][index]; i++) {
        const dot = document.createElement("i");
        dot.style.setProperty("--i", i);
        visual.append(dot);
      }
      const title = document.createElement("strong");
      title.textContent = d.name;
      const description = document.createElement("p");
      description.textContent = d.description;
      const help = document.createElement("span");
      help.textContent = ["처음이라면 천천히", "차간 간격과 신호 확인", "혼잡한 도심 주행 연습"][index];
      b.append(visual, title, description, help);
      b.onclick = () => {
        difficulty = d;
        try {
          localStorage.setItem("drive-difficulty", d.id);
        } catch {}
        renderDifficulties();
        updateWizard();
      };
      return b;
    }),
  );
}

function updateStart() {
  if(selectedCourse){$("#start").disabled=busy||!courseBundle;updateWizard();return;}
  $("#start").disabled =
    busy || !departure || !selected || selected.resolved === false || selected.id === departure.id;
  if (selected?.id === departure?.id) $("#trip-status").textContent = "출발지와 다른 목적지를 선택해 주세요.";
  updateWizard();
}
$("#departure").onchange = () => {
  departure = [...documentPois, ...allPois].find((p) => p.id === $("#departure").value);
  route = [];
  updateStart();
  drawOverview();
};
for (const s of ["#source-filter", "#kind-filter", "#area-filter", "#search"])
  $(s).addEventListener(s === "#search" ? "input" : "change", () => {
    pageSize = 24;
    renderPlaces();
    drawOverview();
  });
$("#more").onclick = () => {
  pageSize += 24;
  renderPlaces();
};
$("#quick-test").onclick = () => {
  if (busy || !region.island) return;
  trainingMode = "drive";
  departure = documentPois.find((p) => p.id === "canphou");
  selected = documentPois.find((p) => p.id === "kaihoumaru");
  $("#departure").value = departure.id;
  $("#chosen").textContent = selected.name;
  renderPlaces();
  updateStart();
  drawOverview();
};

function drawOverview() {
  if(selectedCourse){drawCourseMap(overview,selectedCourse,courseBundle);return;}
  const w = overview.clientWidth || 440,
    h = overview.clientHeight || 350,
    dpr = Math.min(devicePixelRatio, 2);
  if (overview.width !== Math.round(w * dpr) || overview.height !== Math.round(h * dpr)) {
    overview.width = Math.round(w * dpr);
    overview.height = Math.round(h * dpr);
  }
  oc.setTransform(dpr, 0, 0, dpr, 0, 0);
  oc.fillStyle = "#0b232d";
  oc.fillRect(0, 0, w, h);
  const geoPoints = coast || allPois.map((p) => proj.toLocal([p.lon, p.lat]));
  if (!geoPoints.length) return;
  const xs = geoPoints.map((p) => p.x),
    ys = geoPoints.map((p) => p.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    maxX = Math.max(...xs),
    maxY = Math.max(...ys);
  const scale = Math.min((w - 65) / (maxX - minX || 1), (h - 45) / (maxY - minY || 1));
  const cv = (p) => ({
    x: w / 2 + (p.x - (minX + maxX) / 2) * scale,
    y: h / 2 + (p.y - (minY + maxY) / 2) * scale,
  });
  if (coast) {
    oc.beginPath();
    coast.forEach((p, i) => {
      const q = cv(p);
      i ? oc.lineTo(q.x, q.y) : oc.moveTo(q.x, q.y);
    });
    oc.closePath();
    oc.fillStyle = "#2b5555";
    oc.fill();
    oc.strokeStyle = "#497975";
    oc.lineWidth = 1;
    oc.stroke();
  }
  for (const p of displayed.filter((p) => p.resolved !== false)) {
    const q = cv(proj.toLocal([p.lon, p.lat]));
    oc.fillStyle = "#80bcb37a";
    oc.beginPath();
    oc.arc(q.x, q.y, 2, 0, Math.PI * 2);
    oc.fill();
  }
  if (route.length) {
    oc.beginPath();
    route.forEach((p, i) => {
      const q = cv(p);
      i ? oc.lineTo(q.x, q.y) : oc.moveTo(q.x, q.y);
    });
    oc.strokeStyle = "#b9f3cc";
    oc.lineWidth = 2;
    oc.stroke();
  }
  for (const [p, label, color] of [
    [departure, "출발", "#b9f3cc"],
    [selected, "도착", "#ffbd8c"],
  ]) {
    if (!p || p.resolved === false) continue;
    const q = cv(proj.toLocal([p.lon, p.lat]));
    oc.fillStyle = color;
    oc.beginPath();
    oc.arc(q.x, q.y, 5, 0, Math.PI * 2);
    oc.fill();
    oc.font = "12px Malgun Gothic";
    oc.fillText(t(label), q.x + 9, q.y + 4);
  }
  oc.font = "10px Malgun Gothic";
  oc.fillStyle = "#8eafb6";
  oc.fillText("N ↑", 20, 25);
  oc.fillText(t(region.island ? "실제 본섬 해안선 · OSM" : "실제 지도 등록 위치"), 20, h - 15);
}

function drawIntroMap() {
  if(selectedCourse){drawCourseMap($('#intro-map'),selectedCourse,courseBundle);return;}
  const canvas = $("#intro-map"),
    c = canvas.getContext("2d"),
    w = canvas.clientWidth,
    h = canvas.clientHeight;
  if (!w || !h || !coast) return;
  const dpr = Math.min(devicePixelRatio, 2);
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.clearRect(0, 0, w, h);
  const b = coast.reduce(
    (a, p) => [Math.min(a[0], p.x), Math.min(a[1], p.y), Math.max(a[2], p.x), Math.max(a[3], p.y)],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
  const scale = Math.min((w - 100) / (b[2] - b[0]), (h - 70) / (b[3] - b[1]));
  const cv = (p) => ({
    x: w * 0.48 + (p.x - (b[0] + b[2]) / 2) * scale,
    y: h * 0.5 + (p.y - (b[1] + b[3]) / 2) * scale,
  });
  c.strokeStyle = "#cce6d50a";
  for (let x = 24; x < w; x += 44) {
    c.beginPath();
    c.moveTo(x, 0);
    c.lineTo(x, h);
    c.stroke();
  }
  for (let y = 12; y < h; y += 44) {
    c.beginPath();
    c.moveTo(0, y);
    c.lineTo(w, y);
    c.stroke();
  }
  c.beginPath();
  coast.forEach((p, i) => {
    if (i % 6 && i !== coast.length - 1) return;
    const q = cv(p);
    i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y);
  });
  c.closePath();
  const gradient = c.createLinearGradient(0, 0, w, h);
  gradient.addColorStop(0, "#42695d");
  gradient.addColorStop(1, "#172e31");
  c.fillStyle = gradient;
  c.shadowBlur = 36;
  c.shadowColor = "#92cf9c30";
  c.fill();
  c.shadowBlur = 0;
  c.strokeStyle = "#a7caa870";
  c.lineWidth = 1.1;
  c.stroke();
  for (const place of documentPois.filter((p) => p.resolved)) {
    const q = cv(proj.toLocal([place.lon, place.lat]));
    c.fillStyle = "#c8e5b1";
    c.globalAlpha = 0.55;
    c.beginPath();
    c.arc(q.x, q.y, 2.3, 0, Math.PI * 2);
    c.fill();
  }
  c.globalAlpha = 1;
  for (const [geo, name] of [
    [[127.68, 26.214], "나하"],
    [[127.76, 26.32], "차탄"],
    [[127.89, 26.68], "모토부"],
    [[128.25, 26.86], "헤도곶"],
  ]) {
    const q = cv(proj.toLocal(geo));
    c.fillStyle = "#d3e1a529";
    c.beginPath();
    c.arc(q.x, q.y, 10, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#dce7be";
    c.beginPath();
    c.arc(q.x, q.y, 3, 0, Math.PI * 2);
    c.fill();
    c.font = "11px Malgun Gothic";
    c.fillText(t(name), q.x + 12, q.y + 4);
  }
  c.font = "10px Segoe UI";
  c.fillStyle = "#7eaa9b";
  c.fillText("N ↑", 20, 28);
  c.fillStyle = "#638d84";
  c.fillText("© OpenStreetMap", 20, h - 12);
}

$("#start").onclick = async () => {
  if ($("#start").disabled) return;
  if(selectedCourse)return startCourse();
  sound.start();
  const attempt = ++driveAttempt;
  driveAbort = new AbortController();
  const abortSignal = driveAbort.signal;
  busy = true;
  updateStart();
  $("#start").textContent = "길을 준비하는 중…";
  $("#trip-status").className = "muted";
  $("#trip-status").textContent = "목적지 주차장으로 가는 길을 준비하고 있습니다…";
  $("#intro-status").textContent = "드라이브를 준비하고 있습니다…";
  $("#route-preparation").hidden = false;
  prepareStarted = performance.now();
  preparationStage(0);
  clearInterval(prepareTimer);
  prepareTimer = setInterval(updatePreparationTime, 1000);
  try {
    const current = session;
    if (selected.id === "kaihoumaru")
      parkingGoal = { ...bays[1], type: "bay", name: "하나사키 마르셰 공용 주차장" };
    else if (destinationSites.some((s) => s.id === selected.id)) {
      parkingGoal = destinationSites.find((s) => s.id === selected.id);
      features = [
        ...features.filter((f) => f.id !== "site-" + selected.id),
        {
          id: "site-" + selected.id,
          points: parkingGoal.points,
          center: parkingGoal.center,
          height: null,
          tags: { amenity: "parking", name: parkingGoal.name },
        },
      ];
    } else {
      const q = `[out:json][timeout:25];way(around:400,${selected.lat},${selected.lon})[amenity=parking][access!~"^(private|no)$"];out geom;`;
      const data = await overpass(q, abortSignal);
      if (current !== session || attempt !== driveAttempt) return;
      const candidates = sceneFeatures(data, proj).filter((f) => f.tags.access !== "private");
      const site = proj.toLocal([selected.lon, selected.lat]);
      candidates.sort((a, b) => distance(a.center, site) - distance(b.center, site));
      if (candidates.length) {
        const area = candidates[0];
        parkingGoal = {
          type: "area",
          points: area.points,
          center: area.center,
          heading: 0,
          name: area.tags.name || selected.name + " 주차장",
        };
        features = [...features, ...candidates];
      } else
        // No mapped parking: finish with a safe stop at the roadside in
        // front of the destination (placed on the route's last road point).
        parkingGoal = { type: "area", roadside: true, center: site, points: [], heading: 0, name: `${selected.name} 앞 도로변` };
    }
    const target = proj.toGeo(parkingGoal.center);
    preparationStage(1);
    const query = new URLSearchParams({
      start: `${departure.lon},${departure.lat}`,
      end: `${target[0]},${target[1]}`,
    });
    const data = await mapRoute(query.get("start"), query.get("end"), abortSignal);
    // Connected-island destinations use road routes; ferry legs are rejected.
    if (current !== session || attempt !== driveAttempt) return;
    routeInfo = validateRoute(data);
    route = routeInfo.geometry.coordinates.map(proj.toLocal);
    if (parkingGoal.roadside) {
      // A 9 m × 16 m stopping zone on the left side of the last road segment.
      const end = route.at(-1),
        before = route.length > 1 ? route.at(-2) : end,
        h = headingBetween(before, end),
        f = forward(h),
        r = { x: Math.cos(h), y: Math.sin(h) },
        c = { x: end.x - r.x * 1.5, y: end.y - r.y * 1.5 };
      parkingGoal.center = c;
      parkingGoal.points = [
        [-4.5, -8],
        [4.5, -8],
        [4.5, 8],
        [-4.5, 8],
      ].map(([x, y]) => ({ x: c.x + r.x * x + f.x * y, y: c.y + r.y * x + f.y * y }));
    }
    steps = routeInfo.legs
      .flatMap((l) => l.steps)
      .map((s) => {
        const point = proj.toLocal(s.maneuver.location);
        return { ...s, point, atDistance: routeProgress(route, point, routeInfo.distance).travelled };
      });
    preparationStage(2);
    await store.ensure(route[0]);
    if (current !== session || attempt !== driveAttempt) return;
    if (!store.roads.length) throw new Error("출발 위치의 도로 데이터를 불러오지 못했습니다.");
    // Buildings are scenery: wait briefly, never fail the drive for them.
    if (buildings)
      await Promise.race([buildings.ensure(route[0], abortSignal).catch(() => false), new Promise((r) => setTimeout(r, 9000))]);
    if (current !== session || attempt !== driveAttempt) return;
    trainingMode = "drive";
    resetPosition();
    roadError = "";
    done = false;
    paused = false;
    rear = false;
    active = true;
    intro = false;
    navZoom = false;
    parkedSeconds = 0;
    safetyScore = 100;
    simulationTime = 0;
    lastCollision = -10;
    lastSignalViolation = -10;
    feedbackUntil = 0;
    keys.clear();
    scoreCard = new DrivingScore();
    drivenDistance = 0;
    stopHistory.clear();
    passedCameras.clear();
    checkedTurns.clear();
    warningUntil = 0;
    $("#violation-warning").hidden = true;
    signals = signalRecords.filter((s) => distance(s, pos) < 2200);
    traffic = new TrafficSimulation(store.roads, signals, pos, difficulty.cars);
    driver?.setup({
      base: pos,
      roads: store.roads,
      features: sceneList(),
      coast,
      elevation,
      signals,
      bays: parkingGoal.type === "bay" ? bays : [{ ...parkingGoal, target: true }],
      car,
      projection: proj,
    });
    driver?.setRoadRules(roadRules, store.roads);
    $("#driving-car").textContent = `${car.name} · 우핸들`;
    $("#destination").textContent = selected.name;
    $("#nav").hidden = false;
    $("#hud").hidden = false;
    $("#hint").hidden = false;
    $("#menu").hidden = false;
    $("#select").hidden = true;
    $("#result").hidden = true;
    $("#splash").hidden = true;
    setTitle(false);
    document.body.classList.remove("in-menu");
    document.body.classList.add("driving");
    window.scrollTo(0, 0);
    $("#trip-status").textContent = `${distanceText(routeInfo.distance)} · 자동차 경로 연결됨`;
    drawOverview();
  } catch (error) {
    if (attempt === driveAttempt && error.name !== "AbortError") {
      $("#trip-status").className = "muted error";
      $("#trip-status").textContent = error.message;
      $("#intro-status").textContent = error.message;
    }
  } finally {
    if (attempt === driveAttempt) {
      busy = false;
      driveAbort = null;
      clearInterval(prepareTimer);
      $("#route-preparation").hidden = true;
      $("#start").textContent = $("#trip-status").classList.contains("error") ? "다시 시도" : "운전 시작";
      updateStart();
    }
  }
};

function resetPosition() {
  if (!route.length) return;
  lastWallContact=null;
  tollSession?.reset();
  tollAction=false;
  $('#toll-prompt').hidden=true;
  pos = { ...route[0] };
  speed = 0;
  shiftHoldUntil = 0;
  laneAdvice='';
  gear = 1;
  steer = 0;
  refreshNearFeatures();
  const ahead = route.find((p) => Math.hypot(p.x - pos.x, p.y - pos.y) > 4) || route.at(-1);
  heading = Math.atan2(ahead.x - pos.x, -(ahead.y - pos.y));
  visibleRoads = store.near(pos);
  lastRoadCheck = 0;
  // Start in the left travel lane on two-way roads, not on the centreline.
  const lane = nearestRoad(pos);
  if (lane && (lane.road.tags.highway !== "service" || Number(lane.road.tags.lanes)>=2) && !["yes", "1", "-1"].includes(lane.road.tags.oneway)) {
    pos.x -= Math.cos(heading) * 1.5;
    pos.y -= Math.sin(heading) * 1.5;
  }
  // A parked car starts with the parking brake set: release it with B,
  // keep the brake pressed, then pull away — as in a real car.
  parkingBrake = true;
  parkedSeconds = 0;
  gasLevel = 0;
  brakeLevel = 0;
  blinker = 0;
}
$("#reset-position").onclick = resetPosition;
$("#menu").onclick = () => {
  active = false;
  paused = false;
  keys.clear();
  speed = 0;
  $("#select").hidden = false;
  $("#nav").hidden = true;
  $("#hud").hidden = true;
  $("#hint").hidden = true;
  $("#menu").hidden = true;
  $("#result").hidden = true;
  document.body.classList.remove("driving");
  document.body.classList.add("in-menu");
  maxReachedStep = 4;
  showWizardStep(1);
  drawOverview();
};
window.addEventListener("keydown", (e) => {
  if (!active || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) e.preventDefault();
  keys.add(e.code);
  if (e.repeat) return;
  if (e.code === "KeyR") changeGear(gear > 0 ? -1 : 1);
  if (e.code === "KeyC") rear = !rear;
  if (e.code === "KeyP") {
    paused = !paused;
    $("#pause-menu").hidden = !paused;
  }
  if (e.code === "Escape") {
    paused = !paused;
    $("#pause-menu").hidden = !paused;
  }
  if (e.code === "KeyM") navZoom = !navZoom;
  if (e.code === "KeyB" && speed < 0.2) parkingBrake = !parkingBrake;
  if (e.code === "KeyZ") setBlinker(-1);
  if (e.code === "KeyX") setBlinker(1);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
function clearDriveInput(){keys.clear();gasLevel=0;brakeLevel=0;document.querySelectorAll('[data-key].held').forEach(b=>b.classList.remove('held'));}
window.addEventListener('orientationchange',()=>{clearDriveInput();if(active&&!done){paused=true;$('#pause-menu').hidden=false;}});
window.addEventListener("blur", () => {
  clearDriveInput();
  if (active && !done) {
    paused = true;
    $("#pause-menu").hidden = false;
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    clearDriveInput();
    if (active && !done) {
      paused = true;
      $("#pause-menu").hidden = false;
    }
  }
});
for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if(!active||paused||done)return;
    button.setPointerCapture(e.pointerId);
    keys.press(e.pointerId, button.dataset.key);
    button.classList.add("held");
  });
  const release = (e) => {
    keys.release(e.pointerId);
    button.classList.toggle("held", keys.has(button.dataset.key));
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
for (const button of document.querySelectorAll("[data-action]"))
  bindDriveAction(button, () => {
    if (!active||paused||done) return;
    const action = button.dataset.action;
    if (action === "gear") changeGear(gear > 0 ? -1 : 1);
    if (action === "brake") {if(speed < 0.2)parkingBrake = !parkingBrake;else coach("완전히 멈춘 뒤 주차 브레이크를 사용하세요.");}
    if (action === "nav") navZoom = !navZoom;
    if (action === "blink-left") setBlinker(-1);
    if (action === "blink-right") setBlinker(1);
    if (action === "pause") {
      paused = true;
      clearDriveInput();
      $("#pause-menu").hidden = false;
    }
  });
let controlFeedbackTimer;
function controlFeedback(message) {
  coach(message);
  const output=$('#control-feedback');output.textContent=message;output.hidden=false;
  clearTimeout(controlFeedbackTimer);controlFeedbackTimer=setTimeout(()=>output.hidden=true,3200);
}
function changeGear(next) {
  if (!active || paused || done) return;
  const change = selectGear({ speed, gear, parkingBrake }, next,
    keys.has('KeyS') || keys.has('ArrowDown') || keys.has('Space'));
  if (!change.ok) {
    controlFeedback(change.reason === 'moving'
      ? "먼저 제동 버튼으로 완전히 정차한 뒤 기어를 바꿔 주세요."
      : "제동 버튼을 누른 채 다른 손가락으로 D 또는 R을 누르세요.");
    return;
  }
  gear = change.state.gear;
  speed = 0;
  gasLevel = 0;
  brakeLevel = Math.max(brakeLevel, 0.5);
  shiftHoldUntil = simulationTime + 0.45;
  rear = false;
  controlFeedback(
    gear < 0
      ? "R 후진 · W / ↑ 또는 가속 버튼으로 천천히 후진하세요."
      : "D 전진 · W / ↑ 또는 가속 버튼으로 출발하세요.",
  );
}
bindDriveAction($("#gear-forward"), () => changeGear(1));
bindDriveAction($("#gear-reverse"), () => changeGear(-1));
bindDriveAction($("#nav-closer"), () => { if(active&&!paused&&!done)navZoom=!navZoom; });

function drawMap(context, width, height, scale) {
  // Heading-up map with the car two thirds of the way down.
  const cv = (p) => {
    const dx = p.x - pos.x,
      dy = p.y - pos.y;
    return {
      x: width / 2 + (dx * Math.cos(heading) + dy * Math.sin(heading)) * scale,
      y: height * NAV_ANCHOR + (-dx * Math.sin(heading) + dy * Math.cos(heading)) * scale,
    };
  };
  drawNavMap(context, width, height, scale, {
    roads: visibleRoads,
    features: visibleFeatures,
    route,
    goal: parkingGoal?.center,
    parkingPoints: parkingGoal?.points,
    currentPosition:pos,
    routeIndex:navInfo.routeIndex,
    turnPoint:navInfo.toTurn<180?navInfo.turnPoint:null,
    convert: cv,
  });
  drawCarMarker(context, width / 2, height * NAV_ANCHOR, Math.max(14, Math.min(25, width / 28)));
}

let buildingBusy = false;
async function updateBuildings(current) {
  if (selectedCourse || !buildings || buildingBusy || !active) return;
  buildingBusy = true;
  try {
    if ((await buildings.ensure(pos)) && current === session && active) {
      driver?.setBuildings(sceneList());
      refreshNearFeatures();
    }
  } catch {
    // Scenery only: try again on the next road check.
  } finally {
    buildingBusy = false;
  }
}
async function updateRoads() {
  if(selectedCourse){traffic?.recenter(store.roads.filter(r=>!r.id.startsWith('practice-')),pos);return;}
  if (roadBusy || !active) return;
  roadBusy = true;
  const current = session;
  try {
    await store.ensure(pos);
    if (current === session) {
      visibleRoads = store.near(pos);
      driver?.setRoads(store.roads);
      driver?.setRoadRules(roadRules, visibleRoads, pos);
      traffic?.recenter(store.roads, pos);
      const nearby = signalRecords.filter((s) => distance(s, pos) < 1800);
      if (nearby.map((s) => s.id).join("|") !== signals.map((s) => s.id).join("|")) {
        signals = nearby;
        driver?.setSignals(signals, store.roads);
        if (traffic) traffic.signals = signals;
      }
      roadError = "";
    }
  } catch (error) {
    if (current === session) roadError = error.message;
  } finally {
    roadBusy = false;
  }
  updateBuildings(current);
}

function hud() {
  const progress = routeProgress(route, pos, routeInfo?.distance),
    d = Math.hypot(route.at(-1).x - pos.x, route.at(-1).y - pos.y);
  if(selectedCourse){
    $('#course-drive-time').textContent=`${Math.floor(simulationTime/60)}:${String(Math.floor(simulationTime%60)).padStart(2,'0')} / 예상 ${courseTime(selectedCourse)}`;
    $('#course-drive-stage').textContent=progress.remaining<80?'목적지 주차장에 들어가 주차하세요':`${Math.round(progress.travelled/routeInfo.distance*100)}% · 내비게이션을 따라 주행`;
  }
  $("#speed").textContent = Math.round(speed * 3.6);
  $("#gear").textContent = gear > 0 ? "D" : "R";
  $("#remaining").textContent = distanceText(progress.remaining);
  $("#distance").textContent = `경로상 남은 거리 ${distanceText(progress.remaining)}`;
  const {next,toTurn,then}=nextNavigationStep(steps,progress.travelled,progress.remaining);
  const direction =
    {
      left: "좌회전",
      right: "우회전",
      straight: "직진",
      "slight left": "완만한 좌회전",
      "slight right": "완만한 우회전",
      "sharp left": "급한 좌회전",
      "sharp right": "급한 우회전",
      uturn: "유턴",
    }[next?.maneuver.modifier] || (next?.maneuver.type === "arrive" ? "목적지 도착" : "도로를 따라 이동");
  $("#instruction").textContent =
    `${distanceText(toTurn)} 후 ${direction}${next?.name ? " · " + next.name : ""}`;
  const toPark = parkingGoal ? distance(pos, parkingGoal.center) : Infinity;
  const parkingNearby=toPark<65&&progress.remaining<120;
  const status = parkingStatus({ ...pos, heading, speed, parkingBrake }, car, parkingGoal, parkedSeconds);
  const directionVector = forward(heading);
  const aheadSignals = signals
    .map((s) => ({
      signal: s,
      ahead: (s.x - pos.x) * directionVector.x + (s.y - pos.y) * directionVector.y,
      lateral: Math.abs((s.x - pos.x) * directionVector.y - (s.y - pos.y) * directionVector.x),
    }))
    .filter((s) => s.ahead > 0 && s.ahead < 100 && s.lateral < 8)
    .sort((a, b) => a.ahead - b.ahead);
  const nearbySignal = aheadSignals[0],
    signalColor = nearbySignal ? signalPhase(nearbySignal.signal, heading, simulationTime) : "none";
  if (parkingNearby)
    $("#instruction").textContent =
      status.inside ? "제동을 눌러 완전히 멈추면 주차 완료" : "초록색 P 주차면 안에 차 전체를 넣으세요";
  const korean = (t = "") => t.replace(/県道(\d+)号線/g, "현도 $1호선").replace(/国道(\d+)号線/g, "국도 $1호선");
  const remainingSeconds =
    routeInfo?.duration && routeInfo?.distance ? (routeInfo.duration * progress.remaining) / routeInfo.distance : null;
  const arrival = remainingSeconds != null ? new Date(Date.now() + remainingSeconds * 1000) : null;
  navInfo = {
    instruction: korean($("#instruction").textContent),
    maneuver: parkingNearby ? { type: "arrive" } : next?.maneuver,
    turnPoint:next?.point,
    routeIndex:progress.index,
    then:then?.maneuver.type==='turn'&&then.atDistance-next.atDistance<80?{maneuver:then.maneuver,distance:then.atDistance-next.atDistance}:null,
    action: direction,
    lesson: laneAdvice || (gear>0&&driver?.encounters?.approaching({...pos,heading,length:car.length})?'횡단보도 · 보행자가 건넌 뒤 출발':'') || (toTurn<65&&next?.maneuver.modifier?.includes('right')
      ? (nearbySignal&&signalRightArrow(nearbySignal.signal,heading,simulationTime)?'우회전 화살표 · 진행 방향 확인':'우회전 · 대향차 확인 후 왼쪽 차로')
      : toTurn<65&&next?.maneuver.modifier?.includes('left')?'좌회전 · 왼쪽 가장자리를 따라 천천히':''),
    alert:!!laneAdvice,
    street: korean(next?.name || ""),
    toTurn,
    minutes: remainingSeconds != null ? Math.max(1, Math.round(remainingSeconds / 60)) : null,
    eta: arrival
      ? `${String(arrival.getHours()).padStart(2, "0")}:${String(arrival.getMinutes()).padStart(2, "0")}`
      : null,
    limit: currentLimit.value,
    speed: Math.round(speed * 3.6),
    parking: parkingNearby,
    remainingMeters: progress.remaining,
    destination: selected?.name || "주차 연습",
    remaining: parkingNearby ? `${Math.round(toPark)} m · 주차` : distanceText(progress.remaining),
    distanceToTurn: toTurn,
    parkingDistance: toPark,
  };
  $("#road-status").textContent = roadError || (roadBusy ? "주변 길을 불러오는 중" : "안전거리를 유지하세요");
  const touchUI=document.body.dataset.driveLayout!=='desktop';
  $("#hint").textContent = done
    ? "주차 완료 · 다음 드라이브를 선택하세요"
    : paused
      ? (touchUI?"일시정지 · 계속 운전을 눌러 돌아가세요":"일시정지 · Esc로 계속")
      : parkingBrake && toPark >= 65
        ? (touchUI?"제동을 누른 채 ‘주차’ 버튼을 눌러 출발하세요.":"주차 브레이크가 걸려 있습니다 · S로 브레이크를 밟은 채 B로 해제하세요")
        : simulationTime < 7
        ? (touchUI?"양쪽 버튼으로 조향·가속·제동하세요. 회전 전에는 깜빡이를 켜세요.":"W 가속 · S 제동 · A/D 조향 · Z/X 방향지시등 · Q/E 미러 확인")
        : feedbackUntil > simulationTime
          ? feedback
          : parkingNearby
            ? status.ready
              ? "주차면 안입니다 · 1초 동안 정차를 유지하세요"
              : status.inside
                ? "제동을 눌러 완전히 멈추면 주차가 완료됩니다."
                : "차량 전체가 주차 구역 안에 들어가야 합니다."
            : parkingBrake
              ? (touchUI?"‘주차’ 버튼으로 주차 브레이크를 해제하세요.":"주차 브레이크가 걸려 있습니다 · B로 해제")
              : "왼쪽 차선으로 달리고, 교차로에서는 신호와 주변 차량을 확인하세요.";
  $("#telemetry").textContent =
    `${car.name} · ${trainingMode === "parking" ? "주차 연습" : "드라이브"} · ${Math.round(speed * 3.6)}km/h · ${gear > 0 ? "D" : "R"} · ${status.inside ? "주차면 안" : "주차면 밖"} · ${parkingBrake ? "주차 브레이크 작동" : "주차 브레이크 해제"}`;
  Object.assign($("#telemetry").dataset, {
    x: pos.x,
    y: pos.y,
    heading,
    speed,
    steer,
    gear,
    difficulty: difficulty.id,
    navScale: driver?.mapScale || 0,
    parkingDistance: toPark,
    inside: status.inside,
    aligned: status.aligned,
    brake: parkingBrake,
    traffic: traffic?.cars.length || 0,
    signals: signals.length,
  });
  Object.assign($("#telemetry").dataset, { signalColor, signalDistance: nearbySignal?.ahead ?? -1 });
  $("#live-speed").textContent = Math.round(speed * 3.6);
  $("#live-gear").textContent = parkingBrake ? "P" : gear > 0 ? "D" : "R";
  $("#live-gear").className = parkingBrake ? "park" : gear < 0 ? "reverse" : "";
  $("#blink-hint").hidden = !blinker;
  $("#speed-limit-value").textContent = currentLimit.value ?? "—";
  $("#speed-limit-note").textContent = currentLimit.value ? "제한속도" : "표지 확인";
  $("#speed-limit").classList.toggle("unknown", currentLimit.value == null);
  $("#speed-limit").classList.toggle("over", currentLimit.value != null && speed * 3.6 > currentLimit.value);
  $("#live-score").textContent = scoreCard.score;
  if (simulationTime > warningUntil) $("#violation-warning").hidden = true;
  Object.assign($("#telemetry").dataset, {
    limit: currentLimit.value ?? "",
    score: scoreCard.score,
    violations: scoreCard.events.length,
  });
  for (const [id, on] of [
    ["#gear-forward", gear > 0],
    ["#gear-reverse", gear < 0],
  ]) {
    $(id).classList.toggle("selected", on);
    $(id).setAttribute("aria-pressed", String(on));
  }
  $("#gear-state").textContent = parkingBrake
    ? "주차 브레이크 작동"
    : gear < 0
      ? (touchUI?"R 후진 · 후방카메라 확인":"R 후진 · W 가속 / S 제동")
      : (touchUI?"D 전진 · 페달로 속도 조절":"D 전진 · W 가속 / S 제동");
  const parkButton=$('[data-action="brake"]');parkButton.textContent=parkingBrake?'주차 해제':'주차 잠금';parkButton.setAttribute('aria-pressed',String(parkingBrake));parkButton.classList.toggle('selected',parkingBrake);
  for(const [action,side]of [['blink-left',-1],['blink-right',1]])$(`[data-action="${action}"]`).setAttribute('aria-pressed',String(blinker===side));
  if (nearbySignal && nearbySignal.ahead < 45 && signalColor === "red" && !done && !paused)
    $("#hint").textContent = signalRightArrow(nearbySignal.signal,heading,simulationTime)
      ? "녹색 우회전 화살표입니다. 우회전 차량만 진행 방향을 확인하세요."
      : "빨간 신호입니다. 정지선 앞에 멈추고 녹색 신호를 기다리세요.";
}

function coach(message, penalty = 0) {
  feedback = message;
  feedbackUntil = simulationTime + 4;
  safetyScore = Math.max(0, safetyScore - penalty);
}
function warnViolation(event, message) {
  if (!event) return;
  sound.chime();
  coach(message || event.name);
  warningUntil = simulationTime + 4;
  $("#violation-warning").hidden = false;
  $("#violation-warning").textContent =
    `⚠ ${message || event.name}${event.penalty ? "  ·  −" + event.penalty + "점" : ""}`;
}
function monitorRules(dt) {
  const lane = nearestRoad(pos);
  if (!lane) return;
  currentLimit =
    lane.distance < roadWidth(lane.road.tags) / 2 + 2
      ? mappedSpeedLimit(lane.road.tags, heading, lane.heading)
      : { value: null };
  const inLot = visibleFeatures.some((f) => f.tags.amenity === "parking" && insidePolygon(pos, f.points));
  if (inLot) currentLimit = { value: null };
  const speeding = currentLimit.value != null && speed * 3.6 > currentLimit.value + 1;
  warnViolation(
    scoreCard.sustained("speeding", speeding, dt, simulationTime),
    `제한속도 ${currentLimit.value}km/h 초과 · 속도를 줄여 주세요.`,
  );
  if(ruleRoads!==store.roads){ruleRoads=store.roads;ruleJunctions=roadJunctions(store.roads).map(j=>({...j,radius:Math.max(...j.arms.map(a=>a.width/2))+car.length/2+1}));}
  const inJunction=ruleJunctions.some(j=>distance(pos,j)<j.radius);
  const laneState=leftTrafficStatus({...pos,heading,gear},lane,{inLot,inJunction});
  const wrong=laneState.wrong&&speed>.5;
  laneAdvice=wrong?'왼쪽 차로와 진행 방향을 확인하세요':'';
  warnViolation(
    scoreCard.sustained("wrongWay", wrong, dt, simulationTime),
    "진행 방향과 왼쪽 차선을 확인하세요.",
  );
  // Turn signal duty: on at least 30 m (about 2 s) before each turn.
  for (const step of steps) {
    const side = turnSide(step.maneuver);
    if (!side || checkedTurns.has(step)) continue;
    const d = distance(step.point, pos);
    if (d < BLINKER_LEAD_METRES + 15 && d > 12 && blinker !== side && speed > 1)
      coach(`전방 ${side < 0 ? "좌회전" : "우회전"} · ${side < 0 ? "Z" : "X"}로 방향지시등을 켜 주세요.`);
    if (d < 12) {
      checkedTurns.add(step);
      if (blinker !== side || simulationTime - blinkerSince < 1.5)
        warnViolation(
          scoreCard.add("blinker", simulationTime),
          `${side < 0 ? "좌회전" : "우회전"} 30m 전부터 방향지시등을 켜 주세요.`,
        );
    }
  }
  const f = forward(heading);
  for (const rule of roadRules) {
    const d = distance(rule, pos);
    // Leaving a stop sign behind rearms it for the next approach.
    if (d > 40) stopHistory.delete(rule.id);
    if (d > 160) continue;
    const ahead = (rule.x - pos.x) * f.x + (rule.y - pos.y) * f.y,
      lateral = Math.abs((rule.x - pos.x) * f.y - (rule.y - pos.y) * f.x);
    if (rule.tags.highway === "speed_camera" && ahead > 0 && ahead < 120 && lateral < 12) {
      $("#camera-warning").hidden = false;
      $("#camera-warning").textContent = `전방 ${Math.round(ahead)}m · 과속 단속카메라`;
      if (ahead < 8 && !passedCameras.has(rule.id)) {
        passedCameras.add(rule.id);
        if (speeding)
          warnViolation(
            scoreCard.add("camera", simulationTime),
            "단속카메라 지점에서 제한속도를 초과했습니다.",
          );
      }
    }
    if (rule.tags.highway === "stop" && lateral < 4) {
      rule.wayHeading ??= nearestRoad(rule)?.heading;
      if (rule.wayHeading == null || !stopSignApplies(rule.tags, heading, rule.wayHeading)) continue;
      const s = stopHistory.get(rule.id) || { stopped: false, passed: false, previous: null };
      if (ahead > 3 && ahead < 15 && speed < 0.1) s.stopped = true;
      if (s.previous != null && s.previous > 4 && ahead <= 4 && !s.passed && gear > 0) {
        s.passed = true;
        if (!s.stopped)
          warnViolation(scoreCard.add("stop", simulationTime), "일시정지 표지 앞에서 완전히 멈춰 주세요.");
      }
      if (ahead > 4 && ahead < 30 && !s.stopped) coach("전방 일시정지 · 정지선 앞에 완전히 멈춰 주세요.");
      s.previous = ahead;
      stopHistory.set(rule.id, s);
    }
  }
}
function nearestRoad(point) {
  let best = null;
  for (const road of visibleRoads)
    for (let i = 1; i < road.points.length; i++) {
      const match = nearestOnSegment(point, road.points[i - 1], road.points[i]);
      if (!best || match.distance < best.distance)
        best = { ...match, road, heading: headingBetween(road.points[i - 1], road.points[i]) };
    }
  return best;
}
function completeParking() {
  done = true;
  speed = 0;
  parkingBrake = true;
  clearDriveInput();
  $("#result").hidden = false;
  $("#result").replaceChildren();
  const small = document.createElement("small");
  small.textContent = "드라이브 완료";
  const h = document.createElement("h1");
  h.textContent = "주차까지, 잘 도착했습니다.";
  const p = document.createElement("p");
  p.textContent = `${parkingGoal.name}\n${car.name} · ${distanceText(drivenDistance)} · ${Math.floor(simulationTime / 60)}분 ${Math.floor(simulationTime % 60)}초`;
  const score = document.createElement("div");
  score.className = "final-score";
  score.textContent = `${scoreCard.score}`;
  const unit = document.createElement("span");
  unit.textContent = " / 100점";
  score.append(unit);
  const rows = document.createElement("dl");
  rows.className = "score-breakdown";
  for (const item of scoreCard.breakdown().filter((r) => r.type !== "camera" || r.count)) {
    const dt = document.createElement("dt"),
      dd = document.createElement("dd");
    dt.textContent = item.name;
    dd.textContent = `${item.count}회${item.penalty ? " · −" + item.penalty + "점" : ""}`;
    rows.append(dt, dd);
  }
  const note = document.createElement("p");
  note.className = "fine";
  note.textContent = "목표 주차면 진입 · 완전 정차 완료. 점수는 게임의 연습 평가입니다.";
  const b = document.createElement("button");
  b.className = "primary";
  b.textContent = "다음 드라이브";
  b.onclick = () => $("#menu").click();
  $("#result").append(small, h, p, score, rows, note, b);
}

// ---------- Place search: like a map app's search box ----------
let suggestTimer = 0,
  suggestAbort = null,
  suggestions = [];
function placeFromResult(r) {
  return {
    id: r.id,
    name: r.name,
    lat: r.lat,
    lon: r.lon,
    kind: r.kind || "custom",
    resolved: true,
    custom: true,
    source: r.source || null,
    area: r.lat > 26.55 ? "north" : r.lat > 26.3 ? "central" : "south",
  };
}
function chooseSearchResult(r) {
  const p = placeFromResult(r);
  $("#place-query").value = p.name;
  $("#place-suggest").hidden = true;
  choosePlace(p);
  $("#place-selection").textContent = `${placeRole === "departure" ? "출발지" : "목적지"}: ${p.name}`;
  uiBlip(true);
}
function renderSuggestions(list, meta) {
  suggestions = list;
  const box = $("#place-suggest");
  box.replaceChildren(
    ...list.map((r, i) => {
      const li = document.createElement("li"),
        name = document.createElement("strong"),
        detail = document.createElement("span"),
        badge = document.createElement("em");
      li.setAttribute("role", "option");
      li.dataset.index = i;
      name.textContent = r.name;
      detail.textContent = [r.kindName, r.alias, r.address].filter(Boolean).join(" · ");
      badge.textContent = r.recommended ? "추천" : r.online ? "주소 검색" : r.kindName === "좌표" ? "좌표" : "지도 데이터";
      li.append(badge, name, detail);
      li.onpointerdown = (e) => {
        e.preventDefault();
        chooseSearchResult(r);
      };
      return li;
    }),
  );
  if (!list.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = "찾지 못했습니다. 다른 이름이나 구글맵 링크·좌표를 붙여 넣거나 '지도에서 선택'을 눌러 주세요.";
    box.append(li);
  }
  box.hidden = false;
  if (meta)
    $("#place-data-note").textContent =
      `장소 데이터 ${meta.count.toLocaleString()}곳` +
      (meta.updatedAt ? ` · 기준일 ${meta.updatedAt.slice(0, 10)}` : "") +
      " · © OpenStreetMap";
}
$("#place-query").addEventListener("input", () => {
  clearTimeout(suggestTimer);
  const q = $("#place-query").value.trim();
  if (!q) {
    $("#place-suggest").hidden = true;
    return;
  }
  suggestTimer = setTimeout(async () => {
    suggestAbort?.abort();
    suggestAbort = new AbortController();
    const near = placeRole === "destination" && departure ? { lat: departure.lat, lon: departure.lon } : {};
    try {
      // Local results first (instant), then online address search if needed.
      const quick = await searchPlaces(q, { ...near, online: false }, suggestAbort.signal);
      if ($("#place-query").value.trim() !== q) return;
      renderSuggestions(quick.results, quick);
      if (quick.results.length < 3 && quick.source !== "pin") {
        const full = await searchPlaces(q, near, suggestAbort.signal);
        if ($("#place-query").value.trim() === q) renderSuggestions(full.results, full);
      }
    } catch (error) {
      if (error.name !== "AbortError") $("#place-data-note").textContent = error.message;
    }
  }, 220);
});
$("#place-query").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && suggestions[0]) {
    e.preventDefault();
    chooseSearchResult(suggestions[0]);
  } else if (e.key === "Escape") $("#place-suggest").hidden = true;
});
$("#place-query").addEventListener("blur", () => setTimeout(() => ($("#place-suggest").hidden = true), 150));

// Map picker: GSI standard map tiles (Geospatial Information Authority of
// Japan) with pan and zoom; the crosshair marks the chosen point.
const picker = { lat: 26.2124, lon: 127.6792, zoom: 12, tiles: new Map(), drag: null };
function tileXY(lat, lon, z) {
  const n = 2 ** z,
    x = ((lon + 180) / 360) * n,
    y = ((1 - Math.log(Math.tan((lat * Math.PI) / 180) + 1 / Math.cos((lat * Math.PI) / 180)) / Math.PI) / 2) * n;
  return { x, y };
}
function latLon(x, y, z) {
  const n = 2 ** z,
    lon = (x / n) * 360 - 180,
    lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  return { lat, lon };
}
function drawPicker() {
  const canvas = $("#map-picker-canvas"),
    c = canvas.getContext("2d"),
    w = (canvas.width = canvas.clientWidth),
    h = (canvas.height = canvas.clientHeight),
    z = Math.round(picker.zoom),
    centre = tileXY(picker.lat, picker.lon, z);
  c.fillStyle = "#aad3df";
  c.fillRect(0, 0, w, h);
  // Coastline underneath, so the picker still works offline.
  if (ring) {
    c.beginPath();
    ring.forEach(([lon, lat], i) => {
      const t = tileXY(lat, lon, z),
        x = w / 2 + (t.x - centre.x) * 256,
        y = h / 2 + (t.y - centre.y) * 256;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    });
    c.fillStyle = "#f2efe9";
    c.fill();
  }
  const x0 = Math.floor(centre.x - w / 512) - 1,
    x1 = Math.floor(centre.x + w / 512) + 1,
    y0 = Math.floor(centre.y - h / 512) - 1,
    y1 = Math.floor(centre.y + h / 512) + 1;
  for (let tx = x0; tx <= x1; tx++)
    for (let ty = y0; ty <= y1; ty++) {
      const key = `${z}/${tx}/${ty}`;
      let img = picker.tiles.get(key);
      if (!img) {
        img = new Image();
        img.onload = () => !$("#map-picker").hidden && drawPicker();
        img.src = `https://cyberjapandata.gsi.go.jp/xyz/std/${key}.png`;
        picker.tiles.set(key, img);
      }
      if (img.complete && img.naturalWidth)
        c.drawImage(img, w / 2 + (tx - centre.x) * 256, h / 2 + (ty - centre.y) * 256, 256, 256);
    }
  c.strokeStyle = "#d93025";
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(w / 2 - 14, h / 2);
  c.lineTo(w / 2 + 14, h / 2);
  c.moveTo(w / 2, h / 2 - 14);
  c.lineTo(w / 2, h / 2 + 14);
  c.stroke();
  $("#map-picker-coords").textContent = `${picker.lat.toFixed(5)}, ${picker.lon.toFixed(5)}`;
}
function openPicker() {
  const current = placeRole === "departure" ? departure : selected;
  if (current?.lat) Object.assign(picker, { lat: current.lat, lon: current.lon, zoom: 15 });
  $("#map-picker").hidden = false;
  requestAnimationFrame(drawPicker);
}
$("#pick-on-map").onclick = openPicker;
$("#map-picker-close").onclick = () => ($("#map-picker").hidden = true);
$("#map-picker-zoom-in").onclick = () => ((picker.zoom = Math.min(18, picker.zoom + 1)), drawPicker());
$("#map-picker-zoom-out").onclick = () => ((picker.zoom = Math.max(9, picker.zoom - 1)), drawPicker());
$("#map-picker-canvas").addEventListener("wheel", (e) => {
  e.preventDefault();
  picker.zoom = Math.max(9, Math.min(18, picker.zoom + (e.deltaY < 0 ? 1 : -1)));
  drawPicker();
});
$("#map-picker-canvas").addEventListener("pointerdown", (e) => {
  const z = Math.round(picker.zoom),
    centre = tileXY(picker.lat, picker.lon, z);
  picker.drag = { x: e.clientX, y: e.clientY, cx: centre.x, cy: centre.y, z };
  e.target.setPointerCapture(e.pointerId);
});
$("#map-picker-canvas").addEventListener("pointermove", (e) => {
  const d = picker.drag;
  if (!d) return;
  // Dragging moves the map: the centre shifts opposite to the pointer.
  const next = latLon(d.cx - (e.clientX - d.x) / 256, d.cy - (e.clientY - d.y) / 256, d.z);
  picker.lat = next.lat;
  picker.lon = next.lon;
  drawPicker();
});
$("#map-picker-canvas").addEventListener("pointerup", () => (picker.drag = null));
$("#map-picker-choose").onclick = () => {
  if (ring && !pointInRing([picker.lon, picker.lat], ring)) {
    $("#map-picker-coords").textContent = "오키나와 본섬 안의 위치를 골라 주세요.";
    return;
  }
  $("#map-picker").hidden = true;
  chooseSearchResult({
    id: `pin:${picker.lat.toFixed(6)},${picker.lon.toFixed(6)}`,
    name: `지도에서 고른 위치 (${picker.lat.toFixed(4)}, ${picker.lon.toFixed(4)})`,
    lat: picker.lat,
    lon: picker.lon,
    kindName: "좌표",
  });
};

// ---------- Title screen: attract mode, then a keyboard-driven menu ----------
const menuItems = () => [...document.querySelectorAll("#title-menu .menu-item")];
let menuIndex = 0;
function setTitle(on) {
  document.body.classList.toggle("on-title", on);
  if (on) document.body.classList.remove("in-menu");
  if (on) {
    $("#title-menu").hidden = true;
    $("#press-start").hidden = false;
  }
}
function uiBlip(confirm = false) {
  sound.start();
  if (confirm) {
    sound.tone(880, 0.09, "square", 0.05);
    sound.tone(1320, 0.14, "square", 0.05, 0.08);
  } else sound.tone(1250, 0.05, "square", 0.035);
}
function focusMenu(index) {
  const items = menuItems();
  menuIndex = (index + items.length) % items.length;
  items.forEach((item, i) => item.classList.toggle("active", i === menuIndex));
  items[menuIndex].focus({ preventScroll: true });
  $("#menu-hint").textContent = items[menuIndex].dataset.hint;
}
function openTitleMenu() {
  if (!$("#title-menu").hidden) return;
  uiBlip(true);
  $("#press-start").hidden = true;
  $("#title-menu").hidden = false;
  focusMenu(0);
}
$("#press-start").onclick = openTitleMenu;
$("#splash").addEventListener("pointerdown", (e) => {
  if ($("#title-menu").hidden && !e.target.closest("button")) openTitleMenu();
});
menuItems().forEach((item, i) => {
  item.addEventListener("pointerenter", () => {
    if (menuIndex !== i) uiBlip();
    focusMenu(i);
  });
  item.addEventListener("click", () => uiBlip(true), { capture: true });
});
window.addEventListener("keydown", (e) => {
  if ($("#splash").hidden || active || document.querySelector(".game-dialog:not([hidden])")) return;
  if ($("#title-menu").hidden) {
    if (!["Tab", "Shift", "Control", "Alt", "Meta"].includes(e.key)) {
      e.preventDefault();
      openTitleMenu();
    }
    return;
  }
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    uiBlip();
    focusMenu(menuIndex + (e.key === "ArrowDown" ? 1 : -1));
  } else if (e.key === "Escape") {
    setTitle(true);
  }
});
// Setup flow keys: Enter = next, Esc = back (title from step 1).
window.addEventListener("keydown", (e) => {
  if ($("#select").hidden || active || document.querySelector(".game-dialog:not([hidden])")) return;
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.key === "Enter" && e.target === document.body) {
    e.preventDefault();
    if (wizardStep === 4) $("#start").click();
    else if (!$("#step-next").disabled) $("#step-next").click();
  } else if (e.key === "Escape") {
    e.preventDefault();
    if (wizardStep > 1) $("#step-back").click();
    else returnToTitle();
  }
});
function openWizard() {
  intro = false;
  setTitle(false);
  document.body.classList.add("in-menu");
  $("#splash").hidden = true;
  $("#select").hidden = false;
  $("#select").classList.remove("from-title");
  void $("#select").offsetWidth;
  $("#select").classList.add("from-title");
  document.body.classList.remove("driving");
}
$("#play").onclick = () => {
  openWizard();
  showWizardStep(1);
};
// Quick drive: the short Motobu village route to the Hanasaki parking area.
$("#quick-play").onclick = async () => {
  if (!regionReady || !courses.length) {
    $("#menu-hint").textContent = "지도를 불러오는 중입니다. 잠시 후 다시 선택해 주세요.";
    return;
  }
  openWizard();
  await chooseCourse(courses.find(c=>c.id==='motobu-first'));
  maxReachedStep = 4;
  showWizardStep(4);
  $("#start").click();
};
$("#title-view").onclick = () => showViewSettings();
$("#title-sources").onclick = () => ($("#sources").hidden = false);
setTitle(true);
$("#back-title").onclick = returnToTitle;
$("#pause-title").onclick = returnToTitle;
function returnToTitle() {
  cancelDrivePreparation();
  active = false;
  intro = true;
  paused = false;
  keys.clear();
  $("#splash").hidden = false;
  setTitle(true);
  $("#select").hidden = true;
  $("#hint").hidden = true;
  $("#hud").hidden = true;
  $("#nav").hidden = true;
  $("#menu").hidden = true;
  $("#pause-menu").hidden = true;
  $("#result").hidden = true;
  document.body.classList.remove("driving");
}
// Manual: tabs, a penalty table generated from the scoring rules, and
// H / F1 to open it at any time (driving pauses while it is open).
let manualWasPaused = false;
function openManual() {
  manualWasPaused = paused;
  if (active) {
    paused = true;
    keys.clear();
  }
  $("#pause-menu").hidden = true;
  $("#help").hidden = false;
}
for (const id of ["#help-open", "#splash-help", "#pause-manual"]) $(id).onclick = openManual;
$("#help-close").onclick = () => {
  $("#help").hidden = true;
  if (active) {
    paused = manualWasPaused;
    $("#pause-menu").hidden = !paused;
  }
};
for (const tab of document.querySelectorAll(".manual-tabs button"))
  tab.onclick = () => {
    for (const t of document.querySelectorAll(".manual-tabs button")) t.classList.toggle("active", t === tab);
    for (const section of document.querySelectorAll("#help section"))
      section.hidden = section.dataset.tab !== tab.dataset.tab;
  };
$("#manual-penalties").replaceChildren(
  ...Object.values(VIOLATIONS)
    .filter((v) => v.penalty > 0)
    .map((v) => {
      const row = document.createElement("tr");
      row.innerHTML = `<td>${v.name}</td><td>-${v.penalty}점</td>`;
      return row;
    }),
);
window.addEventListener("keydown", (e) => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
  if (e.code === "F1" || (e.code === "KeyH" && !e.repeat)) {
    e.preventDefault();
    if ($("#help").hidden) openManual();
    else $("#help-close").click();
  }
});
// Seat and field-of-view settings, saved per browser.
let viewWasPaused = false;
function showViewSettings() {
  const v = loadViewSettings();
  $("#view-fov").value = v.fov;
  $("#view-forward").value = Math.round(v.seatForward * 100);
  $("#view-height").value = Math.round(v.seatHeight * 100);
  $("#view-strip").checked = v.mirrorStrip;
  $("#view-turn").checked = v.lookIntoTurn;
  updateViewSettings(false);
  viewWasPaused = paused;
  if (active) paused = true;
  $("#pause-menu").hidden = true;
  $("#view-settings").hidden = false;
}
function updateViewSettings(save = true) {
  const v = viewSettings({
    fov: $("#view-fov").value,
    seatForward: $("#view-forward").value / 100,
    seatHeight: $("#view-height").value / 100,
    mirrorStrip: $("#view-strip").checked,
    lookIntoTurn: $("#view-turn").checked,
  });
  $("#view-fov-value").textContent = `${v.fov}°`;
  $("#view-forward-value").textContent = `${v.seatForward > 0 ? "앞 " : v.seatForward < 0 ? "뒤 " : ""}${Math.abs(Math.round(v.seatForward * 100))} cm`;
  $("#view-height-value").textContent = `${v.seatHeight > 0 ? "위 " : v.seatHeight < 0 ? "아래 " : ""}${Math.abs(Math.round(v.seatHeight * 100))} cm`;
  driver?.setView(v);
  if (save) saveViewSettings(v);
}
for (const id of ["#view-fov", "#view-forward", "#view-height", "#view-strip", "#view-turn"])
  $(id).addEventListener("input", () => updateViewSettings());
$("#view-open").onclick = showViewSettings;
$("#pause-view").onclick = showViewSettings;
$("#view-reset").onclick = () => {
  saveViewSettings(VIEW_DEFAULTS);
  showViewSettings();
};
$("#view-close").onclick = () => {
  $("#view-settings").hidden = true;
  if (active) {
    paused = viewWasPaused;
    $("#pause-menu").hidden = !paused;
  }
};
$("#sources-open").onclick = () => ($("#sources").hidden = false);
$("#sources-close").onclick = () => ($("#sources").hidden = true);
$("#resume").onclick = () => {
  paused = false;
  $("#pause-menu").hidden = true;
};
$("#pause-reset").onclick = () => {
  resetPosition();
  paused = false;
  $("#pause-menu").hidden = true;
};
function refreshFullscreenButtons(){
  const full=Boolean(document.fullscreenElement||document.webkitFullscreenElement);
  const standalone=matchMedia('(display-mode: standalone)').matches||matchMedia('(display-mode: fullscreen)').matches||navigator.standalone;
  for(const b of document.querySelectorAll('[data-fullscreen]')){
    b.textContent=full?'⛶ 화면 복귀':standalone?'⛶ 화면 안내':'⛶ 전체화면';
    b.setAttribute('aria-label',full?'전체화면 종료':'전체화면으로 전환');b.setAttribute('aria-pressed',String(full));
  }
}
async function toggleFullscreen(){
  clearDriveInput();
  try{
    if(document.fullscreenElement)await document.exitFullscreen();
    else if(document.webkitFullscreenElement)await document.webkitExitFullscreen();
    else if(document.documentElement.requestFullscreen&&document.fullscreenEnabled)await document.documentElement.requestFullscreen({navigationUI:'hide'});
    else if(document.documentElement.webkitRequestFullscreen&&document.webkitFullscreenEnabled)document.documentElement.webkitRequestFullscreen();
    else showFullscreenHelp();
  }catch{showFullscreenHelp();}
  refreshFullscreenButtons();
}
function showFullscreenHelp(){
  if(active&&!done){paused=true;$('#pause-menu').hidden=false;}
  $('#fullscreen-help').showModal();
}
for(const b of document.querySelectorAll('[data-fullscreen]'))b.onclick=toggleFullscreen;
for(const name of ['fullscreenchange','webkitfullscreenchange'])document.addEventListener(name,()=>{clearDriveInput();refreshFullscreenButtons();refreshDriveLayout();});
refreshFullscreenButtons();

let last = performance.now();
// One unexpected error must never freeze the game: report it, keep running.
let lastErrorNote = 0;
function reportError(error) {
  console.error(error);
  const now = performance.now();
  if (now - lastErrorNote < 10000) return;
  lastErrorNote = now;
  const note = $("#error-note");
  note.textContent = "일시적인 오류가 발생했지만 게임은 계속됩니다. 화면이 이상하면 일시정지 메뉴에서 출발 위치로 돌아가세요.";
  note.hidden = false;
  setTimeout(() => (note.hidden = true), 6000);
}
window.addEventListener("error", (e) => reportError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason?.name !== "AbortError") reportError(e.reason);
});
function frame(t) {
  try {
    frameBody(t);
  } catch (error) {
    last = t;
    reportError(error);
  }
  requestAnimationFrame(frame);
}
function frameBody(t) {
  const dt = Math.min((t - last) / 1000, 0.05);
  last = t;
  const w = innerWidth,
    h = innerHeight;
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  $("#touch-controls").hidden = !active || done;
  $("#drive-toolbar").hidden = !active || done;
  $("#driving-status").hidden = !active || done;
  if (!active || done) {
    $("#violation-warning").hidden = true;
    $("#camera-warning").hidden = true;
  }
  $('#course-drive-status').hidden=!active||done||!selectedCourse;
  if(!active||done||paused)$('#toll-prompt').hidden=true;
  if (active) {
    if (!paused && !done && (store.hasCoverage(pos, 80) || trainingMode === "parking")) {
      simulationTime += dt;
      const gas = keys.has("KeyW") || keys.has("ArrowUp"),
        brake = keys.has("KeyS") || keys.has("ArrowDown") || keys.has("Space");
      gasLevel = gas ? Math.min(1, Math.max(gasLevel, 0.2) + dt * 1.4) : Math.max(0, gasLevel - dt * 4);
      brakeLevel = brake ? Math.min(1, Math.max(brakeLevel, 0.3) + dt * 1.2) : Math.max(0, brakeLevel - dt * 5);
      if (gas && parkingBrake && feedbackUntil < simulationTime)
        coach("주차 브레이크가 걸려 있습니다. B를 눌러 해제하세요.");
      const previous = { ...pos, heading };
      const state = integrateVehicle(
        { x: pos.x, y: pos.y, speed, heading, steer, gear },
        {
          gas: parkingBrake || simulationTime < shiftHoldUntil ? 0 : gasLevel,
          brake: parkingBrake || simulationTime < shiftHoldUntil ? 1 : brakeLevel,
          creep: !parkingBrake && simulationTime >= shiftHoldUntil,
          steer:
            (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
            (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0),
        },
        car,
        dt,
      );
      pos = { x: state.x, y: state.y };
      speed = trainingMode === "parking" ? Math.min(2.8, state.speed) : state.speed;
      heading = state.heading;
      steer = state.steer;
      if(tollSession){
        const toll=tollSession.update(dt,{...pos,heading,speed,length:car.length},tollAction);tollAction=false;
        $('#toll-prompt').hidden=!toll.message;$('#toll-prompt span').textContent=toll.message;$('#toll-action').hidden=tollSession.mode==='etc';
        if(toll.blocked){pos={x:previous.x,y:previous.y};speed=0;if(toll.violation)coach('차단기 앞에서 정차하세요. 통과 절차를 완료하면 열립니다.');}
        if(traffic)traffic.barriers=tollSession.gates.filter(g=>g.opening<.86&&g.state!=='passed').map(g=>({...g,heading:g.heading,length:1,width:6,speed:0,barrier:true}));
      }
      // Self-cancelling blinker: once the wheel has turned the signalled way
      // and comes back near centre, the stalk returns.
      const limit = steeringLimit(car);
      if (blinker && steer * blinker > limit * 0.4) blinkerArmed = true;
      if (blinker && blinkerArmed && Math.abs(steer) < limit * 0.08) {
        blinker = 0;
        blinkerArmed = false;
      }
      drivenDistance += distance(pos, previous);
      const body = vehicleCorners({ ...pos, heading }, car);
      const wall =
        Math.abs(speed) > 0.1 && nearFeatures.find((f) => f.tags.building && body.some((p) => hitsBuilding(f, p)));
      if (wall) {
        const before = vehicleCorners(previous, car).some((p) => hitsBuilding(wall, p));
        if (blocksMove(previous, pos, wall.center, before)) {
          pos = { x: previous.x, y: previous.y };
          // Count one impact while creep keeps pressing into the same wall.
          if (!before && (!lastWallContact || distance(pos,lastWallContact)>1.5)) {
            sound.thud();
            warnViolation(
              scoreCard.add("collision", simulationTime),
              "시설물과 접촉했습니다. 후진해서 간격을 확보하세요.",
            );
            lastWallContact={...pos};
          }
          speed = 0;
        }
      }
      if(lastWallContact && distance(pos,lastWallContact)>1.5)lastWallContact=null;
      if (trainingMode !== "parking" && simulationTime % 1 < dt) {
        const lane = nearestRoad(pos),
          inLot = visibleFeatures.some((f) => f.tags.amenity === "parking" && insidePolygon(pos, f.points));
        if (lane && !inLot && lane.distance > roadWidth(lane.road.tags) / 2 + 1) {
          speed = Math.min(speed, 2);
          coach("도로 가장자리입니다. 천천히 차도로 돌아오세요.");
        }
      }
      const player={...pos,speed,heading,length:car.length,width:car.width};
      const encounter=driver?.encounters;
      encounter?.tick(dt,simulationTime,player,traffic?.cars||[]);
      const crossing=gear>0?encounter?.approaching(player):null;
      if(crossing){
        coach('횡단보도 보행자 우선 · 건너는 사람이 모두 지나갈 때까지 기다리세요.');
        const front=crossing.ahead-car.length/2;
        warnViolation(scoreCard.sustained('pedestrian',front<1.5&&speed>.4,dt,simulationTime,.15),'횡단보도에서 보행자에게 양보하세요.');
      }else scoreCard.sustained('pedestrian',false,dt,simulationTime);
      if(encounter?.blocks(player)){
        const wasMoving=speed>.3;
        pos={x:previous.x,y:previous.y};speed=0;
        if(wasMoving)warnViolation(scoreCard.add('pedestrian',simulationTime),'보행자와 너무 가깝습니다. 완전히 정지해 보행자가 지나가게 하세요.');
      }
      traffic?.tick(dt, simulationTime, { ...pos, speed, heading, length: car.length, width: car.width });
      // Bodies never pass through each other. Only contact the player drove
      // into is scored; being touched while stopped is not.
      const contact = (traffic?.cars || []).find((n) => rectanglesOverlap({ ...pos, heading }, car, n, n));
      const touching = contact && rectanglesOverlap(previous, car, contact, contact);
      if (contact && blocksMove(previous, pos, contact, touching)) {
        const moving = { ...previous, speed };
        pos = { x: previous.x, y: previous.y };
        if (!touching && Math.abs(speed) > 0.3 && simulationTime - lastCollision > 1.5) {
          sound.thud();
          if (playerAtFault(moving, contact, gear))
            warnViolation(
              scoreCard.add("collision", simulationTime),
              "차량과 접촉했습니다. 후진하거나 핸들을 돌려 간격을 확보하세요.",
            );
          lastCollision = simulationTime;
        }
        speed = 0;
      }
      for (const s of signals) {
        const approach=approachFor(s,heading);
        if(s.approaches&&!approach)continue;
        const stopDistance=approach?.stopDistance??5;
        const f = forward(heading),
          a = (s.x - previous.x) * f.x + (s.y - previous.y) * f.y - stopDistance,
          b = (s.x - pos.x) * f.x + (s.y - pos.y) * f.y - stopDistance,
          l = Math.abs((s.x - pos.x) * f.y - (s.y - pos.y) * f.x);
        const phase=signalPhase(s,heading,simulationTime);
        if(phase==='flash-red'&&b>0&&b<12&&speed<.1)stopHistory.set('flash-'+s.id,true);
        const upcoming=steps.find(step=>step.atDistance>routeProgress(route,pos,routeInfo.distance).travelled-6&&step.maneuver.type==='turn');
        const arrowAllowed=signalRightArrow(s,heading,simulationTime)&&upcoming?.maneuver.modifier?.includes('right')&&distance(upcoming.point,s)<35;
        if (
          a > 0 &&
          b <= 0 &&
          l < (approach?approach.width/2+1:5) &&
          ((phase === "red"&&!arrowAllowed)||(phase==='flash-red'&&!stopHistory.get('flash-'+s.id))) &&
          simulationTime - lastSignalViolation > 3
        ) {
          warnViolation(scoreCard.add("red", simulationTime), "빨간 신호에서는 정지선 앞에 멈춰 주세요.");
          lastSignalViolation = simulationTime;
        }
      }
      ruleTick += dt;
      if (ruleTick > 0.1) {
        $("#camera-warning").hidden = true;
        monitorRules(ruleTick);
        ruleTick = 0;
      }
      const status = parkingStatus({ ...pos, heading, speed, parkingBrake }, car, parkingGoal, parkedSeconds);
      parkedSeconds = status.ready ? parkedSeconds + dt : 0;
      if (status.complete && (!tollSession||tollSession.complete)) completeParking();
      else if(status.complete)coach('입구와 출구 요금소 절차를 완료한 뒤 주차해 주세요.');
    } else if (!store.hasCoverage(pos, 80)) speed = 0;
    if (t - lastRoadCheck > 1500) {
      lastRoadCheck = t;
      visibleRoads = store.near(pos);
      refreshNearFeatures();
      updateRoads();
    }
    driver?.render({
      position: pos,
      heading,
      speed,
      gear,
      steer,
      parkingBrake,
      time: simulationTime,
      tolls:tollSession?.gates||[],
      traffic: traffic?.cars || [],
      navInfo,
      navZoom,
      rear,
      look: keys.has("KeyQ") ? 1 : keys.has("KeyE") ? -1 : 0,
      dt,
      blinker,
      blinkerLit: sound.lit || (!sound.context && Math.floor(simulationTime / 0.35) % 2 === 0),
      drawNavigation: drawMap,
    });
    sound.update(dt, { speed, gas: gasLevel, gear, blinker, running: !paused && !done });
    for (const [id, side] of [
      ["#blink-left", -1],
      ["#blink-right", 1],
    ])
      $(id).classList.toggle("lit", blinker === side && (sound.lit || !sound.context));
    if (t - lastHud > 150) {
      lastHud = t;
      drawMap(mc, miniCanvas.width, miniCanvas.height, 0.17);
      hud();
    }
  } else if (driver && features.length) {
    sound.update(dt, { running: false });
    simulationTime += dt;
    // On the title screen the parked car is not an obstacle for traffic.
    traffic?.tick(dt, simulationTime, { x: 1e9, y: 1e9, heading: 0, speed: 0 });
    driver.render({
      intro: true,
      position: pos,
      heading,
      time: simulationTime,
      traffic: traffic?.cars || [],
    });
  }
}
new ResizeObserver(() => {
  if (!$("#select").hidden && wizardStep === 4) drawOverview();
}).observe(overview);
new ResizeObserver(drawIntroMap).observe($("#intro-map"));
renderRegions();
renderVehicles();
loadCourses().catch(error=>{$('#loading').textContent='코스 자료를 불러오지 못했습니다. '+error.message;});
requestAnimationFrame(frame);
