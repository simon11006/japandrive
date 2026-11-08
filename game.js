import {
  REGIONS,
  projection,
  normalizePois,
  poiQuery,
  RoadStore,
  validateRoute,
  routeProgress,
  pointInRing,
} from "./map-data.mjs";
import { VEHICLES, integrateVehicle, steeringLimit } from "./vehicles.mjs";
import { sceneFeatures, drawSceneMap } from "./scene-features.mjs";
import { DriveRenderer } from "./drive-renderer.mjs";
import { loadViewSettings, saveViewSettings, viewSettings, VIEW_DEFAULTS } from "./driver-view.mjs";
import { loadTerrain } from "./terrain.mjs";
import {
  mappedSpeedLimit,
  DrivingScore,
  stopSignApplies,
  turnSide,
  playerAtFault,
  BLINKER_LEAD_METRES,
} from "./driving-rules.mjs";
import { DriveAudio } from "./audio.mjs";
import {
  TrafficSimulation,
  DIFFICULTIES,
  bayFromGeo,
  parkingStatus,
  insidePolygon,
  vehicleCorners,
  rectanglesOverlap,
  nearestOnSegment,
  signalPhase,
  forward,
  headingBetween,
  distance,
  roadWidth,
} from "./simulation.mjs";

const $ = (s) => document.querySelector(s);
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
  visibleFeatures = [];
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
const keys = new Set();
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
      button.innerHTML = `<svg viewBox="0 0 120 65" aria-hidden="true"><path d="${silhouette}" fill="#d1dbd8" stroke="#c8eece" stroke-width="1.5"/><path d="${v.id === "prius" ? "M23 28 L47 17 L75 19 L91 30 Z" : "M30 16 L96 16 L104 29 L20 29 Z"}" fill="#35525b"/><circle cx="29" cy="49" r="9" fill="#0d1922"/><circle cx="93" cy="49" r="9" fill="#0d1922"/><circle cx="29" cy="49" r="4" fill="#6a8188"/><circle cx="93" cy="49" r="4" fill="#6a8188"/></svg><div><strong>${v.name}</strong><small>${v.trim}</small><span class="specs">전장 ${(v.length * 1000).toFixed(0)} · 전폭 ${(v.width * 1000).toFixed(0)} mm<br>축거 ${(v.wheelbase * 1000).toFixed(0)} mm · 최소 회전 반경 ${v.turningRadius.toFixed(1)} m</span></div>`;
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
    if (error instanceof SyntaxError)
      throw new Error("지도 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.");
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", abort);
  }
}
const overpass = (query, signal) => json("/api/overpass?" + new URLSearchParams({ data: query }), signal);

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
  c.fillText(region.name, 22, h - 20);
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

