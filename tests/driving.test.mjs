import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {REGIONS,projection} from '../map-data.mjs';
import {VEHICLES,integrateVehicle,steeringLimit} from '../vehicles.mjs';
import {bayFromGeo,insidePolygon,parkingStatus,forward,rectanglesOverlap,buildRoadGraph,TrafficSimulation,signalPhase,synchronizeSignals,reverseGuides,distance} from '../simulation.mjs';
import {decodeElevation} from '../terrain.mjs';
import {mappedSpeedLimit,DrivingScore} from '../driving-rules.mjs';
import {DIFFICULTIES} from '../simulation.mjs';
const proj=projection(REGIONS.find(r=>r.id==='okinawa').origin);
const parking=JSON.parse(await readFile(new URL('../data/parking-sites.json',import.meta.url),'utf8'));
const bay={...bayFromGeo(parking,proj.toLocal)[1],type:'bay'};

test('digitized parking goal lies in the mapped shared Hanasaki parking lot',async()=>{
  const scene=JSON.parse(await readFile(new URL('../data/preview-scene.json',import.meta.url),'utf8'));
  const lot=scene.elements.find(e=>e.id===621289983).geometry.map(p=>proj.toLocal([p.lon,p.lat]));
  assert.ok(bay.points.every(p=>insidePolygon(p,lot)));
  for(const car of VEHICLES){assert.ok(bay.width>car.width+.3);assert.ok(bay.length>car.length+.3);}
});
test('parking requires the whole vehicle, alignment, a full stop and a held parking brake',()=>{
  const car=VEHICLES[1],good={...bay.center,heading:bay.heading,speed:0,parkingBrake:true};
  assert.equal(parkingStatus(good,car,bay,2).complete,true);
  assert.equal(parkingStatus({...good,parkingBrake:false},car,bay,3).complete,false);
  assert.equal(parkingStatus({...good,speed:1},car,bay,3).complete,false);
  assert.equal(parkingStatus(good,car,bay,1.9).complete,false);
  assert.equal(parkingStatus({...good,x:good.x+bay.width*.7},car,bay,3).complete,false);
  assert.equal(parkingStatus({...good,heading:good.heading+.3},car,bay,3).complete,false);
});
test('both cars can be driven from the approach into the actual parking goal, stopped and secured',()=>{
  for(const car of VEHICLES){
    const f=forward(bay.heading);let s={x:bay.center.x-f.x*9,y:bay.center.y-f.y*9,heading:bay.heading,speed:0,steer:0,gear:1,parkingBrake:false};
    for(let i=0;i<1800;i++){
      const remaining=(bay.center.x-s.x)*f.x+(bay.center.y-s.y)*f.y;
      const brakingDistance=s.speed*s.speed/(2*(car.braking+.65));
      const brake=remaining<brakingDistance+.03;
      s=integrateVehicle(s,{gas:!brake&&remaining>.03,brake,steer:0},car,1/120);
      if(s.speed<.02&&remaining<.08)break;
    }
    s.parkingBrake=true;assert.ok(distance(s,bay.center)<.2);assert.equal(parkingStatus(s,car,bay,2).complete,true);
  }
});
test('keyboard steering ramps in gradually and remains gentler at road speeds',()=>{
  const c=VEHICLES[0],base={x:0,y:0,heading:0,speed:0,steer:0,gear:1};
  const first=integrateVehicle(base,{gas:false,brake:false,steer:1},c,1/60);
  assert.ok(first.steer<=.00501);assert.ok(first.steer<steeringLimit(c)/100);
  let low={...base},fast={...base,speed:15};
  for(let i=0;i<120;i++){low=integrateVehicle(low,{gas:false,brake:false,steer:1},c,1/60);fast=integrateVehicle({...fast,speed:15},{gas:false,brake:false,steer:1},c,1/60);}
  assert.ok(low.steer>.5);assert.ok(fast.steer<.05);
  const release=integrateVehicle(low,{gas:false,brake:false,steer:0},c,1/60);assert.ok(low.steer-release.steer<.008);assert.ok(release.steer>0);
});
test('traffic graph honors one-way roads and moving cars keep to the left',()=>{
  const roads=[{id:'north',tags:{highway:'primary',oneway:'yes',width:'7'},points:[{x:0,y:0},{x:0,y:-100},{x:0,y:-200}]}];
  const g=buildRoadGraph(roads);assert.equal(g.edges.length,2);assert.ok(g.edges.every(e=>e.to.y<e.from.y));
  const sim=new TrafficSimulation(roads,[],{x:0,y:50},1);assert.equal(sim.cars.length,1);assert.ok(sim.cars[0].x<0);
  const before={...sim.cars[0]};sim.tick(.1,0,{x:1000,y:1000,heading:0,speed:0});assert.ok(sim.cars[0].y<before.y);
});
test('conflicting signal axes never receive simultaneous green',()=>{
  const signal={id:123,axis:0};let greens=0;
  for(let t=0;t<66;t+=.25){const ns=signalPhase(signal,0,t),ew=signalPhase(signal,Math.PI/2,t);assert.ok(!(ns==='green'&&ew==='green'));if(ns==='green')greens++;}
  assert.ok(greens>0);
});
test('collision detection uses vehicle bodies instead of only centre points',()=>{
  const car=VEHICLES[1],a={x:0,y:0,heading:0};assert.equal(rectanglesOverlap(a,car,{x:0,y:4,heading:Math.PI/2},car),false);
  assert.equal(rectanglesOverlap(a,car,{x:0,y:3,heading:0},car),true);
  assert.equal(rectanglesOverlap(a,car,{x:6,y:0,heading:0},car),false);
});
test('GSI elevation decoder handles positive, negative and unavailable heights',()=>{
  assert.equal(decodeElevation(0,3,232),10);assert.equal(decodeElevation(255,255,156),-1);assert.equal(decodeElevation(128,0,0),null);
});
test('separate mapped signals at the same intersection share a non-conflicting cycle',()=>{
  const signals=synchronizeSignals([{id:11,x:0,y:0,approachHeading:0},{id:29,x:15,y:10,approachHeading:Math.PI/2}]);
  assert.equal(signals[0].timingId,signals[1].timingId);
  for(let t=0;t<66;t+=.5)assert.ok(!(signalPhase(signals[0],0,t)==='green'&&signalPhase(signals[1],Math.PI/2,t)==='green'));
});
test('rear camera distance marks originate at the rear bumper and predicted paths react to steering',()=>{
  const car=VEHICLES[1],straight=reverseGuides({x:0,y:0,heading:0,steer:0},car,4);
  assert.ok(Math.abs((straight[5].left.y+straight[5].right.y)/2-(car.length/2+.5))<1e-8);
  assert.ok(Math.abs((straight[10].left.y+straight[10].right.y)/2-(car.length/2+1))<1e-8);
  const curved=reverseGuides({x:0,y:0,heading:0,steer:.35},car,4);
  assert.ok(Math.abs(curved.at(-1).left.x-straight.at(-1).left.x)>.5);
  const prius=reverseGuides({x:0,y:0,heading:0,steer:0},VEHICLES[0],4);
  assert.ok(Math.abs(straight[10].left.x)>Math.abs(prius[10].left.x));
});

