import {writeFile} from 'node:fs/promises';
const query='[out:json][timeout:45];(node(25.99,127.58,26.91,128.4)[highway=speed_camera];node(25.99,127.58,26.91,128.4)[highway=stop];relation(25.99,127.58,26.91,128.4)[type=enforcement][enforcement=maxspeed];);out body;';
const url='https://overpass-api.de/api/interpreter?'+new URLSearchParams({data:query});
const response=await fetch(url,{headers:{'User-Agent':'JapanDrive/0.4 (local driving game)'},signal:AbortSignal.timeout(60000)});
if(!response.ok)throw new Error('Map response '+response.status);
const data=await response.json();if(data.remark)throw new Error(data.remark);
await writeFile('data/okinawa-road-rules.json',JSON.stringify({...data,query,source:'https://www.openstreetmap.org/copyright',note:'Mapped camera and stop locations only; coverage is incomplete. Mobile enforcement locations are not invented.'}));
console.log(JSON.stringify({cameras:data.elements.filter(e=>e.tags?.highway==='speed_camera').length,stops:data.elements.filter(e=>e.tags?.highway==='stop').length,relations:data.elements.filter(e=>e.type==='relation').length}));
