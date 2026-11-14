import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {projection} from '../map-data.mjs';
import {slippyPixel} from '../terrain.mjs';
import {WORLD_AREAS} from './world-course-definitions.mjs';
import {decodeTerrariumPng} from './terrarium-png.mjs';
await mkdir('data/world-terrain',{recursive:true});
await mkdir('data/course-sources/terrain-tiles',{recursive:true});
const cache=new Map();
async function tile(z,x,y){const key=`${z}-${x}-${y}`;if(cache.has(key))return cache.get(key);const path=`data/course-sources/terrain-tiles/${key}.png`;let bytes;try{bytes=await readFile(path);}catch{const r=await fetch(`https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${z}/${x}/${y}.png`,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Terrain ${key}: ${r.status}`);bytes=Buffer.from(await r.arrayBuffer());await writeFile(path,bytes);}const decoded=decodeTerrariumPng(bytes);cache.set(key,decoded);return decoded;}
for(const area of WORLD_AREAS){
 const id=`${area.country.toLowerCase()}-${area.id}`,proj=projection(area.origin),tiles=new Set();
 async function grid(range,step,z){const cols=range*2/step+1,rows=cols,heights=[];const pending=new Set();for(let y=-range;y<=range;y+=step)for(let x=-range;x<=range;x+=step){const p=slippyPixel(...proj.toGeo({x,y}),z);pending.add(`${Math.floor(p.x/256)}:${Math.floor(p.y/256)}`);}
  for(const key of pending){const[x,y]=key.split(':').map(Number);await tile(z,x,y);tiles.add(`${z}/${x}/${y}`);}
  for(let y=-range;y<=range;y+=step)for(let x=-range;x<=range;x+=step){const p=slippyPixel(...proj.toGeo({x,y}),z),tx=Math.floor(p.x/256),ty=Math.floor(p.y/256),t=cache.get(`${z}-${tx}-${ty}`),ix=Math.min(254,Math.floor(p.x-tx*256)),iy=Math.min(254,Math.floor(p.y-ty*256)),u=Math.min(1,p.x-tx*256-ix),v=Math.min(1,p.y-ty*256-iy);heights.push(Math.round((t.at(ix,iy)*(1-u)*(1-v)+t.at(ix+1,iy)*u*(1-v)+t.at(ix,iy+1)*(1-u)*v+t.at(ix+1,iy+1)*u*v)*10)/10);}
  return{x:-range,y:-range,step,cols,rows,heights};}
 const near=await grid(2400,25,13),far=await grid(area.id==='queenstown'?14000:8000,area.id==='queenstown'?200:125,11);
 await writeFile(`data/world-terrain/${id}.json`,JSON.stringify({id,origin:area.origin,source:'Mapzen Terrain Tiles / AWS; Geoscience Australia; LINZ; USGS',url:'https://registry.opendata.aws/terrain-tiles/',retrievedAt:new Date().toISOString(),modification:'Decoded Terrarium; bilinear resampling; game separately grades road corridors and parking pads.',tiles:[...tiles],near,far}));
 console.log(id,`terrain ${Math.min(...near.heights).toFixed(1)}–${Math.max(...near.heights).toFixed(1)}m`,tiles.size+' tiles');
}