test('posted and directional speed limits override the 2026 unmarked-road default',()=>{
  assert.equal(mappedSpeedLimit({maxspeed:'40',centreline:'no'}).value,40);
  assert.equal(mappedSpeedLimit({'maxspeed:forward':'50','maxspeed:backward':'30'},0,0).value,50);
  assert.equal(mappedSpeedLimit({'maxspeed:forward':'50','maxspeed:backward':'30'},Math.PI,0).value,30);
  assert.equal(mappedSpeedLimit({highway:'residential',centreline:'no'}).value,30);
  assert.equal(mappedSpeedLimit({highway:'residential'}).value,null);
  assert.equal(mappedSpeedLimit({maxspeed:'signals'}).value,null);
});
test('a continuous speeding episode is scored once and rearms only after returning to the limit',()=>{
  const score=new DrivingScore();for(let i=0;i<100;i++)score.sustained('speeding',true,.1,i*.1);
  assert.equal(score.events.length,1);assert.equal(score.score,95);
  for(let i=100;i<125;i++)score.sustained('speeding',false,.1,i*.1);
  for(let i=125;i<160;i++)score.sustained('speeding',true,.1,i*.1);
  assert.equal(score.events.length,2);assert.equal(score.score,90);
});
test('arrival score has a bounded total and a complete per-rule breakdown',()=>{
  const score=new DrivingScore();score.add('red',1);score.add('collision',5);score.add('camera',8);
  assert.equal(score.score,70);assert.equal(score.breakdown().find(r=>r.type==='red').count,1);
  assert.equal(score.breakdown().reduce((n,r)=>n+r.penalty,0),30);
  for(let t=12;t<60;t+=4)score.add('red',t);assert.equal(score.score,0);
});
test('all three traffic levels are populated on the real Motobu network without spawning overlapping bodies',async()=>{
  const cache=JSON.parse(await readFile(new URL('../data/preview-cache.json',import.meta.url),'utf8'));
  const roads=cache.roads.elements.map(e=>({id:String(e.id),tags:e.tags||{},points:e.geometry.map(p=>proj.toLocal([p.lon,p.lat]))}));
  const origin=proj.toLocal([127.880073,26.6840203]);
  for(const d of DIFFICULTIES){const sim=new TrafficSimulation(roads,[],origin,d.cars);assert.equal(sim.cars.length,d.cars);for(let i=0;i<sim.cars.length;i++)for(let j=0;j<i;j++)assert.equal(rectanglesOverlap(sim.cars[i],sim.cars[i],sim.cars[j],sim.cars[j]),false);}
});
