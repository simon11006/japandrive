import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { readdir } from "node:fs/promises";
import { buildGraph, localRoute, metres } from "./local-router.mjs";
import {
  HIGHWAYS,
  coreGeometry,
  limiter,
  ROAD_FILTER,
  boxKey,
  queryBounds,
  selectMapQuery,
} from "./map-core.mjs";
export { HIGHWAYS, coreGeometry, limiter, ROAD_FILTER, boxKey, queryBounds, selectMapQuery };
export function createMapService({
  fetcher = fetch,
  cacheDir = resolve("data/service-cache"),
  extraRoads = async () => [],
  packTiles = 400,
} = {}) {
  // Recent responses stay in memory (bounded); everything is also on disk.
  const memory = new Map(),
    pending = new Map(),
    remember = (key, data) => {
      memory.delete(key);
      memory.set(key, data);
      while (memory.size > 400) memory.delete(memory.keys().next().value);
    },
    mapSlots = limiter(2),
    routeSlots = limiter(4);
  async function saved(key, request, signal) {
    signal?.throwIfAborted();
    if (memory.has(key)) {
      const hit = memory.get(key);
      remember(key, hit);
      return hit;
    }
    let entry = pending.get(key);
    if (entry?.controller.signal.aborted) entry = null;
    if (!entry) {
      const path = resolve(cacheDir, createHash("sha256").update(key).digest("hex") + ".json");
      entry = { controller: new AbortController(), waiters: 0, settled: false };
      const current = entry;
      entry.task = (async () => {
        try {
          const prior = JSON.parse(await readFile(path, "utf8"));
          if (prior.schema === 1) {
            remember(key, prior.data);
            return prior.data;
          }
        } catch {}
        current.controller.signal.throwIfAborted();
        const data = await request(current.controller.signal);
        current.controller.signal.throwIfAborted();
        remember(key, data);
        // A read-only/full cache folder must not discard a valid map response.
        try {
          await mkdir(cacheDir, { recursive: true });
          const tmp = path + ".tmp";
          await writeFile(
            tmp,
            JSON.stringify({ schema: 1, source: key, fetchedAt: new Date().toISOString(), data }),
          );
          await rename(tmp, path);
        } catch {}
        return data;
      })().finally(() => {
        current.settled = true;
        if (pending.get(key) === current) pending.delete(key);
      });
      pending.set(key, entry);
    }
    entry.waiters++;
    return new Promise((resolve, reject) => {
      let finished = false;
      const release = () => {
        signal?.removeEventListener("abort", abort);
        if (--entry.waiters === 0 && !entry.settled) entry.controller.abort();
      };
      const finish = (fn, value) => {
        if (finished) return;
        finished = true;
        release();
        fn(value);
      };
      const abort = () => finish(reject, signal.reason || new DOMException("Cancelled", "AbortError"));
      signal?.addEventListener("abort", abort, { once: true });
      entry.task.then(
        (data) => finish(resolve, data),
        (error) => finish(reject, error),
      );
      if (signal?.aborted) abort();
    });
  }
  // Busy public servers answer 429/503/504; wait briefly and try once more.
  async function fetchJson(url, signal, timeout = 12000, slots = mapSlots) {
    return slots(async () => {
      try {
        return await fetchOnce(url, signal, timeout);
      } catch (error) {
        if (signal?.aborted || !/ (429|502|503|504)$/.test(error.message)) throw error;
        await new Promise((r) => setTimeout(r, 2000));
        signal?.throwIfAborted();
        return fetchOnce(url, signal, timeout);
      }
    });
  }
  async function fetchOnce(url, signal, timeout) {
    const r = await fetcher(url, {
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
      headers: {
        Accept: "application/json",
        "User-Agent": "JapanDrive/0.5 (local driving game; cached public map snapshots)",
      },
    });
    if (!r.ok) throw new Error(`지도 서버 응답 ${r.status}`);
    const data = await r.json();
    if (data.remark) throw new Error("지도 서버가 조회를 완료하지 못했습니다.");
    return data;
  }
  // Overpass is built for filtered queries ("drivable roads in this box"),
  // so it is tried first on several public servers. The general OSM API
  // returns every object in a box and refuses areas over 50,000 nodes, which
  // dense towns such as Naha exceed; it is only a fallback, in small boxes.
  const OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  ];
  async function overpass(query, signal) {
    return saved("overpass:" + query, (shared) => overpassRaw(query, shared), signal);
  }
  async function overpassRaw(query, shared) {
    {
      {
        let last;
        for (const base of OVERPASS) {
          try {
            shared.throwIfAborted();
            const data = await fetchJson(base + "?data=" + encodeURIComponent(query), shared, 30000);
            if (!Array.isArray(data.elements)) throw new Error("지도 서버 응답 형식이 올바르지 않습니다.");
            return { elements: data.elements.filter((e) => e.type === "way" || e.tags) };
          } catch (e) {
            if (shared.aborted) throw e;
            last = e;
          }
        }
        throw last;
      }
    }
  }
  async function osmBox(b, signal, depth = 0) {
    const bbox = [b[1], b[0], b[3], b[2]].map((v) => v.toFixed(7)).join(",");
    const key = "https://api.openstreetmap.org/api/0.6/map.json?bbox=" + bbox;
    try {
      return [coreGeometry(await saved(key, (s) => fetchJson(key, s, 25000), signal))];
    } catch (e) {
      // "Too many nodes" (HTTP 400) or a slow dense box: split into quarters.
      if (signal?.aborted || depth >= 2) throw e;
      const midLat = (b[0] + b[2]) / 2,
        midLon = (b[1] + b[3]) / 2,
        parts = [
          [b[0], b[1], midLat, midLon],
          [b[0], midLon, midLat, b[3]],
          [midLat, b[1], b[2], midLon],
          [midLat, midLon, b[2], b[3]],
        ];
      const out = [];
      for (const part of parts) out.push(...(await osmBox(part, signal, depth + 1)));
      return out;
    }
  }
  // Roads are cached one map tile at a time, so a tile fetched for one player
  // (or by scripts/build-offline-pack.mjs) serves every later player.
  async function roadTile(b, signal) {
    const key = "roads:" + boxKey(b);
    return saved(
      key,
      async (shared) => {
        const query = `[out:json][timeout:45];way(${boxKey(b)})${ROAD_FILTER};out geom;`;
        try {
          return await overpassRaw(query, shared);
        } catch (error) {
          if (shared.aborted) throw error;
        }
        const results = [];
        const step = 0.009;
        for (let lat = b[0]; lat < b[2] - 1e-9; lat += step)
          for (let lon = b[1]; lon < b[3] - 1e-9; lon += step)
            results.push(
              ...(await osmBox([lat, lon, Math.min(b[2], lat + step), Math.min(b[3], lon + step)], shared)),
            );
        return selectMapQuery(merge(results), "[highway~");
      },
      signal,
    );
  }
  const merge = (results) => ({
    elements: [...new Map(results.flatMap((d) => d.elements).map((e) => [e.type + "/" + e.id, e])).values()],
  });
  async function mapQuery(query, signal) {
    const bounds = queryBounds(query);
    if (!bounds.length) throw new Error("지원하지 않는 지도 조회입니다.");
    for (const b of bounds)
      if ((b[2] - b[0]) * (b[3] - b[1]) > 0.0025) throw new Error("지도 조회 범위가 너무 넓습니다.");
    if (query.includes("[highway~"))
      return selectMapQuery(merge(await Promise.all(bounds.map((b) => roadTile(b, signal)))), query);
    if (query.includes("[amenity=parking]")) {
      const fromPack = await packParking(query);
      if (fromPack) return fromPack;
    }
    try {
      return selectMapQuery(await overpass(query, signal), query);
    } catch (error) {
      if (signal?.aborted) throw error;
    }
    const results = [];
    for (const b of bounds) {
      signal?.throwIfAborted();
      const step = 0.009;
      for (let lat = b[0]; lat < b[2] - 1e-9; lat += step)
        for (let lon = b[1]; lon < b[3] - 1e-9; lon += step)
          results.push(...(await osmBox([lat, lon, Math.min(b[2], lat + step), Math.min(b[3], lon + step)], signal)));
    }
    return selectMapQuery(merge(results), query);
  }
  // Road graph for the built-in router: every saved road tile (from play or
  // from the offline map pack) plus bundled road snapshots. Rebuilt when the
  // number of saved tiles changes.
  let graph = null,
    graphTiles = -1,
    graphLoading = null;
  async function roadGraph() {
    let files = [];
    try {
      files = (await readdir(cacheDir)).filter((f) => f.endsWith(".json"));
    } catch {}
    if (graph && files.length === graphTiles) return graph;
    if (graphLoading) return graphLoading;
    graphLoading = (async () => {
      const ways = [...(await extraRoads())];
      let tiles = 0;
      for (const f of files) {
        try {
          const saved = JSON.parse(await readFile(resolve(cacheDir, f), "utf8"));
          if (!String(saved.source).startsWith("roads:")) continue;
          tiles++;
          ways.push(...saved.data.elements.filter((e) => e.type === "way"));
        } catch {}
      }
      graph = buildGraph(ways);
      graph.tiles = tiles;
      graphTiles = files.length;
      return graph;
    })().finally(() => (graphLoading = null));
    return graphLoading;
  }
  async function local(start, end) {
    const g = await roadGraph(),
      a = start.split(",").map(Number),
      b = end.split(",").map(Number),
      result = localRoute(g, a, b);
    if (!result) return null;
    // Reject detours forced by gaps in a partial road set.
    const straight = metres({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] });
    return result.routes[0].distance <= straight * 2.4 + 3000 ? result : null;
  }
  async function online(start, end, sharedSignal) {
    const tail = `route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=true`;
    let last;
    for (const base of ["https://routing.openstreetmap.de/routed-car/", "https://router.project-osrm.org/"]) {
      try {
        sharedSignal.throwIfAborted();
        const data = await fetchJson(base + tail, sharedSignal, 12000, routeSlots);
        if (data.code !== "Ok") throw new Error("자동차 경로가 없습니다.");
        return { ...data, provider: base };
      } catch (e) {
        if (sharedSignal.aborted) throw e;
        last = e;
      }
    }
    throw new Error("자동차 경로 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", { cause: last });
  }
  // With the island map pack installed, routes are computed here first, so
  // hundreds of players never wait on a public routing server. Without it,
  // the public servers come first and the built-in router is the fallback.
  async function route(start, end, signal) {
    return saved(
      "route:" + start + ";" + end,
      async (sharedSignal) => {
        const g = await roadGraph();
        if (g.tiles >= packTiles) {
          const mine = await local(start, end);
          if (mine) return mine;
        }
        try {
          return await online(start, end, sharedSignal);
        } catch (error) {
          if (sharedSignal.aborted) throw error;
          const mine = await local(start, end);
          if (mine) return mine;
          throw error;
        }
      },
      signal,
    );
  }
  // ---------- Island places and parking (offline pack) ----------
  // Everything a driver might head for, plus every mapped parking lot (with
  // its outline, so the game can guide the car into it).
  const PLACE_QUERY = (b) => `[out:json][timeout:180];(
nwr["amenity"~"^(parking|restaurant|cafe|fast_food|fuel|car_rental|ice_cream|food_court|pub|bar|marketplace|charging_station|toilets)$"](${b});
nwr["shop"~"^(convenience|supermarket|mall|department_store|gift|seafood|bakery|car)$"](${b});
nwr["tourism"~"^(attraction|hotel|guest_house|hostel|motel|apartment|museum|viewpoint|theme_park|aquarium|zoo|camp_site|information|picnic_site)$"](${b});
nwr["leisure"~"^(park|beach_resort|water_park|golf_course|marina|sports_centre|stadium)$"]["name"](${b});
nwr["natural"="beach"]["name"](${b});
nwr["historic"]["name"](${b});
nwr["aeroway"="aerodrome"]["name"](${b});
);out center tags;`;
  const PARKING_QUERY = (b) => `[out:json][timeout:180];way["amenity"="parking"](${b});out geom;`;
  async function placeBox(b, signal) {
    return saved("places:" + boxKey(b), (s) => overpassRaw(PLACE_QUERY(boxKey(b)), s), signal);
  }
  async function parkingBox(b, signal) {
    return saved("parking:" + boxKey(b), (s) => overpassRaw(PARKING_QUERY(boxKey(b)), s), signal);
  }
  // Saved pack files by kind (roads / places / parking), read from disk.
  async function packFiles(prefix) {
    const out = [];
    let files = [];
    try {
      files = (await readdir(cacheDir)).filter((f) => f.endsWith(".json"));
    } catch {}
    for (const f of files) {
      try {
        const text = await readFile(resolve(cacheDir, f), "utf8");
        if (!text.includes(`"source":"${prefix}`)) continue;
        const saved = JSON.parse(text);
        if (String(saved.source).startsWith(prefix)) out.push({ file: f, ...saved });
      } catch {}
    }
    return out;
  }
  // Parking near a destination: answered from the pack when it covers the
  // spot, so destination lookups need no public server either.
  async function packParking(query) {
    const around = query.match(/around:([\d.]+),([\d.-]+),([\d.-]+)/);
    if (!around) return null;
    const lat = +around[2],
      lon = +around[3];
    const boxes = await packFiles("parking:");
    const covering = boxes.filter((b) => {
      const [s, w, n, e] = b.source.slice(8).split(",").map(Number);
      return lat >= s && lat <= n && lon >= w && lon <= e;
    });
    if (!covering.length) return null;
    return selectMapQuery(merge(covering.map((b) => b.data)), query);
  }
  // Re-download the oldest pack file once it is older than `days`.
  // Called now and then by one server worker while it is idle.
  async function refreshStale(days = 30) {
    const files = [...(await packFiles("roads:")), ...(await packFiles("places:")), ...(await packFiles("parking:"))];
    const old = files
      .filter((f) => Date.now() - Date.parse(f.fetchedAt || 0) > days * 86400000)
      .sort((a, b) => Date.parse(a.fetchedAt || 0) - Date.parse(b.fetchedAt || 0))[0];
    if (!old) return null;
    const [kind, box] = [old.source.split(":")[0], old.source.split(":")[1]],
      controller = new AbortController();
    const data =
      kind === "roads"
        ? await overpassRaw(`[out:json][timeout:45];way(${box})${ROAD_FILTER};out geom;`, controller.signal)
        : kind === "places"
          ? await overpassRaw(PLACE_QUERY(box), controller.signal)
          : await overpassRaw(PARKING_QUERY(box), controller.signal);
    const path = resolve(cacheDir, old.file);
    await writeFile(path + ".tmp", JSON.stringify({ schema: 1, source: old.source, fetchedAt: new Date().toISOString(), data }));
    await rename(path + ".tmp", path);
    memory.delete(old.source);
    return old.source;
  }
  // Online address search (OpenStreetMap Nominatim) for places missing from
  // the island data. Its usage policy allows one request per second, so all
  // players share one slot with a pause; answers are saved and reused.
  const geocodeSlot = limiter(1);
  async function geocode(text, signal) {
    const q = String(text).trim().slice(0, 120);
    return saved(
      "geocode:" + q.toLowerCase(),
      (shared) =>
        geocodeSlot(async () => {
          const url =
            "https://nominatim.openstreetmap.org/search?" +
            new URLSearchParams({
              q,
              format: "jsonv2",
              countrycodes: "jp",
              viewbox: "127.6,26.95,128.4,26.0",
              bounded: "1",
              limit: "6",
              "accept-language": "ko,ja,en",
            });
          try {
            const r = await fetcher(url, {
              signal: AbortSignal.any([shared, AbortSignal.timeout(10000)]),
              headers: { Accept: "application/json", "User-Agent": "JapanDrive/0.6 (driving practice game; cached lookups)" },
            });
            if (!r.ok) throw new Error(`주소 검색 서버 응답 ${r.status}`);
            const rows = await r.json();
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
            await new Promise((resolve) => setTimeout(resolve, 1100));
          }
        }),
      signal,
    );
  }
  return { mapQuery, route, fetchJson, roadTile, roadGraph, placeBox, parkingBox, packFiles, refreshStale, geocode };
}
