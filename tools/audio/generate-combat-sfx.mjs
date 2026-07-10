#!/usr/bin/env node
/**
 * Combat SFX offline generator — original procedural assets for Sol ARPG.
 *
 * Design research baked into this generator (not runtime "rules"):
 * - Sword combat layers: swing / scrape-lite / impact / enhancer
 *   (David Dumais: weapon swing + scrape + hit + enhancer)
 * - Attack beats: swing on input, impact only on successful damage
 *   (combat audio anatomy: before / during contact / after)
 * - HMLS frequency stack: High + Mid + Low + Style, with EQ carve
 *   so layers don't fight (Akash Thakkar HMLS; game-audio EQ practice)
 * - Weight feel: deeper / longer thuds for finishers & crits
 *   (gamedesign: powerful hits = deeper resonating thud)
 * - Player preference for this project: mid-low dull impact, no bell/chime
 *   → no sustained pure-tone partials; short body + grit only
 *
 * Usage: node tools/audio/generate-combat-sfx.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 44100;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT = join(ROOT, 'assets/audio/combat');

const clamp = (v, lo = -1, hi = 1) => Math.max(lo, Math.min(hi, v));
const lerp = (a, b, t) => a + (b - a) * t;
const expDecay = (t, rate) => Math.exp(-t * rate);

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeLP() {
  let y = 0;
  return (x, cutoff) => {
    const fc = Math.max(20, Math.min(SR * 0.45, cutoff));
    const a = Math.exp((-2 * Math.PI * fc) / SR);
    y = a * y + (1 - a) * x;
    return y;
  };
}

function makeHP() {
  let px = 0;
  let py = 0;
  return (x, cutoff) => {
    const fc = Math.max(20, Math.min(SR * 0.45, cutoff));
    const rc = 1 / (2 * Math.PI * fc);
    const dt = 1 / SR;
    const a = rc / (rc + dt);
    const y = a * (py + x - px);
    px = x;
    py = y;
    return y;
  };
}

function softClip(x, drive = 1.2) {
  return Math.tanh(x * drive);
}

/** One-pole pink-ish noise (Paul Kellet approx). */
function makePink(rng) {
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  return () => {
    const w = rng() * 2 - 1;
    b0 = 0.99765 * b0 + w * 0.099046;
    b1 = 0.963 * b1 + w * 0.2965164;
    b2 = 0.57 * b2 + w * 1.0526913;
    return b0 + b1 + b2 + w * 0.1848;
  };
}

function writeWav(path, samples) {
  const n = samples.length;
  const dataSize = n * 2;
  const buf = Buffer.alloc(44 + dataSize);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataSize, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(dataSize, 40);

  // Peak normalize with headroom, then gentle soft-clip glue.
  let peak = 1e-9;
  for (let i = 0; i < n; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  const norm = 0.88 / peak;
  for (let i = 0; i < n; i += 1) {
    const s = softClip(samples[i] * norm, 1.15);
    buf.writeInt16LE(Math.round(clamp(s) * 32767), 44 + i * 2);
  }
  writeFileSync(path, buf);
}

function fade(samples, msIn = 1.5, msOut = 4) {
  const nIn = Math.floor((SR * msIn) / 1000);
  const nOut = Math.floor((SR * msOut) / 1000);
  for (let i = 0; i < nIn && i < samples.length; i += 1) samples[i] *= i / nIn;
  for (let i = 0; i < nOut && i < samples.length; i += 1) {
    samples[samples.length - 1 - i] *= i / nOut;
  }
  return samples;
}

/**
 * SWING — air motion only (miss-safe).
 * Layers: Low rumble body + Mid bandpass whoosh + soft Style grit.
 * No contact metal. No musical tones.
 */
function synthSwing({ duration, weight, seed }) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const hp = makeHP();
  const lpOut = makeLP();
  const frames = Math.floor(SR * duration);
  const out = new Float32Array(frames);

  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    const u = i / frames;
    // Fast attack, smooth release — blade cutting air
    const env = Math.sin(Math.min(1, u * 2.8) * Math.PI * 0.5) ** 0.65
      * (1 - u) ** (0.45 + weight * 0.12);

    // LOW: sub-air mass (enhancer weight)
    const low = Math.sin(2 * Math.PI * (42 + weight * 12) * t)
      * expDecay(t, 14)
      * 0.35
      * weight
      + lp(pink() * 0.5, 180) * 0.4 * weight;

    // MID: bandpass whoosh center falls over the swing
    const fCenter = lerp(780 + weight * 80, 220, u ** 0.7);
    const air = lp(pink(), fCenter * 1.35) - lp(pink(), Math.max(90, fCenter * 0.45));
    const mid = air * 0.85;

    // HIGH/style: very soft grit only (not a ring)
    const grit = hp(pink(), 900) * expDecay(t, 28) * 0.12;

    let s = (low * 0.55 + mid * 0.9 + grit) * env;
    s = lpOut(s, 1600 + weight * 200);
    out[i] = s;
  }
  return fade(out, 1, 6);
}

