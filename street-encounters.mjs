import {distance,forward,headingBetween,nearestOnSegment,roadWidth,signalPhase,insidePolygon} from './simulation.mjs';
import {roadsideSpace,roadJunctions} from './junctions.mjs';
import {sampleRoute} from './road-markings.mjs';

const pointAt=(c,side)=>({x:c.x+Math.cos(c.heading)*side,y:c.y+Math.sin(c.heading)*side});
const nearest=(p,roads)=>{
  let best={distance:Infinity};
  for(const road of roads)for(let i=1;i<road.points.length;i++){
    const hit=nearestOnSegment(p,road.points[i-1],road.points[i]);
    if(hit.distance<best.distance)best={...hit,road,heading:headingBetween(road.points[i-1],road.points[i])};
  }
  return best;
};
export function pedestrianGreen(c,time) {
  return !c.signal||signalPhase(c.signal,c.heading+Math.PI/2,time)==='green';
}
export function canStartCrossing(c,time,speed=1.35) {
  if(!c.signal)return true;
  // Only start with enough green time to reach the opposite pavement.
  const duration=(c.width+1.6)/speed+.5;
  for(let t=0;t<=duration+.5;t+=.5)if(!pedestrianGreen(c,time+t))return false;
  return true;
}
export function encounterCrossings({roads,signals=[],nodes=[],route=[],features=[],theme}) {
  if(route.length<2||theme==='expressway')return [];
  const clear=roadsideSpace(roads),buildings=features.filter(f=>f.tags?.building);
  const near=p=>Math.min(...route.slice(1).map((b,i)=>nearestOnSegment(p,route[i],b).distance));
  const usable=c=>c.width>=4&&c.width<=14&&near(c)<10&&[-1,1].every(side=>{
    const p=pointAt(c,side*(c.width/2+.8));
    return clear(p,.25)&&!buildings.some(b=>insidePolygon(p,b.points));
  });
  const result=[];
  const add=c=>{if(usable(c)&&!result.some(o=>distance(c,o)<9))result.push(c);};
  for(const s of signals)for(const [i,a]of (s.approaches||[]).entries()){
    const f=forward(a.heading);
    add({id:`walk-${s.id}-${i}`,x:a.stop.x+f.x*3.05,y:a.stop.y+f.y*3.05,heading:a.heading,width:a.width,signal:s.profile==='flash'?null:s,practice:!!s.practice});
  }
  const junctions=roadJunctions(roads);
  for(const n of nodes.filter(n=>n.tags?.highway==='crossing')){
    const hit=nearest(n,roads);if(hit.distance>4||!hit.road||/motorway|trunk|service/.test(hit.road.tags.highway||''))continue;
    if(signals.some(s=>distance(s,hit.point)<28))continue;
    add({id:'walk-'+n.id,...hit.point,heading:hit.heading,width:roadWidth(hit.road.tags),practice:false});
  }
  // A labelled practice crosswalk on a suitable mapped street guarantees a
  // yielding decision even when OSM has no nearby pedestrian crossing node.
  if(!result.some(c=>!c.signal)&&['city','urban','village'].includes(theme)){
    const total=route.slice(1).reduce((n,p,i)=>n+distance(route[i],p),0);
    for(let d=75;d<total-50;d+=12){
      const hit=nearest(sampleRoute(route,d),roads);if(!hit.road||/motorway|trunk|service/.test(hit.road.tags.highway||''))continue;
      const c={id:'practice-walk',...hit.point,heading:hit.heading,width:roadWidth(hit.road.tags),practice:true};
      if(junctions.some(j=>distance(j,c)<22)||signals.some(s=>distance(s,c)<35))continue;
      add(c);if(result.some(c=>!c.signal))break;
    }
  }
  return [...result.filter(c=>!c.signal).slice(0,2),...result.filter(c=>c.signal).slice(0,4)];
}
export class StreetEncounters {
  constructor(options){
    this.crossings=encounterCrossings(options);
    this.people=this.crossings.flatMap((crossing,i)=>[0,1].map(n=>({id:`${crossing.id}-${n}`,crossing,side:n?1:-1,progress:0,walked:0,state:'waiting',active:false,delay:n?1.1:0,speed:1.35+n*.15,heading:crossing.heading+(n?-1:1)*Math.PI/2,kind:'pedestrian',color:['#c76f4d','#46768b','#c5ab69','#668976'][i%4]})));
    // An observer on the pavement, not a traffic controller giving a second
    // set of commands that could contradict the traffic lights.
    this.officers=[];
    const clear=roadsideSpace(options.roads),buildings=(options.features||[]).filter(f=>f.tags?.building);
    for(const c of this.crossings){
      const f=forward(c.heading);
      const p=pointAt(c,-(c.width/2+1));p.x-=f.x*4;p.y-=f.y*4;
      if(clear(p,.5)&&!buildings.some(b=>insidePolygon(p,b.points))){this.officers.push({id:'officer',...p,heading:c.heading+Math.PI/2,state:'standing',kind:'police'});break;}
    }
    this.place();
  }
  place(){for(const p of this.people)Object.assign(p,pointAt(p.crossing,p.side*(p.crossing.width/2+.8)*(1-p.progress*2)));}
  tick(dt,time,player,traffic=[]){
    this.time=time;
    for(const p of this.people){
      if(p.state==='done')continue;
      const c=p.crossing;
      if(distance(c,player)<65)p.active=true;
      if(p.state==='waiting'&&p.active&&canStartCrossing(c,time,p.speed)){
        const danger=[player,...traffic].some(v=>{
          if(!Number.isFinite(v.heading))return false;
          const f=forward(v.heading),ahead=(c.x-v.x)*f.x+(c.y-v.y)*f.y;
          const lateral=Math.abs((c.x-v.x)*f.y-(c.y-v.y)*f.x);
          return lateral<c.width/2+1&&(Math.abs(ahead)<(v.length||4.6)/2+2||ahead>0&&ahead<Math.max(5,Math.abs(v.speed||0)*2.3)&&Math.abs(v.speed||0)>.4);
        });
        if(!danger){p.delay-=dt;if(p.delay<=0)p.state='walking';}
      }
      if(p.state==='walking'){
        const progress=Math.min(1,p.progress+dt*p.speed/(c.width+1.6));
        const next=pointAt(c,p.side*(c.width/2+.8)*(1-progress*2));
        const blocked=[player,...traffic].some(v=>{
          const f=forward(v.heading);
          return Math.abs((next.x-v.x)*f.x+(next.y-v.y)*f.y)<(v.length||4.6)/2+.4&&Math.abs((next.x-v.x)*f.y-(next.y-v.y)*f.x)<(v.width||1.8)/2+.4;
        });
        if(!blocked){p.progress=progress;p.walked+=dt*p.speed;}
        if(p.progress===1)p.state='done';
      }
    }
    this.place();
  }
  priority(c){return this.people.some(p=>p.crossing===c&&(p.state==='walking'||
    (p.active&&p.state==='waiting'&&canStartCrossing(c,this.time??0,p.speed))));}
  approaching(vehicle,max=45){
    const f=forward(vehicle.heading);
    return this.crossings.map(c=>({crossing:c,ahead:(c.x-vehicle.x)*f.x+(c.y-vehicle.y)*f.y,lateral:Math.abs((c.x-vehicle.x)*f.y-(c.y-vehicle.y)*f.x)}))
      .filter(x=>this.priority(x.crossing)&&Math.abs(Math.cos(vehicle.heading-x.crossing.heading))>.6&&x.ahead>-(vehicle.length||4.6)/2&&x.ahead<max&&x.lateral<x.crossing.width/2+.5).sort((a,b)=>a.ahead-b.ahead)[0];
  }
  stopDistance(vehicle,path){
    if(!path){const f=forward(vehicle.heading);path=[vehicle,{x:vehicle.x+f.x*45,y:vehicle.y+f.y*45}];}
    let best=Infinity,travelled=0;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],length=distance(a,b);if(length<.001)continue;
      for(const c of this.crossings){
        if(!this.priority(c))continue;
        const f=forward(c.heading),r={x:Math.cos(c.heading),y:Math.sin(c.heading)},
          from=(a.x-c.x)*f.x+(a.y-c.y)*f.y,to=(b.x-c.x)*f.x+(b.y-c.y)*f.y;
        if(Math.abs(to-from)<length*.55)continue;
        const t=from/(from-to);if(t<0||t>1)continue;
        const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;
        if(Math.abs((x-c.x)*r.x+(y-c.y)*r.y)>c.width/2+.4)continue;
        const ahead=travelled+length*t,front=ahead-(vehicle.length||4.6)/2;
        // A vehicle already occupying the crossing must be allowed to clear;
        // waiting people will not step into it. New approaches stop upstream.
        if(front<1.45&&!this.people.some(p=>p.crossing===c&&p.state==='walking'))continue;
        best=Math.min(best,Math.max(0,front-2.7));
      }
      travelled+=length;
    }
    return best;
  }
  blocksMovement(before,after){
    if(this.blocks(after)&&!this.blocks({...after,...before}))return true;
    const move=distance(before,after);if(move<.001)return false;
    const f=forward(after.heading),extent=after.length/2+3;
    const path=[before,after,{x:after.x+f.x*extent,y:after.y+f.y*extent}];
    const available=this.stopDistance({...after,...before},path);
    return Number.isFinite(available)&&move>available+.02;
  }
  blocks(vehicle){
    const f=forward(vehicle.heading);
    return this.people.find(p=>p.state==='walking'&&Math.abs((p.x-vehicle.x)*f.x+(p.y-vehicle.y)*f.y)<vehicle.length/2+.35&&Math.abs((p.x-vehicle.x)*f.y-(p.y-vehicle.y)*f.x)<vehicle.width/2+.35);
  }
}
