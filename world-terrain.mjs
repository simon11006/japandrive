export function sampleTerrainGrid(grid,p){
  const x=(p.x-grid.x)/grid.step,y=(p.y-grid.y)/grid.step;
  if(x<0||y<0||x>grid.cols-1||y>grid.rows-1)return null;
  const ix=Math.min(grid.cols-2,Math.floor(x)),iy=Math.min(grid.rows-2,Math.floor(y)),u=x-ix,v=y-iy;
  const at=(dx,dy)=>grid.heights[(iy+dy)*grid.cols+ix+dx];
  return at(0,0)*(1-u)*(1-v)+at(1,0)*u*(1-v)+at(0,1)*(1-u)*v+at(1,1)*u*v;
}
export function smoothTerrainGrid(grid,sigma=3){
  const radius=Math.ceil(sigma*3),weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-(((i-radius)/sigma)**2)/2)),
    total=weights.reduce((a,b)=>a+b),temp=[],heights=[];
  // Remove roof-sized spikes from the public elevation raster while retaining
  // the regional hills. A separable Gaussian is deterministic and cached once.
  for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++){
    let n=0;for(let k=-radius;k<=radius;k++)n+=grid.heights[y*grid.cols+Math.max(0,Math.min(grid.cols-1,x+k))]*weights[k+radius];temp.push(n/total);
  }
  for(let y=0;y<grid.rows;y++)for(let x=0;x<grid.cols;x++){
    let n=0;for(let k=-radius;k<=radius;k++)n+=temp[Math.max(0,Math.min(grid.rows-1,y+k))*grid.cols+x]*weights[k+radius];heights.push(n/total);
  }
  return {...grid,heights};
}
export function worldElevation(data){
  const near=smoothTerrainGrid(data.near,data.id==='au-sydney'?7:data.id==='nz-auckland'?4:2),far=data.far;
  const sample=p=>{
    const b=sampleTerrainGrid(far,{x:Math.max(far.x,Math.min(far.x+(far.cols-1)*far.step,p.x)),y:Math.max(far.y,Math.min(far.y+(far.rows-1)*far.step,p.y))})??0;
    const a=sampleTerrainGrid(near,p);if(a==null)return b;
    const edge=Math.min(p.x-near.x,p.y-near.y,near.x+(near.cols-1)*near.step-p.x,near.y+(near.rows-1)*near.step-p.y);
    const t=Math.max(0,Math.min(1,edge/450));return b+(a-b)*t*t*(3-2*t);
  };
  sample.data=data;return sample;
}
const cache=new Map();
export async function loadWorldTerrain(id){
  if(!cache.has(id))cache.set(id,fetch(new URL(`./data/world-terrain/${id}.json`,import.meta.url)).then(r=>{if(!r.ok)throw Error('지형 자료를 불러오지 못했습니다.');return r.json();}).catch(e=>{cache.delete(id);throw e;}));
  return worldElevation(await cache.get(id));
}
