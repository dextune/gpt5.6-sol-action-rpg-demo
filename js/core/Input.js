import * as THREE from 'three';

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mouseDown = new Set();
    this.mousePressed = new Set();
    this.pointer = new THREE.Vector2(0, 0);
    this.pointerPixels = new THREE.Vector2();
    this.pointerDelta = new THREE.Vector2();
    this.wheel = 0;

    window.addEventListener('keydown', event => {
      if (!event.repeat) this.pressed.add(event.code);
      this.down.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) event.preventDefault();
    }, { passive: false });
    window.addEventListener('keyup', event => this.down.delete(event.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown.clear();
    });

    canvas.tabIndex = 0;
    canvas.addEventListener('pointermove', event => this.#updatePointer(event));
    canvas.addEventListener('pointerdown', event => {
      this.#updatePointer(event);
      this.mouseDown.add(event.button);
      this.mousePressed.add(event.button);
      canvas.focus();
    });
    window.addEventListener('pointerup', event => this.mouseDown.delete(event.button));
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('wheel', event => {
      this.wheel += Math.sign(event.deltaY);
      event.preventDefault();
    }, { passive: false });
  }

  #updatePointer(event) {
    const rect = this.canvas.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    this.pointerDelta.x += px - this.pointerPixels.x;
    this.pointerDelta.y += py - this.pointerPixels.y;
    this.pointerPixels.set(px, py);
    this.pointer.x = (px / Math.max(1, rect.width)) * 2 - 1;
    this.pointer.y = -(py / Math.max(1, rect.height)) * 2 + 1;
  }

  isDown(code) { return this.down.has(code); }
  isMouseDown(button) { return this.mouseDown.has(button); }
  consume(code) {
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }
  consumeAny(...codes) {
    for (const code of codes) if (this.consume(code)) return true;
    return false;
  }
  consumeMouse(button) {
    if (!this.mousePressed.has(button)) return false;
    this.mousePressed.delete(button);
    return true;
  }
  consumeWheel() {
    const value = this.wheel;
    this.wheel = 0;
    return value;
  }
  consumePointerDelta() {
    const value = this.pointerDelta.clone();
    this.pointerDelta.set(0, 0);
    return value;
  }
  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    this.wheel = 0;
    this.pointerDelta.set(0, 0);
  }
}
