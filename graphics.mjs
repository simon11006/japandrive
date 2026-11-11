import * as THREE from "./vendor/three.module.js";

// Procedural environment for the drive: a subtropical sky with sun and
// horizon haze, and tiling surface textures. No image files are needed.

export const SUN_DIRECTION = new THREE.Vector3(-0.45, 0.72, -0.53).normalize();
export const HAZE = new THREE.Color("#c9dbdc");

export function makeSky() {
  const geometry = new THREE.SphereGeometry(4000, 32, 16);
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      sun: { value: SUN_DIRECTION.clone() },
      zenith: { value: new THREE.Color("#3f86c6") },
      horizon: { value: new THREE.Color("#cfe2e6") },
      ground: { value: new THREE.Color("#9fb5b0") },
    },
    vertexShader: `varying vec3 vDir;
      void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w; }`,
    fragmentShader: `uniform vec3 sun; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground; varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, zenith, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, ground, clamp(-h*6.0,0.0,1.0));
        // Fair-weather cumulus: soft noise band above the horizon.
        if (h > 0.02) {
          vec2 uv = d.xz / (h + 0.25) * 2.2;
          float n = noise(uv) * 0.55 + noise(uv * 2.3) * 0.3 + noise(uv * 5.1) * 0.15;
          float c = smoothstep(0.58, 0.82, n) * smoothstep(0.02, 0.18, h) * (1.0 - smoothstep(0.55, 0.9, h));
          col = mix(col, vec3(0.97, 0.98, 0.99), c * 0.85);
        }
        float s = max(dot(d, normalize(sun)), 0.0);
        col += vec3(1.0, 0.93, 0.78) * (pow(s, 900.0) * 6.0 + pow(s, 12.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geometry, material);
  sky.frustumCulled = false;
  sky.renderOrder = -1000;
  return sky;
}

function canvas(size, paint) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d"), size);
  const texture = new THREE.CanvasTexture(c);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}
function speckle(c, size, count, colors, seed = 1, w = 1, h = 1) {
  let s = seed;
  for (let i = 0; i < count; i++) {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const x = s % size;
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    const y = s % size;
    c.fillStyle = colors[i % colors.length];
    c.fillRect(x, y, w, h);
  }
}

// Worn asphalt: aggregate speckle and faint tyre-polished bands.
export function asphaltTexture() {
  return canvas(512, (c, n) => {
    c.fillStyle = "#6b6f70";
    c.fillRect(0, 0, n, n);
    speckle(c, n, 60000, ["#5a5e5f", "#7a7e7e", "#4d5152", "#868a89"], 7, 1, 1);
    speckle(c, n, 900, ["#3f4344", "#9a9c98"], 9, 2, 2);
    for (let i = 0; i < 6; i++) {
      c.fillStyle = i % 2 ? "#00000008" : "#ffffff06";
      c.fillRect(0, (i * n) / 6, n, n / 12);
    }
  });
}
export function grassTexture() {
  return canvas(512, (c, n) => {
    c.fillStyle = "#7e9a63";
    c.fillRect(0, 0, n, n);
    speckle(c, n, 50000, ["#6c8a53", "#8faa6d", "#5d7a47", "#9db37a", "#7d8f5c"], 3, 2, 3);
    speckle(c, n, 1500, ["#a59a78", "#8b8061"], 5, 4, 3);
  });
}
export function concreteTexture() {
  return canvas(256, (c, n) => {
    c.fillStyle = "#b9b8ad";
    c.fillRect(0, 0, n, n);
    speckle(c, n, 12000, ["#a9a89e", "#c8c7bc", "#9d9c92"], 11, 1, 1);
  });
}

// Facade tile: one 3.6 m bay by one 3.1 m storey, matching the building
// heights inferred from mapped storeys. Texture repeat is per metre.
export function facadeTexture(wall = "#e6e2d4",style='standard') {
  const texture = canvas(256, (c, n) => {
    c.fillStyle = wall;
    c.fillRect(0, 0, n, n);
    speckle(c, n, 6000, ["#00000009", "#ffffff10"], 13, 2, 2);
    // Floor slab line.
    c.fillStyle = "#0000001a";
    c.fillRect(0, n * 0.9, n, n * 0.04);
    // Window with frame, glass reflection gradient and sill.
    const x = n * (style==='office'?.04:.16),
      y = n * (style==='office'?.10:.22),
      w = n * (style==='office'?.92:.68),
      h = n * (style==='office'?.76:.52);
    c.fillStyle = "#8d918d";
    c.fillRect(x - 4, y - 4, w + 8, h + 8);
    const g = c.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, "#5f7d86");
    g.addColorStop(0.55, "#3a525a");
    g.addColorStop(1, "#2d3f45");
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.fillStyle = "#ffffff22";
    c.beginPath();
    c.moveTo(x, y);
    c.lineTo(x + w * 0.45, y);
    c.lineTo(x, y + h * 0.7);
    c.fill();
    c.fillStyle = "#c6c4b8";
    c.fillRect(x + w * 0.49, y, 3, h);
    c.fillStyle = "#00000022";
    c.fillRect(x - 6, y + h + 4, w + 12, 5);
  });
  texture.repeat.set(1 / 3.6, 1 / 3.1);
  return texture;
}

// Okinawa's reinforced-concrete buildings are mostly white, cream and pale
// grey with flat roofs and rooftop water tanks.
export const WALL_COLORS = ["#ece8da", "#e2dccb", "#d9d8d0", "#efe9e0", "#d6cfbd", "#e8e4dc"];

// Planar world-space UVs for horizontal surfaces (metres / scale).
export function planarUV(geometry, scale = 4) {
  const p = geometry.attributes.position,
    uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    uv[i * 2] = p.getX(i) / scale;
    uv[i * 2 + 1] = p.getZ(i) / scale;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geometry;
}
