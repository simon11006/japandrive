// Offline map pack for classrooms and many simultaneous players.
//
// Run once on a PC with internet access:
//     node scripts/build-offline-pack.mjs
// It saves the drivable roads of the whole Okinawa main island, one map tile
// at a time, plus the public parking lots around every recommended place,
// into data/service-cache. The game server answers from that folder first, so
// after the pack is built players no longer depend on public map servers for
// roads and parking (routes are still computed online and then saved).
// Copy the whole game folder (including data/service-cache) to other PCs.
//
// It is polite to the free Overpass servers: one request at a time with a
// pause between tiles. Re-running only fetches tiles that are still missing.
//     node scripts/build-offline-pack.mjs --dry-run   (count tiles only)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { REGIONS, projection, tileBounds, TILE_SIZE, pointInRing } from "../map-data.mjs";
import { createMapService, boxKey } from "../map-service.mjs";

const root = new URL("../", import.meta.url);
const read = async (path) => JSON.parse(await readFile(new URL(path, root), "utf8"));

export function islandTiles(ring, proj) {
  const local = ring.map(proj.toLocal),
    xs = local.map((p) => p.x),
    ys = local.map((p) => p.y),
    keys = [];
  for (let x = Math.floor(Math.min(...xs) / TILE_SIZE); x <= Math.floor(Math.max(...xs) / TILE_SIZE); x++)
    for (let y = Math.floor(Math.min(...ys) / TILE_SIZE); y <= Math.floor(Math.max(...ys) / TILE_SIZE); y++) {
      const samples = [];
      for (let i = 0; i <= 4; i++)
        for (let j = 0; j <= 4; j++) samples.push({ x: (x + i / 4) * TILE_SIZE, y: (y + j / 4) * TILE_SIZE });
      const onLand = samples.some((p) => pointInRing(proj.toGeo(p), ring)),
        coastInside = local.some(
          (p) => p.x >= x * TILE_SIZE && p.x < (x + 1) * TILE_SIZE && p.y >= y * TILE_SIZE && p.y < (y + 1) * TILE_SIZE,
        );
      if (onLand || coastInside) keys.push(`${x}:${y}`);
    }
  return keys;
}

// Larger boxes (0.1°, about 10 km) for island-wide places and parking.
export function islandBoxes(ring, step = 0.1) {
  const lons = ring.map((p) => p[0]),
    lats = ring.map((p) => p[1]),
    boxes = [];
  for (let lat = Math.floor(Math.min(...lats) / step) * step; lat < Math.max(...lats); lat += step)
    for (let lon = Math.floor(Math.min(...lons) / step) * step; lon < Math.max(...lons); lon += step) {
      const b = [lat, lon, lat + step, lon + step].map((v) => Number(v.toFixed(6)));
      const inside = ring.some(([x, y]) => y >= b[0] && y <= b[2] && x >= b[1] && x <= b[3]);
      let land = false;
      for (let i = 0; i <= 4 && !land; i++)
        for (let j = 0; j <= 4 && !land; j++) land = pointInRing([b[1] + (j / 4) * step, b[0] + (i / 4) * step], ring);
      if (inside || land) boxes.push(b);
    }
  return boxes;
}
// The same parking query the game sends for a destination.
export const parkingQuery = (lat, lon) =>
  `[out:json][timeout:25];way(around:400,${lat},${lon})[amenity=parking][access!~"^(private|no)$"];out geom;`;

