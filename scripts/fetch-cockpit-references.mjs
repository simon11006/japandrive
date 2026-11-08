import {writeFile} from 'node:fs/promises';
const refs=[
 ['prius-meter','https://toyota.jp/pages/contents/prius/005_p_001/image/usability/ease-driving_02_01.jpg'],
 ['prius-controls','https://toyota.jp/pages/contents/prius/005_p_001/image/usability/ease-driving_05_01.jpg'],
 ['prius-dashboard','https://toyota.jp/pages/contents/prius/005_p_001/image/usability/ease-driving_04_01.jpg'],
 ['alphard-detail','https://toyota.jp/pages/contents/alphard/004_p_001/image/design/interior_04_01.jpg'],
];
for(const[name,url]of refs){const r=await fetch(url,{signal:AbortSignal.timeout(20000)});if(!r.ok)throw new Error(name+' '+r.status);await writeFile('references/'+name+'.jpg',new Uint8Array(await r.arrayBuffer()));console.log(name);}
const r=await fetch('https://coldioresort.com/condominium/aqua-palace-chatan',{signal:AbortSignal.timeout(20000)});await writeFile('references/aqua-official.html',await r.text());
