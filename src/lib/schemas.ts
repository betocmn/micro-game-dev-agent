import { z } from "zod";
import type {
	AgentEventSummary,
	AgentRunSummary,
	ArtifactBundle,
	ArtifactEvalResult,
	ArtifactFile,
	EvaluateRunRequest,
	EvaluateRunResponse,
	GenerateRunRequest,
	GenerateRunResponse,
	MaterializeRunResponse,
	RobloxEvalResult,
	RobloxEvalSuiteResult,
	RobloxGameSpec,
	RobloxJudgeEvalResult,
	RobloxWorldObject,
} from "../types";
import { isValidRunId } from "./runId";

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

export const generateRunRequestSchema: z.ZodType<GenerateRunRequest> = z.object(
	{
		generationId: z.string().min(1).refine(isValidRunId, {
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

export const materializeRunResponseSchema: z.ZodType<MaterializeRunResponse> =
	z.object({
		spec: robloxGameSpecSchema,
		artifactBundle: artifactBundleSchema,
		agentRun: agentRunSummarySchema,
		events: z.array(agentEventSummarySchema),
		resumeSessionId: z.string().nullable().optional(),
	});

export const evaluateRunRequestSchema: z.ZodType<EvaluateRunRequest> = z.object(
	{
		generationId: z.string().min(1),
		prompt: z.string().min(1),
		spec: robloxGameSpecSchema,
		artifactBundle: artifactBundleSchema,
		resumeSessionId: z.string().min(1).nullable().optional(),
	},
);

export const evaluateRunResponseSchema: z.ZodType<EvaluateRunResponse> =
	z.object({
		artifactBundle: artifactBundleSchema,
		evalSuite: robloxEvalSuiteResultSchema,
		agentRun: agentRunSummarySchema.nullable().optional(),
		events: z.array(agentEventSummarySchema),
	});
