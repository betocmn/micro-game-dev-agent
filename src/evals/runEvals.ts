/**
 * Eval Runner — orchestrates all 3 evals and computes summary score.
 *
 * Weighted scoring:
 * - Runtime: 35% (binary — 35 or 0)
 * - Interaction: 35% (binary — 35 or 0)
 * - Judge: 30% (average of 5 scores, normalized to 0-30)
 *
 * Hard fail: if runtime fails, summary score is 0 regardless of other evals.
 *
 * This is designed to be called from a Convex action. Each eval result
 * is saved independently so the frontend can show progress.
 */

import type {
	EvalSuiteResult,
	GameSpec,
	InteractionEvalResult,
	JudgeEvalResult,
	RuntimeEvalResult,
} from "@/types";
import { runInteractionEval } from "./interactionEval";
import { runJudgeEval } from "./judgeEval";
import { runRuntimeEval } from "./runtimeEval";

export async function runAllEvals(
	apiKey: string,
	prompt: string,
	spec: GameSpec,
	mechanicCode: string,
	html: string,
): Promise<EvalSuiteResult> {
	// Eval 1: Runtime sanity
	const runtime: RuntimeEvalResult = await runRuntimeEval(html);

	// Hard fail — if runtime doesn't pass, skip other evals
	if (!runtime.pass) {
		const defaultInteraction: InteractionEvalResult = {
			pass: false,
			durationMs: 0,
			framesObserved: 0,
			stateChanged: false,
			scoreChanged: false,
			crashed: true,
		};
		const defaultJudge: JudgeEvalResult = {
			genreMatch: 1,
			mechanicMatch: 1,
			goalMatch: 1,
			controlsMatch: 1,
			coherence: 1,
			summary: "Game failed to load — cannot evaluate.",
			criticalMisses: ["Game did not reach ready state"],
		};
		return {
			runtime,
			interaction: defaultInteraction,
			judge: defaultJudge,
			summaryScore: 0,
		};
	}

	// Eval 2: Interaction survival
	const interaction: InteractionEvalResult = await runInteractionEval(html);

	// Eval 3: Judge (LLM-as-judge)
	const judge: JudgeEvalResult = await runJudgeEval(
		apiKey,
		prompt,
		spec,
		mechanicCode,
		runtime,
		interaction,
	);

	// Compute summary score
	const runtimeScore = runtime.pass ? 35 : 0;
	const interactionScore = interaction.pass ? 35 : 0;
	const judgeAvg =
		(judge.genreMatch +
			judge.mechanicMatch +
			judge.goalMatch +
			judge.controlsMatch +
			judge.coherence) /
		5;
	const judgeScore = Math.round((judgeAvg / 5) * 30); // Normalize to 0-30

	const summaryScore = runtimeScore + interactionScore + judgeScore;

	return { runtime, interaction, judge, summaryScore };
}
