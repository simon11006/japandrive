import { HIGHWAYS, isSolidBuilding } from "../map-core.mjs";
import { projection } from "../map-data.mjs";
import { insidePolygon } from "../simulation.mjs";
import { courseParking } from "../courses.mjs";
import { practiceRoute } from "./practice-route.mjs";

export function worldCourseRoute(area, source) {
  const proj = projection(area.origin);
  // Our current scenery has no surveyed clearance under buildings. Do not
  // route a player through an arcade, skybridge or mapped building footprint.
  const buildings = source.elements.filter(isSolidBuilding).map((e) => {
    const points = e.geometry.map((p) => proj.toLocal([p.lon, p.lat]));
    return {
      points,
      minX: Math.min(...points.map((p) => p.x)),
      maxX: Math.max(...points.map((p) => p.x)),
      minY: Math.min(...points.map((p) => p.y)),
      maxY: Math.max(...points.map((p) => p.y)),
    };
  });
  const occupied = (p) =>
    buildings.some(
      (b) =>
        p.x >= b.minX &&
        p.x <= b.maxX &&
        p.y >= b.minY &&
        p.y <= b.maxY &&
        insidePolygon(p, b.points),
    );
  const blocked = (points) => {
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        length = Math.hypot(b.x - a.x, b.y - a.y),
        steps = Math.max(1, Math.ceil(length / 2));
      for (let j = 0; j <= steps; j++)
        if (
          occupied({
            x: a.x + ((b.x - a.x) * j) / steps,
            y: a.y + ((b.y - a.y) * j) / steps,
          })
        )
          return true;
    }
    return false;
  };
  const roads = source.elements.filter(
    (e) =>
      e.type === "way" &&
      HIGHWAYS.has(e.tags?.highway) &&
      e.tags.area !== "yes" &&
      !["no", "private"].includes(e.tags.access) &&
      e.tags.tunnel !== "yes" &&
      !(Number(e.tags.layer) < 0) &&
      e.tags.junction !== "roundabout" &&
      !blocked(e.geometry.map((p) => proj.toLocal([p.lon, p.lat]))),
  );
  const parks = source.elements
    .filter(
      (e) =>
        e.type === "way" &&
        e.geometry?.length >= 4 &&
        e.tags?.amenity === "parking" &&
        !e.tags.building &&
        !["underground", "multi-storey", "rooftop"].includes(e.tags.parking) &&
        !["no", "private"].includes(e.tags.access),
    )
    .map((e) => {
      const points = e.geometry.map((p) => proj.toLocal([p.lon, p.lat]));
      const center = points.reduce(
        (p, q) => ({
          x: p.x + q.x / points.length,
          y: p.y + q.y / points.length,
        }),
        { x: 0, y: 0 },
      );
      const size = Math.abs(
        points.reduce((s, p, i) => {
          const q = points[(i + 1) % points.length];
          return s + p.x * q.y - p.y * q.x;
        }, 0) / 2,
      );
      return { e, center, size };
    })
    .filter((p) => p.size > 100 && p.size < 35000 && !occupied(p.center))
    .sort(
      (a, b) =>
        Math.hypot(a.center.x, a.center.y) - Math.hypot(b.center.x, b.center.y),
    );
  const urban = ["city", "urban"].includes(area.theme);
  for (const [i, park] of parks.entries()) {
    try {
      const bay = courseParking(
        {
          type: "area",
          polygon: park.e.geometry.map((p) => [p.lon, p.lat]),
          name: area.region,
        },
        proj,
      );
      if (bay.points.some(occupied)) continue;
      const route = practiceRoute(roads, proj.toGeo(park.center), {
        seed: 100 + i,
        min: area.theme === "village" ? 380 : 650,
        max: urban ? 1250 : 1500,
        turns: urban ? 2 : 1,
        straight: urban ? 180 : 260,
        radius: 1000,
      });
      const end = proj.toLocal(route.geometry.coordinates.at(-1));
      if (Math.hypot(end.x - park.center.x, end.y - park.center.y) > 85)
        continue;
      if (blocked([end, bay.center])) continue;
      return { route, parking: park.e };
    } catch {}
  }
  throw Error(
    `${area.id}: no connected varied route and surface parking in ${parks.length} candidates`,
  );
}
