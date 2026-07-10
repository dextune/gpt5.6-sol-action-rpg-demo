import * as THREE from 'three';

/**
 * Keyboard + mouse + virtual (touch) input.
 * Virtual buttons use the same code strings as keyboard (KeyJ, Space, KeyQ, …).
 */
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

    /** Camera-relative stick: x = strafe, y = forward (both -1..1). */
    this.virtualAxes = { x: 0, y: 0 };
    this.virtualDown = new Set();
    this.virtualPressed = new Set();

    /** Touch look on canvas (mobile camera orbit). */
    this.lookPointerId = null;
    this.lookLastX = 0;
    this.lookLastY = 0;
    this.lookDeltaX = 0;
    this.pinchDistance = 0;
    this.pinchZoom = 0;
    this.activeTouches = new Map();

    window.addEventListener('keydown', event => {
      if (!event.repeat) this.pressed.add(event.code);
      this.down.add(event.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.code)) {
        event.preventDefault();
      }
    }, { passive: false });
    window.addEventListener('keyup', event => this.down.delete(event.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouseDown.clear();
      this.virtualDown.clear();
      this.virtualAxes.x = 0;
      this.virtualAxes.y = 0;
      this.lookPointerId = null;
      this.activeTouches.clear();
    });

    canvas.tabIndex = 0;
    canvas.addEventListener('pointermove', event => this.#onCanvasPointerMove(event));
    canvas.addEventListener('pointerdown', event => {
      this.#updatePointer(event);
      this.mouseDown.add(event.button);
      this.mousePressed.add(event.button);
      canvas.focus();
      if (event.pointerType === 'touch') {
        this.activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (this.activeTouches.size === 1) {
          this.lookPointerId = event.pointerId;
          this.lookLastX = event.clientX;
          this.lookLastY = event.clientY;
        } else if (this.activeTouches.size === 2) {
          this.lookPointerId = null;
          this.pinchDistance = this.#touchDistance();
        }
        try { canvas.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      }
    });
    window.addEventListener('pointerup', event => {
      this.mouseDown.delete(event.button);
      this.#onCanvasPointerEnd(event);
    });
    window.addEventListener('pointercancel', event => this.#onCanvasPointerEnd(event));
    canvas.addEventListener('contextmenu', event => event.preventDefault());
    canvas.addEventListener('wheel', event => {
      this.wheel += Math.sign(event.deltaY);
      event.preventDefault();
    }, { passive: false });
  }

  #touchDistance() {
    const pts = [...this.activeTouches.values()];
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  #onCanvasPointerMove(event) {
    this.#updatePointer(event);
    if (event.pointerType === 'touch' && this.activeTouches.has(event.pointerId)) {
      this.activeTouches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (this.activeTouches.size >= 2) {
        const dist = this.#touchDistance();
        if (this.pinchDistance > 8) {
          // Pinch out = zoom in (negative wheel = closer in game)
          this.pinchZoom += (this.pinchDistance - dist) * 0.035;
        }
        this.pinchDistance = dist;
        return;
      }
      if (this.lookPointerId === event.pointerId) {
        this.lookDeltaX += event.clientX - this.lookLastX;
        this.lookLastX = event.clientX;
        this.lookLastY = event.clientY;
      }
    }
  }

  #onCanvasPointerEnd(event) {
    if (event.pointerType === 'touch') {
      this.activeTouches.delete(event.pointerId);
      if (this.lookPointerId === event.pointerId) this.lookPointerId = null;
      if (this.activeTouches.size === 1) {
        const [id, pt] = this.activeTouches.entries().next().value;
        this.lookPointerId = id;
        this.lookLastX = pt.x;
        this.lookLastY = pt.y;
      }
      if (this.activeTouches.size < 2) this.pinchDistance = 0;
    }
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

  /** @param {number} x -1..1 right  @param {number} y -1..1 forward */
  setVirtualAxes(x, y) {
    this.virtualAxes.x = Math.max(-1, Math.min(1, x || 0));
    this.virtualAxes.y = Math.max(-1, Math.min(1, y || 0));
  }

  setVirtualButton(code, isDown) {
    if (!code) return;
    if (isDown) {
      if (!this.virtualDown.has(code)) this.virtualPressed.add(code);
      this.virtualDown.add(code);
    } else {
      this.virtualDown.delete(code);
    }
  }

  pulseVirtualButton(code) {
    if (!code) return;
    this.virtualPressed.add(code);
    this.virtualDown.add(code);
    // Release next frame via endFrame for one-shot; keep down one frame for isDown skills that use consume
    queueMicrotask(() => {
      // keep pressed until endFrame consumes it; clear held for one-shots after short hold
    });
  }

  isDown(code) {
    return this.down.has(code) || this.virtualDown.has(code);
  }

  isMouseDown(button) { return this.mouseDown.has(button); }

  consume(code) {
    if (this.pressed.has(code)) {
      this.pressed.delete(code);
      return true;
    }
    if (this.virtualPressed.has(code)) {
      this.virtualPressed.delete(code);
      return true;
    }
    return false;
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

  /** Horizontal look delta from touch drag (pixels). */
  consumeLookDelta() {
    const x = this.lookDeltaX;
    this.lookDeltaX = 0;
    return x;
  }

  /** Pinch zoom accumulated (positive ≈ zoom out like wheel). */
  consumePinchZoom() {
    const z = this.pinchZoom;
    this.pinchZoom = 0;
    return z;
  }

  hasVirtualMove() {
    return (this.virtualAxes.x * this.virtualAxes.x + this.virtualAxes.y * this.virtualAxes.y) > 0.0025;
  }

  endFrame() {
    this.pressed.clear();
    this.mousePressed.clear();
    this.virtualPressed.clear();
    this.wheel = 0;
    this.pointerDelta.set(0, 0);
    // one-shot virtual buttons that were only pulsed: release holds not re-asserted
    // Attack (KeyJ) may stay down while finger held — managed by TouchControls
  }
}
