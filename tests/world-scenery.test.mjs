import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {projection} from '../map-data.mjs';
import {worldElevation,sampleTerrainGrid} from '../world-terrain.mjs';
import {landscapeCoordinates} from '../world-landscape.mjs';
import {courseElevation} from '../course-surface.mjs';
import {courseParking,courseRoadStore} from '../courses.mjs';
import {distance} from '../simulation.mjs';
const read=async name=>JSON.parse(await readFile(new URL('../'+name,import.meta.url),'utf8'));
test('all overseas routes have continuous finite terrain, stay on land, and end on a level parking pad',async()=>{
 const catalog=await read('data/driving-courses.json'),scenery=await read('data/world-scenery.json');
 for(const c of catalog.courses.filter(c=>c.country!=='JP')){
  const b=await read(c.bundle),data=await read('data/world-terrain/'+c.id+'.json'),p=projection(c.origin),
    raw=worldElevation(data),goal=courseParking(b.parking,p),roads=courseRoadStore(b,p).roads,
    height=courseElevation(raw,roads,[],goal),land=landscapeCoordinates(scenery.courses[c.id],p),route=b.route.geometry.coordinates.map(p.toLocal);
  assert.ok(Math.max(...data.near.heights)-Math.min(...data.near.heights)>10,c.id+' must not be flat');
  for(let i=1;i<route.length;i++){
   const a=route[i-1],z=route[i],length=distance(a,z),n=Math.max(1,Math.ceil(length/2));
   let previous=height(a);
   for(let k=1;k<=n;k++){
    const q={x:a.x+(z.x-a.x)*k/n,y:a.y+(z.y-a.y)*k/n},h=height(q);
    assert.ok(Number.isFinite(h),c.id);assert.ok(!land.waterAt(q),c.id+' route submerged');
    if(length>0)assert.ok(Math.abs(h-previous)/(length/n)<.28,c.id+' has an artificial terrain step');previous=h;
   }
  }
  for(const q of goal.points)assert.ok(Math.abs(height(q)-height(goal.center))<.001,c.id+' parking pad');
  assert.equal(sampleTerrainGrid(data.near,{x:1e8,y:1e8}),null);
 }
});
test('Queenstown lake is water and the town route remains dry',async()=>{
 const scenery=await read('data/world-scenery.json'),s=scenery.courses['nz-queenstown'],p=projection(s.origin),land=landscapeCoordinates(s,p);
 assert.equal(land.waterAt(p.toLocal([168.66,-45.05])),true);
 assert.equal(land.waterLevel,308);
});
