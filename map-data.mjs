export const REGIONS = [
  { id: 'tokyo', name: '도쿄', english: 'TOKYO', origin: [139.767, 35.681], radius: 2500, description: '도쿄역 주변 · 반경 2.5km' },
  { id: 'fukuoka', name: '후쿠오카', english: 'FUKUOKA', origin: [130.4207, 33.5902], radius: 2500, description: '하카타 중심 · 반경 2.5km' },
  { id: 'okinawa', name: '오키나와 본섬', english: 'OKINAWA MAIN ISLAND', origin: [127.68, 26.214], bounds: [25.99, 127.58, 26.91, 128.4], description: '본섬 전체 · 남부 / 중부 / 북부', island: true },
];

export const TILE_SIZE = 2000;
export const ROAD_TAGS = '[highway~"^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|service|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"][area!=yes][access!~"^(private|no)$"][motor_vehicle!~"^(private|no)$"][motorcar!~"^(private|no)$"]';

export function projection(origin) {
  const scaleX = 111320 * Math.cos(origin[1] * Math.PI / 180);
  return {
    toLocal: ([lon, lat]) => ({ x: (lon - origin[0]) * scaleX, y: -(lat - origin[1]) * 111320 }),
    toGeo: ({ x, y }) => [origin[0] + x / scaleX, origin[1] - y / 111320],
  };
}

const ringIndexes = new WeakMap();
export function pointInRing([x, y], ring) {
  let index = ringIndexes.get(ring);
  if (!index) {
    const ys = ring.map(p => p[1]), xs = ring.map(p => p[0]);
    const bounds = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
    const buckets = Array.from({ length: 256 }, () => []);
    const bucketFor = y => Math.max(0, Math.min(255, Math.floor((y - bounds[1]) / (bounds[3] - bounds[1] || 1) * 256)));
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      for (let b = bucketFor(Math.min(ring[i][1], ring[j][1])); b <= bucketFor(Math.max(ring[i][1], ring[j][1])); b++) buckets[b].push([ring[i], ring[j]]);
    }
    index = { bounds, buckets, bucketFor };
    ringIndexes.set(ring, index);
  }
  if (x < index.bounds[0] || y < index.bounds[1] || x > index.bounds[2] || y > index.bounds[3]) return false;
  let inside = false;
  for (const [[ax, ay], [bx, by]] of index.buckets[index.bucketFor(y)]) {
    const cross = (x - ax) * (by - ay) - (y - ay) * (bx - ax);
    if (Math.abs(cross) < 1e-10 && x >= Math.min(ax, bx) && x <= Math.max(ax, bx) && y >= Math.min(ay, by) && y <= Math.max(ay, by)) return true;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
  }
  return inside;
}

export function sectionOf(lat) {
  return lat < 26.3 ? 'south' : lat < 26.55 ? 'central' : 'north';
}

export function poiQuery(region) {
  const scope = region.island ? `(${region.bounds.join(',')})` : `(around:${region.radius},${region.origin[1]},${region.origin[0]})`;
  return `[out:json][timeout:45];(nwr${scope}[tourism~"^(attraction|museum|viewpoint|zoo|theme_park)$"][name];nwr${scope}[historic~"^(castle|memorial|ruins)$"][name];nwr${scope}[amenity=restaurant][name];);out center;`;
}

export function normalizePois(data, ring) {
  const seen = new Set();
  return data.elements.flatMap(e => {
    const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !e.tags?.name || (ring && !pointInRing([lon, lat], ring))) return [];
    const name = e.tags['name:ko'] || e.tags.name;
    const duplicate = `${name}:${lat.toFixed(4)}:${lon.toFixed(4)}`;
    if (seen.has(duplicate)) return [];
    seen.add(duplicate);
    return [{ id: `${e.type}/${e.id}`, lat, lon, name, originalName: e.tags.name, kind: e.tags.amenity === 'restaurant' ? 'food' : 'sight', section: sectionOf(lat), tags: e.tags }];
  }).sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'ja'));
}

export function tileKeysNear(pos, radius = 850) {
  const keys = [];
  for (let x = Math.floor((pos.x - radius) / TILE_SIZE); x <= Math.floor((pos.x + radius) / TILE_SIZE); x++) {
    for (let y = Math.floor((pos.y - radius) / TILE_SIZE); y <= Math.floor((pos.y + radius) / TILE_SIZE); y++) keys.push(`${x}:${y}`);
  }
  return keys;
}

export function tileBounds(key, proj) {
  const [x, y] = key.split(':').map(Number);
  const [west, north] = proj.toGeo({ x: x * TILE_SIZE, y: y * TILE_SIZE });
  const [east, south] = proj.toGeo({ x: (x + 1) * TILE_SIZE, y: (y + 1) * TILE_SIZE });
  return [south, west, north, east];
}

