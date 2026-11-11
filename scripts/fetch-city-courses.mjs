// Download once during development. Gameplay reads the saved bundles only.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {coreGeometry} from '../map-core.mjs';
import {CITY_AREAS} from './city-areas.mjs';
await mkdir('data/course-sources',{recursive:true});
for(const area of CITY_AREAS){
 const path=`data/course-sources/${area.id}-geometry.json`;
 try{const d=JSON.parse(await readFile(path,'utf8'));console.log(area.id,'cached',d.elements.length);continue;}catch{}
 const url='https://api.openstreetmap.org/api/0.6/map.json?bbox='+area.bbox.join(',');
 let data;
 {
  const response=await fetch(url,{headers:{Accept:'application/json','User-Agent':'JapanDrive/0.8 (+https://github.com/simon11006/japandrive)'},signal:AbortSignal.timeout(35000)});
  if(!response.ok)throw Error(`${area.id}: HTTP ${response.status} ${(await response.text()).slice(0,200)}`);
  data=await response.json();
 }
 const source={version:.6,source:'© OpenStreetMap contributors',elements:coreGeometry(data).elements};
 source.survey={area:area.id,bbox:area.bbox,url,retrievedAt:new Date().toISOString(),reference:area.reference};
 await writeFile(path,JSON.stringify(source));
 console.log(area.id,source.elements.length,'features');
}