/**
 * HIT — contact only. Dull mid-low meat/wood character.
 * Layers:
 *   L: sub thump (40–70 Hz pitch drop)
 *   M: body thud + mid "pak"
 *   H: short filtered noise transient (no sustained partials = no bell)
 *   S: weight boom / grit enhancer
 */
function synthHit({
  duration,
  bodyHz,
  weight,
  punch,
  seed,
  critical = false,
  finisher = false,
}) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const lp2 = makeLP();
  const lp3 = makeLP();
  const hp = makeHP();
  const hpSub = makeHP();
  const frames = Math.floor(SR * duration);
  const out = new Float32Array(frames);

  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;

    // --- LOW: pitch-dropping body (the "thud") — mid-low focused ---
    const drop = Math.max(0.4, 1 - t * (finisher ? 2.2 : 3.4));
    const thumpEnv = expDecay(t, finisher ? 12 : critical ? 15 : 19);
    const thump = Math.sin(2 * Math.PI * bodyHz * t * drop) * thumpEnv * (0.95 + weight * 0.22);

    // Sub slightly reduced (user: less ultra-low rumble)
    const subEnv = expDecay(t, finisher ? 10 : 14);
    const sub = Math.sin(2 * Math.PI * (bodyHz * 0.55) * t) * subEnv * (finisher ? 0.55 : 0.4);

    // --- MID: chest punch / flesh slap (main character) ---
    const midHz = critical ? 150 : finisher ? 118 : 132;
    const midEnv = expDecay(t, 34 + punch * 8);
    const mid = Math.sin(2 * Math.PI * midHz * t * Math.max(0.4, 1 - t * 2.5))
      * midEnv
      * (0.62 * punch);

    // Transient "pak" — very dark mid thud, no hi-hat hiss
    const clickEnv = expDecay(t, 240 + punch * 50);
    const click = lp(hp(pink(), 120), 320) * clickEnv * (0.22 * punch);

    // Grit almost off — hi-hat air was the complaint
    const gritEnv = expDecay(t, 80);
    const grit = lp(pink(), 300) * gritEnv * 0.05;

    // --- STYLE / enhancer — less sub boom ---
    const boom = finisher
      ? Math.sin(2 * Math.PI * 48 * t) * expDecay(t, 11) * 0.55
        + Math.sin(2 * Math.PI * 62 * t) * expDecay(t, 18) * 0.22
      : critical
        ? Math.sin(2 * Math.PI * 58 * t) * expDecay(t, 14) * 0.28
        : 0;

    // Crit fill stays mid, not bright
    const critFill = critical
      ? lp(pink(), 300) * expDecay(t, 28) * 0.08
        + Math.sin(2 * Math.PI * 95 * t) * expDecay(t, 22) * 0.28
      : 0;

    let s = thump * 1.05
      + sub * 0.55
      + mid * 0.85
      + click * 0.28
      + grit * 0.2
      + boom
      + critFill;

    // Aggressive high cut — kill cymbal/hi-hat air
    const shelf = finisher ? 620 : critical ? 700 : 580;
    s = lp2(s, shelf);
    s = lp3(s, shelf * 0.85);
    s = hpSub(s, 52);
    out[i] = softClip(s, 1.15);
  }
  return fade(out, 0.8, 8);
}

/** Soft UI / feedback — never chordal. */
function synthClick(seed) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const frames = Math.floor(SR * 0.05);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    const env = expDecay(t, 70);
    out[i] = lp(pink(), 900) * env * 0.55
      + Math.sin(2 * Math.PI * 160 * t) * expDecay(t, 55) * 0.25;
  }
  return fade(out, 0.5, 3);
}

function synthDash(seed) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const frames = Math.floor(SR * 0.14);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    const u = i / frames;
    const env = Math.sin(Math.min(1, u * 3) * Math.PI * 0.5) * (1 - u) ** 0.6;
    const whoosh = lp(pink(), lerp(900, 200, u));
    const body = Math.sin(2 * Math.PI * 70 * t) * expDecay(t, 18) * 0.35;
    out[i] = (whoosh * 0.7 + body) * env;
  }
  return fade(out, 1, 5);
}

function synthSkill(seed) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const frames = Math.floor(SR * 0.22);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    const env = expDecay(t, 9);
    const swell = Math.sin(2 * Math.PI * lerp(55, 95, Math.min(1, t * 4)) * t) * expDecay(t, 8) * 0.45;
    const air = lp(pink(), 500) * expDecay(t, 12) * 0.5;
    out[i] = (swell + air) * env;
  }
  return fade(out, 2, 8);
}

