import * as T from './vendor/three.module.js';
import{COCKPITS}from'./cockpit-layout.mjs';
const material=(color,roughness=.7,extra={})=>new T.MeshPhysicalMaterial({color,roughness,metalness:0,clearcoat:.04,...extra});
function texture(w,h,paint){const c=document.createElement('canvas');c.width=w;c.height=h;paint(c.getContext('2d'),w,h);const tex=new T.CanvasTexture(c);tex.colorSpace=T.SRGBColorSpace;tex.anisotropy=4;return tex;}
function roundShape(w,h,r){const s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return s;}
function solid(parent,shape,depth,pos,mat,bevel=.003){const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:4,curveSegments:12});g.translate(0,0,-depth/2);const m=new T.Mesh(g,mat);m.position.set(...pos);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
function rounded(parent,size,pos,mat,r=.018){return solid(parent,roundShape(size[0],size[1],Math.min(r,size[0]/3,size[1]/3)),size[2],pos,mat);}
function polygon(parent,points,depth,pos,mat,bevel=.003){const s=new T.Shape(points.map(p=>new T.Vector2(...p)));return solid(parent,s,depth,pos,mat,bevel);}
function tube(parent,points,radius,mat,closed=false){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed,'centripetal'),g=new T.TubeGeometry(curve,Math.max(24,points.length*12),radius,8,closed),m=new T.Mesh(g,mat);m.castShadow=true;parent.add(m);return m;}
function sweep(parent,points,section,mat,widths=null,axis=[1,0,0]){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),n=56,m=section.length,positions=[],indices=[];for(let i=0;i<=n;i++){const p=curve.getPointAt(i/n),t=curve.getTangentAt(i/n),u=new T.Vector3(...axis);u.addScaledVector(t,-u.dot(t)).normalize();const v=new T.Vector3().crossVectors(t,u).normalize(),scale=widths?widths[0]+(widths[1]-widths[0])*i/n:1;for(const [x,y]of section){const q=p.clone().addScaledVector(u,x*scale).addScaledVector(v,y);positions.push(q.x,q.y,q.z);}}for(let i=0;i<n;i++)for(let j=0;j<m;j++){const a=i*m+j,b=i*m+(j+1)%m,c=(i+1)*m+j,d=(i+1)*m+(j+1)%m;indices.push(a,b,c,b,d,c);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();const mesh=new T.Mesh(g,mat);mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function fabric(){return texture(512,512,(c,w,h)=>{c.fillStyle='#888';c.fillRect(0,0,w,h);let s=9487;for(let i=0;i<32000;i++){s=(Math.imul(s,1664525)+1013904223)>>>0;const x=s&511,y=(s>>>10)&511;c.fillStyle=i%2?'#ffffff13':'#00000019';c.fillRect(x,y,1,i%3?1:2);}});}
function wood(){return texture(1024,128,(c,w,h)=>{c.fillStyle='#50362b';c.fillRect(0,0,w,h);for(let y=0;y<150;y++){c.beginPath();c.strokeStyle=y%3?'#b0956c1d':'#080a0a60';c.lineWidth=y%4*.35+.4;for(let x=0;x<=w;x+=6){const v=y*.9+Math.sin(x*.009+y*.30)*2.1+Math.sin(x*.037)*.3;x?c.lineTo(x,v):c.moveTo(x,v);}c.stroke();}});}
function stitch(parent,points,mat){tube(parent,points,.00075,mat);}
function knob(parent,x,y,z,r,black,silver){const outer=new T.Mesh(new T.CylinderGeometry(r,r,.011,40),silver);outer.rotation.x=Math.PI/2;outer.position.set(x,y,z);parent.add(outer);const inner=new T.Mesh(new T.CylinderGeometry(r*.84,r*.84,.014,40),black);inner.rotation.x=Math.PI/2;inner.position.set(x,y,z+.004);parent.add(inner);return outer;}
function panelTexture(kind){return texture(512,320,(c,w,h)=>{c.fillStyle='#131519';c.fillRect(0,0,w,h);c.fillStyle='#d5dbdf';c.strokeStyle='#959ca4';c.lineWidth=2;c.textAlign='center';
  if(kind==='prius-left'){c.font='31px sans-serif';c.fillText('▢',130,47);c.fillText('♧',345,47);c.beginPath();c.moveTo(25,75);c.lineTo(480,75);c.stroke();c.font='33px sans-serif';c.fillText('⌃',255,114);c.fillText('‹',80,169);c.fillText('›',430,169);c.fillText('⌄',255,220);c.fillStyle='#0c0d10';c.fillRect(180,135,150,57);c.fillStyle='#e5e8e8';c.font='25px sans-serif';c.fillText('OK',255,173);c.font='26px sans-serif';c.fillText('−    ♪    +',255,280);}
  else if(kind==='prius-right'){c.font='31px sans-serif';c.fillText('⏱',140,52);c.fillText('+',370,52);c.font='28px sans-serif';c.fillText('RES +',260,125);c.fillText('− SET',260,200);c.fillText('▰     ◁ ▷',260,285);}
  else{c.font='30px sans-serif';c.fillText(kind==='left'?'‹   OK   ›':'RES  +',255,80);c.font='27px sans-serif';c.fillText(kind==='left'?'⌃         ⌄':'−  SET',255,175);c.beginPath();c.moveTo(35,225);c.lineTo(475,225);c.stroke();c.fillText(kind==='left'?'−   ♪   +':'▰   ◁ ▷',255,286);}});}
function face(parent,w,h,pos,map,rotation=0){const m=new T.Mesh(new T.PlaneGeometry(w,h),new T.MeshBasicMaterial({map}));m.position.set(...pos);m.rotation.x=rotation;parent.add(m);return m;}
function glassGeometry(shape,w,h){const g=new T.ShapeGeometry(shape),p=g.attributes.position,uv=g.attributes.uv;for(let i=0;i<p.count;i++)uv.setXY(i,p.getX(i)/w+.5,p.getY(i)/h+.5);return g;}

function makeWheel(root,car,cfg,mats){
  const tall=car.id==='alphard',wheel=new T.Group();wheel.position.set(cfg.eyeX,car.eyeHeight-cfg.wheelDrop,cfg.wheelZ);wheel.rotation.x=-.23;root.add(wheel);
  const radial=128,cross=16,positions=[],uv=[],indices=[],r=cfg.wheelRadius;
  for(let i=0;i<=radial;i++){const a=i/radial*Math.PI*2,cx=Math.cos(a)*r,cy=Math.sin(a)*r,grip=.017+(Math.abs(Math.cos(a))>.85&&Math.sin(a)>.05?.004:0);for(let j=0;j<=cross;j++){const b=j/cross*Math.PI*2,dr=Math.cos(b)*grip;positions.push(cx+Math.cos(a)*dr,cy+Math.sin(a)*dr,Math.sin(b)*grip);uv.push(i/radial*6,j/cross);} }
  for(let i=0;i<radial;i++)for(let j=0;j<cross;j++){const a=i*(cross+1)+j,b=a+cross+1;indices.push(a,b,a+1,a+1,b,b+1);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const rim=new T.Mesh(g,mats.leather);rim.castShadow=true;wheel.add(rim);
  if(tall){const arc=new T.Mesh(new T.TorusGeometry(r,.0175,16,80,Math.PI*.82),mats.wood);arc.rotation.z=Math.PI*.09;arc.position.z=.0008;wheel.add(arc);}
  const hw=tall?.087:.074,horn=new T.Shape();horn.moveTo(-hw,.044);horn.bezierCurveTo(-hw*.65,.063,hw*.65,.063,hw,.044);horn.bezierCurveTo(hw+.005,.015,hw*.75,-.044,hw*.58,-.069);horn.quadraticCurveTo(0,-.084,-hw*.58,-.069);horn.bezierCurveTo(-hw*.75,-.044,-hw-.005,.015,-hw,.044);solid(wheel,horn,.030,[0,-.002,.007],mats.leather,.011);
  rounded(wheel,[tall?.157:.137,.026,.025],[0,.042,.022],mats.leather,.011);
  for(const side of [-1,1]){
    const pts=tall?[[.063,.035],[.155,.037],[.151,-.038],[.075,-.061]]:[[.059,.038],[.154,.034],[.148,-.018],[.067,-.030]];
    polygon(wheel,pts.map(([x,y])=>[side*x,y]),.021,[0,0,-.004],tall?mats.black:mats.silver,.005);
    tube(wheel,[[side*.069,.044,.009],[side*.113,.050,.009],[side*.151,.036,.006]],.0024,mats.silver);
    const controls=panelTexture(tall?(side<0?'left':'right'):(side<0?'prius-left':'prius-right'));
    const pad=face(wheel,tall?.067:.060,tall?.065:.036,[side*(tall?.115:.109),tall?-.008:.007,.020],controls);pad.rotation.z=tall?side*-.1:side*-.04;
  }
  if(tall){polygon(wheel,[[-.041,-.055],[-.028,-.155],[.028,-.155],[.041,-.055]],.02,[0,0,-.007],mats.black);tube(wheel,[[-.033,-.075,.007],[-.023,-.144,.007],[0,-.155,.007],[.023,-.144,.007],[.033,-.075,.007]],.0026,mats.silver);}
  else{polygon(wheel,[[-.025,-.063],[-.039,-.153],[0,-.164],[.039,-.153],[.025,-.063]],.019,[0,0,-.008],mats.black,.005);tube(wheel,[[-.026,-.074,.008],[-.030,-.143,.008],[0,-.154,.008],[.030,-.143,.008],[.026,-.074,.008]],.0035,mats.silver);}
  const logo=new T.Group();logo.position.set(0,.003,.042);wheel.add(logo);
  for(const [rx,ry,dy]of [[.023,.015,0],[.008,.015,0],[.017,.006,.005]]){const pts=[];for(let i=0;i<=64;i++){const a=i/64*Math.PI*2;pts.push([Math.cos(a)*rx,dy+Math.sin(a)*ry,0]);}tube(logo,pts,.0012,mats.silver);}
  face(wheel,.050,.008,[0,-.037,.041],texture(256,48,(c,w,h)=>{c.clearRect(0,0,w,h);c.fillStyle='#6e7377';c.font='19px sans-serif';c.textAlign='center';c.fillText('SRS AIRBAG',w/2,33);}));
  for(const side of [-1,1]){const pts=[];for(let i=0;i<=40;i++){const a=(side<0?.60:1.60)*Math.PI+i/40*.70*Math.PI;pts.push([Math.cos(a)*(r-.011),Math.max(-r*.89,Math.sin(a)*(r-.011)),.010]);}stitch(wheel,pts,mats.thread);}
  // Shaped steering column and real stalk locations sit behind the rim.
  rounded(root,[.13,.12,.26],[cfg.eyeX,car.eyeHeight-cfg.wheelDrop-.045,cfg.wheelZ-.14],mats.black,.035);
  for(const side of [-1,1]){const stalk=tube(root,[[cfg.eyeX+side*.055,car.eyeHeight-cfg.wheelDrop+.018,cfg.wheelZ-.11],[cfg.eyeX+side*.14,car.eyeHeight-cfg.wheelDrop+.042,cfg.wheelZ-.13]],.010,mats.black);rounded(root,[.047,.024,.035],[cfg.eyeX+side*.146,car.eyeHeight-cfg.wheelDrop+.045,cfg.wheelZ-.13],mats.black,.008);}
  return wheel;
}

function makeCenterStack(root,car,cfg,mats,navTexture){
  const tall=car.id==='alphard',eye=car.eyeHeight,group=new T.Group();group.name=tall?'alphard-integrated-display-and-climate':'prius-vertical-center-stack';group.position.set(cfg.screenX,eye-cfg.screenDrop,cfg.screenZ);group.rotation.x=-.08;root.add(group);
  const gloss=material('#07090e',.22,{clearcoat:.7,clearcoatRoughness:.22}),ivory=material('#e6e6de',.37,{clearcoat:.32});
  const outline=tall?[[-.181,-.272],[.181,-.272],[.180,.111],[-.180,.111]]:[[-.145,-.178],[.145,-.178],[.127,-.080],[.102,.123],[.075,.150],[-.075,.150],[-.102,.123],[-.127,-.080]];
  const shell=polygon(group,outline,.029,[0,0,-.017],gloss,.009);shell.name='center-stack-shell';
  for(const side of [-1,1])tube(group,tall?[[side*.183,.109,-.002],[side*.188,-.12,.003],[side*.174,-.272,.012]]:[[side*.078,.148,.003],[side*.104,.112,.007],[side*.132,-.080,.006],[side*.146,-.173,.005]],tall?.006:.0027,tall?mats.leather:mats.silver);
  const navigation=new T.Mesh(new T.PlaneGeometry(cfg.screenWidth,cfg.screenHeight),new T.MeshBasicMaterial({map:navTexture}));navigation.name='live-navigation-display';navigation.position.set(0,tall?.010:.019,.008);group.add(navigation);
  const vent=(x,y,w,h,z=.027)=>{rounded(group,[w,h,.020],[x,y,z],mats.black,.006);for(let i=0;i<3;i++)rounded(group,[w-.008,.0018,.009],[x,y-h*.30+i*h*.30,z+.014],mats.soft,.001);rounded(group,[.014,.003,.004],[x,y,z+.022],mats.silver,.001);};
  if(tall){
    const climate=face(group,.313,.093,[0,-.132,.013],texture(1024,300,(c,w,h)=>{c.fillStyle='#07090e';c.fillRect(0,0,w,h);c.fillStyle='#ced9df';c.font='26px sans-serif';c.textAlign='center';c.fillText('FRONT    REAR               Climate               ↗',w/2,50);c.font='29px sans-serif';c.fillText('−     ● ━━━ ●     +',w/2,135);c.font='25px sans-serif';c.fillText('OFF             AUTO             A/C',w/2,232);}));climate.name='integrated-climate-controls';
    for(const side of [-1,1]){knob(group,side*.124,-.176,.022,.023,mats.black,mats.silver);face(group,.036,.036,[side*.124,-.176,.036],texture(128,128,(c,w,h)=>{const g=c.createLinearGradient(0,0,w,h);g.addColorStop(0,'#176bda');g.addColorStop(1,'#b92132');c.fillStyle=g;c.beginPath();c.arc(64,64,59,0,Math.PI*2);c.fill();c.fillStyle='#fff';c.textAlign='center';c.font='33px sans-serif';c.fillText('22.0',64,77);}));}
    for(const side of [-1,1]){rounded(group,[.113,.016,.008],[side*.094,-.226,.024],mats.soft,.002);face(group,.104,.011,[side*.094,-.226,.030],texture(512,60,(c,w,h)=>{c.fillStyle='#929da8';c.font='25px sans-serif';c.textAlign='center';c.fillText(side<0?'VIEW    ◻':'FRONT   REAR',w/2,43);}));}
    knob(group,0,-.224,.029,.011,mats.black,mats.silver);
    for(const side of [-1,1])vent(side*.083,-.288,.139,.038,.025);
    rounded(group,[.027,.037,.012],[0,-.288,.047],mats.soft,.003);polygon(group,[[-.007,-.004],[.007,-.004],[0,.009]],.001,[0,-.288,.055],material('#b44742'),0);
    for(const side of [-1,1]){const edge=[[cfg.screenX+side*.19,eye-cfg.screenDrop+.10,cfg.screenZ-.025],[cfg.screenX+side*.19,eye-.49,cfg.screenZ+.025],[side*.155,eye-.66,-.39],[side*.15,eye-.69,.18]];tube(root,edge,.013,mats.leather);stitch(root,edge.map(([x,y,z])=>[x-side*.008,y+.004,z+.004]),mats.thread);}
  }else{
    for(const side of [-1,1])vent(side*.045,.118,.073,.025,.018);
    face(group,.213,.054,[0,-.102,.020],texture(1024,230,(c,w,h)=>{c.fillStyle='#080a10';c.fillRect(0,0,w,h);c.fillStyle='#c5d1d5';c.textAlign='center';c.font='37px sans-serif';c.fillText('22.0       ↗       22.0',w/2,72);c.font='30px sans-serif';c.fillText('AUTO    −    FAN    +    A/C',w/2,157);}));
    for(const side of [-1,1])for(let i=0;i<4;i++){rounded(group,[.012,.010,.006],[side*.113,.052-i*.027,.018],mats.black,.002);rounded(group,[.006,.001,.001],[side*.113,.052-i*.027,.023],mats.silver,.0002);}
    const plate=polygon(group,[[-.145,-.030],[-.135,.034],[.135,.034],[.145,-.030],[.10,-.051],[-.10,-.051]],.030,[0,-.212,.019],ivory,.011);plate.name='prius-white-gear-panel';
    knob(group,-.107,-.210,.044,.014,mats.black,mats.silver);face(group,.015,.015,[-.107,-.210,.058],texture(96,96,(c,w,h)=>{c.fillStyle='#0c1117';c.fillRect(0,0,w,h);c.fillStyle='#dbe9ec';c.font='bold 60px sans-serif';c.textAlign='center';c.fillText('P',w/2,68);}));
    const blue=material('#18587e',.24,{metalness:.22,clearcoat:.5});rounded(group,[.060,.035,.023],[-.030,-.211,.045],mats.black,.010);tube(group,[[-.03,-.211,.047],[-.035,-.203,.084]],.008,mats.black);rounded(group,[.035,.027,.025],[-.035,-.198,.091],blue,.008);
    knob(group,.098,-.211,.043,.018,blue,mats.silver);face(group,.027,.027,[.098,-.211,.059],texture(128,128,(c,w,h)=>{c.fillStyle='#113e60';c.beginPath();c.arc(64,64,62,0,Math.PI*2);c.fill();c.fillStyle='#d6edff';c.textAlign='center';c.font='46px sans-serif';c.fillText('⏻',64,74);}));
    face(group,.035,.018,[.019,-.213,.045],texture(180,90,(c,w,h)=>{c.fillStyle='#dce1dd';c.fillRect(0,0,w,h);c.fillStyle='#27343c';c.textAlign='center';c.font='29px sans-serif';c.fillText('R N D B',w/2,59);}));
  }
  return {navigation,navigationAnchor:new T.Vector3(cfg.screenX,eye-cfg.screenDrop,cfg.screenZ)};
}

export function buildCockpit({parent,car,navTexture,meterTexture}){
  const cfg=COCKPITS[car.id],tall=car.id==='alphard',eye=car.eyeHeight,half=car.width/2-.075,roof=car.height-.09,bump=fabric();
  const mats={black:material('#080b10',.65),leather:material('#121419',.79,{bumpMap:bump,bumpScale:.00035}),soft:material('#171a20',.86,{bumpMap:bump,bumpScale:.00025}),silver:material('#a8adb2',.28,{metalness:.84,clearcoat:.28}),rubber:material('#04060a',.95),wood:material('#776451',.30,{map:wood(),clearcoat:.7,clearcoatRoughness:.25}),thread:material('#6c6a62',.9),headliner:material(tall?'#9f9d95':'#7e8284',.96,{bumpMap:bump,bumpScale:.0003}),glass:material('#a4ced7',.15,{transparent:true,opacity:.028,depthWrite:false})};
  mats.wheelLeather=mats.leather;if(tall){mats.leather=material('#a36d4d',.54,{bumpMap:bump,bumpScale:.00035,clearcoat:.12});mats.thread=material('#d0b396',.9);mats.wood.color.set('#c4a690');mats.headliner.color.set('#8e9192');}
  const root=new T.Group();root.name=car.id+'-photo-reconstructed-cockpit';parent.add(root);
  // Enclosed footwell: the road must never show through below the wheel.
  rounded(root,[2*half,.065,2.32],[0,tall?.33:.13,.10],mats.rubber,.025);
  rounded(root,[.48,.26,.28],[cfg.eyeX,eye-.615,-.57],mats.black,.038);
  for(const[x,w]of [[cfg.eyeX-.075,.085],[cfg.eyeX+.095,.047]]){const pedal=rounded(root,[w,.10,.023],[x,tall?.48:.27,-.60],mats.rubber,.008);pedal.rotation.x=-.30;for(let i=0;i<4;i++)rounded(pedal,[w*.8,.003,.002],[0,-.032+i*.020,.014],mats.soft,.001);}
  // Lofted dashboard has a rolled leading edge and a curved vertical fascia.
  const section=[[-1.43,-.335],[-1.14,-.318],[-.81,-.327],[-.62,-.353],[-.51,-.383],[-.49,-.455],[-.57,-.568],[-.73,-.643],[-1.39,-.643]],nx=72,n=section.length,positions=[],indices=[];
  for(let i=0;i<=nx;i++){const x=-half+2*half*i/nx,center=Math.exp(-Math.pow(x/.24,2)),driver=Math.exp(-Math.pow((x-cfg.eyeX)/.29,2)),recess=Math.max(0,Math.min(1,(.215-Math.abs(x))/.030));for(const[z,y]of section){const front=z>-.8?1:0;positions.push(x,eye+y+(tall?.012:.018)*driver-(z>-.97?.235:0)*recess, z+(tall?.055:.025)*center*front+.045*Math.cos(x/half*Math.PI/2)*front);}}
  const dg=new T.BufferGeometry(),faces=[[],[]];for(let i=0;i<nx;i++)for(let j=0;j<n;j++){const a=i*n+j,b=(i+1)*n+j,c=(i+1)*n+(j+1)%n,d=i*n+(j+1)%n;faces[tall&&j>=4&&j<=6?1:0].push(a,d,b,b,d,c);}indices.push(...faces[0],...faces[1]);dg.addGroup(0,faces[0].length,0);if(faces[1].length)dg.addGroup(faces[0].length,faces[1].length,1);dg.setAttribute('position',new T.Float32BufferAttribute(positions,3));dg.setIndex(indices);dg.computeVertexNormals();const dash=new T.Mesh(dg,[mats.soft,mats.leather]);dash.castShadow=true;dash.receiveShadow=true;root.add(dash);
  // Separate stitched fascia, glovebox and continuous accent band.
  for(const[a,b]of [[-half,-.205],[.205,half]]){const line=[];for(let i=0;i<=20;i++){const x=a+(b-a)*i/20;line.push([x,eye-.392,-.475+.04*Math.cos(x/half*Math.PI/2)]);}if(tall)sweep(root,line,[[-.019,-.005],[.019,-.005],[.019,.005],[-.019,.005]],mats.wood,null,[0,1,0]);else tube(root,line,.003,material('#37677d',.30,{metalness:.5}));stitch(root,line.map(([x,y,z])=>[x,y+.023,z-.002]),mats.thread);}
  rounded(root,[half-.25,.17,.13],[-(half+.25)/2,eye-.565,-.593],tall?mats.leather:mats.black,.028);
  stitch(root,[[-half+.10,eye-.484,-.516],[-.52,eye-.489,-.499],[-.19,eye-.489,-.487]],mats.thread);
  knob(root,-.21,eye-.527,-.519,.009,mats.black,mats.black);
  const {navigation,navigationAnchor}=makeCenterStack(root,car,cfg,mats,navTexture);
  const my=eye-cfg.meterDrop,mx=cfg.meterX??cfg.eyeX,mz=cfg.meterZ,mw=cfg.meterWidth,mh=cfg.meterHeight;
  if(tall){const hood=polygon(root,[[-.202,-.075],[-.203,.018],[-.172,.090],[-.11,.126],[0,.14],[.11,.126],[.172,.090],[.203,.018],[.202,-.075]],.18,[mx,my-.02,mz-.045],mats.wheelLeather,.009);hood.name='alphard-instrument-binnacle';stitch(root,[[mx-.18,my+.030,mz+.050],[mx-.13,my+.095,mz+.050],[mx,my+.117,mz+.050],[mx+.13,my+.095,mz+.050],[mx+.18,my+.030,mz+.050]],mats.thread);}
  else{polygon(root,[[-.247,-.15],[.247,-.15],[.239,-.030],[-.239,-.030]],.25,[mx,my,mz-.14],mats.soft,.004);const hood=polygon(root,[[-.246,-.039],[.246,-.039],[.239,.029],[.190,.049],[-.188,.049],[-.239,.029]],.075,[mx,my,mz-.016],mats.black,.006);hood.name='prius-central-instrument-hood';tube(root,[[-.233,my+.041,mz+.016],[mx,my+.046,mz+.018],[.243,my+.041,mz+.016]],.002,mats.soft);}
  const meter=new T.Mesh(new T.PlaneGeometry(mw,mh),new T.MeshBasicMaterial({map:meterTexture}));meter.name='live-instrument-display';meter.position.set(mx,my,mz+(tall?.065:.031));root.add(meter);
  // Each console follows its reference: Alphard's broad glossy tunnel and
  // Prius's narrow armrest with its shifter on the white centre fascia.
  rounded(root,[tall?.31:.23,.235,1.00],[-.035,eye-.755,-.03],mats.leather,.035);
  const tunnel=rounded(root,[tall?.285:.211,.035,.68],[-.035,eye-.619,-.12],tall?mats.wood:mats.black,.021);tunnel.rotation.x=-.05;
  if(tall){
    rounded(root,[.252,.022,.40],[-.035,eye-.586,-.20],material('#0b0c11',.19,{clearcoat:.7}),.020);
    tube(root,[[-.162,eye-.57,-.39],[-.165,eye-.57,-.12],[-.145,eye-.57,.02],[.074,eye-.57,.02],[.10,eye-.57,-.12],[.094,eye-.57,-.39]],.003,mats.silver);
    rounded(root,[.074,.023,.15],[.016,eye-.564,-.28],mats.black,.012);
    const boot=rounded(root,[.052,.072,.061],[.021,eye-.524,-.29],mats.wheelLeather,.014);boot.rotation.x=-.26;rounded(root,[.031,.046,.063],[.026,eye-.478,-.30],mats.soft,.012);tube(root,[[.022,eye-.455,-.265],[.022,eye-.478,-.260],[.022,eye-.500,-.255]],.002,mats.silver);
    face(root,.052,.104,[-.054,eye-.548,-.285],texture(256,512,(c,w,h)=>{c.fillStyle='#080c12';c.fillRect(0,0,w,h);c.fillStyle='#cbdce9';c.font='42px sans-serif';c.textAlign='center';['P','R','N','D','B'].forEach((s,i)=>c.fillText(s,w/2,60+i*95));}),-Math.PI*.37);
    for(let i=0;i<3;i++)rounded(root,[.041,.009,.031],[.059,eye-.553,-.16+i*.040],mats.black,.004);
  }else{
    const tray=rounded(root,[.191,.025,.265],[-.035,eye-.607,-.21],material('#dedfd7',.50),.025);rounded(root,[.164,.027,.205],[-.035,eye-.592,-.21],mats.rubber,.018);
  }
  for(const z of [.035,.176]){const well=new T.Mesh(new T.CylinderGeometry(.035,.029,.050,40),mats.black);well.position.set(-.035,eye-.603,z);root.add(well);const edge=new T.Mesh(new T.TorusGeometry(.036,.0018,8,48),mats.silver);edge.rotation.x=Math.PI/2;edge.position.set(-.035,eye-.577,z);root.add(edge);}
  rounded(root,[tall?.280:.220,.08,.31],[-.035,eye-.600,.42],mats.leather,.03);stitch(root,[[-.035,eye-.557,.28],[-.035,eye-.557,.42],[-.035,eye-.557,.55]],mats.thread);
  // Front doors curve into the fascia rather than floating beside the driver.
  for(const side of [-1,1]){
    const x=side*(half+.025),panel=rounded(root,[.075,.49,1.40],[x,eye-.47,.03],mats.black,.03);rounded(root,[.060,.10,1.30],[x-side*.009,eye-.23,-.015],mats.leather,.022);
    tube(root,[[x-side*.035,eye-.277,-.64],[x-side*.035,eye-.279,-.15],[x-side*.035,eye-.29,.52]],tall?.011:.003,tall?mats.wood:mats.silver);
    rounded(root,[.025,.074,.20],[x-side*.040,eye-.35,-.26],mats.black,.018);tube(root,[[x-side*.055,eye-.342,-.345],[x-side*.068,eye-.357,-.27],[x-side*.057,eye-.346,-.19]],.0055,mats.silver);
    rounded(root,[.11,.04,.33],[x-side*.075,eye-.51,-.02],mats.leather,.025);for(let i=0;i<4;i++)rounded(root,[.026,.009,.036],[x-side*.075,eye-.485,-.125+i*.058],mats.black,.004);
    stitch(root,[[x-side*.045,eye-.42,-.53],[x-side*.045,eye-.44,-.03],[x-side*.045,eye-.44,.55]],mats.thread);
    // Swept corner vents; the long axis follows the door/dash junction.
    const vx=side*(half-(tall?.13:.10)),vy=eye-(tall?.405:.38),vz=tall?-.44:-.53,vw=tall?.114:.084,vh=tall?.065:.045;const vent=rounded(root,[vw,vh,.028],[vx,vy,vz],mats.black,.011);vent.rotation.y=side*.25;for(let j=0;j<4;j++)rounded(root,[vw-.018,.002,.009],[vx,vy-vh*.36+j*vh*.24,vz+.019],mats.soft,.001);rounded(root,[.018,.003,.005],[vx,vy,vz+.027],mats.silver,.001);
  }
  // Tapered, fabric-covered A-pillars and continuous window seals.
  const ellipse=[];for(let i=0;i<24;i++){const a=i/24*Math.PI*2;ellipse.push([Math.sign(Math.cos(a))*Math.sqrt(Math.abs(Math.cos(a)))*.5,Math.sign(Math.sin(a))*Math.sqrt(Math.abs(Math.sin(a)))*.022]);}
  for(const side of [-1,1]){const pillar=[[side*(half+.015),eye-.325,cfg.glassBottom],[side*(half+.012),eye-.04,(cfg.glassBottom+cfg.glassTop)*.5],[side*(half-.005),roof-.02,cfg.glassTop]];sweep(root,pillar,ellipse,mats.headliner,[cfg.pillarBaseWidth,cfg.pillarTopWidth]);tube(root,pillar.map(([x,y,z])=>[x+side*.026,y,z-.008]),.009,mats.rubber);
    tube(root,[[side*half,roof-.025,cfg.glassTop],[side*half,roof-.025,.50],[side*half,roof-.025,1.15]],.029,mats.headliner);
    rounded(root,[.077,.77,.11],[side*half,roof-.40,1.12],mats.headliner,.020);
    const window=new T.Mesh(new T.PlaneGeometry(1.6,roof-eye+.26),mats.glass);window.position.set(side*(half+.025),(roof+eye-.26)/2,.20);window.rotation.y=Math.PI/2;window.material.side=T.DoubleSide;root.add(window);
  }
  rounded(root,[2*half,.047,2.05],[0,roof,(cfg.glassTop+1.4)/2],mats.headliner,.020);
  tube(root,[[-half,roof-.015,cfg.glassTop],[0,roof-.015,cfg.glassTop-.015],[half,roof-.015,cfg.glassTop]],.025,mats.headliner);
  for(const side of [-1,1])rounded(root,[.29,.022,.14],[side*.40,roof-.045,cfg.glassTop+.15],mats.headliner,.018);
  rounded(root,[tall?.22:.11,.018,tall?.235:.14],[0,roof-.019,cfg.glassTop+.11],mats.headliner,.008);
  face(root,tall?.168:.085,tall?.16:.10,[0,roof-.031,cfg.glassTop+.11],texture(320,400,(c,w,h)=>{c.fillStyle=tall?'#161c22':'#8a8f90';c.fillRect(0,0,w,h);c.fillStyle='#bec6ca';c.fillRect(16,25,65,125);c.fillRect(w-81,25,65,125);c.fillStyle='#626c71';for(let i=0;i<6;i++)c.fillRect(110+(i%2)*62,45+Math.floor(i/2)*87,45,37);c.fillStyle='#b6c5cf';c.font='22px sans-serif';c.textAlign='center';c.fillText('DOOR   OPEN',w/2,h-26);}),Math.PI/2);
  // Rear headrests are visible when glancing back and in the cabin mirror.
  for(const side of [-1,1]){rounded(root,[.46,.69,.22],[side*.40,.77,1.05],mats.leather,.06);rounded(root,[.25,.20,.12],[side*.40,1.20,.99],mats.leather,.04);}
  const wheel=makeWheel(root,car,cfg,{...mats,leather:mats.wheelLeather}),mirrorMounts=[];
  for(const side of [-1,1]){
    const w=cfg.mirrorWidth,h=cfg.mirrorHeight,group=new T.Group(),x=side*(car.width/2+.085),y=eye-cfg.mirrorDrop,z=cfg.mirrorZ;group.position.set(x,y,z);group.rotation.y=side*.12;root.add(group);
    const outline=[[-w*.49,-h*.32],[-w*.35,-h*.48],[w*.40,-h*.43],[w*.50,-h*.22],[w*.48,h*.34],[w*.35,h*.48],[-w*.34,h*.45],[-w*.50,h*.25]];
    polygon(group,outline,.044,[0,0,0],mats.black,.009);tube(root,[[side*(half+.005),eye-.24,z+.13],[x-side*.055,y-.022,z]],.022,mats.black);
    const shape=new T.Shape(outline.map(([x,y])=>new T.Vector2(x*.88,y*.85))),plane=new T.Mesh(glassGeometry(shape,w*.88,h*.85),new T.MeshBasicMaterial({side:T.DoubleSide}));plane.position.z=.031;plane.scale.x=-1;group.add(plane);mirrorMounts.push({side,plane,mount:new T.Vector3(x,y,z+.04),width:w*.88,height:h*.85});
  }
  const innerY=roof-.124,innerZ=cfg.glassTop+.085;rounded(root,[.230,.083,.028],[-.115,innerY,innerZ],mats.black,.017);tube(root,[[-.115,roof-.01,innerZ-.02],[-.115,innerY+.03,innerZ]],.008,mats.black);const innerPlane=new T.Mesh(glassGeometry(roundShape(.209,.063,.009),.209,.063),new T.MeshBasicMaterial());innerPlane.position.set(-.115,innerY,innerZ+.021);innerPlane.scale.x=-1;root.add(innerPlane);mirrorMounts.push({side:0,plane:innerPlane,mount:new T.Vector3(-.115,innerY,innerZ+.03),width:.209,height:.063});
  return {root,wheel,navigation,meter,mirrors:mirrorMounts,layout:cfg,navigationAnchor};
}
