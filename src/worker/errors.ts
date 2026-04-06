import type { GenerationFailureStage } from "@/types";

const FAILURE_STAGES = [
	"setup",
	"expanding",
	"building",
	"evaluating",
] as const;

export class HarnessStageError extends Error {
	constructor(
		message: string,
		public readonly failureStage: GenerationFailureStage,
	) {
		super(message);
		this.name = "HarnessStageError";
	}
}

export function isGenerationFailureStage(
	value: unknown,
): value is GenerationFailureStage {
	return FAILURE_STAGES.includes(value as (typeof FAILURE_STAGES)[number]);
}
