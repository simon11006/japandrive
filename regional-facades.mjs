import * as T from './vendor/three.module.js';
// Metric facade tile: original drawing, never a downloaded photo skin.
export function regionalFacade(kind,color){
 const c=document.createElement('canvas');c.width=c.height=512;const ctx=c.getContext('2d'),n=512;
 ctx.fillStyle=color;ctx.fillRect(0,0,n,n);
 let seed=443;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 if(['brick','sandstone','stone','schist'].includes(kind)){
  const brick=kind==='brick',rh=brick?18:kind==='schist'?26:64,rw=brick?48:kind==='schist'?90:128;
  for(let y=0,row=0;y<n;y+=rh,row++)for(let x=-rw;x<n;x+=rw){const xx=x+(row%2)*rw/2;ctx.fillStyle=`rgba(${rand()>.5?'255,255,255':'20,20,20'},${.03+rand()*.13})`;ctx.fillRect(xx+1,y+1,rw-2,rh-2);ctx.strokeStyle='#e6e1d138';ctx.lineWidth=brick?1:2;ctx.strokeRect(xx,y,rw,rh);}
 }else if(kind==='weatherboard'||kind==='timber'){
  const vertical=kind==='timber';for(let d=0;d<n;d+=vertical?22:26){ctx.fillStyle='#00000025';ctx.fillRect(vertical?d:0,vertical?0:d,vertical?2:n,vertical?n:2);ctx.fillStyle='#ffffff35';ctx.fillRect(vertical?d+2:0,vertical?0:d+2,vertical?2:n,vertical?n:2);}
 }
 for(let i=0;i<9000;i++){ctx.fillStyle=i%2?'#ffffff08':'#00000008';ctx.fillRect(rand()*n,rand()*n,1,1);}
 const glass=kind==='glass',heritage=kind==='heritage'||kind==='sandstone';
 const windows=glass?[[8,18,241,442],[257,18,247,442]]:heritage?[[66,94,126,288],[320,94,126,288]]:[[98,126,316,232]];
 for(const[x,y,w,h]of windows){ctx.fillStyle=heritage?'#ebe3cd':'#aeb7b5';ctx.fillRect(x-9,y-9,w+18,h+18);const g=ctx.createLinearGradient(x,y,x+w,y+h);g.addColorStop(0,'#9bb7c4');g.addColorStop(.45,'#577883');g.addColorStop(.48,'#364a53');g.addColorStop(1,'#778c95');ctx.fillStyle=g;ctx.fillRect(x,y,w,h);ctx.fillStyle='#d3d5cc';ctx.fillRect(x+w*.49,y,glass?3:5,h);if(!glass)ctx.fillRect(x,y+h*.55,w,4);ctx.fillStyle='#101c2940';ctx.fillRect(x-11,y+h+10,w+22,7);ctx.fillStyle='#ddd8c3';ctx.fillRect(x-13,y+h+6,w+26,5);}
 if(heritage){ctx.fillStyle='#f1e6cd';ctx.fillRect(0,12,n,14);ctx.fillStyle='#463c3040';ctx.fillRect(0,26,n,7);}
 const t=new T.CanvasTexture(c);t.colorSpace=T.SRGBColorSpace;t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(1/4.2,1/3.2);t.anisotropy=8;return t;
}
