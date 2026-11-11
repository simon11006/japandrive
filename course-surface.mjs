// Build a cut/fill road corridor over DEM terrain. Car, road, parking and
// scenery all use this same height field; there is no independent car offset.
import {nearestOnSegment,distance} from './simulation.mjs';
const smooth=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function courseElevation(terrain,roads,tolls=[],parking){
 const segments=[],grid=new Map(),cell=100,key=(x,y)=>`${x}:${y}`;
 for(const r of roads){
  const points=r.points,heights=points.map(p=>terrain(p));
  // Short undulations in a DEM are not an engineered road profile.
  const smoothed=points.map((p,i)=>{let sum=0,total=0;for(let j=Math.max(0,i-8);j<=Math.min(points.length-1,i+8);j++){const d=distance(p,points[j]);if(d>65)continue;const w=1-d/70;sum+=heights[j]*w;total+=w;}return sum/total;});
  for(let i=1;i<points.length;i++){
   const a=points[i-1],b=points[i],radius=r.tags.highway?.startsWith('motorway')?52:32;
   const s={a,b,ha:smoothed[i-1],hb:smoothed[i],radius};segments.push(s);
   for(let x=Math.floor((Math.min(a.x,b.x)-radius)/cell);x<=Math.floor((Math.max(a.x,b.x)+radius)/cell);x++)for(let y=Math.floor((Math.min(a.y,b.y)-radius)/cell);y<=Math.floor((Math.max(a.y,b.y)+radius)/cell);y++){
    const k=key(x,y);if(!grid.has(k))grid.set(k,[]);grid.get(k).push(s);
   }
  }
 }
 const pads=tolls.map(g=>({x:g.x,y:g.y,height:terrain(g),inner:42,outer:95}));
 if(parking)pads.push({...parking.center,height:terrain(parking.center),inner:18,outer:48});
 return p=>{
  let height=terrain(p),nearest=null;
  for(const s of grid.get(key(Math.floor(p.x/cell),Math.floor(p.y/cell)))||[]){const hit=nearestOnSegment(p,s.a,s.b);if(hit.distance<s.radius&&(!nearest||hit.distance<nearest.distance))nearest={...hit,s};}
  if(nearest){const {s,t,distance:d}=nearest,target=s.ha+(s.hb-s.ha)*t,blend=1-smooth((d-s.radius*.6)/(s.radius*.4));height=height*(1-blend)+target*blend;}
  for(const pad of pads){const blend=1-smooth((distance(p,pad)-pad.inner)/(pad.outer-pad.inner));height=height*(1-blend)+pad.height*blend;}
  return height;
 };
}
