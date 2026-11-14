import * as THREE from './vendor/three.module.js';
import {makeCarModel} from './car-model.mjs';

// The garage shows the same native model used in the drive, lit in a studio.
export class MenuStage {
  constructor(environment){
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color('#0a101b');
    this.scene.fog=new THREE.Fog('#0a101b',18,38);this.scene.environment=environment;this.scene.environmentIntensity=.8;
    this.camera=new THREE.PerspectiveCamera(36,1,.1,60);
    this.scene.add(new THREE.HemisphereLight('#cee8ff','#222936',2.5));
    for(const [x,z,color,intensity]of [[-6,-4,'#bddaff',85],[5,1,'#ffffff',120],[1,7,'#dfff98',55]]){
      const light=new THREE.PointLight(color,intensity,28,2);light.position.set(x,5,z);this.scene.add(light);
    }
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:'#121d2a',roughness:.58,metalness:.35}));
    floor.rotation.x=-Math.PI/2;floor.position.y=-.025;this.scene.add(floor);
    const podium=new THREE.Mesh(new THREE.CylinderGeometry(4.4,4.6,.08,96),new THREE.MeshStandardMaterial({color:'#27323e',roughness:.4,metalness:.4}));
    podium.position.y=-.015;this.scene.add(podium);
    const ring=new THREE.Mesh(new THREE.RingGeometry(4.39,4.41,128),new THREE.MeshBasicMaterial({color:'#b5e269',transparent:true,opacity:.5}));
    ring.rotation.x=-Math.PI/2;ring.position.y=.035;this.scene.add(ring);
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(64,64,12,64,64,64);
    gradient.addColorStop(0,'#000b');gradient.addColorStop(1,'#0000');ctx.fillStyle=gradient;ctx.fillRect(0,0,128,128);
    const shadow=new THREE.Mesh(new THREE.PlaneGeometry(4,7),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthWrite:false}));
    shadow.rotation.x=-Math.PI/2;shadow.position.y=.04;this.scene.add(shadow);
  }
  render(renderer,car,time,width,height){
    if(this.carId!==car.id){
      if(this.model){this.scene.remove(this.model);this.model.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat().filter(Boolean))m.dispose();});}
      this.carId=car.id;this.model=makeCarModel(car.id);this.model.position.y=.05;this.scene.add(this.model);
    }
    const aspect=width/height,portrait=aspect<.85,radius=portrait?8/aspect:9.4;
    this.model.rotation.y=.35+Math.sin(time*.12)*.18;
    this.camera.aspect=aspect;this.camera.updateProjectionMatrix();
    this.camera.position.set(radius*.66,radius*.27,-radius*.75);
    this.camera.lookAt(portrait?0:1.5,portrait?1.7:.8,portrait?0:1.3);
    renderer.setRenderTarget(null);renderer.render(this.scene,this.camera);
  }
}
