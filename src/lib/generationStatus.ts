import type { GenerationFailureStage, GenerationStatus } from "../types";

export const STATUS_COLORS: Record<GenerationStatus, string> = {
	queued: "bg-gray-600",
	expanding: "bg-blue-600 animate-pulse",
	building: "bg-purple-600 animate-pulse",
	evaluating: "bg-yellow-600 animate-pulse",
	done: "bg-green-600",
	failed: "bg-red-600",
};

export const STATUS_LABELS: Record<GenerationStatus, string> = {
	queued: "Queued",
	expanding: "Planning Roblox spec...",
	building: "Authoring scaffold...",
	evaluating: "Running proxy evals...",
	done: "Done",
	failed: "Failed",
};

const FAILURE_STAGE_LABELS: Record<GenerationFailureStage, string> = {
	setup: "setup",
	expanding: "spec planning",
	building: "scaffold authoring",
	evaluating: "proxy eval worker",
};

export function formatFailureStage(
	stage: GenerationFailureStage | undefined,
): string | null {
	if (!stage) {
		return null;
	}

	return FAILURE_STAGE_LABELS[stage];
}
