import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, unlink, rmdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { coreGeometry, selectMapQuery, createMapService } from "../map-service.mjs";
async function folder(t) {
  const path = await mkdtemp(resolve("data/.test-map-"));
  t.after(async () => {
    for (const file of await readdir(path)) await unlink(join(path, file));
    await rmdir(path);
  });
  return path;
}
const ok = (data) => ({ ok: true, json: async () => data }),
  route = {
    code: "Ok",
    routes: [
      {
        distance: 123,
        geometry: {
          coordinates: [
            [127, 26],
            [127.01, 26.01],
          ],
        },
      },
    ],
  };
test("OSM core snapshots retain connected geometry and public driveable roads without contributor metadata", () => {
  const raw = {
    elements: [
      { type: "node", id: 1, lat: 26, lon: 127, user: "private metadata" },
      { type: "node", id: 2, lat: 26.001, lon: 127.001 },
      { type: "way", id: 3, nodes: [1, 2], tags: { highway: "residential" } },
      { type: "way", id: 4, nodes: [1, 2], tags: { highway: "service", access: "private" } },
      { type: "way", id: 5, nodes: [1, 2], tags: { highway: "footway" } },
      { type: "way", id: 6, nodes: [1, 9], tags: { highway: "primary" } },
    ],
  };
  const d = coreGeometry(raw),
    roads = selectMapQuery(d, 'way[highway~"residential|service"];');
  assert.deepEqual(
    roads.elements.map((e) => e.id),
    [3],
  );
  assert.deepEqual(roads.elements[0].geometry, [
    { lat: 26, lon: 127 },
    { lat: 26.001, lon: 127.001 },
  ]);
  assert.ok(!JSON.stringify(d).includes("private metadata"));
  assert.ok(!d.elements.some((e) => e.id === 6));
});
test("parking lookup respects access exclusions and the requested radius", () => {
  const feature = (id, lat, access) => ({
      type: "way",
      id,
      tags: { amenity: "parking", access },
      geometry: [
        { lat, lon: 127 },
        { lat: lat + 0.00001, lon: 127.00001 },
      ],
    }),
    d = { elements: [feature(1, 26, "customers"), feature(2, 26, "private"), feature(3, 26.1, "yes")] };
  const result = selectMapQuery(d, 'way(around:400,26,127)[amenity=parking][access!~"^(private|no)$"];');
  assert.deepEqual(
    result.elements.map((e) => e.id),
    [1],
  );
});
test("route service falls back to another real provider and reuses the saved route after restart", async (t) => {
  const cacheDir = await folder(t),
    calls = [];
  const one = createMapService({
    cacheDir,
    fetcher: async (url) => {
      calls.push(String(url));
      // The first provider stays busy (it is retried once), so the second answers.
      return String(url).includes("openstreetmap.de") ? { ok: false, status: 503 } : ok(route);
    },
  });
  const first = await one.route("127,26", "127.01,26.01");
  assert.equal(calls.length, 3);
  assert.match(first.provider, /router.project-osrm.org/);
  const two = createMapService({
    cacheDir,
    fetcher: async () => {
      throw Error("must use saved route");
    },
  });
  assert.deepEqual(await two.route("127,26", "127.01,26.01"), first);
});
test("cancelling preparation immediately allows a fresh attempt for the same route", async (t) => {
  const cacheDir = await folder(t);
  let started;
  const ready = new Promise((r) => (started = r));
  let calls = 0;
  const service = createMapService({
      cacheDir,
      fetcher: async (_url, { signal }) => {
        if (++calls === 1) {
          started();
          return new Promise((_r, reject) =>
            signal.addEventListener("abort", () => reject(signal.reason), { once: true }),
          );
        }
        return ok(route);
      },
    }),
    abort = new AbortController(),
    first = service.route("127,26", "127.01,26.01", abort.signal);
  const rejected = assert.rejects(first, { name: "AbortError" });
  await ready;
  abort.abort();
  const second = service.route("127,26", "127.01,26.01");
  await rejected;
  assert.equal((await second).code, "Ok");
  assert.equal(calls, 2);
});
test("one cancelled subscriber does not cancel another subscriber sharing the same route", async (t) => {
  const cacheDir = await folder(t);
  let release, started;
  const ready = new Promise((r) => (started = r));
  let calls = 0,
    requestSignal;
  const service = createMapService({
      cacheDir,
      fetcher: async (_url, { signal }) => {
        calls++;
        requestSignal = signal;
        started();
        return new Promise((r) => (release = () => r(ok(route))));
      },
    }),
    abort = new AbortController();
  const one = service.route("127,26", "127.01,26.01", abort.signal),
    two = service.route("127,26", "127.01,26.01");
  const rejected = assert.rejects(one, { name: "AbortError" });
  await ready;
  abort.abort();
  await rejected;
  assert.equal(requestSignal.aborted, false);
  release();
  assert.equal((await two).code, "Ok");
  assert.equal(calls, 1);
});
test("a cache write failure does not turn a valid driving route into a connection error", async (t) => {
  const dir = await folder(t),
    blocked = join(dir, "file");
  await writeFile(blocked, "test");
  const service = createMapService({ cacheDir: join(blocked, "cache"), fetcher: async () => ok(route) });
  assert.equal((await service.route("127,26", "127.01,26.01")).code, "Ok");
});

