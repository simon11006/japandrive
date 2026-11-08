import { writeFile } from 'node:fs/promises';
// Digitized from GSI seamlessphoto z18/224194/110899, south-facing row in
// the shared Hanasaki Marche / Ala Mahaina parking area. Resolution is ~0.53m.
const z=18, tx=224194, ty=110899;
function geo([px,py]) {
  const n=2**z, x=(tx+px/256)/n, y=(ty+py/256)/n;
  return [x*360-180, Math.atan(Math.sinh(Math.PI*(1-2*y)))*180/Math.PI];
}
const spaces=[
  { id:'hanasaki-01', pixels:[[81,31],[87,33],[91,21],[85,19]] },
  { id:'hanasaki-02', pixels:[[87,33],[93,35],[97,23],[91,21]] },
  { id:'hanasaki-03', pixels:[[93,35],[99,37],[103,25],[97,23]] },
];
const data={
  site:'하나사키 마르셰 공용 주차장', placeIds:['kaihoumaru'],
  source:{name:'国土地理院 / GSI seamlessphoto',url:'https://maps.gsi.go.jp/development/ichiran.html',tile:`${z}/${tx}/${ty}`,image:'references/gsi-18-224194-110899.jpg',method:'Visible bay markings digitized from georeferenced aerial image. Approximate, not surveyed; image capture date unverified.',facilityMap:'https://www.hanasaki-marche.com/assets/img/data/floor-map.pdf'},
  spaces:spaces.map(s=>({id:s.id,corners:s.pixels.map(geo),sourcePixels:s.pixels,accuracy:'aerial-estimate'})),
};
await writeFile('data/parking-sites.json',JSON.stringify(data,null,2)); console.log(JSON.stringify(data.spaces));
