// Rising Blocks Game - animated spawn and gravity, slower speed, new field size

(function () {
  'use strict';

  // DOM
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const newGameBtn = document.getElementById('newGameBtn');
  const settingsBtn = document.getElementById('settingsBtn');
  const scoreEl = document.getElementById('scoreValue');
  const gameOverEl = document.getElementById('gameOver');
  const bonusToast = document.getElementById('bonusToast');

  const settingsModal = document.getElementById('settingsModal');
  const colorCountInput = document.getElementById('colorCount');
  const colorCountVal = document.getElementById('colorCountVal');
  const initialSpeedInput = document.getElementById('initialSpeed');
  const initialSpeedVal = document.getElementById('initialSpeedVal');
  const applySettingsBtn = document.getElementById('applySettingsBtn');
  const closeSettingsBtn = document.getElementById('closeSettingsBtn');

  // Game state
  let nextId = 1;
  const state = {
    cols: 24,
    rows: 16,
    grid: [],
    colorsCount: 5,
    palette: [],
    score: 0,
    running: false,
    boosting: false,
    // speed control (slower by ~50%)
    intervalMs: 3200,
    initialIntervalMs: 3200,
    minIntervalMs: 600,
    rampStepMs: 6,
    speedBoostFactor: 0.35, // lower is faster while space is held
    spawnTimer: null,
    // rendering and animation
    cell: 24,
    orientation: null,
    animFrameId: null
  };

  // Utils
  function makePalette(n) {
    const arr = [];
    for (let i = 0; i < n; i++) {
      const hue = Math.round((360 / n) * i);
      arr.push(`hsl(${hue}, 68%, 54%)`);
    }
    return arr;
  }

  function setOrientationByViewport() {
    const o = (window.innerWidth >= window.innerHeight) ? 'landscape' : 'portrait';
    const changed = o !== state.orientation;
    state.orientation = o;
    if (o === 'landscape') {
      state.cols = 24;
      state.rows = 16;
    } else {
      state.cols = 16;
      state.rows = 24;
    }
    return changed;
  }

  function resetGrid() {
    state.grid = [];
    for (let y = 0; y < state.rows; y++) {
      const row = new Array(state.cols).fill(null);
      state.grid.push(row);
    }
  }

  function createBlock(x, y, color) {
    return {
      id: nextId++,
      x, y,
      color,
      px: x * state.cell,
      py: y * state.cell,
      vy: 0
    };
  }

  function resizeCanvas() {
    const container = document.querySelector('.game');
    const availableW = container.clientWidth - 8;  // padding allowance
    const availableH = container.clientHeight - 8;
    const size = Math.floor(Math.min(availableW / state.cols, availableH / state.rows));
    state.cell = Math.max(size, 8);
    canvas.width = state.cols * state.cell;
    canvas.height = state.rows * state.cell;
    // snap current block positions to grid on resize for simplicity
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        const b = state.grid[y][x];
        if (b) {
          b.px = b.x * state.cell;
          b.py = b.y * state.cell; // reset animation progress after resize
          b.vy = 0;
        }
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cw = state.cell;

    // draw grid background subtly
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw blocks
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        const b = state.grid[y][x];
        if (!b) continue;

        // draw block at animated position
        ctx.fillStyle = state.palette[b.color % state.palette.length];
        ctx.fillRect(b.x * cw, b.py, cw, cw);

        // subtle inner shading
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(b.x * cw, b.py, cw, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(b.x * cw, b.py + cw - 4, cw, 4);
      }
    }

    // grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= state.cols; x++) {
      ctx.beginPath();
      ctx.moveTo(x * cw + 0.5, 0);
      ctx.lineTo(x * cw + 0.5, state.rows * cw);
      ctx.stroke();
    }
    for (let y = 0; y <= state.rows; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * cw + 0.5);
      ctx.lineTo(state.cols * cw, y * cw + 0.5);
      ctx.stroke();
    }
  }

  function updateAnimations() {
    const cw = state.cell;
    const g = 0.09 * cw;         // gravity acceleration
    const maxVy = 0.85 * cw;     // terminal fall speed
    const riseSpeed = 0.22 * cw; // spawn/upward slide speed

    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        const b = state.grid[y][x];
        if (!b) continue;

        const targetPy = b.y * cw;
        const dy = targetPy - b.py;

        if (Math.abs(dy) < 0.5) {
          b.py = targetPy;
          b.vy = 0;
          continue;
        }

        if (dy > 0) {
          // falling towards target
          b.vy = Math.min(maxVy, b.vy + g);
          b.py = Math.min(targetPy, b.py + b.vy);
        } else {
          // rising/upward slide by spawn
          b.vy = -riseSpeed;
          b.py = Math.max(targetPy, b.py + b.vy);
        }
      }
    }
  }

  function updateScoreUI() {
    scoreEl.textContent = String(state.score);
  }

  function showBonusToast(message) {
    bonusToast.textContent = message;
    bonusToast.classList.add('show');
    setTimeout(() => {
      bonusToast.classList.remove('show');
    }, 1700);
  }

  function gameOver() {
    state.running = false;
    if (state.spawnTimer) {
      clearTimeout(state.spawnTimer);
      state.spawnTimer = null;
    }
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
    gameOverEl.classList.remove('hidden');
  }

  // Gravity (animated)
  function applyGravityAnimated() {
    for (let x = 0; x < state.cols; x++) {
      const stack = [];
      // collect existing blocks in this column from bottom up
      for (let y = state.rows - 1; y >= 0; y--) {
        const b = state.grid[y][x];
        if (b) stack.push(b);
      }
      // place them compactly from bottom
      let i = 0;
      for (let y = state.rows - 1; y >= 0; y--) {
        const newBlock = (i < stack.length) ? stack[i++] : null;
        state.grid[y][x] = newBlock;
        if (newBlock) {
          // update logical position (target), leave py for animation
          newBlock.x = x;
          if (newBlock.y !== y) {
            newBlock.y = y;
            // keep current py; updateAnimations will animate towards y*cell
          }
        }
      }
    }
  }

  // Spawning (animated slide from bottom, push others up one cell)
  function spawnRow() {
    const newGrid = [];
    for (let y = 0; y < state.rows; y++) {
      newGrid.push(new Array(state.cols).fill(null));
    }

    // push everything up one row (y decreases by 1)
    for (let y = 0; y < state.rows - 1; y++) {
      for (let x = 0; x < state.cols; x++) {
        const b = state.grid[y + 1][x];
        newGrid[y][x] = b;
        if (b) {
          // logical move up
          b.x = x;
          b.y = y;
          // keep py to animate upward slide (from old position one cell down)
          // b.py stays as before, updateAnimations will move it up to y*cell
        }
      }
    }

    // create new bottom row emerging from below
    const bottomY = state.rows - 1;
    for (let x = 0; x < state.cols; x++) {
      let b = null;
      if (Math.random() < 0.75) {
        b = createBlock(x, bottomY, Math.floor(Math.random() * state.colorsCount));
        // start slightly below canvas to "slide in"
        b.py = canvas.height + Math.random() * (state.cell * 0.6);
      }
      newGrid[bottomY][x] = b;
    }

    state.grid = newGrid;

    // compact columns (some gaps may appear due to spawning)
    applyGravityAnimated();

    // game over if top row has any blocks
    for (let x = 0; x < state.cols; x++) {
      if (state.grid[0][x]) {
        gameOver();
        break;
      }
    }
  }

  function scheduleNextTick() {
    if (!state.running) return;
    if (state.spawnTimer) {
      clearTimeout(state.spawnTimer);
    }
    let delay = Math.max(state.minIntervalMs, state.intervalMs);
    if (state.boosting) {
      delay = Math.max(120, Math.floor(delay * state.speedBoostFactor));
    }
    state.spawnTimer = setTimeout(() => {
      if (!state.running) return;
      spawnRow();
      // ramp up speed slowly
      state.intervalMs = Math.max(state.minIntervalMs, state.intervalMs - state.rampStepMs);
      scheduleNextTick();
    }, delay);
  }

  // Interaction - click to remove groups
  function inBounds(x, y) {
    return x >= 0 && x < state.cols && y >= 0 && y < state.rows;
  }

  function neighbors(x, y) {
    return [
      [x + 1, y], [x - 1, y],
      [x, y + 1], [x, y - 1]
    ];
  }

  function collectGroup(x0, y0, color) {
    const seen = new Set();
    const q = [[x0, y0]];
    seen.add(`${x0},${y0}`);

    while (q.length) {
      const [x, y] = q.pop();
      for (const [nx, ny] of neighbors(x, y)) {
        if (!inBounds(nx, ny)) continue;
        const key = `${nx},${ny}`;
        if (seen.has(key)) continue;
        const b = state.grid[ny][nx];
        if (b && b.color === color) {
          seen.add(key);
          q.push([nx, ny]);
        }
      }
    }
    return seen;
  }

  function computeScore(size) {
    const base = size * 10;
    const bonus = size >= 3 ? Math.floor((size - 2) * (size - 2) * 2) : 0;
    return { base, bonus, total: base + bonus };
  }

  function handleCanvasClick(ev) {
    if (!state.running) return;

    const rect = canvas.getBoundingClientRect();
    const cx = ev.clientX - rect.left;
    const cy = ev.clientY - rect.top;
    const x = Math.floor(cx / state.cell);
    const y = Math.floor(cy / state.cell);
    if (!inBounds(x, y)) return;

    const b = state.grid[y][x];
    if (!b) return;

    const group = collectGroup(x, y, b.color);
    const size = group.size;
    if (size < 3) return;

    // remove group
    for (const key of group) {
      const [gx, gy] = key.split(',').map(Number);
      const rb = state.grid[gy][gx];
      if (rb) {
        state.grid[gy][gx] = null;
        // no longer rendered
      }
    }

    // apply animated gravity
    applyGravityAnimated();

    // scoring
    const s = computeScore(size);
    state.score += s.total;
    updateScoreUI();

    if (size >= 20) {
      showBonusToast(`Removed ${size} blocks! +${s.bonus} bonus`);
    }
  }

  // Settings modal
  function openSettings() {
    colorCountVal.textContent = String(colorCountInput.value);
    initialSpeedVal.textContent = String(initialSpeedInput.value);
    settingsModal.classList.remove('hidden');
  }

  function closeSettings() {
    settingsModal.classList.add('hidden');
  }

  function applySettings() {
    const newColors = parseInt(colorCountInput.value, 10);
    const newInitial = parseInt(initialSpeedInput.value, 10);
    state.colorsCount = newColors;
    state.palette = makePalette(state.colorsCount);
    state.initialIntervalMs = newInitial;
    // start a fresh game to apply changes
    startNewGame();
    closeSettings();
  }

  function startLoop() {
    if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
    const step = () => {
      if (!state.running) return;
      updateAnimations();
      render();
      state.animFrameId = requestAnimationFrame(step);
    };
    state.animFrameId = requestAnimationFrame(step);
  }

  // New game
  function startNewGame() {
    setOrientationByViewport();
    state.score = 0;
    updateScoreUI();
    gameOverEl.classList.add('hidden');

    state.palette = makePalette(state.colorsCount);
    state.intervalMs = state.initialIntervalMs;

    resetGrid();
    resizeCanvas();

    state.running = true;
    startLoop();
    scheduleNextTick();
  }

  // Events
  canvas.addEventListener('click', handleCanvasClick);

  newGameBtn.addEventListener('click', () => {
    startNewGame();
  });

  settingsBtn.addEventListener('click', () => openSettings());
  applySettingsBtn.addEventListener('click', () => applySettings());
  closeSettingsBtn.addEventListener('click', () => closeSettings());

  colorCountInput.addEventListener('input', () => {
    colorCountVal.textContent = String(colorCountInput.value);
  });
  initialSpeedInput.addEventListener('input', () => {
    initialSpeedVal.textContent = String(initialSpeedInput.value);
  });

  window.addEventListener('resize', () => {
    const changed = setOrientationByViewport();
    if (changed) {
      // adopt new board size on orientation change
      startNewGame();
    } else {
      resizeCanvas();
    }
  });

  // Spacebar speed boost
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (!state.boosting) {
        state.boosting = true;
        // reschedule with faster interval
        scheduleNextTick();
      }
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      if (state.boosting) {
        state.boosting = false;
        scheduleNextTick();
      }
    }
  });

  // Start
  setOrientationByViewport();
  state.palette = makePalette(state.colorsCount);
  startNewGame();
})();