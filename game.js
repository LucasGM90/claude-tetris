'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#7986cb', // J - indigo
  '#ffb74d', // L - orange
  '#eceff1', // 8 - comodín (solo en el tablero, nunca sale de randomPiece)
  '#f06292', // 9 - pentominó +
  '#26a69a', // 10 - pentominó U
  '#9ccc65', // 11 - pentominó Y
  '#ffffff', // 12 - single 1x1 (recompensa)
  '#ff8a65', // 13 - 3x3 hueca (reto)
];

const WILD = 8;
const POWERUP_EVERY = 5;   // cada cuántas líneas aparece un power-up
const FREEZE_MS = 5000;
const POWERUP_SCORE = 10;  // puntos por bloque destruido (x nivel)

const POWERUPS = {
  bomb:      { name: 'Bomba',    icon: '💣', color: '#ef5350' },
  lightning: { name: 'Rayo',     icon: '⚡', color: '#fdd835' },
  tint:      { name: 'Tinte',    icon: '🎨', color: '#ab47bc' },
  gravity:   { name: 'Gravedad', icon: '⏬', color: '#8d6e63' },
  freeze:    { name: 'Congelar', icon: '❄️', color: '#4fc3f7' },
};
const POWERUP_KEYS = Object.keys(POWERUPS);

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

// Piezas especiales (no tetrominós). Su índice de tipo = índice de color.
const SPECIAL_CHANCE = 0.1; // probabilidad por pieza de que salga un pentominó o la hueca
const SPECIAL_PIECES = [
  [[0,9,0],[9,9,9],[0,9,0]],                          // pentominó +
  [[10,0,10],[10,10,10],[0,0,0]],                     // pentominó U
  [[0,11,0,0],[11,11,11,11],[0,0,0,0],[0,0,0,0]],     // pentominó Y
  [[13,13,13],[13,0,13],[13,13,13]],                  // 3x3 hueca
];
const SINGLE_TYPE = 12;

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const powerupEl = document.getElementById('powerup');
const themeToggle = document.getElementById('theme-toggle');

const THEME_KEY = 'tetris-theme';
let gridColor = '#22222e';

