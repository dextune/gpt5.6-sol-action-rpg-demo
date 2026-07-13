const apexCadence = Object.freeze({
  anticipate: Object.freeze({ duration: .12, pitchMul: 1.18, noiseMul: .55, volumeMul: .72 }),
  impact: Object.freeze({ duration: .09, pitchMul: .82, noiseMul: 1, volumeMul: 1 }),
  finisher: Object.freeze({ duration: .22, pitchMul: .58, noiseMul: 1.35, volumeMul: 1.18 }),
});

const apexProfile = (classId, timbre, pitch, noise, filter) => Object.freeze({
  classId, timbre, pitch, noise, filter, cadence: apexCadence,
});

/** Procedural-only Lv100 signatures. Keys intentionally match active skill ids. */
export const APEX_AUDIO_PROFILES = Object.freeze({
  whirlwind: apexProfile('aerin', 'sawtooth', 92, .020, 520),
  crescent: apexProfile('aerin', 'sawtooth', 101, .022, 570),
  skyfall: apexProfile('aerin', 'sawtooth', 67, .027, 410),
  starburst: apexProfile('aerin', 'sawtooth', 116, .019, 640),
  fireball: apexProfile('wizard', 'triangle', 132, .024, 760),
  frost_nova: apexProfile('wizard', 'triangle', 151, .018, 980),
  arcane_blink: apexProfile('wizard', 'triangle', 174, .016, 1120),
  meteor_storm: apexProfile('wizard', 'triangle', 78, .029, 620),
  twin_fang: apexProfile('rogue', 'square', 184, .015, 1180),
  fan_of_knives: apexProfile('rogue', 'square', 165, .018, 1040),
  shadowstep: apexProfile('rogue', 'square', 143, .021, 860),
  death_lotus: apexProfile('rogue', 'square', 124, .023, 720),
  piercing_shot: apexProfile('ranger', 'sine', 157, .014, 940),
  caltrop_trap: apexProfile('ranger', 'sine', 109, .026, 680),
  vault_shot: apexProfile('ranger', 'sine', 139, .017, 820),
  hunter_mark: apexProfile('ranger', 'sine', 121, .020, 740),
});

/**
 * Sol ARPG — combat-first audio.
 *
 * Design goals (from external game-audio practice + this project's feel target):
 * - Swing on attack start; impact only on successful damage.
 * - Layered SFX: Low body / Mid punch / soft High grit / Style weight (HMLS).
 * - Mid-low dull contact (no metal ring, no bell chords).
 * - Variation via multi-sample banks + slight rate shift.
 * - Multi-target hits: one primary impact, soft secondary ticks.
 * - Buses: master / sfx / ambient; mute always through master.
 * - Pre-baked WAV banks under assets/audio/combat (see tools/audio).
 */
export class AudioManager {
  constructor() {
    this.context = null;
    this.master = null;
    this.sfx = null;
    this.ambient = null;
    this.compressor = null;
    this.muted = false;
    this.ambientNodes = [];
    /** @type {Map<string, AudioBuffer[]>} */
    this.buffers = new Map();
    this.sampleReady = false;
    this._lastHitAt = 0;
    this._hitBurstCount = 0;
  }

  async unlock() {
    if (!this.context) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.context = new AC();

      this.master = this.context.createGain();
      this.sfx = this.context.createGain();
      this.ambient = this.context.createGain();
      this.compressor = this.context.createDynamicsCompressor();

      // Glue bus — keeps stacked hits from exploding, preserves punch.
      this.compressor.threshold.value = -18;
      this.compressor.knee.value = 12;
      this.compressor.ratio.value = 3.2;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.12;

      this.master.gain.value = this.muted ? 0 : 0.68;
      this.sfx.gain.value = 1;
      this.ambient.gain.value = 0.09;

      this.sfx.connect(this.compressor);
      this.compressor.connect(this.master);
      this.ambient.connect(this.master);
      this.master.connect(this.context.destination);

      this.#startAmbient();
      this.#loadSamples();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return true;
  }

