import {readFile,writeFile} from 'node:fs/promises';
import {WORLD_AREAS} from './world-course-definitions.mjs';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const out={version:1,courses:{}};
for(const area of WORLD_AREAS){const data=await read(`data/course-sources/${area.id}-geometry.json`),id=`${area.country.toLowerCase()}-${area.id}`;
 const coast=data.elements.filter(e=>e.tags?.natural==='coastline').map(e=>({id:e.id,points:e.geometry.map(p=>[p.lon,p.lat])}));
 const beaches=data.elements.filter(e=>e.tags?.natural==='beach').map(e=>({id:e.id,points:e.geometry.map(p=>[p.lon,p.lat])}));
 const scenery={style:area.id,origin:area.origin,coast,beaches,waterLevel:0};
 if(area.id==='queenstown'){
  const lake=await read('data/course-sources/queenstown-lake.json'),nodes=new Map(lake.elements.filter(e=>e.type==='node').map(e=>[e.id,e])),ways=new Map(lake.elements.filter(e=>e.type==='way').map(e=>[e.id,e]));
  const relation=lake.elements.find(e=>e.type==='relation'&&e.id===1636910);const pending=relation.members.filter(m=>m.type==='way'&&m.role==='outer').map(m=>ways.get(m.ref).nodes.slice()),rings=[];
  while(pending.length){let ring=pending.shift();while(ring[0]!==ring.at(-1)){const i=pending.findIndex(p=>p[0]===ring.at(-1)||p.at(-1)===ring.at(-1));if(i<0)throw Error('Unclosed lake boundary');let next=pending.splice(i,1)[0];if(next[0]!==ring.at(-1))next.reverse();ring.push(...next.slice(1));}rings.push(ring.map(id=>[nodes.get(id).lon,nodes.get(id).lat]));}
  scenery.lakes=rings;scenery.waterLevel=308;scenery.waterSource=lake.survey;
 }
 out.courses[id]=scenery;
}
await writeFile('data/world-scenery.json',JSON.stringify(out));console.log('Built landscape boundaries for',Object.keys(out.courses).length,'courses');
