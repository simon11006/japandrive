import * as THREE from "./vendor/three.module.js";
import { makeCarModel, disposeCarModel } from "./car-model.mjs";

// The garage uses the drivable car, with a small, locally generated studio IBL.
// Broad white panels make clearcoat/glass legible without shipping a remote HDRI.
export class MenuStage {
  constructor(environment) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0a101b");
    this.scene.fog = new THREE.Fog("#0a101b", 18, 38);
    this.scene.environment = environment;
    this.scene.environmentIntensity = 0.65;
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.1, 60);
    this.scene.add(new THREE.HemisphereLight("#e5eeff", "#27303d", 0.35));
    for (const [x, y, z, color, intensity, shadows] of [
      [-4, 7, -5, "#fff5e8", 2.1, true],
      [5, 4, -2, "#dceaff", 0.85, false],
      [1, 6, 6, "#ffffff", 1.4, false],
    ]) {
      const light = new THREE.DirectionalLight(color, intensity);
      light.position.set(x, y, z);
      light.castShadow = shadows;
      if (shadows) {
        Object.assign(light.shadow.camera, {
          left: -5,
          right: 5,
          top: 5,
          bottom: -5,
          near: 0.5,
          far: 20,
        });
        light.shadow.mapSize.set(2048, 2048);
        light.shadow.normalBias = 0.025;
        light.shadow.bias = -0.0002;
        light.shadow.radius = 3;
      }
      this.scene.add(light);
    }
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100),
      new THREE.MeshStandardMaterial({
        color: "#101824",
        roughness: 0.48,
        metalness: 0.2,
      }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(4.4, 4.6, 0.08, 96),
      new THREE.MeshStandardMaterial({
        color: "#202b38",
        roughness: 0.38,
        metalness: 0.3,
      }),
    );
    podium.position.y = -0.03;
    podium.receiveShadow = true;
    this.scene.add(podium);
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(4.39, 4.41, 128),
      new THREE.MeshBasicMaterial({
        color: "#b5e269",
        transparent: true,
        opacity: 0.5,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.012;
    this.scene.add(ring);
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const ctx = c.getContext("2d"),
      gradient = ctx.createRadialGradient(64, 64, 12, 64, 64, 64);
    gradient.addColorStop(0, "#000b");
    gradient.addColorStop(1, "#0000");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(4, 7),
      new THREE.MeshBasicMaterial({
        map: new THREE.CanvasTexture(c),
        transparent: true,
        depthWrite: false,
      }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.014;
    this.scene.add(shadow);
  }
  prepareEnvironment(renderer) {
    if (this.studioEnvironment) return;
    const room = new THREE.Scene();
    room.background = new THREE.Color("#5a616d");
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(24, 16, 24),
      new THREE.MeshBasicMaterial({ color: "#252d39", side: THREE.BackSide }),
    );
    room.add(wall);
    for (const [x, y, z, w, h, strength] of [
      [-5, 4, -3, 3, 7, 4],
      [6, 2.5, 5, 9, 0.45, 4],
      [5, 5, 0, 1, 5, 2],
      [0, 7, 0, 5, 9, 3],
      [0, 3, -7, 7, 2, 2],
      [0, 4, 7, 4, 3, 3],
    ]) {
      const panel = new THREE.Mesh(
        new THREE.PlaneGeometry(w, h),
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(strength, strength, strength),
          side: THREE.DoubleSide,
          toneMapped: false,
        }),
      );
      panel.position.set(x, y, z);
      panel.lookAt(0, 0.6, 0);
      room.add(panel);
    }
    const generator = new THREE.PMREMGenerator(renderer);
    this.studioEnvironment = generator.fromScene(room, 0.04, 0.1, 40);
    generator.dispose();
    room.traverse((o) => {
      o.geometry?.dispose();
      o.material?.dispose();
    });
    this.scene.environment = this.studioEnvironment.texture;
  }
  render(renderer, car, time, width, height, view = {}) {
    this.prepareEnvironment(renderer);
    if (this.carId !== car.id) {
      if (this.model) {
        this.scene.remove(this.model);
        disposeCarModel(this.model);
      }
      this.carId = car.id;
      this.model = makeCarModel(car.id);
      this.model.position.y = 0.015;
      this.scene.add(this.model);
    }
    const aspect = width / height,
      portrait = aspect < 0.85,
      radius = view.centered ? 8.7 : portrait ? 8 / aspect : 9.4;
    this.model.rotation.y = view.yaw ?? -0.12 + Math.sin(time * 0.12) * 0.12;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    this.camera.position.set(radius * 0.66, radius * 0.25, -radius * 0.75);
    this.camera.lookAt(
      view.centered ? 0 : portrait ? 0 : 1.5,
      view.centered ? 0.85 : portrait ? 1.7 : height < 500 ? 0.4 : 0.8,
      view.centered ? 0 : portrait ? 0 : 1.3,
    );
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }
}
