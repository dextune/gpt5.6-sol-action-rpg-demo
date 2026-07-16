import * as THREE from 'three';

export class CharacterAnimationController {
  constructor(root, clips = [], options = {}) {
    this.root = root;
    this.mixer = new THREE.AnimationMixer(root);
    this.actions = new Map();
    this.clips = new Map();
    this.current = null;
    this.currentName = '';
    this.oneShot = null;
    this.elapsed = 0;
    this.tickAccumulator = 0;
    this.referenceRunSpeed = options.referenceRunSpeed ?? 6.4;
    this.defaultFade = options.defaultFade ?? .14;
    /** Discrete locomotion band for hysteresis (idle|walk|run|sprint). */
    this.locoBand = 'idle';
    /** Absolute speed hysteresis between walk/run bands (world units). */
    this.locoHysteresis = options.locoHysteresis ?? .12;
    this.events = [];
    this.disposed = false;
    for (const clip of clips) {
      this.clips.set(clip.name, clip);
      const action = this.mixer.clipAction(clip);
      action.enabled = true;
      this.actions.set(clip.name, action);
    }
    if (this.actions.has('idle')) this.play('idle', { fade: 0, loop: true });
  }

  has(name) { return this.actions.has(name); }
  clip(name) { return this.clips.get(name) ?? null; }

  play(name, options = {}) {
    if (this.disposed) return null;
    const action = this.actions.get(name) ?? this.actions.get('idle');
    if (!action) return null;
    const resolvedName = action.getClip().name;
    const loop = options.loop !== false;
    const clamp = options.clamp ?? !loop;
    const timeScale = options.timeScale ?? 1;
    const fade = options.fade ?? this.defaultFade;
    if (this.current === action && !options.restart) {
      action.timeScale = timeScale;
      return action;
    }
    // Replacing an active one-shot (e.g. hit reaction over a skill cast) must not
    // silently drop scheduled timeline events — MP/cooldown were already spent.
    if (this.oneShot && this.oneShot.action !== action) this.#flushEvents(this.oneShot.action);
    action.enabled = true;
    action.setEffectiveTimeScale(timeScale);
    action.setEffectiveWeight(1);
    action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
    action.clampWhenFinished = clamp;
    if (options.restart !== false) action.reset();
    if (this.current && this.current !== action) {
      action.crossFadeFrom(this.current, Math.max(.01, fade), true);
    } else action.fadeIn(Math.max(.01, fade));
    action.play();
    this.current = action;
    this.currentName = resolvedName;
    if (!loop) {
      const duration = action.getClip().duration / Math.max(.01, Math.abs(timeScale));
      this.oneShot = {
        action,
        name: resolvedName,
        elapsed: 0,
        duration,
        fallback: options.fallback ?? 'idle',
        fadeOut: options.fadeOut ?? Math.min(.16, duration * .25),
      };
    } else if (!options.keepOneShot) this.oneShot = null;
    return action;
  }

  playOneShot(name, options = {}) {
    return this.play(name, { ...options, loop: false, restart: true });
  }

  /**
   * Discrete locomotion selection (static-resource plan): one looping clip at a time.
   * Bands: idle → walk → run → sprint. Walk falls back to run if the clip is missing.
   * Uses hysteresis so walk↔run does not chatter. Never multi-weight blend.
   */
  setLocomotion(speed, options = {}) {
    if (this.oneShot && !options.force) return;
    const name = this.#resolveLocomotionName(speed, options);
    const ref = this.referenceRunSpeed;
    const reference = name === 'sprint' ? ref * 1.38
      : name === 'walk' ? ref * 0.38
      : ref;
    const timeScale = name === 'idle' ? 1 : THREE.MathUtils.clamp(speed / Math.max(.01, reference), .7, 1.65);
    const fade = name === 'idle' ? .18 : name === 'walk' ? .16 : .12;
    this.play(name, { loop: true, fade, timeScale, restart: false });
  }

  /**
   * Resolve discrete locomotion clip name + update hysteresis band.
   * Exposed for tests that drive the real selection path without GLBs.
   */
  resolveLocomotionName(speed, options = {}) {
    return this.#resolveLocomotionName(speed, options);
  }

