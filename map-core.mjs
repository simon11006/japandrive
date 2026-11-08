// Map logic shared by the game server (map-service.mjs) and the browser's
// direct mode (direct-map.mjs). No Node.js imports here.
export const HIGHWAYS = new Set(
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
