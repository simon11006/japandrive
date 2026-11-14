import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingScore,REWARDS,VIOLATIONS} from '../driving-rules.mjs';
import {routeProgress} from '../map-data.mjs';
import {pedestrianSignalMounts,prepareSignalLayouts,roadsideSpace,roadClearance} from '../junctions.mjs';

function distanceRun(score,from,to,{eligible=true,time=10}={}){
  for(let p=from+1;p<=to;p++)score.observeRoute({travelled:p,eligible,speed:10,dt:.1,time:time+(p-from)/10});
}
function wait(score,id='A',time=1){
  for(let i=0;i<12;i++)score.waitAtSignal(id,{dt:.1,stopped:true,frontDistance:2,mustStop:true,time:time+i*.1});
}
test('a trip starts at zero, adds safety rewards and preserves serious early deductions',()=>{
  const score=new DrivingScore();assert.equal(score.score,0);
  score.add('red',1);score.add('wrongWay',5);score.add('collision',9);
  assert.equal(score.score,-70);
  distanceRun(score,0,100,{time:20});
  assert.equal(score.earned,10);assert.equal(score.deducted,70);assert.equal(score.score,-60);
  assert.equal(REWARDS.parking.points,30);
  assert.ok(VIOLATIONS.collision.penalty>VIOLATIONS.speeding.penalty);
});
test('distance rewards require new safe forward progress: idle, reversing and reset cannot farm points',()=>{
  const score=new DrivingScore();distanceRun(score,0,50);assert.equal(score.score,5);
  for(let i=0;i<100;i++)score.observeRoute({travelled:50,eligible:true,speed:0,dt:.1,time:30+i});
  distanceRun(score,0,50);assert.equal(score.score,5,'reset or retracing stays below the previous route peak');
  distanceRun(score,50,100,{eligible:false});assert.equal(score.score,5,'unsafe or reverse travel cannot earn');
  distanceRun(score,50,100);assert.equal(score.score,5,'previously unsafe distance cannot be retraced for points');
  distanceRun(score,100,150,{time:50});assert.equal(score.score,10);
});
test('a route segment jump or teleport cannot earn distance points',()=>{
  const score=new DrivingScore();distanceRun(score,0,40);
  score.observeRoute({travelled:400,eligible:true,speed:8,dt:.1,time:20});
  assert.equal(score.score,0);assert.equal(score.safeDistance,40);
  distanceRun(score,400,410,{time:22});assert.equal(score.score,5);
});
test('real route projection drives distance awards, without treating off-route travel as safe',()=>{
  const route=[{x:0,y:0},{x:0,y:-120}],score=new DrivingScore();
  for(let i=0;i<=120;i++){
    const progress=routeProgress(route,{x:i<60?-1.5:20,y:-i},120);
    score.observeRoute({travelled:progress.travelled,eligible:progress.distance<5,speed:10,dt:.1,time:10+i/10});
  }
  assert.equal(score.score,5);assert.equal(score.safeDistance,59);
});
test('recent violations suspend safe distance rewards',()=>{
  const score=new DrivingScore();score.add('collision',10);
  distanceRun(score,0,50,{time:10});
  assert.equal(score.score,-30);assert.ok(score.safeDistance<50);
});
test('turn rewards need an indicated turn, a correct left-hand exit lane and the route direction',()=>{
  for(const side of [-1,1]){
    const score=new DrivingScore();score.beginTurn('turn',{side,time:10,indicated:true});
    assert.equal(score.completeTurn('turn',{time:15,onLeft:true,aligned:true}).type,side<0?'leftTurn':'rightTurn');
    assert.equal(score.completeTurn('turn',{time:20,onLeft:true,aligned:true}),null);
  }
  for(const failure of ['indicator','lane','direction','contact']){
    const score=new DrivingScore();score.beginTurn('turn',{side:1,time:10,indicated:failure!=='indicator'});
    if(failure==='contact')score.add('collision',11);
    assert.equal(score.completeTurn('turn',{time:15,onLeft:failure!=='lane',aligned:failure!=='direction'}),null);
  }
});
test('waiting at red earns nothing until the same approach is crossed legally',()=>{
  const score=new DrivingScore();wait(score);assert.equal(score.score,0);
  assert.equal(score.passSignal('A',{time:5,compliant:true}).points,10);
  wait(score);assert.equal(score.passSignal('A',{time:8,compliant:true}),null);assert.equal(score.score,10);
});
test('running a red light, stopping after the line, or passing without waiting earns no signal reward',()=>{
  const illegal=new DrivingScore();wait(illegal);illegal.add('red',3);
  assert.equal(illegal.passSignal('A',{time:3,compliant:false}),null);
  const tooLate=new DrivingScore();
  tooLate.waitAtSignal('A',{dt:2,stopped:true,frontDistance:-1,mustStop:true,time:1});
  assert.equal(tooLate.passSignal('A',{time:4,compliant:true}),null);
  const noStop=new DrivingScore();assert.equal(noStop.passSignal('A',{time:4,compliant:true}),null);
  const contact=new DrivingScore();wait(contact);contact.add('collision',2);
  assert.equal(contact.passSignal('A',{time:4,compliant:true}),null);
});
test('pedestrian yielding rewards a stop and a passage after all people clear, just once',()=>{
  const score=new DrivingScore();
  const observe=(front,priority,dt,time)=>score.observeCrossing('walk',{frontDistance:front,priority,stopped:front===4,dt,time,aligned:true});
  observe(15,true,.1,1);observe(4,true,1,2);assert.equal(score.score,0);
  observe(4,false,.1,4);const reward=observe(-.1,false,.1,5);
  assert.equal(reward.points,15);assert.equal(observe(4,true,1,6),null);
  assert.equal(observe(-.1,false,.1,7),null);
});
test('pedestrian infringement and a crossing with no pedestrians do not earn a yielding reward',()=>{
  for(const kind of ['violation','no-pedestrian','still-crossing','no-stop']){
    const score=new DrivingScore(),priority=kind!=='no-pedestrian';
    score.observeCrossing('walk',{frontDistance:4,priority,stopped:kind!=='no-stop',dt:1,time:1,aligned:true});
    if(kind==='violation')score.add('pedestrian',2);
    assert.equal(score.observeCrossing('walk',{frontDistance:-.1,priority:kind==='still-crossing',stopped:false,dt:.1,time:3,aligned:true}),null);
  }
});
test('results report only observed strengths and issues, with balanced totals and advice',()=>{
  const score=new DrivingScore();assert.deepEqual(score.summary().strengths,[]);assert.deepEqual(score.summary().improvements,[]);
  distanceRun(score,0,100);score.add('red',30);score.add('blinker',35);score.add('camera',40);
  const summary=score.finish(50);
  assert.equal(summary.score,20);assert.equal(summary.earned,40);assert.equal(summary.deducted,20);
  assert.equal(summary.strengths.length,2);assert.equal(summary.strengths[0].count,2);
  assert.equal(summary.improvements.length,2);assert.match(summary.improvements[0].detail,/정지선/);
  assert.equal(summary.improvements.find(i=>i.title===VIOLATIONS.blinker.name).penalty,0);
  assert.equal(summary.earned-summary.deducted,summary.score);
});
test('completion awards parking once, freezes the trip, and a new trip starts clean',()=>{
  const score=new DrivingScore(),first=score.finish(10);
  assert.equal(first.score,30);assert.deepEqual(score.finish(20),first);
  score.add('collision',30);score.reward('stop','s',30);distanceRun(score,0,100,{time:30});
  assert.deepEqual(score.summary(),first);assert.equal(new DrivingScore().score,0);
});
test('pedestrian heads face across the crosswalk and never add a pole in a carriageway',()=>{
  const roads=[{tags:{highway:'primary',width:'12'},points:[{x:0,y:100},{x:0,y:0},{x:0,y:-100}]},
    {tags:{highway:'secondary',width:'8'},points:[{x:-100,y:0},{x:0,y:0},{x:100,y:0}]}];
  const signal=prepareSignalLayouts([{id:1,x:0,y:0}],roads)[0],clear=roadsideSpace(roads);
  for(const approach of signal.approaches){
    const mounts=pedestrianSignalMounts(approach,clear);assert.equal(mounts.length,2);
    for(const mount of mounts)assert.ok(roadClearance(mount,roads)>=.35);
    const [a,b]=mounts,dx=b.x-a.x,dy=b.y-a.y;
    assert.ok(Math.sin(a.rotation)*dx+Math.cos(a.rotation)*dy>0);
    assert.ok(Math.sin(b.rotation)*dx+Math.cos(b.rotation)*dy<0);
  }
});
