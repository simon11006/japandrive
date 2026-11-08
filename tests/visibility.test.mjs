import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../vendor/three.module.js";
import { buildCockpit } from "../cockpit.mjs";
import { VEHICLES } from "../vehicles.mjs";
import { driverEye, viewSettings, horizontalFov, GLANCE } from "../driver-view.mjs";

const context = new Proxy(
  {},
  {
    get: (_o, key) =>
      key === "measureText"
        ? () => ({ width: 10 })
        : key === "createLinearGradient"
          ? () => ({ addColorStop: () => {} })
          : () => {},
    set: () => true,
  },
);
globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => context }) };

// Fraction of a mirror's glass that the driver can see, ray-cast from the eye
// point against every opaque cockpit mesh.
export function mirrorVisibility(car, side, settings = viewSettings()) {
  const parent = new T.Group(),
    cockpit = buildCockpit({ parent, car, navTexture: new T.Texture(), meterTexture: new T.Texture() });
  parent.updateMatrixWorld(true);
  const mirror = cockpit.mirrors.find((m) => m.side === side),
    eye = driverEye(car, cockpit.layout, settings),
    blockers = [];
  parent.traverse((o) => {
    if (!o.isMesh || o === mirror.plane) return;
    const materials = [o.material].flat();
    if (materials.every((m) => m.transparent && m.opacity < 0.2)) return;
    let p = o;
    while (p) {
      if (p === mirror.plane.parent && p.userData.mirrorHousing) return;
      p = p.parent;
    }
    blockers.push(o);
  });
  const ray = new T.Raycaster(),
    point = new T.Vector3(),
    samples = [];
  // 11 × 7 grid over the inner 80 % × 70 % of the glass.
  for (let i = 0; i <= 10; i++)
    for (let j = 0; j <= 6; j++)
      samples.push([(i / 10 - 0.5) * 0.8 * mirror.width, (j / 6 - 0.5) * 0.7 * mirror.height]);
  let seen = 0,
    total = 0;
  for (const [x, y] of samples) {
    point.set(x, y, 0);
    mirror.plane.localToWorld(point);
    const direction = point.clone().sub(eye),
      length = direction.length();
    ray.set(eye, direction.normalize());
    ray.far = length - 0.01;
    total++;
    if (!ray.intersectObjects(blockers, false).length) seen++;
  }
  // Angle of the mirror centre from straight ahead (positive = right).
  const centre = new T.Vector3();
  mirror.plane.getWorldPosition(centre);
  const angle = (Math.atan2(centre.x - eye.x, -(centre.z - eye.z)) * 180) / Math.PI;
  return { visible: seen / total, angle };
}

for (const car of VEHICLES)
  for (const side of [-1, 1])
    test(`${car.id}: ${side > 0 ? "right (driver-side)" : "left"} door mirror is not hidden by the A-pillar`, () => {
      const { visible } = mirrorVisibility(car, side);
      assert.ok(visible > 0.92, `only ${(visible * 100).toFixed(0)}% of the mirror glass is visible`);
    });

for (const car of VEHICLES)
  test(`${car.id}: driver-side mirror is on screen; the far mirror is one glance away`, () => {
    const fov = horizontalFov(viewSettings(), 16 / 9),
      glance = (GLANCE * 180) / Math.PI;
    const right = mirrorVisibility(car, 1),
      left = mirrorVisibility(car, -1);
    assert.ok(right.angle < fov / 2 - 4, `driver-side mirror at ${right.angle.toFixed(1)}° is off a ${fov}° view`);
    assert.ok(-left.angle < fov / 2 + glance - 8, `far mirror at ${left.angle.toFixed(1)}° is not reached by Q`);
  });

for (const car of VEHICLES)
  test(`${car.id}: mirrors stay mostly clear across the whole seat adjustment range`, () => {
    for (const seatForward of [-0.1, 0.12])
      for (const seatHeight of [-0.06, 0.08])
        for (const side of [-1, 1]) {
          const { visible } = mirrorVisibility(car, side, viewSettings({ seatForward, seatHeight }));
          assert.ok(visible > 0.75, `seat ${seatForward}/${seatHeight}: ${(visible * 100).toFixed(0)}% visible`);
        }
  });

test("view settings are clamped to safe, realistic ranges", () => {
  const s = viewSettings({ fov: 400, seatForward: -9, seatHeight: 3 });
  assert.ok(s.fov <= 100 && s.fov >= 60);
  assert.ok(Math.abs(s.seatForward) <= 0.12 && Math.abs(s.seatHeight) <= 0.08);
});
