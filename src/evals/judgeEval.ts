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
import type { GameSpec, JudgeEvalResult, RuntimeEvalResult, InteractionEvalResult } from "@/types";

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
  interactionResult: InteractionEvalResult
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
  const result: JudgeEvalResult = JSON.parse(json);

  // Validate scores are in range
  for (const key of ["genreMatch", "mechanicMatch", "goalMatch", "controlsMatch", "coherence"] as const) {
    if (typeof result[key] !== "number" || result[key] < 1 || result[key] > 5) {
      result[key] = 3; // Default to middle score if invalid
    }
  }

  return result;
}