function synthHurt(seed) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const frames = Math.floor(SR * 0.22);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * lerp(95, 40, Math.min(1, t * 5)) * t) * expDecay(t, 10) * 0.55
      + lp(pink(), 400) * expDecay(t, 14) * 0.35;
  }
  return fade(out, 1, 6);
}

function synthPickup(seed, weight = 1) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const frames = Math.floor(SR * 0.1);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * (85 * weight) * t) * expDecay(t, 28) * 0.4
      + lp(pink(), 600) * expDecay(t, 35) * 0.35;
  }
  return fade(out, 0.5, 4);
}

function synthLevel(seed) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const frames = Math.floor(SR * 0.36);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    const rise = Math.min(1, t * 3);
    const body = Math.sin(2 * Math.PI * lerp(55, 100, rise) * t) * expDecay(t, 6) * 0.5;
    const low = Math.sin(2 * Math.PI * 42 * t) * expDecay(t, 5) * 0.4;
    const air = lp(pink(), 450) * expDecay(t, 8) * 0.35;
    out[i] = body + low + air;
  }
  return fade(out, 2, 12);
}

function synthBoss(seed) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const frames = Math.floor(SR * 0.5);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * 40 * t) * expDecay(t, 4) * 0.55
      + Math.sin(2 * Math.PI * 58 * t) * expDecay(t, 6) * 0.35
      + lp(pink(), 220) * expDecay(t, 5) * 0.4;
  }
  return fade(out, 2, 15);
}

function synthLegendary(seed) {
  const rng = mulberry32(seed);
  const pink = makePink(rng);
  const lp = makeLP();
  const frames = Math.floor(SR * 0.42);
  const out = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    const t = i / SR;
    out[i] = Math.sin(2 * Math.PI * 48 * t) * expDecay(t, 5) * 0.6
      + Math.sin(2 * Math.PI * 72 * t) * expDecay(t, 8) * 0.35
      + lp(pink(), 380) * expDecay(t, 7) * 0.4;
  }
  return fade(out, 2, 12);
}

mkdirSync(OUT, { recursive: true });
const files = [];

function save(name, samples) {
  const path = join(OUT, `${name}.wav`);
  writeWav(path, samples);
  files.push(path);
}

// --- Combat swings (combo weight ramp) ---
[
  { name: 'swing_0', duration: 0.13, weight: 0.85, seed: 101 },
  { name: 'swing_1', duration: 0.14, weight: 1.0, seed: 202 },
  { name: 'swing_2', duration: 0.15, weight: 1.15, seed: 303 },
  { name: 'swing_3', duration: 0.2, weight: 1.45, seed: 404 },
].forEach((s) => save(s.name, synthSwing(s)));

// Extra swing variants for random bank variety
save('swing_a', synthSwing({ duration: 0.135, weight: 0.95, seed: 505 }));
save('swing_b', synthSwing({ duration: 0.145, weight: 1.1, seed: 606 }));

// --- Hits: light / heavy / crit / finisher ---
[
  { name: 'hit_light_0', duration: 0.15, bodyHz: 78, weight: 0.9, punch: 0.95, seed: 11 },
  { name: 'hit_light_1', duration: 0.16, bodyHz: 84, weight: 1.0, punch: 1.05, seed: 22 },
  { name: 'hit_light_2', duration: 0.14, bodyHz: 72, weight: 0.85, punch: 0.9, seed: 33 },
  { name: 'hit_heavy_0', duration: 0.2, bodyHz: 68, weight: 1.2, punch: 1.15, seed: 44 },
  { name: 'hit_heavy_1', duration: 0.21, bodyHz: 74, weight: 1.25, punch: 1.2, seed: 45 },
  { name: 'hit_crit_0', duration: 0.22, bodyHz: 86, weight: 1.25, punch: 1.25, seed: 55, critical: true },
  { name: 'hit_crit_1', duration: 0.24, bodyHz: 92, weight: 1.3, punch: 1.3, seed: 66, critical: true },
  { name: 'hit_finisher_0', duration: 0.28, bodyHz: 60, weight: 1.4, punch: 1.2, seed: 77, finisher: true },
  { name: 'hit_finisher_1', duration: 0.3, bodyHz: 56, weight: 1.45, punch: 1.25, seed: 88, finisher: true },
].forEach((s) => save(s.name, synthHit(s)));

// --- Feedback banks ---
save('ui_click', synthClick(9001));
save('dash_0', synthDash(9101));
save('dash_1', synthDash(9102));
save('skill_0', synthSkill(9201));
save('hurt_0', synthHurt(9301));
save('hurt_1', synthHurt(9302));
save('pickup_0', synthPickup(9401, 0.9));
save('pickup_1', synthPickup(9402, 1.1));
save('level_0', synthLevel(9501));
save('boss_0', synthBoss(9601));
save('legendary_0', synthLegendary(9701));

console.log(`Generated ${files.length} SFX → assets/audio/combat/`);
for (const f of files) console.log(`  ${f.slice(ROOT.length + 1)}`);