let rewardSingle, board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId, nextPowerupAt, freezeLeft, powerMsg;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function randomPiece() {
  if (lines >= nextPowerupAt) {
    nextPowerupAt = lines - (lines % POWERUP_EVERY) + POWERUP_EVERY;
    const power = POWERUP_KEYS[Math.floor(Math.random() * POWERUP_KEYS.length)];
    // Power-up: bloque único (el valor de la celda solo importa para collide/ghost)
    return { type: 0, power, shape: [[1]], x: Math.floor(COLS / 2), y: 0 };
  }
  let type, shape;
  if (rewardSingle) {
    // Recompensa tras un Tetris: bloque 1x1
    rewardSingle = false;
    type = SINGLE_TYPE;
    shape = [[SINGLE_TYPE]];
  } else if (Math.random() < SPECIAL_CHANCE) {
    shape = SPECIAL_PIECES[Math.floor(Math.random() * SPECIAL_PIECES.length)].map(row => [...row]);
    type = shape.flat().find(v => v);
  } else {
    type = Math.floor(Math.random() * 7) + 1;
    shape = PIECES[type].map(row => [...row]);
  }
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

// Una fila está completa si cada celda está llena; cada comodín además
// rellena un hueco de su fila (cuenta doble).
function rowComplete(row) {
  let filled = 0, wild = 0;
  for (const v of row) {
    if (v) filled++;
    if (v === WILD) wild++;
  }
  return filled + wild >= COLS;
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (rowComplete(board[r])) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    if (cleared === 4) rewardSingle = true;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (current.power) applyPowerUp(current.power, current.x, current.y);
  else merge();
  clearLines();
  spawn();
}

function destroyCell(x, y) {
  if (x < 0 || x >= COLS || y < 0 || y >= ROWS || !board[y][x]) return 0;
  board[y][x] = 0;
  return 1;
}

// Color objetivo del Tinte: el del bloque sobre el que aterriza; si no hay
// (suelo o comodín), el color más frecuente del tablero.
function tintTarget(x, y) {
  const below = y + 1 < ROWS ? board[y + 1][x] : 0;
  if (below && below !== WILD) return below;
  const counts = new Array(WILD + 1).fill(0);
  for (const row of board) for (const v of row) if (v && v !== WILD) counts[v]++;
  let best = 0;
  for (let t = 1; t < WILD; t++) if (counts[t] > counts[best]) best = t;
  return best;
}

// Cada columna cae hasta el fondo conservando el orden de sus bloques.
function compactBoard() {
  for (let c = 0; c < COLS; c++) {
    const col = [];
    for (let r = 0; r < ROWS; r++) if (board[r][c]) col.push(board[r][c]);
    for (let r = ROWS - 1; r >= 0; r--) board[r][c] = col.pop() || 0;
  }
}

function applyPowerUp(power, x, y) {
  let destroyed = 0;
  switch (power) {
    case 'bomb':
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++)
          destroyed += destroyCell(x + dx, y + dy);
      break;
    case 'lightning':
      for (let c = 0; c < COLS; c++) destroyed += destroyCell(c, y);
      for (let r = 0; r < ROWS; r++) destroyed += destroyCell(x, r);
      break;
    case 'tint': {
      const target = tintTarget(x, y);
      if (target)
        for (const row of board)
          for (let c = 0; c < COLS; c++) if (row[c] === target) row[c] = WILD;
      break;
    }
    case 'gravity':
      compactBoard();
      break;
    case 'freeze':
      freezeLeft = FREEZE_MS;
      break;
  }
  score += destroyed * POWERUP_SCORE * level;
  powerMsg = `${POWERUPS[power].icon} ${POWERUPS[power].name}`;
  updateHUD();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  powerupEl.textContent = powerMsg || '—';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  if (colorIndex === WILD) {
    context.fillStyle = '#7986cb';
    context.font = `bold ${Math.round(size * 0.6)}px sans-serif`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('★', x * size + size / 2, y * size + size / 2 + 1);
  }
  context.globalAlpha = 1;
}

function drawPowerBlock(context, x, y, power, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = POWERUPS[power].color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.font = `${Math.round(size * 0.6)}px sans-serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(POWERUPS[power].icon, x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function drawCell(context, x, y, piece, value, size, alpha) {
  if (!value) return;
  if (piece.power) drawPowerBlock(context, x, y, piece.power, size, alpha);
  else drawBlock(context, x, y, value, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawCell(ctx, current.x + c, gy + r, current, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawCell(ctx, current.x + c, current.y + r, current, current.shape[r][c], BLOCK);

  // congelación: tinte azul y cuenta atrás
  if (freezeLeft > 0) {
    ctx.fillStyle = 'rgba(79, 195, 247, 0.15)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#4fc3f7';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`❄ ${(freezeLeft / 1000).toFixed(1)}s`, canvas.width / 2, 8);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawCell(nextCtx, offX + c, offY + r, next, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeLeft > 0) {
    freezeLeft = Math.max(0, freezeLeft - dt);
    dropAccum = 0;
  } else {
    dropAccum += dt;
  }
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  if (gameOver) return; // endGame() ya canceló el bucle; no reprogramarlo
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  dropInterval = 1000;
  dropAccum = 0;
  nextPowerupAt = POWERUP_EVERY;
  freezeLeft = 0;
  rewardSingle = false;
  powerMsg = '';
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.checked = theme === 'light';
  gridColor = getComputedStyle(document.documentElement).getPropertyValue('--grid').trim() || gridColor;
  // el loop está cancelado en pausa/game over: redibujar explícitamente
  if (current && next) { draw(); drawNext(); }
}

themeToggle.addEventListener('change', () => {
  const theme = themeToggle.checked ? 'light' : 'dark';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* almacenamiento no disponible */ }
  applyTheme(theme);
  themeToggle.blur(); // evita que Space/flechas sigan operando el switch
});

let savedTheme = null;
try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignorar */ }
applyTheme(savedTheme === 'light' ? 'light' : 'dark');

init();
