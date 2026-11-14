import test from 'node:test';
import assert from 'node:assert/strict';
import {leftTrafficStatus} from '../driving-rules.mjs';
import {TrafficSimulation,signalPhase,signalRightArrow,wrapAngle} from '../simulation.mjs';
import {prepareSignalLayouts} from '../junctions.mjs';

test('after left or right turns, the left lane is correct in every compass direction',()=>{
 for(const heading of [0,Math.PI/2,Math.PI,-Math.PI/2]){
  const lane={point:{x:0,y:0},heading,distance:1.5,road:{tags:{width:'7',highway:'residential'}}};
  const left={x:-Math.cos(heading)*1.5,y:-Math.sin(heading)*1.5,heading,gear:1};
  assert.ok(leftTrafficStatus(left,lane).correct);
  assert.ok(leftTrafficStatus({...left,x:-left.x,y:-left.y},lane).wrong);
  assert.ok(leftTrafficStatus({...left,x:-left.x,y:-left.y,heading:heading+Math.PI},lane).correct,'opposite direction uses the other physical half');
  assert.equal(leftTrafficStatus({...left,x:-left.x,y:-left.y},lane,{inJunction:true}).wrong,false,'legal turn across the opposing half is not penalised');
 }
});
test('one-way directions and parking manoeuvres have separate lane checks',()=>{
 const lane={point:{x:0,y:0},heading:0,distance:1,road:{tags:{width:'6',oneway:'yes'}}};
 assert.ok(leftTrafficStatus({x:1,y:0,heading:0,gear:1},lane).correct);
 assert.ok(leftTrafficStatus({x:1,y:0,heading:Math.PI,gear:1},lane).wrong);
 assert.equal(leftTrafficStatus({x:1,y:0,heading:Math.PI,gear:-1},lane).wrong,false);
 assert.equal(leftTrafficStatus({x:1,y:0,heading:Math.PI,gear:1},lane,{inLot:true}).wrong,false);
});
test('an unprotected right turn waits for an approaching straight vehicle; the right arrow releases it',()=>{
 const roads=[{id:'ns',tags:{width:'7'},points:[{x:0,y:150},{x:0,y:0},{x:0,y:-150}]},{id:'ew',tags:{width:'7'},points:[{x:-150,y:0},{x:0,y:0},{x:150,y:0}]}];
 for(const arrow of [false,true]){
  const [signal]=prepareSignalLayouts([{id:'yield-check',x:0,y:0,profile:'arrow'}],roads),sim=new TrafficSimulation(roads,[signal],{x:0,y:100},2);
  const turn=sim.cars[0],straight=sim.cars[1];
  for(const [car,fromY,remaining] of [[turn,150,14],[straight,-150,30]]){car.edge=sim.graph.edges.find(e=>e.from.y===fromY&&e.to.y===0);car.along=car.edge.length-remaining;car.speed=car===turn?3:8;sim.place(car);}
  turn.next=turn.edge.to.out.find(e=>e.to.x===150);straight.next=straight.edge.to.out.find(e=>e.to.y===150);
  let time=0;while(!(arrow?signalRightArrow(signal,turn.heading,time):signalPhase(signal,turn.heading,time)==='green'))time+=.1;
  sim.tick(.1,time,{x:999,y:999});
  if(arrow){assert.ok(turn.speed>3);assert.equal(turn.braking,false);}
  else {assert.ok(turn.speed<3);assert.ok(turn.braking);assert.notEqual(sim.junctionOwners.get(signal.timingId)?.car,turn);}
 }
});
test('opposing AI traffic occupies separate left-hand lanes',()=>{
 const roads=[{id:'r',tags:{width:'7',highway:'secondary'},points:[{x:0,y:150},{x:0,y:-150}]}];
 const sim=new TrafficSimulation(roads,[],{x:0,y:0},8);
 for(const car of sim.cars){const side=car.x*Math.cos(car.heading);assert.ok(side<-.5);}
 assert.ok(sim.cars.some(c=>Math.abs(wrapAngle(c.heading))<.1));assert.ok(sim.cars.some(c=>Math.abs(wrapAngle(c.heading-Math.PI))<.1));
});
