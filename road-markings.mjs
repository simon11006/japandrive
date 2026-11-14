import {distance,forward,headingBetween,nearestOnSegment,roadWidth} from './simulation.mjs';

export function stripPolygon(a,b,width) {
  const length=distance(a,b);if(length<1e-6)return [];
  const x=(b.y-a.y)/length*width/2,y=-(b.x-a.x)/length*width/2;
  return [{x:a.x-x,y:a.y-y},{x:a.x+x,y:a.y+y},{x:b.x+x,y:b.y+y},{x:b.x-x,y:b.y-y}];
}
export function approachMarkings(approach) {
  const f=forward(approach.heading),r={x:Math.cos(approach.heading),y:Math.sin(approach.heading)};
  const point=(side,ahead)=>({x:approach.stop.x+r.x*side+f.x*ahead,y:approach.stop.y+r.y*side+f.y*ahead});
  const left=-approach.width/2+.2,right=approach.oneway?approach.width/2-.2:-.12;
  const stop=stripPolygon(point(left,0),point(right,0),.6),backing=stripPolygon(point(left,0),point(right,0),.86);
  const crossing=[];
  for(let x=-approach.width/2+.4;x<approach.width/2-.35;x+=.95)
    crossing.push([point(x,1.6),point(Math.min(x+.5,approach.width/2-.2),1.6),point(Math.min(x+.5,approach.width/2-.2),4.5),point(x,4.5)]);
  return {stop,backing,crossing};
}
export function sampleRoute(route,along) {
  for(let i=1;i<route.length;i++){
    const a=route[i-1],b=route[i],len=distance(a,b);if(len<.01)continue;
    if(along<=len){const t=Math.max(0,along/len);return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,heading:headingBetween(a,b)};}
    along-=len;
  }
  return {...route.at(-1),heading:headingBetween(route.at(-2),route.at(-1))};
}
export function maneuverGuides(route,steps,roads) {
  if(route.length<2)return [];
  const inLane=p=>{
    let near={distance:Infinity};for(const road of roads)for(let i=1;i<road.points.length;i++){
      const hit=nearestOnSegment(p,road.points[i-1],road.points[i]);if(hit.distance<near.distance)near={...hit,road};
    }
    const oneway=['yes','1','-1'].includes(near.road?.tags.oneway);
    const offset=oneway?0:Math.min(1.65,roadWidth(near.road?.tags)*.23);
    return {...p,x:p.x-Math.cos(p.heading)*offset,y:p.y-Math.sin(p.heading)*offset};
  };
  return steps.filter(s=>s.maneuver.type!=='depart'&&s.maneuver.modifier&&s.maneuver.modifier!=='straight'&&s.atDistance>10).map(s=>{
    const modifier=s.maneuver.modifier,turn=modifier.includes('left')?-1:1;
    const position=inLane(sampleRoute(route,s.atDistance-14));
    const entry=inLane(sampleRoute(route,s.atDistance-8)),exit=inLane(sampleRoute(route,s.atDistance+9));
    const center=sampleRoute(route,s.atDistance),path=[];
    for(let i=0;i<=24;i++){
      const t=i/24,u=1-t;path.push({x:u*u*entry.x+2*u*t*center.x+t*t*exit.x,y:u*u*entry.y+2*u*t*center.y+t*t*exit.y});
    }
    return {position,modifier,turn,path};
  });
}
