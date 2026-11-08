import { readFile, writeFile } from 'node:fs/promises';
import { pointInRing } from '../map-data.mjs';

const data = JSON.parse(await readFile(new URL('../data/okinawa-coastlines.raw.json', import.meta.url), 'utf8'));
const ways = data.elements.filter(e => e.geometry?.length > 1);
const starts = new Map();
ways.forEach((way, i) => {
  const key = way.nodes[0];
  if (!starts.has(key)) starts.set(key, []);
  starts.get(key).push(i);
});
const used = new Set(), rings = [];
for (let i = 0; i < ways.length; i++) {
  if (used.has(i)) continue;
  const first = ways[i].nodes[0];
  let next = i, ring = [], closed = false;
  while (next !== undefined && !used.has(next)) {
    const way = ways[next];
    used.add(next);
    ring.push(...way.geometry.slice(ring.length ? 1 : 0).map(p => [p.lon, p.lat]));
    const last = way.nodes.at(-1);
    if (last === first) { closed = true; break; }
    next = starts.get(last)?.find(index => !used.has(index));
  }
  if (closed) rings.push(ring);
}
const candidates = rings.filter(ring => pointInRing([127.68, 26.214], ring));
if (candidates.length !== 1) throw new Error(`Expected one mainland ring, found ${candidates.length}. Refusing to create an approximate boundary.`);
const ring = candidates[0];
const bounds = ring.reduce((b, [lon, lat]) => [Math.min(b[0], lat), Math.min(b[1], lon), Math.max(b[2], lat), Math.max(b[3], lon)], [90, 180, -90, -180]);
const feature = {
  type: 'Feature',
  properties: {
    name: '沖縄本島 / Okinawa Main Island',
    source: 'OpenStreetMap natural=coastline, assembled by shared node IDs; ring containing Naha',
    attribution: '© OpenStreetMap contributors',
    license: 'ODbL 1.0',
    licenseUrl: 'https://www.openstreetmap.org/copyright',
    timestamp: data.osm3s.timestamp_osm_base,
    queryBounds: [25.99, 127.58, 26.91, 128.4],
    bounds,
  },
  geometry: { type: 'Polygon', coordinates: [ring] },
};
await writeFile(new URL('../data/okinawa-main-island.geojson', import.meta.url), JSON.stringify(feature));
console.log(JSON.stringify({vertices:ring.length,bounds,rings:rings.length,timestamp:feature.properties.timestamp}));
