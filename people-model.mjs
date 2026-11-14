import * as THREE from './vendor/three.module.js';

// Shared geometry/instancing keeps animated people inexpensive in mirrors
// and on phones. Positions are in metres; feet use the same road surface.
export class PeopleModels {
  constructor(scene){
    this.group=new THREE.Group();scene.add(this.group);
    this.batches={};
    for(const [kind,geometry]of Object.entries({box:new THREE.BoxGeometry(1,1,1),round:new THREE.SphereGeometry(.5,10,7),tube:new THREE.CylinderGeometry(.5,.5,1,8)})){
      const mesh=new THREE.InstancedMesh(geometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.82}),512);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.castShadow=true;mesh.receiveShadow=true;mesh.frustumCulled=false;mesh.count=0;
      this.group.add(mesh);this.batches[kind]=mesh;
    }
    this.root=new THREE.Matrix4();this.part=new THREE.Matrix4();this.quat=new THREE.Quaternion();this.vector=new THREE.Vector3();this.size=new THREE.Vector3();this.color=new THREE.Color();
  }
  update(people,renderer,time,focus){
    for(const mesh of Object.values(this.batches))mesh.count=0;
    const add=(kind,color,x,y,z,sx,sy,sz,rotation=0)=>{
      const mesh=this.batches[kind];if(mesh.count>=512)return;
      this.quat.setFromAxisAngle(new THREE.Vector3(1,0,0),rotation);
      this.part.compose(this.vector.set(x,y,z),this.quat,this.size.set(sx,sy,sz)).premultiply(this.root);
      mesh.setMatrixAt(mesh.count,this.part);mesh.setColorAt(mesh.count++,this.color.set(color));
    };
    const limb=(color,x,y,z,length,angle,radius)=>add('tube',color,x,y-Math.cos(angle)*length/2,z-Math.sin(angle)*length/2,radius,length,radius,angle);
    for(const p of people){
      if(Math.hypot(p.x-focus.x,p.y-focus.y)>120)continue;
      const police=p.kind==='police',walking=p.state==='walking',swing=walking?Math.sin(p.walked*5)*.48:0;
      this.root.makeRotationY(-p.heading);this.root.setPosition(renderer.local(p,.24));
      const shirt=police?'#65869d':p.color,pants=police?'#162e46':'#34414b',skin='#ceaa8a';
      add('round',pants,0,.84,0,.34,.22,.26);
      add('round',shirt,0,1.14,0,.43,.62,.29);
      add('tube',skin,0,1.46,0,.12,.13,.12);
      add('round',skin,0,1.62,-.015,.24,.30,.23);
      add('round',police?'#20384c':'#3e322c',0,1.72,.015,.25,.16,.25);
      for(const side of [-1,1]){
        const leg=side*swing,arm=-leg*.85;
        limb(pants,side*.1,.85,0,.72,leg,.14);
        add('round','#18242b',side*.1,.12+Math.max(0,1-Math.cos(leg))*.7,-Math.sin(leg)*.72-.055,.17,.13,.30);
        limb(shirt,side*.25,1.36,0,.43,arm,.13);
        add('round',police?'#eff3ed':skin,side*.25,1.36-Math.cos(arm)*.48,-Math.sin(arm)*.48,.11,.15,.10);
      }
      if(police){
        add('tube','#edf1e9',0,1.79,0,.29,.10,.29);
        add('box','#182d43',0,1.755,-.14,.28,.045,.18);
        add('box','#dae9a0',-.15,1.20,-.13,.055,.40,.04);
        add('box','#dae9a0',.15,1.20,-.13,.055,.40,.04);
        add('box','#dae9a0',0,1.03,-.14,.36,.06,.035);
        add('box','#203441',0,.91,-.03,.37,.055,.29);
        add('box','#203441',-.12,1.30,-.18,.075,.12,.04);
        add('round','#e5ce79',.1,1.33,-.16,.065,.065,.015);
      }else{
        add('round','#645d53',0,1.17,.18,.30,.37,.17);
      }
    }
    for(const mesh of Object.values(this.batches)){mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;}
  }
}
