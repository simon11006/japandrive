// Shared road-space geometry for visible signals, AI stop lines and roadside props.
import {distance,forward,headingBetween,nearestOnSegment,roadWidth,synchronizeSignals,wrapAngle} from './simulation.mjs';

export function roadClearance(point, roads) {
  let clearance=Infinity;
  for(const road of roads) for(let i=1;i<road.points.length;i++)
    clearance=Math.min(clearance,nearestOnSegment(point,road.points[i-1],road.points[i]).distance-roadWidth(road.tags)/2);
  return clearance;
}
export function roadsideSpace(roads) {
  // Index complete segment bounds, including long segments and their width.
  const cells=new Map(),size=30;
  for(const road of roads)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],half=roadWidth(road.tags)/2,segment={a,b,half};
    for(let x=Math.floor((Math.min(a.x,b.x)-half-2)/size);x<=Math.floor((Math.max(a.x,b.x)+half+2)/size);x++)
      for(let y=Math.floor((Math.min(a.y,b.y)-half-2)/size);y<=Math.floor((Math.max(a.y,b.y)+half+2)/size);y++){
        const key=x+':'+y;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(segment);
      }
  }
  return (p,margin=.8)=>(cells.get(Math.floor(p.x/size)+':'+Math.floor(p.y/size))||[])
    .every(s=>nearestOnSegment(p,s.a,s.b).distance>=s.half+margin);
}
export function roadJunctions(roads){
  const vertices=new Map();
  for(const road of roads)road.points.forEach((p,i)=>{
    const key=p.x.toFixed(1)+':'+p.y.toFixed(1);if(!vertices.has(key))vertices.set(key,{...p,arms:[]});
    const v=vertices.get(key);
    for(const j of [i-1,i+1])if(road.points[j]&&distance(p,road.points[j])>.3){
      const h=headingBetween(road.points[j],p);
      if(!v.arms.some(a=>Math.abs(wrapAngle(a.heading-h))<.15))v.arms.push({heading:h,width:roadWidth(road.tags),oneway:['yes','1','true','-1'].includes(road.tags.oneway),incoming:road.tags.oneway==='-1'?j>i:!['yes','1','true'].includes(road.tags.oneway)||j<i});
    }
  });
  return [...vertices.values()].filter(v=>v.arms.length>=3);
}
export function prepareSignalLayouts(signals,roads){
  const junctions=roadJunctions(roads),clear=roadsideSpace(roads);
  for(const s of signals){
    let hit={distance:Infinity};
    for(const r of roads)for(let i=1;i<r.points.length;i++){
      const n=nearestOnSegment(s,r.points[i-1],r.points[i]);if(n.distance<hit.distance)hit={...n,road:r,heading:headingBetween(r.points[i-1],r.points[i])};
    }
    const junction=junctions.filter(j=>distance(s,j)<35).sort((a,b)=>distance(s,a)-distance(s,b))[0];
    // A divided intersection is often a rectangle of 2–4 OSM junction nodes.
    // Use every external incoming arm, not just the nearest corner's arms.
    const cluster=junction?junctions.filter(j=>distance(j,junction)<23):[];
    if(junction){s.x=cluster.reduce((n,j)=>n+j.x,0)/cluster.length;s.y=cluster.reduce((n,j)=>n+j.y,0)/cluster.length;}
    s.approachHeading=s.courseHeading??hit.heading??0;
    s.axis=s.approachHeading;
    const w=hit.road?roadWidth(hit.road.tags):7;
    const arms=[];
    for(const j of cluster)for(const arm of j.arms){
      const f=forward(arm.heading),match=arms.find(a=>a.incoming===arm.incoming&&Math.abs(wrapAngle(a.heading-arm.heading))<.22);
      // The outer/upstream corner places the stop line before the entire junction.
      if(!match)arms.push({...arm,anchor:{x:j.x,y:j.y}});
      else if(j.x*f.x+j.y*f.y<match.anchor.x*f.x+match.anchor.y*f.y)Object.assign(match,{...arm,anchor:{x:j.x,y:j.y}});
    }
    if(!arms.length)arms.push(...[0,Math.PI].map(turn=>({heading:s.axis+turn,width:w,incoming:true,oneway:false,anchor:s})));
    s.approaches=arms.filter(a=>a.incoming).map(a=>{
      const f=forward(a.heading),r={x:Math.cos(a.heading),y:Math.sin(a.heading)};
      const cross=arms.filter(b=>Math.abs(Math.sin(b.heading-a.heading))>.5);
      const setback=Math.max(8,...cross.map(b=>b.width/2+6));
      const anchor=a.anchor||s,offset=(anchor.x-s.x)*r.x+(anchor.y-s.y)*r.y;
      const at=(along,side)=>({x:anchor.x+f.x*along+r.x*side,y:anchor.y+f.y*along+r.y*side});
      const lane=a.oneway?0:-Math.min(1.65,a.width*.23),head=at(setback,lane);
      let pole,best=Infinity;
      for(const extra of [0,3,6,10,16])for(const lateral of [0,3,6,10,16,24])for(const side of [-1,1]){
        const p=at(setback+extra,side*(a.width/2+1.3+lateral)),span=distance(p,head);
        if(span<best&&clear(p,1)){pole=p;best=span;}
      }
      // Split carriageways can occupy both usual corners. Look around the
      // same head for the nearest clear verge instead of planting a pole in it.
      if(!pole)for(let radius=4;radius<=48&&!pole;radius+=2)for(let i=0;i<32;i++){
        const p={x:head.x+Math.cos(i*Math.PI/16)*radius,y:head.y+Math.sin(i*Math.PI/16)*radius};
        if(clear(p,1)){pole=p;break;}
      }
      const stop=at(-setback,0),stopDistance=(s.x-stop.x)*f.x+(s.y-stop.y)*f.y;
      return {...a,offset,stopDistance,stop,head,pole,lane};
    });
  }
  synchronizeSignals(signals);
  return signals;
}
export function approachFor(signal,heading){
  return signal.approaches?.filter(a=>Math.abs(wrapAngle(a.heading-heading))<Math.PI/4)
    .sort((a,b)=>Math.abs(wrapAngle(a.heading-heading))-Math.abs(wrapAngle(b.heading-heading)))[0];
}

// Place pedestrian heads at the two ends of this crosswalk, facing each
// other across the road. Check all carriageways before adding a support.
export function pedestrianSignalMounts(approach,clear){
  const f=forward(approach.heading),r={x:Math.cos(approach.heading),y:Math.sin(approach.heading)};
  const mounts=[];
  for(const side of [-1,1]){
    let mount;
    for(const extra of [.85,1.25,1.8])for(const ahead of [4.8,1.3,5.5]){
      const p={x:approach.stop.x+f.x*ahead+r.x*side*(approach.width/2+extra),
        y:approach.stop.y+f.y*ahead+r.y*side*(approach.width/2+extra)};
      if(!mount&&clear(p,.35))mount={...p,rotation:Math.atan2(-r.x*side,-r.y*side)};
    }
    if(mount)mounts.push(mount);
  }
  return mounts;
}
