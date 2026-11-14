import test from "node:test";
import assert from "node:assert/strict";
import * as T from "../vendor/three.module.js";
import { buildCockpit } from "../cockpit.mjs";
import { VEHICLES } from "../vehicles.mjs";
// Geometry can be checked without a GPU; visual appearance is checked in-browser.
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
globalThis.document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => context }),
};
for (const car of VEHICLES)
  test(`${car.id}: cockpit geometry is finite and all three mirror feeds fill their glass UVs`, () => {
    const parent = new T.Group(),
      cockpit = buildCockpit({
        parent,
        car,
        navTexture: new T.Texture(),
        meterTexture: new T.Texture(),
      });
    let vertices = 0;
    parent.traverse((o) => {
      if (!o.isMesh) return;
      for (const name of ["position", "normal"]) {
        const a = o.geometry.getAttribute(name);
        if (a)
          for (const value of a.array)
            assert.ok(
              Number.isFinite(value),
              `${name} contains an invalid coordinate`,
            );
      }
      vertices += o.geometry.attributes.position.count;
    });
    assert.ok(vertices > 10000);
    assert.equal(cockpit.mirrors.length, 3);
    for (const m of cockpit.mirrors) {
      const uv = m.plane.geometry.attributes.uv;
      const values = [...uv.array];
      assert.ok(values.every((v) => v >= -0.001 && v <= 1.001));
      assert.ok(Math.max(...values) > 0.9);
      assert.ok(Math.min(...values) < 0.1);
    }
    assert.notEqual(cockpit.navigation.parent, cockpit.root);
    assert.equal(cockpit.navigationAnchor.z, cockpit.layout.screenZ);
    if (car.id === "prius") {
      assert.ok(
        cockpit.meter.position.x < cockpit.wheel.position.x - 0.25,
        "the supplied Prius has a central instrument cluster",
      );
      assert.ok(
        parent.getObjectByName("prius-white-gear-panel"),
        "the supplied Prius has a white fascia-mounted shifter panel",
      );
      assert.ok(parent.getObjectByName("prius-vertical-center-stack"));
    } else
      assert.ok(
        parent.getObjectByName("integrated-climate-controls"),
        "Alphard climate controls are below the map in the same centre panel",
      );
  });
