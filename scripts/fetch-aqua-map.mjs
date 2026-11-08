import{writeFile}from'node:fs/promises';
const urls=[
 ['osm-aqua','https://api.openstreetmap.org/api/0.6/map.json?bbox=127.757,26.317,127.765,26.324'],
 ['route-aqua','https://routing.openstreetmap.de/routed-car/route/v1/driving/127.880073,26.6840203;127.7610734,26.3202022?overview=full&geometries=geojson&steps=true'],
];
for(const[name,url]of urls){const t=Date.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'JapanDrive/0.5 (local test game)',Accept:'application/json'}});const body=await r.text();console.log(JSON.stringify({name,status:r.status,ms:Date.now()-t,length:body.length,head:body.slice(0,60)}));if(r.ok)await writeFile('data/'+name+'.raw.json',body);}catch(e){console.log(name,e.message);}}
