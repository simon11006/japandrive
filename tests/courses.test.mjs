import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projection,routeProgress} from '../map-data.mjs';
import {TollSession,canVisitStep,courseRoadStore,courseParking} from '../courses.mjs';
import {signalPhase,signalRightArrow,parkingStatus,nearestOnSegment,distance} from '../simulation.mjs';
import {VEHICLES} from '../vehicles.mjs';
import {courseElevation} from '../course-surface.mjs';
import {groundSurface,surfacePose} from '../road-surface.mjs';
const read=async p=>JSON.parse(await readFile(new URL(p,import.meta.url),'utf8'));
const catalog=await read('../data/driving-courses.json');
const p=projection([127.68,26.214]);
test('six short courses expose region, estimated minutes, stars and distinct situations',()=>{
 assert.equal(catalog.courses.length,6);assert.equal(new Set(catalog.courses.map(c=>c.id)).size,6);
 for(const c of catalog.courses){assert.ok(c.region);assert.ok(c.minutes[1]<=10&&c.minutes[0]>0);assert.ok(c.stars>=1&&c.stars<=5);assert.ok(c.features.length>=3);assert.ok(c.distance<3000);}
 assert.ok(catalog.courses.filter(c=>['city','urban'].includes(c.theme)).length>=2);
});
test('course route geometry has continuous road coverage and usable destination parking',async()=>{
 for(const c of catalog.courses){
  const bundle=await read('../'+c.bundle),store=courseRoadStore(bundle,p),route=bundle.route.geometry.coordinates.map(p.toLocal);
  assert.ok(route.length>5);assert.ok(store.roads.length>0);assert.ok(routeProgress(route,route.at(-1),bundle.route.distance).remaining<.001);
  for(const q of route){let d=Infinity;for(const r of store.roads)for(let i=1;i<r.points.length;i++)d=Math.min(d,nearestOnSegment(q,r.points[i-1],r.points[i]).distance);assert.ok(d<3,`${c.id}: missing road ${d}m`);}
  const goal=courseParking(bundle.parking,p);assert.ok(distance(goal.center,route.at(-1))<200,`${c.id}: parking too far away`);
  for(const car of VEHICLES)assert.ok(parkingStatus({...goal.center,heading:goal.heading,speed:0,parkingBrake:true},car,goal,2).complete,`${c.id}: ${car.id} cannot fit`);
 }
});
test('preparation steps allow returning but prevent skipping uncompleted steps',()=>{
 assert.equal(canVisitStep(1,3),true);assert.equal(canVisitStep(3,3),true);assert.equal(canVisitStep(4,3),false);assert.equal(canVisitStep(5,4),false);assert.equal(canVisitStep(2.5,4),false);
});
test('ETC keeps a fast vehicle out, opens at low speed, and requires both gates',()=>{
 const s=new TollSession([{id:'in',kind:'entry',x:0,y:0,heading:0},{id:'out',kind:'exit',x:0,y:-100,heading:0}]);
 s.update(.1,{x:0,y:20,speed:10});assert.equal(s.gates[0].state,'closed');
 s.update(1,{x:0,y:20,speed:4});assert.equal(s.gates[0].state,'open');
 s.update(.1,{x:0,y:-4,speed:4});assert.equal(s.complete,false);
 s.update(1,{x:0,y:-80,speed:4});s.update(.1,{x:0,y:-104,speed:4});assert.equal(s.complete,true);
});
test('general toll lane only accepts action while stopped and needs an entry ticket at exit',()=>{
 const gates=[{id:'in',kind:'entry',x:0,y:0,heading:0},{id:'out',kind:'exit',x:0,y:-100,heading:0}],s=new TollSession(gates,'general');
 s.update(.1,{x:0,y:-94,speed:0},true);assert.equal(s.gates[1].state,'closed');
 s.update(.1,{x:0,y:6,speed:2},true);assert.equal(s.ticket,false);
 s.update(1,{x:0,y:6,speed:0},true);assert.equal(s.ticket,true);s.update(.1,{x:0,y:-5,speed:2});
 s.update(1,{x:0,y:-94,speed:0},true);s.update(.1,{x:0,y:-105,speed:2});assert.equal(s.complete,true);
 s.reset();assert.equal(s.complete,false);assert.equal(s.ticket,false);assert.ok(s.gates.every(g=>g.state==='closed'&&g.opening===0));
 s.update(.1,{x:0,y:-94,speed:0},true);assert.equal(s.gates[1].state,'closed');
});
test('protected turn phases never overlap the opposing axis green or arrow phase',()=>{
 const s={id:'arrow-case',profile:'arrow',axis:0};let arrows=0;
 for(let time=0;time<160;time+=.25){const main=signalPhase(s,0,time),cross=signalPhase(s,Math.PI/2,time),a=signalRightArrow(s,0,time),b=signalRightArrow(s,Math.PI/2,time);if(a)arrows++;assert.ok(!((main==='green'||a)&&(cross==='green'||b)));if(a)assert.equal(main,'red');}
 assert.ok(arrows>0);assert.equal(signalPhase({profile:'flash',axis:0},0,0),'flash-red');assert.equal(signalPhase({profile:'flash',axis:0},Math.PI/2,0),'flash-yellow');
});
test('a toll plaza stays level across a hillside and shares the vehicle support surface',()=>{
 const raw=p=>p.x*.35+p.y*.06,roads=[{points:[{x:0,y:-300},{x:0,y:300}],tags:{highway:'motorway_link'}}],gates=[{x:0,y:0}];
 const graded=courseElevation(raw,roads,gates),surface=groundSurface(graded);
 assert.equal(graded({x:5,y:2}),0);assert.equal(graded({x:-5,y:2}),0);
 const pose=surfacePose(surface.height,{x:0,y:15},0);assert.ok(Math.abs(pose.roll)<.01);assert.ok(Math.abs(pose.pitch)<.01);
 assert.equal(graded({x:400,y:200}),raw({x:400,y:200}));
});
