const COLS = 10;
const ROWS = 20;
const STORAGE_KEY = "tetris-best-score";

const PIECES = {
  I: { color: "#58d9e7", glow: "#b2f7ff", shape: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]] },
  O: { color: "#f3d469", glow: "#fff0a8", shape: [[1, 1], [1, 1]] },
  T: { color: "#a687ff", glow: "#d4c7ff", shape: [[0, 1, 0], [1, 1, 1], [0, 0, 0]] },
  S: { color: "#7cda8a", glow: "#c1ffca", shape: [[0, 1, 1], [1, 1, 0], [0, 0, 0]] },
  Z: { color: "#ff777d", glow: "#ffb9bc", shape: [[1, 1, 0], [0, 1, 1], [0, 0, 0]] },
  J: { color: "#6b9cff", glow: "#b9ceff", shape: [[1, 0, 0], [1, 1, 1], [0, 0, 0]] },
  L: { color: "#ffad62", glow: "#ffd0a6", shape: [[0, 0, 1], [1, 1, 1], [0, 0, 0]] },
};
const PIECE_KEYS = Object.keys(PIECES);
const LINE_SCORES = [0, 100, 300, 500, 800];

const boardCanvas = document.querySelector("#game-board");
const boardContext = boardCanvas.getContext("2d");
const nextCanvas = document.querySelector("#next-piece");
const nextContext = nextCanvas.getContext("2d");
const mobileNextCanvas = document.querySelector("#next-piece-mobile");
const mobileNextContext = mobileNextCanvas.getContext("2d");
const startScreen = document.querySelector("#start-screen");
const pauseScreen = document.querySelector("#pause-screen");
const gameoverScreen = document.querySelector("#gameover-screen");
const toast = document.querySelector("#toast");

const state = {
  board: createBoard(),
  current: null,
  nextType: randomType(),
  score: 0,
  lines: 0,
  level: 1,
  status: "menu",
  dropTimer: 0,
  lastTime: 0,
  boardSize: { width: 300, height: 600 },
  soundOn: true,
};

function createBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function randomType() {
  return PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function createPiece(type = state.nextType) {
  const piece = PIECES[type];
  const shape = cloneMatrix(piece.shape);
  return {
    type,
    shape,
    x: Math.floor((COLS - shape[0].length) / 2),
    y: 0,
  };
}

function resetGame() {
  state.board = createBoard();
  state.current = null;
  state.nextType = randomType();
  state.score = 0;
  state.lines = 0;
  state.level = 1;
  state.dropTimer = 0;
  updateStats();
  spawnPiece();
  state.status = "playing";
  updateStatus("PLAYING");
  hideModal(gameoverScreen);
  hideModal(pauseScreen);
  hideModal(startScreen);
  state.lastTime = performance.now();
  playTone("start");
  requestRender();
}

function spawnPiece() {
  state.current = createPiece();
  state.nextType = randomType();
  drawNextPiece();
  if (collides(state.board, state.current)) {
    endGame();
  }
}

function collides(board, piece, offsetX = 0, offsetY = 0, shape = piece.shape) {
  for (let row = 0; row < shape.length; row += 1) {
    for (let col = 0; col < shape[row].length; col += 1) {
      if (!shape[row][col]) continue;
      const x = piece.x + col + offsetX;
      const y = piece.y + row + offsetY;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
}

function movePiece(distance) {
  if (state.status !== "playing" || !state.current) return false;
  if (!collides(state.board, state.current, distance, 0)) {
    state.current.x += distance;
    requestRender();
    return true;
  }
  return false;
}

function rotateMatrix(matrix) {
  return matrix[0].map((_, column) => matrix.map((row) => row[column]).reverse());
}

function rotatePiece() {
  if (state.status !== "playing" || !state.current) return;
  const rotated = rotateMatrix(state.current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides(state.board, state.current, kick, 0, rotated)) {
      state.current.shape = rotated;
      state.current.x += kick;
      playTone("rotate");
      requestRender();
      return;
    }
  }
}

function softDrop() {
  if (state.status !== "playing" || !state.current) return;
  if (!collides(state.board, state.current, 0, 1)) {
    state.current.y += 1;
    state.score += 1;
    updateStats();
    requestRender();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  if (state.status !== "playing" || !state.current) return;
  let distance = 0;
  while (!collides(state.board, state.current, 0, distance + 1)) distance += 1;
  state.current.y += distance;
  state.score += distance * 2;
  lockPiece();
}

function lockPiece() {
  const { current } = state;
  if (!current) return;
  current.shape.forEach((row, rowIndex) => {
    row.forEach((filled, columnIndex) => {
      if (!filled) return;
      const y = current.y + rowIndex;
      const x = current.x + columnIndex;
      if (y >= 0 && y < ROWS && x >= 0 && x < COLS) state.board[y][x] = current.type;
    });
  });
  playTone("lock");
  const cleared = clearLines();
  if (cleared > 0) {
    state.score += LINE_SCORES[cleared] * state.level;
    state.lines += cleared;
    const previousLevel = state.level;
    state.level = Math.floor(state.lines / 10) + 1;
    if (state.level > previousLevel) showToast(`LEVEL ${String(state.level).padStart(2, "0")} · SPEED UP`);
    playTone(cleared === 4 ? "tetris" : "clear");
  }
  updateStats();
  spawnPiece();
  requestRender();
}

function clearLines() {
  let cleared = 0;
  state.board = state.board.filter((row) => {
    if (row.every(Boolean)) {
      cleared += 1;
      return false;
    }
    return true;
  });
  while (state.board.length < ROWS) state.board.unshift(Array(COLS).fill(null));
  return cleared;
}

function dropInterval() {
  return Math.max(95, 850 - (state.level - 1) * 70);
}

function update(time = 0) {
  if (state.status === "playing") {
    const elapsed = time - state.lastTime;
    state.lastTime = time;
    state.dropTimer += elapsed;
    if (state.dropTimer >= dropInterval()) {
      state.dropTimer = 0;
      if (!collides(state.board, state.current, 0, 1)) state.current.y += 1;
      else lockPiece();
    }
    drawGame();
  } else {
    state.lastTime = time;
    drawGame();
  }
  requestAnimationFrame(update);
}

function getGhostPiece() {
  if (!state.current) return null;
  const ghost = { ...state.current, shape: state.current.shape };
  while (!collides(state.board, ghost, 0, 1)) ghost.y += 1;
  return ghost;
}

function drawGame() {
  const { width, height } = state.boardSize;
  boardContext.clearRect(0, 0, width, height);
  boardContext.fillStyle = "#0a1020";
  boardContext.fillRect(0, 0, width, height);
  const cellWidth = width / COLS;
  const cellHeight = height / ROWS;

  boardContext.strokeStyle = "rgba(160, 184, 220, 0.08)";
  boardContext.lineWidth = 1;
  for (let x = 1; x < COLS; x += 1) {
    boardContext.beginPath();
    boardContext.moveTo(x * cellWidth, 0);
    boardContext.lineTo(x * cellWidth, height);
    boardContext.stroke();
  }
  for (let y = 1; y < ROWS; y += 1) {
    boardContext.beginPath();
    boardContext.moveTo(0, y * cellHeight);
    boardContext.lineTo(width, y * cellHeight);
    boardContext.stroke();
  }

  state.board.forEach((row, rowIndex) => row.forEach((type, columnIndex) => {
    if (type) drawCell(boardContext, columnIndex, rowIndex, cellWidth, cellHeight, PIECES[type], false);
  }));

  if (state.current && state.status === "playing") {
    const ghost = getGhostPiece();
    if (ghost) drawPiece(boardContext, ghost, cellWidth, cellHeight, true);
    drawPiece(boardContext, state.current, cellWidth, cellHeight, false);
  }
}

function drawPiece(context, piece, cellWidth, cellHeight, ghost) {
  piece.shape.forEach((row, rowIndex) => row.forEach((filled, columnIndex) => {
    if (!filled) return;
    const x = piece.x + columnIndex;
    const y = piece.y + rowIndex;
    if (y >= 0) drawCell(context, x, y, cellWidth, cellHeight, PIECES[piece.type], ghost);
  }));
}

function drawCell(context, column, row, cellWidth, cellHeight, piece, ghost = false) {
  const padding = Math.max(2, Math.min(cellWidth, cellHeight) * 0.075);
  const x = column * cellWidth + padding;
  const y = row * cellHeight + padding;
  const width = cellWidth - padding * 2;
  const height = cellHeight - padding * 2;
  context.save();
  if (ghost) {
    context.fillStyle = `${piece.color}25`;
    context.strokeStyle = `${piece.color}85`;
    context.lineWidth = 1;
    context.fillRect(x, y, width, height);
    context.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);
  } else {
    const gradient = context.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, piece.glow);
    gradient.addColorStop(0.28, piece.color);
    gradient.addColorStop(1, piece.color);
    context.fillStyle = gradient;
    context.shadowColor = `${piece.color}88`;
    context.shadowBlur = 8;
    roundRect(context, x, y, width, height, Math.min(4, padding + 1));
    context.fill();
    context.shadowBlur = 0;
    context.fillStyle = "rgba(255,255,255,0.2)";
    context.fillRect(x + 2, y + 2, width - 4, Math.max(1, height * 0.08));
  }
  context.restore();
}

function roundRect(context, x, y, width, height, radius) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
}

function drawNextPiece() {
  drawPreview(nextContext, nextCanvas, state.nextType);
  drawPreview(mobileNextContext, mobileNextCanvas, state.nextType);
}

function drawPreview(context, canvas, type) {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth || canvas.width;
  const height = canvas.clientHeight || canvas.height;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);
  const piece = PIECES[type];
  const cell = Math.min(27, Math.min(width / (piece.shape[0].length + 2), height / (piece.shape.length + 1)));
  const offsetX = (width - piece.shape[0].length * cell) / 2;
  const offsetY = (height - piece.shape.length * cell) / 2;
  piece.shape.forEach((row, rowIndex) => row.forEach((filled, columnIndex) => {
    if (!filled) return;
    drawCell(context, offsetX / cell + columnIndex, offsetY / cell + rowIndex, cell, cell, piece, false);
  }));
}

