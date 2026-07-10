export class AudioManager {
  constructor() {
    this.context = null;
    this.master = null;
    this.sfx = null;
    this.ambient = null;
    this.muted = false;
    this.ambientNodes = [];
  }

  async unlock() {
    if (!this.context) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      this.context = new AudioContext();
      this.master = this.context.createGain();
      this.sfx = this.context.createGain();
      this.ambient = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : .58;
      this.sfx.gain.value = .92;
      this.ambient.gain.value = .12;
      this.sfx.connect(this.master);
      this.ambient.connect(this.master);
      this.master.connect(this.context.destination);
      this.#startAmbient();
    }
    if (this.context.state === 'suspended') await this.context.resume();
    return true;
  }

  #startAmbient() {
    if (!this.context || this.ambientNodes.length) return;
    const frequencies = [55, 82.4, 110];
    for (let i = 0; i < frequencies.length; i += 1) {
      const oscillator = this.context.createOscillator();
      const filter = this.context.createBiquadFilter();
      const gain = this.context.createGain();
      oscillator.type = i === 0 ? 'sine' : 'triangle';
      oscillator.frequency.value = frequencies[i];
      filter.type = 'lowpass';
      filter.frequency.value = 220 + i * 140;
      gain.gain.value = .016 / (i + 1);
      oscillator.connect(filter);
      filter.connect(gain);
      gain.connect(this.ambient);
      oscillator.start();
      this.ambientNodes.push(oscillator, filter, gain);
    }
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setTargetAtTime(this.muted ? 0 : .58, this.context.currentTime, .03);
    }
  }

  tone(frequency = 440, duration = .1, options = {}) {
    if (!this.context || !this.sfx || this.muted) return;
    const now = this.context.currentTime + (options.delay ?? 0);
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    const filter = this.context.createBiquadFilter();
    oscillator.type = options.type ?? 'sine';
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), now);
    if (options.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency), now + duration);
    filter.type = options.filterType ?? 'lowpass';
    filter.frequency.value = options.filter ?? 3200;
    gain.gain.setValueAtTime(.0001, now);
    gain.gain.exponentialRampToValueAtTime(options.volume ?? .075, now + Math.min(.018, duration * .25));
    gain.gain.exponentialRampToValueAtTime(.0001, now + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    oscillator.start(now);
    oscillator.stop(now + duration + .04);
  }

  noise(duration = .08, volume = .025, options = {}) {
    if (!this.context || !this.sfx || this.muted) return;
    const frames = Math.max(1, Math.floor(this.context.sampleRate * duration));
    const buffer = this.context.createBuffer(1, frames, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, options.decay ?? 1.2);
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = buffer;
    filter.type = options.type ?? 'bandpass';
    filter.frequency.value = options.frequency ?? 800;
    gain.gain.value = volume;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfx);
    source.start();
  }

  chord(frequencies, duration = .22, options = {}) {
    frequencies.forEach((frequency, index) => this.tone(frequency, duration, { ...options, delay: (options.delay ?? 0) + index * .025 }));
  }

  click() { this.tone(520, .045, { type: 'triangle', volume: .035, endFrequency: 650 }); }
  swing(combo = 0) {
    const finisher = combo >= 3;
    // Sharp blade whoosh + low body whoomp for weight.
    this.tone(210 + combo * 48, finisher ? .14 : .08, {
      type: 'sawtooth', volume: finisher ? .055 : .042, endFrequency: 520 + combo * 120, filter: 2600,
    });
    this.tone(90 + combo * 12, finisher ? .12 : .07, {
      type: 'triangle', volume: .03, endFrequency: 48, filter: 420,
    });
    this.noise(finisher ? .1 : .07, finisher ? .028 : .018, { frequency: finisher ? 1800 : 1400 });
  }
  hit(critical = false, finisher = false) {
    // Layered "pak": low thud + mid crack + noise grit.
    const heavy = critical || finisher;
    this.tone(critical ? 160 : finisher ? 128 : 102, heavy ? .14 : .08, {
      type: 'square', volume: critical ? .09 : finisher ? .07 : .055, endFrequency: 42, filter: 1100,
    });
    this.tone(critical ? 320 : 240, .05, {
      type: 'triangle', volume: critical ? .05 : .03, endFrequency: 90, filter: 2200,
    });
    this.noise(heavy ? .09 : .06, heavy ? .045 : .028, { frequency: critical ? 1600 : 900 });
    if (critical) this.tone(520, .06, { type: 'sine', volume: .04, endFrequency: 880, filter: 3200 });
  }
  hurt() { this.tone(92, .2, { type: 'sawtooth', volume: .06, endFrequency: 40, filter: 700 }); }
  dash() { this.tone(410, .12, { type: 'sine', volume: .04, endFrequency: 90, filter: 2200 }); this.noise(.09, .018, { frequency: 1600 }); }
  skill() { this.chord([330, 495, 660], .18, { type: 'triangle', volume: .05, filter: 2400 }); }
  pickup(rarity = 'common') {
    const base = { common: 620, uncommon: 700, rare: 780, epic: 880, legendary: 1040 }[rarity] ?? 620;
    this.chord([base, base * 1.25], .11, { type: 'sine', volume: .043 });
  }
  boss() { this.chord([82, 103, 123], .48, { type: 'sawtooth', volume: .052, filter: 700 }); }
  levelUp() { this.chord([523, 659, 784, 1046], .36, { type: 'triangle', volume: .072, filter: 3200 }); }
  legendary() { this.chord([392, 523, 659, 784, 1046], .48, { type: 'sine', volume: .066 }); }
}
