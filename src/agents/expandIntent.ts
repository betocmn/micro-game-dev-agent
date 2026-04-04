/**
 * Agent A — Intent Expander
 *
 * Takes a vague 3-word prompt like "space dodge rocks" and expands it
 * into a structured GameSpec JSON. This is the "understanding what a
 * teenager means" problem from the Lemonade job ad.
 *
 * Key design choice: this is a structured-output call, not a freeform agent.
 * We constrain the output to a specific JSON schema so downstream steps
 * (mechanic builder, evals) have a reliable contract to work with.
 */

import { chatCompletion, extractJSON } from "@/lib/openrouter";
import type { GameSpec } from "@/types";

const SYSTEM_PROMPT = `You interpret vague teenager prompts into a minimal browser-game spec.
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
- Entities should be simple shapes (rectangles, circles) described by the visualStyle
- acceptanceTests should be 3-5 concrete, testable statements about game behavior
- The game runs on an 800x600 canvas`;

export async function expandIntent(
	apiKey: string,
	prompt: string,
): Promise<GameSpec> {
	const response = await chatCompletion(apiKey, {
		messages: [
			{ role: "system", content: SYSTEM_PROMPT },
			{ role: "user", content: prompt },
		],
		temperature: 0.7,
		maxTokens: 1024,
	});

	const json = extractJSON(response);
	const spec: GameSpec = JSON.parse(json);

	// Basic validation
	if (!spec.title || !spec.genre || !spec.entities?.length) {
		throw new Error("Invalid GameSpec: missing required fields");
	}

	return spec;
}