test("road lookups use Overpass first and fall back to small general-API boxes in dense towns", async (t) => {
  const dir = await folder(t);
  const query = '[out:json][timeout:45];(way(26.20,127.67,26.2179,127.69)[highway~"^(primary|residential)$"];);out geom;';
  const road = { type: "way", id: 9, tags: { highway: "primary" }, geometry: [{ lat: 26.2, lon: 127.67 }, { lat: 26.21, lon: 127.68 }] };
  // 1) Overpass answers: the general API is never touched.
  const seen = [];
  let service = createMapService({
    cacheDir: dir,
    fetcher: async (url) => {
      seen.push(url);
      return ok({ elements: [road] });
    },
  });
  assert.deepEqual((await service.mapQuery(query)).elements.map((e) => e.id), [9]);
  assert.ok(seen.every((u) => u.includes("overpass") || u.includes("/interpreter")));
  // 2) Every Overpass server down; the general API refuses big boxes (too
  //    many nodes) and answers once the box has been split small enough.
  const boxes = [];
  service = createMapService({
    cacheDir: await folder(t),
    fetcher: async (url) => {
      if (url.includes("interpreter")) return { ok: false, status: 504, json: async () => ({}) };
      const [w, s, e, n] = new URL(url).searchParams.get("bbox").split(",").map(Number);
      boxes.push((e - w) * (n - s));
      if ((e - w) * (n - s) > 0.00003) return { ok: false, status: 400, json: async () => ({}) };
      return ok({
        elements: [
          { type: "node", id: 1, lat: 26.2, lon: 127.67 },
          { type: "node", id: 2, lat: 26.201, lon: 127.671 },
          { type: "way", id: 7, nodes: [1, 2], tags: { highway: "residential" } },
        ],
      });
    },
  });
  const fallback = await service.mapQuery(query);
  assert.deepEqual(fallback.elements.map((e) => e.id), [7]);
  assert.ok(boxes.some((a) => a <= 0.00003), "dense boxes were split");
});

test("road tiles are cached one tile at a time and shared between different combined queries", async (t) => {
  const dir = await folder(t);
  const calls = [];
  const road = (id, lat) => ({ type: "way", id, tags: { highway: "residential" }, geometry: [{ lat, lon: 127.6 }, { lat: lat + 0.001, lon: 127.601 }] });
  const service = createMapService({
    cacheDir: dir,
    fetcher: async (url) => {
      calls.push(String(url));
      const box = decodeURIComponent(String(url)).match(/way\(([\d.,-]+)\)/)[1].split(",").map(Number);
      return ok({ elements: [road(Math.round(box[0] * 1000), box[0] + 0.001)] });
    },
  });
  const A = "26.200000,127.590000,26.210000,127.610000",
    B = "26.210000,127.590000,26.220000,127.610000",
    C = "26.220000,127.590000,26.230000,127.610000";
  const q = (...boxes) => `[out:json][timeout:45];(${boxes.map((b) => `way(${b})[highway~"^(residential)$"];`).join("")});out geom;`;
  assert.equal((await service.mapQuery(q(A, B))).elements.length, 2);
  assert.equal(calls.length, 2);
  // A different combination reuses A and B and fetches only C.
  assert.equal((await service.mapQuery(q(B, C, A))).elements.length, 3);
  assert.equal(calls.length, 3);
});

test("at most two map requests go upstream at once, however many players ask", async (t) => {
  const dir = await folder(t);
  let active = 0,
    peak = 0;
  const service = createMapService({
    cacheDir: dir,
    fetcher: async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 20));
      active--;
      return ok({ elements: [] });
    },
  });
  const boxes = Array.from({ length: 12 }, (_, i) => `26.${String(200 + i * 10).padStart(3, "0")}000,127.590000,26.${String(209 + i * 10).padStart(3, "0")}000,127.600000`);
  await Promise.all(boxes.map((b) => service.mapQuery(`[out:json];(way(${b})[highway~"^(residential)$"];);out geom;`)));
  assert.ok(peak <= 2, `peak ${peak}`);
});

