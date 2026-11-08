// Direct mode: the game runs as plain web pages (for example on GitHub
// Pages) with no game server. Each player's browser answers its own map,
// route and place requests:
//   1. bundled snapshots and the offline map pack (data/pack/…), if present;
//   2. public OpenStreetMap services (Overpass, OSRM, Nominatim), called from
//      the player's own connection, so hundreds of players do not share one
//      address;
//   3. the built-in router over the roads already loaded, if routing fails.
import { selectMapQuery, queryBounds, boxKey, ROAD_FILTER, limiter, BUILDING_FILTER, BUILDING_QUERY, compactBuildings } from "./map-core.mjs";
import { buildGraph, localRoute, metres } from "./local-router.mjs";
import { buildIndex, entriesFromOsm, search, parseLocation } from "./place-search.mjs";

const base = new URL("./", import.meta.url);
const OVERPASS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const OSRM = ["https://routing.openstreetmap.de/routed-car/", "https://router.project-osrm.org/"];
const slots = limiter(2),
  geocodeSlot = limiter(1);

async function getJson(url, signal, timeout = 25000) {
  const r = await fetch(url, {
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
  });
  if (!r.ok) throw new Error(`지도 서버 응답 ${r.status}`);
  return r.json();
}
const local = (path) => getJson(new URL(path, base), null, 60000);
const once = (fn) => {
  let p;
  return () => (p ??= fn().catch((e) => ((p = null), Promise.reject(e))));
};
const snapshot = (name) => once(() => local(`data/${name}`).catch(() => null));
const preview = snapshot("preview-cache.json"),
  signalRoads = snapshot("signal-roads.json"),
  training = snapshot("training-routes.json"),
  manifest = once(() => local("data/pack/manifest.json").catch(() => ({ roads: [], places: [], parking: [], buildings: [] })));

async function overpass(query, signal) {
  return slots(async () => {
    let last;
    for (const server of OVERPASS)
      try {
        signal?.throwIfAborted();
        const data = await getJson(`${server}?data=${encodeURIComponent(query)}`, signal, 30000);
        if (!Array.isArray(data.elements)) throw new Error("지도 서버 응답 형식이 올바르지 않습니다.");
        return data;
      } catch (e) {
        if (signal?.aborted) throw e;
        last = e;
      }
    throw last || new Error("지도 서버에 연결하지 못했습니다.");
  });
}

const tiles = new Map();
async function roadTile(b, signal) {
  const key = boxKey(b);
  if (!tiles.has(key))
    tiles.set(
      key,
      (async () => {
        const m = await manifest();
        if (m.roads?.includes(key)) return local(`data/pack/roads/${key}.json`);
        return overpass(`[out:json][timeout:45];way(${key})${ROAD_FILTER};out geom;`, signal);
      })().catch((e) => {
        tiles.delete(key);
        throw e;
      }),
    );
  return tiles.get(key);
}
const buildingTiles = new Map();
async function buildingTile(b, signal) {
  const key = boxKey(b);
  if (!buildingTiles.has(key))
    buildingTiles.set(
      key,
      (async () => {
        const m = await manifest();
        if (m.buildings?.includes(key)) return local(`data/pack/buildings/${key}.json`);
        return compactBuildings(await overpass(BUILDING_QUERY(key), signal));
      })().catch((e) => {
        buildingTiles.delete(key);
        throw e;
      }),
    );
  // Keep memory bounded on long drives.
  while (buildingTiles.size > 24) buildingTiles.delete(buildingTiles.keys().next().value);
  return buildingTiles.get(key);
}
const merge = (list) => ({
  elements: [...new Map(list.flatMap((d) => d.elements).map((e) => [e.type + "/" + e.id, e])).values()],
});

export async function mapQuery(query, signal) {
  const snap = await preview();
  if (snap?.query === query) return snap.roads;
  if (query.includes("[highway~")) {
    const second = await signalRoads(),
      boxes = (q) => [...q.matchAll(/way\(([\d.,-]+)\)/g)].map((m) => m[1].split(",").map((n) => Number(n).toFixed(7)).join(",")),
      sources = [snap, second].filter(Boolean),
      available = new Set(sources.flatMap((s) => boxes(s.query))),
      requested = boxes(query);
    if (requested.length && requested.every((b) => available.has(b))) return merge(sources.map((s) => s.roads));
    return selectMapQuery(merge(await Promise.all(queryBounds(query).map((b) => roadTile(b, signal)))), query);
  }
  if (query.includes(BUILDING_FILTER)) return merge(await Promise.all(queryBounds(query).map((b) => buildingTile(b, signal))));
  if (query.includes("[amenity=parking]")) {
    const around = query.match(/around:([\d.]+),([\d.-]+),([\d.-]+)/),
      m = await manifest();
    if (around) {
      const lat = +around[2],
        lon = +around[3],
        box = (m.parking || []).find((k) => {
          const [s, w, n, e] = k.split(",").map(Number);
          return lat >= s && lat <= n && lon >= w && lon <= e;
        });
      if (box) return selectMapQuery(await local(`data/pack/parking/${box}.json`), query);
    }
  }
  return selectMapQuery(await overpass(query, signal), query);
}

