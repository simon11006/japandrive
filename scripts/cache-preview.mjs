import { writeFile } from 'node:fs/promises';
import { projection, tileKeysNear, roadQuery, REGIONS } from '../map-data.mjs';

async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), headers: { Accept: 'application/json', 'User-Agent': 'JapanDrivePrototype/0.2 (local preview)' } });
  if (!response.ok) throw new Error(`${response.status}: ${(await response.text()).slice(0,300)}`);
  const data = await response.json(); if (data.remark) throw new Error(data.remark); return data;
}
// Public OSM POI coordinates checked against the bundled named-place records.
const start = '127.880073,26.6840203', end = '127.8836023,26.6821952';
const routeUrl = new URL(`https://router.project-osrm.org/route/v1/driving/${start};${end}`);
routeUrl.search = 'overview=full&geometries=geojson&steps=true';
const route = await get(routeUrl); if (route.code !== 'Ok') throw new Error(route.code);
console.log(`Real route: ${route.routes[0].distance} m`);
const proj = projection(REGIONS.find(r => r.id === 'okinawa').origin);
const query = roadQuery(tileKeysNear(proj.toLocal(route.routes[0].geometry.coordinates[0])), proj);
const roadsUrl = new URL('https://overpass-api.de/api/interpreter'); roadsUrl.searchParams.set('data', query);
const roads = await get(roadsUrl);
const cache = { timestamp: new Date().toISOString(), attribution: '© OpenStreetMap contributors / OSRM. ODbL 1.0.', start, end, route, query, roads };
await writeFile(new URL('../data/preview-cache.json', import.meta.url), JSON.stringify(cache));
console.log(`Real road geometry saved: ${roads.elements.length} ways`);
