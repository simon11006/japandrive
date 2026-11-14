import test from 'node:test';
import assert from 'node:assert/strict';
import {StreetEncounters,canStartCrossing,pedestrianGreen} from '../street-encounters.mjs';
import {TrafficSimulation,signalPhase} from '../simulation.mjs';
import {roadClearance} from '../junctions.mjs';
import {prepareSignalLayouts} from '../junctions.mjs';
import {readFile} from 'node:fs/promises';
import {projection} from '../map-data.mjs';
import {sceneFeatures} from '../scene-features.mjs';
import {courseRoadStore} from '../courses.mjs';
const roads=[{id:'road',tags:{highway:'residential',width:'7'},points:[{x:0,y:200},{x:0,y:-200}]}];
const options={roads,route:roads[0].points,theme:'village',signals:[],nodes:[{id:'cross',tags:{highway:'crossing'},x:0,y:0}]};
test('pedestrians activate nearby, cross on the markings, and finish on the opposite pavement',()=>{
 const e=new StreetEncounters(options),player={x:-1.6,y:10,heading:0,length:4.6,width:1.8,speed:0};
 assert.equal(e.crossings.length,1);assert.equal(e.officers.length,1);assert.ok(roadClearance(e.officers[0],roads)>.5);
 for(let i=0;i<200;i++)e.tick(.1,i*.1,player,[]);
 for(const p of e.people){assert.equal(p.state,'done');assert.ok(Math.abs(p.x)>3.5);assert.equal(p.y,0);}
 assert.equal(e.stopDistance(player),Infinity);
});
test('a waiting pedestrian has priority but does not step in front of a moving car',()=>{
 const e=new StreetEncounters(options),player={x:-1.6,y:10,heading:0,length:4.6,width:1.8,speed:8};
 e.tick(.1,0,player,[]);assert.ok(e.people.every(p=>p.state==='waiting'));assert.ok(e.stopDistance(player)<6);
 player.speed=0;for(let i=0;i<30;i++)e.tick(.1,i*.1,player,[]);
 assert.ok(e.people.some(p=>p.state==='walking'));assert.ok(e.approaching(player));
});
test('pedestrians only begin with enough green time and never begin on a right-arrow phase',()=>{
 const signal={id:'ped-arrow',axis:0,profile:'arrow'},c={signal,heading:0,width:7};let starts=0;
 for(let t=0;t<104;t+=.25){if(canStartCrossing(c,t)){starts++;assert.ok(pedestrianGreen(c,t+7));assert.equal(signalPhase(signal,0,t),'red');}}
 assert.ok(starts>0);
});
test('AI brakes for crossing pedestrians, holds with stop lamps on, then resumes',()=>{
 const e=new StreetEncounters(options),sim=new TrafficSimulation(roads,[],{x:0,y:70},4),car=sim.cars.find(c=>Math.cos(c.heading)>.9);
 car.along=178;car.speed=5;sim.place(car);sim.cars=[car];sim.pedestrianStop=v=>e.stopDistance(v);
 const player={x:-1.6,y:50,heading:0,length:4.6,width:1.8,speed:0};
 let stopped=false,finished=false;
 for(let i=0;i<250;i++){
   e.tick(.1,i*.1,player,sim.cars);sim.tick(.1,i*.1,player);
   if(car.speed<.15&&e.priority(e.crossings[0])){stopped=true;assert.ok(car.braking);assert.ok(car.y>4);}
   if(e.people.every(p=>p.state==='done')&&car.speed>1)finished=true;
 }
 assert.ok(stopped);assert.ok(finished);
});
test('expressway routes do not spawn people on the carriageway',()=>{
 assert.equal(new StreetEncounters({...options,theme:'expressway'}).people.length,0);
});
test('pedestrians never walk through a stationary vehicle blocking the crossing',()=>{
 const e=new StreetEncounters(options),player={x:-1.6,y:0,heading:0,length:4.6,width:1.8,speed:0};
 for(let i=0;i<100;i++)e.tick(.1,i*.1,player,[]);
 assert.ok(e.people.every(p=>p.state==='waiting'));
 player.y=10;for(let i=0;i<200;i++)e.tick(.1,i*.1,player,[]);
 assert.ok(e.people.every(p=>p.state==='done'));
});
test('all city and village courses offer a real yielding encounter and keep officers off the roads',async()=>{
 const read=async p=>JSON.parse(await readFile(new URL('../'+p,import.meta.url),'utf8'));
 const catalog=await read('data/driving-courses.json');
 for(const c of catalog.courses.filter(c=>['city','urban','village'].includes(c.theme))){
  const b=await read(c.bundle),proj=projection(b.origin),roads=courseRoadStore(b,proj).roads;
  const signals=prepareSignalLayouts(b.signals.map(s=>({...s,...proj.toLocal([s.lon,s.lat])})),roads);
  const e=new StreetEncounters({roads,signals,route:b.route.geometry.coordinates.map(proj.toLocal),theme:c.theme,features:sceneFeatures(b.scene,proj),nodes:b.scene.elements.filter(n=>n.type==='node').map(n=>({...n,...proj.toLocal([n.lon,n.lat])}))});
  assert.ok(e.crossings.some(x=>!x.signal),c.id+' has a waiting pedestrian decision');
  assert.ok(e.crossings.some(x=>x.signal),c.id+' has signal-controlled pedestrians');
  assert.ok(e.officers.length,c.id+' has a roadside observer');
  for(const p of e.officers)assert.ok(roadClearance(p,roads)>.5,c.id+' officer stays off the carriageway');
 }
});
