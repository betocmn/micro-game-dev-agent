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
// Transport budgets need to exceed the sequential stage timers inside the worker.
const DEFAULT_REQUEST_TIMEOUT_MS = 300000;
const MATERIALIZE_REQUEST_TIMEOUT_MS = 480000;
const EVALUATE_REQUEST_TIMEOUT_MS = 300000;
const GENERATE_REQUEST_TIMEOUT_MS = 720000;

export type HarnessGenerateRequest = z.infer<typeof generateRunRequestSchema>;
export type HarnessMaterializeRequest = z.infer<
	typeof generateRunRequestSchema
>;
export type HarnessEvaluateRequest = z.infer<typeof evaluateRunRequestSchema>;

export function resolveHarnessWorkerUrl(explicitUrl?: string): string {
	return (
		explicitUrl ?? process.env.HARNESS_WORKER_URL ?? DEFAULT_HARNESS_WORKER_URL
	);
}

function isAbortLikeError(error: unknown): boolean {
	if (!error || typeof error !== "object" || !("name" in error)) {
		return false;
	}

	const name = (error as { name: unknown }).name;
	return name === "AbortError" || name === "TimeoutError";
}

async function postJson<T>(
	pathname: string,
	payload: unknown,
	schema: z.ZodType<T>,
	options: {
		fetchImpl?: typeof fetch;
		timeoutMs?: number;
		url?: string;
	},
): Promise<T> {
	const fetchImpl = options.fetchImpl ?? fetch;
	const timeoutMs = options.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
	let response: Response;

	try {
		response = await fetchImpl(
			`${resolveHarnessWorkerUrl(options.url)}${pathname}`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
				signal: AbortSignal.timeout(timeoutMs),
			},
		);
	} catch (error) {
		if (isAbortLikeError(error)) {
			throw new Error(`Harness worker request timed out after ${timeoutMs}ms.`);
		}

		throw error;
	}

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
	return postJson("/runs/generate", payload, generateRunResponseSchema, {
		...options,
		timeoutMs: GENERATE_REQUEST_TIMEOUT_MS,
	});
}

export async function runHarnessMaterialization(
	request: HarnessMaterializeRequest,
	options: {
		fetchImpl?: typeof fetch;
		url?: string;
	} = {},
) {
	const payload = generateRunRequestSchema.parse(request);
	return postJson("/runs/materialize", payload, materializeRunResponseSchema, {
		...options,
		timeoutMs: MATERIALIZE_REQUEST_TIMEOUT_MS,
	});
}

export async function runHarnessEvaluation(
	request: HarnessEvaluateRequest,
	options: {
		fetchImpl?: typeof fetch;
		url?: string;
	} = {},
) {
	const payload = evaluateRunRequestSchema.parse(request);
	return postJson("/runs/evaluate", payload, evaluateRunResponseSchema, {
		...options,
		timeoutMs: EVALUATE_REQUEST_TIMEOUT_MS,
	});
}