const wizardLabels = ["지역", "차량", "출발지", "목적지", "교통량", "출발 확인"];
const wizardTitles = [
  "어디로 떠날까요?",
  "함께 달릴 차량은?",
  "어디에서 출발할까요?",
  "어디까지 달려볼까요?",
  "어떤 도로에서 연습할까요?",
  "이제 출발할 준비가 됐어요.",
];
const wizardDescriptions = [
  "달리고 싶은 지역부터 골라 주세요.",
  "두 차량의 크기와 회전 반경 차이를 익혀 보세요.",
  "카드를 옆으로 넘겨 출발할 장소를 선택하세요.",
  "숙소·식당·관광지를 고르면 목적지 주차장으로 안내합니다.",
  "교통량을 세 단계로 조절할 수 있습니다.",
  "선택한 코스를 확인하고 천천히 출발하세요.",
];
function showWizardStep(step, focus = true) {
  if (busy && step !== wizardStep) cancelDrivePreparation();
  wizardStep = Math.max(1, Math.min(6, step));
  $("#select").dataset.step = wizardStep;
  $("#regions").hidden = wizardStep !== 1;
  $(".vehicle-section").hidden = wizardStep !== 2;
  $("#planner").hidden = ![3, 4, 6].includes(wizardStep) || !regionReady;
  $(".places-panel").hidden = ![3, 4].includes(wizardStep);
  $(".trip-panel").hidden = wizardStep !== 6;
  $("#difficulty-panel").hidden = wizardStep !== 5;
  $("#step-caption").textContent = `드라이브 준비 · ${wizardStep} / 6`;
  $("#step-title").textContent = wizardTitles[wizardStep - 1];
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
      button.disabled = i + 1 > maxReachedStep;
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
  if (wizardStep === 3 || wizardStep === 4) {
    placeRole = wizardStep === 3 ? "departure" : "destination";
    pageSize = 24;
    renderPlaces();
  }
  if (wizardStep === 5) renderDifficulties();
  updateWizard();
  drawOverview();
  if (focus) {
    $("#step-title").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
}
function updateWizard() {
  for (const b of document.querySelectorAll("#step-progress button"))
    b.disabled = Number(b.dataset.step) > maxReachedStep;
  const labels = [
    region?.name,
    car.name,
    departure?.name,
    selected?.name,
    difficulty.name,
    "안전하게 출발하세요",
  ];
  $("#step-selection").textContent = labels[wizardStep - 1] || "선택해 주세요";
  $("#step-back").textContent = wizardStep === 1 ? "← 타이틀" : "← 이전";
  $("#step-next").hidden = wizardStep === 6;
  $("#step-next").textContent = `${wizardLabels[wizardStep] || "출발"} →`;
  $("#step-next").disabled =
    !regionReady ||
    busy ||
    (wizardStep === 3 && (!departure || departure.resolved === false)) ||
    (wizardStep === 4 && (!selected || selected.resolved === false || selected.id === departure?.id));
  $("#departure-name").textContent = departure?.name || "출발지를 선택하세요";
  $("#drive-summary").textContent = `${car.name} · ${difficulty.name} · ${difficulty.description}`;
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
    oc.fillText(label, q.x + 9, q.y + 4);
  }
  oc.font = "10px Malgun Gothic";
  oc.fillStyle = "#8eafb6";
  oc.fillText("N ↑", 20, 25);
  oc.fillText(region.island ? "실제 본섬 해안선 · OSM" : "실제 지도 등록 위치", 20, h - 15);
}

function drawIntroMap() {
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
    c.fillText(name, q.x + 12, q.y + 4);
  }
  c.font = "10px Segoe UI";
  c.fillStyle = "#7eaa9b";
  c.fillText("N ↑", 20, 28);
  c.fillStyle = "#638d84";
  c.fillText("© OpenStreetMap", 20, h - 12);
}

$("#start").onclick = async () => {
  if ($("#start").disabled) return;
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
      if (!candidates.length)
        throw new Error("이 장소의 차량 진입 가능한 주차장을 확인 중입니다. 다른 목적지를 선택해 주세요.");
      const area = candidates[0];
      parkingGoal = {
        type: "area",
        points: area.points,
        center: area.center,
        heading: 0,
        name: area.tags.name || selected.name + " 주차장",
      };
      features = [...features, ...candidates];
    }
    const target = proj.toGeo(parkingGoal.center);
    preparationStage(1);
    const query = new URLSearchParams({
      start: `${departure.lon},${departure.lat}`,
      end: `${target[0]},${target[1]}`,
    });
    const data = await json("/api/route?" + query, abortSignal);
    // Connected-island destinations use road routes; ferry legs are rejected.
    if (current !== session || attempt !== driveAttempt) return;
    routeInfo = validateRoute(data);
    route = routeInfo.geometry.coordinates.map(proj.toLocal);
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
      features,
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
  pos = { ...route[0] };
  speed = 0;
  gear = 1;
  steer = 0;
  visibleFeatures = features.filter((f) => Math.hypot(f.center.x - pos.x, f.center.y - pos.y) < 850);
  const ahead = route.find((p) => Math.hypot(p.x - pos.x, p.y - pos.y) > 4) || route.at(-1);
  heading = Math.atan2(ahead.x - pos.x, -(ahead.y - pos.y));
  visibleRoads = store.near(pos);
  lastRoadCheck = 0;
  // Start in the left travel lane on two-way roads, not on the centreline.
  const lane = nearestRoad(pos);
  if (lane && lane.road.tags.highway !== "service" && !["yes", "1", "-1"].includes(lane.road.tags.oneway)) {
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
  maxReachedStep = 6;
  showWizardStep(4);
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
window.addEventListener("blur", () => {
  keys.clear();
  if (active && !done) {
    paused = true;
    $("#pause-menu").hidden = false;
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    keys.clear();
    if (active && !done) {
      paused = true;
      $("#pause-menu").hidden = false;
    }
  }
});
for (const button of document.querySelectorAll("[data-key]")) {
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    keys.add(button.dataset.key);
    button.classList.add("held");
  });
  const release = () => {
    keys.delete(button.dataset.key);
    button.classList.remove("held");
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}
for (const button of document.querySelectorAll("[data-action]"))
  button.onclick = () => {
    if (!active) return;
    const action = button.dataset.action;
    if (action === "gear") changeGear(gear > 0 ? -1 : 1);
    if (action === "brake" && speed < 0.2) parkingBrake = !parkingBrake;
    if (action === "nav") navZoom = !navZoom;
    if (action === "blink-left") setBlinker(-1);
    if (action === "blink-right") setBlinker(1);
    if (action === "pause") {
      paused = true;
      keys.clear();
      $("#pause-menu").hidden = false;
    }
  };
