import * as THREE from './vendor/three.module.js';
import {roadWidth,nearestOnSegment,distance,insidePolygon,headingBetween} from './simulation.mjs';
import {ribbonSections} from './road-surface.mjs';
import {pointInRing} from './map-data.mjs';
import {roadsideSpace} from './junctions.mjs';
import {CITY_STYLES,buildingHeight} from './city-style.mjs';
import {facadeTexture} from './graphics.mjs';
const material=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.85,...extra});
const hash=id=>{let n=2166136261;for(const c of String(id))n=Math.imul(n^c.charCodeAt(0),16777619);return n>>>0;};
let leafTexture;
function foliageTexture(){
 if(leafTexture)return leafTexture;
 const c=document.createElement('canvas');c.width=c.height=256;const ctx=c.getContext('2d');
 ctx.fillStyle='#537341';ctx.fillRect(0,0,256,256);
 let seed=48271;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let i=0;i<4200;i++){const x=random()*256,y=random()*256,r=1+random()*3;
  ctx.fillStyle=['#183d2b','#3d6837','#789853','#acc572','#567c43'][i%5];ctx.beginPath();ctx.ellipse(x,y,r,r*.5,random()*Math.PI,0,Math.PI*2);ctx.fill();
 }
 leafTexture=new THREE.CanvasTexture(c);leafTexture.colorSpace=THREE.SRGBColorSpace;leafTexture.wrapS=leafTexture.wrapT=THREE.RepeatWrapping;leafTexture.repeat.set(2,1);return leafTexture;
}
// Static repeated details share geometry and are submitted in instanced batches.
class Details {
 constructor(group,local){this.group=group;this.local=local;this.batches=new Map();this.object=new THREE.Object3D();}
 add(shape,color,point,size,rotation=0){
  const key=shape+color;let b=this.batches.get(key);
  if(!b){let geo=shape==='tree'?new THREE.SphereGeometry(1,12,8):shape==='pole'?new THREE.CylinderGeometry(.35,.5,1,8):new THREE.BoxGeometry(1,1,1);
   if(shape==='tree'){const p=geo.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),noise=1+.12*Math.sin(x*19+z*9)*Math.cos(y*17);p.setXYZ(i,x*noise,y*noise,z*noise);}geo.computeVertexNormals();}
   b={geo,mat:material(shape==='tree'?'#aec39f':color,shape==='tree'?{map:foliageTexture()}:{}),matrices:[]};this.batches.set(key,b);}
  this.object.position.copy(this.local(point,point.h||0));this.object.rotation.set(0,rotation,0);this.object.scale.set(...size);this.object.updateMatrix();b.matrices.push(this.object.matrix.clone());
 }
 finish(){for(const b of this.batches.values()){const m=new THREE.InstancedMesh(b.geo,b.mat,b.matrices.length);b.matrices.forEach((v,i)=>m.setMatrixAt(i,v));m.castShadow=true;m.receiveShadow=true;this.group.add(m);}}
}
function label(text,bg='#365f60',fg='#fff7da'){
 const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,96);ctx.fillStyle=fg;ctx.font='bold 48px sans-serif';ctx.textAlign='center';ctx.fillText(text,256,64,480);
 const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;return new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide});
}
function meshFrom(positions,mat,uv){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));if(uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.computeVertexNormals();const m=new THREE.Mesh(g,mat);m.castShadow=true;m.receiveShadow=true;return m;}
function nearestRoad(p,roads){let hit={distance:Infinity};for(const r of roads)for(let i=1;i<r.points.length;i++){const q=nearestOnSegment(p,r.points[i-1],r.points[i]);if(q.distance<hit.distance)hit={...q,road:r,heading:headingBetween(r.points[i-1],r.points[i])};}return hit;}

