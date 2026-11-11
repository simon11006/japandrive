import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
const catalog=JSON.parse(await readFile('data/driving-courses.json','utf8'));
await mkdir('references/courses',{recursive:true});
const xy=(lon,lat,z)=>{const n=2**z;return [Math.floor((lon+180)/360*n),Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n)];};
const cached=new Map(),manifest={tiles:[],courses:{}};
for(const c of catalog.courses){
 const b=JSON.parse(await readFile(c.bundle,'utf8')),pts=b.route.geometry.coordinates;
 const aerial=new Map();
 for(const z of [14,16])for(const p of pts){
  const [x,y]=xy(...p,z);
  for(const dx of [-1,0,1])for(const dy of [-1,0,1]){
   const key=`${z}-${x+dx}-${y+dy}`,isDem=z===14;
   const tile={z,x:x+dx,y:y+dy,path:`references/courses/${key}.${isDem?'png':'jpg'}`};
   cached.set(key,tile);if(!isDem)aerial.set(key,tile);
  }
 }
 manifest.courses[c.id]=[...aerial.values()];
}
let done=0;
for(const [key,tile] of cached){
 try{await access(tile.path);}catch{
  const type=tile.z===14?'dem_png':'seamlessphoto',url=`https://cyberjapandata.gsi.go.jp/xyz/${type}/${tile.z}/${tile.x}/${tile.y}.${tile.z===14?'png':'jpg'}`;
  try{const r=await fetch(url,{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error(r.status);await writeFile(tile.path,new Uint8Array(await r.arrayBuffer()));}catch(e){console.log('unavailable',key,String(e.message));continue;}
 }
 if(tile.z===14)manifest.tiles.push(tile);done++;if(done%10===0)console.log('cached',done,'/',cached.size);
}
for(const id in manifest.courses){const available=[];for(const t of manifest.courses[id]){try{await access(t.path);available.push(t);}catch{}}manifest.courses[id]=available;}
await writeFile('data/course-terrain.json',JSON.stringify(manifest));console.log('saved',done,'tiles');
