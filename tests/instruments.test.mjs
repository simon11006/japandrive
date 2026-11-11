import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {buildCockpit} from '../cockpit.mjs';
import {VEHICLES} from '../vehicles.mjs';
import {driverEye,viewSettings} from '../driver-view.mjs';
const ctx=new Proxy({},{get:(_,key)=>key==='measureText'?()=>({width:10}):key==='createLinearGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>ctx})};
for(const car of VEHICLES)test(`${car.id}: speed readout is visible through the cockpit at every permitted seat position`,()=>{
 const parent=new T.Group(),cockpit=buildCockpit({parent,car,navTexture:new T.Texture(),meterTexture:new T.Texture()}),ray=new T.Raycaster(),point=new T.Vector3();
 const blockers=[];parent.traverse(o=>{if(o.isMesh&&o!==cockpit.meter&&!([o.material].flat().every(m=>m.transparent&&m.opacity<.2)))blockers.push(o);});
 for(const seatForward of [-.1,0,.12])for(const seatHeight of [-.06,0,.08])for(const steering of [0,-Math.PI/2,Math.PI/2]){
  cockpit.wheel.rotation.z=steering;parent.updateMatrixWorld(true);const eye=driverEye(car,cockpit.layout,viewSettings({seatForward,seatHeight}));let seen=0,total=0;const hits=new Map();
  // Texture pixels occupied by the large numeric speed, not an empty screen edge.
  const cx=car.id==='prius'?.255:.5,cy=car.id==='prius'?.52:.49,width=car.id==='prius'?.15:.16,height=car.id==='prius'?.6:.35;
  for(let x=0;x<=6;x++)for(let y=0;y<=4;y++){
   point.set((cx+(x/6-.5)*width-.5)*cockpit.layout.meterWidth,(.5-cy-(y/4-.5)*height)*cockpit.layout.meterHeight,0);cockpit.meter.localToWorld(point);
   const d=point.clone().sub(eye);ray.set(eye,d.clone().normalize());ray.far=d.length()-.002;const hit=ray.intersectObjects(blockers,false)[0];if(!hit)seen++;else hits.set(hit.object.name||hit.object.type,(hits.get(hit.object.name||hit.object.type)||0)+1);total++;
  }
  assert.ok(seen/total>.96,`seat ${seatForward}/${seatHeight}, wheel ${steering}: ${seen}/${total} visible; blockers ${JSON.stringify([...hits])}`);
 }
});
