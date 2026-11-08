import { writeFile } from 'node:fs/promises';
const query = '[out:json][timeout:45];(way(26.677,127.874,26.689,127.89)[building];way(26.677,127.874,26.689,127.89)[amenity=parking];way(26.677,127.874,26.689,127.89)[amenity=parking_space];);out geom;';
const url = new URL('https://overpass-api.de/api/interpreter'); url.searchParams.set('data',query);
const response = await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'JapanDrivePrototype/0.2 (local preview)','Accept':'application/json'}});
if(!response.ok) throw new Error(`Scene request failed: ${response.status}`);
const data=await response.json(); if(data.remark) throw new Error(data.remark);
await writeFile(new URL('../data/preview-scene.json',import.meta.url),JSON.stringify(data));
console.log(JSON.stringify({buildings:data.elements.filter(e=>e.tags.building).length,parking:data.elements.filter(e=>e.tags.amenity==='parking').length,bays:data.elements.filter(e=>e.tags.amenity==='parking_space').length,timestamp:data.osm3s?.timestamp_osm_base}));
