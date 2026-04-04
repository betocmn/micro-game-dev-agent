import type { GenerationFailureStage, GenerationStatus } from "../types";

export const STATUS_COLORS: Record<GenerationStatus, string> = {
	queued: "bg-gray-600",
	expanding: "bg-blue-600 animate-pulse",
	building: "bg-purple-600 animate-pulse",
	compiling: "bg-indigo-600 animate-pulse",
	evaluating: "bg-yellow-600 animate-pulse",
	done: "bg-green-600",
	failed: "bg-red-600",
};

export const STATUS_LABELS: Record<GenerationStatus, string> = {
	queued: "Queued",
	expanding: "Expanding intent...",
	building: "Building mechanic...",
	compiling: "Compiling game...",
	evaluating: "Running evals...",
	done: "Done",
	failed: "Failed",
};

const FAILURE_STAGE_LABELS: Record<GenerationFailureStage, string> = {
	setup: "setup",
	expanding: "intent expansion",
	building: "mechanic generation",
	compiling: "game compilation",
	evaluating: "eval worker",
};

export function formatFailureStage(
	stage: GenerationFailureStage | undefined,
): string | null {
	if (!stage) {
		return null;
	}

	return FAILURE_STAGE_LABELS[stage];
}
