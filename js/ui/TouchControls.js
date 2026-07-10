/**
 * Mobile / coarse-pointer virtual controls.
 * Left: movement joystick · Right: combat ability bar (CSS-repositioned).
 */
export class TouchControls {
  constructor(game) {
    this.game = game;
    this.input = game.input;
    this.enabled = false;
    this.root = document.getElementById('touch-controls');
    this.stickZone = document.getElementById('touch-stick-zone');
    this.stickKnob = document.getElementById('touch-stick-knob');
    this.menuBtn = document.getElementById('touch-menu-btn');
    this.abilityBar = document.querySelector('.ability-bar');
    this.stickPointerId = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.radius = 54;
    this._mq = null;
    this._onResize = () => this.#evaluate();
    this._bound = false;

    if (!this.root || !this.stickZone) {
      console.warn('TouchControls: missing #touch-controls markup');
      return;
    }

    this.#bindStick();
    this.#bindAbilitySlots();
    this.#bindMenu();
    this.#bindMedia();
    this.#evaluate();
  }

  #bindMedia() {
    this._mq = window.matchMedia('(max-width: 900px), (pointer: coarse), (hover: none)');
    if (this._mq.addEventListener) this._mq.addEventListener('change', this._onResize);
    else this._mq.addListener?.(this._onResize);
    window.addEventListener('orientationchange', this._onResize);
    window.addEventListener('resize', this._onResize);
  }

  #evaluate() {
    const touchCapable = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
    const compact = window.matchMedia('(max-width: 900px)').matches;
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    const hoverNone = window.matchMedia('(hover: none)').matches;
    // Enable on phones/tablets and touch laptops in compact layout; keep desktop pure keyboard.
    const want = (touchCapable && (compact || coarse || hoverNone)) || (compact && coarse);
    this.setEnabled(want);
  }

  setEnabled(on) {
    const next = Boolean(on);
    if (this.enabled === next) {
      document.body.classList.toggle('touch-ui', next);
      return;
    }
    this.enabled = next;
    document.body.classList.toggle('touch-ui', next);
    if (this.root) {
      this.root.classList.toggle('hidden', !next);
      this.root.setAttribute('aria-hidden', next ? 'false' : 'true');
    }
    if (!next) {
      this.#resetStick();
      this.#releaseAllVirtual();
    }
  }

  #releaseAllVirtual() {
    for (const code of ['KeyJ', 'Space', 'KeyQ', 'KeyE', 'KeyR', 'KeyC', 'Digit1']) {
      this.input.setVirtualButton(code, false);
    }
  }

  #bindStick() {
    const zone = this.stickZone;
    const onDown = (event) => {
      if (!this.enabled) return;
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      this.stickPointerId = event.pointerId;
      const rect = zone.getBoundingClientRect();
      this.radius = Math.min(rect.width, rect.height) * 0.45;
      this.stickOrigin.x = rect.left + rect.width * 0.5;
      this.stickOrigin.y = rect.top + rect.height * 0.5;
      // Dynamic origin: start from touch point for more natural feel
      this.stickOrigin.x = event.clientX;
      this.stickOrigin.y = event.clientY;
      zone.classList.add('active');
      try { zone.setPointerCapture(event.pointerId); } catch { /* ignore */ }
      this.#updateStick(event.clientX, event.clientY);
    };
    const onMove = (event) => {
      if (this.stickPointerId !== event.pointerId) return;
      event.preventDefault();
      this.#updateStick(event.clientX, event.clientY);
    };
    const onUp = (event) => {
      if (this.stickPointerId !== event.pointerId) return;
      event.preventDefault();
      this.stickPointerId = null;
      this.#resetStick();
    };
    zone.addEventListener('pointerdown', onDown, { passive: false });
    zone.addEventListener('pointermove', onMove, { passive: false });
    zone.addEventListener('pointerup', onUp, { passive: false });
    zone.addEventListener('pointercancel', onUp, { passive: false });
  }

  #updateStick(clientX, clientY) {
    let dx = clientX - this.stickOrigin.x;
    let dy = clientY - this.stickOrigin.y;
    const len = Math.hypot(dx, dy);
    const max = this.radius;
    if (len > max && len > 0.001) {
      dx = (dx / len) * max;
      dy = (dy / len) * max;
    }
    if (this.stickKnob) {
      this.stickKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    }
    // Screen: +x right, +y down → game: +x right, +y forward (invert y)
    const nx = max > 0 ? dx / max : 0;
    const ny = max > 0 ? -dy / max : 0;
    const mag = Math.hypot(nx, ny);
    const dead = 0.06;
    if (mag < dead) { this.input.setVirtualAxes(0, 0); return; }
    const t = Math.min(1, ((mag - dead) / (1 - dead)) * 1.5);
    this.input.setVirtualAxes(nx * t, ny * t);
  }

  #resetStick() {
    this.input.setVirtualAxes(0, 0);
    this.stickZone?.classList.remove('active');
    if (this.stickKnob) this.stickKnob.style.transform = 'translate(-50%, -50%)';
  }

  #slotToCode(slot) {
    const map = {
      attack: 'KeyJ',
      dash: 'Space',
      'skill-q': 'KeyQ',
      'skill-e': 'KeyE',
      'skill-r': 'KeyR',
      'skill-c': 'KeyC',
      potion: 'Digit1',
    };
    return map[slot] ?? null;
  }

  #bindAbilitySlots() {
    if (!this.abilityBar) return;
    this.abilityBar.querySelectorAll('.ability-slot').forEach(slot => {
      const code = this.#slotToCode(slot.dataset.slot);
      if (!code) return;
      let holdId = null;
      const down = (event) => {
        if (!this.enabled) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        holdId = event.pointerId;
        slot.classList.add('touch-active');
        try { slot.setPointerCapture(event.pointerId); } catch { /* ignore */ }
        // One-shot actions: press edge; attack can hold
        // Hold attack; one-shot edge for dash/skills/potion via virtualPressed.
        this.input.setVirtualButton(code, true);
        if (code !== 'KeyJ') this.input.virtualPressed.add(code);
      };
      const up = (event) => {
        if (holdId != null && event.pointerId !== holdId) return;
        holdId = null;
        slot.classList.remove('touch-active');
        this.input.setVirtualButton(code, false);
      };
      slot.addEventListener('pointerdown', down, { passive: false });
      slot.addEventListener('pointerup', up, { passive: false });
      slot.addEventListener('pointercancel', up, { passive: false });
      slot.addEventListener('pointerleave', (e) => {
        if (holdId != null && e.pointerId === holdId && e.pointerType !== 'touch') up(e);
      });
    });
  }

  #bindMenu() {
    this.menuBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (this.game.state === 'paused') this.game.ui.closePanel();
      else if (this.game.state === 'playing' || this.game.state === 'defense') {
        this.game.ui.openPanel('pause');
      }
    });
  }

  dispose() {
    this.#resetStick();
    this.#releaseAllVirtual();
    if (this._mq?.removeEventListener) this._mq.removeEventListener('change', this._onResize);
    window.removeEventListener('orientationchange', this._onResize);
    window.removeEventListener('resize', this._onResize);
  }
}
