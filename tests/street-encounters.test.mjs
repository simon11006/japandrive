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

function turningEncounter(side){
 const roads=[{id:'ns',tags:{width:'7'},points:[{x:0,y:150},{x:0,y:0},{x:0,y:-150}]},
  {id:'ew',tags:{width:'7'},points:[{x:-150,y:0},{x:0,y:0},{x:150,y:0}]}];
 const signals=prepareSignalLayouts([{id:'walk-turn',x:0,y:0,profile:'standard'}],roads);
 const e=new StreetEncounters({roads,signals,route:[{x:0,y:150},{x:0,y:0},{x:side*150,y:0}],theme:'city'});
 const c=e.crossings.find(c=>c.signal&&c.x*side>4&&Math.abs(c.y)<1);
 assert.ok(c);e.crossings=[c];e.people=e.people.filter(p=>p.crossing===c);
 const sim=new TrafficSimulation(roads,signals,{x:0,y:70},2),car=sim.cars[0];
 car.edge=sim.graph.edges.find(e=>e.from.y===150&&e.to.y===0);car.along=car.edge.length-25;car.speed=5;sim.place(car);
 const exit=car.edge.to.out.find(e=>e.to.x===side*150);car.next=exit;sim.cars=[car];
 sim.pedestrianStop=(v,path)=>e.stopDistance(v,path);sim.pedestrianBlocked=(a,b)=>e.blocksMovement?.(a,b)||false;
 const player={x:-20,y:40,heading:0,speed:0,length:4.6,width:1.8};
 let time=0;while(time<100&&!canStartCrossing(c,time))time+=.05;
 return {e,c,sim,car,exit,player,time};
}

test('left and right turning traffic waits before the exit crosswalk until the last pedestrian clears',()=>{
 for(const side of [-1,1]){
  const {e,c,sim,car,exit,player,time}=turningEncounter(side);let waited=false,resumed=false;
  e.people[1].delay=2;
  for(let i=0;i<600;i++){
   const now=time+i*.05;e.tick(.05,now,player,sim.cars);sim.tick(.05,now,player);
   if(e.priority(c)&&car.edge===exit){
    const front=(c.x-car.x)*side-car.length/2;
    assert.ok(front>=2.6,`${side<0?'left':'right'} turn entered crossing with people present: ${front}`);
    if(car.speed<.1){waited=true;assert.ok(car.braking);}
   }
   assert.equal(!!e.blocks(car),false,'turning body never overlaps a walking pedestrian');
   if(e.people.every(p=>p.state==='done')&&car.edge===exit&&(car.x-c.x)*side>10&&car.speed>1)resumed=true;
  }
  assert.ok(waited,'turning car visibly waits');assert.ok(resumed,'car resumes after all pedestrians clear');
 }
});

test('a signal-controlled pedestrian waits on red and starts only on its own green',()=>{
 const {e,c,player}=turningEncounter(1);let red=0;while(pedestrianGreen(c,red))red+=.1;
 e.tick(.1,red,player,[]);assert.ok(e.people.every(p=>p.state==='waiting'));
 let green=red;while(!canStartCrossing(c,green))green+=.1;
 e.tick(.1,green,player,[]);assert.ok(e.people.some(p=>p.state==='walking'));
});

test('turning cars still yield to a person finishing after the pedestrian signal changes to red',()=>{
 for(const side of [-1,1]){
  const {e,c,sim,car,exit,player}=turningEncounter(side);
  let red=0;while(pedestrianGreen(c,red))red+=.1;
  car.edge=exit;car.along=0;car.speed=3;car.next=null;sim.place(car);
  e.people[0].state='walking';e.people[0].progress=.45;e.people[0].active=true;
  e.people[1].state='done';e.place();
  let held=false;
  for(let i=0;i<100;i++){
   e.tick(.1,red,player,sim.cars);sim.tick(.1,red,player);
   if(e.people[0].state==='walking'){
    assert.ok(e.priority(c));
    assert.ok((c.x-car.x)*side-car.length/2>=2.6);
    if(car.speed<.1)held=true;
   }
  }
  assert.ok(held);assert.equal(e.people[0].state,'done');
  assert.ok((car.x-c.x)*side>10,'vehicle resumes once the crossing is empty');
 }
});
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