export function roadQuery(keys, proj) {
  return `[out:json][timeout:45];(${keys.map(key => `way(${tileBounds(key, proj).join(',')})${ROAD_TAGS};`).join('')});out geom;`;
}

function segmentDistance(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

export class RoadStore {
  constructor(proj, fetcher, ring = null) {
    this.proj = proj;
    this.fetcher = fetcher;
    this.ring = ring;
    this.tiles = new Map();
    this.roads = [];
  }

  hasCoverage(pos, radius = 300) {
    return tileKeysNear(pos, radius).every(key => this.tiles.has(key));
  }

  async ensure(pos, signal) {
    const wanted = tileKeysNear(pos);
    const missing = wanted.filter(key => !this.tiles.has(key));
    if (!missing.length) return;
    const data = await this.fetcher(roadQuery(missing, this.proj), signal);
    this.ingest(missing,data,wanted);
  }

  seed(data,pos) {const keys=tileKeysNear(pos);this.ingest(keys,data,keys);}

  ingest(missing,data,wanted=missing) {
    const roads = data.elements.filter(e => e.type === 'way' && e.geometry?.length >= 2).flatMap(e => {
      // Clip segments against the real coast: nearby offshore islands must not
      // become drivable merely because they share a streaming tile.
      const pieces = [];
      let points = [];
      e.geometry.forEach(c => {
        if (!Number.isFinite(c.lon) || !Number.isFinite(c.lat)) return;
        if (!this.ring || pointInRing([c.lon, c.lat], this.ring)) points.push(this.proj.toLocal([c.lon, c.lat]));
        else { if (points.length > 1) pieces.push(points); points = []; }
      });
      if (points.length > 1) pieces.push(points);
      return pieces.map((points, i) => ({ id: `${e.id}:${i}`, points, tags: e.tags || {} }));
    });
    for (const key of missing) this.tiles.set(key, roads);
    // Keep a bounded amount of road geometry even during a long island trip.
    while (this.tiles.size > 36) {
      const oldest = [...this.tiles.keys()].find(key => !wanted.includes(key));
      if (!oldest) break;
      this.tiles.delete(oldest);
    }
    this.roads = [...new Map([...this.tiles.values()].flat().map(road => [road.id, road])).values()];
  }

  near(pos, radius = 750) {
    return this.roads.filter(road => road.points.some((p, i) => i && segmentDistance(pos, road.points[i - 1], p) < radius));
  }
}

export function validateRoute(data, ring = null) {
  const r = data.routes?.[0];
  if (data.code !== 'Ok' || !r || r.geometry?.coordinates?.length < 2 || !r.legs?.length) throw new Error('자동차 경로를 찾지 못했습니다. 출발지 또는 목적지를 바꿔 주세요.');
  if (r.legs.some(l => l.steps?.some(s => s.mode === 'ferry'))) throw new Error('배를 이용하는 경로입니다. 본섬 안의 다른 출발지·목적지를 선택해 주세요.');
  if (ring && r.geometry.coordinates.some(c => !pointInRing(c, ring))) throw new Error('자동차 경로에 본섬 밖 구간이 있습니다. 본섬 안의 다른 출발지·목적지를 선택해 주세요.');
  if (data.waypoints?.some(p => p.distance > 500)) throw new Error('시설과 자동차 도로가 500m 이상 떨어져 있습니다. 진입 위치를 검증한 뒤 이용해야 합니다.');
  return r;
}

export function routeProgress(points, pos, measuredDistance) {
  let best = { distance: Infinity, remaining: 0, index: 0, travelled:0 }, total = 0;
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  total = lengths.reduce((a, b) => a + b, 0);
  let travelled = 0;
  for (let i = 0; i < lengths.length; i++) {
    const a = points[i], b = points[i + 1], dx = b.x - a.x, dy = b.y - a.y;
    const t = Math.max(0, Math.min(1, ((pos.x - a.x) * dx + (pos.y - a.y) * dy) / (lengths[i] ** 2 || 1)));
    const distance = Math.hypot(pos.x - a.x - t * dx, pos.y - a.y - t * dy);
    if (distance < best.distance) best = { distance, remaining: total - travelled - t * lengths[i], index: i, travelled: travelled + t * lengths[i] };
    travelled += lengths[i];
  }
  const scale=Number.isFinite(measuredDistance)&&measuredDistance>0&&total>0?measuredDistance/total:1;
  return {...best,remaining:best.remaining*scale,travelled:best.travelled*scale};
}
