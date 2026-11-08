import{writeFile}from'node:fs/promises';
const z=18,n=2**z,lon=127.7611,lat=26.3202,x=Math.floor((lon+180)/360*n),y=Math.floor((1-Math.asinh(Math.tan(lat*Math.PI/180))/Math.PI)/2*n);
for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){const r=await fetch(`https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/${z}/${x+dx}/${y+dy}.jpg`,{signal:AbortSignal.timeout(15000)});if(r.ok)await writeFile(`references/aqua-${x+dx}-${y+dy}.jpg`,new Uint8Array(await r.arrayBuffer()));}
console.log(JSON.stringify({x,y,lon,lat}));