  async #loadSamples() {
    if (!this.context) return;
    try {
      const res = await fetch('./assets/manifests/assets.json');
      if (!res.ok) return;
      const manifest = await res.json();
      const audio = manifest.audio;
      if (!audio || typeof audio !== 'object') return;

      await Promise.all(Object.entries(audio).map(async ([key, entry]) => {
        const urls = Array.isArray(entry?.urls)
          ? entry.urls
          : entry?.url
            ? [entry.url]
            : [];
        const decoded = [];
        for (const url of urls) {
          try {
            const response = await fetch(url);
            if (!response.ok) continue;
            const raw = await response.arrayBuffer();
            decoded.push(await this.context.decodeAudioData(raw.slice(0)));
          } catch {
            /* keep going — other variants / procedural fallback */
          }
        }
        if (decoded.length) this.buffers.set(key, decoded);
      }));
      this.sampleReady = this.buffers.size > 0;
    } catch {
      this.sampleReady = false;
    }
  }

  #startAmbient() {
    if (!this.context || this.ambientNodes.length) return;
    // Quiet low drone — atmosphere only, never melodic.
    const freqs = [46, 69];
    for (let i = 0; i < freqs.length; i += 1) {
      const osc = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      osc.type = 'sine';
      osc.frequency.value = freqs[i];
      filter.type = 'lowpass';
      filter.frequency.value = 120 + i * 30;
      gain.gain.value = 0.009 / (i + 1);
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambient);
      osc.start();
      this.ambientNodes.push(osc, filter, gain);
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.68, this.context.currentTime, 0.03);
    }
  }

  /**
   * @param {string} key
   * @param {{ volume?: number, rate?: number, delay?: number, filter?: number }} [opt]
   */
  playSample(key, opt = {}) {
    if (!this.context || !this.sfx || this.muted) return false;
    const bank = this.buffers.get(key);
    if (!bank?.length) return false;

    const buffer = bank[(Math.random() * bank.length) | 0];
    const now = this.context.currentTime + (opt.delay ?? 0);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();

    source.buffer = buffer;
    source.playbackRate.value = opt.rate ?? (0.94 + Math.random() * 0.1);

    filter.type = 'lowpass';
    filter.frequency.value = opt.filter ?? 2800;
    filter.Q.value = 0.5;

    const vol = Math.max(0.0001, opt.volume ?? 0.75);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.004);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    source.start(now);
    return true;
  }

  /** Procedural one-shot helpers (fallback when banks not ready). */
  #tone(freq, dur, opt = {}) {
    if (!this.context || !this.sfx || this.muted) return;
    const now = this.context.currentTime + (opt.delay ?? 0);
    const osc = this.context.createOscillator();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    osc.type = opt.type ?? 'sine';
    osc.frequency.setValueAtTime(Math.max(20, freq), now);
    if (opt.end) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opt.end), now + dur);
    filter.type = 'lowpass';
    filter.frequency.value = opt.filter ?? 800;
    const peak = opt.volume ?? 0.06;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.01, dur * 0.15));
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    osc.start(now);
    osc.stop(now + dur + 0.04);
  }

  #noise(dur, volume, opt = {}) {
    if (!this.context || !this.sfx || this.muted) return;
    const frames = Math.max(1, (this.context.sampleRate * dur) | 0);
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    const decay = opt.decay ?? 1.2;
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames) ** decay;
    }
    const now = this.context.currentTime + (opt.delay ?? 0);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = opt.type ?? 'lowpass';
    filter.frequency.value = opt.frequency ?? 600;
    filter.Q.value = opt.q ?? 0.7;
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    source.start(now);
  }

  // ---------------------------------------------------------------------------
  // Public game API (stable call sites)
  // ---------------------------------------------------------------------------

  click() {
    if (this.playSample('ui_click', { volume: 0.45, rate: 0.96 + Math.random() * 0.08, filter: 1600 })) return;
    this.#noise(0.03, 0.02, { type: 'lowpass', frequency: 900, decay: 2 });
    this.#tone(160, 0.04, { type: 'triangle', volume: 0.025, end: 90, filter: 500 });
  }

  /**
   * Weapon motion. Combo 0–3 maps to heavier whooshes.
   * @param {number} combo
   */
  swing(combo = 0) {
    if (!this.context || !this.sfx || this.muted) return;
    const c = Math.max(0, Math.min(3, combo | 0));
    const finisher = c >= 3;
    // Prefer combo bank; fall back to generic swing variants.
    const played = this.playSample(`swing_${c}`, {
      volume: finisher ? 0.78 : 0.55 + c * 0.06,
      rate: 0.92 + Math.random() * 0.1,
      filter: finisher ? 1800 : 1500,
    }) || this.playSample('swing_extra', {
      volume: 0.6,
      rate: 0.93 + Math.random() * 0.1,
      filter: 1500,
    });

    if (!played) {
      this.#noise(finisher ? 0.12 : 0.08, finisher ? 0.04 : 0.028, {
        type: 'bandpass', frequency: 500 + c * 60, q: 0.7, decay: 1.0,
      });
      this.#tone(55 + c * 6, finisher ? 0.12 : 0.07, {
        type: 'sine', volume: 0.03, end: 36, filter: 220,
      });
    }
  }

  /**
   * Successful damage contact.
   * @param {boolean} critical
   * @param {boolean} finisher
   */
  hit(critical = false, finisher = false) {
    if (!this.context || !this.sfx || this.muted) return;

    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    // Multi-target: one full impact, then soft ticks (cleave / skills).
    if (nowMs - this._lastHitAt < 36) {
      this._hitBurstCount += 1;
      if (this._hitBurstCount > 3) return;
      const soft = Math.max(0.2, 0.45 - this._hitBurstCount * 0.08);
      this.#noise(0.035, 0.014 * soft, { type: 'lowpass', frequency: 450, decay: 1.8 });
      this.#tone(70, 0.045, { type: 'sine', volume: 0.025 * soft, end: 36, filter: 280 });
      return;
    }
    this._lastHitAt = nowMs;
    this._hitBurstCount = 0;

    let key = 'hit_light';
    let volume = 0.88;
    // Very dark LP — kills hi-hat air on contact
    let filter = 720;
    if (critical) {
      key = 'hit_crit';
      volume = 0.98;
      filter = 800;
    } else if (finisher) {
      key = 'hit_finisher';
      volume = 1.0;
      filter = 680;
    }

    const played = this.playSample(key, {
      volume,
      rate: 0.92 + Math.random() * 0.07,
      filter,
    });

    if (!played) {
      // Procedural mid-low thud only — no bright noise
      this.#tone(critical ? 82 : finisher ? 58 : 72, finisher ? 0.16 : 0.1, {
        type: 'sine', volume: critical ? 0.1 : 0.08, end: 38, filter: 360,
      });
      this.#tone(critical ? 52 : 48, finisher ? 0.14 : 0.08, {
        type: 'sine', volume: 0.04, end: 34, filter: 200,
      });
      this.#noise(finisher ? 0.06 : 0.04, finisher ? 0.012 : 0.008, {
        type: 'lowpass', frequency: 320, decay: 1.5,
      });
      if (finisher) this.#tone(52, 0.18, { type: 'sine', volume: 0.05, end: 36, filter: 180 });
    } else if (finisher) {
      this.#tone(55, 0.12, { type: 'sine', volume: 0.028, end: 36, filter: 180 });
    }
  }

  hurt() {
    if (this.playSample('hurt', { volume: 0.7, rate: 0.94 + Math.random() * 0.08, filter: 1200 })) return;
    this.#tone(90, 0.18, { type: 'sawtooth', volume: 0.05, end: 40, filter: 500 });
    this.#noise(0.12, 0.02, { type: 'lowpass', frequency: 500, decay: 1.1 });
  }

  dash() {
    if (this.playSample('dash', { volume: 0.55, rate: 0.95 + Math.random() * 0.1, filter: 1400 })) return;
    this.#noise(0.1, 0.022, { type: 'bandpass', frequency: 380, q: 0.8, decay: 1.1 });
    this.#tone(120, 0.09, { type: 'triangle', volume: 0.03, end: 50, filter: 400 });
  }

  /**
   * Skill cast SFX — themed banks with fallback chain.
   * @param {string} [themeOrKey] e.g. skill_blade | skill_fire | ember | frost
   */
  skill(themeOrKey = 'skill') {
    const key = this.#resolveSkillBank(themeOrKey);
    if (this.playSample(key, { volume: 0.68, rate: 0.95 + Math.random() * 0.08, filter: 1200 })) return;
    if (key !== 'skill' && this.playSample('skill', { volume: 0.65, rate: 0.96 + Math.random() * 0.06, filter: 1200 })) return;
    // Procedural thematic fallbacks
    if (key.includes('fire') || key.includes('ember') || key.includes('meteor')) {
      this.#noise(0.14, 0.032, { type: 'bandpass', frequency: 320, q: 0.6, decay: 1.0 });
      this.#tone(70, 0.16, { type: 'sawtooth', volume: 0.035, end: 40, filter: 380 });
      return;
    }
    if (key.includes('ice') || key.includes('frost')) {
      this.#noise(0.12, 0.028, { type: 'highpass', frequency: 900, q: 0.5, decay: 1.2 });
      this.#tone(140, 0.12, { type: 'triangle', volume: 0.03, end: 70, filter: 900 });
      return;
    }
    if (key.includes('arcane') || key.includes('star')) {
      this.#noise(0.13, 0.03, { type: 'bandpass', frequency: 500, q: 0.7, decay: 1.0 });
      this.#tone(100, 0.15, { type: 'sine', volume: 0.04, end: 160, filter: 700 });
      return;
    }
    if (key.includes('leap')) {
      this.#noise(0.11, 0.03, { type: 'lowpass', frequency: 350, decay: 1.0 });
      this.#tone(55, 0.14, { type: 'sine', volume: 0.04, end: 36, filter: 220 });
      return;
    }
    if (key.includes('bow')) {
      this.#noise(0.11, 0.028, { type: 'bandpass', frequency: 520, q: 0.65, decay: 1.05 });
      this.#tone(95, 0.11, { type: 'triangle', volume: 0.032, end: 55, filter: 650 });
      return;
    }
    if (key.includes('trap')) {
      this.#noise(0.08, 0.03, { type: 'highpass', frequency: 700, q: 0.7, decay: 1.4 });
      this.#tone(120, 0.07, { type: 'square', volume: 0.02, end: 60, filter: 900 });
      return;
    }
    if (key.includes('dagger')) {
      this.#noise(0.07, 0.022, { type: 'bandpass', frequency: 700, q: 0.9, decay: 1.5 });
      this.#tone(160, 0.06, { type: 'triangle', volume: 0.025, end: 70, filter: 1000 });
      return;
    }
    this.#noise(0.12, 0.03, { type: 'bandpass', frequency: 400, q: 0.7, decay: 1.0 });
    this.#tone(90, 0.14, { type: 'triangle', volume: 0.04, end: 48, filter: 400 });
  }

  /** One bounded procedural layer for a level-100 skill cadence phase. */
  apex(skillId, phase) {
    const profile = APEX_AUDIO_PROFILES[skillId];
    const cadence = profile?.cadence?.[phase];
    if (!profile || !cadence || !this.context || !this.sfx || this.muted) return false;
    const pitch = profile.pitch * cadence.pitchMul;
    this.#tone(pitch, cadence.duration, {
      type: profile.timbre, volume: .045 * cadence.volumeMul,
      end: Math.max(24, pitch * (phase === 'anticipate' ? 1.12 : .48)), filter: profile.filter,
    });
    this.#noise(cadence.duration * .72, profile.noise * cadence.noiseMul, {
      type: phase === 'anticipate' ? 'bandpass' : 'lowpass',
      frequency: profile.filter, q: phase === 'anticipate' ? .85 : .55,
      decay: phase === 'finisher' ? .82 : 1.35,
    });
    return true;
  }

  #resolveSkillBank(themeOrKey) {
    if (!themeOrKey || themeOrKey === 'skill') return 'skill';
    const map = {
      skill_blade: 'skill_blade',
      skill_leap: 'skill_leap',
      skill_star: 'skill_star',
      skill_fire: 'skill_fire',
      skill_ice: 'skill_ice',
      skill_arcane: 'skill_arcane',
      skill_bow: 'skill_bow',
      skill_trap: 'skill_trap',
      skill_dagger: 'skill_dagger',
      windsteel: 'skill_blade',
      bladewave: 'skill_blade',
      skyice: 'skill_leap',
      starlight: 'skill_star',
      ember: 'skill_fire',
      meteor: 'skill_fire',
      frost: 'skill_ice',
      arcane: 'skill_arcane',
      venom: 'skill_dagger',
      nightsteel: 'skill_dagger',
      shadow: 'skill_arcane',
      wrath: 'skill_blade',
      hunt_amber: 'skill_bow',
      hunt_gold: 'skill_bow',
      windleaf: 'skill_bow',
      thorn: 'skill_trap',
    };
    return map[themeOrKey] ?? (String(themeOrKey).startsWith('skill_') ? themeOrKey : 'skill');
  }

  /**
   * @param {string} [rarity]
   * @param {{ rate?: number, volume?: number }} [options] rate overrides pitch (gem combo ramp).
   */
  pickup(rarity = 'common', options = {}) {
    const weight = { common: 0.75, uncommon: 0.85, rare: 0.95, epic: 1.05, legendary: 1.15 }[rarity] ?? 0.8;
    const rate = options.rate ?? (0.92 + weight * 0.08 + Math.random() * 0.04);
    const volume = (options.volume ?? 0.4) * weight;
    if (this.playSample('pickup', {
      volume,
      rate,
      filter: 1400,
    })) return;
    this.#noise(0.05, 0.015 * weight, { type: 'lowpass', frequency: 700, decay: 1.5 });
    this.#tone(90 * weight * rate, 0.07, { type: 'triangle', volume: 0.028 * weight, end: 48 * rate, filter: 450 });
  }

  /** Kill-chain sting; reuses hit banks when dedicated samples are absent. */
  killSting(chain = 1) {
    const c = Math.max(1, chain | 0);
    if (c >= 25) {
      if (this.playSample('level', { volume: 0.45, rate: 1.05, filter: 1200 })) return;
      this.#tone(120, 0.12, { type: 'triangle', volume: 0.04, end: 180, filter: 800 });
      return;
    }
    if (c >= 10) {
      this.hit(false, true);
      return;
    }
    this.hit(false, false);
  }

  boss() {
    if (this.playSample('boss', { volume: 0.85, rate: 0.95, filter: 900 })) return;
    this.#noise(0.22, 0.035, { type: 'lowpass', frequency: 280, decay: 0.7 });
    this.#tone(48, 0.4, { type: 'sine', volume: 0.06, end: 34, filter: 220 });
  }

  levelUp() {
    if (this.playSample('level', { volume: 0.75, rate: 1, filter: 1100 })) return;
    this.#noise(0.16, 0.028, { type: 'bandpass', frequency: 300, q: 0.6, decay: 0.9 });
    this.#tone(60, 0.22, { type: 'sine', volume: 0.055, end: 100, filter: 400 });
  }

  legendary() {
    if (this.playSample('legendary', { volume: 0.88, rate: 0.97, filter: 1000 })) return;
    this.#noise(0.18, 0.04, { type: 'lowpass', frequency: 400, decay: 0.85 });
    this.#tone(48, 0.3, { type: 'sine', volume: 0.07, end: 34, filter: 200 });
  }

  // Legacy helpers still used by some code paths / tools
  tone(frequency = 440, duration = 0.1, options = {}) {
    this.#tone(frequency, duration, {
      type: options.type,
      volume: options.volume,
      end: options.endFrequency,
      filter: options.filter,
      delay: options.delay,
    });
  }

  noise(duration = 0.08, volume = 0.025, options = {}) {
    this.#noise(duration, volume, options);
  }

  chord() {
    /* intentionally empty — no musical chime stacks */
  }
}
