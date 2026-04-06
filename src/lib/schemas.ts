import { z } from "zod";
import { isValidRunId } from "./runId";
import type {
	AgentEventSummary,
	AgentRunSummary,
	ArtifactBundle,
	ArtifactEvalResult,
	ArtifactFile,
	EvalSuiteResult,
	EvaluateRunRequest,
	EvaluateRunResponse,
	GameEntity,
	GameSpec,
	GenerateRunRequest,
	GenerateRunResponse,
	InteractionEvalResult,
	JudgeEvalResult,
	RobloxEvalResult,
	RobloxEvalSuiteResult,
	RobloxGameSpec,
	RobloxJudgeEvalResult,
	RobloxWorldObject,
	RuntimeEvalResult,
} from "../types";

export const gameEntitySchema: z.ZodType<GameEntity> = z.object({
	name: z.string().min(1),
	role: z.union([
		z.literal("player"),
		z.literal("enemy"),
		z.literal("pickup"),
		z.literal("hazard"),
	]),
});

export const gameSpecSchema: z.ZodType<GameSpec> = z.object({
	title: z.string().min(1),
	genre: z.union([
		z.literal("dodge"),
		z.literal("collect"),
		z.literal("survive"),
		z.literal("platform"),
	]),
	theme: z.string().min(1),
	playerGoal: z.string().min(1),
	controls: z.array(z.string().min(1)).min(1),
	entities: z.array(gameEntitySchema).min(1),
	coreLoop: z.string().min(1),
	winCondition: z.string().min(1),
	loseCondition: z.string().min(1),
	scoreRule: z.string().min(1),
	visualStyle: z.string().min(1),
	acceptanceTests: z.array(z.string().min(1)).min(1),
});

export const robloxWorldObjectSchema: z.ZodType<RobloxWorldObject> = z.object({
	name: z.string().min(1),
	purpose: z.string().min(1),
	placement: z.string().min(1),
});

export const robloxGameSpecSchema: z.ZodType<RobloxGameSpec> = z.object({
	title: z.string().min(1),
	experienceType: z.union([
		z.literal("hangout"),
		z.literal("social-sim"),
		z.literal("obby"),
		z.literal("minigame"),
		z.literal("tycoon-lite"),
	]),
	fantasy: z.string().min(1),
	coreLoop: z.string().min(1),
	socialLoop: z.string().min(1),
	progressionHook: z.string().min(1),
	serverAuthoritativeRules: z.array(z.string().min(1)).min(1),
	clientFeedback: z.array(z.string().min(1)).min(1),
	worldObjects: z.array(robloxWorldObjectSchema).min(1),
	acceptanceTests: z.array(z.string().min(1)).min(1),
});

export const artifactFileSchema: z.ZodType<ArtifactFile> = z.object({
	path: z.string().min(1),
	content: z.string(),
	editable: z.boolean(),
	language: z.union([
		z.literal("json"),
		z.literal("luau"),
		z.literal("markdown"),
	]),
});

export const artifactBundleSchema: z.ZodType<ArtifactBundle> = z.object({
	artifactType: z.literal("roblox-rojo"),
	scaffoldVersion: z.string().min(1),
	files: z.array(artifactFileSchema).min(1),
});

export const agentRunSummarySchema: z.ZodType<AgentRunSummary> = z.object({
	sessionId: z.string().min(1),
	model: z.string().min(1),
	numTurns: z.number().int().nonnegative(),
	totalCostUsd: z.number().nonnegative(),
	stopReason: z.string().nullable(),
	permissionDenials: z.array(z.string()),
});

export const agentEventSummarySchema: z.ZodType<AgentEventSummary> = z.object({
	type: z.string().min(1),
	summary: z.string().min(1),
	payload: z.string().optional(),
});

export const artifactEvalResultSchema: z.ZodType<ArtifactEvalResult> = z.object(
	{
		pass: z.boolean(),
		requiredFilesPresent: z.boolean(),
		schemaValid: z.boolean(),
		scaffoldChecksumMatch: z.boolean(),
		editableBoundaryRespected: z.boolean(),
		missingFiles: z.array(z.string()),
		notes: z.array(z.string()),
	},
);

