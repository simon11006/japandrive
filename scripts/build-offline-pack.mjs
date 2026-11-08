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
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { REGIONS, projection, tileBounds, TILE_SIZE, pointInRing } from "../map-data.mjs";
import { createMapService } from "../map-service.mjs";

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

// The same parking query the game sends for a destination.
export const parkingQuery = (lat, lon) =>
  `[out:json][timeout:25];way(around:400,${lat},${lon})[amenity=parking][access!~"^(private|no)$"];out geom;`;

async function main() {
  const dry = process.argv.includes("--dry-run");
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
  if (dry) return;
  const service = createMapService({ cacheDir: fileURLToPath(new URL("data/service-cache", root)) });
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  let done = 0,
    failed = [];
  const attempt = async (label, task) => {
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
  for (const p of places) {
    await attempt(p.name, () => service.mapQuery(parkingQuery(p.lat, p.lon)));
    console.log(`주차장: ${p.name}`);
  }
  console.log(
    failed.length
      ? `완료. 실패 ${failed.length}건 — 다시 실행하면 빠진 것만 받습니다: ${failed.slice(0, 8).join(", ")}`
      : "완료. 이제 이 폴더 전체를 다른 PC에 복사하거나 서버로 사용하세요.",
  );
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
