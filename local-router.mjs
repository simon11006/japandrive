// Built-in car router over OpenStreetMap roads (from the offline map pack).
// With hundreds of players, depending on a free public routing server is the
// weak point: it limits requests per address. This router answers on the
// game server itself, in the same shape as an OSRM response, so the game
// needs no outside service once the island's roads have been downloaded.
// It respects one-way streets and road speeds; it does not know turn bans,
// so where those matter the instructions are approximate.

const SPEED = {
  motorway: 80,
  motorway_link: 40,
  trunk: 60,
  trunk_link: 40,
  primary: 50,
  primary_link: 40,
  secondary: 40,
  secondary_link: 30,
  tertiary: 40,
  tertiary_link: 30,
  unclassified: 30,
  residential: 30,
  living_street: 15,
  service: 15,
};
const R = 6371008.8,
  rad = Math.PI / 180;
export function metres(a, b) {
  const x = (b.lon - a.lon) * rad * Math.cos(((a.lat + b.lat) / 2) * rad),
    y = (b.lat - a.lat) * rad;
  return Math.hypot(x, y) * R;
}
function bearing(a, b) {
  const x = (b.lon - a.lon) * Math.cos(((a.lat + b.lat) / 2) * rad),
    y = b.lat - a.lat;
  return (Math.atan2(x, y) * 180) / Math.PI;
}
const wrap = (d) => ((((d + 180) % 360) + 360) % 360) - 180;

