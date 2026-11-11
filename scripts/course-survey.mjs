import{readFile,writeFile,mkdir}from'node:fs/promises';
await mkdir('data/course-sources',{recursive:true});
const zones=[['naha',[127.681,26.218,127.697,26.234]],['onna',[127.799,26.441,127.819,26.460]],['motobu',[127.876,26.674,127.895,26.691]],['chatan',[127.756,26.312,127.769,26.327]]];
async function get(url){const r=await fetch(url,{signal:AbortSignal.timeout(22000),headers:{Accept:'application/json','User-Agent':'KeepLeft/0.7 (local driving practice; cached public geography)'}});if(!r.ok)throw Error(`${r.status}: ${url}`);return r.json();}
for(const[name,bbox]of zones){const file=`data/course-sources/${name}.json`;try{const d=JSON.parse(await readFile(file,'utf8'));console.log(name,'saved',d.elements.length);continue;}catch{}const d=await get('https://api.openstreetmap.org/api/0.6/map.json?bbox='+bbox.join(','));await writeFile(file,JSON.stringify(d));console.log(name,d.elements.length);}
const query='[out:json][timeout:20];node(26.2,127.70,26.4,127.9)[barrier=toll_booth];out body;';
try{const file='data/course-sources/tolls.json';let d;try{d=JSON.parse(await readFile(file,'utf8'));}catch{d=await get('https://overpass-api.de/api/interpreter?'+new URLSearchParams({data:query}));await writeFile(file,JSON.stringify(d));}console.log('tolls',d.elements.map(e=>({id:e.id,lon:e.lon,lat:e.lat,tags:e.tags})));}catch(e){console.log('toll lookup',e.message);}
