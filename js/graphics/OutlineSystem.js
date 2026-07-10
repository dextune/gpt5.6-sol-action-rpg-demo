import * as THREE from 'three';

/** Selective screen-space silhouette outlines. Environment objects are never registered. */
export class OutlineSystem {
  constructor(outlinePass = null) {
    this.pass = outlinePass;
    this.entries = new Map();
    this.selected = [];
    this.defaultColor = new THREE.Color(0x263744);
    this._worldPos = new THREE.Vector3();
  }

  configure(root, options = {}) {
    if (!root) return;
    this.entries.set(root, {
      root,
      enabled: options.enabled !== false,
      maxDistance: options.maxDistance ?? 34,
      priority: options.priority ?? 0,
      color: new THREE.Color(options.color ?? this.defaultColor),
    });
    root.userData.selectiveOutline = true;
  }

  update(camera) {
    // OutlinePass is disabled for performance; skip per-frame selection work.
    if (!this.pass?.enabled || !camera) return;
    this.selected.length = 0;
    const cam = camera.position;
    for (const entry of this.entries.values()) {
      if (!entry.enabled || !entry.root.parent || !entry.root.visible) continue;
      const distance = cam.distanceTo(entry.root.getWorldPosition(this._worldPos));
      if (distance <= entry.maxDistance) this.selected.push(entry.root);
    }
    this.selected.sort((a, b) => (this.entries.get(b)?.priority ?? 0) - (this.entries.get(a)?.priority ?? 0));
    this.pass.selectedObjects = this.selected.slice(0, 26);
  }

  unregister(root) {
    this.entries.delete(root);
    if (this.pass) this.pass.selectedObjects = this.pass.selectedObjects.filter(object => object !== root);
  }

  dispose() {
    this.entries.clear();
    this.selected.length = 0;
    if (this.pass) this.pass.selectedObjects = [];
  }
}
