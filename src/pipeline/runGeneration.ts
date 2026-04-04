/**
 * Pipeline orchestrator — chains the 3 steps together.
 *
 * vaguePrompt → expandIntent (LLM) → GameSpec
 *            → buildMechanic (LLM) → mechanicCode
 *            → compileGame (deterministic) → HTML
 *
 * This runs inside a Convex action. Each step updates the generation
 * status so the frontend can show progress in real-time.
 */

import { buildMechanic } from "@/agents/buildMechanic";
import { expandIntent } from "@/agents/expandIntent";
import { compileGame } from "@/compile/compileGame";
import type { PipelineResult } from "@/types";

export async function runGenerationPipeline(
	apiKey: string,
	prompt: string,
): Promise<PipelineResult> {
	// Step 1: Expand the vague prompt into a structured spec
	const spec = await expandIntent(apiKey, prompt);

	// Step 2: Generate the mechanic code from the spec
	const mechanicCode = await buildMechanic(apiKey, spec);

	// Step 3: Compile into a playable HTML file
	const html = compileGame(mechanicCode);

	return { spec, mechanicCode, html };
}
