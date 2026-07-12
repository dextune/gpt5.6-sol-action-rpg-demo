import { GAME_CONFIG } from '../config.js';
import { safeJsonParse } from './Utils.js';

/** Lowest save blob version we still try to migrate. */
const MIN_MIGRATABLE_VERSION = 1;

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Normalize a raw localStorage blob into a playable save shape.
 * Accepts current and older versions; returns null if unusable.
 * Extra keys (e.g. future fields) are preserved.
 */
export function normalizeSaveData(raw) {
  if (!isPlainObject(raw)) return null;
  const version = Number(raw.version);
  if (!Number.isFinite(version) || version < MIN_MIGRATABLE_VERSION || version > GAME_CONFIG.saveVersion + 2) {
    return null;
  }
  if (!isPlainObject(raw.player)) return null;

  const player = { ...raw.player };
  const hunt = isPlainObject(raw.hunt) ? { ...raw.hunt } : {};
  const defenseMeta = isPlainObject(raw.defenseMeta)
    ? {
      bestWave: Math.max(0, Number(raw.defenseMeta.bestWave) || 0),
      lastWave: Math.max(0, Number(raw.defenseMeta.lastWave) || 0),
      runs: Math.max(0, Number(raw.defenseMeta.runs) || 0),
    }
    : { bestWave: 0, lastWave: 0, runs: 0 };

  return {
    ...raw,
    version: GAME_CONFIG.saveVersion,
    savedAt: Math.max(0, Number(raw.savedAt) || 0),
    player,
    hunt,
    playTime: Math.max(0, Number(raw.playTime) || 0),
    cameraYaw: Number.isFinite(Number(raw.cameraYaw)) ? Number(raw.cameraYaw) : 0.55,
    cameraDistance: Number.isFinite(Number(raw.cameraDistance))
      ? Number(raw.cameraDistance)
      : GAME_CONFIG.cameraDistance,
    defenseMeta,
    /** True when blob was rewritten from an older schema. */
    migrated: version !== GAME_CONFIG.saveVersion,
  };
}

export class SaveManager {
  #memory = null;

  hasSave() {
    return Boolean(this.load());
  }

  /** Read + normalize. Migrated older saves are rewritten once so Continue stays valid. */
  load() {
    try {
      const rawText = localStorage.getItem(GAME_CONFIG.saveKey);
      if (!rawText) {
        this.#memory = null;
        return null;
      }
      const parsed = safeJsonParse(rawText);
      const data = normalizeSaveData(parsed);
      if (!data) {
        this.#memory = null;
        return null;
      }
      this.#memory = data;
      if (data.migrated) {
        // Persist upgraded schema so version bumps do not leave Continue dead.
        const { migrated: _migrated, ...rest } = data;
        this.#write(rest, data.savedAt || Date.now());
      }
      return data;
    } catch {
      this.#memory = null;
      return null;
    }
  }

  /** Lightweight fields for title Continue label (does not require full game state). */
  getSummary() {
    const data = this.load();
    if (!data?.player) return null;
    return {
      level: Math.max(1, Number(data.player.level) || 1),
      classId: data.player.classId ?? null,
      name: typeof data.player.name === 'string' ? data.player.name : null,
      playTime: data.playTime ?? 0,
      kills: Math.max(0, Number(data.hunt?.totalKills) || 0),
      savedAt: data.savedAt || 0,
      gold: Math.max(0, Number(data.player.gold) || 0),
    };
  }

  save(payload) {
    if (!isPlainObject(payload) || !isPlainObject(payload.player)) return false;
    const ok = this.#write(payload, Date.now());
    if (ok) {
      this.#memory = normalizeSaveData({
        version: GAME_CONFIG.saveVersion,
        savedAt: Date.now(),
        ...payload,
      });
    }
    return ok;
  }

  clear() {
    this.#memory = null;
    try {
      localStorage.removeItem(GAME_CONFIG.saveKey);
    } catch { /* storage denied */ }
  }

  #write(payload, savedAt) {
    try {
      const { migrated: _m, version: _v, savedAt: _s, ...extras } = isPlainObject(payload) ? payload : {};
      const blob = {
        ...extras,
        version: GAME_CONFIG.saveVersion,
        savedAt: savedAt || Date.now(),
        player: payload.player,
        hunt: isPlainObject(payload.hunt) ? payload.hunt : (payload.hunt ?? {}),
        playTime: Math.max(0, Number(payload.playTime) || 0),
        cameraYaw: Number.isFinite(Number(payload.cameraYaw)) ? Number(payload.cameraYaw) : 0.55,
        cameraDistance: Number.isFinite(Number(payload.cameraDistance))
          ? Number(payload.cameraDistance)
          : GAME_CONFIG.cameraDistance,
        defenseMeta: isPlainObject(payload.defenseMeta)
          ? payload.defenseMeta
          : { bestWave: 0, lastWave: 0, runs: 0 },
      };
      const text = JSON.stringify(blob);
      localStorage.setItem(GAME_CONFIG.saveKey, text);
      // Verify round-trip so silent quota/private-mode failures surface as false.
      const verify = localStorage.getItem(GAME_CONFIG.saveKey);
      if (verify !== text) return false;
      return true;
    } catch {
      return false;
    }
  }
}
