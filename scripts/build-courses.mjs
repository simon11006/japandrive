// Reproducible, offline course compiler. Map geometry stays at metre scale.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {buildGraph,localRoute} from '../local-router.mjs';
import {HIGHWAYS,isSolidBuilding} from '../map-core.mjs';
import {projection} from '../map-data.mjs';
import {CITY_AREAS} from './city-areas.mjs';
import {CITY_COURSES} from './city-course-definitions.mjs';
import {WORLD_AREAS} from './world-course-definitions.mjs';
import {worldCourseRoute} from './world-course-route.mjs';
import {buildRoadGraph,wrapAngle} from '../simulation.mjs';
import {practiceRoute} from './practice-route.mjs';
import {prepareSignalLayouts} from '../junctions.mjs';
import {StreetEncounters} from '../street-encounters.mjs';
import {sceneFeatures} from '../scene-features.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
let proj=projection([127.68,26.214]);
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const length=cs=>cs.slice(1).reduce((s,p,i)=>s+dist(proj.toLocal(p),proj.toLocal(cs[i])),0);
const sources={};
for(const id of ['naha','chatan','onna','motobu',...CITY_AREAS.map(c=>c.id),...WORLD_AREAS.map(c=>c.id)]) sources[id]=await read(`data/course-sources/${id}-geometry.json`);
const training=await read('data/training-routes.json');
const defs=[
 ...CITY_COURSES,
 {id:'motobu-first',area:'motobu',name:'모토부 · 첫 드라이브',theme:'village',category:'교외',subtitle:'조용한 마을에서 시작하는 첫 좌측통행',stars:1,minutes:[3,4],pace:25,features:['좌측통행','완만한 좌회전','목적지 주차'],assessment:['낮은 교차로 밀도','2차로 중심','넓은 주차장'],startLabel:'모토부 숙소 앞',finishLabel:'하나사키 마르셰 주차장',training:'coast'},
 {id:'chatan-town',area:'chatan',name:'차탄 · 타운 드라이브',theme:'urban',category:'도심',subtitle:'상가와 생활도로 사이, 연속 신호를 읽다',stars:3,minutes:[5,7],pace:25,features:['연속 신호','횡단보도','우회전 대기','상가 주차'],assessment:['연속 교차로','보행자 신호','회전 후 차로 유지'],start:[127.7570,26.3220],end:[127.75862605,26.314982294],parkingId:189830737,startLabel:'차탄 생활도로',finishLabel:'차탄 공영 주차장'},
 {id:'naha-city',area:'naha',name:'나하 · 시티 챌린지',theme:'city',category:'복합 도심',subtitle:'빌딩과 상가 사이의 차로 선택과 교차로 통과',stars:5,minutes:[7,9],pace:23,features:['다차로 도로','방향 화살표 신호','연속 교차로','도심 주차'],assessment:['다차로·일방통행','교차로에서 차로 선택','대향차와 방향지시등 확인'],start:[127.6829856,26.2236442],via:[[127.690225,26.219627]],end:[127.692177345,26.219533545],parkingId:168251972,startLabel:'나하 도심 도로',finishLabel:'나하 도심 주차장'},
 {id:'onna-coast',area:'onna',name:'온나 · 코스탈 라인',theme:'coast',category:'해안',subtitle:'바다를 옆에 두고, 굽은 길에서 속도 유지하기',stars:2,minutes:[5,7],pace:35,features:['해안 곡선 구간','속도 변화','분기 교차로','주차장 진입'],assessment:['완만한 곡선','간선도로와 생활도로 연결','진입 전 감속'],start:[127.80417,26.45066],via:[[127.80425,26.44497]],end:[127.803454314,26.441550529],parkingId:189206849,startLabel:'온나 해안 마을',finishLabel:'해안 휴게 주차장'},
 {id:'motobu-hills',area:'motobu',name:'모토부 · 그린 힐',theme:'mountain',category:'구릉·산길',subtitle:'수목과 옹벽 사이, 굽이와 좁은 길을 천천히',stars:3,minutes:[6,8],pace:25,features:['오르막·내리막','좁은 길 교행','점멸 신호','구릉 주차장'],assessment:['굽은 길의 시야 제한','경사에서 속도 조절','좁은 진입로'],start:[127.8867308,26.677226186],via:[[127.89010,26.68220]],end:[127.883168838,26.682128212],parkingId:366040778,startLabel:'모토부 구릉 진입로',finishLabel:'구릉 숙소 주차장'},
 {id:'e58-express',area:'expressway',name:'E58 · 하이웨이 런',theme:'expressway',category:'고속도로',subtitle:'요금소부터 합류, 차간 거리와 출구 감속까지',stars:4,minutes:[7,9],pace:65,features:['ETC·일반 요금소','가속 차로 합류','고속 주행','출구·주차'],assessment:['고속 주행과 차간 거리','합류·분기','입구·출구 요금소 통과'],startLabel:'고속도로 진입 준비 구간',finishLabel:'출구 휴게 주차장'}
];
await mkdir('data/courses',{recursive:true});
for(const area of WORLD_AREAS)defs.push({...area,id:`${area.country.toLowerCase()}-${area.id}`,area:area.id,world:true,pace:25,minutes:[4,7],subtitle:'실제 거리의 교차로를 연결하며 좌측통행과 회전 후 차로를 익히세요.',startLabel:`${area.region} 출발점`,finishLabel:`${area.region} 목표 주차장`,assessment:['회전 후 왼쪽 차로 진입','대향차와 보행자에게 양보','목표면 안에 완전히 주차']});
function nearest(p,cs){let best=Infinity;for(let i=1;i<cs.length;i++){const a=cs[i-1],b=cs[i],dx=b.x-a.x,dy=b.y-a.y,t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));best=Math.min(best,Math.hypot(p.x-a.x-dx*t,p.y-a.y-dy*t));}return best;}
function routeSteps(cs){let travelled=0;const steps=[];for(let i=0;i<cs.length;i++){if(i)travelled+=dist(proj.toLocal(cs[i-1]),proj.toLocal(cs[i]));if(i===0||i===cs.length-1||i%12===0)steps.push({distance:0,name:'',maneuver:{type:i===0?'depart':i===cs.length-1?'arrive':'continue',modifier:'straight',location:cs[i]}});}return steps;}
function rect(center,h,w,l){const f={x:Math.sin(h),y:-Math.cos(h)},r={x:Math.cos(h),y:Math.sin(h)};return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>proj.toGeo({x:center.x+r.x*a*w/2+f.x*b*l/2,y:center.y+r.y*a*w/2+f.y*b*l/2}));}
for(const def of defs){
 const city=[...CITY_AREAS,...WORLD_AREAS].find(c=>c.id===def.area),origin=city?.origin||[127.68,26.214];proj=projection(origin);
 let raw,route,parking,tolls=[];
 if(def.world){
  raw=sources[def.area];const selected=worldCourseRoute(city,raw);route=selected.route;
  parking={type:'area',name:def.finishLabel,polygon:selected.parking.geometry.map(p=>[p.lon,p.lat]),osmId:selected.parking.id};
  def.practice=route.practice;def.parkingId=selected.parking.id;
  def.features.push(`좌회전 ${route.practice.left}회`,`우회전 ${route.practice.right}회`,'목표면 주차');
  def.terrainNote='실제 지도·표고와 거리 사진을 참고한 연습 환경';
 } else if(def.training){
  route=structuredClone(training.routes.find(r=>r.name===def.training).data.routes[0]);
  raw=sources.motobu;
  const p=await read('data/parking-sites.json');const s=p.spaces[1];
  parking={type:'bay',name:def.finishLabel,polygon:s.corners};
 } else if(def.area==='expressway') {
  // The actual E58 centreline is retained; only approaches/exit are condensed
  // for practice. This is explicitly a reconstructed course, not a real IC.
  const source=training.routes.find(r=>r.name==='canphou-aqua').data.routes[0];
  const motorway=source.legs.flatMap(l=>l.steps).filter(s=>s.name==='沖縄自動車道').flatMap(s=>s.geometry.coordinates);
  let cs=[],d=0;for(let i=1;i<motorway.length;i++){d+=dist(proj.toLocal(motorway[i-1]),proj.toLocal(motorway[i]));if(d>700&&d<2800)cs.push(motorway[i]);}
  if(cs.length<10)throw Error('Missing saved E58 geometry');
  const a=proj.toLocal(cs[0]),b=proj.toLocal(cs[1]),z=proj.toLocal(cs.at(-1)),y=proj.toLocal(cs.at(-2));
  const heading=(a,b)=>Math.atan2(b.x-a.x,-(b.y-a.y)),h=heading(a,b),he=heading(y,z);
  const offset=(p,h,along,side)=>({x:p.x+Math.sin(h)*along+Math.cos(h)*side,y:p.y-Math.cos(h)*along+Math.sin(h)*side});
  const approach=[[-250,-34],[-180,-34],[-120,-34],[-70,-22],[-30,-8],[0,0]].map(([f,r])=>proj.toGeo(offset(a,h,f,r)));
  const exit=[[0,0],[45,-8],[90,-25],[145,-34],[205,-34],[260,-34],[300,-34]].map(([f,r])=>proj.toGeo(offset(z,he,f,r)));
  const main=cs;cs=[...approach.slice(0,-1),...cs,...exit.slice(1)];
  route={distance:length(cs),duration:length(cs)/(65/3.6),geometry:{type:'LineString',coordinates:cs},legs:[{steps:routeSteps(cs)}]};
  const way=(id,coords,tags)=>({type:'way',id,geometry:coords.map(([lon,lat])=>({lon,lat})),tags});
  const opposite=main.map((p,i)=>{const q=proj.toLocal(p),v=proj.toLocal(main[Math.min(main.length-1,i+1)]),angle=i===main.length-1?he:heading(q,v);return proj.toGeo(offset(q,angle,0,9));}).reverse();
  // Additional mainline before/after the join makes merge and diverge visible.
  const through=[proj.toGeo(offset(a,h,-280,0)),...main,proj.toGeo(offset(z,he,340,0))];
  const entryRoad=way('practice-entry',approach,{highway:'motorway_link',oneway:'yes',lanes:'1',maxspeed:'40',name:'진입 램프'});
  const exitRoad=way('practice-exit',exit,{highway:'motorway_link',oneway:'yes',lanes:'1',maxspeed:'40',name:'출구 램프'});
  raw={elements:[way('e58-main',through,{highway:'motorway',oneway:'yes',lanes:'2',maxspeed:'80',name:'沖縄自動車道'}),way('e58-opposite',opposite,{highway:'motorway',oneway:'yes',lanes:'2',maxspeed:'80',name:'沖縄自動車道'}),entryRoad,exitRoad]};
  tolls=[{id:'entry',kind:'entry',geo:proj.toGeo(offset(a,h,-180,-34)),heading:h},{id:'exit',kind:'exit',geo:proj.toGeo(offset(z,he,205,-34)),heading:he}];
  const center=offset(z,he,300,-34);parking={type:'area',name:def.finishLabel,polygon:rect(center,he,17,22)};
  raw.elements.push(way('express-parking',parking.polygon,{amenity:'parking',surface:'asphalt'}));
  // On this reconstructed exercise, barriers use their own 20 km/h zone.
  def.reconstructed=true;
 } else {
  raw=sources[def.area];
  const ways=raw.elements.filter(e=>e.type==='way'&&HIGHWAYS.has(e.tags?.highway)&&(!city||(e.tags.tunnel!=='yes'&&!(Number(e.tags.layer)<0))));
  const graph=buildGraph(ways),points=[def.start,...def.via||[],def.end];let legs=[],coords=[],duration=0;
  for(let i=1;i<points.length;i++){
   const result=localRoute(graph,points[i-1],points[i]);if(!result)throw Error('Unconnected '+def.id);
   const r=result.routes[0];coords.push(...r.geometry.coordinates.slice(i>1?1:0));legs.push(...r.legs);duration+=r.duration;
  }
  const f=raw.elements.find(e=>e.id===def.parkingId);if(!f)throw Error('No parking '+def.id);
  parking={type:'area',name:def.finishLabel,polygon:f.geometry.map(p=>[p.lon,p.lat])};
  route={distance:length(coords),duration,geometry:{type:'LineString',coordinates:coords},legs};
 }
 if(!def.world&&['city','urban','village'].includes(def.theme)){
  const ways=raw.elements.filter(e=>e.type==='way'&&HIGHWAYS.has(e.tags?.highway)&&e.tags.tunnel!=='yes'&&!(Number(e.tags.layer)<0));
  route=practiceRoute(ways,route.geometry.coordinates.at(-1),{seed:defs.indexOf(def)+1,...(def.theme==='village'?{min:350,max:700,turns:1}:{})});
  def.practice=route.practice;def.start=route.geometry.coordinates[0];delete def.via;
  def.startLabel=def.region==='오키나와'||!def.region?'마을 좌측통행 출발점':`${def.region} 좌측통행 출발점`;
  const {left,right,longestStraight}=def.practice;
  def.features=[`좌회전 ${left}회`,`우회전 ${right}회`,def.theme==='city'?'신호·차로 선택':'좁은 길·큰길 연결','목표면 주차'];
  def.assessment=['좌회전 후 왼쪽 차로 진입','대향차 확인 후 우회전',`직선 구간 최장 ${longestStraight}m`];
  def.subtitle=def.theme==='city'?'교차로마다 왼쪽 차로를 다시 찾고, 대향차를 살피며 우회전하세요':'마을길과 교차로를 연결하며 일본의 좌측통행에 익숙해지세요';
  if(def.id==='osaka-midosuji')def.name='신사이바시 · 좌측통행 루프';
  if(def.id==='sapporo-odori')def.name='삿포로 · 교차로 루프';
 }
 const local=route.geometry.coordinates.map(proj.toLocal);
 const isNear=(e,r)=>e.geometry?e.geometry.some(p=>nearest(proj.toLocal([p.lon,p.lat]),local)<r):nearest(proj.toLocal([e.lon,e.lat]),local)<r;
 const elements=raw.elements.filter(e=>isNear(e,e.tags?.building?230:420));
 const roads=elements.filter(e=>e.type==='way'&&HIGHWAYS.has(e.tags?.highway)&&e.tags?.area!=='yes'&&!['no','private'].includes(e.tags?.access)&&(!city||(e.tags.tunnel!=='yes'&&!(Number(e.tags.layer)<0))));
 // Shared nodes supply crossing locations. Signals remain an explicitly
 // simulated training programme rather than a claim about local timings.
 const signals=elements.filter(e=>e.type==='node'&&e.tags?.highway==='traffic_signals'&&isNear(e,180)).map(e=>({...e}));
 const crossing=elements.filter(e=>e.type==='node'&&e.tags?.highway==='crossing');
 // Unmapped signals are never passed off as surveyed equipment. Add a
 // training controller at real multi-road junctions, labelled in the bundle.
 if(def.theme!=='expressway'){
  const projected=roads.map(r=>({id:r.id,tags:r.tags,points:r.geometry.map(p=>proj.toLocal([p.lon,p.lat]))}));
  const graph=buildRoadGraph(projected);
  for(const node of graph.nodes.values()){
   const directions=[];for(const e of node.out)if(!directions.some(h=>Math.abs(wrapAngle(h-e.heading))<.3))directions.push(e.heading);
   if(directions.length<3||nearest(node,local)>24||!node.out.some(e=>['primary','secondary','tertiary'].includes(e.highway)))continue;
   if(signals.some(s=>dist(node,proj.toLocal([s.lon,s.lat]))<55))continue;
   const [lon,lat]=proj.toGeo(node);signals.push({type:'node',id:`practice-junction-${def.id}-${node.key}`,lon,lat,tags:{highway:'traffic_signals'},practice:true});
  }
 }
 if(!signals.length&&['city','urban','mountain'].includes(def.theme)){
  const at=route.geometry.coordinates[Math.floor(local.length*.47)];signals.push({type:'node',id:'practice-signal-'+def.id,lon:at[0],lat:at[1],tags:{highway:'traffic_signals'},practice:true});
 }
 for(const s of signals){s.profile='standard';}
 if(def.theme==='city'&&signals.length)signals[Math.floor(signals.length/2)].profile='arrow';
 if(!def.world&&def.theme==='mountain'&&signals.length)signals[0].profile='flash';
 // Do not let duplicate nearby signal nodes produce contradictory phases.
 const merged=[];for(const s of signals){if(!merged.some(o=>dist(proj.toLocal([s.lon,s.lat]),proj.toLocal([o.lon,o.lat]))<55))merged.push(s);}
 if(['city','urban'].includes(def.theme)){
  for(const s of merged)s.profile='standard';
  const rights=route.legs.flatMap(l=>l.steps).filter(s=>s.maneuver.modifier==='right').map(s=>proj.toLocal(s.maneuver.location));
  const candidates=merged.map(s=>({s,d:Math.min(...rights.map(p=>dist(p,proj.toLocal([s.lon,s.lat]))))})).sort((a,b)=>a.d-b.d);
  if(candidates[0]?.d<40){candidates[0].s.profile='arrow';candidates[0].s.practiceControl=true;}
 }
 const scene=elements.filter(e=>isSolidBuilding(e)||e.tags?.amenity==='parking'||e.tags?.natural||e.tags?.landuse||e.tags?.leisure==='park'||e.tags?.shop||e.tags?.barrier||e.tags?.power||e.tags?.highway==='footway'||e.tags?.highway==='street_lamp'||e.tags?.highway==='crossing'||e.tags?.waterway);
 const rules=elements.filter(e=>e.type==='node'&&['stop','speed_camera'].includes(e.tags?.highway));
 const encounterRoads=roads.map(r=>({id:r.id,tags:r.tags,points:r.geometry.map(p=>proj.toLocal([p.lon,p.lat]))}));
 const encounterSignals=prepareSignalLayouts(merged.map(s=>({...s,...proj.toLocal([s.lon,s.lat])})),encounterRoads);
 const encounters=new StreetEncounters({roads:encounterRoads,signals:encounterSignals,nodes:scene.filter(e=>e.type==='node').map(e=>({...e,...proj.toLocal([e.lon,e.lat])})),route:local,features:sceneFeatures({elements:scene},proj),theme:def.theme});
 def.situations={signalCrosswalks:encounters.crossings.filter(c=>c.signal).length,unsignalCrosswalks:encounters.crossings.filter(c=>!c.signal).length,police:encounters.officers.length};
 if(encounters.crossings.length){def.features.push('보행자 횡단');def.assessment.push('횡단보도 보행자에게 양보');}
 if(def.situations.police)def.features.push('경찰관 순찰 구간');
 def.country??='JP';
 const bundle={id:def.id,country:def.country,source:'OpenStreetMap contributors; saved route geometry',origin,reference:city?.reference,roads:{elements:roads},scene:{elements:scene},signals:merged,crossings:crossing,rules,route,parking,tolls};
 const minDriving=route.distance/(def.pace/3.6)/60+1.5+merged.filter(s=>isNear(s,28)).length*.15+(tolls.length?1:0);
 if(minDriving>10)throw Error(`${def.id} is too long: ${minDriving.toFixed(1)} min`);
 if(def.practice){const low=Math.max(3,Math.ceil(minDriving));def.minutes=[low,Math.min(10,low+2)];}
 def.region??='오키나와';def.origin=origin;def.reference=city?.reference;def.distance=Math.round(route.distance);def.signals=merged.length;def.bundle=`./data/courses/${def.id}.json`;
 def.preview=route.geometry.coordinates.filter((_,i)=>i%Math.max(1,Math.floor(local.length/80))===0);
 def.mapSource=`https://www.openstreetmap.org/#map=16/${route.geometry.coordinates[0][1]}/${route.geometry.coordinates[0][0]}`;
 await writeFile(`data/courses/${def.id}.json`,JSON.stringify(bundle));
 console.log(def.id,def.distance+'m',roads.length+' roads',scene.length+' features',merged.length+' signals','estimate floor '+minDriving.toFixed(1));
}
// Mix locations in one carousel: overseas courses must not be hidden behind
// every existing Japan course. Country is a label, never a required step.
const groups=['JP','AU','NZ'].map(code=>defs.filter(c=>c.country===code));
const ordered=[];for(let i=0;i<Math.max(...groups.map(g=>g.length));i++)for(const group of groups)if(group[i])ordered.push(group[i]);
await writeFile('data/driving-courses.json',JSON.stringify({version:3,note:'실제 지도와 표고를 바탕으로 구성한 짧은 연습 코스. 교통·신호 주기·주차면은 연습용입니다. 외벽·수목은 지역 거리 사진을 참고한 자체 모델이며 사진 측량 재현은 아닙니다.',courses:ordered},null,2));
