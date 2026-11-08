# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JS Tetris clone (HTML5 Canvas + CSS). No dependencies, no package.json, no bundler, no tests, no linter. README.md (in Spanish) documents controls and gameplay; UI strings in the code are also Spanish — keep new user-facing text in Spanish.

## Running

Open `index.html` directly, or serve the folder statically (preferred):

    python -m http.server 8000   # then http://localhost:8000

There is no build or test command; verify changes by playing in the browser.

## Architecture (game.js)

- Single script, loaded at the end of `<body>` in `index.html`, using `'use strict'` and module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, `animId`, …). `init()` resets all of it and is also the restart-button handler.
- **Type index = color index.** `PIECES[t]` shapes store the value `t` in their filled cells, and the board stores those same values, so `COLORS[cellValue]` is used directly when rendering. Index 0 / `null` means empty. Index 8 (`WILD`) is the wildcard cell created by the Tinte power-up; it lives only on the board and `randomPiece()` never produces it, so the `* 7` there stays. Adding a piece means adding matching entries to both `PIECES` and `COLORS` and updating the `* 7` in `randomPiece()`.
- `collide(shape, ox, oy)` is the only legality check; movement, rotation (`tryRotate` with kicks `[0,-1,1,-2,2]`), the ghost (`ghostY`), gravity and spawn game-over all go through it. Rows with `y < 0` are allowed (above the board).
- Locking pipeline: `lockPiece()` → `merge()` → `clearLines()` (updates score, level and `dropInterval = max(100, 1000 - (level-1)*90)`) → `spawn()` (game over if the new piece collides immediately).
- **Power-ups**: every `POWERUP_EVERY` lines `randomPiece()` returns a 1×1 piece with a `power` key (`POWERUPS` table) instead of a tetromino. `lockPiece()` calls `applyPowerUp()` instead of `merge()` for it. Freeze is the `freezeLeft` timer consumed in `loop()` (it only decrements while the loop runs, so pause doesn't burn it). `rowComplete()` is the line-completion rule (wildcards count double).
- `loop()` runs on `requestAnimationFrame` and accumulates `dropAccum` against `dropInterval`. Pause and game over stop it with `cancelAnimationFrame(animId)`; resuming calls `loop()` again with a fresh `lastTime`.
- One `#overlay` element is reused for both PAUSA and GAME OVER; its text is set in `togglePause()` and `endGame()`.
- HUD DOM updates only happen in `updateHUD()`.

## Coupled values

- `#board` canvas size in `index.html` must equal `COLS*BLOCK × ROWS*BLOCK` (300×600).
- `drawNext()` assumes a 4×4 preview grid with 30px cells, matching `#next-canvas` at 120×120.
- The control list in `index.html` and the README's controls table describe the keydown handler at the bottom of `game.js`; keep all three in sync.
