import * as THREE from 'three';

const TMP = new THREE.Vector3();
const TARGET = new THREE.Vector3();

export class LightingSystem {
  constructor(scene, quality = 'high') {
    this.scene = scene;
    this.quality = quality;
    this.time = 0;

    scene.fog = new THREE.FogExp2(0xc8d6be, quality === 'low' ? .0086 : .0064);

    this.sky = new THREE.HemisphereLight(0xbfd9ea, 0x8a6343, .82);
    this.scene.add(this.sky);

    this.sun = new THREE.DirectionalLight(0xffd8a0, 2.7);
    this.sun.name = 'WarmKeySun';
    this.sun.castShadow = true;
    this.sun.position.set(-25, 40, 22);
    this.sun.target.position.set(0, 0, 0);
    this.scene.add(this.sun, this.sun.target);

    this.bounce = new THREE.DirectionalLight(0xf1aa6d, .28);
    this.bounce.name = 'WarmGroundBounce';
    this.bounce.position.set(12, 5, -16);
    this.scene.add(this.bounce);

    this.coolFill = new THREE.DirectionalLight(0x94bcd2, .26);
    this.coolFill.name = 'CoolSkyFill';
    this.coolFill.position.set(24, 20, -30);
    this.scene.add(this.coolFill);

    this.camp = new THREE.PointLight(0xffa45e, 16, 24, 1.65);
    this.camp.position.set(0, 2.8, 8.2);
    this.scene.add(this.camp);

    this.applyQuality(quality);
  }

  applyQuality(quality) {
    this.quality = quality;
    // 4096 shadow maps are a common stutter source on mid-range GPUs.
    const mapSize = quality === 'high' ? 2048 : quality === 'medium' ? 1024 : 512;
    this.sun.castShadow = quality !== 'low';
    this.sun.shadow.mapSize.set(mapSize, mapSize);
    if (this.sun.shadow.map) {
      this.sun.shadow.map.dispose();
      this.sun.shadow.map = null;
    }
    const radius = quality === 'high' ? 20 : quality === 'medium' ? 24 : 30;
    this.sun.shadow.camera.left = -radius;
    this.sun.shadow.camera.right = radius;
    this.sun.shadow.camera.top = radius;
    this.sun.shadow.camera.bottom = -radius;
    this.sun.shadow.camera.near = 2;
    this.sun.shadow.camera.far = 80;
    this.sun.shadow.bias = -.00028;
    this.sun.shadow.normalBias = quality === 'high' ? .02 : .035;
    this.sun.shadow.radius = quality === 'high' ? 2 : 1;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.scene.fog.density = quality === 'low' ? .0092 : quality === 'medium' ? .0072 : .0064;
  }

  update(delta, focus, zone = null) {
    this.time += delta;
    if (focus) {
      const lerp = 1 - Math.exp(-2.7 * delta);
      this.sun.position.lerp(TMP.set(focus.x - 25, focus.y + 40, focus.z + 22), lerp);
      this.sun.target.position.lerp(TARGET.set(focus.x + 1.8, focus.y, focus.z - 1.2), lerp);
      this.bounce.position.set(focus.x + 12, focus.y + 5, focus.z - 16);
      this.coolFill.position.set(focus.x + 24, focus.y + 20, focus.z - 30);
    }
    this.camp.intensity = 13.5 + Math.sin(this.time * 7.3) * 1.2;
    if (zone?.fog) {
      const target = new THREE.Color(zone.fog).lerp(new THREE.Color(0xffd8b3), .12);
      this.scene.fog.color.lerp(target, Math.min(1, delta * .32));
    }
  }

  dispose() {
    this.scene.remove(this.sky, this.sun, this.sun.target, this.bounce, this.coolFill, this.camp);
    this.sun.shadow.map?.dispose?.();
  }
}
