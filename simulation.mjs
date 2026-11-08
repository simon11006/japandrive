export const TAU = Math.PI * 2;
export const DIFFICULTIES = [
  { id: "easy", name: "쉬움", description: "여유 있는 도로", cars: 8 },
  { id: "normal", name: "보통", description: "일상적인 교통", cars: 28 },
  { id: "hard", name: "어려움", description: "도심처럼 밀집된 차량", cars: 80 },
];
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const headingBetween = (a, b) => Math.atan2(b.x - a.x, -(b.y - a.y));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const forward = (angle) => ({ x: Math.sin(angle), y: -Math.cos(angle) });
export function nearestOnSegment(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, distance: distance(p, point) };
}
export function roadWidth(tags = {}) {
  const known = parseFloat(tags.width),
    lanes = parseInt(tags.lanes, 10);
  return Number.isFinite(known)
    ? known
    : lanes
      ? lanes * 3
      : tags.highway === "service"
        ? 4.8
        : tags.oneway === "yes"
          ? 4
          : 7;
}
export function vehicleCorners(state, car, margin = 0) {
  const f = forward(state.heading),
    r = { x: Math.cos(state.heading), y: Math.sin(state.heading) };
  return [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ].map(([side, end]) => ({
    x: state.x + r.x * side * (car.width / 2 + margin) + f.x * end * (car.length / 2 + margin),
    y: state.y + r.y * side * (car.width / 2 + margin) + f.y * end * (car.length / 2 + margin),
  }));
}
export function insidePolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function bayFromGeo(data, project) {
  return data.spaces.map((s) => {
    const points = s.corners.map(project),
      center = points.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
    const entry = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    const rear = { x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 };
    return {
      ...s,
      points,
      center,
      entry,
      heading: headingBetween(entry, rear),
      width: distance(points[0], points[1]),
      length: distance(entry, rear),
    };
  });
}
export function parkingStatus(state, car, bay, heldSeconds = 0) {
  if (!bay) return { inside: false, aligned: false, stopped: false, complete: false };
  const inside = vehicleCorners(state, car).every((p) => insidePolygon(p, bay.points));
  const delta = Math.abs(wrapAngle(state.heading - (bay.heading || 0)));
  const angle = Math.min(delta, Math.PI - delta);
  const aligned = bay.type === "area" || angle < Math.PI / 18,
    stopped = state.speed < 0.1;
  const ready = inside && aligned && stopped && state.parkingBrake;
  return { inside, aligned, stopped, angle, ready, complete: ready && heldSeconds >= 2 };
}
// A move into an obstacle is undone. But when the car was already touching it
// (another car stopped against it, an approximate map footprint), only moves
// that bring it closer are undone, so the driver can always back or steer
// away instead of being stuck for good.
export function blocksMove(previous, next, obstacle, touchingBefore) {
  if (!touchingBefore) return true;
  return distance(next, obstacle) <= distance(previous, obstacle) + 1e-6;
}
export function rectanglesOverlap(a, carA, b, carB) {
  const ac = vehicleCorners(a, carA),
    bc = vehicleCorners(b, carB);
  for (const h of [a.heading, b.heading])
    for (const axis of [forward(h), { x: Math.cos(h), y: Math.sin(h) }]) {
      const av = ac.map((p) => p.x * axis.x + p.y * axis.y),
        bv = bc.map((p) => p.x * axis.x + p.y * axis.y);
      if (Math.max(...av) < Math.min(...bv) || Math.max(...bv) < Math.min(...av)) return false;
    }
  return true;
}
function hash(value) {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function signalPhase(signal, heading, time) {
  const phase = (time + (hash(signal.timingId ?? signal.id) % 66)) % 66;
  const axis = signal.axis ?? 0;
  const main = Math.abs(Math.cos(heading - axis)) > 0.707;
  const t = main ? phase : (phase + 33) % 66;
  return t < 27 ? "green" : t < 30 ? "yellow" : "red";
}
export function synchronizeSignals(signals) {
  const groups = [];
  for (const s of signals) {
    const related = groups.filter((g) => g.some((p) => distance(p, s) < 65));
    if (!related.length) groups.push([s]);
    else {
      const merged = [s, ...related.flat()];
      for (const g of related) groups.splice(groups.indexOf(g), 1);
      groups.push(merged);
    }
  }
  for (const g of groups) {
    const anchor = g.slice().sort((a, b) => Number(a.id) - Number(b.id))[0];
    for (const s of g) {
      s.timingId = anchor.id;
      s.axis = anchor.approachHeading ?? anchor.axis ?? 0;
    }
  }
  return signals;
}
export function reverseGuides(state, car, maxDistance = 5) {
  const tracks = [];
  let p = { x: state.x, y: state.y, heading: state.heading };
  for (let d = 0; d <= maxDistance + 0.001; d += 0.1) {
    const f = forward(p.heading),
      right = { x: Math.cos(p.heading), y: Math.sin(p.heading) },
      rear = { x: p.x - (f.x * car.length) / 2, y: p.y - (f.y * car.length) / 2 };
    tracks.push({
      distance: d,
      left: { x: rear.x - right.x * (car.width / 2 + 0.15), y: rear.y - right.y * (car.width / 2 + 0.15) },
      right: { x: rear.x + right.x * (car.width / 2 + 0.15), y: rear.y + right.y * (car.width / 2 + 0.15) },
    });
    const yaw = (-0.1 / car.wheelbase) * Math.tan(state.steer || 0),
      h = p.heading + yaw / 2;
    p.x -= Math.sin(h) * 0.1;
    p.y += Math.cos(h) * 0.1;
    p.heading += yaw;
  }
  return tracks;
}
export function buildRoadGraph(roads) {
  const nodes = new Map(),
    edges = [];
  const key = (p) => `${p.x.toFixed(1)}:${p.y.toFixed(1)}`;
  function node(p) {
    const k = key(p);
    if (!nodes.has(k)) nodes.set(k, { ...p, key: k, out: [] });
    return nodes.get(k);
  }
  for (const road of roads) {
    if (road.tags.highway === "service") continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = node(road.points[i - 1]),
        b = node(road.points[i]),
        length = distance(a, b);
      if (length < 0.3) continue;
      const add = (from, to) => {
        const edge = {
          id: edges.length,
          from,
          to,
          length,
          heading: headingBetween(from, to),
          width: roadWidth(road.tags),
          roadId: road.id,
        };
        edges.push(edge);
        from.out.push(edge);
      };
      if (road.tags.oneway !== "-1") add(a, b);
      if (!["yes", "1", "true"].includes(road.tags.oneway)) add(b, a);
    }
  }
  return { nodes, edges };
}
export class TrafficSimulation {
  constructor(roads, signals, start, count = 16) {
    this.graph = buildRoadGraph(roads);
    this.signals = signals;
    this.cars = [];
    this.serial = 1;
    this.origin = { ...start };
    this.targetCount = count;
    const candidates = this.graph.edges.filter(
      (e) => distance(e.from, start) < 420 && distance(e.from, start) > 18 && e.length > 5,
    );
    const score = (e) => distance(e.from, start) + (hash(e.roadId + ":" + e.id) % 75);
    const sorted = candidates.sort((a, b) => score(a) - score(b));
    const slots = sorted.flatMap((edge) => {
      const result = [{ edge, along: edge.length * 0.35 }];
      for (let d = 12; d < edge.length - 6; d += 11) result.push({ edge, along: d });
      return result;
    });
    for (let j = 0; j < slots.length && this.cars.length < count; j++) {
      const { edge, along } = slots[j],
        i = this.cars.length;
      const car = {
        id: i,
        edge,
        along,
        speed: 3 + (i % 4),
        desired: 6 + (i % 5),
        heading: edge.heading,
        x: 0,
        y: 0,
        length: i % 5 === 0 ? 4.9 : 4.3,
        width: i % 5 === 0 ? 1.85 : 1.72,
        kind: i % 5 === 0 ? "van" : "sedan",
        color: ["#f1efdf", "#c8d2d4", "#364f63", "#bf6251", "#dbdfdf"][i % 5],
        braking: false,
      };
      this.place(car);
      if (
        distance(car, start) < 480 &&
        distance(car, start) > 18 &&
        this.cars.every(
          (other) =>
            !rectanglesOverlap(car, { ...car, length: car.length + 4, width: car.width + 0.3 }, other, other),
        )
      )
        this.cars.push(car);
    }
  }
  recenter(roads, start) {
    if (distance(this.origin, start) < 180) return;
    const fresh = new TrafficSimulation(roads, this.signals, start, this.targetCount),
      kept = this.cars.filter((c) => distance(c, start) < 160);
    this.cars = kept;
    for (const candidate of fresh.cars) {
      if (this.cars.length >= this.targetCount) break;
      if (
        distance(candidate, start) < 105 ||
        this.cars.some((other) => rectanglesOverlap(candidate, candidate, other, other))
      )
        continue;
      candidate.id = "r" + this.serial++;
      this.cars.push(candidate);
    }
    this.graph = fresh.graph;
    this.origin = { ...start };
  }
  place(car) {
    const e = car.edge,
      t = car.along / e.length,
      offset = Math.min(1.65, e.width * 0.23);
    car.x = e.from.x + (e.to.x - e.from.x) * t - Math.cos(e.heading) * offset;
    car.y = e.from.y + (e.to.y - e.from.y) * t - Math.sin(e.heading) * offset;
    car.heading = e.heading;
  }
  // Pick the edge after `edge`: mostly straight on, sometimes a turn, never an
  // immediate U-turn unless the road ends. Deterministic per car and edge.
  chooseNext(car, edge) {
    const options = edge.to.out.filter((e) => e.to.key !== edge.from.key);
    if (!options.length) return edge.to.out.find((e) => e.to.key === edge.from.key) || null;
    if (options.length === 1) return options[0];
    const weighted = options.map((e) => {
      const turn = Math.abs(wrapAngle(e.heading - edge.heading));
      return { e, w: turn < 0.45 ? 5 : turn < 2.2 ? 1.6 : 0.2 };
    });
    let pick = (hash(car.id + ":" + edge.id + ":" + this.serial) % 1000) / 1000;
    const total = weighted.reduce((n, o) => n + o.w, 0);
    for (const o of weighted) {
      pick -= o.w / total;
      if (pick <= 0) return o.e;
    }
    return weighted.at(-1).e;
  }
  tick(dt, time, player) {
    const bodies = [...this.cars, player];
    for (const car of this.cars) {
      let target = car.desired;
      const f = forward(car.heading);
      for (const other of bodies) {
        if (other === car) continue;
        const dx = other.x - car.x,
          dy = other.y - car.y,
          ahead = dx * f.x + dy * f.y,
          lateral = Math.abs(dx * f.y - dy * f.x);
        // Keep a 2-second gap, never closer than about 6 m between centres.
        if (ahead > 0 && ahead < 30 && lateral < 2.1)
          target = Math.min(target, Math.max(0, (ahead - 6.5) / 2));
      }
      // Slow for the coming turn: about 15 km/h for a right angle.
      car.next ??= this.chooseNext(car, car.edge);
      const toEnd = car.edge.length - car.along;
      if (car.next && toEnd < 25) {
        const turn = Math.abs(wrapAngle(car.next.heading - car.edge.heading));
        if (turn > 0.35) target = Math.min(target, Math.max(3.6, 9 - turn * 3.4) + toEnd * 0.25);
      }
      for (const s of this.signals) {
        const dx = s.x - car.x,
          dy = s.y - car.y,
          ahead = dx * f.x + dy * f.y,
          lateral = Math.abs(dx * f.y - dy * f.x),
          // The stop line is drawn 5 m before the mapped signal point.
          toLine = ahead - 5 - car.length / 2;
        if (ahead <= 0 || ahead > 45 || lateral > 7 || toLine < -0.5) continue;
        const phase = signalPhase(s, car.heading, time);
        if (phase === "green") continue;
        // Yellow: stop only if a comfortable stop (≤3.5 m/s²) is still possible.
        if (phase === "yellow" && car.speed ** 2 / (2 * Math.max(0.1, toLine)) > 3.5) continue;
        target = Math.min(target, Math.sqrt(2 * 2.5 * Math.max(0, toLine - 0.5)));
      }
      car.braking = target < car.speed - 0.2;
      const speed = Math.max(0, car.speed + Math.max(-4.5 * dt, Math.min(1.4 * dt, target - car.speed)));
      // Never advance into another body (including the player's car).
      const probe = { ...car, x: car.x + f.x * speed * dt * 4, y: car.y + f.y * speed * dt * 4 };
      const hits = bodies.filter(
        (other) => other !== car && other.length && rectanglesOverlap(probe, car, other, other),
      );
      // Two AI cars nosed into each other at a junction would wait forever;
      // after 6 s the AI-only standoff is released. The player is never ignored.
      car.blockedFor = hits.length ? (car.blockedFor || 0) + dt : 0;
      const blocked = hits.includes(player) || (hits.length > 0 && car.blockedFor < 6);
      car.speed = blocked ? 0 : speed;
      if (blocked) car.braking = true;
      car.along += car.speed * dt;
      let guard = 0;
      while (car.along > car.edge.length && guard++ < 8) {
        car.along -= car.edge.length;
        const next = car.next ?? this.chooseNext(car, car.edge);
        car.next = null;
        if (!next) {
          car.along = car.edge.length - 0.1;
          car.speed = 0;
          break;
        }
        car.edge = next;
      }
      const previous = car.heading;
      this.place(car);
      // Bodies swing through the corner instead of snapping to the new edge.
      car.heading = previous + wrapAngle(car.heading - previous) * Math.min(1, (car.speed * dt) / 2.2 + 0.02);
    }
    this.serial++;
  }
}
