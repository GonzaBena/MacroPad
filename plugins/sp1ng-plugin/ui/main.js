// ─── Canvas setup ─────────────────────────────────────────────────────────────
const canvas = document.getElementById('c');
const ctx    = canvas.getContext('2d');
let W, H;

function resize() {
  const wrap = document.getElementById('canvas-wrap');
  W = canvas.width  = wrap.clientWidth;
  H = canvas.height = wrap.clientHeight;
}

window.addEventListener('resize', () => {
  resize();
  if (game) game.resize();
});

resize();

// ─── Game state ───────────────────────────────────────────────────────────────
let game         = null;
let currentLevel = 0;
let totalTries   = 0;

// ─── Overlay helpers ──────────────────────────────────────────────────────────
const OVERLAYS = ['ov-start', 'ov-dead', 'ov-win', 'ov-complete'];

function showOverlay(id) {
  OVERLAYS.forEach(o => document.getElementById(o).classList.add('hidden'));
  if (id) document.getElementById(id).classList.remove('hidden');
}

// ─── Game flow ────────────────────────────────────────────────────────────────
function startGame() {
  currentLevel = 0;
  totalTries   = 0;
  document.getElementById('hud-tries').textContent = 0;
  showOverlay(null);
  if (game) game.destroy();
  game = new Game(currentLevel);
}

function restartLevel() {
  showOverlay(null);
  if (game) game.destroy();
  game = new Game(currentLevel);
}

function nextLevel() {
  currentLevel++;
  if (currentLevel >= LEVEL_DEFS.length) {
    showOverlay('ov-complete');
    if (game) game.destroy();
    game = null;
    return;
  }
  showOverlay(null);
  if (game) game.destroy();
  game = new Game(currentLevel);
}

// ─── Hint fade ────────────────────────────────────────────────────────────────
setTimeout(() => {
  document.getElementById('hint').style.opacity = '0';
}, 4000);
