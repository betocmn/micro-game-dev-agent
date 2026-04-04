/**
 * Convex functions for the generation pipeline.
 *
 * Architecture:
 * - Mutations: write to DB (enqueue, update status, save eval results)
 * - Queries: read from DB (list all, get one + its eval runs)
 * - Actions: nondeterministic work (call LLMs via OpenRouter)
 *
 * Note: Convex actions run in Convex's own Node runtime, so they can't
 * import from src/ via path aliases. Instead, we inline the OpenRouter
 * calls and prompt logic here. The src/ modules are for the CLI test
 * script and any non-Convex usage.
 */

import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalAction,
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";

// === LLM HELPER (duplicated from src/lib/openrouter.ts for Convex runtime) ===

async function chatCompletion(
	apiKey: string,
	messages: Array<{ role: string; content: string }>,
	options: { temperature?: number; maxTokens?: number } = {},
): Promise<string> {
	const { temperature = 0.7, maxTokens = 4096 } = options;

	const response = await fetch(
		"https://openrouter.ai/api/v1/chat/completions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
				"HTTP-Referer": "https://3words.game",
				"X-Title": "3 Words to Game",
			},
			body: JSON.stringify({
				model: "anthropic/claude-sonnet-4",
				messages,
				temperature,
				max_tokens: maxTokens,
			}),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenRouter API error (${response.status}): ${errorText}`);
	}

	const data = (await response.json()) as {
		choices: Array<{ message: { content: string } }>;
	};
	const content = data.choices?.[0]?.message?.content;
	if (!content) throw new Error("No content in OpenRouter response");
	return content;
}

function extractJSON(text: string): string {
	const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
	if (fenceMatch) return fenceMatch[1].trim();
	return text.trim();
}

// === ENGINE SHELL (duplicated for Convex runtime) ===

const ENGINE_SHELL = `<!DOCTYPE html>
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

    const input = { keys: {} };
    window.addEventListener("keydown", (e) => { input.keys[e.key] = true; });
    window.addEventListener("keyup", (e) => { input.keys[e.key] = false; });

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

    __MECHANIC_CODE__

    try {
      initMechanic(state);
      window.__gameEval.ready = true;
      console.log("GAME_READY");
    } catch (err) {
      console.error("INIT_ERROR:", err.message);
    }

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

// === PROMPT TEMPLATES ===

const EXPAND_SYSTEM_PROMPT = `You interpret vague teenager prompts into a minimal browser-game spec.
Assume the user is underspecified, not confused.
Stay inside a tiny 2D game space.
Prefer one primary mechanic over many.
Return ONLY valid JSON, no other text.

Allowed genres:
- dodge
- collect
- survive
- platform

Your output must match this exact schema:
{
  "title": string,
  "genre": "dodge" | "collect" | "survive" | "platform",
  "theme": string,
  "playerGoal": string,
  "controls": string[],
  "entities": [{ "name": string, "role": "player" | "enemy" | "pickup" | "hazard" }],
  "coreLoop": string,
  "winCondition": string,
  "loseCondition": string,
  "scoreRule": string,
  "visualStyle": string,
  "acceptanceTests": string[]
}

Rules:
- Keep controls to arrow keys only (ArrowLeft, ArrowRight, ArrowUp, ArrowDown)
- Entities should be simple shapes described by the visualStyle
- acceptanceTests should be 3-5 concrete, testable statements
- The game runs on an 800x600 canvas`;

function buildMechanicSystemPrompt(spec: string): string {
	return `You are implementing only the mechanic layer for a tiny 2D canvas game.

You must output valid JavaScript for exactly these three functions:
- initMechanic(state) — initialize game state
- updateMechanic(state, input) — game logic called every frame
- renderMechanic(ctx, state) — draw everything to the canvas

GAME SPEC:
${spec}

AVAILABLE STATE: { tick, score, running, player: {}, entities: [] }
AVAILABLE INPUT: { keys: { "ArrowLeft": bool, "ArrowRight": bool, "ArrowUp": bool, "ArrowDown": bool } }
CANVAS: 800x600 pixels, ctx is CanvasRenderingContext2D.

EVAL INSTRUMENTATION:
  window.__gameEval.metrics.collisions — increment on collision
  window.__gameEval.metrics.pickups — increment on pickup
  window.__gameEval.metrics.scoreTicks — increment when score changes

HARD CONSTRAINTS:
- No external libraries
- No network access
- No DOM manipulation
- Must update state.score
- Must keep state serializable
- Keyboard controls only (arrow keys)
- Collision logic must be explicit
- Lose condition must set state.running = false
- Player speed: 3-6 pixels per frame
- Spawn entities gradually
- Use simple shapes (fillRect, arc, fillText)

OUTPUT: ONLY the three function definitions as JavaScript code. No markdown fences, no explanations.
Start with: function initMechanic(state) {`;
}

// === MUTATIONS ===

export const enqueueGeneration = mutation({
	args: { prompt: v.string() },
	handler: async (ctx, { prompt }) => {
		const id = await ctx.db.insert("generations", {
			prompt,
			status: "queued",
		});
		await ctx.scheduler.runAfter(0, internal.generations.runPipeline, {
			generationId: id,
		});
		return id;
	},
});

export const updateGeneration = internalMutation({
	args: {
		generationId: v.id("generations"),
		fields: v.object({
			status: v.optional(
				v.union(
					v.literal("queued"),
					v.literal("expanding"),
					v.literal("building"),
					v.literal("compiling"),
					v.literal("evaluating"),
					v.literal("done"),
					v.literal("failed"),
				),
			),
			spec: v.optional(v.string()),
			mechanicCode: v.optional(v.string()),
			html: v.optional(v.string()),
			summaryScore: v.optional(v.float64()),
			runtimePass: v.optional(v.boolean()),
			interactionPass: v.optional(v.boolean()),
			judgeScore: v.optional(v.float64()),
			error: v.optional(v.string()),
		}),
	},
	handler: async (ctx, { generationId, fields }) => {
		await ctx.db.patch(generationId, fields);
	},
});

export const saveEvalResult = internalMutation({
	args: {
		generationId: v.id("generations"),
		type: v.union(
			v.literal("runtime"),
			v.literal("interaction"),
			v.literal("judge"),
		),
		status: v.union(
			v.literal("queued"),
			v.literal("running"),
			v.literal("done"),
			v.literal("failed"),
		),
		result: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		await ctx.db.insert("evalRuns", args);
	},
});

// === QUERIES ===

export const listGenerations = query({
	args: {},
	handler: async (ctx) => {
		return await ctx.db.query("generations").order("desc").take(50);
	},
});

export const getGeneration = query({
	args: { generationId: v.id("generations") },
	handler: async (ctx, { generationId }) => {
		const generation = await ctx.db.get(generationId);
		if (!generation) return null;

		const evalRuns = await ctx.db
			.query("evalRuns")
			.withIndex("by_generation", (q) => q.eq("generationId", generationId))
			.collect();

		return { ...generation, evalRuns };
	},
});

export const getGenerationInternal = internalQuery({
	args: { generationId: v.id("generations") },
	handler: async (ctx, { generationId }) => {
		return await ctx.db.get(generationId);
	},
});

// === PIPELINE ACTION ===

export const runPipeline = internalAction({
	args: { generationId: v.id("generations") },
	handler: async (ctx, { generationId }) => {
		const apiKey = process.env.OPENROUTER_API_KEY;
		if (!apiKey) {
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: {
					status: "failed" as const,
					error: "OPENROUTER_API_KEY not configured",
				},
			});
			return;
		}

		try {
			// Read the prompt
			const generation = await ctx.runQuery(
				internal.generations.getGenerationInternal,
				{
					generationId,
				},
			);
			if (!generation) throw new Error("Generation not found");

			// Step 1: Expand intent
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "expanding" as const },
			});

			const specResponse = await chatCompletion(
				apiKey,
				[
					{ role: "system", content: EXPAND_SYSTEM_PROMPT },
					{ role: "user", content: generation.prompt },
				],
				{ temperature: 0.7, maxTokens: 1024 },
			);
			const specJson = extractJSON(specResponse);
			const spec = JSON.parse(specJson);

			if (!spec.title || !spec.genre || !spec.entities?.length) {
				throw new Error("Invalid GameSpec from LLM");
			}

			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "building" as const, spec: specJson },
			});

			// Step 2: Build mechanic
			const mechanicResponse = await chatCompletion(
				apiKey,
				[
					{ role: "system", content: buildMechanicSystemPrompt(specJson) },
					{
						role: "user",
						content: `Generate the three mechanic functions for "${spec.title}" (${spec.genre} genre). Output ONLY JavaScript function definitions.`,
					},
				],
				{ temperature: 0.3, maxTokens: 4096 },
			);

			let mechanicCode = mechanicResponse.trim();
			const fenceMatch = mechanicCode.match(
				/```(?:javascript|js)?\s*\n?([\s\S]*?)\n?\s*```/,
			);
			if (fenceMatch) mechanicCode = fenceMatch[1].trim();

			if (!mechanicCode.includes("function initMechanic")) {
				throw new Error("Generated code missing initMechanic");
			}

			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "compiling" as const, mechanicCode },
			});

			// Step 3: Compile
			const html = ENGINE_SHELL.replace("__MECHANIC_CODE__", mechanicCode);

			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "done" as const, html },
			});
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			await ctx.runMutation(internal.generations.updateGeneration, {
				generationId,
				fields: { status: "failed" as const, error: errorMessage },
			});
		}
	},
});
