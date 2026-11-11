import { readFile, writeFile } from 'node:fs/promises';
import { coreGeometry } from '../map-core.mjs';
const areas = [['expressway',[127.741,26.239,127.771,26.268]]];
for (const [id,bbox] of areas) {
  const path = `data/course-sources/${id}.json`;
  let data;
  try { data=JSON.parse(await readFile(path,'utf8')); }
  catch {
    const [w,s,e,n]=bbox;
    const query=`[out:json][timeout:25];(way(${s},${w},${n},${e})[highway~"motorway"];node(${s},${w},${n},${e})[barrier=toll_booth];);out geom;`;
    const response=await fetch('https://overpass.private.coffee/api/interpreter?'+new URLSearchParams({data:query}),{signal:AbortSignal.timeout(30000)});
    if(!response.ok) throw Error(response.status);
    data=await response.json();
    await writeFile(path,JSON.stringify(data));
  }
  const compact=data.elements.some(e=>e.geometry)?data:coreGeometry(data);
  await writeFile(`data/course-sources/${id}-geometry.json`,JSON.stringify(compact));
  console.log(id,compact.elements.length,'elements');
  console.log(compact.elements.filter(e=>e.tags?.barrier==='toll_booth'||e.tags?.highway==='motorway_junction').map(e=>({id:e.id,lon:e.lon,lat:e.lat,tags:e.tags})));
}
