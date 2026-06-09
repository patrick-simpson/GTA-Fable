import { Game } from './Game';

const canvas = document.getElementById('game') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Missing #game canvas');

const game = new Game(canvas);
game.start();

// Full teardown on hot reload / page exit so GPU memory is always released.
window.addEventListener('pagehide', () => game.dispose());
if (import.meta.hot) {
  import.meta.hot.dispose(() => game.dispose());
}
