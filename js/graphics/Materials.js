import * as THREE from 'three';

const toonCache = new Map();
const outlineCache = new Map();
let gradientTexture = null;
let groundTexture = null;
let particleTexture = null;
let cloudTexture = null;

function getGradientTexture() {
  if (gradientTexture) return gradientTexture;
  const data = new Uint8Array([36, 82, 138, 198, 238, 255]);
  gradientTexture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat);
  gradientTexture.minFilter = THREE.NearestFilter;
  gradientTexture.magFilter = THREE.NearestFilter;
  gradientTexture.generateMipmaps = false;
  gradientTexture.needsUpdate = true;
  return gradientTexture;
}

export function toonMaterial(color, options = {}) {
  const material = new THREE.MeshToonMaterial({
    color,
    gradientMap: getGradientTexture(),
    vertexColors: options.vertexColors ?? false,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    alphaTest: options.alphaTest ?? 0,
  });
  material.name = options.name ?? 'toon-material';
  material.userData.baseEmissiveIntensity = material.emissiveIntensity;
  return material;
}

export function sharedToonMaterial(color, options = {}) {
  const key = [color, options.transparent ? 1 : 0, options.opacity ?? 1, options.emissive ?? 0, options.emissiveIntensity ?? 0, options.side ?? 0].join('|');
  if (!toonCache.has(key)) toonCache.set(key, toonMaterial(color, options));
  return toonCache.get(key);
}

export function outlineMaterial(color = 0x172130) {
  if (!outlineCache.has(color)) {
    const material = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
    material.name = 'silhouette-outline';
    outlineCache.set(color, material);
  }
  return outlineCache.get(color);
}

export function outlinedMesh(geometry, material, options = {}) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  if (options.outline !== false) {
    const outline = new THREE.Mesh(geometry, outlineMaterial(options.outlineColor));
    const thickness = options.thickness ?? 1.045;
    outline.scale.setScalar(thickness);
    outline.castShadow = false;
    outline.receiveShadow = false;
    outline.renderOrder = -1;
    outline.frustumCulled = mesh.frustumCulled;
    mesh.add(outline);
    mesh.userData.outline = outline;
  }
  return mesh;
}

export function makeGroundTexture() {
  if (groundTexture) return groundTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const context = canvas.getContext('2d');
  const image = context.createImageData(256, 256);
  for (let y = 0; y < 256; y += 1) {
    for (let x = 0; x < 256; x += 1) {
      const i = (y * 256 + x) * 4;
      const grain = 210 + Math.floor(Math.random() * 42);
      image.data[i] = grain;
      image.data[i + 1] = grain;
      image.data[i + 2] = grain;
      image.data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  context.globalAlpha = 0.09;
  context.strokeStyle = '#111';
  context.lineWidth = 1;
  for (let i = 0; i < 700; i += 1) {
    const x = Math.random() * 256;
    const y = Math.random() * 256;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x + (Math.random() - 0.5) * 7, y + (Math.random() - 0.5) * 7);
    context.stroke();
  }
  groundTexture = new THREE.CanvasTexture(canvas);
  groundTexture.wrapS = groundTexture.wrapT = THREE.RepeatWrapping;
  groundTexture.repeat.set(42, 42);
  groundTexture.colorSpace = THREE.SRGBColorSpace;
  groundTexture.anisotropy = 4;
  return groundTexture;
}

export function groundMaterial() {
  const material = new THREE.MeshToonMaterial({
    color: 0xffffff,
    vertexColors: true,
    map: makeGroundTexture(),
    gradientMap: getGradientTexture(),
  });
  material.name = 'procedural-terrain';
  return material;
}

export function makeParticleTexture() {
  if (particleTexture) return particleTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 96;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 46);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,.95)');
  gradient.addColorStop(0.58, 'rgba(255,255,255,.35)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 96, 96);
  particleTexture = new THREE.CanvasTexture(canvas);
  particleTexture.colorSpace = THREE.SRGBColorSpace;
  return particleTexture;
}

export function makeCloudTexture() {
  if (cloudTexture) return cloudTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, 256, 128);
  const blobs = [
    [56, 78, 46], [96, 59, 53], [137, 72, 62], [184, 75, 43], [116, 91, 70],
  ];
  for (const [x, y, radius] of blobs) {
    const gradient = context.createRadialGradient(x, y, radius * .08, x, y, radius);
    gradient.addColorStop(0, 'rgba(255,255,255,.92)');
    gradient.addColorStop(.5, 'rgba(255,255,255,.52)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    context.fillStyle = gradient;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  cloudTexture = new THREE.CanvasTexture(canvas);
  cloudTexture.colorSpace = THREE.SRGBColorSpace;
  return cloudTexture;
}

export function spriteMaterial(color, opacity = 1, blending = THREE.AdditiveBlending) {
  return new THREE.SpriteMaterial({
    map: makeParticleTexture(),
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    blending,
  });
}

export function shadowMaterial(opacity = 0.22) {
  return new THREE.MeshBasicMaterial({
    color: 0x101722,
    transparent: true,
    opacity,
    depthWrite: false,
  });
}

export function createSkyMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      uTop: { value: new THREE.Color(0x4f8fb5) },
      uHorizon: { value: new THREE.Color(0xc9e1c5) },
      uBottom: { value: new THREE.Color(0xf4cf98) },
      uSunDirection: { value: new THREE.Vector3(-.45, .72, -.32).normalize() },
      uTime: { value: 0 },
    },
    vertexShader: `
      varying vec3 vWorldDirection;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldDirection = normalize(worldPosition.xyz - cameraPosition);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      uniform vec3 uBottom;
      uniform vec3 uSunDirection;
      uniform float uTime;
      varying vec3 vWorldDirection;
      void main() {
        float h = normalize(vWorldDirection).y;
        float upper = smoothstep(-0.05, 0.78, h);
        vec3 color = mix(uHorizon, uTop, upper);
        color = mix(uBottom, color, smoothstep(-0.5, 0.12, h));
        float sun = pow(max(dot(normalize(vWorldDirection), normalize(uSunDirection)), 0.0), 420.0);
        float halo = pow(max(dot(normalize(vWorldDirection), normalize(uSunDirection)), 0.0), 18.0);
        color += vec3(1.0, .76, .42) * sun * 3.2 + vec3(1.0, .62, .28) * halo * .18;
        float bands = sin((h + uTime * .002) * 65.0) * .004;
        gl_FragColor = vec4(color + bands, 1.0);
      }
    `,
  });
}

export function createWaterMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(0x286f8a) },
      uShallow: { value: new THREE.Color(0x75d7cf) },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      void main() {
        vec3 p = position;
        float wave = sin(p.x * .075 + uTime * .8) * .18 + cos(p.y * .09 - uTime * .62) * .13;
        p.z += wave;
        vec4 world = modelMatrix * vec4(p, 1.0);
        vWorld = world.xyz;
        vWave = wave;
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uDeep;
      uniform vec3 uShallow;
      uniform float uTime;
      varying vec3 vWorld;
      varying float vWave;
      void main() {
        float ripple = sin(vWorld.x * .36 + vWorld.z * .22 + uTime * 1.6) * .5 + .5;
        float line = smoothstep(.82, .98, ripple) * .14;
        vec3 color = mix(uDeep, uShallow, .36 + vWave * .7) + line;
        gl_FragColor = vec4(color, .78);
      }
    `,
  });
}

export function createUnlit(color, options = {}) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    side: options.side ?? THREE.FrontSide,
    depthWrite: options.depthWrite ?? true,
    blending: options.blending ?? THREE.NormalBlending,
  });
}