function resizeBoard() {
  const rect = boardCanvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  state.boardSize = { width: rect.width, height: rect.height };
  boardCanvas.width = rect.width * ratio;
  boardCanvas.height = rect.height * ratio;
  boardContext.setTransform(ratio, 0, 0, ratio, 0, 0);
  drawNextPiece();
  requestRender();
}

function updateStats() {
  setText("score-value", formatNumber(state.score));
  setText("level-value", String(state.level).padStart(2, "0"));
  setText("lines-value", String(state.lines).padStart(2, "0"));
  const best = getBestScore();
  setText("best-score", formatNumber(best));
  setText("start-best-score", formatNumber(best));
}

function updateStatus(label) {
  setText("status-label", label);
}

function formatNumber(number) {
  return String(number).padStart(6, "0");
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function getBestScore() {
  return Number(localStorage.getItem(STORAGE_KEY) || 0);
}

function endGame() {
  state.status = "gameover";
  const best = getBestScore();
  const isNewBest = state.score > best;
  if (isNewBest) localStorage.setItem(STORAGE_KEY, String(state.score));
  setText("final-score", formatNumber(state.score));
  setText("final-level", String(state.level).padStart(2, "0"));
  setText("final-lines", String(state.lines).padStart(2, "0"));
  document.querySelector("#new-best").classList.toggle("is-hidden", !isNewBest);
  updateStats();
  updateStatus("GAME OVER");
  showModal(gameoverScreen);
  playTone("gameover");
}

function togglePause() {
  if (state.status === "playing") {
    state.status = "paused";
    updateStatus("PAUSED");
    showModal(pauseScreen);
    playTone("pause");
  } else if (state.status === "paused") {
    resumeGame();
  }
}

function resumeGame() {
  if (state.status !== "paused") return;
  state.status = "playing";
  state.lastTime = performance.now();
  updateStatus("PLAYING");
  hideModal(pauseScreen);
  playTone("start");
}

function goHome() {
  state.status = "menu";
  state.current = null;
  updateStatus("READY");
  hideModal(pauseScreen);
  hideModal(gameoverScreen);
  showModal(startScreen);
  updateStats();
  requestRender();
}

function showModal(element) { element.classList.remove("is-hidden"); }
function hideModal(element) { element.classList.add("is-hidden"); }
function requestRender() { drawGame(); }

let toastTimer;
function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 1700);
}

let audioContext;
function playTone(kind) {
  if (!state.soundOn) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    const frequencies = { start: 320, rotate: 480, lock: 150, clear: 620, tetris: 840, pause: 240, gameover: 90 };
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = kind === "gameover" ? "sine" : "triangle";
    oscillator.frequency.value = frequencies[kind] || 300;
    gain.gain.setValueAtTime(0.035, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + (kind === "tetris" ? 0.24 : 0.1));
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + (kind === "tetris" ? 0.24 : 0.1));
  } catch {
    // Audio is an optional enhancement; gameplay should work without it.
  }
}

function handleAction(action) {
  if (action === "left") movePiece(-1);
  if (action === "right") movePiece(1);
  if (action === "down") softDrop();
  if (action === "rotate") rotatePiece();
  if (action === "drop") hardDrop();
}

document.querySelector("#start-button").addEventListener("click", resetGame);
document.querySelector("#restart-button").addEventListener("click", resetGame);
document.querySelector("#resume-button").addEventListener("click", resumeGame);
document.querySelector("#pause-restart-button").addEventListener("click", resetGame);
document.querySelector("#pause-home-button").addEventListener("click", goHome);
document.querySelector("#home-button").addEventListener("click", goHome);
document.querySelector("#pause-button").addEventListener("click", togglePause);
document.querySelector("#mobile-pause-button").addEventListener("click", togglePause);
document.querySelector("#sound-toggle").addEventListener("click", (event) => {
  state.soundOn = !state.soundOn;
  event.currentTarget.setAttribute("aria-pressed", String(state.soundOn));
  event.currentTarget.querySelector(".sound-label").textContent = state.soundOn ? "SOUND ON" : "SOUND OFF";
  showToast(state.soundOn ? "SOUND ON" : "SOUND OFF");
  if (state.soundOn) playTone("start");
});

document.querySelectorAll("[data-action]").forEach((button) => {
  button.addEventListener("click", () => handleAction(button.dataset.action));
});

document.addEventListener("keydown", (event) => {
  const key = event.key;
  if (["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp", " ", "Escape"].includes(key)) event.preventDefault();
  if (key === "p" || key === "P" || key === "Escape") {
    togglePause();
    return;
  }
  if ((key === "r" || key === "R") && state.status === "gameover") {
    resetGame();
    return;
  }
  const actions = { ArrowLeft: "left", ArrowRight: "right", ArrowDown: "down", ArrowUp: "rotate", " ": "drop" };
  if (actions[key]) handleAction(actions[key]);
});

window.addEventListener("resize", resizeBoard);

updateStats();
resizeBoard();
drawNextPiece();
requestAnimationFrame(update);
