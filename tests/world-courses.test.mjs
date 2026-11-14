import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  countryProfile,
  courseLocation,
  signalLensPositions,
} from "../country-profiles.mjs";
import { mappedSpeedLimit } from "../driving-rules.mjs";
import { approachMarkings } from "../road-markings.mjs";
import { t } from "../i18n.mjs";
import { projection } from "../map-data.mjs";
import { insidePolygon } from "../simulation.mjs";
import { sceneFeatures } from "../scene-features.mjs";
const catalog = JSON.parse(
  await readFile(
    new URL("../data/driving-courses.json", import.meta.url),
    "utf8",
  ),
);
test("overseas courses use southern-hemisphere survey roads and mapped surface parking", async () => {
  for (const c of catalog.courses.filter((c) => c.country !== "JP")) {
    const source = JSON.parse(
      await readFile(
        new URL(
          `../data/course-sources/${c.area}-geometry.json`,
          import.meta.url,
        ),
        "utf8",
      ),
    );
    const bundle = JSON.parse(
      await readFile(new URL("../" + c.bundle, import.meta.url), "utf8"),
    );
    assert.equal(bundle.country, c.country);
    assert.ok(c.origin[1] < 0);
    assert.equal(source.survey.country, c.country);
    const [w, s, e, n] = source.survey.bbox;
    assert.ok(
      c.origin[0] >= w &&
        c.origin[0] <= e &&
        c.origin[1] >= s &&
        c.origin[1] <= n,
    );
    assert.ok(
      source.elements.some(
        (e) => e.id === bundle.parking.osmId && e.tags.amenity === "parking",
      ),
    );
    const ids = new Set(
      source.elements.filter((e) => e.type === "way").map((e) => e.id),
    );
    assert.ok(bundle.roads.elements.every((e) => ids.has(e.id)));
    assert.ok(!/[가-힣]/.test(t(c.name, "en")), c.id);
    assert.ok(!/[가-힣]/.test(t(courseLocation(c), "en")), c.id);
    const p = projection(bundle.origin),
      buildings = sceneFeatures(bundle.scene, p).filter((f) => f.tags.building);
    const points = bundle.route.geometry.coordinates.map(p.toLocal);
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2));
      for (let k = 0; k <= n; k++) {
        const q = {
          x: a.x + ((b.x - a.x) * k) / n,
          y: a.y + ((b.y - a.y) * k) / n,
        };
        assert.ok(
          !buildings.some((f) => insidePolygon(q, f.points)),
          `${c.id}: route enters a solid building`,
        );
      }
    }
  }
});
test("country signal and stop treatments have correct lens order and distinct shapes", () => {
  assert.equal(t("5–7분", "en"), "5–7 min");
  assert.equal(t("코스", "en"), "Course");
  assert.deepEqual(
    signalLensPositions("JP").map((p) => p[1]),
    [0, 0, 0],
  );
  for (const code of ["AU", "NZ"]) {
    const lenses = signalLensPositions(code);
    assert.ok(lenses[2][1] > lenses[1][1] && lenses[1][1] > lenses[0][1]);
    assert.equal(countryProfile(code).stopShape, "octagon");
    assert.equal(countryProfile(code).stopText, "STOP");
  }
  assert.equal(countryProfile("JP").stopShape, "triangle");
  const approach = { heading: 0, width: 8, stop: { x: 0, y: 0 } };
  assert.equal(approachMarkings(approach, "parallel").crossing.length, 2);
  assert.ok(approachMarkings(approach).crossing.length > 2);
});
test("Japan statutory fallback never leaks into Australian or New Zealand courses", () => {
  const local = { highway: "residential", centreline: "no" };
  assert.equal(mappedSpeedLimit(local, 0, 0, "JP").value, 30);
  for (const code of ["AU", "NZ"]) {
    assert.equal(mappedSpeedLimit(local, 0, 0, code).value, null);
    assert.equal(
      mappedSpeedLimit({ ...local, maxspeed: "40" }, 0, 0, code).value,
      40,
    );
    assert.equal(
      mappedSpeedLimit(
        { ...local, "maxspeed:type": code + ":urban" },
        0,
        0,
        code,
      ).value,
      50,
    );
    assert.equal(
      mappedSpeedLimit(
        {
          ...local,
          "maxspeed:type": code + ":urban",
          "maxspeed:conditional": "40 @ school",
        },
        0,
        0,
        code,
      ).value,
      null,
    );
  }
});