function changeGear(next) {
  if (!active || done) return;
  if (speed >= 0.2) {
    coach("먼저 S 또는 제동 버튼으로 완전히 정차한 뒤 기어를 바꿔 주세요.");
    return;
  }
  gear = next;
  rear = false;
  coach(
    gear < 0
      ? "R 후진 · W / ↑ 또는 가속 버튼으로 천천히 후진하세요."
      : "D 전진 · W / ↑ 또는 가속 버튼으로 출발하세요.",
  );
}
$("#gear-forward").onclick = () => changeGear(1);
$("#gear-reverse").onclick = () => changeGear(-1);
$("#nav-closer").onclick = () => (navZoom = !navZoom);

function drawMap(context, width, height, scale) {
  context.fillStyle = "#0d2932";
  context.fillRect(0, 0, width, height);
  const cv = (p) => {
    const dx = p.x - pos.x,
      dy = p.y - pos.y;
    return {
      x: width / 2 + (dx * Math.cos(heading) + dy * Math.sin(heading)) * scale,
      y: height * 0.65 + (-dx * Math.sin(heading) + dy * Math.cos(heading)) * scale,
    };
  };
  drawSceneMap(context, visibleFeatures, cv, scale);
  for (const road of visibleRoads) {
    context.beginPath();
    road.points.forEach((p, i) => {
      const q = cv(p);
      i ? context.lineTo(q.x, q.y) : context.moveTo(q.x, q.y);
    });
    context.lineWidth = Math.max(2, scale * 5);
    context.strokeStyle = "#45636a";
    context.stroke();
  }
  context.beginPath();
  route.forEach((p, i) => {
    const q = cv(p);
    i ? context.lineTo(q.x, q.y) : context.moveTo(q.x, q.y);
  });
  context.strokeStyle = "#183d45";
  context.lineWidth = 24;
  context.stroke();
  context.strokeStyle = "#b9f3cc";
  context.lineWidth = 13;
  context.stroke();
  if (parkingGoal) {
    const end = cv(parkingGoal.center);
    context.fillStyle = "#ccedac";
    context.font = "bold 26px sans-serif";
    context.fillText("P", end.x, end.y);
  }
  for (const npc of traffic?.cars || []) {
    const p = cv(npc);
    context.fillStyle = "#eac77d";
    context.fillRect(p.x - 3, p.y - 3, 6, 6);
  }
  context.save();
  context.translate(width / 2, height * 0.65);
  context.fillStyle = "#ffffff";
  context.beginPath();
  context.moveTo(0, -23);
  context.lineTo(-13, 14);
  context.lineTo(0, 8);
  context.lineTo(13, 14);
  context.closePath();
  context.fill();
  context.restore();
}

async function updateRoads() {
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
}

