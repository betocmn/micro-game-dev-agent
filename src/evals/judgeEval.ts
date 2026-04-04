/**
 * Eval 3 — Spec-Match Judge (LLM-as-Judge)
 *
 * Feeds the original spec, generated code, and runtime/interaction
 * results back to an LLM and asks it to score how well the game
 * matches the intended spec.
 *
 * This catches what automated evals miss: a game might run fine
 * and respond to input, but be completely wrong for what was asked.
 * ("space dodge rocks" shouldn't produce a coin collector.)
 *
 * Scores 1-5 on each dimension, returns structured JSON.
 */

import { chatCompletion, extractJSON } from "@/lib/openrouter";
import { judgeEvalResultSchema } from "@/lib/schemas";
import type {
	GameSpec,
	InteractionEvalResult,
	JudgeEvalResult,
	RuntimeEvalResult,
} from "@/types";

const JUDGE_SYSTEM_PROMPT = `You are grading whether a generated game matches its intended spec.
You will receive the original prompt, the expanded spec, the generated mechanic code,
and summaries of automated runtime and interaction evals.

Score each dimension 1-5 where:
1 = completely wrong
2 = barely related
3 = partially matches
4 = mostly matches
5 = perfect match

Return ONLY valid JSON matching this schema:
{
  "genreMatch": 1-5,
  "mechanicMatch": 1-5,
  "goalMatch": 1-5,
  "controlsMatch": 1-5,
  "coherence": 1-5,
  "summary": string (2-3 sentences),
  "criticalMisses": string[] (what's wrong or missing)
}`;

export async function runJudgeEval(
	apiKey: string,
	prompt: string,
	spec: GameSpec,
	mechanicCode: string,
	runtimeResult: RuntimeEvalResult,
	interactionResult: InteractionEvalResult,
): Promise<JudgeEvalResult> {
	const userMessage = `
ORIGINAL PROMPT: "${prompt}"

EXPANDED SPEC:
${JSON.stringify(spec, null, 2)}

GENERATED MECHANIC CODE:
${mechanicCode}

RUNTIME EVAL RESULT:
- Pass: ${runtimeResult.pass}
- Errors: ${runtimeResult.errors.length > 0 ? runtimeResult.errors.join(", ") : "none"}
- Ready: ${runtimeResult.readySeen}

INTERACTION EVAL RESULT:
- Pass: ${interactionResult.pass}
- Duration: ${interactionResult.durationMs}ms
- Frames observed: ${interactionResult.framesObserved}
- State changed: ${interactionResult.stateChanged}
- Score changed: ${interactionResult.scoreChanged}
- Crashed: ${interactionResult.crashed}

Score how well this game matches the spec.`;

	const response = await chatCompletion(apiKey, {
		messages: [
			{ role: "system", content: JUDGE_SYSTEM_PROMPT },
			{ role: "user", content: userMessage },
		],
		temperature: 0.2, // Low temperature for consistent scoring
		maxTokens: 1024,
	});

	const json = extractJSON(response);
	const parsed = JSON.parse(json) as Partial<JudgeEvalResult>;
	const normalizedResult: JudgeEvalResult = {
		genreMatch:
			typeof parsed.genreMatch === "number" &&
			parsed.genreMatch >= 1 &&
			parsed.genreMatch <= 5
				? Math.round(parsed.genreMatch)
				: 3,
		mechanicMatch:
			typeof parsed.mechanicMatch === "number" &&
			parsed.mechanicMatch >= 1 &&
			parsed.mechanicMatch <= 5
				? Math.round(parsed.mechanicMatch)
				: 3,
		goalMatch:
			typeof parsed.goalMatch === "number" &&
			parsed.goalMatch >= 1 &&
			parsed.goalMatch <= 5
				? Math.round(parsed.goalMatch)
				: 3,
		controlsMatch:
			typeof parsed.controlsMatch === "number" &&
			parsed.controlsMatch >= 1 &&
			parsed.controlsMatch <= 5
				? Math.round(parsed.controlsMatch)
				: 3,
		coherence:
			typeof parsed.coherence === "number" &&
			parsed.coherence >= 1 &&
			parsed.coherence <= 5
				? Math.round(parsed.coherence)
				: 3,
		summary:
			typeof parsed.summary === "string" && parsed.summary.length > 0
				? parsed.summary
				: "Judge response was incomplete.",
		criticalMisses: Array.isArray(parsed.criticalMisses)
			? parsed.criticalMisses.filter(
					(miss): miss is string => typeof miss === "string",
				)
			: [],
	};

	return judgeEvalResultSchema.parse(normalizedResult);
}
