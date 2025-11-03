// Rising Blocks Game - continuous rising, animated gravity, new field size

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
    // speed control: intervalMs is the time (ms) to rise one cell height
    intervalMs: 6400,
    initialIntervalMs: 6400,
    minIntervalMs: 600,
    rampStepMs: 6,          // speed ramps up by reducing intervalMs by 6ms per row added
    speedBoostFactor: 0.35, // while space is held, interval is multiplied by this factor
    // rendering and animation
    cell: 24,
    orientation: null,
    animFrameId: null,
    lastTs: 0,
    riseOffsetPx: 0         // accumulated upward offset in pixels since last logical row shift
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
    const availableW = container.clientWidth - 8;
    const availableH = container.clientHeight - 8;
    // include one extra visual row so the next row is visible while sliding in
    const size = Math.floor(Math.min(availableW / state.cols, availableH / (state.rows + 1)));
    state.cell = Math.max(size, 8);
    canvas.width = state.cols * state.cell;
    canvas.height = (state.rows + 1) * state.cell;

    // snap positions after resize
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        const b = state.grid[y][x];
        if (b) {
          b.px = b.x * state.cell;
          b.py = b.y * state.cell;
          b.vy = 0;
        }
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const cw = state.cell;

    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw blocks using continuous rising offset
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        const b = state.grid[y][x];
        if (!b) continue;

        const drawY = b.py - state.riseOffsetPx;

        ctx.fillStyle = state.palette[b.color % state.palette.length];
        ctx.fillRect(b.x * cw, drawY, cw, cw);

        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(b.x * cw, drawY, cw, 4);
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(b.x * cw, drawY + cw - 4, cw, 4);
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
    const g = 0.09 * cw;
    const maxVy = 0.85 * cw;
    const riseSpeed = 0.22 * cw;

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
          b.vy = Math.min(maxVy, b.vy + g);
          b.py = Math.min(targetPy, b.py + b.vy);
        } else {
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
      for (let y = state.rows - 1; y >= 0; y--) {
        const b = state.grid[y][x];
        if (b) stack.push(b);
      }
      let i = 0;
      for (let y = state.rows - 1; y >= 0; y--) {
        const nb = (i < stack.length) ? stack[i++] : null;
        state.grid[y][x] = nb;
        if (nb) {
          nb.x = x;
          if (nb.y !== y) nb.y = y;
        }
      }
    }
  }

  // Shift grid logically up by one cell and spawn a new bottom row
  function shiftUpAndSpawn() {
    const cw = state.cell;

    const newGrid = [];
    for (let y = 0; y < state.rows; y++) {
      newGrid.push(new Array(state.cols).fill(null));
    }

    for (let y = 0; y < state.rows - 1; y++) {
      for (let x = 0; x < state.cols; x++) {
        const b = state.grid[y + 1][x];
        newGrid[y][x] = b;
        if (b) {
          b.x = x;
          b.y = y;
        }
      }
    }

    const bottomY = state.rows - 1;
    for (let x = 0; x < state.cols; x++) {
      const b = createBlock(x, bottomY, Math.floor(Math.random() * state.colorsCount));
      // start below the field so it's visible in the preview band and slides up
      b.py = (bottomY + 1) * cw + Math.random() * (cw * 0.6);
      newGrid[bottomY][x] = b;
    }

    state.grid = newGrid;

    applyGravityAnimated();

    // ramp speed
    state.intervalMs = Math.max(state.minIntervalMs, state.intervalMs - state.rampStepMs);

    // check for game over (top row occupied)
    for (let x = 0; x < state.cols; x++) {
      if (state.grid[0][x]) {
        gameOver();
        return;
      }
    }
  }

  // Initial bottom row to begin rising immediately
  function seedBottomRow() {
    const cw = state.cell;
    const y = state.rows - 1;
    for (let x = 0; x < state.cols; x++) {
      const b = createBlock(x, y, Math.floor(Math.random() * state.colorsCount));
      // start below and slide in
      b.py = (y + 1) * cw + Math.random() * (cw * 0.6);
      state.grid[y][x] = b;
    }
    applyGravityAnimated();
  }

  function updateRising(dtMs) {
    if (!state.running) return;
    const cw = state.cell;
    const effectiveInterval = state.boosting ? Math.max(120, state.intervalMs * state.speedBoostFactor) : state.intervalMs;
    const pxPerMs = cw / effectiveInterval; // rise one cell per intervalMs
    state.riseOffsetPx += pxPerMs * dtMs;

    // game over if any block visually reaches the top
    for (let y = 0; y < state.rows; y++) {
      for (let x = 0; x < state.cols; x++) {
        const b = state.grid[y][x];
        if (!b) continue;
        const drawY = b.py - state.riseOffsetPx;
        if (drawY <= 0) {
          gameOver();
          return;
        }
      }
    }

    // when we've risen a full cell, rebase and logically shift up
    while (state.riseOffsetPx >= cw && state.running) {
      state.riseOffsetPx -= cw;
      // keep visual continuity: lower b.py by one cell
      for (let yy = 0; yy < state.rows; yy++) {
        for (let xx = 0; xx < state.cols; xx++) {
          const b = state.grid[yy][xx];
          if (b) b.py -= cw;
        }
      }
      shiftUpAndSpawn();
    }
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
    // account for continuous rising offset in click mapping
    const y = Math.floor((cy + state.riseOffsetPx) / state.cell);
    if (!inBounds(x, y)) return;

    const b = state.grid[y][x];
    if (!b) return;

    const group = collectGroup(x, y, b.color);
    const size = group.size;
    if (size < 3) return;

    for (const key of group) {
      const [gx, gy] = key.split(',').map(Number);
      const rb = state.grid[gy][gx];
      if (rb) state.grid[gy][gx] = null;
    }

    applyGravityAnimated();

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
    startNewGame();
    closeSettings();
  }

  function startLoop() {
    if (state.animFrameId) cancelAnimationFrame(state.animFrameId);
    state.lastTs = performance.now();
    const step = () => {
      if (!state.running) return;
      const now = performance.now();
      const dt = now - state.lastTs;
      state.lastTs = now;

      updateAnimations();
      updateRising(dt);
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

    state.riseOffsetPx = 0;

    // seed initial bottom content so rising starts visually
    seedBottomRow();

    state.running = true;
    startLoop();
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
      startNewGame();
    } else {
      resizeCanvas();
    }
  });

  // Spacebar speed boost
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      state.boosting = true;
    }
  });
  document.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      e.preventDefault();
      state.boosting = false;
    }
  });

  // Start
  setOrientationByViewport();
  state.palette = makePalette(state.colorsCount);
  startNewGame();
})();