function hud() {
  const progress = routeProgress(route, pos, routeInfo?.distance),
    d = Math.hypot(route.at(-1).x - pos.x, route.at(-1).y - pos.y);
  $("#speed").textContent = Math.round(speed * 3.6);
  $("#gear").textContent = gear > 0 ? "D" : "R";
  $("#remaining").textContent = distanceText(progress.remaining);
  $("#distance").textContent = `경로상 남은 거리 ${distanceText(progress.remaining)}`;
  let next = steps.at(-1),
    toTurn = progress.remaining;
  for (const s of steps) {
    if (s.atDistance > progress.travelled + 8) {
      next = s;
      toTurn = s.atDistance - progress.travelled;
      break;
    }
  }
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
  if (toPark < 65)
    $("#instruction").textContent =
      parkingGoal.type === "bay"
        ? "주차장 안의 초록색 주차면에 주차하세요"
        : "주차장 안의 빈 공간에 안전하게 정차하세요";
  navInfo = {
    instruction: $("#instruction")
      .textContent.replace(/県道(\d+)号線/g, "현도 $1호선")
      .replace(/国道(\d+)号線/g, "국도 $1호선"),
    destination: selected?.name || "주차 연습",
    remaining: toPark < 65 ? `${Math.round(toPark)} m · 주차` : distanceText(progress.remaining),
    distanceToTurn: toTurn,
    parkingDistance: toPark,
  };
  $("#road-status").textContent = roadError || (roadBusy ? "주변 길을 불러오는 중" : "안전거리를 유지하세요");
  $("#hint").textContent = done
    ? "주차 완료 · 다음 드라이브를 선택하세요"
    : paused
      ? "일시정지 · Esc로 계속"
      : parkingBrake && toPark >= 65
        ? "주차 브레이크가 걸려 있습니다 · S로 브레이크를 밟은 채 B로 해제하세요"
        : simulationTime < 7
        ? "W 가속 · S 제동 · A/D 조향 · Z/X 방향지시등 · Q/E 미러 확인"
        : feedbackUntil > simulationTime
          ? feedback
          : toPark < 65
            ? status.ready
              ? "주차 브레이크 작동 · 잠시 정차를 유지하세요"
              : status.inside
                ? status.aligned
                  ? "정차한 뒤 B로 주차 브레이크를 걸어 주세요."
                  : "차체를 주차선과 나란히 맞춰 주세요."
                : "차량 전체가 주차 구역 안에 들어가야 합니다."
            : parkingBrake
              ? "주차 브레이크가 걸려 있습니다 · B로 해제"
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
      ? "R 후진 · W 가속 / S 제동"
      : "D 전진 · W 가속 / S 제동";
  if (nearbySignal && nearbySignal.ahead < 45 && signalColor === "red" && !done && !paused)
    $("#hint").textContent = "빨간 신호입니다. 정지선 앞에 멈추고 녹색 신호를 기다리세요.";
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
  const tags = lane.road.tags,
    oneway = ["yes", "1", "true", "-1"].includes(tags.oneway),
    cos = Math.cos(heading - lane.heading),
    travelHeading = cos >= 0 ? lane.heading : lane.heading + Math.PI;
  const side =
    (pos.x - lane.point.x) * Math.cos(travelHeading) + (pos.y - lane.point.y) * Math.sin(travelHeading);
  const wrong =
    !inLot &&
    gear > 0 &&
    speed > 2 &&
    lane.distance < roadWidth(tags) / 2 &&
    (oneway
      ? tags.oneway === "-1"
        ? cos > 0.6
        : cos < -0.6
      : side > 0.95 && Math.abs(cos) > 0.8 && tags.highway !== "service");
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
  note.textContent = "주차 정렬 · 완전 정차 · 주차 브레이크 완료. 점수는 게임의 연습 평가입니다.";
  const b = document.createElement("button");
  b.className = "primary";
  b.textContent = "다음 드라이브";
  b.onclick = () => $("#menu").click();
  $("#result").append(small, h, p, score, rows, note, b);
}