export function buildCourseBuildings(renderer,features,theme,roads,nodes=[],style='okinawa'){
 const group=renderer.buildingGroup,base=renderer.base,local=(p,h=0)=>renderer.local(p,h),details=new Details(group,local);
 const walls=renderer.facades.map(()=>({p:[],uv:[]})),roof=[],pitchedRoof=[];let signCount=0;
 const buildings=features.filter(f=>f.tags.building);
 const urban=['city','urban'].includes(theme);
 const profile=CITY_STYLES[style]||CITY_STYLES.okinawa;
 const facades=profile.colors.map(color=>material('#ffffff',{map:facadeTexture(color,profile.glass?'office':'standard')}));
 const routeRoads=roads.filter(r=>r.tags.highway!=='service');
 for(const f of buildings){
  const seed=hash(f.id),level=Number(f.tags['building:levels']);
  const h=buildingHeight(f,style,seed,urban);
  const ground=Math.min(...f.points.map(p=>renderer.elevation(p))),top=ground+h;
  const bucket=walls[seed%walls.length],pts=f.points;
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i],len=distance(a,b);if(len<.1)continue;
   const vertices=[[a.x,ground-1,a.y],[b.x,ground-1,b.y],[b.x,top,b.y],[a.x,top,a.y]];
   const uv=[[0,0],[len,0],[len,h+1],[0,h+1]];
   for(const k of [0,2,1,0,3,2]){const v=vertices[k];bucket.p.push(v[0]-base.x,v[1],v[2]-base.y);bucket.uv.push(...uv[k]);}
  }
  const shape=pts.slice(0,-1).map(p=>new THREE.Vector2(p.x,p.y));
  for(const tri of THREE.ShapeUtils.triangulateShape(shape,[]))for(const i of tri.reverse())roof.push(shape[i].x-base.x,top,shape[i].y-base.y);
  // Roof parapets, water tanks and air conditioners give the concrete skyline depth.
  for(let i=1;i<pts.length;i++){
   const a=pts[i-1],b=pts[i],len=distance(a,b);if(len>2)details.add('box','#c7c4b9',{x:(a.x+b.x)/2,y:(a.y+b.y)/2,h:top-renderer.elevation({x:(a.x+b.x)/2,y:(a.y+b.y)/2})+.3},[.16,.6,len],-headingBetween(a,b));
  }
  if(seed%3===0){if(style==='okinawa')details.add('pole','#ced5d0',{...f.center,h:top-renderer.elevation(f.center)+.8},[1.35,1.5,1.35]);details.add('box','#a9b3b1',{x:f.center.x+2,y:f.center.y,h:top-renderer.elevation({x:f.center.x+2,y:f.center.y})+.4},[1.2,.8,.8]);}
  if(style==='kyoto'&&h<13&&pts.length===5){
    const a=pts[0],b=pts[1],c=pts[2],d=pts[3],u={x:(a.x+d.x)/2,y:(a.y+d.y)/2},v={x:(b.x+c.x)/2,y:(b.y+c.y)/2};
    const roofVertices=[];for(const tri of [[a,b,v],[a,v,u],[d,u,v],[d,v,c]])for(const p of tri)roofVertices.push(p.x-base.x,top+(p===u||p===v?1.4:.15),p.y-base.y);
    pitchedRoof.push(...roofVertices);
  }
  // Decorate only frontages near a street; actual map outlines keep alleys open.
  if(!urban&&seed%5)continue;
  if(renderer.course?.route&&!renderer.course.route.some(p=>distance(p,f.center)<90))continue;
  const near=nearestRoad(f.center,routeRoads);if(near.distance>45)continue;
  let front=null;
  for(let i=1;i<pts.length;i++){const a=pts[i-1],b=pts[i],mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2},d=distance(mid,near.point);if(!front||d<front.d)front={a,b,mid,d};}
  const len=distance(front.a,front.b);if(len<4)continue;
  const toward={x:near.point.x-front.mid.x,y:near.point.y-front.mid.y},norm=Math.hypot(toward.x,toward.y)||1;
  const p={x:front.mid.x+toward.x/norm*.2,y:front.mid.y+toward.y/norm*.2};
  const rotation=Math.atan2(toward.x,toward.y),width=Math.min(len*.8,9);
  details.add('box','#263f45',{...p,h:ground-renderer.elevation(p)+1.55},[width,2.4,.12],rotation);
  for(let d=-width/2;d<=width/2;d+=1.5)details.add('box','#c9cdc8',{x:p.x+Math.cos(rotation)*d,y:p.y-Math.sin(rotation)*d,h:ground-renderer.elevation(p)+1.55},[.07,2.45,.17],rotation);
  details.add('box',['#748f81','#c78663','#536f79','#c5b491'][seed%4],{...p,h:ground-renderer.elevation(p)+3},[width+.2,.2,1.05],rotation);
  // Nearby named POIs are used when mapped; otherwise use generic shop types.
  const poi=nodes.find(n=>n.tags?.name&&(n.tags.shop||n.tags.amenity)&&distance(n,f.center)<18);
  const name=poi?.tags.name||f.tags.name||profile.shops[seed%6];
  if(signCount++>240)continue;
  const sign=new THREE.Mesh(new THREE.PlaneGeometry(Math.min(width,7),.7),label(name,['#355c61','#7e3e2e','#324b78','#e4dcc6'][seed%4],seed%4===3?'#284744':'#fff6da'));
  sign.position.copy(local({x:p.x+toward.x/norm*.58,y:p.y+toward.y/norm*.58},ground-renderer.elevation(p)+3.5));sign.rotation.y=rotation;group.add(sign);
  if(h>6&&(f.tags.building==='apartments'||style==='okinawa'))for(let level=1;level<Math.min(5,Math.floor(h/3.1));level++){
   details.add('box','#b9bab3',{...p,h:ground-renderer.elevation(p)+level*3.1+.45},[width,.12,.75],rotation);
   details.add('box','#c6ccc7',{...p,h:ground-renderer.elevation(p)+level*3.1+1.1},[width,.08,.82],rotation);
  }
 }
 walls.forEach((b,i)=>{if(b.p.length){const m=facades[i];m.side=THREE.DoubleSide;group.add(meshFrom(b.p,m,b.uv));}});
 if(roof.length)group.add(meshFrom(roof,material('#c4c6bc')));
 if(pitchedRoof.length)group.add(meshFrom(pitchedRoof,material('#51514c',{side:THREE.DoubleSide})));
 // Parking is visible asphalt; it must not disappear into an aerial photograph.
 const parking=[];for(const f of features.filter(f=>f.tags.amenity==='parking'))for(const p of renderer.surface.drape(f.points,.135))parking.push(p.x-base.x,p.height,p.y-base.y);
 if(parking.length)group.add(meshFrom(parking,material('#697471',{map:renderer.textures.asphalt})));
 details.finish();
}

