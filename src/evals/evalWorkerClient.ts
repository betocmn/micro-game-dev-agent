import type { z } from "zod";
import { evalSuiteResultSchema, evalWorkerRequestSchema } from "../lib/schemas";

const DEFAULT_EVAL_RUNNER_URL = "http://127.0.0.1:3000/api/evals/run";

export type EvalWorkerRequest = z.infer<typeof evalWorkerRequestSchema>;

export function resolveEvalRunnerUrl(explicitUrl?: string): string {
	return explicitUrl ?? process.env.EVAL_RUNNER_URL ?? DEFAULT_EVAL_RUNNER_URL;
}

export async function runEvalWorker(
	request: EvalWorkerRequest,
	options: {
		fetchImpl?: typeof fetch;
		url?: string;
	} = {},
) {
	const payload = evalWorkerRequestSchema.parse(request);
	const fetchImpl = options.fetchImpl ?? fetch;
	const response = await fetchImpl(resolveEvalRunnerUrl(options.url), {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
		signal: AbortSignal.timeout(60000),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`Eval worker error (${response.status}): ${errorText}`);
	}

	const json = await response.json();
	return evalSuiteResultSchema.parse(json);
}
