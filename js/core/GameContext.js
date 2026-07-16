/**
 * Narrow runtime surface for gameplay systems.
 *
 * LOCKED CONTRACT — see docs/architecture-template-boundary.md
 * Systems MUST prefer `game.ctx` (or createGameContext(game)) over inventing
 * new direct cross-imports between systems. Do not widen this surface without
 * updating the boundary doc and integrity tests.
 */

/** Keys every system may rely on via GameContext getters. */
export const GAME_CONTEXT_KEYS = Object.freeze([
  'player',
  'enemies',
  'combat',
  'effects',
  'audio',
  'world',
  'ui',
  'camera',
  'assets',
  'mode',
  'state',
  'quality',
  'debugEnabled',
  'delta',
  'elapsed',
  'save',
  'input',
]);

/**
 * @param {object} game Game instance (live bag of runtime services)
 * @returns {Readonly<Record<string, unknown>>} frozen facade with live getters
 */
export function createGameContext(game) {
  if (!game || typeof game !== 'object') {
    throw new Error('createGameContext requires a game object');
  }
  const ctx = {
    get player() { return game.player; },
    get enemies() { return game.enemies; },
    get combat() { return game.combat; },
    get effects() { return game.effects; },
    get audio() { return game.audio; },
    get world() { return game.world; },
    get ui() { return game.ui; },
    get camera() { return game.camera; },
    get assets() { return game.assets; },
    get mode() { return game.mode; },
    get state() { return game.state; },
    get quality() { return game.quality; },
    get debugEnabled() { return game.debugEnabled; },
    get delta() { return game.delta; },
    get elapsed() { return game.elapsed; },
    get save() { return game.save; },
    get input() { return game.input; },
  };
  return Object.freeze(ctx);
}

/** Structural check used by integrity tests — no game instance required. */
export function listGameContextKeys() {
  return GAME_CONTEXT_KEYS.slice();
}