export async function route(start, end, signal) {
  const same = (s, c) => s.split(",").every((v, i) => Math.abs(Number(v) - c[i]) < 1e-7);
  const t = await training(),
    saved = t?.routes.find((r) => same(start, r.start) && same(end, r.end));
  if (saved) return saved.data;
  const snap = await preview();
  if (snap?.start === start && snap?.end === end) return snap.route;
  const tail = `route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=true`;
  let last;
  for (const server of OSRM)
    try {
      const data = await getJson(server + tail, signal, 15000);
      if (data.code === "Ok") return data;
      last = new Error("자동차 경로가 없습니다.");
    } catch (e) {
      if (signal?.aborted) throw e;
      last = e;
    }
  // Fallback: the built-in router over pack tiles around the trip.
  const [a, b] = [start, end].map((s) => s.split(",").map(Number));
  const m = await manifest(),
    margin = 0.03,
    s = Math.min(a[1], b[1]) - margin,
    n = Math.max(a[1], b[1]) + margin,
    w = Math.min(a[0], b[0]) - margin,
    e = Math.max(a[0], b[0]) + margin;
  const keys = (m.roads || [])
    .filter((k) => {
      const [ks, kw, kn, ke] = k.split(",").map(Number);
      return kn >= s && ks <= n && ke >= w && kw <= e;
    })
    .slice(0, 160);
  if (keys.length) {
    const ways = (await Promise.all(keys.map((k) => local(`data/pack/roads/${k}.json`)))).flatMap((d) => d.elements);
    const result = localRoute(buildGraph(ways), a, b);
    if (result && result.routes[0].distance <= metres({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }) * 2.4 + 3000)
      return result;
  }
  throw new Error("자동차 경로 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", { cause: last });
}

const placeIndex = once(async () => {
  const [catalog, pois, extras, m] = await Promise.all([
    local("data/places.json"),
    local("data/okinawa-pois.json"),
    local("data/okinawa-extra-pois.json"),
    manifest(),
  ]);
  const elements = [...pois.elements, ...extras.elements],
    byId = new Map(elements.map((e) => [`${e.type}/${e.id}`, e]));
  const recommended = catalog.places.flatMap((p) => {
    const pattern = p.match ? new RegExp(p.match, "i") : null;
    const e = p.osm
      ? byId.get(p.osm)
      : elements.find((e) => pattern && Object.entries(e.tags || {}).some(([k, v]) => k.startsWith("name") && pattern.test(v)));
    const lat = p.lat ?? e?.lat ?? e?.center?.lat,
      lon = p.lon ?? e?.lon ?? e?.center?.lon;
    const names = [e?.tags?.name, e?.tags?.["name:en"], e?.tags?.["name:ja"]].filter(Boolean);
    return Number.isFinite(lat) ? [{ id: p.id, name: p.name, names, kind: p.kind, lat, lon, recommended: true }] : [];
  });
  const packed = (await Promise.all((m.places || []).map((k) => local(`data/pack/places/${k}.json`).catch(() => null))))
    .filter(Boolean)
    .flatMap((d) => entriesFromOsm(d.elements));
  const index = buildIndex([...recommended, ...entriesFromOsm(elements), ...packed]);
  index.updatedAt = m.updatedAt || null;
  index.packed = (m.places || []).length;
  return index;
});

const geocodeCache = new Map();
async function geocode(q, signal) {
  const key = q.trim().toLowerCase();
  if (!geocodeCache.has(key))
    geocodeCache.set(
      key,
      geocodeSlot(async () => {
        try {
          const rows = await getJson(
            "https://nominatim.openstreetmap.org/search?" +
              new URLSearchParams({
                q,
                format: "jsonv2",
                countrycodes: "jp",
                viewbox: "127.6,26.95,128.4,26.0",
                bounded: "1",
                limit: "6",
                "accept-language": "ko,ja,en",
              }),
            signal,
            10000,
          );
          return rows.map((row) => ({
            id: `${row.osm_type}/${row.osm_id}`,
            name: row.name || row.display_name.split(",")[0],
            address: row.display_name,
            kind: row.type,
            lat: Number(row.lat),
            lon: Number(row.lon),
            source: `https://www.openstreetmap.org/${row.osm_type}/${row.osm_id}`,
          }));
        } finally {
          await new Promise((r) => setTimeout(r, 1100));
        }
      }).catch((e) => {
        geocodeCache.delete(key);
        throw e;
      }),
    );
  return geocodeCache.get(key);
}

export async function places(q, { lat, lon, online = true } = {}, signal) {
  const index = await placeIndex(),
    meta = { count: index.count, updatedAt: index.updatedAt, packed: index.packed };
  const point = parseLocation(q);
  if (point)
    return {
      ...meta,
      source: "pin",
      results: [{ id: `pin:${point.lat.toFixed(6)},${point.lon.toFixed(6)}`, name: "붙여 넣은 위치", kindName: "좌표", ...point }],
    };
  let results = q ? search(index, q, { near: Number.isFinite(lat) ? { lat, lon } : null }) : [],
    source = "local";
  if (online && q.trim().length >= 2 && results.length < 3)
    try {
      const found = await geocode(q, signal);
      if (found.length) {
        results = [...results, ...found.map((r) => ({ ...r, kindName: "주소 검색", online: true }))].slice(0, 8);
        source = "online";
      }
    } catch {}
  return { ...meta, results, source };
}