export function buildCourseEnvironment(renderer,{theme,style='okinawa',roads,features,nodes,route,coast,tolls}){
 const group=renderer.environmentGroup,local=(p,h=0)=>renderer.local(p,h),details=new Details(group,local),base=renderer.base;
 const urban=['city','urban'].includes(theme),mountain=theme==='mountain'||theme==='expressway';
 const offRoad=roadsideSpace(roads),occupied=features.filter(f=>f.tags.building||f.tags.amenity==='parking');
 const clear=p=>offRoad(p,.85)&&!occupied.some(f=>insidePolygon(p,f.points));
 renderer.roadsideProps=[];
 const profile=CITY_STYLES[style]||CITY_STYLES.okinawa;
 for(const f of features.filter(f=>f.tags.leisure==='park'||f.tags.natural==='water')){
   const positions=renderer.surface.drape(f.points,.10).flatMap(p=>[p.x-base.x,p.height,p.y-base.y]);
   if(positions.length)group.add(meshFrom(positions,material(f.tags.natural==='water'?'#4e8187':'#7e9563')));
 }
 const polygons={walk:[],mark:[],rails:[]};
 const add=(kind,polygon,lift)=>{for(const p of renderer.surface.drape(polygon,lift))polygons[kind].push(p.x-base.x,p.height,p.y-base.y);};
 const nearRoute=p=>{for(let i=1;i<route.length;i++)if(nearestOnSegment(p,route[i-1],route[i]).distance<180)return true;return false;};
 // Sidewalks, guardrails, drains, streetlights and utility lines frame the road.
 const cables=[];
 for(const road of roads){
  if(road.tags.highway==='service'||!road.points.some(nearRoute))continue;
  const w=roadWidth(road.tags),highway=road.tags.highway.startsWith('motorway'),walk=urban&&!highway&&w>=6;
  if(walk)for(let i=1;i<road.points.length;i++){
    const a=road.points[i-1],b=road.points[i],len=distance(a,b),steps=Math.ceil(len/5);
    for(let j=0;j<steps;j++)for(const side of [-1,1]){
      const aa={x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps},bb={x:a.x+(b.x-a.x)*(j+1)/steps,y:a.y+(b.y-a.y)*(j+1)/steps};
      const q=ribbonSections([aa,bb],2,side*(w/2+1))[0],mid=q.reduce((p,v)=>({x:p.x+v.x/4,y:p.y+v.y/4}),{x:0,y:0});
      const crosses=roads.some(other=>other!==road&&other.points.some((p,k)=>k&&nearestOnSegment(mid,other.points[k-1],p).distance<roadWidth(other.tags)/2+.8));
      if(!crosses)add('walk',q,.23);
    }
  }
  let remainder=0,previousPole=null;
  for(let i=1;i<road.points.length;i++){
   const a=road.points[i-1],b=road.points[i],len=distance(a,b),h=headingBetween(a,b),r={x:Math.cos(h),y:Math.sin(h)};
   if(!len)continue;
   for(let d=remainder;d<len;d+=walk?32:42){
    const p={x:a.x+(b.x-a.x)*d/len,y:a.y+(b.y-a.y)*d/len},side=1,at={x:p.x+r.x*(w/2+(walk?1.6:1.1))*side,y:p.y+r.y*(w/2+(walk?1.6:1.1))*side};
    if(!nearRoute(at)||!clear(at))continue;
    if(urban||road.tags.lit==='yes'){
     renderer.roadsideProps.push({kind:'lamp',...at});
     details.add('pole','#6b7779',{...at,h:4.1},[.15,8.2,.15]);details.add('box','#737e80',{x:at.x-r.x*.6,y:at.y-r.y*.6,h:8.1},[1.4,.09,.12],-h);details.add('box','#e3e7d6',{x:at.x-r.x*1.15,y:at.y-r.y*1.15,h:8},[.7,.12,.26],-h);
    }
    if(!highway&&(urban||theme==='village')){
     const pole={x:at.x+r.x*.6,y:at.y+r.y*.6};if(!clear(pole)){previousPole=null;continue;}renderer.roadsideProps.push({kind:'utility',...pole});details.add('pole','#a1a69f',{...pole,h:4.9},[.26,9.8,.26]);details.add('box','#525c59',{...pole,h:8.8},[1.7,.13,.18],-h);
     if(previousPole)for(const off of [-.55,.55]){const av=local({x:previousPole.x+r.x*off,y:previousPole.y+r.y*off},8.8),bv=local({x:pole.x+r.x*off,y:pole.y+r.y*off},8.8);cables.push(...av.toArray(),(av.x+bv.x)/2,(av.y+bv.y)/2-.55,(av.z+bv.z)/2,(av.x+bv.x)/2,(av.y+bv.y)/2-.55,(av.z+bv.z)/2,...bv.toArray());}previousPole=pole;
    }
   }const spacing=walk?32:42;remainder=((remainder-len)%spacing+spacing)%spacing;
   if(mountain||theme==='coast'){
    for(const side of [-1,1]){const offset=w/2+.65,aa={x:a.x+r.x*offset*side,y:a.y+r.y*offset*side},bb={x:b.x+r.x*offset*side,y:b.y+r.y*offset*side};
     for(let d=0;d<len;d+=4){const p={x:aa.x+(bb.x-aa.x)*d/len,y:aa.y+(bb.y-aa.y)*d/len};if(offRoad(p,.45))details.add('pole','#d1d7d1',{...p,h:.55},[.10,1.1,.10]);}
     const mid={x:(aa.x+bb.x)/2,y:(aa.y+bb.y)/2};
     for(let d=0;d<len;d+=3){const end=Math.min(len,d+3),p={x:aa.x+(bb.x-aa.x)*(d+end)/2/len,y:aa.y+(bb.y-aa.y)*(d+end)/2/len};if(offRoad(p,.45)&&offRoad({x:aa.x+(bb.x-aa.x)*d/len,y:aa.y+(bb.y-aa.y)*d/len},.45))details.add('box','#d6ddd5',{...p,h:.85},[.12,.28,end-d],-h);}
     // Retaining walls occur on the rising side of a hill, not both sides indiscriminately.
     if(mountain&&renderer.elevation({x:mid.x+r.x*side*10,y:mid.y+r.y*side*10})>renderer.elevation(mid)+3)details.add('box','#808b7a',{...mid,h:1.2},[.45,2.4,len],-h);
    }
   }
  }
 }
 // Crossings follow mapped crossing nodes, and are perpendicular to the road.
 const seen=[];for(const n of nodes.filter(n=>n.tags?.highway==='crossing')){
  if(!nearRoute(n)||seen.some(p=>distance(n,p)<7))continue;const hit=nearestRoad(n,roads);if(hit.distance>10||hit.road.tags.highway==='motorway')continue;seen.push(n);
  const h=hit.heading,r={x:Math.cos(h),y:Math.sin(h)},f={x:Math.sin(h),y:-Math.cos(h)},w=roadWidth(hit.road.tags);
  for(let x=-w/2+.6;x<w/2-.4;x+=.85){const p=hit.point;add('mark',[[x,-1.8],[x+.43,-1.8],[x+.43,1.8],[x,1.8]].map(([a,b])=>({x:p.x+r.x*a+f.x*b,y:p.y+r.y*a+f.y*b})),.19);}
  for(const side of [-1,1]){const p={x:hit.point.x+r.x*(w/2+1)*side,y:hit.point.y+r.y*(w/2+1)*side};details.add('box','#9eaa9e',{...p,h:.26},[1,.035,.65],-h);}
 }
 for(const [kind,color]of [['walk','#b6b5a8'],['mark','#eeebd9']])if(polygons[kind].length)group.add(meshFrom(polygons[kind],material(color)));
 if(cables.length){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(cables,3));group.add(new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:'#34413e'})));}
 // Mapped tree positions and forest polygons; supplementary trees stay off
 // roads and buildings, and are a representative vegetation treatment.
 const forests=features.filter(f=>f.tags.natural==='wood'||f.tags.landuse==='forest'||f.tags.landuse==='orchard');
 const building=features.filter(f=>f.tags.building||f.tags.amenity==='parking'),coastRing=coast?.map(p=>[p.x,p.y]);
 const treePoints=nodes.filter(n=>n.tags?.natural==='tree').map(n=>({...n,seed:hash(n.id)}));
 if(mountain||theme==='coast'||theme==='village'){
  const xs=route.map(p=>p.x),ys=route.map(p=>p.y),step=mountain?14:33;
  for(let x=Math.min(...xs)-210;x<Math.max(...xs)+210;x+=step)for(let y=Math.min(...ys)-210;y<Math.max(...ys)+210;y+=step){
   const seed=hash(`${x.toFixed(1)}:${y.toFixed(1)}`),p={x:x+seed%13,y:y+(seed>>>5)%13};
   if(coastRing&&!pointInRing([p.x,p.y],coastRing))continue;
   if(!mountain&&!forests.some(f=>insidePolygon(p,f.points))&&seed%5)continue;
   if(building.some(f=>distance(p,f.center)<30&&insidePolygon(p,f.points)))continue;
   const hit=nearestRoad(p,roads);if(hit.distance<roadWidth(hit.road?.tags)/2+5)continue;treePoints.push({...p,seed});
  }
 }
 if(urban&&profile.trees)for(const road of roads.filter(r=>!r.tags.highway?.includes('link')&&r.tags.highway!=='service')){
  for(let i=1;i<road.points.length;i++){const a=road.points[i-1],b=road.points[i],len=distance(a,b),h=headingBetween(a,b);if(len<32)continue;
   for(let d=16;d<len;d+=38){const p={x:a.x+(b.x-a.x)*d/len+Math.cos(h)*(roadWidth(road.tags)/2+1.3),y:a.y+(b.y-a.y)*d/len+Math.sin(h)*(roadWidth(road.tags)/2+1.3)};if(nearRoute(p)&&!building.some(f=>insidePolygon(p,f.points)))treePoints.push({...p,seed:hash(d+road.id)});}
  }
 }
 for(const p of treePoints){if(!clear(p))continue;const s=p.seed??hash(p.id),height=4.6+s%30/10;details.add('pole','#75654d',{...p,h:height*.42},[.26,height*.84,.26]);
  for(let i=0;i<(mountain?4:7);i++){const angle=i*2.4+s%20/10,r=i===0?0:1.15,k=mountain?1.7:1;details.add('tree',['#365d3c','#477544','#517c42'][s%3],{x:p.x+Math.cos(angle)*r,y:p.y+Math.sin(angle)*r,h:height-1.0+(i%3)*.5},[(1.05+(s%4)*.15)*k,1.1*k,1.05*k]);}
  if(mountain&&s%2===0)details.add('tree','#477544',{x:p.x+2.1,y:p.y-1.4,h:1},[2.6,1.3,2.3]);
 }
 details.finish();
 buildTolls(renderer,tolls||[]);
}
function buildTolls(renderer,tolls){
 renderer.tollObjects=[];
 for(const g of tolls){
  const root=new THREE.Group();root.position.copy(renderer.local(g));root.rotation.y=-g.heading;
  const box=(size,pos,color)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(...size),material(color));m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;root.add(m);return m;};
  box([12,.4,7],[0,5.4,0],'#d1d4c5');box([.4,5.4,.4],[-5.5,2.7,0],'#929c91');box([.4,5.4,.4],[5.5,2.7,0],'#929c91');box([1.3,2.4,2.6],[2.8,1.2,0],'#737e73');box([1.36,1.1,1.6],[2.8,1.7,0],'#24424b');
  for(const x of [-3.2,3.2])box([.5,.22,14],[x,.11,0],'#b4b8ad');
  const heading=new THREE.Mesh(new THREE.PlaneGeometry(5,.9),label(g.mode==='general'?'一般  /  通行券':'ETC  /  20 km/h',g.mode==='general'?'#1a784c':'#563e89'));heading.position.set(0,4.7,3.6);root.add(heading);
  const pivot=new THREE.Group();pivot.position.set(2.6,1.2,2.0);const bar=new THREE.Mesh(new THREE.BoxGeometry(5.4,.12,.12),material('#f1e8cf'));bar.position.x=-2.7;pivot.add(bar);for(let i=0;i<5;i++){const stripe=new THREE.Mesh(new THREE.BoxGeometry(.35,.13,.13),material('#df7159'));stripe.position.x=-.7-i;pivot.add(stripe);}root.add(pivot);
  const light=new THREE.Mesh(new THREE.CircleGeometry(.16,16),new THREE.MeshBasicMaterial({color:'#ed624e'}));light.position.set(-2.5,2.2,2.4);root.add(light);
  renderer.environmentGroup.add(root);renderer.tollObjects.push({gate:g,pivot,light});
 }
}
export function updateTollObjects(renderer,gates){for(const o of renderer.tollObjects||[]){const g=gates.find(g=>g.id===o.gate.id);if(!g)continue;o.pivot.rotation.z=-(g.opening||0)*Math.PI/2;o.light.material.color.set(g.state==='closed'?'#ed624e':'#67ffae');}}