async function main() {
  const dry = process.argv.includes("--dry-run"),
    arg = (name, fallback) => {
      const i = process.argv.indexOf(name);
      return i > 0 ? Number(process.argv[i + 1]) : fallback;
    },
    // Stop politely after this many minutes; the next run continues.
    deadline = Date.now() + arg("--max-minutes", 600) * 60000,
    refreshDays = arg("--refresh-days", 0);
  const region = REGIONS.find((r) => r.id === "okinawa"),
    proj = projection(region.origin),
    ring = (await read("data/okinawa-main-island.geojson")).geometry.coordinates[0];
  const tiles = islandTiles(ring, proj);
  console.log(`본섬 도로 타일 ${tiles.length}개 (각 ${TILE_SIZE / 1000} km × ${TILE_SIZE / 1000} km)`);
  // Resolve recommended places exactly as the game does.
  const [catalog, pois, extras, sites] = await Promise.all([
    read("data/places.json"),
    read("data/okinawa-pois.json"),
    read("data/okinawa-extra-pois.json"),
    read("data/destination-sites.json"),
  ]);
  const elements = [...pois.elements, ...extras.elements],
    byId = new Map(elements.map((e) => [`${e.type}/${e.id}`, e])),
    fixedSites = new Set(sites.sites.map((s) => s.id).concat("kaihoumaru"));
  const places = catalog.places
    .map((p) => {
      const pattern = p.match ? new RegExp(p.match, "i") : null;
      const e = p.osm
        ? byId.get(p.osm)
        : elements.find((e) => pattern && Object.entries(e.tags || {}).some(([k, v]) => k.startsWith("name") && pattern.test(v)));
      return { ...p, lat: p.lat ?? e?.lat ?? e?.center?.lat, lon: p.lon ?? e?.lon ?? e?.center?.lon };
    })
    .filter((p) => Number.isFinite(p.lat) && !fixedSites.has(p.id));
  console.log(`추천 장소 주차장 조회 ${places.length}곳`);
  const boxes = islandBoxes(ring);
  console.log(`본섬 장소·주차장 구역 ${boxes.length}개`);
  if (dry) return;
  const service = createMapService({ cacheDir: fileURLToPath(new URL("data/service-cache", root)) });
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  let done = 0,
    failed = [];
  const attempt = async (label, task) => {
    if (Date.now() > deadline) return false;
    for (let i = 0; i < 3; i++) {
      const started = Date.now();
      try {
        await task();
        // Cached tiles return at once; only pause after a real download.
        if (Date.now() - started > 150) await pause(1200);
        return true;
      } catch (error) {
        console.log(`  ${label}: ${error.message} (재시도 ${i + 1}/3)`);
        await pause(5000 * (i + 1));
      }
    }
    failed.push(label);
    return false;
  };
  for (const key of tiles) {
    await attempt(`타일 ${key}`, () => service.roadTile(tileBounds(key, proj)));
    if (++done % 20 === 0 || done === tiles.length) console.log(`도로 ${done}/${tiles.length}`);
  }
  for (const [i, b] of boxes.entries()) {
    await attempt(`장소 구역 ${i + 1}`, () => service.placeBox(b));
    await attempt(`주차장 구역 ${i + 1}`, () => service.parkingBox(b));
    console.log(`장소·주차장 ${i + 1}/${boxes.length}`);
  }
  for (const p of places) {
    await attempt(p.name, () => service.mapQuery(parkingQuery(p.lat, p.lon)));
  }
  // Monthly refresh: re-download files older than --refresh-days.
  if (refreshDays > 0)
    for (let n = 0; n < 2000 && Date.now() < deadline; n++) {
      const refreshed = await service.refreshStale(refreshDays).catch((e) => {
        console.log(`갱신 실패: ${e.message}`);
        return null;
      });
      if (!refreshed) break;
      await pause(1200);
    }
  if (Date.now() > deadline) console.log("시간 제한에 도달했습니다. 다음 실행에서 이어서 받습니다.");
  await exportPack(service);
  console.log(
    failed.length
      ? `완료. 실패 ${failed.length}건 — 다시 실행하면 빠진 것만 받습니다: ${failed.slice(0, 8).join(", ")}`
      : "완료. 이제 이 폴더 전체를 다른 PC에 복사하거나 서버로 사용하세요.",
  );
}
// Plain files for the no-server (web page) mode: data/pack/<kind>/<box>.json
// plus manifest.json with the box lists and the oldest download date.
export async function exportPack(service, out = new URL("data/pack/", root)) {
  const manifest = { updatedAt: null, roads: [], places: [], parking: [] };
  const dates = [];
  for (const kind of ["roads", "places", "parking"]) {
    await mkdir(new URL(`${kind}/`, out), { recursive: true });
    for (const f of await service.packFiles(kind + ":")) {
      const key = f.source.slice(kind.length + 1);
      const data =
        kind === "places"
          ? { elements: f.data.elements.map(({ type, id, lat, lon, center, tags }) => ({ type, id, lat, lon, center, tags })) }
          : f.data;
      await writeFile(new URL(`${kind}/${key}.json`, out), JSON.stringify(data));
      manifest[kind].push(key);
      if (f.fetchedAt) dates.push(f.fetchedAt);
    }
  }
  manifest.updatedAt = dates.sort()[0] || null;
  await writeFile(new URL("manifest.json", out), JSON.stringify(manifest));
  console.log(`웹 배포용 지도 파일: 도로 ${manifest.roads.length} · 장소 ${manifest.places.length} · 주차장 ${manifest.parking.length}`);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
