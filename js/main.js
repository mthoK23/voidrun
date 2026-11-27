import { GameManager } from './game-manager.js';

const canvas = document.querySelector('#game-canvas');
if (!canvas) throw new Error('Game canvas not found. Check index.html.');
new GameManager(canvas);