export function buildGraph(ways) {
  const index = new Map(),
    nodes = [],
    edges = [],
    names = [];
  const node = (p) => {
    const key = p.lat.toFixed(7) + "," + p.lon.toFixed(7);
    let id = index.get(key);
    if (id == null) {
      id = nodes.length;
      index.set(key, id);
      nodes.push({ lat: p.lat, lon: p.lon, out: [] });
    }
    return id;
  };
  for (const w of ways) {
    const t = w.tags || {},
      speed = parseFloat(t.maxspeed) || SPEED[t.highway];
    if (!speed || t.area === "yes" || ["private", "no"].includes(t.access) || ["private", "no"].includes(t.motor_vehicle))
      continue;
    const geometry = w.geometry || [];
    if (geometry.length < 2) continue;
    const oneway = ["yes", "1", "true"].includes(t.oneway) || (/^motorway/.test(t.highway) && t.oneway !== "no"),
      reverse = t.oneway === "-1",
      way = names.length;
    names.push(t.name || t.ref || "");
    for (let i = 1; i < geometry.length; i++) {
      const a = node(geometry[i - 1]),
        b = node(geometry[i]),
        d = metres(nodes[a], nodes[b]);
      if (!d) continue;
      const cost = d / ((speed * 1000) / 3600);
      if (!reverse) nodes[a].out.push(edges.push({ from: a, to: b, d, cost, way }) - 1);
      if (!oneway) nodes[b].out.push(edges.push({ from: b, to: a, d, cost, way }) - 1);
    }
  }
  // Coarse grid for snapping a coordinate to the nearest node.
  const grid = new Map(),
    cell = (lat, lon) => Math.floor(lat / 0.005) + ":" + Math.floor(lon / 0.005);
  nodes.forEach((n, i) => {
    if (!n.out.length) return;
    const k = cell(n.lat, n.lon);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  return { nodes, edges, names, grid, cell };
}

export function snap(graph, lat, lon, limit = 250) {
  let best = -1,
    bestD = limit;
  const r = Math.floor(lat / 0.005),
    c = Math.floor(lon / 0.005);
  for (let i = r - 1; i <= r + 1; i++)
    for (let j = c - 1; j <= c + 1; j++)
      for (const id of graph.grid.get(i + ":" + j) || []) {
        const d = metres({ lat, lon }, graph.nodes[id]);
        if (d < bestD) {
          bestD = d;
          best = id;
        }
      }
  return best;
}

// Binary heap keyed by f-score.
class Heap {
  constructor() {
    this.a = [];
  }
  push(id, f) {
    const a = this.a;
    a.push([f, id]);
    let i = a.length - 1;
    while (i) {
      const p = (i - 1) >> 1;
      if (a[p][0] <= a[i][0]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop() {
    const a = this.a,
      top = a[0],
      last = a.pop();
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1,
          r = l + 1;
        let m = i;
        if (l < a.length && a[l][0] < a[m][0]) m = l;
        if (r < a.length && a[r][0] < a[m][0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]];
        i = m;
      }
    }
    return top[1];
  }
  get size() {
    return this.a.length;
  }
}

function modifierFor(turn) {
  const a = Math.abs(turn),
    side = turn > 0 ? "right" : "left";
  if (a < 20) return "straight";
  if (a < 60) return "slight " + side;
  if (a < 140) return side;
  return "sharp " + side;
}

// start / end: [lon, lat]. Returns an OSRM-shaped response or null.
export function localRoute(graph, start, end) {
  const s = snap(graph, start[1], start[0]),
    t = snap(graph, end[1], end[0]);
  if (s < 0 || t < 0) return null;
  const { nodes, edges } = graph,
    goal = nodes[t],
    g = new Map([[s, 0]]),
    via = new Map(),
    open = new Heap(),
    h = (id) => metres(nodes[id], goal) / (80 / 3.6);
  open.push(s, h(s));
  let found = s === t,
    steps = 0;
  while (open.size && !found && steps++ < 2_000_000) {
    const u = open.pop();
    if (u === t) {
      found = true;
      break;
    }
    const gu = g.get(u);
    for (const e of nodes[u].out) {
      const edge = edges[e],
        cost = gu + edge.cost;
      if (cost < (g.get(edge.to) ?? Infinity)) {
        g.set(edge.to, cost);
        via.set(edge.to, e);
        open.push(edge.to, cost + h(edge.to));
      }
    }
  }
  if (!found) return null;
  const path = [];
  for (let n = t; n !== s; n = edges[via.get(n)].from) path.unshift(via.get(n));
  const coordinates = [[nodes[s].lon, nodes[s].lat], ...path.map((e) => [nodes[edges[e].to].lon, nodes[edges[e].to].lat])];
  const distance = path.reduce((n, e) => n + edges[e].d, 0),
    duration = path.reduce((n, e) => n + edges[e].cost, 0);
  // Manoeuvres: where the road changes, or the path bends sharply.
  const out = [];
  const name = (e) => graph.names[edges[e].way];
  let segStart = 0;
  const pushStep = (type, modifier, at, from, to) => {
    const seg = path.slice(from, to);
    out.push({
      maneuver: { type, modifier, location: coordinates[at] },
      name: seg.length ? name(seg[0]) : "",
      distance: seg.reduce((n, e) => n + edges[e].d, 0),
      duration: seg.reduce((n, e) => n + edges[e].cost, 0),
      mode: "driving",
    });
  };
  const turns = [];
  for (let i = 1; i < path.length; i++) {
    const a = edges[path[i - 1]],
      b = edges[path[i]],
      turn = wrap(bearing(nodes[b.from], nodes[b.to]) - bearing(nodes[a.from], nodes[a.to])),
      changed = a.way !== b.way && name(path[i - 1]) !== name(path[i]);
    if (Math.abs(turn) >= 40 || (changed && Math.abs(turn) >= 20)) turns.push({ i, turn });
  }
  pushStep("depart", undefined, 0, 0, turns[0]?.i ?? path.length);
  turns.forEach((tn, k) => pushStep("turn", modifierFor(tn.turn), tn.i, tn.i, turns[k + 1]?.i ?? path.length));
  out.push({ maneuver: { type: "arrive", location: coordinates.at(-1) }, name: "", distance: 0, duration: 0, mode: "driving" });
  return {
    code: "Ok",
    provider: "local",
    routes: [{ distance, duration, geometry: { type: "LineString", coordinates }, legs: [{ distance, duration, steps: out }] }],
    waypoints: [{ location: coordinates[0] }, { location: coordinates.at(-1) }],
  };
}