export const robloxEvalResultSchema: z.ZodType<RobloxEvalResult> = z.object({
	pass: z.boolean(),
	serverClientSplit: z.boolean(),
	bannedApis: z.array(z.string()),
	contractExportsPresent: z.boolean(),
	remoteSignals: z.array(z.string()),
	socialSignals: z.array(z.string()),
	notes: z.array(z.string()),
});

export const robloxJudgeEvalResultSchema: z.ZodType<RobloxJudgeEvalResult> =
	z.object({
		robloxFit: z.number().int().min(1).max(5),
		promptFidelity: z.number().int().min(1).max(5),
		socialLoopQuality: z.number().int().min(1).max(5),
		clarity: z.number().int().min(1).max(5),
		summary: z.string().min(1),
		criticalMisses: z.array(z.string()),
	});

export const robloxEvalSuiteResultSchema: z.ZodType<RobloxEvalSuiteResult> =
	z.object({
		artifact: artifactEvalResultSchema,
		roblox: robloxEvalResultSchema,
		judge: robloxJudgeEvalResultSchema,
		summaryScore: z.number().min(0).max(100),
	});

export const runtimeEvalResultSchema: z.ZodType<RuntimeEvalResult> = z.object({
	pass: z.boolean(),
	errors: z.array(z.string()),
	readySeen: z.boolean(),
	snapshot: z.record(z.string(), z.unknown()).nullable(),
});

export const interactionEvalResultSchema: z.ZodType<InteractionEvalResult> =
	z.object({
		pass: z.boolean(),
		durationMs: z.number().nonnegative(),
		framesObserved: z.number().nonnegative(),
		stateChanged: z.boolean(),
		scoreChanged: z.boolean(),
		crashed: z.boolean(),
	});

export const judgeEvalResultSchema: z.ZodType<JudgeEvalResult> = z.object({
	genreMatch: z.number().int().min(1).max(5),
	mechanicMatch: z.number().int().min(1).max(5),
	goalMatch: z.number().int().min(1).max(5),
	controlsMatch: z.number().int().min(1).max(5),
	coherence: z.number().int().min(1).max(5),
	summary: z.string().min(1),
	criticalMisses: z.array(z.string()),
});

export const evalSuiteResultSchema: z.ZodType<EvalSuiteResult> = z.object({
	runtime: runtimeEvalResultSchema,
	interaction: interactionEvalResultSchema,
	judge: judgeEvalResultSchema,
	summaryScore: z.number().min(0).max(100),
});

export const evalWorkerRequestSchema = z.object({
	prompt: z.string().min(1),
	spec: gameSpecSchema,
	mechanicCode: z.string().min(1),
	html: z.string().min(1),
});

export const generateRunRequestSchema: z.ZodType<GenerateRunRequest> = z.object(
	{
		generationId: z
			.string()
			.min(1)
			.refine(isValidRunId, {
				message:
					"generationId must use only letters, numbers, dots, underscores, or hyphens.",
			}),
		prompt: z.string().min(1),
		referenceImageUrl: z.string().url().nullable().optional(),
	},
);

export const generateRunResponseSchema: z.ZodType<GenerateRunResponse> =
	z.object({
		spec: robloxGameSpecSchema,
		artifactBundle: artifactBundleSchema,
		agentRun: agentRunSummarySchema,
		evalSuite: robloxEvalSuiteResultSchema,
		events: z.array(agentEventSummarySchema),
	});

export const evaluateRunRequestSchema: z.ZodType<EvaluateRunRequest> = z.object(
	{
		generationId: z.string().min(1),
		prompt: z.string().min(1),
		spec: robloxGameSpecSchema,
		artifactBundle: artifactBundleSchema,
	},
);

export const evaluateRunResponseSchema: z.ZodType<EvaluateRunResponse> =
	z.object({
		evalSuite: robloxEvalSuiteResultSchema,
	});