  #resolveLocomotionName(speed, options = {}) {
    const ref = this.referenceRunSpeed;
    const idleMax = .18;
    const walkRun = ref * .42;
    const sprintMin = ref * 1.22;
    const h = options.hysteresis ?? this.locoHysteresis;
    const wantSprint = Boolean(options.sprint) || speed > sprintMin;
    let band = this.locoBand || 'idle';

    if (speed < idleMax) {
      band = 'idle';
    } else if (wantSprint && this.has('sprint')) {
      band = 'sprint';
    } else if (band === 'walk') {
      // Need clear overshoot to promote to run.
      band = speed >= walkRun + h ? 'run' : 'walk';
    } else if (band === 'run' || band === 'sprint') {
      // Need clear undershoot to demote to walk.
      if (speed < walkRun - h && this.has('walk')) band = 'walk';
      else if (speed < walkRun - h) band = this.has('run') ? 'run' : 'idle';
      else band = this.has('run') ? 'run' : (this.has('walk') ? 'walk' : 'idle');
    } else {
      // From idle (or unknown): enter walk when available and below walk/run split.
      if (speed < walkRun && this.has('walk')) band = 'walk';
      else band = this.has('run') ? 'run' : (this.has('walk') ? 'walk' : 'idle');
    }

    this.locoBand = band;

    // Clip presence fallbacks — never invent multi-clip blends.
    if (band === 'walk' && !this.has('walk')) return this.has('run') ? 'run' : 'idle';
    if (band === 'run' && !this.has('run')) return this.has('walk') ? 'walk' : 'idle';
    if (band === 'sprint' && !this.has('sprint')) return this.has('run') ? 'run' : (this.has('walk') ? 'walk' : 'idle');
    if (band === 'idle' && !this.has('idle')) return this.has('run') ? 'run' : 'idle';
    return band;
  }

  scheduleNormalized(normalizedTime, callback, key = Symbol('animation-event')) {
    if (!this.oneShot) return null;
    this.events.push({ action: this.oneShot.action, normalizedTime, callback, key, fired: false });
    return key;
  }

  cancelEvents(key) {
    this.events = this.events.filter(event => event.key !== key);
  }

  /** Fire and clear any unfired events bound to an interrupted one-shot action. */
  #flushEvents(action) {
    const pending = this.events.filter(event => event.action === action && !event.fired);
    this.events = this.events.filter(event => event.action !== action);
    for (const event of pending) {
      event.fired = true;
      try { event.callback?.(); } catch (error) { console.error('Animation event failed:', error); }
    }
  }

  update(delta, options = {}) {
    if (this.disposed) return;
    const distance = options.distance ?? 0;
    const visible = options.visible !== false;
    const interval = !visible ? .18 : distance > 34 ? .10 : distance > 22 ? .055 : 0;
    this.tickAccumulator += delta;
    if (interval > 0 && this.tickAccumulator < interval) return;
    const step = this.tickAccumulator;
    this.tickAccumulator = 0;
    this.elapsed += step;
    this.mixer.update(step);

    if (this.oneShot) {
      this.oneShot.elapsed += step;
      const clipDuration = this.oneShot.action.getClip().duration;
      const normalized = clipDuration > 0 ? this.oneShot.action.time / clipDuration : 1;
      for (const event of this.events) {
        if (event.action !== this.oneShot.action || event.fired || normalized < event.normalizedTime) continue;
        event.fired = true;
        try { event.callback?.(); } catch (error) { console.error('Animation event failed:', error); }
      }
      if (this.oneShot.elapsed >= this.oneShot.duration - .001) {
        const fallback = this.oneShot.fallback;
        const fade = this.oneShot.fadeOut;
        const completedAction = this.oneShot.action;
        this.oneShot = null;
        // Late-cue events (e.g. normalized .98 under tick throttling) still fire on completion.
        this.#flushEvents(completedAction);
        if (fallback) this.play(fallback, { fade, loop: true, restart: false });
      }
    }
  }

  stopAll(fade = .1) {
    for (const action of this.actions.values()) action.fadeOut(fade);
    this.current = null;
    this.currentName = '';
    this.oneShot = null;
    this.events.length = 0;
  }

  dispose() {
    if (this.disposed) return;
    this.stopAll(0);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.clips.clear();
    this.disposed = true;
  }
}
