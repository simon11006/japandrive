import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  REGIONS,
  projection,
  pointInRing,
  normalizePois,
  poiQuery,
  tileKeysNear,
  RoadStore,
  validateRoute,
  routeProgress,
} from "../map-data.mjs";
import { VEHICLES, steeringLimit, minimumRearRadius, integrateVehicle } from "../vehicles.mjs";
import { sceneFeatures } from "../scene-features.mjs";
const boundary = JSON.parse(
  await readFile(new URL("../data/okinawa-main-island.geojson", import.meta.url), "utf8"),
);
const ring = boundary.geometry.coordinates[0];
const region = REGIONS.find((r) => r.id === "okinawa");
const proj = projection(region.origin);

test("main island covers southern Naha and Cape Hedo, excluding offshore islands", () => {
  assert.equal(pointInRing([127.68, 26.214], ring), true);
  assert.equal(pointInRing([128.25, 26.868], ring), true);
  const southernCoast = ring.reduce((a, b) => (a[1] < b[1] ? a : b));
  assert.ok(southernCoast[1] < 26.08);
  assert.equal(pointInRing(southernCoast, ring), true);
  assert.equal(pointInRing([128.0241612, 26.7001292], ring), false); // Kouri: explicit document extension only
  assert.equal(pointInRing([127.803, 26.716], ring), false); // Ie island
  assert.equal(pointInRing([124.15, 24.34], ring), false); // Ishigaki
});
test("POI search covers entire island and northern records survive filtering", () => {
  assert.match(poiQuery(region), /25.99,127.58,26.91,128.4/);
  assert.doesNotMatch(poiQuery(region), /around:2500/);
  const pois = normalizePois(
    {
      elements: [
        {
          type: "node",
          id: 1,
          lat: 26.868,
          lon: 128.25,
          tags: { name: "Northern destination", tourism: "viewpoint" },
        },
        {
          type: "node",
          id: 2,
          lat: 26.7,
          lon: 128.024,
          tags: { name: "Offshore destination", tourism: "viewpoint" },
        },
      ],
    },
    ring,
  );
  assert.deepEqual(
    pois.map((p) => p.id),
    ["node/1"],
  );
});
test("projection round-trips north tip and supports streaming beyond Naha", () => {
  for (const geo of [
    [127.68, 26.214],
    [128.25, 26.868],
    [127.8836, 26.6822],
  ]) {
    const actual = proj.toGeo(proj.toLocal(geo));
    assert.ok(Math.abs(actual[0] - geo[0]) < 1e-9 && Math.abs(actual[1] - geo[1]) < 1e-9);
  }
  assert.ok(
    !tileKeysNear(proj.toLocal([128.25, 26.868])).some((k) => tileKeysNear({ x: 0, y: 0 }).includes(k)),
  );
});
test("road streaming loads new tiles for a long trip and caches local requests", async () => {
  let calls = 0;
  const store = new RoadStore(proj, async () => {
    calls++;
    return {
      elements: [
        {
          type: "way",
          id: calls,
          geometry: [
            { lon: 127.68, lat: 26.214 },
            { lon: 127.681, lat: 26.215 },
          ],
          tags: { highway: "residential" },
        },
      ],
    };
  });
  await store.ensure({ x: 0, y: 0 });
  await store.ensure({ x: 0, y: 0 });
  assert.equal(calls, 1);
  const north = proj.toLocal([128.25, 26.868]);
  await store.ensure(north);
  assert.equal(calls, 2);
  assert.equal(store.hasCoverage(north), true);
  assert.equal(store.roads.length, 2);
});
test("failed road requests do not mark missing geography as loaded", async () => {
  const store = new RoadStore(proj, async () => {
    throw new Error("network");
  });
  await assert.rejects(store.ensure({ x: 0, y: 0 }));
  assert.equal(store.hasCoverage({ x: 0, y: 0 }), false);
});
test("routing rejects failures and ferries rather than drawing synthetic shortcuts", () => {
  assert.throws(() => validateRoute({ code: "NoRoute" }));
  assert.throws(
    () =>
      validateRoute({
        code: "Ok",
        routes: [
          {
            geometry: {
              coordinates: [
                [127.7, 26.2],
                [127.8, 26.3],
              ],
            },
            legs: [{ steps: [{ mode: "ferry" }] }],
          },
        ],
      }),
    /배/,
  );
});
test("remaining distance follows winding roads instead of the straight-line distance", () => {
  const p = routeProgress(
    [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
    ],
    { x: 40, y: 5 },
  );
  assert.equal(p.remaining, 160);
  assert.equal(p.distance, 5);
  assert.equal(p.travelled, 40);
});
test("two vehicles retain Toyota sizes and reproduce the specified outer-wheel radius", () => {
  assert.deepEqual(
    VEHICLES.map((v) => [v.length, v.width, v.wheelbase]),
    [
      [4.54, 1.76, 2.7],
      [4.995, 1.85, 3],
    ],
  );
  for (const v of VEHICLES) {
    const rear = v.wheelbase / Math.tan(steeringLimit(v));
    assert.ok(Math.abs(Math.hypot(rear + v.frontTrack / 2, v.wheelbase) - v.turningRadius) < 1e-10);
    assert.ok(Math.abs(rear - minimumRearRadius(v)) < 1e-10);
  }
});
test("reverse turns and travels in the opposite direction and braking stops the car", () => {
  const base = { x: 0, y: 0, heading: 0, speed: 1, steer: steeringLimit(VEHICLES[0]), gear: 1 };
  const input = { gas: false, brake: false, steer: 1 };
  const forward = integrateVehicle(base, input, VEHICLES[0], 0.1),
    reverse = integrateVehicle({ ...base, gear: -1 }, input, VEHICLES[0], 0.1);
  assert.ok(forward.y < 0 && reverse.y > 0);
  assert.ok(forward.heading > 0 && reverse.heading < 0);
  assert.equal(integrateVehicle(base, { ...input, brake: true }, VEHICLES[0], 1).speed, 0);
});

test("street scene uses recorded geometry without inventing building heights or parking bays", async () => {
  const data = JSON.parse(await readFile(new URL("../data/preview-scene.json", import.meta.url), "utf8"));
  const features = sceneFeatures(data, proj);
  assert.equal(features.filter((f) => f.tags.building).length, 120);
  assert.equal(features.filter((f) => f.tags.amenity === "parking").length, 8);
  assert.equal(features.filter((f) => f.tags.amenity === "parking_space").length, 0);
  assert.equal(features.find((f) => f.id === 1209839555).height, null); // Canphou has floor count, not measured height
  assert.ok(features.every((f) => f.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))));
});
