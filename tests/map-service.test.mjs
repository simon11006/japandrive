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
      return calls.length === 1 ? { ok: false, status: 503 } : ok(route);
    },
  });
  const first = await one.route("127,26", "127.01,26.01");
  assert.equal(calls.length, 2);
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
