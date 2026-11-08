import { mkdir, writeFile } from 'node:fs/promises';
const mode = process.argv[2] || 'engine';
await mkdir('vendor', {recursive:true}); await mkdir('references', {recursive:true});
async function download(url, path) {
  const r=await fetch(url,{signal:AbortSignal.timeout(60000),headers:{'User-Agent':'JapanDrive/0.3 (local prototype)'}});
  if(!r.ok) throw new Error(`${r.status} ${url}`);
  const bytes=new Uint8Array(await r.arrayBuffer()); await writeFile(path,bytes); console.log(`${path}: ${bytes.length} bytes`);
}
if(mode==='engine') {
  for(const file of ['three.module.js','three.core.js']) await download(`https://cdn.jsdelivr.net/npm/three@0.180.0/build/${file}`,`vendor/${file}`);
  await download('https://cdn.jsdelivr.net/npm/three@0.180.0/LICENSE','vendor/THREE-LICENSE.txt');
} else if(mode==='signals') {
  const q='[out:json][timeout:45];node(25.99,127.58,26.91,128.4)[highway=traffic_signals];out body;';
  await download('https://overpass-api.de/api/interpreter?'+new URLSearchParams({data:q}),'data/okinawa-signals.json');
} else if(mode==='aerial') {
  // GSI seamless aerial imagery: georeferenced reference for the parking layout.
  const z=18,lon=127.8840,lat=26.6825,n=2**z;
  const x=Math.floor((lon+180)/360*n), y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
  for(let dx=-3;dx<=1;dx++) for(let dy=-1;dy<=1;dy++) await download(`https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x+dx}/${y+dy}.jpg`,`references/gsi-${z}-${x+dx}-${y+dy}.jpg`);
  await writeFile('references/aerial-source.json',JSON.stringify({source:'国土地理院 / GSI seamlessphoto',url:'https://maps.gsi.go.jp/development/ichiran.html',z,x,y,center:[lon,lat],note:'Imagery capture date is not verified. Parking geometry is digitized from this reference, not a field survey.'},null,2));
} else if(mode==='interiors') {
  await download('https://toyota.jp/pages/contents/prius/005_p_001/image/usability/ease-driving_01_01.jpg','references/toyota-prius-interior.jpg');
  await download('https://toyota.jp/pages/contents/alphard/004_p_001/image/usability/ease_driving_03_01.jpg','references/toyota-alphard-interior.jpg');
  await download('https://toyota.jp/pages/contents/alphard/004_p_001/image/design/interior_01_01.jpg','references/toyota-alphard-cockpit.jpg');
} else if(mode==='terrain') {
  for(const x of [14011,14012]) await download(`https://cyberjapandata.gsi.go.jp/xyz/dem_png/14/${x}/6931.png`,`references/dem-14-${x}-6931.png`);
}
