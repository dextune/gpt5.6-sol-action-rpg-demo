import * as THREE from 'three';

export class WaterSystem {
  constructor(root, terrain, quality = 'medium') {
    this.root = root;
    this.terrain = terrain;
    this.quality = quality;
    this.time = 0;
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: { uTime: { value: 0 }, uShallow: { value: new THREE.Color(0x66c5bd) }, uDeep: { value: new THREE.Color(0x276b82) }, uSun: { value: new THREE.Color(0xffe8b2) }, uOpacity: { value: .76 } },
      vertexShader: `varying vec3 vWorld; varying vec3 vNormalW; uniform float uTime;
        void main(){ vec3 p=position; p.z += sin((p.x+p.y)*1.55+uTime*1.25)*.035 + sin(p.x*2.4-uTime*.8)*.018; vec4 w=modelMatrix*vec4(p,1.0); vWorld=w.xyz; vNormalW=normalize(mat3(modelMatrix)*normal); gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `varying vec3 vWorld; varying vec3 vNormalW; uniform float uTime; uniform vec3 uShallow; uniform vec3 uDeep; uniform vec3 uSun; uniform float uOpacity;
        void main(){ vec3 viewDir=normalize(cameraPosition-vWorld); float fres=pow(1.0-max(0.0,dot(normalize(vNormalW),viewDir)),3.0); float ripple=sin(vWorld.x*2.2+uTime*1.3)*sin(vWorld.z*2.0-uTime*.9)*.5+.5; vec3 col=mix(uShallow,uDeep,.34+fres*.42); col += uSun*pow(max(0.0,ripple),10.0)*.12; gl_FragColor=vec4(col,uOpacity-fres*.12); }`,
    });
    this.build();
  }

  build() {
    this.ocean = new THREE.Mesh(new THREE.CircleGeometry(245, 128), this.material);
    this.ocean.name = 'DioramaOcean'; this.ocean.rotation.x = -Math.PI / 2; this.ocean.position.y = -2.56; this.ocean.renderOrder = -2; this.root.add(this.ocean);
    const pondMaterial = this.material.clone(); pondMaterial.uniforms = THREE.UniformsUtils.clone(this.material.uniforms); pondMaterial.uniforms.uOpacity.value = .82;
    this.pond = new THREE.Mesh(new THREE.CircleGeometry(3.6, 64), pondMaterial);
    this.pond.name = 'EmeraldSpring'; this.pond.rotation.x = -Math.PI / 2; this.pond.position.set(10.5, this.terrain.heightAt(10.5, 14) + .09, 14); this.pond.renderOrder = 2; this.root.add(this.pond);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(3.72, .22, 10, 64), new THREE.MeshStandardMaterial({ color: 0xa99b79, roughness: .89 }));
    rim.rotation.x = Math.PI / 2; rim.position.copy(this.pond.position); rim.position.y -= .08; rim.castShadow = true; rim.receiveShadow = true; this.root.add(rim); this.rim = rim;
  }

  update(delta) {
    this.time += delta;
    this.material.uniforms.uTime.value = this.time;
    this.pond.material.uniforms.uTime.value = this.time;
  }

  dispose() {
    for (const mesh of [this.ocean, this.pond, this.rim]) { mesh?.geometry.dispose(); mesh?.material.dispose(); }
  }
}
