/**
 * The fixed engine shell — the HTML scaffold that every generated game uses.
 *
 * Key idea: the LLM never generates this boilerplate. It only generates 3 functions
 * (initMechanic, updateMechanic, renderMechanic) that plug into this shell.
 * This makes evals reliable because the structure is always the same.
 *
 * The shell exposes window.__gameEval for Playwright-based evals:
 * - ready: boolean — set to true after initMechanic runs
 * - snapshot(): returns a deep copy of game state
 * - metrics: { collisions, pickups, scoreTicks } — incremented by mechanic code
 */

export const ENGINE_SHELL = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>3 Words to Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #111;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100vh;
      font-family: monospace;
      color: #fff;
      overflow: hidden;
    }
    #score-display {
      font-size: 24px;
      margin-bottom: 8px;
      letter-spacing: 2px;
    }
    #game-over {
      display: none;
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      font-size: 36px;
      color: #ff4444;
      text-shadow: 0 0 20px #ff4444;
      z-index: 10;
    }
    canvas {
      border: 1px solid #333;
      image-rendering: pixelated;
    }
  </style>
</head>
<body>
  <div id="score-display">SCORE: 0</div>
  <canvas id="game" width="800" height="600"></canvas>
  <div id="game-over">GAME OVER</div>

  <script>
    // ===== FIXED ENGINE — DO NOT MODIFY =====
    const canvas = document.getElementById("game");
    const ctx = canvas.getContext("2d");
    const scoreDisplay = document.getElementById("score-display");
    const gameOverDisplay = document.getElementById("game-over");

    const state = {
      tick: 0,
      score: 0,
      running: true,
      player: {},
      entities: []
    };

    // Input tracking
    const input = { keys: {} };
    window.addEventListener("keydown", (e) => { input.keys[e.key] = true; });
    window.addEventListener("keyup", (e) => { input.keys[e.key] = false; });

    // Eval instrumentation — Playwright reads this
    window.__gameEval = {
      ready: false,
      snapshot() {
        return JSON.parse(JSON.stringify(state));
      },
      metrics: {
        collisions: 0,
        pickups: 0,
        scoreTicks: 0
      }
    };

    // ===== MECHANIC CODE INSERTED HERE =====
    __MECHANIC_CODE__
    // ===== END MECHANIC CODE =====

    // Initialize
    try {
      initMechanic(state);
      window.__gameEval.ready = true;
      console.log("GAME_READY");
    } catch (err) {
      console.error("INIT_ERROR:", err.message);
    }

    // Game loop
    let lastTime = 0;
    function loop(timestamp) {
      if (!state.running) {
        gameOverDisplay.style.display = "block";
        return;
      }

      const dt = lastTime ? (timestamp - lastTime) / 1000 : 1/60;
      lastTime = timestamp;

      try {
        state.tick++;
        updateMechanic(state, input);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        renderMechanic(ctx, state);

        scoreDisplay.textContent = "SCORE: " + state.score;
      } catch (err) {
        console.error("LOOP_ERROR:", err.message);
        state.running = false;
      }

      requestAnimationFrame(loop);
    }

    requestAnimationFrame(loop);
  </script>
</body>
</html>`;
