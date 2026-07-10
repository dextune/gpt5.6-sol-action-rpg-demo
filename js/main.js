import { Game } from './core/Game.js';

const canvas = document.getElementById('game-canvas');
const game = new Game(canvas);
window.__SOL_ARPG_DEMO__ = game;

game.initialize().catch(error => {
  console.error(error);
  game.ui.fatal(error);
});
