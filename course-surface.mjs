// Build a cut/fill road corridor over DEM terrain. Car, road, parking and
// scenery all use this same height field; there is no independent car offset.
import {nearestOnSegment,distance} from './simulation.mjs';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function courseElevation(terrain,roads,tolls=[],parking){
 // The overseas DEM has already been smoothed over a continuous grid. A
 // second, per-way filter would create artificial ramps between OSM ways.
 if(terrain.data?.near){
  const pads=tolls.map(g=>({...g,height:terrain(g),inner:42,outer:120}));
  if(parking)pads.push({...parking.center,height:terrain(parking.center),inner:18,outer:110});
  return p=>{let h=terrain(p);for(const pad of pads){const blend=1-smooth((distance(p,pad)-pad.inner)/(pad.outer-pad.inner));h=h*(1-blend)+pad.height*blend;}return h;};
 }
 const segments=[],grid=new Map(),cell=100,key=(x,y)=>`${x}:${y}`,vertices=new Map();
 const vertex=(p,h)=>{const k=p.x.toFixed(2)+':'+p.y.toFixed(2);if(!vertices.has(k))vertices.set(k,{total:0,count:0});const v=vertices.get(k);v.total+=h;v.count++;return v;};
 for(const r of roads){
  const points=r.points,heights=points.map(p=>terrain(p));
  // Short undulations in a DEM are not an engineered road profile.
  const smoothed=points.map((p,i)=>{let sum=0,total=0;for(let j=Math.max(0,i-8);j<=Math.min(points.length-1,i+8);j++){const d=distance(p,points[j]);if(d>65)continue;const w=1-d/70;sum+=heights[j]*w;total+=w;}return sum/total;});
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],radius=r.tags.highway?.startsWith('motorway')?52:32;
   const s={a,b,va:vertex(a,smoothed[i-1]),vb:vertex(b,smoothed[i]),radius};segments.push(s);
   for(let x=Math.floor((Math.min(a.x,b.x)-radius)/cell);x<=Math.floor((Math.max(a.x,b.x)+radius)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-radius)/cell);y<=Math.floor((Math.max(a.y,b.y)+radius)/cell);y++){
    const k=key(x,y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(s);
   }
  }
 }
 for(const s of segments){s.ha=s.va.total/s.va.count;s.hb=s.vb.total/s.vb.count;}
 const pads=tolls.map(g=>({x:g.x,y:g.y,height:terrain(g),inner:42,outer:95}));
 if(parking)pads.push({...parking.center,height:terrain(parking.center),inner:18,outer:48});
 return p=>{
  let height=terrain(p),weight=0,total=0,blend=0;
  // Blend overlapping road corridors continuously. Picking only the nearest
  // independently smoothed way made a vertical step at split OSM junctions.
  for(const s of grid.get(key(Math.floor(p.x/cell),Math.floor(p.y/cell)))||[]){
   const hit=nearestOnSegment(p,s.a,s.b),d=hit.distance;if(d>=s.radius)continue;
   const w=(1-smooth(d/s.radius))**2/(4+d*d);
   total+=(s.ha+(s.hb-s.ha)*hit.t)*w;weight+=w;
   blend=Math.max(blend,1-smooth((d-s.radius*.6)/(s.radius*.4)));
  }
  if(weight>0)height=height*(1-blend)+total/weight*blend;
  for(const pad of pads){const blend=1-smooth((distance(p,pad)-pad.inner)/(pad.outer-pad.inner));height=height*(1-blend)+pad.height*blend;}
  return height;
 };
}
