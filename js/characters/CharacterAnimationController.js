/**
 * Skeletal animation playback (template-layer candidate).
 * LOCKED surface: play / playOneShot / setLocomotion / scheduleNormalized / update / dispose.
 * No Sol content imports — keep game-free. See docs/architecture-template-boundary.md
 *
 * Numeric scales come from LOCOMOTION_CONFIG / ANIM_LOD_CONFIG (js/core/runtimeConstants.js).
 *
 * New generic capabilities (docs/plan/character-graphics-animation-overhaul.md §8) are additive
 * and opt-in so every existing call site (discrete setLocomotion/play/playOneShot) is byte-for-byte
 * behavior-compatible by default:
 *  - `locomotionMode: 'blend'` (constructor option) enables speed-weighted, phase-synchronized
 *    idle/walk/run/sprint blending instead of the default discrete one-action selection.
 *  - `strict: true` (constructor option, or per-call `options.strict`) turns a missing requested
 *    clip into a thrown error instead of the default silent idle-fallback.
 *  - `setLayerPolicy` / `playUpper` / `stopUpper` / `setAdditive` add upper-body and additive
 *    layer slots (filtered/additive clips are cloned+cached once, never rebuilt per frame).
 *  - `setIK` / `setIKTarget` wire an injected TwoBoneIK chain (support-hand/foot).
 *  - `setGrounding` wires an injected foot/ground sampling callback (no world import).
 *  - `setSecondaryMotion` wires an injected SecondaryMotion instance/config for cape/hair/etc.
 *  - `getDiagnostics` / `getLocomotionWeights` / `getLayerWeights` expose read-only debug state.
 */
import * as THREE from 'three';
import { ANIM_LOD_CONFIG, GROUNDING_CONFIG, LOCOMOTION_CONFIG } from '../core/runtimeConstants.js';
import { TwoBoneIK } from './TwoBoneIK.js';

const L = LOCOMOTION_CONFIG;
const LOD = ANIM_LOD_CONFIG;

/** Local (non-content) defaults for the new opt-in generic features — never Sol-specific. */
const GENERIC_DEFAULTS = Object.freeze({
  pivotTurnThreshold: 1.4, // radians of turnDelta while near-idle before flagging a pivot
  pivot180Threshold: Math.PI * 0.85,
  upperFade: 0.14,
  additiveDefaultFade: 0.12,
  transitionWeight: 0.72,
  transitionFadeOut: 0.06,
});

const LOCOMOTION_BANDS = Object.freeze(['idle', 'walk', 'run', 'sprint']);

function locomotionBandSpeeds(referenceRunSpeed) {
  return {
    idle: 0,
    walk: referenceRunSpeed * L.walkNominalRatio,
    run: referenceRunSpeed,
    sprint: referenceRunSpeed * L.sprintNominalRatio,
  };
}

/**
 * Deterministic 1D blend weights across available locomotion bands (piecewise-linear over
 * sorted reference speeds). Always finite, clamped 0..1, and sums to 1 across returned keys.
 * Exported for direct numeric testing without constructing a full controller.
 */
export function computeLocomotionWeights(speed, referenceRunSpeed, has) {
  const bandSpeeds = locomotionBandSpeeds(referenceRunSpeed);
  const points = LOCOMOTION_BANDS.filter(name => has(name)).map(name => ({ name, speed: bandSpeeds[name] }));
  points.sort((a, b) => a.speed - b.speed);
  const weights = {};
  if (points.length === 0) return weights;
  for (const p of points) weights[p.name] = 0;
  if (points.length === 1) {
    weights[points[0].name] = 1;
    return weights;
  }
  const s = THREE.MathUtils.clamp(Number.isFinite(speed) ? speed : 0, points[0].speed, points[points.length - 1].speed);
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    if (s >= a.speed && s <= b.speed) {
      const t = b.speed > a.speed ? (s - a.speed) / (b.speed - a.speed) : 0;
      weights[a.name] = THREE.MathUtils.clamp(1 - t, 0, 1);
      weights[b.name] = THREE.MathUtils.clamp(t, 0, 1);
      return weights;
    }
  }
  // Speed outside the sorted range (shouldn't happen after clamp) — pin to the nearest end.
  weights[s <= points[0].speed ? points[0].name : points[points.length - 1].name] = 1;
  return weights;
}

