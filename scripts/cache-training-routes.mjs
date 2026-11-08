import {readFile,writeFile} from 'node:fs/promises';
import {projection,REGIONS} from '../map-data.mjs';
import {bayFromGeo,distance,nearestOnSegment} from '../simulation.mjs';
const p=projection(REGIONS.find(r=>r.id==='okinawa').origin),parking=JSON.parse(await readFile('data/parking-sites.json','utf8'));
const bay=bayFromGeo(parking,p.toLocal)[1],end=p.toGeo(bay.center);
const routes=[];
for(const [name,start] of [['coast',[127.880073,26.6840203]],['signals',[127.89235,26.67734]]]) {
 const url=new URL(`https://router.project-osrm.org/route/v1/driving/${start.join(',')};${end.join(',')}`);url.search='overview=full&geometries=geojson&steps=true';
 const response=await fetch(url,{signal:AbortSignal.timeout(40000)});if(!response.ok)throw new Error(`${response.status}`);const data=await response.json();if(data.code!=='Ok')throw new Error(data.code);
 routes.push({name,start,end,data});console.log(name,data.routes[0].distance, data.routes[0].geometry.coordinates.length);
}
await writeFile('data/training-routes.json',JSON.stringify({source:'OSRM / © OpenStreetMap contributors',routes}));
