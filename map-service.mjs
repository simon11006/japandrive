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
  const memory = new Map(),
    pending = new Map();
  async function saved(key, request, signal) {
    signal?.throwIfAborted();
    if (memory.has(key)) return memory.get(key);
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
            memory.set(key, prior.data);
            return prior.data;
          }
        } catch {}
        current.controller.signal.throwIfAborted();
        const data = await request(current.controller.signal);
        current.controller.signal.throwIfAborted();
        memory.set(key, data);
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
  async function fetchJson(url, signal, timeout = 12000) {
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
  async function mapQuery(query, signal) {
    const bounds = queryBounds(query);
    if (!bounds.length) throw new Error("지원하지 않는 지도 조회입니다.");
    const results = [];
    for (const b of bounds) {
      signal?.throwIfAborted();
      if ((b[2] - b[0]) * (b[3] - b[1]) > 0.0025) throw new Error("지도 조회 범위가 너무 넓습니다.");
      const bbox = [b[1], b[0], b[3], b[2]].map((v) => v.toFixed(7)).join(",");
      const key = "https://api.openstreetmap.org/api/0.6/map.json?bbox=" + bbox;
      const data = await saved(key, (s) => fetchJson(key, s, 16000), signal);
      results.push(coreGeometry(data));
    }
    return selectMapQuery(
      {
        elements: [
          ...new Map(results.flatMap((d) => d.elements).map((e) => [e.type + "/" + e.id, e])).values(),
        ],
      },
      query,
    );
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
            const data = await fetchJson(base + tail, sharedSignal, 12000);
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
  return { mapQuery, route, fetchJson };
}
