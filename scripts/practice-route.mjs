// Select a compact sequence of real connected roads, rather than the fastest
// point-to-point route. Deterministic so a saved course can be reproduced.
import {buildGraph,snap,metres} from '../local-router.mjs';
const angle=(a,b)=>Math.atan2((b.lon-a.lon)*Math.cos(a.lat*Math.PI/180),b.lat-a.lat);
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));

function routeFromEdges(graph,path) {
 const {nodes,edges,names,wayTags}=graph;
 const ids=[edges[path[0]].from,...path.map(i=>edges[i].to)],coordinates=ids.map(i=>[nodes[i].lon,nodes[i].lat]);
 const turns=[];let travelled=0,left=0,right=0,lastTurn=0,longestStraight=0;
 for(let i=1;i<path.length;i++){
  travelled+=edges[path[i-1]].d;
  const a=edges[path[i-1]],b=edges[path[i]],turn=wrap(angle(nodes[b.from],nodes[b.to])-angle(nodes[a.from],nodes[a.to]));
  if(Math.abs(turn)>Math.PI*.78)return null;
  if(Math.abs(turn)<Math.PI/4.5)continue;
  const modifier=turn>0?'right':'left';modifier==='right'?right++:left++;
  longestStraight=Math.max(longestStraight,travelled-lastTurn);lastTurn=travelled;turns.push({at:i,modifier});
 }
 const distance=path.reduce((s,i)=>s+edges[i].d,0),duration=path.reduce((s,i)=>s+edges[i].cost,0);
 longestStraight=Math.max(longestStraight,distance-lastTurn);
 const points=[{at:0,type:'depart'},...turns.map(t=>({...t,type:'turn'})),{at:path.length,type:'arrive'}];
 const steps=points.map((p,i)=>{const segment=path.slice(p.at,points[i+1]?.at??path.length);return {
  maneuver:{type:p.type,modifier:p.modifier,location:coordinates[p.at]},name:segment.length?names[edges[segment[0]].way]:'',
  distance:segment.reduce((s,j)=>s+edges[j].d,0),duration:segment.reduce((s,j)=>s+edges[j].cost,0),mode:'driving',
 };});
 const serviceMetres=path.reduce((sum,i)=>sum+(wayTags[edges[i].way].highway==='service'?edges[i].d:0),0);
 return {distance,duration,geometry:{type:'LineString',coordinates},legs:[{distance,duration,steps}],practice:{left,right,longestStraight:Math.round(longestStraight),serviceMetres:Math.round(serviceMetres)}};
}

export function practiceRoute(ways,end,{seed=1,min=650,max=1300,turns=2,radius=800}={}) {
 const graph=buildGraph(ways),{nodes,edges}=graph,goal=snap(graph,end[1],end[0]);if(goal<0)throw Error('No parking approach');
 const neighbours=nodes.map(()=>new Set());for(const e of edges){neighbours[e.from].add(e.to);neighbours[e.to].add(e.from);}
 const critical=new Set(nodes.flatMap((n,i)=>neighbours[i].size!==2||i===goal?[i]:[])),incoming=new Map();
 for(const start of critical)for(const first of nodes[start].out){
  const path=[first];let edge=edges[first],guard=0;
  while(!critical.has(edge.to)&&guard++<nodes.length){const next=nodes[edge.to].out.find(i=>edges[i].to!==edge.from);if(next==null)break;path.push(next);edge=edges[next];}
  if(!critical.has(edge.to)||edge.to===start)continue;
  const chain={from:start,to:edge.to,path,d:path.reduce((s,i)=>s+edges[i].d,0)};
  if(!incoming.has(chain.to))incoming.set(chain.to,[]);incoming.get(chain.to).push(chain);
 }
 let best=null,bestCost=Infinity,randomState=seed;
 const random=()=>{randomState=(Math.imul(randomState,1664525)+1013904223)>>>0;return randomState/4294967296;};
 for(let trial=0;trial<2200;trial++){
  let at=goal,path=[],length=0;const visited=new Set([goal]);
  for(let hop=0;hop<24;hop++){
   const options=(incoming.get(at)||[]).filter(c=>length+c.d<=max&&metres(nodes[c.from],nodes[goal])<radius&&c.path.every(i=>!visited.has(edges[i].from)));
   if(!options.length)break;
   const chain=options[Math.floor(random()*options.length)];path=[...chain.path,...path];length+=chain.d;at=chain.from;chain.path.forEach(i=>visited.add(edges[i].from));
   if(length<min)continue;
   const candidate=routeFromEdges(graph,path);if(!candidate)continue;
   const m=candidate.practice;
   if(m.longestStraight>180||m.left<turns||m.right<turns)continue;
   const cost=m.longestStraight*3+m.serviceMetres*4+Math.abs(length-(min+max)*.5)*.25+Math.max(0,turns-m.left)*900+Math.max(0,turns-m.right)*900+Math.max(0,m.left+m.right-9)*45;
   if(cost<bestCost){bestCost=cost;best=candidate;}
  }
 }
 if(!best||best.practice.left<turns||best.practice.right<turns||best.practice.longestStraight>280)
  throw Error('No varied practice route: '+JSON.stringify(best?.practice));
 return best;
}
