import test from 'node:test';
import assert from 'node:assert/strict';
import {DrivingInput,bindDriveAction} from '../drive-input.mjs';
import {VEHICLES,integrateVehicle,selectGear} from '../vehicles.mjs';

test('each finger and keyboard key retains its own brake/steer input',()=>{
 const input=new DrivingInput();input.press(11,'KeyS');input.press(12,'KeyA');input.press(13,'KeyS');
 input.release(12);assert.ok(input.has('KeyS'));assert.equal(input.has('KeyA'),false);
 input.release(11);assert.ok(input.has('KeyS'));input.add('KeyS');input.release(13);assert.ok(input.has('KeyS'));
 input.delete('KeyS');assert.equal(input.has('KeyS'),false);input.press(14,'KeyW');input.clear();assert.equal(input.has('KeyW'),false);
});
test('a second touch changes gear immediately without requiring a compatibility click',()=>{
 const button=new EventTarget(),input=new DrivingInput();input.press(41,'KeyS');let changes=0;
 let state={x:0,y:0,heading:0,steer:0,speed:0,gear:1,parkingBrake:false};
 bindDriveAction(button,()=>{const change=selectGear(state,-state.gear,input.has('KeyS'));assert.ok(change.ok);state=change.state;changes++;});
 const down=new Event('pointerdown',{cancelable:true});Object.assign(down,{pointerId:42,pointerType:'touch',isPrimary:false,button:0});
 button.dispatchEvent(down);assert.equal(state.gear,-1);assert.ok(input.has('KeyS'));assert.equal(changes,1);assert.ok(down.defaultPrevented);
 const click=new Event('click');Object.assign(click,{detail:1});button.dispatchEvent(click);assert.equal(changes,1,'no duplicate shift from compatibility click');
 for(let i=0;i<120;i++)state=integrateVehicle(state,{creep:true,brake:input.has('KeyS')},VEHICLES[0],1/60);
 assert.equal(state.speed,0);assert.equal(state.y,0);
 input.release(41);for(let i=0;i<120;i++)state=integrateVehicle(state,{creep:true},VEHICLES[0],1/60);
 assert.ok(state.y>0,'releases into reverse, never forward');
 const accessible=new Event('click');Object.assign(accessible,{detail:0});input.add('KeyS');state.speed=0;button.dispatchEvent(accessible);assert.equal(state.gear,1);
});
test('shifting requires a stopped vehicle and held brake or parking brake',()=>{
 assert.equal(selectGear({speed:3,gear:1},-1,true).reason,'moving');
 assert.equal(selectGear({speed:0,gear:1},-1,false).reason,'brake');
 assert.ok(selectGear({speed:0,gear:1,parkingBrake:true},-1,false).ok);
 for(const car of VEHICLES){
  let s={x:0,y:0,heading:0,steer:0,speed:1.7,gear:1};
  for(let i=0;i<120;i++)s=integrateVehicle(s,{creep:true,brake:1},car,1/60);
  const shift=selectGear(s,-1,true);assert.ok(shift.ok);s=shift.state;
  const before=s.y;for(let i=0;i<60;i++)s=integrateVehicle(s,{creep:true,brake:1},car,1/60);
  assert.equal(s.speed,0);assert.equal(s.y,before);
 }
});
