import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../vendor/three.module.js";
import { makeCarModel, disposeCarModel } from "../car-model.mjs";
import { VEHICLES } from "../vehicles.mjs";

test("switching a car releases shared geometry, materials and instance buffers once", () => {
  const model = makeCarModel("alphard"),
    releases = new Map();
  model.userData.body.map = new T.Texture();
  const watch = (resource) => {
    if (!resource || releases.has(resource)) return;
    releases.set(resource, 0);
    resource.addEventListener("dispose", () =>
      releases.set(resource, releases.get(resource) + 1),
    );
  };
  model.traverse((o) => {
    watch(o.geometry);
    if (o.isInstancedMesh) watch(o);
    watch(o.material);
    watch(o.material?.map);
  });
  disposeCarModel(model);
  assert.ok(releases.size > 100);
  assert.ok([...releases.values()].every((n) => n === 1));
});

// These checks use visible surfaces and ray directions, rather than assuming
// every indexed mesh is a ring loft (windows now have real polygon openings).
test("swept Prius headlamps remain exposed above the curved bonnet", () => {
  const car = makeCarModel("prius");
  car.updateMatrixWorld(true);
  for (const x of [-0.7, 0.7]) {
    const hit = new T.Raycaster(
      new T.Vector3(x, 3, -1.95),
      new T.Vector3(0, -1, 0),
    ).intersectObject(car, true)[0];
    assert.equal(hit?.object.name, "prius-angular-headlight");
  }
});

for (const spec of VEHICLES) {
  const car = makeCarModel(spec.id);
  car.updateMatrixWorld(true);
  const shells = [];
  car.traverse((o) => {
    if (o.userData.exteriorShell) shells.push(o);
  });
  test(`${spec.id}: exterior has finite coordinates and a bounded geometry budget`, () => {
    let triangles = 0;
    car.traverse((o) => {
      if (!o.isMesh) return;
      for (const key of ["position", "normal", "uv"])
        for (const n of o.geometry.attributes[key]?.array || [])
          assert.ok(Number.isFinite(n), `${o.name}: invalid ${key}`);
      triangles +=
        ((o.geometry.index?.count || o.geometry.attributes.position.count) /
          3) *
        (o.isInstancedMesh ? o.count : 1);
    });
    assert.ok(
      triangles > 20000 && triangles < 100000,
      `${triangles} exterior triangles`,
    );
  });
  test(`${spec.id}: main body faces are visible from outside with backface culling`, () => {
    const probes = [
      [[3, 0.55, 0], [-1, 0, 0], "body-side-1"],
      [[-3, 0.55, 0], [1, 0, 0], "body-side--1"],
      [[0, 0.5, -4], [0, 0, 1], "front-bumper"],
      [[0, 0.5, 4], [0, 0, -1], "rear-bumper"],
      [[0, 3, 0], [0, -1, 0], "painted-roof"],
      [[0, 3, -1.8], [0, -1, 0], "body-deck"],
    ];
    for (const [origin, dir, name] of probes) {
      const hit = new T.Raycaster(
        new T.Vector3(...origin),
        new T.Vector3(...dir),
      ).intersectObjects(shells, false)[0];
      assert.equal(hit?.object.name, name, `${name} is opaque from outside`);
      assert.ok(
        hit.face.normal.dot(new T.Vector3(...dir)) < -0.1,
        `${name} faces outward`,
      );
      assert.equal(hit.object.material.side, T.FrontSide);
    }
  });
  test(`${spec.id}: dimensions, axle separation and tyre contact match the vehicle`, () => {
    const bounds = new T.Box3();
    for (const o of shells) bounds.union(new T.Box3().setFromObject(o));
    const size = bounds.getSize(new T.Vector3());
    assert.ok(Math.abs(size.z - spec.length) < 0.006);
    assert.ok(Math.abs(size.x - spec.width) < 0.006);
    assert.ok(Math.abs(bounds.max.y - spec.height) < 0.008);
    assert.equal(car.userData.wheels.length, 4);
    const front = car.userData.wheels.filter((o) => o.position.z < 0),
      rear = car.userData.wheels.filter((o) => o.position.z > 0);
    assert.ok(
      Math.abs(rear[0].position.z - front[0].position.z - spec.wheelbase) <
        1e-6,
    );
    for (const w of car.userData.wheels) {
      const tyre = w.getObjectByName("rounded-tyre"),
        b = new T.Box3().setFromObject(tyre);
      assert.ok(Math.abs(b.min.y) < 0.001, "tyres rest on y=0");
    }
    assert.equal(car.userData.mirrors.length, 2);
    assert.ok(
      car.userData.mirrors.every(
        (o) => Math.abs(o.position.x) > spec.width / 2,
      ),
    );
  });
  test(`${spec.id}: side-window centres are not covered by painted cabin panels`, () => {
    const panes = [];
    car.traverse((o) => {
      if (o.name.startsWith("side-window-")) panes.push(o);
    });
    assert.equal(panes.length, 6);
    for (const pane of panes) {
      const p = pane.geometry.attributes.position,
        c = new T.Vector3();
      for (let i = 0; i < p.count; i++)
        c.add(new T.Vector3().fromBufferAttribute(p, i));
      c.divideScalar(p.count);
      const dir = new T.Vector3(-Math.sign(c.x), 0, 0),
        origin = c.clone().addScaledVector(dir, -0.2);
      const hit = new T.Raycaster(origin, dir, 0, 0.4).intersectObject(
        car,
        true,
      )[0];
      assert.equal(
        hit?.object,
        pane,
        `${pane.name} is exposed through its opening`,
      );
    }
  });
  test(`${spec.id}: rear glass and lamp garnish stay in front of the painted tailgate`, () => {
    const name =
        spec.id === "prius" ? "prius-lower-hatch-glass" : "rear-black-garnish",
      y = spec.id === "prius" ? 1.03 : 1.15;
    const hit = new T.Raycaster(
      new T.Vector3(0.15, y, 4),
      new T.Vector3(0, 0, -1),
    ).intersectObject(car, true)[0];
    assert.equal(hit?.object.name, name);
  });
}