test("the built-in router finds a real-road route on bundled Okinawa data, OSRM-shaped", async () => {
  const { buildGraph, localRoute, metres } = await import("../local-router.mjs");
  const { readFile } = await import("node:fs/promises");
  const load = async (f) => {
    const d = JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url), "utf8"));
    return (d.roads || d).elements.filter((e) => e.type === "way" && e.geometry);
  };
  const ways = [...(await load("preview-cache.json")), ...(await load("signal-roads.json"))];
  const graph = buildGraph(ways);
  const training = JSON.parse(await readFile(new URL("../data/training-routes.json", import.meta.url), "utf8"));
  const short = training.routes.find((r) => r.data.routes[0].distance < 2000);
  const result = localRoute(graph, short.start, short.end);
  assert.equal(result.code, "Ok");
  const r = result.routes[0];
  assert.ok(r.geometry.coordinates.length > 2);
  assert.equal(r.legs[0].steps.at(-1).maneuver.type, "arrive");
  // Comparable to the stored OSRM route for the same trip.
  const osrm = short.data.routes[0].distance;
  assert.ok(r.distance < osrm * 1.6 + 200, `local ${r.distance} vs OSRM ${osrm}`);
  // Every step of the path follows a real road segment (consecutive points close together).
  for (let i = 1; i < r.geometry.coordinates.length; i++) {
    const [a, b] = [r.geometry.coordinates[i - 1], r.geometry.coordinates[i]];
    assert.ok(metres({ lon: a[0], lat: a[1] }, { lon: b[0], lat: b[1] }) < 1500);
  }
});

test("one-way streets are only routed in their direction", async () => {
  const { buildGraph, localRoute } = await import("../local-router.mjs");
  const p = (lat, lon) => ({ lat, lon });
  const ways = [
    { tags: { highway: "residential", oneway: "yes" }, geometry: [p(26.0, 127.0), p(26.0, 127.01)] },
    { tags: { highway: "residential" }, geometry: [p(26.0, 127.01), p(26.005, 127.01), p(26.005, 127.0), p(26.0, 127.0)] },
  ];
  const g = buildGraph(ways);
  const east = localRoute(g, [127.0, 26.0], [127.01, 26.0]).routes[0];
  const west = localRoute(g, [127.01, 26.0], [127.0, 26.0]).routes[0];
  assert.ok(east.distance < 1100, "eastbound uses the one-way street");
  assert.ok(west.distance > 2000, "westbound must go around");
});

test("building tiles keep solid footprints only, compact, and are cached per tile", async (t) => {
  const dir = await folder(t);
  const calls = [];
  const square = (lat, lon) => [0, 1, 2, 3, 0].map((i) => ({ lat: lat + (i === 1 || i === 2 ? 0.0001 : 0) + 1e-9, lon: lon + (i >= 2 && i < 4 ? 0.0001 : 0) }));
  const service = createMapService({
    cacheDir: dir,
    fetcher: async (url) => {
      calls.push(String(url));
      const box = decodeURIComponent(String(url)).match(/way\(([\d.,-]+)\)/)[1].split(",").map(Number);
      return ok({
        elements: [
          { type: "way", id: 1 + box[0], tags: { building: "house", "building:levels": "2", source: "survey", addr: "x" }, geometry: square(box[0], box[1]) },
          { type: "way", id: 2 + box[0], tags: { building: "roof" }, geometry: square(box[0], box[1] + 0.001) },
          { type: "way", id: 3 + box[0], tags: { building: "yes", layer: "-1" }, geometry: square(box[0], box[1] + 0.002) },
        ],
      });
    },
  });
  const A = "26.200000,127.590000,26.210000,127.610000",
    B = "26.210000,127.590000,26.220000,127.610000";
  const q = (...boxes) => `[out:json][timeout:90];(${boxes.map((b) => `way(${b})[building];`).join("")});out geom;`;
  const data = await service.mapQuery(q(A, B));
  assert.equal(data.elements.length, 2);
  assert.deepEqual(Object.keys(data.elements[0].tags).sort(), ["building", "building:levels"]);
  assert.equal(data.elements[0].geometry[1].lat, 26.2001);
  assert.equal(calls.length, 2);
  await service.mapQuery(q(B));
  assert.equal(calls.length, 2);
  assert.ok((await service.packFiles("buildings:")).length === 2);
});
