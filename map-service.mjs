import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
const HIGHWAYS = new Set(
  "motorway trunk primary secondary tertiary unclassified residential living_street service motorway_link trunk_link primary_link secondary_link tertiary_link".split(
    " ",
  ),
);
export function coreGeometry(data) {
  const nodes = new Map(data.elements.filter((e) => e.type === "node").map((e) => [e.id, e]));
  return {
    version: 0.6,
    source: "© OpenStreetMap contributors",
    elements: data.elements.flatMap((e) =>
      e.type === "way"
        ? e.nodes?.every((id) => nodes.has(id))
          ? [
              {
                type: "way",
                id: e.id,
                tags: e.tags || {},
                geometry: e.nodes.map((id) => ({ lat: nodes.get(id).lat, lon: nodes.get(id).lon })),
              },
            ]
          : []
        : e.type === "node" && e.tags
          ? [{ type: "node", id: e.id, lat: e.lat, lon: e.lon, tags: e.tags }]
          : [],
    ),
  };
}
// Run at most `n` tasks at once; the rest wait their turn. Public map
// servers allow only a couple of simultaneous requests per address.
export function limiter(n) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= n || !waiting.length) return;
    active++;
    const { task, resolve, reject } = waiting.shift();
    task()
      .then(resolve, reject)
      .finally(() => {
        active--;
        next();
      });
  };
  return (task) =>
    new Promise((resolve, reject) => {
      waiting.push({ task, resolve, reject });
      next();
    });
}
export const ROAD_FILTER =
  '[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]';
export const boxKey = (b) => b.map((v) => Number(v).toFixed(6)).join(",");
export function queryBounds(query) {
  const around = query.match(/way\(around:([\d.]+),([\d.-]+),([\d.-]+)\)/);
  if (around) {
    const radius = +around[1],
      lat = +around[2],
      lon = +around[3],
      dy = radius / 111320,
      dx = dy / Math.cos((lat * Math.PI) / 180);
    return [[lat - dy, lon - dx, lat + dy, lon + dx]];
  }
  return [...query.matchAll(/way\(([\d.,-]+)\)/g)]
    .map((m) => m[1].split(",").map(Number))
    .filter((b) => b.length === 4 && b.every(Number.isFinite));
}
export function selectMapQuery(data, query) {
  const roads = query.includes("[highway~"),
    parking = query.includes("[amenity=parking]"),
    around = query.match(/around:([\d.]+),([\d.-]+),([\d.-]+)/);
  return {
    ...data,
    elements: data.elements.filter((e) => {
      if (e.type !== "way" || e.geometry?.length < 2) return false;
      const t = e.tags || {};
      if (roads)
        return (
          HIGHWAYS.has(t.highway) &&
          t.area !== "yes" &&
          !["private", "no"].includes(t.access) &&
          !["private", "no"].includes(t.motor_vehicle) &&
          !["private", "no"].includes(t.motorcar)
        );
      if (parking) {
        if (
          t.amenity !== "parking" ||
          t.access === "no" ||
          (query.includes("private|no") && t.access === "private")
        )
          return false;
        if (around) {
          const lat = +around[2],
            lon = +around[3],
            r = +around[1];
          return e.geometry.some(
            (p) =>
              Math.hypot((p.lon - lon) * 111320 * Math.cos((lat * Math.PI) / 180), (p.lat - lat) * 111320) <=
              r,
          );
        }
        return true;
      }
      return false;
    }),
  };
}
export function createMapService({ fetcher = fetch, cacheDir = resolve("data/service-cache") } = {}) {
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
  async function route(start, end, signal) {
    const tail = `route/v1/driving/${start};${end}?overview=full&geometries=geojson&steps=true`,
      key = "route:" + start + ";" + end;
    return saved(
      key,
      async (sharedSignal) => {
        let last;
        for (const base of [
          "https://routing.openstreetmap.de/routed-car/",
          "https://router.project-osrm.org/",
        ]) {
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
        throw new Error("자동차 경로 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.", {
          cause: last,
        });
      },
      signal,
    );
  }
  return { mapQuery, route, fetchJson, roadTile };
}
