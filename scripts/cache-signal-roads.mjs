import {readFile,writeFile} from 'node:fs/promises';
import {projection,REGIONS,roadQuery,tileKeysNear} from '../map-data.mjs';
const data=JSON.parse(await readFile('data/training-routes.json','utf8')),route=data.routes.find(r=>r.name==='signals');
const proj=projection(REGIONS.find(r=>r.id==='okinawa').origin);
const query=roadQuery(tileKeysNear(proj.toLocal(route.data.routes[0].geometry.coordinates[0])),proj);
const response=await fetch('https://overpass-api.de/api/interpreter?'+new URLSearchParams({data:query}),{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'JapanDrive/0.3 (local prototype)',Accept:'application/json'}});
if(!response.ok)throw new Error(`Road request ${response.status}`);const roads=await response.json();if(roads.remark)throw new Error(roads.remark);
await writeFile('data/signal-roads.json',JSON.stringify({query,roads}));console.log(roads.elements.length+' mapped roads saved');