// ---------- Title screen: attract mode, then a keyboard-driven menu ----------
const menuItems = () => [...document.querySelectorAll("#title-menu .menu-item")];
let menuIndex = 0;
function setTitle(on) {
  document.body.classList.toggle("on-title", on);
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
function openWizard() {
  intro = false;
  setTitle(false);
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
// Quick drive: the stored real route from the Motobu hotel to Kaihoumaru.
$("#quick-play").onclick = () => {
  if (!regionReady || !region?.island) {
    $("#menu-hint").textContent = "지도를 불러오는 중입니다. 잠시 후 다시 선택해 주세요.";
    return;
  }
  openWizard();
  maxReachedStep = 6;
  showWizardStep(6);
  $("#quick-test").click();
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
for (const id of ["#help-open", "#splash-help"])
  $(id).onclick = () => {
    if (active) paused = true;
    $("#help").hidden = false;
  };
$("#help-close").onclick = () => {
  $("#help").hidden = true;
  if (active) paused = false;
};
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
$("#fullscreen").onclick = async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    coach("브라우저 창을 넓히면 운전석을 더 편하게 볼 수 있습니다.");
  }
};

let last = performance.now();
function frame(t) {
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
          gas: parkingBrake ? 0 : gasLevel,
          brake: parkingBrake ? 1 : brakeLevel,
          creep: !parkingBrake,
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
      if (
        speed > 0.1 &&
        visibleFeatures.some((f) => f.tags.building && body.some((p) => insidePolygon(p, f.points)))
      ) {
        pos = { x: previous.x, y: previous.y };
        sound.thud();
        warnViolation(
          scoreCard.add("collision", simulationTime),
          "시설물과 접촉했습니다. 후진해서 간격을 확보하세요.",
        );
        speed = 0;
      }
      if (trainingMode !== "parking" && simulationTime % 1 < dt) {
        const lane = nearestRoad(pos),
          inLot = visibleFeatures.some((f) => f.tags.amenity === "parking" && insidePolygon(pos, f.points));
        if (lane && !inLot && lane.distance > roadWidth(lane.road.tags) / 2 + 1) {
          speed = Math.min(speed, 2);
          coach("도로 가장자리입니다. 천천히 차도로 돌아오세요.");
        }
      }
      traffic?.tick(dt, simulationTime, { ...pos, speed, heading, length: car.length, width: car.width });
      // Bodies never pass through each other. Only contact the player drove
      // into is scored; being touched while stopped is not.
      const contact = (traffic?.cars || []).find((n) => rectanglesOverlap({ ...pos, heading }, car, n, n));
      if (contact) {
        const moving = { ...previous, speed };
        pos = { x: previous.x, y: previous.y };
        if (speed > 0.3 && simulationTime - lastCollision > 1.5) {
          sound.thud();
          if (playerAtFault(moving, contact, gear))
            warnViolation(
              scoreCard.add("collision", simulationTime),
              "차량과 접촉했습니다. 정차하고 주변을 확인하세요.",
            );
          lastCollision = simulationTime;
        }
        speed = 0;
      }
      for (const s of signals) {
        const f = forward(heading),
          a = (s.x - previous.x) * f.x + (s.y - previous.y) * f.y - 5,
          b = (s.x - pos.x) * f.x + (s.y - pos.y) * f.y - 5,
          l = Math.abs((s.x - pos.x) * f.y - (s.y - pos.y) * f.x);
        if (
          a > 0 &&
          b <= 0 &&
          l < 5 &&
          signalPhase(s, heading, simulationTime) === "red" &&
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
      if (status.complete) completeParking();
    } else if (!store.hasCoverage(pos, 80)) speed = 0;
    if (t - lastRoadCheck > 1500) {
      lastRoadCheck = t;
      visibleRoads = store.near(pos);
      visibleFeatures = features.filter((f) => Math.hypot(f.center.x - pos.x, f.center.y - pos.y) < 850);
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
    traffic?.tick(dt, simulationTime, { ...pos, heading, speed: 0 });
    driver.render({
      intro: true,
      position: pos,
      heading,
      time: simulationTime,
      traffic: traffic?.cars || [],
    });
  }
  requestAnimationFrame(frame);
}
new ResizeObserver(() => {
  if (!$("#select").hidden && wizardStep === 6) drawOverview();
}).observe(overview);
new ResizeObserver(drawIntroMap).observe($("#intro-map"));
renderRegions();
renderVehicles();
loadRegion(REGIONS.find((r) => r.id === "okinawa"));
requestAnimationFrame(frame);
