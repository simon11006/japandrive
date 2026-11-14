import test from 'node:test';
import assert from 'node:assert/strict';
import {navigationScale,navigationBanner,nextNavigationStep,NAV_ANCHOR} from '../navigation.mjs';
test('turn instruction remains until the junction is passed, then advances',()=>{
 const steps=[{atDistance:0,maneuver:{type:'depart'}},{atDistance:100,maneuver:{type:'turn',modifier:'left'}},{atDistance:145,maneuver:{type:'turn',modifier:'right'}},{atDistance:220,maneuver:{type:'arrive'}}];
 for(const at of [80,93,99,100,103]){const n=nextNavigationStep(steps,at,220-at);assert.equal(n.next,steps[1]);assert.ok(n.toTurn>=0);assert.equal(n.then,steps[2]);}
 assert.equal(nextNavigationStep(steps,106,114).next,steps[2]);
});
test('auto zoom keeps the approaching intersection below its banner and enlarges it near the turn',()=>{
 let previous=0;for(const d of [170,120,70,45,25,10]){
  const info={toTurn:d,maneuver:{type:'turn'}},scale=navigationScale(448,7,info),turnY=448*NAV_ANCHOR-d*scale;
  assert.ok(turnY>448*navigationBanner(info)+10,`${d}m turn hidden by banner`);
  assert.ok(scale>=previous);previous=scale;
 }
 assert.ok(navigationBanner({toTurn:20,maneuver:{type:'turn'}})>navigationBanner({toTurn:100,maneuver:{type:'turn'}}));
 assert.equal(navigationScale(448,0,{parking:true,parkingDistance:20}),7);
});
