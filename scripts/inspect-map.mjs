import { writeFile, mkdir } from 'node:fs/promises';
import { REGIONS, poiQuery } from '../map-data.mjs';
const mode = process.argv[2] || 'coastlines';
const query = mode === 'destinations' ? '[out:json][timeout:45];(nwr(25.99,127.58,26.91,128.4)[tourism~"hotel|aquarium"];nwr(25.99,127.58,26.91,128.4)["name"~"Canphou|カンフ|カンプ|アクアパレス|Aqua Palace|美ら海水族館|海邦丸|Boo|BOO|ブー|みね|峰|うない|御庭|イーアス|アメリカン|American Village|おんなの駅|許田|ユーアイ|ポーたま|那覇空港|古宇利ビーチ|知念岬|玉泉洞",i];);out center;' : mode === 'pois' ? poiQuery(REGIONS.find(r => r.id === 'okinawa')) : '[out:json][timeout:45];way[natural=coastline](25.99,127.58,26.91,128.4);out geom;';
const response = await fetch((process.env.OVERPASS_ENDPOINT || 'https://overpass-api.de/api/interpreter') + '?' + new URLSearchParams({ data: query }), {
  headers: { 'User-Agent': 'JapanDrivePrototype/0.1 (local development)', 'Accept': 'application/json' },
  signal: AbortSignal.timeout(60000),
});
console.log(response.status);
if (!response.ok) throw new Error(await response.text());
const data = await response.json();
await mkdir('data', { recursive: true });
await writeFile(mode === 'destinations' ? 'data/okinawa-extra-pois.json' : mode === 'pois' ? 'data/okinawa-pois.json' : 'data/okinawa-coastlines.raw.json', JSON.stringify(data));
console.log(JSON.stringify({ways:data.elements.length,timestamp:data.osm3s?.timestamp_osm_base}));
