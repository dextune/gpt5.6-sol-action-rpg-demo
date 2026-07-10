import { GAME_CONFIG } from '../config.js';
import { safeJsonParse } from './Utils.js';

export class SaveManager {
  hasSave() {
    try { return Boolean(localStorage.getItem(GAME_CONFIG.saveKey)); } catch { return false; }
  }

  load() {
    try {
      const data = safeJsonParse(localStorage.getItem(GAME_CONFIG.saveKey));
      return data?.version === GAME_CONFIG.saveVersion ? data : null;
    } catch {
      return null;
    }
  }

  save(payload) {
    try {
      localStorage.setItem(GAME_CONFIG.saveKey, JSON.stringify({
        version: GAME_CONFIG.saveVersion,
        savedAt: Date.now(),
        ...payload,
      }));
      return true;
    } catch {
      return false;
    }
  }

  clear() {
    try { localStorage.removeItem(GAME_CONFIG.saveKey); } catch { /* storage denied */ }
  }
}
