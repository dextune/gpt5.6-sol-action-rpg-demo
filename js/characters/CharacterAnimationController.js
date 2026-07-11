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

  setLocomotion(speed, options = {}) {
    if (this.oneShot && !options.force) return;
    const sprint = options.sprint || speed > this.referenceRunSpeed * 1.22;
    const name = speed < .18 ? 'idle' : sprint && this.has('sprint') ? 'sprint' : this.has('run') ? 'run' : 'idle';
    const reference = name === 'sprint' ? this.referenceRunSpeed * 1.38 : this.referenceRunSpeed;
    const timeScale = name === 'idle' ? 1 : THREE.MathUtils.clamp(speed / reference, .7, 1.65);
    this.play(name, { loop: true, fade: speed < .18 ? .18 : .12, timeScale, restart: false });
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
