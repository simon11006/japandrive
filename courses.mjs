import {distance,forward,headingBetween,nearestOnSegment,vehicleCorners,insidePolygon} from './simulation.mjs';
export const COURSE_STEPS=['코스','차량','교통량','출발 확인'];
export function canVisitStep(target,reached){return Number.isInteger(target)&&target>=1&&target<=4&&target<=reached;}
export function courseTime(course){return `${course.minutes[0]}–${course.minutes[1]}분`;}
export function stars(course){return '★'.repeat(course.stars)+'☆'.repeat(5-course.stars);}
export function courseRoadStore(bundle,proj){
 const roads=bundle.roads.elements.map(e=>({id:String(e.id),tags:e.tags||{},points:e.geometry.map(p=>proj.toLocal([p.lon,p.lat]))}));
 return {roads,hasCoverage:()=>true,ensure:async()=>{},near:(p)=>roads.filter(r=>r.points.some(q=>distance(p,q)<950))};
}
export function courseParking(data,proj){
 let points=data.polygon.map(proj.toLocal);const lotPoints=points;let center=points.reduce((p,q)=>({x:p.x+q.x/points.length,y:p.y+q.y/points.length}),{x:0,y:0});
 const entry={x:(points[0].x+points[1].x)/2,y:(points[0].y+points[1].y)/2},rear={x:(points[2].x+points[3].x)/2,y:(points[2].y+points[3].y)/2};
 let heading=headingBetween(entry,rear);
 if(data.type==='area'){
  const angles=[heading,...points.slice(1).map((p,i)=>headingBetween(points[i],p))];
  // A course has one visible goal bay inside the mapped lot. This rectangle
  // is a game target, not a claim that OSM contains surveyed painted bays.
  const valid=(p,h)=>vehicleCorners({...p,heading:h},{width:2.8,length:5.8}).every(c=>insidePolygon(c,lotPoints));
  let found=null;
  for(const h of angles)if(valid(center,h)){found={...center,heading:h};break;}
  if(!found){const xs=points.map(p=>p.x),ys=points.map(p=>p.y);let best=Infinity;
   for(let x=Math.min(...xs)+1;x<Math.max(...xs);x+=1.5)for(let y=Math.min(...ys)+1;y<Math.max(...ys);y+=1.5)for(const h of angles){const p={x,y},d=distance(center,p);if(d<best&&valid(p,h)){best=d;found={...p,heading:h};}}
  }
  if(!found)throw new Error('목표 주차면을 배치할 공간이 없습니다.');
  center={x:found.x,y:found.y};heading=found.heading;points=vehicleCorners({...center,heading},{width:2.8,length:5.8});
 }
 const goalEntry={x:center.x-Math.sin(heading)*2.9,y:center.y+Math.cos(heading)*2.9};
 return {...data,type:'bay',points,lotPoints,center,entry:data.type==='area'?goalEntry:entry,heading,
  width:data.type==='area'?2.8:distance(points[0],points[1]),length:data.type==='area'?5.8:distance(entry,rear),target:true};
}
export function nearestRouteDistance(point,route){let best=Infinity,along=0,travelled=0;for(let i=1;i<route.length;i++){const hit=nearestOnSegment(point,route[i-1],route[i]),len=distance(route[i-1],route[i]);if(hit.distance<best){best=hit.distance;travelled=along+len*hit.t;}along+=len;}return {distance:best,travelled,total:along};}
// The barrier never opens on a timer alone: ETC needs a low-speed approach,
// while the general lane needs an explicit stopped ticket/payment action.
export class TollSession{
 constructor(gates,mode='etc'){this.mode=mode;this.gates=gates.map(g=>({...g}));this.reset();}
 reset(){this.ticket=false;for(const gate of this.gates){gate.state='closed';gate.opening=0;}}
 update(dt,car,action=false){let message='',blocked=false,violation=false;for(const g of this.gates){
  const f=forward(g.heading),dx=g.x-car.x,dy=g.y-car.y,ahead=dx*f.x+dy*f.y,lateral=Math.abs(dx*f.y-dy*f.x);
  if(g.state==='passed')continue;
  if(ahead>-10&&ahead<90&&lateral<12){
   if(this.mode==='etc'){
    message='ETC · 20 km/h 이하로 감속하고 차단기 개방을 확인하세요';
    if(ahead>2&&ahead<24&&car.speed<=20/3.6){g.state='open';if(g.kind==='entry')this.ticket=true;}
   }else{
    message=g.kind==='entry'?'일반 차로 · 정차 후 Enter / 버튼으로 통행권 받기':'일반 차로 · 정차 후 Enter / 버튼으로 요금 정산';
    if(action&&ahead>0&&ahead<13&&car.speed<.15&&(g.kind==='entry'||this.ticket)){g.state='open';if(g.kind==='entry')this.ticket=true;}
   }
   if(g.state==='open')message='차단기가 열렸습니다. 앞차와 간격을 두고 통과하세요';
   if(ahead<0&&g.state==='open')g.state='passed';
   if(g.opening<.86&&ahead<(car.length||5)/2+1.2&&ahead>-3&&lateral<4){blocked=true;violation=g.state==='closed'&&car.speed>.5;}
  }
  g.opening=Math.min(1,g.opening+(g.state==='closed'?-dt*1.5:dt*1.5));g.opening=Math.max(0,g.opening);
 }
 return {message,blocked,violation,complete:this.gates.every(g=>g.state==='passed')};}
 get complete(){return this.gates.every(g=>g.state==='passed');}
}
export function drawCourseMap(canvas,course,bundle,{compact=false,presentation=false}={}){
 const dpr=Math.min(globalThis.devicePixelRatio||1,2),w=canvas.clientWidth||640,h=canvas.clientHeight||300;
 canvas.width=w*dpr;canvas.height=h*dpr;const c=canvas.getContext('2d');c.setTransform(dpr,0,0,dpr,0,0);
 c.fillStyle=compact||presentation?'#101b29':'#102a31';c.fillRect(0,0,w,h);if(!course?.preview?.length)return;
 const cosine=Math.cos((course.origin?.[1]??course.preview[0][1])*Math.PI/180),pts=course.preview.map(([lon,lat])=>({x:lon*cosine,y:-lat}));
 const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y),cx=(Math.min(...xs)+Math.max(...xs))/2,cy=(Math.min(...ys)+Math.max(...ys))/2;
 const pad=Math.min(compact?34:100,w*.3,h*.3);
 const scale=Math.min((w-pad)/(Math.max(...xs)-Math.min(...xs)||.001),(h-pad)/(Math.max(...ys)-Math.min(...ys)||.001));
 const local=([lon,lat])=>({x:w/2+(lon*cosine-cx)*scale,y:h/2+(-lat-cy)*scale});
 if(bundle)for(const e of [...bundle.scene.elements.filter(e=>e.tags?.building),...bundle.roads.elements]){
  if(!e.geometry)continue;c.beginPath();e.geometry.forEach((p,i)=>{const q=local([p.lon,p.lat]);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});
  if(e.tags.building){c.fillStyle=presentation?'#253342':'#27454a';c.fill();}else{c.strokeStyle=presentation?'#46505e':'#3b5d61';c.lineWidth=2;c.stroke();}
 }
 const route=bundle?.route.geometry.coordinates||course.preview;c.beginPath();route.forEach((p,i)=>{const q=local(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});c.strokeStyle=compact||presentation?'#d6f57c':'#b9efd7';c.lineWidth=compact?2.5:4;c.lineJoin='round';
 if(presentation){c.shadowColor='#d6f57c';c.shadowBlur=12;}c.stroke();c.shadowBlur=0;
 for(const [p,label,color]of [[route[0],'START','#b9efd7'],[route.at(-1),'P','#ffd79b']]){const q=local(p);c.beginPath();c.arc(q.x,q.y,compact?4:8,0,Math.PI*2);c.fillStyle=color;c.fill();c.font='bold 12px sans-serif';if(!compact)c.fillText(label,q.x+14,q.y+4);}
 if(!compact){c.fillStyle='#a7c0c2';c.font='11px sans-serif';c.fillText(presentation?'N ↑':'N ↑  ·  OSM 도로 기반',18,24);}
}
