import type { z } from "zod";
import {
	evaluateRunRequestSchema,
	evaluateRunResponseSchema,
	generateRunRequestSchema,
	generateRunResponseSchema,
	materializeRunResponseSchema,
} from "@/lib/schemas";
import { HarnessStageError, isGenerationFailureStage } from "./errors";

const DEFAULT_HARNESS_WORKER_URL = "http://127.0.0.1:3200";

export type HarnessGenerateRequest = z.infer<typeof generateRunRequestSchema>;
export type HarnessMaterializeRequest = z.infer<typeof generateRunRequestSchema>;
export type HarnessEvaluateRequest = z.infer<typeof evaluateRunRequestSchema>;

export function resolveHarnessWorkerUrl(explicitUrl?: string): string {
	return (
		explicitUrl ?? process.env.HARNESS_WORKER_URL ?? DEFAULT_HARNESS_WORKER_URL
	);
}

async function postJson<T>(
	pathname: string,
	payload: unknown,
	schema: z.ZodType<T>,
	options: {
		fetchImpl?: typeof fetch;
		url?: string;
	},
): Promise<T> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const response = await fetchImpl(
		`${resolveHarnessWorkerUrl(options.url)}${pathname}`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
			signal: AbortSignal.timeout(120000),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();

		try {
			const parsedError = JSON.parse(errorText) as {
				error?: unknown;
				failureStage?: unknown;
			};

			if (
				typeof parsedError.error === "string" &&
				isGenerationFailureStage(parsedError.failureStage)
			) {
				throw new HarnessStageError(
					parsedError.error,
					parsedError.failureStage,
				);
			}

			if (typeof parsedError.error === "string") {
				throw new Error(
					`Harness worker error (${response.status}): ${parsedError.error}`,
				);
			}
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				throw error;
			}
		}

		throw new Error(`Harness worker error (${response.status}): ${errorText}`);
	}

	return schema.parse(await response.json());
}

export async function runHarnessWorker(
	request: HarnessGenerateRequest,
	options: {
		fetchImpl?: typeof fetch;
		url?: string;
	} = {},
) {
	const payload = generateRunRequestSchema.parse(request);
	return postJson(
		"/runs/generate",
		payload,
		generateRunResponseSchema,
		options,
	);
}

export async function runHarnessMaterialization(
	request: HarnessMaterializeRequest,
	options: {
		fetchImpl?: typeof fetch;
		url?: string;
	} = {},
) {
	const payload = generateRunRequestSchema.parse(request);
	return postJson(
		"/runs/materialize",
		payload,
		materializeRunResponseSchema,
		options,
	);
}

export async function runHarnessEvaluation(
	request: HarnessEvaluateRequest,
	options: {
		fetchImpl?: typeof fetch;
		url?: string;
	} = {},
) {
	const payload = evaluateRunRequestSchema.parse(request);
	return postJson(
		"/runs/evaluate",
		payload,
		evaluateRunResponseSchema,
		options,
	);
}
