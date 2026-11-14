import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projection} from '../map-data.mjs';
import {courseParking} from '../courses.mjs';
import {prepareSignalLayouts} from '../junctions.mjs';
import {approachMarkings,maneuverGuides} from '../road-markings.mjs';
import {distance,insidePolygon,signalPhase,signalRightArrow,signalTurnPhase} from '../simulation.mjs';

test('stop lines stay in the incoming lane and before the pedestrian crossing',()=>{
 const roads=[{id:'ns',points:[{x:0,y:80},{x:0,y:0},{x:0,y:-80}],tags:{width:'7'}},{id:'ew',points:[{x:-80,y:0},{x:0,y:0},{x:80,y:0}],tags:{width:'12'}}];
 const [s]=prepareSignalLayouts([{id:'s',x:0,y:0}],roads);
 for(const a of s.approaches){
  const m=approachMarkings(a),f={x:Math.sin(a.heading),y:-Math.cos(a.heading)},r={x:Math.cos(a.heading),y:Math.sin(a.heading)};
  const ahead=p=>(p.x-a.stop.x)*f.x+(p.y-a.stop.y)*f.y;
  assert.ok(m.stop.every(p=>(p.x-a.stop.x)*r.x+(p.y-a.stop.y)*r.y<0));
  assert.ok(Math.abs(Math.max(...m.stop.map(ahead))-Math.min(...m.stop.map(ahead))-.6)<1e-8);
  assert.ok(Math.min(...m.crossing.flat().map(ahead))>Math.max(...m.stop.map(ahead))+1);
 }
});
test('practice signals retain clearance and bound the wait until a green phase',()=>{
 for(const profile of ['standard','arrow'])for(const h of [0,Math.PI/2]){
  const s={id:'timing-test',profile,axis:0};let wait=0,max=0,allRed=0;
  for(let t=0;t<224;t+=.25){
   const green=signalPhase(s,h,t)==='green';wait=green?0:wait+.25;max=Math.max(max,wait);
   const a=signalPhase(s,0,t),b=signalPhase(s,Math.PI/2,t),ar=signalRightArrow(s,0,t),br=signalRightArrow(s,Math.PI/2,t);
   assert.ok(!((a==='green'||a==='yellow'||ar)&&(b==='green'||b==='yellow'||br)));
   if(a==='red'&&b==='red'&&!ar&&!br)allRed++;
  }
  assert.ok(max<=(profile==='arrow'?40:28));assert.ok(allRed>0);
 }
});
test('each area-based destination has a single car-sized target inside its mapped lot',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../data/driving-courses.json',import.meta.url),'utf8'));
 for(const c of catalog.courses){const b=JSON.parse(await readFile(new URL('../'+c.bundle,import.meta.url),'utf8'));if(b.parking.type!=='area')continue;
  const goal=courseParking(b.parking,projection(b.origin));assert.equal(goal.points.length,4,c.id);
  assert.ok(goal.points.every(p=>insidePolygon(p,goal.lotPoints)),c.id);assert.ok(distance(goal.points[0],goal.points[1])<6,c.id);
 }
});
test('Japanese right-arrow sequence keeps red lit, then returns to yellow before all-red',()=>{
 const s={id:'jp-arrow',profile:'arrow',axis:0};let start=0;
 while(!(signalRightArrow(s,0,start)&&!signalRightArrow(s,0,start-.1)))start+=.1;
 assert.equal(signalPhase(s,0,start),'red');assert.equal(signalPhase(s,0,start-.2),'yellow');
 let end=start;while(signalRightArrow(s,0,end))end+=.1;
 assert.equal(signalPhase(s,0,end),'yellow');assert.equal(signalPhase(s,0,end+3),'red');
 assert.equal(signalPhase(s,Math.PI/2,start),'red');
});
test('right and U-turn guidance follows the route with finite lane-aware geometry',()=>{
 for(const modifier of ['right','left','uturn']){
  const route=[{x:0,y:50},{x:0,y:0},{x:50,y:0}],steps=[{atDistance:50,maneuver:{type:'turn',modifier}}],roads=[{points:route,tags:{width:'7'}}];
  const [g]=maneuverGuides(route,steps,roads);assert.equal(g.modifier,modifier);assert.ok(g.position.y>0&&g.position.x<0);
  assert.ok(g.path.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
 }
});

test('NSW and NZ use red turn arrows during opposing green, then a separate yellow arrow',()=>{
 for(const country of ['AU','NZ']){
  const s={id:'overseas-arrow',profile:'arrow',axis:0,country};let green=0,yellow=0,red=0;
  for(let t=0;t<120;t+=.1){
   const main=signalPhase(s,0,t),turn=signalTurnPhase(s,0,t);
   if(main==='green'){assert.equal(turn,'red');red++;}
   if(turn==='green'){assert.equal(main,'red');green++;}
   if(turn==='yellow'){assert.equal(main,'red');yellow++;}
  }
  assert.ok(green&&yellow&&red);
 }
});
