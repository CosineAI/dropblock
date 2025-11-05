"use strict";

(function () {
  // Grid dimensions (customizable)
  let gridWidth = 16;   // default width per request
  let gridHeight = 20;  // default height

  const COLOR_ORDER = ["RED", "GREEN", "BLUE", "YELLOW", "WHITE"];
  const PALETTE = {
    RED: "#ef4444",
    GREEN: "#22c55e",
    BLUE: "#3b82f6",
    YELLOW: "#f59e0b",
    WHITE: "#e5e7eb"
  };

  let numColors = 5;
  let grid = makeGrid(gridHeight + 1, gridWidth); // extra buffer row for continuous entrance
  let fallOffsets = makeGrid(gridHeight + 1, gridWidth); // per-cell falling animation offsets
  let tileSize = 24;
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  let offsetY = 0;
  let lastTime = 0;
  let elapsed = 0;
  let gameOver = false;
  let score = 0;
  let spaceDown = false;
  let falling = false;

  const scoreEl = document.getElementById("scoreValue");
  const toastEl = document.getElementById("toast");
  const newGameBtn = document.getElementById("newGameBtn");
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsModal = document.getElementById("settingsModal");
  const difficultySelect = document.getElementById("difficulty");
  const gridWidthInput = document.getElementById("gridWidth");
  const gridWidthLabel = document.getElementById("gridWidthLabel");
  const gridHeightInput = document.getElementById("gridHeight");
  const gridHeightLabel = document.getElementById("gridHeightLabel");
  const applySettingsBtn = document.getElementById("applySettings");
  const closeSettingsBtn = document.getElementById("closeSettings");
  const overlay = document.getElementById("gameOverOverlay");
  const finalScoreEl = document.getElementById("finalScore");
  const restartBtn = document.getElementById("restartBtn");
  const container = document.getElementById("gameContainer");

  function randomRow() {
    const row = new Array(gridWidth);
    for (let c = 0; c < gridWidth; c++) {
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
    const availW = Math.floor(rect.width) - 4;
    const availH = Math.floor(rect.height) - 4;
    tileSize = Math.floor(Math.min(availW / gridWidth, availH / gridHeight));
    const w = tileSize * gridWidth;
    const h = tileSize * gridHeight;
    canvas.width = w;
    canvas.height = h;
  }

  function draw() {
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // ensure no canvas-level shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = "transparent";

    // background
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, w, h);

    // blocks (integer-aligned to avoid spacing jitter)
    for (let r = 0; r < grid.length; r++) {
      const yBase = r * tileSize - offsetY;
      for (let c = 0; c < gridWidth; c++) {
        const id = grid[r][c];
        if (!id) continue;
        const name = COLOR_ORDER[id - 1];
        const col = PALETTE[name];
        const x = c * tileSize;
        const y = yBase + (fallOffsets[r][c] || 0);
        if (y > -tileSize && y < h) {
          const xi = Math.floor(x);
          const yi = Math.floor(y);
          ctx.fillStyle = col;
          ctx.fillRect(xi, yi, tileSize, tileSize);
        }
      }
    }

    // light gray borders between blocks (slightly darker to reduce sharpness)
    ctx.fillStyle = "#9ca3af";
    // horizontal lines across visible field
    for (let r = 0; r <= gridHeight; r++) {
      const y = Math.floor(r * tileSize - offsetY);
      if (y >= 0 && y <= h) {
        ctx.fillRect(0, y, w, 1);
      }
    }
    // vertical lines across visible field
    for (let c = 0; c <= gridWidth; c++) {
      const x = Math.floor(c * tileSize);
      ctx.fillRect(x, 0, 1, h);
    }
  }

  function update(dt) {
    if (gameOver) return;

    elapsed += dt;

    // slower ramp-up (half of previous ramp), with low baseline speed
    let cellsPerSecond = 0.0625 * (0.35 + elapsed * 0.0075);
    if (spaceDown) cellsPerSecond *= 2.4;

    const pixelsPerSecond = cellsPerSecond * tileSize;
    offsetY += pixelsPerSecond * dt;

    if (offsetY >= tileSize) {
      offsetY -= tileSize;

      // advance rows for continuous entrance
      grid.shift();
      fallOffsets.shift();
      grid.push(randomRow());
      fallOffsets.push(new Array(gridWidth).fill(0));

      // game over as soon as any block reaches the top
      if (grid[0].some(v => v !== 0)) {
        endGame();
        return;
      }
    }

    // falling animation update
    if (falling) {
      let anyFalling = false;
      const fallSpeed = tileSize * 14; // pixels/sec
      for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < gridWidth; c++) {
          const off = fallOffsets[r][c];
          if (off < 0) {
            let next = off + fallSpeed * dt;
            if (next >= 0) next = 0;
            fallOffsets[r][c] = next;
            if (next < 0) anyFalling = true;
          }
        }
      }
      if (!anyFalling) {
        falling = false;
      }
    }
  }

  function getGroup(r0, c0) {
    const color = grid[r0][c0];
    if (!color) return [];
    const group = [];
    const seen = new Array(grid.length);
    for (let r = 0; r < grid.length; r++) seen[r] = new Array(gridWidth).fill(false);
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
        if (rr >= 0 && rr < grid.length && cc >= 0 && cc < gridWidth && !seen[rr][cc] && grid[rr][cc] === color) {
          seen[rr][cc] = true;
          q.push([rr, cc]);
        }
      }
    }
    return group;
  }

  function applyGravityAnimated() {
    // Compute gravity across entire grid and set per-cell falling offsets
    const newCol = new Array(grid.length);
    for (let c = 0; c < gridWidth; c++) {
      // collect nonzero tiles with their original rows
      const stack = [];
      for (let r = grid.length - 1; r >= 0; r--) {
        const v = grid[r][c];
        if (v) stack.push({ v, r });
      }
      // write back from bottom up
      let rptr = grid.length - 1;
      for (let i = 0; i < stack.length; i++) {
        const item = stack[i];
        grid[rptr][c] = item.v;
        const drop = item.r - rptr;
        fallOffsets[rptr][c] = drop > 0 ? -drop * tileSize : 0;
        rptr--;
      }
      // fill rest as zero
      for (; rptr >= 0; rptr--) {
        grid[rptr][c] = 0;
        fallOffsets[rptr][c] = 0;
      }
    }
    falling = true;
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
    grid = makeGrid(gridHeight + 1, gridWidth);
    fallOffsets = makeGrid(gridHeight + 1, gridWidth);
    // seed visible bottom 4 rows with blocks
    const seedRows = Math.min(4, gridHeight);
    for (let i = 0; i < seedRows; i++) {
      grid[gridHeight - 1 - i] = randomRow();
    }
    // seed incoming buffer row off-canvas
    grid[gridHeight] = randomRow();

    offsetY = 0;
    elapsed = 0;
    score = 0;
    gameOver = false;
    falling = false;
    scoreEl.textContent = "0";
    overlay.classList.remove("show");
    resize();
  }

  function handleClick(ev) {
    if (gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const y = ev.clientY - rect.top;
    const col = Math.floor(x / tileSize);
    const row = Math.floor((y + offsetY) / tileSize);
    if (row < 0 || row >= grid.length || col < 0 || col >= gridWidth) return;
    const id = grid[row][col];
    if (!id) return;

    const group = getGroup(row, col);
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++) {
        grid[group[i][0]][group[i][1]] = 0;
      }
      applyGravityAnimated();
      addScore(group.length);
    }
  }

  function toggleSettings(open) {
    if (open) settingsModal.classList.add("open");
    else settingsModal.classList.remove("open");
  }

  // events
  newGameBtn.addEventListener("click", () => newGame());
  restartBtn.addEventListener("click", () => newGame());
  settingsBtn.addEventListener("click", () => toggleSettings(true));
  closeSettingsBtn.addEventListener("click", () => toggleSettings(false));
  applySettingsBtn.addEventListener("click", () => {
    numColors = parseInt(difficultySelect.value, 10);

    const w = Math.min(30, Math.max(8, parseInt(gridWidthInput.value, 10)));
    const h = Math.min(30, Math.max(10, parseInt(gridHeightInput.value, 10)));
    gridWidth = w;
    gridHeight = h;
    gridWidthLabel.textContent = String(gridWidth);
    gridHeightLabel.textContent = String(gridHeight);

    toggleSettings(false);
    newGame();
  });
  gridWidthInput.addEventListener("input", () => {
    gridWidthLabel.textContent = String(gridWidthInput.value);
  });
  gridHeightInput.addEventListener("input", () => {
    gridHeightLabel.textContent = String(gridHeightInput.value);
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
  gridWidthLabel.textContent = String(gridWidth);
  gridHeightLabel.textContent = String(gridHeight);
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