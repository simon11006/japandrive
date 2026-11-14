import {insidePolygon,nearestOnSegment} from './simulation.mjs';
let source;
export async function loadLandscape(id,proj){source??=fetch(new URL('./data/world-scenery.json',import.meta.url)).then(r=>{if(!r.ok)throw Error('풍경 자료를 불러오지 못했습니다.');return r.json();}).catch(e=>{source=null;throw e;});return landscapeCoordinates((await source).courses[id],proj);}
export function landscapeCoordinates(data,proj){
 if(!data)return null;
 const coast=data.coast.map(c=>c.points.map(proj.toLocal)),lakes=(data.lakes||[]).map(r=>r.map(proj.toLocal)),beaches=data.beaches.map(b=>b.points.map(proj.toLocal));
 const segments=coast.flatMap(r=>r.slice(1).map((b,i)=>({a:r[i],b})));
 const waterAt=p=>{
  if(lakes.length)return lakes.some(r=>insidePolygon(p,r));
  let nearest=null;for(const s of segments){const hit=nearestOnSegment(p,s.a,s.b);if(!nearest||hit.distance<nearest.d)nearest={d:hit.distance,cross:(s.b.x-s.a.x)*(p.y-s.a.y)-(s.b.y-s.a.y)*(p.x-s.a.x)};}
  return !!nearest&&nearest.cross>0;
 };
 return{...data,coast,lakes,beaches,waterAt};
}
