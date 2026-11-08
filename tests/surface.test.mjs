import test from'node:test';import assert from'node:assert/strict';
import{groundSurface,ribbonSections,surfacePose}from'../road-surface.mjs';
import{COCKPITS}from'../cockpit-layout.mjs';
import{routeProgress}from'../map-data.mjs';
function sampleTriangle(p,a,b,c){const den=(b.y-c.y)*(a.x-c.x)+(c.x-b.x)*(a.y-c.y);if(Math.abs(den)<1e-9)return null;const u=((b.y-c.y)*(p.x-c.x)+(c.x-b.x)*(p.y-c.y))/den,v=((c.y-a.y)*(p.x-c.x)+(a.x-c.x)*(p.y-c.y))/den,w=1-u-v;return Math.min(u,v,w)<-1e-7?null:a.height*u+b.height*v+c.height*w;}
test('draped roads and terrain share exact heights over a non-planar hill, including long segments',()=>{
  const surface=groundSurface(p=>15+8*Math.sin(p.x/36)+5*Math.cos(p.y/27)),quads=ribbonSections([{x:-150,y:130},{x:160,y:-110}],8),triangles=surface.drape(quads[0],.12);
  assert.ok(triangles.length>60);for(let i=0;i<triangles.length;i+=3){const [a,b,c]=triangles.slice(i,i+3),mid={x:(a.x+b.x+c.x)/3,y:(a.y+b.y+c.y)/3};assert.ok(Math.abs(sampleTriangle(mid,a,b,c)-surface.height(mid)-.12)<1e-8);}
});
test('mitred road strips meet at bends without disconnected corner vertices',()=>{
  const strips=ribbonSections([{x:0,y:0},{x:0,y:40},{x:40,y:40},{x:55,y:20}],7);for(let i=1;i<strips.length;i++){assert.deepEqual(strips[i-1][2],strips[i][1]);assert.deepEqual(strips[i-1][3],strips[i][0]);}
});
test('vehicle pitch and roll follow the same road support plane',()=>{
  const height=p=>.1*p.x-.08*p.y+30,pose=surfacePose(height,{x:100,y:-40},0,3,1.6);assert.ok(Math.abs(pose.height-height({x:100,y:-40}))<1e-9);assert.ok(Math.abs(Math.tan(pose.pitch)-.08)<1e-9);assert.ok(Math.abs(Math.tan(pose.roll)-.1)<1e-9);
});
test('a terrain chunk change never changes the global ground sampling lattice',()=>{
  const s=groundSurface(p=>Math.sin(p.x/25)*10+p.y*.02),p={x:-713.4,y:882.8},before=s.height(p);s.height({x:3000,y:4000});s.clear();assert.equal(s.height(p),before);
});
test('car-specific cockpit layouts retain 8 and 14 inch screens and different windshield rake',()=>{
  assert.ok(Math.abs(Math.hypot(COCKPITS.prius.screenWidth,COCKPITS.prius.screenHeight)/.0254-8)<.05);assert.ok(Math.abs(Math.hypot(COCKPITS.alphard.screenWidth,COCKPITS.alphard.screenHeight)/.0254-14)<.05);assert.ok(COCKPITS.prius.glassTop-COCKPITS.prius.glassBottom>COCKPITS.alphard.glassTop-COCKPITS.alphard.glassBottom);
});
test('navigation uses the measured route length, so a long map projection does not shift turn guidance',()=>{
  const path=[{x:0,y:0},{x:10030,y:0},{x:10030,y:60180}],reported=70000;
  assert.equal(routeProgress(path,path[0],reported).remaining,reported);
  const station=routeProgress(path,path[1],reported),before=routeProgress(path,{x:10000,y:0},reported);assert.ok(Math.abs(station.travelled-before.travelled-29.910269)<.00001);assert.equal(station.travelled+station.remaining,reported);
});
