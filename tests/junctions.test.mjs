import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {prepareSignalLayouts,roadClearance,roadsideSpace} from '../junctions.mjs';
import {TrafficSimulation,signalPhase,distance,wrapAngle,synchronizeSignals,rectanglesOverlap} from '../simulation.mjs';
import {courseRoadStore} from '../courses.mjs';
import {projection} from '../map-data.mjs';
const cross=[
 {id:'ns',tags:{highway:'primary',lanes:'4'},points:[{x:0,y:180},{x:0,y:0},{x:0,y:-180}]},
 {id:'ew',tags:{highway:'secondary',lanes:'2'},points:[{x:-180,y:0},{x:0,y:0},{x:180,y:0}]},
];
test('four-way lights have separate heads, roadside supports and stop lines before the crossing',()=>{
 const [s]=prepareSignalLayouts([{id:'junction',x:0,y:0}],cross);
 assert.equal(s.approaches.length,4);
 for(const a of s.approaches){assert.ok(a.pole);assert.ok(roadClearance(a.pole,cross)>=1);assert.ok(distance(a.stop,s)>=5);}
 for(let i=0;i<4;i++)for(let j=0;j<i;j++)assert.ok(distance(s.approaches[i].head,s.approaches[j].head)>3);
 const clear=roadsideSpace(cross);assert.equal(clear({x:7.6,y:0}),false,'the side of one road is the middle of its crossing road');assert.equal(clear({x:8,y:25}),true);
});
test('traffic waits at a visible red, then each of four approaches clears the junction',()=>{
 const [s]=prepareSignalLayouts([{id:'junction',x:0,y:0}],cross);
 const sim=new TrafficSimulation(cross,[s],{x:0,y:100},8);sim.cars=sim.cars.slice(0,4);
 const arrivals=sim.graph.edges.filter(e=>e.to.x===0&&e.to.y===0);
 for(let i=0;i<4;i++){
  const car=sim.cars[i];car.edge=arrivals[i];car.along=car.edge.length-28;car.speed=0;sim.place(car);
  car.next=car.edge.to.out.find(e=>Math.abs(wrapAngle(e.heading-car.heading))<.1);
 }
 const passed=new Set(),waited=new Set();let violations=0;
 for(let tick=0;tick<1400;tick++){
  const time=tick*.1,before=sim.cars.map(c=>({...c}));sim.tick(.1,time,{x:999,y:999});
  sim.cars.forEach((c,i)=>{
   if(passed.has(i))return;
   const a=s.approaches.find(a=>Math.abs(wrapAngle(a.heading-before[i].heading))<.1);
   if(!a)return;
   const line=d=>((s.x-d.x)*Math.sin(a.heading)-(s.y-d.y)*Math.cos(a.heading))-a.stopDistance-c.length/2;
   if(signalPhase(s,a.heading,time)==='red'&&line(before[i])>=0&&line(c)<-.2)violations++;
   if(c.speed<.1&&line(c)<5&&signalPhase(s,a.heading,time)==='red')waited.add(i);
   if(c.edge.from.x===0&&c.edge.from.y===0&&c.along>20)passed.add(i);
  });
  if(passed.size===4)break;
 }
 assert.equal(violations,0);assert.ok(waited.size>=2);assert.equal(passed.size,4,'all approaches eventually depart');
});
test('linked arrow and ordinary signal nodes share one compatible timing programme',()=>{
 const signals=synchronizeSignals([{id:'a',x:0,y:0,profile:'standard',approachHeading:0},{id:'b',x:12,y:5,profile:'arrow',approachHeading:Math.PI/2}]);
 for(let t=0;t<160;t+=.2)assert.ok(!(signalPhase(signals[0],0,t)==='green'&&signalPhase(signals[1],Math.PI/2,t)==='green'));
});
test('Tokyo traffic cannot jump into a parked player when it changes edges or lanes',async()=>{
 const b=JSON.parse(await readFile(new URL('../data/courses/tokyo-shinjuku.json',import.meta.url),'utf8')),p=projection(b.origin),roads=courseRoadStore(b,p).roads;
 const signals=prepareSignalLayouts(b.signals.map(s=>({...s,...p.toLocal([s.lon,s.lat])})),roads);
 const player={...p.toLocal(b.route.geometry.coordinates[0]),heading:-.194033743,speed:0,length:4.995,width:1.85};
 const sim=new TrafficSimulation(roads,signals,player,28);
 for(let i=0;i<2400;i++){sim.tick(.05,i*.05,player);for(const c of sim.cars)assert.equal(rectanglesOverlap(c,c,player,player),false,`car ${c.id} overlaps driver at ${i*.05}s`);}
 assert.ok(sim.cars.filter(c=>c.speed>.1).length>=4,'junction traffic keeps circulating');
});
test('every saved course signal has visible approaches and all supports stay outside every road',async()=>{
 const catalog=JSON.parse(await readFile(new URL('../data/driving-courses.json',import.meta.url),'utf8'));
 for(const c of catalog.courses){
  const b=JSON.parse(await readFile(new URL('../'+c.bundle,import.meta.url),'utf8')),p=projection(b.origin),roads=courseRoadStore(b,p).roads;
  const signals=prepareSignalLayouts(b.signals.map(s=>({...s,...p.toLocal([s.lon,s.lat])})),roads);
  for(const s of signals){assert.ok(s.approaches.length,`${c.id} signal ${s.id}`);for(const a of s.approaches){assert.ok(a.pole,`${c.id}: no clear support at ${s.id}`);assert.ok(roadClearance(a.pole,roads)>.9,`${c.id}: pole in road`);}}
 }
});