/** Extract the skinned node name a track targets ("hand_r.quaternion" → "hand_r"). */
function trackNodeName(track) {
  return THREE.PropertyBinding.parseTrackName(track.name).nodeName;
}

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
    this.referenceRunSpeed = options.referenceRunSpeed ?? L.referenceRunSpeed;
    this.defaultFade = options.defaultFade ?? L.defaultFade;
    /** Discrete locomotion band for hysteresis (idle|walk|run|sprint). */
    this.locoBand = 'idle';
    /** Absolute speed hysteresis between walk/run bands (world units). */
    this.locoHysteresis = options.locoHysteresis ?? L.hysteresis;
    this.events = [];
    this.disposed = false;

    // —— New opt-in generic behavior flags (default = old behavior, byte-compatible) ——
    /** 'discrete' (default, legacy single-action select) or 'blend' (speed-weighted phase-sync). */
    this.locomotionMode = options.locomotionMode === 'blend' ? 'blend' : 'discrete';
    /** Missing-clip policy: false (default) silently falls back to idle; true throws. */
    this.strict = Boolean(options.strict);
    this.locomotionState = 'idle';
    this._prevSpeed = 0;
    this._locoSpeedTarget = 0;
    this._locoBlendReady = false;
    this.locoWeights = {};
    this.locoPhase = 0;

    // Layer slots (upper/additive) — cached filtered/additive clips, built lazily on demand.
    this.layerPolicy = { upperBoneNames: null, additiveBoneNames: null, transitionBoneNames: null };
    this.layerClips = new Map();
    this.layerActions = new Map();
    this.upperState = null; // { name, weight, targetWeight, fade }
    this.additiveLayers = new Map(); // name -> { weight, action }
    this.transitionState = null;

    // Injected IK / grounding / secondary motion (all optional, generic-only, caller-owned data).
    this.ikSolver = new TwoBoneIK();
    this.ikChains = new Map();
    this.ikResults = new Map();
    this.grounding = null;
    this.groundingResults = new Map();
    this.secondaryMotion = null;

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
    const requestedStrict = options.strict ?? this.strict;
    if (!this.actions.has(name)) {
      if (requestedStrict && !options.allowFallback) {
        throw new Error(`CharacterAnimationController: missing clip "${name}" (strict mode)`);
      }
    }
    const action = this.actions.get(name) ?? this.actions.get('idle');
    if (!action) return null;
    const resolvedName = action.getClip().name;
    const loop = options.loop !== false;
    const clampWhen = options.clamp ?? !loop;
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
    action.clampWhenFinished = clampWhen;
    if (options.restart !== false) action.reset();
    if (this.current && this.current !== action) {
      action.crossFadeFrom(this.current, Math.max(L.minFade, fade), true);
    } else action.fadeIn(Math.max(L.minFade, fade));
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
        fadeOut: options.fadeOut ?? Math.min(L.oneShotFadeOutCap, duration * L.oneShotFadeOutFrac),
      };
    } else if (!options.keepOneShot) this.oneShot = null;
    return action;
  }

  playOneShot(name, options = {}) {
    if (options.layer !== 'upper') {
      return this.play(name, { ...options, loop: false, restart: true });
    }
    if (this.oneShot) this.#flushEvents(this.oneShot.action);
    const action = this.playUpper(name, { ...options, loop: false });
    if (!action) return null;
    action.clampWhenFinished = true;
    const timeScale = Math.max(.01, Math.abs(options.timeScale ?? 1));
    const duration = action.getClip().duration / timeScale;
    this.oneShot = {
      action,
      name: action.getClip().name,
      slot: 'upper',
      elapsed: 0,
      duration,
      fallback: null,
      fadeOut: options.fadeOut ?? Math.min(L.oneShotFadeOutCap, duration * L.oneShotFadeOutFrac),
    };
    return action;
  }

  /**
   * Locomotion selection. `locomotionMode: 'discrete'` (default) keeps the legacy one-action-at-a-time
   * behavior. `locomotionMode: 'blend'` speed-weights idle/walk/run/sprint with a shared phase so
   * adjacent actions never pop, while `currentName`/`locoBand` still track the dominant band for
   * back-compat call sites that only read those fields.
   */
  setLocomotion(speed, options = {}) {
    this.#updateLocomotionState(speed, options);
    if (this.locomotionMode === 'blend') {
      if (this.oneShot?.slot !== 'upper' && this.oneShot && !options.force) return;
      this._locoSpeedTarget = Number.isFinite(speed) ? speed : 0;
      this._locoOptions = options;
      this.locoBand = this.#resolveLocomotionName(this._locoSpeedTarget, options);
      this._locoBlendReady = true;
      return;
    }
    if (this.oneShot?.slot !== 'upper' && this.oneShot && !options.force) return;
    const name = this.#resolveLocomotionName(speed, options);
    const ref = this.referenceRunSpeed;
    const reference = name === 'sprint' ? ref * L.sprintNominalRatio
      : name === 'walk' ? ref * L.walkNominalRatio
      : ref;
    const timeScale = name === 'idle'
      ? 1
      : THREE.MathUtils.clamp(speed / Math.max(.01, reference), L.timeScaleMin, L.timeScaleMax);
    const fade = name === 'idle' ? L.fadeIdle : name === 'walk' ? L.fadeWalk : L.fadeRun;
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
    const idleMax = L.idleMaxSpeed;
    const walkRun = ref * L.walkRunSpeedRatio;
    const sprintMin = ref * L.sprintSpeedRatio;
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

  /** Trigger a short additive start/stop/pivot pose without delaying locomotion or gameplay facing. */
  #updateLocomotionState(speed, options) {
    const s = Number.isFinite(speed) ? speed : 0;
    const prevSpeed = this._prevSpeed;
    const turnDelta = Number.isFinite(options.turnDelta) ? options.turnDelta : 0;
    const idleMax = L.idleMaxSpeed;
    let state;
    const pivotThreshold = options.pivotThreshold ?? GENERIC_DEFAULTS.pivotTurnThreshold;
    const pivot180 = options.pivot180Threshold ?? GENERIC_DEFAULTS.pivot180Threshold;
    if (s < idleMax) {
      if (Math.abs(turnDelta) > pivotThreshold) {
        state = Math.abs(turnDelta) >= pivot180 ? 'pivot_180' : (turnDelta > 0 ? 'pivot_left' : 'pivot_right');
      } else {
        state = prevSpeed >= idleMax ? 'stop' : 'idle';
      }
    } else if (prevSpeed < idleMax) {
      state = 'start';
    } else {
      state = 'move';
    }
    this._prevSpeed = s;
    const previousState = this.locomotionState;
    this.locomotionState = state;
    if (state !== previousState) {
      const clipName = {
        start: 'locomotion_start',
        stop: 'locomotion_stop',
        pivot_left: 'pivot_left',
        pivot_right: 'pivot_right',
        pivot_180: 'pivot_180',
      }[state];
      if (clipName) this.#playLocomotionTransition(clipName);
    }
  }

  #playLocomotionTransition(name) {
    if (this.locomotionMode !== 'blend' || !this.has(name)) return;
    const action = this.#getLayerAction('transition', name);
    if (!action) return;
    if (this.transitionState?.action && this.transitionState.action !== action) this.transitionState.action.stop();
    const duration = Math.max(.001, action.getClip().duration);
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.reset();
    action.setEffectiveWeight(GENERIC_DEFAULTS.transitionWeight);
    action.play();
    this.transitionState = {
      name,
      action,
      elapsed: 0,
      duration,
      weight: GENERIC_DEFAULTS.transitionWeight,
    };
  }

  scheduleNormalized(normalizedTime, callback, key = Symbol('animation-event')) {
    if (!this.oneShot) return null;
    this.events.push({ action: this.oneShot.action, normalizedTime, callback, key, fired: false });
    return key;
  }

  cancelEvents(key) {
    this.events = this.events.filter(event => event.key !== key);
  }

  /** Fire and clear any unfired events bound to an interrupted one-shot action, in normalizedTime order. */
  #flushEvents(action) {
    const pending = this.events
      .filter(event => event.action === action && !event.fired)
      .sort((a, b) => a.normalizedTime - b.normalizedTime);
    this.events = this.events.filter(event => event.action !== action);
    for (const event of pending) {
      event.fired = true;
      try { event.callback?.(); } catch (error) { console.error('Animation event failed:', error); }
    }
  }

  /** Fire all due-but-unfired events for `action` at `normalized`, in normalizedTime order — exactly once each. */
  #fireDueEvents(action, normalized) {
    const due = this.events
      .filter(event => event.action === action && !event.fired && normalized >= event.normalizedTime)
      .sort((a, b) => a.normalizedTime - b.normalizedTime);
    for (const event of due) {
      event.fired = true;
      try { event.callback?.(); } catch (error) { console.error('Animation event failed:', error); }
    }
  }

  update(delta, options = {}) {
    if (this.disposed) return;
    const distance = options.distance ?? 0;
    const visible = options.visible !== false;
    const interval = !visible
      ? LOD.hiddenInterval
      : distance > LOD.farDistance ? LOD.farInterval
        : distance > LOD.midDistance ? LOD.midInterval
          : 0;
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
      this.#fireDueEvents(this.oneShot.action, normalized);
      if (this.oneShot.elapsed >= this.oneShot.duration - .001) {
        const completed = this.oneShot;
        this.oneShot = null;
        this.#flushEvents(completed.action);
        if (completed.slot === 'upper') {
          this.stopUpper(completed.fadeOut);
        } else if (completed.fallback) {
          this.play(completed.fallback, { fade: completed.fadeOut, loop: true, restart: false });
        }
      }
    }
    if (this.locomotionMode === 'blend' && this._locoBlendReady
      && (!this.oneShot || this.oneShot.slot === 'upper')) {
      this.#updateLocomotionBlend(step);
    }

    this.#updateLayers(step);
    this.#updateIK(step, options);
    this.#updateGrounding(step, options);
    if (this.secondaryMotion) this.secondaryMotion.update(step, options.secondary ?? {});
  }

  // —— Speed-weighted phase-synchronized locomotion blend (opt-in) ——

  #updateLocomotionBlend(step) {
    const weights = computeLocomotionWeights(this._locoSpeedTarget, this.referenceRunSpeed, n => this.has(n));
    this.locoWeights = weights;
    let dominant = null;
    let dominantWeight = -1;
    for (const name of LOCOMOTION_BANDS) {
      const w = weights[name] ?? 0;
      if (w > dominantWeight) { dominantWeight = w; dominant = name; }
    }
    if (!dominant) return;

    const ref = this.referenceRunSpeed;
    const rate = dominant === 'idle'
      ? 1
      : THREE.MathUtils.clamp(this._locoSpeedTarget / Math.max(.01, ref), L.timeScaleMin, L.timeScaleMax);
    const dominantAction = this.actions.get(dominant);
    const dominantDuration = dominantAction?.getClip()?.duration || 1;
    this.locoPhase = (this.locoPhase + step * rate / Math.max(.01, dominantDuration)) % 1;
    if (this.locoPhase < 0) this.locoPhase += 1;

    for (const name of LOCOMOTION_BANDS) {
      const action = this.actions.get(name);
      if (!action) continue;
      const w = weights[name] ?? 0;
      if (w > 0) {
        action.enabled = true;
        action.setLoop(THREE.LoopRepeat, Infinity);
        const duration = action.getClip().duration || 1;
        action.time = this.locoPhase * duration;
        action.setEffectiveWeight(THREE.MathUtils.clamp(w, 0, 1));
        action.paused = false;
        if (!action.isRunning()) action.play();
      } else {
        action.setEffectiveWeight(0);
      }
    }
    this.currentName = dominantAction?.getClip()?.name ?? dominant;
    this.current = dominantAction ?? this.current;
  }

  getLocomotionWeights() {
    return { ...this.locoWeights };
  }

  // —— Upper/full/additive layer arbitration ——

  /**
   * Inject generic bone-scope filters used to build cached upper/additive layer clips.
   * `upperBoneNames`/`additiveBoneNames`: iterable of skinned node names. Game-owned code
   * (e.g. CharacterFactory) decides the actual names; this module never hardcodes them.
   */
  setLayerPolicy(policy = {}) {
    this.layerPolicy = {
      upperBoneNames: policy.upperBoneNames ? new Set(policy.upperBoneNames) : null,
      additiveBoneNames: policy.additiveBoneNames ? new Set(policy.additiveBoneNames) : null,
      transitionBoneNames: policy.transitionBoneNames ? new Set(policy.transitionBoneNames) : null,
    };
    for (const action of this.layerActions.values()) action.stop();
    this.layerActions.clear();
    this.layerClips.clear();
    this.upperState = null;
    this.additiveLayers.clear();
    this.transitionState = null;
  }

  #buildLayerClip(slot, name) {
    const cacheKey = `${slot}:${name}`;
    if (this.layerClips.has(cacheKey)) return this.layerClips.get(cacheKey);
    const source = this.clips.get(name);
    if (!source) return null;
    let clip;
    if (slot === 'upper') {
      const boneNames = this.layerPolicy.upperBoneNames;
      const tracks = boneNames ? source.tracks.filter(track => boneNames.has(trackNodeName(track))) : source.tracks.slice();
      clip = new THREE.AnimationClip(`${name}:upper`, source.duration, tracks);
    } else {
      const boneNames = slot === 'transition'
        ? this.layerPolicy.transitionBoneNames
        : this.layerPolicy.additiveBoneNames;
      const cloned = source.clone();
      if (boneNames) cloned.tracks = cloned.tracks.filter(track => boneNames.has(trackNodeName(track)));
      clip = THREE.AnimationUtils.makeClipAdditive(cloned);
    }
    this.layerClips.set(cacheKey, clip);
    return clip;
  }

  #getLayerAction(slot, name) {
    const cacheKey = `${slot}:${name}`;
    if (this.layerActions.has(cacheKey)) return this.layerActions.get(cacheKey);
    const clip = this.#buildLayerClip(slot, name);
    if (!clip) return null;
    const action = this.mixer.clipAction(clip);
    if (slot !== 'upper') action.blendMode = THREE.AdditiveAnimationBlendMode;
    this.layerActions.set(cacheKey, action);
    return action;
  }

  /** Play a clip on the upper-body slot (masked to `layerPolicy.upperBoneNames`). */
  playUpper(name, options = {}) {
    if (this.disposed) return null;
    const action = this.#getLayerAction('upper', name);
    if (!action) {
      if ((options.strict ?? this.strict) && !options.allowFallback) {
        throw new Error(`CharacterAnimationController: missing upper clip "${name}" (strict mode)`);
      }
      return null;
    }
    action.enabled = true;
    action.setLoop(options.loop === false ? THREE.LoopOnce : THREE.LoopRepeat, options.loop === false ? 1 : Infinity);
    action.setEffectiveTimeScale(options.timeScale ?? 1);
    action.reset().play();
    this.upperState = {
      name,
      weight: THREE.MathUtils.clamp(options.weight ?? 1, 0, 1),
      fade: options.fade ?? GENERIC_DEFAULTS.upperFade,
    };
    return action;
  }

  stopUpper(fade = GENERIC_DEFAULTS.upperFade) {
    if (!this.upperState) return;
    const action = this.layerActions.get(`upper:${this.upperState.name}`);
    action?.fadeOut(Math.max(L.minFade, fade));
    this.upperState = null;
  }

  /** Set/blend an additive layer's weight (0 disables). Weight is always clamped finite 0..1. */
  setAdditive(name, weight, options = {}) {
    if (this.disposed) return;
    const w = THREE.MathUtils.clamp(Number.isFinite(weight) ? weight : 0, 0, 1);
    if (w <= 0) {
      const existing = this.additiveLayers.get(name);
      if (existing) {
        existing.action.setEffectiveWeight(0);
        this.additiveLayers.delete(name);
      }
      return;
    }
    let entry = this.additiveLayers.get(name);
    if (!entry) {
      const action = this.#getLayerAction('additive', name);
      if (!action) {
        if ((options.strict ?? this.strict) && !options.allowFallback) {
          throw new Error(`CharacterAnimationController: missing additive clip "${name}" (strict mode)`);
        }
        return;
      }
      entry = { action, weight: 0, remaining: null, fadeOut: GENERIC_DEFAULTS.additiveDefaultFade };
      this.additiveLayers.set(name, entry);
    }
    entry.action.enabled = true;
    entry.action.setLoop(THREE.LoopRepeat, Infinity);
    entry.action.setEffectiveTimeScale(options.timeScale ?? 1);
    if (!entry.action.isRunning()) entry.action.play();
    entry.remaining = null;
    entry.weight = w;
    entry.action.setEffectiveWeight(w);
  }

  /** Play a bounded one-shot additive layer such as recoil or a light hit reaction. */
  playAdditive(name, options = {}) {
    if (this.disposed) return null;
    const action = this.#getLayerAction('additive', name);
    if (!action) {
      if ((options.strict ?? this.strict) && !options.allowFallback) {
        throw new Error(`CharacterAnimationController: missing additive clip "${name}" (strict mode)`);
      }
      return null;
    }
    const timeScale = Math.max(.01, Number.isFinite(options.timeScale) ? options.timeScale : 1);
    const weight = THREE.MathUtils.clamp(Number.isFinite(options.weight) ? options.weight : 1, 0, 1);
    const duration = action.getClip().duration / timeScale;
    action.enabled = true;
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = false;
    action.setEffectiveTimeScale(timeScale);
    action.reset();
    action.setEffectiveWeight(weight);
    action.play();
    this.additiveLayers.set(name, {
      action,
      weight,
      remaining: duration,
      fadeOut: Math.max(.001, options.fadeOut ?? GENERIC_DEFAULTS.additiveDefaultFade),
    });
    return action;
  }

  getAdditiveWeight(name) {
    return this.additiveLayers.get(name)?.weight ?? 0;
  }

  #updateLayers(step = 0) {
    if (this.upperState) {
      const action = this.layerActions.get(`upper:${this.upperState.name}`);
      if (action) {
        const fullBodyActive = Boolean(this.oneShot && this.oneShot.slot !== 'upper');
        const targetWeight = fullBodyActive ? 0 : this.upperState.weight;
        action.setEffectiveWeight(THREE.MathUtils.clamp(targetWeight, 0, 1));
      }
    }
    if (this.transitionState) {
      const state = this.transitionState;
      state.elapsed += step;
      const remaining = state.duration - state.elapsed;
      if (remaining <= 0) {
        state.action.stop();
        this.transitionState = null;
      } else {
        const fade = Math.min(1, remaining / GENERIC_DEFAULTS.transitionFadeOut);
        state.action.setEffectiveWeight(state.weight * fade);
      }
    }
    for (const [name, entry] of this.additiveLayers) {
      if (entry.remaining == null) continue;
      entry.remaining -= step;
      if (entry.remaining <= 0) {
        entry.action.stop();
        this.additiveLayers.delete(name);
        continue;
      }
      entry.action.setEffectiveWeight(entry.weight * Math.min(1, entry.remaining / entry.fadeOut));
    }
  }

  getLayerWeights() {
    const additive = {};
    for (const [name, entry] of this.additiveLayers) additive[name] = entry.weight;
    const fullBodyActive = Boolean(this.oneShot && this.oneShot.slot !== 'upper');
    return {
      base: 1,
      upper: this.upperState && !fullBodyActive ? this.upperState.weight : 0,
      full: fullBodyActive ? 1 : 0,
      additive,
      transition: this.transitionState?.weight ?? 0,
    };
  }

  // —— Injected support-hand/foot IK (generic TwoBoneIK chains) ——

  /**
   * @param {object} config `{ chains: [{ name, root, mid, end, upperLength, lowerLength,
   *   poleTarget?, weight? }] }` — all Object3D/Vector3 references are caller-owned (no world
   *   or content import here).
   */
  setIK(config = {}) {
    this.ikChains.clear();
    this.ikResults.clear();
    for (const chain of config.chains ?? []) {
      if (!chain?.name || !chain.root || !chain.mid || !chain.end) continue;
      this.ikChains.set(chain.name, {
        ...chain,
        weight: THREE.MathUtils.clamp(Number.isFinite(chain.weight) ? chain.weight : 1, 0, 1),
      });
    }
  }

  /** Update (or remove, with `target: null`) a live IK chain's world-space target/weight. */
  setIKTarget(name, target, options = {}) {
    const chain = this.ikChains.get(name);
    if (!chain) return;
    chain.target = target ?? null;
    if (Number.isFinite(options.weight)) chain.weight = THREE.MathUtils.clamp(options.weight, 0, 1);
  }

  #updateIK() {
    for (const [name, chain] of this.ikChains) {
      if (!chain.target || chain.weight <= 0) {
        this.ikResults.delete(name);
        continue;
      }
      const rootPos = chain.root.getWorldPosition(new THREE.Vector3());
      const target = chain.target?.isObject3D
        ? chain.target.getWorldPosition(new THREE.Vector3())
        : chain.target;
      const poleTarget = chain.poleTarget?.isObject3D
        ? chain.poleTarget.getWorldPosition(new THREE.Vector3())
        : (chain.poleTarget ?? null);
      if (!target?.isVector3) {
        this.ikResults.set(name, { reach: 0, clamped: true, weight: chain.weight, error: Infinity });
        continue;
      }
      const solved = this.ikSolver.solve(rootPos, target, chain.upperLength, chain.lowerLength, poleTarget);
      this.ikSolver.applyToBones(chain.root, chain.mid, chain.end, solved, chain.weight);
      const endPos = chain.end.getWorldPosition(new THREE.Vector3());
      this.ikResults.set(name, {
        reach: solved.reach,
        clamped: solved.clamped,
        weight: chain.weight,
        error: endPos.distanceTo(target),
      });
    }
  }

  // —— Injected foot/ground contact grounding (generic sampling callback) ——

  /**
   * @param {object|null} hooks `{ sampleGround(worldX, worldZ) => {height:number, normal?:THREE.Vector3}|null,
   *   contacts: [{ name, bone, offset? }] }`. Purely reads an injected callback — never imports
   *   terrain/world modules directly, keeping this module template-safe.
   */
  setGrounding(hooks) {
    this.groundingResults.clear();
    if (!hooks) {
      this.grounding = null;
      return;
    }
    const contacts = (hooks.contacts ?? []).map(contact => {
      if (!contact?.root || !contact?.mid || !contact?.end) return contact;
      contact.root.updateWorldMatrix(true, false);
      contact.mid.updateWorldMatrix(true, false);
      contact.end.updateWorldMatrix(true, false);
      const rootPos = contact.root.getWorldPosition(new THREE.Vector3());
      const midPos = contact.mid.getWorldPosition(new THREE.Vector3());
      const endPos = contact.end.getWorldPosition(new THREE.Vector3());
      return {
        ...contact,
        upperLength: contact.upperLength ?? rootPos.distanceTo(midPos),
        lowerLength: contact.lowerLength ?? midPos.distanceTo(endPos),
      };
    });
    this.grounding = { ...hooks, contacts };
  }

  #updateGrounding() {
    const hooks = this.grounding;
    this.groundingResults.clear();
    if (!hooks?.sampleGround || !Array.isArray(hooks.contacts)) return;
    if (this.oneShot && this.oneShot.slot !== 'upper') return;
    for (const contact of hooks.contacts) {
      const end = contact?.end ?? contact?.bone;
      if (!end) continue;
      const endPos = end.getWorldPosition(new THREE.Vector3());
      const sample = hooks.sampleGround(endPos.x, endPos.z);
      if (!sample || !Number.isFinite(sample.height)) continue;
      const targetY = sample.height + (contact.offset ?? 0);
      const verticalError = targetY - endPos.y;
      const maxCorrection = contact.maxCorrection ?? GROUNDING_CONFIG.maxCorrection;
      if (Math.abs(verticalError) > maxCorrection) {
        this.groundingResults.set(contact.name ?? end.name, {
          applied: false,
          verticalError,
          reason: 'outside_contact_window',
        });
        continue;
      }
      const target = endPos.clone();
      target.y = targetY;
      const weight = THREE.MathUtils.clamp(Number.isFinite(contact.weight) ? contact.weight : 1, 0, 1);
      if (contact.root && contact.mid && contact.end && contact.upperLength > 0 && contact.lowerLength > 0) {
        const rootPos = contact.root.getWorldPosition(new THREE.Vector3());
        const solved = this.ikSolver.solve(
          rootPos,
          target,
          contact.upperLength,
          contact.lowerLength,
          contact.poleTarget ?? null,
        );
        this.ikSolver.applyToBones(contact.root, contact.mid, contact.end, solved, weight);
        const solvedEnd = contact.end.getWorldPosition(new THREE.Vector3());
        this.groundingResults.set(contact.name ?? contact.end.name, {
          applied: true,
          verticalError,
          error: solvedEnd.distanceTo(target),
          weight,
        });
        continue;
      }
      const worldTarget = new THREE.Vector3(endPos.x, targetY, endPos.z);
      const local = end.parent ? end.parent.worldToLocal(worldTarget.clone()) : worldTarget;
      if (Number.isFinite(local.x) && Number.isFinite(local.y) && Number.isFinite(local.z)) {
        end.position.y = THREE.MathUtils.lerp(end.position.y, local.y, weight);
        this.groundingResults.set(contact.name ?? end.name, {
          applied: true,
          verticalError,
          error: Math.abs(targetY - end.getWorldPosition(new THREE.Vector3()).y),
          weight,
        });
      }
    }
  }

  // —— Injected secondary motion (cape/hair/quiver spring bones) ——

  /** @param {import('./SecondaryMotion.js').SecondaryMotion|null} instance caller-owned, already configured */
  setSecondaryMotion(instance) {
    this.secondaryMotion = instance ?? null;
  }

  resetSecondaryMotion() {
    this.secondaryMotion?.reset();
  }

  // —— Diagnostics (read-only debug snapshot; never gates gameplay) ——

  getDiagnostics() {
    const ik = {};
    for (const [name, result] of this.ikResults) ik[name] = { ...result };
    const layerWeights = this.getLayerWeights();
    return {
      locomotionMode: this.locomotionMode,
      locomotionState: this.locomotionState,
      locoBand: this.locoBand,
      locoWeights: this.getLocomotionWeights(),
      currentName: this.currentName,
      oneShot: this.oneShot ? {
        name: this.oneShot.name,
        slot: this.oneShot.slot ?? 'full',
        elapsed: this.oneShot.elapsed,
        duration: this.oneShot.duration,
      } : null,
      layerWeights,
      events: this.events.map(event => ({
        normalizedTime: event.normalizedTime,
        fired: event.fired,
        key: event.key,
      })),
      ik,
      grounding: Object.fromEntries([...this.groundingResults].map(([name, result]) => [name, { ...result }])),
    };
  }

  stopAll(fade = .1) {
    for (const action of this.actions.values()) action.fadeOut(fade);
    for (const action of this.layerActions.values()) action.fadeOut(fade);
    this.current = null;
    this.currentName = '';
    this.oneShot = null;
    this.events.length = 0;
    this.upperState = null;
    this.additiveLayers.clear();
    this.transitionState = null;
  }

  dispose() {
    if (this.disposed) return;
    this.stopAll(0);
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.root);
    this.actions.clear();
    this.clips.clear();
    this.layerClips.clear();
    this.layerActions.clear();
    this.ikChains.clear();
    this.ikResults.clear();
    this.grounding = null;
    this.groundingResults.clear();
    this.secondaryMotion?.dispose?.();
    this.secondaryMotion = null;
    this.disposed = true;
  }
}
