"use strict";

(function () {
  const GRID = 20;
  const COLOR_ORDER = ["RED", "GREEN", "BLUE", "YELLOW", "WHITE", "PURPLE", "ORANGE"];
  const PALETTE = {
    RED: "#ef4444",
    GREEN: "#22c55e",
    BLUE: "#3b82f6",
    YELLOW: "#f59e0b",
    WHITE: "#e5e7eb",
    PURPLE: "#a855f7",
    ORANGE: "#f97316"
  };

  let numColors = 5;
  let grid = makeGrid(GRID, GRID);
  let tileSize = 24;
  let canvas = document.getElementById("gameCanvas");
  let ctx = canvas.getContext("2d");
  let offsetY = 0;
  let lastTime = 0;
  let elapsed = 0;
  let gameOver = false;
  let score = 0;
  let spaceDown = false;

  const scoreEl = document.getElementById("scoreValue");
  const toastEl = document.getElementById("toast");
  const newGameBtn = document.getElementById("newGameBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const colorCountInput = document.getElementById("colorCount");
  const colorCountLabel = document.getElementById("colorCountLabel");
  const applySettingsBtn = document.getElementById("applySettings");
  const closeSettingsBtn = document.getElementById("closeSettings");
  const overlay = document.getElementById("gameOverOverlay");
  const finalScoreEl = document.getElementById("finalScore");
  const restartBtn = document.getElementById("restartBtn");
  const container = document.getElementById("gameContainer");

  function randomRow() {
    const row = new Array(GRID);
    for (let c = 0; c < GRID; c++) {
      row[c] = 1 + Math.floor(Math.random() * numColors);
    }
    return row;
  }

  function makeGrid(rows, cols) {
    const g = new Array(rows);
    for (let r = 0; r < rows; r++) {
      g[r] = new Array(cols).fill(0);
    }
    return g;
  }

  function resize() {
    const rect = container.getBoundingClientRect();
    const availW = rect.width - 4;
    const availH = rect.height - 4;
    tileSize = Math.floor(Math.min(availW / GRID, availH / GRID));
    const w = tileSize * GRID;
    const h = tileSize * GRID;
    canvas.width = w;
    canvas.height = h;
  }

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // background
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, w, h);

    // blocks
    for (let r = 0; r < GRID; r++) {
      const yBase = r * tileSize - offsetY;
      for (let c = 0; c < GRID; c++) {
        const id = grid[r][c];
        if (id) {
          const name = COLOR_ORDER[id - 1];
          const col = PALETTE[name];
          const x = c * tileSize;
          const y = yBase;
          if (y > -tileSize && y < h) {
            ctx.fillStyle = col;
            ctx.fillRect(x + 1, y + 1, tileSize - 2, tileSize - 2);
            ctx.strokeStyle = "rgba(0,0,0,0.18)";
            ctx.strokeRect(x + 0.5, y + 0.5, tileSize - 1, tileSize - 1);
          }
        }
      }
    }

    // grid lines
    ctx.strokeStyle = "rgba(255,255,255,0.06)";
    ctx.lineWidth = 1;
    for (let r = 0; r <= GRID; r++) {
      const y = r * tileSize - offsetY;
      if (y >= 0 && y <= h) {
        ctx.beginPath();
        ctx.moveTo(0, Math.floor(y) + 0.5);
        ctx.lineTo(w, Math.floor(y) + 0.5);
        ctx.stroke();
      }
    }
    for (let c = 0; c <= GRID; c++) {
      const x = c * tileSize;
      ctx.beginPath();
      ctx.moveTo(Math.floor(x) + 0.5, 0);
      ctx.lineTo(Math.floor(x) + 0.5, h);
      ctx.stroke();
    }
  }

  function update(dt) {
    if (gameOver) return;

    elapsed += dt;

    // cells per second, ramping up over time
    let cellsPerSecond = 0.35 + elapsed * 0.015;
    if (spaceDown) cellsPerSecond *= 2.4;

    const pixelsPerSecond = cellsPerSecond * tileSize;
    offsetY += pixelsPerSecond * dt;

    if (offsetY >= tileSize) {
      // Reaching the top boundary with current top row
      const topHasBlocks = grid[0].some(v => v !== 0);
      if (topHasBlocks) {
        endGame();
        return;
      }
      offsetY -= tileSize;
      grid.shift();
      grid.push(randomRow());
    }
  }

  function getGroup(r0, c0) {
    const color = grid[r0][c0];
    if (!color) return [];
    const group = [];
    const seen = new Array(GRID);
    for (let r = 0; r < GRID; r++) seen[r] = new Array(GRID).fill(false);
    const q = [[r0, c0]];
    seen[r0][c0] = true;

    while (q.length) {
      const [r, c] = q.pop();
      group.push([r, c]);
      const n = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1]
      ];
      for (let i = 0; i < 4; i++) {
        const rr = n[i][0], cc = n[i][1];
        if (rr >= 0 && rr < GRID && cc >= 0 && cc < GRID && !seen[rr][cc] && grid[rr][cc] === color) {
          seen[rr][cc] = true;
          q.push([rr, cc]);
        }
      }
    }
    return group;
  }

  function applyGravity() {
    for (let c = 0; c < GRID; c++) {
      const stack = [];
      for (let r = GRID - 1; r >= 0; r--) {
        const v = grid[r][c];
        if (v) stack.push(v);
      }
      let rptr = GRID - 1;
      for (let i = 0; i < stack.length; i++) {
        grid[rptr][c] = stack[i];
        rptr--;
      }
      for (; rptr >= 0; rptr--) {
        grid[rptr][c] = 0;
      }
    }
  }

  function addScore(nRemoved) {
    const base = nRemoved * 10;
    const bonus = nRemoved >= 4 ? Math.floor(Math.pow(nRemoved - 3, 2) * 5) : 0;
    score += base + bonus;
    scoreEl.textContent = String(score);
    if (nRemoved >= 20) {
      showToast("+" + (base + bonus) + " (" + nRemoved + " removed)");
    }
  }

  function showToast(text) {
    toastEl.textContent = text;
    toastEl.classList.add("show");
    setTimeout(() => toastEl.classList.remove("show"), 2200);
  }

  function endGame() {
    gameOver = true;
    finalScoreEl.textContent = String(score);
    overlay.classList.add("show");
  }

  function newGame() {
    grid = makeGrid(GRID, GRID);
    offsetY = 0;
    elapsed = 0;
    score = 0;
    gameOver = false;
    scoreEl.textContent = "0";
    overlay.classList.remove("show");
  }

  function handleClick(ev) {
    if (gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const col = Math.floor(x / tileSize);
    const row = Math.floor((y + offsetY) / tileSize);
    if (row < 0 || row >= GRID || col < 0 || col >= GRID) return;
    const id = grid[row][col];
    if (!id) return;

    const group = getGroup(row, col);
    if (group.length >= 3) {
      for (let i = 0; i < group.length; i++) {
        grid[group[i][0]][group[i][1]] = 0;
      }
      applyGravity();
      addScore(group.length);
    }
  }

  function toggleSettings(open) {
    if (open) settingsModal.classList.add("open");
    else settingsModal.classList.remove("open");
  }

  // events
  newGameBtn.addEventListener("click", () => newGame());
  settingsBtn.addEventListener("click", () => toggleSettings(true));
  closeSettingsBtn.addEventListener("click", () => toggleSettings(false));
  applySettingsBtn.addEventListener("click", () => {
    numColors = parseInt(colorCountInput.value, 10);
    colorCountLabel.textContent = String(numColors);
    toggleSettings(false);
    newGame();
  });
  colorCountInput.addEventListener("input", () => {
    colorCountLabel.textContent = String(colorCountInput.value);
  });

  canvas.addEventListener("mousedown", handleClick);

  window.addEventListener("resize", resize);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      spaceDown = true;
      e.preventDefault();
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      spaceDown = false;
      e.preventDefault();
    }
  });

  // init
  colorCountLabel.textContent = String(numColors);
  resize();
  newGame();

  function loop(ts) {
    if (!lastTime) lastTime = ts;
    const dt = (ts - lastTime) / 1000;
    lastTime = ts;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();