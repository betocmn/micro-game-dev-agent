/**
 * Agent B — Mechanic Builder
 *
 * Takes a structured GameSpec and generates the 3 JavaScript functions
 * that plug into the fixed engine shell:
 * - initMechanic(state) — set up initial game state
 * - updateMechanic(state, input) — game logic per frame
 * - renderMechanic(ctx, state) — draw everything to canvas
 *
 * Key insight: the model never generates HTML, CSS, or boilerplate.
 * It only writes game logic within a strict contract. This makes evals
 * dramatically more reliable because the structure is always the same.
 */

import { chatCompletion, extractJSON } from "@/lib/openrouter";
import type { GameSpec } from "@/types";

function buildSystemPrompt(spec: GameSpec): string {
	return `You are implementing only the mechanic layer for a tiny 2D canvas game.

You must output valid JavaScript for exactly these three functions:
- initMechanic(state) — initialize game state (player position, entity arrays, etc.)
- updateMechanic(state, input) — game logic called every frame
- renderMechanic(ctx, state) — draw everything to the canvas

GAME SPEC:
${JSON.stringify(spec, null, 2)}

AVAILABLE STATE OBJECT:
{
  tick: number,        // frame counter (auto-incremented by engine)
  score: number,       // update this in updateMechanic
  running: boolean,    // set to false to end the game
  player: {},          // your player data goes here
  entities: []         // your entities go here
}

AVAILABLE INPUT OBJECT:
{
  keys: { "ArrowLeft": boolean, "ArrowRight": boolean, "ArrowUp": boolean, "ArrowDown": boolean }
}

CANVAS: 800x600 pixels, ctx is a CanvasRenderingContext2D.

EVAL INSTRUMENTATION — you can update these metrics in your code:
  window.__gameEval.metrics.collisions — increment on each collision
  window.__gameEval.metrics.pickups — increment on each pickup
  window.__gameEval.metrics.scoreTicks — increment each time score changes

HARD CONSTRAINTS:
- No external libraries
- No network access
- No DOM manipulation (canvas and score UI are handled by the engine)
- Must update state.score if score is relevant to the game
- Must keep state fully serializable (no functions, no DOM refs)
- Must work with keyboard controls only (arrow keys)
- Collision logic must be explicit (no physics engines)
- Lose condition must set state.running = false
- Player speed should be reasonable (3-6 pixels per frame)
- Spawn entities gradually, not all at once
- Use simple shapes (fillRect, arc, fillText) for rendering

OUTPUT FORMAT:
Return ONLY the three function definitions as JavaScript code.
No markdown fences, no explanations, no other text.
Start directly with: function initMechanic(state) {`;
}

export async function buildMechanic(
	apiKey: string,
	spec: GameSpec,
): Promise<string> {
	const response = await chatCompletion(apiKey, {
		messages: [
			{ role: "system", content: buildSystemPrompt(spec) },
			{
				role: "user",
				content: `Generate the three mechanic functions for "${spec.title}" (${spec.genre} genre). Remember: output ONLY JavaScript function definitions, nothing else.`,
			},
		],
		temperature: 0.3, // Lower temperature for more reliable code generation
		maxTokens: 4096,
	});

	// Extract code — handle markdown fences if present
	let code = response.trim();
	const fenceMatch = code.match(
		/```(?:javascript|js)?\s*\n?([\s\S]*?)\n?\s*```/,
	);
	if (fenceMatch) {
		code = fenceMatch[1].trim();
	}

	// Validate that all 3 functions exist
	if (!code.includes("function initMechanic")) {
		throw new Error("Generated code missing initMechanic function");
	}
	if (!code.includes("function updateMechanic")) {
		throw new Error("Generated code missing updateMechanic function");
	}
	if (!code.includes("function renderMechanic")) {
		throw new Error("Generated code missing renderMechanic function");
	}

	return code;
}
